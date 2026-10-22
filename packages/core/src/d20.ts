/**
 * Declarative d20 combat applied to the campaign store, game-agnostic: the
 * module's `d20Combat` def says where each combatant keeps its hit points,
 * AC, saves, damage modifiers and attacks; this file reads them, keeps the
 * conditions on a creature (in `entity.conditions`, or in a sheet field the
 * condition is bound to, e.g. a valued condition the sheet tracks), writes
 * damage and healing (temporary hit points first, the module's rule at 0 hit
 * points and on recovering from it) and ticks condition durations at turn
 * boundaries. Rolls are made by the caller with a seeded Rng (rule 3).
 */
import {
  computeFields,
  d20ActiveConditions,
  d20Attacks,
  d20ArmorClass,
  d20Condition,
  d20CombatantFor,
  d20ConditionImmunities,
  d20DamageModifiers,
  d20HitPoints,
  d20HitPointWrites,
  d20RuleValue,
  d20SaveBonus,
  d20TakeDamage,
  d20ZeroHpRule,
  fieldSchemaAt,
  tickD20Conditions,
  type ActiveCondition,
  type AppliedCondition,
  type AppliedDuration,
  type D20Attack,
  type D20CombatantDef,
  type D20CombatDef,
  type D20DamageModifier,
  type D20HitPoints,
  type D20ZeroHpRule,
  type EntityTypeDef,
  type GameModule,
} from "@campaign-forge/module-sdk";
import { now } from "./ids";
import { clone, getPath, setPath } from "./paths";
import type { CampaignStore } from "./store";
import type { Entity, EntityCondition, Id } from "./types";

/** A game module, or a loaded one (anything with `.module`). */
type D20Module = GameModule | { module: GameModule };
type EntityLike = Pick<Entity, "type" | "fields"> & { conditions?: Entity["conditions"] };

function gameModule(m: D20Module): GameModule {
  return Array.isArray((m as GameModule).entityTypes) ? (m as GameModule) : (m as { module: GameModule }).module;
}

/** The module's declarative d20 combat, if it has one. */
export function d20CombatOf(module: D20Module): D20CombatDef | undefined {
  return gameModule(module).d20Combat;
}

function typeOf(m: GameModule, type: string): EntityTypeDef | undefined {
  return m.entityTypes.find((t) => t.id === type);
}

function computedFor(m: GameModule, entity: EntityLike): Record<string, unknown> {
  const def = typeOf(m, entity.type);
  if (!def?.computed) return {};
  try {
    return computeFields(def, entity.fields);
  } catch {
    return {};
  }
}

/** Everything the combat panel shows about one combatant, read from its fields. */
export interface D20CombatantView {
  def: D20CombatantDef;
  computed: Record<string, unknown>;
  hp: D20HitPoints;
  ac: number;
  saves: Record<string, number>;
  damageModifiers: D20DamageModifier[];
  conditionImmunities: string[];
  attacks: D20Attack[];
  conditions: ActiveCondition[];
  /** At 0 hit points under a rule that takes it out of the fight. */
  defeated: boolean;
}

/** The entity as a combatant, when the module's d20 combat covers its type. */
export function d20Combatant(module: D20Module, entity: EntityLike): D20CombatantView | undefined {
  const m = gameModule(module);
  const def = m.d20Combat;
  const cb = d20CombatantFor(def, entity.type);
  if (!def || !cb) return undefined;
  const computed = computedFor(m, entity);
  const data = { fields: entity.fields, computed };
  const hp = d20HitPoints(cb, data);
  const saves: Record<string, number> = {};
  for (const s of def.saves) if (cb.saves?.[s.id] !== undefined) saves[s.id] = d20SaveBonus(cb, data, s.id);
  const conditions = d20ActiveConditions(def, d20Records(m, entity));
  const kind = typeOf(m, entity.type)?.kind;
  const rule = hp.max > 0 && hp.current <= 0 ? d20ZeroHpRule(def, { type: entity.type, fields: entity.fields, computed, ...(kind ? { kind } : {}) }) : undefined;
  return {
    def: cb,
    computed,
    hp,
    ac: d20ArmorClass(cb, data),
    saves,
    damageModifiers: d20DamageModifiers(cb, data),
    conditionImmunities: d20ConditionImmunities(def, cb, data),
    attacks: d20Attacks(def, cb, data),
    conditions,
    defeated: !!rule?.defeated,
  };
}

// ---------------------------------------------------------------------------
// conditions on an entity
// ---------------------------------------------------------------------------

/** Whether the entity's type has the sheet field a condition is bound to. */
function boundField(m: GameModule, type: string, field: string | undefined): "number" | "boolean" | undefined {
  if (!field) return undefined;
  const def = typeOf(m, type);
  const schema = def ? fieldSchemaAt(def, field) : undefined;
  if (!schema) return undefined;
  return schema.type === "boolean" ? "boolean" : "number";
}

function toApplied(c: EntityCondition): AppliedCondition {
  const out: AppliedCondition = { id: c.id, label: c.label };
  if (c.value !== undefined) out.value = c.value;
  if (c.source !== undefined) out.source = c.source;
  if (c.sourceId !== undefined) out.sourceId = c.sourceId;
  if (c.duration !== undefined) out.duration = c.duration;
  if (c.note !== undefined) out.note = c.note;
  return out;
}

/**
 * The conditions applied to an entity: its condition records, with the value
 * of every condition bound to a sheet field the type has taken from that
 * field (a bound condition whose field is 0 is not applied).
 */
export function d20Records(module: D20Module, entity: EntityLike): AppliedCondition[] {
  const m = gameModule(module);
  const def = m.d20Combat;
  const records = (entity.conditions ?? []).map(toApplied);
  if (!def) return records;
  const out: AppliedCondition[] = [];
  const bound = new Map<string, number>();
  for (const cd of def.conditions) {
    const kind = boundField(m, entity.type, cd.field);
    if (!kind) continue;
    const v = getPath(entity.fields, cd.field!);
    const n = typeof v === "number" ? v : v === true ? 1 : 0;
    bound.set(cd.id, n);
  }
  for (const r of records) {
    if (!bound.has(r.id)) {
      out.push(r);
      continue;
    }
    const n = bound.get(r.id)!;
    if (n > 0) out.push({ ...r, ...(d20Condition(def, r.id)?.valued ? { value: n } : {}) });
  }
  for (const [id, n] of bound) {
    if (n <= 0 || out.some((r) => r.id === id)) continue;
    const cd = d20Condition(def, id)!;
    out.push({ id, label: cd.name, ...(cd.valued ? { value: n } : {}) });
  }
  return out;
}

/** The conditions in effect on an entity (applied and implied). */
export function d20ConditionsOf(module: D20Module, entity: EntityLike): ActiveCondition[] {
  const def = d20CombatOf(module);
  return def ? d20ActiveConditions(def, d20Records(module, entity)) : [];
}

/** Write applied conditions back: bound values to their sheet fields, the rest (and any duration or source) to `entity.conditions`. */
function writeRecords(store: CampaignStore, m: GameModule, entity: Entity, records: AppliedCondition[]): Entity {
  const def = m.d20Combat;
  let fields = entity.fields;
  const keep: EntityCondition[] = [];
  const previous = new Map((entity.conditions ?? []).map((c) => [c.id, c]));
  for (const cd of def?.conditions ?? []) {
    const kind = boundField(m, entity.type, cd.field);
    if (!kind) continue;
    const r = records.find((x) => x.id === cd.id);
    const value = r ? (kind === "boolean" ? true : Math.max(1, Math.floor(r.value ?? 1))) : kind === "boolean" ? false : 0;
    if (getPath(fields, cd.field!) !== value) fields = setPath(fields === entity.fields ? clone(fields) : fields, cd.field!, value);
  }
  for (const r of records) {
    const cd = def ? d20Condition(def, r.id) : undefined;
    const isBound = !!cd && !!boundField(m, entity.type, cd.field);
    if (isBound && !r.duration && !r.source && !r.note) continue;
    const prev = previous.get(r.id);
    const rec: EntityCondition = { id: r.id, label: cd?.name ?? r.label ?? r.id, since: prev?.since ?? now() };
    if (r.value !== undefined && cd?.valued) rec.value = r.value;
    if (r.source !== undefined) rec.source = r.source;
    if (r.sourceId !== undefined) rec.sourceId = r.sourceId;
    if (r.duration !== undefined) rec.duration = r.duration;
    if (r.note !== undefined) rec.note = r.note;
    if (prev?.page !== undefined) rec.page = prev.page;
    keep.push(rec);
  }
  const patch: Partial<Entity> = { conditions: keep };
  if (fields !== entity.fields) patch.fields = fields;
  return store.update("entities", entity.id, patch);
}

export interface ConditionChange {
  /** The condition was added or changed. */
  applied: boolean;
  /** The creature is immune to it (nothing was written). */
  immune?: boolean;
  record?: AppliedCondition;
}

/**
 * Apply a condition. A valued condition the creature already has keeps the
 * higher value (pass `replace` to set it); a new duration replaces the old
 * one. Values are kept within 1..max. Immune creatures are left alone unless
 * `force` is set.
 */
export function addD20Condition(
  store: CampaignStore,
  module: D20Module,
  entityId: Id,
  input: { id: string; value?: number; duration?: AppliedDuration; source?: string; sourceId?: Id; note?: string; replace?: boolean; force?: boolean },
): ConditionChange {
  const m = gameModule(module);
  const def = m.d20Combat;
  return store.transact(() => {
    const entity = store.get("entities", entityId);
    if (!entity) throw new Error(`entities/${entityId} not found`);
    const cd = def ? d20Condition(def, input.id) : undefined;
    const cb = d20CombatantFor(def, entity.type);
    if (def && cb && !input.force) {
      const immune = d20ConditionImmunities(def, cb, { fields: entity.fields, computed: computedFor(m, entity) });
      if (immune.includes(input.id)) return { applied: false, immune: true };
    }
    const records = d20Records(m, entity);
    const existing = records.find((r) => r.id === input.id);
    const clamp = (v: number) => Math.max(1, Math.min(cd?.max ?? 99, Math.floor(v)));
    const value = cd?.valued ? clamp(input.replace || !existing ? (input.value ?? 1) : Math.max(existing.value ?? 1, input.value ?? 1)) : undefined;
    const next: AppliedCondition = { ...(existing ?? {}), id: input.id, label: cd?.name ?? input.id };
    if (value !== undefined) next.value = value;
    if (input.duration) next.duration = input.duration;
    else if (input.replace) delete next.duration;
    if (input.source !== undefined) next.source = input.source;
    if (input.sourceId !== undefined) next.sourceId = input.sourceId;
    if (input.note !== undefined) next.note = input.note;
    writeRecords(store, m, entity, existing ? records.map((r) => (r.id === input.id ? next : r)) : [...records, next]);
    return { applied: true, record: next };
  });
}

/** Remove a condition (and its bound sheet value). */
export function removeD20Condition(store: CampaignStore, module: D20Module, entityId: Id, conditionId: string): boolean {
  const m = gameModule(module);
  return store.transact(() => {
    const entity = store.get("entities", entityId);
    if (!entity) throw new Error(`entities/${entityId} not found`);
    const records = d20Records(m, entity);
    if (!records.some((r) => r.id === conditionId)) return false;
    writeRecords(store, m, entity, records.filter((r) => r.id !== conditionId));
    return true;
  });
}

/** Set a valued condition's value exactly (keeping its duration and source); 0 removes it. */
export function setD20ConditionValue(store: CampaignStore, module: D20Module, entityId: Id, conditionId: string, value: number): void {
  if (value <= 0) {
    removeD20Condition(store, module, entityId, conditionId);
    return;
  }
  addD20Condition(store, module, entityId, { id: conditionId, value, replace: true, force: true, ...keepDuration(store, module, entityId, conditionId) });
}

function keepDuration(store: CampaignStore, module: D20Module, entityId: Id, id: string): { duration?: AppliedDuration } {
  const e = store.get("entities", entityId);
  const r = e ? d20Records(module, e).find((x) => x.id === id) : undefined;
  return r?.duration ? { duration: r.duration } : {};
}

// ---------------------------------------------------------------------------
// hit points
// ---------------------------------------------------------------------------

export interface D20DamageOutcome {
  before: D20HitPoints;
  after: D20HitPoints;
  /** Damage the temporary hit points took. */
  fromTemp: number;
  /** This damage took the creature to 0 hit points. */
  dropped: boolean;
  /** It was already at 0 hit points (the module's rule text says what that means). */
  alreadyDown: boolean;
  /** The 0 hit point rule that applied, when it dropped (or was already down). */
  rule?: D20ZeroHpRule;
  /** Conditions the rule applied, as labels. */
  conditionsAdded: string[];
  defeated: boolean;
}

function writeFields(store: CampaignStore, entity: Entity, writes: Record<string, unknown>): Entity {
  let fields = entity.fields;
  for (const [path, value] of Object.entries(writes)) if (getPath(fields, path) !== value) fields = setPath(fields === entity.fields ? clone(fields) : fields, path, value);
  return fields === entity.fields ? entity : store.update("entities", entity.id, { fields });
}

function conditionValues(module: D20Module, entity: EntityLike): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of d20Records(module, entity)) out[r.id] = r.value ?? 1;
  return out;
}

function ruleFor(m: GameModule, entity: Entity): D20ZeroHpRule | undefined {
  const def = m.d20Combat;
  if (!def) return undefined;
  const kind = typeOf(m, entity.type)?.kind;
  return d20ZeroHpRule(def, { type: entity.type, fields: entity.fields, computed: computedFor(m, entity), ...(kind ? { kind } : {}) });
}

/**
 * Take `amount` damage (after modifiers): temporary hit points first, then
 * hit points, never below 0. Dropping to 0 applies the module's 0 hit point
 * rule (its conditions; `critical` is passed to their values).
 */
export function applyD20Damage(store: CampaignStore, module: D20Module, entityId: Id, amount: number, opts: { critical?: boolean } = {}): D20DamageOutcome {
  const m = gameModule(module);
  return store.transact(() => {
    let entity = store.get("entities", entityId);
    if (!entity) throw new Error(`entities/${entityId} not found`);
    const cb = d20CombatantFor(m.d20Combat, entity.type);
    if (!cb) throw new Error(`${entity.type} is not a combatant in the module's d20 combat`);
    const before = d20HitPoints(cb, { fields: entity.fields, computed: computedFor(m, entity) });
    const hit = d20TakeDamage(before, amount);
    const after: D20HitPoints = { current: hit.current, max: hit.max, temp: hit.temp };
    entity = writeFields(store, entity, d20HitPointWrites(cb, after));
    const dropped = before.current > 0 && after.current <= 0 && after.max > 0;
    const alreadyDown = before.current <= 0 && amount > 0 && after.max > 0;
    const out: D20DamageOutcome = { before, after, fromTemp: hit.fromTemp, dropped, alreadyDown, conditionsAdded: [], defeated: false };
    if (dropped || alreadyDown) {
      const rule = ruleFor(m, entity);
      if (rule) {
        out.rule = rule;
        out.defeated = !!rule.defeated;
        if (dropped) {
          const values = conditionValues(m, entity);
          for (const c of rule.conditions ?? []) {
            const value = d20RuleValue(c.value, { critical: !!opts.critical, conditions: values, fields: entity.fields, computed: computedFor(m, entity) });
            const res = addD20Condition(store, m, entityId, { id: c.id, ...(value !== undefined ? { value, replace: true } : {}), source: "0 hit points", force: true });
            if (res.applied) out.conditionsAdded.push(d20Condition(m.d20Combat, c.id)?.name ?? c.id);
          }
        }
      }
    }
    return out;
  });
}

export interface D20HealOutcome {
  before: D20HitPoints;
  after: D20HitPoints;
  /** Healing brought it back from 0 hit points (the rule's `recover` applied). */
  recovered: boolean;
  removed: string[];
  added: string[];
}

/** Regain `amount` hit points (up to the maximum); coming back from 0 applies the rule's `recover`. */
export function healD20(store: CampaignStore, module: D20Module, entityId: Id, amount: number): D20HealOutcome {
  const m = gameModule(module);
  return store.transact(() => {
    let entity = store.get("entities", entityId);
    if (!entity) throw new Error(`entities/${entityId} not found`);
    const cb = d20CombatantFor(m.d20Combat, entity.type);
    if (!cb) throw new Error(`${entity.type} is not a combatant in the module's d20 combat`);
    const before = d20HitPoints(cb, { fields: entity.fields, computed: computedFor(m, entity) });
    const after: D20HitPoints = { ...before, current: Math.min(before.max, before.current + Math.max(0, Math.floor(amount))) };
    const rule = before.current <= 0 && after.current > 0 ? ruleFor(m, entity) : undefined;
    entity = writeFields(store, entity, d20HitPointWrites(cb, after));
    const out: D20HealOutcome = { before, after, recovered: false, removed: [], added: [] };
    if (rule?.recover) {
      out.recovered = true;
      const values = conditionValues(m, entity);
      for (const id of rule.recover.remove ?? []) if (removeD20Condition(store, m, entityId, id)) out.removed.push(d20Condition(m.d20Combat, id)?.name ?? id);
      for (const c of rule.recover.conditions ?? []) {
        const value = d20RuleValue(c.value, { critical: false, conditions: values, fields: entity.fields, computed: computedFor(m, entity) });
        const res = addD20Condition(store, m, entityId, { id: c.id, ...(value !== undefined ? { value, replace: true } : {}), source: "recovered from 0 hit points", force: true });
        if (res.applied) out.added.push(d20Condition(m.d20Combat, c.id)?.name ?? c.id);
      }
      if (rule.recover.setFields) writeFields(store, store.get("entities", entityId)!, rule.recover.setFields);
    }
    return out;
  });
}

/** Set temporary hit points (they do not stack: the GM sets the new total). */
export function setD20TempHp(store: CampaignStore, module: D20Module, entityId: Id, temp: number): D20HitPoints {
  const m = gameModule(module);
  const entity = store.get("entities", entityId);
  if (!entity) throw new Error(`entities/${entityId} not found`);
  const cb = d20CombatantFor(m.d20Combat, entity.type);
  if (!cb?.hp.temp) throw new Error(`${entity.type} has no temporary hit points`);
  const hp = { ...d20HitPoints(cb, { fields: entity.fields, computed: computedFor(m, entity) }), temp: Math.max(0, Math.floor(temp)) };
  writeFields(store, entity, { [cb.hp.temp]: hp.temp });
  return hp;
}

// ---------------------------------------------------------------------------
// turns
// ---------------------------------------------------------------------------

export interface D20TurnTick {
  expired: Array<{ entity: Id; id: string; label: string }>;
  decremented: Array<{ entity: Id; id: string; label: string; from: number; to: number }>;
  savesDue: Array<{ entity: Id; id: string; label: string; save: string; dc: number }>;
}

/**
 * Tick the conditions of `entityIds` at the start or end of `event.entity`'s
 * turn (durations counted on that creature, its own end-of-turn decrements
 * and save-ends prompts) and write the changes.
 */
export function tickD20Turn(store: CampaignStore, module: D20Module, entityIds: readonly Id[], event: { entity: Id; at: "start" | "end" }): D20TurnTick {
  const m = gameModule(module);
  const def = m.d20Combat;
  const out: D20TurnTick = { expired: [], decremented: [], savesDue: [] };
  if (!def) return out;
  store.transact(() => {
    for (const id of new Set(entityIds)) {
      const entity = store.get("entities", id);
      if (!entity || !d20CombatantFor(def, entity.type)) continue;
      const records = d20Records(m, entity);
      if (!records.length) continue;
      const res = tickD20Conditions(def, id, records, event);
      const name = (cid: string) => d20Condition(def, cid)?.name ?? cid;
      for (const r of res.expired) out.expired.push({ entity: id, id: r.id, label: name(r.id) });
      for (const d of res.decremented) out.decremented.push({ entity: id, id: d.id, label: name(d.id), from: d.from, to: d.to });
      for (const s of res.savesDue) out.savesDue.push({ entity: id, id: s.id, label: name(s.id), save: s.save, dc: s.dc });
      if (res.expired.length || res.decremented.length || JSON.stringify(res.records) !== JSON.stringify(records)) writeRecords(store, m, entity, res.records);
    }
  });
  return out;
}
