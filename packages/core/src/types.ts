/**
 * Campaign Forge core domain model (game-agnostic).
 *
 * A campaign is one CRDT document (Yjs) holding typed maps of records, plus
 * one sub-document per rich-text body. Rich text is the only thing that needs
 * a CRDT; every other record is a field map with last-writer-wins semantics.
 *
 * Nothing in this file names a rule from any game.
 */
import type { AppliedDuration, ArcClueState, CiteRef, ContactStance, Effect, LedgerLinks, PageRef, ProgressionPoolId, RecapLinkRef, RollRecord, SiteLayout, VisibilityLevel } from "@campaign-forge/module-sdk";

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
  /**
   * Members: the GM plus the players. v1 has no player accounts: players are
   * names the GM keeps so material can be shared with one of them (player
   * packets, `some_players`). Which PCs a player plays is kept on the
   * characters (`Entity.ownerMemberId`), see members.ts.
   */
  members: CampaignMember[];
  /** The campaign primer: the players' session 0 introduction (see primer.ts). */
  primer?: CampaignPrimer;
}

export interface CampaignMember {
  id: Id;
  name: string;
  role: "gm" | "player";
  /**
   * Earlier shape: the one PC this member plays. Still read (as owning that
   * character when the character names no owner of its own); new data keeps
   * ownership on the character.
   */
  characterId?: Id;
  /** The GM's note on how to reach the player (a chat handle, an email). GM-only. */
  contact?: string;
}

/** The campaign primer's sections, in order; each section's text is a rich-text body. */
export interface CampaignPrimer {
  sections: Array<{ id: string; title: string; doc: Id }>;
  /** When "Draft from campaign" last wrote it. */
  drafted?: string;
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
  conditions?: EntityCondition[];
  /**
   * The NPC is one of the crew's contacts (see arcs.ts). The players' view
   * keeps only where to find them and the favours (`playerContact`); the
   * stance, grudges, what they know and the GM's note stay with the GM.
   */
  contact?: EntityContact;
}

/** A crew contact, kept on the NPC. */
export interface EntityContact {
  /** When they became a contact (ISO). */
  since: string;
  stance: ContactStance;
  /** Favours they owe the crew, and the crew owes them. */
  favours: { owedToCrew: number; owedByCrew: number };
  /** What they hold against the crew (GM). */
  grudges: string[];
  /** Clues they know: a way for the crew to learn them (GM). */
  knows: Array<{ thread: Id; clue: Id }>;
  /** Where they can be found, as the players know it. */
  foundAt?: string;
  /** The place they can be found at (shown to the players only when they may see it). */
  place?: Id;
  /** The last job and session the crew met them in. */
  lastSeen?: { job?: Id; session?: Id; at?: string };
  /** Turned on the crew on a job and lived (GM). */
  betrayer?: boolean;
  /** The GM's note. */
  note?: string;
}

/**
 * A condition on an entity. `value`, `duration`, `sourceId` and `note` are
 * used by modules with declarative d20 combat (frightened 2 until the end of
 * the goblin's next turn); other modules set only id, label and source.
 */
export interface EntityCondition {
  id: string;
  label: string;
  source?: string;
  page?: PageRef;
  since?: string;
  value?: number;
  /** The entity that applied it. */
  sourceId?: Id;
  duration?: AppliedDuration;
  note?: string;
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
  /** What the GM shared with the players from this session ("Share with players"), oldest first. GM-only. */
  shares?: ShareRecord[];
  /**
   * The "Previously on…" recap read at the start of this session (see
   * recap.ts): the GM's version and the players' read-aloud, as generated
   * from the campaign plus the GM's switches, edits and own lines. The
   * session record stays GM-only; players reach the read-aloud only through
   * `playerRecap`, and only once the GM shows or shares it.
   */
  recap?: SessionRecap;
}

/** What a recap covers: the last session, the last n sessions, or the story so far. */
export type RecapSpan = { kind: "last" } | { kind: "last-n"; n: number } | { kind: "all" };

/** A link in a recap line. */
export interface RecapLink {
  kind: RecapLinkRef["kind"];
  id: Id;
  /** The text in the line the link sits on. */
  label: string;
}

/** One line of a stored recap. */
export interface RecapLine {
  /** With `ref`, identifies the line in its section (regenerating keeps the GM's choices by it). */
  key: string;
  ref?: Id;
  text: string;
  links?: RecapLink[];
  /** The GM switched the line off: it is kept but not read or shown. */
  off?: boolean;
  /** The GM rewrote the text: regenerating keeps the GM's words. */
  edited?: boolean;
  /** A line the GM added. */
  custom?: boolean;
}

export interface RecapSection {
  id: string;
  title: string;
  /** "core", or the module contributor's id. */
  source: string;
  order: number;
  lines: RecapLine[];
}

export interface SessionRecap {
  span: RecapSpan;
  /** The sessions it covers, oldest first. */
  sessions: Id[];
  /** When it was (re)generated. */
  generated: string;
  /** The GM's recap: everything, with what the players don't know. */
  gm: RecapSection[];
  /** The read-aloud for the players, built from the player projection only. */
  players: RecapSection[];
  /** Faction heat when it was generated, so the next session's recap can say what changed. */
  baseline?: { heat?: Record<Id, number> };
  /** When the GM put the read-aloud on the player screen; absent while it is not shown. */
  shown?: string;
}

/**
 * One "Share with players" export: what went out, so the next share can send
 * only what is new. Ids only; the content is rebuilt from the campaign.
 */
export interface ShareRecord {
  at: string;
  /** Handout ids included. */
  handouts: Id[];
  /** Map id -> the zones the players could see on it when it was shared. */
  maps: Record<Id, Id[]>;
  /** The scene whose briefing was included. */
  scene?: Id;
  /** The party card was included. */
  party?: boolean;
  /** The campaign primer was included. */
  primer?: boolean;
  /** The crew notes were included. */
  crewNotes?: boolean;
  format?: ShareFormat;
  /**
   * A player packet for this member (only their copy). Absent: a group share
   * for every player. The group share's "only what's new" reads group shares
   * only; each player's packet reads that player's packets.
   */
  member?: Id;
}

/** How a share went out: phone images, a PDF, or one self-contained web page. */
export type ShareFormat = "images" | "pdf" | "page";

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
  /** The act, scene, adventure or campaign entity (e.g. a job, for its posting) it belongs to. */
  attachedTo?: { kind: "act" | "scene" | "adventure" | "entity"; id: Id };
  /** For agendas: the PC it is for. */
  character?: Id;
  /**
   * Given to the player of `character` ("Give to its player"): that player
   * sees it in their packet whatever `visibility` says to everyone else.
   */
  toOwner?: boolean;
  /**
   * What a tool keeps the handout for (e.g. "long-agenda" or
   * "long-agenda-friction" for a character's long-term agenda and its open
   * friction), so the tool updates it in place rather than adding another.
   */
  purpose?: string;
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
  /** Structured deck-plan layout, set when the map was generated (zones above stay for image maps). */
  layout?: SiteLayout;
  /** How the layout was generated, so it can be re-run or re-rolled stage by stage. */
  generator?: { id: string; seed: string; inputs: Record<string, unknown>; stageSeeds?: Record<string, string>; attempts?: number };
  /** The adventure the map belongs to, if any. */
  adventure?: Id;
  /** Live table state: current act, fog, border overrides, sealed points, burning zones, tokens and pings. */
  live?: SiteMapLiveState;
}

export interface SiteMapLiveState {
  act: number;
  /** Zones the players have seen (player-view fog). */
  revealed: Id[];
  /**
   * Border id -> overriding state for this act. `known` means the players have
   * found it: a hidden border (secret access point) or a lock shows on player outputs.
   */
  borders: Record<Id, { locked?: boolean; open?: boolean; sealed?: boolean; destroyed?: boolean; known?: boolean }>;
  /** Module-defined zone flags set during play (e.g. burning, vacuum). */
  zoneFlags: Record<Id, Record<string, unknown>>;
  /** Tokens placed on zones (creatures, NPCs, PCs). */
  tokens: Array<{ id: Id; label: string; zone: Id; gmOnly: boolean; entity?: Id }>;
  /** Motion tracker pings, cleared each stretch. */
  pings: Array<{ zone: Id; at: string }>;
  /**
   * The live hunt (the generator's `hunt`): hidden threat tokens, their
   * trails and the PCs' sensor sweeps. GM-only; the player projection keeps
   * only blips (letter, range band, direction) and tokens revealed as seen.
   * Absent until the GM places a hidden threat.
   */
  hunt?: HuntState;
}

/** hidden: on the GM's map only; detected: a blip on a tracker this step; seen: revealed on the player map; gone: out of play. */
export type HuntTokenState = "hidden" | "detected" | "seen" | "gone";

export interface HuntToken {
  id: Id;
  label: string;
  zone: Id;
  /** The module's mover kind (`hunt.movers[].id`). */
  mover: string;
  state: HuntTokenState;
  /** Where it was placed: guard postures stay near it. */
  home: Id;
  /** Recent zones, oldest first (GM-only, drawn faintly). */
  trail: Id[];
  /** The hunt step of its last move: movement-only sensors read it. */
  movedAt?: number;
  /** Marked hurt by the GM: its mover's `hurt` weights apply. */
  hurt?: boolean;
  /** Blip letter, while it has one. */
  letter?: string;
  /** The map marker or campaign entity it was made from. */
  marker?: string;
  entity?: Id;
  /** What its mover rules read (speed, count, posture, state). */
  data?: Record<string, unknown>;
  /** Patrol waypoints in order, and the index of the next one. */
  route?: Id[];
  routeAt?: number;
}

export interface HuntBlip {
  letter: string;
  /** GM-only: the token behind the blip and its zone distance. */
  token: Id;
  distance: number;
  band: string;
  bandLabel: string;
  /** Compass bearing from the sweeper ("N", "NE" ... "NW"), or "here". */
  direction: string;
  /** When the blip is on another level. */
  vertical?: "above" | "below";
}

export interface HuntSweep {
  id: Id;
  step: number;
  at: string;
  by: { name: string; entity?: Id };
  /** GM-only: the zone swept from. */
  zone: Id;
  sensor: string;
  sensorLabel: string;
  blips: HuntBlip[];
}

export interface HuntState {
  /** Steps (stretches or rounds) since the hunt began. */
  step: number;
  /** The step id the last advance used (`hunt.steps[].id`). */
  stepKind?: string;
  tokens: HuntToken[];
  /** Recent sweeps, oldest first. */
  sweeps: HuntSweep[];
}

// ---------------------------------------------------------------------------
// provenance, trackers, assets
// ---------------------------------------------------------------------------

export interface GeneratorRun extends BaseRecord {
  procedure: string;
  moduleId: string;
  moduleVersion: string;
  /** Supplements merged into the module when it ran (they change what it can roll), when there were any. */
  supplements?: Array<{ id: string; version: string }>;
  seed: string;
  inputs: Record<string, unknown>;
  stepSeeds?: Record<string, string>;
  /**
   * Step id -> faces of dice rolled at the table for that step (in roll order).
   * Re-running with them as `stepDice` gives the same results.
   */
  stepDice?: Record<string, number[]>;
  pinned?: Record<string, unknown>;
  /** Re-rolled parts of steps ("<step id>/<key>" -> seed) and pinned part values; see the sdk's `ProcedureContext.part`. */
  partSeeds?: Record<string, string>;
  pinnedParts?: Record<string, unknown>;
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
// money and travel
// ---------------------------------------------------------------------------

/**
 * One line of the campaign ledger. Balances are never stored: they are summed
 * from entries (see ledger.ts). `account` is absent for the shared account
 * (party or ship funds) and an entity id for a personal one.
 */
export interface LedgerEntry extends BaseRecord {
  /** Signed amount in the module currency: positive money in, negative money out. */
  amount: number;
  /** Module ledger category id (unknown ids show as they are). */
  category: string;
  note?: string;
  /** In-world date, in the module calendar's format. */
  inWorldDate?: string;
  /** Real-world date (ISO yyyy-mm-dd) the entry belongs to; `created` keeps the exact time. */
  realDate: string;
  account?: Id;
  links?: LedgerLinks;
  /** Idempotency key: at most one entry per key (e.g. one payment per job). */
  key?: string;
  /** What posted it: the GM, a procedure run, travel, a payout button, an effect. */
  source?: { kind: "manual" | "procedure" | "travel" | "payout" | "effect" | "import"; id?: Id; step?: string };
  visibility: Visibility;
}

export type TravelStatus = "planned" | "arrived" | "cancelled";

/**
 * One leg of travel from A to B, usually on the group's vehicle. Departing
 * moves the campaign's in-world date to `arriveDate`. Names are kept beside
 * the ids so the log still reads after a place is deleted.
 */
export interface TravelLeg extends BaseRecord {
  ship?: Id;
  from?: Id;
  fromName?: string;
  to: Id;
  toName: string;
  /** Distance in the module's travel unit. */
  distance: number;
  days: number;
  departDate?: string;
  arriveDate?: string;
  status: TravelStatus;
  /** One line from the module's plan, e.g. "4 parsecs at FTL 12". */
  summary?: string;
  /** Planner options as given (who stayed awake, ...). */
  options?: Record<string, unknown>;
  /** Seed of the arrival rolls: same seed and module version, same arrival. */
  seed?: string;
  /** Faces typed for the arrival rolls when they were rolled at the table (in roll order; the seed covers anything that is not a die). */
  entered?: number[];
  rolls?: RollRecord[];
  log?: string[];
  /** Arrival effects the module suggested, and whether they were applied. */
  effects?: Effect[];
  effectsApplied?: boolean;
  session?: Id;
  note?: string;
  visibility: Visibility;
}

// ---------------------------------------------------------------------------
// advancement
// ---------------------------------------------------------------------------

/**
 * One line of a character's advancement log: an award into a pool, a spend
 * out of it, or a GM adjustment. The pool itself (XP, story points) is a
 * stored running value on the sheet, as the rules keep it; the log is its
 * history, and lifetime totals (earned, spent) are summed from it on read.
 */
export interface AdvancementEntry extends BaseRecord {
  /** The advancing entity. */
  character: Id;
  pool: ProgressionPoolId;
  kind: "award" | "spend" | "adjust";
  /** Signed change applied to the pool: positive for awards, negative for spends. */
  amount: number;
  /** Points an award could not add because the pool was at its maximum. */
  capped?: number;
  /** One line: the questions answered yes, what was bought, why a story point went. */
  reason: string;
  /** Award question ids answered yes (awards from the checklist). */
  questions?: string[];
  /** What a spend bought: the module's spend option, the skill or item, the level or copies before and after, the cost. */
  spend?: { option: string; target: string; label: string; from: number; to: number; cost: number };
  /** Story point use id, for spends at the table. */
  use?: string;
  session?: Id;
  adventure?: Id;
  /** Act number, for end-of-act awards. */
  act?: number;
  /** Idempotency key: at most one entry per key (e.g. one act award per character). */
  key?: string;
  inWorldDate?: string;
  /** Real-world date (ISO yyyy-mm-dd). */
  realDate: string;
  source?: { kind: "wrap-up" | "table" | "sheet" | "manual" | "effect" | "import"; id?: Id };
  visibility: Visibility;
}

// ---------------------------------------------------------------------------
// campaign arcs (threads, clues, clocks)
// ---------------------------------------------------------------------------

/** Records a clue is linked to: places, people, items (entities), jobs, sessions and scenes. */
export interface ArcLinks {
  entities?: Id[];
  jobs?: Id[];
  sessions?: Id[];
  scenes?: Id[];
}

/** Where a clue was placed: the job and posting that carry it and the slot it sits in. */
export interface ArcClueSeeding {
  at: string;
  job?: Id;
  /** The posting (offer key) it went out on, and the run that dealt it. */
  posting?: string;
  run?: Id;
  /** The module's slot id (e.g. "intent") and its label. */
  slot?: string;
  slotLabel?: string;
  /** The entity it rides on (an NPC with it as a secret, a contact who knows it). */
  entity?: Id;
  /** How it reads where it was placed (GM). */
  text?: string;
}

/** When and where the crew learnt a clue. */
export interface ArcClueFound {
  at: string;
  session?: Id;
  job?: Id;
  entity?: Id;
  /** Where the GM marked it: the job page, the NPC, the wrap-up, the arc board. */
  via?: "job" | "entity" | "wrap-up" | "board";
}

export interface ArcClue {
  id: Id;
  /** The module's clue kind (fact, object, person, place...). */
  kind: string;
  /** What it is (GM). */
  text: string;
  /** How the crew notes put it once found. */
  playerText: string;
  /** What learning it unlocks (GM). */
  unlocks?: string;
  state: ArcClueState;
  seeded?: ArcClueSeeding;
  found?: ArcClueFound;
  links?: ArcLinks;
  /** Only these players learnt it: it reaches their crew notes and packets alone. Absent: the whole crew. */
  players?: Id[];
}

export interface ArcStage {
  id: Id;
  title: string;
  summary?: string;
  clues: ArcClue[];
}

/** A clock milestone: what happens when the clock reaches `at`, and the payoffs it suggests. */
export interface ArcMilestone {
  at: number;
  text: string;
  /** The stage it opens. */
  stage?: Id;
  payoffs?: Array<{ kind: string; text: string; used?: { at: string; job?: Id } }>;
  /** When the clock first reached it. */
  reached?: string;
}

/** One movement of a thread clock. */
export interface ArcClockTick {
  at: string;
  /** Segments added (negative to wind it back). */
  by: number;
  how: "roll" | "hand";
  roll?: { dice: string; faces: number[]; total: number; seed: string };
  /** The thread was ignored (no clue found since its last tick). */
  ignored?: boolean;
  note?: string;
  session?: Id;
}

export interface ArcClock {
  segments: number;
  filled: number;
  milestones: ArcMilestone[];
  log: ArcClockTick[];
}

export type ArcStatus = "active" | "dormant" | "resolved";

/**
 * A campaign thread (an arc): a sponsor's scheme told across jobs, from the
 * first hints to the endgame, with clues the crew finds and a clock that
 * ticks between jobs. Always GM-only; the players see only crew notes (the
 * player-facing title and the clues they found, see arcs.ts).
 */
export interface ArcThread extends BaseRecord {
  /** The GM's title. */
  title: string;
  /** The title the crew notes use, hidden until the crew finds one of its clues. */
  playerTitle: string;
  /** The sponsoring faction (an entity). */
  sponsor?: Id;
  /** The players may learn who is behind it: crew notes name the sponsor (when they may see it). */
  sponsorRevealed?: boolean;
  goal: string;
  method: string;
  weakness: string;
  /** What happens if the crew ignores it. */
  cost: string;
  stages: ArcStage[];
  clock: ArcClock;
  status: ArcStatus;
  /** Column order on the board. */
  order: number;
  /** NPCs who work for the thread (a betrayer's "why"). */
  agents?: Id[];
  links?: ArcLinks;
  /** Where it came from: the generator run and offer, the module. */
  source?: { module?: string; procedure?: string; run?: Id; offer?: string };
  page?: PageRef;
  cite?: CiteRef;
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
  ledger: Record<Id, LedgerEntry>;
  travel: Record<Id, TravelLeg>;
  advancement: Record<Id, AdvancementEntry>;
  /** Campaign threads on the arc board (GM-only). */
  arcs: Record<Id, ArcThread>;
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
  "ledger",
  "travel",
  "advancement",
  "arcs",
];

/** Export bundle manifest (README.md lists this too). */
export interface BundleManifest {
  format: "campaign-forge-bundle";
  formatVersion: 1;
  exportedAt: string;
  moduleId: string;
  moduleVersion: string;
  /** Supplements active for the module when the campaign was exported (each embedded in the bundle). */
  supplements?: Array<{ id: string; name: string; version: string }>;
  /**
   * Supplements built into the app that were switched on for the module when
   * the campaign was exported. They are not embedded (the app ships them):
   * importing the bundle switches them on where the app has them.
   */
  builtinSupplements?: Array<{ id: string; name: string; version: string }>;
  campaignId: Id;
  campaignName: string;
}

/** Applied effects are recorded in the session log for auditability. */
export interface AppliedEffect {
  at: string;
  effect: Effect;
  session?: Id;
}
