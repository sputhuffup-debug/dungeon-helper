/**
 * Declarative d20 combat at the table (modules with `d20Combat`): the
 * initiative order and the current turn (the module's initiative tracker),
 * attack rolls against AC with the conditions on both sides, damage with
 * critical hits and the target's damage modifiers, saves against an effect's
 * DC, conditions with durations, hit points and the module's rule at 0 hit
 * points. Rules come from the module through the SDK and core helpers; this
 * file seeds every roll as table mode does (`sessionId:counter`, or the dice
 * typed at the table) and logs everything GM-only.
 */
import {
  addD20Condition,
  appendTrackerLog,
  applyD20Damage,
  d20Combatant,
  d20CombatOf,
  d20ConditionsOf,
  healD20,
  removeD20Condition,
  setD20ConditionValue,
  setD20TempHp,
  tickD20Turn,
  updateTrackerState,
  type ConditionChange,
  type D20CombatantView,
  type D20DamageOutcome,
  type D20HealOutcome,
  type D20TurnTick,
  type Entity,
  type Id,
} from "@campaign-forge/core";
import {
  applyD20DamageModifiers,
  computeFields,
  createRng,
  d20AttackAbility,
  d20ConcreteDuration,
  d20Condition,
  d20ConditionAdjustment,
  d20ConditionLabel,
  d20DamageText,
  d20DurationText,
  d20ModifierText,
  d20RollInput,
  d20RollMode,
  d20SaveDc,
  d20SaveDamageMultiplier,
  labelDice,
  resolveD20Attack,
  resolveD20Save,
  rollD20Damage,
  rollDice,
  type D20Attack,
  type D20AttackResolution,
  type D20CombatDef,
  type D20ConditionApply,
  type D20DamageApplied,
  type D20DamagePart,
  type D20DamageRoll,
  type D20Degree,
  type D20ModifierPart,
  type D20RollAdjustment,
  type D20SaveDef,
  type D20SaveEffect,
  type D20SaveResolution,
  type DicePool,
  type Rng,
  type RollResult,
  type TrackerDef,
} from "@campaign-forge/module-sdk";
import { initiativeModifier, initiativeOrder, initiativeState, newId, type Participant } from "@campaign-forge/ui";
import type { CampaignContextValue } from "./CampaignProvider";
import { DICE_LOG, enteredField, logTable, nextRollSeed, withRollRng, type DiceLogData } from "./tableActions";

type Ctx = Pick<CampaignContextValue, "store" | "module">;
type Mode = "normal" | "advantage" | "disadvantage";

function entityOf(ctx: Ctx, id: Id): Entity {
  const e = ctx.store.get("entities", id);
  if (!e) throw new Error(`entities/${id} not found`);
  return e;
}

export function d20Def(ctx: Pick<Ctx, "module">): D20CombatDef {
  const def = d20CombatOf(ctx.module);
  if (!def) throw new Error("This game module has no d20 combat");
  return def;
}

/** The entity as a combatant (undefined when its type is not one). */
export function combatantOf(ctx: Pick<Ctx, "module">, entity: Entity): D20CombatantView | undefined {
  return d20Combatant(ctx.module, entity);
}

const gm = { gmOnly: true } as const;
const signed = (n: number) => (n < 0 ? `−${Math.abs(n)}` : `+${n}`);

// ---------------------------------------------------------------------------
// initiative and turns
// ---------------------------------------------------------------------------

/** The module's initiative tracker for the campaign's play mode. */
export function initiativeTracker(ctx: Ctx): TrackerDef | undefined {
  return ctx.module.forMode(ctx.store.meta().mode).trackers.find((t) => t.kind === "initiative");
}

export interface CombatOrder {
  tracker?: TrackerDef;
  round: number;
  /** Participants in turn order (highest first for rolled initiative). */
  order: Participant[];
  /** Whose turn it is: the first in order with a card who has not acted. */
  current?: Participant;
  rolled: boolean;
}

function trackerStateOf(ctx: Ctx, sessionId: Id, trackerId: string): unknown {
  const ts = ctx.store.list("trackerState").find((t) => t.session === sessionId && !t.archived);
  return ts?.state[trackerId];
}

/** The initiative order and the current turn, from the initiative tracker's state. */
export function combatOrder(ctx: Ctx, sessionId: Id, state?: unknown): CombatOrder {
  const tracker = initiativeTracker(ctx);
  if (!tracker) return { round: 1, order: [], rolled: false };
  const rolled = tracker.config?.method === "roll";
  const init = initiativeState(state === undefined ? trackerStateOf(ctx, sessionId, tracker.id) : state);
  const order = initiativeOrder(init.participants, rolled);
  const current = order.find((p) => !p.acted && p.card !== null);
  return { tracker, round: init.round, order, ...(current ? { current } : {}), rolled };
}

/** Whose turn it is (an entity id), if anyone's. */
export function currentTurnEntity(ctx: Ctx, sessionId: Id): Id | undefined {
  return combatOrder(ctx, sessionId).current?.entityId;
}

/** Initiative for these entities, as the tracker rolls it (dice + modifier, named after each roller). */
function rollInitiativeFor(ctx: Ctx, tracker: TrackerDef, entities: Entity[], rng: Rng): Array<{ entityId: Id; card: number; mod: number; detail: string }> {
  const expr = typeof tracker.config?.dice === "string" ? tracker.config.dice : "1d20";
  return entities.map((e) => {
    const type = ctx.module.entityType(e.type);
    const computed = type ? computeFields(type, e.fields) : {};
    const mod = initiativeModifier(tracker.config?.modifier, { id: e.id, name: e.name, type: e.type, fields: e.fields, computed });
    const natural = rollDice(expr, labelDice(rng, e.name)).total;
    return { entityId: e.id, card: natural + mod, mod, detail: `${natural} ${mod < 0 ? "−" : "+"} ${Math.abs(mod)}` };
  });
}

/** Initiative cards (lowest acts first) for these entities, from what is left of the deck. */
function drawCardsFor(tracker: TrackerDef, participants: Participant[], entities: Entity[], rng: Rng): Array<{ entityId: Id; card: number; mod: number; detail: string }> {
  const size = typeof tracker.config?.cards === "number" ? tracker.config.cards : 10;
  const deck = Array.from({ length: size }, (_, i) => i + 1).filter((c) => !participants.some((p) => p.card === c));
  return entities.flatMap((e) => {
    if (!deck.length) return [];
    const [card] = deck.splice(rng.int(0, deck.length - 1), 1);
    return [{ entityId: e.id, card: card!, mod: 0, detail: "drawn" }];
  });
}

/** The initiative roll for everyone who has none yet, as a pure function of its Rng (to ask for the dice). */
export function initiativeRun(ctx: Ctx, sessionId: Id, entityIds: Id[]): (rng: Rng) => unknown {
  const tracker = initiativeTracker(ctx);
  if (!tracker) throw new Error("The module has no initiative tracker");
  // cards are drawn by the app; there are no dice to type
  if (tracker.config?.method !== "roll") return () => undefined;
  const { order } = combatOrder(ctx, sessionId);
  const need = entityIds.filter((id) => !order.some((p) => p.entityId === id && p.card !== null)).map((id) => entityOf(ctx, id));
  return (rng) => rollInitiativeFor(ctx, tracker, need, rng);
}

/**
 * Put these combatants in the initiative order and roll for each one that
 * has no score yet (seeded, or the dice typed at the table), round 1.
 */
export function startCombat(ctx: Ctx, sessionId: Id, entityIds: Id[], entered?: number[]): CombatOrder {
  const tracker = initiativeTracker(ctx);
  if (!tracker) throw new Error("The module has no initiative tracker");
  const store = ctx.store;
  return store.transact(() => {
    const init = initiativeState(trackerStateOf(ctx, sessionId, tracker.id));
    const participants = [...init.participants];
    for (const id of entityIds) {
      if (participants.some((p) => p.entityId === id)) continue;
      const e = entityOf(ctx, id);
      participants.push({ id: newId("p"), name: e.name, entityId: e.id, card: null, extraDraws: 0, acted: false });
    }
    const need = participants.filter((p) => p.card === null && p.entityId && entityIds.includes(p.entityId)).map((p) => entityOf(ctx, p.entityId!));
    const seed = nextRollSeed(store, sessionId);
    const rolled = tracker.config?.method === "roll";
    const rolls = rolled ? withRollRng(seed, entered, (rng) => rollInitiativeFor(ctx, tracker, need, rng)) : drawCardsFor(tracker, participants, need, createRng(seed));
    const next = participants.map((p) => {
      const r = rolls.find((x) => x.entityId === p.entityId);
      return r ? { ...p, card: r.card, mod: r.mod, detail: entered ? `${r.detail} (entered)` : r.detail, acted: false } : p;
    });
    updateTrackerState(store, sessionId, tracker.id, { round: init.round, participants: next });
    const order = combatOrder(ctx, sessionId);
    appendTrackerLog(store, sessionId, {
      tracker: DICE_LOG,
      text: `Initiative ${rolled ? (entered ? "rolled at the table" : "rolled") : "drawn"}: ${order.order.map((p) => `${p.name} ${p.card ?? "–"}`).join(", ")}`,
      data: { kind: "free", seed, ...enteredField(entered), label: "Initiative", ...gm } satisfies DiceLogData,
    });
    return order;
  });
}

export interface TurnChange {
  ended?: Participant;
  started?: Participant;
  round: number;
  newRound: boolean;
  /** What the end of the ending turn (and the start of the next) did to conditions. */
  tick: D20TurnTick;
}

function mergeTicks(a: D20TurnTick, b: D20TurnTick): D20TurnTick {
  return { expired: [...a.expired, ...b.expired], decremented: [...a.decremented, ...b.decremented], savesDue: [...a.savesDue, ...b.savesDue] };
}

/**
 * End the current turn and start the next: conditions tick at the end of the
 * ending creature's turn (durations, end-of-turn decrements, save-ends saves
 * due) and at the start of the next one's; after the last participant a new
 * round starts. Logged GM-only.
 */
export function nextTurn(ctx: Ctx, sessionId: Id): TurnChange {
  const tracker = initiativeTracker(ctx);
  if (!tracker) throw new Error("The module has no initiative tracker");
  const store = ctx.store;
  return store.transact(() => {
    const init = initiativeState(trackerStateOf(ctx, sessionId, tracker.id));
    const before = combatOrder(ctx, sessionId);
    const ids = before.order.map((p) => p.entityId).filter((x): x is Id => !!x);
    const empty: D20TurnTick = { expired: [], decremented: [], savesDue: [] };
    const ended = before.current;
    let tick = ended?.entityId ? tickD20Turn(store, ctx.module, ids, { entity: ended.entityId, at: "end" }) : empty;
    let participants = init.participants.map((p) => (ended && p.id === ended.id ? { ...p, acted: true } : p));
    let round = init.round;
    let newRound = false;
    if (!participants.some((p) => !p.acted && p.card !== null)) {
      round += 1;
      newRound = true;
      participants = participants.map((p) => ({ ...p, acted: false }));
    }
    updateTrackerState(store, sessionId, tracker.id, { round, participants });
    const after = combatOrder(ctx, sessionId);
    const started = after.current;
    if (started?.entityId) tick = mergeTicks(tick, tickD20Turn(store, ctx.module, ids, { entity: started.entityId, at: "start" }));
    const name = (id: Id) => store.get("entities", id)?.name ?? id;
    const changes = [
      ...tick.decremented.map((d) => `${name(d.entity)}: ${d.label} ${d.from} → ${d.to}`),
      ...tick.expired.map((x) => `${name(x.entity)}: ${x.label} ends`),
      ...tick.savesDue.map((s) => `${name(s.entity)}: save DC ${s.dc} to end ${s.label}`),
    ];
    const text = [newRound ? `Round ${round}.` : "", ended ? `${ended.name}'s turn ends.` : "", started ? `${started.name}'s turn.` : "", changes.length ? changes.join("; ") : ""].filter(Boolean).join(" ");
    logTable(ctx, sessionId, text, { combat: "turn", round, ...gm });
    return { ...(ended ? { ended } : {}), ...(started ? { started } : {}), round, newRound, tick };
  });
}

// ---------------------------------------------------------------------------
// attacks
// ---------------------------------------------------------------------------

export interface AttackOptions {
  /** The attacker is close to the target (for effects such as prone); default: a melee attack is close. */
  close?: boolean;
  /** The GM's roll mode, overriding what the conditions give. */
  mode?: Mode;
  /** The dice engine's situational choices (e.g. the multiple attack penalty), by choice id. */
  choices?: Record<string, string>;
  /** A flat modifier the GM adds. */
  modifier?: number;
}

export interface AttackPlan {
  attacker: Entity;
  target: Entity;
  attack: D20Attack;
  bonus: number;
  /** The target's AC with its conditions. */
  ac: number;
  acBase: number;
  acParts: D20ModifierPart[];
  own: D20RollAdjustment;
  against: D20RollAdjustment;
  /** Roll mode the conditions give, with the reasons. */
  conditionMode: { mode: Mode; advantage: string[]; disadvantage: string[] };
  mode: Mode;
  close: boolean;
  input: Record<string, unknown>;
  pool: DicePool;
}

/** Everything an attack roll needs: the bonus, the conditions on both sides, the target's AC, the engine input. */
export function planAttack(ctx: Ctx, attackerId: Id, attack: D20Attack, targetId: Id, opts: AttackOptions = {}): AttackPlan {
  const def = d20Def(ctx);
  const attacker = entityOf(ctx, attackerId);
  const target = entityOf(ctx, targetId);
  const t = combatantOf(ctx, target);
  if (!t) throw new Error(`${target.name} is not a combatant`);
  const close = opts.close ?? attack.kind === "melee";
  const ability = d20AttackAbility(def, attack);
  const own = d20ConditionAdjustment(def, d20ConditionsOf(ctx.module, attacker), { roll: "attack", attackKind: attack.kind, ...(ability ? { ability } : {}) });
  const targetConditions = d20ConditionsOf(ctx.module, target);
  const against = d20ConditionAdjustment(def, targetConditions, { roll: "attack", attackKind: attack.kind }, { against: true, close });
  const acAdj = d20ConditionAdjustment(def, targetConditions, { roll: "ac" });
  const ac = t.ac + acAdj.modifier;
  const conditionMode = d20RollMode(own, against);
  const bonus = attack.bonus ?? 0;
  const base = [{ label: attack.name, value: bonus }, ...(opts.modifier ? [{ label: "GM modifier", value: opts.modifier }] : [])];
  const mode = opts.mode ?? conditionMode.mode;
  const input = d20RollInput({ base, own, against, advantage: mode, ...(def.rules.crit === "degrees" ? { dc: ac } : {}), ...(opts.choices ? { choices: opts.choices } : {}) });
  const pool = ctx.module.module.dice.buildPool(input);
  return { attacker, target, attack, bonus, ac, acBase: t.ac, acParts: acAdj.parts, own, against, conditionMode, mode, close, input, pool };
}

/** The attack roll as a pure function of its Rng (to ask for its dice). */
export function attackRun(ctx: Ctx, plan: AttackPlan): (rng: Rng) => unknown {
  const dice = ctx.module.module.dice;
  return (rng) => dice.roll(plan.pool, rng);
}

export interface AttackRoll {
  plan: AttackPlan;
  seed: string;
  entered?: number[];
  result: RollResult;
  resolution: D20AttackResolution;
}

/** Roll an attack (seeded, or the dice typed at the table), resolve it against AC by the module's rule, log it GM-only. */
export function rollAttack(ctx: Ctx, sessionId: Id, plan: AttackPlan, entered?: number[]): AttackRoll {
  const def = d20Def(ctx);
  const dice = ctx.module.module.dice;
  const seed = nextRollSeed(ctx.store, sessionId);
  const result = withRollRng(seed, entered, (rng) => dice.roll(plan.pool, rng));
  const resolution = resolveD20Attack(def, result, plan.ac, plan.against.critOnHit);
  const outcome = resolution.critical ? "critical hit" : resolution.hit ? "hit" : "miss";
  const why = plan.mode !== "normal" ? ` (${plan.mode}${plan.mode === plan.conditionMode.mode ? `: ${(plan.mode === "advantage" ? plan.conditionMode.advantage : plan.conditionMode.disadvantage).join(", ")}` : ", GM's choice"})` : "";
  const label = `${plan.attacker.name}: ${plan.attack.name} at ${plan.target.name}`;
  appendTrackerLog(ctx.store, sessionId, {
    tracker: DICE_LOG,
    text: `${label}: ${resolution.reason}, ${outcome}${why}`,
    entity: plan.attacker.id,
    data: { kind: "pool", seed, ...enteredField(entered), label, result, ...gm } satisfies DiceLogData,
  });
  return { plan, seed, ...enteredField(entered), result, resolution };
}

/** A flat damage modifier from the attacker's conditions (e.g. a penalty to Strength-based damage). */
export function damageModifierFor(ctx: Ctx, attackerId: Id | undefined, attack: Pick<D20Attack, "kind" | "ability">): { value: number; labels: string[] } | undefined {
  if (!attackerId) return undefined;
  const def = d20Def(ctx);
  const ability = d20AttackAbility(def, attack);
  const adj = d20ConditionAdjustment(def, d20ConditionsOf(ctx.module, entityOf(ctx, attackerId)), { roll: "damage", attackKind: attack.kind, ...(ability ? { ability } : {}) });
  return adj.modifier ? { value: adj.modifier, labels: adj.parts.filter((p) => p.stacked).map(d20ModifierText) } : undefined;
}

/** A damage roll as a pure function of its Rng. */
export function damageRun(ctx: Ctx, parts: D20DamagePart[], opts: { critical?: boolean; modifier?: { value: number; labels: string[] } }): (rng: Rng) => unknown {
  const def = d20Def(ctx);
  return (rng) => rollD20Damage(def, parts, rng, opts);
}

export interface DamageRollDone {
  seed: string;
  entered?: number[];
  roll: D20DamageRoll;
}

/** Roll damage parts (critical hits per the module), log it GM-only. */
export function rollDamage(ctx: Ctx, sessionId: Id, label: string, entityId: Id | undefined, parts: D20DamagePart[], opts: { critical?: boolean; modifier?: { value: number; labels: string[] } }, entered?: number[]): DamageRollDone {
  const def = d20Def(ctx);
  const seed = nextRollSeed(ctx.store, sessionId);
  const roll = withRollRng(seed, entered, (rng) => rollD20Damage(def, parts, rng, opts));
  const text = `${label}: ${roll.parts.map((p) => `${p.rolled}${p.type ? ` ${p.type}` : ""} = ${p.total}`).join(" + ")}${roll.modifier ? ` (${roll.modifier.labels.join(", ")})` : ""} → ${roll.total} damage${roll.critical ? " (critical)" : ""}${roll.persistent.length ? `; persistent ${d20DamageText(def, roll.persistent)}` : ""}`;
  appendTrackerLog(ctx.store, sessionId, {
    tracker: DICE_LOG,
    text,
    ...(entityId ? { entity: entityId } : {}),
    data: { kind: "damage", seed, ...enteredField(entered), label, total: roll.total, ...gm } satisfies DiceLogData,
  });
  return { seed, ...enteredField(entered), roll };
}

/** What rolled damage does to a target after its damage modifiers (`multiplier` for saves: half, double). */
export function damageAgainst(ctx: Ctx, targetId: Id, roll: D20DamageRoll, traits: string[], multiplier = 1): D20DamageApplied {
  const def = d20Def(ctx);
  const t = combatantOf(ctx, entityOf(ctx, targetId));
  const parts = roll.parts.map((p) => ({ ...(p.type ? { type: p.type } : {}), amount: Math.floor(p.total * multiplier) }));
  return applyD20DamageModifiers(def, t?.damageModifiers ?? [], parts, traits);
}

export interface HitApplied extends D20DamageOutcome {
  entity: Entity;
  amount: number;
}

/** Apply damage to a combatant (temporary hit points first; the module's rule at 0), logged GM-only. */
export function applyD20Hit(ctx: Ctx, sessionId: Id, targetId: Id, amount: number, opts: { critical?: boolean; by?: string } = {}): HitApplied {
  return ctx.store.transact(() => {
    const out = applyD20Damage(ctx.store, ctx.module, targetId, amount, { ...(opts.critical ? { critical: true } : {}) });
    const entity = entityOf(ctx, targetId);
    const parts = [
      `${entity.name} takes ${Math.max(0, Math.floor(amount))} damage${opts.by ? ` (${opts.by})` : ""}`,
      out.fromTemp ? `${out.fromTemp} from temporary hit points` : "",
      `HP ${out.after.current}/${out.after.max}`,
      out.dropped ? `down to 0${out.conditionsAdded.length ? `: ${out.conditionsAdded.join(", ")}` : ""}${out.defeated ? ", defeated" : ""}` : "",
    ].filter(Boolean);
    logTable(ctx, sessionId, parts.join(". "), { entity: targetId, damage: amount, ...gm });
    return { ...out, entity, amount };
  });
}

/** Heal a combatant (coming back from 0 hit points applies the module's rule), logged GM-only. */
export function healCombatant(ctx: Ctx, sessionId: Id, targetId: Id, amount: number): D20HealOutcome {
  return ctx.store.transact(() => {
    const out = healD20(ctx.store, ctx.module, targetId, amount);
    const entity = entityOf(ctx, targetId);
    const extra = out.recovered ? ` Back from 0${out.removed.length ? `: ${out.removed.join(", ")} removed` : ""}${out.added.length ? `; ${out.added.join(", ")}` : ""}.` : "";
    logTable(ctx, sessionId, `${entity.name} regains ${amount} hit points. HP ${out.after.current}/${out.after.max}.${extra}`, { entity: targetId, heal: amount, ...gm });
    return out;
  });
}

/** Set a combatant's temporary hit points, logged GM-only. */
export function setTempHp(ctx: Ctx, sessionId: Id, targetId: Id, temp: number): void {
  setD20TempHp(ctx.store, ctx.module, targetId, temp);
  logTable(ctx, sessionId, `${entityOf(ctx, targetId).name}: ${temp} temporary hit points.`, { entity: targetId, ...gm });
}

// ---------------------------------------------------------------------------
// saves
// ---------------------------------------------------------------------------

/** An effect's DC with the source's conditions (e.g. a status penalty to its DCs). */
export function effectDc(ctx: Ctx, sourceId: Id | undefined, effect: D20SaveEffect): { dc: number; base: number; parts: D20ModifierPart[] } {
  const def = d20Def(ctx);
  const source = sourceId ? ctx.store.get("entities", sourceId) : undefined;
  const type = source ? ctx.module.entityType(source.type) : undefined;
  const base = d20SaveDc(effect, source ? { fields: source.fields, computed: type ? computeFields(type, source.fields) : {} } : undefined) ?? 10;
  if (!source) return { dc: base, base, parts: [] };
  const adj = d20ConditionAdjustment(def, d20ConditionsOf(ctx.module, source), { roll: "dc" });
  return { dc: base + adj.modifier, base, parts: adj.parts };
}

export interface SavePlan {
  target: Entity;
  save: D20SaveDef;
  dc: number;
  bonus: number;
  own: D20RollAdjustment;
  conditionMode: { mode: Mode; advantage: string[]; disadvantage: string[] };
  mode: Mode;
  input: Record<string, unknown>;
  pool: DicePool;
}

/** A save by `targetId` against `dc`: its bonus, its conditions (modifiers, advantage, automatic failure). */
export function planSave(ctx: Ctx, targetId: Id, saveId: string, dc: number, opts: { mode?: Mode } = {}): SavePlan {
  const def = d20Def(ctx);
  const target = entityOf(ctx, targetId);
  const save = def.saves.find((s) => s.id === saveId);
  if (!save) throw new Error(`Unknown save "${saveId}"`);
  const t = combatantOf(ctx, target);
  const bonus = t?.saves[saveId] ?? 0;
  const own = d20ConditionAdjustment(def, d20ConditionsOf(ctx.module, target), { roll: "save", save: saveId, ...(save.ability ? { ability: save.ability } : {}) });
  const conditionMode = d20RollMode(own);
  const mode = opts.mode ?? conditionMode.mode;
  const input = d20RollInput({ base: [{ label: save.name, value: bonus }], own, advantage: mode, dc });
  return { target, save, dc, bonus, own, conditionMode, mode, input, pool: ctx.module.module.dice.buildPool(input) };
}

export function saveRun(ctx: Ctx, plan: SavePlan): (rng: Rng) => unknown {
  const dice = ctx.module.module.dice;
  return (rng) => dice.roll(plan.pool, rng);
}

export interface SaveRoll {
  plan: SavePlan;
  seed: string;
  entered?: number[];
  result: RollResult;
  resolution: D20SaveResolution;
}

/** Roll a save (seeded, or typed), resolve it by the module's rule, log it GM-only. */
export function rollSave(ctx: Ctx, sessionId: Id, plan: SavePlan, label: string, entered?: number[]): SaveRoll {
  const def = d20Def(ctx);
  const dice = ctx.module.module.dice;
  const seed = nextRollSeed(ctx.store, sessionId);
  const result = withRollRng(seed, entered, (rng) => dice.roll(plan.pool, rng));
  const resolution = resolveD20Save(def, result, plan.dc, plan.own.autoFail);
  const full = `${plan.target.name}: ${plan.save.name} against ${label}`;
  appendTrackerLog(ctx.store, sessionId, {
    tracker: DICE_LOG,
    text: `${full}: ${resolution.reason}, ${degreeLabel(resolution.degree)}`,
    entity: plan.target.id,
    data: { kind: "pool", seed, ...enteredField(entered), label: full, result, ...gm } satisfies DiceLogData,
  });
  return { plan, seed, ...enteredField(entered), result, resolution };
}

export function degreeLabel(d: D20Degree): string {
  return d === "critical-success" ? "critical success" : d === "critical-failure" ? "critical failure" : d;
}

/** How much damage a save outcome takes, for the panel. */
export function saveMultiplier(ctx: Ctx, degree: D20Degree, half: boolean | undefined): number {
  return d20SaveDamageMultiplier(d20Def(ctx), degree, half);
}

// ---------------------------------------------------------------------------
// conditions
// ---------------------------------------------------------------------------

/**
 * Apply a condition to a combatant: its duration made concrete against the
 * current turn (rounds, until the end of the source's next turn, a save each
 * turn), logged GM-only. An immune creature is left alone (`force` overrides).
 */
export function applyCondition(ctx: Ctx, sessionId: Id, targetId: Id, apply: D20ConditionApply, opts: { sourceId?: Id; source?: string; dc?: number; note?: string; force?: boolean; replace?: boolean } = {}): ConditionChange {
  const def = d20Def(ctx);
  const currentTurn = currentTurnEntity(ctx, sessionId);
  const duration = d20ConcreteDuration(apply.duration, { target: targetId, ...(opts.sourceId ? { source: opts.sourceId } : {}), ...(currentTurn ? { currentTurn } : {}), ...(opts.dc !== undefined ? { dc: opts.dc } : {}) });
  const change = addD20Condition(ctx.store, ctx.module, targetId, {
    id: apply.id,
    ...(apply.value !== undefined ? { value: apply.value } : {}),
    ...(duration ? { duration } : {}),
    ...(opts.source ? { source: opts.source } : {}),
    ...(opts.sourceId ? { sourceId: opts.sourceId } : {}),
    ...(opts.note ? { note: opts.note } : {}),
    ...(opts.force ? { force: true } : {}),
    ...(opts.replace ? { replace: true } : {}),
  });
  const target = entityOf(ctx, targetId);
  const cd = d20Condition(def, apply.id);
  const name = (id: string) => ctx.store.get("entities", id)?.name ?? id;
  const label = d20ConditionLabel({ name: cd?.name ?? apply.id, ...(change.record?.value !== undefined ? { value: change.record.value } : {}) });
  if (change.immune) logTable(ctx, sessionId, `${target.name} is immune to ${cd?.name ?? apply.id}.`, { entity: targetId, ...gm });
  else logTable(ctx, sessionId, `${target.name}: ${label}${opts.source ? ` (${opts.source})` : ""}${duration ? `, ${d20DurationText(def, duration, name)}` : ""}.`, { entity: targetId, condition: apply.id, ...gm });
  return change;
}

export function removeCondition(ctx: Ctx, sessionId: Id, targetId: Id, conditionId: string, why?: string): void {
  if (removeD20Condition(ctx.store, ctx.module, targetId, conditionId)) {
    const cd = d20Condition(d20Def(ctx), conditionId);
    logTable(ctx, sessionId, `${entityOf(ctx, targetId).name}: ${cd?.name ?? conditionId} ends${why ? ` (${why})` : ""}.`, { entity: targetId, condition: conditionId, ...gm });
  }
}

export function setConditionValue(ctx: Ctx, sessionId: Id, targetId: Id, conditionId: string, value: number): void {
  setD20ConditionValue(ctx.store, ctx.module, targetId, conditionId, value);
  const cd = d20Condition(d20Def(ctx), conditionId);
  logTable(ctx, sessionId, `${entityOf(ctx, targetId).name}: ${cd?.name ?? conditionId} ${value > 0 ? value : "ends"}.`, { entity: targetId, condition: conditionId, ...gm });
}

// ---------------------------------------------------------------------------
// checks from a sheet
// ---------------------------------------------------------------------------

/**
 * What a creature's conditions do to a check or save it rolls from a sheet
 * or the Dice tab: labelled modifiers for the dice engine, the roll mode, and
 * notes for the GM (reasons, automatic failure). Undefined when the module
 * has no d20 combat or nothing applies.
 */
export function checkConditionInput(ctx: Pick<Ctx, "module">, entity: Entity, rollId: string | undefined, attributeId?: string): { adjustments: Array<{ label: string; value: number }>; advantage?: Mode; notes: string[] } | undefined {
  const def = d20CombatOf(ctx.module);
  if (!def || !combatantOf(ctx, entity)) return undefined;
  const active = d20ConditionsOf(ctx.module, entity);
  if (!active.length) return undefined;
  const save = def.saves.find((s) => s.roll === rollId);
  const ability = save?.ability ?? attributeId ?? (rollId ? def.skillAbilities?.[rollId] : undefined) ?? (rollId?.startsWith("attr:") ? rollId.slice(5) : undefined);
  const adj = d20ConditionAdjustment(def, active, save ? { roll: "save", save: save.id, ...(ability ? { ability } : {}) } : { roll: "check", ...(ability ? { ability } : {}), ...(rollId ? { skill: rollId } : {}) });
  const mode = d20RollMode(adj);
  const notes = [
    ...adj.parts.map(d20ModifierText),
    ...(mode.advantage.length ? [`advantage: ${mode.advantage.join(", ")}`] : []),
    ...(mode.disadvantage.length ? [`disadvantage: ${mode.disadvantage.join(", ")}`] : []),
    ...(adj.autoFail.length ? [`fails automatically: ${adj.autoFail.join(", ")}`] : []),
  ];
  if (!notes.length) return undefined;
  return {
    adjustments: adj.parts.filter((p) => p.stacked).map((p) => ({ label: `${p.label}${p.bonusType ? ` (${p.bonusType})` : ""}`, value: p.value })),
    ...(mode.mode !== "normal" ? { advantage: mode.mode } : {}),
    notes,
  };
}
