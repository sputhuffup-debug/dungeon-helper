# Campaign Forge

A Game Master's workspace for designing, organizing and running tabletop RPG campaigns. Every game system is a plugin; version 1 ships one module, the **Alien RPG, Evolved Edition** (Free League, 2025).

Campaign Forge is a companion to the rulebook, not a replacement. The module encodes structure, tables and mechanics as data and cites the page; it does not reproduce the book's prose or art. The Alien data has been checked against the printed Evolved Edition core rules; `docs/verification/` records what was corrected, and the few entries the book does not supply remain flagged `unverified`.

## What it does (v1)

- **Local-first PWA.** The campaign lives in the browser (IndexedDB), works offline at the table, and exports to a self-describing zip bundle at any time. No server, no accounts.
- **Campaign structure.** Adventures, acts, scenes, sessions, timeline, handouts, notes with `@` entity references and backlinks.
- **World entities.** Characters, creatures, locations, factions, items, vehicles, ships, clues, jobs and encounters, each rendered from the module's JSON Schema sheet layout, linked by typed relationships.
- **Generators.** Seeded, re-rollable procedures over the module's tables: world creation, star systems, jobs, life paths, encounter checks and shore leave, with full roll provenance.
- **Guided adventure builder.** A step-by-step cinematic scenario builder (basics, situation, cast, locations and puzzles, three acts, review) with a field guide and page references on every step.
- **Table tools.** Scene cards, rounds/stretches/shifts clock, stress and panic roller, critical injuries (including the android table), initiative cards, supply rolls, countdowns, a xenomorph life-cycle tracker and a session checklist that modules extend. A Hints tab says what each attribute and skill is for in the story and rolls it for the best-placed PC.
- **Site maps.** A seeded deck-plan generator that reads the adventure's locations, puzzles and crew, checks the map against the zone rules, and produces a GM map, a player map (fogged in play, whole in print), a tracking map, a zone key and a distance table. At the table the GM reveals zones, locks and seals doors, marks fires and pings the tracker; the player screen shows only what the crew has seen.
- **Duct levels.** Ducts are generated as separate maze sheets with labelled exits, shafts between levels, hazards and a GM-only duct event table rolled from table mode.
- **Wide-format printing.** Site maps print on 24" or 36" rolls as vector PDFs at 1 inch per metre (28mm miniatures), 28mm true scale or an overview scale, with a title block, scale bar and optional 1 m grid squares.
- **Maps from images.** Imported images with rectangular zone overlays and open/blocked/door borders.
- **Rules reference.** Paraphrased rule cards with page references, filtered by play mode (Cinematic or Campaign).

## Screenshots

Two demo campaigns load from the campaign list: *Skyfire Down* (campaign play, with an infection under way) and *Cold Harbor Relay*, a cinematic one-shot built with the guided builder, with a generated site map, duct levels and live map state ready for session 1.

**Campaign home**: next session, adventures and open hooks.

![Campaign home](docs/screenshots/home.png)

**Character sheet**: rendered from the module's schema; computed values such as Health and Resolve are derived, never stored.

![Character sheet](docs/screenshots/character-sheet.png)

**Generators**: every step shows its roll and page; re-roll any step, then accept the result into the campaign.

![Star system generator](docs/screenshots/generator.png)

**Table mode**: the scene card, the clock, stress and panic for each PC, countdowns and the session checklist.

![Table mode](docs/screenshots/table-mode.png)

**Table hints**: for each attribute and skill, the story moments that call for it, what success, failure and a push should do to the scene, lines to say aloud, and the PCs ranked by dice pool; tap one to roll on the spot.

![Table hints](docs/screenshots/table-hints.png)

**Guided adventure builder**: the cinematic scenario steps with the field guide and what still needs fixing.

![Guided adventure builder](docs/screenshots/guided-builder.png)

**Site map generator**: the brief is filled from the adventure (key rooms, puzzles, NPCs) and every map is checked against the zone rules.

![Site map generator](docs/screenshots/map-generator.png)

**GM map**: zone numbers, ducts, spawns, clues, hazards, locks and act shading, with the legend and the rule each symbol carries.

![GM map](docs/screenshots/site-map-gm.png)

**Player map**: the same deck with every GM detail removed; it prints whole at 1 m = 1 cm, and at the table the player screen adds fog.

![Player map](docs/screenshots/site-map-player.png)

**Roll print**: a 36" wide-format vector PDF at 1 inch per metre for 28mm miniatures, turned to fit the roll with all text upright, with a title block, 5 m scale bar and zone key in the margin. Decks too wide for the roll split into overlapping strips with cut lines.

![Roll print](docs/screenshots/roll-print.png)

**Duct level**: each deck's ducts are generated as their own maze sheet, with runs, junctions, vent chambers and shafts that climb or drop between levels. Exits are labelled with the room they open into, generated hazards (vent fans, steam, flooding, collapses, drops) sit in the maze, and a GM-only duct event table rolls encounters, dangers and moments of respite at the table. Players see a duct zone only once the crew reaches it.

![Duct level](docs/screenshots/duct-map.png)

**Rules reference**: short paraphrases with printed page references.

![Rules reference](docs/screenshots/rules.png)

## Repository layout

```
packages/module-sdk     the GameModule contract and runtime (dice, tables, procedures, conformance)
packages/core           game-agnostic domain model, Yjs store, persistence, visibility, search, bundles
packages/module-alien   the Alien RPG module: data, procedures, templates, rule cards
packages/module-example a tiny fixture module the core and UI are tested against
packages/ui             schema-driven sheet renderer, widgets, trackers, map editor and site map renderer
apps/web                the React 19 + Vite PWA
tools/table-lint        dice coverage, page refs, data-status report, spot-check sheets
tools/seed-campaign     builds the demo campaign
docs/                   architecture seed, shared specifications, verification notes, screenshots
```

## Getting started

```
pnpm install
pnpm dev          # web app on http://localhost:5173
pnpm test         # unit tests and module conformance
pnpm typecheck
pnpm table-lint   # lints every table in every module
```

## Licensing note

Alien is the property of 20th Century Studios, licensed to Free League Publishing. This project contains structure and short paraphrased reference data intended for owners of the rulebook. It is not affiliated with or endorsed by either company. Review `docs/architecture-seed.md` (section "Risks, open questions, and licensing") before any public release.
