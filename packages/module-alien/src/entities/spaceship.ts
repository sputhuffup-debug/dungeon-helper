import type { EntityTypeDef } from "@campaign-forge/module-sdk";
import { SHIP_CLASS_IDS, enumField, intField, number, numberField, objectSchema, select, stringArray, stringField, text } from "./common";

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
};
