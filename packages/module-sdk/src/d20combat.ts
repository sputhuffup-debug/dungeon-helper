/**
 * Declarative d20 combat (`GameModule.d20Combat`), game-agnostic: reading a
 * combatant's AC, hit points, saves, damage modifiers and attacks from its
 * fields; condition effects on rolls (modifiers with bonus-type stacking,
 * advantage and disadvantage, automatic failure, attacks against the
 * creature); resolving an attack roll or a save from a d20 engine result;
 * rolling damage (critical hits double the dice or the total); applying
 * immunities, resistances, vulnerabilities and weaknesses; ticking condition
 * durations at turn boundaries; and the module's rule for 0 hit points.
 *
 * Everything here is pure: rolls take the Rng they are given (rule 3) and
 * every rule is JSONLogic (rule 5). The core applies the results to the
 * campaign store; the app shows them.
 */
import { isDiceExpression, parseDiceExpression, rollDice } from "./dice";
import { evaluateLogic, getPath, logicIssues } from "./logic";
import type {
  D20Attack,
  D20AttackKind,
  D20AttackSource,
  D20CombatantDef,
  D20CombatDef,
  D20ConditionApply,
  D20ConditionDef,
  D20DamageModifier,
  D20DamageModifierKind,
  D20DamagePart,
  D20DurationSpec,
  D20EffectTarget,
  D20Restriction,
  D20SaveEffect,
  D20ZeroHpRule,
  JsonLogicRule,
  Rng,
  RollResult,
} from "./types";

const ATTACK_KINDS: readonly D20AttackKind[] = ["melee", "ranged", "spell"];

/** Data an entity contributes to combat rules: its fields and computed values. */
export interface CombatantData {
  fields: Record<string, unknown>;
  computed?: Record<string, unknown>;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** A number from a JSONLogic rule (or a literal), or undefined when it does not evaluate to one. */
export function d20Number(rule: JsonLogicRule | undefined, data: unknown): number | undefined {
  if (rule === undefined) return undefined;
  try {
    const v = evaluateLogic(rule, data);
    const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
    return Number.isFinite(n) ? n : undefined;
  } catch {
    return undefined;
  }
}

const dataOf = (c: CombatantData) => ({ fields: c.fields, computed: c.computed ?? {} });

// ---------------------------------------------------------------------------
// combatants
// ---------------------------------------------------------------------------

/** The combatant def that reads entities of `type`, if any. */
export function d20CombatantFor(def: D20CombatDef | undefined, type: string): D20CombatantDef | undefined {
  return def?.combatants.find((c) => c.entityTypes.includes(type));
}

export interface D20HitPoints {
  current: number;
  max: number;
  temp: number;
}

/** Hit points: current (stored, or max − damage taken), maximum and temporary. */
export function d20HitPoints(combatant: D20CombatantDef, c: CombatantData): D20HitPoints {
  const data = dataOf(c);
  const max = Math.max(0, Math.floor(d20Number(combatant.hp.max, data) ?? 0));
  const temp = combatant.hp.temp ? Math.max(0, Math.floor(numberAt(c.fields, combatant.hp.temp) ?? 0)) : 0;
  let current: number;
  if (combatant.hp.current) current = Math.floor(numberAt(c.fields, combatant.hp.current) ?? max);
  else current = max - Math.floor(numberAt(c.fields, combatant.hp.damage ?? "") ?? 0);
  return { current: Math.max(0, current), max, temp };
}

function numberAt(fields: Record<string, unknown>, path: string): number | undefined {
  if (!path) return undefined;
  const v = getPath(fields, path);
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** The fields to write for new hit points (current, or damage taken) and temporary hit points. */
export function d20HitPointWrites(combatant: D20CombatantDef, hp: D20HitPoints): Record<string, number> {
  const out: Record<string, number> = {};
  if (combatant.hp.current) out[combatant.hp.current] = Math.max(0, Math.floor(hp.current));
  else if (combatant.hp.damage) out[combatant.hp.damage] = Math.max(0, Math.floor(hp.max - hp.current));
  if (combatant.hp.temp) out[combatant.hp.temp] = Math.max(0, Math.floor(hp.temp));
  return out;
}

/** Armor Class. */
export function d20ArmorClass(combatant: D20CombatantDef, c: CombatantData): number {
  return Math.floor(d20Number(combatant.ac, dataOf(c)) ?? 10);
}

/** Save bonus for a save id (0 when the combatant has none). */
export function d20SaveBonus(combatant: D20CombatantDef, c: CombatantData, save: string): number {
  const rule = combatant.saves?.[save];
  return Math.floor(d20Number(rule, dataOf(c)) ?? 0);
}

/** The combatant's damage modifiers (entries that are not well-formed are skipped). */
export function d20DamageModifiers(combatant: D20CombatantDef, c: CombatantData): D20DamageModifier[] {
  if (!combatant.damageModifiers) return [];
  const raw = getPath(c.fields, combatant.damageModifiers);
  if (!Array.isArray(raw)) return [];
  const kinds: D20DamageModifierKind[] = ["immunity", "resistance", "vulnerability", "weakness"];
  return raw.filter(isRecord).flatMap((m): D20DamageModifier[] => {
    if (!kinds.includes(m.kind as D20DamageModifierKind) || typeof m.type !== "string" || !m.type) return [];
    const out: D20DamageModifier = { kind: m.kind as D20DamageModifierKind, type: m.type.toLowerCase() };
    if (typeof m.value === "number" && Number.isFinite(m.value)) out.value = m.value;
    if (Array.isArray(m.except)) out.except = m.except.filter((x): x is string => typeof x === "string").map((x) => x.toLowerCase());
    if (typeof m.note === "string" && m.note) out.note = m.note;
    return [out];
  });
}

/** Condition ids the combatant is immune to (names are matched to ids, case-insensitively). */
export function d20ConditionImmunities(def: D20CombatDef, combatant: D20CombatantDef, c: CombatantData): string[] {
  if (!combatant.conditionImmunities) return [];
  const raw = getPath(c.fields, combatant.conditionImmunities);
  const list = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
  return list.map((x) => {
    const low = x.toLowerCase();
    return def.conditions.find((cd) => cd.id === low || cd.name.toLowerCase() === low)?.id ?? low;
  });
}

// ---------------------------------------------------------------------------
// damage text and attacks
// ---------------------------------------------------------------------------

/** A damage type id from an id or a name (case-insensitive), if the module knows it. */
export function d20DamageType(def: D20CombatDef, word: string): string | undefined {
  const low = word.trim().toLowerCase();
  return def.damageTypes.find((t) => t.id === low || t.name.toLowerCase() === low)?.id;
}

/** Display name of a damage type or group id. */
export function d20DamageTypeName(def: D20CombatDef, id: string | undefined): string {
  if (!id) return "untyped";
  return def.damageTypes.find((t) => t.id === id)?.name.toLowerCase() ?? id;
}

/**
 * Read damage text such as "1d8 + 3 slashing", "2d10+8 piercing plus 2d6
 * fire", "1d6 persistent bleed" or "2d8+4 piercing plus Grab" as parts. A
 * segment that does not start with dice goes to `note`. `fallbackType`
 * types parts the text leaves untyped.
 */
export function parseD20Damage(def: D20CombatDef, text: string, fallbackType?: string): { parts: D20DamagePart[]; note?: string } {
  const parts: D20DamagePart[] = [];
  const notes: string[] = [];
  const clean = text.replace(/[−–]/g, "-").replace(/\s+/g, " ").trim();
  if (!clean) return { parts };
  for (const raw of clean.split(/\s*(?:,|;|\bplus\b|\band\b)\s*/i)) {
    const seg = raw.trim();
    if (!seg) continue;
    const m = /^(\d*d\d+(?:\s*[+-]\s*\d+(?!\s*d))*|\d+)\b\s*(.*)$/i.exec(seg);
    const dice = m?.[1]?.replace(/\s+/g, "");
    if (!m || !dice || !(isDiceExpression(dice) || /^\d+$/.test(dice))) {
      notes.push(seg);
      continue;
    }
    let rest = (m[2] ?? "").toLowerCase().replace(/\bdamage\b/g, "").trim();
    const persistent = /\bpersistent\b/.test(rest);
    rest = rest.replace(/\bpersistent\b/g, "").trim();
    let type: string | undefined;
    if (rest) {
      type = d20DamageType(def, rest);
      if (!type) {
        // the first word that is a type ("fire (in a 20-foot burst)")
        for (const w of rest.split(/[^a-z-]+/)) {
          type = w ? d20DamageType(def, w) : undefined;
          if (type) break;
        }
        if (!type) notes.push(seg);
      }
    }
    if (!type && fallbackType) type = d20DamageType(def, fallbackType) ?? undefined;
    parts.push({ dice, ...(type ? { type } : {}), ...(persistent ? { persistent: true } : {}) });
  }
  return { parts, ...(notes.length ? { note: notes.join("; ") } : {}) };
}

/** Damage parts written as text: "1d8+3 slashing plus 2d6 fire". */
export function d20DamageText(def: D20CombatDef, parts: D20DamagePart[]): string {
  return parts.map((p) => [p.dice, p.persistent ? "persistent" : "", p.type ? d20DamageTypeName(def, p.type) : ""].filter(Boolean).join(" ")).join(" plus ");
}

/** An attack bonus from a number, text ("+5", "+7 [+3/−1]": the first number) or JSONLogic over `{ fields, computed, item }`. */
export function parseD20Bonus(v: unknown, data: Record<string, unknown>): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? Math.floor(v) : undefined;
  if (typeof v === "string") {
    const m = /^\s*([+\-−–]?)\s*(\d+)/.exec(v);
    if (!m) return undefined;
    const n = Number(m[2]);
    return m[1] && m[1] !== "+" ? -n : n;
  }
  if (isRecord(v)) {
    const n = d20Number(v as JsonLogicRule, data);
    return n === undefined ? undefined : Math.floor(n);
  }
  return undefined;
}

function damageParts(def: D20CombatDef, v: unknown, fallbackType?: string): { parts: D20DamagePart[]; note?: string } {
  if (typeof v === "string") return parseD20Damage(def, v, fallbackType);
  if (!Array.isArray(v)) return { parts: [] };
  const parts: D20DamagePart[] = [];
  for (const p of v) {
    if (!isRecord(p)) continue;
    const dice = typeof p.dice === "string" ? p.dice.replace(/\s+/g, "") : typeof p.dice === "number" ? String(p.dice) : "";
    if (!dice || !(isDiceExpression(dice) || /^\d+$/.test(dice))) continue;
    const type = typeof p.type === "string" ? (d20DamageType(def, p.type) ?? p.type.toLowerCase()) : fallbackType ? d20DamageType(def, fallbackType) : undefined;
    parts.push({ dice, ...(type ? { type } : {}), ...(p.persistent === true ? { persistent: true } : {}) });
  }
  return { parts };
}

function conditionApplies(v: unknown): D20ConditionApply[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter(isRecord).flatMap((c): D20ConditionApply[] => {
    if (typeof c.id !== "string" || !c.id) return [];
    const a: D20ConditionApply = { id: c.id };
    if (typeof c.value === "number") a.value = c.value;
    if (isRecord(c.duration)) a.duration = c.duration as D20DurationSpec;
    return [a];
  });
  return out.length ? out : undefined;
}

function saveEffect(def: D20CombatDef, v: unknown): D20SaveEffect | undefined {
  if (!isRecord(v) || typeof v.save !== "string" || v.dc === undefined) return undefined;
  const out: D20SaveEffect = { dc: v.dc as number | JsonLogicRule, save: v.save };
  const dmg = damageParts(def, v.damage);
  if (dmg.parts.length) out.damage = dmg.parts;
  if (v.half === true) out.half = true;
  const conditions = conditionApplies(v.conditions);
  if (conditions) out.conditions = conditions;
  const crit = conditionApplies(v.criticalConditions);
  if (crit) out.criticalConditions = crit;
  if (typeof v.text === "string" && v.text) out.text = v.text;
  return out;
}

const keyOf = (source: D20AttackSource, k: keyof NonNullable<D20AttackSource["keys"]>): string => source.keys?.[k] ?? k;

/** One list item read as an attack (undefined when it has no name). */
export function readD20Attack(def: D20CombatDef, source: D20AttackSource, item: unknown, index: number, c: CombatantData): D20Attack | undefined {
  if (!isRecord(item)) return undefined;
  const at = (k: keyof NonNullable<D20AttackSource["keys"]>) => item[keyOf(source, k)];
  const name = at("name");
  if (typeof name !== "string" || !name.trim()) return undefined;
  const kindRaw = at("kind");
  const kind: D20AttackKind = typeof kindRaw === "string" && (ATTACK_KINDS as readonly string[]).includes(kindRaw.toLowerCase()) ? (kindRaw.toLowerCase() as D20AttackKind) : (source.kind ?? "melee");
  const fallbackType = typeof at("damageType") === "string" ? (at("damageType") as string) : undefined;
  const dmg = damageParts(def, at("damage"), fallbackType);
  const traitsRaw = at("traits");
  const traits = (Array.isArray(traitsRaw) ? traitsRaw.filter((t): t is string => typeof t === "string") : typeof traitsRaw === "string" ? traitsRaw.split(",") : [])
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const attack: D20Attack = { name: name.trim(), kind, damage: dmg.parts, traits, source: { path: source.path, index } };
  const bonus = parseD20Bonus(at("bonus"), { ...dataOf(c), item });
  if (bonus !== undefined) attack.bonus = bonus;
  if (dmg.note) attack.damageNote = dmg.note;
  const str = (k: keyof NonNullable<D20AttackSource["keys"]>) => {
    const v = at(k);
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };
  const reach = str("reach");
  if (reach) attack.reach = reach;
  const range = str("range");
  if (range) attack.range = range;
  const effect = str("effect");
  if (effect) attack.effect = effect;
  const ability = str("ability");
  if (ability) attack.ability = ability;
  const save = saveEffect(def, at("save"));
  if (save) attack.save = save;
  // A sheet row whose "bonus" is a save DC ("DC 13 Dex") is a save effect with the row's damage.
  const bonusText = at("bonus");
  const dcText = typeof bonusText === "string" ? /^\s*DC\s*(\d+)\s+([A-Za-z]+)/i.exec(bonusText) : null;
  if (!attack.save && dcText) {
    const word = dcText[2]!.toLowerCase();
    const s = def.saves.find((x) => x.id.toLowerCase().startsWith(word) || x.name.toLowerCase().startsWith(word) || (x.ability ?? "").toLowerCase().startsWith(word));
    if (s) {
      attack.save = { dc: Number(dcText[1]), save: s.id, ...(attack.damage.length ? { damage: attack.damage } : {}) };
      attack.damage = [];
    }
  }
  const onHit = conditionApplies(at("onHit"));
  if (onHit) attack.onHit = onHit;
  return attack;
}

/** Every attack an entity has, from each of its combatant's attack sources in order. */
export function d20Attacks(def: D20CombatDef, combatant: D20CombatantDef, c: CombatantData): D20Attack[] {
  const out: D20Attack[] = [];
  for (const source of combatant.attacks ?? []) {
    const list = getPath(c.fields, source.path);
    if (!Array.isArray(list)) continue;
    list.forEach((item, i) => {
      const a = readD20Attack(def, source, item, i, c);
      if (a) out.push(a);
    });
  }
  return out;
}

/** The DC of a save effect, from a number or JSONLogic over the attacker's `{ fields, computed }`. */
export function d20SaveDc(effect: D20SaveEffect, attacker?: CombatantData): number | undefined {
  const n = d20Number(effect.dc, attacker ? dataOf(attacker) : { fields: {}, computed: {} });
  return n === undefined ? undefined : Math.floor(n);
}

/** The ability an attack is based on: its own, else the module's default for its kind. */
export function d20AttackAbility(def: D20CombatDef, attack: Pick<D20Attack, "kind" | "ability">): string | undefined {
  return attack.ability ?? def.attackAbilities?.[attack.kind];
}

// ---------------------------------------------------------------------------
// conditions on a creature
// ---------------------------------------------------------------------------

/** When a condition on a creature ends: after turns of someone, by a save, or by hand. */
export interface AppliedDuration {
  /** Turn ends (or starts) of `turnOf` left; at 0 the condition ends. */
  turns?: number;
  /** Entity id whose turns count. */
  turnOf?: string;
  /** Which edge of that creature's turn counts (default "end"). */
  at?: "start" | "end";
  /** A save at the end of each of the affected creature's turns ends it. */
  save?: { save: string; dc: number };
}

/** A condition as it is stored on a creature (the core keeps these on the entity). */
export interface AppliedCondition {
  id: string;
  label?: string;
  value?: number;
  /** Who or what applied it, in words. */
  source?: string;
  /** The entity that applied it, when one did. */
  sourceId?: string;
  duration?: AppliedDuration;
  /** A detail the GM keeps with it (e.g. "1d6 fire" for persistent damage). */
  note?: string;
}

/** A condition in effect: applied, or implied by another one. */
export interface ActiveCondition {
  id: string;
  name: string;
  def?: D20ConditionDef;
  value?: number;
  record?: AppliedCondition;
  /** Names of the conditions that bring this one with them. */
  impliedBy?: string[];
}

/** A condition's def by id. */
export function d20Condition(def: D20CombatDef | undefined, id: string): D20ConditionDef | undefined {
  return def?.conditions.find((c) => c.id === id);
}

/** "Frightened 2", "Prone". */
export function d20ConditionLabel(c: Pick<ActiveCondition, "name" | "value">): string {
  return c.value !== undefined && c.value !== null ? `${c.name} ${c.value}` : c.name;
}

/** The conditions in effect: every applied one, plus the ones they imply (transitively, once each). */
export function d20ActiveConditions(def: D20CombatDef, records: readonly AppliedCondition[]): ActiveCondition[] {
  const out: ActiveCondition[] = [];
  const byId = new Map<string, ActiveCondition>();
  for (const r of records) {
    if (byId.has(r.id)) continue;
    const cd = d20Condition(def, r.id);
    const a: ActiveCondition = { id: r.id, name: cd?.name ?? r.label ?? r.id, record: r, ...(cd ? { def: cd } : {}) };
    if (typeof r.value === "number") a.value = r.value;
    else if (cd?.valued) a.value = 1;
    byId.set(r.id, a);
    out.push(a);
  }
  const queue = [...out];
  while (queue.length) {
    const parent = queue.shift()!;
    for (const id of parent.def?.implies ?? []) {
      const existing = byId.get(id);
      if (existing) {
        if (!existing.record && !existing.impliedBy?.includes(parent.name)) existing.impliedBy = [...(existing.impliedBy ?? []), parent.name];
        continue;
      }
      const cd = d20Condition(def, id);
      const a: ActiveCondition = { id, name: cd?.name ?? id, impliedBy: [parent.name], ...(cd ? { def: cd } : {}) };
      byId.set(id, a);
      out.push(a);
      queue.push(a);
    }
  }
  return out;
}

/** What a roll is, for condition effects. */
export interface D20RollContext {
  roll: D20EffectTarget;
  /** Ability the roll (or number) is based on. */
  ability?: string;
  /** Save id, for saves. */
  save?: string;
  /** The check's roll id (skill), for checks. */
  skill?: string;
  /** Kind of attack, for attack rolls (own or against). */
  attackKind?: D20AttackKind;
}

/** One modifier a condition puts on a roll. `stacked: false` when a same-type modifier wins over it. */
export interface D20ModifierPart {
  label: string;
  value: number;
  bonusType?: string;
  condition: string;
  stacked: boolean;
}

/** Everything conditions do to one roll or number, with the reasons. */
export interface D20RollAdjustment {
  /** Sum of the modifiers that count. */
  modifier: number;
  parts: D20ModifierPart[];
  /** Conditions giving advantage / disadvantage (labels). */
  advantage: string[];
  disadvantage: string[];
  /** Conditions that make the roll fail. */
  autoFail: string[];
  /** Conditions under which a hit is a critical hit (attacks against). */
  critOnHit: string[];
}

/** Roll mode from an adjustment: advantage and disadvantage cancel out. */
export function d20AdjustedMode(adj: Pick<D20RollAdjustment, "advantage" | "disadvantage">): "normal" | "advantage" | "disadvantage" {
  const a = adj.advantage.length > 0;
  const d = adj.disadvantage.length > 0;
  return a && !d ? "advantage" : d && !a ? "disadvantage" : "normal";
}

/**
 * What a creature's conditions do to a roll or number: its own rolls (or,
 * with `against`, attack rolls made against it, with `close` saying whether
 * the attacker is close). Typed modifiers stack per `rules.stacking`.
 */
export function d20ConditionAdjustment(def: D20CombatDef, active: readonly ActiveCondition[], ctx: D20RollContext, opts: { against?: boolean; close?: boolean } = {}): D20RollAdjustment {
  const adj: D20RollAdjustment = { modifier: 0, parts: [], advantage: [], disadvantage: [], autoFail: [], critOnHit: [] };
  const against = opts.against === true;
  for (const c of active) {
    const label = d20ConditionLabel(c);
    const value = c.value ?? 1;
    for (const e of c.def?.effects ?? []) {
      if ((e.against === true) !== against) continue;
      if (!e.on.includes(ctx.roll)) continue;
      if (e.minValue !== undefined && value < e.minValue) continue;
      if (e.abilities && !(ctx.ability && e.abilities.includes(ctx.ability))) continue;
      if (e.saves && !(ctx.save && e.saves.includes(ctx.save))) continue;
      if (e.skills && !(ctx.skill && e.skills.includes(ctx.skill))) continue;
      if (e.attackKinds && !(ctx.attackKind && e.attackKinds.includes(ctx.attackKind))) continue;
      if (e.range && opts.close !== undefined && (e.range === "close") !== opts.close) continue;
      if (e.range && opts.close === undefined) continue;
      if (e.roll === "advantage" && !adj.advantage.includes(label)) adj.advantage.push(label);
      if (e.roll === "disadvantage" && !adj.disadvantage.includes(label)) adj.disadvantage.push(label);
      if (e.autoFail && !adj.autoFail.includes(label)) adj.autoFail.push(label);
      if (e.critOnHit && !adj.critOnHit.includes(label)) adj.critOnHit.push(label);
      if (e.modifier !== undefined) {
        const n = Math.trunc(d20Number(e.modifier, { value }) ?? 0);
        if (n !== 0) adj.parts.push({ label, value: n, condition: c.id, stacked: true, ...(e.bonusType ? { bonusType: e.bonusType } : {}) });
      }
    }
  }
  // Typed bonuses and penalties: only the best bonus and the worst penalty of each type count.
  if ((def.rules.stacking ?? "typed") === "typed") {
    const best = new Map<string, D20ModifierPart>();
    const worst = new Map<string, D20ModifierPart>();
    for (const p of adj.parts) {
      if (!p.bonusType) continue;
      const map = p.value > 0 ? best : worst;
      const cur = map.get(p.bonusType);
      if (!cur || Math.abs(p.value) > Math.abs(cur.value)) map.set(p.bonusType, p);
    }
    for (const p of adj.parts) if (p.bonusType && best.get(p.bonusType) !== p && worst.get(p.bonusType) !== p) p.stacked = false;
  }
  adj.modifier = adj.parts.filter((p) => p.stacked).reduce((s, p) => s + p.value, 0);
  return adj;
}

/** "Frightened 2 −2 (status)". */
export function d20ModifierText(p: D20ModifierPart): string {
  const sign = p.value < 0 ? "−" : "+";
  return `${p.label} ${sign}${Math.abs(p.value)}${p.bonusType ? ` ${p.bonusType}` : ""}${p.stacked ? "" : " (does not stack)"}`;
}

/** Things the conditions stop the creature doing, with the condition that says so. */
export function d20Restrictions(active: readonly ActiveCondition[]): Array<{ restriction: D20Restriction; by: string }> {
  const out: Array<{ restriction: D20Restriction; by: string }> = [];
  for (const c of active) for (const r of c.def?.cannot ?? []) if (!out.some((o) => o.restriction === r)) out.push({ restriction: r, by: c.name });
  return out;
}

/** Speed after conditions (set wins over multiply, then add), with the conditions that changed it. */
export function d20Speed(active: readonly ActiveCondition[], base: number): { value: number; by: string[] } {
  let value = base;
  const by: string[] = [];
  const effective = active.filter((c) => c.def?.speed && (c.def.speed.minValue === undefined || (c.value ?? 1) >= c.def.speed.minValue));
  // exhaustion-like levels: the strongest change wins, so apply sets first
  for (const c of effective) {
    const s = c.def!.speed!;
    if (s.set !== undefined) {
      value = Math.min(value, s.set);
      by.push(c.name);
    }
  }
  for (const c of effective) {
    const s = c.def!.speed!;
    if (s.set === undefined && s.multiply !== undefined) {
      value = Math.floor(value * s.multiply);
      by.push(c.name);
    }
  }
  for (const c of effective) {
    const s = c.def!.speed!;
    if (s.set === undefined && s.add !== undefined) {
      value = Math.max(Math.min(value, 5), value + s.add);
      by.push(c.name);
    }
  }
  return { value: Math.max(0, value), by };
}

/** The per-value notes (levels) in effect for a condition's value, lowest first. */
export function d20LevelNotes(cd: D20ConditionDef | undefined, value: number | undefined): Array<{ value: number; summary: string }> {
  return (cd?.levels ?? []).filter((l) => l.value <= (value ?? 0)).sort((a, b) => a.value - b.value);
}

/** How the app handles a condition: the effects it applies by itself, in words, and what it leaves to the GM. */
export function d20ConditionAutomation(def: D20CombatDef, cd: D20ConditionDef): { automated: string[]; manual: string[] } {
  const automated: string[] = [];
  const close = def.closeLabel ?? "within 5 feet";
  const save = (id: string) => def.saves.find((s) => s.id === id)?.name ?? id;
  for (const e of cd.effects ?? []) {
    const what = e.on
      .map((o) => (o === "attack" ? (e.attackKinds ? `${e.attackKinds.join(" and ")} attack rolls` : "attack rolls") : o === "check" ? (e.skills ? `${e.skills.join(" and ")} checks` : "checks") : o === "save" ? (e.saves ? `${e.saves.map(save).join(" and ")} saves` : "saves") : o === "ac" ? "AC" : o === "dc" ? "DCs" : "damage rolls"))
      .join(", ");
    const scope = [e.abilities ? `${e.abilities.join("/")}-based` : "", e.minValue !== undefined ? `from ${e.minValue}` : ""].filter(Boolean).join(", ");
    const who = e.against ? `attack rolls against it${e.range ? (e.range === "close" ? ` (attacker ${close})` : ` (attacker not ${close})`) : ""}` : what;
    const parts: string[] = [];
    if (e.roll) parts.push(`${e.roll} on ${who}`);
    if (e.modifier !== undefined) {
      const kind = (n: number) => `${e.bonusType ? `${e.bonusType} ` : ""}${n < 0 ? "penalty" : "bonus"}`;
      if (typeof e.modifier === "number") parts.push(`${e.modifier > 0 ? `+${e.modifier}` : `−${Math.abs(e.modifier)}`} ${kind(e.modifier)} to ${who}`);
      else parts.push(`a ${kind(d20Number(e.modifier, { value: 1 }) ?? -1)} equal to its value to ${who}`);
    }
    if (e.autoFail) parts.push(`${who} fail automatically`);
    if (e.critOnHit) parts.push(`a hit is a critical hit${e.range === "close" ? ` (attacker ${close})` : ""}`);
    for (const p of parts) automated.push(scope ? `${p} (${scope})` : p);
  }
  if (cd.implies?.length) automated.push(`brings ${cd.implies.map((i) => d20Condition(def, i)?.name ?? i).join(", ")}`);
  if (cd.endOfTurnDecrement) automated.push(`drops by ${cd.endOfTurnDecrement} at the end of its turn`);
  if (cd.speed) automated.push(cd.speed.set !== undefined ? `speed ${cd.speed.set}` : cd.speed.multiply !== undefined ? `speed ×${cd.speed.multiply}` : `speed ${cd.speed.add ?? 0}`);
  if (cd.cannot?.length) automated.push(`card shows: can't ${cd.cannot.join(", ")}`);
  return { automated, manual: [...(cd.manual ?? [])] };
}

// ---------------------------------------------------------------------------
// resolving attack rolls and saves
// ---------------------------------------------------------------------------

export type D20Degree = "critical-success" | "success" | "failure" | "critical-failure";

export interface D20AttackResolution {
  degree: D20Degree;
  hit: boolean;
  critical: boolean;
  natural: number;
  total: number;
  ac: number;
  /** Why, in words: "17 vs AC 15", "natural 20", "natural 1". */
  reason: string;
}

function keptNatural(result: RollResult): number {
  return (result.dice.find((d) => !d.dropped) ?? result.dice[0])?.value ?? 0;
}

function degreeOf(result: RollResult, dc: number): D20Degree {
  const id = result.outcome?.id;
  if (id === "critical-success" || id === "success" || id === "failure" || id === "critical-failure") return id;
  return (result.total ?? 0) >= dc ? "success" : "failure";
}

/**
 * An attack roll against AC, by the module's rule. For `degrees` the roll
 * must have been made with `dc` = AC so the engine reads its degrees.
 * `critOnHit` lists conditions that make a hit a critical hit.
 */
export function resolveD20Attack(def: D20CombatDef, result: RollResult, ac: number, critOnHit: readonly string[] = []): D20AttackResolution {
  const natural = keptNatural(result);
  const total = result.total ?? natural;
  let degree: D20Degree;
  let reason: string;
  if (def.rules.crit === "degrees") {
    degree = degreeOf(result, ac);
    reason = `${total} vs AC ${ac}${result.critical || result.fumble ? ` (natural ${natural})` : ""}`;
  } else if (result.critical) {
    degree = "critical-success";
    reason = `natural ${natural}: always hits, critical hit`;
  } else if (result.fumble) {
    degree = "critical-failure";
    reason = `natural ${natural}: always misses`;
  } else {
    degree = total >= ac ? "success" : "failure";
    reason = `${total} vs AC ${ac}`;
  }
  const hit = degree === "success" || degree === "critical-success";
  let critical = degree === "critical-success";
  if (hit && !critical && critOnHit.length) {
    critical = true;
    degree = "critical-success";
    reason += `; critical hit: ${critOnHit.join(", ")}`;
  }
  return { degree, hit, critical, natural, total, ac, reason };
}

export interface D20SaveResolution {
  degree: D20Degree;
  success: boolean;
  total: number;
  dc: number;
  reason: string;
}

/** A save against a DC, by the module's rule; `autoFail` (condition labels) fails it whatever the roll. */
export function resolveD20Save(def: D20CombatDef, result: RollResult, dc: number, autoFail: readonly string[] = []): D20SaveResolution {
  const total = result.total ?? 0;
  if (autoFail.length) return { degree: "failure", success: false, total, dc, reason: `fails automatically: ${autoFail.join(", ")}` };
  const degree: D20Degree = def.rules.save === "degrees" ? degreeOf(result, dc) : total >= dc ? "success" : "failure";
  return { degree, success: degree === "success" || degree === "critical-success", total, dc, reason: `${total} vs DC ${dc}` };
}

/** How much of a save effect's damage a save outcome takes. */
export function d20SaveDamageMultiplier(def: D20CombatDef, degree: D20Degree, half: boolean | undefined): number {
  const four = def.rules.save === "degrees";
  if (half) {
    const h = def.rules.halfSave ?? { success: 0.5, failure: 1 };
    if (degree === "critical-success") return four ? (h.criticalSuccess ?? h.success) : h.success;
    if (degree === "success") return h.success;
    if (degree === "critical-failure") return four ? (h.criticalFailure ?? h.failure) : h.failure;
    return h.failure;
  }
  return degree === "success" || degree === "critical-success" ? 0 : 1;
}

/** The conditions a save outcome applies: none on a success; `criticalConditions` (else `conditions`) on a critical failure. */
export function d20SaveConditions(effect: D20SaveEffect, degree: D20Degree): D20ConditionApply[] {
  if (degree === "success" || degree === "critical-success") return [];
  if (degree === "critical-failure" && effect.criticalConditions?.length) return effect.criticalConditions;
  return effect.conditions ?? [];
}

// ---------------------------------------------------------------------------
// damage
// ---------------------------------------------------------------------------

export interface D20RolledPart {
  /** The expression as written. */
  dice: string;
  /** The expression rolled (dice doubled on a critical hit by `critDamage: "dice"`). */
  rolled: string;
  type?: string;
  raw: number[];
  total: number;
}

export interface D20DamageRoll {
  parts: D20RolledPart[];
  /** Persistent parts, not rolled now (they become a condition). */
  persistent: D20DamagePart[];
  total: number;
  critical: boolean;
  /** How the critical hit doubled the damage. */
  doubled?: "dice" | "total";
  /** A flat modifier added (e.g. from conditions), with its reasons. */
  modifier?: { value: number; labels: string[] };
}

/** "2d6+3" with every dice term's count doubled: "4d6+3". */
export function doubleDiceExpression(expr: string): string {
  const parsed = parseDiceExpression(expr);
  let out = "";
  for (const t of parsed.terms) {
    if (t.kind === "const") out += t.value < 0 ? `${t.value}` : `${out ? "+" : ""}${t.value}`;
    else if (t.kind === "d66") out += `${t.sign < 0 ? "-" : out ? "+" : ""}d66+d66`;
    else out += `${t.sign < 0 ? "-" : out ? "+" : ""}${t.count * 2}d${t.faces}`;
  }
  return out;
}

/**
 * Roll damage parts with `rng`, in order. On a critical hit the module's
 * `critDamage` rolls each part's dice twice or doubles its total.
 * `modifier` (e.g. a condition's penalty to damage) goes on the first part,
 * never below 0. Flat parts ("5") roll no dice.
 */
export function rollD20Damage(def: D20CombatDef, parts: readonly D20DamagePart[], rng: Rng, opts: { critical?: boolean; modifier?: { value: number; labels: string[] } } = {}): D20DamageRoll {
  const critical = opts.critical === true;
  const mode = def.rules.critDamage;
  const rolledParts: D20RolledPart[] = [];
  const persistent: D20DamagePart[] = [];
  for (const p of parts) {
    if (p.persistent) {
      persistent.push(critical ? { ...p, dice: mode === "dice" && !/^\d+$/.test(p.dice) ? doubleDiceExpression(p.dice) : `(${p.dice})×2` } : p);
      continue;
    }
    if (/^\d+$/.test(p.dice)) {
      const flat = Number(p.dice) * (critical ? 2 : 1);
      rolledParts.push({ dice: p.dice, rolled: critical ? `${p.dice}×2` : p.dice, raw: [], total: flat, ...(p.type ? { type: p.type } : {}) });
      continue;
    }
    const rolled = critical && mode === "dice" ? doubleDiceExpression(p.dice) : p.dice;
    const r = rollDice(rolled, rng);
    const total = Math.max(0, critical && mode === "total" ? r.total * 2 : r.total);
    rolledParts.push({ dice: p.dice, rolled: critical && mode === "total" ? `(${p.dice})×2` : rolled, raw: r.raw, total, ...(p.type ? { type: p.type } : {}) });
  }
  const out: D20DamageRoll = { parts: rolledParts, persistent, total: 0, critical, ...(critical ? { doubled: mode } : {}) };
  if (opts.modifier && opts.modifier.value !== 0 && rolledParts[0]) {
    rolledParts[0].total = Math.max(0, rolledParts[0].total + opts.modifier.value);
    out.modifier = opts.modifier;
  }
  out.total = rolledParts.reduce((s, p) => s + p.total, 0);
  return out;
}

export interface D20DamageApplied {
  total: number;
  parts: Array<{ type?: string; before: number; after: number }>;
  /** One line per modifier that changed something: "fire resistance: 14 → 7". */
  lines: string[];
}

function modifierCovers(def: D20CombatDef, m: D20DamageModifier, type: string | undefined): boolean {
  if (m.type === "all") return true;
  if (!type) return false;
  if (m.type === type) return true;
  return (def.damageGroups?.[m.type] ?? []).includes(type);
}

const normTrait = (s: string) => s.trim().toLowerCase().replace(/[\s_]+/g, "-");

/** A damage modifier keyed on an attack trait or material rather than a damage type ("cold-iron", "holy", "silver"). */
export function d20IsTraitModifier(def: D20CombatDef, m: Pick<D20DamageModifier, "type">): boolean {
  return m.type !== "all" && !def.damageTypes.some((t) => t.id === m.type) && !(m.type in (def.damageGroups ?? {}));
}

/**
 * Apply damage modifiers to typed amounts, part by part, in the module's
 * order: immunity (0), resistance (halved, rounded down, or less by its
 * value; the strongest one), vulnerability (doubled), weakness (more by its
 * value; the highest). A modifier is skipped when the attack has one of its
 * `except` traits.
 */
export function applyD20DamageModifiers(def: D20CombatDef, modifiers: readonly D20DamageModifier[], parts: ReadonlyArray<{ type?: string; amount: number }>, attackTraits: readonly string[] = []): D20DamageApplied {
  const order = def.rules.damageOrder ?? ["immunity", "resistance", "vulnerability", "weakness"];
  const traits = new Set(attackTraits.map(normTrait));
  const lines: string[] = [];
  const out: D20DamageApplied["parts"] = [];
  for (const p of parts) {
    const before = Math.max(0, Math.floor(p.amount));
    let a = before;
    const typeName = d20DamageTypeName(def, p.type);
    // a modifier keyed on a trait or material counts once per attack, on its first damage part
    const index = out.length;
    const applicable = modifiers.filter((m) => (d20IsTraitModifier(def, m) ? index === 0 && traits.has(normTrait(m.type)) : modifierCovers(def, m, p.type)) && !(m.except ?? []).some((e) => traits.has(normTrait(e)) || normTrait(e) === p.type));
    const label = (m: D20DamageModifier) => (d20IsTraitModifier(def, m) ? m.type.replace(/-/g, " ") : m.type === p.type || !p.type ? typeName : `${typeName} (${d20DamageTypeName(def, m.type)})`);
    for (const kind of order) {
      const ms = applicable.filter((m) => m.kind === kind);
      if (!ms.length || a <= 0) continue;
      const from = a;
      if (kind === "immunity") {
        a = 0;
        lines.push(`immune to ${label(ms[0]!)}: ${from} → 0`);
      } else if (kind === "resistance") {
        const halving = ms.find((m) => m.value === undefined);
        const valued = ms.filter((m) => m.value !== undefined).sort((x, y) => (y.value ?? 0) - (x.value ?? 0))[0];
        const halved = halving ? Math.floor(a / 2) : a;
        const reduced = valued ? Math.max(0, a - (valued.value ?? 0)) : a;
        const useHalf = halving && halved <= reduced;
        a = useHalf ? halved : reduced;
        const m = useHalf ? halving! : valued!;
        lines.push(`${label(m)} resistance${m.value !== undefined ? ` ${m.value}` : ""}: ${from} → ${a}`);
      } else if (kind === "vulnerability") {
        a = a * 2;
        lines.push(`vulnerable to ${label(ms[0]!)}: ${from} → ${a}`);
      } else {
        const m = [...ms].sort((x, y) => (y.value ?? 0) - (x.value ?? 0))[0]!;
        a = a + (m.value ?? 0);
        lines.push(`${label(m)} weakness ${m.value ?? 0}: ${from} → ${a}`);
      }
    }
    out.push({ ...(p.type ? { type: p.type } : {}), before, after: a });
  }
  return { total: out.reduce((s, p) => s + p.after, 0), parts: out, lines };
}

/** Hit points after damage: temporary hit points go first. */
export function d20TakeDamage(hp: D20HitPoints, amount: number): D20HitPoints & { fromTemp: number } {
  const dmg = Math.max(0, Math.floor(amount));
  const fromTemp = Math.min(hp.temp, dmg);
  return { max: hp.max, temp: hp.temp - fromTemp, current: Math.max(0, hp.current - (dmg - fromTemp)), fromTemp };
}

// ---------------------------------------------------------------------------
// durations
// ---------------------------------------------------------------------------

/**
 * A duration spec as a concrete duration on `target`, applied now
 * (`currentTurn` is whose turn it is): rounds end at the end of the target's
 * turn (its current turn does not count), "until the end of the source's
 * next turn" counts the source's turn ends (its current one does not count).
 */
export function d20ConcreteDuration(spec: D20DurationSpec | undefined, ctx: { target: string; source?: string; currentTurn?: string; dc?: number }): AppliedDuration | undefined {
  if (!spec) return undefined;
  const out: AppliedDuration = {};
  if (spec.sourceNextTurn && ctx.source) {
    out.turns = ctx.currentTurn === ctx.source ? 2 : 1;
    out.turnOf = ctx.source;
    out.at = "end";
  } else if (spec.rounds !== undefined && spec.rounds > 0) {
    out.turns = Math.floor(spec.rounds) + (ctx.currentTurn === ctx.target ? 1 : 0);
    out.turnOf = ctx.target;
    out.at = "end";
  } else if (spec.sourceNextTurn) {
    out.turns = ctx.currentTurn === ctx.target ? 2 : 1;
    out.turnOf = ctx.target;
    out.at = "end";
  }
  const dc = spec.save?.dc ?? ctx.dc;
  if (spec.save && dc !== undefined) out.save = { save: spec.save.save, dc };
  return Object.keys(out).length ? out : undefined;
}

/** A duration in words: "2 more turn ends of Goblin 1", "save ends (DC 13 Constitution)". */
export function d20DurationText(def: D20CombatDef | undefined, d: AppliedDuration | undefined, nameOf: (id: string) => string = (id) => id): string {
  if (!d) return "until removed";
  const parts: string[] = [];
  if (d.turns !== undefined && d.turnOf) parts.push(`ends at the ${d.at ?? "end"} of ${nameOf(d.turnOf)}'s turn${d.turns > 1 ? ` (${d.turns} turns left)` : ""}`);
  if (d.save) parts.push(`save ends: DC ${d.save.dc} ${def?.saves.find((s) => s.id === d.save!.save)?.name ?? d.save.save}, at the end of each of its turns`);
  return parts.join("; ") || "until removed";
}

export interface D20TickResult {
  /** The holder's conditions after the tick. */
  records: AppliedCondition[];
  expired: AppliedCondition[];
  decremented: Array<{ id: string; from: number; to: number }>;
  /** Saves the holder makes now to end a condition. */
  savesDue: Array<{ id: string; save: string; dc: number }>;
}

/**
 * Tick one creature's conditions at the start or end of `event.entity`'s
 * turn: turn counters keyed on that creature count down (0 ends the
 * condition); at the end of the holder's own turn, valued conditions with
 * `endOfTurnDecrement` drop (0 ends them) and save-ends conditions ask for a save.
 */
export function tickD20Conditions(def: D20CombatDef, holder: string, records: readonly AppliedCondition[], event: { entity: string; at: "start" | "end" }): D20TickResult {
  const out: D20TickResult = { records: [], expired: [], decremented: [], savesDue: [] };
  const ownEnd = event.entity === holder && event.at === "end";
  for (const r of records) {
    let next: AppliedCondition = r;
    let ended = false;
    const d = r.duration;
    if (d?.turns !== undefined && d.turnOf === event.entity && (d.at ?? "end") === event.at) {
      const turns = d.turns - 1;
      if (turns <= 0) ended = true;
      else next = { ...next, duration: { ...d, turns } };
    }
    const cd = d20Condition(def, r.id);
    if (!ended && ownEnd && cd?.endOfTurnDecrement) {
      const from = r.value ?? 1;
      const to = Math.max(0, from - cd.endOfTurnDecrement);
      out.decremented.push({ id: r.id, from, to });
      if (to <= 0) ended = true;
      else next = { ...next, value: to };
    }
    if (ended) {
      out.expired.push(r);
      continue;
    }
    if (ownEnd && d?.save) out.savesDue.push({ id: r.id, save: d.save.save, dc: d.save.dc });
    out.records.push(next);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 0 hit points
// ---------------------------------------------------------------------------

/** What `zeroHp` rules read. */
export interface D20ZeroHpData {
  kind?: string;
  type: string;
  fields: Record<string, unknown>;
  computed?: Record<string, unknown>;
}

/** The first 0 hit point rule that applies to the creature. */
export function d20ZeroHpRule(def: D20CombatDef, data: D20ZeroHpData): D20ZeroHpRule | undefined {
  const ctx = { kind: data.kind ?? null, type: data.type, fields: data.fields, computed: data.computed ?? {} };
  return (def.zeroHp ?? []).find((r) => {
    if (r.when === undefined) return true;
    try {
      return !!evaluateLogic(r.when, ctx);
    } catch {
      return false;
    }
  });
}

/** A rule's condition value (a number, or JSONLogic over `{ critical, conditions, fields, computed }`). */
export function d20RuleValue(v: number | JsonLogicRule | undefined, data: { critical: boolean; conditions: Record<string, number>; fields: Record<string, unknown>; computed?: Record<string, unknown> }): number | undefined {
  if (v === undefined) return undefined;
  const n = d20Number(v, { critical: data.critical, conditions: data.conditions, fields: data.fields, computed: data.computed ?? {} });
  return n === undefined ? undefined : Math.max(0, Math.floor(n));
}

// ---------------------------------------------------------------------------
// conformance
// ---------------------------------------------------------------------------

export interface D20CombatCheckContext {
  entityTypes: ReadonlyArray<{ id: string; kind: string; computed?: Record<string, JsonLogicRule> }>;
  rules: ReadonlySet<string>;
  /** Whether a field path (or computed key) exists on an entity type. */
  hasPath(typeId: string, path: string): boolean;
  /** Default `{ fields, computed }` of an entity type, to evaluate rules against. */
  sample(typeId: string): CombatantData | undefined;
  /** The dice engine id, when the module's dice came from a built-in engine. */
  engine?: string;
  validPage(page: unknown): boolean;
}

/** Problems with a `d20Combat` def, as (where, message, severity) triples. */
export function d20CombatIssues(def: D20CombatDef, ctx: D20CombatCheckContext): Array<{ severity: "error" | "warning"; where: string; message: string }> {
  const issues: Array<{ severity: "error" | "warning"; where: string; message: string }> = [];
  const err = (where: string, message: string) => issues.push({ severity: "error", where, message });
  const warn = (where: string, message: string) => issues.push({ severity: "warning", where, message });
  const logic = (rule: unknown, where: string, label: string) => {
    for (const i of logicIssues(rule)) err(where, `${label}: ${i}`);
  };
  const w = "d20Combat";
  if (ctx.engine !== undefined && ctx.engine !== "d20") err(w, `d20Combat needs the d20 dice engine (the module uses "${ctx.engine}")`);
  if (def.page !== undefined && !ctx.validPage(def.page)) err(w, "invalid page reference");
  const typeIds = new Set<string>();
  for (const t of def.damageTypes ?? []) {
    if (!t.id || !t.name) err(w, "a damage type needs an id and a name");
    if (typeIds.has(t.id)) err(w, `duplicate damage type "${t.id}"`);
    typeIds.add(t.id);
  }
  for (const [g, list] of Object.entries(def.damageGroups ?? {})) for (const t of list) if (!typeIds.has(t)) err(w, `damage group "${g}" lists unknown damage type "${t}"`);
  const saveIds = new Set<string>();
  for (const s of def.saves ?? []) {
    if (saveIds.has(s.id)) err(w, `duplicate save "${s.id}"`);
    saveIds.add(s.id);
  }
  const condIds = new Set<string>();
  for (const c of def.conditions ?? []) {
    const cw = `${w}:condition:${c.id}`;
    if (condIds.has(c.id)) err(cw, `duplicate condition "${c.id}"`);
    condIds.add(c.id);
    if (!c.name) err(cw, "condition has no name");
    if (!c.summary || !c.summary.trim()) err(cw, "condition has no helper text (summary)");
    if (c.page !== undefined && !ctx.validPage(c.page)) err(cw, "invalid page reference");
    if (c.page === undefined && !c.cite && !c.original) warn(cw, "condition cites no source (page, cite or original)");
    if (c.rule !== undefined && !ctx.rules.has(c.rule)) err(cw, `references unknown rule "${c.rule}"`);
    if (c.max !== undefined && (!Number.isInteger(c.max) || c.max < 1)) err(cw, "max must be a positive integer");
    c.effects?.forEach((e, i) => {
      if (!Array.isArray(e.on) || e.on.length === 0) err(cw, `effect ${i} changes nothing ("on" is empty)`);
      if (e.modifier === undefined && !e.roll && !e.autoFail && !e.critOnHit) err(cw, `effect ${i} has no modifier, roll, autoFail or critOnHit`);
      if (e.modifier !== undefined) logic(e.modifier, cw, `effect ${i} modifier`);
      for (const s of e.saves ?? []) if (!saveIds.has(s)) err(cw, `effect ${i} names unknown save "${s}"`);
      if ((e.range || e.critOnHit) && !e.against) err(cw, `effect ${i}: range and critOnHit apply to attacks against the creature ("against": true)`);
    });
  }
  for (const c of def.conditions ?? []) {
    const cw = `${w}:condition:${c.id}`;
    for (const i of c.implies ?? []) if (i === c.id || !condIds.has(i)) err(cw, `implies unknown condition "${i}"`);
    if (c.field && !def.combatants.some((cb) => cb.entityTypes.some((t) => ctx.hasPath(t, c.field!)))) warn(cw, `no combatant type has the field "${c.field}"`);
  }
  if (def.persistentCondition !== undefined && !condIds.has(def.persistentCondition)) err(w, `persistentCondition "${def.persistentCondition}" is not a condition`);
  for (const r of def.ruleCards ?? []) if (!ctx.rules.has(r)) err(w, `references unknown rule "${r}"`);
  const typesSeen = new Set<string>();
  def.combatants.forEach((cb, i) => {
    const cw = `${w}:combatant:${cb.entityTypes.join(",") || i}`;
    if (!cb.hp?.current && !cb.hp?.damage) err(cw, "hp needs a current or a damage field");
    logic(cb.ac, cw, "ac");
    logic(cb.hp?.max, cw, "hp.max");
    if (cb.speed !== undefined) logic(cb.speed, cw, "speed");
    for (const [s, rule] of Object.entries(cb.saves ?? {})) {
      if (!saveIds.has(s)) err(cw, `saves names unknown save "${s}"`);
      logic(rule, cw, `save ${s}`);
    }
    for (const t of cb.entityTypes) {
      const type = ctx.entityTypes.find((x) => x.id === t);
      if (!type) {
        err(cw, `unknown entity type "${t}"`);
        continue;
      }
      if (typesSeen.has(t)) err(cw, `entity type "${t}" is in more than one combatant`);
      typesSeen.add(t);
      for (const p of [cb.hp?.current, cb.hp?.damage, cb.hp?.temp, cb.damageModifiers, cb.conditionImmunities, ...(cb.attacks ?? []).map((a) => a.path)]) {
        if (p && !ctx.hasPath(t, p)) err(cw, `field "${p}" is not on ${t}`);
      }
      const sample = ctx.sample(t);
      if (sample) {
        if (d20Number(cb.ac, dataOf(sample)) === undefined) err(cw, `ac does not give a number for a new ${t}`);
        if (d20Number(cb.hp.max, dataOf(sample)) === undefined) err(cw, `hp.max does not give a number for a new ${t}`);
      }
    }
  });
  (def.zeroHp ?? []).forEach((z, i) => {
    const zw = `${w}:zeroHp:${i}`;
    if (!z.text) err(zw, "a 0 hit point rule needs its text");
    if (z.when !== undefined) logic(z.when, zw, "when");
    for (const c of [...(z.conditions ?? []), ...(z.recover?.conditions ?? [])]) {
      if (!condIds.has(c.id)) err(zw, `unknown condition "${c.id}"`);
      if (c.value !== undefined) logic(c.value, zw, `value of ${c.id}`);
    }
    for (const id of z.recover?.remove ?? []) if (!condIds.has(id)) err(zw, `unknown condition "${id}"`);
    if (z.page !== undefined && !ctx.validPage(z.page)) err(zw, "invalid page reference");
  });
  return issues;
}

/** Problems with one attack read from data (used by tests and checks of presets): dice that do not parse, unknown types. */
export function d20AttackIssues(def: D20CombatDef, attack: D20Attack): string[] {
  const out: string[] = [];
  for (const p of [...attack.damage, ...((attack.save?.damage as D20DamagePart[] | undefined) ?? [])]) {
    if (!/^\d+$/.test(p.dice) && !isDiceExpression(p.dice)) out.push(`damage "${p.dice}" is not a dice expression`);
    if (p.type && !def.damageTypes.some((t) => t.id === p.type)) out.push(`unknown damage type "${p.type}"`);
  }
  if (attack.save && !def.saves.some((s) => s.id === attack.save!.save)) out.push(`unknown save "${attack.save.save}"`);
  for (const c of [...(attack.onHit ?? []), ...(attack.save?.conditions ?? []), ...(attack.save?.criticalConditions ?? [])]) if (!d20Condition(def, c.id)) out.push(`unknown condition "${c.id}"`);
  return out;
}

// ---------------------------------------------------------------------------
// building a roll
// ---------------------------------------------------------------------------

/** What goes into an attack roll or a save. */
export interface D20RollSpec {
  /** Labelled numbers that make the bonus (e.g. `{ label: "Scimitar", value: 4 }`). */
  base: Array<{ label: string; value: number }>;
  /** The roller's conditions. */
  own?: D20RollAdjustment;
  /** The target's conditions on attacks against it. */
  against?: D20RollAdjustment;
  /** The GM's choice of roll mode, overriding the one the conditions give. */
  advantage?: "normal" | "advantage" | "disadvantage";
  dc?: number;
  /** Values for the dice engine's `modifierChoices` (e.g. a multiple attack penalty), by choice id. */
  choices?: Record<string, string>;
}

/** The roll mode conditions give (advantage and disadvantage from both sides cancel out), with the reasons. */
export function d20RollMode(own?: D20RollAdjustment, against?: D20RollAdjustment): { mode: "normal" | "advantage" | "disadvantage"; advantage: string[]; disadvantage: string[] } {
  const advantage = [...(own?.advantage ?? []), ...(against?.advantage ?? [])];
  const disadvantage = [...(own?.disadvantage ?? []), ...(against?.disadvantage ?? [])];
  return { mode: d20AdjustedMode({ advantage, disadvantage }), advantage, disadvantage };
}

/** The dice engine input for a roll: the base numbers and condition modifiers as labelled adjustments, the roll mode, the DC. */
export function d20RollInput(spec: D20RollSpec): Record<string, unknown> {
  const adjustments = [
    ...spec.base,
    ...(spec.own?.parts ?? []).filter((p) => p.stacked).map((p) => ({ label: `${p.label}${p.bonusType ? ` (${p.bonusType})` : ""}`, value: p.value })),
  ];
  const input: Record<string, unknown> = { adjustments, advantage: spec.advantage ?? d20RollMode(spec.own, spec.against).mode, ...(spec.choices ?? {}) };
  if (spec.dc !== undefined) input.dc = spec.dc;
  return input;
}
