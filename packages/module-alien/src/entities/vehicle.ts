import type { EntityTypeDef } from "@campaign-forge/module-sdk";
import { intField, number, numberField, objectSchema, stringArray, stringField, tags, text, textarea } from "./common";

export const vehicleSchema = objectSchema({
  length: stringField("e.g. 6 m"),
  passengers: { type: ["integer", "string"] },
  maneuverability: intField(undefined, undefined, 0, "Modifier to Piloting (p. 100)."),
  speed: intField(0, undefined, 1),
  hull: intField(0, undefined, 1, "Hull points, the vehicle's health."),
  armor: intField(0, undefined, 0),
  weapons: stringArray(),
  cost: numberField({ minimum: 0, default: 0 }),
  encountered: stringField("Where it is typically seen."),
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
          number("cost", "Cost ($)"),
          tags("weapons", "Weapons"),
          textarea("encountered", "Encountered"),
        ],
      },
    ],
    summary: ["speed", "hull", "armor"],
  },
};
