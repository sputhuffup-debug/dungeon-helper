/**
 * Campaign arcs for Alien campaign play (module-original conventions, no
 * book rule): threads dealt by `alien.campaign-thread`, clues the job board
 * seeds into postings, faction heat from unnoticed to hunted, thread clocks
 * that tick in the between-jobs flow and contacts the crew keeps.
 *
 * Between jobs each active thread rolls a D6: 1-2 the sponsor waits, 3-5 its
 * clock moves one segment, 6 two; a thread the crew ignored (no clue found
 * since its last tick) moves one more.
 */
import type { ArcsDef } from "@campaign-forge/module-sdk";
import { CAMPAIGN } from "./modes";
import { BETWEEN_JOBS_ID } from "./procedures/between-jobs";
import { CAMPAIGN_THREAD_ID } from "./procedures/campaign-thread";
import { ARC_SLOTS, HEAT_LABELS, PAYOFF_KINDS, THREAD_CLUE_KINDS } from "./procedures/campaign-thread-data";
import { JOB_BOARD_ID } from "./procedures/job-board";

export { HEAT_LABELS, ARC_SLOTS, type ArcSlotId } from "./procedures/campaign-thread-data";

export const arcs: ArcsDef = {
  label: "Arcs",
  generator: CAMPAIGN_THREAD_ID,
  boards: [JOB_BOARD_ID],
  betweenJobs: BETWEEN_JOBS_ID,
  clueKinds: THREAD_CLUE_KINDS.map((k) => ({ id: k.id, label: k.label })),
  slots: ARC_SLOTS.map((s) => ({ id: s.id, label: s.label })),
  heat: { entityTypes: ["alien.faction"], path: "heat", labels: [...HEAT_LABELS], prompt: "Who noticed the crew this job?" },
  tick: {
    dice: "1d6",
    steps: [
      { min: 1, ticks: 0, label: "The sponsor waits" },
      { min: 3, ticks: 1, label: "The sponsor moves" },
      { min: 6, ticks: 2, label: "The sponsor pushes hard" },
    ],
    ignored: 1,
  },
  payoffs: PAYOFF_KINDS.map((p) => ({ id: p.id, label: p.label })),
  contacts: { entityTypes: ["alien.character"] },
  crewNotes: { title: "Crew notes" },
  mode: [CAMPAIGN],
};
