import type { EntityTypeDef, SheetLayout } from "@campaign-forge/module-sdk";
import { RANGE_IDS, enumField, intField, number, numberField, objectSchema, select, stringArray, stringField, tags, text, textarea } from "./common";

export const DAMAGE_TYPES = ["normal", "stun", "fire", "energy"] as const;

export const itemSchema = objectSchema({
  weight: numberField({ minimum: 0, default: 1 }, "Encumbrance units (p. 28)."),
  cost: numberField({ minimum: 0, default: 0 }, "Price in dollars."),
  special: stringArray("Special tags, e.g. armor piercing, full auto."),
  effect: stringField("What the item does when used."),
  supply: intField(0, undefined, undefined, "Supply rating for consumables (p. 28-29)."),
  // weapon
  bonus: intField(undefined, undefined, 0, "Gear bonus added to the dice pool."),
  damage: intField(0, undefined, 1),
  damageType: enumField(DAMAGE_TYPES, "normal"),
  range: enumField(RANGE_IDS, "short", "Maximum range band (p. 55)."),
  rangeMin: enumField(RANGE_IDS, undefined, "Minimum range band, for launchers."),
  ammo: { type: ["integer", "string"], description: "Ammo supply rating or note." },
  power: intField(0, undefined, undefined, "Power supply rating."),
  // armor
  armorRating: intField(0, undefined, 0, "(p. 66)"),
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
        number("cost", "Cost ($)"),
        tags("special", "Special"),
        textarea("effect", "Effect"),
      ],
    },
  ],
  summary: ["weight", "cost"],
});

const weaponSheet: SheetLayout = {
  ...common([
    number("bonus", "Bonus", { rule: "alien.rule.weapons" }),
    number("damage", "Damage", { rule: "alien.rule.damage-armor" }),
    select("damageType", "Damage type", [...DAMAGE_TYPES], { span: 3, rule: "alien.rule.damage-types" }),
    select("range", "Range", [...RANGE_IDS], { span: 3, rule: "alien.rule.range-bands" }),
    select("rangeMin", "Min range", [...RANGE_IDS], { span: 3, rule: "alien.rule.range-bands" }),
    text("ammo", "Ammo", { span: 3, rule: "alien.rule.consumables" }),
    number("power", "Power", { rule: "alien.rule.consumables" }),
  ]),
  summary: ["bonus", "damage", "range", "weight"],
};

const armorSheet: SheetLayout = {
  ...common([
    number("armorRating", "Armor Rating", { rule: "alien.rule.armor" }),
    number("airSupply", "Air supply", { rule: "alien.rule.consumables" }),
  ]),
  summary: ["armorRating", "airSupply", "weight"],
};

const consumableSheet: SheetLayout = {
  ...common([number("supply", "Supply", { rule: "alien.rule.supply-rolls" })]),
  summary: ["supply", "weight", "cost"],
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
    { id: "tool", name: "Tool", sheet: consumableSheet },
    { id: "medical", name: "Medical", sheet: consumableSheet },
    { id: "pharmaceutical", name: "Pharmaceutical", sheet: consumableSheet },
    { id: "food", name: "Food", sheet: consumableSheet },
    { id: "other", name: "Other", sheet: consumableSheet },
  ],
};
