import type { PageRef, ReferenceItem, ReferenceList } from "@campaign-forge/module-sdk";

/** Explicit input shape (ReferenceItem's index signature defeats Omit<>). */
export interface CareerInput {
  id: string;
  name: string;
  page: PageRef;
  summary: string;
  keyAttribute: "strength" | "agility" | "wits" | "empathy";
  keySkills: [string, string, string];
  cash: string;
  talents: [string, string, string];
  names: string[];
  appearances: string[];
  agendas: string[];
  gear: string[];
  signatureItems: string[];
}

export type CareerItem = CareerInput & ReferenceItem & { unverified: true };

const career = (c: CareerInput): CareerItem => ({ ...c, unverified: true });

/**
 * Nine careers (p. 31-39). Every pick list is written from general knowledge of the
 * game and is flagged unverified until checked against the Evolved Edition.
 */
export const careerItems: CareerItem[] = [
  career({
    id: "colonial-marine",
    name: "Colonial Marine",
    page: 32,
    summary: "A grunt of the Colonial Marine Corps: trained, armed and expendable.",
    keyAttribute: "strength",
    keySkills: ["closeCombat", "stamina", "rangedCombat"],
    cash: "d6 x 100",
    talents: ["banter", "overkill", "past-the-limit"],
    names: ["Hicks", "Vasquez", "Drake", "Frost", "Wierzbowski", "Apone"],
    appearances: ["Buzz cut and a cigar", "Tattooed forearms", "Scar across one eyebrow", "Sleeves rolled, dog tags out", "Helmet graffiti", "Chewing gum, always"],
    agendas: ["Keep the squad alive, whatever the orders say.", "Prove you are the toughest person in the room.", "Get out with a story worth telling and the pay to go with it."],
    gear: ["M41A pulse rifle", "M4A3 service pistol", "M3 personnel armor", "Cutting torch", "Combat knife", "Signal flare"],
    signatureItems: ["Dog tags", "Lucky coin", "Worn photo of someone back home"],
  }),
  career({
    id: "colonial-marshal",
    name: "Colonial Marshal",
    page: 33,
    summary: "The law on the frontier, often alone and rarely respected.",
    keyAttribute: "wits",
    keySkills: ["rangedCombat", "observation", "manipulation"],
    cash: "d6 x 300",
    talents: ["authority", "investigator", "subdue"],
    names: ["Dillon", "Reyes", "Okafor", "Hanlon", "Baptiste", "Sato"],
    appearances: ["Badge on a worn belt", "Steady, tired eyes", "Grey at the temples", "Long coat over work clothes", "Nicotine-stained fingers", "Immaculate uniform"],
    agendas: ["Keep order; nobody dies on your watch.", "Find out who is really in charge here and why.", "Bring someone in, alive if you can."],
    gear: ["Shotgun", "Service pistol", "Handcuffs", "Flashlight", "Binoculars", "Body armor"],
    signatureItems: ["Old badge", "Pocket watch", "Hip flask"],
  }),
  career({
    id: "company-agent",
    name: "Company Agent",
    page: 34,
    summary: "A corporate representative with a quota, an expense account and secret orders.",
    keyAttribute: "empathy",
    keySkills: ["observation", "comtech", "manipulation"],
    cash: "d6 x 500",
    talents: ["cunning", "personal-safety", "take-control"],
    names: ["Burke", "Vickers", "Kane", "Ellis", "Zhao", "Mahler"],
    appearances: ["Crisp suit in a dirty place", "Smile that never reaches the eyes", "Expensive watch", "Neatly trimmed beard", "Company pin on the lapel", "Pale from too much office light"],
    agendas: ["Secure the asset for the company, whatever it is.", "Make sure the paperwork blames someone else.", "Turn this crew into useful friends."],
    gear: ["Personal data tablet", "Compact pistol", "Luxury rations", "Hand radio", "Datachip of company files", "Stylish coat"],
    signatureItems: ["Company ID card", "Gold pen", "Encrypted phone"],
  }),
  career({
    id: "kid",
    name: "Kid",
    page: 35,
    summary: "A child of the frontier who survives by being small, fast and unnoticed.",
    keyAttribute: "agility",
    keySkills: ["mobility", "observation", "survival"],
    cash: "d6 x 10",
    talents: ["hide", "nimble", "rush"],
    names: ["Newt", "Timmy", "Casey", "Jonah", "Lupe", "Rafi"],
    appearances: ["Too-big jacket", "Dirt under every nail", "Hair cut with a knife", "Wide, watchful eyes", "Patched coveralls", "Carries a doll or toy"],
    agendas: ["Find the grown-up who will keep you safe.", "Never let them see you cry.", "Get back something that was taken from you."],
    gear: ["Flashlight", "Rations", "Toy or doll", "Pocket knife", "Hand radio", "Crawlspace map scrawled on a wall"],
    signatureItems: ["A doll's head", "A parent's keyring", "Glow stick"],
  }),
  career({
    id: "medic",
    name: "Medic",
    page: 36,
    summary: "Doctor, nurse or corpsman; the one who keeps everyone else alive.",
    keyAttribute: "empathy",
    keySkills: ["observation", "comtech", "medicalAid"],
    cash: "d6 x 100",
    talents: ["compassion", "field-surgeon", "nurse"],
    names: ["Dietrich", "Clemens", "Oyelaran", "Ng", "Ferraro", "Kowalski"],
    appearances: ["White coat gone grey", "Steady surgeon's hands", "Tired, kind face", "Glasses pushed up into hair", "Smells of antiseptic", "Military fatigues with a red cross"],
    agendas: ["Nobody dies that you could have saved.", "Study the thing nobody else wants to look at.", "Keep your own addiction a secret."],
    gear: ["Surgical kit", "Personal medkit", "Pharmaceuticals", "Flashlight", "Hand radio", "Stun gun"],
    signatureItems: ["Stethoscope", "Pill bottle", "Old medical school ring"],
  }),
  career({
    id: "officer",
    name: "Officer",
    page: 37,
    summary: "Ship captain, marine lieutenant or company executive: in charge, and accountable.",
    keyAttribute: "wits",
    keySkills: ["rangedCombat", "command", "manipulation"],
    cash: "d6 x 500",
    talents: ["field-commander", "influence", "pull-rank"],
    names: ["Dallas", "Gorman", "Ripley", "Andrews", "Moreau", "Haddad"],
    appearances: ["Pressed uniform", "Officer's cap under one arm", "Greying buzz cut", "Calm voice, clenched jaw", "Medals worn at odd hours", "Leather jacket with rank tabs"],
    agendas: ["Complete the mission and bring the crew home.", "Keep the chain of command intact at any cost.", "Hide the order you were given before launch."],
    gear: ["Service pistol", "Binoculars", "Hand radio", "Data tablet", "Flashlight", "Officer's sidearm holster"],
    signatureItems: ["Service medal", "Cigar case", "Captain's log"],
  }),
  career({
    id: "pilot",
    name: "Pilot",
    page: 38,
    summary: "Flies anything with thrusters and talks like it; the crew's way home.",
    keyAttribute: "agility",
    keySkills: ["piloting", "rangedCombat", "comtech"],
    cash: "d6 x 200",
    talents: ["full-throttle", "reckless", "tinkerer"],
    names: ["Lambert", "Ferro", "Spunkmeyer", "Mendez", "Ivanova", "Kessler"],
    appearances: ["Flight jacket covered in patches", "Mirrored sunglasses indoors", "Grease on the cheek", "Cap worn backwards", "Long braid tucked into collar", "Headset always on"],
    agendas: ["Never leave the ship behind.", "Prove you are the best pilot in the sector.", "Pay off the debt before it catches up with you."],
    gear: ["Service pistol", "Flight suit", "Hand radio", "Tool kit", "Hip flask", "Lucky charm"],
    signatureItems: ["Aviator sunglasses", "Dice hanging from a cord", "Old flight patch"],
  }),
  career({
    id: "roughneck",
    name: "Roughneck",
    page: 39,
    summary: "Miner, mechanic, trucker; the working stiff who keeps the ship running.",
    keyAttribute: "strength",
    keySkills: ["heavyMachinery", "closeCombat", "stamina"],
    cash: "d6 x 100",
    talents: ["resilient", "second-wind", "true-grit"],
    names: ["Brett", "Parker", "Ortiz", "Mbeki", "Dunn", "Kowalczyk"],
    appearances: ["Oil-stained coveralls", "Hawaiian shirt over a vest", "Bandana and sweat", "Missing finger", "Heavy work boots", "Arms like cables"],
    agendas: ["Get paid; the bonus situation is unacceptable.", "Keep the ship in one piece, it is the only home you have.", "Settle a score with someone on this crew."],
    gear: ["Cutting torch", "Tool kit", "Flashlight", "Work gloves", "Crowbar", "Hand radio"],
    signatureItems: ["Battered cap", "Harmonica", "Wrench with a name scratched in"],
  }),
  career({
    id: "scientist",
    name: "Scientist",
    page: 31,
    summary: "Researcher, xenobiologist or engineer, hungry for the next discovery.",
    keyAttribute: "wits",
    keySkills: ["observation", "comtech", "survival"],
    cash: "d6 x 300",
    talents: ["analysis", "breakthrough", "inquisitive"],
    names: ["Ash", "Bishop", "Holloway", "Shaw", "Nakamura", "Lindqvist"],
    appearances: ["Lab coat over a parka", "Ink-stained fingers", "Thick glasses", "Sample jars in every pocket", "Neat ponytail", "Nervous energy"],
    agendas: ["Bring back a specimen, alive.", "Publish before the company buries it.", "Prove your rival wrong once and for all."],
    gear: ["Data tablet", "Sample kit", "Flashlight", "Hand radio", "Medkit", "Stun gun"],
    signatureItems: ["Notebook full of sketches", "Microscope slide", "Doctorate ring"],
  }),
];

export const careers: ReferenceList = {
  id: "alien.careers",
  name: "Careers",
  page: [31, 39],
  unverified: true,
  itemSchema: {
    type: "object",
    required: ["id", "name", "keyAttribute", "keySkills", "cash", "talents"],
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      keyAttribute: { type: "string", enum: ["strength", "agility", "wits", "empathy"] },
      keySkills: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 3 },
      cash: { type: "string", description: "Starting cash formula, e.g. 'd6 x 100'." },
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
