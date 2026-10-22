# Pack format reference

A data pack is a JSON object. The SDK validates it (`validatePack`), joins its parts (`mergePackParts`), turns it into a `GameModule` (`packToModule`) and runs the conformance suite on it, in that order (`loadPack` does all four). Nothing in a pack is ever run as code.

## Top level

```jsonc
{
  "$schema": "https://campaign-forge.dev/schema/module-pack.schema.json", // or a relative path to packages/module-sdk/schema/
  "format": "campaign-forge-pack",
  "formatVersion": 1,
  "manifest": { /* id, name, version, modes, licence... */ },
  "dice": { "engine": "d20" /* engine options */ },
  "entityTypes": [],        // sheets: what a character, a place, a monster is
  "relationshipTypes": [],  // extra relationship types (core ones: within, member_of, knows, owns, found_at, wants, appears_in, blocks)
  "referenceLists": [],     // skills, backgrounds, spells... (not campaign entities)
  "presets": [],            // stat blocks the GM starts an entity from
  "tables": [],             // random tables
  "procedures": [],         // seeded generators over the tables
  "templates": [],          // adventure / session / checklist scaffolds
  "rules": [],              // rule cards
  "trackers": [],           // clocks, countdowns, initiative, counters
  "playGuides": [],         // GM hints per rollable stat or skill
  "calendar": {},           // optional; default twelve 30-day months
  "styleNotes": [],         // optional
  "primer": { "sections": [] }, // optional; campaign primer prompts and starter text (see Campaign primer)
  "parts": ["tables.json"]  // optional; see Split packs
}
```

Only `format`, `formatVersion`, `manifest` and `dice` are required; every collection is optional. Unknown properties are errors (a typo such as `"modifer"` is caught, not ignored).

## A small but complete example

```json
{
  "format": "campaign-forge-pack",
  "formatVersion": 1,
  "manifest": {
    "id": "sky-pirates",
    "version": "0.1.0",
    "name": "Sky Pirates",
    "ruleset": "Sky Pirates",
    "licenseNotice": "Sky Pirates for Campaign Forge.",
    "requiredCore": "0.1.0",
    "modes": [{ "id": "standard", "name": "Standard" }],
    "defaultMode": "standard",
    "dataStatus": "unverified",
    "license": { "spdx": "CC-BY-4.0", "name": "Creative Commons Attribution 4.0", "url": "https://creativecommons.org/licenses/by/4.0/", "attribution": "Sky Pirates by A. Author, CC BY 4.0." }
  },
  "dice": { "engine": "2d6" },
  "entityTypes": [{
    "id": "sky-pirates.pirate", "kind": "character", "name": "Pirate", "plural": "Pirates",
    "schema": { "type": "object", "properties": { "attributes": { "type": "object", "properties": { "nerve": { "type": "integer", "minimum": -2, "maximum": 3, "default": 0 } } } } },
    "sheet": { "sections": [{ "id": "stats", "title": "Stats", "fields": [{ "path": "attributes.nerve", "label": "Nerve", "widget": "attribute" }] }] }
  }],
  "tables": [{
    "id": "sky-pirates.weather.today", "name": "Weather", "family": "weather", "original": true, "dice": "1d6",
    "rows": [
      { "range": [1, 4], "label": "Clear skies", "result": { "sky": "clear" } },
      { "range": [5, 6], "label": "Storm front", "result": { "sky": "storm" } }
    ]
  }],
  "rules": [{ "id": "sky-pirates.rule.nerve", "title": "Keeping your nerve", "summary": "Roll +nerve when you act under fire.", "page": 7 }]
}
```

## Ids

- `manifest.id` is lower case letters, digits and hyphens (`^[a-z][a-z0-9-]{1,47}$`). It may not be the id of a module built into the app (`alien`, `example`, `example-pack`, `dnd5e-srd`, `pf2e-orc`).
- **Every other id starts with the pack id and a dot**: `sky-pirates.pirate`, `sky-pirates.weather.today`, `sky-pirates.rule.nerve`. This keeps a pack from colliding with or shadowing anything else. Session checklist item ids follow the same rule (`sky-pirates.prep.recap`).
- Tables follow `<pack id>.<family>.<name>` and should declare the same `family` (table-lint checks it).
- Procedure step ids, sheet section ids, reference item ids and play mode ids are local; they need not be prefixed.

## Manifest

| Field | | |
|---|---|---|
| `id`, `name`, `version`, `ruleset` | required | `version` is semver; generator runs record it |
| `licenseNotice` | required | Short notice shown in settings and exports |
| `license` | required for packs | `{ spdx?, name, url?, attribution }`, see [licensing](licensing.md) |
| `requiredCore` | required | Contract version, currently `0.1.0` |
| `modes`, `defaultMode` | required | Play modes (`{ id, name, description?, page?, cite? }`); content can be limited to modes |
| `dataStatus` | required | `unverified`, `partially-verified` or `verified` against the source |
| `edition`, `publisher`, `authors` | optional | Shown in the module list |
| `sourceBook` | optional | `{ title, year?, pageNote?, url? }`: the book page numbers point to |
| `citationStyle` | optional | `page` (default) or `section` |

## Collections

Each collection uses the contract's own shape from `packages/module-sdk/src/types.ts`; the JSON Schema has the full list of properties.

| Collection | Contract type | Notes |
|---|---|---|
| `entityTypes` | `EntityTypeDef` | `schema` is a JSON Schema (safe subset), `sheet` the layout, `computed` JSONLogic. See [sheets](sheets.md). |
| `relationshipTypes` | `RelationshipTypeDef` | Ids may not repeat the core types. |
| `referenceLists` | `ReferenceList` | Items carry `id`, `name` and any data of their own (e.g. `attribute` for a skill). `itemSchema` validates them; `columns` picks the item keys the reference browser shows as columns (default: the first five). Opening an item shows every key; long text renders as Markdown (paragraphs, lists, pipe tables). |
| `presets` | `EntityPreset` | `fields` are validated against the entity type's schema. |
| `tables` | `RollTable` | See [tables and procedures](tables-procedures.md). |
| `procedures` | pack procedure | Declarative steps and `produce`; see [tables and procedures](tables-procedures.md). |
| `templates` | `Template` | `adventure`, `act`, `scene`, `session`, `campaign` or `checklist`; session checklists need `appliesTo: "session"` and a `phase` per item. |
| `rules` | `RuleCard` | Markdown summary; must cite a `page`, a `cite`, or be `original`. |
| `trackers` | `TrackerDef` | Kinds the app draws: `clock`, `countdown`, `initiative`, `counter`, `stress`, `story-points`, `supply`, `stealth`; anything else gets a generic editor. See [Trackers](#trackers). |
| `playGuides` | `PlayGuideDef` | Roll ids are a skill id or `attr:<attribute id>`. |
| `calendar` | `CalendarDef` | Its id is prefixed too. |

## Campaign primer

`primer` gives the app's campaign primer (the players' session 0 introduction: pitch, setting, lore, places, tone, house rules, making characters, where we begin) its prompts and starter text. Each section has an `id`, a `title`, a `prompt` for the GM (never shared) and optionally `starter` text in Markdown that the GM edits before sharing. The standard ids are `welcome`, `setting`, `lore`, `places`, `tone`, `house-rules`, `characters` and `opening`; a section with one of them replaces the app's default prompt for it, any other id is added after them.

```json
"primer": {
  "sections": [
    { "id": "setting", "title": "The setting", "prompt": "Two or three paragraphs on the world.", "starter": "A river valley of toll bridges and old barrows...", "original": true },
    { "id": "house-rules", "title": "House rules", "prompt": "Optional rules you use at this table." }
  ]
}
```

Starter text is the pack author's own words (`original: true`), or openly licensed text cited with `cite` or `page`. A pack for a game without an open licence must not quote its book: write starter text in your own words or leave it out. The conformance check warns about starter text that is neither original nor cited.

## Trackers

- `counter`: numbers on each entity's sheet, edited at the table (hit points, death saves, exhaustion, spell slots used, inspiration). Each of `binds` is a counter; a bind `"type.path"` applies to entities of that type, a plain `"path"` to every entity with that field (with `scope: "encounter"` that includes the creatures in the scene). `config`: `min` (default 0), `max` (a number or JSONLogic over `{ fields, computed }`, e.g. `{ "var": "fields.hp.max" }`), `maxes` and `labels` per bind, `label` for a single bind, `style` (`pips`, the default up to a max of 10, or `stepper`), `hideWhenNoMax` (skip counters whose max is 0, e.g. spell levels a character cannot cast). Boolean fields show a checkbox.
- `initiative`: cards 1-10 drawn lowest first (default), or with `config.method: "roll"` a roll of `config.dice` (default `1d20`) plus `config.modifier` (a number or JSONLogic over `{ fields, computed }`, e.g. `{ "var": ["computed.initiative", 0] }`), highest first, ties to the higher modifier; the GM can type a total a player rolled. `config.label` names the roll button.
- `clock`: `config.units` (`{ id, name, duration?, minutes?, per? }`), smallest first; `per` rolls the smaller unit over.

## What a pack cannot do (yet)

These parts of the contract need functions, so they are TypeScript-only: `combat` (hit resolution), `crewShip`, `travel`, `ledger`, `progression`, `mapGenerators`, `adventureBuilders` (review checks), `narrativeFields`, `hooks` (end-of-session prompts), `migrations`, and dice `operations` (special rolls such as a panic table). A pack that needs one of them becomes a [TypeScript module](typescript-modules.md); the data can stay JSON and be loaded from TypeScript.

## Split packs

A large pack can be split into a main file and parts. The main file lists them; each part carries more of the same collections:

```json
{ "format": "campaign-forge-pack", "formatVersion": 1, "manifest": { "id": "big-game" }, "dice": { "engine": "d20" }, "parts": ["monsters.json", "spells.json"] }
```

```json
{ "format": "campaign-forge-pack-part", "formatVersion": 1, "pack": "big-game", "name": "monsters.json", "presets": [], "tables": [] }
```

Every listed part must be present, once, and belong to the pack. Parts are joined in the order `parts` lists them, so the result does not depend on the order files are picked in. Import the main file together with its parts (select them all in the file picker); `module-check` reads the parts from the main file's folder. An imported pack is stored joined, as one self-contained pack.

## Limits and safety

An imported pack is untrusted input. Before anything else the SDK refuses:

- files over 16 MB (split the pack), nesting deeper than 40 levels, strings over 100 000 characters, lists over 20 000 items, objects over 5 000 keys, more than 64 parts;
- the keys `__proto__`, `constructor` and `prototype` anywhere;
- JSONLogic operators other than the SDK's list (`method` is never allowed);
- JSON Schema keywords outside the safe subset: no `pattern`, `patternProperties`, `propertyNames`, `$data`, `$async`, `$id`, `$schema` and no `$ref` outside the schema itself;
- links that are not `http(s)`.

The app renders pack text as plain text (rule summaries through the safe Markdown renderer, which only links `http(s)`, `mailto:` and relative targets) and never as HTML.
