/** Campaign Forge demo campaign builder. Browser-safe: no node: imports (file I/O is in cli.ts). */
export { buildDemoCampaign, demoCampaignJSON, DEMO_SEED, DEMO_NAME, DEMO_FRAME } from "./build";
export type { BuildDemoOptions, DemoCampaign } from "./build";
export { buildCinematicDemo, cinematicDemoJSON, CINEMATIC_DEMO_SEED, CINEMATIC_DEMO_NAME, CINEMATIC_ADVENTURE_TITLE } from "./cinematic";
export type { BuildCinematicDemoOptions, CinematicDemoCampaign } from "./cinematic";
export { buildDnd5eDemo, dnd5eDemoJSON, DND5E_DEMO_SEED, DND5E_DEMO_NAME, DND5E_ADVENTURE_TITLE, DND5E_MODULE_ID } from "./dnd5e";
export type { BuildDnd5eDemoOptions, Dnd5eDemoCampaign } from "./dnd5e";
export { startInfection } from "./infection";
export type { StartInfectionInput } from "./infection";
