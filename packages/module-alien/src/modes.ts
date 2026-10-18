import type { PlayMode } from "@campaign-forge/module-sdk";

export const CINEMATIC = "cinematic";
export const CAMPAIGN = "campaign";

/** The two play styles the Evolved Edition marks with icons (p. 18, 24). */
export const modes: PlayMode[] = [
  {
    id: CINEMATIC,
    name: "Cinematic",
    description:
      "One-shot or short scenario with pregenerated characters, hidden per-act agendas, Story Points and a three-act structure. High lethality.",
    page: 18,
  },
  {
    id: CAMPAIGN,
    name: "Campaign",
    description:
      "Long-form play built on a frame (Space Truckers, Colonial Marines or Frontier Colonists): player-built characters, jobs, shore leave, XP and a home base.",
    page: 24,
  },
];
