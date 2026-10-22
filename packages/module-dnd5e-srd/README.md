# 5th Edition SRD 5.1 & 5.2 (fantasy d20)

A built-in Campaign Forge game module for fifth edition fantasy play, shipped as a declarative **data pack** (no code): the whole System Reference Document 5.1 as sheets, presets, reference lists, rule cards and roll tables, the System Reference Document 5.2 character options (backgrounds, species with their lineages, subclasses, feats) beside the 5.1 ones, plus original GM tools. It is compatible with fifth edition rules; it is not affiliated with or endorsed by Wizards of the Coast.

## Licence and attribution

The SRD 5.1 and SRD 5.2 content is used under the Creative Commons Attribution 4.0 International licence. The attributions, as the licence asks for them (also in the pack's `manifest.license.attribution`, shown in the app wherever the module's licence is shown):

> This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.

> This work includes material from the System Reference Document 5.2 (“SRD 5.2”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.

The JSON structuring of the SRD comes from [5e-bits/5e-database](https://github.com/5e-bits/5e-database) (MIT licence; its copyright notice is in [NOTICE](NOTICE)). Everything marked **Original** in the app (tables, generators, templates, play advice, the calendar, the encounter terrain lists) was written for Campaign Forge.

## Source

- Repository: https://github.com/5e-bits/5e-database
- Commit: `a6212beb4b278917c2cff41c2b04c4ef4f3e0d6f`
- Files: `src/2014/en/5e-SRD-*.json` (the SRD 5.1), and from `src/2024/en` (the SRD 5.2) only `5e-SRD-Backgrounds.json`, `-Species.json`, `-Subspecies.json`, `-Traits.json`, `-Subclasses.json`, `-Features.json` (the subclass features) and `-Feats.json`
- Dropped from the source: `image` and API `url` fields, and the option-set plumbing of class, race, species and background choices (kept as readable text).

## SRD 5.2 character options

The SRD 5.2 items sit in the same reference lists as the SRD 5.1 ones (after them), so the reference browser and the PC sheet's suggestions offer both. Each carries `edition: "2024"` and `source: "SRD 5.2"`, which the app shows as two badges (as it does for a [supplement](../../docs/modules/supplements.md)'s items), and its own `cite` ("SRD 5.2 — Character Origins: Species (Elf)", "SRD 5.2 — Classes: Bard (College of Lore)", "SRD 5.2 — Feats: Origin Feats (Alert)"). Their ids end in `-2024`. In the lists that mix both, the SRD 5.1 items cite their section too.

| List (id `dnd5e-srd.…`) | SRD 5.1 | SRD 5.2 added |
|---|---|---|
| Races and species (`races`) | 9 races | 9 species |
| Subraces and lineages (`subraces`) | 4 subraces | 24 lineages, ancestries and legacies, each linked to its species (`race`) |
| Racial and species traits (`racial-traits`) | 38 | 67 |
| Backgrounds (`backgrounds`) | 1 | 4: ability scores, origin feat, skills, tool, equipment |
| Subclasses (`subclasses`) | 12 | 12, linked to the class (`class`) |
| Class features (`class-features`) | 407 | 58 subclass features (`class`, `subclass`, `level`) |
| Feats (`feats`) | 1 | 17 (origin, general, fighting style, epic boon) |

- **Names the sheet stores tell the editions apart.** The sheet's Race, Subrace, Background and Subclass fields store the name a player picks, so an SRD 5.2 species, lineage, background or subclass whose name an SRD 5.1 item in the same list already has is named "<name> (2024)": Dragonborn, Dwarf, Elf, Gnome, Halfling, Human and Tiefling (2024), Acolyte (2024), Champion, Hunter and Thief (2024). Lineages name their species that way (`race: "Elf (2024)"`), so the Subrace suggestions follow the species picked; subclasses name their class as the sheet's Class list does. Traits, features and feats keep the SRD's names: their badges and their species or subclass column tell them apart.
- **Ability scores come from the background.** SRD 5.2 species have no ability score increases (`abilityBonuses: "From background"`); each background lists its three abilities (`abilityScores`), how to raise them (+2 and +1, or +1 to all three), its origin feat, skills, tool and equipment. They are reference data: the sheet does not change stored scores. A suggested field shows the summary of the item it names under it, so a PC with the background "Sage" sees "Ability scores Con, Int, Wis; feat Magic Initiate (Wizard); skills Arcana, History".
- **Not included**: the SRD 5.2 classes, spells, equipment, monsters and rules (the module's sheets, presets and rule cards stay SRD 5.1).

## What is in the pack

| | |
|---|---|
| Entity types | Player character, Monster (stat block for monsters and NPCs), NPC (roleplay), Location (settlement, dungeon, wilderness, building, plane), Faction, Item, Encounter, Quest |
| Presets | 334 SRD monsters, each a full stat block on the Monster sheet |
| Reference lists | 319 spells, 362 magic items, 37 weapons, 13 armor, 116 adventuring gear, 31 tools, 40 mounts and vehicles, 12 classes with level tables, 407 class features (+58 SRD 5.2), 12 subclasses (+12 SRD 5.2), 9 races (+9 SRD 5.2 species), 4 subraces (+24 SRD 5.2 lineages), 38 racial traits (+67 SRD 5.2), 1 background (+4 SRD 5.2), 1 feat (+17 SRD 5.2), 15 conditions, 18 skills, 6 ability scores and saving throws, 13 damage types, 16 languages, 8 schools of magic, 11 weapon properties, 9 alignments, sizes, creature types |
| Rule cards | 147 from the SRD's rules chapters and conditions (text as written, cited by section, split at each section's headings), 3 original GM advice cards |
| Roll tables | 24 dice tables found in the SRD text (madness, sentient items, magic items, spells), 60 original tables (encounters by terrain and level band, NPCs, settlements, taverns, trinkets, weather) |
| Generators | Random encounter (SRD monsters by terrain and party level, added from their stat blocks), NPC, settlement and tavern |
| Trackers | Initiative (rolled d20 + initiative, highest first), hit points and temporary hit points (PCs and monsters in the scene), death saves, exhaustion, spell slots, hit dice, inspiration, time (rounds, minutes, hours), countdown |
| Combat | `d20Combat` for the table's combat panel: monsters' attacks as structured data (330 of 334 stat blocks, 656 attacks: attack bonus, damage parts, reach and range, and 195 save effects with DC, half damage and conditions, read from the source's numbers and the SRD text), resistances, immunities and vulnerabilities by damage type with the traits that get past them, condition immunities; a character's AC, hit points, saves and attack rows; a natural 20 doubles the damage dice; the 15 conditions with helper text (the SRD's words, shortened) and their effects on rolls; unconscious and death saves at 0 hit points. Written in `scripts/authored/combat.ts` |
| Play guide | When to call for each ability and skill, and how success and failure move the story (original) |
| Templates | One-shot in three acts, Into the lair, social and combat scenes, a session checklist, session zero |
| Modes | Campaign, One-shot |

The character sheet stores what a player writes down (scores, proficiencies, hit points, slots used) and derives everything else with JSONLogic at render time: ability modifiers, proficiency bonus from level, every skill and save bonus (proficient ×1, expertise ×2, plus an optional flat bonus), passive Perception, Investigation and Insight, initiative, hit die and a fixed-value HP maximum, spellcasting ability, spell save DC and attack bonus, spell slots by class and level, carrying capacity and XP for the next level. Monster stat blocks derive their proficiency bonus from CR and their skill and save bonuses the same way. The dice engine is `d20`: rolls from a sheet or table mode add the ability modifier, the proficiency bonus times the proficiency, and the flat bonus, with advantage, disadvantage and a DC as roll options.

## Files

| File | Built from | |
|---|---|---|
| `pack/pack.json` | `scripts/authored/` | manifest, dice, entity types, trackers, play guide, templates, calendar |
| `pack/tables.json` | `scripts/authored/tables.ts` | original tables, generators, advice cards |
| `pack/srd-*.json` | the SRD source | basics, rules, character options (SRD 5.1 and 5.2), spells, equipment and magic items, monsters |

Monsters are split over two files. Each file is a lazily loaded chunk in the app, stays under 2 MB, and builds to under 500 kB of JavaScript.

## Rebuilding

```sh
# convert the SRD data and rewrite every file (the SRD 5.2 files are read from src/2024/en next to
# src/2014/en; pass --srd52 /path/to/5e-database/src/2024/en to read them from elsewhere)
pnpm --filter @campaign-forge/module-dnd5e-srd build-pack -- --srd /path/to/5e-database/src/2014/en
# rewrite only pack.json and tables.json after editing scripts/authored
pnpm --filter @campaign-forge/module-dnd5e-srd build-pack
pnpm module-check dnd5e-srd
```

The converter reads the source as data only (`JSON.parse`, typed accessors); nothing from it is run. It is deterministic. `scripts/generated/conversion-notes.txt` lists what it corrected or skipped; `test/authored.test.ts` fails when the committed authored files are out of date.

## Caveats

- **Checked by tests, not against the printed SRD**: `dataStatus` is `partially-verified`. The tests spot-check values against the source (Goblin, Adult Red Dragon, Lich, Fireball, Bless, longsword, chain mail, wizard; for SRD 5.2 Goliath, Tiefling, the Elven lineages, Sage, Soldier, Grappler, Path of the Berserker, Champion), and the converter cross-checks monster proficiency bonuses, XP and passive Perception against each stat block's own numbers, and each SRD 5.2 subclass's feature levels against its feature list.
- **SRD 5.2 source corrections**: the Sage's origin feat is Magic Initiate (Wizard) (the source leaves out the spell list); "Shielf of Faith" in the Oath of Devotion spells is Shield of Faith. Two spell tables whose header or rows the source runs together (Draconic Spells, Fiend Spells) are split back into rows. Species sizes and traits follow the source (a species' traits are the ones it lists plus those the trait list gives it outside a lineage; Breath Weapon and Damage Resistance are on the Draconic Ancestor lineages, as the source has them).
- **Source corrections**: XP for Brass Dragon Wyrmling, Deep Gnome, Dretch and Riding Horse follows their CR (the source disagreed); Black Bear, Swarm of Ravens and Half-Red Dragon Veteran get the skill bonuses their stat blocks print but the source's list omits. Passive Perception is derived, so Blink Dog (13) and Spider (10) differ from the source's listed value.
- **Tables left out**: Robe of Useful Items and Wand of Wonder, whose source tables are missing rows.
- **Single class**: the sheet has one class and level; multiclass spell slots are not derived (use the flat bonuses and slot counts by hand).
- **Combat data**: 148 Multiattack actions and 59 other actions without an attack bonus or save DC in the source (Change Shape, Teleport, Swallow...) stay text only, as do the Archmage's resistance to "damage from spells" and the Rakshasa's vulnerability to "piercing from magic weapons wielded by good creatures" (`scripts/generated/conversion-notes.txt` lists each). Conditions a save effect applies and their durations are read from the action text; the panel offers them for the GM to confirm. A few save DCs the source marks "none" for success are read as half damage where the text says so.
- **Not modelled**: what the conditions' helper text lists as not automated (checks that need sight or hearing, the charmer's social advantage, hit point maximum halved by exhaustion), attack bonuses on the sheet (the attacks table is written down, not derived), half proficiency (Jack of All Trades: use the flat bonus), vampire alternate forms as one creature (each form is its own preset), monster spellcasting beyond the trait text.
- **Encounter generator**: picks creatures by challenge rating band and a rough number appearing; it is not an encounter-difficulty calculator.
