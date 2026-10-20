/** Campaign Forge demo campaign builder. Browser-safe: no node: imports (file I/O is in cli.ts). */
export { buildDemoCampaign, demoCampaignJSON, DEMO_SEED, DEMO_NAME, DEMO_FRAME } from "./build";
export type { BuildDemoOptions, DemoCampaign } from "./build";
export { buildCinematicDemo, cinematicDemoJSON, CINEMATIC_DEMO_SEED, CINEMATIC_DEMO_NAME, CINEMATIC_ADVENTURE_TITLE } from "./cinematic";
export type { BuildCinematicDemoOptions, CinematicDemoCampaign } from "./cinematic";
export { startInfection } from "./infection";
export type { StartInfectionInput } from "./infection";
