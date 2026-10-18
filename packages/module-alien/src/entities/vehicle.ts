import type { EntityTypeDef } from "@campaign-forge/module-sdk";
import { intField, number, numberField, objectSchema, stringArray, stringField, tags, text, textarea } from "./common";

/** Vehicle stat line as listed on p. 100 (features) and p. 313 (table). */
export const vehicleSchema = objectSchema({
  encountered: stringField("Where the vehicle is likely to be met."),
  length: stringField("Length in meters, e.g. 6.6 m."),
  passengers: { type: ["integer", "string"], description: "Riders, not counting the driver." },
  maneuverability: intField(undefined, undefined, 0, "Modifier to PILOTING rolls for hard maneuvers (\"–\" = 0)."),
  speed: intField(0, undefined, 1, "Zones per driving action."),
  hull: intField(0, undefined, 1, "Damage the vehicle takes before it is wrecked."),
  armor: intField(0, undefined, 0, "Armor level."),
  armorNote: stringField("Footnote on the armor value, e.g. exposed occupants."),
  weapons: stringArray("Typical mounted weapons, as the book names them (stats on p. 313)."),
  cost: numberField({ minimum: 0, default: 0 }, "Typical price in W-Y dollars."),
});

export const vehicleType: EntityTypeDef = {
  id: "alien.vehicle",
  kind: "vehicle",
  name: "Vehicle",
  plural: "Vehicles",
  icon: "truck",
  schema: vehicleSchema,
  sheet: {
    sections: [
      {
        id: "stats",
        title: "Stats",
        columns: 4,
        fields: [
          text("length", "Length", { span: 3 }),
          text("passengers", "Passengers", { span: 3 }),
          number("maneuverability", "Maneuverability", { rule: "alien.rule.vehicles" }),
          number("speed", "Speed", { rule: "alien.rule.vehicles" }),
          number("hull", "Hull", { rule: "alien.rule.vehicles" }),
          number("armor", "Armor", { rule: "alien.rule.vehicles" }),
          text("armorNote", "Armor note", { span: 6 }),
          number("cost", "Cost ($)"),
          tags("weapons", "Weapons"),
          textarea("encountered", "Encountered"),
        ],
      },
    ],
    summary: ["speed", "hull", "armor"],
  },
};
