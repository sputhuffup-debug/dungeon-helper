/**
 * Campaign threads (module-original tables, no book text): the schemes a
 * faction runs across several jobs, how it runs them, where it is weak, what
 * ignoring it costs, the stages from first hints to the endgame, clue
 * templates by kind and tier, clock milestones and the payoffs they suggest.
 *
 * Placeholders: {sponsor} (GM text only), {subject} ("ore shipments"),
 * {item} ("ore barge"), {front} (the sponsor's front), {agent} (who does the
 * work, "a ..." where the crew first meets them) and {theAgent} (the same
 * person once met: "the ..."), {site} (where it ends), {home} (the crew's
 * home base), {codename}.
 * Player-facing text (`player`) never uses {sponsor}, {front} or {agent}
 * before the stage where the crew could know them, and never the GM's words.
 */
import type { FactionType } from "./job-board-data";

export const THREAD_CLUE_KINDS = [
  { id: "fact", label: "Fact" },
  { id: "object", label: "Object" },
  { id: "person", label: "Person" },
  { id: "place", label: "Place" },
] as const;
export type ThreadClueKind = (typeof THREAD_CLUE_KINDS)[number]["id"];

/** A scheme: what the sponsor is after, with the words the clues use for it. */
export interface SchemeRow {
  id: string;
  /** Faction types that run it; any when absent. */
  factions?: FactionType[];
  goal: string;
  subject: string;
  item: string;
  /** What the crew calls it once they notice (the crew notes title). */
  playerTitles: string[];
}

export const SCHEMES: SchemeRow[] = [
  { id: "ore", factions: ["corporation", "other"], goal: "Corner the sector's ore market by making independent shipments vanish", subject: "ore shipments", item: "ore barge", playerTitles: ["The missing ore shipments", "Ore that never arrives"] },
  { id: "colonists", factions: ["corporation", "government"], goal: "Fill a secret settlement with colonists who think they are going somewhere else", subject: "colonist transports", item: "cryo manifest", playerTitles: ["The colonists who never landed", "Empty berths on the colony ships"] },
  { id: "specimen", factions: ["corporation", "military"], goal: "Move a living specimen out of quarantine without the ICC noticing", subject: "sealed medical cargo", item: "cold-chain crate", playerTitles: ["The crates nobody may open", "Cold cargo with no paperwork"] },
  { id: "derelict", factions: ["corporation", "military", "other"], goal: "Strip a derelict of what it carries before anyone else finds it", subject: "salvage claims", item: "flight recorder", playerTitles: ["The wreck everyone pretends not to see", "Salvage claims filed in the dark"] },
  { id: "water", factions: ["colonial", "government", "corporation"], goal: "Starve rival colonies of water until they sell their charters cheap", subject: "ice haulers", item: "water contract", playerTitles: ["The dry colonies", "Water that costs too much"] },
  { id: "synthetics", factions: ["corporation", "other"], goal: "Seed the frontier with synthetics that report to one master", subject: "refurbished synthetics", item: "service android", playerTitles: ["Androids that ask too many questions", "The helpful new synthetics"] },
  { id: "weapons", factions: ["military", "government", "other"], goal: "Arm a faction in a quiet border war and profit from both sides", subject: "unlisted weapons crates", item: "arms manifest", playerTitles: ["Guns going to the wrong people", "The crates marked as machine parts"] },
  { id: "terraform", factions: ["corporation", "colonial"], goal: "Hide that a terraforming project failed until the next charter is sold", subject: "atmosphere processor reports", item: "processor log", playerTitles: ["The colony that cannot breathe", "Reports that do not add up"] },
  { id: "debt", factions: ["corporation", "other"], goal: "Buy up crews' debts and turn them into a fleet that cannot say no", subject: "crew debt notes", item: "debt ledger", playerTitles: ["The debt collectors", "Crews that suddenly owe everyone"] },
  { id: "signal", factions: ["military", "corporation", "government"], goal: "Find the source of a repeating signal before any rival does", subject: "survey beacons", item: "beacon recording", playerTitles: ["The signal in the static", "Survey beacons that go silent"] },
  { id: "pathogen", factions: ["corporation", "military"], goal: "Field-test a pathogen on a colony nobody will miss", subject: "medical supply runs", item: "vaccine shipment", playerTitles: ["The sickness at the edge of the sector", "Medicine that makes it worse"] },
  { id: "election", factions: ["government", "colonial"], goal: "Put a pliable administrator in charge of the sector's licences", subject: "licence hearings", item: "sealed ballot", playerTitles: ["Licences for sale", "The new administrator"] },
  { id: "smuggling", factions: ["other", "colonial"], goal: "Run a smuggling line through the crew's own port", subject: "port inspections", item: "false-bottom container", playerTitles: ["What slips past the inspectors", "Containers that weigh too much"] },
  { id: "cult", factions: ["other"], goal: "Gather believers and a specimen for a ritual on a dead world", subject: "pilgrim passages", item: "pilgrim's token", playerTitles: ["The pilgrims", "Passengers who want to go to dead worlds"] },
  { id: "sabotage", factions: ["corporation", "government", "military"], goal: "Ruin a rival's station so its contracts fall to the sponsor", subject: "station maintenance jobs", item: "reactor part", playerTitles: ["Accidents at the rival station", "Parts that fail on purpose"] },
  { id: "data", factions: ["corporation", "government", "military"], goal: "Steal a rival's survey data and bury the scientists who made it", subject: "survey teams", item: "data core", playerTitles: ["The survey teams who stop reporting", "Data that keeps going missing"] },
];

/** How the sponsor works: the method, who does the work, and the front they hide behind. */
export interface MethodRow {
  method: string;
  agent: string;
  front: string;
}

export const METHODS: MethodRow[] = [
  { method: "Through a shell freight company that buys out failing contracts", agent: "a freight broker", front: "a shell freight company" },
  { method: "With a hidden synthetic placed on every crew it hires", agent: "a hidden synthetic", front: "a crew-placement agency" },
  { method: "By bribing the port's customs office", agent: "a customs officer on the take", front: "the customs office" },
  { method: "Through a charity that runs medical clinics on the frontier", agent: "a clinic doctor", front: "a frontier charity" },
  { method: "With deniable crews hired off the job boards", agent: "a fixer who hires crews", front: "anonymous job postings" },
  { method: "By forging survey and inspection reports", agent: "a survey clerk", front: "an inspection contractor" },
  { method: "Through an insurance office that profits when ships are lost", agent: "an insurance assessor", front: "an insurance office" },
  { method: "With a security firm that guards the very sites it raids", agent: "a security captain", front: "a private security firm" },
  { method: "By planting informants in the dockworkers' union", agent: "a union steward", front: "the dockworkers' union" },
  { method: "Through a shipping registry that changes ship names overnight", agent: "a registry clerk", front: "a ship registry office" },
  { method: "With a research outpost that does not appear on any chart", agent: "a lead scientist", front: "an uncharted outpost" },
  { method: "By buying the silence of the crews who saw too much", agent: "a quiet paymaster", front: "a payroll office" },
  { method: "Through a salvage outfit that always gets there first", agent: "a salvage boss", front: "a salvage outfit" },
  { method: "With forged transit papers from a friendly official", agent: "a transit official", front: "the transit authority" },
];

export const WEAKNESSES: string[] = [
  "The front keeps its real books on paper, in one office",
  "Their agent drinks and talks when the shift ends",
  "A survivor of the first incident is still alive and angry",
  "A customs inspector already suspects them and keeps a file",
  "The scheme needs one ship more than they have",
  "Their records are on a data core that never leaves the site",
  "A rival faction would pay well to see it exposed",
  "The agent wants out and needs a crew they can trust",
  "Their deadline is fixed: miss it and the buyers walk",
  "The sponsor's own auditors do not know about it",
  "The site depends on a single supply run",
  "Everyone involved signed the same forged document",
];

export const COSTS: string[] = [
  "The {subject} dry up across the sector and prices double",
  "The outer colonies go without and some are abandoned",
  "The crew's name ends up on the sponsor's list of loose ends",
  "The crew's home port falls under the sponsor's control",
  "Whatever they are hiding gets loose on a populated station",
  "A friendly contact of the crew disappears",
  "The sponsor buys the crew's ship debt and calls it in",
  "Rival crews take the work the crew used to get",
  "Marshals start treating the crew as accomplices",
  "The sector's job boards fill with the sponsor's work and nothing else",
];

/** GM titles: the secret name of the thread. */
export const GM_TITLES: string[] = ["Project {Codename}", "Operation {Codename}", "The {codename} file", "{Sponsor}: the {subject} play", "The {subject} squeeze"];

/** Stage tiers, in order: hints, pattern, middleman, exposure, endgame. A thread uses the first and last and 1-3 of the middle ones, in order. */
export const STAGE_TIERS = ["hints", "pattern", "middleman", "exposure", "endgame"] as const;
export type StageTier = (typeof STAGE_TIERS)[number];

export const STAGE_TITLES: Record<StageTier, string[]> = {
  hints: ["First hints", "Something is off", "Loose ends", "Rumours at the bar"],
  pattern: ["The pattern", "Following the {subject}", "The paper trail"],
  middleman: ["The middleman", "A face behind {front}", "Who does the work"],
  exposure: ["Who pays", "The sponsor's hand", "Proof"],
  endgame: ["Endgame", "The reckoning", "Showdown at {site}"],
};

export const STAGE_SUMMARIES: Record<StageTier, string[]> = {
  hints: ["The crew sees symptoms, not causes: things missing, numbers wrong, people nervous.", "Nothing connects yet; each hint could be bad luck."],
  pattern: ["The hints line up: the same {subject}, the same routes, the same paperwork.", "The crew can see it is deliberate, not who is doing it."],
  middleman: ["{Front} is the visible piece; {theAgent} keeps it running.", "A person the crew can find, pressure or follow."],
  exposure: ["The money leads to {sponsor}.", "Proof that would hold up with a marshal or a rival."],
  endgame: ["Everything comes to a head at {site}.", "The crew stops it, profits from it, or is buried by it."],
};

/** Where the endgame happens. */
export const SITES: string[] = [
  "a decommissioned refinery",
  "an orbital cold store",
  "a quarantine block on {home}",
  "a derelict ore carrier",
  "an unlisted research outpost",
  "a terraforming station on a dead moon",
  "the sponsor's private dock",
  "an abandoned mining colony",
];

export interface ClueTemplate {
  /** The GM's text. */
  gm: string;
  /** What the crew notes say once found. */
  player: string;
  unlocks: string;
}

/** Clue templates by kind and tier: early (hints, pattern), middle (middleman, exposure) and late (endgame). */
export type ClueTier = "early" | "middle" | "late";
export const STAGE_CLUE_TIER: Record<StageTier, ClueTier> = { hints: "early", pattern: "early", middleman: "middle", exposure: "middle", endgame: "late" };

export const CLUES: Record<ThreadClueKind, Record<ClueTier, ClueTemplate[]>> = {
  fact: {
    early: [
      { gm: "Three {subject} in a row were cleared by the same signature", player: "Three {subject} in a row were cleared by the same person", unlocks: "Points at {front}" },
      { gm: "The insurance on the lost {item} was paid before it was reported lost", player: "The insurance on a lost {item} was paid suspiciously fast", unlocks: "The claims lead to {front}" },
      { gm: "Every lost {item} passed the same waypoint inside a week", player: "Every lost {item} passed the same waypoint", unlocks: "The waypoint is watched by {agent}" },
      { gm: "Port logs at {home} were edited after the {subject} left", player: "Someone edited the port logs at {home}", unlocks: "Who has access to the logs" },
    ],
    middle: [
      { gm: "{Front} has no clients except {sponsor}'s subsidiaries", player: "{Front} has only one real client", unlocks: "The client is {sponsor}" },
      { gm: "{TheAgent} is paid from an account that also pays {sponsor}'s security", player: "{TheAgent} and the sponsor's security share a paymaster", unlocks: "Proof that {sponsor} pays" },
      { gm: "The scheme's real purpose: {goalLower}", player: "Someone with deep pockets needs this to keep going", unlocks: "What the endgame is for" },
    ],
    late: [
      { gm: "Everything left of the operation is moving to {site} on a fixed date", player: "Whatever is left is moving to {site}, soon", unlocks: "Where and when the endgame happens" },
      { gm: "{Sponsor} will cut every loose end once {site} is sealed", player: "Once it is over, everyone who knows will be silenced", unlocks: "The cost of waiting" },
    ],
  },
  object: {
    early: [
      { gm: "A {item} with its serial filed off, stamped by {front}", player: "A {item} with its serial filed off", unlocks: "The stamp leads to {front}" },
      { gm: "A crate tag from {front}, in a place it should never have been", player: "A crate tag that should not be here", unlocks: "Where the crates go" },
      { gm: "A second copy of a manifest, with different numbers", player: "Two manifests for the same cargo, with different numbers", unlocks: "Which manifest is true" },
    ],
    middle: [
      { gm: "{Agent}'s datapad, with routes and payments", player: "A datapad full of routes and payments", unlocks: "Names {theAgent}" },
      { gm: "A sealed order signed for {sponsor}", player: "A sealed order with a corporate seal", unlocks: "Proof of who signs the orders" },
      { gm: "A key card for {site}", player: "A key card for a place not on any chart", unlocks: "A way into {site}" },
    ],
    late: [
      { gm: "The {item} at the heart of it all, stored at {site}", player: "The thing everyone is after", unlocks: "Leverage over {sponsor}" },
      { gm: "The original contract between {front} and {sponsor}", player: "The contract that ties it all together", unlocks: "Enough proof to end it" },
    ],
  },
  person: {
    early: [
      { gm: "A dockhand who saw the {item} loaded at night", player: "A dockhand who saw something loaded at night", unlocks: "Describes {theAgent}" },
      { gm: "A pilot who quit after a run for {front}", player: "A pilot who quit after one run and will not say why", unlocks: "The route the {subject} take" },
      { gm: "A widow paid to stop asking about her partner's ship", player: "A widow who stopped asking questions overnight", unlocks: "Who paid her" },
    ],
    middle: [
      { gm: "{Agent}, who keeps the scheme running", player: "{Agent} who seems to be behind it", unlocks: "Who {theAgent} answers to" },
      { gm: "An auditor for {sponsor} who does not know about it", player: "An auditor who would be shocked to see the books", unlocks: "A way to turn {sponsor} on itself" },
      { gm: "A former partner of {front} who wants revenge", player: "Someone who used to work for {front} and holds a grudge", unlocks: "Inside knowledge of {site}" },
    ],
    late: [
      { gm: "The {sponsor} executive who signed off on it", player: "The person who signed off on all of it", unlocks: "The head of the snake" },
      { gm: "A survivor held at {site}", player: "Someone held against their will", unlocks: "A witness for the endgame" },
    ],
  },
  place: {
    early: [
      { gm: "A berth at {home} that is always booked and never used", player: "A berth at {home} that is always booked and never used", unlocks: "Who books it" },
      { gm: "A waypoint beacon that was moved two hundred kilometres", player: "A navigation beacon that is not where the charts say", unlocks: "Where the {subject} really go" },
      { gm: "A bar where {agent} recruits", player: "A bar where the wrong people hire crews", unlocks: "Meets {theAgent}" },
    ],
    middle: [
      { gm: "{Front}'s back office, where the real books are", player: "A back office with a lot of locks", unlocks: "The books" },
      { gm: "A transfer station where the {subject} change hands", player: "A transfer station that handles more cargo than it should", unlocks: "The route to {site}" },
    ],
    late: [
      { gm: "{Site}, where it ends", player: "{Site}", unlocks: "The endgame" },
      { gm: "The sponsor's private dock beside {site}", player: "A private dock that nobody admits owning", unlocks: "The way out of {site}" },
    ],
  },
};

/** Milestone texts by tier: what happens when the clock reaches the stage. */
export const MILESTONES: Record<StageTier, string[]> = {
  hints: ["The first {item} goes missing"],
  pattern: ["{Front} doubles its work: more {subject} go astray", "A second crew starts asking the same questions", "{TheAgent} notices someone is asking questions"],
  middleman: ["{TheAgent} hires deniable crews to tidy up", "A witness turns up dead", "{Front} moves its books"],
  exposure: ["{Sponsor} sends its own people to watch the crew", "The marshals receive an anonymous tip about the crew", "{Sponsor} buys out the crew's usual employers"],
  endgame: ["{Sponsor} achieves its goal: {goalLower}", "The operation at {site} is sealed for good"],
};

/** Payoffs a milestone suggests, by kind (GM text). */
export const PAYOFFS: Record<string, string[]> = {
  posting: ["{Sponsor} posts a job through {front}: deniable work moving {subject}", "A well-paid posting from {front}, with no questions asked", "{TheAgent} offers the crew a run that would make them accomplices"],
  grudge: ["Someone the crew crossed comes back working for {sponsor}", "A contact with a grudge sells the crew's route to {theAgent}"],
  threat: ["The next site holds {sponsor}'s cleaners, guarding the {item}", "{Sponsor} sends a security team to the next job site"],
  complication: ["Mid-job, {theAgent} turns up with a better offer", "The cargo on the next job is one of the {subject}", "The next job's paperwork carries {front}'s stamp"],
};

export const PAYOFF_KINDS = [
  { id: "posting", label: "A posting from the sponsor" },
  { id: "grudge", label: "A returning contact with a grudge" },
  { id: "threat", label: "A site brief with a specific threat" },
  { id: "complication", label: "A complication" },
] as const;

/** Faction heat, one label per level from 0 to 6. */
export const HEAT_LABELS = ["Unnoticed", "Noticed", "Watched", "Marked", "Pursued", "Targeted", "Hunted"] as const;

/** Where the job board places a clue in a posting's material. */
export const ARC_SLOTS = [
  { id: "intent", label: "The employer's real intent" },
  { id: "npc-secret", label: "An NPC's secret" },
  { id: "npc-agenda", label: "An NPC's agenda" },
  { id: "cargo", label: "A cargo detail" },
  { id: "complication", label: "A complication note" },
  { id: "key-room", label: "A key room of the site brief" },
  { id: "contact", label: "A contact who knows it" },
] as const;
export type ArcSlotId = (typeof ARC_SLOTS)[number]["id"];
