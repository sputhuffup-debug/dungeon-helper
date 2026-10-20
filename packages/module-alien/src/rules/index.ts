import type { RuleCard } from "@campaign-forge/module-sdk";
import { coreRules } from "./core-rules";
import { stressPanicRules } from "./stress-panic";
import { combatRules } from "./combat";
import { gearSupplyRules } from "./gear-supply";
import { spaceTravelRules } from "./space-travel";
import { shipRules } from "./ships";
import { creatureRules } from "./creatures";
import { campaignPlayRules } from "./campaign-play";
import { cinematicPlayRules } from "./cinematic-play";
import { gmToolsRules } from "./gm-tools";
import { moneyRules } from "./money";

export { RULE_PREFIX, card } from "./card";
export {
  coreRules,
  stressPanicRules,
  combatRules,
  gearSupplyRules,
  spaceTravelRules,
  shipRules,
  creatureRules,
  campaignPlayRules,
  cinematicPlayRules,
  gmToolsRules,
  moneyRules,
};

/** All rule cards, grouped by chapter. Every card cites a page and paraphrases, never quotes. */
export const rules: RuleCard[] = [
  ...coreRules,
  ...stressPanicRules,
  ...combatRules,
  ...gearSupplyRules,
  ...spaceTravelRules,
  ...shipRules,
  ...creatureRules,
  ...campaignPlayRules,
  ...cinematicPlayRules,
  ...gmToolsRules,
  ...moneyRules,
];

export const ruleIds = new Set(rules.map((r) => r.id));
