import type { EntityTypeDef } from "@campaign-forge/module-sdk";
import { checkbox, intField, number, objectSchema, stringField, text, textarea } from "./common";

export const creatureSchema = objectSchema({
  species: stringField('Species id, e.g. "xx121", "neomorph".', { default: "xx121" }),
  stage: stringField("Lifecycle stage, e.g. I-VI for XX121 (p. 209-221)."),
  variant: stringField("Variant within a stage, e.g. drone, soldier, queen."),
  speed: intField(0, undefined, 1, "Initiative cards drawn per round (p. 208)."),
  health: intField(0, undefined, 1),
  mobility: intField(0, undefined, 0, "Dice rolled to move, dodge or chase (p. 208)."),
  observation: intField(0, undefined, 0, "Dice rolled to spot hidden characters (p. 208)."),
  armor: intField(0, undefined, 0, "Armor Rating (p. 208)."),
  armorNotes: stringField("Conditional overrides, e.g. vs. fire."),
  acidSplash: intField(0, undefined, undefined, "Acid splash damage dice when hit in close quarters (p. 208)."),
  attacks: {
    type: "array",
    default: [],
    description: "Signature attack table: roll a D6 each attack (p. 208).",
    items: {
      type: "object",
      required: ["roll", "name"],
      properties: {
        roll: intField(1, 6),
        name: { type: "string" },
        dice: intField(0, undefined, undefined, "Attack dice (no push, no stress dice)."),
        damage: { type: ["integer", "string"] },
        armorPiercing: { type: "boolean", default: false },
        effect: { type: "string" },
      },
    },
  },
  abilities: {
    type: "array",
    default: [],
    items: {
      type: "object",
      required: ["name"],
      properties: { name: { type: "string" }, text: { type: "string" }, page: { type: ["integer", "array"] } },
    },
  },
  lifecycleTrigger: stringField("What moves this creature to its next stage (p. 209-221)."),
  containment: stringField("Containment protocol notes (p. 227-231)."),
  loreOnly: { type: "boolean", default: false, description: "No stats in the book (e.g. Stage VII+); a lore record." },
});

export const creatureType: EntityTypeDef = {
  id: "alien.creature",
  kind: "creature",
  name: "Creature",
  plural: "Creatures",
  icon: "bug",
  schema: creatureSchema,
  sheet: {
    sections: [
      {
        id: "identity",
        title: "Species",
        columns: 4,
        fields: [
          text("species", "Species", { span: 4, rule: "alien.rule.lifecycle" }),
          text("stage", "Stage", { span: 4, rule: "alien.rule.lifecycle" }),
          text("variant", "Variant", { span: 4 }),
          checkbox("loreOnly", "Lore only (no stats)"),
        ],
      },
      {
        id: "stats",
        title: "Stats",
        columns: 4,
        fields: [
          number("speed", "Speed", { rule: "alien.rule.creature-attacks" }),
          number("health", "Health"),
          number("mobility", "Mobility", { rule: "alien.rule.creature-attacks" }),
          number("observation", "Observation", { rule: "alien.rule.stealth-mode" }),
          number("armor", "Armor Rating", { rule: "alien.rule.creature-armor" }),
          text("armorNotes", "Armor notes", { span: 6 }),
          number("acidSplash", "Acid splash", { rule: "alien.rule.acid-splash" }),
        ],
      },
      {
        id: "attacks",
        title: "Signature attacks",
        fields: [
          {
            path: "attacks",
            label: "Signature attacks (D6)",
            widget: "table",
            span: 12,
            rule: "alien.rule.creature-attacks",
            config: {
              columns: [
                { path: "roll", label: "D6" },
                { path: "name", label: "Attack" },
                { path: "dice", label: "Dice" },
                { path: "damage", label: "Damage" },
                { path: "armorPiercing", label: "AP" },
                { path: "effect", label: "Effect" },
              ],
            },
          },
        ],
      },
      {
        id: "abilities",
        title: "Special abilities",
        fields: [
          {
            path: "abilities",
            label: "Abilities",
            widget: "list",
            span: 12,
            rule: "alien.rule.creature-abilities",
            config: { columns: [{ path: "name", label: "Name" }, { path: "text", label: "Effect" }, { path: "page", label: "Page" }] },
          },
        ],
      },
      {
        id: "lifecycle",
        title: "Lifecycle & containment",
        columns: 1,
        fields: [
          textarea("lifecycleTrigger", "Lifecycle trigger", { rule: "alien.rule.lifecycle" }),
          textarea("containment", "Containment protocol", { rule: "alien.rule.containment" }),
        ],
      },
    ],
    summary: ["species", "stage", "speed", "health", "armor"],
  },
  defaultVisibility: { attacks: "gm", abilities: "gm", lifecycleTrigger: "gm", containment: "gm", health: "gm", armor: "gm" },
};
