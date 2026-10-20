import type { EntityTypeDef } from "@campaign-forge/module-sdk";
import { SHIP_CLASS_IDS, enumField, intField, number, numberField, objectSchema, select, stringArray, stringField, text } from "./common";

/** Who the ship belongs to. Most are company or military ships run by employees; a proven crew may lease one (p. 121, 234). */
export const SHIP_OWNERSHIP = ["company", "leased", "owned"] as const;
/** A typical lease costs 2% of the ship's price a year (p. 121). */
export const LEASE_RATE_PER_YEAR = 0.02;

const componentDamageItem = {
  type: "object",
  properties: {
    name: { type: "string", title: "Damage", description: "Entry name from the minor (p. 145) or major (p. 146) component damage table." },
    severity: { type: "string", enum: ["minor", "major"], default: "minor" },
    effect: { type: "string" },
    heavyMachinery: { type: "integer", minimum: 0, default: 0, title: "Heavy Machinery rolls", description: "Repair rolls still needed, one per shift, each using a mechanical spare part (p. 147)." },
    comtech: { type: "integer", minimum: 0, default: 0, title: "Comtech rolls", description: "Repair rolls still needed, one per shift, each using an electronic spare part (p. 147)." },
    system: { type: "string", description: "What it hits (e.g. ftl-drive, navigation, cryo); travel reads it." },
  },
  required: ["name"],
};

/** Spaceship stat block as printed on p. 128-137 (attributes explained on p. 122). */
export const spaceshipSchema = objectSchema({
  shipClass: enumField(SHIP_CLASS_IDS, "M", "Ship class letter (p. 121)."),
  designation: stringField("Role line under the name, e.g. Commercial Starfreighter."),
  manufacturer: stringField(),
  cost: numberField({ minimum: 0, default: 0 }, "Price in W-Y dollars."),
  crew: { type: ["integer", "string"] },
  signature: intField(undefined, undefined, 0, "Modifier for enemies trying to target lock the ship (p. 143)."),
  ai: stringField("Ship AI, e.g. MU/TH/UR 6000, or None."),
  thrusters: intField(undefined, undefined, 0, "Modifier to PILOTING rolls when maneuvering (p. 143)."),
  length: stringField(),
  hull: intField(0, undefined, 1, "Damage the ship takes before it is disabled (p. 146)."),
  ftl: intField(0, undefined, 1, "FTL rating: days to travel one parsec (p. 122)."),
  armor: intField(0, undefined, 0, "Armor level, on the spaceship scale (p. 127, 144)."),
  passengers: { type: ["integer", "string"] },
  troops: intField(0, undefined, undefined, "Troop capacity."),
  modules: stringArray("Internal module ids (alien.ship-modules, p. 123); one entry per module fitted."),
  upgrades: stringArray("Upgrade ids (alien.ship-upgrades, p. 127); one entry per purchase."),
  armaments: stringArray("Armament ids (alien.ship-armaments, p. 125)."),
  munitions: {
    type: "object",
    description: "Missiles or mines carried, by armament id, e.g. { \"long-lance-asat-missile\": 8 }.",
    additionalProperties: { type: "integer", minimum: 0 },
    default: {},
  },
  // -- state in play (stored); maxima come from the stat line above --
  hullDamage: intField(0, undefined, 0, "Damage taken. Hull left is computed; at damage equal to Hull the ship is disabled (p. 146)."),
  componentDamage: { type: "array", items: componentDamageItem, default: [], description: "Component damage not yet repaired (p. 145-147)." },
  spareParts: {
    type: "object",
    description: "Spare parts aboard: one mechanical per Heavy Machinery repair roll, one electronic per Comtech roll, used up on a success (p. 147).",
    properties: { mechanical: { type: "integer", minimum: 0, default: 0 }, electronic: { type: "integer", minimum: 0, default: 0 } },
    default: { mechanical: 0, electronic: 0 },
  },
  provisions: intField(0, undefined, 0, "Days of food and water aboard for one person. Everyone awake eats and drinks every day (p. 75); a prefab meal and a water ration cover a day (p. 99). Sleepers in hypersleep use none."),
  cargo: {
    type: "array",
    default: [],
    description: "What is in the holds. A cargo bay module's size sets how much fits (p. 123).",
    items: { type: "object", properties: { item: { type: "string" }, amount: { type: "string" }, note: { type: "string" } }, required: ["item"] },
  },
  ownership: enumField(SHIP_OWNERSHIP, "company", "Company or military ship (the crew are employees), leased (2% of the price a year, p. 121), or owned outright."),
});

export const spaceshipType: EntityTypeDef = {
  id: "alien.spaceship",
  kind: "vehicle",
  name: "Spaceship",
  plural: "Spaceships",
  icon: "rocket",
  schema: spaceshipSchema,
  sheet: {
    sections: [
      {
        id: "registry",
        title: "Registry",
        columns: 4,
        fields: [
          select("shipClass", "Class", [...SHIP_CLASS_IDS], { span: 3, rule: "alien.rule.ship-classes" }),
          text("designation", "Designation", { span: 9 }),
          text("manufacturer", "Manufacturer", { span: 5 }),
          number("cost", "Cost ($)", { span: 4 }),
          text("length", "Length", { span: 3 }),
          text("crew", "Crew", { span: 3 }),
          text("passengers", "Passengers", { span: 3 }),
          number("troops", "Troops"),
          text("ai", "AI", { span: 3 }),
        ],
      },
      {
        id: "stats",
        title: "Stats",
        columns: 4,
        fields: [
          number("signature", "Signature", { rule: "alien.rule.ship-sensors" }),
          number("thrusters", "Thrusters", { rule: "alien.rule.ship-combat" }),
          number("hull", "Hull", { rule: "alien.rule.ship-damage" }),
          number("armor", "Armor level", { rule: "alien.rule.ship-damage" }),
          number("ftl", "FTL rating", { rule: "alien.rule.ftl-travel" }),
        ],
      },
      {
        id: "condition",
        title: "Hull & spare parts",
        columns: 4,
        fields: [
          number("hullDamage", "Hull damage", { rule: "alien.rule.ship-damage" }),
          { path: "hullLeft", label: "Hull left", widget: "computed", span: 3, readonly: true, rule: "alien.rule.ship-damage" },
          { path: "majorDamageAt", label: "Major damage at", widget: "computed", span: 3, readonly: true, rule: "alien.rule.ship-damage" },
          { path: "disabled", label: "Disabled", widget: "computed", span: 3, readonly: true, rule: "alien.rule.ship-damage" },
          number("spareParts.mechanical", "Mechanical parts", { rule: "alien.rule.spare-parts" }),
          number("spareParts.electronic", "Electronic parts", { rule: "alien.rule.spare-parts" }),
        ],
      },
      {
        id: "systems",
        title: "Component damage",
        fields: [{ path: "componentDamage", label: "Damaged components", widget: "list", span: 12, rule: "alien.rule.ship-critical-damage" }],
      },
      {
        id: "stores",
        title: "Provisions & cargo",
        columns: 4,
        fields: [
          number("provisions", "Provisions (person-days)", { rule: "alien.rule.food-water" }),
          { path: "cargo", label: "Cargo", widget: "list", span: 12, rule: "alien.rule.ship-modules" },
        ],
      },
      {
        id: "upkeep",
        title: "Ownership & upkeep",
        columns: 4,
        fields: [
          select("ownership", "Ownership", [...SHIP_OWNERSHIP], { span: 4, rule: "alien.rule.ship-ownership" }),
          { path: "leasePerYear", label: "Lease a year ($)", widget: "computed", span: 4, readonly: true, rule: "alien.rule.ship-ownership" },
          { path: "leasePerWeek", label: "Lease a week ($)", widget: "computed", span: 4, readonly: true, rule: "alien.rule.ship-ownership" },
        ],
      },
      {
        id: "fit",
        title: "Modules, upgrades & armaments",
        fields: [
          { path: "modules", label: "Internal modules", widget: "reflist", span: 12, options: { ref: "alien.ship-modules" }, rule: "alien.rule.ship-modules" },
          { path: "upgrades", label: "Upgrades", widget: "reflist", span: 12, options: { ref: "alien.ship-upgrades" }, rule: "alien.rule.ship-upgrades" },
          { path: "armaments", label: "Armaments", widget: "reflist", span: 12, options: { ref: "alien.ship-armaments" }, rule: "alien.rule.ship-armaments" },
        ],
      },
    ],
    summary: ["shipClass", "hull", "armor", "ftl"],
  },
  computed: {
    hullLeft: { max: [0, { "-": [{ var: ["fields.hull", 0] }, { var: ["fields.hullDamage", 0] }] }] },
    // A single hit of at least half the Hull rating, rounded up, is major component damage (p. 146).
    majorDamageAt: { ceil: { "/": [{ var: ["fields.hull", 0] }, 2] } },
    disabled: { and: [{ ">": [{ var: ["fields.hull", 0] }, 0] }, { ">=": [{ var: ["fields.hullDamage", 0] }, { var: ["fields.hull", 0] }] }] },
    // A lease runs 2% of the price a year (p. 121); the weekly figure is that divided by 52, rounded.
    leasePerYear: { round: [{ "*": [{ var: ["fields.cost", 0] }, LEASE_RATE_PER_YEAR] }] },
    leasePerWeek: { round: [{ "/": [{ "*": [{ var: ["fields.cost", 0] }, LEASE_RATE_PER_YEAR] }, 52] }] },
  },
};
