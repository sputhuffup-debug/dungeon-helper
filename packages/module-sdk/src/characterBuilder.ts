/**
 * The character builder: a module's step-by-step wizard (`characterBuilders`
 * in the contract) resolved against a draft of the player's picks.
 *
 * `resolveCharacterBuilder` turns a definition and a draft into the
 * character's stored fields, every grant with its source, the options of
 * every choice (with sub-choices a pick brings), and what is missing or
 * wrong. It is pure and deterministic: the same module, draft and base
 * fields give the same character. Randomness (4d6 drop lowest, rolled hit
 * points) is rolled by the app with a seeded or entered Rng and stored in
 * the draft as faces, so a draft always replays the same.
 *
 * Computed values are never written: grants write stored fields only, and
 * rules read computed values through `computed` (rule 4).
 */
import { computeFields, defaultFieldsFor, fieldSchemaAt, validateEntityFields } from "./entities";
import { parseDiceExpression, rollDice } from "./dice";
import { evaluateLogic, getPath, logicIssues, setPath } from "./logic";
import type {
  CharacterBuilderAbilityMethod,
  CharacterBuilderAbilityStep,
  CharacterBuilderCheck,
  CharacterBuilderChoice,
  CharacterBuilderDef,
  CharacterBuilderGrant,
  CharacterBuilderSource,
  CharacterBuilderStep,
  CharacterBuilderSubChoice,
  EntityTypeDef,
  GameModule,
  JsonLogicRule,
  PageRef,
  ReferenceItem,
  Rng,
} from "./types";

// ---------------------------------------------------------------------------
// Drafts: what the player picked so far (stored by the app until finished)
// ---------------------------------------------------------------------------

/** One ability step's state: the method and the base scores it gave. */
export interface AbilityDraft {
  method: string;
  /** Base score by ability id (what the method produced, assigned to abilities). */
  scores: Record<string, number>;
  /** The roll method's sets: the faces of each set and its total (kept dice only). */
  rolled?: Array<{ faces: number[]; total: number }>;
  /** The rolled dice were typed in from the table. */
  entered?: boolean;
}

/** A rolled option's dice (rolled hit points). */
export interface BuilderRoll {
  faces: number[];
  total: number;
  entered?: boolean;
}

export interface CharacterBuilderDraft {
  builder: string;
  mode: "create" | "levelUp";
  /** Choice path -> picked option ids (see `ChoiceState.path`). */
  picks: Record<string, string[]>;
  /** `<choice path>#<option id>` -> the dice an option that rolls was rolled with. */
  rolls?: Record<string, BuilderRoll>;
  /** Ability step id -> its state. */
  abilities?: Record<string, AbilityDraft>;
  /** Fields step id -> field path -> value. */
  values?: Record<string, Record<string, unknown>>;
  /** The step the player was on (the app reopens it). */
  step?: string;
}

export function emptyDraft(builder: CharacterBuilderDef, mode: "create" | "levelUp" = "create"): CharacterBuilderDraft {
  return { builder: builder.id, mode, picks: {} };
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export type BuilderIssueLevel = "incomplete" | "error" | "warning";

export interface BuilderIssue {
  level: BuilderIssueLevel;
  /** Step id. */
  step: string;
  /** Choice path, when the issue belongs to one choice. */
  path?: string;
  message: string;
}

export interface OptionState {
  id: string;
  name: string;
  summary?: string;
  description?: string;
  /** The raw option: a reference item (with `builder` data attached), a fixed option, a value or a preset. */
  item: Record<string, unknown>;
  value: unknown;
  available: boolean;
  /** Why it cannot be picked. */
  reason?: string;
  edition?: string;
  source?: string;
  page?: PageRef;
  cite?: string;
  original?: boolean;
  /** The dice picking it rolls (an option that rolls). */
  roll?: string;
}

export interface ChoiceState {
  /** Unique within the draft: the step id, then `/<sub-choice id>` (with `.<n>` per `each` element and `/<pick id>` under a multi-pick). */
  path: string;
  step: string;
  /** The sub-choice id (the step id for a step's own choice). */
  id: string;
  label: string;
  help?: string;
  options: OptionState[];
  picked: string[];
  min: number;
  max: number;
  /** Item keys for the option cards. */
  columns: string[];
  /** Options that come from a numeric range (shown as a number picker). */
  range: boolean;
  issues: BuilderIssue[];
  sub: ChoiceState[];
  /** The pick a sub-choice belongs to (its name), for headings. */
  parentName?: string;
}

export interface AbilityState {
  method: string;
  abilities: Array<{ id: string; name: string; abbr?: string; base: number | undefined; bonus: number; score: number; modifier?: number }>;
  /** Point buy: points spent and the budget. */
  spent?: number;
  budget?: number;
  /** The values still to assign (array and roll methods). */
  pool?: number[];
}

export interface StepState {
  id: string;
  kind: CharacterBuilderStep["kind"];
  title: string;
  skipped: boolean;
  summary: string;
  status: "ok" | "incomplete" | "error";
  issues: BuilderIssue[];
  choice?: ChoiceState;
  abilities?: AbilityState;
}

export interface AppliedGrant {
  step: string;
  /** The choice path whose pick made it ("" for `finally`). */
  path: string;
  /** "background Criminal (2024)", "base scores (point buy)", "builder". */
  source: string;
  field: string;
  op: NonNullable<CharacterBuilderGrant["op"]>;
  value: unknown;
  /** What the module said to show, if anything ("+2 Dexterity"). */
  label?: string;
  hidden?: boolean;
}

export interface CharacterBuilderResult {
  /** The stored fields the character will have. */
  fields: Record<string, unknown>;
  computed: Record<string, unknown>;
  /** The entity name and summary (`core.name`, `core.summary`), when given. */
  name?: string;
  summary?: string;
  vars: Record<string, unknown>;
  grants: AppliedGrant[];
  steps: StepState[];
  issues: BuilderIssue[];
  preview: Array<{ label: string; value: string }>;
  /** What the builder leaves to the player (the review step's `todo`). */
  todo: string[];
  /** Nothing missing and no errors: the character can be finished. */
  complete: boolean;
}

/** One record of `choices.<step id>` in the rule context. */
export interface ChoiceRecord {
  id?: string;
  ids: string[];
  item?: Record<string, unknown>;
  items: Array<Record<string, unknown>>;
  value?: unknown;
  values: unknown[];
  rolled?: number;
  sub: Record<string, ChoiceRecord | ChoiceRecord[]>;
  /** Sub-choices per pick, for choices that take several picks (`sub` is the first pick's). */
  subs?: Record<string, Record<string, ChoiceRecord | ChoiceRecord[]>>;
}

export interface ResolveOptions {
  /** Starting fields: the character being levelled up (default: the type's defaults and the builder's `defaults`). */
  base?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

/** The builders of a module for an entity type (all of them without one). */
export function characterBuildersFor(module: GameModule, entityType?: string): CharacterBuilderDef[] {
  return (module.characterBuilders ?? []).filter((b) => entityType === undefined || b.entityType === entityType);
}

export function characterBuilderById(module: GameModule, id: string): CharacterBuilderDef | undefined {
  return (module.characterBuilders ?? []).find((b) => b.id === id);
}

/** The steps of a draft's mode. */
export function builderSteps(builder: CharacterBuilderDef, mode: "create" | "levelUp"): CharacterBuilderStep[] {
  return mode === "levelUp" ? (builder.levelUp?.steps ?? []) : builder.steps;
}

/** Can this character be levelled up with the builder (its `levelUp.when`)? */
export function canLevelUp(module: GameModule, builder: CharacterBuilderDef, fields: Record<string, unknown>): boolean {
  if (!builder.levelUp) return false;
  if (builder.levelUp.when === undefined) return true;
  const def = module.entityTypes.find((t) => t.id === builder.entityType);
  try {
    return !!evaluateLogic(builder.levelUp.when, { fields, computed: def ? computeFields(def, fields) : {} });
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));
const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

function asText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(asText).filter(Boolean).join(", ");
  if (isObj(v) && typeof v.name === "string") return v.name;
  return "";
}

function asInt(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/** "+2", "−1", "0". */
export function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0";
}

function humanize(key: string): string {
  const s = key.replace(/[-_]/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function isListSource(s: CharacterBuilderSource): s is { list: string; where?: JsonLogicRule } {
  return "list" in s && !("values" in s);
}

// ---------------------------------------------------------------------------
// Ability methods
// ---------------------------------------------------------------------------

/** Points a set of scores costs with a point-buy method (undefined when a score is outside its table). */
export function pointBuyCost(method: Extract<CharacterBuilderAbilityMethod, { kind: "pointBuy" }>, scores: Record<string, number>, abilities: string[]): number | undefined {
  let total = 0;
  for (const a of abilities) {
    const s = scores[a] ?? method.min;
    const c = method.costs[String(s)];
    if (c === undefined) return undefined;
    total += c;
  }
  return total;
}

/**
 * Roll a roll method's scores: `count` sets of `dice`, keeping the highest
 * `keep` dice of each. Every die is one `rng.int` call labelled "Score n: d6",
 * so a GM rolling at the table types each face in order (see `planEntry`).
 */
export function rollAbilityScores(method: Extract<CharacterBuilderAbilityMethod, { kind: "roll" }>, count: number, rng: Rng): Array<{ faces: number[]; total: number }> {
  const expr = parseDiceExpression(method.dice);
  const out: Array<{ faces: number[]; total: number }> = [];
  for (let i = 0; i < count; i++) {
    const faces: number[] = [];
    let flat = 0;
    for (const term of expr.terms) {
      if (term.kind === "const") flat += term.value;
      else if (term.kind === "dice") for (let d = 0; d < term.count; d++) faces.push(rng.int(1, term.faces, { label: `Score ${i + 1}: d${term.faces}` }));
      else faces.push(rng.int(1, 6, { label: `Score ${i + 1}: d6` }) * 10 + rng.int(1, 6, { label: `Score ${i + 1}: d6` }));
    }
    const keep = method.keep ?? faces.length;
    const kept = [...faces].sort((a, b) => b - a).slice(0, keep);
    out.push({ faces, total: kept.reduce((s, f) => s + f, 0) + flat });
  }
  return out;
}

/** Roll an option's dice (rolled hit points) with the app's Rng or entered faces. */
export function rollOptionDice(expr: string, rng: Rng): BuilderRoll {
  const r = rollDice(expr, rng);
  return { faces: r.raw, total: r.total };
}

function abilityMethodIssues(step: CharacterBuilderAbilityStep, method: CharacterBuilderAbilityMethod, draft: AbilityDraft): BuilderIssue[] {
  const ids = step.abilities.map((a) => a.id);
  const issues: BuilderIssue[] = [];
  const add = (level: BuilderIssueLevel, message: string) => issues.push({ level, step: step.id, message });
  const missing = ids.filter((a) => typeof draft.scores[a] !== "number");
  if (method.kind === "pointBuy") {
    for (const a of ids) {
      const s = draft.scores[a] ?? method.min;
      if (s < method.min || s > method.max) add("error", `${nameOf(step, a)} must be from ${method.min} to ${method.max} with ${method.name.toLowerCase()}.`);
    }
    const cost = pointBuyCost(method, Object.fromEntries(ids.map((a) => [a, draft.scores[a] ?? method.min])), ids);
    if (cost !== undefined && cost > method.budget) add("error", `${cost} points spent; the budget is ${method.budget}.`);
    else if (cost !== undefined && cost < method.budget) add("warning", `${method.budget - cost} of ${method.budget} points left to spend.`);
    return issues;
  }
  if (missing.length) add("incomplete", `Give a score to ${missing.map((a) => nameOf(step, a)).join(", ")}.`);
  if (method.kind === "manual") {
    for (const a of ids) {
      const s = draft.scores[a];
      if (typeof s === "number" && (s < method.min || s > method.max)) add("error", `${nameOf(step, a)} must be from ${method.min} to ${method.max}.`);
    }
    return issues;
  }
  const pool = method.kind === "array" ? method.values : (draft.rolled ?? []).map((r) => r.total);
  if (method.kind === "roll" && pool.length === 0) {
    issues.length = 0;
    add("incomplete", `Roll ${method.dice}${method.keep !== undefined ? ` (keep the highest ${method.keep})` : ""} for each score.`);
    return issues;
  }
  if (!missing.length) {
    const used = ids.map((a) => draft.scores[a] as number);
    const left = [...pool];
    let ok = true;
    for (const u of used) {
      const i = left.indexOf(u);
      if (i < 0) ok = false;
      else left.splice(i, 1);
    }
    if (!ok) add("error", `Use each value once: ${pool.join(", ")}.`);
  }
  return issues;
}

function nameOf(step: CharacterBuilderAbilityStep, id: string): string {
  return step.abilities.find((a) => a.id === id)?.name ?? id;
}

/** The values an array or roll method still has to give out, after the scores assigned. */
export function unassignedValues(method: CharacterBuilderAbilityMethod, draft: AbilityDraft, abilities: string[]): number[] {
  const pool = method.kind === "array" ? [...method.values] : method.kind === "roll" ? (draft.rolled ?? []).map((r) => r.total) : [];
  for (const a of abilities) {
    const s = draft.scores[a];
    if (typeof s !== "number") continue;
    const i = pool.indexOf(s);
    if (i >= 0) pool.splice(i, 1);
  }
  return pool;
}

// ---------------------------------------------------------------------------
// Field labels (for the review page)
// ---------------------------------------------------------------------------

/** A readable name for a field path of the entity type: its sheet label, a reference item's name (skills.arcana -> Arcana), the schema title, or the key. */
export function builderFieldLabel(module: GameModule, def: EntityTypeDef | undefined, path: string): string {
  if (path === "core.name") return "Name";
  if (path === "core.summary") return "Summary";
  const fields = def?.sheet.sections.flatMap((s) => s.fields) ?? [];
  const exact = fields.find((f) => f.path === path && f.label);
  if (exact?.label) return exact.label;
  const segs = path.split(".");
  const last = segs[segs.length - 1] ?? path;
  const parent = segs.slice(0, -1).join(".");
  const star = fields.find((f) => f.path === `${parent}.*`);
  const ref = star?.config && typeof star.config.ref === "string" ? star.config.ref : undefined;
  if (ref) {
    const item = module.referenceLists.find((l) => l.id === ref)?.items.find((i) => i.id === last);
    if (item) return item.name;
  }
  const schema = def ? fieldSchemaAt(def, path) : undefined;
  if (schema && typeof schema.title === "string") return schema.title;
  const parentField = fields.find((f) => f.path === parent && f.label);
  if (parentField?.label && segs.length > 1) return `${parentField.label}: ${humanize(last)}`;
  return humanize(last);
}

function valueText(v: unknown): string {
  if (Array.isArray(v)) return v.map(valueText).filter(Boolean).join(", ");
  if (isObj(v)) {
    if (typeof v.name === "string") return [v.name, typeof v.quantity === "number" && v.quantity !== 1 ? `×${v.quantity}` : "", typeof v.level === "number" ? String(v.level) : ""].filter(Boolean).join(" ");
    return Object.entries(v)
      .filter(([, x]) => x !== undefined && x !== null && x !== "" && !isObj(x))
      .map(([k, x]) => `${k} ${asText(x)}`)
      .join(", ");
  }
  if (typeof v === "boolean") return v ? "yes" : "no";
  return asText(v);
}

/** How the review page reads a grant: "+2 Dexterity", "Speed 30", "Languages: Elvish". */
export function describeGrant(module: GameModule, def: EntityTypeDef | undefined, g: AppliedGrant): string {
  if (g.label) return g.label;
  const label = builderFieldLabel(module, def, g.field);
  switch (g.op) {
    case "add":
      return typeof g.value === "number" ? `${signed(g.value)} ${label}` : `${label} + ${valueText(g.value)}`;
    case "append":
      return `${label}: ${valueText(g.value)}`;
    case "remove":
      return `${label}: no ${valueText(g.value)}`;
    case "max":
      return `${label} at least ${valueText(g.value)}`;
    case "min":
      return `${label} at most ${valueText(g.value)}`;
    case "upsert":
      return `${label}: ${valueText(g.value)}`;
    default:
      return g.value === true ? label : `${label} ${valueText(g.value)}`;
  }
}

// ---------------------------------------------------------------------------
// The resolver
// ---------------------------------------------------------------------------

interface Ctx {
  [key: string]: unknown;
}

/** A context with more keys, without copying it (its `computed` stays lazy). */
function extend(ctx: Ctx, extra: Ctx): Ctx {
  return Object.assign(Object.create(ctx) as Ctx, extra);
}

class Resolver {
  readonly module: GameModule;
  readonly builder: CharacterBuilderDef;
  readonly def: EntityTypeDef | undefined;
  readonly draft: CharacterBuilderDraft;
  readonly mode: "create" | "levelUp";
  readonly steps: CharacterBuilderStep[];
  readonly base: Record<string, unknown>;
  readonly prior: Record<string, ChoiceRecord>;
  fields: Record<string, unknown>;
  vars: Record<string, unknown> = {};
  name: string | undefined;
  summary: string | undefined;
  grants: AppliedGrant[] = [];
  records: Record<string, ChoiceRecord> = {};
  stepStates: StepState[] = [];
  #computed: Record<string, unknown> | undefined;
  readonly lists: Map<string, ReferenceItem[]>;

  constructor(module: GameModule, builder: CharacterBuilderDef, draft: CharacterBuilderDraft, base: Record<string, unknown>, prior: Record<string, ChoiceRecord>) {
    this.module = module;
    this.builder = builder;
    this.def = module.entityTypes.find((t) => t.id === builder.entityType);
    this.draft = draft;
    this.mode = draft.mode;
    this.steps = builderSteps(builder, draft.mode);
    this.base = base;
    this.prior = prior;
    this.fields = clone(base);
    this.lists = new Map(module.referenceLists.map((l) => [l.id, l.items]));
  }

  computed(): Record<string, unknown> {
    if (!this.#computed) {
      try {
        this.#computed = this.def ? computeFields(this.def, this.fields) : {};
      } catch {
        this.#computed = {};
      }
    }
    return this.#computed;
  }

  setFields(next: Record<string, unknown>): void {
    this.fields = next;
    this.#computed = undefined;
  }

  ctx(extra: Ctx = {}): Ctx {
    const self = this;
    const out: Ctx = {
      choices: { ...this.prior, ...this.records },
      fields: this.fields,
      base: this.base,
      vars: this.vars,
      data: this.builder.data ?? {},
      mode: this.mode,
      ...extra,
    };
    Object.defineProperty(out, "computed", { get: () => self.computed(), enumerable: true });
    return out;
  }

  eval<T = unknown>(rule: JsonLogicRule | undefined, ctx: Ctx, where: { step: string; path?: string; what: string }, issues: BuilderIssue[]): T | undefined {
    if (rule === undefined) return undefined;
    try {
      return evaluateLogic<T>(rule, ctx);
    } catch (e) {
      issues.push({ level: "error", step: where.step, ...(where.path ? { path: where.path } : {}), message: `${where.what}: ${(e as Error).message}` });
      return undefined;
    }
  }

  /** A list item with the builder's data for it attached as `builder`. */
  enrich(listId: string, item: ReferenceItem): Record<string, unknown> {
    const data = this.builder.itemData?.[listId]?.[item.id];
    if (!data) return item;
    const own = isObj(item.builder) ? item.builder : {};
    return { ...item, builder: { ...data, ...own } };
  }

  // -------------------------------------------------------------------------
  // options
  // -------------------------------------------------------------------------

  options(choice: CharacterBuilderChoice, ctx: Ctx, step: string, path: string, issues: BuilderIssue[]): { options: OptionState[]; range: boolean } {
    const src = choice.source;
    if (!src) return { options: [], range: false };
    const at = { step, path, what: "options" };
    let raw: Array<{ item: Record<string, unknown>; id: string; name: string; value: unknown }> = [];
    let range = false;
    const keep = (where: JsonLogicRule | undefined, item: Record<string, unknown>) => where === undefined || !!this.eval(where, extend(ctx, { option: item }), at, issues);
    if ("options" in src) {
      raw = src.options.filter((o) => isObj(o)).map((o) => ({ item: o as Record<string, unknown>, id: o.id, name: o.name, value: o.value ?? o.id }));
    } else if ("range" in src) {
      range = true;
      const lo = asInt(this.eval(src.range.min as JsonLogicRule, ctx, at, issues), 1);
      const hi = asInt(this.eval(src.range.max as JsonLogicRule, ctx, at, issues), lo);
      for (let n = lo; n <= hi && n - lo < 1000; n++) raw.push({ item: { id: String(n), name: src.range.label ? `${src.range.label} ${n}` : String(n), value: n }, id: String(n), name: src.range.label ? `${src.range.label} ${n}` : String(n), value: n });
    } else if ("values" in src) {
      const v = this.eval<unknown>(src.values, ctx, at, issues);
      const items = src.list ? (this.lists.get(src.list) ?? []) : [];
      for (const x of Array.isArray(v) ? v : []) {
        if (typeof x === "string" || typeof x === "number") {
          const hit = src.list ? items.find((i) => i.id === String(x)) ?? items.find((i) => i.name.toLowerCase() === String(x).toLowerCase()) : undefined;
          if (hit) raw.push({ item: this.enrich(src.list!, hit), id: hit.id, name: hit.name, value: hit.id });
          else if (!src.list) raw.push({ item: { id: String(x), name: String(x), value: x }, id: String(x), name: String(x), value: x });
        } else if (isObj(x) && typeof x.id === "string") {
          raw.push({ item: x, id: x.id, name: typeof x.name === "string" ? x.name : x.id, value: x.value ?? x.id });
        }
      }
    } else if ("presets" in src) {
      const p = src.presets;
      for (const preset of this.module.presets) {
        if (p.entityType && preset.entityType !== p.entityType) continue;
        if (p.tags && !p.tags.some((t) => preset.tags?.includes(t))) continue;
        const item = preset as unknown as Record<string, unknown>;
        if (!keep(src.where, item)) continue;
        raw.push({ item, id: preset.id, name: preset.name, value: preset.id });
      }
    } else if (isListSource(src)) {
      const items = this.lists.get(src.list);
      if (!items) issues.push({ level: "error", step, path, message: `unknown reference list "${src.list}"` });
      for (const it of items ?? []) {
        const item = this.enrich(src.list, it);
        if (!keep(src.where, item)) continue;
        raw.push({ item, id: it.id, name: it.name, value: it.id });
      }
    }
    const seen = new Set<string>();
    const options: OptionState[] = [];
    for (const r of raw) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      const o: OptionState = { id: r.id, name: r.name, item: r.item, value: r.value, available: true };
      const it = r.item;
      if (typeof it.summary === "string") o.summary = it.summary;
      if (typeof it.description === "string") o.description = it.description;
      if (typeof it.edition === "string") o.edition = it.edition;
      if (typeof it.source === "string") o.source = it.source;
      if (typeof it.cite === "string") o.cite = it.cite;
      if (it.page !== undefined) o.page = it.page as PageRef;
      if (it.original === true) o.original = true;
      if (it.roll !== undefined) {
        const dice = this.eval<unknown>(it.roll as JsonLogicRule, extend(ctx, { option: it }), at, issues);
        if (typeof dice === "string" && dice) o.roll = dice;
      }
      if (choice.available !== undefined) {
        const ok = !!this.eval(choice.available, extend(ctx, { option: it }), { step, path, what: "available" }, issues);
        if (!ok) {
          o.available = false;
          const why = choice.availableText !== undefined ? asText(this.eval(choice.availableText, extend(ctx, { option: it }), { step, path, what: "availableText" }, issues)) : "";
          if (why) o.reason = why;
        }
      }
      options.push(o);
    }
    return { options, range };
  }

  // -------------------------------------------------------------------------
  // grants
  // -------------------------------------------------------------------------

  applyGrants(grants: CharacterBuilderGrant[] | undefined, ctx: Ctx, step: string, path: string, source: string, issues: BuilderIssue[]): void {
    for (const g of grants ?? []) {
      const at = { step, path, what: "grant" };
      let entries: unknown[] = [undefined];
      let each = false;
      if (g.each !== undefined) {
        each = true;
        if (isObj(g.each) && typeof (g.each as { list?: unknown }).list === "string" && Object.keys(g.each).every((k) => k === "list" || k === "where")) {
          const spec = g.each as { list: string; where?: JsonLogicRule };
          const items = this.lists.get(spec.list);
          if (!items) issues.push({ level: "error", step, path, message: `grant: unknown reference list "${spec.list}"` });
          entries = (items ?? []).map((i) => this.enrich(spec.list, i)).filter((i) => spec.where === undefined || !!this.eval(spec.where, this.ctx({ ...ctx, entry: i }), at, issues));
        } else {
          const v = this.eval<unknown>(g.each as JsonLogicRule, this.ctx(ctx), at, issues);
          entries = Array.isArray(v) ? v : v === undefined || v === null ? [] : [v];
        }
      }
      for (const entry of entries) {
        const c = this.ctx(each ? { ...ctx, entry } : ctx);
        if (g.when !== undefined && !this.eval(g.when, c, at, issues)) continue;
        const field = typeof g.path === "string" ? g.path : asText(this.eval(g.path, c, at, issues));
        if (!field) continue;
        const op = g.op ?? "set";
        let current: unknown = field.startsWith("$") ? getPath(this.vars, field.slice(1)) : field === "core.name" ? this.name : field === "core.summary" ? this.summary : getPath(this.fields, field);
        let value: unknown;
        if (op === "upsert" && g.key) {
          // the matching element is `current` to the value's rules
          const probe = g.object ? Object.fromEntries(Object.entries(g.object).filter(([k]) => k === g.key).map(([k, r]) => [k, this.eval(r, c, at, issues)])) : (this.eval<Record<string, unknown>>(g.value, c, at, issues) ?? {});
          const match = Array.isArray(current) ? current.find((x) => isObj(x) && x[g.key!] === probe[g.key!]) : undefined;
          const c2 = extend(c, { current: match });
          value = g.object ? Object.fromEntries(Object.entries(g.object).map(([k, r]) => [k, this.eval(r, c2, at, issues)])) : this.eval(g.value, c2, at, issues);
        } else {
          value = g.object ? Object.fromEntries(Object.entries(g.object).map(([k, r]) => [k, this.eval(r, c, at, issues)])) : this.eval(g.value, c, at, issues);
        }
        if (value === undefined && op !== "set") continue;
        // appending nothing changes nothing: no review line for it
        if ((op === "append" || op === "remove") && (value === null || value === "" || (Array.isArray(value) && value.length === 0))) continue;
        const next = applyOp(op, current, value, g, field, this.def);
        if (field.startsWith("$")) this.vars = setPath(this.vars, field.slice(1), next);
        else if (field === "core.name") this.name = asText(next);
        else if (field === "core.summary") this.summary = asText(next);
        else this.setFields(setPath(this.fields, field, next));
        const label = g.label !== undefined ? asText(this.eval(g.label, extend(c, { value }), at, issues)) : undefined;
        this.grants.push({ step, path, source, field, op, value, ...(label ? { label } : {}), ...(g.hidden || field.startsWith("$") ? { hidden: true } : {}) });
        current = next;
      }
    }
  }

  // -------------------------------------------------------------------------
  // choices
  // -------------------------------------------------------------------------

  choice(choice: CharacterBuilderChoice, opts: { step: string; path: string; id: string; label: string; help?: string; ctx: Ctx; register: (r: ChoiceRecord) => void; parentName?: string; parentSource?: string }): ChoiceState {
    const issues: BuilderIssue[] = [];
    const { step, path } = opts;
    const ctx = this.ctx(opts.ctx);
    const { options, range } = this.options(choice, ctx, step, path, issues);
    const min = !choice.source ? 0 : Math.max(0, asInt(this.eval(choice.min as JsonLogicRule, ctx, { step, path, what: "min" }, issues), choice.min === undefined ? 1 : 0));
    const max = !choice.source ? 0 : Math.max(min, asInt(this.eval(choice.max as JsonLogicRule, ctx, { step, path, what: "max" }, issues), choice.max === undefined ? Math.max(1, min) : min));
    const byId = new Map(options.map((o) => [o.id, o]));
    // a choice with exactly as many options as it must take picks them by itself
    const pickable0 = options.filter((o) => o.available);
    const forced = this.draft.picks[path] === undefined && min > 0 && min === max && pickable0.length === min && !pickable0.some((o) => o.roll);
    const raw = forced ? pickable0.map((o) => o.id) : (this.draft.picks[path] ?? []);
    const picked = [...new Set(raw)].filter((id) => byId.has(id));
    const stale = raw.filter((id) => !byId.has(id));
    if (stale.length && options.length) issues.push({ level: "warning", step, path, message: `No longer an option: ${stale.join(", ")}.` });
    for (const id of picked) {
      const o = byId.get(id)!;
      if (!o.available) issues.push({ level: "error", step, path, message: `${o.name} cannot be picked${o.reason ? `: ${o.reason}` : "."}` });
    }
    const pickable = options.filter((o) => o.available).length;
    if (picked.length < min) {
      if (pickable === 0 && options.length === 0) issues.push({ level: "warning", step, path, message: `${opts.label}: nothing to choose from.` });
      else issues.push({ level: "incomplete", step, path, message: min === max ? `${opts.label}: choose ${min}.` : `${opts.label}: choose at least ${min}.` });
    }
    if (picked.length > max) issues.push({ level: "error", step, path, message: `${opts.label}: choose at most ${max}.` });

    const items = picked.map((id) => byId.get(id)!.item);
    const record: ChoiceRecord = { ids: picked, items, values: picked.map((id) => byId.get(id)!.value), sub: {} };
    if (picked[0] !== undefined) {
      record.id = picked[0];
      record.item = items[0];
      record.value = byId.get(picked[0])!.value;
    }
    // options that roll: their totals
    for (const id of picked) {
      const o = byId.get(id)!;
      if (!o.roll) continue;
      const r = this.draft.rolls?.[`${path}#${id}`];
      if (r) {
        if (record.rolled === undefined) record.rolled = r.total;
        o.item = { ...o.item, rolled: r.total };
      } else issues.push({ level: "incomplete", step, path, message: `Roll ${o.roll} for ${o.name}.` });
    }
    if (record.rolled !== undefined) {
      record.items = picked.map((id) => byId.get(id)!.item);
      record.item = record.items[0];
    }
    opts.register(record);

    const sub: ChoiceState[] = [];
    const multi = max > 1;
    const source = (o: OptionState, i: number): string => {
      if (choice.sourceLabel !== undefined) {
        const t = asText(this.eval(choice.sourceLabel, this.ctx({ ...opts.ctx, item: record.items[i] }), { step, path, what: "sourceLabel" }, issues));
        if (t) return t;
      }
      if (choice.noun) return `${choice.noun} ${o.name}`;
      return opts.parentSource ?? `${opts.label}: ${o.name}`;
    };
    if (!choice.source) {
      // nothing to pick: the grants once, then the sub-choices
      const src = choice.noun ?? opts.parentSource ?? opts.label;
      this.applyGrants(choice.grants, opts.ctx, step, path, src, issues);
      for (const sc of choice.subChoices ?? []) sub.push(...this.subChoice(sc, { step, base: `${path}/${sc.id}`, parent: (opts.ctx.item as Record<string, unknown>) ?? {}, parentName: "", parentSource: src, ctx: opts.ctx, target: record.sub }));
    }
    picked.forEach((id, i) => {
      const o = byId.get(id)!;
      const pickCtx: Ctx = { ...opts.ctx, item: record.items[i], picks: record.items };
      const src = source(o, i);
      this.applyGrants(choice.grants, pickCtx, step, path, src, issues);
      for (const sc of choice.subChoices ?? []) {
        const scBase = multi ? `${path}/${id}/${sc.id}` : `${path}/${sc.id}`;
        let target = record.sub;
        if (multi) {
          const subs = (record.subs ??= {});
          target = subs[id] ??= {};
          if (i === 0) record.sub = target;
        }
        sub.push(...this.subChoice(sc, { step, base: scBase, parent: record.items[i]!, parentName: o.name, parentSource: src, ctx: pickCtx, target }));
      }
    });

    for (const check of choice.validate ?? []) this.check(check, this.ctx({ ...opts.ctx, picks: record.items, item: record.item }), step, path, issues);

    const columns = choice.columns ?? [];
    const state: ChoiceState = { path, step, id: opts.id, label: opts.label, options, picked, min, max, columns, range, issues, sub };
    if (opts.help) state.help = opts.help;
    if (opts.parentName) state.parentName = opts.parentName;
    return state;
  }

  subChoice(sc: CharacterBuilderSubChoice, o: { step: string; base: string; parent: Record<string, unknown>; parentName: string; parentSource: string; ctx: Ctx; target: Record<string, ChoiceRecord | ChoiceRecord[]> }): ChoiceState[] {
    const issues: BuilderIssue[] = [];
    const baseCtx: Ctx = { ...o.ctx, parent: o.parent, item: o.parent };
    const at = { step: o.step, path: o.base, what: "sub-choice" };
    const out: ChoiceState[] = [];
    const run = (path: string, ctx: Ctx, register: (r: ChoiceRecord) => void) => {
      const c = this.ctx(ctx);
      if (sc.when !== undefined && !this.eval(sc.when, c, at, issues)) return;
      const label = asText(this.eval(sc.label, c, at, issues)) || humanize(sc.id);
      const help = sc.help !== undefined ? asText(this.eval(sc.help, c, at, issues)) : undefined;
      const st = this.choice(sc, { step: o.step, path, id: sc.id, label, ...(help ? { help } : {}), ctx, register, parentName: o.parentName, parentSource: o.parentSource });
      out.push(st);
    };
    if (sc.each !== undefined) {
      const list = this.eval<unknown>(sc.each, this.ctx(baseCtx), at, issues);
      const arr = Array.isArray(list) ? list : [];
      const records: ChoiceRecord[] = [];
      o.target[sc.id] = records;
      arr.forEach((entry, i) => run(`${o.base}.${i}`, { ...baseCtx, entry }, (r) => (records[i] = r)));
    } else {
      run(o.base, baseCtx, (r) => (o.target[sc.id] = r));
    }
    if (issues.length && out[0]) out[0].issues.push(...issues);
    else if (issues.length) out.push({ path: o.base, step: o.step, id: sc.id, label: humanize(sc.id), options: [], picked: [], min: 0, max: 0, columns: [], range: false, issues, sub: [] });
    return out;
  }

  check(check: CharacterBuilderCheck, ctx: Ctx, step: string, path: string | undefined, issues: BuilderIssue[]): void {
    const ok = this.eval(check.rule, ctx, { step, ...(path ? { path } : {}), what: "validate" }, issues);
    if (ok) return;
    const message = asText(this.eval(check.message, ctx, { step, ...(path ? { path } : {}), what: "validate message" }, issues)) || "Check failed.";
    issues.push({ level: check.level === "warning" ? "warning" : "error", step, ...(path ? { path } : {}), message });
  }

  // -------------------------------------------------------------------------
  // steps
  // -------------------------------------------------------------------------

  abilityBase(): void {
    for (const step of this.steps) {
      if (step.kind !== "abilities") continue;
      if (step.when !== undefined && !this.eval(step.when, this.ctx(), { step: step.id, what: "when" }, [])) continue;
      const d = this.draft.abilities?.[step.id];
      if (!d) continue;
      const method = step.methods.find((m) => m.id === d.method);
      for (const a of step.abilities) {
        const s = d.scores[a.id] ?? (method?.kind === "pointBuy" ? method.min : undefined);
        if (typeof s === "number") {
          this.setFields(setPath(this.fields, `${step.path}.${a.id}`, s));
          this.grants.push({ step: step.id, path: step.id, source: `base scores (${method?.name.toLowerCase() ?? d.method})`, field: `${step.path}.${a.id}`, op: "set", value: s });
        }
      }
    }
  }

  run(): void {
    this.abilityBase();
    for (const step of this.steps) {
      const issues: BuilderIssue[] = [];
      const skipped = step.when !== undefined && !this.eval(step.when, this.ctx(), { step: step.id, what: "when" }, issues);
      const state: StepState = { id: step.id, kind: step.kind, title: step.title, skipped, summary: "", status: "ok", issues };
      this.stepStates.push(state);
      if (skipped) continue;
      if (step.kind === "choice") {
        state.choice = this.choice(step, { step: step.id, path: step.id, id: step.id, label: step.title, ctx: {}, register: (r) => (this.records[step.id] = r) });
      } else if (step.kind === "fields") {
        const values = this.draft.values?.[step.id] ?? {};
        for (const f of step.fields) {
          const v = values[f.path];
          const empty = v === undefined || v === null || v === "";
          if (empty) {
            if (f.required) issues.push({ level: "incomplete", step: step.id, message: `${f.label ?? builderFieldLabel(this.module, this.def, f.path)} is required.` });
            continue;
          }
          if (f.path === "core.name") this.name = asText(v);
          else if (f.path === "core.summary") this.summary = asText(v);
          else this.setFields(setPath(this.fields, f.path, v));
        }
      } else if (step.kind === "abilities") {
        const d = this.draft.abilities?.[step.id];
        const method = step.methods.find((m) => m.id === d?.method);
        if (!d || !method) issues.push({ level: "incomplete", step: step.id, message: "Choose how to get the ability scores." });
        else issues.push(...abilityMethodIssues(step, method, d));
      }
      for (const check of step.validate ?? []) this.check(check, this.ctx(), step.id, undefined, issues);
    }
    const fin = this.mode === "levelUp" ? this.builder.levelUp?.finally : this.builder.finally;
    const finIssues: BuilderIssue[] = [];
    this.applyGrants(fin, {}, "", "", "builder", finIssues);
    // ability step states read the final scores
    for (const step of this.steps) {
      const st = this.stepStates.find((s) => s.id === step.id)!;
      if (step.kind === "abilities" && !st.skipped) st.abilities = this.abilityState(step);
    }
    if (finIssues.length) {
      const last = this.stepStates[this.stepStates.length - 1];
      if (last) last.issues.push(...finIssues.map((i) => ({ ...i, step: last.id })));
    }
  }

  abilityState(step: CharacterBuilderAbilityStep): AbilityState {
    const d = this.draft.abilities?.[step.id];
    const method = step.methods.find((m) => m.id === d?.method);
    const ids = step.abilities.map((a) => a.id);
    const st: AbilityState = {
      method: d?.method ?? "",
      abilities: step.abilities.map((a) => {
        const base = d?.scores[a.id] ?? (method?.kind === "pointBuy" ? method.min : undefined);
        const score = asInt(getPath(this.fields, `${step.path}.${a.id}`), base ?? 0);
        const out: AbilityState["abilities"][number] = { id: a.id, name: a.name, base, bonus: base === undefined ? 0 : score - base, score };
        if (a.abbr) out.abbr = a.abbr;
        if (step.modifier !== undefined) {
          try {
            const m = evaluateLogic(step.modifier, { score });
            if (typeof m === "number" && Number.isFinite(m)) out.modifier = m;
          } catch {
            // conformance reports bad rules
          }
        }
        return out;
      }),
    };
    if (method?.kind === "pointBuy" && d) {
      const cost = pointBuyCost(method, Object.fromEntries(ids.map((a) => [a, d.scores[a] ?? method.min])), ids);
      if (cost !== undefined) st.spent = cost;
      st.budget = method.budget;
    }
    if (method && d && (method.kind === "array" || method.kind === "roll")) st.pool = unassignedValues(method, d, ids);
    if (step.max !== undefined) {
      const st0 = this.stepStates.find((s) => s.id === step.id)!;
      for (const a of st.abilities) if (a.score > step.max) st0.issues.push({ level: "warning", step: step.id, message: `${a.name} is ${a.score}, above ${step.max}.` });
    }
    return st;
  }
}

function applyOp(op: NonNullable<CharacterBuilderGrant["op"]>, current: unknown, value: unknown, g: CharacterBuilderGrant, field: string, def: EntityTypeDef | undefined): unknown {
  switch (op) {
    case "set":
      return clone(value);
    case "add":
      return asNumber(current) + asNumber(value);
    case "max":
      return current === undefined || current === null ? asNumber(value) : Math.max(asNumber(current), asNumber(value));
    case "min":
      return current === undefined || current === null ? asNumber(value) : Math.min(asNumber(current), asNumber(value));
    case "append": {
      const schema = def && !field.startsWith("$") ? fieldSchemaAt(def, field) : undefined;
      const textField = typeof current === "string" || (current === undefined && schema?.type === "string");
      if (textField) {
        const parts = (Array.isArray(value) ? value : [value]).map(asText).filter(Boolean);
        const sep = g.separator ?? ", ";
        let out = typeof current === "string" ? current : "";
        for (const p of parts) {
          if (out.split(sep).includes(p)) continue;
          out = out ? `${out}${sep}${p}` : p;
        }
        return out;
      }
      const list = Array.isArray(current) ? [...current] : [];
      for (const v of Array.isArray(value) ? value : [value]) {
        if (v === undefined || v === null || v === "") continue;
        const key = JSON.stringify(v);
        if (!list.some((x) => JSON.stringify(x) === key)) list.push(clone(v));
      }
      return list;
    }
    case "remove": {
      const drop = new Set((Array.isArray(value) ? value : [value]).map((v) => JSON.stringify(v)));
      return Array.isArray(current) ? current.filter((x) => !drop.has(JSON.stringify(x))) : current;
    }
    case "upsert": {
      const list = Array.isArray(current) ? [...current] : [];
      if (!isObj(value) || !g.key) return list;
      const i = list.findIndex((x) => isObj(x) && x[g.key!] === value[g.key!]);
      if (i >= 0) list[i] = { ...(list[i] as Record<string, unknown>), ...clone(value) };
      else list.push(clone(value));
      return list;
    }
  }
}

function asNumber(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : 0;
  return Number.isFinite(n) ? n : 0;
}

/** The starting fields of a new character: the type's defaults and the builder's `defaults`. */
export function builderBaseFields(module: GameModule, builder: CharacterBuilderDef): Record<string, unknown> {
  const def = module.entityTypes.find((t) => t.id === builder.entityType);
  const fields = def ? defaultFieldsFor(def) : {};
  return { ...fields, ...clone(builder.defaults ?? {}) };
}

function recordsKey(r: Record<string, ChoiceRecord>): string {
  const strip = (x: ChoiceRecord | ChoiceRecord[] | undefined): unknown => (Array.isArray(x) ? x.map(strip) : x ? { ids: x.ids, rolled: x.rolled, sub: Object.fromEntries(Object.entries(x.sub).map(([k, v]) => [k, strip(v)])) } : null);
  return JSON.stringify(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, strip(v)])));
}

function walkChoices(c: ChoiceState | undefined, fn: (c: ChoiceState) => void): void {
  if (!c) return;
  fn(c);
  for (const s of c.sub) walkChoices(s, fn);
}

/** Every choice of a result, depth first. */
export function builderChoices(result: CharacterBuilderResult): ChoiceState[] {
  const out: ChoiceState[] = [];
  for (const s of result.steps) walkChoices(s.choice, (c) => out.push(c));
  return out;
}

/**
 * Resolve a draft: the character's fields, every grant with its source, the
 * options and picks of every choice and what is missing. Rules may read
 * choices made at later steps (`choices`), so the builder resolves until the
 * picks settle (at most four passes).
 */
export function resolveCharacterBuilder(module: GameModule, builder: CharacterBuilderDef, draft: CharacterBuilderDraft, options: ResolveOptions = {}): CharacterBuilderResult {
  const base = options.base ? clone(options.base) : builderBaseFields(module, builder);
  let prior: Record<string, ChoiceRecord> = {};
  let r: Resolver | undefined;
  let key = "";
  for (let pass = 0; pass < 4; pass++) {
    r = new Resolver(module, builder, draft, base, prior);
    r.run();
    const k = recordsKey(r.records);
    if (pass > 0 && k === key) break;
    key = k;
    prior = r.records;
  }
  const res = r!;
  const steps = res.stepStates;
  // gather issues: step-level and every choice's, and the schema check of the result
  const issues: BuilderIssue[] = [];
  for (const s of steps) {
    if (s.skipped) {
      s.status = "ok";
      continue;
    }
    const mine = [...s.issues];
    walkChoices(s.choice, (c) => mine.push(...c.issues));
    s.status = mine.some((i) => i.level === "error") ? "error" : mine.some((i) => i.level === "incomplete") ? "incomplete" : "ok";
    issues.push(...mine.filter((i, n) => mine.indexOf(i) === n));
    s.summary = stepSummary(res, builderSteps(builder, draft.mode).find((x) => x.id === s.id)!, s);
  }
  const def = res.def;
  if (def) {
    const v = validateEntityFields(def, res.fields);
    const last = steps[steps.length - 1];
    if (!v.valid && last) for (const e of v.errors.slice(0, 8)) issues.push({ level: "error", step: last.id, message: `The sheet would not accept ${e.path || "the fields"}: ${e.message}` });
  }
  const computed = res.computed();
  const preview: Array<{ label: string; value: string }> = [];
  for (const p of builder.preview ?? []) {
    try {
      const v = evaluateLogic(p.value, res.ctx());
      const t = asText(v);
      if (t) preview.push({ label: p.label, value: t });
    } catch {
      // conformance reports bad rules
    }
  }
  const todo: string[] = [];
  for (const s of builderSteps(builder, draft.mode)) {
    if (s.kind !== "review" || s.todo === undefined) continue;
    try {
      const t = evaluateLogic(s.todo, res.ctx());
      for (const line of Array.isArray(t) ? t : [t]) if (asText(line)) todo.push(asText(line));
    } catch {
      // conformance reports bad rules
    }
  }
  const out: CharacterBuilderResult = {
    fields: res.fields,
    computed,
    vars: res.vars,
    grants: res.grants,
    steps,
    issues,
    preview,
    todo,
    complete: !issues.some((i) => i.level === "error" || i.level === "incomplete"),
  };
  if (res.name !== undefined) out.name = res.name;
  if (res.summary !== undefined) out.summary = res.summary;
  return out;
}

function stepSummary(res: Resolver, step: CharacterBuilderStep, state: StepState): string {
  if (step.summary !== undefined) {
    try {
      const t = asText(evaluateLogic(step.summary, res.ctx()));
      if (t) return t;
    } catch {
      // fall back to the picks
    }
  }
  if (state.choice) {
    const names: string[] = [];
    walkChoices(state.choice, (c) => {
      for (const id of c.picked) {
        const o = c.options.find((x) => x.id === id);
        if (o) names.push(o.name);
      }
    });
    return names.join(", ");
  }
  if (state.abilities) {
    return state.abilities.abilities
      .map((a) => `${a.abbr ?? a.name} ${a.score}`)
      .join(" · ");
  }
  if (step.kind === "fields") {
    const values = res.draft.values?.[step.id] ?? {};
    return asText(values["core.name"] ?? Object.values(values).find((v) => typeof v === "string" && v));
  }
  return "";
}

// ---------------------------------------------------------------------------
// Draft edits (pure; the app stores the result)
// ---------------------------------------------------------------------------

/** Toggle an option of a choice: single-pick choices replace the pick, multi-pick ones add or remove it (up to `max`). */
export function togglePick<D extends CharacterBuilderDraft>(draft: D, choice: Pick<ChoiceState, "path" | "max">, optionId: string): D {
  const cur = draft.picks[choice.path] ?? [];
  let next: string[];
  if (choice.max <= 1) next = cur.includes(optionId) && cur.length === 1 ? [] : [optionId];
  else if (cur.includes(optionId)) next = cur.filter((x) => x !== optionId);
  else if (cur.length >= choice.max) next = [...cur.slice(1), optionId];
  else next = [...cur, optionId];
  const picks = { ...draft.picks, [choice.path]: next };
  if (next.length === 0) delete picks[choice.path];
  return { ...draft, picks };
}

// ---------------------------------------------------------------------------
// Conformance
// ---------------------------------------------------------------------------

export interface CharacterBuilderIssue {
  severity: "error" | "warning";
  where: string;
  message: string;
}

/** Every JSONLogic rule of a builder, with where it sits (for static checks). */
export function characterBuilderLogicSlots(b: CharacterBuilderDef): Array<{ segments: Array<string | number>; rule: unknown }> {
  const out: Array<{ segments: Array<string | number>; rule: unknown }> = [];
  const add = (segments: Array<string | number>, rule: unknown) => {
    if (rule !== undefined) out.push({ segments, rule });
  };
  const grants = (gs: CharacterBuilderGrant[] | undefined, at: Array<string | number>) =>
    (gs ?? []).forEach((g, i) => {
      const w = [...at, i];
      if (typeof g.path !== "string") add([...w, "path"], g.path);
      add([...w, "value"], g.value);
      for (const [k, r] of Object.entries(g.object ?? {})) add([...w, "object", k], r);
      if (g.each !== undefined) {
        if (isObj(g.each) && typeof (g.each as { list?: unknown }).list === "string") add([...w, "each", "where"], (g.each as { where?: unknown }).where);
        else add([...w, "each"], g.each);
      }
      add([...w, "when"], g.when);
      add([...w, "label"], g.label);
    });
  const source = (s: CharacterBuilderSource | undefined, at: Array<string | number>) => {
    if (!s || !isObj(s)) return;
    if ("values" in s) add([...at, "values"], s.values);
    if ("range" in s && isObj(s.range)) {
      add([...at, "range", "min"], s.range.min);
      add([...at, "range", "max"], s.range.max);
    }
    if ("where" in s) add([...at, "where"], (s as { where?: unknown }).where);
    if ("options" in s && Array.isArray(s.options)) s.options.forEach((o, i) => add([...at, "options", i, "roll"], o.roll));
  };
  const checks = (cs: CharacterBuilderCheck[] | undefined, at: Array<string | number>) =>
    (cs ?? []).forEach((c, i) => {
      add([...at, i, "rule"], c.rule);
      add([...at, i, "message"], c.message);
    });
  const choice = (c: CharacterBuilderChoice, at: Array<string | number>) => {
    source(c.source, [...at, "source"]);
    add([...at, "min"], c.min);
    add([...at, "max"], c.max);
    add([...at, "available"], c.available);
    add([...at, "availableText"], c.availableText);
    add([...at, "sourceLabel"], c.sourceLabel);
    grants(c.grants, [...at, "grants"]);
    checks(c.validate, [...at, "validate"]);
    (c.subChoices ?? []).forEach((sc, i) => {
      const w = [...at, "subChoices", i];
      add([...w, "label"], sc.label);
      add([...w, "when"], sc.when);
      add([...w, "each"], sc.each);
      add([...w, "help"], sc.help);
      choice(sc, w);
    });
  };
  const steps = (ss: CharacterBuilderStep[], at: Array<string | number>) =>
    ss.forEach((s, i) => {
      const w = [...at, i];
      add([...w, "summary"], s.summary);
      add([...w, "when"], s.when);
      checks(s.validate, [...w, "validate"]);
      if (s.kind === "choice") choice(s, w);
      if (s.kind === "abilities") add([...w, "modifier"], s.modifier);
      if (s.kind === "review") add([...w, "todo"], s.todo);
    });
  steps(b.steps ?? [], ["steps"]);
  grants(b.finally, ["finally"]);
  (b.preview ?? []).forEach((p, i) => add(["preview", i, "value"], p.value));
  if (b.levelUp) {
    add(["levelUp", "when"], b.levelUp.when);
    steps(b.levelUp.steps ?? [], ["levelUp", "steps"]);
    grants(b.levelUp.finally, ["levelUp", "finally"]);
  }
  return out;
}

const STEP_KINDS = ["choice", "abilities", "fields", "review"];
const GRANT_OPS = ["set", "add", "append", "remove", "max", "min", "upsert"];

/**
 * Static and dry-run checks of a module's character builders: references
 * (entity type, lists, fields, list items in `itemData`), JSONLogic, ability
 * methods, unique ids; then a dry run that picks the first options of every
 * choice and checks the character it builds is accepted by the sheet.
 */
export function characterBuilderIssues(module: GameModule, options: { dryRun?: boolean } = {}): CharacterBuilderIssue[] {
  const out: CharacterBuilderIssue[] = [];
  const builders = module.characterBuilders ?? [];
  const ids = new Set<string>();
  for (const b of builders) {
    const where = `characterBuilder:${b.id}`;
    const err = (w: string, message: string) => out.push({ severity: "error", where: w, message });
    const warn = (w: string, message: string) => out.push({ severity: "warning", where: w, message });
    if (!b.id) err("characterBuilder", "a builder has no id");
    else if (ids.has(b.id)) err(where, "duplicate builder id");
    ids.add(b.id);
    if (!b.name) err(where, "builder has no name");
    const def = module.entityTypes.find((t) => t.id === b.entityType);
    if (!def) {
      err(where, `unknown entity type "${b.entityType}"`);
      continue;
    }
    if (!Array.isArray(b.steps) || b.steps.length === 0) {
      err(where, "builder has no steps");
      continue;
    }
    for (const slot of characterBuilderLogicSlots(b)) for (const m of logicIssues(slot.rule as JsonLogicRule)) err(`${where}#${slot.segments.join(".")}`, `JSONLogic: ${m}`);
    const lists = new Set(module.referenceLists.map((l) => l.id));
    for (const [listId, byItem] of Object.entries(b.itemData ?? {})) {
      const list = module.referenceLists.find((l) => l.id === listId);
      if (!list) {
        err(`${where}#itemData`, `unknown reference list "${listId}"`);
        continue;
      }
      const missing = Object.keys(byItem).filter((id) => !list.items.some((i) => i.id === id));
      if (missing.length) warn(`${where}#itemData`, `list "${listId}" has no item ${missing.slice(0, 5).map((m) => `"${m}"`).join(", ")}${missing.length > 5 ? ` (+${missing.length - 5})` : ""}`);
    }
    const fieldOk = (path: string) => path === "core.name" || path === "core.summary" || path.startsWith("$") || fieldSchemaAt(def, path) !== undefined;
    const checkGrants = (gs: CharacterBuilderGrant[] | undefined, w: string) =>
      (gs ?? []).forEach((g, i) => {
        if (g.op !== undefined && !GRANT_OPS.includes(g.op)) err(`${w}.${i}`, `unknown grant op "${g.op}"`);
        if (typeof g.path === "string" && !fieldOk(g.path)) err(`${w}.${i}`, `"${g.path}" is not a field of ${def.id}`);
        if (g.op === "upsert" && !g.key) err(`${w}.${i}`, "an upsert grant needs a key");
        if (g.value === undefined && g.object === undefined && g.op !== "set") err(`${w}.${i}`, "grant has no value");
        if (isObj(g.each) && typeof (g.each as { list?: unknown }).list === "string" && !lists.has((g.each as { list: string }).list)) err(`${w}.${i}`, `each: unknown reference list "${(g.each as { list: string }).list}"`);
      });
    const checkSource = (s: CharacterBuilderSource | undefined, w: string, required: boolean) => {
      if (s === undefined && !required) return;
      if (!isObj(s)) {
        err(w, "a choice needs a source");
        return;
      }
      if ("list" in s && typeof s.list === "string" && !lists.has(s.list)) err(w, `unknown reference list "${s.list}"`);
      if ("options" in s) {
        if (!Array.isArray(s.options) || s.options.length === 0) err(w, "fixed options are empty");
        else {
          const seen = new Set<string>();
          for (const o of s.options) {
            if (seen.has(o.id)) err(w, `duplicate option id "${o.id}"`);
            seen.add(o.id);
          }
        }
      }
      if ("presets" in s && s.presets.entityType && !module.entityTypes.some((t) => t.id === s.presets.entityType)) err(w, `unknown entity type "${s.presets.entityType}"`);
    };
    const checkChoice = (c: CharacterBuilderChoice, w: string, step = false) => {
      checkSource(c.source, `${w}.source`, !step);
      checkGrants(c.grants, `${w}.grants`);
      const subIds = new Set<string>();
      (c.subChoices ?? []).forEach((sc, i) => {
        if (!sc.id) err(`${w}.subChoices.${i}`, "a sub-choice has no id");
        else if (subIds.has(sc.id)) err(`${w}.subChoices.${i}`, `duplicate sub-choice id "${sc.id}"`);
        subIds.add(sc.id);
        checkChoice(sc, `${w}.subChoices.${i}`);
      });
    };
    const checkSteps = (steps: CharacterBuilderStep[], w0: string) => {
      const stepIds = new Set<string>();
      steps.forEach((s, i) => {
        const w = `${where}#${w0}.${i}`;
        if (!s.id) err(w, "a step has no id");
        else if (stepIds.has(s.id)) err(w, `duplicate step id "${s.id}"`);
        stepIds.add(s.id);
        if (!s.title) err(w, "step has no title");
        if (!STEP_KINDS.includes(s.kind)) {
          err(w, `unknown step kind "${String(s.kind)}"`);
          return;
        }
        if (s.kind === "choice") {
          checkChoice(s, w, true);
          if (!s.source && !s.subChoices?.length && !s.grants?.length) err(w, "a choice step needs a source, grants or sub-choices");
        }
        if (s.kind === "fields") for (const f of s.fields ?? []) if (!fieldOk(f.path)) err(w, `"${f.path}" is not a field of ${def.id}`);
        if (s.kind === "abilities") {
          if (!fieldSchemaAt(def, s.path)) err(w, `"${s.path}" is not a field of ${def.id}`);
          for (const a of s.abilities ?? []) if (!fieldSchemaAt(def, `${s.path}.${a.id}`)) err(w, `"${s.path}.${a.id}" is not a field of ${def.id}`);
          if (!s.methods?.length) err(w, "an abilities step needs at least one method");
          const n = s.abilities?.length ?? 0;
          for (const m of s.methods ?? []) {
            const mw = `${w}:${m.id}`;
            if (m.kind === "array" && m.values.length !== n) err(mw, `the array has ${m.values.length} values for ${n} abilities`);
            if (m.kind === "pointBuy") {
              if (!(m.budget > 0)) err(mw, "point buy needs a budget above 0");
              if (m.min > m.max) err(mw, "point buy min is above max");
              for (let x = m.min; x <= m.max; x++) if (typeof m.costs[String(x)] !== "number") err(mw, `point buy has no cost for ${x}`);
              const cheapest = m.costs[String(m.min)] ?? 0;
              if (cheapest * n > m.budget) err(mw, "the budget cannot pay for the lowest scores");
            }
            if (m.kind === "roll") {
              try {
                const e = parseDiceExpression(m.dice);
                const dice = e.terms.reduce((s, t) => s + (t.kind === "dice" ? t.count : t.kind === "d66" ? 1 : 0), 0);
                if (m.keep !== undefined && (m.keep < 1 || m.keep > dice)) err(mw, `keep ${m.keep} of ${dice} dice`);
              } catch (e) {
                err(mw, (e as Error).message);
              }
              if (m.count !== undefined && m.count !== n) warn(mw, `rolls ${m.count} scores for ${n} abilities`);
            }
            if (m.kind === "manual" && m.min > m.max) err(mw, "manual min is above max");
          }
        }
      });
    };
    checkSteps(b.steps, "steps");
    checkGrants(b.finally, `${where}#finally`);
    if (b.levelUp) {
      if (!b.levelUp.steps?.length) err(`${where}#levelUp`, "level-up has no steps");
      else checkSteps(b.levelUp.steps, "levelUp.steps");
      checkGrants(b.levelUp.finally, `${where}#levelUp.finally`);
    }
    if (options.dryRun === false || out.some((i) => i.severity === "error" && i.where.startsWith(where))) continue;
    // dry run: first options everywhere
    const modes: Array<"create" | "levelUp"> = b.levelUp ? ["create", "levelUp"] : ["create"];
    for (const mode of modes) {
      try {
        const base = mode === "levelUp" ? resolveCharacterBuilder(module, b, autoDraft(module, b, "create")).fields : undefined;
        const draft = autoDraft(module, b, mode, base);
        const res = resolveCharacterBuilder(module, b, draft, base ? { base } : {});
        const steps = builderSteps(b, mode);
        for (const i of res.issues.filter((x) => x.level === "error").slice(0, 5)) {
          const n = steps.findIndex((s) => s.id === i.step);
          warn(`${where}#${mode === "levelUp" ? "levelUp." : ""}${n >= 0 ? `steps.${n}` : "steps"}`, `dry run with the first options: ${i.message}`);
        }
      } catch (e) {
        err(where, `dry run (${mode}) failed: ${(e as Error).message}`);
      }
    }
  }
  return out;
}

/**
 * A draft with the first available options picked everywhere (the fewest
 * a choice asks for), the first ability method and placeholder text: what
 * the dry run builds, and a quick start for tests.
 */
export function autoDraft(module: GameModule, builder: CharacterBuilderDef, mode: "create" | "levelUp" = "create", base?: Record<string, unknown>): CharacterBuilderDraft {
  let draft = emptyDraft(builder, mode);
  const steps = builderSteps(builder, mode);
  for (const s of steps) {
    if (s.kind === "abilities" && s.methods[0]) {
      const m = s.methods[0];
      const scores: Record<string, number> = {};
      const rolled = m.kind === "roll" ? s.abilities.map(() => ({ faces: [], total: 10 })) : undefined;
      s.abilities.forEach((a, i) => (scores[a.id] = m.kind === "array" ? m.values[i] ?? 10 : m.kind === "pointBuy" || m.kind === "manual" ? m.min : 10));
      draft = { ...draft, abilities: { ...draft.abilities, [s.id]: { method: m.id, scores, ...(rolled ? { rolled } : {}) } } };
    }
    if (s.kind === "fields") {
      const values: Record<string, unknown> = {};
      for (const f of s.fields) if (f.required) values[f.path] = f.widget === "number" ? 1 : "Test";
      draft = { ...draft, values: { ...draft.values, [s.id]: values } };
    }
  }
  // one choice at a time, in order, so a pick sees the picks before it
  const repicked = new Set<string>();
  for (let i = 0; i < 300; i++) {
    const res = resolveCharacterBuilder(module, builder, draft, base ? { base } : {});
    const next = builderChoices(res).find((c) => {
      const cur = draft.picks[c.path];
      if (cur === undefined) return c.min > 0 && c.options.some((o) => o.available);
      return !repicked.has(c.path) && cur.some((id) => c.options.find((o) => o.id === id)?.available === false);
    });
    if (!next) break;
    if (draft.picks[next.path] !== undefined) repicked.add(next.path);
    const avail = next.options.filter((o) => o.available).slice(0, Math.max(1, next.min));
    draft = { ...draft, picks: { ...draft.picks, [next.path]: avail.map((o) => o.id) } };
    for (const o of avail) if (o.roll) draft = { ...draft, rolls: { ...draft.rolls, [`${next.path}#${o.id}`]: { faces: [], total: 1 } } };
  }
  return draft;
}
