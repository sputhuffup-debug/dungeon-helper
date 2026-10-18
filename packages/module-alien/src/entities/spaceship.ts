import type { EntityTypeDef } from "@campaign-forge/module-sdk";
import { SHIP_CLASS_IDS, enumField, intField, number, numberField, objectSchema, select, stringArray, stringField, text } from "./common";

export const spaceshipSchema = objectSchema({
  shipClass: enumField(SHIP_CLASS_IDS, "M", "Ship class letter (p. 121-122)."),
  manufacturer: stringField(),
  cost: numberField({ minimum: 0, default: 0 }),
  crew: { type: ["integer", "string"] },
  signature: intField(undefined, undefined, 0, "Sensor signature modifier (p. 138)."),
  ai: stringField("Ship AI, e.g. MU/TH/UR model."),
  thrusters: intField(undefined, undefined, 0, "Thruster rating (p. 138)."),
  length: stringField(),
  hull: intField(0, undefined, 1, "Hull points (p. 143)."),
  ftl: intField(0, undefined, 1, "FTL rating: days per parsec (p. 131)."),
  armor: intField(0, undefined, 0, "Armor Rating (p. 143)."),
  passengers: { type: ["integer", "string"] },
  modules: stringArray("Ship module ids (alien.ship-modules, p. 128-133)."),
  upgrades: stringArray("Upgrade ids (alien.ship-upgrades, p. 134-135)."),
  armaments: stringArray("Armament ids (alien.ship-armaments, p. 136-137)."),
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
          text("manufacturer", "Manufacturer", { span: 5 }),
          number("cost", "Cost ($)", { span: 4 }),
          text("length", "Length", { span: 3 }),
          text("crew", "Crew", { span: 3 }),
          text("passengers", "Passengers", { span: 3 }),
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
          number("armor", "Armor", { rule: "alien.rule.ship-damage" }),
          number("ftl", "FTL rating", { rule: "alien.rule.ftl-travel" }),
        ],
      },
      {
        id: "fit",
        title: "Modules, upgrades & armaments",
        fields: [
          { path: "modules", label: "Modules", widget: "reflist", span: 12, options: { ref: "alien.ship-modules" }, rule: "alien.rule.ship-modules" },
          { path: "upgrades", label: "Upgrades", widget: "reflist", span: 12, options: { ref: "alien.ship-upgrades" }, rule: "alien.rule.ship-upgrades" },
          { path: "armaments", label: "Armaments", widget: "reflist", span: 12, options: { ref: "alien.ship-armaments" }, rule: "alien.rule.ship-armaments" },
        ],
      },
    ],
    summary: ["shipClass", "hull", "armor", "ftl"],
  },
};
