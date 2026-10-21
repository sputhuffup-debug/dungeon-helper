# Fantasy d20 Remaster (ORC)

A built-in Campaign Forge game module for fantasy play with the second edition remaster rules, shipped as a declarative **data pack** (no code): the ORC-licensed content of four core books (Player Core, Player Core 2, GM Core and Monster Core) as sheets, presets, reference lists, rule cards and roll tables, plus original GM tools.

Compatible with Pathfinder Second Edition (Remaster). Not affiliated with or endorsed by Paizo Inc. Pathfinder is a trademark of Paizo Inc.

## Licence and attribution

The rules content is used under the ORC License. It ships with the notices the licence asks for (also in the pack's `manifest.license.attribution`, shown in the app wherever the module's licence is shown, and in [NOTICE](NOTICE)):

**ORC Notice.** This product is licensed under the ORC License located at the Library of Congress at TX 9-307-067 and available online at various locations. All warranties are disclaimed as set forth therein.

**Attribution Notice.** This product includes material from:

- Pathfinder Player Core © 2023, Paizo Inc.; Designers: Logan Bonner, Jason Bulmahn, Stephen Radney-MacFarland, and Mark Seifter. Authors: Alexander Augunas, Kate Baker, Logan Bonner, Jason Bulmahn, Carlos Cabrera, Calder CaDavid, James Case, Eleanor Ferron, Steven Hammond, Joan Hong, Vanessa Hoskins, James Jacobs, Jenny Jarzabski, Erik Keith, Dustin Knight, Lyz Liddell, Luis Loza, Patchen Mortimer, Dennis Muldoon, Stephen Radney-MacFarland, Mikhail Rekun, David N. Ross, Michael Sayre, Mark Seifter, Kendra Leigh, Speedling, Mark Thompson, Clark Valentine, Andrew White, Landon Winkler, and Linda Zayas-Palmer
- Pathfinder GM Core © 2023, Paizo Inc.; Designers: Logan Bonner and Mark Seifter. Authors: Amirali Attar Olyaee, Logan Bonner, Creighton Broadhurst, Jason Bulmahn, James Case, Jesse Decker, Eleanor Ferron, Fabby Garza Marroquín, Jaym Gates, Matthew Goetz, James Jacobs, Brian R. James, Jenny Jarzabski, Dustin Knight, Jason LeMaitre, Lyz Liddell, Luis Loza, Ron Lundeen, Stephen Radney-MacFarland, David N. Ross, Michael Sayre, Mark Seifter, Owen K.C. Stephens, Amber Stewart, Clark Valentine, Landon Winkler, and Linda Zayas-Palmer
- Pathfinder Player Core 2 © 2024, Paizo Inc.; Authors: Amirali Attar Olyaee, Alexander Augunas, Brian Bauman, Joshua Birdsong, Logan Bonner, Jason Bulmahn, James Case, Jessica Catalan, John Compton, Paris Crenshaw, Jesse Decker, Eleanor Ferron, Fabby Garza Marroquín, Steven Hammond, Sasha Laranoa Harving, Joan Hong, Nicolas Hornyak, Vanessa Hoskins, James Jacobs, Jason Keeley, Dustin Knight, Avi Kool, Lyz Liddell, Nicolas Logue, Luis Loza, Ron Lundeen, Patchen Mortimer, Stephen Radney‑MacFarland, Jessica Redekop, Mikhail Rekun, Alex Riggs, David N. Ross, Michael Sayre, Mark Seifter, Owen K.C. Stephens, Jason Tondro, Clark Valentine, Andrew White, Landon Winkler, and Tonya Woldridge.
- Pathfinder Monster Core © 2024, Paizo Inc.

The first three lines are copied from the source's `static/licenses/ORCLicense.md`; Monster Core's full credit line is not in it, and NOTICE carries a `TODO(owner)` to complete it from the book.

**Reserved Material.** The ORC License does not cover a publisher's Reserved Material: trademarks and the setting's proper nouns (deities, places, organizations, named characters and so on), art and maps. None is used; see [Reserved Material](#reserved-material) below. The JSON structure of the data is derived from the Foundry VTT pf2e system (Apache License 2.0; its licence is in NOTICE). Everything marked **Original** in the app (tables, generators, templates, play advice, the calendar, the demo) was written for Campaign Forge.

## Source

- Repository: https://github.com/foundryvtt/pf2e
- Commit: `e8391f1b2fe211b760afb76241c9b30e4e0893fa`
- Read: `packs/pf2e/<folder>/**/*.json` (compendium sources) and `static/lang/{en,re-en,action-en}.json` (localized rules text the entries embed with `@Localize`). Never read: `deities`, `journals`, `rollable-tables`, `iconics`, `paizo-pregens`, `criticaldeck`.
- **Kept only** entries whose `system.publication` is `license: "ORC"`, `remaster: true`, and `title` one of "Pathfinder Player Core", "Pathfinder Player Core 2", "Pathfinder GM Core", "Pathfinder Monster Core". 13,431 other entries in the folders read were excluded (OGL, other ORC books, not remastered, no publication data, adventure copies); `scripts/generated/conversion-notes.txt` counts them by folder and reason.
- Dropped from every entry: images and icons, Foundry automation (`rules`, effects), flags and ids, and Foundry usage notes.

## What is in the pack

| | |
|---|---|
| Entity types | Player character, Creature (Monster Core stat block), Hazard (GM Core stat block), NPC (roleplay), Location (settlement, dungeon, wilderness, building, plane), Faction, Item, Encounter, Quest |
| Presets | 490 Monster Core creatures (all 492 but two unique named ones), 32 GM Core hazards |
| Reference lists | 16 ancestries, 106 heritages, 63 backgrounds, 16 classes with proficiencies and features by level, 341 class features, 10 ancestry features; 1,814 feats (400 ancestry, 31 general, 176 skill, class feats for each of the 16 classes, 302 archetype feats); 663 spells (32 cantrips, 377 ranked spells, 219 focus spells, 35 rituals); 1,243 items (217 weapons, 35 armor, 26 shields, 72 runes, 286 magical consumables, 131 alchemical items, 241 held and worn items, 87 pieces of adventuring gear, 148 treasures); 43 conditions; 166 actions and activities; 104 monster abilities; 55 familiar abilities; 20 relic gifts; 23 vehicles; attributes, skills, Perception and saves, proficiency ranks |
| Rule cards | 209 converted (every condition and action, text as written, cited by book and section), 10 rules summaries (degrees of success, proficiency, AC, Hit Points, Hero Points, Bulk, initiative, multiple attack penalty, encounter budgets, DCs by level; cited) and 2 original advice cards |
| Roll tables | Encounter shapes for every XP budget (GM Core's numbers, cited), Monster Core creatures by level, and original tables: activities, twists, NPCs, settlements, taverns, hoards, trinkets, weather |
| Generators | Encounter builder (spends GM Core's XP budget for a threat and party size on Monster Core creatures, added from their stat blocks), NPC, settlement and tavern |
| Trackers | Initiative (d20 + Perception, the skill a character uses, a creature's Perception or a complex hazard's Stealth), Hit Points, temporary Hit Points, dying / wounded / doomed, Hero Points, Focus Points, valued conditions (frightened, sickened, clumsy, drained, enfeebled, stupefied, slowed, stunned), spell slots, time (rounds, minutes, hours), countdown |
| Play guide | When to call for Perception, each skill and each save, and what success and failure should do to the story (original) |
| Templates | One-shot in three acts, a short delve, social / combat / hazard scenes, a session checklist, session zero |
| Calendar | An original twelve-month calendar (no setting calendar) |
| Modes | Campaign, One-shot |

The character sheet stores what a player writes down (attribute modifiers, proficiency ranks, armor, inventory) and derives the rest with JSONLogic at render time: Perception, saves and skills (untrained +0; trained, expert, master, legendary = level + 2, 4, 6, 8; plus a flat bonus per check), class DC, AC (10 + Dexterity up to the armor's cap + proficiency in the armor's category + item bonus), AC with a raised shield, Hit Point maximum (ancestry HP + (class HP + Constitution) × level), spell DC and attack, Bulk carried and the encumbered and maximum limits, the dying maximum (4 − doomed), the recovery check DC and initiative. Creature and hazard stat blocks keep the book's totals.

The dice engine is `d20` with the generic four-degree options (`critMargin: 10`, `naturalShift: true`): a total of DC + 10 or more is a critical success, DC − 10 or less a critical failure, and a natural 20 or 1 moves the result one step. The roll panel names its two-dice modes fortune and misfortune and offers the multiple attack penalty (−5 / −10, agile −4 / −8). See `docs/modules/dice-engines.md`.

## Reserved Material

`scripts/source/reserved.ts` lists 305 terms: trademarks and other publications, deities and archfiends and their titles, named characters and artifacts, organizations and schools, places, peoples and the setting's regional languages, events, and the setting's planes. It was built by scanning every included entry for capitalized words that are not rules vocabulary and reviewing them by hand, plus the setting's major names around them.

- An entry whose **name** contains a term is dropped (28 entries: 23 items such as named volcano variants and artifacts, three feats named after the setting's planes, and two unique Monster Core creatures).
- A sentence, list item or table row that names a term is **removed** (291 removals: deity examples in domains and mysteries, place names in creature descriptions, references to other books).
- The setting's planes and underground realm are **rewritten** to generic phrases so rules that need a place still read (328 rewrites: "the demonic realms", "the realm of the dead", "the deep underground", "the world" and so on).

The build fails if any term (or any Foundry markup) is left in a part file, and `test/pack.test.ts` checks every pack file again; the demo campaign's test checks its text too. Language names used as game terms (Common, Draconic, Sakvroth, Petran...) are kept; regional languages named after the setting's peoples are removed.

## Files

| File | Built from | |
|---|---|---|
| `pack/pack.json` | `scripts/authored/` | manifest, dice, entity types, basic lists, trackers, play guide, templates, calendar |
| `pack/tables.json` | `scripts/authored/tables.ts`, `templates.ts` | encounter shapes and creature tables, original tables, generators, rules summaries and advice cards |
| `pack/core-*.json` | the source | reference lists, rule cards, creature and hazard presets, split into 19 files |
| `src/index.ts` | `scripts/build-pack.ts` | one lazy import per file |

Every file is a lazily loaded chunk in the app, stays under 2 MB (under 500 kB minified, so under the bundler's chunk warning) and is precached for offline play.

## Rebuilding

```sh
# convert the source and rewrite every file (the source is a checkout of foundryvtt/pf2e)
pnpm --filter @campaign-forge/module-pf2e-orc build-pack -- --source /path/to/pf2e
# rewrite only pack.json, tables.json and src/index.ts after editing scripts/authored
pnpm --filter @campaign-forge/module-pf2e-orc build-pack
pnpm module-check pf2e-orc
```

The converter reads the source as data only (`JSON.parse`, typed accessors); nothing from it is run. It is deterministic. `scripts/generated/conversion-notes.txt` lists every exclusion, every Reserved Material removal and rewrite, and every text conversion it could not do exactly; `test/authored.test.ts` fails when the committed authored files are out of date.

## Caveats

- **Checked by tests, not against the printed books**: `dataStatus` is `partially-verified`. The tests spot-check values against the source (Goblin Warrior, an adult adamantine dragon, Hidden Pit, Fireball, Heal, longsword, full plate, Dwarf, Fighter, Acolyte, Frightened).
- **Embedded abilities**: a creature's or hazard's abilities carry the entry's own licence (Monster Core or GM Core, ORC); a few embedded abilities in the source still carry older metadata.
- **Universal monster abilities** in stat blocks point to the Monster abilities list ("See the universal monster ability Grab") instead of repeating it in every creature.
- **Level-scaled damage**: 44 formulas that scale with level are written as text ("(1d8 per 2 levels)"); a few complex ones read "level-based".
- **Not modelled**: condition penalties on rolls (the conditions tracker records the values; the GM applies them with the roll panel's modifier), weapon Strikes from the sheet (written down as a table), archetype dedication limits, multiclass spellcasting.
- **Encounter builder**: creature levels run from −1 to 21, so at party levels 1–3 and 18–20 a shape can cost a little more or less than its budget (the encounter shows both numbers); creatures are picked by level only, not by environment.
- **Legal review**: the Reserved Material list is the converter's best effort from the text; the owner should review it before release, complete Monster Core's attribution line, and decide how to designate Campaign Forge's own additions (see NOTICE).
