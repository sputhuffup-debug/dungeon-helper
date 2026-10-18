import type { EntityTypeDef } from "@campaign-forge/module-sdk";
import { enumField, intField, objectSchema, select, stringArray, stringField, tags, text, textarea } from "./common";

export const ENCOUNTER_SETTINGS = ["star-system", "ship", "surface", "colony", "colony-area", "derelict", "other"] as const;

export const encounterSchema = objectSchema({
  setting: enumField(ENCOUNTER_SETTINGS, "other", "Where the encounter table came from (p. 252-257)."),
  tableId: stringField("Encounter table id that produced it."),
  rollTotal: intField(),
  summary: stringField(),
  participants: stringArray("Entity ids of NPCs, creatures or ships involved."),
  threat: intField(0, 3, 1, "Module convention: 0 flavour, 1 tense, 2 dangerous, 3 lethal."),
  outcome: stringField("What happened when it was played."),
});

export const encounterType: EntityTypeDef = {
  id: "alien.encounter",
  kind: "encounter",
  name: "Encounter",
  plural: "Encounters",
  icon: "zap",
  schema: encounterSchema,
  sheet: {
    sections: [
      {
        id: "encounter",
        title: "Encounter",
        columns: 4,
        fields: [
          select("setting", "Setting", [...ENCOUNTER_SETTINGS], { span: 4, rule: "alien.rule.encounter-cadence" }),
          text("tableId", "Table", { span: 5 }),
          { path: "rollTotal", label: "Roll", widget: "number", span: 3 },
          { path: "threat", label: "Threat", widget: "number", span: 3 },
          textarea("summary", "Summary"),
          tags("participants", "Participants"),
          textarea("outcome", "Outcome"),
        ],
      },
    ],
    summary: ["setting", "threat"],
  },
  defaultVisibility: { summary: "gm", outcome: "gm", participants: "gm" },
};
