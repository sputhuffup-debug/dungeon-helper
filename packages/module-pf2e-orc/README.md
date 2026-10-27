# Fantasy d20 Remaster (ORC)

A built-in Campaign Forge game module for fantasy play with the second edition remaster rules, shipped as a declarative **data pack** (no code): the ORC-licensed content of four core books (Player Core, Player Core 2, GM Core and Monster Core) as sheets, presets, reference lists, rule cards and roll tables, plus original GM tools. A built-in, optional **supplement**, [Remaster ORC books](#supplement-remaster-orc-books), adds the ORC content of nine more remaster books.

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
| Combat | `d20Combat` for the table's combat panel: every creature's and hazard's AC, Hit Points and saves, immunities, weaknesses and resistances (by damage type, group, material or trait, with exceptions) and condition immunities as structured data; creatures' Strikes with their attack modifier and damage parts (persistent damage apart); a character's AC, Hit Points, saves and Strikes from the sheet; four degrees against AC (a critical hit doubles the damage) and for saves (basic saves: none, half, full, double); the 43 conditions with helper text (the ORC rules text, shortened) and their effects on rolls (status and circumstance penalties that do not stack with their own type, frightened dropping each turn, the conditions each one brings); dying and wounded at 0 Hit Points. Written in `scripts/authored/combat.ts` |
| Play guide | When to call for Perception, each skill and each save, and what success and failure should do to the story (original) |
| Templates | One-shot in three acts, a short delve, social / combat / hazard scenes, a session checklist, session zero |
| Calendar | An original twelve-month calendar (no setting calendar) |
| Modes | Campaign, One-shot |

The character sheet stores what a player writes down (attribute modifiers and partial boosts, proficiency ranks, size, senses and traits, armor, inventory) and derives the rest with JSONLogic at render time: Perception, saves and skills (untrained +0; trained, expert, master, legendary = level + 2, 4, 6, 8; plus a flat bonus per check), class DC, AC (10 + Dexterity up to the armor's cap + proficiency in the armor's category + item bonus), AC with a raised shield, Hit Point maximum (ancestry HP + (class HP + Constitution + any per-level bonus such as Toughness) × level; Ancestry and Class offer the lists' items, a supplement's included, and the Hit Points of the built-in supplement's ancestries and classes are in the sheet's lookup too), spell DC and attack, Bulk carried and the encumbered and maximum limits, the dying maximum (4 − doomed), the recovery check DC and initiative. Creature and hazard stat blocks keep the book's totals.

## Character builder

`characterBuilders` in `pack.json` (written by `scripts/authored/builder.ts`): Ancestry → Background → Class → Attribute boosts → Skills and languages → Starting level → Level by level → Equipment → Details → Review, and a level-up that adds the next level. See [docs/modules/character-builder.md](../../docs/modules/character-builder.md) for the framework.

- **Data, not prose.** The converter attaches a `builder` key to the items the builder reads (`scripts/source/builderData.ts`), from the source's structured fields: ancestries (Hit Points, size, speed, vision, fixed and free boosts, flaws, languages and the extra ones it may learn, traits, ancestry features), heritages (their ancestry or versatile, senses, traits and the ancestries they count as, skills and feats they grant, a skill or feat they let you pick, ancestry Hit Points), backgrounds (the two boosts and the free one, trained skills and Lore, skill feat), classes (key attribute, Hit Points, initial proficiencies, trained skills and the extra count, feat and skill increase levels, the class's feat list, spellcasting tradition and kind, and per level the features gained with their proficiency increases and the choices they bring), class features (the tags a class's selections offer them by, what they train or grant, a doctrine's or research field's own features), feats (ancestry traits, prerequisites in a checkable shape, what they train or grant, Hit Points per level, feats they give, whether they repeat) and equipment (price in copper, Bulk, armor, shield and Strike numbers). The supplement's items carry the same data. Two readings of rules text are made where the source has no field, and checked by tests: a class feature's proficiency increase sentence per class section ("Your proficiency rank for Reflex saves increases to master"), and a feat's prerequisite lines ("expert in Athletics", "Strength +2", another feat's name); shared features the source keeps only under another licence ("Perception Expertise") are read from their names. Authored, cited data: starting wealth by level (GM Core), the psychic's key attribute (Dark Archive), the champion's and magus's spellcasting attribute.
- **Attributes** are modifiers: every boost adds 1; at +4 or more a boost is partial (`partialBoosts` on the sheet) and the next one to it completes +1. One source never boosts an attribute twice.
- **Skills**: a skill trained twice (background and class) gives one more to pick; Intelligence adds trained skills and languages, again when it rises at 5th, 10th, 15th or 20th. Skill increases go to expert, master from 7th and legendary from 15th.
- **Feats** at the class's levels: ancestry feats by the character's traits (versatile heritages included), class feats from the class's own list (archetype feats on request), skill feats, general feats (general or skill). Prerequisites the data states as skill or save ranks, attribute modifiers or other feats are checked; any other prerequisite asks the GM to confirm it.
- **Automated**: ancestry, heritage, background and class grants, the class choices offered by tag at their levels (instinct, doctrine, muse, school and thesis, racket, bloodline, patron, order, mystery, methodology, style, research field, hunter's edge, cause, and the supplement's practice, tactics, ikons and epithets, way, innovation, hybrid study, fatal method and fascination, conscious and subconscious mind, eidolon, implements), proficiency increases from class features by level (Weapon Expertise, Juggernaut, Expert Spellcaster...), a doctrine's or research field's own features, Toughness. **By hand** (listed on the review page): deities and divine fonts, spells, weapon groups (Fighter Weapon Mastery), choices of a feature whose options are not data (a dragon's type, an animal instinct's animal, ikon weapons), a summoner's eidolon, an inventor's modifications, a thaumaturge's adept and paragon benefits, archetype dedication limits, and Strike attack bonuses.

The dice engine is `d20` with the generic four-degree options (`critMargin: 10`, `naturalShift: true`): a total of DC + 10 or more is a critical success, DC − 10 or less a critical failure, and a natural 20 or 1 moves the result one step. The roll panel names its two-dice modes fortune and misfortune and offers the multiple attack penalty (−5 / −10, agile −4 / −8). See `docs/modules/dice-engines.md`.

## Reserved Material

`scripts/source/reserved.ts` lists 433 terms (305 for the core books, 128 more added for the books of the supplement, which the core books' text is checked against too): trademarks and other publications, deities and archfiends and their titles, named characters and artifacts, organizations and schools, places, peoples and the setting's regional languages, events, and the setting's planes. It was built by scanning every included entry for capitalized words that are not rules vocabulary and reviewing them by hand, plus the setting's major names around them.

- An entry whose **name** contains a term is dropped (28 entries: 23 items such as named volcano variants and artifacts, three feats named after the setting's planes, and two unique Monster Core creatures).
- A sentence, list item or table row that names a term is **removed** (292 removals: deity examples in domains and mysteries, place names in creature descriptions, references to other books).
- The setting's planes and underground realm are **rewritten** to generic phrases so rules that need a place still read (328 rewrites: "the demonic realms", "the realm of the dead", "the deep underground", "the world" and so on).

The build fails if any term (or any Foundry markup) is left in a part file, and `test/pack.test.ts` checks every pack file again; the demo campaign's test checks its text too. Language names used as game terms (Common, Draconic, Sakvroth, Petran...) are kept; regional languages named after the setting's peoples are removed.

## Files

| File | Built from | |
|---|---|---|
| `pack/pack.json` | `scripts/authored/` | manifest, dice, entity types, basic lists, trackers, play guide, character builder, templates, calendar |
| `pack/encounters.json` | `scripts/authored/tables.ts` | encounter shapes for every XP budget (and for party levels 1, 2 and 18–20, where Monster Core runs out of lower or higher creatures) |
| `pack/tables.json` | `scripts/authored/tables.ts`, `templates.ts` | creature tables by level, original tables, generators, rules summaries and advice cards |
| `pack/core-*.json` | the source | reference lists, rule cards, creature and hazard presets, split into 19 files |
| `src/index.ts` | `scripts/build-pack.ts` | one lazy import per file |

Every file is a lazily loaded chunk in the app, stays under 2 MB (under 500 kB minified, so under the bundler's chunk warning) and is precached for offline play.

## Supplement: Remaster ORC books

`supplements/remaster-orc-books/` is a built-in [supplement](../../docs/modules/supplements.md) for this module (id `pf2e-orc-books`, "Remaster ORC books"): the ORC-licensed, remastered content of more books, converted by the same code and scrubbed against the same Reserved Material list. It is **off by default**: the GM switches it on per device under *Game modules* (it roughly doubles the data the module loads: about 9.5 MB of JSON in 26 files next to the module's 7 MB). Its licence, attribution and the owner's TODOs are in [supplements/NOTICE](supplements/NOTICE).

- **Allow-list**: `system.publication.license === "ORC"`, `remaster === true`, title one of Monster Core 2, NPC Core, Howl of the Wild, Rage of Elements, Treasure Vault (Remastered), Battlecry!, Impossible Magic, Guns & Gears (Remastered), Dark Archive (Remastered), War of Immortals. The source has no "(Remastered)" title for Guns & Gears: its ORC, remastered entries are titled "Pathfinder Guns & Gears" and are taken as the remastered book. **Rage of Elements** is marked OGL in the source (all 677 entries), so nothing of it is included and it is not credited. Never read: Lost Omens, adventure paths, society, player's guides, the Beginner Box, anything OGL, and the folders the module never reads. `scripts/generated/supplement-notes.txt` counts every entry of these books in every folder, what was kept, and why the rest was not (Foundry effects, adventure copies, other licences).
- **Kept**: 820 creatures and NPCs and 27 hazards as presets; 12 classes (animist, commander, exemplar, guardian, gunslinger, inventor, magus, necromancer, psychic, runesmith, summoner, thaumaturge) and 8 ancestries (athamaru, automaton, awakened animal, centaur, jotunborn, merfolk, minotaur, surki) with their heritages, backgrounds, class and ancestry features; feats; spells, focus spells and rituals; items; actions (also as 233 rule cards); monster, familiar and vehicle entries: 4,400 items in the module's own lists, plus 14 new lists (class feats for each new class, mythic feats, aftermath and deviant feats; 788 items). By book:

| Book | Kept |
|---|---|
| Monster Core 2 | 430 creatures, 1 hazard, 32 monster abilities, 2 spells, 1 item |
| NPC Core | 256 NPCs (tagged by role), 20 monster abilities, 4 spells, 6 items |
| Howl of the Wild | 6 ancestries, 29 heritages, 273 feats, 34 spells, 113 items, 71 creatures, 20 actions and more |
| Treasure Vault (Remastered) | 1,061 items, 22 feats, 3 actions, 1 spell, 1 familiar ability |
| Battlecry! | commander and guardian, 1 ancestry, 13 backgrounds, 233 feats, 39 spells, 226 items, 54 creatures, 29 vehicles, 47 actions |
| Impossible Magic | magus, necromancer, runesmith and summoner, 365 feats, 325 spells, 307 items, 42 actions |
| Guns & Gears (Remastered) | gunslinger and inventor, automaton, 36 backgrounds, 248 feats, 283 items, 19 vehicles, 3 hazards, 36 actions |
| Dark Archive (Remastered) | psychic and thaumaturge, 231 feats, 77 spells, 47 items, 4 creatures, 18 hazards, 28 actions |
| War of Immortals | animist and exemplar, 318 feats (163 mythic), 42 spells, 28 items, 5 creatures, 5 hazards, 57 actions |

  Exact counts per content type are in `scripts/generated/supplement-counts.json`. Feats a class list shares are counted under each list.
- **Reserved Material**: these books name far more of the setting than the core books. The converter's `--candidates` option lists the capitalised words in the converted text that never appear in lower case and that the module's reviewed text never uses (about 1,100, mostly rules terms); the setting names among them were added to `scripts/source/reserved.ts` (128 terms: deities and demigods, kaiju and named spirits, the iconics, named characters, organizations, places, peoples and Shoanti clans, a regional language, two publications). 139 entries were dropped (95 named with a term, 44 unique creatures, items and spells), 586 sentences, list items or table rows removed and 492 planes rewritten; every one is listed in the notes. No book turned out to be mostly setting material: War of Immortals loses the most (6 of its 11 creatures and the deity-bound mythic options), but keeps its classes, mythic rules and feats. The build fails on any leftover term or Foundry markup; `test/supplement.test.ts` scans every file again. A book's title appears only in the citation of an entry from it ("Howl of the Wild — Ancestries: Centaur"), which the scan allows.
- **The character sheet**: Ancestry and Class accept the supplement's ancestries and classes (the sheet's lists show them while it is on), and their Hit Points are in the sheet's lookup (numbers only, `scripts/generated/supplement-hp.json`), so Hit Points are right for them too.
- **Files**: `supplement.json` (manifest and the list of parts) and 25 parts named `books-*.json` (each under 500 kB minified), `src/supplement.ts` (one lazy import per file) and `src/supplementManifest.ts` (what the module list shows before loading it), all written by `scripts/build-supplement.ts`.

## Rebuilding

```sh
# convert the source and rewrite every file (the source is a checkout of foundryvtt/pf2e)
pnpm --filter @campaign-forge/module-pf2e-orc build-pack -- --source /path/to/pf2e
# then the supplement (reads the module's list ids), and the authored files again (the sheet reads the supplement's Hit Points)
pnpm --filter @campaign-forge/module-pf2e-orc build-supplement -- --source /path/to/pf2e [--candidates]
pnpm --filter @campaign-forge/module-pf2e-orc build-pack
# rewrite only pack.json, tables.json and src/index.ts after editing scripts/authored
pnpm --filter @campaign-forge/module-pf2e-orc build-pack
pnpm module-check pf2e-orc pf2e-orc-books
```

The converter reads the source as data only (`JSON.parse`, typed accessors); nothing from it is run. It is deterministic. `scripts/generated/conversion-notes.txt` lists every exclusion, every Reserved Material removal and rewrite, and every text conversion it could not do exactly; `test/authored.test.ts` fails when the committed authored files are out of date.

## Caveats

- **Checked by tests, not against the printed books**: `dataStatus` is `partially-verified`. The tests spot-check values against the source (Goblin Warrior, an adult adamantine dragon, Hidden Pit, Fireball, Heal, longsword, full plate, Dwarf, Fighter, Acolyte, Frightened).
- **Embedded abilities**: a creature's or hazard's abilities carry the entry's own licence (Monster Core or GM Core, ORC); a few embedded abilities in the source still carry older metadata.
- **Universal monster abilities** in stat blocks point to the Monster abilities list ("See the universal monster ability Grab") instead of repeating it in every creature.
- **Level-scaled damage**: 44 formulas that scale with level are written as text ("(1d8 per 2 levels)"); a few complex ones read "level-based".
- **Not modelled**: what the conditions' helper text lists as not automated (flat checks, lost actions, attitudes, persistent damage at the end of a turn), a character's Strike bonuses (the Strikes table is written down, not derived), archetype dedication limits, multiclass spellcasting.
- **Combat data**: a Strike's numbers (`attack`, `damageParts`) come from the source's structured fields; its text columns stay as the stat block reads. Immunities to effects (sleep, death effects, critical hits) stay text only.
- **Encounter builder**: creatures are picked by level only, not by environment or theme; Monster Core has few creatures at the highest levels (one at level 21), so top-level encounters repeat them.
- **Legal review**: the Reserved Material list is the converter's best effort from the text; the owner should review it before release, complete Monster Core's attribution line, and decide how to designate Campaign Forge's own additions (see NOTICE). For the supplement, seven books' Attribution Notice lines are incomplete in the source (see supplements/NOTICE).
- **Supplement spot checks** (against the source): Adlet (Monster Core 2), Centaur and Minotaur (Howl of the Wild), Gorgon's Breath and Gossip's Eye (Treasure Vault). Two books share a creature name (Tripkee Scout in Monster Core 2 and NPC Core): both are kept, the NPC Core one with `npc-core` in its id.
