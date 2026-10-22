/**
 * The published JSON Schema of the data pack format (draft-07), written as
 * TypeScript so the compiler keeps it in step with the contract:
 *
 * - `object<T>()(properties, required)` must list every property of `T` (and
 *   no other), and `required` must name every required key of `T`. Adding a
 *   field to `RollTable` in `types.ts` without adding it here fails
 *   `pnpm typecheck`.
 * - Closed enums (`SheetWidget`, `CoreEntityKind`, ...) are checked the same way.
 *
 * `schema/module-pack.schema.json` and `schema/module-pack-part.schema.json`
 * are generated from this file (`pnpm --filter @campaign-forge/module-sdk gen-schema`);
 * a test fails when they are stale.
 *
 * The schema checks shapes. What it cannot express (ids namespaced with the
 * pack id, JSONLogic operators, the safe JSON Schema subset, size limits) is
 * checked in `validate.ts`; the conformance suite checks the rest.
 */
import type {
  D100EngineConfig,
  D20EngineConfig,
  D20ModifierChoice,
  PercentileDegree,
  PoolDieConfig,
  PoolEngineConfig,
  RollBand,
  TwoD6EngineConfig,
} from "../engines/types";
import type {
  CalendarDef,
  CoreEntityKind,
  EntityPreset,
  EntityTypeDef,
  JsonSchema,
  ModuleLicense,
  ModuleManifest,
  NestedRoll,
  PlayGuideDef,
  PlayGuideEntry,
  PlayGuideGroup,
  PlayMode,
  ReferenceList,
  RelationshipTypeDef,
  RollTable,
  RollTone,
  RuleCard,
  SessionChecklistEvent,
  SessionChecklistPhase,
  SheetField,
  SheetLayout,
  SheetSection,
  SheetWidget,
  TableModifier,
  TableRow,
  Template,
  TemplateKind,
  TrackerDef,
  TrackerScope,
  VisibilityLevel,
} from "../types";
import type {
  ModulePack,
  ModulePackPart,
  ModuleSupplement,
  ModuleSupplementPart,
  PackCollections,
  PackManifest,
  PackProcedure,
  PackProcedureStep,
  PackProduce,
  PackProducedEntity,
  PackProducedRelationship,
  SupplementManifest,
} from "./types";
import { PACK_FORMAT, PACK_FORMAT_VERSION, PACK_PART_FORMAT, SUPPLEMENT_FORMAT, SUPPLEMENT_FORMAT_VERSION, SUPPLEMENT_PART_FORMAT } from "./types";

// ---------------------------------------------------------------------------
// Typed builders
// ---------------------------------------------------------------------------

type RequiredKeys<T> = { [K in keyof T]-?: object extends Pick<T, K> ? never : K }[keyof T];
type AllListed<All, Got> = [Exclude<All, Got>] extends [never] ? unknown : { missingRequiredKeys: Exclude<All, Got> };
type Exactly<All, Got> = [Exclude<All, Got>] extends [never] ? ([Exclude<Got, All>] extends [never] ? unknown : { extraValues: Exclude<Got, All> }) : { missingValues: Exclude<All, Got> };

/** A closed object schema whose properties are exactly the keys of `T` (exported for the drift test). */
export function schemaObject<T>() {
  return <const R extends ReadonlyArray<RequiredKeys<T>>>(
    properties: { [K in keyof T]-?: JsonSchema },
    required: R & AllListed<RequiredKeys<T>, R[number]>,
    extra: JsonSchema = {},
  ): JsonSchema => ({
    type: "object",
    properties,
    ...((required as readonly string[]).length > 0 ? { required: [...(required as readonly string[])] } : {}),
    additionalProperties: false,
    ...extra,
  });
}

const object = schemaObject;

/** A string enum that must list exactly the members of the union `T` (exported for the drift test). */
export function oneOfValues<T extends string>() {
  return <const V extends readonly T[]>(values: V & Exactly<T, V[number]>, extra: JsonSchema = {}): JsonSchema => ({ type: "string", enum: [...(values as readonly string[])], ...extra });
}

const ref = (name: string): JsonSchema => ({ $ref: `#/definitions/${name}` });
const list = (items: JsonSchema, extra: JsonSchema = {}): JsonSchema => ({ type: "array", items, ...extra });
const str = (extra: JsonSchema = {}): JsonSchema => ({ type: "string", ...extra });
const text = str({ minLength: 1 });
const bool: JsonSchema = { type: "boolean" };
const int = (extra: JsonSchema = {}): JsonSchema => ({ type: "integer", ...extra });
const num: JsonSchema = { type: "number" };
/** Any JSON value; checked as JSONLogic by the validator. */
const logic: JsonSchema = { description: "JSONLogic (https://jsonlogic.com), evaluated by the SDK. Literals evaluate to themselves." };
/** A JSON Schema; the validator checks it uses the safe subset. */
const schemaSlot: JsonSchema = { type: "object", description: "A JSON Schema (draft-07, safe subset: no remote $ref, no pattern/patternProperties, no $data)." };
const freeObject: JsonSchema = { type: "object" };

// ---------------------------------------------------------------------------
// Closed vocabularies (each must match its union type exactly)
// ---------------------------------------------------------------------------

export const SHEET_WIDGETS = [
  "text", "textarea", "richtext", "number", "checkbox", "select", "multiselect", "tags", "attribute", "skill", "skills", "talents", "conditions",
  "gear", "dicepool", "supply", "stress", "computed", "ref", "reflist", "statblock", "table", "list", "entries", "object", "image", "zonemap",
] as const satisfies readonly SheetWidget[];
const CORE_KINDS = ["character", "creature", "location", "faction", "item", "vehicle", "clue", "job", "encounter"] as const satisfies readonly CoreEntityKind[];
const VISIBILITY = ["gm", "players", "some_players", "revealed"] as const satisfies readonly VisibilityLevel[];
const TEMPLATE_KINDS = ["campaign", "adventure", "act", "scene", "session", "checklist"] as const satisfies readonly TemplateKind[];
const TRACKER_SCOPES = ["character", "session", "scene", "encounter", "campaign"] as const satisfies readonly TrackerScope[];
const ROLL_TONES = ["critical", "success", "partial", "failure", "fumble", "neutral"] as const satisfies readonly RollTone[];
const CHECKLIST_PHASES = ["prep", "play", "wrap"] as const satisfies readonly SessionChecklistPhase[];
const CHECKLIST_EVENTS = [
  "scenes-planned", "log-written", "revealed", "prompts-answered", "summary-saved", "loose-ends-carried", "timeline-confirmed", "next-session-planned", "awards-given",
] as const satisfies readonly SessionChecklistEvent[];

// ---------------------------------------------------------------------------
// Definitions
// ---------------------------------------------------------------------------

const ID_PATTERN = "^[A-Za-z0-9][A-Za-z0-9_.:/-]*$";
/** A pack's manifest id: lower case, digits and hyphens. Every other id starts with it and a dot. */
export const PACK_ID_PATTERN = "^[a-z][a-z0-9-]{1,47}$";
const httpUrl = str({ pattern: "^https?://", maxLength: 2000 });

const definitions: Record<string, JsonSchema> = {
  id: str({ minLength: 1, maxLength: 200, pattern: ID_PATTERN }),
  page: { anyOf: [int({ minimum: 1 }), list(int({ minimum: 1 }), { minItems: 2, maxItems: 2 })], description: "A page, or an inclusive [first, last] range." },
  cite: str({ minLength: 1, maxLength: 200, description: "A section citation, e.g. \"SRD 5.1, Conditions\"." }),
  modes: list(ref("id")),
  tone: oneOfValues<RollTone>()(ROLL_TONES),

  playMode: object<PlayMode>()({ id: ref("id"), name: text, description: str(), page: ref("page"), cite: ref("cite") }, ["id", "name"]),
  license: object<ModuleLicense>()({ spdx: str({ maxLength: 100 }), name: text, url: httpUrl, attribution: text }, ["name", "attribution"]),
  sourceBook: object<NonNullable<ModuleManifest["sourceBook"]>>()({ title: text, year: int(), pageNote: str(), url: httpUrl }, ["title"]),
  manifest: object<PackManifest>()(
    {
      id: str({ pattern: PACK_ID_PATTERN }),
      version: str({ pattern: "^\\d+\\.\\d+\\.\\d+" }),
      name: text,
      ruleset: text,
      edition: str(),
      publisher: str(),
      licenseNotice: text,
      requiredCore: str({ pattern: "^\\d+\\.\\d+\\.\\d+" }),
      modes: list(ref("playMode"), { minItems: 1 }),
      defaultMode: ref("id"),
      dataStatus: { enum: ["unverified", "partially-verified", "verified"] },
      sourceBook: ref("sourceBook"),
      license: ref("license"),
      citationStyle: { enum: ["page", "section"] },
      authors: list(text),
    },
    ["id", "version", "name", "ruleset", "licenseNotice", "requiredCore", "modes", "defaultMode", "dataStatus", "license"],
  ),

  supplementManifest: object<SupplementManifest>()(
    {
      id: str({ pattern: PACK_ID_PATTERN }),
      name: text,
      version: str({ pattern: "^\\d+\\.\\d+\\.\\d+" }),
      extends: object<SupplementManifest["extends"]>()(
        { module: str({ pattern: PACK_ID_PATTERN, description: "The id of the module the supplement adds to." }), version: str({ minLength: 1, maxLength: 100, description: "A semver range of base module versions, e.g. \"^0.1.0\"." }) },
        ["module"],
      ),
      licenseNotice: str({ minLength: 1, maxLength: 2000 }),
      license: ref("license"),
      authors: list(text),
      description: str({ maxLength: 2000 }),
      dataStatus: { enum: ["unverified", "partially-verified", "verified"] },
    },
    ["id", "name", "version", "extends", "licenseNotice"],
  ),

  // Dice engines
  d20: object<D20EngineConfig>()(
    {
      engine: { const: "d20" },
      abilityModifier: bool,
      proficiency: logic,
      proficiencyMode: { enum: ["multiply", "add"] },
      bonus: logic,
      critOn: int({ minimum: 2, maximum: 20 }),
      fumbleOn: int({ minimum: 1, maximum: 19 }),
      critSucceeds: bool,
      fumbleFails: bool,
      critMargin: int({ minimum: 1, maximum: 40 }),
      naturalShift: bool,
      advantageNames: object<NonNullable<D20EngineConfig["advantageNames"]>>()({ normal: text, advantage: text, disadvantage: text }, []),
      modifierChoices: list(ref("d20ModifierChoice"), { maxItems: 4 }),
      freeDice: { type: "array", items: { type: "integer", minimum: 2, maximum: 100 }, maxItems: 10 },
      labels: object<NonNullable<D20EngineConfig["labels"]>>()({ success: text, failure: text, criticalSuccess: text, criticalFailure: text }, []),
    },
    ["engine"],
  ),
  d20ModifierChoice: object<D20ModifierChoice>()(
    {
      id: str({ pattern: "^[a-zA-Z][a-zA-Z0-9-]{0,39}$" }),
      title: text,
      choices: list(object<D20ModifierChoice["choices"][number]>()({ label: text, value: int({ minimum: -50, maximum: 50 }) }, ["label", "value"]), { minItems: 2, maxItems: 12 }),
    },
    ["id", "title", "choices"],
  ),
  poolDie: object<PoolDieConfig>()(
    { id: ref("id"), name: text, faces: int({ minimum: 2, maximum: 1000 }), success: list(int({ minimum: 1 })), bane: list(int({ minimum: 1 })), count: logic, color: str({ pattern: "^(#[0-9A-Fa-f]{3,8}|[a-z]{3,20})$" }) },
    ["id", "name"],
  ),
  pool: object<PoolEngineConfig>()(
    {
      engine: { const: "pool" },
      dice: list(ref("poolDie"), { minItems: 1, maxItems: 8 }),
      minDice: int({ minimum: 0, maximum: 100 }),
      push: { anyOf: [{ const: false }, object<{ max?: number; lockBanes?: boolean }>()({ max: int({ minimum: 1, maximum: 10 }), lockBanes: bool }, [])] },
      labels: object<NonNullable<PoolEngineConfig["labels"]>>()({ success: text, failure: text }, []),
    },
    ["engine"],
  ),
  band: object<RollBand>()({ min: int(), id: ref("id"), label: text, tone: ref("tone") }, ["min", "id", "label"]),
  "2d6": object<TwoD6EngineConfig>()({ engine: { const: "2d6" }, stat: logic, bands: list(ref("band"), { minItems: 1, maxItems: 12 }) }, ["engine"]),
  degree: object<PercentileDegree>()({ id: ref("id"), label: text, fraction: { type: "number", exclusiveMinimum: 0, maximum: 1 }, tone: ref("tone") }, ["id", "label", "fraction"]),
  d100: object<D100EngineConfig>()(
    {
      engine: { const: "d100" },
      target: logic,
      degrees: list(ref("degree"), { minItems: 1, maxItems: 8 }),
      criticalAt: int({ minimum: 0, maximum: 100 }),
      fumbleAt: int({ minimum: 1, maximum: 101 }),
      fumbleLowTarget: object<NonNullable<D100EngineConfig["fumbleLowTarget"]>>()({ below: int({ minimum: 1, maximum: 101 }), at: int({ minimum: 1, maximum: 101 }) }, ["below", "at"]),
      tensDice: bool,
      push: { anyOf: [{ const: false }, object<{ max?: number }>()({ max: int({ minimum: 1, maximum: 10 }) }, [])] },
      labels: object<NonNullable<D100EngineConfig["labels"]>>()({ failure: text }, []),
    },
    ["engine"],
  ),
  dice: {
    type: "object",
    required: ["engine"],
    properties: { engine: { enum: ["d20", "pool", "2d6", "d100"] } },
    // `if/then` keeps the errors about the chosen engine only.
    allOf: (["d20", "pool", "2d6", "d100"] as const).map((e) => ({ if: { properties: { engine: { const: e } } }, then: ref(e) })),
  },

  // Tables
  tableModifier: object<TableModifier>()({ when: logic, add: logic, label: str() }, ["add"]),
  nestedRoll: object<NestedRoll>()({ table: ref("id"), as: text, times: { anyOf: [int({ minimum: 0 }), str()] } }, ["table", "as"]),
  tableRow: object<TableRow>()(
    {
      range: list(int(), { minItems: 2, maxItems: 2 }),
      label: str(),
      result: { anyOf: [str(), freeObject] },
      gmDecides: bool,
      roll: list(ref("nestedRoll")),
      page: ref("page"),
      cite: ref("cite"),
      unverified: bool,
    },
    ["range", "result"],
  ),
  table: object<RollTable>()(
    {
      id: ref("id"),
      name: text,
      page: ref("page"),
      cite: ref("cite"),
      original: bool,
      dice: text,
      modifiers: list(ref("tableModifier")),
      rows: list(ref("tableRow"), { minItems: 1 }),
      mode: ref("modes"),
      tags: list(str()),
      notes: str(),
      unverified: bool,
      family: str(),
    },
    ["id", "name", "dice", "rows"],
  ),

  // Entity types and sheets
  sheetField: object<SheetField>()(
    {
      path: text,
      label: str(),
      widget: oneOfValues<SheetWidget>()(SHEET_WIDGETS),
      rule: str(),
      mode: ref("modes"),
      readonly: bool,
      span: int({ minimum: 1, maximum: 12 }),
      options: { anyOf: [list(str()), object<{ ref: string }>()({ ref: ref("id") }, ["ref"])] },
      entityTypes: list(ref("id")),
      config: freeObject,
    },
    ["path"],
  ),
  sheetSection: object<SheetSection>()(
    { id: ref("id"), title: text, mode: ref("modes"), columns: int({ minimum: 1, maximum: 12 }), fields: list(ref("sheetField")), collapsed: bool },
    ["id", "title", "fields"],
  ),
  sheet: object<SheetLayout>()({ sections: list(ref("sheetSection")), summary: list(str()) }, ["sections"]),
  subtype: object<NonNullable<EntityTypeDef["subtypes"]>[number]>()({ id: ref("id"), name: text, sheet: ref("sheet"), schema: schemaSlot }, ["id", "name"]),
  entityType: object<EntityTypeDef>()(
    {
      id: ref("id"),
      kind: oneOfValues<CoreEntityKind>()(CORE_KINDS),
      name: text,
      plural: text,
      icon: str({ maxLength: 40 }),
      schema: schemaSlot,
      sheet: ref("sheet"),
      computed: { type: "object", additionalProperties: logic },
      defaultVisibility: { type: "object", additionalProperties: oneOfValues<VisibilityLevel>()(VISIBILITY) },
      mode: ref("modes"),
      playerEditable: list(str()),
      subtypes: list(ref("subtype")),
    },
    ["id", "kind", "name", "plural", "schema", "sheet"],
  ),
  relationshipType: object<RelationshipTypeDef>()(
    { id: ref("id"), forward: text, reverse: text, fromKinds: list(oneOfValues<CoreEntityKind>()(CORE_KINDS)), toKinds: list(oneOfValues<CoreEntityKind>()(CORE_KINDS)), symmetric: bool },
    ["id", "forward", "reverse"],
  ),
  referenceItem: {
    type: "object",
    required: ["id", "name"],
    properties: {
      id: ref("id"),
      name: text,
      page: ref("page"),
      cite: ref("cite"),
      mode: ref("modes"),
      summary: str(),
      edition: str({ maxLength: 40, description: "A ruleset or edition label shown next to the item, e.g. \"2024\"." }),
      source: str({ maxLength: 200, description: "Where the item comes from, shown as a badge: the supplement's name (set by the loader on items a supplement added), or a source label a module gives its own items (e.g. \"SRD 5.2\")." }),
    },
    description: "Any other properties are the item's own data (e.g. the attribute a skill uses).",
  },
  referenceList: object<ReferenceList>()(
    { id: ref("id"), name: text, page: ref("page"), cite: ref("cite"), original: bool, itemSchema: schemaSlot, items: list(ref("referenceItem")), unverified: bool, columns: list(str()) },
    ["id", "name", "items"],
  ),
  preset: object<EntityPreset>()(
    {
      id: ref("id"),
      entityType: ref("id"),
      subtype: ref("id"),
      name: text,
      summary: str(),
      page: ref("page"),
      cite: ref("cite"),
      original: bool,
      tags: list(str()),
      fields: freeObject,
      unverified: bool,
    },
    ["id", "entityType", "name", "fields"],
  ),

  // Templates, rules, trackers, calendar, play guides
  template: object<Template>()(
    {
      id: ref("id"),
      kind: oneOfValues<TemplateKind>()(TEMPLATE_KINDS),
      name: text,
      description: str(),
      mode: ref("modes"),
      page: ref("page"),
      cite: ref("cite"),
      original: bool,
      appliesTo: { enum: ["session", "session-zero"] },
      scaffold: { ...freeObject, description: "Adventure, act, scene or checklist scaffold (see the pack format reference)." },
    },
    ["id", "kind", "name", "scaffold"],
    // A session checklist's items need a phase and may auto-tick on a known event.
    {
      if: { properties: { appliesTo: { const: "session" } }, required: ["appliesTo"] },
      then: {
        properties: {
          scaffold: {
            type: "object",
            required: ["items"],
            properties: {
              items: list({ type: "object", required: ["id", "text", "phase"], properties: { phase: oneOfValues<SessionChecklistPhase>()(CHECKLIST_PHASES), autoWhen: oneOfValues<SessionChecklistEvent>()(CHECKLIST_EVENTS) } }),
            },
          },
        },
      },
    },
  ),
  ruleCard: object<RuleCard>()(
    {
      id: ref("id"),
      title: text,
      summary: text,
      page: ref("page"),
      cite: ref("cite"),
      original: bool,
      mode: ref("modes"),
      tags: list(str()),
      links: object<NonNullable<RuleCard["links"]>>()({ tables: list(ref("id")), fields: list(str()), rules: list(ref("id")), trackers: list(ref("id")) }, []),
    },
    ["id", "title", "summary"],
  ),
  tracker: object<TrackerDef>()(
    {
      id: ref("id"),
      name: text,
      kind: text,
      scope: oneOfValues<TrackerScope>()(TRACKER_SCOPES),
      mode: ref("modes"),
      page: ref("page"),
      cite: ref("cite"),
      binds: list(str()),
      rules: list(ref("id")),
      config: freeObject,
    },
    ["id", "name", "kind", "scope"],
  ),
  calendar: object<CalendarDef>()(
    {
      id: ref("id"),
      name: text,
      defaultYear: int(),
      months: list(object<CalendarDef["months"][number]>()({ name: text, days: int({ minimum: 1, maximum: 1000 }) }, ["name", "days"]), { minItems: 1, maxItems: 100 }),
      weekdays: list(text),
      format: str({ maxLength: 100 }),
    },
    ["id", "name", "defaultYear", "months"],
  ),
  playGuideGroup: object<PlayGuideGroup>()({ id: ref("id"), label: text, summary: str(), page: ref("page") }, ["id", "label"]),
  playGuideEntry: object<PlayGuideEntry>()(
    {
      id: ref("id"),
      label: text,
      group: ref("id"),
      kind: { enum: ["attribute", "skill"] },
      roll: text,
      summary: str(),
      callFor: list(text),
      success: str(),
      failure: str(),
      push: str(),
      examples: list(str()),
      page: ref("page"),
      cite: ref("cite"),
      mode: ref("modes"),
    },
    ["id", "label", "kind", "callFor"],
  ),
  playGuide: object<PlayGuideDef>()(
    {
      id: ref("id"),
      title: text,
      original: bool,
      intro: str(),
      tips: list(object<NonNullable<PlayGuideDef["tips"]>[number]>()({ text: text, page: ref("page") }, ["text"])),
      groups: list(ref("playGuideGroup")),
      entries: list(ref("playGuideEntry")),
      mode: ref("modes"),
    },
    ["id", "title", "groups", "entries"],
  ),

  // Procedures
  procedureStep: object<PackProcedureStep>()(
    {
      id: ref("id"),
      title: str(),
      page: ref("page"),
      cite: ref("cite"),
      table: logic,
      roll: text,
      value: logic,
      reads: list(ref("id")),
      skipIf: logic,
      repeat: logic,
      optional: bool,
      modifier: logic,
      derive: { type: "object", additionalProperties: logic },
      display: logic,
    },
    ["id"],
  ),
  producedEntity: object<PackProducedEntity>()(
    {
      tempId: text,
      type: ref("id"),
      subtype: ref("id"),
      preset: logic,
      name: logic,
      summary: logic,
      tags: list(str()),
      fields: { type: "object", additionalProperties: logic },
      within: text,
      when: logic,
      each: logic,
      links: list(object<NonNullable<PackProducedEntity["links"]>[number]>()({ type: ref("id"), to: text, note: logic }, ["type", "to"])),
    },
    ["tempId", "type", "name"],
  ),
  producedRelationship: object<PackProducedRelationship>()({ type: ref("id"), from: text, to: text, note: logic, when: logic }, ["type", "from", "to"]),
  produce: object<PackProduce>()({ entities: list(ref("producedEntity")), relationships: list(ref("producedRelationship")) }, ["entities"]),
  procedure: object<PackProcedure>()(
    {
      id: ref("id"),
      name: text,
      description: str(),
      page: ref("page"),
      cite: ref("cite"),
      original: bool,
      mode: ref("modes"),
      inputs: schemaSlot,
      steps: list(ref("procedureStep"), { minItems: 1 }),
      produce: ref("produce"),
      chains: list(object<NonNullable<PackProcedure["chains"]>[number]>()({ procedure: ref("id"), label: text, inputs: { type: "object", additionalProperties: logic } }, ["procedure", "label"])),
    },
    ["id", "name", "steps", "produce"],
  ),
};

const collections: { [K in keyof Required<PackCollections>]: JsonSchema } = {
  entityTypes: list(ref("entityType")),
  relationshipTypes: list(ref("relationshipType")),
  referenceLists: list(ref("referenceList")),
  presets: list(ref("preset")),
  tables: list(ref("table")),
  procedures: list(ref("procedure")),
  templates: list(ref("template")),
  rules: list(ref("ruleCard")),
  trackers: list(ref("tracker")),
  playGuides: list(ref("playGuide")),
};

export const SCHEMA_BASE_URL = "https://campaign-forge.dev/schema";

/** JSON Schema of a whole pack (or the main file of a split pack). */
export const MODULE_PACK_SCHEMA: JsonSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: `${SCHEMA_BASE_URL}/module-pack.schema.json`,
  title: "Campaign Forge module data pack",
  description: "A game module written as data: no code, every expression JSONLogic. See docs/modules/pack-format.md.",
  ...object<ModulePack>()(
    {
      $schema: str(),
      format: { const: PACK_FORMAT },
      formatVersion: { const: PACK_FORMAT_VERSION },
      manifest: ref("manifest"),
      dice: ref("dice"),
      calendar: ref("calendar"),
      styleNotes: list(str()),
      parts: list(str({ pattern: "^[A-Za-z0-9][A-Za-z0-9_.-]*\\.json$" }), { uniqueItems: true }),
      ...collections,
    },
    ["format", "formatVersion", "manifest", "dice"],
  ),
  definitions,
};

/** A part file name: no folders, ends in .json. */
const PART_NAME_PATTERN = "^[A-Za-z0-9][A-Za-z0-9_.-]*\\.json$";

/** JSON Schema of one part file of a split pack. */
export const MODULE_PACK_PART_SCHEMA: JsonSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: `${SCHEMA_BASE_URL}/module-pack-part.schema.json`,
  title: "Campaign Forge module data pack part",
  description: "More collections for a split pack; the pack's `parts` lists it by `name`.",
  ...object<ModulePackPart>()(
    {
      $schema: str(),
      format: { const: PACK_PART_FORMAT },
      formatVersion: { const: PACK_FORMAT_VERSION },
      pack: str({ pattern: PACK_ID_PATTERN }),
      name: str({ pattern: "^[A-Za-z0-9][A-Za-z0-9_.-]*\\.json$" }),
      ...collections,
    },
    ["format", "formatVersion", "pack", "name"],
  ),
  definitions,
};

/** JSON Schema of a supplement: additive data for an existing module. */
export const MODULE_SUPPLEMENT_SCHEMA: JsonSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: `${SCHEMA_BASE_URL}/module-supplement.schema.json`,
  title: "Campaign Forge module supplement",
  description: "Additive data for an existing module: reference items for its lists, new lists, presets, tables, generators, templates, rule cards, play guides. See docs/modules/supplements.md.",
  ...object<ModuleSupplement>()(
    {
      $schema: str(),
      format: { const: SUPPLEMENT_FORMAT },
      formatVersion: { const: SUPPLEMENT_FORMAT_VERSION },
      manifest: ref("supplementManifest"),
      referenceItems: { type: "object", additionalProperties: list(ref("referenceItem")), description: "Items to add to the base module's reference lists, keyed by list id." },
      referenceLists: collections.referenceLists,
      presets: collections.presets,
      tables: collections.tables,
      procedures: collections.procedures,
      templates: collections.templates,
      rules: collections.rules,
      playGuides: collections.playGuides,
      parts: list(str({ pattern: PART_NAME_PATTERN }), { uniqueItems: true, description: "Part files that complete a split supplement, relative to this file." }),
    },
    ["format", "formatVersion", "manifest"],
  ),
  definitions,
};

/** JSON Schema of one part file of a split supplement. */
export const MODULE_SUPPLEMENT_PART_SCHEMA: JsonSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: `${SCHEMA_BASE_URL}/module-supplement-part.schema.json`,
  title: "Campaign Forge module supplement part",
  description: "More additive data for a split supplement; the supplement's `parts` lists it by `name`. See docs/modules/supplements.md.",
  ...object<ModuleSupplementPart>()(
    {
      $schema: str(),
      format: { const: SUPPLEMENT_PART_FORMAT },
      formatVersion: { const: SUPPLEMENT_FORMAT_VERSION },
      supplement: str({ pattern: PACK_ID_PATTERN }),
      name: str({ pattern: PART_NAME_PATTERN }),
      referenceItems: { type: "object", additionalProperties: list(ref("referenceItem")), description: "Items to add to the base module's reference lists, keyed by list id." },
      referenceLists: collections.referenceLists,
      presets: collections.presets,
      tables: collections.tables,
      procedures: collections.procedures,
      templates: collections.templates,
      rules: collections.rules,
      playGuides: collections.playGuides,
    },
    ["format", "formatVersion", "supplement", "name"],
  ),
  definitions,
};
