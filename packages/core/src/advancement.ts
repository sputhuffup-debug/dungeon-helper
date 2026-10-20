/**
 * The advancement log: every award into a character's pools (experience,
 * story points) and every spend out of them, per character.
 *
 * Stored versus derived: a pool is a running value on the sheet (the field
 * the module's `ProgressionPoolDef.path` names), because the rules treat it
 * as one: points are written down when earned, crossed off when spent, capped
 * (story points) and carried over. It is state, like stress or damage, not a
 * value computed from other fields. Every change made through this file moves
 * the pool and appends one log entry in the same transaction, so the log is
 * the pool's history. Lifetime totals (earned, spent) are summed from the log
 * on read and never stored.
 *
 * Game-agnostic: costs, caps, questions and pools come from the module's
 * `ProgressionDef`.
 */
import {
  advances,
  awardTotals,
  clampPool,
  computeFields,
  fieldsAfterSpend,
  progressionPool,
  poolValue,
  quoteSpend,
  spendTargetValue,
  type GameModule,
  type PlayModeId,
  type ProgressionDef,
  type ProgressionPoolDef,
  type ProgressionPoolId,
  type SpendQuote,
} from "@campaign-forge/module-sdk";
import { setPath } from "./paths";
import { now } from "./ids";
import type { CampaignStore, NewRecord } from "./store";
import type { AdvancementEntry, Entity, Id, Visibility } from "./types";

const GM: Visibility = { level: "gm" };

export type AdvancementModule = Pick<GameModule, "entityTypes" | "referenceLists"> & Partial<Pick<GameModule, "progression">>;

type Source = AdvancementEntry["source"];

interface Common {
  session?: Id;
  adventure?: Id;
  act?: number;
  inWorldDate?: string;
  realDate?: string;
  source?: Source;
  visibility?: Visibility;
}

function requireDef(module: AdvancementModule): ProgressionDef {
  if (!module.progression) throw new Error("the module has no progression rules");
  return module.progression;
}

function requirePool(def: ProgressionDef, pool: ProgressionPoolId): ProgressionPoolDef {
  const p = progressionPool(def, pool);
  if (!p) throw new Error(`the module's progression has no ${pool} pool`);
  return p;
}

function requireCharacter(store: CampaignStore, def: ProgressionDef, id: Id): Entity {
  const e = store.get("entities", id);
  if (!e) throw new Error(`entities/${id} not found`);
  if (!advances(def, e)) throw new Error(`${e.name} does not advance under the module's rules`);
  return e;
}

function entryBase(store: CampaignStore, c: Common): Pick<NewRecord<"advancement">, "realDate" | "visibility"> & Partial<NewRecord<"advancement">> {
  const out: Pick<NewRecord<"advancement">, "realDate" | "visibility"> & Partial<NewRecord<"advancement">> = {
    realDate: c.realDate ?? now().slice(0, 10),
    visibility: c.visibility ?? GM,
  };
  const date = c.inWorldDate ?? store.meta().currentDate;
  if (date) out.inWorldDate = date;
  if (c.session) out.session = c.session;
  if (c.adventure) out.adventure = c.adventure;
  if (c.act !== undefined) out.act = c.act;
  if (c.source) out.source = c.source;
  return out;
}

/** Set a pool on the sheet (within its bounds); returns the change actually made. */
function movePool(store: CampaignStore, entity: Entity, pool: ProgressionPoolDef, by: number): { before: number; after: number } {
  const before = poolValue(pool, entity.fields);
  const after = clampPool(pool, before + by);
  if (after !== before) {
    const fields = JSON.parse(JSON.stringify(entity.fields)) as Record<string, unknown>;
    setPath(fields, pool.path, after);
    store.update("entities", entity.id, { fields });
  }
  return { before, after };
}

/** The entry already posted under `key`, if any. */
export function advancementByKey(store: CampaignStore, key: string): AdvancementEntry | undefined {
  return store.list("advancement").find((e) => e.key === key);
}

// ---------------------------------------------------------------------------
// awards
// ---------------------------------------------------------------------------

export interface PostAwardInput extends Common {
  character: Id;
  /** Award question ids answered yes; their points are summed per pool. */
  questions?: string[];
  /** A plain award instead (e.g. a GM bonus), into `pool`. */
  amount?: number;
  pool?: ProgressionPoolId;
  /** One line; defaults to the questions' texts. */
  reason?: string;
  /** Idempotency key; one entry per pool is posted under `<key>:<pool>`. */
  key?: string;
}

/**
 * Award points: the questions answered yes (one entry per pool they pay
 * into), or a plain amount. The pool moves by the award, up to its maximum;
 * points over the cap are recorded as `capped`. With a `key` that was already
 * posted, nothing changes for that pool.
 */
export function postAward(store: CampaignStore, module: AdvancementModule, input: PostAwardInput): AdvancementEntry[] {
  const def = requireDef(module);
  return store.transact(() => {
    const out: AdvancementEntry[] = [];
    const amounts: Partial<Record<ProgressionPoolId, number>> = {};
    const byPool: Partial<Record<ProgressionPoolId, string[]>> = {};
    if (input.questions?.length) {
      const known = def.awards.filter((q) => input.questions!.includes(q.id));
      const unknown = input.questions.filter((id) => !known.some((q) => q.id === id));
      if (unknown.length) throw new Error(`unknown award question(s): ${unknown.join(", ")}`);
      const totals = awardTotals(known, input.questions);
      for (const q of known) (byPool[q.pool ?? "experience"] ??= []).push(q.id);
      for (const [pool, n] of Object.entries(totals) as Array<[ProgressionPoolId, number]>) if (n > 0) amounts[pool] = n;
    }
    if (input.amount !== undefined) {
      if (!Number.isInteger(input.amount) || input.amount <= 0) throw new Error("award amount must be a positive integer");
      const pool = input.pool ?? "experience";
      amounts[pool] = (amounts[pool] ?? 0) + input.amount;
    }
    for (const [pool, amount] of Object.entries(amounts) as Array<[ProgressionPoolId, number]>) {
      const poolDef = requirePool(def, pool);
      const key = input.key ? `${input.key}:${pool}` : undefined;
      if (key) {
        const existing = advancementByKey(store, key);
        if (existing) {
          out.push(existing);
          continue;
        }
      }
      const entity = requireCharacter(store, def, input.character);
      const { before, after } = movePool(store, entity, poolDef, amount);
      const applied = after - before;
      const questions = byPool[pool] ?? [];
      const texts = questions.map((id) => def.awards.find((q) => q.id === id)?.text ?? id);
      const rec: NewRecord<"advancement"> = {
        ...entryBase(store, input),
        character: entity.id,
        pool,
        kind: "award",
        amount: applied,
        reason: input.reason?.trim() || (texts.length ? texts.join(" / ") : "Award"),
      };
      if (applied < amount) rec.capped = amount - applied;
      if (questions.length) rec.questions = questions;
      if (key) rec.key = key;
      out.push(store.insert("advancement", rec));
    }
    return out;
  });
}

// ---------------------------------------------------------------------------
// spending a pool directly (story points at the table) and adjustments
// ---------------------------------------------------------------------------

export interface SpendPointsInput extends Common {
  character: Id;
  pool: ProgressionPoolId;
  /** Points spent (default: the use's cost, else 1). */
  amount?: number;
  /** Story point use id from the module's `storyPoints.uses`. */
  use?: string;
  reason?: string;
}

/** Spend points from a pool without changing the sheet otherwise (e.g. a story point on a roll). Throws when the pool is short. */
export function spendPoints(store: CampaignStore, module: AdvancementModule, input: SpendPointsInput): AdvancementEntry {
  const def = requireDef(module);
  const poolDef = requirePool(def, input.pool);
  const use = input.use ? def.storyPoints?.uses.find((u) => u.id === input.use) : undefined;
  if (input.use && !use) throw new Error(`unknown story point use "${input.use}"`);
  const amount = input.amount ?? use?.cost ?? 1;
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("spend amount must be a positive integer");
  return store.transact(() => {
    const entity = requireCharacter(store, def, input.character);
    const have = poolValue(poolDef, entity.fields);
    if (have - amount < (poolDef.min ?? 0)) throw new Error(`${entity.name} has ${have} ${poolDef.label}; needs ${amount}`);
    movePool(store, entity, poolDef, -amount);
    const rec: NewRecord<"advancement"> = {
      ...entryBase(store, input),
      character: entity.id,
      pool: input.pool,
      kind: "spend",
      amount: -amount,
      reason: input.reason?.trim() || use?.label || `Spent ${amount} ${poolDef.label}`,
    };
    if (use) rec.use = use.id;
    return store.insert("advancement", rec);
  });
}

export interface AdjustPoolInput extends Common {
  character: Id;
  pool: ProgressionPoolId;
  /** Set the pool to this value (within its bounds) ... */
  to?: number;
  /** ... or move it by this much. */
  by?: number;
  reason: string;
}

/** A GM correction or a rule that resets the pool (e.g. carrying story points over); logged as an adjustment. Returns undefined when nothing changed. */
export function adjustPool(store: CampaignStore, module: AdvancementModule, input: AdjustPoolInput): AdvancementEntry | undefined {
  const def = requireDef(module);
  const poolDef = requirePool(def, input.pool);
  return store.transact(() => {
    const entity = requireCharacter(store, def, input.character);
    const current = poolValue(poolDef, entity.fields);
    const target = input.to !== undefined ? input.to : current + (input.by ?? 0);
    const { before, after } = movePool(store, entity, poolDef, target - current);
    if (after === before) return undefined;
    return store.insert("advancement", {
      ...entryBase(store, input),
      character: entity.id,
      pool: input.pool,
      kind: "adjust",
      amount: after - before,
      reason: input.reason.trim() || "Adjustment",
    });
  });
}

// ---------------------------------------------------------------------------
// spending on the sheet (skills, talents)
// ---------------------------------------------------------------------------

export interface ApplySpendInput extends Common {
  character: Id;
  option: string;
  /** Skill key or reference item id. */
  target: string;
  mode?: PlayModeId;
  /** The GM confirms the option's "confirm" checks (e.g. a teacher). Required when the quote lists any. */
  confirmed?: boolean;
}

/** A quote for a spend on a character's sheet (cost, caps, preconditions, the pool after). */
export function quoteCharacterSpend(store: CampaignStore, module: AdvancementModule, input: Pick<ApplySpendInput, "character" | "option" | "target" | "mode">): SpendQuote {
  const def = requireDef(module);
  const option = def.spends.find((o) => o.id === input.option);
  if (!option) throw new Error(`unknown spend option "${input.option}"`);
  const entity = requireCharacter(store, def, input.character);
  return quoteSpend(def, option, entity.fields, input.target, spendContext(module, entity, input.mode));
}

/** The lookups a spend quote needs for one character. */
export function spendContext(module: AdvancementModule, entity: Pick<Entity, "type" | "fields">, mode?: PlayModeId) {
  const typeDef = module.entityTypes.find((t) => t.id === entity.type);
  let computed: Record<string, unknown> = {};
  try {
    computed = typeDef ? computeFields(typeDef, entity.fields) : {};
  } catch {
    computed = {};
  }
  return { referenceList: (id: string) => module.referenceLists.find((l) => l.id === id), computed, ...(mode ? { mode } : {}) };
}

/**
 * Buy a step: check the quote (blocked spends throw; "confirm" checks need
 * `confirmed`), change the sheet (skill level, talent), pay from the pool and
 * log the spend, all in one transaction.
 */
export function applySpend(store: CampaignStore, module: AdvancementModule, input: ApplySpendInput): { entry: AdvancementEntry; quote: SpendQuote } {
  const def = requireDef(module);
  return store.transact(() => {
    const quote = quoteCharacterSpend(store, module, input);
    if (quote.blocked.length) throw new Error(quote.blocked.join("; "));
    if (quote.confirm.length && !input.confirmed) throw new Error(`confirm first: ${quote.confirm.join("; ")}`);
    const option = def.spends.find((o) => o.id === input.option)!;
    const poolDef = requirePool(def, quote.pool);
    const entity = store.get("entities", input.character)!;
    const fields = fieldsAfterSpend(option, entity.fields, quote.target, quote.to);
    setPath(fields, poolDef.path, clampPool(poolDef, poolValue(poolDef, entity.fields) - quote.cost));
    store.update("entities", entity.id, { fields });
    const entry = store.insert("advancement", {
      ...entryBase(store, input),
      character: entity.id,
      pool: quote.pool,
      kind: "spend",
      amount: -quote.cost,
      reason: `${option.label}: ${quote.label} ${describeStep(option.target.kind, quote.from, quote.to)}`,
      spend: { option: option.id, target: quote.target, label: quote.label, from: quote.from, to: quote.to, cost: quote.cost },
    });
    return { entry, quote };
  });
}

function describeStep(kind: "level" | "pick", from: number, to: number): string {
  if (kind === "level") return `${from} → ${to}`;
  return to === 1 ? "(new)" : `(×${to})`;
}

export interface UndoCheck {
  entry?: AdvancementEntry;
  ok: boolean;
  reason?: string;
}

/**
 * Whether the character's last sheet spend can be undone: it must be the most
 * recent spend on the sheet, and the skill or talent must still read what the
 * spend left (nothing changed it since).
 */
export function lastSpendUndo(store: CampaignStore, module: AdvancementModule, character: Id): UndoCheck {
  const def = module.progression;
  const entry = advancementLog(store, character).filter((e) => e.kind === "spend" && e.spend).pop();
  if (!def || !entry?.spend) return { ok: false, reason: "No spend to undo" };
  const option = def.spends.find((o) => o.id === entry.spend!.option);
  const entity = store.get("entities", character);
  if (!option || !entity) return { entry, ok: false, reason: "The spend option or the character is gone" };
  const current = spendTargetValue(option, entity.fields, entry.spend.target);
  if (current !== entry.spend.to) return { entry, ok: false, reason: `${entry.spend.label} has changed since (${current}, not ${entry.spend.to})` };
  return { entry, ok: true };
}

/** Undo the last sheet spend: put the skill or talent back, refund the cost, remove the entry. */
export function undoLastSpend(store: CampaignStore, module: AdvancementModule, character: Id): AdvancementEntry {
  const def = requireDef(module);
  return store.transact(() => {
    const check = lastSpendUndo(store, module, character);
    if (!check.ok || !check.entry?.spend) throw new Error(check.reason ?? "nothing to undo");
    const { spend } = check.entry;
    const option = def.spends.find((o) => o.id === spend.option)!;
    const poolDef = requirePool(def, check.entry.pool);
    const entity = store.get("entities", character)!;
    const fields = fieldsAfterSpend(option, entity.fields, spend.target, spend.from);
    setPath(fields, poolDef.path, clampPool(poolDef, poolValue(poolDef, entity.fields) + spend.cost));
    store.update("entities", character, { fields });
    store.remove("advancement", check.entry.id);
    return check.entry;
  });
}

// ---------------------------------------------------------------------------
// reading
// ---------------------------------------------------------------------------

/** A character's log (or everyone's), oldest first. */
export function advancementLog(store: CampaignStore, character?: Id): AdvancementEntry[] {
  return store
    .list("advancement")
    .filter((e) => !character || e.character === character)
    .sort((a, b) => a.created.localeCompare(b.created) || a.id.localeCompare(b.id));
}

export interface PoolTotals {
  /** Points awarded (after caps). */
  earned: number;
  /** Points spent (a positive number). */
  spent: number;
  /** Net of GM adjustments. */
  adjusted: number;
}

/** Lifetime totals per pool, summed from the log on every call (never stored). */
export function advancementTotals(store: CampaignStore, character: Id): Record<ProgressionPoolId, PoolTotals> {
  const out: Record<ProgressionPoolId, PoolTotals> = { experience: { earned: 0, spent: 0, adjusted: 0 }, story: { earned: 0, spent: 0, adjusted: 0 } };
  for (const e of store.list("advancement")) {
    if (e.character !== character) continue;
    const t = out[e.pool] ?? (out[e.pool] = { earned: 0, spent: 0, adjusted: 0 });
    if (e.kind === "award") t.earned += e.amount;
    else if (e.kind === "spend") t.spent -= e.amount;
    else t.adjusted += e.amount;
  }
  return out;
}

/** Entries posted for a session (wrap-up awards, table spends). */
export function sessionAdvancement(store: CampaignStore, session: Id): AdvancementEntry[] {
  return advancementLog(store).filter((e) => e.session === session);
}

/** The pool's value on a character's sheet (0 when the module has no such pool). */
export function characterPool(module: AdvancementModule, entity: Pick<Entity, "fields">, pool: ProgressionPoolId): number {
  const p = progressionPool(module.progression, pool);
  return p ? poolValue(p, entity.fields) : 0;
}
