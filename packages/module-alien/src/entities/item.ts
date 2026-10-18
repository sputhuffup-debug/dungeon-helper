import type { EntityTypeDef, SheetLayout } from "@campaign-forge/module-sdk";
import { RANGE_IDS, SKILL_IDS, checkbox, enumField, intField, number, numberField, objectSchema, select, stringArray, stringField, tags, text, textarea } from "./common";

/** "(stun)" and "(fire)" in the weapon tables; everything else is normal damage (p. 82). */
export const DAMAGE_TYPES = ["normal", "stun", "fire"] as const;

/**
 * Weapon range bands as the gear tables print them (p. 82): A(djacent), S, M, L, E.
 * Weapons list a minimum / maximum pair, e.g. "S/L".
 */
export const WEAPON_RANGE_IDS = RANGE_IDS;

const skillMap = (description: string): Record<string, unknown> => ({
  type: "object",
  description,
  propertyNames: { enum: [...SKILL_IDS] },
  additionalProperties: { type: "integer" },
});

export const itemSchema = objectSchema({
  weight: numberField({ minimum: 0, default: 1 }, "Inventory rows (p. 82): 1 normal, 0.5 light, 0.25 for a quarter, 0 for tiny (\"–\")."),
  portable: { type: "boolean", default: true, description: "False when the book gives weight N/A: too heavy to carry." },
  cost: numberField({ minimum: 0, default: 0 }, "Typical price in W-Y dollars. For a range or \"varies\", the low end; see costText."),
  costText: stringField("Price exactly as printed when it is not a single number, e.g. \"$2–$100\" or \"Varies\"."),
  special: stringArray("Weapon or suit features as the tables name them, e.g. Armor piercing, Full auto."),
  effect: stringField("What the item does when used (paraphrased)."),
  supply: intField(0, undefined, undefined, "Supply rating for consumables (p. 28-29)."),
  power: intField(0, undefined, undefined, "Power supply rating (p. 29)."),
  skillBonus: skillMap("Dice modifiers the item gives to skills, e.g. { heavyMachinery: 2 }."),
  skillLevels: skillMap("Fixed skill levels of a device that rolls on its own (mainframes, AutoDoc, sentry gun)."),
  // weapon
  bonus: intField(undefined, undefined, 0, "Modifier to CLOSE COMBAT or RANGED COMBAT (\"–\" = 0)."),
  damage: intField(0, undefined, 1, "Base damage."),
  explosive: { type: "boolean", default: false, description: "The E after the damage: an explosive attack (p. 76)." },
  damageType: enumField(DAMAGE_TYPES, "normal"),
  range: enumField(WEAPON_RANGE_IDS, "short", "Maximum range band; for vision devices, the device's range."),
  rangeMin: enumField(WEAPON_RANGE_IDS, undefined, "Minimum range band (-2 dice per band closer than this)."),
  ammo: { type: ["integer", "string"], description: "Ammo supply rating, or \"Single-shot\" / \"Single use\"." },
  munitionCost: numberField({ minimum: 0 }, "Price of one missile, bought separately (vehicle launchers)."),
  // armor
  armorRating: intField(0, undefined, 0, "Armor Level (p. 67)."),
  airSupply: intField(0, undefined, undefined, "Air supply rating for suits (p. 28)."),
});

const common = (extra: SheetLayout["sections"][number]["fields"]): SheetLayout => ({
  sections: [
    {
      id: "stats",
      title: "Stats",
      columns: 4,
      fields: [
        ...extra,
        number("weight", "Weight", { rule: "alien.rule.encumbrance" }),
        checkbox("portable", "Portable"),
        number("cost", "Cost ($)"),
        text("costText", "Price as listed", { span: 3 }),
        tags("special", "Special"),
        textarea("effect", "Effect"),
      ],
    },
  ],
  summary: ["weight", "cost"],
});

const weaponSheet: SheetLayout = {
  ...common([
    number("bonus", "Modifier", { rule: "alien.rule.weapons" }),
    number("damage", "Damage", { rule: "alien.rule.damage-armor" }),
    checkbox("explosive", "Explosive"),
    select("damageType", "Damage type", [...DAMAGE_TYPES], { span: 3, rule: "alien.rule.damage-types" }),
    select("rangeMin", "Min range", [...WEAPON_RANGE_IDS], { span: 3, rule: "alien.rule.range-bands" }),
    select("range", "Max range", [...WEAPON_RANGE_IDS], { span: 3, rule: "alien.rule.range-bands" }),
    text("ammo", "Ammo", { span: 3, rule: "alien.rule.consumables" }),
    number("power", "Power", { rule: "alien.rule.consumables" }),
  ]),
  summary: ["bonus", "damage", "range", "weight"],
};

const armorSheet: SheetLayout = {
  ...common([
    number("armorRating", "Armor Level", { rule: "alien.rule.armor" }),
    number("airSupply", "Air supply", { rule: "alien.rule.consumables" }),
  ]),
  summary: ["armorRating", "airSupply", "weight"],
};

const gearSheet: SheetLayout = {
  ...common([
    select("range", "Range", [...WEAPON_RANGE_IDS], { span: 3 }),
    number("power", "Power", { rule: "alien.rule.consumables" }),
    number("supply", "Supply", { rule: "alien.rule.supply-rolls" }),
  ]),
  summary: ["weight", "cost"],
};

export const itemType: EntityTypeDef = {
  id: "alien.item",
  kind: "item",
  name: "Item",
  plural: "Items",
  icon: "package",
  schema: itemSchema,
  sheet: common([]),
  subtypes: [
    { id: "weapon", name: "Weapon", sheet: weaponSheet },
    { id: "armor", name: "Armor", sheet: armorSheet },
    { id: "tool", name: "Tool", sheet: gearSheet },
    { id: "medical", name: "Medical", sheet: gearSheet },
    { id: "pharmaceutical", name: "Pharmaceutical", sheet: gearSheet },
    { id: "food", name: "Food", sheet: gearSheet },
    { id: "other", name: "Other", sheet: gearSheet },
  ],
};
