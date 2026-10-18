/**
 * Inline fixture module for core tests.
 *
 * TODO: switch to `exampleModule` from `@campaign-forge/module-example` once
 * that package exports it (and core gains it as a devDependency). The core
 * must never import a real game module.
 */
import type { EntityTypeDef, GameModule, RelationshipTypeDef } from "@campaign-forge/module-sdk";
import { CampaignStore } from "../src";

export const PERSON: EntityTypeDef = {
  id: "example.person",
  kind: "character",
  name: "Person",
  plural: "People",
  schema: {
    type: "object",
    properties: {
      role: { type: "string" },
      secret: { type: "string" },
      stats: { type: "object", properties: { grit: { type: "number" }, wit: { type: "number" } } },
      plan: { type: "string" },
    },
  },
  sheet: {
    sections: [
      { id: "main", title: "Main", fields: [{ path: "role", label: "Role" }, { path: "stats.grit", label: "Grit" }, { path: "stats.wit", label: "Wit" }] },
      { id: "gm", title: "GM", fields: [{ path: "secret", label: "Secret" }, { path: "plan", label: "Plan" }] },
    ],
    summary: ["role"],
  },
  defaultVisibility: { secret: "gm", plan: "gm" },
};

export const PLACE: EntityTypeDef = {
  id: "example.place",
  kind: "location",
  name: "Place",
  plural: "Places",
  schema: { type: "object", properties: { climate: { type: "string" } } },
  sheet: { sections: [{ id: "main", title: "Main", fields: [{ path: "climate", label: "Climate" }] }] },
  subtypes: [
    { id: "region", name: "Region" },
    { id: "town", name: "Town" },
  ],
};

export const RIVAL_OF: RelationshipTypeDef = { id: "example.rival_of", forward: "rival of", reverse: "rival of", symmetric: true };

export const fixtureModule: GameModule = {
  manifest: {
    id: "example",
    version: "0.1.0",
    name: "Example",
    ruleset: "Example",
    licenseNotice: "Test fixture",
    requiredCore: "0.1.0",
    modes: [{ id: "default", name: "Default" }],
    defaultMode: "default",
    dataStatus: "verified",
  },
  dice: {
    dice: [{ id: "d6", name: "d6", faces: 6 }],
    buildPool: () => ({ dice: { d6: 1 } }),
    roll: (pool, rng) => {
      const dice = Object.entries(pool.dice).flatMap(([die, n]) => Array.from({ length: n }, () => ({ die, value: rng.int(1, 6) })));
      return { pool, dice, successes: dice.filter((d) => d.value === 6).length, symbols: {}, pushes: 0, canPush: false };
    },
    describe: (r) => `${r.successes} successes`,
  },
  entityTypes: [PERSON, PLACE],
  relationshipTypes: [RIVAL_OF],
  referenceLists: [],
  presets: [
    { id: "example.preset.guard", entityType: "example.person", name: "Guard", summary: "A bored guard", tags: ["npc"], fields: { role: "guard", stats: { grit: 3, wit: 2 } } },
  ],
  tables: [],
  procedures: [],
  templates: [],
  rules: [],
  trackers: [{ id: "clock", name: "Clock", kind: "clock", scope: "session" }],
  calendar: { id: "example.calendar", name: "Example calendar", defaultYear: 2200, months: [{ name: "One", days: 30 }] },
};

export function newStore(name = "Test campaign"): CampaignStore {
  return CampaignStore.create({
    name,
    moduleId: fixtureModule.manifest.id,
    moduleVersion: fixtureModule.manifest.version,
    mode: fixtureModule.manifest.defaultMode,
    calendarId: fixtureModule.calendar.id,
  });
}

/** Deterministic PRNG for property-style tests. */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
