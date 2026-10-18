import type { ReferenceList } from "@campaign-forge/module-sdk";

/** Twelve skills, each bound to one attribute (p. 42, 46-47). Paraphrased summaries. */
export const skills: ReferenceList = {
  id: "alien.skills",
  name: "Skills",
  page: [46, 47],
  unverified: true,
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
    { id: "heavyMachinery", name: "Heavy Machinery", attribute: "strength", summary: "Operate, repair and force heavy equipment, loaders and ship systems.", page: 46 },
    { id: "closeCombat", name: "Close Combat", attribute: "strength", summary: "Fight hand to hand or with melee weapons; also used to block.", page: 46 },
    { id: "stamina", name: "Stamina", attribute: "strength", summary: "Endure injury, exhaustion, cold, hunger and thin air.", page: 46 },
    { id: "rangedCombat", name: "Ranged Combat", attribute: "agility", summary: "Shoot firearms and thrown weapons at any range.", page: 46 },
    { id: "mobility", name: "Mobility", attribute: "agility", summary: "Climb, sneak, dodge, run and move under pressure.", page: 46 },
    { id: "piloting", name: "Piloting", attribute: "agility", summary: "Fly and drive ships, dropships and ground vehicles.", page: 47 },
    { id: "observation", name: "Observation", attribute: "wits", summary: "Notice hidden things, search and spot danger.", page: 47 },
    { id: "survival", name: "Survival", attribute: "wits", summary: "Stay alive in hostile environments, track and find shelter.", page: 47 },
    { id: "comtech", name: "Comtech", attribute: "wits", summary: "Use, hack and repair computers, comms and electronics.", page: 47 },
    { id: "manipulation", name: "Manipulation", attribute: "empathy", summary: "Persuade, bluff, haggle and intimidate.", page: 47 },
    { id: "command", name: "Command", attribute: "empathy", summary: "Lead others under stress; a success can let allies recover stress.", page: 47 },
    { id: "medicalAid", name: "Medical Aid", attribute: "empathy", summary: "Treat wounds, stabilise the broken and perform surgery.", page: 47 },
  ],
};
