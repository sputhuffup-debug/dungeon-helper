import type { EntityTypeDef } from "@campaign-forge/module-sdk";
import { checkbox, enumField, objectSchema, select, stringField, text, textarea } from "./common";

export const CLUE_KINDS = ["physical", "document", "testimony", "sensor", "medical", "other"] as const;

export const clueSchema = objectSchema({
  clueKind: enumField(CLUE_KINDS, "other"),
  text: stringField("What the players learn when they find it."),
  truth: stringField("GM-only: what it really means."),
  foundBy: stringField("Skill or action that reveals it, e.g. Observation, Comtech."),
  revealed: { type: "boolean", default: false },
  pointsTo: stringField("Entity id or note this clue leads to."),
});

export const clueType: EntityTypeDef = {
  id: "alien.clue",
  kind: "clue",
  name: "Clue",
  plural: "Clues",
  icon: "search",
  schema: clueSchema,
  sheet: {
    sections: [
      {
        id: "clue",
        title: "Clue",
        columns: 4,
        fields: [
          select("clueKind", "Kind", [...CLUE_KINDS], { span: 4 }),
          text("foundBy", "Found by", { span: 5, rule: "alien.rule.skill-rolls" }),
          checkbox("revealed", "Revealed"),
          textarea("text", "Player-facing text"),
          textarea("truth", "Truth (GM)"),
          text("pointsTo", "Points to", { span: 12 }),
        ],
      },
    ],
    summary: ["clueKind", "revealed"],
  },
  defaultVisibility: { truth: "gm", pointsTo: "gm", text: "some_players" },
};
