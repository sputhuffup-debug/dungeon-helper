import type { ReferenceList } from "@campaign-forge/module-sdk";

/** Twelve skills, each bound to one attribute (list p. 42, descriptions p. 46-47). Paraphrased summaries. */
export const skills: ReferenceList = {
  id: "alien.skills",
  name: "Skills",
  page: [42, 47],
  itemSchema: {
    type: "object",
    required: ["id", "name", "attribute"],
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      attribute: { type: "string", enum: ["strength", "agility", "wits", "empathy"] },
      summary: { type: "string" },
      page: { type: ["integer", "array"] },
    },
  },
  items: [
    { id: "heavyMachinery", name: "Heavy Machinery", attribute: "strength", summary: "Use, repair, jury-rig or break heavy machinery of any kind.", page: 46 },
    { id: "closeCombat", name: "Close Combat", attribute: "strength", summary: "Attack someone up close, armed or unarmed.", page: 46 },
    { id: "stamina", name: "Stamina", attribute: "strength", summary: "Test physical endurance: survive vacuum, resist contagion, make death rolls.", page: 46 },
    { id: "rangedCombat", name: "Ranged Combat", attribute: "agility", summary: "Fire any kind of ranged weapon.", page: 46 },
    { id: "mobility", name: "Mobility", attribute: "agility", summary: "Acrobatic or risky movement: dangerous climbs, jumps and dodges.", page: 46 },
    { id: "piloting", name: "Piloting", attribute: "agility", summary: "Hard manoeuvres at the helm of any spacecraft; also drives ground vehicles.", page: 46 },
    { id: "observation", name: "Observation", attribute: "wits", summary: "Spot sneaking enemies, search zones and size up unknown threats.", page: 46 },
    { id: "survival", name: "Survival", attribute: "wits", summary: "Endure hazardous environments and avoid fatigue from heat, cold or storms.", page: 46 },
    { id: "comtech", name: "Comtech", attribute: "wits", summary: "Program, repair, decrypt or manipulate computers and comms gear.", page: 46 },
    { id: "manipulation", name: "Manipulation", attribute: "empathy", summary: "Make someone see things your way; affected by negotiating position.", page: 47 },
    { id: "command", name: "Command", attribute: "empathy", summary: "Stop panic in other PCs and give orders in combat.", page: 46 },
    { id: "medicalAid", name: "Medical Aid", attribute: "empathy", summary: "Give first aid to the dying and make medical examinations.", page: 47 },
  ],
};
