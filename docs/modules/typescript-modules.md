# TypeScript modules and built-in packs

## When you need TypeScript

Write a TypeScript module when the game needs something a data pack cannot express (see [the pack format](pack-format.md#what-a-pack-cannot-do-yet)): a custom dice system or dice operations (a panic table rolled from the stress dice), combat with an armour rule, a crew ship, travel, a ledger, character progression, site map generators, guided adventure builders with code checks, end-of-session hooks, or data migrations. `packages/module-alien` uses all of them; `packages/module-example` is a small fixture of every contract feature.

A TypeScript module is a workspace package that exports a `GameModule` (`packages/module-sdk/src/types.ts` is the contract):

```sh
pnpm create-module "Moon Hunters" --engine pool --ts   # writes packages/module-moon-hunters/
pnpm install                                            # links the package
pnpm module-check packages/module-moon-hunters
pnpm --filter @campaign-forge/module-moon-hunters test
```

Rules every module follows (from `CLAUDE.md`):

1. Rules live in modules; core, sdk and ui never import a module.
2. Every table and rule card cites its source (see [licensing](licensing.md)).
3. Deterministic: same seed and module version, same output. All randomness through the `Rng` you are given; no `Math.random`, no clock.
4. Computed values are JSONLogic (`computed`), never stored.
5. No `eval`; expressions are JSONLogic.
6. The package exports from `src/index.ts`; consumers import TypeScript directly.

You can mix: keep the data in JSON (a pack) and add code around it, by building the module with `packToModule(pack)` and then adding `combat`, `hooks` and so on to the object it returns.

## Registering a built-in module

The app's registry (`apps/web/src/modules/registry.ts`) lists every built-in module with a small static manifest, so the campaign list never downloads module data. For a TypeScript module:

1. Add the package to `apps/web/package.json` dependencies (`"@campaign-forge/module-moon-hunters": "workspace:*"`) and run `pnpm install`.
2. Add an entry to `BUILTIN` in `registry.ts`:
   ```ts
   {
     id: "moon-hunters", name: "Moon Hunters", version: "0.1.0",
     modes: [/* copied from the manifest */], defaultMode: "standard", dataStatus: "unverified",
     source: "builtin", format: "ts",
     load: () => import("@campaign-forge/module-moon-hunters").then((m) => m.moonHuntersModule),
   },
   ```
   `apps/web/src/modules/registry.test.ts` fails if the static fields drift from the module's manifest.
3. If the module is large, give it a `codeSplitting` group in `apps/web/vite.config.ts` (see the Alien groups) so no chunk passes the 500 kB warning.
4. Add the id to `BUILTIN_TARGETS` in `tools/module-check/src/check.ts` (so `pnpm module-check moon-hunters` and `--all` cover it) and to `RESERVED_IDS` in `tools/create-module/src/scaffold.ts`.

## Shipping a data pack as a built-in module

A pack that ships with the app (rather than being imported by a GM) lives in a package as JSON files, loaded through a `PackSource` so each file is its own lazily loaded chunk. This is how a large pack such as the D&D 5e SRD 5.1 is meant to ship. The steps for `packages/module-dnd5e-srd`:

1. **The package.** `packages/module-dnd5e-srd/package.json`:
   ```json
   {
     "name": "@campaign-forge/module-dnd5e-srd",
     "version": "0.1.0",
     "private": true,
     "type": "module",
     "main": "./src/index.ts",
     "types": "./src/index.ts",
     "exports": { ".": "./src/index.ts" },
     "scripts": { "typecheck": "tsc --noEmit -p tsconfig.json", "test": "vitest run" },
     "dependencies": { "@campaign-forge/module-sdk": "workspace:*" },
     "devDependencies": { "typescript": "^5.9.3", "vitest": "^4.0.5" }
   }
   ```
   and a `tsconfig.json` like `packages/module-example/tsconfig.json`.

2. **The pack, split into parts.** `packages/module-dnd5e-srd/pack/pack.json` holds the manifest (id `dnd5e-srd`, `citationStyle: "section"`, the CC-BY-4.0 `license` with the SRD's attribution), the `dice` (`{ "engine": "d20", "proficiency": { "var": "computed.proficiencyBonus" } }`), the entity types and the rule cards, and lists its parts: `"parts": ["monsters.json", "spells.json", "equipment.json", "tables.json"]`. Each part (`"format": "campaign-forge-pack-part"`, `"pack": "dnd5e-srd"`, `"name": "monsters.json"`) carries presets, reference lists or tables. Keep every file under about 2 MB: each becomes one precached chunk, and the PWA precache skips files over `maximumFileSizeToCacheInBytes` (8 MB, `apps/web/vite.config.ts`). SRD text is openly licensed, so rule cards may use it as written; cite each by section (`"cite": "SRD 5.1, Conditions: Prone"`).

3. **The source.** `packages/module-dnd5e-srd/src/index.ts`:
   ```ts
   import type { PackSource } from "@campaign-forge/module-sdk";

   const json = (load: () => Promise<{ default: unknown }>) => () => load().then((m) => m.default);

   /** D&D 5e SRD 5.1 as a data pack: one lazy chunk per file. */
   export const dnd5eSrdSource: PackSource = {
     main: json(() => import("../pack/pack.json", { with: { type: "json" } })),
     parts: {
       "monsters.json": json(() => import("../pack/monsters.json", { with: { type: "json" } })),
       "spells.json": json(() => import("../pack/spells.json", { with: { type: "json" } })),
       "equipment.json": json(() => import("../pack/equipment.json", { with: { type: "json" } })),
       "tables.json": json(() => import("../pack/tables.json", { with: { type: "json" } })),
     },
   };
   ```
   The `with { type: "json" }` attribute lets the same import work in Vite, Vitest and Node (`module-check`).

4. **A test.** `packages/module-dnd5e-srd/test/pack.test.ts`, as in `packages/module-example/test/pack.test.ts`:
   ```ts
   import { loadModule, moduleFromPackSource } from "@campaign-forge/module-sdk";
   import { expect, it } from "vitest";
   import { dnd5eSrdSource } from "../src";

   it("loads and passes conformance", async () => {
     const loaded = loadModule(await moduleFromPackSource(dnd5eSrdSource), { seeds: 50 });
     expect(loaded.report.issues.filter((i) => i.severity === "error")).toEqual([]);
   });
   ```

5. **The registry entry.** Add `"@campaign-forge/module-dnd5e-srd": "workspace:*"` to `apps/web/package.json`, run `pnpm install`, and add to `BUILTIN` in `apps/web/src/modules/registry.ts`:
   ```ts
   builtinPack(
     {
       id: "dnd5e-srd", name: "D&D 5e (SRD 5.1)", version: "0.1.0",
       modes: [/* copied from pack.json */], defaultMode: "standard", dataStatus: "verified",
       ruleset: "Dungeons & Dragons 5th Edition", publisher: "Wizards of the Coast (SRD 5.1)",
       license: { spdx: "CC-BY-4.0", name: "Creative Commons Attribution 4.0 International", url: "https://creativecommons.org/licenses/by/4.0/", attribution: "/* the SRD attribution, as in pack.json */" },
     },
     () => import("@campaign-forge/module-dnd5e-srd").then((m) => m.dnd5eSrdSource),
   ),
   ```
   The registry test checks the static fields against the pack's manifest; the licence shows in the module list and the New campaign dialog before the pack is downloaded.

6. **The tools.** Add `"dnd5e-srd": async () => ({ source: (await import("@campaign-forge/module-dnd5e-srd")).dnd5eSrdSource })` to `BUILTIN_TARGETS` in `tools/module-check/src/check.ts` and `"@campaign-forge/module-dnd5e-srd": "workspace:*"` to that package's dependencies; add `"dnd5e-srd"` to `RESERVED_IDS` in `tools/create-module/src/scaffold.ts`. `pnpm module-check --all` (and CI) then covers it.

7. **Publish.** Per `CLAUDE.md`, a user-facing module ships with a README screenshot built from a demo campaign.

A built-in pack is validated on every load (as an imported pack is), so a broken JSON edit shows up as a load error with JSON paths, and in `pnpm test` before that.
