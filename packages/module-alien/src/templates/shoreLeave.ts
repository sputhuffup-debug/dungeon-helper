import type { Template } from "@campaign-forge/module-sdk";
import { CAMPAIGN } from "../modes";

/** Shore leave week (p. 257-258): one activity per PC each week, living expenses (p. 116). */
export const shoreLeaveTemplate: Template = {
  id: "alien.template.shore-leave-week",
  kind: "session",
  name: "Shore leave week",
  description: "A week of downtime at a colony or station: each PC picks Heal, Recover, Pursue Agenda or Socialize, and everyone pays their living expenses.",
  mode: [CAMPAIGN],
  page: 257,
  scaffold: {
    location: { entityType: "alien.location", value: "", note: "Where the crew spends the week" },
    choices: [
      { id: "heal", label: "Heal", effect: "A PC with critical injuries spends the week letting them heal (healing times, p. 71).", page: 257 },
      { id: "recover", label: "Recover", effect: "Rest, soul-searching or counseling: roll Empathy, no pushing; success removes one mental trauma (p. 74).", page: 257 },
      { id: "pursue-agenda", label: "Pursue Agenda", effect: "Work on the personal agenda (p. 27), kept short at the table; success earns 1 XP.", page: 257 },
      { id: "socialize", label: "Socialize", effect: "Mix with the locals and roll once on the matching shore leave events table.", page: 257 },
    ],
    perCharacter: [
      { character: "<PC>", choice: "", outcome: "", note: "One row per PC per week; choice is one of the four ids above" },
    ],
    eventTable: {
      marines: "alien.shore-leave.marines",
      others: "alien.shore-leave.others",
      note: "Socializing PCs roll once each: Colonial Marines on the Marines table (p. 257), everyone else on the others table (p. 258)",
    },
    eventResult: "",
    costs: {
      note: "PCs pay their way each week (p. 116): minimum $25, basic $100, normal $300, luxurious $2,000",
      livingStandard: "normal",
    },
    nextJob: { entityType: "alien.job", value: "" },
  },
};
