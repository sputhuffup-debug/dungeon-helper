/**
 * Combat at the table, game-agnostic: where an entity keeps its damage, how
 * much health it has left, what one hit does after armor (the module's
 * `resolveHit`, else damage minus armor), the broken table to roll, a
 * creature's turn (its attack table, rolled with a seeded rng) and its
 * reaction to being damaged. Rules come from the module's `combat` def.
 *
 * Damage taken is stored state (`damagePath`); maximum health may be a
 * computed value of the entity type and is evaluated here, never stored.
 */
import {
  computeFields,
  createTableRegistry,
  evaluateLogic,
  rollTable,
  type CombatHealthDef,
  type CreatureTurnDef,
  type DamageReactionDef,
  type GameModule,
  type HitResult,
  type Rng,
  type RollRecord,
  type RollTable,
  type TableRegistry,
} from "@campaign-forge/module-sdk";
import { clone, getPath, setPath } from "./paths";
import type { CampaignStore } from "./store";
import type { Entity, Id } from "./types";

/** A game module, or a loaded one (anything with `.module`). */
export type CombatModule = GameModule | { module: GameModule };

type EntityLike = Pick<Entity, "type" | "fields"> & { subtype?: string | undefined };

function gameModule(m: CombatModule): GameModule {
  return Array.isArray((m as GameModule).entityTypes) ? (m as GameModule) : (m as { module: GameModule }).module;
}

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

function computedOf(module: GameModule, entity: EntityLike): Record<string, unknown> {
  const def = module.entityTypes.find((t) => t.id === entity.type);
  if (!def?.computed) return {};
  try {
    return computeFields(def, entity.fields);
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// health
// ---------------------------------------------------------------------------

/** The module's health def for the entity's type, if it tracks damage. */
export function combatHealthFor(module: CombatModule, entity: Pick<Entity, "type">): CombatHealthDef | undefined {
  return gameModule(module).combat?.health.find((h) => h.entityType === entity.type);
}

export interface HealthState {
  max: number;
  damage: number;
  remaining: number;
  /** Health is down to zero (with a positive maximum). */
  broken: boolean;
}

/** Maximum health: the entity type's computed value when `maxPath` names one, else the field. */
export function healthMax(module: CombatModule, entity: EntityLike, def = combatHealthFor(module, entity)): number {
  if (!def) return 0;
  const m = gameModule(module);
  const type = m.entityTypes.find((t) => t.id === entity.type);
  if (type?.computed && def.maxPath in type.computed) return Math.max(0, num(computedOf(m, entity)[def.maxPath]) ?? 0);
  return Math.max(0, num(getPath(entity.fields, def.maxPath)) ?? 0);
}

/** Health of an entity whose type has a health def: max, damage taken, what is left, broken. */
export function healthState(module: CombatModule, entity: EntityLike): HealthState | undefined {
  const def = combatHealthFor(module, entity);
  if (!def) return undefined;
  const max = healthMax(module, entity, def);
  const damage = Math.max(0, num(getPath(entity.fields, def.damagePath)) ?? 0);
  const remaining = Math.max(0, max - damage);
  return { max, damage, remaining, broken: max > 0 && remaining <= 0 };
}

/** Armor against a hit: the source's armor field when the type has one and the entity a value, else `armorPath`. */
export function armorFor(module: CombatModule, entity: EntityLike, source?: string): number {
  const def = combatHealthFor(module, entity);
  if (!def) return 0;
  const bySource = source ? def.armorBySource?.[source] : undefined;
  const sourced = bySource ? num(getPath(entity.fields, bySource)) : undefined;
  if (sourced !== undefined) return Math.max(0, sourced);
  return def.armorPath ? Math.max(0, num(getPath(entity.fields, def.armorPath)) ?? 0) : 0;
}

export interface HitOptions {
  rng: Rng;
  armorPiercing?: boolean;
  /** e.g. "fire" when armor differs by source, or the name of what hit. */
  source?: string;
  /** Successes beyond the first; the module's `resolveHit` decides whether they add damage. */
  extraSuccesses?: number;
  /** Aimed at a weak spot (passed to the module's hit rule). */
  weakSpot?: boolean;
  /** Raw damage: skip armor and the module's hit rule (a GM correction). */
  ignoreArmor?: boolean;
}

export interface ResolvedHit {
  result: HitResult;
  armor: number;
}

/**
 * What one hit of `amount` does to the entity, without writing anything: the
 * module's `resolveHit` with the entity's armor, else damage minus armor (not
 * below zero; armor piercing ignores armor; extra successes are not counted).
 */
export function resolveHitFor(module: CombatModule, entity: EntityLike, amount: number, opts: HitOptions): ResolvedHit {
  const m = gameModule(module);
  const damage = Math.max(0, Math.floor(amount));
  if (opts.ignoreArmor) return { armor: 0, result: { damage, explain: `${damage} damage, armor not applied` } };
  const armor = armorFor(m, entity, opts.source);
  const resolve = m.combat?.resolveHit;
  if (resolve) {
    const result = resolve(
      {
        damage,
        armor,
        ...(opts.armorPiercing ? { armorPiercing: true } : {}),
        ...(opts.weakSpot ? { weakSpot: true } : {}),
        ...(opts.extraSuccesses ? { extraSuccesses: Math.max(0, Math.floor(opts.extraSuccesses)) } : {}),
        ...(opts.source ? { source: opts.source } : {}),
      },
      opts.rng,
    );
    return { armor, result: { ...result, damage: Math.max(0, Math.floor(result.damage)) } };
  }
  const stops = opts.armorPiercing ? 0 : Math.min(armor, damage);
  const through = damage - stops;
  const explain = opts.armorPiercing ? `${damage} damage, armor piercing: armor ${armor} ignored` : armor > 0 ? `${damage} damage − armor ${armor} = ${through}` : `${damage} damage, no armor`;
  return { armor, result: { damage: through, explain } };
}

export type BrokenEntry = NonNullable<CombatHealthDef["broken"]>[number];

/** The broken table that applies to the entity: the first entry whose `when` matches (or has none). */
export function brokenEntryFor(module: CombatModule, entity: EntityLike): BrokenEntry | undefined {
  const m = gameModule(module);
  const def = combatHealthFor(m, entity);
  const data = { fields: entity.fields, computed: computedOf(m, entity), type: entity.type, subtype: entity.subtype ?? null };
  return def?.broken?.find((b) => {
    if (b.when === undefined) return true;
    try {
      return !!evaluateLogic(b.when, data);
    } catch {
      return false;
    }
  });
}

export interface DamageOutcome extends ResolvedHit {
  before: HealthState;
  after: HealthState;
  /** Health is at zero after the hit. */
  broken: boolean;
  /** This hit took health to zero. */
  newlyBroken: boolean;
  /** The broken table to roll: set when the hit did damage and left the entity broken. */
  brokenTable?: BrokenEntry;
}

function writeDamage(store: CampaignStore, entity: Entity, path: string, value: number): void {
  const fields = setPath(clone(entity.fields), path, value);
  store.update("entities", entity.id, { fields });
}

/**
 * Apply one hit: resolve it (module rule or damage minus armor), add what gets
 * through to the stored damage (capped at maximum health) and report whether
 * the entity is broken and which broken table applies.
 */
export function applyDamage(store: CampaignStore, module: CombatModule, entityId: Id, amount: number, opts: HitOptions): DamageOutcome {
  const entity = store.get("entities", entityId);
  if (!entity) throw new Error(`entities/${entityId} not found`);
  const def = combatHealthFor(module, entity);
  if (!def) throw new Error(`${entity.type} has no health def in the module's combat rules`);
  const before = healthState(module, entity)!;
  const hit = resolveHitFor(module, entity, amount, opts);
  const total = before.damage + hit.result.damage;
  const next = before.max > 0 ? Math.min(before.max, total) : total;
  if (next !== before.damage) writeDamage(store, entity, def.damagePath, next);
  const after = healthState(module, store.get("entities", entityId)!)!;
  const out: DamageOutcome = { ...hit, before, after, broken: after.broken, newlyBroken: after.broken && !before.broken };
  if (after.broken && hit.result.damage > 0) {
    const table = brokenEntryFor(module, entity);
    if (table) out.brokenTable = table;
  }
  return out;
}

/** Heal `amount` damage (never below zero). Returns the new health. */
export function healDamage(store: CampaignStore, module: CombatModule, entityId: Id, amount: number): HealthState {
  const entity = store.get("entities", entityId);
  if (!entity) throw new Error(`entities/${entityId} not found`);
  const def = combatHealthFor(module, entity);
  if (!def) throw new Error(`${entity.type} has no health def in the module's combat rules`);
  const before = healthState(module, entity)!;
  const next = Math.max(0, before.damage - Math.max(0, Math.floor(amount)));
  if (next !== before.damage) writeDamage(store, entity, def.damagePath, next);
  return healthState(module, store.get("entities", entityId)!)!;
}

// ---------------------------------------------------------------------------
// creature turns
// ---------------------------------------------------------------------------

/** How the entity's type acts at the table, if it takes creature turns. */
export function creatureTurnFor(module: CombatModule, entity: Pick<Entity, "type">): CreatureTurnDef | undefined {
  return gameModule(module).combat?.creatureTurns?.find((t) => t.entityType === entity.type);
}

/** Actions (or initiative draws) per round, from `speedPath`. */
export function creatureSpeed(module: CombatModule, entity: EntityLike): number | undefined {
  const turn = creatureTurnFor(module, entity);
  return turn?.speedPath ? num(getPath(entity.fields, turn.speedPath)) : undefined;
}

/** One row of a creature attack table, by the attack convention `{ name, dice, damage, armorPiercing?, effect }`. */
export interface CreatureAttack {
  name: string;
  /** Dice for the attack roll; 0 when the effect needs no roll. */
  dice: number;
  /** Base damage; a string when the module gives a conditional value. */
  damage: number | string;
  armorPiercing: boolean;
  effect: string;
  /** The row's range on the table, e.g. [3, 4]. */
  range?: [number, number];
}

/** Read a table row's result as an attack. */
export function attackFromResult(result: unknown, range?: [number, number]): CreatureAttack | undefined {
  if (!result || typeof result !== "object" || Array.isArray(result)) return undefined;
  const r = result as Record<string, unknown>;
  if (typeof r.name !== "string") return undefined;
  return {
    name: r.name,
    dice: num(r.dice) ?? 0,
    damage: typeof r.damage === "number" || typeof r.damage === "string" ? r.damage : 0,
    armorPiercing: r.armorPiercing === true,
    effect: typeof r.effect === "string" ? r.effect : "",
    ...(range ? { range } : {}),
  };
}

/** The attack's damage as a number (a conditional string gives its leading number, else 0). */
export function attackDamage(attack: Pick<CreatureAttack, "damage">): number {
  if (typeof attack.damage === "number") return Math.max(0, attack.damage);
  const n = Number.parseInt(attack.damage, 10);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/** The creature's attack table: the table whose id is in `attackTablePath`. */
export function creatureAttackTable(module: CombatModule, entity: EntityLike): RollTable | undefined {
  const turn = creatureTurnFor(module, entity);
  const id = turn ? getPath(entity.fields, turn.attackTablePath) : undefined;
  return typeof id === "string" ? gameModule(module).tables.find((t) => t.id === id) : undefined;
}

/** Every attack on the creature's table, in row order (for "choose an attack"). */
export function creatureAttacks(module: CombatModule, entity: EntityLike): CreatureAttack[] {
  return (creatureAttackTable(module, entity)?.rows ?? []).map((row) => attackFromResult(row.result, row.range)).filter((a): a is CreatureAttack => !!a);
}

export interface CreatureAttackRoll {
  table: RollTable;
  record: RollRecord;
  attack: CreatureAttack;
}

const registries = new WeakMap<GameModule, TableRegistry>();
function registryOf(m: GameModule): TableRegistry {
  let r = registries.get(m);
  if (!r) registries.set(m, (r = createTableRegistry(m.tables)));
  return r;
}

/** Roll the creature's attack table with `rng` (same seed, same attack). */
export function rollCreatureAttack(module: CombatModule, entity: EntityLike, rng: Rng): CreatureAttackRoll {
  const m = gameModule(module);
  const table = creatureAttackTable(m, entity);
  if (!table) throw new Error(`No attack table for ${entity.type}`);
  const record = rollTable(table, rng, registryOf(m), { step: table.id });
  const row = table.rows.find((r) => r.label === record.rowLabel && r.result === record.result) ?? table.rows.find((r) => record.total >= r.range[0] && record.total <= r.range[1]);
  const attack = attackFromResult(record.result, row?.range);
  if (!attack) throw new Error(`Table ${table.id} row "${record.rowLabel ?? record.total}" is not an attack`);
  return { table, record, attack };
}

export interface DamageReaction {
  reaction: DamageReactionDef;
  rating: number;
  /** Damage taken that counts toward the dice (capped by `damageTakenCapPath`). */
  counted: number;
  /** Dice to roll: the rating, plus the damage taken when the reaction adds it. */
  dice: number;
}

/**
 * The creature's reaction to taking `damageTaken` from `source` (e.g. a
 * splash): the dice to roll, or undefined when it has none, took no damage,
 * or the source is excepted.
 */
export function damageReaction(module: CombatModule, entity: EntityLike, damageTaken: number, source?: string): DamageReaction | undefined {
  const reaction = creatureTurnFor(module, entity)?.onDamaged;
  if (!reaction || !(damageTaken > 0)) return undefined;
  if (source && reaction.exceptSources?.some((s) => s.toLowerCase() === source.toLowerCase())) return undefined;
  const rating = num(getPath(entity.fields, reaction.ratingPath));
  if (rating === undefined) return undefined;
  let counted = reaction.addDamageTaken ? Math.floor(damageTaken) : 0;
  if (counted > 0 && reaction.damageTakenCapPath) {
    const m = gameModule(module);
    const cap = num(computedOf(m, entity)[reaction.damageTakenCapPath]) ?? num(getPath(entity.fields, reaction.damageTakenCapPath));
    if (cap !== undefined) counted = Math.min(counted, Math.max(0, cap));
  }
  return { reaction, rating, counted, dice: Math.max(0, rating + counted) };
}
