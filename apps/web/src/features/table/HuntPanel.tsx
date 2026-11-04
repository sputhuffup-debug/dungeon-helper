/**
 * The GM's side of the live hunt on a generated site map (the generator's
 * `hunt`): hidden threat tokens placed from the map's marks or the cast,
 * each with a suggested move (and an alternative) the GM accepts, swaps or
 * overrides, never applied on its own; the PCs' sensor sweeps, logged and
 * shown to the players as blips; and the reveal that flips a blip to the
 * threat's token on the player map. When a stretch or round passes, the
 * panel asks: move hidden threats? sweep?
 *
 * GM-only: the player screen reads the projection (`playerLive`), never
 * this panel's state.
 */
import {
  carriedSensors,
  huntSourceGroups,
  huntOf,
  liveOf,
  moveHuntToken,
  placeHuntSource,
  playerTracker,
  recordSweep,
  removeHuntToken,
  setHuntHurt,
  setHuntLetter,
  setHuntTokenState,
  sweepLogText,
  type Entity,
  type HuntMoveOption,
  type HuntMoveSuggestion,
  type HuntSource,
  type HuntToken,
  type HuntTokenState,
  type Id,
  type SiteMap,
} from "@campaign-forge/core";
import type { MapGeneratorDef, MapHuntNote, MapSensorDef } from "@campaign-forge/module-sdk";
import { useMemo, useState } from "react";
import { Badge, Button, PageRef, pushToast } from "../../components/ui";
import { errorMessage } from "../../lib/format";
import { logTable } from "../../state/tableActions";
import { useCampaign, useList } from "../../state/hooks";
import { pcTargets } from "./siteMapLive";
import { TrackerReadout } from "./TrackerReadout";

export interface HuntPrompt {
  step: number;
  kind: string;
}

const STATE_LABELS: Record<HuntTokenState, string> = { hidden: "hidden", detected: "blip", seen: "seen", gone: "gone" };

interface HuntPanelProps {
  sessionId: Id;
  map: SiteMap;
  def: MapGeneratorDef;
  pcs: Entity[];
  participants: Entity[];
  label: (zone: string) => string;
  suggestions: HuntMoveSuggestion[];
  prompt: HuntPrompt | undefined;
  onDismissPrompt: () => void;
  /** "Next stretch" / "Next round": the app moves the table clock, which the hunt follows. */
  onAdvance: (kind: string) => void;
  /** The number shown with the current step: the table clock's counter for it (one round counter), else the hunt's own count. */
  stepNumber?: number;
  /** The token the "Move threat" map tool moves, and choosing it. */
  moving: Id | undefined;
  onMove: (token: Id | undefined) => void;
  /** The zone selected on the map: where a source without a zone is placed. */
  selectedZone: string | undefined;
}

function Note({ note }: { note: MapHuntNote }) {
  return (
    <li>
      {note.text} {note.page !== undefined ? <PageRef page={note.page} /> : note.original ? <Badge title="The module's own rule: the book gives none">module</Badge> : null}
    </li>
  );
}

/**
 * Entities a hidden token can be made from: the scene's cast (not the PCs),
 * the characters and creatures tied to the map's site, and the cast of what
 * the site belongs to (a job's or an encounter's NPCs). Never someone met
 * only through another place (an NPC in a bar of the home port).
 */
function useCandidateEntities(map: SiteMap, participants: Entity[], pcs: Entity[]): Entity[] {
  const ctx = useCampaign();
  const relationships = useList("relationships");
  const entities = useList("entities");
  return useMemo(() => {
    const pcIds = new Set(pcs.map((p) => p.id));
    const byId = new Map(entities.map((e) => [e.id, e]));
    const kindOf = (id: string) => {
      const e = byId.get(id);
      return e ? ctx.module.entityType(e.type)?.kind : undefined;
    };
    const ids = new Set(participants.map((p) => p.id));
    if (map.location) {
      const site = map.location;
      const linked = (id: string) => relationships.flatMap((r) => (r.from === id ? [r.to] : r.to === id ? [r.from] : []));
      for (const near of linked(site)) {
        const kind = kindOf(near);
        if (kind === "character" || kind === "creature") ids.add(near);
        // what the site belongs to: its cast too
        else if (kind === "job" || kind === "encounter") for (const id of linked(near)) if (id !== site && (kindOf(id) === "character" || kindOf(id) === "creature")) ids.add(id);
      }
    }
    return entities.filter((e) => ids.has(e.id) && !pcIds.has(e.id));
  }, [ctx.module, map.location, participants, pcs, relationships, entities]);
}

export function HuntPanel({ sessionId, map, def, pcs, participants, label, suggestions, prompt, onDismissPrompt, onAdvance, stepNumber, moving, onMove, selectedZone }: HuntPanelProps) {
  const ctx = useCampaign();
  const store = ctx.store;
  const hunt = def.hunt!;
  const layout = map.layout!;
  const live = liveOf(map);
  const state = huntOf(live);
  const steps = hunt.steps;
  const stepDef = steps.find((s) => s.id === state.stepKind) ?? steps[0];
  const bySuggestion = new Map(suggestions.map((s) => [s.token, s]));
  const moverLabel = (id: string) => hunt.movers.find((m) => m.id === id)?.label ?? id;
  const letters = hunt.blipLetters ?? "ABCDEFGHIJ".split("");

  // sources: the map's marks, and the cast (scene participants, a job's NPCs)
  const candidates = useCandidateEntities(map, participants, pcs);
  // the map's NPCs once each (not once per act), with their records; never under a hostile label
  const sources = useMemo(
    () => huntSourceGroups(layout, hunt, candidates, { act: live.act, placed: state.tokens.flatMap((t) => [t.marker, t.entity].filter((x): x is string => !!x)) }),
    [layout, hunt, candidates, state.tokens, live.act],
  );
  const [sourceKey, setSourceKey] = useState("");
  const source: HuntSource | undefined = [...sources.marks, ...sources.npcs, ...sources.cast].find((s) => s.key === sourceKey);
  const placeAt = source?.zone ?? selectedZone;

  // sweeps: every PC on the map carrying a sensor
  const targets = useMemo(() => pcTargets(live, pcs), [live, pcs]);
  const sweepers = useMemo(() => {
    const out: Array<{ pc: Entity; zone: string; sensor: MapSensorDef }> = [];
    for (const pc of pcs) {
      const at = targets.find((t) => t.entity === pc.id);
      if (!at) continue;
      for (const sensor of carriedSensors(hunt, pc, (itemId) => store.get("entities", itemId)?.provenance?.preset)) out.push({ pc, zone: at.zone, sensor });
    }
    return out;
  }, [pcs, targets, hunt, store]);
  const bandLabel = (id: string) => def.rangeBands?.find((b) => b.id === id)?.label ?? id;

  const run = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      pushToast(errorMessage(e), { tone: "danger" });
    }
  };
  const accept = (token: HuntToken, option: HuntMoveOption) => run(() => moveHuntToken(store, map.id, token.id, option.zone, { path: option.path, trail: hunt.trail }));
  const acceptAll = () =>
    run(() => {
      for (const s of suggestions) {
        const t = state.tokens.find((x) => x.id === s.token);
        if (t && t.state !== "seen" && s.best.zone !== t.zone) moveHuntToken(store, map.id, t.id, s.best.zone, { path: s.best.path, trail: hunt.trail });
      }
    });
  const sweep = (w: (typeof sweepers)[number]) =>
    run(() => {
      const result = recordSweep(store, map.id, { by: { name: w.pc.name, entity: w.pc.id }, from: w.zone, sensor: w.sensor, def });
      const text = sweepLogText(result);
      logTable(ctx, sessionId, text, { kind: "sweep", map: map.id, sensor: w.sensor.id, blips: result.blips.map((b) => b.letter) });
      pushToast(text);
    });
  const [keepLetter, setKeepLetter] = useState(false);
  const reveal = (t: HuntToken) =>
    run(() => {
      setHuntTokenState(store, map.id, t.id, "seen", { keepLetter });
      logTable(ctx, sessionId, `Revealed: ${t.label}${t.letter ? ` (blip ${t.letter}${keepLetter ? ", letter kept" : ", letter retired"})` : ""}`);
    });

  const inPlay = state.tokens.filter((t) => t.state !== "gone");
  const gone = state.tokens.filter((t) => t.state === "gone");
  const notes = [...(hunt.notes ?? []), ...hunt.movers.flatMap((m) => m.notes ?? []), ...(hunt.sensors ?? []).flatMap((s) => s.notes ?? [])];
  const seenNotes = new Set<string>();
  const uniqueNotes = notes.filter((n) => (seenNotes.has(n.text) ? false : (seenNotes.add(n.text), true)));

  return (
    <section className="app-hunt" aria-label="Hidden threats" data-testid="hunt-panel">
      <header className="app-row app-hunt__head">
        <strong className="app-grow">
          Hidden threats{" "}
          <span className="cf-muted" data-testid="hunt-step">
            · {stepDef ? `${stepDef.label} ${stepNumber ?? state.step}` : `Step ${stepNumber ?? state.step}`}
          </span>
        </strong>
        <Badge title="Hidden tokens, trails and suggestions never reach the player screen, shares or packets; blips show a range band and a direction only.">GM only</Badge>
        {steps.map((s) => (
          <Button key={s.id} size="sm" variant="ghost" onClick={() => onAdvance(s.id)} data-testid={`hunt-next-${s.id}`}>
            Next {s.label.toLowerCase()}
          </Button>
        ))}
      </header>

      {prompt && (
        <div className="app-hunt__prompt" role="status" data-testid="hunt-prompt">
          <p>
            <strong>
              {steps.find((s) => s.id === prompt.kind)?.label ?? "Step"} {prompt.step} begins.
            </strong>{" "}
            Move hidden threats? {sweepers.length > 0 && "Sweep?"}
          </p>
          <div className="app-row">
            {suggestions.some((s) => s.best.zone !== s.from) && (
              <Button size="sm" variant="primary" onClick={acceptAll} data-testid="hunt-accept-all">
                Accept every suggested move
              </Button>
            )}
            {sweepers.map((w) => (
              <Button key={`${w.pc.id}:${w.sensor.id}`} size="sm" onClick={() => sweep(w)}>
                {w.pc.name} sweeps
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={onDismissPrompt}>
              Done
            </Button>
          </div>
        </div>
      )}

      {inPlay.length === 0 && <p className="cf-muted">No hidden threats on the map. Place one from the map's marks or the cast below.</p>}
      {inPlay.length > 0 && (
        <ul className="app-list app-hunt__tokens" aria-label="Threats in play">
          {inPlay.map((t) => {
            const s = bySuggestion.get(t.id);
            const stays = s && s.best.zone === t.zone;
            return (
              <li key={t.id} className={`app-hunt__token app-hunt__token--${t.state}`} data-hunt-row={t.id} data-zone={t.zone} data-state={t.state} data-testid="hunt-token">
                <div className="app-row">
                  <span className="app-hunt__diamond" aria-hidden>
                    {t.letter ?? ""}
                  </span>
                  <span className="app-grow">
                    <strong>{t.label}</strong> <span className="cf-muted">{moverLabel(t.mover)} · in {label(t.zone)}</span>
                  </span>
                  <select className="cf-select" aria-label={`State of ${t.label}`} value={t.state} onChange={(e) => run(() => setHuntTokenState(store, map.id, t.id, e.target.value as HuntTokenState, { keepLetter: true }))}>
                    {(Object.keys(STATE_LABELS) as HuntTokenState[]).map((k) => (
                      <option key={k} value={k}>
                        {STATE_LABELS[k]}
                      </option>
                    ))}
                  </select>
                  <select className="cf-select" aria-label={`Blip letter of ${t.label}`} value={t.letter ?? ""} onChange={(e) => run(() => setHuntLetter(store, map.id, t.id, e.target.value || undefined))} title="Name the blip by hand to match the signal token on the table">
                    <option value="">auto</option>
                    {letters.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                  <label className="app-row" title="Hurt: it moves by its mover's hurt weights (e.g. it retreats)">
                    <input type="checkbox" className="cf-checkbox" checked={!!t.hurt} onChange={(e) => run(() => setHuntHurt(store, map.id, t.id, e.target.checked))} />
                    hurt
                  </label>
                </div>
                {s && t.state !== "seen" && (
                  <div className="app-row app-hunt__suggest" data-testid="hunt-suggestion" data-to={s.best.zone}>
                    <span className="app-grow">
                      {stays ? "Suggests: stay in " : "Suggests: "}
                      <strong>{label(s.best.zone)}</strong>
                      {s.best.path.length > 2 && <span className="cf-muted"> via {s.best.path.slice(1, -1).map(label).join(", ")}</span>}
                      {s.best.reasons.length > 0 && <span className="cf-muted"> ({s.best.reasons.slice(0, 3).join("; ")})</span>}
                    </span>
                    {!stays && (
                      <Button size="sm" variant="primary" onClick={() => accept(t, s.best)} aria-label={`Accept move: ${t.label} to ${label(s.best.zone)}`} data-testid="hunt-accept">
                        Accept
                      </Button>
                    )}
                    {s.alternative && (
                      <Button size="sm" variant="ghost" onClick={() => accept(t, s.alternative!)} aria-label={`Alternative move: ${t.label} to ${label(s.alternative.zone)}`} title={s.alternative.reasons.join("; ")}>
                        Or {label(s.alternative.zone)}
                      </Button>
                    )}
                    <select
                      className="cf-select"
                      aria-label={`Move ${t.label} to`}
                      value=""
                      onChange={(e) => {
                        const o = s.options.find((x) => x.zone === e.target.value);
                        if (o) accept(t, o);
                      }}
                    >
                      <option value="">Another zone…</option>
                      {s.options
                        .filter((o) => o.zone !== t.zone)
                        .map((o) => (
                          <option key={o.zone} value={o.zone}>
                            {label(o.zone)} ({o.path.length - 1} zone{o.path.length === 2 ? "" : "s"})
                          </option>
                        ))}
                    </select>
                  </div>
                )}
                <div className="app-row app-hunt__actions">
                  <Button size="sm" variant={moving === t.id ? "primary" : "ghost"} aria-pressed={moving === t.id} onClick={() => onMove(moving === t.id ? undefined : t.id)} title="Then click the zone on the map: any zone, the GM's call">
                    Move on map
                  </Button>
                  {t.state !== "seen" ? (
                    <Button size="sm" variant="ghost" onClick={() => reveal(t)} aria-label={`Reveal ${t.label} to the players`} data-testid="hunt-reveal">
                      Reveal
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => run(() => setHuntTokenState(store, map.id, t.id, "hidden"))} aria-label={`Hide ${t.label} again`}>
                      Hide again
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => run(() => setHuntTokenState(store, map.id, t.id, "gone"))} aria-label={`${t.label} is gone`}>
                    Gone
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => run(() => removeHuntToken(store, map.id, t.id))} aria-label={`Remove ${t.label}`}>
                    ×
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {inPlay.some((t) => t.letter) && (
        <label className="app-row cf-muted" title="When a threat is revealed: its blip letter stays with it (the signal token stays on the table), or goes back to the pile">
          <input type="checkbox" className="cf-checkbox" checked={keepLetter} onChange={(e) => setKeepLetter(e.target.checked)} data-testid="hunt-keep-letter" />
          keep the blip letter when revealing
        </label>
      )}
      {gone.length > 0 && <p className="cf-muted">Gone: {gone.map((t) => t.label).join(", ")}</p>}

      <div className="app-row app-hunt__add" role="group" aria-label="Place a hidden threat">
        <select className="cf-select" aria-label="Hidden threat from" value={sourceKey} onChange={(e) => setSourceKey(e.target.value)}>
          <option value="">Place a hidden threat…</option>
          {sources.marks.length > 0 && (
            <optgroup label="Map marks">
              {sources.marks.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label} ({moverLabel(s.mover)}, {label(s.zone!)})
                </option>
              ))}
            </optgroup>
          )}
          {sources.npcs.length > 0 && (
            <optgroup label="NPCs on this map">
              {sources.npcs.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label} ({moverLabel(s.mover)}{s.zone ? `, ${label(s.zone)}` : ""})
                </option>
              ))}
            </optgroup>
          )}
          {sources.cast.length > 0 && (
            <optgroup label="Cast">
              {sources.cast.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label} ({moverLabel(s.mover)})
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <Button
          size="sm"
          disabled={!source || !placeAt}
          title={source && !placeAt ? "Select a zone on the map first" : undefined}
          onClick={() =>
            run(() => {
              if (!source || !placeAt) return;
              placeHuntSource(store, map.id, source, placeAt);
              setSourceKey("");
            })
          }
        >
          Place hidden{source && !source.zone && placeAt ? ` in ${label(placeAt)}` : ""}
        </Button>
      </div>

      {(hunt.sensors?.length ?? 0) > 0 && (
        <div className="app-row app-hunt__sweeps" role="group" aria-label="Sweeps">
          {sweepers.length === 0 && <span className="cf-muted">No PC on the map carries a {hunt.sensors!.map((s) => s.label).join(" or ")}.</span>}
          {sweepers.map((w) => (
            <Button key={`${w.pc.id}:${w.sensor.id}`} size="sm" onClick={() => sweep(w)} aria-label={`Sweep: ${w.pc.name}`} data-testid="hunt-sweep">
              Sweep: {w.pc.name} <span className="cf-muted">({w.sensor.label}, {bandLabel(w.sensor.range)})</span>
            </Button>
          ))}
        </div>
      )}
      <TrackerReadout tracker={playerTracker(state)} bands={def.rangeBands} title="What the players' tracker shows" />

      {uniqueNotes.length > 0 && (
        <details className="app-hunt__rules">
          <summary>Rules for the hunt</summary>
          <ul>
            {uniqueNotes.map((n, i) => (
              <Note key={i} note={n} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
