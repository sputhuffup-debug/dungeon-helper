import type { PageRef, PlayModeId, ReferenceItem, ReferenceList } from "@campaign-forge/module-sdk";
import { CAMPAIGN } from "../modes";

export interface TalentInput {
  id: string;
  name: string;
  page: PageRef;
  summary: string;
  /** Career id for career talents; absent for general talents. */
  career?: string;
  mode?: PlayModeId[];
  /** How many times the talent can be taken (default 1). */
  stackLimit?: number;
}

/** `maxStack` mirrors `stackLimit` under the name the shared talents widget reads. */
export type TalentItem = TalentInput & ReferenceItem & { stackLimit: number; maxStack: number };

/** "Several times, once per model": the book sets no fixed cap. */
export const ONCE_PER_MODEL = 99;

const t = (x: TalentInput): TalentItem => {
  const stackLimit = x.stackLimit ?? 1;
  return { ...x, stackLimit, maxStack: stackLimit };
};

/**
 * Career talents (three per career; p. 48 for Colonial Marine and Marshal, p. 50
 * for the rest, repeated on each career page p. 31-39) and general talents (p. 51).
 * Checked against the Evolved Edition; summaries are short paraphrases.
 */
export const careerTalents: TalentItem[] = [
  // Colonial Marine (p. 48)
  t({ id: "banter", name: "Banter", career: "colonial-marine", page: 48, summary: "Resting in a safe place, you and everyone at Short range lose two stress per stretch instead of one." }),
  t({ id: "overkill", name: "Overkill", career: "colonial-marine", page: 48, summary: "On a panic result of 9+, enter overkill instead: other PCs in the zone roll panic; attack every turn, no cover or defense, until you or all visible foes are broken." }),
  t({ id: "precise-shooter", name: "Precise Shooter", career: "colonial-marine", page: 48, summary: "Ammo supply rolls use two dice fewer than the rating (minimum one)." }),
  // Colonial Marshal (p. 48)
  t({ id: "authority", name: "Authority", career: "colonial-marshal", page: 48, summary: "Use Command instead of Manipulation to bend someone to your will, with +2 dice." }),
  t({ id: "investigator", name: "Investigator", career: "colonial-marshal", page: 48, summary: "+2 dice to Observation when actively searching a zone for something hidden; not for passive rolls." }),
  t({ id: "subdue", name: "Subdue", career: "colonial-marshal", page: 48, summary: "+2 dice when trying to grapple an opponent in close combat." }),
  // Company Agent (p. 50)
  t({ id: "company-resources", name: "Company Resources", career: "company-agent", page: 50, summary: "Once per act (cinematic) or session (campaign), take +1 stress to produce an item of weight 1 or less you had all along; the Company wants it back." }),
  t({ id: "cunning", name: "Cunning", career: "company-agent", page: 50, summary: "Roll Manipulation with Wits instead of Empathy." }),
  t({ id: "personal-safety", name: "Personal Safety", career: "company-agent", page: 50, summary: "When attacked with a PC or friendly NPC at Short range, roll Manipulation (no action) to have the attack target them instead; +1 stress per use." }),
  // Kid (p. 50)
  t({ id: "hard-to-catch", name: "Hard to Catch", career: "kid", page: 50, summary: "+2 dice to Mobility when dodging an attack." }),
  t({ id: "lucky", name: "Lucky", career: "kid", page: 50, summary: "Re-roll any death roll or critical injury roll once and keep the result you prefer." }),
  t({ id: "nimble", name: "Nimble", career: "kid", page: 50, summary: "Push Agility-based skill rolls twice; +1 stress per push." }),
  // Medic (p. 50)
  t({ id: "field-medic", name: "Field Medic", career: "medic", page: 50, summary: "+2 dice to Medical Aid when giving first aid." }),
  t({ id: "nurse", name: "Nurse", career: "medic", page: 50, summary: "Each day you tend someone healing a critical injury counts double; per shift you can tend as many patients as your Medical Aid level." }),
  t({ id: "surgeon", name: "Surgeon", career: "medic", page: 50, summary: "+2 dice to Medical Aid when treating a critical injury that requires surgery." }),
  // Officer (p. 50)
  t({ id: "field-commander", name: "Field Commander", career: "officer", page: 50, summary: "Giving orders with Command in combat is a quick action for you instead of a full action." }),
  t({ id: "frontline-leader", name: "Frontline Leader", career: "officer", page: 50, summary: "+2 dice to Command when rallying a broken character." }),
  t({ id: "pull-rank", name: "Pull Rank", career: "officer", page: 50, summary: "Order non-officer NPCs of your own organization with Command; on a success they obey even at risk to themselves. +1 stress per use." }),
  // Pilot (p. 50)
  t({ id: "full-throttle", name: "Full Throttle", career: "pilot", page: 50, summary: "+2 dice to Piloting a spacecraft when accelerating or decelerating." }),
  t({ id: "like-the-back-of-your-hand", name: "Like the Back of Your Hand", career: "pilot", page: 50, stackLimit: ONCE_PER_MODEL, summary: "+2 dice to all Piloting rolls with one chosen ship or vehicle model; take it again for another model." }),
  t({ id: "reckless", name: "Reckless", career: "pilot", page: 50, summary: "Take +1 stress before a skill roll (before pushing); you can still push normally for another +1 stress." }),
  // Roughneck (p. 50)
  t({ id: "resilient", name: "Resilient", career: "roughneck", page: 50, summary: "Whenever you take damage, roll Strength alone (no push, no action); each success removes one point of damage." }),
  t({ id: "steady-hands", name: "Steady Hands", career: "roughneck", page: 50, summary: "You may leave one or two stress dice out of a skill roll; stress and panic rolls still use your full stress level." }),
  t({ id: "true-grit", name: "True Grit", career: "roughneck", page: 50, summary: "Push Strength-based skill rolls twice; +1 stress per push." }),
  // Scientist (p. 50)
  t({ id: "analysis", name: "Analysis", career: "scientist", page: 50, summary: "Study an alien artifact or creature for a stretch and roll Observation; each success answers one set question. Success calms nearby PCs, failure stresses them." }),
  t({ id: "inquisitive", name: "Inquisitive", career: "scientist", page: 50, summary: "Push Wits-based skill rolls twice; +1 stress per push." }),
  t({ id: "xenomorphology", name: "Xenomorphology", career: "scientist", page: 50, summary: "Facing an alien creature, roll Observation (quick action) to spot a weakness if it has one; failure gives +1 stress. One try per creature." }),
];

export const generalTalents: TalentItem[] = [
  t({ id: "bodyguard", name: "Bodyguard", page: 51, summary: "Spend a quick action to take a hit meant for someone in your zone." }),
  t({ id: "bonus-shares", name: "Bonus Shares", page: 51, mode: [CAMPAIGN], summary: "+2 dice to Manipulation when negotiating the payment for a job." }),
  t({ id: "calm-breather", name: "Calm Breather", page: 51, summary: "Air supply rolls use two dice fewer than the rating (minimum one)." }),
  t({ id: "combat-veteran", name: "Combat Veteran", page: 51, summary: "In combat you may keep last round's initiative card instead of drawing a new one." }),
  t({ id: "counselor", name: "Counselor", page: 51, summary: "Once per stretch, roll Manipulation to cut another PC's stress in your zone by one extra step per success; not on yourself." }),
  t({ id: "eva-specialist", name: "EVA Specialist", page: 51, summary: "+2 to Heavy Machinery and Mobility rolls during spacewalks." }),
  t({ id: "fast-reflexes", name: "Fast Reflexes", page: 51, summary: "Draw two initiative cards, keep the one you want and shuffle the other back." }),
  t({ id: "gunner", name: "Gunner", page: 51, summary: "+2 dice to Ranged Combat with vehicle-mounted weapons or spaceship armaments." }),
  t({ id: "hardened", name: "Hardened", page: 51, stackLimit: 3, summary: "+1 maximum Health. Can be taken up to three times." }),
  t({ id: "haymaker", name: "Haymaker", page: 51, summary: "+2 dice to a Close Combat attack if you give up your quick action that round." }),
  t({ id: "martial-arts", name: "Martial Arts", page: 51, summary: "Use Agility instead of Strength for unarmed close combat; unarmed attacks can be quick actions at −2 dice." }),
  t({ id: "last-one-standing", name: "Last One Standing", page: 51, summary: "When broken, you may try once to rally yourself with a Stamina roll." }),
  t({ id: "machinegunner", name: "Machinegunner", page: 51, summary: "Firing full-auto bursts does not raise your stress level." }),
  t({ id: "menacing", name: "Menacing", page: 51, summary: "When threatening someone, roll Strength + Manipulation with +2 dice." }),
  t({ id: "navigator", name: "Navigator", page: 51, summary: "Roll Comtech when plotting a new course; each success cuts the trip by 10%." }),
  t({ id: "pack-mule", name: "Pack Mule", page: 51, summary: "Carry twice as many items as normal before becoming encumbered." }),
  t({ id: "quick-shot", name: "Quick Shot", page: 51, summary: "When shot at, take +1 stress and fire back as a quick action; both attacks roll at once and the one with more successes goes first." }),
  t({ id: "rapid-fire", name: "Rapid Fire", page: 51, summary: "Fire a pistol as a quick action at −2 dice." }),
  t({ id: "second-wind", name: "Second Wind", page: 51, summary: "Anyone trying to rally you gets +2 dice to the Command roll." }),
  t({ id: "seen-it-all", name: "Seen It All", page: 51, stackLimit: 3, summary: "+1 Resolve. Can be taken up to three times." }),
  t({ id: "sensor-operator", name: "Sensor Operator", page: 51, summary: "+2 dice to Comtech when operating ship sensors." }),
  t({ id: "spaceship-commander", name: "Spaceship Commander", page: 51, summary: "As captain in space combat, +2 dice to Command for initiative and orders." }),
  t({ id: "spaceship-mechanic", name: "Spaceship Mechanic", page: 51, summary: "+2 dice to Heavy Machinery or Comtech when maintaining or repairing a spacecraft." }),
  t({ id: "stealthy", name: "Stealthy", page: 51, summary: "Enemies get −2 dice to spot you in stealth mode; a group benefits only if all members have it." }),
  t({ id: "stoic", name: "Stoic", page: 51, summary: "Roll Stamina with Wits instead of Strength." }),
  t({ id: "survivor", name: "Survivor", page: 51, summary: "+2 dice to all death rolls." }),
  t({ id: "tech-savvy", name: "Tech Savvy", page: 51, summary: "Power supply rolls use two dice fewer than the rating (minimum one)." }),
  t({ id: "weapon-specialist", name: "Weapon Specialist", page: 51, stackLimit: ONCE_PER_MODEL, summary: "+2 dice with one chosen weapon model, or unarmed; take it again for another model." }),
  t({ id: "zero-g-training", name: "Zero-G Training", page: 51, summary: "Ignore all skill roll penalties for zero gravity." }),
];

export const talentItems: TalentItem[] = [...careerTalents, ...generalTalents];

export const talents: ReferenceList = {
  id: "alien.talents",
  name: "Talents",
  page: [48, 51],
  itemSchema: {
    type: "object",
    required: ["id", "name", "stackLimit"],
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      career: { type: "string" },
      stackLimit: { type: "integer", minimum: 1 },
      maxStack: { type: "integer", minimum: 1 },
      mode: { type: "array", items: { type: "string" } },
      summary: { type: "string" },
      page: { type: ["integer", "array"] },
      unverified: { type: "boolean" },
    },
  },
  items: talentItems,
};
