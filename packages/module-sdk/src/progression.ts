/**
 * Character progression, the pure part: which characters advance, the award
 * checklist evaluated per character, and quotes for spending a pool (cost,
 * caps, preconditions) with the sheet change a spend makes. Nothing here
 * stores anything; the core's advancement log applies and records spends.
 */
import { evaluateLogic, evaluateNumber, getPath } from "./logic";
import { filterByMode } from "./module";
import type {
  AwardContext,
  AwardQuestionDef,
  JsonLogicRule,
  PageRef,
  PlayModeId,
  ProgressionDef,
  ProgressionPoolDef,
  ProgressionPoolId,
  ReferenceItem,
  ReferenceList,
  SpendOptionDef,
  SpendTarget,
} from "./types";

const inMode = (modes: PlayModeId[] | undefined, mode: PlayModeId | undefined): boolean => !mode || !modes || modes.length === 0 || modes.includes(mode);
const num = (v: unknown, fallback = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The module's progression when it applies in `mode`. */
export function progressionFor(def: ProgressionDef | undefined, mode: PlayModeId): ProgressionDef | undefined {
  return def && inMode(def.mode, mode) ? def : undefined;
}

/** A pool's definition when it exists and applies in `mode` (any mode when omitted). */
export function progressionPool(def: ProgressionDef | undefined, pool: ProgressionPoolId, mode?: PlayModeId): ProgressionPoolDef | undefined {
  const p = pool === "experience" ? def?.experience : def?.storyPoints;
  return p && inMode(p.mode, mode) ? p : undefined;
}

/** Whether an entity advances under this progression (its type is listed and its `when` holds). */
export function advances(def: ProgressionDef | undefined, entity: { type: string; fields: Record<string, unknown> }): boolean {
  if (!def) return false;
  const e = def.entities.find((x) => x.type === entity.type);
  if (!e) return false;
  return e.when === undefined || !!evaluateLogic(e.when, { fields: entity.fields, type: entity.type });
}

/** Current value of a pool on the sheet (missing counts as the pool's minimum). */
export function poolValue(pool: ProgressionPoolDef, fields: Record<string, unknown>): number {
  return num(getPath(fields, pool.path), pool.min ?? 0);
}

/** A value kept inside the pool's bounds. */
export function clampPool(pool: ProgressionPoolDef, value: number): number {
  const lo = pool.min ?? 0;
  const hi = pool.max ?? Number.POSITIVE_INFINITY;
  return Math.min(hi, Math.max(lo, value));
}

/** Award questions for a mode and timing whose pool applies in that mode. */
export function awardQuestions(def: ProgressionDef | undefined, mode: PlayModeId, timing: NonNullable<AwardQuestionDef["timing"]> = "session"): AwardQuestionDef[] {
  if (!def) return [];
  return filterByMode(def.awards, mode).filter((q) => (q.timing ?? "session") === timing && !!progressionPool(def, q.pool ?? "experience", mode));
}

export interface AwardRow {
  question: AwardQuestionDef;
  pool: ProgressionPoolId;
  amount: number;
  /** False when the question's `when` says it does not apply to this character. */
  applies: boolean;
  /** Why it does not apply. */
  reason?: string;
  /** Ticked from the start: `defaultYes`, or `suggest` returned true. */
  ticked: boolean;
  /** Ticked because the session data suggests it (not by default). */
  suggested: boolean;
}

/** The award checklist for one character. */
export function evaluateAwards(questions: readonly AwardQuestionDef[], ctx: AwardContext): AwardRow[] {
  const data = { ...ctx, fields: ctx.character.fields };
  return questions.map((q) => {
    let applies = true;
    if (q.when !== undefined) {
      try {
        applies = !!evaluateLogic(q.when, data);
      } catch {
        applies = true;
      }
    }
    let suggested = false;
    if (applies && q.suggest) {
      try {
        suggested = !!q.suggest(ctx);
      } catch {
        suggested = false;
      }
    }
    return {
      question: q,
      pool: q.pool ?? "experience",
      amount: q.amount ?? 1,
      applies,
      ...(!applies && q.whenText ? { reason: q.whenText } : {}),
      ticked: applies && (q.defaultYes === true || suggested),
      suggested: suggested && q.defaultYes !== true,
    };
  });
}

/** Points per pool for the questions answered yes (unknown ids count nothing). */
export function awardTotals(questions: readonly AwardQuestionDef[], yes: Iterable<string>): Record<ProgressionPoolId, number> {
  const ids = new Set(yes);
  const out: Record<ProgressionPoolId, number> = { experience: 0, story: 0 };
  for (const q of questions) if (ids.has(q.id)) out[q.pool ?? "experience"] += q.amount ?? 1;
  return out;
}

// ---------------------------------------------------------------------------
// spending
// ---------------------------------------------------------------------------

export interface SpendContext {
  referenceList(id: string): ReferenceList | undefined;
  /** The character's computed values (spend checks may read them). */
  computed?: Record<string, unknown>;
  mode?: PlayModeId;
}

export interface SpendQuote {
  option: string;
  pool: ProgressionPoolId;
  /** The skill key or the reference item id. */
  target: string;
  label: string;
  /** Level (or copies held) before and after. */
  from: number;
  to: number;
  cost: number;
  /** The pool now and after paying. */
  balance: number;
  balanceAfter: number;
  /** False when the option's `available` rule (or the item's mode) rules the target out. */
  available: boolean;
  /** Reasons the spend cannot be made (cap, stack limit, a block check, not enough points). */
  blocked: string[];
  /** Conditions the GM must confirm before applying. */
  confirm: string[];
  page?: PageRef;
  item?: ReferenceItem;
}

export function spendOptions(def: ProgressionDef | undefined, mode: PlayModeId): SpendOptionDef[] {
  if (!def) return [];
  return filterByMode(def.spends, mode).filter((o) => !!progressionPool(def, o.pool ?? "experience", mode));
}

function levelKeys(target: Extract<SpendTarget, { kind: "level" }>, fields: Record<string, unknown>, ctx: SpendContext): Array<{ key: string; item?: ReferenceItem }> {
  if (target.keys) return target.keys.map((key) => ({ key, ...(target.ref ? withItem(ctx.referenceList(target.ref), key) : {}) }));
  const list = target.ref ? ctx.referenceList(target.ref) : undefined;
  if (list) return list.items.filter((i) => inMode(i.mode, ctx.mode)).map((item) => ({ key: item.id, item }));
  const obj = getPath(fields, target.path);
  return isRecord(obj) ? Object.keys(obj).map((key) => ({ key })) : [];
}

function withItem(list: ReferenceList | undefined, key: string): { item?: ReferenceItem } {
  const item = list?.items.find((i) => i.id === key);
  return item ? { item } : {};
}

/** Copies of `id` held in a pick target's array (an entry without a count counts once). */
export function pickCount(target: Extract<SpendTarget, { kind: "pick" }>, fields: Record<string, unknown>, id: string): number {
  const list = getPath(fields, target.path);
  if (!Array.isArray(list)) return 0;
  const key = target.countKey ?? "count";
  let n = 0;
  for (const e of list) {
    if (typeof e === "string" && e === id) n += 1;
    else if (isRecord(e) && e.id === id) n += Math.max(1, Math.floor(num(e[key], 1)));
  }
  return n;
}

function evalBool(rule: JsonLogicRule, data: unknown): boolean {
  try {
    return !!evaluateLogic(rule, data);
  } catch {
    return false;
  }
}

function quote(def: ProgressionDef, option: SpendOptionDef, fields: Record<string, unknown>, ctx: SpendContext, key: string, item: ReferenceItem | undefined): SpendQuote {
  const pool = option.pool ?? "experience";
  const poolDef = progressionPool(def, pool);
  const balance = poolDef ? poolValue(poolDef, fields) : 0;
  const t = option.target;
  let from: number;
  let to: number;
  const blocked: string[] = [];
  let available = true;
  if (t.kind === "level") {
    from = num(getPath(fields, `${t.path}.${key}`), 0);
    to = from + (t.step ?? 1);
    if (to > t.max) blocked.push(`Already at the maximum (${t.max})`);
  } else {
    from = pickCount(t, fields, key);
    to = from + 1;
    const limit = Math.max(1, Math.floor(num(item ? (item as Record<string, unknown>)[t.stackKey ?? "maxStack"] : undefined, 1)));
    if (from >= limit) blocked.push(limit === 1 ? "Already taken" : `Already taken ${from} times (the most allowed)`);
    if (item && !inMode(item.mode, ctx.mode)) available = false;
  }
  const data = { key, item: item ?? null, from, to, count: from, fields, computed: ctx.computed ?? {} };
  if (option.available !== undefined && !evalBool(option.available, data)) available = false;
  if (!available) blocked.unshift(option.availableText ?? "Not available to this character");
  let cost = 0;
  try {
    cost = Math.max(0, evaluateNumber(option.cost, data));
  } catch {
    cost = 0;
  }
  const confirm: string[] = [];
  for (const c of option.checks ?? []) {
    if (evalBool(c.ok, data)) continue;
    if (c.level === "block") blocked.push(c.message);
    else confirm.push(c.message);
  }
  if (cost > balance) blocked.push(`Needs ${cost} ${poolDef?.label ?? pool}; has ${balance}`);
  const label = item?.name ?? key;
  return {
    option: option.id,
    pool,
    target: key,
    label,
    from,
    to,
    cost,
    balance,
    balanceAfter: balance - cost,
    available,
    blocked,
    confirm,
    ...(option.page !== undefined ? { page: option.page } : {}),
    ...(item ? { item } : {}),
  };
}

/** Quotes for every target of a spend option (skills, talents), available or not. */
export function quoteSpendTargets(def: ProgressionDef, option: SpendOptionDef, fields: Record<string, unknown>, ctx: SpendContext): SpendQuote[] {
  const t = option.target;
  if (t.kind === "level") return levelKeys(t, fields, ctx).map(({ key, item }) => quote(def, option, fields, ctx, key, item));
  const list = ctx.referenceList(t.ref);
  return (list?.items ?? []).map((item) => quote(def, option, fields, ctx, item.id, item));
}

/** A quote for one target of a spend option. */
export function quoteSpend(def: ProgressionDef, option: SpendOptionDef, fields: Record<string, unknown>, target: string, ctx: SpendContext): SpendQuote {
  const t = option.target;
  const item = t.kind === "pick" ? ctx.referenceList(t.ref)?.items.find((i) => i.id === target) : t.ref ? ctx.referenceList(t.ref)?.items.find((i) => i.id === target) : undefined;
  if (t.kind === "pick" && !item) {
    const q = quote(def, option, fields, ctx, target, undefined);
    return { ...q, available: false, blocked: [`Unknown ${t.ref} item "${target}"`, ...q.blocked] };
  }
  return quote(def, option, fields, ctx, target, item);
}

/** The sheet fields after a spend (a new object; `fields` is not changed). The pool is not touched here. */
export function fieldsAfterSpend(option: SpendOptionDef, fields: Record<string, unknown>, target: string, to: number): Record<string, unknown> {
  const out = JSON.parse(JSON.stringify(fields)) as Record<string, unknown>;
  const t = option.target;
  if (t.kind === "level") {
    const obj = isRecord(getPath(out, t.path)) ? (getPath(out, t.path) as Record<string, unknown>) : {};
    obj[target] = to;
    return setIn(out, t.path, obj);
  }
  const key = t.countKey ?? "count";
  const list = Array.isArray(getPath(out, t.path)) ? [...(getPath(out, t.path) as unknown[])] : [];
  const at = list.findIndex((e) => (isRecord(e) && e.id === target) || e === target);
  if (to <= 0) {
    if (at >= 0) list.splice(at, 1);
  } else if (at < 0) {
    list.push(to === 1 ? { id: target } : { id: target, [key]: to });
  } else {
    const cur: Record<string, unknown> = isRecord(list[at]) ? { ...(list[at] as Record<string, unknown>) } : { id: target };
    if (to === 1) delete cur[key];
    else cur[key] = to;
    list[at] = cur;
  }
  return setIn(out, t.path, list);
}

/** The current level or count of a spend's target on the sheet. */
export function spendTargetValue(option: SpendOptionDef, fields: Record<string, unknown>, target: string): number {
  const t = option.target;
  return t.kind === "level" ? num(getPath(fields, `${t.path}.${target}`), 0) : pickCount(t, fields, target);
}

function setIn(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const segs = path.split(".").filter(Boolean);
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < segs.length - 1; i++) {
    const s = segs[i] as string;
    if (!isRecord(cur[s])) cur[s] = {};
    cur = cur[s] as Record<string, unknown>;
  }
  cur[segs[segs.length - 1] as string] = value;
  return obj;
}
