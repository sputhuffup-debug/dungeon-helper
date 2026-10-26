# Supplements

A **supplement** adds options to a module you already have: more backgrounds, subclasses, feats, spells or monsters for a fifth edition game, a house rule card, a rumour table, a generator. It is one JSON file (or a main file plus [parts](#split-supplements) when it is large), imported in the app like a data pack (*Game modules… → Import data pack or supplement…*), and it is listed under the module it extends. The app can also ship [built-in supplements](#built-in-supplements) that the GM switches on or off.

A supplement is **additive data only**:

- it adds items to the module's own reference lists, and new reference lists, presets, tables, procedures (declarative generators), templates, rule cards and play guides;
- it never changes or removes anything the module has, and it cannot add sheets (entity types), trackers, dice or a calendar;
- it carries no code: every expression is JSONLogic, checked like a data pack's.

When a module loads, every installed supplement that extends it is checked against it again and merged in, ordered by supplement id. Reference browsers, sheets, presets, tables, generators and rule cards then see the merged content. Every entry a supplement added keeps its supplement id as the start of its id, and reference items carry `source` (the supplement's name), so the app shows a small source badge next to them.

## A small but complete example

```json
{
  "$schema": "https://campaign-forge.dev/schema/module-supplement.schema.json",
  "format": "campaign-forge-supplement",
  "formatVersion": 1,
  "manifest": {
    "id": "harbour-homebrew",
    "name": "Harbour Homebrew",
    "version": "0.1.0",
    "extends": { "module": "dnd5e-srd", "version": "^0.1.0" },
    "licenseNotice": "Harbour Homebrew © 2026 Sam. Private: for personal use only."
  },
  "referenceItems": {
    "dnd5e-srd.backgrounds": [
      { "id": "harbour-homebrew.net-mender", "name": "Net mender", "skills": "Insight, Survival", "feature": "Harbour Ears", "description": "You mended nets on the quay and heard everything." }
    ],
    "dnd5e-srd.subclasses": [
      { "id": "harbour-homebrew.tide-caller", "name": "Tide Caller", "class": "Druid", "edition": "2024", "description": "A druid of the harbour and its weather." }
    ]
  },
  "rules": [
    { "id": "harbour-homebrew.rule.squalls", "title": "Squalls", "summary": "House rule: in a squall, ranged attacks beyond 30 feet have disadvantage.", "original": true }
  ]
}
```

`packages/module-dnd5e-srd/supplements/thornwick-homebrew.supplement.json` is a fuller worked example (a people, a background, two subclasses and their features, a feat, an NPC preset, a table and a house rule); the Thornwick Crossing demo installs it, and one of its characters has its background. `packages/module-example/packs/example-supplement/supplement.json` extends the example pack and uses every collection, generators included.

## Top level

| Key | | |
|---|---|---|
| `format`, `formatVersion` | required | `"campaign-forge-supplement"`, `1` |
| `manifest` | required | see below |
| `referenceItems` | optional | `{ "<module's list id>": [items] }`: items added to lists the module already has |
| `referenceLists`, `presets`, `tables`, `procedures`, `templates`, `rules`, `playGuides` | optional | new entries, in the same shapes as a [data pack](pack-format.md)'s |
| `parts` | optional | file names of the [part files](#split-supplements) that complete a split supplement |

Unknown keys are errors. `entityTypes`, `relationshipTypes`, `trackers`, `dice` and `calendar` are refused with the reason.

### Manifest

| Field | | |
|---|---|---|
| `id` | required | lower case letters, digits and hyphens; not a module's id |
| `name`, `version` | required | `version` is semver; generator runs record it next to the module version |
| `extends` | required | `{ module, version? }`: the module's id, and optionally a semver range of the module versions it fits (`^0.1.0`, `~1.2`, `>=1.0.0 <2.0.0`, `1.x`, `*`, `a || b`) |
| `licenseNotice` | required | free text shown with the supplement, e.g. "Private: for personal use only." |
| `license` | optional | `{ spdx?, name, url?, attribution }`, as for packs, when the content has a licence |
| `authors`, `description`, `dataStatus` | optional | shown in the module list |

### Ids

Every id a supplement adds starts with the supplement id and a dot: items in `referenceItems` (`harbour-homebrew.net-mender`), presets, tables (`<supplement id>.<family>.<name>`), procedures, templates, rule cards, play guides and new reference lists. Items inside a supplement's own new lists are local, as in a pack. This keeps a supplement from colliding with the module, or with another supplement, and lets the app say where each entry came from.

### Items for the module's lists

`referenceItems` keys are the module's reference list ids; each must exist (the check lists the ones the module has). Items use the same keys as the list's own items, so the reference browser shows them in its columns; when the list declares an `itemSchema`, items must fit it (the SRD spells list, for example, needs `level`, `school`, `castingTime`, `range`, `components`, `duration` and `description`). Any item may carry `edition` (a short label such as `"2024"`), shown as a badge, for lists that mix rules editions.

For `dnd5e-srd` the character-option lists are `dnd5e-srd.races`, `.subraces`, `.racial-traits`, `.backgrounds`, `.classes`, `.subclasses` (with `class`), `.class-features` (with `class`, `subclass`, `level`), `.feats` and `.spells`. They already mix two editions: the SRD 5.2 items the module ships carry `edition: "2024"` and `source: "SRD 5.2"`, and where one has the name of an SRD 5.1 item the sheet stores (a race, subrace, background or subclass) it is named "<name> (2024)". Follow the same convention: the sheet stores the name, so two options with one name cannot be told apart once picked. The player character sheet suggests items from them as you type in Race, Subrace, Background and Subclass (subclasses follow the chosen class, subraces the race), and Class offers the classes list, a supplement's classes included. A suggestion is only a suggestion: the field still takes any text.

### Citations (rule 2)

Rule cards and tables cite their source with `cite` (free text, e.g. `"Harbour Guide, ch. 2"`) or say `"original": true`. A bare `page` would point at the base module's book, so it gets a warning. Reference items and presets may carry `cite` too.

## Split supplements

A supplement too large for one file (the limits are those of a [data pack](pack-format.md#limits-and-safety): 16 MB a file, and a bundler warns about a chunk over 500 kB) can be split. The main file lists its parts by file name, and each part carries more of the same collections:

```json
{ "format": "campaign-forge-supplement", "formatVersion": 1, "manifest": { "id": "harbour-homebrew", "…": "…" }, "parts": ["spells.json", "monsters.json"] }
```

```json
{
  "$schema": "https://campaign-forge.dev/schema/module-supplement-part.schema.json",
  "format": "campaign-forge-supplement-part",
  "formatVersion": 1,
  "supplement": "harbour-homebrew",
  "name": "spells.json",
  "referenceItems": { "dnd5e-srd.spells": [{ "id": "harbour-homebrew.tidecall", "name": "Tidecall", "…": "…" }] }
}
```

- A part has `referenceItems`, `referenceLists`, `presets`, `tables`, `procedures`, `templates`, `rules` and `playGuides`, no manifest; `supplement` is the main file's id and `name` its own file name. The published schema is `packages/module-sdk/schema/module-supplement-part.schema.json`.
- The parts are joined in the order `parts` lists them (`mergeSupplementParts` in the SDK): collections are concatenated, and the items for one of the module's lists continue across parts, so a long list can be split anywhere. A new list stays whole in one part.
- Every listed part must be there, once. The joined supplement is then validated as a whole, exactly like a one-file supplement; a main file checked without its parts is refused ("join them first").
- In the app, choose the main file together with its parts; the joined supplement is what is stored on the device and embedded in bundles. `module-check` reads the parts from the main file's folder.

## Checking and importing

```sh
pnpm create-module "Harbour Homebrew" --supplement dnd5e-srd     # harbour-homebrew-supplement/supplement.json
pnpm module-check harbour-homebrew-supplement/supplement.json    # against dnd5e-srd
pnpm module-check my.supplement.json --base my-game-pack/pack.json   # a supplement for a module that is not built in
```

`module-check` validates the file (limits, the published schema `packages/module-sdk/schema/module-supplement.schema.json`, namespacing, JSONLogic, the safe schema subset), checks it against its module (module id and version range, lists, entity types of presets, item schemas), then runs the conformance suite, table-lint and the determinism check over the merged module, and reports only the supplement's own issues. `--list <list id>` on `create-module` picks which of the module's lists the starter item goes in.

In the app the same checks run before the supplement is stored on the device (IndexedDB); an error names the JSON path, as for packs. Importing a supplement with the id of one already installed replaces it (the toast says from which version). A supplement whose module is not on the device is refused ("Import that module first"). Removing a supplement takes its entries out of the module; what a sheet already says (a background typed or picked) stays as text.

## Where supplements show up

- **Game modules**: under the module they extend, with *Imported* (or *Built-in*) and *Supplement* badges, what they add, their notice and licence, and *Remove* (or, for a built-in one, its on/off switch). One that no longer fits its module (after the module was updated, say) is marked *Not applied*, with the reason; the module still loads without it.
- **Settings → Supplements**: the supplements active for the campaign's module. Installed supplements apply to every campaign that uses that module on the device.
- **Reference, Rules, presets, tables**: a source badge (and an edition badge) on everything a supplement added.
- **Character builder**: a supplement's races, backgrounds, subclasses and feats are options of the module's [character builder](character-builder.md), badged. The builder reads structured data for each option from `item.builder`; give a supplement item a `builder` key in the shape the module's builder uses (the fifth edition one: `asi`, `speed`, `size`, `languages`, `traits` for a race; `skills`, `languageChoice`, `equipment`, `gp`, `feature` for a background) and its picks write the sheet like the module's own. Without one the option still writes its name, and the review page lists what to apply by hand. The Thornwick Homebrew fixture's Mossborn and Ferrywright carry `builder` data.
- **Bundles**: an exported campaign carries each active imported supplement (`module/supplements/<id>.json`, listed in the bundle manifest). Importing the bundle on another device installs the ones that device lacks; one already installed is never replaced, whatever its version. A built-in supplement is never embedded: the manifest names it (`builtinSupplements`), and importing the bundle switches it on where the app has it (the toast says so; a copy of the app without it reports it as skipped).

## Built-in supplements

A supplement can ship with the app, in the repository package of the module it extends: `packages/module-pf2e-orc/supplements/remaster-orc-books/` (the ORC content of nine more remaster books for the `pf2e-orc` module, "Remaster ORC books") is the worked example.

- It is optional per device: *Game modules* lists it under its module with *Built-in* and *Supplement* badges and a switch. The switch is stored in the browser (`localStorage`, key `cf-builtin-supplements`); when it was never set, the entry's `defaultEnabled` applies. Switching it drops the module from the app's cache, so a campaign that opens next loads with (or without) it. While on, it is joined, validated, checked against the module and merged at module load exactly like an imported one (and left out, with the reason, if it does not fit).
- It is never stored in IndexedDB and never embedded in a bundle (see above), and an imported supplement may not use its id.
- Registering one: a `SupplementSource` (the main file and each part as a lazy JSON import, so each file is its own chunk; `supplementFromSource` joins and validates them) and its static metadata (name, version, `extends`, notice, licence, counts and size, so the module list never downloads it), added to `BUILTIN_SUPPLEMENTS` in `apps/web/src/modules/registry.ts`; its id in `RESERVED_IDS` of `tools/create-module` and in `BUILTIN_SUPPLEMENT_TARGETS` of `tools/module-check` (so `--all` checks it). The ORC books' converter (`scripts/build-supplement.ts`) writes all three files, and its tests check the metadata matches the data.
- Offline: its chunks are precached by the PWA like every other chunk (keep each file under 2 MB, and under 500 kB minified), so it can be switched on without a connection. A supplement large enough to make the precache unreasonable would instead be left out of it (a `globIgnores` rule for its chunk names) and cached when first loaded; switched on offline before that, it is reported as *Not applied* ("could not be loaded") and the module loads without it.

## Determinism (rule 3)

A supplement changes the module's content, so a generator may give different output with and without it (a supplement never edits an existing table, but it can add tables and generators, and a generator can read a list the supplement added to). The merge order is fixed (by supplement id), so the same module version plus the same supplements always give the same module and the same output. Generator runs record the supplements that were active (`supplements: [{ id, version }]` next to `moduleVersion`), and the generated-content panel shows them.

## Licensing: keep private supplements private

A supplement is the natural place for content you do not have the right to publish: your notes from a book you own, options from a setting guide, a friend's homebrew. The app stores it on your device only, and nothing leaves the device unless you export it.

- **Do not publish or share a supplement whose content you have no right to distribute.** That includes committing it to a public repository, attaching it to an issue, or posting a campaign bundle that embeds it (bundles carry the active supplements). Set its `licenseNotice` to say so, e.g. "Private reference compiled for personal use. Not for redistribution."
- Summaries in your own words are still derived from the book: treat them as private too. Never put a book's text, a PDF's extracted text or a purchase watermark into a supplement you might share.
- Openly licensed material (an SRD under CC-BY-4.0, ORC content without its Reserved Material) may be shared on its licence's terms: fill `license` with the attribution it requires, and the app shows it next to the supplement.
- Supplements in this repository are the fixtures (original content written for it) and the built-in "Remaster ORC books", which is ORC-licensed content without its Reserved Material, with the ORC Notice and each book's Attribution Notice in its `license` (see `packages/module-pf2e-orc/supplements/NOTICE`).
