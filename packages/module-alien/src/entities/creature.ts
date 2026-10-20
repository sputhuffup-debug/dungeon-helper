import type { EntityTypeDef } from "@campaign-forge/module-sdk";
import { checkbox, intField, number, objectSchema, stringField, text, textarea } from "./common";

export const creatureSchema = objectSchema({
  species: stringField('Species id, e.g. "xx121", "neomorph".', { default: "xx121" }),
  stage: stringField("Lifecycle stage, e.g. I-VI for XX121 (p. 209-221), I-V for the Neomorph (p. 223-225)."),
  variant: stringField("Variant within a stage, e.g. drone, soldier, queen."),
  classification: stringField("Type line for other species, e.g. Arthropod Carnivore (p. 228-231)."),
  habitat: stringField(),
  size: stringField(),
  speed: intField(0, undefined, 1, "Full turns per round; draw one initiative card per point (p. 208)."),
  health: intField(0, undefined, 1, "Maximum Health (p. 208-231)."),
  damage: intField(0, undefined, 0, "Damage taken; Health left is computed, never stored. What zero Health means is in the combat rules (p. 209)."),
  mobility: intField(0, undefined, undefined, "MOBILITY skill level: base dice only, no attributes (p. 208). Absent when the book gives none."),
  observation: intField(0, undefined, undefined, "OBSERVATION skill level (p. 208). Absent when the book gives none."),
  armor: intField(0, undefined, undefined, "Armor Level (p. 209). Absent when the creature has no numeric armor."),
  armorVsFire: intField(0, undefined, undefined, "Armor Level against fire, where the book gives one."),
  armorNotes: stringField("Conditional armor as printed, e.g. \"1 vs fire\"."),
  acidSplash: intField(0, undefined, undefined, "Acid Splash rating: added to the damage taken for the splash base dice (p. 210)."),
  attackTable: stringField("Id of the signature attack table this creature rolls on."),
  attacks: {
    type: "array",
    default: [],
    description: "Signature attacks: roll a D6 on the creature's table each turn, re-rolling a repeat (p. 208).",
    items: {
      type: "object",
      required: ["roll", "name"],
      properties: {
        roll: intField(1, 6, undefined, "Lowest D6 result of the row."),
        rollTo: intField(1, 99, undefined, "Highest D6 result when the row spans several (99 = and above)."),
        name: { type: "string" },
        dice: intField(0, undefined, undefined, "Base dice (never pushed); 0 when no attack roll."),
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
  swarmSpeed: {
    type: "array",
    description: "Facehugger swarm Speed by number of facehuggers (p. 213).",
    items: { type: "object", required: ["min", "speed"], properties: { min: intField(1), max: intField(1), speed: intField(1) } },
  },
  lifecycleTrigger: stringField("What moves this creature to its next stage (p. 212-225)."),
  containment: stringField("Containment & Termination Protocol notes (p. 212-231)."),
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
          text("classification", "Type", { span: 4 }),
          text("habitat", "Habitat", { span: 4 }),
          text("size", "Size", { span: 4 }),
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
          number("damage", "Damage taken", { rule: "alien.rule.damage-armor" }),
          { path: "healthRemaining", label: "Health left", widget: "computed", span: 3, readonly: true, rule: "alien.rule.broken-xenomorph" },
          number("mobility", "Mobility", { rule: "alien.rule.creature-attacks" }),
          number("observation", "Observation", { rule: "alien.rule.stealth-mode" }),
          number("armor", "Armor Level", { rule: "alien.rule.creature-armor" }),
          number("armorVsFire", "Armor vs fire", { rule: "alien.rule.creature-armor" }),
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
                { path: "rollTo", label: "to" },
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
  computed: {
    /** Health left after the damage taken (p. 209). */
    healthRemaining: { max: [0, { "-": [{ var: ["fields.health", 0] }, { var: ["fields.damage", 0] }] }] },
  },
  defaultVisibility: { damage: "gm", attacks: "gm", abilities: "gm", lifecycleTrigger: "gm", containment: "gm", health: "gm", armor: "gm" },
};
