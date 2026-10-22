import { useState } from "react";
import { createRng, evaluateLogic, getPath, labelDice, rollDice, rollEntered, type JsonLogicRule, type Rng } from "@campaign-forge/module-sdk";
import { useDiceRoller } from "../dice/DiceRoller";
import { Badge } from "../primitives/Badge";
import { Button, IconButton } from "../primitives/Button";
import { asNumber, cx, isRecord, newId } from "../sheet/paths";
import { TrackerFrame } from "./TrackerFrame";
import { randomInt, stateRecord, type TrackerEntity, type TrackerProps } from "./types";

export interface Participant {
  id: string;
  name: string;
  entityId?: string;
  /** Initiative card 1..10 (lower acts first), or the rolled total in roll mode (higher acts first). */
  card: number | null;
  /** Roll mode: how the total was made, e.g. "14 + 2". */
  detail?: string;
  /** Roll mode: the participant's initiative modifier (breaks ties). */
  mod?: number;
  /** Extra cards drawn beyond the first; the best is kept. */
  extraDraws: number;
  acted: boolean;
}

export interface InitiativeState {
  round: number;
  participants: Participant[];
}

export function initiativeState(state: unknown): InitiativeState {
  const s = stateRecord(state);
  const raw = Array.isArray(s.participants) ? s.participants : [];
  return {
    round: asNumber(s.round, 1),
    participants: raw.filter(isRecord).map((p) => ({
      id: String(p.id ?? newId("p")),
      name: String(p.name ?? "?"),
      entityId: typeof p.entityId === "string" ? p.entityId : undefined,
      card: typeof p.card === "number" ? p.card : null,
      extraDraws: asNumber(p.extraDraws, 0),
      acted: p.acted === true,
      ...(typeof p.detail === "string" ? { detail: p.detail } : {}),
      ...(typeof p.mod === "number" ? { mod: p.mod } : {}),
    })),
  };
}

/** Draw `count` distinct cards from the remaining deck and keep the lowest. */
export function drawBest(deck: number[], count: number, rng: TrackerProps["rng"]): { card: number | null; deck: number[] } {
  let remaining = [...deck];
  let best: number | null = null;
  const drawn: number[] = [];
  for (let i = 0; i < Math.max(1, count) && remaining.length > 0; i++) {
    const idx = randomInt(rng, 0, remaining.length - 1);
    const card = remaining[idx] as number;
    remaining = remaining.filter((_, j) => j !== idx);
    drawn.push(card);
    if (best === null || card < best) best = card;
  }
  // Cards drawn but not kept go back to the deck.
  for (const c of drawn) if (c !== best) remaining.push(c);
  return { card: best, deck: remaining.sort((a, b) => a - b) };
}

/** A participant's initiative modifier in roll mode: `config.modifier` (a number or JSONLogic over `{ fields, computed }`). */
export function initiativeModifier(rule: unknown, entity: TrackerEntity | undefined): number {
  if (rule === undefined || rule === null || !entity) return 0;
  if (typeof rule === "number") return rule;
  try {
    const v = Number(evaluateLogic(rule as JsonLogicRule, { fields: entity.fields, computed: entity.computed ?? {} }));
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

/** Order participants: cards ascending, or rolled totals descending (ties: higher modifier, then name). */
export function initiativeOrder(participants: Participant[], rolled: boolean): Participant[] {
  if (!rolled) return [...participants].sort((a, b) => (a.card ?? 99) - (b.card ?? 99));
  return [...participants].sort((a, b) => (b.card ?? -999) - (a.card ?? -999) || (b.mod ?? 0) - (a.mod ?? 0) || a.name.localeCompare(b.name));
}

/**
 * Turn order. By default participants draw initiative cards 1-10 (lowest
 * acts first). With `config.method: "roll"` each rolls `config.dice` (default
 * "1d20") plus `config.modifier` (a number or JSONLogic over the entity's
 * `{ fields, computed }`) and the highest acts first; the GM can also type a
 * total a player rolled. Draw or roll, reorder, mark acted, next round.
 * When the GM rolls physical dice (the page's dice mode), "Roll initiative"
 * asks for each participant's die and adds their modifier, and drawn cards
 * can be typed in; both are marked "entered".
 */
export function InitiativeTracker({ def, state, onChange, entities = [], rng, onLog, readonly, className }: TrackerProps) {
  const init = initiativeState(state);
  const rolled = def.config?.method === "roll";
  const rollDiceExpr = typeof def.config?.dice === "string" ? def.config.dice : "1d20";
  const deckSize = typeof def.config?.cards === "number" ? def.config.cards : 10;
  const drawsField = typeof def.config?.drawsField === "string" ? def.config.drawsField : undefined;
  const drawLabel = typeof def.config?.label === "string" ? def.config.label : rolled ? "Roll initiative" : "Draw cards";
  const roller = useDiceRoller();
  const [pick, setPick] = useState("");
  const [customName, setCustomName] = useState("");
  const commit = (next: Partial<InitiativeState>) => onChange({ ...stateRecord(state), ...init, ...next });

  const sorted = initiativeOrder(init.participants, rolled);
  const current = sorted.find((p) => !p.acted && p.card !== null);

  const addParticipant = () => {
    let p: Participant | undefined;
    if (pick) {
      const e = entities.find((x) => x.id === pick);
      if (e) {
        const draws = drawsField ? Math.max(0, asNumber(getPath(e.fields, drawsField), 1) - 1) : 0;
        p = { id: newId("p"), name: e.name, entityId: e.id, card: null, extraDraws: draws, acted: false };
      }
    } else if (customName.trim()) {
      p = { id: newId("p"), name: customName.trim(), card: null, extraDraws: 0, acted: false };
    }
    if (!p) return;
    commit({ participants: [...init.participants, p] });
    setPick("");
    setCustomName("");
  };

  /** Roll for each participant (all, or those without a score) with `r`; each die is named after its roller. */
  const rolledParticipants = (onlyMissing: boolean, r: Rng | undefined, entered: boolean) =>
    init.participants.map((p) => {
      if (onlyMissing && p.card !== null) return p;
      const mod = initiativeModifier(def.config?.modifier, entities.find((e) => e.id === p.entityId));
      const natural = r ? rollDice(rollDiceExpr, labelDice(r, p.name)).total : randomInt(r, 1, 20);
      return { ...p, card: natural + mod, mod, detail: `${natural} ${mod < 0 ? "−" : "+"} ${Math.abs(mod)}${entered ? " (entered)" : ""}` };
    });
  const rollAll = (onlyMissing: boolean) => {
    const finish = (participants: Participant[], entered?: number[]) => {
      commit({ participants });
      onLog?.(`Initiative ${entered ? "rolled at the table" : "rolled"}: ${initiativeOrder(participants, true).map((p) => `${p.name} ${p.card ?? "–"}`).join(", ")}${entered ? ` (entered: ${entered.join(" ")})` : ""}`);
    };
    roller.roll({
      title: drawLabel,
      run: (r) => rolledParticipants(onlyMissing, r, true),
      perform: (entered) => (entered ? finish(rollEntered((r) => rolledParticipants(onlyMissing, r, true), entered), entered) : finish(rolledParticipants(onlyMissing, rng ?? createRng(`${Date.now()}`), false))),
    });
  };

  const draw = (onlyMissing: boolean) => {
    if (rolled) return rollAll(onlyMissing);
    let deck = Array.from({ length: deckSize }, (_, i) => i + 1);
    if (onlyMissing) deck = deck.filter((c) => !init.participants.some((p) => p.card === c));
    const participants = init.participants.map((p) => {
      if (onlyMissing && p.card !== null) return p;
      const r = drawBest(deck, 1 + p.extraDraws, rng);
      deck = r.deck;
      return { ...p, card: r.card };
    });
    commit({ participants });
    onLog?.(`Initiative drawn: ${[...participants].sort((a, b) => (a.card ?? 99) - (b.card ?? 99)).map((p) => `${p.name} ${p.card ?? "–"}`).join(", ")}`);
  };

  const update = (id: string, patch: Partial<Participant>) =>
    commit({
      participants: init.participants.map((p) => {
        if (p.id !== id) return p;
        const next: Record<string, unknown> = { ...p, ...patch };
        for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
        return next as unknown as Participant;
      }),
    });
  const remove = (id: string) => commit({ participants: init.participants.filter((p) => p.id !== id) });
  const move = (id: string, dir: -1 | 1) => {
    // Reordering swaps cards so the sorted order follows the GM's choice.
    const i = sorted.findIndex((p) => p.id === id);
    const j = i + dir;
    const a = sorted[i];
    const b = sorted[j];
    if (!a || !b) return;
    commit({ participants: init.participants.map((p) => (p.id === a.id ? { ...p, card: b.card } : p.id === b.id ? { ...p, card: a.card } : p)) });
  };
  const nextRound = () => {
    commit({ round: init.round + 1, participants: init.participants.map((p) => ({ ...p, acted: false })) });
    onLog?.(`Round ${init.round + 1}`);
  };

  return (
    <TrackerFrame
      def={def}
      className={className}
      actions={
        <>
          <Badge tone="accent">Round {init.round}</Badge>
          {!readonly && (
            <>
              <Button size="sm" onClick={() => draw(false)} disabled={init.participants.length === 0}>
                {drawLabel}
              </Button>
              <Button size="sm" variant="primary" onClick={nextRound}>
                Next round
              </Button>
            </>
          )}
        </>
      }
    >
      {sorted.length === 0 && <span className="cf-muted">No participants</span>}
      {sorted.map((p, i) => (
        <div
          key={p.id}
          className={cx("cf-tracker__row", "cf-initiative__row", p.acted && "cf-initiative__row--acted", current?.id === p.id && "cf-initiative__row--current")}
          data-participant={p.id}
          aria-current={current?.id === p.id ? "step" : undefined}
        >
          {(rolled || roller.physical) && !readonly ? (
            <input
              className={cx("cf-input", "cf-initiative__card", rolled && "cf-initiative__card--score", p.card === null && "cf-initiative__card--empty")}
              type="number"
              inputMode="numeric"
              aria-label={rolled ? `${p.name} initiative` : `${p.name} initiative card`}
              title={rolled ? "Type the total rolled at the table" : `Type the card drawn at the table (1–${deckSize})`}
              data-testid={`card-${p.id}`}
              value={p.card ?? ""}
              placeholder="–"
              {...(rolled ? {} : { min: 1, max: deckSize })}
              onChange={(e) => {
                const raw = e.target.value.trim();
                const n = Number(raw);
                const ok = raw !== "" && Number.isFinite(n) && (rolled || (Number.isInteger(n) && n >= 1 && n <= deckSize));
                update(p.id, ok ? { card: Math.round(n), detail: "entered" } : { card: null, detail: undefined });
              }}
            />
          ) : (
            <span className={cx("cf-initiative__card", rolled && "cf-initiative__card--score", p.card === null && "cf-initiative__card--empty")} data-testid={`card-${p.id}`}>
              {p.card ?? "–"}
            </span>
          )}
          <span className="cf-tracker__name">
            {p.name}
            {rolled && p.detail && p.detail !== "entered" && <span className="cf-muted"> ({p.detail.replace(/ \(entered\)$/, "")})</span>}
            {p.detail === "entered" || p.detail?.endsWith("(entered)") ? (
              <>
                {" "}
                <Badge tone="accent" data-testid={`entered-${p.id}`}>
                  entered
                </Badge>
              </>
            ) : null}
          </span>
          {p.extraDraws > 0 && <Badge>+{p.extraDraws} draw</Badge>}
          {!readonly && (
            <>
              <label className="cf-check">
                <input className="cf-checkbox" type="checkbox" checked={p.acted} onChange={(e) => update(p.id, { acted: e.target.checked })} aria-label={`${p.name} acted`} />
                Acted
              </label>
              <IconButton size="sm" variant="ghost" label={`Move ${p.name} up`} icon="↑" onClick={() => move(p.id, -1)} disabled={i === 0 || p.card === null} />
              <IconButton size="sm" variant="ghost" label={`Move ${p.name} down`} icon="↓" onClick={() => move(p.id, 1)} disabled={i === sorted.length - 1 || p.card === null} />
              <IconButton size="sm" variant="ghost" label={`Remove ${p.name}`} icon="×" onClick={() => remove(p.id)} />
            </>
          )}
        </div>
      ))}
      {!readonly && (
        <div className="cf-tracker__add">
          {entities.length > 0 && (
            <select className="cf-select" aria-label="Add from entities" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Pick an entity…</option>
              {entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          )}
          <input className="cf-input" aria-label="Participant name" placeholder="Or a name" value={customName} onChange={(e) => setCustomName(e.target.value)} />
          <Button size="sm" onClick={addParticipant} disabled={!pick && !customName.trim()}>
            Add
          </Button>
          <Button size="sm" variant="ghost" onClick={() => draw(true)} disabled={!init.participants.some((p) => p.card === null)}>
            {rolled ? "Roll missing" : "Draw missing"}
          </Button>
        </div>
      )}
    </TrackerFrame>
  );
}
