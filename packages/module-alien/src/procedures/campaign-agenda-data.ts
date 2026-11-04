/**
 * Campaign-play agendas (original writing, not the book's): long-term goals
 * that last several jobs, a short beat per job, the friction lines that set
 * PCs against each other in the open, embarrassing secrets and the tension
 * ladder. The book's rules they serve: the sheet's personal agenda and its
 * bonus XP (p. 27, 30), shore leave's Pursue Agenda (p. 257) and the campaign
 * play section's goals (p. 158-159).
 *
 * Friction, never betrayal. Every goal, beat, follow-up, friction line,
 * secret and tension step carries a betrayal level, and the campaign
 * generator deals only levels 0-1: crewmates compete for pay and berths,
 * disagree about who the crew answers to, have embarrassing secrets that
 * endanger no one, and needle a rival or cover for a buddy at a cost. The
 * worst it gets is hard words. `campaign-agenda-check.ts` proves it for any
 * deal and scans the text for words that belong to the cinematic
 * generator's traitors.
 */
import type { AllegianceId, MotiveId } from "./agenda-arcs";

/** 0: the crew comes first ... 3: sells them out. The campaign generator deals 0-1 only. */
export type CampaignBetrayal = 0 | 1 | 2 | 3;
/** The most the campaign generator ever deals. */
export const CAMPAIGN_BETRAYAL_MAX = 1;

/**
 * How a goal, beat or friction line treats the crewmate it names. The first
 * group is what campaign material may take; the second never appears in it
 * (the cinematic arcs' stances against a target, plus keeping something
 * from a crewmate) and the checker rejects any material that takes one.
 */
export const ALLOWED_STANCES = ["pursue", "persuade", "support", "teach", "outdo", "ask", "compete", "disagree", "needle", "cover", "sting"] as const;
export const BANNED_STANCES = ["harm", "deny", "expose", "take", "destroy", "conceal", "keep-from"] as const;
export type CampaignStance = (typeof ALLOWED_STANCES)[number] | (typeof BANNED_STANCES)[number];

/** Who a campaign goal answers to: the cinematic allegiances without the shadowy ones (no rival corporations, intelligence services, synthetic directives or syndicates). */
export const CAMPAIGN_ALLEGIANCES = ["company", "union", "family", "conscience", "marshals", "crew", "self", "belief"] as const satisfies readonly AllegianceId[];
export type CampaignAllegiance = (typeof CAMPAIGN_ALLEGIANCES)[number];

/** How a card names the allegiance: to the PC ("your family") and to a crewmate ("their family"). `{company}` is the campaign's corporation. */
export const ALLEGIANCE_TEXT: Record<CampaignAllegiance, { label: string; mine: string; theirs: string }> = {
  company: { label: "The Company", mine: "{company}", theirs: "{company}" },
  union: { label: "The union", mine: "the union", theirs: "the union" },
  family: { label: "Family", mine: "your family", theirs: "their family" },
  conscience: { label: "Conscience", mine: "your conscience", theirs: "their conscience" },
  marshals: { label: "The law", mine: "the Colonial Marshals", theirs: "the Colonial Marshals" },
  crew: { label: "The crew", mine: "the crew", theirs: "the crew" },
  self: { label: "Yourself", mine: "looking after yourself", theirs: "looking after themselves" },
  belief: { label: "Faith", mine: "your faith", theirs: "their faith" },
};

/** Why they keep at it (the cinematic motive ids, campaign wording). */
export const CAMPAIGN_MOTIVES = ["ambition", "debt", "guilt", "protect", "curiosity", "loyalty", "faith", "pride", "greed"] as const satisfies readonly MotiveId[];
export type CampaignMotive = (typeof CAMPAIGN_MOTIVES)[number];
export const MOTIVE_TEXT: Record<CampaignMotive, { label: string; why: string }> = {
  ambition: { label: "Ambition", why: "you want more than a hired hand's life" },
  debt: { label: "Debt", why: "the money you owe will not wait forever" },
  guilt: { label: "Guilt", why: "you let someone down once and mean to make up for it" },
  protect: { label: "Someone to look after", why: "someone you love is counting on you" },
  curiosity: { label: "Curiosity", why: "you have to know" },
  loyalty: { label: "Loyalty", why: "you keep your word" },
  faith: { label: "Faith", why: "you believe it is what you are meant to do" },
  pride: { label: "Pride", why: "nobody will call you a failure again" },
  greed: { label: "Greed", why: "a hazard bonus never feels like enough" },
};

/** The four kinds of friction, all in the mix. */
export const FRICTION_KINDS = ["resources", "loyalties", "secrets", "ties"] as const;
export type FrictionKind = (typeof FRICTION_KINDS)[number];
export const FRICTION_KIND_LABEL: Record<FrictionKind, string> = {
  resources: "Competing for resources",
  loyalties: "Clashing loyalties",
  secrets: "Embarrassing secret",
  ties: "Buddy and rival",
};

/** The friction dial: how much open friction a crew starts with. It never deals betrayal. */
export const FRICTION_DIAL = ["calm", "simmering", "prickly"] as const;
export type FrictionDial = (typeof FRICTION_DIAL)[number];
/** Friction lines each PC is in at least, by dial. */
export const DIAL_LINES_PER_PC: Record<FrictionDial, number> = { calm: 1, simmering: 2, prickly: 3 };
/** Base weights of the four kinds, by dial (the crew then shifts them). */
export const DIAL_KIND_WEIGHTS: Record<FrictionDial, Record<FrictionKind, number>> = {
  calm: { resources: 3, loyalties: 2, secrets: 1, ties: 2 },
  simmering: { resources: 3, loyalties: 3, secrets: 2, ties: 3 },
  prickly: { resources: 3, loyalties: 4, secrets: 3, ties: 4 },
};

// ---------------------------------------------------------------------------
// the tension ladder
// ---------------------------------------------------------------------------

export interface TensionStep {
  id: string;
  label: string;
  text: string;
  betrayal: CampaignBetrayal;
}

/** A stalled goal raises its tension one step; the top step is the cap. */
export const TENSION_LADDER: TensionStep[] = [
  { id: "calm", label: "Calm", text: "The friction shows as banter and the odd sigh.", betrayal: 0 },
  { id: "quiet", label: "Quiet disagreement", text: "They disagree in private and politely; a look across the galley says enough.", betrayal: 0 },
  { id: "open", label: "Open argument", text: "It comes out in front of the crew: raised voices, then back to work.", betrayal: 1 },
  {
    id: "hard-words",
    label: "Hard words",
    text: "An ultimatum or hard words that will be remembered. That is as far as it goes: nobody acts against a crewmate.",
    betrayal: 1,
  },
];
export const TENSION_CAP = TENSION_LADDER.length - 1;

// ---------------------------------------------------------------------------
// goals and beats
// ---------------------------------------------------------------------------

/**
 * A beat: one concrete thing to do on the next job that moves the goal on.
 * Slots: {npc}, {place}, {home}, {ship}, {employer}, {company}, and a
 * crewmate as {crewmate}, {buddy} or {rival} (any crewmate when the PC has no
 * buddy or rival; an NPC when the PC is alone). A beat that names a crewmate
 * says how it treats them.
 */
export interface Beat {
  text: string;
  stance?: CampaignStance;
  betrayal: CampaignBetrayal;
}

export interface CampaignGoal {
  id: string;
  name: string;
  /** One line for the sheet's personal agenda; the same slots as beats. */
  summary: string;
  allegiances: CampaignAllegiance[];
  motives: CampaignMotive[];
  /** The friction kinds this goal feeds. */
  kinds: FrictionKind[];
  /** How the goal treats the crew. */
  stance: CampaignStance;
  betrayal: CampaignBetrayal;
  beats: Beat[];
  /** Goals that can follow once this one is resolved, by the allegiance it was pursued for ("*": any). */
  followUps: Partial<Record<CampaignAllegiance | "*", string[]>>;
}

const b = (text: string, stance?: CampaignStance): Beat => (stance ? { text, stance, betrayal: 0 } : { text, betrayal: 0 });
const goal = (g: Omit<CampaignGoal, "stance" | "betrayal"> & { stance?: CampaignStance; betrayal?: CampaignBetrayal }): CampaignGoal => ({ stance: "pursue", betrayal: 0, ...g });

export const CAMPAIGN_GOALS: CampaignGoal[] = [
  goal({
    id: "stake",
    name: "A stake in a ship",
    summary: "Save enough to buy a share in a ship of your own.",
    allegiances: ["self", "family"],
    motives: ["ambition", "greed", "pride"],
    kinds: ["resources"],
    beats: [
      b("Take the dirtiest task on this job for the hazard bonus."),
      b("Talk {employer} into paying part of your cut early."),
      b("Find a buyer at {place} for scrap nobody else wanted."),
      b("Work an extra shift on the {ship}'s engines to learn what a share is really worth."),
    ],
    followUps: { self: ["captains-chair", "famous"], family: ["send-for-family"], "*": ["captains-chair"] },
  }),
  goal({
    id: "clear-debt",
    name: "Clear the debt",
    summary: "Pay off an old loan before it follows you onto the crew's books.",
    allegiances: ["self", "family"],
    motives: ["debt", "pride", "guilt"],
    kinds: ["resources", "secrets"],
    beats: [
      b("Set your whole share of this job's pay aside for the lender."),
      b("Pick up side work from {npc} during the stopover."),
      b("Sell something you value at {place}."),
      b("Ask {employer} for an advance against the next job."),
    ],
    followUps: { self: ["stake", "straight-and-narrow"], family: ["send-for-family"], "*": ["stake"] },
  }),
  goal({
    id: "send-for-family",
    name: "Bring the family out",
    summary: "Earn passage for your family to join you at {home}.",
    allegiances: ["family"],
    motives: ["protect", "loyalty", "guilt"],
    kinds: ["resources", "loyalties"],
    beats: [
      b("Find out what passage from the Core really costs at the shipping office in {place}."),
      b("Ask {npc} about a place to live at {home}."),
      b("Work a paid shift instead of taking your shore leave."),
      b("Write home and promise a date you will have to keep."),
    ],
    followUps: { family: ["settle-down", "homesick"], "*": ["settle-down"] },
  }),
  goal({
    id: "settle-down",
    name: "A place to land",
    summary: "Find somewhere at {home} where you could stop flying one day.",
    allegiances: ["family", "self"],
    motives: ["protect", "ambition"],
    kinds: ["resources", "loyalties"],
    beats: [
      b("Look at a berth at {home} you cannot afford yet."),
      b("Make a friend of {npc}, who could put in a word for you."),
      b("Spend your downtime fixing up somewhere that is not the ship."),
      b("Ask the crew for a run that ends near {home}.", "ask"),
    ],
    followUps: { "*": ["stake", "mentor"] },
  }),
  goal({
    id: "captains-chair",
    name: "The captain's chair",
    summary: "Show the crew you could run a job yourself.",
    allegiances: ["self", "crew"],
    motives: ["ambition", "pride"],
    kinds: ["loyalties", "ties"],
    beats: [
      b("Take charge of one part of this job and see it through."),
      b("Make a plan for {place} that the crew actually follows."),
      b("Own a mistake out loud before anyone else points it out."),
      b("Bargain with {employer} on the crew's behalf."),
    ],
    followUps: { crew: ["crew-first", "mentor"], self: ["stake", "famous"], "*": ["crew-first"] },
  }),
  goal({
    id: "crew-first",
    name: "Crew comes first",
    summary: "Keep everyone on this crew paid, fed and together.",
    allegiances: ["crew"],
    motives: ["loyalty", "protect", "guilt"],
    kinds: ["resources", "ties"],
    beats: [
      b("Go without a comfort of your own so {crewmate} does not have to.", "support"),
      b("Talk {crewmate} out of quitting after a bad day.", "persuade"),
      b("Get {employer} to cover the crew's medical bills."),
      b("Settle an argument between two crewmates before it festers."),
    ],
    followUps: { crew: ["captains-chair", "mentor"], "*": ["mentor"] },
  }),
  goal({
    id: "mentor",
    name: "Pass it on",
    summary: "Teach a crewmate what took you years to learn.",
    allegiances: ["crew", "conscience"],
    motives: ["loyalty", "guilt", "pride"],
    kinds: ["ties"],
    beats: [
      b("Let {crewmate} take the lead on a task you could do faster.", "teach"),
      b("Share a know-how of the trade, even if it makes you less needed.", "teach"),
      b("Talk {crewmate} through a hard task step by step, however long it takes.", "teach"),
      b("Vouch for {crewmate} in front of {employer}.", "support"),
    ],
    followUps: { "*": ["crew-first", "settle-down"] },
  }),
  goal({
    id: "union-card",
    name: "Union card",
    summary: "Get the crew's work recognised by the union.",
    allegiances: ["union"],
    motives: ["loyalty", "ambition", "faith"],
    kinds: ["loyalties"],
    beats: [
      b("Log every unpaid hour of this job and keep the receipts."),
      b("Ask {npc} who the union rep at {home} is."),
      b("Refuse an unsafe order from {employer}, politely, and take the heat for it."),
      b("Bring a union flyer aboard and leave it where the crew can see it."),
    ],
    followUps: { union: ["organise", "fair-share"], "*": ["fair-share"] },
  }),
  goal({
    id: "organise",
    name: "Organise the docks",
    summary: "Get the dock workers at {home} to stand together.",
    allegiances: ["union", "conscience"],
    motives: ["loyalty", "faith", "guilt"],
    kinds: ["loyalties"],
    beats: [
      b("Buy a round for the dock crews at {place} and listen."),
      b("Carry a message for {npc} between union halls."),
      b("Turn down a bonus that would undercut the dock workers."),
      b("Speak up at a dock meeting with your own name attached."),
    ],
    followUps: { "*": ["fair-share", "union-card"] },
  }),
  goal({
    id: "fair-share",
    name: "Fair shares",
    summary: "Make sure everyone on the crew, not just the loudest, gets an even cut.",
    allegiances: ["conscience", "union", "crew"],
    motives: ["loyalty", "guilt", "faith"],
    kinds: ["resources", "loyalties"],
    beats: [
      b("Keep an honest tally of who did what on this job."),
      b("Argue for an even split even when you did more."),
      b("Ask {employer} for the bonus the crew was promised."),
      b("Give part of your own cut to {crewmate}, who earned it.", "support"),
    ],
    followUps: { "*": ["crew-first", "organise"] },
  }),
  goal({
    id: "company-ladder",
    name: "Up the ladder",
    summary: "Earn a promotion inside {company}.",
    allegiances: ["company", "self"],
    motives: ["ambition", "pride", "greed"],
    kinds: ["loyalties"],
    beats: [
      b("File a report on this job that makes the crew look good and you look better."),
      b("Get noticed by {npc}, who has a say in promotions."),
      b("Finish your part of the job ahead of schedule, at the cost of your sleep."),
      b("Volunteer for the paperwork nobody else wants."),
    ],
    followUps: { company: ["company-clean", "research"], self: ["stake"], "*": ["company-clean"] },
  }),
  goal({
    id: "company-clean",
    name: "A clean record",
    summary: "Keep a spotless record with {company} so the next contract goes to this crew.",
    allegiances: ["company", "crew"],
    motives: ["ambition", "loyalty"],
    kinds: ["loyalties", "resources"],
    beats: [
      b("Keep every log of this job on time and accurate."),
      b("Turn down a shortcut that would save the crew a shift."),
      b("Smooth over a complaint {npc} made about the crew."),
      b("Ask {employer} for a written reference."),
    ],
    followUps: { company: ["company-ladder"], crew: ["crew-first"], "*": ["settle-down"] },
  }),
  goal({
    id: "marshal-badge",
    name: "On the right side",
    summary: "Make a name with the Colonial Marshals as someone they can count on.",
    allegiances: ["marshals", "conscience"],
    motives: ["ambition", "loyalty", "faith"],
    kinds: ["loyalties"],
    beats: [
      b("Report a safety hazard at {place} to the local marshal's office."),
      b("Help {npc} settle a dispute before it turns into a brawl."),
      b("Keep the crew's cargo papers in perfect order for inspection."),
      b("Ask {npc} for a letter of recommendation."),
    ],
    followUps: { marshals: ["right-a-wrong", "fair-share"], "*": ["fair-share"] },
  }),
  goal({
    id: "right-a-wrong",
    name: "Make amends",
    summary: "Make amends to someone at {home} you let down years ago.",
    allegiances: ["conscience", "family"],
    motives: ["guilt", "loyalty"],
    kinds: ["secrets"],
    beats: [
      b("Find {npc} and admit what you did."),
      b("Pay back what you owe, in cash or in work."),
      b("Do the job at {place} the way you should have done it back then."),
      b("Tell {crewmate} the story, and listen to what they say.", "ask"),
    ],
    followUps: { "*": ["mentor", "settle-down"] },
  }),
  goal({
    id: "keep-faith",
    name: "Keep the faith",
    summary: "Hold to your beliefs on a crew that does not share them.",
    allegiances: ["belief"],
    motives: ["faith", "loyalty"],
    kinds: ["loyalties", "secrets"],
    beats: [
      b("Keep your rituals aboard the {ship} even when it costs you sleep."),
      b("Find a fellow believer at {place}."),
      b("Sit with {crewmate} through a bad night, your way.", "support"),
      b("Give part of your pay to the mission at {home}."),
    ],
    followUps: { belief: ["pilgrimage"], "*": ["right-a-wrong"] },
  }),
  goal({
    id: "pilgrimage",
    name: "A long way to go",
    summary: "Reach a place your faith speaks of, somewhere along the crew's routes.",
    allegiances: ["belief", "self"],
    motives: ["faith", "curiosity"],
    kinds: ["resources"],
    beats: [
      b("Ask the crew to route the {ship} past {place}.", "ask"),
      b("Trade away your downtime for a day's detour."),
      b("Pay {npc} for a chart of the old routes."),
      b("Carry an offering on this job that takes up your own gear space."),
    ],
    followUps: { "*": ["keep-faith", "settle-down"] },
  }),
  goal({
    id: "famous",
    name: "Make a name",
    summary: "Be the one people at {home} tell stories about.",
    allegiances: ["self"],
    motives: ["pride", "ambition"],
    kinds: ["ties"],
    beats: [
      b("Take the riskiest part of this job and make sure people hear about it."),
      b("Beat {rival} at something the crew will remember.", "outdo"),
      b("Get {npc} to tell your story at the bar."),
      b("Bring back a souvenir from {place} worth bragging about."),
    ],
    followUps: { self: ["captains-chair", "stake"], "*": ["captains-chair"] },
  }),
  goal({
    id: "old-crew",
    name: "Old crew, old ghosts",
    summary: "Find out what became of your last crew.",
    allegiances: ["conscience", "crew"],
    motives: ["guilt", "curiosity", "loyalty"],
    kinds: ["secrets"],
    beats: [
      b("Ask {npc} what they heard about your old ship."),
      b("Check the registry at {place} for your old crewmates."),
      b("Spend your share on a message to the last port they called at."),
      b("Tell {crewmate} why it matters to you.", "ask"),
    ],
    followUps: { "*": ["right-a-wrong", "crew-first"] },
  }),
  goal({
    id: "straight-and-narrow",
    name: "Stay straight",
    summary: "Stay clear of the habits that sank you before.",
    allegiances: ["self", "conscience"],
    motives: ["guilt", "pride"],
    kinds: ["secrets"],
    beats: [
      b("Walk past the card tables at {place}."),
      b("Ask {buddy} to keep you honest this trip.", "ask"),
      b("Spend your shore leave doing something dull and safe."),
      b("Pay a bill you would rather forget."),
    ],
    followUps: { "*": ["clear-debt", "settle-down"] },
  }),
  goal({
    id: "learn-trade",
    name: "A second trade",
    summary: "Qualify in a second trade so you are never out of work.",
    allegiances: ["self", "crew"],
    motives: ["ambition", "curiosity"],
    kinds: ["resources", "ties"],
    beats: [
      b("Shadow {crewmate} at their work and ask too many questions.", "ask"),
      b("Spend your cut on a course at {home}."),
      b("Take on a task you are not trained for, with someone who is watching over you."),
      b("Borrow a manual from {npc} and keep it in good shape."),
    ],
    followUps: { "*": ["stake", "mentor"] },
  }),
  goal({
    id: "prove-them-wrong",
    name: "Prove them wrong",
    summary: "Show the people who doubted you that you were worth hiring.",
    allegiances: ["self", "family"],
    motives: ["pride", "ambition"],
    kinds: ["ties"],
    beats: [
      b("Finish your part of this job without anyone's help."),
      b("Send {npc} proof of a job well done."),
      b("Out-work {rival} on the hardest task.", "outdo"),
      b("Get a word of praise from {employer} on the record."),
    ],
    followUps: { "*": ["famous", "captains-chair"] },
  }),
  goal({
    id: "homesick",
    name: "A promise home",
    summary: "Keep a promise to someone back home.",
    allegiances: ["family"],
    motives: ["protect", "loyalty", "guilt"],
    kinds: ["secrets", "resources"],
    beats: [
      b("Buy the thing you promised at {place}, even though it eats your pay."),
      b("Call home from {home}, whatever the comms time costs."),
      b("Ask {npc} to carry a parcel on the next ship out."),
      b("Turn down a long contract that would keep you away too long."),
    ],
    followUps: { family: ["send-for-family"], "*": ["settle-down"] },
  }),
  goal({
    id: "do-it-right",
    name: "Do it right",
    summary: "Keep the {ship} safe and up to standard, even when it slows the crew down.",
    allegiances: ["conscience", "crew", "union"],
    motives: ["guilt", "loyalty", "pride"],
    kinds: ["loyalties", "resources"],
    beats: [
      b("Spend the spare parts money on the repair nobody wants to pay for."),
      b("Hold the {ship} at {place} an extra shift to fix it properly."),
      b("Argue {employer} into paying for a safety check."),
      b("Teach {crewmate} the full checklist, the long way.", "teach"),
    ],
    followUps: { union: ["union-card"], "*": ["crew-first", "mentor"] },
  }),
  goal({
    id: "research",
    name: "The paper",
    summary: "Gather enough notes for a study that would make your name.",
    allegiances: ["self", "company", "conscience"],
    motives: ["curiosity", "ambition", "pride"],
    kinds: ["resources", "loyalties"],
    beats: [
      b("Take soil and air readings at {place} on your own time."),
      b("Ask {npc} for access to their records."),
      b("Spend your cut on proper instruments."),
      b("Talk the crew into staying an extra shift at {place}.", "persuade"),
    ],
    followUps: { company: ["company-ladder"], "*": ["famous", "learn-trade"] },
  }),
];

export const CAMPAIGN_GOAL_IDS = CAMPAIGN_GOALS.map((g) => g.id);
export const goalById = (id: string): CampaignGoal | undefined => CAMPAIGN_GOALS.find((g) => g.id === id);

/** Goals that suit a career (they weigh more in the deal). */
export const CAREER_GOALS: Record<string, string[]> = {
  "colonial-marine": ["crew-first", "prove-them-wrong", "old-crew"],
  "colonial-marshal": ["marshal-badge", "fair-share", "right-a-wrong"],
  "company-agent": ["company-ladder", "company-clean", "research"],
  kid: ["famous", "prove-them-wrong", "learn-trade"],
  medic: ["crew-first", "research", "right-a-wrong"],
  officer: ["captains-chair", "crew-first", "company-clean"],
  pilot: ["stake", "captains-chair", "famous"],
  roughneck: ["stake", "union-card", "do-it-right"],
  scientist: ["research", "learn-trade", "pilgrimage"],
};

/** The candidates for the goal after `goalId`, pursued for `allegiance`. */
export function followUpsOf(goalId: string, allegiance: CampaignAllegiance): string[] {
  const g = goalById(goalId);
  if (!g) return [];
  return [...new Set([...(g.followUps[allegiance] ?? []), ...(g.followUps["*"] ?? [])])].filter((id) => id !== goalId && !!goalById(id));
}

// ---------------------------------------------------------------------------
// what a beat costs, what crews compete for, embarrassing secrets
// ---------------------------------------------------------------------------

/** What pursuing a beat costs the PC: their own time, pay, comfort or pride, never a crewmate's. */
export const BEAT_COSTS: string[] = [
  "It costs you your share of the downtime.",
  "It eats into your own cut of the pay.",
  "You will owe someone a favour afterwards.",
  "You take the long shift to make room for it.",
  "You put your own reputation on the line.",
  "You give up something you were saving for.",
  "You have to ask for help, and you hate asking.",
  "It means admitting you were wrong about something.",
  "You go without sleep to fit it in.",
  "It puts you at odds with someone you like.",
  "You carry the blame yourself if it goes badly.",
  "It costs you a comfort: your bunk, your coffee or your quiet hour.",
];

/** What crewmates compete for. `{employer}` is the job's employer. */
export const CONTESTED_THINGS: string[] = [
  "the next payout",
  "the pick of the next port",
  "the last full medkit",
  "the next shore leave",
  "the good bunk",
  "the spare parts budget",
  "the bonus {employer} promised",
  "the best gear in the locker",
  "comms time to call home",
  "the salvage from this job",
  "the pilot's seat on the next leg",
  "the last real coffee in the galley",
];

export interface EmbarrassingSecret {
  id: string;
  /** GM-only: the secret itself. */
  text: string;
  /** Player-visible: what the friction line names; says nothing of the secret. */
  topic: string;
  /** Whom it would put in danger if found out: always nobody. */
  endangers: false;
  betrayal: CampaignBetrayal;
}

const secret = (id: string, text: string, topic: string): EmbarrassingSecret => ({ id, text, topic, endangers: false, betrayal: 0 });

/** Debts and past mistakes that sting if found out and endanger no one. */
export const EMBARRASSING_SECRETS: EmbarrassingSecret[] = [
  secret("cards", "You lost a month's pay at cards on your last shore leave and still owe the dealer.", "card games"),
  secret("let-go", "Your last crew let you go after you slept through a quiet watch. Nothing came of it, but you tell everyone you quit.", "changing ships"),
  secret("officer", "Your family thinks you are a ship's officer, and you have never corrected them.", "letters home"),
  secret("exams", "You failed your certification twice before you passed.", "training days"),
  secret("old-loan", "You still owe an old crewmate money and have been dodging their calls.", "old friends"),
  secret("poems", "You write love poems under a pen name, and a station newsletter printed one.", "poetry"),
  secret("desk-job", "You once applied for a desk job with the Company and were turned down.", "office work"),
  secret("night-light", "You cannot sleep without a light on.", "lights-out"),
  secret("credit", "You took the credit for a repair someone else did on your last ship.", "old repairs"),
  secret("earth", "You have never set foot on Earth, though you talk as if you grew up there.", "growing up"),
  secret("boots", "You are still paying off your good boots on credit.", "fashion"),
  secret("paint", "You scraped the paint on the shuttle last month and never owned up.", "the shuttle's paint job"),
];
export const secretById = (id: string): EmbarrassingSecret | undefined => EMBARRASSING_SECRETS.find((s) => s.id === id);

// ---------------------------------------------------------------------------
// friction lines
// ---------------------------------------------------------------------------

/**
 * One friction line between two people. `a` is the line as the first PC's
 * handout reads it, `b` as the second's (absent: `a` with the names swapped).
 * Slots: {other} the other party, {thing} something to compete over,
 * {mine} and {theirs} each side's allegiance, {topic} the first PC's secret
 * topic, {employer}. `with`: "pc" between two PCs, "outsider" with an NPC or
 * the employer (a lone PC, or a party with room for more), "any" either.
 */
export interface FrictionTemplate {
  id: string;
  kind: FrictionKind;
  stance: CampaignStance;
  betrayal: CampaignBetrayal;
  with: "pc" | "outsider" | "any";
  /** A buddy or rival link between the two PCs, or different allegiances. */
  needs?: "buddy" | "rival" | "different-allegiance";
  a: string;
  b?: string;
}

const line = (t: Omit<FrictionTemplate, "betrayal"> & { betrayal?: CampaignBetrayal }): FrictionTemplate => ({ betrayal: 0, ...t });

export const FRICTION_TEMPLATES: FrictionTemplate[] = [
  // competing for resources
  line({ id: "want-different", kind: "resources", stance: "compete", with: "any", a: "You and {other} want different things from {thing}." }),
  line({ id: "room-for-one", kind: "resources", stance: "compete", with: "pc", a: "You and {other} both have plans for {thing}, and there is only room for one." }),
  line({ id: "who-first", kind: "resources", stance: "compete", with: "pc", a: "You and {other} argue over who gets {thing} first." }),
  line({ id: "earned-it", kind: "resources", stance: "compete", with: "pc", a: "You think you earned {thing}; {other} thinks it is their turn.", b: "{other} thinks they earned {thing}; you think it is your turn." }),
  line({ id: "tally", kind: "resources", stance: "compete", with: "pc", a: "You and {other} keep a running tally over {thing}, and the two tallies never agree." }),
  line({ id: "owed", kind: "resources", stance: "disagree", with: "outsider", a: "You and {other} disagree about what you are owed from {thing}." }),
  // clashing loyalties
  line({
    id: "answers-to",
    kind: "loyalties",
    stance: "disagree",
    with: "pc",
    needs: "different-allegiance",
    a: "You and {other} disagree about who the crew answers to: you lean towards {mine}, they lean towards {theirs}.",
  }),
  line({
    id: "orders",
    kind: "loyalties",
    stance: "disagree",
    with: "pc",
    a: "When {employer} gives an order, you want to follow it; {other} wants to question it first.",
    b: "When {employer} gives an order, you want to question it first; {other} just wants to follow it.",
  }),
  line({ id: "what-we-owe", kind: "loyalties", stance: "disagree", with: "pc", a: "You and {other} argue about what the crew owes {employer}, and what {employer} owes the crew." }),
  line({ id: "turn-down", kind: "loyalties", stance: "disagree", with: "pc", a: "You and {other} disagree about which jobs a decent crew should turn down." }),
  line({ id: "who-you-work-for", kind: "loyalties", stance: "disagree", with: "outsider", a: "You and {other} disagree about who you really work for." }),
  // embarrassing secrets (the first PC's)
  line({ id: "keeps-asking", kind: "secrets", stance: "sting", with: "pc", a: "{other} keeps asking about {topic}; you would rather they let it go.", b: "{other} goes quiet whenever {topic} comes up, and you are curious." }),
  line({ id: "jokes", kind: "secrets", stance: "needle", with: "pc", a: "{other} has started joking about {topic}, and the jokes sting.", b: "Your jokes about {topic} get under {other}'s skin more than you expected." }),
  line({ id: "changes-subject", kind: "secrets", stance: "sting", with: "pc", a: "You would rather nobody brought up {topic}; {other} brings it up a lot.", b: "{other} changes the subject whenever {topic} comes up; you have noticed." }),
  line({ id: "squirm", kind: "secrets", stance: "sting", with: "outsider", a: "{other} keeps mentioning {topic} in front of the crew, and it makes you squirm." }),
  // buddy and rival
  line({ id: "keep-score", kind: "ties", stance: "compete", with: "pc", needs: "rival", a: "You and {other} keep score of who pulls more weight; this job counts." }),
  line({ id: "needle", kind: "ties", stance: "needle", with: "pc", needs: "rival", a: "You and {other} needle each other about every slip, in front of everyone." }),
  line({ id: "asked-first", kind: "ties", stance: "outdo", with: "pc", needs: "rival", a: "You and {other} both want to be the one the crew asks first." }),
  line({ id: "cover", kind: "ties", stance: "cover", with: "pc", needs: "buddy", a: "You cover for {other} when they slip, and it is starting to cost you.", b: "{other} keeps covering for you, and you owe them for it." }),
  line({ id: "back-each-other", kind: "ties", stance: "support", with: "pc", needs: "buddy", a: "You and {other} back each other in every argument, and the rest of the crew has noticed." }),
  line({
    id: "go-without",
    kind: "ties",
    stance: "cover",
    with: "pc",
    needs: "buddy",
    a: "You keep going without so {other} does not have to, and it is wearing thin.",
    b: "{other} keeps going without so you do not have to, and it bothers you.",
  }),
  line({ id: "friendly-rivalry", kind: "ties", stance: "compete", with: "outsider", a: "You and {other} have a rivalry that is mostly friendly, and you mean to win it." }),
];
export const frictionTemplateById = (id: string): FrictionTemplate | undefined => FRICTION_TEMPLATES.find((t) => t.id === id);

/** Where a beat's or line's slots come from when the campaign has none of its own. */
export const FALLBACK_PLACES = ["the dock office", "the port bar", "the cargo exchange", "the shipping office", "the repair yard", "the crew canteen"];
export const FALLBACK_NPCS = ["the dockmaster", "the quartermaster", "the union rep", "the port doctor", "an old friend at the bar", "the cargo broker"];
