/**
 * The declarative data pack: a GameModule written as JSON, with no code. The
 * SDK validates it (`validatePack`) and turns it into a GameModule
 * (`packToModule`). Every expression is JSONLogic; the dice are one of the
 * built-in engines. Most parts are the contract's own data shapes; only the
 * procedures differ, because the contract's procedures are functions.
 *
 * Not in the pack format (they need code; write a TypeScript module):
 * combat (the armor rule; declarative d20 combat is in: `d20Combat`), crewShip, travel, ledger, progression,
 * adventureBuilders, narrativeFields, hooks, migrations and dice operations. Map generators are in when
 * they use a built-in engine (`mapGenerators`, see ../mapgen).
 */
import type { DiceEngineConfig } from "../engines/types";
import type { PackMapGenerator } from "../mapgen/types";
import type {
  CalendarDef,
  D20CombatDef,
  EntityPreset,
  EntityTypeDef,
  CharacterBuilderDef,
  GmScreenDef,
  JsonLogicRule,
  JsonSchema,
  ModuleLicense,
  ModuleManifest,
  PageRef,
  PlayGuideDef,
  PlayModeId,
  PrimerDef,
  ReferenceItem,
  ReferenceList,
  RelationshipTypeDef,
  RollTable,
  RuleCard,
  Template,
  TrackerDef,
} from "../types";

export const PACK_FORMAT = "campaign-forge-pack" as const;
export const PACK_PART_FORMAT = "campaign-forge-pack-part" as const;
export const PACK_FORMAT_VERSION = 1 as const;

/** The manifest of a pack: the contract's manifest with the licence required (and no applied supplements: the loader sets those). */
export interface PackManifest extends Omit<ModuleManifest, "license" | "supplements"> {
  license: ModuleLicense;
}

/**
 * A procedure step. Exactly one of `table`, `roll` or `value` says what the
 * step does. JSONLogic here reads the procedure context:
 * `{ inputs, results, ...inputs, ...results }` (plus `result` in `derive`,
 * `roll` in `value`).
 */
export interface PackProcedureStep {
  id: string;
  title?: string;
  page?: PageRef;
  cite?: string;
  /** Roll on a table: its id, or JSONLogic yielding one (e.g. `{ "cat": ["mypack.loot.", { "var": "inputs.tier" }] }`). */
  table?: string | JsonLogicRule;
  /** Roll a dice expression (e.g. "1d6+2"); the result is the total. */
  roll?: string;
  /** Compute a value with JSONLogic. With `roll`, `{ "var": "roll" }` is the rolled total. */
  value?: JsonLogicRule;
  /** Step ids this step reads (for the step graph and re-roll invalidation). */
  reads?: string[];
  /** JSONLogic: skip the step when true. */
  skipIf?: JsonLogicRule;
  /** Roll this many times: a number, a dice expression, or JSONLogic. The result is a list. */
  repeat?: number | string | JsonLogicRule;
  /** The GM may choose not to roll it. */
  optional?: boolean;
  /** JSONLogic: a flat modifier added to the table roll. */
  modifier?: JsonLogicRule;
  /** Keys merged into an object result after rolling: name -> JSONLogic over the context plus `result`. */
  derive?: Record<string, JsonLogicRule>;
  /**
   * JSONLogic yielding the line the GM sees for this step instead of the
   * result object (e.g. `{ "cat": [{ "var": "result.n" }, " × ", { "var": "result.name" }] }`).
   * Reads the context plus `result` (the step's result) and `label` (the
   * table row label it rolled; a list of them when the step repeats).
   * Empty falls back to the app's generic rendering.
   */
  display?: JsonLogicRule;
}

/** One entity a procedure produces. String or JSONLogic values read the procedure context. */
export interface PackProducedEntity {
  /** Unique within the run. With `each`, "-<index>" is appended. */
  tempId: string;
  type: string;
  subtype?: string;
  /**
   * Start from a preset: its id, or JSONLogic yielding one. The preset's
   * fields come first and `fields` override them; its name, summary and tags
   * are used when the entity's own evaluate to nothing. The preset must be of
   * the entity's `type`.
   */
  preset?: JsonLogicRule;
  name: JsonLogicRule;
  summary?: JsonLogicRule;
  tags?: string[];
  /** Dotted field path -> JSONLogic value (a literal number, string, boolean or list works as itself). */
  fields?: Record<string, JsonLogicRule>;
  /** tempId of a parent entity (may use "{index}"). */
  within?: string;
  /** JSONLogic: produce only when true. */
  when?: JsonLogicRule;
  /** JSONLogic yielding a list: produce one entity per item, with `item` and `index` in the context. */
  each?: JsonLogicRule;
  /** Relationships from this entity, emitted with it. `to` is a tempId (may use "{index}"). */
  links?: Array<{ type: string; to: string; note?: JsonLogicRule }>;
}

export interface PackProducedRelationship {
  type: string;
  from: string;
  to: string;
  note?: JsonLogicRule;
  when?: JsonLogicRule;
}

export interface PackProduce {
  entities: PackProducedEntity[];
  relationships?: PackProducedRelationship[];
}

export interface PackProcedure {
  id: string;
  name: string;
  description?: string;
  page?: PageRef;
  cite?: string;
  original?: boolean;
  mode?: PlayModeId[];
  /** JSON Schema of the inputs. */
  inputs?: JsonSchema;
  steps: PackProcedureStep[];
  produce: PackProduce;
  /** Procedures to offer after acceptance; `inputs` maps input names to JSONLogic over the context. */
  chains?: Array<{ procedure: string; label: string; inputs?: Record<string, JsonLogicRule> }>;
}

/** The collections a pack (or a part of one) can carry. */
export interface PackCollections {
  entityTypes?: EntityTypeDef[];
  relationshipTypes?: RelationshipTypeDef[];
  referenceLists?: ReferenceList[];
  presets?: EntityPreset[];
  tables?: RollTable[];
  procedures?: PackProcedure[];
  templates?: Template[];
  rules?: RuleCard[];
  trackers?: TrackerDef[];
  playGuides?: PlayGuideDef[];
}

export const PACK_COLLECTIONS = ["entityTypes", "relationshipTypes", "referenceLists", "presets", "tables", "procedures", "templates", "rules", "trackers", "playGuides"] as const satisfies ReadonlyArray<keyof PackCollections>;
export type PackCollectionName = (typeof PACK_COLLECTIONS)[number];

/** A whole pack (or its main file, when it is split into parts). */
export interface ModulePack extends PackCollections {
  $schema?: string;
  format: typeof PACK_FORMAT;
  formatVersion: typeof PACK_FORMAT_VERSION;
  manifest: PackManifest;
  dice: DiceEngineConfig;
  /** In-world calendar (default: twelve 30-day months). */
  calendar?: CalendarDef;
  styleNotes?: string[];
  /** Prompts and starter text for the campaign primer (session 0). */
  primer?: PrimerDef;
  /** Declarative d20 combat: attacks, defences, conditions with helper text and effects (main file only). */
  d20Combat?: D20CombatDef;
  /** A printable GM screen built from the pack's own content (main file only). */
  gmScreen?: GmScreenDef;
  /** Step-by-step character builders (main file only). */
  characterBuilders?: CharacterBuilderDef[];
  /** Map generators run by a built-in engine (main file only), e.g. `{ "engine": "dungeon", ... }`. */
  mapGenerators?: PackMapGenerator[];
  /**
   * Names of the part files that complete this pack (e.g. ["tables.json"]),
   * relative to this file. Every part must be present when the pack loads.
   */
  parts?: string[];
}

/** One extra file of a split pack: more of the same collections. */
export interface ModulePackPart extends PackCollections {
  $schema?: string;
  format: typeof PACK_PART_FORMAT;
  formatVersion: typeof PACK_FORMAT_VERSION;
  /** The manifest id of the pack this part belongs to. */
  pack: string;
  /** This part's name, as the pack's `parts` lists it. */
  name: string;
}

// ---------------------------------------------------------------------------
// Supplements: additive data for an existing module
// ---------------------------------------------------------------------------

export const SUPPLEMENT_FORMAT = "campaign-forge-supplement" as const;
export const SUPPLEMENT_PART_FORMAT = "campaign-forge-supplement-part" as const;
export const SUPPLEMENT_FORMAT_VERSION = 1 as const;

/** The manifest of a supplement: what it extends, and its own notice. */
export interface SupplementManifest {
  /** Lower case letters, digits and hyphens; every id the supplement adds starts with it and a dot. */
  id: string;
  name: string;
  /** Semver. Generator runs record it next to the module version. */
  version: string;
  /** The module it adds to, and optionally the module versions it fits (a semver range such as "^0.1.0"). */
  extends: { module: string; version?: string };
  /** Short notice shown with the supplement (free text, e.g. "Private, for personal use only"). */
  licenseNotice: string;
  /** A licence and the attribution it requires, when the content has one. */
  license?: ModuleLicense;
  authors?: string[];
  /** One or two sentences: what the supplement adds. */
  description?: string;
  /** Whether the data was checked against its source (default "unverified"). */
  dataStatus?: ModuleManifest["dataStatus"];
}

/** The collections a supplement can add whole (new ids only, namespaced by the supplement id). */
export interface SupplementCollections {
  referenceLists?: ReferenceList[];
  presets?: EntityPreset[];
  tables?: RollTable[];
  procedures?: PackProcedure[];
  templates?: Template[];
  rules?: RuleCard[];
  playGuides?: PlayGuideDef[];
}

export const SUPPLEMENT_COLLECTIONS = ["referenceLists", "presets", "tables", "procedures", "templates", "rules", "playGuides"] as const satisfies ReadonlyArray<keyof SupplementCollections>;

/**
 * A supplement: additive data for one existing module (a built-in module, a
 * TypeScript module or a data pack). It never overrides or removes the base
 * module's content and carries no code; every expression is JSONLogic.
 */
export interface ModuleSupplement extends SupplementCollections {
  $schema?: string;
  format: typeof SUPPLEMENT_FORMAT;
  formatVersion: typeof SUPPLEMENT_FORMAT_VERSION;
  manifest: SupplementManifest;
  /** Items added to the base module's own reference lists, by list id (e.g. "dnd5e-srd.backgrounds"). */
  referenceItems?: Record<string, ReferenceItem[]>;
  /**
   * Names of the part files that complete this supplement (e.g. ["spells.json"]),
   * relative to this file, for a supplement too large for one file. Every part
   * must be present; `mergeSupplementParts` joins them into one supplement
   * (without `parts`) before it is validated and applied.
   */
  parts?: string[];
}

/** One extra file of a split supplement: more of the same collections. */
export interface ModuleSupplementPart extends SupplementCollections {
  $schema?: string;
  format: typeof SUPPLEMENT_PART_FORMAT;
  formatVersion: typeof SUPPLEMENT_FORMAT_VERSION;
  /** The manifest id of the supplement this part belongs to. */
  supplement: string;
  /** This part's name, as the supplement's `parts` lists it. */
  name: string;
  referenceItems?: Record<string, ReferenceItem[]>;
}
