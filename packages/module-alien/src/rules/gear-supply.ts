import type { RuleCard } from "@campaign-forge/module-sdk";
import { F, TR, card } from "./card";

/** Encumbrance and consumables (p. 27-29) and gear (chapter 5, p. 82-105). */
export const gearSupplyRules: RuleCard[] = [
  card("encumbrance", "Encumbrance", "You can carry regular items (weight 1) up to twice your Strength; heavy items count as several, light ones as ½ or ¼, and tiny ones nothing. You may carry up to double the limit, but then gain +1 stress each time you move in a stretch of stealth or a round of combat.", 28, {
    tags: ["gear"],
    links: { fields: [F.gear, F.attributes], rules: ["alien.rule.consumables"] },
  }),
  card("consumables", "Consumables", "Air for suits, ammo for weapons and power for electrical gear are tracked as supply ratings on the character sheet rather than counted. They drop through supply rolls, and time itself can be treated as a consumable during a countdown.", 28, {
    tags: ["gear", "supply"],
    links: { fields: [F.gear], rules: ["alien.rule.supply-rolls", "alien.rule.air-supply", "alien.rule.ammo-supply", "alien.rule.power-supply", "alien.rule.countdowns"], trackers: [TR.supply] },
  }),
  card("supply-rolls", "Supply rolls", "Roll stress dice equal to the current rating, at most six; each facehugger lowers the rating by one, so high ratings fall faster than low ones. For NPCs the GM usually just lowers the rating one step instead of rolling.", [28, 29], {
    tags: ["gear", "supply", "dice"],
    links: { fields: [F.gear], rules: ["alien.rule.consumables"], trackers: [TR.supply] },
  }),
  card("air-supply", "Air", "Make an air supply roll after every stretch and after strenuous activity such as combat or a Mobility roll. At zero you begin to suffocate.", 28, {
    tags: ["gear", "supply"],
    links: { rules: ["alien.rule.supply-rolls", "alien.rule.suffocation"], trackers: [TR.supply] },
  }),
  card("ammo-supply", "Ammo and reloading", "Make an ammo supply roll after each attack, unless you spend an extra success to conserve ammo; at zero you must reload, a quick action, and reloads are tracked on the sheet. Single-shot weapons are reloaded after every shot instead.", [66, 67], {
    tags: ["gear", "supply", "combat"],
    links: { rules: ["alien.rule.supply-rolls", "alien.rule.full-auto"], trackers: [TR.supply] },
  }),
  card("power-supply", "Power", "Electrical gear makes a power supply roll after each use, or as its description says, and stops working at zero. A power cell restores one item's full supply.", [29, 97], {
    tags: ["gear", "supply"],
    links: { rules: ["alien.rule.supply-rolls", "alien.rule.motion-tracker"], trackers: [TR.supply] },
  }),
  card("food-water", "Hunger and thirst", "As a rule of thumb you must eat and drink every day; after a full 24 hours without food and water, roll Survival every shift. A prefab meal or a water bottle covers one day's need.", [75, 99], {
    tags: ["gear", "survival"],
    links: { rules: ["alien.rule.fatigue"] },
  }),
  card("weapons", "Weapon features", "Weapons list a modifier, damage (E for explosive, or Stun), minimum and maximum range, ammo or power rating, weight and cost. Armor piercing lowers armor one step; full auto allows bursts; unreliable weapons jam on a Mess Up, cleared with a full action and Heavy Machinery.", 82, {
    tags: ["combat", "gear"],
    links: { rules: ["alien.rule.damage-armor", "alien.rule.ammo-supply", "alien.rule.range-bands", "alien.rule.full-auto"] },
  }),
  card("armor", "Suits and armor", "Suits list an armor level, an air supply and special traits such as vacuum protection or a Mobility penalty. Armor level is subtracted from incoming damage, and acid eats it away point by point.", [90, 91], {
    tags: ["combat", "gear", "damage"],
    links: { rules: ["alien.rule.damage-armor", "alien.rule.air-supply", "alien.rule.acid-splash"] },
  }),
  card("medical-equipment", "Medical supplies", "A personal medkit gives +2 to Medical Aid for one first aid, and a surgical kit +2 for first aid and surgery. An AutoDoc gives first aid at Medical Aid 8 but no surgery, and a Pauling MedPod does both at 12; neither roll can be pushed.", 97, {
    tags: ["gear", "medical"],
    links: { rules: ["alien.rule.healing", "alien.rule.critical-injuries"] },
  }),
  card("pharmaceuticals", "Drugs, food and drink", "Naproleve drops stress to zero, Neversleep pills replace a day's sleep at +1 stress, and Hydr8tion cures hypersleep fatigue. Coffee, alcohol and recreational drugs nudge stress up or down, and extra doses within a shift give −1 die to all rolls.", [98, 99], {
    tags: ["gear", "medical"],
    links: { rules: ["alien.rule.stress-recovery", "alien.rule.sleep-deprivation", "alien.rule.hypersleep"] },
  }),
  card("tools-and-comms", "Tools and vision gear", "Tools add dice in the right situation: a cutting torch or bolt gun +2 to Heavy Machinery, a maintenance jack +1, electronic tools +1 to Comtech. Flashlights remove darkness, binoculars help Observation at Long range, and motion trackers detect movement in stealth mode.", [96, 97], {
    tags: ["gear"],
    links: { rules: ["alien.rule.motion-tracker", "alien.rule.darkness"] },
  }),
  card("living-expenses", "Living expenses", "Typical weekly living costs: $25 minimum, $100 basic, $300 normal and $2,000 luxurious. PCs pay their way during shore leave.", 116, {
    tags: ["gear", "campaign"],
    links: { fields: [F.cash], rules: ["alien.rule.shore-leave", "alien.rule.cash"] },
  }),
];
