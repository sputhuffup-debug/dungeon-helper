import type { RuleCard } from "@campaign-forge/module-sdk";
import { CAMPAIGN } from "../modes";
import { F, card } from "./card";

/** Money on the Frontier: currencies and salaries (p. 116-117, 234-235). */
export const moneyRules: RuleCard[] = [
  card("currencies", "Money and currencies", "Most transactions run through ID-linked credit accounts, with cash kept for purchases nobody should record. Amounts are counted in UA dollars, 3WE yen or UPP yuan, and corporate notes such as W-Y dollars hold their value best. Corporate credit and loans exist, but the book gives no terms for them.", [116, 117], {
    tags: ["campaign", "money"],
    links: { fields: [F.cash], rules: ["alien.rule.salaries", "alien.rule.living-expenses", "alien.rule.cash"] },
  }),
  card("salaries", "Salaries", "Weekly pay is low on purpose: colonial labor $500–640, commercial employees $400–960, officials $540–1,200, law enforcement $400–700, military $500–760, elite jobs $1,300–20,000. In the campaign frames, weeks spent in stasis pay only 10% of salary.", [117, 235], {
    mode: [CAMPAIGN],
    tags: ["campaign", "money"],
    links: { fields: [F.cash], rules: ["alien.rule.currencies", "alien.rule.job-frames"] },
  }),
];
