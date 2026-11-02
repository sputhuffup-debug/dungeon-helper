/**
 * Job board tables (module-original writing, not the book's): how a job
 * rolled with the Job Generator (p. 244-252) reads as a posting, who posted
 * it, what it asks for, how risky it claims to be, what the employer really
 * wants, and the NPCs that come with it. Placeholders: {employer}, {what},
 * {dest}, {home}, {pay}, {contact}, {prize}.
 */

export type FrameKey = "truckers" | "marines" | "colonists";
export type FactionType = "corporation" | "government" | "military" | "colonial" | "other";

// ---------------------------------------------------------------------------
// The posting the players read
// ---------------------------------------------------------------------------

export const POSTING_TITLES: Record<FrameKey, string[]> = {
  truckers: ["Hauler wanted: {what}", "{what} to {dest}", "Fast ship, {what}, no delays", "Freight contract: {what}", "Carrier needed for {what}", "One run, {what}, good rates"],
  marines: ["Contract: {what}", "Operation {codename}", "Armed team wanted: {what}", "Short notice: {what}", "Private security contract: {what}", "Detachment needed: {what}"],
  colonists: ["Expedition crew wanted: {what}", "{what} at {dest}", "Field team needed: {what}", "Charter: {what}", "Survey crew: {what}", "Frontier contract: {what}"],
};

export const CODENAMES = ["Blue Lantern", "Cold Ember", "Silent Harrow", "Iron Gate", "Long Night", "Glass Anvil", "Red Meridian", "Hollow Bell", "Dust Crown", "Low Tide", "White Ledger", "Grey Orchard"];

export const PITCH_OPENERS: Record<FrameKey, string[]> = {
  truckers: [
    "{postedBy} needs a ship with a working hold and a crew that keeps to schedule.",
    "A clean freight contract for a crew that can load fast and leave faster.",
    "Looking for an independent hauler who does not mind the long sleep.",
    "{postedBy} has a consignment that cannot wait for the next scheduled carrier.",
  ],
  marines: [
    "{postedBy} is putting together a small armed team for a short contract.",
    "A detachment with its own ship is wanted for a job the regulars cannot take.",
    "Experienced fighters wanted; discretion counts as much as marksmanship.",
    "{postedBy} has an objective and a deadline, and needs professionals.",
  ],
  colonists: [
    "{postedBy} is funding a small expedition and needs a crew that knows the frontier.",
    "A field team is wanted for work far from the nearest colony.",
    "Looking for a self-reliant crew with a ship, suits and patience.",
    "{postedBy} has a permit, a budget and nobody to send.",
  ],
};

/** The job in one sentence: {what} is the cargo or mission, lower case. */
export const PITCH_WORK: Record<FrameKey, string[]> = {
  truckers: ["The cargo is {what}, bound for {dest}.", "Pick up {what} and deliver it to {dest}, sealed.", "{What} goes to {dest}; the manifest is ready to sign."],
  marines: ["The job is {what} at {dest}.", "Objective: {what}, at {dest}.", "{What}, at {dest}; the briefing comes after signing."],
  colonists: ["The work is {what} at {dest}.", "{What} at {dest}, with a full report on return.", "Get to {dest}, see to the {what}, and bring back the data."],
};

export const PITCH_DISTANCE = {
  near: ["It is an in-system run.", "No hyperspace jump needed: the destination is local."],
  far: ["It is {n} system{s} out, hypersleep both ways.", "Expect {n} jump{s} each way."],
};

/** Closers by the risk rating shown (0 lowest). */
export const PITCH_CLOSERS: string[][] = [
  ["Easy money for a careful crew.", "Simple work, quickly done."],
  ["Nothing a steady crew cannot handle.", "Routine, if nobody gets clever."],
  ["Bring your own sidearms.", "Some risk; the pay reflects it."],
  ["Not for the faint of heart.", "Hazard pay applies. Read the waiver."],
  ["Only crews with a death wish need apply.", "We will be honest: the last crew did not come back."],
];

export const PAY_TERMS = ["on delivery", "half up front, half on completion", "on completion, fuel advanced", "on completion, bonus negotiable", "in two parts: signing and return"];

export interface PosterRow {
  /** Who posted it; {employer} is the employer's name. */
  postedBy: string;
  where: string;
  /** False when the poster is a broker who keeps the client to themselves: the employer stays GM-only. */
  clientShown: boolean;
  frames?: FrameKey[];
}
export const POSTERS: PosterRow[] = [
  { postedBy: "{employer}", where: "the freight board at {home}", clientShown: true },
  { postedBy: "{employer}", where: "a message on the ship's terminal, addressed to the captain", clientShown: true },
  { postedBy: "A representative of {employer}", where: "a corner booth in the bar at {home}", clientShown: true },
  { postedBy: "{employer}", where: "the dockmaster's job list at {home}", clientShown: true, frames: ["truckers", "colonists"] },
  { postedBy: "A broker who will not name the client", where: "a note pinned to the airlock at {home}", clientShown: false },
  { postedBy: "An agency acting for a confidential client", where: "an encrypted drop on the ship's terminal", clientShown: false },
  { postedBy: "A fixer the crew has used before", where: "a hand-written card slid under the hatch at {home}", clientShown: false },
  { postedBy: "{employer}, through a contracting office", where: "the contracts office at {home}", clientShown: true, frames: ["marines"] },
  { postedBy: "An officer who calls it a favour", where: "a private channel, voice only", clientShown: false, frames: ["marines"] },
];

export const DEADLINES: Record<FrameKey, string[]> = {
  truckers: ["Loads within 24 hours", "Leave by the end of the week", "Before the next ICC inspection", "The cargo spoils in nine days", "Open until filled", "Tonight, or not at all"],
  marines: ["Wheels up at 0600 tomorrow", "Within 48 hours", "Before the window closes in three days", "Immediately", "By the end of the week", "Before the relief force arrives"],
  colonists: ["Before the permit runs out next month", "Within two weeks", "Before the storm season", "Leave by the end of the week", "As soon as a crew signs", "Before the rival claim is filed"],
};

export interface RequirementRow {
  text: string;
  /** Frames it suits (all when absent). */
  frames?: FrameKey[];
  /** Mission, cargo, complication or twist labels that make it likely. */
  when?: string[];
  /** Base weight (1 when absent). */
  weight?: number;
}
export const REQUIREMENTS: RequirementRow[] = [
  { text: "Needs a pilot", weight: 2 },
  { text: "Hazard pay", when: ["Radioactives", "Industrial Chemicals", "Natural Phenomenon", "Under Fire!", "Tough Resistance", "Deadly Treasure", "Bug Hunt", "Xenomorph Outbreak"] },
  { text: "No questions", when: ["Weapons & Armor", "Courier", "Data Collection", "Snatch And Grab", "Secret Plot", "Company Meddling", "Surveillance"], weight: 1.5 },
  { text: "Own ship required", frames: ["truckers", "colonists"], weight: 2 },
  { text: "Medic on board", when: ["Medicinal Goods", "Search And Rescue", "Rescue Expedition", "Civil Evacuation", "Colonists"] },
  { text: "EVA experience", when: ["Pressure Suits", "Wreckage/Salvage", "Salvage", "Space Assault", "Wreckage", "Asteroid/Moon"] },
  { text: "Clean ICC record", frames: ["truckers"], when: ["Embargo/Quarantine", "Military"] },
  { text: "Power loader certification", frames: ["truckers"], when: ["Single Oversized Item", "Vehicles", "Colony Construction", "Metal Ingots Or Pellets", "Ore"] },
  { text: "Stasis-rated hold", frames: ["truckers"], when: ["Colonists", "Livestock/Animals"] },
  { text: "Bring your own weapons", frames: ["marines", "colonists"], when: ["Assault", "Raid", "Combat patrol", "Rival Expedition"], weight: 1.5 },
  { text: "Sealed manifest: do not open", frames: ["truckers"], when: ["Medicinal Goods", "Technical Parts", "Weapons & Armor", "Radioactives"] },
  { text: "Survey kit and sensor drone", frames: ["colonists"], when: ["Survey", "Prospecting", "Anomaly Exploration", "Mining"] },
  { text: "Tracker and flamethrower experience", frames: ["marines"], when: ["Bug Hunt", "Investigation"] },
  { text: "A comtech who can crack a lock", when: ["Sabotage", "Data Collection", "Investigation", "Snatch And Grab", "Salvage"] },
  { text: "Discretion assured", weight: 1.2 },
  { text: "Leave the civilians to us", frames: ["marines"], when: ["Peacekeeping", "Civil Evacuation", "Passengers"] },
];

/** The risk rating the players see, by level: rolled difficulty 1-3 is level 1-3; a misleading rating moves one step. */
export const RISK_LABELS = ["Low risk", "Routine", "Moderate risk", "High risk", "Hazard pay: extreme"];

// ---------------------------------------------------------------------------
// What the GM knows
// ---------------------------------------------------------------------------

export const EMPLOYER_INTENTS: Record<FactionType, string[]> = {
  corporation: [
    "Wants the job done quietly, with the crew's logs wiped afterwards.",
    "Is testing whether this crew can be trusted with bigger, dirtier work.",
    "Has insured the cargo for more than it is worth and expects it to be lost.",
    "Wants a sample of whatever is at the destination and has not said so.",
    "Needs a scapegoat if this goes wrong, and the crew fits.",
  ],
  government: [
    "Wants proof that a corporation broke the law, and the crew is the witness.",
    "Is cleaning up an embarrassment before an inspection.",
    "Plans to deny all knowledge if the crew is caught.",
    "Wants the job seen to be done, more than done well.",
  ],
  military: [
    "Wants deniable boots on the ground where the Corps cannot go.",
    "Is collecting intelligence on whoever turns up at the site.",
    "Expects heavy losses and has priced them in.",
    "Wants a rival unit embarrassed, and this job will do it.",
  ],
  colonial: [
    "Is desperate and has promised more than the colony can pay.",
    "Hopes the crew will stay and become the colony's protection.",
    "Is hiding how bad things are, to keep the colony's charter.",
    "Wants the crew to carry the blame for a decision already made.",
  ],
  other: [
    "Is spending money that is not theirs to spend.",
    "Wants the crew busy and far away while something else happens at home.",
    "Is a front for someone the crew would never work for.",
    "Means every word of it, and is the most dangerous kind of client.",
  ],
};

// ---------------------------------------------------------------------------
// NPC roles
// ---------------------------------------------------------------------------

/** How a role shows on the site map (see the map generator's NPC roles); absent: the NPC stays away from the site. */
export type MapRole = "crew" | "survivor" | "android";

export interface NpcRoleRow {
  id: string;
  label: string;
  /** Public role written on the sheet: {employer}, {dest}. */
  publicRole: string;
  /** NPC presets this role draws from (p. 258-259), by frame when it differs. */
  presets: string[];
  mapRole?: MapRole;
  /** Base weight; frame and job labels add to it. */
  weight: number;
  frames?: Partial<Record<FrameKey, number>>;
  when?: string[];
  wants: string[];
  secrets: string[];
  ties: string[];
  /** An open android (the crew knows it is one). */
  android?: boolean;
}

/** The contact: the employer's representative, always the job's first NPC. Presets by the employer's faction type. */
export const CONTACT_PRESETS: Record<FactionType | "marines", string[]> = {
  corporation: ["alien.npc.company-bureaucrat", "alien.npc.corporate-exec"],
  government: ["alien.npc.icc-inspector", "alien.npc.company-bureaucrat"],
  military: ["alien.npc.squad-leader"],
  colonial: ["alien.npc.colony-manager", "alien.npc.homesteader"],
  other: ["alien.npc.smuggler", "alien.npc.corporate-exec", "alien.npc.scientist"],
  marines: ["alien.npc.squad-leader", "alien.npc.company-bureaucrat"],
};

export const CONTACT_ROLE: NpcRoleRow = {
  id: "contact",
  label: "Contact",
  publicRole: "Contact for {employer}",
  presets: [],
  weight: 0,
  wants: ["The job done without anyone asking who signed off on it", "A clean report to send upstairs", "To keep this contract and land the next one", "Their bonus, which depends on the crew"],
  secrets: ["Has never set foot at {dest} and is guessing", "Took a cut of the pay before it was posted", "Was told to drop the crew if anything goes wrong", "Wrote the posting to sound safer than it is"],
  ties: ["Wrote the posting and signs the contract", "Holds the pay until the job is done", "Speaks for {employer} and nobody else"],
};

export const NPC_ROLES: NpcRoleRow[] = [
  {
    id: "insider",
    label: "Insider",
    publicRole: "Works at {dest}",
    presets: ["alien.npc.comtech", "alien.npc.ships-engineer", "alien.npc.medic", "alien.npc.colony-manager", "alien.npc.security-guard"],
    mapRole: "survivor",
    weight: 3,
    when: ["Sabotage", "Snatch And Grab", "Courier", "Data Collection", "Investigation", "Space Station", "Established Colony", "Colony", "Isolated Outpost", "Outpost", "Waiting Game"],
    wants: ["A way off {dest} on the crew's ship", "Someone to believe what they saw", "Payment for the codes they can give", "To keep their job after this"],
    secrets: ["Reported the crew's arrival to someone else", "Caused the trouble at {dest} by accident", "Has been stealing from the site for months", "Is the only one who knows the real layout"],
    ties: ["Knows the site and can open its doors", "Sent the message that started the job", "Is the person the cargo is meant for"],
  },
  {
    id: "rival",
    label: "Rival crew lead",
    publicRole: "Captain of a rival crew",
    presets: ["alien.npc.smuggler", "alien.npc.salvage-expert", "alien.npc.mercenary", "alien.npc.pilot", "alien.npc.mining-wildcatter"],
    mapRole: "crew",
    weight: 2,
    frames: { colonists: 2, truckers: 1 },
    when: ["Rival Expedition", "Salvage", "Prospecting", "Mining", "Wreckage/Salvage", "Survey", "Spaceport", "Space Traffic Security"],
    wants: ["The same prize, first", "The contract, next time", "To prove they are the better crew", "A partner they can leave behind"],
    secrets: ["Was offered this job first and turned it down for a reason", "Owes money to the crew's employer", "Has a buyer lined up for whatever the crew finds", "Lost their last crew at a site like this one"],
    ties: ["Is racing the crew to {dest}", "Offers to split the work, and the pay", "Bid against the crew for the contract"],
  },
  {
    id: "survivor",
    label: "Survivor or witness",
    publicRole: "Last word from {dest}",
    presets: ["alien.npc.kid", "alien.npc.homesteader", "alien.npc.asteroid-miner", "alien.npc.medic", "alien.npc.comtech"],
    mapRole: "survivor",
    weight: 2,
    when: ["Search And Rescue", "Rescue Expedition", "Investigation", "Civil Evacuation", "Mayday", "Presumed Missing", "Abandoned Colony", "Young Colony", "Scattered Homesteads"],
    wants: ["To get out, now", "To find someone still missing at {dest}", "For someone to listen", "Never to go back"],
    secrets: ["Left others behind to save themselves", "Saw what happened and is too afraid to say", "Is hurt worse than they let on", "Is not who they claim to be"],
    ties: ["The reason the job exists", "Knows where the danger is at {dest}", "Can identify who is responsible"],
  },
  {
    id: "liaison",
    label: "Company liaison",
    publicRole: "Observer for {employer}",
    presets: ["alien.npc.company-bureaucrat", "alien.npc.corporate-exec", "alien.npc.scientist"],
    mapRole: "crew",
    weight: 2,
    when: ["Company Meddling", "Observer", "Data Collection", "Civilian Advisor", "Survey", "Anomaly Exploration", "Surveillance", "Secret Plot"],
    wants: ["A full report, with samples", "To be seen running the operation", "To keep the costs down, whatever that means", "The crew to sign a non-disclosure agreement"],
    secrets: ["Has sealed orders for when the crew reaches {dest}", "Is being blackmailed by a rival company", "Knows exactly what is waiting at {dest}", "Is a scientist, not an accountant, and wants the prize alive"],
    ties: ["Rides along to protect {employer}'s interests", "Has the final say over what the crew may touch", "Carries the employer's codes for the site"],
  },
  {
    id: "stowaway",
    label: "Stowaway",
    publicRole: "Found in the hold",
    presets: ["alien.npc.kid", "alien.npc.thug", "alien.npc.smuggler"],
    mapRole: "crew",
    weight: 1,
    frames: { truckers: 2, marines: 0.2 },
    when: ["Colonists", "Livestock/Animals", "Delay", "Embargo/Quarantine", "Passengers"],
    wants: ["Passage to {dest}, free", "To stay hidden from someone at {home}", "A new start", "To get home"],
    secrets: ["Is running from a debt collector", "Is carrying something they stole", "Knows the cargo is not what the manifest says", "Was put aboard on purpose"],
    ties: ["Turns up once the ship is under way", "Has a reason to be at {dest}", "Knows someone in the employer's office"],
  },
  {
    id: "specialist",
    label: "Hired specialist",
    publicRole: "Specialist assigned to the job",
    presets: ["alien.npc.medic", "alien.npc.comtech", "alien.npc.pilot", "alien.npc.scientist", "alien.npc.salvage-expert", "alien.npc.marshal"],
    mapRole: "crew",
    weight: 2,
    frames: { marines: 2, colonists: 1.5 },
    when: ["Gear Problems", "Civilian Advisor", "Survey", "Mining", "Anomaly Exploration", "Bug Hunt", "Natural Phenomenon"],
    wants: ["To do the work and go home", "A good word for their licence", "The credit for whatever is found", "To settle a score with someone at {dest}"],
    secrets: ["Is not as qualified as their papers say", "Is working for two employers", "Has been to {dest} before", "Was hired to watch the crew"],
    ties: ["The employer insists they come along", "Holds the skills the job needs", "Brings the equipment the crew lacks"],
  },
  {
    id: "android",
    label: "Android",
    publicRole: "Synthetic assigned by {employer}",
    presets: ["alien.npc.android-curious", "alien.npc.android-refurbished"],
    mapRole: "android",
    weight: 1,
    android: true,
    when: ["Investigation", "Data Collection", "Survey", "Anomaly Exploration"],
    wants: ["To complete its assignment", "To understand what happened at {dest}", "To be trusted by the crew"],
    secrets: ["Its memory of the last job was wiped, not lost", "Reports to {employer} every shift", "Was refurbished from a unit lost at {dest}"],
    ties: ["Comes with the contract, like the paperwork", "Carries the site's records in memory", "Is the employer's eyes on the crew"],
  },
];

/** Name pools are the careers' names (p. 32-41); these surnames extend them when the board runs short (module-original). */
export const SPARE_NAMES = ["Rhea Okafor", "Dmitri Vasko", "Lena Hartwell", "Sol Abernathy", "June Takeda", "Pavel Rusk", "Imani Cole", "Otto Brennan", "Mara Quill", "Theo Lindqvist", "Ada Moreau", "Kasim Rao"];

// ---------------------------------------------------------------------------
// NPC agendas
// ---------------------------------------------------------------------------

/** Who an NPC answers to, in the third person (by the agenda allegiances of the cinematic generator). */
export const NPC_ALLEGIANCE_TEXT: Record<string, string> = {
  company: "the Company",
  "rival-corp": "a rival corporation",
  marshals: "the Colonial Marshals",
  union: "their union",
  military: "military intelligence",
  family: "their family",
  conscience: "their own conscience",
  belief: "their faith",
  directive: "the people who built them",
  syndicate: "a smuggling syndicate",
  crew: "the crew, as they see it",
  self: "nobody but themselves",
  employer: "{employer}",
};

export const NPC_MOTIVE_TEXT: Record<string, string> = {
  debt: "a debt they cannot pay",
  guilt: "guilt over the last job",
  ambition: "a promotion that depends on it",
  revenge: "a score to settle",
  protect: "someone they love",
  curiosity: "the need to know",
  survival: "staying alive",
  loyalty: "loyalty",
  faith: "faith",
  orders: "standing orders",
  pride: "pride",
  greed: "the money",
};

/** How a betrayer turns on the crew (betrayal 3): one line for the GM and the map note. */
export const TURN_METHODS = [
  { id: "sell-out", text: "Sells the crew out: tells {buyer} where they are and when they are weakest." },
  { id: "sabotage", text: "Sabotages the crew's way out: disables the ship's drive or the escape craft at the worst moment." },
  { id: "steal", text: "Steals the prize and runs, leaving the crew to explain its loss." },
  { id: "trap", text: "Leads the crew into a trap at the site and locks the door behind them." },
];
export const TURN_BUYERS = ["the people waiting at the site", "a rival crew", "the Colonial Marshals", "the employer's competitors", "whoever pays most"];

/** What a hidden synthetic was told to do; `turns` when the directive puts the crew second (it then counts as a betrayer). */
export const SYNTHETIC_DIRECTIVES = [
  { text: "Bring back {prize} intact. The crew is expendable.", turns: true },
  { text: "Make sure nobody leaves {dest} with what they saw.", turns: true },
  { text: "Protect {employer}'s investment at any cost, starting with the crew's lives.", turns: true },
  { text: "Observe the crew under pressure and report how they hold up.", turns: false },
  { text: "Keep the crew alive until the job is delivered, then report.", turns: false },
  { text: "Recover the site's records and erase every other copy.", turns: false },
];

export const SYNTHETIC_CLUES = [
  "Never eats with the others, and always has an excuse.",
  "Does not shiver in the cold, or sweat in the heat.",
  "Answers questions a beat before they are finished.",
  "Has no medical file, only a sealed transfer order.",
  "Its hands are perfectly steady after a near miss.",
  "Remembers every number anyone says aloud.",
];

/**
 * NPC agenda arcs. `reuse` points at a cinematic agenda arc (agenda-arcs.ts)
 * whose name, summary, allegiances, motives and betrayal level carry over,
 * with beats taken from its acts; the rest are module-original NPC arcs.
 * Betrayal 0 loyal ... 3 sells the crew out.
 */
export interface NpcArcRow {
  id: string;
  /** A cinematic arc to reuse. */
  reuse?: string;
  name?: string;
  summary?: string;
  betrayal?: 0 | 1 | 2 | 3;
  allegiances?: string[];
  motives?: string[];
  /** What they want from this job. */
  wants?: string[];
  /** Beats: how it plays out, in order. */
  beats?: string[];
  /** Roles it suits better (weight x2). */
  roles?: string[];
}
export const NPC_ARCS: NpcArcRow[] = [
  { id: "plant", reuse: "plant", roles: ["liaison", "specialist", "contact"] },
  { id: "debtor", reuse: "debtor", roles: ["rival", "insider", "stowaway"] },
  { id: "protector", reuse: "protector", roles: ["survivor", "insider"] },
  { id: "whistleblower", reuse: "whistleblower", roles: ["insider", "liaison"] },
  { id: "believer", reuse: "believer", roles: ["survivor", "specialist"] },
  { id: "survivor", reuse: "survivor", roles: ["survivor", "stowaway"] },
  { id: "hidden-synthetic", reuse: "hidden-synthetic" },
  { id: "saboteur", reuse: "saboteur", roles: ["insider", "rival"] },
  { id: "smuggler", reuse: "smuggler", roles: ["stowaway", "rival"] },
  { id: "double-agent", reuse: "double-agent", roles: ["contact", "liaison", "insider"] },
  { id: "deserter", reuse: "deserter", roles: ["specialist", "survivor"] },
  { id: "collector", reuse: "collector", roles: ["liaison", "specialist"] },
  { id: "insurer", reuse: "insurer", roles: ["contact", "liaison"] },
  { id: "loyalist", reuse: "loyalist", roles: ["contact", "specialist"] },
  { id: "caretaker", reuse: "caretaker", roles: ["survivor", "specialist"] },
  { id: "scientist", reuse: "scientist", roles: ["liaison", "specialist"] },
  {
    id: "setup",
    name: "The Setup",
    summary: "Brought the crew here to be caught, and means to walk away clean.",
    betrayal: 3,
    allegiances: ["syndicate", "rival-corp", "self"],
    motives: ["greed", "debt", "survival"],
    wants: ["The crew in the wrong place at the right time"],
    beats: ["Steer the crew toward the part of the site that is already watched.", "Make sure the crew's ship is unguarded when it matters."],
    roles: ["contact", "insider", "rival"],
  },
  {
    id: "claim-jumper",
    name: "The Claim Jumper",
    summary: "Will let the crew do the hard work, then take the prize.",
    betrayal: 3,
    allegiances: ["self", "syndicate"],
    motives: ["greed", "pride"],
    wants: ["{prize}, all of it"],
    beats: ["Learn exactly where {prize} is and how it is moved.", "Take {prize} the moment the crew has it ready to go."],
    roles: ["rival", "stowaway", "specialist"],
  },
  {
    id: "informer",
    name: "The Informer",
    summary: "Already promised the crew to someone else in exchange for their own freedom.",
    betrayal: 3,
    allegiances: ["marshals", "military", "company"],
    motives: ["survival", "protect", "orders"],
    wants: ["Proof that the crew broke the law"],
    beats: ["Record what the crew says and does at the site.", "Signal the people waiting once the crew is committed."],
    roles: ["insider", "survivor", "contact"],
  },
  {
    id: "honest-broker",
    name: "The Honest Broker",
    summary: "Wants the job done right and the crew paid, and will say so to the employer.",
    betrayal: 0,
    allegiances: ["crew", "conscience"],
    motives: ["loyalty", "pride"],
    wants: ["A job done properly and a crew that comes back"],
    beats: ["Tell the crew one thing the posting left out.", "Stand up for the crew when the employer tries to cut the pay."],
    roles: ["contact", "specialist"],
  },
  {
    id: "fixer",
    name: "The Fixer",
    summary: "Helps the crew, for a cut, and keeps a little more for later.",
    betrayal: 1,
    allegiances: ["self", "syndicate"],
    motives: ["greed", "ambition"],
    wants: ["A percentage of everything that changes hands"],
    beats: ["Offer the crew a shortcut that costs them a favour.", "Call in the favour at the worst time."],
    roles: ["contact", "insider", "stowaway"],
  },
  {
    id: "hostage",
    name: "The Hostage",
    summary: "Someone they love is held against this job going well.",
    betrayal: 2,
    allegiances: ["family"],
    motives: ["protect", "survival"],
    wants: ["Their family released, whatever the crew loses"],
    beats: ["Push the crew to finish faster than is safe.", "Hand over whatever is demanded, even the crew's own gear."],
    roles: ["insider", "survivor", "contact"],
  },
];

/** The treachery dial: weights by betrayal level 0..3, and for a hidden synthetic (module decision). */
export const TREACHERY_DIAL = ["none", "rare", "common"] as const;
export type TreacheryDial = (typeof TREACHERY_DIAL)[number];
export const TREACHERY_WEIGHTS: Record<TreacheryDial, { levels: [number, number, number, number]; synthetic: number }> = {
  none: { levels: [4, 3, 0, 0], synthetic: 0 },
  rare: { levels: [4, 3, 1.5, 0.45], synthetic: 0.35 },
  common: { levels: [1.5, 2, 2.5, 4], synthetic: 1.5 },
};
/** The contact betrays less often (module decision): its weights for betrayal 2 and 3 and for a hidden synthetic are multiplied by these. */
export const CONTACT_TREACHERY = { level2: 0.6, level3: 0.4, synthetic: 0.5 };
