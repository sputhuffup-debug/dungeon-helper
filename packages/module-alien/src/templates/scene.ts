import type { Template } from "@campaign-forge/module-sdk";
import { CAMPAIGN, CINEMATIC } from "../modes";

/** A scene or event (p. 157): the unit the GM runs at the table, with its zones (p. 54-55). */
export const sceneTemplate: Template = {
  id: "alien.template.scene",
  kind: "scene",
  name: "Scene",
  description: "Purpose, location with zone map, participants, encounter, clues and the triggers that move play on; mandatory or optional like a cinematic event.",
  mode: [CINEMATIC, CAMPAIGN],
  page: 157,
  scaffold: {
    purpose: "_What this scene is for in one line._",
    body: "",
    mandatory: false,
    location: { entityType: "alien.location", value: "", note: "A site with a zone map if stealth or combat is likely (p. 54-55)" },
    participants: { entityTypes: ["alien.character", "alien.creature"], value: [] },
    encounter: { entityType: "alien.encounter", value: "", note: "Optional: a rolled or planned encounter" },
    clues: { entityType: "alien.clue", value: [] },
    triggers: [{ when: "", then: "", note: "e.g. when the power fails; in stealth mode a Xenomorph moves one zone per point of Speed each stretch (p. 55)" }],
    stress: { note: "Expected stress and panic sources: pushes, horrors seen, Xenomorphs at Adjacent range (p. 72)" },
    exits: [{ to: "", note: "Which scene follows and why" }],
  },
};
