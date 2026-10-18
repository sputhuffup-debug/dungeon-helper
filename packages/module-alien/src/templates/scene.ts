import type { Template } from "@campaign-forge/module-sdk";
import { CAMPAIGN, CINEMATIC } from "../modes";

/** A scene: the unit the GM reads at the table. */
export const sceneTemplate: Template = {
  id: "alien.template.scene",
  kind: "scene",
  name: "Scene",
  description: "Purpose, location with zone map, participants, encounter, clues and the triggers that move play on.",
  mode: [CINEMATIC, CAMPAIGN],
  page: [54, 157],
  scaffold: {
    purpose: "_What this scene is for in one line._",
    body: "",
    mandatory: false,
    location: { entityType: "alien.location", value: "", note: "A site with a zone map if stealth or combat is likely (p. 54-56)" },
    participants: { entityTypes: ["alien.character", "alien.creature"], value: [] },
    encounter: { entityType: "alien.encounter", value: "", note: "Optional: a rolled or planned encounter" },
    clues: { entityType: "alien.clue", value: [] },
    triggers: [{ when: "", then: "", note: "e.g. when the power fails, the creature moves one zone per stretch" }],
    stress: { note: "Expected stress sources: pushes, panic triggers, supply rolls" },
    exits: [{ to: "", note: "Which scene follows and why" }],
  },
};
