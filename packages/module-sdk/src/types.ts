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

/**
 * Several dice read as one number at the table (a 2d6 total, a d66, a
 * percentile roll). The dice a group consumes carry the same group object in
 * their hint, one after another, so a GM rolling physical dice can type the
 * number instead of each face (see `entered.ts`).
 */
export interface DiceGroup {
  /** What the number is, e.g. "2d6", "d66", "d100". */
  label: string;
  /** Lowest and highest number the dice can make. */
  min: number;
  max: number;
  /** The faces, in the order the group consumes them, that make `value`; undefined when the dice cannot make it. */
  faces(value: number): number[] | undefined;
}

/**
 * What a die rolled through `Rng.int` is, for a GM who rolls physical dice
 * and types the faces: a label ("Stress die", "Tens d10"), the DieSpec id
 * (for its colour) and the group it belongs to. Seeded Rngs ignore it.
 */
export interface DieHint {
  label?: string;
  /** DieSpec id, e.g. "stress". */
  die?: string;
  group?: DiceGroup;
}

/** Seeded random source. `next()` is in [0, 1). `int` is inclusive on both ends. */
export interface Rng {
  next(): number;
  /** A whole number from min to max; `hint` says which die it is, for a GM who enters dice rolled at the table. */
  int(min: number, max: number, hint?: DieHint): number;
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
  /**
   * A named part of the current step's result that the GM can re-roll or pin
   * on its own (one slot of one card, say), without touching the rest of the
   * step. Returns, in order: the pinned value (`pinnedParts`), a fresh roll
   * when the part was re-rolled (`partSeeds`), `opts.initial` when given (a
   * value an earlier step already decided), else a roll. Each part rolls on
   * its own RNG derived from the step seed and its key, so parts never shift
   * one another. Keys are recorded as "<step id>/<key>" in the graph's
   * `parts`. Meant for `compute` steps; outside a step it just rolls.
   */
  part<T>(key: string, roll: (rng: Rng) => T, opts?: { initial?: T }): T;
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
  /**
   * The procedure drafts per-act agendas: its `results.agendaDrafts` is an
   * `AgendaDraftSet` the app shows as editable cards and writes into each
   * character's agendas (and the adventure's agenda handouts) on accept. The
   * app offers it from an adventure's agendas.
   */
  agendaDrafts?: boolean;
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
  /** Step id -> the faces of dice rolled at the table for it (entered by the GM), in roll order. */
  entered?: Record<string, number[]>;
  /** "<step id>/<key>" -> the value of every part a step drew with `ctx.part` (re-roll or pin them one by one). */
  parts?: Record<string, unknown>;
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
  /**
   * Dice rolled at the table, per step: the step's rolls take these faces in
   * order (see `createEnteredRng`) instead of its seed. Every face must be
   * used; the graph records them in `entered`.
   */
  stepDice?: Record<string, number[]>;
  /** A step's Rng supplied by the caller (e.g. to find out which dice it asks for); wins over `stepDice` and the seed. */
  stepRng?: (stepId: string) => Rng | undefined;
  /** Per-part seed overrides ("<step id>/<key>"): re-rolling one part of a step (see `ProcedureContext.part`). */
  partSeeds?: Record<string, string>;
  /** GM-pinned part values ("<step id>/<key>"); the part is not rolled. */
  pinnedParts?: Record<string, unknown>;
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
  | "weapons"
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
  /**
   * Field paths the new-entity form asks for before the entity is saved
   * (e.g. a character's starting weapons), rendered with the same widgets as
   * the sheet. Absent: the form asks only for a name and a preset.
   */
  create?: string[];
}

// ---------------------------------------------------------------------------
// Weapons on a sheet (the `weapons` widget's config)
// ---------------------------------------------------------------------------

/** One column of a weapons table: a row key, shown and edited, or a display rule. */
export interface WeaponColumn {
  /** Row key the column shows and edits. */
  key?: string;
  label: string;
  /** JSONLogic over the row (or, in the picker, the preset's fields) for the text shown; default the value at `key`. */
  display?: JsonLogicRule;
  /** A narrow, right-aligned number column. */
  numeric?: boolean;
}

/** Where the "Add weapon" picker finds presets. */
export interface WeaponPresetSource {
  entityType: string;
  subtype?: string;
  /** Keep only presets carrying at least one of these tags. */
  tags?: string[];
  /** Leave out presets carrying any of these tags (e.g. vehicle-mounted weapons). */
  excludeTags?: string[];
  /** Picker groups in order: the presets carrying `tag`. Presets in no group are listed under "Other". */
  groups?: Array<{ tag: string; label: string }>;
}

/**
 * Config of a `weapons` sheet field: a list of weapon rows with stats as
 * columns, filled from the module's presets ("Add weapon"), from item
 * entities in the campaign, or blank. With `attack`, table mode can roll an
 * attack with a row.
 */
export interface WeaponListConfig {
  presets?: WeaponPresetSource;
  /** Campaign entities that can be linked as weapons. */
  items?: { entityType: string; subtype?: string };
  /** Row keys copied from a preset's or an item's fields. */
  copy: string[];
  /** Row key that records the preset a row was copied from (default `presetId`). */
  presetKey?: string;
  /** Row key that records the linked campaign entity (default `itemId`). */
  itemKey?: string;
  /** Columns after the name, in order. */
  columns: WeaponColumn[];
  /** Row keys a row's editor offers after the name, in order (default `copy`); labels come from the row schema's `title`. */
  edit?: string[];
  /** Stats the picker shows for each preset (default `columns`). */
  pickerColumns?: WeaponColumn[];
  /** Row key holding the weight (default `weight`), summed under the table. */
  weightKey?: string;
  /** Computed value with the total carried (gear and weapons), shown with `limitComputed`. */
  totalComputed?: string;
  limitComputed?: string;
  attack?: WeaponAttackConfig;
}

/**
 * How a weapon row attacks (table mode). Every rule is JSONLogic over
 * `{ weapon, range, rangeIndex, minIndex, maxIndex, closer, beyond }`:
 * the row, the range band picked, the band indexes (0 = nearest) of the
 * pick and of the weapon's minimum and maximum range, the number of bands
 * the pick is closer than the minimum, and whether it is beyond the maximum.
 */
export interface WeaponAttackConfig {
  /** Range bands, nearest first. */
  ranges: Array<{ id: string; label: string }>;
  /** Row keys with the weapon's minimum and maximum band (default `rangeMin`, `range`). */
  minRangeKey?: string;
  maxRangeKey?: string;
  /** The skill id rolled (one the sheet's skills widget offers). */
  skill: JsonLogicRule;
  /** Extra numbers for the dice system's pool input (e.g. a gear bonus, a range penalty). */
  pool?: Record<string, JsonLogicRule>;
  /** Base damage of a hit. */
  damage: JsonLogicRule;
  /** Each success beyond the first adds one damage. */
  extraSuccessesAddDamage?: boolean;
  /** The hit ignores one step of armor (passed to the module's armor rule). */
  armorPiercing?: JsonLogicRule;
  /** Hit source for the module's armor rule (e.g. "fire"); empty for an ordinary hit. */
  source?: JsonLogicRule;
  /** Notes shown with the attack when `when` holds. */
  notes?: Array<{ when: JsonLogicRule; text: string }>;
  /** Rule cards shown with the attack. */
  rules?: string[];
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
// GM screen: a printable quick reference built from the module's own content
// ---------------------------------------------------------------------------

/** How much of a page side a GM screen panel may take: one fold of a tri-fold, two folds, or the whole side. */
export type GmScreenSize = "third" | "half" | "full";

/** Which side of the screen a panel goes on: the GM's side, or the side that faces the players. */
export type GmScreenSide = "gm" | "players";

interface GmScreenBlockBase {
  /** Heading over the block (default: the referenced card's, table's or list's own name). */
  title?: string;
  /** Only in these play modes. */
  mode?: PlayModeId[];
}

/** A rule card, whole or a named excerpt: one `section` (a heading inside the card) and/or some of its `parts`. */
export interface GmScreenRuleBlock extends GmScreenBlockBase {
  kind: "rule";
  rule: string;
  /** Only the part of the card under this heading (its text, without the `#` marks). */
  section?: string;
  /** Only these parts (0-based paragraphs, lists, tables and headings of the card, or of its `section`). */
  parts?: number[];
}

/** A roll table, compactly: the dice, then one line per row (range, label and its result). */
export interface GmScreenTableBlock extends GmScreenBlockBase {
  kind: "table";
  table: string;
  /** Keys of an object result shown after the label (default: the first of effect, summary, text, description). */
  columns?: string[];
  /** Print the table's notes under it (default false). */
  notes?: boolean;
}

/** A reference list: item names with some of their columns and their summaries. */
export interface GmScreenListBlock extends GmScreenBlockBase {
  kind: "list";
  list: string;
  /** Only these item ids, in this order. */
  items?: string[];
  /** JSONLogic over each item: keep the item when true (e.g. `{ "==": [{ "var": "group" }, "Basic Actions"] }`). */
  where?: JsonLogicRule;
  /** Item keys shown next to the name (e.g. ["actions"]). */
  columns?: string[];
  /** Print each item's summary (default true). */
  summary?: boolean;
}

/** The declarative d20 conditions (`d20Combat.conditions`) with their helper text. */
export interface GmScreenConditionsBlock extends GmScreenBlockBase {
  kind: "conditions";
  /** Only these condition ids, in this order (default every condition). */
  conditions?: string[];
}

/** From a play guide: its tips (dice and rolling notes) and entries (what a stat or skill is for, with cues). */
export interface GmScreenGuideBlock extends GmScreenBlockBase {
  kind: "guide";
  /** Play guide id (default the module's first). */
  guide?: string;
  /** Tips to print: `true` for all, or their 0-based indexes. */
  tips?: boolean | number[];
  /** Entry ids to print (label, summary and the first `cues` cues). */
  entries?: string[];
  /** Cues printed per entry (default 1). */
  cues?: number;
}

/**
 * A short quick-rules note in the module author's own words (`original`
 * must be true). When it summarizes rules it cites them: a page, a section
 * or the rule cards it condenses. Prefer a reference to a card, table or
 * list whenever one will do: no rule text twice.
 */
export interface GmScreenTextBlock extends GmScreenBlockBase {
  kind: "text";
  /** Markdown: short paragraphs, bullets or a small table. */
  text: string;
  original: true;
  page?: PageRef;
  cite?: CiteRef;
  /** Rule card ids this note summarizes. */
  rules?: string[];
}

export type GmScreenBlock = GmScreenRuleBlock | GmScreenTableBlock | GmScreenListBlock | GmScreenConditionsBlock | GmScreenGuideBlock | GmScreenTextBlock;

export interface GmScreenPanel {
  /** Unique within the screen; the app remembers a campaign's choices by it. */
  id: string;
  title: string;
  /** Room it may take on a page side (default "third": one fold). */
  size?: GmScreenSize;
  /** Default "gm". Player-facing panels go on the back of the tri-fold. */
  side?: GmScreenSide;
  /** Offered in the picker but left out until the GM adds it. */
  optional?: boolean;
  /** Only in these play modes. */
  mode?: PlayModeId[];
  blocks: GmScreenBlock[];
}

/**
 * The module's GM screen: panels of references to its own rule cards,
 * tables, reference lists, conditions and play guide tips, plus short
 * original quick-rules notes. The app lays them out as a printable tri-fold
 * (GM side and player side) or as cards. Modules without one get a screen
 * built from their rule cards by tag.
 */
export interface GmScreenDef {
  /** Default "GM screen". */
  title?: string;
  panels: GmScreenPanel[];
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
// Campaign primer (session 0)
// ---------------------------------------------------------------------------

/**
 * The standard sections of a campaign primer, in order. A module's primer
 * gives prompts and starter text for any of them (by id) and may add its own
 * sections, which come after these.
 */
export const PRIMER_SECTION_IDS = ["welcome", "setting", "lore", "places", "tone", "house-rules", "characters", "opening"] as const;
export type PrimerSectionId = (typeof PRIMER_SECTION_IDS)[number];

/** One section of the campaign primer: the player-facing introduction the GM prepares for session 0. */
export interface PrimerSectionDef {
  /** A standard id (PRIMER_SECTION_IDS) or the module's own (lower case letters, digits and hyphens). */
  id: string;
  title: string;
  /** What the GM writes here; shown to the GM only, never shared. */
  prompt: string;
  /** Starter text (Markdown) the GM edits before it goes to the players. */
  starter?: string;
  /**
   * The starter text is the module author's own words (no source text). A
   * module without an open licence must set it on every section with starter
   * text; openly licensed text cites its source with `cite` or `page`.
   */
  original?: boolean;
  page?: PageRef;
  cite?: CiteRef;
}

export interface PrimerDef {
  sections: PrimerSectionDef[];
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
// Declarative d20 combat: attacks, defences and conditions (data packs too)
// ---------------------------------------------------------------------------

/** A melee or ranged weapon (or natural) attack, or a spell attack. */
export type D20AttackKind = "melee" | "ranged" | "spell";

/** Rolls and numbers a condition effect can change. `dc`: the DCs the creature sets (its save DCs); `damage`: its damage rolls. */
export type D20EffectTarget = "attack" | "check" | "save" | "ac" | "dc" | "damage";

/** What a condition stops a creature doing. Shown on its card; the app does not enforce it. */
export type D20Restriction = "act" | "react" | "move" | "speak" | "see" | "hear";

/** How damage of one type is changed: immune (none), resistant (halved, or less by `value`), vulnerable (doubled), weak (more by `value`). */
export type D20DamageModifierKind = "immunity" | "resistance" | "vulnerability" | "weakness";

/** One part of an attack's damage: "2d6+3 slashing". */
export interface D20DamagePart {
  /** Dice expression, e.g. "2d6+3", "1d8" or a flat "5". */
  dice: string;
  /** Damage type id from `D20CombatDef.damageTypes` (absent: untyped). */
  type?: string;
  /** Dealt later, as a condition (`D20CombatDef.persistentCondition`), not now (e.g. persistent fire). */
  persistent?: boolean;
}

/** One entry of a combatant's damage modifiers: "fire resistance 5", "immune to poison", "cold iron weakness 3". */
export interface D20DamageModifier {
  kind: D20DamageModifierKind;
  /** A damage type id, or a group of `D20CombatDef.damageGroups` (e.g. "physical", "all"). */
  type: string;
  /** Resistance or weakness amount; a resistance without one halves the damage. */
  value?: number;
  /** Attack traits that get past it (e.g. "magical", "silver", "adamantine"). */
  except?: string[];
  /** The stat block's own words, shown with it. */
  note?: string;
}

/** When a condition an attack or the GM applies ends. Several may be combined (e.g. 10 rounds, or a save each turn). */
export interface D20DurationSpec {
  /** Lasts this many rounds, ending at the end of the affected creature's turn. */
  rounds?: number;
  /** Until the end of the source's next turn. */
  sourceNextTurn?: boolean;
  /** A save at the end of each of the affected creature's turns ends it. `dc` defaults to the effect's DC. */
  save?: { save: string; dc?: number };
}

/** A condition an attack, a save effect or a rule applies. */
export interface D20ConditionApply {
  id: string;
  /** For valued conditions (frightened 2). */
  value?: number;
  duration?: D20DurationSpec;
}

/** An effect that asks for a save: a breath weapon, a poisoned bite, a spell. */
export interface D20SaveEffect {
  /** The DC: a number, or JSONLogic over the attacker's `{ fields, computed }`. */
  dc: number | JsonLogicRule;
  /** Save id from `D20CombatDef.saves`. */
  save: string;
  damage?: D20DamagePart[] | string;
  /**
   * Half damage on a success. With four degrees of success (`rules.save: "degrees"`)
   * the module's `rules.halfSave` multipliers apply instead (a basic save).
   * Without it a success takes no damage.
   */
  half?: boolean;
  /** Conditions on a failed save (and a critical failure). */
  conditions?: D20ConditionApply[];
  /** Conditions on a critical failure only (four degrees), instead of `conditions`. */
  criticalConditions?: D20ConditionApply[];
  /** What else happens, in the module's words. */
  text?: string;
}

/**
 * An attack as the app reads it from an entity (a monster's structured
 * action, a stat block's Strike, a sheet's attack row), normalized: the
 * attack roll bonus, damage parts with types, reach and range, traits, an
 * optional save effect.
 */
export interface D20Attack {
  name: string;
  kind: D20AttackKind;
  /** Attack roll modifier; absent when the attack makes no attack roll (a save effect only). */
  bonus?: number;
  damage: D20DamagePart[];
  /** Damage text the parser could not read as dice (e.g. "plus Grab"), kept for the GM. */
  damageNote?: string;
  reach?: string;
  range?: string;
  /** Lower case trait words (e.g. "agile", "finesse", "magical"); also matched against damage modifiers' `except`. */
  traits: string[];
  save?: D20SaveEffect;
  /** Conditions applied on a hit (e.g. grabbed). */
  onHit?: D20ConditionApply[];
  /** Other effects, in the module's words. */
  effect?: string;
  /** Ability the attack is based on (for conditions limited to abilities); defaults to `D20CombatDef.attackAbilities[kind]`. */
  ability?: string;
  /** Where it was read from: the entity field path and item index. */
  source: { path: string; index: number };
}

/**
 * Where an entity type keeps its attacks: a list field whose items follow
 * the attack convention `{ name, kind, bonus, damage, damageType, traits,
 * reach, range, save, onHit, effect, ability }`, or name their keys in `keys`.
 * `bonus` may be a number, text such as "+5" or "+7 [+3/−1]" (the first
 * number counts), or JSONLogic over `{ fields, computed, item }`; `damage`
 * a list of parts or text such as "1d8 + 3 slashing plus 1d6 fire".
 */
export interface D20AttackSource {
  path: string;
  /** Kind for items that do not say (default "melee"). */
  kind?: D20AttackKind;
  /** Item keys that differ from the convention, e.g. `{ "kind": "type" }`. */
  keys?: Partial<Record<"name" | "kind" | "bonus" | "damage" | "damageType" | "traits" | "reach" | "range" | "save" | "onHit" | "effect" | "ability", string>>;
}

/** How the app reads one or more entity types as combatants. Rules are JSONLogic over `{ fields, computed }`. */
export interface D20CombatantDef {
  entityTypes: string[];
  /** Armor Class. */
  ac: JsonLogicRule;
  /**
   * Hit points: `current` (a stored field the table writes) or `damage` (a
   * stored damage-taken field; current is max − damage), `max` (JSONLogic)
   * and an optional temporary hit point field.
   */
  hp: { current?: string; damage?: string; max: JsonLogicRule; temp?: string };
  /** Save id -> save bonus. */
  saves?: Record<string, JsonLogicRule>;
  /** Field holding a list of `D20DamageModifier`. */
  damageModifiers?: string;
  /** Field holding the condition ids (or names) the creature is immune to. */
  conditionImmunities?: string;
  attacks?: D20AttackSource[];
  /** Speed shown on the card (a number or text), with conditions' speed changes. */
  speed?: JsonLogicRule;
}

/** A saving throw the module knows. */
export interface D20SaveDef {
  id: string;
  name: string;
  /** Ability it is based on, for conditions limited to abilities. */
  ability?: string;
  /** The roll id the sheet's skills widget uses for it (e.g. "dexterity-save"), so a save rolled from a sheet counts as a save. */
  roll?: string;
}

/**
 * One mechanical effect of a condition, applied automatically while it is
 * active. Everything a condition does that this vocabulary cannot say stays
 * in its `summary` and `manual` list.
 */
export interface D20ConditionEffect {
  /** What it changes: the creature's own rolls and numbers, or (with `against`) attacks made against it. */
  on: D20EffectTarget[];
  /** Added to the roll or number: a number, or JSONLogic over `{ value }` (the condition's value), e.g. `{ "*": [-1, { "var": "value" }] }`. */
  modifier?: number | JsonLogicRule;
  /** Bonus type (e.g. "status", "circumstance"): with `rules.stacking: "typed"` only the worst penalty and best bonus of a type count. */
  bonusType?: string;
  /** Roll two d20 and keep the higher (advantage) or lower (disadvantage). */
  roll?: "advantage" | "disadvantage";
  /** The roll fails automatically (e.g. Strength and Dexterity saves while paralyzed). */
  autoFail?: boolean;
  /** Only rolls and numbers based on these abilities (and saves or attacks that use them). */
  abilities?: string[];
  /** Only these saves. */
  saves?: string[];
  /** Only these checks, by the roll id the sheet uses (e.g. "perception"). */
  skills?: string[];
  /** Only these kinds of attack. */
  attackKinds?: D20AttackKind[];
  /** Only from this condition value up (e.g. exhaustion levels). */
  minValue?: number;
  /** Applies to attack rolls made against the creature (the attacker's roll), not its own. */
  against?: boolean;
  /** With `against`: only when the attacker is close (`D20CombatDef.closeLabel`), or only when it is not. */
  range?: "close" | "far";
  /** With `against`: a hit is a critical hit. */
  critOnHit?: boolean;
}

/** A condition: its helper text, what the app applies by itself, and how it ends. */
export interface D20ConditionDef {
  id: string;
  name: string;
  /** Helper text: what the condition does, in plain words (short). */
  summary: string;
  page?: PageRef;
  cite?: CiteRef;
  original?: boolean;
  /** Rule card with the full text. */
  rule?: string;
  /** The condition has a value (frightened 2, exhaustion 3). */
  valued?: boolean;
  /** Highest value. */
  max?: number;
  /**
   * The value lives in this sheet field (a number; 0 means absent), when the
   * entity's type has it, so sheet trackers and the combat panel agree.
   */
  field?: string;
  effects?: D20ConditionEffect[];
  /** Conditions it brings with it (paralyzed: incapacitated). */
  implies?: string[];
  /** Things it stops the creature doing (shown on the card). */
  cannot?: D20Restriction[];
  /** Speed while it lasts: set to a number, multiplied, or changed by an amount. */
  speed?: { set?: number; multiply?: number; add?: number; minValue?: number };
  /** The value drops by this much at the end of each of the affected creature's turns (frightened). */
  endOfTurnDecrement?: number;
  /** Per-value notes (e.g. exhaustion levels), cumulative: every level up to the value applies. */
  levels?: Array<{ value: number; summary: string }>;
  /** What the app does not apply by itself, in short phrases (shown as "not automated"). */
  manual?: string[];
}

/** What happens to a combatant whose hit points drop to 0 (the first rule whose `when` matches applies). */
export interface D20ZeroHpRule {
  /** JSONLogic over `{ kind, type, fields, computed }` (`kind`: the entity type's core kind); absent: every combatant. */
  when?: JsonLogicRule;
  /** Conditions applied; a value may be JSONLogic over `{ critical, conditions, fields, computed }` (`conditions`: condition id -> current value). */
  conditions?: Array<{ id: string; value?: number | JsonLogicRule }>;
  /** The creature is out of the fight (dead or destroyed) at 0 hit points. */
  defeated?: boolean;
  /** When hit points rise above 0 again: conditions removed, conditions added (value as above), fields set. */
  recover?: { remove?: string[]; conditions?: Array<{ id: string; value?: number | JsonLogicRule }>; setFields?: Record<string, number | string | boolean> };
  /** The rule in the module's words (what the GM still does by hand: death saves, recovery checks). */
  text: string;
  page?: PageRef;
  cite?: CiteRef;
}

/** How attack rolls, critical hits and saves resolve. */
export interface D20ResolutionRules {
  /**
   * `natural20Doubles`: a total at or above AC hits; a natural 20 (the dice
   * engine's `critOn`) always hits and is a critical hit, a natural 1 always
   * misses. `degrees`: four degrees of success against AC from the dice
   * engine (`critMargin`, `naturalShift`); a critical success is a critical hit.
   */
  crit: "natural20Doubles" | "degrees";
  /** A critical hit rolls the damage dice twice (`dice`) or doubles the total (`total`). */
  critDamage: "dice" | "total";
  /** Saves: `total` (at or above the DC succeeds) or `degrees` (four degrees from the dice engine). */
  save: "total" | "degrees";
  /** Damage multipliers for `half` save effects by outcome (default: success 0.5, failure 1). Halved damage rounds down. */
  halfSave?: { criticalSuccess?: number; success: number; failure: number; criticalFailure?: number };
  /** `typed` (default): bonuses and penalties with the same `bonusType` do not stack; untyped ones do. `all`: everything stacks. */
  stacking?: "typed" | "all";
  /** Order damage modifiers apply in (default immunity, resistance, vulnerability, weakness). */
  damageOrder?: D20DamageModifierKind[];
}

/**
 * Combat for d20 games, as data (a pack can declare it): where each
 * combatant's AC, hit points, saves, damage modifiers and attacks live, how
 * an attack roll and a save resolve, the conditions with their helper text
 * and the effects the app applies by itself, and what happens at 0 hit points.
 */
export interface D20CombatDef {
  /** Damage types (id and name), e.g. from the module's damage type list. */
  damageTypes: Array<{ id: string; name: string }>;
  /** Named groups of damage types for damage modifiers (e.g. `{ "physical": ["bludgeoning", "piercing", "slashing"] }`); "all" always means every type. */
  damageGroups?: Record<string, string[]>;
  saves: D20SaveDef[];
  /** Ability a melee, ranged or spell attack is based on when the attack does not say. */
  attackAbilities?: Partial<Record<D20AttackKind, string>>;
  /** Skill roll id -> ability, for checks the sheet does not tie to an ability (stat blocks). */
  skillAbilities?: Record<string, string>;
  combatants: D20CombatantDef[];
  rules: D20ResolutionRules;
  conditions: D20ConditionDef[];
  zeroHp?: D20ZeroHpRule[];
  /** How the module says "close" for effects that care (default "within 5 feet"). */
  closeLabel?: string;
  /** Condition id a persistent damage part applies (e.g. "persistent-damage"). */
  persistentCondition?: string;
  /** Show each combatant's hit point state (unhurt, wounded, down; never numbers for creatures) on the player screen. Default false. */
  playerHealth?: boolean;
  /** Rule cards shown with the combat panel. */
  ruleCards?: string[];
  page?: PageRef;
  cite?: CiteRef;
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

/**
 * Procedure input hint: a property whose schema carries `"x-campaign"` is
 * filled by the app with a `CampaignSnapshot` of the campaign's entities
 * (ids, names, types and tags, plus the scalar fields asked for; no text) and
 * their relationships, so a procedure can aim at what the campaign already
 * holds. The snapshot is stored with the run, so runs stay reproducible.
 */
export const CAMPAIGN_INPUT_HINT = "x-campaign" as const;
export interface CampaignInputHint {
  /** Entity kinds to include (character, location, item...); all when absent. */
  kinds?: string[];
  /** Entity types to include; all when absent. */
  types?: string[];
  /** Scalar fields (string, number, boolean) copied onto each summary, e.g. ["android"]. */
  fields?: string[];
  /** Relationship types to include; all when absent. */
  relationships?: string[];
}
/** One entity in a `CampaignSnapshot`. */
export interface CampaignEntitySummary {
  id: string;
  name: string;
  type: string;
  /** The entity type's kind (character, location, item, faction...). */
  kind?: string;
  subtype?: string;
  /** A player character (flagged as a PC or owned by a member). */
  pc?: boolean;
  tags: string[];
  /** The scalar fields the hint asked for, when set. */
  fields?: Record<string, string | number | boolean>;
}
/** The value an `x-campaign` input carries. */
export interface CampaignSnapshot {
  entities: CampaignEntitySummary[];
  relationships: Array<{ type: string; from: string; to: string }>;
}

/**
 * Procedure input hint: a property whose schema carries `"x-adventure"` is an
 * adventure picker. The app passes an `AdventureSnapshot`: the premise, the
 * hidden situation and the act texts as plain text, the cast by role and the
 * named rooms of its site maps. A per-character input of the same procedure
 * is filled from the adventure's player characters.
 */
export const ADVENTURE_INPUT_HINT = "x-adventure" as const;
export type AdventureInputHint = Record<string, never>;
/** The value an `x-adventure` input carries. */
export interface AdventureSnapshot {
  id: string;
  title: string;
  premise: string;
  /** What is really going on: the GM situation, as plain text. */
  situation: string;
  /** The adventure's string narrative fields (module-defined, e.g. a countdown). */
  fields: Record<string, string>;
  acts: Array<{ number: number; title: string; goal: string; fields: Record<string, string> }>;
  /** Entity ids by the builder's cast role (e.g. pcs, npcs, locations). */
  cast: Record<string, string[]>;
  /** Named rooms of the adventure's site maps. */
  rooms: string[];
}

// ---------------------------------------------------------------------------
// Agenda drafts (a procedure's `results.agendaDrafts`)
// ---------------------------------------------------------------------------

/** One slot of a draft the GM can re-roll or pin: `key` is the part key ("<step id>/<key>"). */
export interface AgendaDraftSlot {
  key: string;
  label: string;
  text: string;
}
export interface AgendaDraftAct {
  act: number;
  /** The draft text, as written into the character's agenda for the act. */
  text: string;
  slots: AgendaDraftSlot[];
  /** A short note shown with the act (e.g. how pursuing it earns the act's reward), with its page. */
  hint?: { label: string; text: string; page?: PageRef };
}
export interface AgendaDraftCharacter {
  /** Entity id; a placeholder id when `inCampaign` is false. */
  id: string;
  name: string;
  inCampaign: boolean;
  /** The arc dealt: a name and a one-line summary. */
  title?: string;
  summary?: string;
  /** The procedure input that fixes this character's arc: the path into the inputs and the value that locks it. */
  lock?: { path: Array<string | number>; value: string; locked: boolean };
  /** Slots that hold for every act (e.g. who they answer to, and why). */
  slots: AgendaDraftSlot[];
  acts: AgendaDraftAct[];
}
export interface AgendaDraftReport {
  ok: boolean;
  summary: string;
  lines: Array<{ tone: "ok" | "info" | "warning" | "danger"; text: string }>;
  /** Pairwise scores, highest first (character names). */
  pairs?: Array<{ a: string; b: string; score: number; reasons: string[] }>;
}
export interface AgendaDraftSet {
  /** Character field holding one `{ act, text }` row per act. */
  field: string;
  acts: number[];
  characters: AgendaDraftCharacter[];
  report?: AgendaDraftReport;
  /** Shown above the drafts (e.g. "Drafts: revise them to fit your story"). */
  note?: string;
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
  /** Prompts and starter text for the campaign primer (the players' session 0 introduction). */
  primer?: PrimerDef;
  /** Damage taken, creature turns and special attacks at the table. */
  combat?: CombatDef;
  /** Declarative d20 combat: attacks, AC and saves, damage modifiers, conditions with helper text and effects. Packs can declare it. */
  d20Combat?: D20CombatDef;
  /** Money: currency, ledger categories and one-click payouts. */
  ledger?: LedgerDef;
  /** The group's own vehicle (a ship), shown with the ledger and travel planner. */
  crewShip?: CrewShipDef;
  /** Travel time and checks between places. */
  travel?: TravelDef;
  /** Experience, story points and spending them: award checklist, spend options, pools. */
  progression?: ProgressionDef;
  /** A printable GM screen built from the module's own content. Packs can declare it. */
  gmScreen?: GmScreenDef;
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
