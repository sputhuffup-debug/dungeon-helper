# App features

[Campaign Forge](../../README.md) · [App features](app.md) · [Alien RPG](alien.md) · [Fifth edition](dnd5e.md) · [Remaster (ORC)](orc.md)

What Campaign Forge does for every game system. Features that belong to one game module are on that module's page.

## What it does

- **Local-first PWA.** The campaign lives in the browser (IndexedDB), works offline at the table, and exports to a self-describing zip bundle at any time. No server, no accounts.
- **One place per game system.** The campaign list groups everything by game module: start a campaign, load its demos and open its campaigns from that system's section.
- **Campaign structure.** Adventures, acts, scenes, sessions, timeline, handouts, notes with `@` entity references and backlinks.
- **World entities.** Characters, creatures, locations, factions, items, vehicles, ships, clues, jobs and encounters, each rendered from the module's JSON Schema sheet layout, linked by typed relationships.
- **Generators.** Seeded, re-rollable procedures over the module's tables: world creation, star systems, jobs, life paths, encounter checks, shore leave and between jobs, with full roll provenance.
- **Table tools.** Scene cards, rounds/stretches/shifts clock, stress and panic roller, critical injuries (including the android table), initiative cards, supply rolls, countdowns, a xenomorph life-cycle tracker and a session checklist that modules extend. A Hints tab says what each attribute and skill is for in the story and rolls it for the best-placed PC.
- **Dice rolled at the table.** For groups who roll physical dice, every roll can take the faces instead: the roll panel, table mode's one-tap rolls (stress, panic, supply, critical injuries, broken and life-cycle checks, creature attacks and reactions, special attacks, duct events, prompt answers), initiative, travel checks and each generator step. One box per die in the order the rules read them, labelled from the dice system (base and stress dice, a d20 pair for advantage, a push's re-rolled dice only), with a 2d6 total, a d66 or a percentile typed as one number; faces the dice cannot show are refused inline. Outcomes, pushes, table rows and effects are exactly an app roll's, and the log marks the roll "entered" with its faces. A switch on each roll surface and in table mode flips between rolling in the app and entering dice; *I roll physical dice* in Settings makes entering the default on that device.
- **Share with players.** From table mode or a session page, send the player view to the group chat without a server: phone-sized cards (the scene briefing, the map with fog exactly as the player screen shows it, each revealed handout, an optional party card) or one black-and-white PDF packet in Letter or A4. Built from the player projection only (no GM notes, hidden zones, GM map layers, unrevealed or per-player handouts, or GM-only fields), drawn on the device, then handed to the phone's share sheet (Messages, Messenger, WhatsApp) or downloaded as a zip on desktops. Each share is recorded in the session, so the next one can send only what is new, with a ready-to-paste chat message.
- **Campaign primer.** A player-facing introduction for session 0 (the pitch, the setting, what everyone knows, places and factions, tone and safety tools, house rules, making characters, where we begin), edited as rich text with the module's prompts and starter text in original words. *Draft from campaign* fills sections from player-visible places, factions, timeline, characters and the adventure's player intro, never from GM-only records or fields. It is linked from campaign home and session 0, and shared like a session: one phone card per section or pages of the PDF packet. Modules and data packs can supply their own prompts (`primer` in the contract and the pack format).
- **Printed booklets.** A black-and-white GM booklet (Letter or A4) with a title page, cast cards, locations and puzzles, the site map and each act's scenes with boxed read-aloud text, plus cut-out agenda cards for the players.
- **Maps from images.** Imported images with rectangular zone overlays and open/blocked/door borders.
- **Rules reference.** Rule cards filtered by play mode: paraphrases with page references for Alien, the source's own text cited by section for the fifth edition and ORC modules.
- **Multi-system modules.** Every game system is a module: a TypeScript package, or a declarative JSON data pack (no code) that the SDK turns into one. GMs import packs in the app (*Game modules…* on the campaign list); a pack is validated before it is stored, never runs as code, shows its licence and attribution, and travels inside campaign bundles. Packs pick one of four built-in dice engines: d20 (advantage, disadvantage, DC, optional four degrees of success with natural 20/1 shifts, situational modifier choices), dice pool, 2d6 bands and d100 roll-under. `pnpm create-module` scaffolds a pack or a TypeScript module and `pnpm module-check` validates one or `--all`; the author guide is [docs/modules](../modules/README.md).
- **Supplements.** Extra options for a module you already have (backgrounds, subclasses, races, feats, spells, presets, tables, rule cards) as one JSON file of additive data, imported under *Game modules…*. A supplement is checked against the module it extends, merged in when that module loads, listed under it with its notice, marked with a source badge wherever its entries appear, recorded in generator provenance and carried in campaign bundles. Sheet fields suggest list items as you type (the fifth edition sheet's race, subrace, background and subclass), supplement items included, and still take any text. `pnpm create-module --supplement <module>` scaffolds one; [docs/modules/supplements.md](../modules/supplements.md) covers the format and keeping private supplements private.
- **Built-in supplements.** Supplements can ship with the app, optional per device: *Remaster ORC books* adds the ORC content of nine more remaster books to the ORC core rules module (820 creatures and NPCs, 27 hazards, 12 classes, 8 ancestries, feats, spells and items, still without the setting's names). It is listed under its module in *Game modules…* with *Built-in* and *Supplement* badges and an on/off switch (off by default; it roughly doubles the module's data), merged in when the module loads while it is on, marked with its source badge, and named, not embedded, in exported bundles, so importing one switches it on. A large supplement can be split into a main file and parts.

## Screenshots

The shots use the demo campaigns (load them from the campaign list); most show the Alien demos because they exercise the most features.

**Campaign list**: each game system has its own section with a button to start a campaign, its demos and the campaigns that use it; import and game modules stay at the top.

![Campaign list](../screenshots/campaign-list.png)

**Campaign home**: next session, adventures and open hooks.

![Campaign home](../screenshots/home.png)

**Character sheet**: rendered from the module's schema; computed values such as Health and Resolve are derived, never stored.

![Character sheet](../screenshots/character-sheet.png)

**Generators**: every step shows its roll and page; re-roll any step, then accept the result into the campaign.

![Star system generator](../screenshots/generator.png)

**Table mode**: the scene card, the clock, crew funds and the ship at a glance, stress and panic for each PC, countdowns and the session checklist.

![Table mode](../screenshots/table-mode.png)

**Table hints**: for each attribute and skill, the story moments that call for it, what success, failure and a push should do to the scene, lines to say aloud, and the PCs ranked by how good their roll is, best and worst marked; tap one to roll on the spot.

![Table hints](../screenshots/table-hints.png)

**Dice rolled at the table**: table mode set to *Enter dice*: the skill roll took the four base dice as typed (one success, marked "entered"), and the push asks only for the three dice it re-rolls and its new stress die.

![Entering physical dice for a skill roll and its push](../screenshots/enter-dice.png)

**Share with players**: the player-safe share of a session, previewed as the phone cards it sends (briefing, fogged map, revealed handout, party), with what to include, "only what's new" and the message for the chat.

![Share with players](../screenshots/share-players.png)

**Campaign primer**: Cold Harbor's session 0 introduction, with the module's prompt above each section, the demo's own text and the places drafted from player-visible locations; *Share primer* sends it as phone cards or a PDF.

![Campaign primer](../screenshots/primer.png)

**Printed booklet**: the adventure as a black-and-white GM booklet for Letter or A4: a title page with the key facts and contents, then the cast, locations with their puzzles, the site map, and each act with its pacing, agendas and numbered scenes, with boxed read-aloud text, grey GM-only boxes, page numbers and a running header.

![Printed booklet](../screenshots/booklet.png)

**Rules reference**: short paraphrases with printed page references.

![Rules reference](../screenshots/rules.png)

**Game modules**: the built-in Alien and SRD 5.1 modules beside a data pack imported on this device, each with its licence and attribution.

![Game modules dialog](../screenshots/game-modules.png)

**Supplements**: an original homebrew supplement imported for the SRD 5.1 module, listed under it with what it adds, its notice and its licence.

![A supplement listed under the module it extends](../screenshots/supplements.png)
