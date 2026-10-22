# Fantasy d20 Remaster (ORC)

[Campaign Forge](../../README.md) · [App features](app.md) · [Alien RPG](alien.md) · [Fifth edition](dnd5e.md) · [Remaster (ORC)](orc.md)

The `pf2e-orc` module (`packages/module-pf2e-orc`), a built-in JSON data pack of the ORC-licensed core rules, compatible with Pathfinder Second Edition (Remaster), with an optional built-in supplement for nine more remaster books.

Demo: *Hollowmere*, a one-shot with four level 1 characters, kobold oil thieves and a xulgath den.

## What it adds

- **The core books.** The ORC-licensed content of Player Core, Player Core 2, GM Core and Monster Core and none of the setting's names: 490 Monster Core stat blocks and 32 hazards as presets; ancestries, heritages, backgrounds, classes, 1,814 feats, 663 spells and 1,243 items as reference lists; every condition and action as a rule card cited by section.
- **Character sheets.** Perception, saves and skills from proficiency ranks (level + 2/4/6/8), class DC, AC, Hit Points, spell DC and Bulk, all derived.
- **Four degrees of success.** DC ± 10, with natural 20 and 1 shifting one step; fortune, misfortune and the multiple attack penalty in the roll panel.
- **Encounter builder.** Spends GM Core's XP budgets on Monster Core creatures for the party's level and size.
- **At the table.** Trackers for initiative, Hit Points, dying/wounded/doomed, Hero and Focus Points and valued conditions.
- **Remaster ORC books (optional).** A built-in supplement, switched on per device under *Game modules…*, adds the ORC content of nine more remaster books: 820 creatures and NPCs, 27 hazards, 12 classes, 8 ancestries, feats, spells and items, still without the setting's names.
- Not affiliated with Paizo; see the [licence](#licence).

## Screenshots

**Remaster sheet**: a level 1 cleric from *Hollowmere*; attribute modifiers and proficiency ranks are written down, and every check total, AC, Hit Points, class DC and spell DC is computed.

![Remaster character sheet](../screenshots/pf2e-sheet.png)

**Four degrees of success**: a Stealth check rolled with fortune against a DC and beaten by 10 or more: a critical success.

![Four-degree skill roll with fortune](../screenshots/pf2e-roll.png)

**Encounter builder**: a severe encounter for four level 3 characters, GM Core's XP budget spent on Monster Core creatures by level.

![Encounter builder](../screenshots/pf2e-encounter.png)

**Built-in supplement**: *Remaster ORC books* switched on under Game modules; Hollowmere's ancestries list gains eight from Howl of the Wild, Guns & Gears and Battlecry!, each with its source badge and citation.

![A built-in supplement's ancestries in the reference browser](../screenshots/pf2e-supplement.png)

## Licence

The Fantasy d20 Remaster (ORC) module (`packages/module-pf2e-orc`) includes material from Player Core, Player Core 2, GM Core and Monster Core under the ORC License, and only entries the source marks as ORC-licensed and remastered. Its notices, shown in the app wherever the module's licence appears and in full in its [NOTICE](../../packages/module-pf2e-orc/NOTICE):

> **ORC Notice.** This product is licensed under the ORC License located at the Library of Congress at TX 9-307-067 and available online at various locations. All warranties are disclaimed as set forth therein.
>
> **Attribution Notice.** This product includes material from Pathfinder Player Core © 2023, Paizo Inc.; Pathfinder Player Core 2 © 2024, Paizo Inc.; Pathfinder GM Core © 2023, Paizo Inc.; and Pathfinder Monster Core © 2024, Paizo Inc. (the full designer and author credits are in the module's NOTICE and manifest).

None of the publisher's Reserved Material is used: the converter drops or rewrites the setting's proper nouns (deities, places, planes, organizations, characters) and the tests check none remain. Compatible with Pathfinder Second Edition (Remaster). Not affiliated with or endorsed by Paizo Inc. Pathfinder is a trademark of Paizo Inc. Its JSON structure derives from the Foundry VTT pf2e system (Apache-2.0). The *Hollowmere* demo is original content.

Its built-in supplement *Remaster ORC books* (`packages/module-pf2e-orc/supplements/`, off unless the GM switches it on) includes material from Monster Core 2, NPC Core, Howl of the Wild, Treasure Vault (Remastered), Battlecry!, Impossible Magic, Guns & Gears (Remastered), Dark Archive (Remastered) and War of Immortals under the ORC License, again only entries the source marks as ORC-licensed and remastered (Rage of Elements is marked OGL there, so none of it is used), with the same ORC Notice, each book's Attribution Notice (in its manifest and its [NOTICE](../../packages/module-pf2e-orc/supplements/NOTICE); seven are incomplete in the source and marked TODO for the owner), the same disclaimer, and none of the setting's names (the module's Reserved Material list grew to 433 terms for these books).
