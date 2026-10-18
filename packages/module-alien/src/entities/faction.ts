import type { EntityTypeDef } from "@campaign-forge/module-sdk";
import { ALLEGIANCE_IDS, checkbox, enumField, intField, objectSchema, select, stringField, text, textarea } from "./common";

export const FACTION_TYPES = ["corporation", "government", "military", "colonial", "other"] as const;

export const factionSchema = objectSchema({
  factionType: enumField(FACTION_TYPES, "other"),
  allegiance: enumField(ALLEGIANCE_IDS, "unknown"),
  history: stringField(),
  products: stringField("Products and services (corporations)."),
  military: stringField("Military assets (governments, militaries)."),
  leaders: stringField(),
  locations: stringField(),
  relations: stringField("Relations with other factions."),
  currentActivities: stringField(),
  reputation: intField(-5, 5, 0, "How the crew stands with this faction; module convention, not a book rule."),
  minor: { type: "boolean", default: false, description: "A minor corporation from the list (p. 162)." },
  sector: stringField("Line of business (minor corporations)."),
  notableNpc: {
    type: "object",
    description: "The featured NPC of a book entry (p. 163-177).",
    properties: { name: { type: "string" }, role: { type: "string" }, hook: { type: "string" } },
  },
});

export const factionType: EntityTypeDef = {
  id: "alien.faction",
  kind: "faction",
  name: "Faction",
  plural: "Factions",
  icon: "flag",
  schema: factionSchema,
  sheet: {
    sections: [
      {
        id: "overview",
        title: "Overview",
        columns: 4,
        fields: [
          select("factionType", "Type", [...FACTION_TYPES], { span: 3, rule: "alien.rule.factions" }),
          select("allegiance", "Allegiance", [...ALLEGIANCE_IDS], { span: 3, rule: "alien.rule.allegiance" }),
          { path: "reputation", label: "Reputation", widget: "number", span: 3 },
          checkbox("minor", "Minor corporation", { rule: "alien.rule.minor-corporations" }),
        ],
      },
      {
        id: "dossier",
        title: "Dossier",
        columns: 1,
        fields: [
          textarea("history", "History"),
          textarea("products", "Products"),
          textarea("military", "Military"),
          textarea("leaders", "Leaders"),
          textarea("locations", "Locations"),
          textarea("relations", "Relations"),
          textarea("currentActivities", "Current activities"),
        ],
      },
      {
        id: "notable-npc",
        title: "Featured NPC",
        columns: 1,
        fields: [text("notableNpc.name", "Name"), text("notableNpc.role", "Role"), textarea("notableNpc.hook", "Hook")],
      },
    ],
    summary: ["factionType", "allegiance", "reputation"],
  },
  defaultVisibility: { currentActivities: "gm", relations: "gm", reputation: "gm", notableNpc: "gm" },
};
