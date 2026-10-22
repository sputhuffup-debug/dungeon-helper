/**
 * Combat at the table: hits, damage corrections, broken-table rolls,
 * creature attacks and reactions, special attacks. The rules come from the
 * module's `combat` def through the core helpers; this file seeds every roll
 * as table mode does (`sessionId:counter`, the dice-log length) and logs it.
 * Combat entries are marked GM-only: they never reach a player output.
 */
import {
  appendTrackerLog,
  applyDamage,
  brokenEntryFor,
  damageReaction,
  getPath,
  healDamage,
  healthState,
  resolveHitFor,
  rollCreatureAttack,
  type BrokenEntry,
  type CreatureAttack,
  type CreatureAttackRoll,
  type DamageOutcome,
  type DamageReaction,
  type Entity,
  type HealthState,
  type Id,
  type ResolvedHit,
} from "@campaign-forge/core";
import { createRng, rollTable, type PlayModeId, type RollRecord, type RollResult, type Rng, type SpecialAttackDef } from "@campaign-forge/module-sdk";
import type { CampaignContextValue } from "./CampaignProvider";
import { DICE_LOG, enteredField, logTable, nextRollSeed, operationRun, recordPoolRoll, rollOperation, tableResultText, withRollRng, type DiceLogData, type OperationRoll } from "./tableActions";

type Ctx = Pick<CampaignContextValue, "store" | "module">;

function entityOf(ctx: Ctx, id: Id): Entity {
  const e = ctx.store.get("entities", id);
  if (!e) throw new Error(`entities/${id} not found`);
  return e;
}

// ---------------------------------------------------------------------------
// hits and damage
// ---------------------------------------------------------------------------

export interface HitRequest {
  amount: number;
  armorPiercing?: boolean;
  /** Hit source the module's armor may depend on (e.g. "fire"). */
  source?: string;
  /** Successes beyond the first; the module's hit rule decides whether they add damage. */
  extraSuccesses?: number;
  /** Aimed at a weak spot (the module's hit rule decides what that does). */
  weakSpot?: boolean;
  /** Who or what hit, for the log (e.g. "Beast: Claw"). */
  by?: string;
}

const hitOptions = (req: HitRequest) => ({
  ...(req.armorPiercing ? { armorPiercing: true } : {}),
  ...(req.weakSpot ? { weakSpot: true } : {}),
  ...(req.source ? { source: req.source } : {}),
  ...(req.extraSuccesses ? { extraSuccesses: req.extraSuccesses } : {}),
});

/**
 * What a hit would do, for the take-a-hit dialog. Uses the seed the hit will
 * be applied with (the next roll seed), so a module rule that rolls armor
 * dice shows the same result it then applies.
 */
export function previewHit(ctx: Ctx, sessionId: Id, entityId: Id, req: HitRequest): ResolvedHit & { seed: string } {
  const seed = nextRollSeed(ctx.store, sessionId);
  return { ...resolveHitFor(ctx.module, entityOf(ctx, entityId), req.amount, { rng: createRng(seed), ...hitOptions(req) }), seed };
}

export interface HitApplied extends DamageOutcome {
  entity: Entity;
  seed: string;
  /** The target's reaction to the damage (e.g. a splash), when it has one. */
  reaction?: DamageReaction;
}

/** Apply a hit with the session's seeded rng and log it (GM-only). */
export function takeHit(ctx: Ctx, sessionId: Id, entityId: Id, req: HitRequest): HitApplied {
  const store = ctx.store;
  return store.transact(() => {
    const entity = entityOf(ctx, entityId);
    const seed = nextRollSeed(store, sessionId);
    const out = applyDamage(store, ctx.module, entityId, req.amount, { rng: createRng(seed), ...hitOptions(req) });
    const label = `${entity.name} takes a hit${req.by ? ` (${req.by})` : ""}`;
    const data: DiceLogData = { kind: "damage", seed, label, total: out.result.damage, ...(out.result.rolls?.length ? { rolls: out.result.rolls } : {}), gmOnly: true };
    const health = `Health ${out.after.remaining}/${out.after.max}${out.after.broken ? ", broken" : ""}`;
    appendTrackerLog(store, sessionId, { tracker: DICE_LOG, text: `${label}: ${out.result.damage} damage. ${out.result.explain}. ${health}`, entity: entity.id, data });
    const reaction = damageReaction(ctx.module, entity, out.result.damage, req.source);
    return { ...out, entity: store.get("entities", entityId)!, seed, ...(reaction ? { reaction } : {}) };
  });
}

/** A GM correction: +n raw damage (no armor) or -n healed. Logged GM-only. */
export function adjustDamage(ctx: Ctx, sessionId: Id, entityId: Id, delta: number): { health: HealthState; brokenTable?: BrokenEntry } {
  const store = ctx.store;
  return store.transact(() => {
    const entity = entityOf(ctx, entityId);
    let health: HealthState;
    let brokenTable: BrokenEntry | undefined;
    if (delta > 0) {
      const out = applyDamage(store, ctx.module, entityId, delta, { rng: createRng(`${sessionId}:adjust`), ignoreArmor: true });
      health = out.after;
      brokenTable = out.brokenTable;
    } else {
      health = healDamage(store, ctx.module, entityId, -delta);
    }
    logTable(ctx, sessionId, `${entity.name}: damage ${delta > 0 ? "+" : ""}${delta} (Health ${health.remaining}/${health.max})`, { entity: entityId, damage: delta, gmOnly: true });
    return { health, ...(brokenTable ? { brokenTable } : {}) };
  });
}

/** The broken table for an entity at zero health, if any. */
export function brokenTableFor(ctx: Ctx, entity: Entity): BrokenEntry | undefined {
  const h = healthState(ctx.module, entity);
  return h?.broken ? brokenEntryFor(ctx.module, entity) : undefined;
}

export interface BrokenRoll {
  label: string;
  seed: string;
  entered?: number[];
  /** The one-line result, as logged. */
  text: string;
  record?: RollRecord;
  /** Set when the module rolls it through a dice operation (its effects applied). */
  operation?: OperationRoll;
}

/**
 * Roll the broken table for an entity: the module's dice operation when the
 * entry names one (effects apply, as the card's one-tap rolls do), else the
 * table itself with the session's seeded rng. Logged GM-only.
 */
export function rollBroken(ctx: Ctx, sessionId: Id, entityId: Id, entry: BrokenEntry, entered?: number[]): BrokenRoll {
  const label = entry.label ?? ctx.module.table(entry.table)?.name ?? entry.table;
  if (entry.operation && ctx.module.module.dice.operations?.[entry.operation]) {
    const r = rollOperation(ctx, sessionId, entry.operation, entityId, {}, entered);
    return { label, seed: r.seed, ...enteredField(entered), text: r.result.label, operation: r };
  }
  const table = ctx.module.table(entry.table);
  if (!table) throw new Error(`The module has no table "${entry.table}"`);
  const store = ctx.store;
  const seed = nextRollSeed(store, sessionId);
  const record = withRollRng(seed, entered, (rng) => rollTable(table, rng, ctx.module.tables, { step: table.id }));
  return store.transact(() => {
    const entity = entityOf(ctx, entityId);
    const text = tableResultText(record);
    const data: DiceLogData = { kind: "table", seed, ...enteredField(entered), label, table: table.id, total: record.total, rolls: [record], gmOnly: true };
    appendTrackerLog(store, sessionId, { tracker: DICE_LOG, text: `${entity.name}: ${label}: ${text}`, entity: entity.id, data });
    return { label, seed, ...enteredField(entered), text, record };
  });
}

/** The broken-table roll as a pure function of its Rng (to ask for its dice). */
export function brokenRun(ctx: Ctx, entityId: Id, entry: BrokenEntry): (rng: Rng) => unknown {
  if (entry.operation && ctx.module.module.dice.operations?.[entry.operation]) return operationRun(ctx, entry.operation, entityId);
  const table = ctx.module.table(entry.table);
  if (!table) throw new Error(`The module has no table "${entry.table}"`);
  return (rng) => rollTable(table, rng, ctx.module.tables, { step: table.id });
}

// ---------------------------------------------------------------------------
// creature turns
// ---------------------------------------------------------------------------

/** Roll the creature's signature attack table (seeded, logged GM-only with the creature's name). */
export function rollCreatureAttackAt(ctx: Ctx, sessionId: Id, creatureId: Id, entered?: number[]): CreatureAttackRoll & { seed: string; entered?: number[] } {
  const store = ctx.store;
  const creature = entityOf(ctx, creatureId);
  const seed = nextRollSeed(store, sessionId);
  const roll = withRollRng(seed, entered, (rng) => rollCreatureAttack(ctx.module, creature, rng));
  return store.transact(() => {
    const data: DiceLogData = {
      kind: "table",
      seed,
      ...enteredField(entered),
      label: `${creature.name}: ${roll.table.name}`,
      table: roll.table.id,
      total: roll.record.total,
      rolls: [roll.record],
      gmOnly: true,
    };
    appendTrackerLog(store, sessionId, { tracker: DICE_LOG, text: `${creature.name}: ${roll.table.name}: ${roll.attack.name} (${roll.record.total})`, entity: creature.id, data });
    return { ...roll, seed, ...enteredField(entered) };
  });
}

/** The creature's signature attack roll as a pure function of its Rng (to ask for its dice). */
export function creatureAttackRun(ctx: Ctx, creatureId: Id): (rng: Rng) => unknown {
  const creature = entityOf(ctx, creatureId);
  return (rng) => rollCreatureAttack(ctx.module, creature, rng);
}

/** The GM picks an attack instead of rolling (as the turn notes allow). Logged GM-only. */
export function chooseCreatureAttack(ctx: Ctx, sessionId: Id, creatureId: Id, attack: CreatureAttack): void {
  const creature = entityOf(ctx, creatureId);
  logTable(ctx, sessionId, `${creature.name}: GM picks ${attack.name}`, { entity: creatureId, attack: attack.name, gmOnly: true });
}

/**
 * Pool input for a creature's dice: the attack's dice as base dice with no
 * skill, flagged as a non-player roll (the module's `npc` convention: never pushed).
 */
export function creaturePoolInput(creature: Entity, dice: number, label: string): Record<string, unknown> {
  return { attribute: Math.max(0, dice), skill: 0, npc: true, entity: creature.id, label };
}

export interface CreatureDiceRoll {
  seed: string;
  entered?: number[];
  input: Record<string, unknown>;
  result: RollResult;
}

/** Roll a creature's attack dice with the module's pool (seeded, logged GM-only). */
export function rollCreatureDice(ctx: Ctx, sessionId: Id, creature: Entity, dice: number, label: string, entered?: number[]): CreatureDiceRoll {
  const sys = ctx.module.module.dice;
  const input = creaturePoolInput(creature, dice, label);
  const seed = nextRollSeed(ctx.store, sessionId);
  const result = withRollRng(seed, entered, (rng) => sys.roll(sys.buildPool(input), rng));
  recordPoolRoll(ctx, sessionId, { label: `${creature.name}: ${label}`, seed, result, entityId: creature.id, gmOnly: true, ...enteredField(entered) });
  return { seed, ...enteredField(entered), input, result };
}

/** A creature's pool roll as a pure function of its Rng (to ask for its dice). */
export function creatureDiceRun(ctx: Ctx, creature: Entity, dice: number, label: string): (rng: Rng) => unknown {
  const sys = ctx.module.module.dice;
  const pool = sys.buildPool(creaturePoolInput(creature, dice, label));
  return (rng) => sys.roll(pool, rng);
}

export interface ReactionRoll extends CreatureDiceRoll {
  /** Damage per success times successes. */
  damage: number;
}

/** Roll a creature's damage reaction (e.g. a splash): rating (+ damage taken) dice; logged GM-only. */
export function rollReaction(ctx: Ctx, sessionId: Id, creature: Entity, reaction: DamageReaction, entered?: number[]): ReactionRoll {
  const roll = rollCreatureDice(ctx, sessionId, creature, reaction.dice, reaction.reaction.label, entered);
  return { ...roll, damage: roll.result.successes * reaction.reaction.damage };
}

// ---------------------------------------------------------------------------
// special attacks and opposed rolls
// ---------------------------------------------------------------------------

/** The module's special attacks for a play mode. */
export function specialAttacksFor(ctx: Pick<Ctx, "module">, mode?: PlayModeId): SpecialAttackDef[] {
  return (ctx.module.module.combat?.specialAttacks ?? []).filter((s) => !mode || !s.mode?.length || s.mode.includes(mode));
}

export interface OpposedOutcome {
  winner: "attacker" | "defender" | "tie";
  text: string;
}

/** Most successes wins; a tie goes as the module says (`combat.opposedTies`), else to the GM. */
export function opposedOutcome(ctx: Pick<Ctx, "module">, attacker: { name: string; result: RollResult }, defender: { name: string; result: RollResult }): OpposedOutcome {
  const a = attacker.result.successes;
  const d = defender.result.successes;
  const score = `${a} vs ${d}`;
  if (a > d) return { winner: "attacker", text: `${attacker.name} wins (${score})` };
  if (d > a) return { winner: "defender", text: `${defender.name} wins (${score})` };
  const ties = ctx.module.module.combat?.opposedTies;
  if (!ties) return { winner: "tie", text: `Tie (${score}): the GM decides` };
  const who = ties.winner === "attacker" ? attacker.name : defender.name;
  return { winner: ties.winner, text: `Tie (${score}): ${who} wins${ties.text ? `. ${ties.text}` : ""}` };
}

/** Log a special attack's outcome. */
export function logSpecialAttack(ctx: Ctx, sessionId: Id, input: { attacker: Entity; attack: SpecialAttackDef; target?: Entity; outcome?: OpposedOutcome; successes?: number }): void {
  const on = input.target ? ` on ${input.target.name}` : "";
  const what = input.outcome ? input.outcome.text : input.successes !== undefined ? `${input.successes} success${input.successes === 1 ? "" : "es"}` : "declared";
  logTable(ctx, sessionId, `${input.attacker.name}: ${input.attack.name}${on}: ${what}`, {
    specialAttack: input.attack.id,
    entity: input.attacker.id,
    ...(input.target ? { target: input.target.id } : {}),
    ...(input.outcome ? { winner: input.outcome.winner } : {}),
  });
}

/** A number at `path` of an entity's fields, if there is one (a creature's skill level, e.g.). */
export function numberAt(entity: Entity, path: string): number | undefined {
  const v = getPath(entity.fields, path);
  return typeof v === "number" ? v : undefined;
}
