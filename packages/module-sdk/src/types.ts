/**
 * Campaign Forge module contract.
 *
 * This file is THE boundary between the core app and a game module. The core
 * never imports a module's own TypeScript types; it reads these shapes at
 * runtime. Everything here is game-agnostic. The word "stress" does not appear
 * in this file on purpose.
 *
 * Design rules (from the architecture seed, section 5):
 *  - Deterministic generation: every roll takes a seeded RNG.
 *  - Safe expressions: JSONLogic only, never eval.
 *  - Schema is the API: entity fields are JSON Schema.
 *  - Mode filtering: rule cards, templates, sheet fields may carry mode tags.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** A JSONLogic rule object. Evaluated with json-logic-js against a data context. */
export type JsonLogicRule = Record<string, unknown> | number | string | boolean | null;

/** A JSON Schema (draft-07 compatible) object. Kept loose so modules stay data. */
export type JsonSchema = Record<string, unknown>;

export type PlayModeId = string;

/** A rulebook page reference. A single page or an inclusive range. */
export type PageRef = number | [number, number];

/**
 * A citation that is not a page number, for sources cited by section (e.g.
 * "SRD 5.1, Conditions" or "§ 7.2"). Wherever the contract wants a source,
 * `page` or `cite` will do; `original: true` marks content the module author
 * wrote themselves, which has no source to cite.
 */
export type CiteRef = string;

/** Seeded random source. `next()` is in [0, 1). `int` is inclusive on both ends. */
export interface Rng {
  next(): number;
  int(min: number, max: number): number;
  /** Fork a child RNG for a named sub-stream. Same (seed, name) => same stream. */
  fork(name: string): Rng;
}

// ---------------------------------------------------------------------------
// Manifest and modes
// ---------------------------------------------------------------------------

export interface PlayMode {
  id: PlayModeId;
  name: string;
  description?: string;
  page?: PageRef;
  cite?: CiteRef;
}

/**
 * The licence the module's content is published under, and the attribution
 * the licence requires. The app shows `attribution` wherever the module is
 * described (module list, campaign settings) and in exports.
 */
export interface ModuleLicense {
  /** SPDX identifier when there is one, e.g. "CC-BY-4.0", "OGL-1.0a", "MIT". */
  spdx?: string;
  /** Human-readable licence name, e.g. "Creative Commons Attribution 4.0". */
  name: string;
  /** http(s) link to the licence text. */
  url?: string;
  /** The attribution text the licence requires, shown as written (plain text). */
  attribution: string;
}

export interface ModuleManifest {
  /** Stable id, e.g. "alien" */
  id: string;
  /** Semver string. Generator runs record this. */
  version: string;
  name: string;
  ruleset: string;
  edition?: string;
  publisher?: string;
  /** Shown in the app's about screen and on export. */
  licenseNotice: string;
  /** Minimum core contract version this module targets. */
  requiredCore: string;
  modes: PlayMode[];
  /** Default mode for new campaigns. */
  defaultMode: PlayModeId;
  /** Whether bundled data has been checked against the source book. */
  dataStatus: "unverified" | "partially-verified" | "verified";
  /** Rulebook the page references point to. */
  sourceBook?: { title: string; year?: number; pageNote?: string; url?: string };
  /** Licence and required attribution (required for data packs; recommended for every module). */
  license?: ModuleLicense;
  /**
   * How the module cites its source: by page number (the default) or by
   * section name (`cite` strings), e.g. for an SRD published as web pages.
   * Purely informative; either field satisfies the citation checks.
   */
  citationStyle?: "page" | "section";
  /** Authors or maintainers of the module, shown in the module list. */
  authors?: string[];
  /**
   * Supplements merged into this module when it loaded, in the order they were
   * applied (set by `applySupplements`; a module never declares it itself).
   * Content a supplement added has ids that start with "<supplement id>.".
   */
  supplements?: AppliedSupplement[];
}

/** A supplement applied to a loaded module: what generation provenance and the app show about it. */
export interface AppliedSupplement {
  id: string;
  name: string;
  version: string;
  licenseNotice: string;
  license?: ModuleLicense;
}

// ---------------------------------------------------------------------------
// Dice
// ---------------------------------------------------------------------------

export interface DieSpec {
  /** e.g. "base", "stress", "d6" */
  id: string;
  name: string;
  faces: number;
  /** Face value -> symbol id, e.g. { 6: "success", 1: "special" } */
  symbols?: Record<number, string>;
  /** Optional UI colour hint. */
  color?: string;
}

export interface DicePool {
  /** die id -> count */
  dice: Record<string, number>;
  /**
   * Free-form data describing how the pool was built (for the provenance popover).
   * Total-style systems list flat modifiers here too (`die` "mod", `count` the modifier).
   */
  breakdown?: Array<{ label: string; die: string; count: number }>;
  /** Flat modifier added to the dice total (total-style systems). */
  modifier?: number;
  /** Short display of the pool, e.g. "1d20 + 5 (advantage)"; shown instead of a die count. */
  label?: string;
  meta?: Record<string, unknown>;
}

export interface RolledDie {
  die: string;
  value: number;
  /** True when kept from a previous roll (e.g. not re-rolled on a push). */
  kept?: boolean;
  /** True when rolled but not counted (e.g. the lower d20 with advantage). */
  dropped?: boolean;
}

/** How an outcome reads at a glance; the UI colours it. */
export type RollTone = "critical" | "success" | "partial" | "failure" | "fumble" | "neutral";

/** A named outcome of a roll: a band (10+ / 7-9 / 6-), a degree (hard success) or pass/fail. */
export interface RollOutcome {
  /** Stable id, e.g. "strong-hit", "hard", "success". */
  id: string;
  /** Display label, e.g. "Strong hit". */
  label: string;
  tone?: RollTone;
}

export interface RollResult {
  pool: DicePool;
  dice: RolledDie[];
  /**
   * Pool systems: dice showing a success. Total-style systems: the degree of
   * success (0 = failure, 1 = success, 2+ = better degrees), so code that
   * asks "did it succeed?" (`successes > 0`) works for every system.
   */
  successes: number;
  /** symbol id -> count across all dice */
  symbols: Record<string, number>;
  /** How many times this result has been pushed/re-rolled. */
  pushes: number;
  /** Whether the system allows another push from this state. */
  canPush: boolean;
  /** Total-style systems: the number the roll came to (dice kept + modifier). */
  total?: number;
  /** The number the total is compared with (a DC, a skill percentage), when there is one. */
  target?: number;
  /** The named outcome (band, degree, pass/fail), when the system has one. */
  outcome?: RollOutcome;
  /** A natural critical (e.g. a natural 20, a 01 on percentile dice). */
  critical?: boolean;
  /** A natural fumble (e.g. a natural 1, a 00 on percentile dice). */
  fumble?: boolean;
  /** Module-specific notes, e.g. "stress die showed 1". */
  notes?: string[];
  meta?: Record<string, unknown>;
}

/** How good a pool is for ranking (higher is better), with a short label ("+5", "65%", "4"). */
export interface PoolStrength {
  score: number;
  label: string;
  /** The label read in full, e.g. for screen readers ("4 dice"); defaults to `label`. */
  spoken?: string;
}

/**
 * A module's dice adapter. The core calls these; the module decides semantics.
 * All randomness goes through the supplied Rng.
 */
export interface DiceSystem {
  /** Built-in engine id (e.g. "d20", "pool") when the system came from `createDiceEngine`. */
  engine?: string;
  dice: DieSpec[];
  /**
   * What the roll panel shows: "successes" (default) puts the success count
   * first; "total" puts the total and the outcome first (d20, 2d6, d100 systems).
   */
  resultStyle?: "successes" | "total";
  /**
   * Options the roll panel offers before rolling (JSON Schema of an object
   * whose properties are integers, numbers, booleans or string enums, e.g. a
   * DC, advantage). Their values are merged into the `buildPool` input.
   */
  rollOptions?: JsonSchema;
  /** Build a pool from module-specific input (attribute, skill, modifiers...). */
  buildPool(input: Record<string, unknown>): DicePool;
  roll(pool: DicePool, rng: Rng): RollResult;
  /** Re-roll according to the module's push rule. Absent if the system has no push. */
  push?(previous: RollResult, rng: Rng, input?: Record<string, unknown>): RollResult;
  /** One-line human description of a result. */
  describe(result: RollResult): string;
  /**
   * How good a pool is, to rank characters for a roll (higher is better) and
   * the short label to show for it. Optional: `poolStrength` falls back to a
   * roll-under target, then the pool's flat modifier, then its dice count.
   */
  strength?(pool: DicePool): PoolStrength;
  /**
   * Named module-specific roll operations beyond pool rolls (for example a
   * reaction roll against a table). Each takes an input object and the Rng.
   */
  operations?: Record<string, DiceOperation>;
}

export interface DiceOperation {
  id: string;
  name: string;
  page?: PageRef;
  /**
   * Offer this operation as a one-tap roll on a character (e.g. in table mode). Its input
   * must be fillable from the character alone: `entity`, field or computed values, and
   * `conditions` (the ids of the character's current conditions).
   */
  characterRoll?: boolean;
  /** JSON Schema of the input object. */
  input: JsonSchema;
  run(input: Record<string, unknown>, rng: Rng, tables: TableRegistry): DiceOperationResult;
}

export interface DiceOperationResult {
  total?: number;
  rolls: RollRecord[];
  result: unknown;
  label: string;
  effects?: Effect[];
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

/**
 * A random table. Pure data. `dice` is a dice expression such as "2d6",
 * "d66", "d3", "1d6+2", "3d6". "d66" means tens digit d6 * 10 + units d6.
 */
export interface RollTable {
  id: string;
  name: string;
  page?: PageRef;
  /** Section citation, when the source is not cited by page. */
  cite?: CiteRef;
  /** Written by the module author (no source to cite). */
  original?: boolean;
  dice: string;
  /** Modifiers applied to the roll total, evaluated against the roll context. */
  modifiers?: TableModifier[];
  rows: TableRow[];
  mode?: PlayModeId[];
  tags?: string[];
  /** Short note for the GM, e.g. when to roll. */
  notes?: string;
  /** True when rows were transcribed without checking against the book. */
  unverified?: boolean;
  /** Which family this belongs to, for the reference browser. */
  family?: string;
}

export interface TableModifier {
  /** JSONLogic predicate over the roll context. Omit for unconditional. */
  when?: JsonLogicRule;
  /** Number, or a JSONLogic expression yielding a number. */
  add: number | JsonLogicRule;
  label?: string;
}

export interface TableRow {
  /** Inclusive range of totals this row covers. Use -99/99 for open ends. */
  range: [number, number];
  /** Short display label. */
  label?: string;
  /** Structured result merged into the roll context under the step id. */
  result: Record<string, unknown> | string;
  /** The GM must choose; the app shows the row and asks. */
  gmDecides?: boolean;
  /** Follow-up rolls triggered by this row. */
  roll?: NestedRoll[];
  page?: PageRef;
  cite?: CiteRef;
  unverified?: boolean;
}

export interface NestedRoll {
  /** Table id to roll on. */
  table: string;
  /** Key under which the nested result is stored inside this row's result. */
  as: string;
  /** Number of times, or a dice expression. Default 1. */
  times?: number | string;
}

export interface TableRegistry {
  get(id: string): RollTable | undefined;
  all(): RollTable[];
}

export interface RollRecord {
  /** Procedure step id or operation name. */
  step: string;
  /** Iteration when the step repeats. */
  iteration?: number;
  table?: string;
  dice: string;
  /** Raw die faces. */
  raw: number[];
  modifier: number;
  total: number;
  rowLabel?: string;
  result: unknown;
  /** Nested rolls fired by the row. */
  nested?: RollRecord[];
  page?: PageRef;
  cite?: CiteRef;
}

export interface TableRollOptions {
  /** Data context for modifiers (earlier results, inputs). */
  context?: Record<string, unknown>;
  /** Additional flat modifier chosen by the GM. */
  extraModifier?: number;
  /** Step id recorded on the RollRecord. */
  step?: string;
  iteration?: number;
}

// ---------------------------------------------------------------------------
// Procedures (seeded, multi-step generators)
// ---------------------------------------------------------------------------

export interface ProcedureContext {
  /** Procedure inputs (e.g. region, pcCount, frame). */
  inputs: Record<string, unknown>;
  /** Step id -> result. Repeated steps store an array. */
  results: Record<string, unknown>;
  /** Everything rolled so far. */
  rolls: RollRecord[];
  tables: TableRegistry;
  /** Convenience getters. */
  get<T = unknown>(stepId: string): T | undefined;
  /** Derived context exposed to table modifiers (inputs + results flattened). */
  data(): Record<string, unknown>;
}

export interface ProcedureStep {
  id: string;
  title?: string;
  page?: PageRef;
  cite?: CiteRef;
  /** Table id, or a function choosing a table from context. */
  table?: string | ((ctx: ProcedureContext) => string);
  /** Step ids this step's modifiers read; used for the step graph and re-roll invalidation. */
  reads?: string[];
  skipIf?: (ctx: ProcedureContext) => boolean;
  /** Number of times to roll; a dice expression; or a function. Default 1. */
  repeat?: number | string | ((ctx: ProcedureContext) => number);
  /** GM may choose not to roll it. */
  optional?: boolean;
  /**
   * Non-table step: compute a value from context and the step's own RNG.
   * Must be deterministic given (ctx, rng).
   */
  compute?: (ctx: ProcedureContext, rng: Rng) => unknown;
  /** Transform a table result after rolling (e.g. derive a flag). */
  after?: (ctx: ProcedureContext, result: unknown, rng: Rng) => unknown;
  /** Extra flat modifier derived from context. Added on top of table modifiers. */
  modifier?: (ctx: ProcedureContext) => number;
  /**
   * How the GM sees the step's result: a short line (e.g. "4 × Dero Stalker")
   * shown instead of the result object, whose keys are for other steps and
   * `produce`. Runs after every step, with the step's result (also for a
   * pinned step) and its own rolls; must not roll. Empty or absent falls back
   * to the app's generic rendering.
   */
  display?: (ctx: ProcedureContext, result: unknown, rolls: RollRecord[]) => string | undefined;
}

export interface Procedure {
  id: string;
  name: string;
  description?: string;
  page?: PageRef;
  cite?: CiteRef;
  original?: boolean;
  mode?: PlayModeId[];
  /** JSON Schema for `inputs`. */
  inputs?: JsonSchema;
  steps: ProcedureStep[];
  /** Turn results into entities and relationships. */
  produce: (ctx: ProcedureContext) => GeneratedGraph["produced"];
  /** Which procedure to chain into after acceptance, if any (e.g. world after job). */
  chains?: Array<{ procedure: string; label: string; inputs?: (ctx: ProcedureContext) => Record<string, unknown> }>;
}

export interface ProducedEntity {
  /** Temporary id unique within the run; relationships reference it. */
  tempId: string;
  type: string;
  /** Entity subtype (e.g. "planet"). Falls back to `fields.subtype` when absent. */
  subtype?: string;
  name: string;
  summary?: string;
  tags?: string[];
  fields: Record<string, unknown>;
  /** Suggested parent (e.g. a colony within a planet) as a tempId. */
  within?: string;
  /**
   * The preset this entity was started from (its fields are already merged
   * into `fields`); recorded in the entity's provenance on acceptance.
   */
  preset?: string;
}

export interface ProducedRelationship {
  type: string;
  from: string;
  to: string;
  note?: string;
}

export interface GeneratedGraph {
  procedure: string;
  moduleVersion: string;
  /** Supplements merged into the module when it ran (id and version), when there were any. */
  supplements?: Array<{ id: string; version: string }>;
  seed: string;
  inputs: Record<string, unknown>;
  results: Record<string, unknown>;
  rolls: RollRecord[];
  produced: { entities: ProducedEntity[]; relationships: ProducedRelationship[] };
  /** Steps that were skipped, with the reason. */
  skipped: Array<{ step: string; reason: string }>;
  /** Step id -> the step's `display` line, for steps that declare one. Absent when none does. */
  display?: Record<string, string>;
}

export interface ProcedureRunOptions {
  seed: string;
  inputs?: Record<string, unknown>;
  /**
   * Per-step seed overrides. Re-rolling a step means giving it a new seed
   * without touching any other step.
   */
  stepSeeds?: Record<string, string>;
  /** GM-pinned step results; the step is not rolled. */
  pinned?: Record<string, unknown>;
  /** Optional steps the GM chose to include. */
  includeOptional?: string[];
}

// ---------------------------------------------------------------------------
// Entities and sheets
// ---------------------------------------------------------------------------

export type CoreEntityKind =
  | "character"
  | "creature"
  | "location"
  | "faction"
  | "item"
  | "vehicle"
  | "clue"
  | "job"
  | "encounter";

export type VisibilityLevel = "gm" | "players" | "some_players" | "revealed";

export type SheetWidget =
  | "text"
  | "textarea"
  | "richtext"
  | "number"
  | "checkbox"
  | "select"
  | "multiselect"
  | "tags"
  | "attribute"
  | "skill"
  | "skills"
  | "talents"
  | "conditions"
  | "gear"
  | "dicepool"
  | "supply"
  | "stress"
  | "computed"
  | "ref"
  | "reflist"
  | "statblock"
  | "table"
  | "list"
  | "entries"
  | "object"
  | "image"
  | "zonemap";

export interface SheetField {
  /** JSON pointer-ish dotted path into `fields`, e.g. "attributes.strength". */
  path: string;
  label?: string;
  widget?: SheetWidget;
  /** Help text or the id of a rule card to link. */
  rule?: string;
  mode?: PlayModeId[];
  readonly?: boolean;
  /** Grid span 1..12. */
  span?: number;
  /** For select widgets: enum values or a reference list id (e.g. "alien.skills"). */
  options?: string[] | { ref: string };
  /** For ref widgets: entity types allowed. */
  entityTypes?: string[];
  /** Widget-specific settings. */
  config?: Record<string, unknown>;
}

export interface SheetSection {
  id: string;
  title: string;
  mode?: PlayModeId[];
  columns?: number;
  fields: SheetField[];
  /** Collapsed by default. */
  collapsed?: boolean;
}

export interface SheetLayout {
  sections: SheetSection[];
  /** Fields shown in list rows and quick-stat cards at the table. */
  summary?: string[];
}

export interface EntityTypeDef {
  /** Full id, e.g. "alien.character". */
  id: string;
  /** Which core kind it extends. */
  kind: CoreEntityKind;
  name: string;
  plural: string;
  icon?: string;
  /** JSON Schema for the `fields` object. */
  schema: JsonSchema;
  sheet: SheetLayout;
  /** Derived values: name -> JSONLogic over { fields, computed } . Never stored. */
  computed?: Record<string, JsonLogicRule>;
  /** Field path -> default visibility. Unlisted fields inherit the entity's. */
  defaultVisibility?: Record<string, VisibilityLevel>;
  mode?: PlayModeId[];
  /** Field path -> list of fields that are players-visible on a PC sheet when the player owns it. */
  playerEditable?: string[];
  /** Sub-kinds, e.g. location subtypes. */
  subtypes?: Array<{ id: string; name: string; sheet?: SheetLayout; schema?: JsonSchema }>;
}

export interface RelationshipTypeDef {
  id: string;
  /** Label read from the `from` end, e.g. "employer of". */
  forward: string;
  /** Label read from the `to` end, e.g. "employed by". */
  reverse: string;
  fromKinds?: CoreEntityKind[];
  toKinds?: CoreEntityKind[];
  symmetric?: boolean;
}

/** Reference enumerations: skills, talents, careers... Not campaign entities. */
export interface ReferenceList {
  id: string;
  name: string;
  page?: PageRef;
  cite?: CiteRef;
  original?: boolean;
  /** JSON Schema of one item. */
  itemSchema?: JsonSchema;
  items: ReferenceItem[];
  unverified?: boolean;
  /**
   * Item keys the reference browser shows as columns, in order (default: the
   * first five keys found). Every key is still shown when an item is opened.
   */
  columns?: string[];
}

export interface ReferenceItem {
  id: string;
  name: string;
  page?: PageRef;
  cite?: CiteRef;
  mode?: PlayModeId[];
  summary?: string;
  /** A ruleset or edition label shown next to the item (e.g. "2024"), for lists that mix editions. */
  edition?: string;
  /**
   * Where the item comes from, shown as a badge: set by the loader on items a
   * supplement added (the supplement's name); a module may set it on its own
   * items when one list mixes sources (e.g. "SRD 5.2" beside SRD 5.1 items).
   */
  source?: string;
  [key: string]: unknown;
}

/** Stat-block presets the GM can start an entity from. */
export interface EntityPreset {
  id: string;
  entityType: string;
  /** Optional subtype id declared by the entity type (e.g. "planet"). */
  subtype?: string;
  name: string;
  summary?: string;
  page?: PageRef;
  cite?: CiteRef;
  original?: boolean;
  tags?: string[];
  fields: Record<string, unknown>;
  unverified?: boolean;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export type TemplateKind = "campaign" | "adventure" | "act" | "scene" | "session" | "checklist";

export interface TemplateScene {
  purpose: string;
  /** Markdown body. */
  body?: string;
  mandatory?: boolean;
  /** Seeds the scene's module-defined fields (narrative kind "scene"). */
  fields?: Record<string, unknown>;
}

export interface TemplateAct {
  number: number;
  title?: string;
  goal: string;
  pacing?: string;
  scenes?: TemplateScene[];
  /** Per-character handouts scaffold: one entry per PC slot. */
  handouts?: Array<{ title: string; body?: string; visibility?: VisibilityLevel }>;
  /** Seeds the act's module-defined fields (narrative kind "act"), e.g. a per-act length. */
  fields?: Record<string, unknown>;
}

export interface TemplateAdventure {
  title: string;
  premise?: string;
  /** Player-facing intro. */
  playerIntro?: string;
  /** GM-only situation. */
  gmSituation?: string;
  acts: TemplateAct[];
  epilogue?: string;
  /** Seeds the adventure's module-defined fields (narrative kind "adventure"). */
  fields?: Record<string, unknown>;
}

/** Phases of the session checklist: before, at and after the table. */
export type SessionChecklistPhase = "prep" | "play" | "wrap";

/**
 * Generic app events that can tick a session checklist item by themselves
 * (`autoWhen`). The app emits them where the action happens; an auto-tick
 * only ever marks an item done, never one the GM unticked.
 */
export type SessionChecklistEvent =
  /** At least one scene is planned for the session. */
  | "scenes-planned"
  /** The session log has text. */
  | "log-written"
  /** Something (an entity, a field, a handout) is revealed in the session. */
  | "revealed"
  /** Every end-of-session prompt of the module is answered (or there are none). */
  | "prompts-answered"
  /** The session summary is saved at wrap-up. */
  | "summary-saved"
  /** Loose ends are carried into the next session at wrap-up. */
  | "loose-ends-carried"
  /** Timeline entries are confirmed at wrap-up. */
  | "timeline-confirmed"
  /** The next session is planned. */
  | "next-session-planned"
  /** End-of-session advancement awards (the module's `progression` award checklist) are posted at wrap-up. */
  | "awards-given";

export const SESSION_CHECKLIST_EVENTS: readonly SessionChecklistEvent[] = [
  "scenes-planned",
  "log-written",
  "revealed",
  "prompts-answered",
  "summary-saved",
  "loose-ends-carried",
  "timeline-confirmed",
  "next-session-planned",
  "awards-given",
];

/** Id prefixes the core session checklist keeps for itself (defaults and the GM's own items). */
export const SESSION_CHECKLIST_RESERVED_PREFIXES: readonly string[] = ["prep.", "play.", "wrap.", "custom."];

/**
 * One checklist item. Session zero checklists use `kind`, `options` and
 * `writesTo` (answers go into campaign settings). Session checklists
 * (`appliesTo: "session"`) use `phase`, `guidance`, `mode`, `page` and
 * `autoWhen`; their ids must be namespaced with the module id
 * (e.g. `alien.prep.agendas`) so they never clash with core items.
 */
export interface TemplateChecklistItem {
  id: string;
  /** The question (session zero) or the checkbox label (session checklist): a short paraphrase, never book prose. */
  text: string;
  page?: PageRef;
  writesTo?: string;
  kind?: "text" | "choice" | "entity" | "boolean";
  options?: string[];
  /** Session checklists: the phase the item belongs to. Required there. */
  phase?: SessionChecklistPhase;
  /** Session checklists: one or two sentences shown when the item is expanded. */
  guidance?: string;
  /** Play modes the item applies to; the template's modes when absent. */
  mode?: PlayModeId[];
  /** Session checklists: tick the item when this app event happens. Manual when absent. */
  autoWhen?: SessionChecklistEvent;
}

export interface TemplateChecklist {
  title: string;
  items: TemplateChecklistItem[];
}

export interface Template {
  id: string;
  kind: TemplateKind;
  name: string;
  description?: string;
  mode?: PlayModeId[];
  page?: PageRef;
  cite?: CiteRef;
  original?: boolean;
  /**
   * For `checklist` templates: what the checklist is for. `session` items
   * join the core's generic session checklist (every session, after the core
   * items of their phase, filtered by mode; the GM can hide them per
   * campaign); each needs a `phase` and a module-namespaced id.
   * `session-zero` (or absent) is a one-off campaign checklist.
   */
  appliesTo?: "session" | "session-zero";
  scaffold: TemplateAdventure | TemplateAct | TemplateScene | TemplateChecklist | Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Rule cards
// ---------------------------------------------------------------------------

export interface RuleCard {
  id: string;
  title: string;
  /**
   * Markdown. A short paraphrase for sources without an open licence (never
   * book prose); openly licensed text may be used as written.
   */
  summary: string;
  /** Page cited. Every card cites its source: `page`, `cite`, or `original: true`. */
  page?: PageRef;
  /** Section citation, e.g. "SRD 5.1, Combat: Cover". */
  cite?: CiteRef;
  /** Written by the module author (advice, house summaries): nothing to cite. */
  original?: boolean;
  mode?: PlayModeId[];
  tags?: string[];
  links?: {
    tables?: string[];
    /** "entityType.fieldPath" */
    fields?: string[];
    rules?: string[];
    trackers?: string[];
  };
}

// ---------------------------------------------------------------------------
// Trackers
// ---------------------------------------------------------------------------

/**
 * Where a tracker's state lives. `session`, `scene` and `encounter` state is
 * kept per session and archived at wrap-up; `campaign` state lives on the
 * campaign itself and carries across sessions (and export/import).
 */
export type TrackerScope = "character" | "session" | "scene" | "encounter" | "campaign";

export interface TrackerDef {
  id: string;
  name: string;
  /** Widget kind; the UI package maps kinds to implementations. */
  kind: string;
  scope: TrackerScope;
  mode?: PlayModeId[];
  page?: PageRef;
  cite?: CiteRef;
  /** Entity field paths this tracker reads and writes, for the character scope. */
  binds?: string[];
  /** Rule card ids explaining this tracker. */
  rules?: string[];
  config?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

export interface CalendarDef {
  id: string;
  name: string;
  /** Default in-world year for a new campaign. */
  defaultYear: number;
  months: Array<{ name: string; days: number }>;
  weekdays?: string[];
  /** Template, e.g. "{year}-{month:02}-{day:02}" */
  format?: string;
}

// ---------------------------------------------------------------------------
// Hooks, prompts, effects
// ---------------------------------------------------------------------------

/** A declarative change the core applies to campaign data when the GM accepts it. */
export type Effect =
  | { kind: "setField"; entity: string; path: string; value: unknown }
  | { kind: "incrementField"; entity: string; path: string; by: number; min?: number; max?: number }
  | { kind: "addCondition"; entity: string; condition: { id: string; label: string; source?: string; page?: PageRef } }
  | { kind: "removeCondition"; entity: string; conditionId: string }
  | { kind: "log"; text: string }
  | { kind: "prompt"; prompt: Prompt }
  | CreateFromPresetEffect
  | ApplyPresetEffect
  | LedgerEffect
  | AwardEffect;

/**
 * Award progression points to a character and log it in the core's
 * advancement log (see `ProgressionDef`). `question` names one of the
 * module's award questions (its points and pool); otherwise `amount` goes
 * into `pool` (default "experience"). `key` makes it idempotent.
 */
export interface AwardEffect {
  kind: "award";
  entity: string;
  question?: string;
  amount?: number;
  pool?: ProgressionPoolId;
  reason?: string;
  key?: string;
}

/**
 * Create a new entity from one of the module's presets. `id` asks for a
 * specific (unused) entity id so the caller can refer to the entity before
 * the effect is applied; `tempId` names it for later effects in the same
 * batch (their `entity` or `link.to` may be the tempId). `link` adds a
 * relationship from the new entity to `link.to`.
 */
export interface CreateFromPresetEffect {
  kind: "createFromPreset";
  preset: string;
  name?: string;
  id?: string;
  tempId?: string;
  /** Fields merged over the preset's fields. */
  fields?: Record<string, unknown>;
  tags?: string[];
  link?: { type: string; to: string; note?: string };
}

/**
 * Replace an entity's fields with a preset's fields (same entity type), keeping
 * its id, name, notes, relationships and conditions, plus any field paths in
 * `keep`. The change is recorded in the entity's provenance.
 */
export interface ApplyPresetEffect {
  kind: "applyPreset";
  entity: string;
  preset: string;
  keep?: string[];
}

export interface Prompt {
  id: string;
  text: string;
  kind: "yesno" | "choice" | "number" | "text" | "roll";
  page?: PageRef;
  /** For choice prompts. */
  options?: Array<{ id: string; label: string; effects?: Effect[] }>;
  /** Effects when answered yes / with a value. */
  onYes?: Effect[];
  /** For roll prompts: the dice operation or table to use. */
  roll?: { operation?: string; table?: string };
  /** Which entity the prompt is about (PC id), when per-character. */
  entity?: string;
}

export interface SessionEndContext {
  mode: PlayModeId;
  /** Player characters in the campaign (ids and fields). */
  characters: Array<{ id: string; name: string; fields: Record<string, unknown> }>;
  /** Tracker state captured during the session. */
  trackerState: Record<string, unknown>;
}

export interface ModuleHooks {
  onSessionEnd?(ctx: SessionEndContext): Prompt[];
  onEntityChange?(ctx: { mode: PlayModeId }, entity: { id: string; type: string; fields: Record<string, unknown> }): Effect[];
}

// ---------------------------------------------------------------------------
// Adventure builders (guided authoring with a review checklist)
// ---------------------------------------------------------------------------

/** Narrative records a module can add fields to. */
export type NarrativeKind = "adventure" | "act" | "scene";

/**
 * Module-defined fields on a narrative record, stored in the record's `fields`
 * and rendered by the schema-driven sheet renderer, exactly like entity fields.
 */
export interface NarrativeFieldsDef {
  kind: NarrativeKind;
  schema: JsonSchema;
  sheet: SheetLayout;
  computed?: Record<string, JsonLogicRule>;
  mode?: PlayModeId[];
}

/**
 * A named group of entities an adventure uses (e.g. "pcs", "npcs", "locations").
 * The adventure stores the chosen entity ids in `adventure.cast[role]`.
 */
export interface CastRoleDef {
  id: string;
  label: string;
  /** Entity type the role holds; new members are created with this type. */
  entityType: string;
  subtype?: string;
  /** Fields set on entities created for this role (e.g. `{ isPC: true }`). */
  defaults?: Record<string, unknown>;
  /** Entity field paths shown when editing a member in the builder. */
  fields?: string[];
  min?: number;
  max?: number;
}

/** One part of a builder step's form. Core fields use the `core.` prefix (e.g. `core.title`). */
export type BuilderPanel =
  | { kind: "adventure"; fields: string[] }
  | { kind: "cast"; role: string }
  | { kind: "act"; act: number; fields: string[]; scenes?: boolean; sceneFields?: string[] }
  | { kind: "agendas"; role: string }
  | { kind: "review" };

export interface BuilderStep {
  id: string;
  title: string;
  page?: PageRef;
  /** Short field-guide tips for this step, in the module's own words. */
  guide?: string[];
  panels: BuilderPanel[];
}

export type ReviewLevel = "bad" | "warn";

/**
 * One review check. It runs once, or once per item of `each` (a collection in the
 * review context: "pcs", "npcs", "locations" or any cast role, "acts", "scenes").
 * `when` is a JSONLogic predicate over `{ adventure, acts, scenes, cast, item, index }`;
 * true means the issue is present. `check` is the code alternative for checks that
 * JSONLogic cannot express; it returns the issue messages (empty when fine).
 * Messages may use `{name}`, `{n}` (1-based index), `{act}` and `{value}` placeholders.
 */
export interface ReviewRule {
  id: string;
  /** Builder step the issue belongs to (drives the step's status dot). */
  step: string;
  level: ReviewLevel;
  each?: string;
  when?: JsonLogicRule;
  check?: (item: Record<string, unknown>, ctx: Record<string, unknown>) => string[];
  /** JSONLogic value for `{value}` in the messages. */
  value?: JsonLogicRule;
  message: string;
  /** Shown as a passed check when the rule finds nothing (omit to stay silent). */
  okMessage?: string;
  page?: PageRef;
}

export interface AdventureBuilderDef {
  id: string;
  name: string;
  description?: string;
  mode?: PlayModeId[];
  page?: PageRef;
  /** Template used to scaffold a new adventure built with this builder. */
  templateId?: string;
  cast: CastRoleDef[];
  steps: BuilderStep[];
  review: ReviewRule[];
}

// ---------------------------------------------------------------------------
// Site map generators (zone-graph maps rendered as deck plans)
// ---------------------------------------------------------------------------

/** A point on a deck grid, in grid units (the generator decides the unit, e.g. metres). */
export type MapPoint = [number, number];

export type MapZoneKind = "room" | "corridor" | "crawlspace" | "shaft" | "exterior" | "out-of-bounds";

export interface MapDeck {
  id: string;
  name: string;
  width: number;
  height: number;
  /**
   * "floor" (default) is a deck plan; "duct" is a separate crawlspace level
   * generated as its own sheet, linked to floor zones by access borders.
   */
  layer?: "floor" | "duct";
  /** Vertical order (0 = lowest); levels let ducts climb or drop between sheets. */
  level?: number;
  /** For a duct sheet: the floor deck it mostly serves (for grouping in the deck switcher). */
  serves?: string;
}

export interface MapZoneData {
  id: string;
  deck: string;
  /** Short label; key rooms always have one. */
  name?: string;
  kind: MapZoneKind;
  /** "floor" zones are walked; "duct" zones sit above or below a floor zone. */
  layer?: "floor" | "duct";
  /** Outline polygon on the deck grid. Duct zones may share space with floor zones. */
  poly: MapPoint[];
  /** Functional area tag for colouring (module vocabulary, e.g. "medical"). */
  area?: string;
  /** Key location: numbered and named on the map and listed in the zone key. */
  key?: boolean;
  /** Acts whose beats are meant to happen here (for GM act shading). */
  acts?: number[];
  /** Can hide and take cover here. */
  cluttered: boolean;
  /** Module-defined rule flags (e.g. dark, gravity, atmosphere, flammable, outerHull). */
  flags?: Record<string, unknown>;
  /** Rolled dressing, shown in the zone key. */
  details?: string[];
  salvage?: string[];
  /** What the players can be told. */
  playerNote?: string;
  /** GM-only note. */
  gmNote?: string;
}

/** `shaft` is a vertical link inside a duct network (climb or drop between duct sheets). */
export type MapBorderKind = "open" | "wall" | "door" | "hatch" | "blast" | "access" | "stairs" | "shaft";

export interface MapBorderData {
  id: string;
  a: string;
  b: string;
  kind: MapBorderKind;
  /** The drawn segment; omitted for vertical links (stairs, duct access). */
  segment?: [MapPoint, MapPoint];
  armor?: number;
  hp?: number;
  lock?: "none" | "mechanical" | "electronic";
  /** Acts in which the border starts locked or closed. */
  lockedInActs?: number[];
  /** Sealed access points are impassable to everyone. */
  sealed?: boolean;
  /** Hidden from players until found (secret access points, unknown locks). */
  hidden?: boolean;
  /** Module-defined flags (e.g. outerHull). */
  flags?: Record<string, unknown>;
}

export type MapMarkerKind = "start" | "spawn" | "waypoint" | "clue" | "npc" | "win" | "label" | "hazard";

export interface MapMarker {
  id: string;
  kind: MapMarkerKind;
  zone: string;
  label: string;
  act?: number;
  /** GM-only markers never appear on player outputs. */
  gmOnly: boolean;
  data?: Record<string, unknown>;
}

export interface MapCheck {
  id: string;
  /** "block" checks make the generator retry; "warn" checks are listed for review. */
  level: "block" | "warn";
  ok: boolean;
  message: string;
  page?: PageRef;
}

/** The structured result of a generator run, stored on a core SiteMap as its layout. */
export interface SiteLayout {
  decks: MapDeck[];
  zones: MapZoneData[];
  borders: MapBorderData[];
  markers: MapMarker[];
  /** Zone the crew starts in. */
  start?: string;
  /** Grid unit size in metres (1 = one square per metre). */
  gridM?: number;
  checks: MapCheck[];
  /** Module-defined GM data (e.g. act budgets, encounter timer presence). GM-only: never shown to players. */
  meta?: Record<string, unknown>;
}

/** How zone distance reads as a range band (e.g. 0 = Short, 1 = Medium, 2-4 = Long). */
export interface RangeBandDef {
  id: string;
  label: string;
  /** Inclusive maximum zone distance; the last band may omit it. */
  maxDistance?: number;
}

export interface MapLegendEntry {
  /** What the entry styles: a border kind, a zone flag, an area tag or a marker kind. */
  target: { border: MapBorderKind } | { flag: string; value?: unknown } | { area: string } | { marker: MapMarkerKind } | { kind: MapZoneKind };
  label: string;
  /** The rule it carries, in the module's own words. */
  rule?: string;
  page?: PageRef;
  /** Hidden on player outputs. */
  gmOnly?: boolean;
  /** Rendering hint (a colour token or CSS colour). */
  color?: string;
  /**
   * Generic icon for a flag entry: "fire", "vacuum", "float" (no gravity),
   * "dark" (dark overlay), "radiation", "water" or "hazard". Unknown names draw
   * the generic hazard glyph. A `{ flag, value }` target matches when the zone
   * flag equals `value`; a bare `{ flag }` matches any truthy value.
   */
  icon?: string;
}

export interface MapGeneratorContext {
  seed: string;
  /** Per-stage seed overrides: re-running a stage alone gives it a new seed. */
  stageSeeds?: Record<string, string>;
  /** A seeded RNG for a named sub-stream (stage or step). */
  rng: (stream: string) => Rng;
  tables: TableRegistry;
}

export interface MapGeneratorResult {
  layout: SiteLayout;
  /** How many attempts the block checks needed. */
  attempts: number;
  /** Set when no attempt passed every block check. */
  failedCheck?: string;
}

export interface MapGeneratorDef {
  id: string;
  name: string;
  description?: string;
  page?: PageRef;
  mode?: PlayModeId[];
  /** JSON Schema of the generator's inputs (the brief). */
  inputs: JsonSchema;
  /** Stages that can be re-run alone with a new seed, in pipeline order. */
  stages: Array<{ id: string; title: string }>;
  generate(inputs: Record<string, unknown>, ctx: MapGeneratorContext): MapGeneratorResult;
  /** Build generator inputs from an adventure review context (cast, acts, fields). */
  inputsFromAdventure?(ctx: Record<string, unknown>): Record<string, unknown>;
  /**
   * Border kinds and flags that block movement for distance, given the act.
   * `move`, when given, is the direction of travel across the border (core
   * passes it for every step of a path search), so a one-way drop can be
   * passable downward only. Without `move` the question is "passable at all".
   */
  passable?(border: MapBorderData, act: number, move?: MapMove): boolean;
  rangeBands?: RangeBandDef[];
  legend?: MapLegendEntry[];
  /**
   * Tables the GM rolls at the table for a zone, e.g. a duct event table
   * rolled when a token enters a duct zone. GM-only: never shown to players.
   */
  zoneTables?: MapZoneTable[];
}

/** One step across a border: which zone the mover leaves and enters, and the vertical direction from the decks' `level`s. */
export interface MapMove {
  from: string;
  to: string;
  /** "down" when `to` is on a lower level than `from`, "up" when higher, "level" otherwise (or when a level is missing). */
  vertical: "up" | "down" | "level";
}

/** A module table offered at the table for zones that match. */
export interface MapZoneTable {
  /** Table id in the module's table registry. */
  table: string;
  label: string;
  /** Which zones it applies to: by layer, by kind, or by a zone flag. */
  when: { layer?: "floor" | "duct"; kind?: MapZoneKind; flag?: string };
  /** One line on when to roll it. */
  hint?: string;
  page?: PageRef;
}

// ---------------------------------------------------------------------------
// Play guides (GM hints at the table: when to call for a roll, what it moves)
// ---------------------------------------------------------------------------

/** A heading the guide's entries sit under (e.g. an attribute and its skills). */
export interface PlayGuideGroup {
  id: string;
  label: string;
  /** One line on what the group covers in play. */
  summary?: string;
  page?: PageRef;
}

/**
 * One rollable stat or skill, written for the GM mid-scene: the story moments
 * that call for it, and how success, failure and a push should move the story.
 * Advice is the module's own; rules it relies on cite their page.
 */
export interface PlayGuideEntry {
  id: string;
  label: string;
  /** Group id from `PlayGuideDef.groups`. */
  group?: string;
  kind: "attribute" | "skill";
  /**
   * What the table's skill roller rolls for this entry: a skill id from the
   * character's skills widget, or `attr:<attribute id>` for an attribute alone.
   * Absent when the entry is not rolled directly.
   */
  roll?: string;
  /** One-line summary of what it covers. */
  summary?: string;
  /** Story moments to call for it, phrased as cues ("the crew needs to…"). */
  callFor: string[];
  /** What a success should move forward. */
  success?: string;
  /** How a failure keeps the story moving (a cost or complication, not a dead end). */
  failure?: string;
  /** What pushing risks or offers for this roll. */
  push?: string;
  /** Short example prompts the GM can say aloud. */
  examples?: string[];
  page?: PageRef;
  cite?: CiteRef;
  mode?: PlayModeId[];
}

export interface PlayGuideDef {
  id: string;
  title: string;
  /** Written by the module author (play advice): nothing to cite. */
  original?: boolean;
  intro?: string;
  /** General tips for weaving rolls into the story (when to roll, failing forward, pushing). */
  tips?: Array<{ text: string; page?: PageRef }>;
  groups: PlayGuideGroup[];
  entries: PlayGuideEntry[];
  mode?: PlayModeId[];
}

// ---------------------------------------------------------------------------
// Combat at the table (damage taken, creature turns, special attacks)
// ---------------------------------------------------------------------------

/** Where an entity type keeps its harm, and what happens when it is broken. */
export interface CombatHealthDef {
  entityType: string;
  /** Stored number field holding damage taken (state the table writes; never a computed value). */
  damagePath: string;
  /** Maximum health: a field path or a computed key of the entity type. */
  maxPath: string;
  /** Armor rating field, if the type has one. */
  armorPath?: string;
  /**
   * Armor fields that replace `armorPath` for a hit source (e.g. `{ fire: "armorVsFire" }`).
   * When the entity has no value at that path, `armorPath` applies.
   */
  armorBySource?: Record<string, string>;
  /**
   * Table rolled when health reaches zero (e.g. critical injuries, a broken-creature table); the first match wins.
   * `when` is JSONLogic over `{ fields, computed, type, subtype }`. With `operation`, the table runs that
   * dice operation for the entity instead of rolling `table` directly (so the operation's effects apply).
   */
  broken?: Array<{ when?: JsonLogicRule; table: string; label?: string; operation?: string }>;
  page?: PageRef;
}

/** What one hit does after armor, as the module resolves it. */
export interface HitInput {
  damage: number;
  armor: number;
  armorPiercing?: boolean;
  /** Extra successes beyond the first, when the module adds them to damage. */
  extraSuccesses?: number;
  /** e.g. "fire" when armor differs by source. */
  source?: string;
  /** The attack was aimed at a weak spot (modules that have the rule lower armor for it). */
  weakSpot?: boolean;
}
export interface HitResult {
  /** Damage that gets through. */
  damage: number;
  /** One line on how it was worked out, with page refs. */
  explain: string;
  /** Dice rolled for armor, if the module's rule rolls any. */
  rolls?: RollRecord[];
}

/** A creature's reaction to being damaged (e.g. acid splash). */
export interface DamageReactionDef {
  label: string;
  /** Field with the reaction's rating. */
  ratingPath: string;
  /** Base dice = rating, plus the damage just taken when true. */
  addDamageTaken: boolean;
  /** Field or computed key capping the damage taken that is added (e.g. maximum Health). */
  damageTakenCapPath?: string;
  /** Damage per success. */
  damage: number;
  /** Who it reaches, in the module's own words (e.g. "everything Adjacent"). */
  reach: string;
  /** Skip the reaction for these hit sources (e.g. "fire"). */
  exceptSources?: string[];
  text?: string;
  page?: PageRef;
}

/** How a creature acts at the table. */
export interface CreatureTurnDef {
  entityType: string;
  /** Field giving actions or initiative draws per round. */
  speedPath?: string;
  /**
   * Field holding the id of the creature's attack table. Rows' `result`
   * objects follow the attack convention `{ name, dice, damage, armorPiercing?, effect }`.
   */
  attackTablePath: string;
  /** Rules for using the table (e.g. re-roll an attack that cannot apply), with pages. */
  notes?: Array<{ text: string; page?: PageRef }>;
  onDamaged?: DamageReactionDef;
  page?: PageRef;
}

/** A special attack anyone can declare (e.g. disarm, grapple), rolled with a skill. */
export interface SpecialAttackDef {
  id: string;
  name: string;
  /** Roll id as the table skill roller takes it: a skill id or `attr:<id>`. */
  roll: string;
  action?: "full" | "quick";
  /** Opposing roll, if the target resists with one. */
  opposed?: string;
  /** What happens on success, paraphrased. */
  effect: string;
  /** Preconditions (e.g. "Adjacent", "a weapon in hand"). */
  requires?: string;
  page?: PageRef;
  mode?: PlayModeId[];
}

export interface CombatDef {
  health: CombatHealthDef[];
  /** The module's armor rule. */
  resolveHit?(hit: HitInput, rng: Rng): HitResult;
  creatureTurns?: CreatureTurnDef[];
  specialAttacks?: SpecialAttackDef[];
  /**
   * How an opposed roll is settled: most successes wins; on a tie, `winner`.
   * Absent: the table shows both results and leaves a tie to the GM.
   */
  opposedTies?: { winner: "attacker" | "defender"; text?: string; page?: PageRef };
  /** Rules shown with the combat panel. */
  rules?: string[];
}

// ---------------------------------------------------------------------------
// Money: the campaign ledger
// ---------------------------------------------------------------------------

/** How the module's money is named and written. */
export interface CurrencyDef {
  /** Singular name, e.g. "UA dollar". */
  name: string;
  plural?: string;
  /** Symbol written with amounts, e.g. "$". */
  symbol: string;
  /** Write the symbol after the number ("100 ¥") instead of before it. */
  symbolAfter?: boolean;
  /** Decimal places amounts are kept and shown with. Default 0 (whole units). */
  decimals?: number;
  /** BCP 47 locale for digit grouping. Default "en-US". */
  locale?: string;
  page?: PageRef;
}

/**
 * A ledger category. Categories with a `page` are money the book prices or
 * describes; a category without one is plain GM bookkeeping with no rule
 * behind it (say so in `description`).
 */
export interface LedgerCategoryDef {
  id: string;
  label: string;
  /** Which way money usually moves: income, expense, or either. The app pre-fills the sign from it. */
  direction: "in" | "out" | "either";
  /** One line on what goes here, in the module's own words. */
  description?: string;
  page?: PageRef;
  /** Rule card explaining it. */
  rule?: string;
}

/**
 * An entity whose value the GM can post to the ledger in one click (e.g. a
 * job's payment). `amountPath` is a field path or a computed key.
 */
export interface LedgerPayoutDef {
  entityType: string;
  amountPath: string;
  category: string;
  /** Button label, e.g. "Collect payment". */
  label: string;
  /** Field set on the entity when the payout is posted (e.g. status = done). */
  setOnPost?: { path: string; value: unknown };
  page?: PageRef;
}

/**
 * The campaign's money. Entries live in the core ledger; balances are always
 * summed from entries, never stored. The default account is the group's
 * shared funds (party or ship funds); entities of `accountEntityTypes` can
 * hold accounts of their own.
 */
export interface LedgerDef {
  currency: CurrencyDef;
  categories: LedgerCategoryDef[];
  /** Name of the shared account, e.g. "Crew funds". */
  defaultAccount: string;
  /** Entity types that may hold a personal account (e.g. PCs). */
  accountEntityTypes?: string[];
  payouts?: LedgerPayoutDef[];
  mode?: PlayModeId[];
  rules?: string[];
}

/** Records a ledger entry can point at. Values are entity, session or travel-leg ids. */
export interface LedgerLinks {
  job?: string;
  session?: string;
  ship?: string;
  character?: string;
  travel?: string;
}

/**
 * Post a ledger entry. `amount` is signed: positive money in, negative money
 * out. `account` is an entity id for a personal account (default: the shared
 * one). `key` makes the posting idempotent: a second effect with the same key
 * is skipped (e.g. `job-payment:<jobId>` so a job cannot pay out twice).
 */
export interface LedgerEffect {
  kind: "ledger";
  amount: number;
  category: string;
  note: string;
  account?: string;
  links?: LedgerLinks;
  key?: string;
}

// ---------------------------------------------------------------------------
// The crew's ship (or wagon, or caravan) and travel between places
// ---------------------------------------------------------------------------

/**
 * Where the group's vehicle lives. The chosen entity id is kept in campaign
 * settings under `setting`; the app shows its card, the ledger and the travel
 * planner on one page.
 */
export interface CrewShipDef {
  /** Entity types that can be the group's vehicle. */
  entityTypes: string[];
  /** `meta.settings` key holding the chosen entity id. */
  setting: string;
  /** `meta.settings` key holding the group's current location id, kept in step by travel. */
  locationSetting?: string;
  /** Sheet section ids offered for editing on the card (every section when absent). */
  sections?: string[];
  /**
   * Values shown at a glance: a field path or computed key, with `max` for
   * "value/max". `format` "money" uses the ledger currency; "flag" shows the
   * label as a warning only while the value is true.
   */
  stats?: Array<{ label: string; path: string; max?: string; format?: "number" | "money" | "text" | "flag"; rule?: string }>;
  /** Array fields shown as short lists: `title` and `detail` are item keys; `badge` is shown as a tag. */
  lists?: Array<{ label: string; path: string; title: string; detail?: string[]; badge?: string; empty?: string; rule?: string }>;
  /** Page title, e.g. "Ship". */
  label?: string;
  /** Procedure the app offers between jobs (repairs, bills, shore leave), from the page and session wrap-up. */
  betweenJobs?: string;
  mode?: PlayModeId[];
  rules?: string[];
}

/** A place travel starts or ends at (an entity snapshot). */
export interface TravelEndpoint {
  id: string;
  name: string;
  type: string;
  subtype?: string;
  fields: Record<string, unknown>;
}

/** The travelling vehicle or a traveller, with computed values. */
export interface TravelEntity {
  id: string;
  name: string;
  type: string;
  fields: Record<string, unknown>;
  computed?: Record<string, unknown>;
}

export interface TravelRequest {
  ship?: TravelEntity;
  origin?: TravelEndpoint;
  destination: TravelEndpoint;
  /** Distance in the module's unit (`TravelDef.distance`), as the GM reads it off the map. */
  distance: number;
  /** Values for `TravelDef.options` (e.g. who stays awake). */
  options: Record<string, unknown>;
  /** The GM's own travel time in days, overriding the rule; the plan's checks follow it. */
  days?: number;
}

/** A roll or check travel calls for (e.g. supply or sickness rolls), shown in the planner. */
export interface TravelCheck {
  id: string;
  label: string;
  /** Who or what it is for (entity id), if anyone in particular. */
  entity?: string;
  /** Dice expression, when it is a roll. */
  dice?: string;
  /** How many times. */
  count: number;
  when: "departure" | "en-route" | "arrival";
  table?: string;
  page?: PageRef;
}

export interface TravelPlan {
  /** Whole in-world days the trip takes. */
  days: number;
  /** One line, e.g. "4 parsecs at FTL 12: 48 days". */
  summary: string;
  checks: TravelCheck[];
  notes: Array<{ text: string; page?: PageRef }>;
  /** Set when the trip cannot be made (e.g. the drive is broken); the app will not depart. */
  blocked?: string;
}

export interface TravelOutcome {
  rolls: RollRecord[];
  /** Lines for the travel log. */
  log: string[];
  /** Changes on arrival (supplies used, conditions, ledger postings); the GM can review them first. */
  effects: Effect[];
}

/**
 * Travel between places. `plan` is pure; `arrive` makes the plan's rolls with
 * the seeded RNG the core records on the travel leg, so the same seed gives
 * the same arrival.
 */
export interface TravelDef {
  /** The unit distances are entered in, e.g. parsecs read off a star map. */
  distance: { unit: string; plural: string; help?: string; page?: PageRef };
  /** Entity types (and subtypes) that can be a destination. */
  destinations: Array<{ entityType: string; subtypes?: string[] }>;
  /** JSON Schema of planner options; per-character arrays work as in procedure inputs. */
  options?: JsonSchema;
  plan(req: TravelRequest): TravelPlan;
  arrive(req: TravelRequest, plan: TravelPlan, rng: Rng, tables: TableRegistry): TravelOutcome;
  page?: PageRef;
  mode?: PlayModeId[];
  rules?: string[];
}

/**
 * Procedure input hint: a property whose schema carries `"x-entity"` is an
 * entity picker. The app passes the chosen entity as a snapshot
 * `{ id, name, type, fields }` (so runs stay reproducible), pre-filled from
 * campaign setting `setting` when given.
 */
export const ENTITY_INPUT_HINT = "x-entity" as const;
export interface EntityInputHint {
  types: string[];
  setting?: string;
}
/** The value an `x-entity` input carries. */
export interface EntitySnapshot {
  id: string;
  name: string;
  type: string;
  fields: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Character progression: experience, story points, advancement
// ---------------------------------------------------------------------------

/** The two pools a progression can move: experience (spent on the sheet) and story points (spent at the table). */
export type ProgressionPoolId = "experience" | "story";

/**
 * A running pool kept on the character sheet at `path` (experience points,
 * story or hero points). It is stored state the players earn and spend, like
 * stress or damage, not a value derived from other fields; the core's
 * advancement log records every award and spend that moves it.
 */
export interface ProgressionPoolDef {
  /** Field path on the advancing entity, e.g. "xp". */
  path: string;
  /** Short label, e.g. "XP". */
  label: string;
  /** Long name, e.g. "Experience points". */
  name?: string;
  /** Lowest value (default 0). */
  min?: number;
  /** Most the character can hold, if the rules cap it. */
  max?: number;
  page?: PageRef;
  rule?: string;
  mode?: PlayModeId[];
}

export interface ExperienceDef extends ProgressionPoolDef {
  /**
   * When experience may be spent. "between-sessions": the app warns while a
   * session is running (the GM can still go ahead). Default "any".
   */
  spendWhen?: "between-sessions" | "any";
  /** The timing rule in the module's own words. */
  spendWhenText?: string;
}

/** One thing a story point buys at the table. */
export interface StoryPointUseDef {
  id: string;
  /** Short label, e.g. "Success on one base die". */
  label: string;
  /** The rule, paraphrased. */
  text: string;
  page?: PageRef;
  /** Points it costs (default 1). */
  cost?: number;
  /**
   * A dice operation that applies the use to a roll: input `{ result }` (the
   * RollResult) and, optionally, `entity`; its `result` is the improved
   * RollResult. With one, the roll panel offers the use on a roll result.
   * The app logs the spend itself, so call it without `entity` when the
   * operation would also move the pool.
   */
  operation?: string;
  /** When on a roll it may be used: before a push, after one, or either (default "any"). */
  push?: "before" | "after" | "any";
}

export interface StoryPointDef extends ProgressionPoolDef {
  /** How they are earned, in the module's own words. */
  earn: Array<{ text: string; page?: PageRef }>;
  /** What they are spent on. */
  uses: StoryPointUseDef[];
  /** At the end of an adventure, keep at most `max` for the next one. */
  carryOver?: { max: number; text: string; page?: PageRef };
}

/** What an award question's `when` and `suggest` see, per character. */
export interface AwardContext {
  mode: PlayModeId;
  character: { id: string; name: string; type: string; fields: Record<string, unknown> };
  computed: Record<string, unknown>;
  /** Relationship type id -> how many relationships of that type the character has (either direction). */
  relationships: Record<string, number>;
  /** The session's tracker state (e.g. a panic log), empty outside a session. */
  trackerState: Record<string, unknown>;
}

/** One line of the end-of-session (or end-of-act) award checklist. */
export interface AwardQuestionDef {
  id: string;
  /** The question, paraphrased. */
  text: string;
  /** Points for a yes (default 1). */
  amount?: number;
  /** Pool it pays into (default "experience"). */
  pool?: ProgressionPoolId;
  /** When it is asked: at the end of a session (default), of each act, or for downtime between jobs. */
  timing?: "session" | "act" | "downtime";
  page?: PageRef;
  mode?: PlayModeId[];
  /** JSONLogic over the `AwardContext`; false means the question does not apply to this character. */
  when?: JsonLogicRule;
  /** Why it does not apply, shown when `when` is false. */
  whenText?: string;
  /** Ticked from the start (e.g. "were you there?"). */
  defaultYes?: boolean;
  /** Ticked as a suggestion when this returns true (e.g. the session logged a panic roll for the character). */
  suggest?(ctx: AwardContext): boolean;
  /** One line of guidance for the GM. */
  hint?: string;
}

/**
 * What a spend option changes on the sheet.
 * - `level`: raise one numeric key of the object at `path` by one step (e.g. a
 *   skill), up to `max`. Keys come from reference list `ref` or from `keys`.
 * - `pick`: add an item of reference list `ref` to the array at `path`, as
 *   `{ id, [countKey]: n }` entries (`countKey` default "count"); taking an
 *   item again raises its count up to the number in the item's `stackKey`
 *   property (default "maxStack"; an item without one is taken once).
 */
export type SpendTarget =
  | { kind: "level"; path: string; ref?: string; keys?: string[]; max: number; step?: number }
  | {
      kind: "pick";
      path: string;
      ref: string;
      countKey?: string;
      stackKey?: string;
      /** Item property shown as a tag (e.g. the career a talent belongs to), resolved to a reference item's name when one has that id. */
      groupKey?: string;
      /** Tag for items without `groupKey` (e.g. "General"). */
      groupEmpty?: string;
    };

/**
 * A precondition of a spend, JSONLogic over the spend context
 * `{ key, item, from, to, count, fields, computed }` (`item` is the reference
 * item, `count` the copies already held for picks). True means it holds.
 * "block" stops the spend; "confirm" is something the app cannot see (e.g.
 * "you had a teacher"), so the GM confirms it before applying.
 */
export interface SpendCheck {
  ok: JsonLogicRule;
  message: string;
  level: "block" | "confirm";
  page?: PageRef;
}

/** One way to spend a pool on the sheet, with its cost, caps and preconditions. */
export interface SpendOptionDef {
  id: string;
  label: string;
  /** One line on the rule, paraphrased. */
  text?: string;
  /** Pool it is paid from (default "experience"). */
  pool?: ProgressionPoolId;
  target: SpendTarget;
  /** Cost: a number, or JSONLogic over the spend context (e.g. `{ "*": [{ "var": "to" }, 5] }`). */
  cost: JsonLogicRule;
  /** Which keys or items may be chosen at all (JSONLogic over the spend context); others are listed as unavailable. */
  available?: JsonLogicRule;
  /** Why an item is unavailable, shown when `available` is false. */
  availableText?: string;
  checks?: SpendCheck[];
  page?: PageRef;
  rule?: string;
  mode?: PlayModeId[];
}

/**
 * How characters advance: the pools they keep, the award checklist the GM
 * runs at the end of a session or act, and what the pools buy. The core logs
 * every award and spend per character (see core `advancement.ts`).
 */
export interface ProgressionDef {
  /** Entity types that advance; `when` (JSONLogic over `{ fields, type }`) narrows a type (e.g. PCs only). */
  entities: Array<{ type: string; when?: JsonLogicRule }>;
  experience?: ExperienceDef;
  storyPoints?: StoryPointDef;
  awards: AwardQuestionDef[];
  spends: SpendOptionDef[];
  /** Other advancement in the module's own words (e.g. changing buddy and rival after a session). */
  notes?: Array<{ text: string; page?: PageRef; mode?: PlayModeId[] }>;
  rules?: string[];
  mode?: PlayModeId[];
}

// ---------------------------------------------------------------------------
// The module
// ---------------------------------------------------------------------------

export interface GameModule {
  manifest: ModuleManifest;
  dice: DiceSystem;
  entityTypes: EntityTypeDef[];
  relationshipTypes: RelationshipTypeDef[];
  referenceLists: ReferenceList[];
  presets: EntityPreset[];
  tables: RollTable[];
  procedures: Procedure[];
  templates: Template[];
  rules: RuleCard[];
  trackers: TrackerDef[];
  calendar: CalendarDef;
  /** Style notes for future AI prompts; unused in v1. */
  styleNotes?: string[];
  hooks?: ModuleHooks;
  /** Module-defined fields on adventures, acts and scenes. */
  narrativeFields?: NarrativeFieldsDef[];
  /** Guided adventure builders with their review checklists. */
  adventureBuilders?: AdventureBuilderDef[];
  /** Site map generators. */
  mapGenerators?: MapGeneratorDef[];
  /** GM hints at the table for each rollable stat and skill. */
  playGuides?: PlayGuideDef[];
  /** Damage taken, creature turns and special attacks at the table. */
  combat?: CombatDef;
  /** Money: currency, ledger categories and one-click payouts. */
  ledger?: LedgerDef;
  /** The group's own vehicle (a ship), shown with the ledger and travel planner. */
  crewShip?: CrewShipDef;
  /** Travel time and checks between places. */
  travel?: TravelDef;
  /** Experience, story points and spending them: award checklist, spend options, pools. */
  progression?: ProgressionDef;
  /** Upgrade stored entity fields from an older module version. */
  migrations?: Array<{ from: string; to: string; migrate: (entity: { type: string; fields: Record<string, unknown> }) => Record<string, unknown> }>;
}

/** Core relationship types every module gets for free. */
export const CORE_RELATIONSHIP_TYPES: RelationshipTypeDef[] = [
  { id: "within", forward: "within", reverse: "contains" },
  { id: "member_of", forward: "member of", reverse: "has member" },
  { id: "knows", forward: "knows", reverse: "known by", symmetric: true },
  { id: "owns", forward: "owns", reverse: "owned by" },
  { id: "found_at", forward: "found at", reverse: "holds" },
  { id: "wants", forward: "wants", reverse: "wanted by" },
  { id: "appears_in", forward: "appears in", reverse: "features" },
  { id: "blocks", forward: "blocks", reverse: "blocked by" },
];

/** Contract version the core implements. Modules declare `requiredCore`. */
export const CONTRACT_VERSION = "0.1.0";
