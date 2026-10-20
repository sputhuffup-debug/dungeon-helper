/**
 * Combat at the table, from the module's `combat` def: health on participant
 * cards (bar, -/+ damage, "Take a hit" with the module's armor rule), the
 * broken-table roll at zero health, a creature's turn (Speed, signature
 * attack table, target by range from the live map, attack dice, apply the
 * hit) and a creature's reaction to damage (e.g. a splash on everything
 * close). Every roll is seeded `sessionId:counter` and logged GM-only; none
 * of it reaches the player screen.
 */
import {
  attackDamage,
  combatHealthFor,
  creatureAttackTable,
  creatureAttacks,
  creatureSpeed,
  creatureTurnFor,
  healthState,
  type CreatureAttack,
  type DamageReaction,
  type Entity,
  type Id,
  type SiteMap,
  type BrokenEntry,
} from "@campaign-forge/core";
import type { RollResult } from "@campaign-forge/module-sdk";
import { useMemo, useState } from "react";
import { Badge, Button, Card, Dialog, DieFace, HealthBar, PageRef, Stepper, initiativeState, pushToast, specById } from "../../components/ui";
import { errorMessage } from "../../lib/format";
import {
  adjustDamage,
  brokenTableFor,
  chooseCreatureAttack,
  previewHit,
  rollBroken,
  rollCreatureAttackAt,
  rollCreatureDice,
  rollReaction,
  takeHit,
  type BrokenRoll,
  type CreatureDiceRoll,
  type HitApplied,
  type HitRequest,
  type ReactionRoll,
} from "../../state/combatActions";
import { useCampaign, useRecord } from "../../state/hooks";
import { POSITIONS_STATE, type OperationRoll } from "../../state/tableActions";
import { useMapGenerator } from "../maps/siteMapFiles";
import { useSessionTrackerState } from "./hooks";
import { nearestFirst, rangeText, rangesFrom, type TargetRange } from "./siteMapLive";
import { useModeTrackers } from "./TrackersPanel";

/** What the table page hands participant cards so they can open combat dialogs. */
export interface CombatHandlers {
  sessionId: Id;
  onTakeHit: (entityId: Id) => void;
  onCreatureTurn: (entityId: Id) => void;
  onSpecialAttack: (entityId: Id) => void;
  /** A broken roll that ran a module dice operation: show it in the roll result dialog. */
  onOperationRoll?: (roll: OperationRoll) => void;
  /** The module has special attacks (PC cards offer the picker). */
  hasSpecialAttacks?: boolean;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------------------
// ranges from the scene map
// ---------------------------------------------------------------------------

/** Each target's zone distance and range band from `from`'s token on the scene map (undefined without a token). */
export function useTargetRanges(sessionId: Id, map: SiteMap | undefined, from: Id | undefined, targets: Id[]): Map<Id, TargetRange> | undefined {
  const def = useMapGenerator(map);
  const ts = useSessionTrackerState(sessionId);
  const positions = ts?.state[POSITIONS_STATE] as Record<string, string> | undefined;
  const key = targets.join("|");
  return useMemo(() => (from ? rangesFrom(map, def, positions, from, key ? key.split("|") : []) : undefined), [map, def, positions, from, key]);
}

// ---------------------------------------------------------------------------
// the current initiative card
// ---------------------------------------------------------------------------

/** The participant whose initiative card is up (lowest card not yet acted), if the module has an initiative tracker. */
export function useInitiativeCurrent(sessionId: Id): { entityId: Id; name: string; round: number; card: number } | undefined {
  const def = useModeTrackers().find((t) => t.kind === "initiative");
  const ts = useSessionTrackerState(sessionId);
  if (!def) return undefined;
  const init = initiativeState(ts?.state[def.id]);
  const current = [...init.participants].sort((a, b) => (a.card ?? 99) - (b.card ?? 99)).find((p) => !p.acted && p.card !== null);
  return current?.entityId ? { entityId: current.entityId, name: current.name, round: init.round, card: current.card! } : undefined;
}

// ---------------------------------------------------------------------------
// health on a participant card
// ---------------------------------------------------------------------------

function RollFaces({ result }: { result: RollResult }) {
  const { module } = useCampaign();
  const dice = module.module.dice;
  const baseId = dice.dice[0]?.id;
  return (
    <span className="cf-dice__faces app-combat__faces" aria-label="Rolled dice">
      {result.dice.map((d, i) => (
        <DieFace key={i} spec={specById(dice, d.die)} value={d.value} special={d.die !== baseId} />
      ))}
    </span>
  );
}

/** Roll the entity's broken table (or the module's operation for it) and show the result. */
export function BrokenRollButton({ sessionId, entity, entry, onOperationRoll }: { sessionId: Id; entity: Entity; entry: BrokenEntry; onOperationRoll?: (roll: OperationRoll) => void }) {
  const ctx = useCampaign();
  const [roll, setRoll] = useState<BrokenRoll | undefined>();
  const label = entry.label ?? ctx.module.table(entry.table)?.name ?? entry.table;
  const page = ctx.module.table(entry.table)?.page;
  return (
    <span className="app-combat__broken" data-testid="broken-roll">
      <Button
        size="sm"
        variant="danger"
        aria-label={`Roll ${label} for ${entity.name}`}
        onClick={() => {
          try {
            const r = rollBroken(ctx, sessionId, entity.id, entry);
            setRoll(r);
            if (r.operation) onOperationRoll?.(r.operation);
          } catch (e) {
            pushToast(`Roll failed: ${errorMessage(e)}`, { tone: "danger" });
          }
        }}
      >
        {roll ? `Roll ${label} again` : `Roll ${label}`}
      </Button>
      {page !== undefined && <PageRef page={page} />}
      {roll && (
        <output className="app-combat__broken-result" data-testid="broken-result">
          <strong>{roll.label}:</strong> {roll.text} <span className="cf-muted">· seed {roll.seed}</span>
        </output>
      )}
    </span>
  );
}

/** Health bar, -/+ damage and "Take a hit" for a participant whose type tracks damage; the broken roll at zero. */
export function ParticipantHealth({ entity, combat }: { entity: Entity; combat: CombatHandlers }) {
  const ctx = useCampaign();
  const health = healthState(ctx.module, entity);
  const def = combatHealthFor(ctx.module, entity);
  if (!health || !def) return null;
  const broken = health.broken ? brokenTableFor(ctx, entity) : undefined;
  const adjust = (delta: number) => {
    try {
      adjustDamage(ctx, combat.sessionId, entity.id, delta);
    } catch (e) {
      pushToast(errorMessage(e), { tone: "danger" });
    }
  };
  return (
    <span className="app-participant__health" data-testid="participant-health">
      <HealthBar max={health.max} damage={health.damage} broken={health.broken} brokenLabel="Broken" label={`${entity.name} health`} />
      <Button size="sm" variant="ghost" onClick={() => adjust(-1)} disabled={health.damage <= 0} aria-label={`Heal 1 damage on ${entity.name}`}>
        −
      </Button>
      <Button size="sm" variant="ghost" onClick={() => adjust(1)} disabled={health.max > 0 && health.damage >= health.max} aria-label={`1 damage to ${entity.name}`}>
        +
      </Button>
      <Button size="sm" onClick={() => combat.onTakeHit(entity.id)} aria-label={`Take a hit: ${entity.name}`}>
        Take a hit
      </Button>
      {broken && <BrokenRollButton sessionId={combat.sessionId} entity={entity} entry={broken} onOperationRoll={combat.onOperationRoll} />}
    </span>
  );
}

// ---------------------------------------------------------------------------
// a hit's outcome, and a reaction to it
// ---------------------------------------------------------------------------

export function HitOutcomeView({
  sessionId,
  outcome,
  participants,
  map,
  react = true,
  onOperationRoll,
}: {
  sessionId: Id;
  outcome: HitApplied;
  participants: Entity[];
  map: SiteMap | undefined;
  react?: boolean;
  onOperationRoll?: (roll: OperationRoll) => void;
}) {
  const entity = useRecord("entities", outcome.entity.id) ?? outcome.entity;
  return (
    <div className="app-stack app-combat__outcome" data-testid="hit-outcome">
      <p className="app-combat__hitline" data-testid="hit-result">
        <strong>{entity.name}</strong> takes {plural(outcome.result.damage, "damage", "damage")}. <span className="cf-muted">{outcome.result.explain}</span>
      </p>
      <div className="app-row">
        <HealthBar max={outcome.after.max} damage={outcome.after.damage} broken={outcome.after.broken} brokenLabel={outcome.newlyBroken ? "Broken by this hit" : "Broken"} label={`${entity.name} health after the hit`} />
      </div>
      {outcome.brokenTable && <BrokenRollButton sessionId={sessionId} entity={entity} entry={outcome.brokenTable} onOperationRoll={onOperationRoll} />}
      {react && outcome.reaction && <ReactionPanel sessionId={sessionId} creature={entity} reaction={outcome.reaction} damageTaken={outcome.result.damage} participants={participants} map={map} onOperationRoll={onOperationRoll} />}
    </div>
  );
}

/**
 * A creature's reaction to damage (e.g. a splash): roll rating + damage taken
 * dice, damage per success, and the participants it can reach (same zone on
 * the map first) with one "Apply" each.
 */
export function ReactionPanel({
  sessionId,
  creature,
  reaction,
  damageTaken,
  participants,
  map,
  onOperationRoll,
}: {
  sessionId: Id;
  creature: Entity;
  reaction: DamageReaction;
  damageTaken: number;
  participants: Entity[];
  map: SiteMap | undefined;
  onOperationRoll?: (roll: OperationRoll) => void;
}) {
  const ctx = useCampaign();
  const r = reaction.reaction;
  const [roll, setRoll] = useState<ReactionRoll | undefined>();
  const [applied, setApplied] = useState<Record<Id, HitApplied>>({});
  const others = useMemo(() => participants.filter((p) => p.id !== creature.id && combatHealthFor(ctx.module, p)), [participants, creature.id, ctx.module]);
  const ranges = useTargetRanges(sessionId, map, creature.id, others.map((o) => o.id));
  const sorted = nearestFirst(others, ranges);
  const near = ranges ? sorted.filter((p) => ranges.get(p.id)?.distance === 0) : [];
  return (
    <section className="app-combat__reaction" aria-label={r.label} data-testid="reaction-panel">
      <header className="app-row">
        <strong className="app-grow">{r.label}</strong>
        <Badge title="Rolled and logged for the GM only.">GM only</Badge>
        {r.page !== undefined && <PageRef page={r.page} />}
      </header>
      <p>
        {creature.name} took {damageTaken} damage: roll {plural(reaction.dice, "die", "dice")} ({reaction.rating}
        {r.addDamageTaken ? ` + ${reaction.counted} damage taken${reaction.counted < damageTaken ? ", capped" : ""}` : ""}). {r.damage} damage per success; it reaches {r.reach}.
      </p>
      {r.text && <p className="cf-muted">{r.text}</p>}
      <div className="app-row">
        <Button
          variant="primary"
          onClick={() => {
            try {
              setRoll(rollReaction(ctx, sessionId, creature, reaction));
              setApplied({});
            } catch (e) {
              pushToast(`Roll failed: ${errorMessage(e)}`, { tone: "danger" });
            }
          }}
        >
          {roll ? `Roll ${r.label} again` : `Roll ${r.label} (${plural(reaction.dice, "die", "dice")})`}
        </Button>
      </div>
      {roll && (
        <div className="app-stack">
          <div className="app-row">
            <RollFaces result={roll.result} />
            <Badge tone={roll.damage > 0 ? "danger" : "muted"} data-testid="reaction-damage">
              {plural(roll.result.successes, "success", "successes")}: {roll.damage} damage
            </Badge>
            <span className="cf-muted">seed {roll.seed}</span>
          </div>
          {ranges ? (
            <p className="app-note" data-testid="reaction-near">
              {near.length ? `In ${creature.name}'s zone: ${near.map((p) => p.name).join(", ")}` : `Nobody shares ${creature.name}'s zone on the map.`}
            </p>
          ) : (
            <p className="app-note">Put tokens on the map to see who is close; pick who it reaches.</p>
          )}
          {roll.damage > 0 && (
            <ul className="app-list" aria-label={`${r.label} targets`}>
              {sorted.map((p) => (
                <li key={p.id} className="app-list__row app-combat__target" data-target={p.id}>
                  <span className="app-grow">
                    {p.name} {ranges && <span className="cf-muted">· {rangeText(ranges.get(p.id))}</span>}
                  </span>
                  {applied[p.id] ? (
                    <HitOutcomeView sessionId={sessionId} outcome={applied[p.id]!} participants={participants} map={map} react={false} onOperationRoll={onOperationRoll} />
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => {
                        try {
                          const out = takeHit(ctx, sessionId, p.id, { amount: roll.damage, source: r.label, by: `${creature.name}: ${r.label}` });
                          setApplied((a) => ({ ...a, [p.id]: out }));
                        } catch (e) {
                          pushToast(errorMessage(e), { tone: "danger" });
                        }
                      }}
                    >
                      Apply {roll.damage} to {p.name}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// take a hit
// ---------------------------------------------------------------------------

/** Hit sources the module names (armor by source, reaction exceptions), for the source field's suggestions. */
function knownSources(ctx: ReturnType<typeof useCampaign>): string[] {
  const c = ctx.module.module.combat;
  const out = new Set<string>();
  for (const h of c?.health ?? []) for (const k of Object.keys(h.armorBySource ?? {})) out.add(k);
  for (const t of c?.creatureTurns ?? []) for (const s of t.onDamaged?.exceptSources ?? []) out.add(s);
  return [...out];
}

/** Damage, armor piercing, source and extra successes; shows the module's armor resolution, then applies it. */
export function TakeHitDialog({
  sessionId,
  entityId,
  participants,
  map,
  onClose,
  onOperationRoll,
}: {
  sessionId: Id;
  entityId: Id | undefined;
  participants: Entity[];
  map: SiteMap | undefined;
  onClose: () => void;
  onOperationRoll?: (roll: OperationRoll) => void;
}) {
  const entity = useRecord("entities", entityId);
  return (
    <Dialog open={!!entity} onClose={onClose} title={entity ? `Take a hit: ${entity.name}` : "Take a hit"} className="app-combat__dialog cf-table-mode" footer={<Button onClick={onClose}>Done</Button>}>
      {entity && <TakeHitForm key={entity.id} sessionId={sessionId} entity={entity} participants={participants} map={map} onOperationRoll={onOperationRoll} />}
    </Dialog>
  );
}

function TakeHitForm({ sessionId, entity, participants, map, onOperationRoll }: { sessionId: Id; entity: Entity; participants: Entity[]; map: SiteMap | undefined; onOperationRoll?: (roll: OperationRoll) => void }) {
  const ctx = useCampaign();
  const [amount, setAmount] = useState(1);
  const [extra, setExtra] = useState(0);
  const [ap, setAp] = useState(false);
  const [weak, setWeak] = useState(false);
  const [source, setSource] = useState("");
  const [outcome, setOutcome] = useState<HitApplied | undefined>();
  const req: HitRequest = { amount, extraSuccesses: extra, armorPiercing: ap, weakSpot: weak, ...(source.trim() ? { source: source.trim() } : {}) };
  const health = healthState(ctx.module, entity);
  const sources = knownSources(ctx);
  const ts = useSessionTrackerState(sessionId);
  // the preview follows the next roll seed (the dice-log length), so it re-runs when the log grows
  const logLength = ts?.log.length ?? 0;
  const preview = useMemo(() => {
    try {
      return previewHit(ctx, sessionId, entity.id, req);
    } catch {
      return undefined;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, sessionId, entity, amount, extra, ap, weak, source, logLength]);
  const apply = () => {
    try {
      setOutcome(takeHit(ctx, sessionId, entity.id, req));
    } catch (e) {
      pushToast(errorMessage(e), { tone: "danger" });
    }
  };
  const page = combatHealthFor(ctx.module, entity)?.page;
  return (
    <div className="app-stack" data-testid="take-hit">
      {health && (
        <div className="app-row">
          <HealthBar max={health.max} damage={health.damage} broken={health.broken} label={`${entity.name} current health`} />
          {page !== undefined && <PageRef page={page} />}
        </div>
      )}
      <div className="app-row app-combat__fields">
        <label className="app-label">
          Damage
          <Stepper value={amount} min={0} max={30} onChange={setAmount} label="Damage" />
        </label>
        <label className="app-label">
          Extra successes
          <Stepper value={extra} min={0} max={20} onChange={setExtra} label="Extra successes" />
        </label>
        <label className="app-row">
          <input type="checkbox" className="cf-checkbox" checked={ap} onChange={(e) => setAp(e.target.checked)} aria-label="Armor piercing" />
          Armor piercing
        </label>
        <label className="app-row" title="Passed to the game's hit rule; it decides what a weak spot does.">
          <input type="checkbox" className="cf-checkbox" checked={weak} onChange={(e) => setWeak(e.target.checked)} aria-label="Weak spot" />
          Weak spot
        </label>
        <label className="app-label">
          Source
          <input className="cf-input" aria-label="Source" list="cf-hit-sources" placeholder="e.g. fire" value={source} onChange={(e) => setSource(e.target.value)} />
          <datalist id="cf-hit-sources">
            {sources.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
      </div>
      {preview && (
        <p className="app-combat__armor" data-testid="armor-resolution">
          <Badge>Armor {preview.armor}</Badge> {preview.result.explain} → <strong>{plural(preview.result.damage, "damage", "damage")}</strong>
        </p>
      )}
      <div className="app-row">
        <Button variant="primary" onClick={apply} disabled={amount <= 0}>
          {outcome ? "Apply another hit" : `Apply to ${entity.name}`}
        </Button>
      </div>
      {outcome && <HitOutcomeView key={outcome.seed} sessionId={sessionId} outcome={outcome} participants={participants} map={map} onOperationRoll={onOperationRoll} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// a creature's turn
// ---------------------------------------------------------------------------

interface AttackState {
  attack: CreatureAttack;
  /** Set when rolled on the table; absent when the GM picked it. */
  seed?: string;
  total?: number;
}

/**
 * One creature's turn: Speed, the signature attack (rolled or picked), a
 * target nearest first, the attack dice, and the hit applied to the target.
 */
export function CreatureTurnCard({
  sessionId,
  creature,
  targets,
  participants,
  map,
  current,
  onClose,
  onOperationRoll,
}: {
  sessionId: Id;
  creature: Entity;
  targets: Entity[];
  participants: Entity[];
  map: SiteMap | undefined;
  /** This creature holds the current initiative card. */
  current?: { round: number; card: number };
  onClose: () => void;
  onOperationRoll?: (roll: OperationRoll) => void;
}) {
  const ctx = useCampaign();
  const turn = creatureTurnFor(ctx.module, creature);
  const speed = creatureSpeed(ctx.module, creature);
  const table = creatureAttackTable(ctx.module, creature);
  const rows = useMemo(() => creatureAttacks(ctx.module, creature), [ctx.module, creature]);
  const [attack, setAttack] = useState<AttackState | undefined>();
  const [choosing, setChoosing] = useState(false);
  const [targetId, setTargetId] = useState<Id>("");
  const [damage, setDamage] = useState(0);
  const [dice, setDice] = useState<CreatureDiceRoll | undefined>();
  const [outcome, setOutcome] = useState<HitApplied | undefined>();
  const ranges = useTargetRanges(sessionId, map, creature.id, targets.map((t) => t.id));
  const sorted = nearestFirst(targets, ranges);
  const target = targets.find((t) => t.id === targetId) ?? sorted[0];
  const notes = turn?.notes ?? [];
  const canPick = notes.length > 0;

  const pick = (a: AttackState) => {
    setAttack(a);
    setDamage(attackDamage(a.attack));
    setDice(undefined);
    setOutcome(undefined);
  };
  const rollTableAttack = () => {
    try {
      const r = rollCreatureAttackAt(ctx, sessionId, creature.id);
      pick({ attack: r.attack, seed: r.seed, total: r.record.total });
      setChoosing(false);
    } catch (e) {
      pushToast(`Roll failed: ${errorMessage(e)}`, { tone: "danger" });
    }
  };
  const rollDice = () => {
    if (!attack) return;
    try {
      setDice(rollCreatureDice(ctx, sessionId, creature, attack.attack.dice, `${attack.attack.name}${target ? ` at ${target.name}` : ""}`));
      setOutcome(undefined);
    } catch (e) {
      pushToast(`Roll failed: ${errorMessage(e)}`, { tone: "danger" });
    }
  };
  const apply = () => {
    if (!attack || !target) return;
    const successes = dice?.result.successes ?? 0;
    try {
      setOutcome(
        takeHit(ctx, sessionId, target.id, {
          amount: damage,
          armorPiercing: attack.attack.armorPiercing,
          extraSuccesses: Math.max(0, successes - 1),
          by: `${creature.name}: ${attack.attack.name}`,
        }),
      );
    } catch (e) {
      pushToast(errorMessage(e), { tone: "danger" });
    }
  };

  const needsRoll = !!attack && attack.attack.dice > 0;
  const hit = !!attack && (needsRoll ? (dice?.result.successes ?? 0) > 0 : damage > 0);

  return (
    <Card
      title={`${creature.name}: creature turn`}
      className="app-combat__turn"
      elevated
      data-testid="creature-turn"
      actions={
        <span className="app-row">
          {current && <Badge tone="accent">Card {current.card} · round {current.round}</Badge>}
          <Badge title="Rolled and logged for the GM only; never on the player screen.">GM only</Badge>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close creature turn">
            ×
          </Button>
        </span>
      }
    >
      <div className="app-stack">
        <p className="app-row">
          {speed !== undefined && (
            <Badge tone="accent" data-testid="creature-speed">
              Speed {speed}
            </Badge>
          )}
          {speed !== undefined && <span className="cf-muted">{plural(speed, "action")} (or initiative cards) this round</span>}
          {turn?.page !== undefined && <PageRef page={turn.page} />}
        </p>
        {notes.length > 0 && (
          <details className="app-combat__notes" open={notes.length <= 3}>
            <summary>Turn notes ({notes.length})</summary>
            <ul className="app-bullets" aria-label="Turn notes">
              {notes.map((n, i) => (
                <li key={i}>
                  {n.text} {n.page !== undefined && <PageRef page={n.page} />}
                </li>
              ))}
            </ul>
          </details>
        )}

        {!table ? (
          <p className="cf-muted">{creature.name} has no attack table.</p>
        ) : (
          <div className="app-row">
            <Button variant={attack ? "default" : "primary"} onClick={rollTableAttack} disabled={!!attack && !canPick}>
              {attack ? "Re-roll attack" : "Roll signature attack"}
            </Button>
            {canPick && (
              <Button variant="ghost" aria-expanded={choosing} onClick={() => setChoosing((c) => !c)}>
                Choose attack
              </Button>
            )}
            <span className="cf-muted">
              {table.name} ({table.dice}) {table.page !== undefined && <PageRef page={table.page} />}
            </span>
          </div>
        )}
        {choosing && (
          <ul className="app-list" aria-label="Attacks">
            {rows.map((a) => (
              <li key={a.name} className="app-list__row">
                <span className="cf-mono">{a.range ? (a.range[0] === a.range[1] ? a.range[0] : `${a.range[0]}–${a.range[1]}`) : ""}</span>
                <span className="app-grow">
                  {a.name} <span className="cf-muted">· {a.effect}</span>
                </span>
                <Button
                  size="sm"
                  onClick={() => {
                    chooseCreatureAttack(ctx, sessionId, creature.id, a);
                    pick({ attack: a });
                    setChoosing(false);
                  }}
                >
                  Use {a.name}
                </Button>
              </li>
            ))}
          </ul>
        )}

        {attack && (
          <section className="app-combat__attack" data-testid="creature-attack">
            <header className="app-row">
              <strong className="app-combat__attack-name" data-testid="attack-name">
                {attack.attack.name}
              </strong>
              {attack.total !== undefined ? <span className="cf-muted">rolled {attack.total} · seed {attack.seed}</span> : <span className="cf-muted">picked by the GM</span>}
            </header>
            <dl className="app-combat__stats">
              <dt>Dice</dt>
              <dd data-testid="attack-dice">{attack.attack.dice || "no roll"}</dd>
              <dt>Damage</dt>
              <dd data-testid="attack-damage">{String(attack.attack.damage)}</dd>
              <dt>Armor piercing</dt>
              <dd>{attack.attack.armorPiercing ? "yes" : "no"}</dd>
            </dl>
            {attack.attack.effect && <p data-testid="attack-effect">{attack.attack.effect}</p>}
          </section>
        )}

        {attack && (
          <div className="app-stack">
            <label className="app-label">
              Target
              <select className="cf-select" aria-label="Target" value={target?.id ?? ""} onChange={(e) => setTargetId(e.target.value)}>
                {sorted.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {ranges ? ` (${rangeText(ranges.get(t.id))})` : ""}
                  </option>
                ))}
              </select>
            </label>
            {ranges && (
              <ul className="app-list app-combat__ranges" aria-label="Range to targets" data-testid="target-ranges">
                {sorted.map((t) => (
                  <li key={t.id} className="app-list__row" data-target={t.id}>
                    <span className="app-grow">{t.name}</span>
                    <span className="cf-muted">{rangeText(ranges.get(t.id))}</span>
                  </li>
                ))}
              </ul>
            )}
            {!ranges && map && <p className="cf-muted">Place {creature.name}'s token on the map to see the range to each target.</p>}
            <div className="app-row">
              <label className="app-label">
                Damage
                <Stepper value={damage} min={0} max={20} onChange={setDamage} label="Attack damage" />
              </label>
              {needsRoll ? (
                <Button variant="primary" onClick={rollDice} aria-label={`Roll attack: ${attack.attack.dice} dice`}>
                  {dice ? "Roll attack again" : `Roll attack (${attack.attack.dice} dice)`}
                </Button>
              ) : (
                <span className="cf-muted">No attack roll: the effect applies.</span>
              )}
            </div>
            {dice && (
              <div className="app-row" data-testid="attack-roll">
                <RollFaces result={dice.result} />
                <Badge tone={dice.result.successes > 0 ? "success" : "muted"} data-testid="attack-successes">
                  {plural(dice.result.successes, "success", "successes")}
                </Badge>
                <span className="cf-muted">seed {dice.seed}</span>
              </div>
            )}
            {dice && dice.result.successes === 0 && <p className="cf-muted">The attack misses.</p>}
            {hit && target && !outcome && (
              <Button variant="danger" onClick={apply}>
                Apply to {target.name}
              </Button>
            )}
            {outcome && <HitOutcomeView sessionId={sessionId} outcome={outcome} participants={participants} map={map} onOperationRoll={onOperationRoll} />}
          </div>
        )}
      </div>
    </Card>
  );
}
