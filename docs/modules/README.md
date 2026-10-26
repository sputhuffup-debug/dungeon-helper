# Writing a game module

Campaign Forge knows nothing about any one game. Everything a game system brings (character sheets, random tables, rule cards, generators, dice) comes from a **module**. A module can take two forms:

| | Data pack | TypeScript module |
|---|---|---|
| What it is | One JSON file (or a main file plus parts) | A package in `packages/module-<id>` |
| Who can add it | Any GM: *Game modules… → Import data pack…* in the app | A developer, in this repository |
| Logic | JSONLogic only; nothing runs as code | Any TypeScript, as long as it stays deterministic |
| Dice | One of the built-in engines (`d20`, `pool`, `2d6`, `d100`) | A built-in engine or your own `DiceSystem` |
| Ships with the app | Yes, when registered as a built-in pack | Yes, when registered |
| d20 combat (attacks, AC and saves, damage modifiers, conditions with helper text) | Yes (`d20Combat`) | Yes |
| Character builder and level-up wizard | Yes (`characterBuilders`) | Yes |
| Other combat rules, ship, travel, ledger, progression, map generators, adventure builders, hooks | No (needs code) | Yes |

Both are checked by the same tools and loaded by the same registry. Start with a data pack; move to TypeScript when you need something only code can do. To add options to a module that already exists (a background, a subclass, a house rule), write a [supplement](supplements.md) instead.

## Quick start

```sh
pnpm create-module "Sky Pirates" --engine d20     # writes sky-pirates-pack/pack.json
pnpm module-check sky-pirates-pack/pack.json      # schema, conformance, lint, determinism
```

Then open the app, choose **Game modules… → Import data pack…** on the campaign list, pick `pack.json`, and create a campaign with it. Change one thing at a time and re-run `module-check`.

## The guide

1. [Pack format reference](pack-format.md): the top-level shape, the manifest, ids, every collection, split packs, limits.
2. [Dice engines](dice-engines.md): `d20`, `pool`, `2d6`, `d100`, their options and what the roll panel shows.
3. [JSONLogic cookbook](jsonlogic.md): computed values, table modifiers, procedure expressions.
4. [Sheets and widgets](sheets.md): entity types, the JSON Schema subset, sheet layout, widgets and their config.
5. [Tables and procedures](tables-procedures.md): random tables, nested rolls, declarative generators.
6. [Licensing and citations](licensing.md): `license`, attribution, `page` / `cite` / `original`.
7. [Testing with module-check](testing.md): what the checker runs and how to read its output.
8. [Supplements](supplements.md): additive JSON for an existing module (more backgrounds, subclasses, presets, tables, rule cards), imported like a pack or built into the app as an optional extra; split supplements; and how to keep private ones private.
9. [GM screen](gm-screen.md): the printable quick reference a module (or pack) builds from its own rule cards, tables, lists, conditions and play guide, and the fallback for modules without one.
10. [Character builder](character-builder.md): the step-by-step wizard that makes a player character (choices, grants, sub-choices, ability score methods, validation) and levels one up.
11. [TypeScript modules](typescript-modules.md): when you need code, and how to register a built-in module or pack (including large ones such as the 5th Edition SRD 5.1 & 5.2 in `packages/module-dnd5e-srd` and the ORC core rules for the second edition remaster in `packages/module-pf2e-orc`).

The published JSON Schemas are in `packages/module-sdk/schema/` (`module-pack.schema.json`, `module-pack-part.schema.json`, `module-supplement.schema.json`, `module-supplement-part.schema.json`). Point your editor at them with `"$schema"` for completion and inline errors. The contract they describe is `packages/module-sdk/src/types.ts`; the fixture pack `packages/module-example/packs/example-pack/` uses every feature of the format.
