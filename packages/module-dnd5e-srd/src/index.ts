/**
 * 5th Edition SRD 5.1 & 5.2 (fantasy d20) as a built-in Campaign Forge data pack.
 *
 * The pack is plain JSON in `pack/`: the converted SRD 5.1 and the SRD 5.2
 * character options (CC-BY-4.0; see NOTICE) and the module's own tables,
 * generators, templates and play advice.
 * Each file is loaded lazily, so a bundler gives every one its own chunk.
 * `scripts/build-pack.ts` regenerates the files from the SRD data.
 */
import type { PackSource } from "@campaign-forge/module-sdk";

const json = (load: () => Promise<{ default: unknown }>) => () => load().then((m) => m.default);

export const dnd5eSrdSource: PackSource = {
  main: json(() => import("../pack/pack.json", { with: { type: "json" } })),
  parts: {
    "srd-basics.json": json(() => import("../pack/srd-basics.json", { with: { type: "json" } })),
    "srd-rules.json": json(() => import("../pack/srd-rules.json", { with: { type: "json" } })),
    "srd-character.json": json(() => import("../pack/srd-character.json", { with: { type: "json" } })),
    "srd-spells.json": json(() => import("../pack/srd-spells.json", { with: { type: "json" } })),
    "srd-equipment.json": json(() => import("../pack/srd-equipment.json", { with: { type: "json" } })),
    "srd-monsters-1.json": json(() => import("../pack/srd-monsters-1.json", { with: { type: "json" } })),
    "srd-monsters-2.json": json(() => import("../pack/srd-monsters-2.json", { with: { type: "json" } })),
    "tables.json": json(() => import("../pack/tables.json", { with: { type: "json" } })),
  },
};

/**
 * "Thornwick Homebrew": an original fixture supplement for this module (a
 * people, a background, two subclasses, a feat, a table, a house rule). The
 * Thornwick Crossing demo installs it; tests and the docs use it as the worked
 * example of the supplement format. Loaded lazily, like the pack's own files.
 */
export const THORNWICK_SUPPLEMENT_ID = "thornwick-homebrew";
export const thornwickHomebrewSupplement = json(() => import("../supplements/thornwick-homebrew.supplement.json", { with: { type: "json" } }));
