import type { PageRef, ReferenceItem, ReferenceList } from "@campaign-forge/module-sdk";

/** Explicit input shape (ReferenceItem's index signature defeats Omit<>). */
export interface CareerInput {
  id: string;
  name: string;
  page: PageRef;
  summary: string;
  keyAttribute: "strength" | "agility" | "wits" | "empathy";
  keySkills: [string, string, string];
  /** Starting cash in W-Y dollars, e.g. "d6 x 100". */
  cash: string;
  /** Career talents in book order (choose one or roll D3). */
  talents: [string, string, string];
  /** Six names (choose or roll D6). */
  names: string[];
  /** Six looks, paraphrased (choose two or roll D6 twice). */
  appearances: string[];
  /** Three personal agendas, paraphrased (choose or roll D3). */
  agendas: string[];
  /** Six gear items (choose two or roll D6 twice). */
  gear: string[];
  /** Three signature items (choose or roll D3). */
  signatureItems: string[];
}

export type CareerItem = CareerInput & ReferenceItem;

const career = (c: CareerInput): CareerItem => ({ ...c });

/**
 * Nine careers (p. 31-39), checked against the Evolved Edition. Key attributes,
 * key skills, cash, talents, names, gear and signature items are data; summaries,
 * appearances and agendas are short paraphrases.
 */
export const careerItems: CareerItem[] = [
  career({
    id: "colonial-marine",
    name: "Colonial Marine",
    page: 31,
    summary: "A USCMC grunt who signed up young; the shine of the Corps is wearing off.",
    keyAttribute: "strength",
    keySkills: ["closeCombat", "stamina", "rangedCombat"],
    cash: "d6 x 100",
    talents: ["banter", "overkill", "precise-shooter"],
    names: ["Marcus Mullaney", "Kimi Diem", "Nik Elson", "Tara Zanelli", "Vic Pasengrau", "Chrissy Lopez"],
    appearances: ["Crew-cut hair", "Tattooed arm", "A visible scar", "Cold stare", "Cocky smirk", "Customised body armor"],
    agendas: [
      "Guard your reputation as a decorated hero, whatever it costs.",
      "Keep a war-crime cover-up you took part in buried for good.",
      "Your buddy's death left you secretly afraid of a fight; conquer that fear.",
    ],
    gear: ["M41A Pulse Rifle", "M56A2 Smart Gun", "M314 Motion Tracker", "Two G2 Electroshock Grenades", "IRC MK.35 Pressure Suit", "M3 Personnel Armor"],
    signatureItems: ["Bullet that you survived", "Lost friend's dog tags", "Trophy from a defeated enemy"],
  }),
  career({
    id: "colonial-marshal",
    name: "Colonial Marshal",
    page: 32,
    summary: "An incorruptible frontier lawman with enemies on both sides of the law.",
    keyAttribute: "wits",
    keySkills: ["observation", "rangedCombat", "command"],
    cash: "d6 x 200",
    talents: ["authority", "investigator", "subdue"],
    names: ["Jack Kitani", "Akira Kano", "Barrell Klein", "Angela Harris", "Ivan Mankov", "Lee-Ann Jenkins"],
    appearances: ["Cigarette dangling from the lips", "Big, showy mustache", "Unshaven and worn out", "Hair going grey", "Searching, curious look", "Battered leather jacket"],
    agendas: [
      "Your old partner sold out to a crime syndicate; settle the score.",
      "Work toward handing in the badge for a quiet life.",
      "A past wrong has caught up with you; learn what you are made of.",
    ],
    gear: [".357 Magnum Revolver", "Armat Model 37A2 12-Gauge Pump-Action", "Hi-beam flashlight", "Personal medkit", "Stun baton", "D6 doses Neversleep pills"],
    signatureItems: ["Photo of a loved one", "Dented flask with an inscription", "Worn cap"],
  }),
  career({
    id: "company-agent",
    name: "Company Agent",
    page: 33,
    summary: "A hungry corporate climber sent to the Frontier to find the next big score.",
    keyAttribute: "wits",
    keySkills: ["comtech", "observation", "manipulation"],
    cash: "d6 x 1000",
    talents: ["company-resources", "cunning", "personal-safety"],
    names: ["Conrad Schmidt", "Michiko Nogumi", "Alexander Balconi", "Sheridan Lamara", "Ryan Middlebrook", "Mercedes Prince"],
    appearances: ["Frosty stare", "Charming smile", "Uncalloused hands", "Costly tailored suit", "Elaborate hairdo", "Silk tie with a monogram"],
    agendas: [
      "You crave power and grab every chance to get ahead.",
      "The Company is keeping something from you; find out what, and why.",
      "Decent at heart, you are blackmailed into the Company's dirty work; turn the tables.",
    ],
    gear: ["Leather briefcase", "Comm unit", "Samani E-Series Watch", "Data transmitter card with corporate clearance level", "VP-70MA6 Service Pistol", "D6 doses Naproleve"],
    signatureItems: ["Personalized business card", "Rolex watch", "Gold-plated pen"],
  }),
  career({
    id: "kid",
    name: "Kid",
    page: 34,
    summary: "A frontier child who never asked for this life and makes fun out of nothing.",
    keyAttribute: "agility",
    keySkills: ["mobility", "survival", "observation"],
    cash: "d6 x 10",
    talents: ["hard-to-catch", "lucky", "nimble"],
    names: ["Chip Harrington", "Meggie Wu", "Hugo Turner", "Maisie Kelly", "Jakey Myers", "Becca David"],
    appearances: ["Dirty and scruffy", "Light-up sneakers", "Band T-shirt", "Hair in a ponytail", "Bored look", "Ball cap"],
    agendas: [
      "Find a grown-up you can truly trust.",
      "Your family is gone; make sure you are never left alone again.",
      "Nobody gives you anything to do, so explore and make your own fun.",
    ],
    gear: ["Laser pointer", "Radio-controlled car", "Yo-yo", "Electronic handheld game", "Personal locator beacon", "Coloring pens"],
    signatureItems: ["Lunchbox covered in stickers", "Favorite doll or action figure", "Bracelet made by older sibling"],
  }),
  career({
    id: "medic",
    name: "Medic",
    page: 35,
    summary: "The one with the bandages and adrenaline shots, jaded by frontier medicine.",
    keyAttribute: "empathy",
    keySkills: ["mobility", "observation", "medicalAid"],
    cash: "d6 x 200",
    talents: ["field-medic", "nurse", "surgeon"],
    names: ["Cho Hadfield", "Ana Kasnavik", "Ken Ibana", "Juno Blanchard", "Sullivan Ward", "Katie Aberly"],
    appearances: ["Kind, sympathetic smile", "Dark rings under the eyes", "Soft, calming voice", "Cold, clinical stare", "Glasses", "White coat, clean or not"],
    agendas: [
      "Hide your dependence on a strong painkiller and guard your supply.",
      "You hold classified medical files the Company wants; learn why they matter.",
      "You swore never to take a life, and you hold to it.",
    ],
    gear: ["Surgical kit", "IRC MK.50 Compression Suit", "D6 doses Naproleve", "D6 doses Neversleep", "Personal medkit", "Samani E-Series Watch"],
    signatureItems: ["Framed medical certificate", "Letter from son or daughter", "Last psych evaluation: \"All clear at last\""],
  }),
  career({
    id: "officer",
    name: "Officer",
    page: 36,
    summary: "The authority figure and crew advocate everyone mocks until things go wrong.",
    keyAttribute: "empathy",
    keySkills: ["rangedCombat", "command", "manipulation"],
    cash: "d6 x 300",
    talents: ["field-commander", "frontline-leader", "pull-rank"],
    names: ["Eugene Proctor", "Wendy Stern", "Oliver Bryant", "Julia Kwang", "Lloyd T. Darrington", "Camille Kirschner"],
    appearances: ["Crew cut or hair tied back", "Intense, serious face", "Immaculate uniform", "Rigid posture", "Calm, soothing voice", "Foot tapping impatiently"],
    agendas: [
      "You come from a line of officers and need a promotion or decoration soon.",
      "After a past failure, dodge the blame for any more mission mistakes.",
      "Mistakes kill; keep your people from screwing up and make them see why.",
    ],
    gear: ["M4A3 Service Pistol", "Rexim RXF-M5 EVA Pistol", "Samani E-Series Watch", "M314 Motion Tracker", "IRC MK.50 Compression Suit", "Seegson P-DAT"],
    signatureItems: ["Ship's cat", "Letter of recommendation", "ICC Commercial Flight Officer license"],
  }),
  career({
    id: "pilot",
    name: "Pilot",
    page: 37,
    summary: "A thrill-seeking flyer who will take any craft anywhere for the rush.",
    keyAttribute: "agility",
    keySkills: ["piloting", "rangedCombat", "comtech"],
    cash: "d6 x 200",
    talents: ["full-throttle", "like-the-back-of-your-hand", "reckless"],
    names: ["Casper Edmonton", "Fiona O'Neill", "Sven Stackman", "Constance Navona", "Kiel Avari", "Igraine Turner"],
    appearances: ["Swaggering walk", "Steely blue eyes", "Flight suit full of pockets", "Mirrored shades", "Deadpan face", "Always chewing gum"],
    agendas: [
      "Push the limits: when there is a risk to take, take it.",
      "Stubborn to a fault, you won't back down even if friends get hurt.",
      "A loner, you would rather do the job without leaning on anyone.",
    ],
    gear: ["M4A3 Service Pistol", "PR-PUT Uplink Terminal", "Hand radio", "Maintenance jack", "Seegson System Diagnostic Device", "IRC MK.50 Compression Suit"],
    signatureItems: ["Dashboard dancer", "Pilot's logbook", "Pilot shades"],
  }),
  career({
    id: "roughneck",
    name: "Roughneck",
    page: 38,
    summary: "The hard-working, hard-partying manual laborer who keeps the Frontier running.",
    keyAttribute: "strength",
    keySkills: ["heavyMachinery", "stamina", "closeCombat"],
    cash: "d6 x 100",
    talents: ["resilient", "steady-hands", "true-grit"],
    names: ["Mac Masterton", "Sassy Diaz", "Kip Tranter", "Kat Longridge", "Charlie Stead", "Jayden Pace"],
    appearances: ["Inked skin", "Booming laugh", "Bruised, callused hands", "Eyes behind safety goggles", "Dirty, loud boots", "Untamed hair"],
    agendas: [
      "A compulsive thrill-seeker, you step up for every risk on offer.",
      "You gave up your family for the job; now you never let friends down.",
      "Downtime is what counts: a cold Aspen beer and some peace and you're content.",
    ],
    gear: ["Cutting torch", "Watatsumi DV-303 Bolt Gun", "D6 doses Hydr8tion", "Maintenance jack", "IRC MK.50 Compression Suit", "Hi-beam flashlight"],
    signatureItems: ["Tool belt", "Photo of partner", "Crucifix or other religious symbol"],
  }),
  career({
    id: "scientist",
    name: "Scientist",
    page: 39,
    summary: "A researcher one thesis from recognition, driven by knowledge above people.",
    keyAttribute: "wits",
    keySkills: ["observation", "survival", "comtech"],
    cash: "d6 x 300",
    talents: ["analysis", "inquisitive", "xenomorphology"],
    names: ["Viggo Kowalski", "Elena Sanchez", "Drew Lancaster", "Louise Mallory", "Travis Torrence", "Karima Yusef"],
    appearances: ["Messy, untidy look", "Lab coat with stains", "Jittery manner", "Pensive gaze", "Clears throat before talking", "Tired, overworked eyes"],
    agendas: [
      "Your last project was stolen; now you keep many findings to yourself.",
      "You despise authority and obstruct it whenever you can.",
      "You struggle to delegate, even when it means taking on extra work.",
    ],
    gear: ["Digital video camera", "Seegson P-DAT", "Seegson System Diagnostic Device", "Personal Data Transmitter", "M314 Motion Tracker", "Personal medkit"],
    signatureItems: ["Albert Einstein Award", "Unfinished scientific paper", "Blackmail letters"],
  }),
];

export const careers: ReferenceList = {
  id: "alien.careers",
  name: "Careers",
  page: [31, 39],
  itemSchema: {
    type: "object",
    required: ["id", "name", "keyAttribute", "keySkills", "cash", "talents"],
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      keyAttribute: { type: "string", enum: ["strength", "agility", "wits", "empathy"] },
      keySkills: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 3 },
      cash: { type: "string", description: "Starting cash formula in W-Y dollars, e.g. 'd6 x 100'." },
      talents: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 3 },
      names: { type: "array", items: { type: "string" } },
      appearances: { type: "array", items: { type: "string" } },
      agendas: { type: "array", items: { type: "string" } },
      gear: { type: "array", items: { type: "string" } },
      signatureItems: { type: "array", items: { type: "string" } },
      page: { type: ["integer", "array"] },
      unverified: { type: "boolean" },
    },
  },
  items: careerItems,
};
