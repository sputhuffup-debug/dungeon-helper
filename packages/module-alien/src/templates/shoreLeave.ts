import type { Template } from "@campaign-forge/module-sdk";
import { CAMPAIGN } from "../modes";

/** Shore leave week (p. 257): one choice per PC, then an event roll. */
export const shoreLeaveTemplate: Template = {
  id: "alien.template.shore-leave-week",
  kind: "session",
  name: "Shore leave week",
  description: "A week between jobs: each PC picks Heal, Recover, Pursue Agenda or Socialize, then roll a shore leave event.",
  mode: [CAMPAIGN],
  page: 257,
  scaffold: {
    location: { entityType: "alien.location", value: "", note: "Where the crew spends the week" },
    choices: [
      { id: "heal", label: "Heal", effect: "Recover lost Health and progress critical injuries; a medical facility helps.", page: 257 },
      { id: "recover", label: "Recover", effect: "Shed stress and attempt to treat a mental trauma (p. 74).", page: 257 },
      { id: "pursue-agenda", label: "Pursue Agenda", effect: "Work on the personal agenda; counts toward the XP question.", page: 257 },
      { id: "socialize", label: "Socialize", effect: "Spend time with buddy, rival or NPCs; build contacts, roll for a social event.", page: 257 },
    ],
    perCharacter: [
      { character: "<PC>", choice: "", outcome: "", note: "One row per PC; choice is one of the four ids above" },
    ],
    eventTable: { marines: "alien.shore-leave.marines", others: "alien.shore-leave.others", note: "Table ids owned by tables/; roll once for the crew or once per PC" },
    eventResult: "",
    costs: { note: "Lodging, repairs, medical bills; deduct from cash" },
    nextJob: { entityType: "alien.job", value: "" },
  },
};
