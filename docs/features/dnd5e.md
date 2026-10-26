# 5th Edition SRD 5.1 & 5.2 (fantasy d20)

[Campaign Forge](../../README.md) · [App features](app.md) · [Alien RPG](alien.md) · [Fifth edition](dnd5e.md) · [Remaster (ORC)](orc.md)

The `dnd5e-srd` module (`packages/module-dnd5e-srd`), a built-in JSON data pack built from the openly licensed System Reference Documents 5.1 and 5.2.

Demo: *Thornwick Crossing*, a one-shot with four level 3 characters (SRD 5.1), SRD monsters and a goblin ambush ready for table mode, an original homebrew supplement, and a fifth character half-way through the builder.

## What it adds

- **The whole SRD 5.1.** 334 monster stat blocks as presets, 319 spells, magic items, equipment, classes and races as reference lists, rule cards cited by section, and the SRD's dice tables.
- **SRD 5.2 character options.** 4 backgrounds (ability scores, origin feat, skills, tool, equipment), 9 species with 24 lineages and their traits, 12 subclasses with their features and 17 feats, each badged *2024* and *SRD 5.2*, named "Elf (2024)" where SRD 5.1 has an option of the same name.
- **Character builder.** *Build a character* (Atlas PCs tab, or *New*) walks through edition (SRD 5.1 rules, SRD 5.2 rules, or mixed), species or race with its subrace or lineage, class, background (with SRD 5.2 rules its +2/+1 or +1/+1/+1 and origin feat), ability scores (standard array, 27-point buy, 4d6 drop lowest rolled in the app or typed from the table, or typed scores), starting level 1 to 20 (subclass, ability score improvements or feats with their prerequisites, fighting styles and other class options, expertise, average or rolled hit points), spells, equipment packages and details. Options show their source and edition badges (supplement ones too) and their full text; a side summary keeps scores, hit points, AC, saves, skills and slots up to date; the review lists every grant with its source ("+2 Intelligence from background Sage") and what is left to do by hand. Drafts are kept in the campaign until finished. *Level up* on a character's sheet adds a class level, multiclassing included: prerequisites, proficiencies, hit points, new features, subclass, spells, and spell slots on the Multiclass Spellcaster table.
- **Character sheets.** Ability modifiers, proficiency bonus, saves, skills (with expertise), passive scores, initiative and spellcasting numbers are all derived. Race, subrace, background and subclass suggest options from both editions (and any supplement) and show a picked background's ability scores and feat.
- **d20 rolls.** From a sheet or the table, with advantage, disadvantage and a DC; the Hints tab ranks the party by bonus for every check and save.
- **At the table.** Initiative, hit point, death save, spell slot, exhaustion and other trackers.
- **Combat.** The table's combat panel runs fights from the SRD's own numbers: every monster's attacks as structured data (330 of 334 stat blocks: attack bonus, damage dice and types, reach and range, and 195 save effects such as a dragon's breath or a ghoul's paralyzing claws, with their DC, half damage and conditions), resistances, immunities and vulnerabilities by damage type (with "nonmagical", "silvered" and "adamantine" exceptions), and the attack rows on a character sheet (now with a damage type and melee, ranged or spell). A natural 20 hits and rolls the damage dice twice, a natural 1 misses; a character at 0 hit points falls unconscious (death saves on the tracker), a monster is defeated.
- **The 15 conditions with helper text.** Each says what it does (the SRD's words, shortened) and what the app applies by itself: advantage and disadvantage on attack rolls, checks and saves (poisoned, prone, restrained, blinded, invisible, frightened, exhaustion by level), attacks against it (prone within 5 feet or farther away, paralyzed and unconscious close hits made critical), automatic failure of Strength and Dexterity saves, speed 0 or halved, and the conditions each one brings (unconscious: incapacitated and prone); the rest is listed as not automated.
- **GM screen.** Typical DCs, advantage, passive and group checks and concentration; surprise, critical hits, unseen attackers, death saves and stabilizing; travel pace, light and vision, resting and exhaustion; and on the player side actions, cover and position, damage types and the 15 conditions, in the SRD's words with the CC-BY attributions.
- **Original GM tools.** Encounter, NPC, settlement and tavern generators, tables and a one-shot template, marked *Original*.
- Not affiliated with Wizards of the Coast; see the [licence](#licence).

## Screenshots

**Fifth edition sheet**: a level 3 wizard from *Thornwick Crossing*; the scores and proficiencies are written down, and the modifiers, proficiency bonus, initiative, hit dice and save bonuses are computed.

![Fifth edition character sheet](../screenshots/dnd5e-sheet.png)

**d20 rolls**: a Stealth check with expertise rolled from the sheet with advantage against a DC, showing the bonus breakdown, the dropped die, the total and the outcome.

![d20 skill roll with advantage](../screenshots/dnd5e-roll.png)

**Fifth edition table**: the opening ambush with rolled initiative, highest first, the combat panel's turn order and hit points for the party and the goblins in the scene.

![Fifth edition table mode](../screenshots/dnd5e-table.png)

**Fifth edition combat**: the wolf's bite hits Wren (13 + 4 against AC 14), its 2d4 + 2 is applied, and her failed DC 11 Strength save leaves her prone; the chip's helper text says what prone does and which of it the app applies (her attackers' advantage within 5 feet, disadvantage from farther away, her own disadvantage). The dice were rolled at the table and typed in.

![Fifth edition combat: an attack, its damage, a save and a condition's helper text](../screenshots/dnd5e-combat.png)

**Fifth edition hints**: each ability check, skill and saving throw with its story cues, and the party ranked by their d20 bonus (ability, proficiency and expertise), best and worst marked.

![Fifth edition hints](../screenshots/dnd5e-hints.png)

**Character builder**: the demo's half-built SRD 5.2 character at the background step: the Sage picked (badged *2024* and *SRD 5.2*, beside the supplement's Ferrywright) with its full text and its "+2 and +1" choice, the stepper with each step's picks and status, and the side summary with the scores after the Sage's increases, hit points, AC, saves, skills and spell slots.

![Fifth edition character builder, background step with the side summary](../screenshots/character-builder.png)

**SRD 5.1 and 5.2 options**: the SRD 5.1 Acolyte, the SRD 5.2 backgrounds with their ability scores and origin feats (badged *2024* and *SRD 5.2*, with "(2024)" where a name repeats) and the demo supplement's Ferrywright in one list.

![SRD 5.1 and SRD 5.2 backgrounds in the reference browser](../screenshots/dnd5e-origins.png)

## Licence

The 5th Edition SRD 5.1 & 5.2 module (`packages/module-dnd5e-srd`) includes material from the SRD 5.1 and the SRD 5.2 under the Creative Commons Attribution 4.0 International licence; its attributions, shown in the app wherever the module's licence appears:

> This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.

> This work includes material from the System Reference Document 5.2 (“SRD 5.2”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.

The module is compatible with fifth edition rules and is not affiliated with, endorsed, sponsored or approved by Wizards of the Coast LLC. Its JSON structure derives from 5e-bits/5e-database (MIT); see the module's [NOTICE](../../packages/module-dnd5e-srd/NOTICE). The *Thornwick Crossing* demo is original content.
