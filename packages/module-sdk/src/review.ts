/**
 * Adventure builder review engine: runs a builder's review rules over a
 * plain-data context and grades the draft (bad / warn / ok). Game-agnostic:
 * the rules, steps and messages come from the module; the context comes from
 * the core (`adventureReviewContext`). A rule that throws becomes one warning
 * naming the rule; the review itself never throws and never blocks anything.
 */
import { computeFields } from "./entities";
import { evaluateLogic, getPath } from "./logic";
import type { AdventureBuilderDef, EntityTypeDef, NarrativeFieldsDef, NarrativeKind, PageRef, ReviewRule } from "./types";

export type ReviewItemLevel = "bad" | "warn" | "ok";
/** A step's status dot: its worst item, "ok" when its rules found nothing, "none" when no rule covers it. */
export type ReviewStepStatus = ReviewItemLevel | "none";

export interface ReviewItem {
  ruleId: string;
  step: string;
  level: ReviewItemLevel;
  message: string;
  page?: PageRef;
}

export interface ReviewResult {
  /** Sorted bad, then warn, then ok; rule order within a level. */
  items: ReviewItem[];
  byStep: Record<string, ReviewStepStatus>;
  summary: { bad: number; warn: number; ok: number };
}

/** The plain data review rules read (see the core's `adventureReviewContext`). */
export type ReviewContext = Record<string, unknown>;

/** Context keys the core fills; cast role ids must not reuse them. */
export const REVIEW_CONTEXT_KEYS: readonly string[] = ["adventure", "acts", "scenes", "cast", "handouts", "item", "index"];

/** Collections a rule's `each` may name besides the builder's cast role ids. */
export const REVIEW_COLLECTIONS: readonly string[] = ["acts", "scenes", "handouts"];

/**
 * Core record fields a builder panel may name with the `core.` prefix, per
 * narrative kind. Rich-text bodies (playerIntro, pacing, body...) are edited
 * in place and reach the review context as plain text.
 */
export const CORE_NARRATIVE_FIELDS: Readonly<Record<NarrativeKind, readonly string[]>> = {
  adventure: ["title", "premise", "status", "playerIntro", "gmSituation", "epilogue", "hooksIn", "hooksOut", "tags"],
  act: ["title", "goal", "pacing"],
  scene: ["title", "purpose", "status", "mandatory", "body", "readAloud"],
};

const LEVEL_ORDER: Record<ReviewItemLevel, number> = { bad: 0, warn: 1, ok: 2 };

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function str(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(str).join(", ");
  return JSON.stringify(v);
}

/** The act number a review item is about: `act` (scenes, handouts) or `number` (acts). */
function actOf(item: Record<string, unknown>): unknown {
  if (item.act !== undefined && item.act !== null && typeof item.act !== "object") return item.act;
  return item.number;
}

/**
 * Fill `{name}`, `{n}` (1-based index), `{act}` and `{value}` in a message.
 * `{name}` is the item's name, else its title. Unknown placeholders stay as they are.
 */
export function fillReviewMessage(message: string, vars: { item?: Record<string, unknown>; index?: number; value?: unknown }): string {
  const item = vars.item ?? {};
  return message.replace(/\{(name|n|act|value)\}/g, (whole, key: string) => {
    switch (key) {
      case "name":
        return str(item.name ?? item.title);
      case "n":
        return String((vars.index ?? 0) + 1);
      case "act":
        return str(actOf(item));
      case "value":
        return str(vars.value);
      default:
        return whole;
    }
  });
}

function runRule(rule: ReviewRule, ctx: ReviewContext): ReviewItem[] {
  const base = (level: ReviewItemLevel, message: string): ReviewItem => {
    const item: ReviewItem = { ruleId: rule.id, step: rule.step, level, message };
    if (rule.page !== undefined) item.page = rule.page;
    return item;
  };
  const targets: Array<{ item: Record<string, unknown>; index: number }> = [];
  if (rule.each) {
    const list = getPath(ctx, rule.each);
    if (Array.isArray(list)) list.forEach((it, index) => targets.push({ item: isRecord(it) ? it : { value: it }, index }));
  } else {
    // A rule without `each` runs once; its item is the adventure.
    targets.push({ item: isRecord(ctx.adventure) ? ctx.adventure : {}, index: 0 });
  }
  const issues: ReviewItem[] = [];
  for (const { item, index } of targets) {
    const data = { ...ctx, item, index };
    if (rule.when !== undefined && !evaluateLogic<unknown>(rule.when, data)) continue;
    const value = rule.value !== undefined ? evaluateLogic<unknown>(rule.value, data) : undefined;
    const vars = { item, index, value };
    if (rule.check) {
      const messages = rule.check(item, ctx);
      if (!Array.isArray(messages)) throw new Error("check() did not return a list of messages");
      for (const m of messages) issues.push(base(rule.level, fillReviewMessage(String(m), vars)));
    } else if (rule.when !== undefined) {
      issues.push(base(rule.level, fillReviewMessage(rule.message, vars)));
    }
  }
  if (issues.length === 0 && rule.okMessage) {
    const vars: { item?: Record<string, unknown>; value?: unknown } = {};
    if (!rule.each && isRecord(ctx.adventure)) vars.item = ctx.adventure;
    if (rule.value !== undefined) vars.value = evaluateLogic<unknown>(rule.value, { ...ctx, item: vars.item ?? {}, index: 0 });
    return [base("ok", fillReviewMessage(rule.okMessage, vars))];
  }
  return issues;
}

/**
 * Run every review rule of a builder over the context. Each rule runs once,
 * or once per item of its `each` collection; `when` (JSONLogic, true = issue)
 * and `check` (code, returns messages) may be used alone or together (`when`
 * then gates `check`). Rules that find nothing emit their `okMessage`.
 */
export function runAdventureReview(builder: Pick<AdventureBuilderDef, "steps" | "review">, ctx: ReviewContext): ReviewResult {
  const collected: Array<{ item: ReviewItem; order: number }> = [];
  let order = 0;
  const covered = new Set<string>();
  for (const rule of builder.review) {
    covered.add(rule.step);
    let items: ReviewItem[];
    try {
      items = runRule(rule, ctx);
    } catch (e) {
      const item: ReviewItem = { ruleId: rule.id, step: rule.step, level: "warn", message: `Review rule "${rule.id}" could not run: ${e instanceof Error ? e.message : String(e)}` };
      if (rule.page !== undefined) item.page = rule.page;
      items = [item];
    }
    for (const item of items) collected.push({ item, order: order++ });
  }
  collected.sort((a, b) => LEVEL_ORDER[a.item.level] - LEVEL_ORDER[b.item.level] || a.order - b.order);
  const items = collected.map((c) => c.item);

  const byStep: Record<string, ReviewStepStatus> = {};
  for (const step of builder.steps) byStep[step.id] = covered.has(step.id) ? "ok" : "none";
  for (const item of items) {
    const current = byStep[item.step] ?? "none";
    if (current === "none" || LEVEL_ORDER[item.level] < LEVEL_ORDER[current]) byStep[item.step] = item.level;
  }
  const summary = { bad: 0, warn: 0, ok: 0 };
  for (const item of items) summary[item.level]++;
  return { items, byStep, summary };
}

/** The review summary line: "N items to fix" when anything is bad, else "Ready". */
export function reviewHeadline(result: ReviewResult): string {
  const { bad } = result.summary;
  return bad > 0 ? `${bad} item${bad === 1 ? "" : "s"} to fix` : "Ready";
}

// ---------------------------------------------------------------------------
// narrative fields as a sheet-renderable type
// ---------------------------------------------------------------------------

const narrativeTypes = new WeakMap<NarrativeFieldsDef, EntityTypeDef>();

/**
 * A narrative fields def seen as an entity type, so the schema-driven sheet
 * renderer, validators and `computeFields` work on adventures, acts and
 * scenes exactly as on entities. Cached per def (validators cache by identity).
 */
export function narrativeEntityType(def: NarrativeFieldsDef): EntityTypeDef {
  let t = narrativeTypes.get(def);
  if (!t) {
    t = { id: `narrative.${def.kind}`, kind: "item", name: def.kind, plural: def.kind, schema: def.schema, sheet: def.sheet };
    if (def.computed) t.computed = def.computed;
    if (def.mode) t.mode = def.mode;
    narrativeTypes.set(def, t);
  }
  return t;
}

/** Computed values of a narrative record (same mechanism as entities); never stored. */
export function computeNarrativeFields(def: NarrativeFieldsDef | undefined, fields: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!def?.computed) return {};
  return computeFields(narrativeEntityType(def), fields ?? {});
}
