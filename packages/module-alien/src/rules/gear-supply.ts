import type { RuleCard } from "@campaign-forge/module-sdk";
import { F, TR, card } from "./card";

export const gearSupplyRules: RuleCard[] = [
  card("encumbrance", "Encumbrance", "You can carry items with a total weight of twice your Strength. Heavy items count double, tiny ones nothing. Over the limit you must roll Stamina to move, with failure costing stress.", 28, {
    tags: ["gear"],
    links: { fields: [F.gear, F.attributes], rules: ["alien.rule.consumables"] },
  }),
  card("consumables", "Consumables", "Air, food, water, ammo and power are tracked as supply ratings rather than counted item by item. When the GM calls for it, make a supply roll.", [28, 29], {
    tags: ["gear", "supply"],
    links: { fields: [F.gear], rules: ["alien.rule.supply-rolls", "alien.rule.air-supply", "alien.rule.ammo-supply", "alien.rule.power-supply", "alien.rule.food-water"], trackers: [TR.supply] },
  }),
  card("supply-rolls", "Supply rolls", "Roll stress dice equal to the supply rating; every facehugger (1) reduces the rating by one. At zero the item is gone. The dice are only counters here: they cause no stress response.", [28, 29], {
    tags: ["gear", "supply", "dice"],
    links: { fields: [F.gear], rules: ["alien.rule.consumables"], trackers: [TR.supply] },
  }),
  card("air-supply", "Air", "Suits and tanks carry an air supply rating. Roll it once per Shift of normal use, or once per Round of hard exertion or combat; at zero you start suffocating.", 28, {
    tags: ["gear", "supply"],
    links: { rules: ["alien.rule.supply-rolls", "alien.rule.conditions"], trackers: [TR.supply, TR.countdown] },
  }),
  card("ammo-supply", "Ammo", "Roll the weapon's ammo supply after a fight, or after every full-auto burst. A rating of zero means an empty magazine until you reload from another supply.", 29, {
    tags: ["gear", "supply", "combat"],
    links: { rules: ["alien.rule.supply-rolls", "alien.rule.full-auto"], trackers: [TR.supply] },
  }),
  card("power-supply", "Power", "Powered tools, lights and suits have a power rating rolled once per Shift of use. At zero the device is dead until recharged.", 29, {
    tags: ["gear", "supply"],
    links: { rules: ["alien.rule.supply-rolls"], trackers: [TR.supply] },
  }),
  card("food-water", "Food and water", "Roll food and water supply once per day. Running out leads to the Starving and Dehydrated conditions.", 29, {
    tags: ["gear", "supply"],
    links: { rules: ["alien.rule.supply-rolls", "alien.rule.starving", "alien.rule.dehydrated"], trackers: [TR.supply] },
  }),
  card("conditions", "Conditions", "Four survival conditions: Starving, Dehydrated, Exhausted and Freezing. Each is gained by failing a Stamina roll when deprived, blocks Health recovery and eventually kills.", 71, {
    tags: ["gear", "survival"],
    links: { rules: ["alien.rule.starving", "alien.rule.dehydrated", "alien.rule.exhausted", "alien.rule.freezing"] },
  }),
  card("starving", "Starving", "After a day without food, roll Stamina each day; failure makes you Starving: no Health recovery and a stress cost. After a week without food you die.", 71, {
    tags: ["survival", "condition"],
    links: { rules: ["alien.rule.conditions", "alien.rule.food-water"] },
  }),
  card("dehydrated", "Dehydrated", "After a day without water, roll Stamina each Shift; failure makes you Dehydrated and death follows within days.", 71, {
    tags: ["survival", "condition"],
    links: { rules: ["alien.rule.conditions", "alien.rule.food-water"] },
  }),
  card("exhausted", "Exhausted", "After a day without sleep, roll Stamina each Shift; failure makes you Exhausted: penalties to everything and no Health recovery until you rest.", 71, {
    tags: ["survival", "condition"],
    links: { rules: ["alien.rule.conditions"] },
  }),
  card("freezing", "Freezing", "In cold without protection, roll Stamina each Shift (each Round in vacuum or extreme cold). Failure makes you Freezing; continued failure deals damage.", 71, {
    tags: ["survival", "condition"],
    links: { rules: ["alien.rule.conditions"] },
  }),
  card("medical-equipment", "Medical equipment", "Medkits give a bonus to Medical Aid and have a supply rating; surgical kits and medbays allow surgery on fatal injuries; cryo tubes stabilise a dying patient.", [94, 95], {
    tags: ["gear", "medical"],
    links: { rules: ["alien.rule.healing", "alien.rule.critical-injuries"] },
  }),
  card("pharmaceuticals", "Pharmaceuticals", "Drugs trade a quick benefit (stress relief, pain suppression, alertness) for a cost: a crash later, dependency or a penalty when they wear off.", [96, 97], {
    tags: ["gear", "medical"],
    links: { rules: ["alien.rule.stress-recovery"] },
  }),
  card("tools-and-comms", "Tools and comms", "Cutting torches, motion trackers, hand radios and data tablets each give a bonus or an ability; the motion tracker spots movement at medium range, which is its own kind of terror.", [92, 93], {
    tags: ["gear"],
    links: { rules: ["alien.rule.stealth-mode"] },
  }),
];
