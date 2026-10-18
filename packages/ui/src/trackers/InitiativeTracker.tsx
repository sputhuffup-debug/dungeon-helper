import { useState } from "react";
import { getPath } from "@campaign-forge/module-sdk";
import { Badge } from "../primitives/Badge";
import { Button, IconButton } from "../primitives/Button";
import { asNumber, cx, isRecord, newId } from "../sheet/paths";
import { TrackerFrame } from "./TrackerFrame";
import { randomInt, stateRecord, type TrackerProps } from "./types";

export interface Participant {
  id: string;
  name: string;
  entityId?: string;
  /** Initiative card 1..10 (lower acts first). */
  card: number | null;
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

/** Participants with initiative cards 1-10; draw, reorder, mark acted, next round. */
export function InitiativeTracker({ def, state, onChange, entities = [], rng, onLog, readonly, className }: TrackerProps) {
  const init = initiativeState(state);
  const deckSize = typeof def.config?.cards === "number" ? def.config.cards : 10;
  const drawsField = typeof def.config?.drawsField === "string" ? def.config.drawsField : undefined;
  const [pick, setPick] = useState("");
  const [customName, setCustomName] = useState("");
  const commit = (next: Partial<InitiativeState>) => onChange({ ...stateRecord(state), ...init, ...next });

  const sorted = [...init.participants].sort((a, b) => (a.card ?? 99) - (b.card ?? 99));
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

  const draw = (onlyMissing: boolean) => {
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

  const update = (id: string, patch: Partial<Participant>) => commit({ participants: init.participants.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
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
                Draw cards
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
          <span className={cx("cf-initiative__card", p.card === null && "cf-initiative__card--empty")} data-testid={`card-${p.id}`}>
            {p.card ?? "–"}
          </span>
          <span className="cf-tracker__name">{p.name}</span>
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
            Draw missing
          </Button>
        </div>
      )}
    </TrackerFrame>
  );
}
