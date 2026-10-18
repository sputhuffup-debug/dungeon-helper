# Campaign Forge

A Game Master's workspace for designing, organizing and running tabletop RPG campaigns. Every game system is a plugin; version 1 ships one module, the **Alien RPG, Evolved Edition** (Free League, 2025).

Campaign Forge is a companion to the rulebook, not a replacement. The module encodes structure, tables and mechanics as data and cites the page; it does not reproduce the book's prose or art. The Alien data has been checked against the printed Evolved Edition core rules; `docs/verification/` records what was corrected, and the few entries the book does not supply remain flagged `unverified`.

## What it does (v1)

- **Local-first PWA.** The campaign lives in the browser (IndexedDB), works offline at the table, and exports to a self-describing zip bundle at any time. No server, no accounts.
- **Campaign structure.** Adventures, acts, scenes, sessions, timeline, handouts, notes with `@` entity references and backlinks.
- **World entities.** Characters, creatures, locations, factions, items, vehicles, ships, clues, jobs and encounters, each rendered from the module's JSON Schema sheet layout, linked by typed relationships.
- **Generators.** Seeded, re-rollable procedures over the module's tables: world creation, star systems, jobs, life paths, encounter checks and shore leave, with full roll provenance.
- **Table tools.** Scene cards, rounds/stretches/shifts clock, stress and panic roller, initiative cards, supply rolls, countdowns and stealth-mode zone tracking.
- **Maps.** Imported images with rectangular zone overlays and open/blocked/door borders.
- **Rules reference.** Paraphrased rule cards with page references, filtered by play mode (Cinematic or Campaign).

## Repository layout

```
packages/module-sdk     the GameModule contract and runtime (dice, tables, procedures, conformance)
packages/core           game-agnostic domain model, Yjs store, persistence, visibility, search, bundles
packages/module-alien   the Alien RPG module: data, procedures, templates, rule cards
packages/module-example a tiny fixture module the core and UI are tested against
packages/ui             schema-driven sheet renderer, widgets, trackers, map editor
apps/web                the React 19 + Vite PWA
tools/table-lint        dice coverage, page refs, data-status report, spot-check sheets
tools/seed-campaign     builds the demo campaign
docs/                   architecture seed and shared specifications
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
