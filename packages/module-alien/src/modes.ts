import type { PlayMode } from "@campaign-forge/module-sdk";

export const CINEMATIC = "cinematic";
export const CAMPAIGN = "campaign";

/**
 * The two game modes (p. 18). Rules that apply to only one mode carry its icon in the
 * book: at the mode descriptions (p. 18, 24), the agendas (p. 27), character development
 * (p. 30), the cinematic and campaign play sections (p. 157-159) and chapter 11 (p. 234 on).
 */
export const modes: PlayMode[] = [
  {
    id: CINEMATIC,
    name: "Cinematic",
    description:
      "A single-session adventure in three acts, like an Alien film: pregenerated PCs with a hidden agenda per act, Story Points, likely conflict between PCs and few survivors.",
    page: 18,
  },
  {
    id: CAMPAIGN,
    name: "Campaign",
    description:
      "Long-running play with player-made PCs in one of three frameworks (Space Truckers, Colonial Marines, Frontier Colonists): jobs, shore leave, experience and a home base.",
    page: 18,
  },
];
