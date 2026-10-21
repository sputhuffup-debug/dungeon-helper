# Testing with module-check

```sh
pnpm module-check <target...> [--all] [--base <target>] [--seeds N] [--determinism-seeds N] [--quiet] [--json]
```

A target is:

- a built-in module id: `alien`, `example`, `example-pack`, `dnd5e-srd`, `pf2e-orc` (`--all` checks every one);
- a pack's main file (`my-pack/pack.json`); its `parts` are read from the same folder;
- a folder with a `pack.json`;
- a TypeScript module package folder (`packages/module-my-game`, read through its `package.json` `main`);
- a `.ts` file exporting a `GameModule` or a `PackSource`;
- a [supplement](supplements.md)'s JSON file, checked against the module it extends (a built-in id; `--base <pack.json|folder|.ts>` for any other). `--all` also checks the repository's supplements (`deep-roads`, `thornwick-homebrew`), which can be named by id too.

Relative paths resolve against the folder you ran `pnpm` in. The exit code is 0 when no target has errors, 1 when one has, 2 for a usage error, so it fits CI as is.

## What it runs

1. **pack** (data packs only): size and nesting limits, forbidden keys, the published JSON Schema, ids namespaced by the pack id, JSONLogic operators, the safe JSON Schema subset in embedded schemas, the dice engine config, and the parts of a split pack. Errors here stop the rest: fix them first.
2. **conformance**: the SDK's `checkModule`: declared modes, page and cite references, dangling references (tables, rules, trackers, reference lists, entity types, field paths), table coverage and overlap, sheet paths against the schema, computed rules against default fields, preset fields, session checklist ids, and every procedure run with `--seeds` seeds (default 100) to catch throws, unknown entity types and dangling relationships.
3. **lint**: table-lint's data-entry checks: a citation on every table, `<id>.<family>.<name>` table ids, d66 bounds, row labels, preset field validation, rule card length.
4. **determinism**: every procedure run twice per seed (`--determinism-seeds`, default 20) and every dice roll and push made twice; any difference is an error (rule 3).

## Reading the output

```
module-check: Lanternlight (example pack) (example-pack 0.1.0), data pack, 312 ms
  error   [pack] $.tables[1].rows[0].range (example-pack.site.danger): must NOT have fewer than 2 items
  error   [conformance] $.tables[0] (example-pack.site.kind): no row covers total 6 (dice 1d6)
  warning [lint] $.tables[2] (example-pack.loot.common): table declares no family (id suggests "loot")
  FAILED: 2 error(s), 1 warning(s)
```

Each line has the severity, the stage, a JSON path into the pack file (with the item's id), and the message. A path in a part file starts with the file name. For TypeScript modules the location is the conformance suite's (`table:my-game.site.kind`). `--json` prints the same as data.

## In the repository

- `pnpm test` runs `module-check` on the example pack and the built-in modules (`tools/module-check/test`), and the scaffolder's output through it (`tools/create-module/test`).
- CI runs `pnpm module-check --all --quiet` after `pnpm table-lint`.
- A TypeScript module's own tests can call the same checks: `checkModule(module, { seeds: 100 })` and `checkDeterminism(module)` from `@campaign-forge/module-sdk`; for a pack, `loadPack(json, { parts })`.

## Starting from green: create-module

```sh
pnpm create-module "Moon Hunters" --engine d100                # moon-hunters-pack/pack.json
pnpm create-module "Moon Hunters" --engine pool --ts           # packages/module-moon-hunters/
pnpm create-module "Moon Hunters" --engine 2d6 --out packs/moon --author "Sam"
```

A supplement for an existing module:

```sh
pnpm create-module "Harbour Homebrew" --supplement dnd5e-srd [--list dnd5e-srd.feats]   # harbour-homebrew-supplement/supplement.json
```

Engines: `d20`, `pool`, `2d6`, `d100`. The starter has a character sheet set up for the engine (attributes, skills with a skills widget, computed values), a place type, two tables, a generator, a rule card and a session checklist item, and passes `module-check` with no errors. `--id` sets the module id (default: the name in lower case with hyphens), `--force` overwrites existing files.
