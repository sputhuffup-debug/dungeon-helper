/**
 * Campaign Forge core domain model (game-agnostic).
 *
 * A campaign is one CRDT document (Yjs) holding typed maps of records, plus
 * one sub-document per rich-text body. Rich text is the only thing that needs
 * a CRDT; every other record is a field map with last-writer-wins semantics.
 *
 * Nothing in this file names a rule from any game.
 */
import type { Effect, PageRef, RollRecord, VisibilityLevel } from "@campaign-forge/module-sdk";

export type Id = string; // ULID

export interface Visibility {
  level: VisibilityLevel;
  /** Member ids, for `some_players`. */
  players?: Id[];
  /** Session id in which a `revealed` record became public. */
  revealedIn?: Id;
}

export interface BaseRecord {
  id: Id;
  created: string; // ISO timestamp
  updated: string;
}

// ---------------------------------------------------------------------------
// meta
// ---------------------------------------------------------------------------

export interface CampaignMeta extends BaseRecord {
  name: string;
  moduleId: string;
  moduleVersion: string;
  mode: string;
  calendarId: string;
  /** Current in-world date in the module calendar's format. */
  currentDate?: string;
  /** Module-defined campaign-level settings, e.g. frame, home base (written by checklists). */
  settings: Record<string, unknown>;
  /** Members: GM plus players. v1 is GM-only but the shape is kept. */
  members: Array<{ id: Id; name: string; role: "gm" | "player"; characterId?: Id }>;
}

// ---------------------------------------------------------------------------
// entities and relationships
// ---------------------------------------------------------------------------

export interface Provenance {
  generatorRun?: Id;
  preset?: string;
  /** Fields the GM edited after generation, as dotted paths. */
  editedFields?: string[];
  /** Presets the entity has taken over time (oldest first), e.g. a creature maturing through stages. */
  presetHistory?: Array<{ preset: string; at: string }>;
}

export interface Entity extends BaseRecord {
  /** Module entity type id, e.g. "alien.character". */
  type: string;
  /** Optional subtype id declared by the entity type. */
  subtype?: string;
  name: string;
  summary?: string;
  tags: string[];
  visibility: Visibility;
  /** Module-schema fields. Validated against the entity type's JSON Schema. */
  fields: Record<string, unknown>;
  /** Field path -> visibility override. */
  fieldVisibility?: Record<string, Visibility>;
  /** UI-only state the sheet keeps (collapsed sections, chosen tab). */
  sheetState?: Record<string, unknown>;
  provenance?: Provenance;
  /** Cover or portrait asset id. */
  image?: Id;
  /** For PCs: the member id that owns the sheet. */
  ownerMemberId?: Id;
  /** Conditions currently on the entity (stress responses, injuries...). Module-defined ids. */
  conditions?: Array<{ id: string; label: string; source?: string; page?: PageRef; since?: string }>;
}

export interface Relationship extends BaseRecord {
  type: string;
  from: Id;
  to: Id;
  note?: string;
  visibility: Visibility;
}

// ---------------------------------------------------------------------------
// narrative structure
// ---------------------------------------------------------------------------

export type AdventureStatus = "planned" | "active" | "done";
export type SceneStatus = "planned" | "run" | "skipped";

export interface Adventure extends BaseRecord {
  title: string;
  premise?: string;
  status: AdventureStatus;
  /** Rich-text body doc ids for the template-defined sections. */
  playerIntroDoc?: Id;
  gmSituationDoc?: Id;
  epilogueDoc?: Id;
  hooksIn: string[];
  hooksOut: string[];
  acts: Id[]; // ordered
  templateId?: string;
  tags: string[];
  /** Module-defined fields (see the module's `narrativeFields` for kind "adventure"). */
  fields?: Record<string, unknown>;
  /** Entities the adventure uses, by the builder's cast role id (e.g. pcs, npcs, locations). */
  cast?: Record<string, Id[]>;
  /** The adventure builder this adventure was made with, if any. */
  builderId?: string;
}

export interface Act extends BaseRecord {
  adventure: Id;
  number: number;
  title?: string;
  goal?: string;
  pacingDoc?: Id;
  handouts: Id[];
  scenes: Id[]; // ordered
  /** Module-defined fields (kind "act"). */
  fields?: Record<string, unknown>;
}

export interface Scene extends BaseRecord {
  act?: Id;
  title: string;
  purpose?: string;
  location?: Id;
  participants: Id[];
  /** Rich-text body: read-aloud text, triggers, GM notes with inline refs. */
  bodyDoc: Id;
  readAloudDoc?: Id;
  clues: Id[];
  encounter?: Id;
  /** Map asset and zone overlay for this scene. */
  map?: Id;
  status: SceneStatus;
  /** Event list for the act's "mandatory / optional" flags. */
  events: Array<{ id: Id; text: string; mandatory: boolean; done?: boolean }>;
  tags: string[];
  /** Module-defined fields (kind "scene"). */
  fields?: Record<string, unknown>;
}

export interface Session extends BaseRecord {
  number: number;
  date: string; // ISO date
  title?: string;
  attendees: Id[]; // member ids
  scenesRun: Id[];
  logDoc: Id;
  summary?: string;
  rewards: Array<{ characterId: Id; kind: string; value: unknown; note?: string }>;
  /** Loose ends carried into the next session's plan. */
  nextPlan: string[];
  status: "planned" | "running" | "done";
  /** Reveals performed during this session. */
  reveals: Array<{ at: string; handout?: Id; entity?: Id; field?: string; scene?: Id }>;
  /** Answers to module end-of-session prompts. */
  wrapUp?: Record<string, unknown>;
  /** Session checklist ticks: item id -> done. `false` is an explicit untick (see checklist.ts). */
  checklist?: Record<string, boolean>;
}

export interface TimelineEvent extends BaseRecord {
  inWorldDate: string;
  text: string;
  entities: Id[];
  session?: Id;
  visibility: Visibility;
}

export type HandoutKind = "text" | "image" | "card" | "agenda";

export interface Handout extends BaseRecord {
  kind: HandoutKind;
  title: string;
  bodyDoc?: Id;
  asset?: Id;
  visibility: Visibility;
  revealedIn?: Id;
  /** The act or scene it belongs to. */
  attachedTo?: { kind: "act" | "scene" | "adventure"; id: Id };
  /** For agendas: the PC it is for. */
  character?: Id;
}

export interface Note extends BaseRecord {
  title: string;
  bodyDoc: Id;
  attachedTo?: { kind: "entity" | "scene" | "act" | "adventure" | "session" | "campaign"; id: Id };
  tags: string[];
}

// ---------------------------------------------------------------------------
// maps
// ---------------------------------------------------------------------------

export type ZoneBorder = "open" | "blocked" | "door";

export interface MapZone {
  id: Id;
  name: string;
  /** Rectangle in image pixel coordinates. */
  rect: { x: number; y: number; w: number; h: number };
  cluttered: boolean;
  /** Free notes, e.g. "cover", "darkness". */
  notes?: string;
}

export interface MapZoneBorder {
  from: Id;
  to: Id;
  kind: ZoneBorder;
}

export interface SiteMap extends BaseRecord {
  name: string;
  /** Image asset id. Optional: a map may be zones only. */
  asset?: Id;
  width?: number;
  height?: number;
  zones: MapZone[];
  borders: MapZoneBorder[];
  /** Access points such as crawlspaces or vents between zones. */
  accessPoints: Array<{ id: Id; name: string; zones: Id[]; hidden?: boolean }>;
  location?: Id;
  visibility: Visibility;
}

// ---------------------------------------------------------------------------
// provenance, trackers, assets
// ---------------------------------------------------------------------------

export interface GeneratorRun extends BaseRecord {
  procedure: string;
  moduleId: string;
  moduleVersion: string;
  seed: string;
  inputs: Record<string, unknown>;
  stepSeeds?: Record<string, string>;
  pinned?: Record<string, unknown>;
  rolls: RollRecord[];
  results: Record<string, unknown>;
  /** Entity ids created on accept. */
  produced: Id[];
  editedFields: Array<{ entity: Id; path: string }>;
}

export interface TrackerState extends BaseRecord {
  session: Id;
  /** Tracker id -> arbitrary state (clock, initiative order, countdown, logs). */
  state: Record<string, unknown>;
  /** Append-only log of tracker events during the session. */
  log: Array<{ at: string; tracker: string; text: string; entity?: Id; data?: unknown }>;
  archived?: boolean;
}

export interface Asset extends BaseRecord {
  kind: "image" | "pdf" | "other";
  name: string;
  mime: string;
  size: number;
  /** Stored in IndexedDB as a Blob keyed by asset id; the record holds metadata only. */
  width?: number;
  height?: number;
  visibility: Visibility;
}

// ---------------------------------------------------------------------------
// the document
// ---------------------------------------------------------------------------

export interface CampaignMaps {
  meta: CampaignMeta;
  entities: Record<Id, Entity>;
  relationships: Record<Id, Relationship>;
  adventures: Record<Id, Adventure>;
  acts: Record<Id, Act>;
  scenes: Record<Id, Scene>;
  sessions: Record<Id, Session>;
  timeline: Record<Id, TimelineEvent>;
  handouts: Record<Id, Handout>;
  notes: Record<Id, Note>;
  maps: Record<Id, SiteMap>;
  generatorRuns: Record<Id, GeneratorRun>;
  trackerState: Record<Id, TrackerState>;
  assets: Record<Id, Asset>;
}

export type MapName = Exclude<keyof CampaignMaps, "meta">;
export type RecordOf<M extends MapName> = CampaignMaps[M][string];

export const MAP_NAMES: MapName[] = [
  "entities",
  "relationships",
  "adventures",
  "acts",
  "scenes",
  "sessions",
  "timeline",
  "handouts",
  "notes",
  "maps",
  "generatorRuns",
  "trackerState",
  "assets",
];

/** Export bundle manifest (README.md lists this too). */
export interface BundleManifest {
  format: "campaign-forge-bundle";
  formatVersion: 1;
  exportedAt: string;
  moduleId: string;
  moduleVersion: string;
  campaignId: Id;
  campaignName: string;
}

/** Applied effects are recorded in the session log for auditability. */
export interface AppliedEffect {
  at: string;
  effect: Effect;
  session?: Id;
}
