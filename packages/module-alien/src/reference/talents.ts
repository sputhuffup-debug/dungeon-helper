import type { ReferenceItem, ReferenceList } from "@campaign-forge/module-sdk";
import { CAMPAIGN, CINEMATIC } from "../modes";

export interface TalentItem extends ReferenceItem {
  /** Career id for career talents; absent for general talents. */
  career?: string;
  /** How many times the talent can be taken. */
  stackLimit: number;
  unverified: true;
}

type T = Omit<TalentItem, "unverified" | "stackLimit"> & { stackLimit?: number };
const t = (x: T): TalentItem => ({ stackLimit: 1, ...x, unverified: true });

/**
 * Career talents (three per career, p. 48-49) and general talents (p. 50-51).
 * One-sentence paraphrases from general knowledge; every entry is unverified.
 */
export const careerTalents: TalentItem[] = [
  // Colonial Marine
  t({ id: "banter", name: "Banter", career: "colonial-marine", page: 48, summary: "Crack a joke to let a nearby friend shed stress once per scene." }),
  t({ id: "overkill", name: "Overkill", career: "colonial-marine", page: 48, summary: "When you take a Critical Injury, spend the moment to hit back one last time." }),
  t({ id: "past-the-limit", name: "Past the Limit", career: "colonial-marine", page: 48, summary: "Push a Stamina roll twice, at the usual stress cost each time." }),
  // Colonial Marshal
  t({ id: "authority", name: "Authority", career: "colonial-marshal", page: 48, summary: "Bonus to Manipulation when invoking the law or your office." }),
  t({ id: "investigator", name: "Investigator", career: "colonial-marshal", page: 48, summary: "Bonus to Observation when searching a scene for clues." }),
  t({ id: "subdue", name: "Subdue", career: "colonial-marshal", page: 48, summary: "Bonus to Close Combat when fighting to restrain rather than kill." }),
  // Company Agent
  t({ id: "cunning", name: "Cunning", career: "company-agent", page: 48, summary: "Bonus to Manipulation when lying or bargaining in the company's interest." }),
  t({ id: "personal-safety", name: "Personal Safety", career: "company-agent", page: 48, summary: "Bonus to Mobility when getting yourself out of harm's way." }),
  t({ id: "take-control", name: "Take Control", career: "company-agent", page: 48, summary: "Once per act or session, give an order that an NPC obeys without a roll." }),
  // Kid
  t({ id: "hide", name: "Hide", career: "kid", page: 48, summary: "Bonus to Mobility when sneaking or hiding; you fit into crawlspaces." }),
  t({ id: "nimble", name: "Nimble", career: "kid", page: 48, summary: "Bonus to Mobility when dodging or climbing." }),
  t({ id: "rush", name: "Rush", career: "kid", page: 48, summary: "Move twice as far in a round when fleeing." }),
  // Medic
  t({ id: "compassion", name: "Compassion", career: "medic", page: 49, summary: "Bonus to Command when calming a panicking friend." }),
  t({ id: "field-surgeon", name: "Field Surgeon", career: "medic", page: 49, summary: "Bonus to Medical Aid when stabilising someone who is Broken." }),
  t({ id: "nurse", name: "Nurse", career: "medic", page: 49, summary: "Your care speeds the healing of Critical Injuries." }),
  // Officer
  t({ id: "field-commander", name: "Field Commander", career: "officer", page: 49, summary: "Bonus to Command in combat; a success also gives an ally a free action." }),
  t({ id: "influence", name: "Influence", career: "officer", page: 49, summary: "Bonus to Manipulation when dealing with officials and corporations." }),
  t({ id: "pull-rank", name: "Pull Rank", career: "officer", page: 49, summary: "Bonus to Command when giving orders to subordinates." }),
  // Pilot
  t({ id: "full-throttle", name: "Full Throttle", career: "pilot", page: 49, summary: "Bonus to Piloting when you push a vehicle beyond safe limits." }),
  t({ id: "reckless", name: "Reckless", career: "pilot", page: 49, summary: "Ignore the Maneuverability penalty of a vehicle once per scene." }),
  t({ id: "tinkerer", name: "Tinkerer", career: "pilot", page: 49, summary: "Bonus to Heavy Machinery and Comtech when fixing your own ride." }),
  // Roughneck
  t({ id: "resilient", name: "Resilient", career: "roughneck", page: 49, summary: "Bonus to Stamina rolls to resist pain, cold and exhaustion." }),
  t({ id: "second-wind", name: "Second Wind", career: "roughneck", page: 49, summary: "Once per act or session, recover a point of Health in the middle of a fight." }),
  t({ id: "true-grit", name: "True Grit", career: "roughneck", page: 49, summary: "Bonus to Heavy Machinery when brute force is the answer." }),
  // Scientist
  t({ id: "analysis", name: "Analysis", career: "scientist", page: 49, summary: "Bonus to Observation when studying a sample or a scene in detail." }),
  t({ id: "breakthrough", name: "Breakthrough", career: "scientist", page: 49, summary: "Once per act or session, the GM answers one question about the thing you study." }),
  t({ id: "inquisitive", name: "Inquisitive", career: "scientist", page: 49, summary: "Reduce stress when you learn something new about the unknown." }),
];

export const generalTalents: TalentItem[] = [
  t({ id: "bodyguard", name: "Bodyguard", page: 50, summary: "Take a hit meant for someone at engaged range." }),
  t({ id: "calm", name: "Calm", page: 50, summary: "Bonus when rolling to resist panic." }),
  t({ id: "counselor", name: "Counselor", page: 50, summary: "Bonus to Command when helping someone recover stress." }),
  t({ id: "economical", name: "Economical", page: 50, summary: "Re-roll one supply die that shows a 1, once per supply roll." }),
  t({ id: "gearhead", name: "Gearhead", page: 50, summary: "Bonus to Heavy Machinery and Comtech when repairing." }),
  t({ id: "hardened", name: "Hardened", page: 50, summary: "+1 Health; you have been hurt before and kept going.", stackLimit: 1 }),
  t({ id: "seen-it-all", name: "Seen It All", page: 51, summary: "+1 Resolve; horror has lost some of its grip on you.", stackLimit: 1 }),
  t({ id: "lucky", name: "Lucky", page: 50, summary: "Once per act or session, re-roll any die that is not a stress die.", mode: [CINEMATIC, CAMPAIGN] }),
  t({ id: "pack-mule", name: "Pack Mule", page: 50, summary: "Carry extra: your encumbrance limit grows." }),
  t({ id: "quick-draw", name: "Quick Draw", page: 50, summary: "Draw and fire a sidearm in the same action." }),
  t({ id: "quick-fire", name: "Quick Fire", page: 50, summary: "Fire a second shot as a fast action at a penalty." }),
  t({ id: "sharpshooter", name: "Sharpshooter", page: 50, summary: "Bonus to Ranged Combat when you aim first." }),
  t({ id: "sixth-sense", name: "Sixth Sense", page: 50, summary: "Bonus to Observation to notice ambushes and hidden danger." }),
  t({ id: "steady-feet", name: "Steady Feet", page: 50, summary: "Keep your footing: bonus when resisting being moved or knocked down." }),
  t({ id: "talk-the-talk", name: "Talk the Talk", page: 50, summary: "Bonus to Manipulation with your own crowd: marines, truckers, colonists." }),
  t({ id: "tough", name: "Tough", page: 51, summary: "Bonus to Stamina rolls against damage effects." }),
  t({ id: "unbreakable", name: "Unbreakable", page: 51, summary: "When Broken, you may still crawl and speak." }),
  t({ id: "watchful", name: "Watchful", page: 51, summary: "You cannot be surprised while awake; bonus to Observation on watch." }),
  t({ id: "weapon-specialist", name: "Weapon Specialist", page: 51, summary: "Bonus with one chosen weapon type; take it again for another type.", stackLimit: 3 }),
  t({ id: "machinist", name: "Machinist", page: 50, summary: "Bonus to Heavy Machinery when operating loaders and ship systems." }),
  t({ id: "nerves-of-steel", name: "Nerves of Steel", page: 50, summary: "Reduce the stress gained from a single panic trigger, once per scene." }),
  t({ id: "fast-reflexes", name: "Fast Reflexes", page: 50, summary: "Draw two initiative cards and keep the better one." }),
  t({ id: "healer", name: "Healer", page: 50, summary: "Bonus to Medical Aid when treating damage." }),
  t({ id: "killer", name: "Killer", page: 50, summary: "Bonus to Close Combat when you attack first in a fight." }),
  t({ id: "menacing", name: "Menacing", page: 50, summary: "Bonus to Manipulation when intimidating." }),
  t({ id: "pathfinder", name: "Pathfinder", page: 50, summary: "Bonus to Survival when leading others through rough terrain." }),
  t({ id: "space-legs", name: "Space Legs", page: 51, summary: "Ignore penalties for zero gravity and ship manoeuvres." }),
  t({ id: "stress-eater", name: "Stress Eater", page: 51, summary: "Eating a meal or using your signature item removes extra stress." }),
  t({ id: "veteran", name: "Veteran", page: 51, summary: "Bonus to Command when leading troops who have fought beside you.", mode: [CAMPAIGN] }),
];

export const talentItems: TalentItem[] = [...careerTalents, ...generalTalents];

export const talents: ReferenceList = {
  id: "alien.talents",
  name: "Talents",
  page: [48, 51],
  unverified: true,
  itemSchema: {
    type: "object",
    required: ["id", "name", "stackLimit"],
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      career: { type: "string" },
      stackLimit: { type: "integer", minimum: 1 },
      mode: { type: "array", items: { type: "string" } },
      summary: { type: "string" },
      page: { type: ["integer", "array"] },
      unverified: { type: "boolean" },
    },
  },
  items: talentItems,
};
