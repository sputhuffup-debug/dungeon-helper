# 5th Edition SRD 5.1 (fantasy d20)

A built-in Campaign Forge game module for fifth edition fantasy play, shipped as a declarative **data pack** (no code): the whole System Reference Document 5.1 as sheets, presets, reference lists, rule cards and roll tables, plus original GM tools. It is compatible with fifth edition rules; it is not affiliated with or endorsed by Wizards of the Coast.

## Licence and attribution

The SRD 5.1 content is used under the Creative Commons Attribution 4.0 International licence. The attribution, as the licence asks for it (also in the pack's `manifest.license.attribution`, shown in the app wherever the module's licence is shown):

> This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.

The JSON structuring of the SRD comes from [5e-bits/5e-database](https://github.com/5e-bits/5e-database) (MIT licence; its copyright notice is in [NOTICE](NOTICE)). Everything marked **Original** in the app (tables, generators, templates, play advice, the calendar, the encounter terrain lists) was written for Campaign Forge.

## Source

- Repository: https://github.com/5e-bits/5e-database
- Commit: `a6212beb4b278917c2cff41c2b04c4ef4f3e0d6f`
- Files: `src/2014/en/5e-SRD-*.json` only (the 2014 SRD 5.1; nothing from the 2024 files)
- Dropped from the source: `image` and API `url` fields, and the option-set plumbing of class and race choices (kept as readable text).

## What is in the pack

| | |
|---|---|
| Entity types | Player character, Monster (stat block for monsters and NPCs), NPC (roleplay), Location (settlement, dungeon, wilderness, building, plane), Faction, Item, Encounter, Quest |
| Presets | 334 SRD monsters, each a full stat block on the Monster sheet |
| Reference lists | 319 spells, 362 magic items, 37 weapons, 13 armor, 116 adventuring gear, 31 tools, 40 mounts and vehicles, 12 classes with level tables, 407 class features, 12 subclasses, 9 races, 4 subraces, 38 racial traits, 1 background, 1 feat, 15 conditions, 18 skills, 6 ability scores and saving throws, 13 damage types, 16 languages, 8 schools of magic, 11 weapon properties, 9 alignments, sizes, creature types |
| Rule cards | 147 from the SRD's rules chapters and conditions (text as written, cited by section, split at each section's headings), 3 original GM advice cards |
| Roll tables | 24 dice tables found in the SRD text (madness, sentient items, magic items, spells), 60 original tables (encounters by terrain and level band, NPCs, settlements, taverns, trinkets, weather) |
| Generators | Random encounter (SRD monsters by terrain and party level, added from their stat blocks), NPC, settlement and tavern |
| Trackers | Initiative (rolled d20 + initiative, highest first), hit points and temporary hit points (PCs and monsters in the scene), death saves, exhaustion, spell slots, hit dice, inspiration, time (rounds, minutes, hours), countdown |
| Play guide | When to call for each ability and skill, and how success and failure move the story (original) |
| Templates | One-shot in three acts, Into the lair, social and combat scenes, a session checklist, session zero |
| Modes | Campaign, One-shot |

The character sheet stores what a player writes down (scores, proficiencies, hit points, slots used) and derives everything else with JSONLogic at render time: ability modifiers, proficiency bonus from level, every skill and save bonus (proficient ×1, expertise ×2, plus an optional flat bonus), passive Perception, Investigation and Insight, initiative, hit die and a fixed-value HP maximum, spellcasting ability, spell save DC and attack bonus, spell slots by class and level, carrying capacity and XP for the next level. Monster stat blocks derive their proficiency bonus from CR and their skill and save bonuses the same way. The dice engine is `d20`: rolls from a sheet or table mode add the ability modifier, the proficiency bonus times the proficiency, and the flat bonus, with advantage, disadvantage and a DC as roll options.

## Files

| File | Built from | |
|---|---|---|
| `pack/pack.json` | `scripts/authored/` | manifest, dice, entity types, trackers, play guide, templates, calendar |
| `pack/tables.json` | `scripts/authored/tables.ts` | original tables, generators, advice cards |
| `pack/srd-*.json` | the SRD source | basics, rules, character options, spells, equipment and magic items, monsters |

Monsters are split over two files. Each file is a lazily loaded chunk in the app, stays under 2 MB, and builds to under 500 kB of JavaScript.

## Rebuilding

```sh
# convert the SRD data and rewrite every file
pnpm --filter @campaign-forge/module-dnd5e-srd build-pack -- --srd /path/to/5e-database/src/2014/en
# rewrite only pack.json and tables.json after editing scripts/authored
pnpm --filter @campaign-forge/module-dnd5e-srd build-pack
pnpm module-check dnd5e-srd
```

The converter reads the source as data only (`JSON.parse`, typed accessors); nothing from it is run. It is deterministic. `scripts/generated/conversion-notes.txt` lists what it corrected or skipped; `test/authored.test.ts` fails when the committed authored files are out of date.

## Caveats

- **Checked by tests, not against the printed SRD**: `dataStatus` is `partially-verified`. The tests spot-check values against the source (Goblin, Adult Red Dragon, Lich, Fireball, Bless, longsword, chain mail, wizard), and the converter cross-checks monster proficiency bonuses, XP and passive Perception against each stat block's own numbers.
- **Source corrections**: XP for Brass Dragon Wyrmling, Deep Gnome, Dretch and Riding Horse follows their CR (the source disagreed); Black Bear, Swarm of Ravens and Half-Red Dragon Veteran get the skill bonuses their stat blocks print but the source's list omits. Passive Perception is derived, so Blink Dog (13) and Spider (10) differ from the source's listed value.
- **Tables left out**: Robe of Useful Items and Wand of Wonder, whose source tables are missing rows.
- **Single class**: the sheet has one class and level; multiclass spell slots are not derived (use the flat bonuses and slot counts by hand).
- **Not modelled**: attack and damage rolls from the sheet (attacks are a table to fill in; free rolls cover damage), half proficiency (Jack of All Trades: use the flat bonus), vampire alternate forms as one creature (each form is its own preset), monster spellcasting beyond the trait text.
- **Encounter generator**: picks creatures by challenge rating band and a rough number appearing; it is not an encounter-difficulty calculator.
