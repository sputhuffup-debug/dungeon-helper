/**
 * Life Path tables (appendix, p. 282-289), checked against the Evolved Edition.
 *
 * Dice, ranges, attribute and skill deltas, psych modifiers and bonus rolls are
 * data and match the book; labels and notes are short paraphrases. Every row's
 * result uses the keys the life path procedure folds into a running total:
 * `attributes`, `skills` (both { id: delta }), `psych` (modifier to the final
 * psych evaluation roll) plus a few row-specific extras (`cashRoll`,
 * `bonusGearRolls`, `generalSkills`, `careerEnded`, `notes`).
 */
import type { RollTable } from "@campaign-forge/module-sdk";
import { d6, d66Grouped, defineTable, ranges, sequence, type RowSpec } from "./_helpers";

const FAMILY = "lifepath";

/** `defineTable` flags tables unverified; everything here was checked against the book. */
function verified(table: RollTable): RollTable {
  const { unverified: _t, ...rest } = table;
  return {
    ...rest,
    rows: rest.rows.map((r) => {
      const { unverified: _r, ...row } = r;
      return row;
    }),
  };
}

function lifepathTable(spec: Omit<Parameters<typeof defineTable>[0], "family">): RollTable {
  return verified(defineTable({ ...spec, family: FAMILY }));
}

export type Attr = "strength" | "agility" | "wits" | "empathy";
export type Skill =
  | "heavyMachinery" | "closeCombat" | "stamina" | "rangedCombat" | "mobility" | "piloting"
  | "observation" | "survival" | "comtech" | "manipulation" | "command" | "medicalAid";

const plus = (...ids: string[]): Record<string, number> => Object.fromEntries(ids.map((id) => [id, 1]));

// ---------------------------------------------------------------------------
// Step 1: human or android (p. 282)
// ---------------------------------------------------------------------------

export const humanOrAndroid: RollTable = lifepathTable({
  id: "alien.lifepath.human-or-android",
  name: "Human or android",
  page: 282,
  dice: "2d6",
  notes: "11 or 12 makes the PC an android; agree with the GM whether it is a secret android (p. 25). Androids add +3 to two attributes before the life path.",
  rows: ranges([
    [2, 10, "Human", { android: false }],
    [11, 12, "Android", { android: true }],
  ]),
});

// ---------------------------------------------------------------------------
// Step 2: origin (p. 282-283): 2D6 super-nation, then D6 sub-affiliation and D6 home
// ---------------------------------------------------------------------------

type D6Spec = [lo: number, hi: number, label: string, extra?: Record<string, unknown>];

function subTable(id: string, name: string, key: "subAffiliation" | "home", rows: D6Spec[]): RollTable {
  return lifepathTable({
    id,
    name,
    page: 283,
    dice: "1d6",
    rows: ranges(rows.map(([lo, hi, label, extra]) => [lo, hi, label, { [key]: label, ...(extra ?? {}) }] as const)),
  });
}

interface Nation {
  key: string;
  label: string;
  allegiance: string;
  affiliation: D6Spec[];
  home: D6Spec[];
}

const NATIONS: Nation[] = [
  {
    key: "icsc",
    label: "Independent Core System Colonies",
    allegiance: "icsc",
    affiliation: [
      [1, 1, "Central Space Consortium"],
      [2, 2, "Weyland-Yutani"],
      [3, 3, "Hyperdyne Systems"],
      [4, 4, "Jĭngtì Lóng Corporation"],
      [5, 5, "Lockmart"],
      [6, 6, "Minor corporation"],
    ],
    home: [
      [1, 1, "Sol Sector", { region: "core" }],
      [2, 5, "New Eden Sector", { region: "core" }],
      [6, 6, "Frontier colony", { region: "frontier" }],
    ],
  },
  {
    key: "3we",
    label: "Three World Empire",
    allegiance: "3we",
    affiliation: [
      [1, 3, "Weyland-Yutani"],
      [4, 4, "Lasalle Bionational"],
      [5, 5, "Seegson"],
      [6, 6, "Minor corporation"],
    ],
    home: [
      [1, 1, "Sol Sector", { region: "core" }],
      [2, 3, "Core Systems", { region: "core" }],
      [4, 5, "Frontier", { region: "frontier" }],
      [6, 6, "Far Spinward Colonies"],
    ],
  },
  {
    key: "ua",
    label: "United Americas",
    allegiance: "uas",
    affiliation: [
      [1, 3, "Weyland-Yutani"],
      [4, 4, "Lasalle Bionational"],
      [5, 5, "Alphatech Hardware"],
      [6, 6, "Minor corporation"],
    ],
    home: [
      [1, 1, "Sol Sector", { region: "core" }],
      [2, 2, "Outer Veil", { region: "outer-veil" }],
      [3, 3, "Crestus Prime/Borodino/Cerberus Sectors"],
      [4, 4, "Tartarus/Micor Sectors"],
      [5, 5, "Frontier", { region: "frontier" }],
      [6, 6, "Far Reach of the American Arm", { region: "far-reach" }],
    ],
  },
  {
    key: "upp",
    label: "Union of Progressive Peoples",
    allegiance: "upp",
    affiliation: [
      [1, 1, "Space Operating Forces"],
      [2, 2, "UPP Frontier Colony Directorate"],
      [3, 3, "Ministry of Space Security"],
      [4, 4, "Ministry of Public Health"],
      [5, 5, "Cosmos Exploration Corps"],
      [6, 6, "Proletariat"],
    ],
    home: [
      [1, 2, "Outer Veil/Sol Sector"],
      [3, 4, "Outer Rim colony", { region: "outer-rim" }],
      // The table prints "Bau Sau"; the sector is spelled Bao Sau elsewhere (p. 187).
      [5, 5, "Bau Sau Sector"],
      [6, 6, "Frontier", { region: "frontier" }],
    ],
  },
  {
    key: "independent",
    label: "Independents",
    allegiance: "independent",
    affiliation: [
      [1, 1, "Minor corporation"],
      [2, 2, "Weyland-Yutani"],
      [3, 3, "Seegson"],
      [4, 4, "Lasalle Bionational"],
      [5, 5, "United Nations"],
      [6, 6, "None"],
    ],
    home: [
      [1, 1, "Core Systems", { region: "core" }],
      [2, 2, "Rimward Frontier", { region: "frontier" }],
      [3, 3, "Spinward Frontier", { region: "frontier" }],
      [4, 4, "Trailward Frontier", { region: "frontier" }],
      [5, 5, "Coreward Frontier", { region: "frontier" }],
      [6, 6, "Far Spinward Colonies"],
    ],
  },
];

const affiliationId = (n: Nation) => `alien.lifepath.origin.${n.key}.affiliation`;
const homeId = (n: Nation) => `alien.lifepath.origin.${n.key}.home`;

export const originSubTables: RollTable[] = NATIONS.flatMap((n) => [
  subTable(affiliationId(n), `Origin: ${n.label} sub-affiliation`, "subAffiliation", n.affiliation),
  subTable(homeId(n), `Origin: ${n.label} home`, "home", n.home),
]);

const ORIGIN_RANGES: Record<string, [number, number]> = {
  icsc: [2, 4],
  "3we": [5, 6],
  ua: [7, 8],
  upp: [9, 10],
  independent: [11, 12],
};

export const origin: RollTable = lifepathTable({
  id: "alien.lifepath.origin",
  name: "Origin",
  page: 283,
  dice: "2d6",
  notes: "Roll the super-nation, then D6 for the sub-affiliation and D6 for home (nested). Afterwards gain 3 points in random general skills (p. 282).",
  rows: ranges(
    NATIONS.map((n) => {
      const [lo, hi] = ORIGIN_RANGES[n.key]!;
      return [
        lo,
        hi,
        n.label,
        { supernation: n.label, allegiance: n.allegiance },
        {
          roll: [
            { table: affiliationId(n), as: "subAffiliation" },
            { table: homeId(n), as: "home" },
          ],
        },
      ] as const;
    }),
  ),
});

// ---------------------------------------------------------------------------
// Random general skills (p. 286)
// ---------------------------------------------------------------------------

const GENERAL_SKILLS: Skill[] = [
  "closeCombat", "heavyMachinery", "stamina", "mobility", "piloting", "rangedCombat",
  "comtech", "observation", "survival", "command", "manipulation", "medicalAid",
];
const SKILL_LABELS: Record<Skill, string> = {
  heavyMachinery: "Heavy Machinery", closeCombat: "Close Combat", stamina: "Stamina", rangedCombat: "Ranged Combat",
  mobility: "Mobility", piloting: "Piloting", observation: "Observation", survival: "Survival", comtech: "Comtech",
  manipulation: "Manipulation", command: "Command", medicalAid: "Medical Aid",
};

export const generalSkill: RollTable = lifepathTable({
  id: "alien.lifepath.general-skill",
  name: "Random general skill",
  page: 286,
  dice: "d66",
  notes: "Each roll gives +1 to the skill. Re-roll a result that would take a skill above 5 (p. 282).",
  rows: d66Grouped(3, GENERAL_SKILLS.map((s) => ({ label: SKILL_LABELS[s], result: { skill: s, skills: plus(s) } }))),
});

// ---------------------------------------------------------------------------
// Step 3: early life (p. 284): D66 three times, once per column
// ---------------------------------------------------------------------------

const EARLY_WHO: Array<[label: string, a: Attr, b: Attr]> = [
  ["Prisoner, convict or warden", "strength", "wits"],
  ["Space trucker who lived in hypersleep", "agility", "empathy"],
  ["Troublemaker who made their own rules", "wits", "empathy"],
  ["Homeless, scraping by", "strength", "agility"],
  ["Indentured worker bound to masters", "agility", "empathy"],
  ["Refugee fleeing a war zone", "strength", "empathy"],
  ["Adept of a brutal cult", "wits", "empathy"],
  ["Colonist on a backwater world", "agility", "wits"],
  ["Stranded colonist or crew awaiting rescue", "agility", "wits"],
  ["Wildcatter living out of a Daihotai tractor", "strength", "agility"],
  ["Minion at research facilities", "strength", "wits"],
  ["Ward of a wealthy patron", "strength", "empathy"],
];

export const earlyLife: RollTable = lifepathTable({
  id: "alien.lifepath.early-life",
  name: "Early life: you were",
  page: 284,
  dice: "d66",
  notes: "First of three D66 rolls, one per column: +1 to each of two attributes.",
  rows: d66Grouped(3, EARLY_WHO.map(([label, a, b]) => ({ label, result: { attributes: plus(a, b) } }))),
});

const EARLY_COMPANY: string[] = [
  "Parents or siblings",
  "Your closest friends",
  "Dangerous convicts",
  "Strangers",
  "A lover or former lover",
  "A bitter rival or enemy",
  "Embittered indentured workers",
  "Soldiers or paramilitaries",
  "Androids",
  "A very rich benefactor",
  "Desperate or sick people",
  "Nobody",
];

export const earlyLifeCompany: RollTable = lifepathTable({
  id: "alien.lifepath.early-life.company",
  name: "Early life: in the company of",
  page: 284,
  dice: "d66",
  notes: "Second D66 roll: who shared your early life. Story only, no modifiers.",
  rows: d66Grouped(3, EARLY_COMPANY.map((label) => ({ label, result: { company: label } }))),
});

const EARLY_EXPERIENCE: Array<[label: string, a: Skill, b: Skill, psych: number]> = [
  ["A lucky break that set you up", "heavyMachinery", "mobility", 2],
  ["Kept as a rich patron's plaything", "manipulation", "piloting", 1],
  ["A job you liked, with a way up", "stamina", "survival", 1],
  ["Helping others at real cost to yourself", "medicalAid", "command", 0],
  ["Locked up, guilty or not (or warehoused, for androids)", "closeCombat", "survival", 0],
  ["Forced labor under a cruel boss", "stamina", "observation", 0],
  ["Lonely, underpaid years in deep space", "piloting", "heavyMachinery", 0],
  ["Surviving alone on an abandoned colony", "closeCombat", "comtech", 0],
  ["A low-level overseer sending workers to die", "command", "rangedCombat", 0],
  ["A test subject in painful experiments", "mobility", "comtech", -1],
  ["A no-win choice that cost a life", "rangedCombat", "manipulation", -1],
  ["A research station disaster with escaped specimens", "observation", "medicalAid", -2],
];

export const earlyLifeExperience: RollTable = lifepathTable({
  id: "alien.lifepath.early-life.experience",
  name: "Early life: and experienced",
  page: 284,
  dice: "d66",
  notes: "Third D66 roll: +1 to each of two skills and, on some rows, a modifier to the psych evaluation roll.",
  rows: d66Grouped(
    3,
    EARLY_EXPERIENCE.map(([label, a, b, psych]): RowSpec => ({ label, result: { skills: plus(a, b), ...(psych !== 0 ? { psych } : {}) } })),
  ),
});

// ---------------------------------------------------------------------------
// Step 4: life event (p. 285): D66 in pairs; 2 specified attribute points
// plus 2 random general skills (the procedure rolls those)
// ---------------------------------------------------------------------------

const LIFE_EVENTS: Array<[label: string, a: Attr, b: Attr, extra?: Record<string, unknown>]> = [
  ["A charmed life", "strength", "empathy", { psych: 2, cashRoll: { dice: "2d6", multiplier: 50 }, bonusGearRolls: 1 }],
  ["Got away with a crime", "strength", "wits", { psych: 1 }],
  ["Strings pulled for a specialist school", "strength", "agility", { psych: 1, generalSkills: 1 }],
  ["Caught for a crime, freed by a deal, now in debt", "agility", "wits", { notes: ["In debt to someone"] }],
  ["Read Space Beast; a W-Y exec left a card", "wits", "empathy", { notes: ["Holds a Weyland-Yutani executive's card"] }],
  ["Survived a grave illness; obsessed with grime", "agility", "empathy"],
  ["Survived a bad crash; insists on driving", "strength", "agility"],
  ["Woke from hypersleep to a dead crew", "strength", "wits"],
  ["Stumbled on an official secret", "strength", "empathy"],
  ["Legally scammed someone who wants it back", "wits", "empathy"],
  ["A quake destroyed your home", "agility", "empathy"],
  ["Trapped in an accident; now mildly claustrophobic", "agility", "wits"],
  ["Earned your way out until the quota doubled", "strength", "agility"],
  ["Killed someone, or let them die", "wits", "empathy", { psych: -1 }],
  ["Badly burned in a fire", "strength", "wits", { psych: -1 }],
  ["Someone died saving you in an accident", "agility", "wits", { psych: -1 }],
  ["Betrayed and left to die", "strength", "empathy", { psych: -2 }],
  ["Escaped monsters nobody believes in", "agility", "empathy", { psych: -2 }],
];

export const lifeEvent: RollTable = lifepathTable({
  id: "alien.lifepath.life-event",
  name: "Life event",
  page: 285,
  dice: "d66",
  notes:
    "Two specified attribute points, then 2 random general skills. 11-12 also rolls 2D6×50 W-Y dollars and a bonus career gear roll; 15-16 adds one more random general skill.",
  rows: d66Grouped(2, LIFE_EVENTS.map(([label, a, b, extra]) => ({ label, result: { attributes: plus(a, b), ...(extra ?? {}) } }))),
});

// ---------------------------------------------------------------------------
// Step 5: careers (p. 286): requirements, paycheck and three career skills
// ---------------------------------------------------------------------------

export interface LifepathCareer {
  id: string;
  name: string;
  requirements: Partial<Record<Attr, number>>;
  /** Paycheck is D6 × this many W-Y dollars. */
  paycheck: number;
  skills: [Skill, Skill, Skill];
  /** Kids need no application and serve a single term (p. 286). */
  noApplication?: boolean;
  maxTerms: number;
}

export const LIFEPATH_CAREERS: LifepathCareer[] = [
  { id: "colonial-marine", name: "Colonial Marine", requirements: { strength: 4 }, paycheck: 50, skills: ["closeCombat", "stamina", "rangedCombat"], maxTerms: 3 },
  { id: "colonial-marshal", name: "Colonial Marshal", requirements: { agility: 3, wits: 4 }, paycheck: 100, skills: ["rangedCombat", "observation", "manipulation"], maxTerms: 3 },
  { id: "company-agent", name: "Company Agent", requirements: { wits: 4 }, paycheck: 500, skills: ["comtech", "observation", "manipulation"], maxTerms: 3 },
  { id: "kid", name: "Kid", requirements: {}, paycheck: 5, skills: ["mobility", "observation", "survival"], noApplication: true, maxTerms: 1 },
  { id: "medic", name: "Medic", requirements: { empathy: 4 }, paycheck: 100, skills: ["mobility", "observation", "medicalAid"], maxTerms: 3 },
  { id: "officer", name: "Officer", requirements: { wits: 3, empathy: 4 }, paycheck: 150, skills: ["rangedCombat", "command", "manipulation"], maxTerms: 3 },
  { id: "pilot", name: "Pilot", requirements: { agility: 4 }, paycheck: 100, skills: ["piloting", "rangedCombat", "comtech"], maxTerms: 3 },
  { id: "roughneck", name: "Roughneck", requirements: { strength: 4 }, paycheck: 50, skills: ["closeCombat", "heavyMachinery", "stamina"], maxTerms: 3 },
  { id: "scientist", name: "Scientist", requirements: { wits: 4 }, paycheck: 150, skills: ["comtech", "observation", "survival"], maxTerms: 3 },
];

export const careerSkillTableId = (career: string) => `alien.lifepath.career-skill.${career}`;

export const careerSkillTables: RollTable[] = LIFEPATH_CAREERS.map((c) =>
  lifepathTable({
    id: careerSkillTableId(c.id),
    name: `Career skill: ${c.name}`,
    page: 286,
    dice: "d3",
    tags: ["career-skill", c.id],
    notes: "D3 picks skill 1, 2 or 3 of the career; +1 to that skill. Re-roll if it is already 5.",
    rows: sequence([1, 2, 3], c.skills.map((s) => ({ label: SKILL_LABELS[s], result: { skill: s, skills: plus(s) } }))),
  }),
);

// ---------------------------------------------------------------------------
// Favors and disasters (p. 287)
// ---------------------------------------------------------------------------

export const favors: RollTable = lifepathTable({
  id: "alien.lifepath.favors",
  name: "Favors",
  page: 287,
  dice: "1d6",
  notes: "Gained on a strong application (two or more successes) or a strong term performance. Re-roll favors you already have.",
  rows: d6([
    { label: "Popular", result: { favor: "popular", notes: ["Popular: +1 to Manipulation when dealing with your own organization"] } },
    { label: "Free Rein In The Company Warehouse", result: { favor: "warehouse", bonusGearRolls: 1 } },
    { label: "Generalist Training Program", result: { favor: "generalist", generalSkills: 1, notes: ["Owes someone a favor for a training place"] } },
    { label: "Specialist Training Program", result: { favor: "specialist", careerSkills: 1, notes: ["Owes someone a favor for a training place"] } },
    { label: "Bonus", result: { favor: "bonus", bonusPaychecks: 1, notes: ["A bonus that made colleagues envious"] } },
    { label: "New Friend", result: { favor: "new-friend", notes: ["Someone owes you a favor, if they can be trusted"] } },
  ]),
});

export const disasters: RollTable = lifepathTable({
  id: "alien.lifepath.disasters",
  name: "Disasters",
  page: 287,
  dice: "1d6",
  notes: "Suffered on a failed term performance, along with −1 on the psych evaluation roll. Sacked or stitched up means the career ends.",
  rows: d6([
    { label: "Injured", result: { disaster: "injured", loseAttribute: ["strength", "agility"] } },
    { label: "Trauma", result: { disaster: "trauma", loseAttribute: ["wits", "empathy"] } },
    { label: "Lost Something", result: { disaster: "lost-something", loseRandomItem: true } },
    { label: "Misfortune", result: { disaster: "misfortune", notes: ["Branded a Jonah after a death blamed on you"] } },
    { label: "Nemesis", result: { disaster: "nemesis", careerEnded: true, notes: ["A rival had you sacked"] } },
    { label: "Sacked", result: { disaster: "sacked", careerEnded: true, notes: ["Contract canceled for negligence or incompetence"] } },
  ]),
});

// ---------------------------------------------------------------------------
// Career postings (p. 288-289): one D6 per term; 5-6 give a bonus gear roll
// ---------------------------------------------------------------------------

type Posting = [name: string, note: string];
const POSTINGS: Record<string, Posting[]> = {
  "colonial-marine": [
    ["Garrison Duty", "Dull but safe."],
    ["Colonial Defense", "A risky bug hunt nobody wants."],
    ["Peacekeeping", "Winning over the locals."],
    ["Population Control", "Breaking up riots and strikes."],
    ["Assault Operations", "Fast raids and orbital strikes."],
    ["Combat Operations", "Front-line fighting."],
  ],
  "colonial-marshal": [
    ["Backwater Posting", "Nothing worth investigating."],
    ["Frontier Policing", "Drunks and bar fights."],
    ["Authority's Stooge", "Doing the company's dirty work."],
    ["Lawless Frontier", "Alone against gangs and rackets."],
    ["Big Colony Beat", "Thankless, dangerous city policing."],
    ["Roving Marshal", "Chasing the big cases."],
  ],
  "company-agent": [
    ["Filing", "Grim work, but the files hold secrets."],
    ["Seconded", "A dead-end errand job."],
    ["Recruitment", "Awful work, but you know everyone."],
    ["Exec Without Portfolio", "Free to chase the next big thing."],
    ["Special Ops", "Secret facilities and weapons work."],
    ["Troubleshooter", "Surprise inspections and power."],
  ],
  kid: [
    ["Bad Kid", "Time in juvenile detention."],
    ["Troubled Kid", "Bored, unpopular troublemaker."],
    ["Put To Work", "Stuck in a miserable job."],
    ["School's Out", "Classes by day, wild after."],
    ["Permanent Vacation", "Free to do as you please."],
    ["On Your Own", "Unwatched, finding all sorts of things."],
  ],
  medic: [
    ["Disaster Relief", "Always arriving too late."],
    ["Bad Side Of Town", "Unwelcome help in a rough place."],
    ["Lawless Frontier", "Patching gunshots and stabbings."],
    ["Training School", "Teaching students who do not care."],
    ["Military", "Keeping grunts alive in the field."],
    ["Industrial Paramedic", "Keeping workers alive and working."],
  ],
  officer: [
    ["Security Detail", "A punishment posting."],
    ["Prison Detail", "Making convicts productive."],
    ["Colony Teams", "Unpopular frontier fixer."],
    ["Tough Decisions", "Getting it done at a cost in lives."],
    ["Cool Head", "Leading survivors until rescue."],
    ["Big Boss", "Running a big, dangerous frontier crew."],
  ],
  pilot: [
    ["Dusting Crops", "Bad work, bad place, no future."],
    ["Cargo Hauling", "Short hauls of everyday goods."],
    ["Smuggler", "Pays well while you stay uncaught."],
    ["Space Truckers", "Respected haulage, poor pay."],
    ["Military", "Dropships and nukes."],
    ["Chauffeur", "Flying the rich and powerful."],
  ],
  roughneck: [
    ["Colony Miner", "Dark, toxic, but steady work."],
    ["Lawless Colony", "Endless repairs and all the blame."],
    ["Stevedore", "Moving cargo, blamed when it goes missing."],
    ["Wrecking Crew", "Salvage pays better than wages."],
    ["Hauler Engineer", "Decent pay, mostly asleep."],
    ["Big Colony Maintenance", "Keeping the lights and air on."],
  ],
  scientist: [
    ["Backwater Lab", "The lab tech who cleans up."],
    ["Lawless Colony", "Good title, terrible colony."],
    ["Headhunted", "A secret project, then fired."],
    ["Science Officer", "Decent pay aboard a hauler."],
    ["Pristine Lab", "Top facilities, real progress."],
    ["Field Research", "A well-funded field team."],
  ],
};

export const postingTableId = (career: string) => `alien.lifepath.posting.${career}`;

export const postingTables: RollTable[] = Object.entries(POSTINGS).map(([career, rows]) =>
  lifepathTable({
    id: postingTableId(career),
    name: `Posting: ${LIFEPATH_CAREERS.find((c) => c.id === career)!.name}`,
    page: [288, 289],
    dice: "1d6",
    tags: ["posting", career],
    notes: "Each term: roll the posting, then gain 1 point in a random career skill. Results 5-6 add a bonus career gear roll.",
    rows: d6(rows.map(([name, note], i) => ({ label: name, result: { career, note, ...(i >= 4 ? { bonusGearRolls: 1 } : {}) } }))),
  }),
);

// ---------------------------------------------------------------------------
// Psych evaluation (p. 288-289): 2D6 plus the modifiers gathered on the way
// ---------------------------------------------------------------------------

export const psychEvaluation: RollTable = lifepathTable({
  id: "alien.lifepath.psych-evaluation",
  name: "Psych evaluation",
  page: [288, 289],
  dice: "2d6",
  notes: "Add every psych modifier from the life path; low is unstable, high is over-eager. Androids roll it as a cognitive stability test. Roleplay the result.",
  rows: ranges([
    [-99, 0, "Dangerous and volatile, prone to psychotic outbursts", { rating: "dangerous" }],
    [1, 1, "Flashbacks and hallucinations; unpredictable", { rating: "unhinged" }],
    [2, 2, "Defensive and quick to anger; hard to trust", { rating: "defensive" }],
    [3, 4, "Nightmares and outbursts; moody and self-pitying", { rating: "troubled" }],
    [5, 6, "Mild trauma and nerves; a complainer", { rating: "mild-trauma" }],
    [7, 8, "Well balanced; a good worker", { rating: "balanced" }],
    [9, 10, "Positive and compliant", { rating: "compliant" }],
    [11, 12, "Invested and ambitious; promotion material", { rating: "invested" }],
    [13, 13, "Overconfident and eager to please; what are they hiding?", { rating: "overeager" }],
    [14, 99, "Fanatically loyal to authority; possible mood drugs; monitor", { rating: "fanatical" }],
  ]),
});

export const lifepathTables: RollTable[] = [
  humanOrAndroid,
  origin,
  ...originSubTables,
  generalSkill,
  earlyLife,
  earlyLifeCompany,
  earlyLifeExperience,
  lifeEvent,
  ...careerSkillTables,
  favors,
  disasters,
  ...postingTables,
  psychEvaluation,
];
