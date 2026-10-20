import type { PageRef, RuleCard } from "@campaign-forge/module-sdk";

export const RULE_PREFIX = "alien.rule.";

/** Build a rule card with the module id prefix. Summaries are paraphrases, never book prose. */
export function card(slug: string, title: string, summary: string, page: PageRef, extra: Omit<RuleCard, "id" | "title" | "summary" | "page"> = {}): RuleCard {
  return { id: `${RULE_PREFIX}${slug}`, title, summary, page, ...extra };
}

export const F = {
  stress: "alien.character.stress",
  storyPoints: "alien.character.storyPoints",
  xp: "alien.character.xp",
  gear: "alien.character.gear",
  talents: "alien.character.talents",
  attributes: "alien.character.attributes",
  skills: "alien.character.skills",
  android: "alien.character.android",
  criticalInjuries: "alien.character.criticalInjuries",
  damage: "alien.character.damage",
  creatureDamage: "alien.creature.damage",
  creatureArmor: "alien.creature.armor",
  creatureArmorVsFire: "alien.creature.armorVsFire",
  acidSplash: "alien.creature.acidSplash",
  creatureAttacks: "alien.creature.attacks",
  creatureSpeed: "alien.creature.speed",
  mentalTraumas: "alien.character.mentalTraumas",
  personalAgenda: "alien.character.personalAgenda",
  agendas: "alien.character.agendas",
  signatureItem: "alien.character.signatureItem",
  cash: "alien.character.cash",
  career: "alien.character.career",
};

export const T = {
  stressResponse: "alien.character.stress-response",
  panic: "alien.character.panic",
  mentalTrauma: "alien.character.mental-trauma",
  criticalInjury: "alien.character.critical-injury",
  campaignTheme: "alien.character.campaign-theme",
};

export const TR = {
  stress: "alien.stress",
  storyPoints: "alien.story-points",
  clock: "alien.clock",
  countdown: "alien.countdown",
  supply: "alien.supply",
  initiative: "alien.initiative",
  stealth: "alien.stealth",
  gestation: "alien.gestation",
};
