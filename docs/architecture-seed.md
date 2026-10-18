# Campaign Forge: Architecture Seed

Oct 18, 2026 · @M

## How to read this document

This is the founding seed for a web app that helps Game Masters build and run tabletop RPG campaigns, with the Alien RPG (Evolved Edition) as the first supported game. It is written to be handed to a dev team or a coding agent as the first file in the repository; nothing here is implemented yet.

"Campaign Forge" is a placeholder working name, not a brand decision. Rule mechanics cited for the Alien module come from the attached Free League core rulebook (Evolved Edition, 2025) and are referenced by page so a developer can check the source.

Sections 2 to 5 are game-agnostic and should hold for any future ruleset. Section 6 is the Alien-specific module. Sections 7 to 14 cover how the thing is built, phased, and seeded.

## Vision and scope

Campaign Forge is a Game Master's workspace for designing, organizing, and running tabletop RPG campaigns, where every game system is a plugin. The core app knows about campaigns, sessions, scenes, and linked entities; a game module supplies the rules, reference data, generators, and sheets for one ruleset. Version 1 ships with exactly one module, the Alien RPG Evolved Edition.

The primary user is the GM (the "Game Mother" in Alien) preparing between sessions and referencing material at the table. Players are secondary users in v1: they can view what the GM shares and own their character sheet, nothing more.

| Area | In v1 | Out of v1 (later or never) |
| --- | --- | --- |
| Campaign structure | Campaign, arcs/adventures, sessions, scenes, timeline, handouts | Multi-campaign shared worlds |
| Entities | NPCs, locations, factions, items, ships, creatures, clues, jobs, linked by typed relationships | User-defined entity types outside a module |
| Alien module | Rules reference by page, careers/skills/talents/gear/ship/creature data, all Chapter 11 generators, stress and panic helpers, Cinematic and Campaign play templates | Cinematic scenario text from published adventures |
| Prep tools | Generators, adventure and act templates, job board, NPC builder, encounter builder | Battle-map drawing |
| Table tools | Scene tracker, round/turn/shift clock, stress and panic roller, initiative list, timers | Full combat automation, virtual tabletop (tokens, fog of war, voice) |
| Sharing | Player view of shared material, player-owned character sheets | Content marketplace, public publishing |
| Export | Markdown and PDF of adventures and handouts, JSON bundle of a campaign | Import from other VTTs |
| Platform | Responsive web app, works offline at the table | Native mobile apps |

The app is a companion to the rulebook, not a replacement for it. The module encodes structure, tables, and mechanics as data and cites the page; it does not reproduce the book's prose.

## Design principles

Ten rules that every later decision in this document obeys. When two of them conflict, the earlier one wins.

1. **Rules live in modules, never in the core.** The core knows campaign, session, scene, entity, relationship, generator, and sheet. It never knows what a Stress Die is.
2. **Every entity is schema-driven.** A module declares its entity types as JSON Schema plus a sheet layout; the core renders forms, sheets, and search from the schema. Adding a creature type is a data change, not a code change.
3. **Generators are tables plus a small interpreter.** Random tables ship as data (dice expression, rows, weights, follow-up rolls). Code is written only for procedures that branch, such as a world-creation sequence where one result gates the next.
4. **Links over hierarchy.** An NPC appears in many scenes and a location belongs to a system. Typed relationships between entities are first-class and bidirectional; folders are a view, not the model.
5. **GM prep is a document, not a form.** Scenes and adventures are rich text with inline entity references, so the GM writes the way they already write in notes apps and the app indexes what they mention.
6. **Local-first.** The campaign lives on the GM's device and syncs when online; a bad wifi connection at the table never blocks play.
7. **Every rule cites its page.** Rules text shown in the app carries a page reference to the rulebook the user owns. The app is a companion, not a copy.
8. **AI assists, the GM authors.** Generated suggestions are opt-in, editable, labeled with their provenance, and never silently written into the campaign.
9. **Portable by default.** A campaign exports to a self-describing JSON bundle plus Markdown at any time, with no lock-in.
10. **Play modes are data.** A module may declare modes (Alien has Cinematic and Campaign) that switch which rules, templates, and sheet fields are shown.

## Game-agnostic domain model

The core model separates **narrative structure** (what the GM plans and runs, in order) from **world entities** (the people, places, things, and factions that recur), and joins them through the Scene. Nothing in this section names a rule from any game; the module fills in entity schemas and sheet layouts.

&#91;embedded content: domain model: narrative containment and the world-entity graph\]

The left side is what the GM plans and runs in order; the right side is what recurs across that plan. A Scene is the only record that routinely points into both, which is why it is the unit the GM reads at the table.

### Narrative structure

| Concept | What it is | Key fields | Contains / references |
| --- | --- | --- | --- |
| Campaign | Root of everything a GM owns for one table | module id, play mode, in-world calendar, members and roles | Adventures, Sessions, Entities, Timeline, Handouts |
| Adventure | A planned unit of story: a scenario, an arc, a job | title, premise, status (planned / active / done), hooks in, hooks out | ordered Acts |
| Act | Ordered division of an adventure; the unit at which per-player handouts change | number, goal, pacing notes, per-character handouts | ordered Scenes |
| Scene | Smallest prep unit; the thing the GM reads at the table | purpose, location, participants, read-aloud text, triggers, clues on offer, encounter, status (planned / run / skipped) | links to any Entity; optional Encounter |
| Session | A dated real-world sitting; the log of what happened | date, attendees, summary, scenes run, rewards granted | Scenes (many-to-many), Timeline events |
| Timeline event | An in-world dated fact, past or scheduled | in-world date, text, visibility | Entities involved, Session it emerged in |
| Handout | Anything shown to players: text, image, card, hidden agenda | body, visibility rule, reveal state | the Act or Scene it belongs to |
| Note | Free-form GM rich text attachable to anything | body with inline entity references | any node |

### World entities

Every world entity shares a base record: id, type, name, summary, tags, visibility, module-defined fields, and a sheet layout. The core ships these abstract types; a module may subtype or extend each.

| Entity type | Purpose | Typical module extension |
| --- | --- | --- |
| Character | PCs and NPCs alike; PCs carry a player-owned sheet | attributes, skills, talents, conditions |
| Creature | Non-human threats with their own stat block | stages, special attacks, behaviors |
| Location | Nestable places, from a star sector down to a single room or zone | planet, colony, ship interior, zone rules |
| Faction | Organizations with agendas and assets | allegiance, reputation with the party |
| Item | Gear, weapons, armor, consumables | weight, supply rating, features |
| Vehicle | Anything crewed that moves | ship attributes, modules, crew positions |
| Clue | A discoverable fact with where and how it can be found | required skill, failure fallback |
| Job | A mission with employer, objective, reward, and complication | mission type, payout, cargo |
| Encounter | A reusable confrontation: participants, map, triggers | initiative, threat level |

### Relationships

Relationships are typed, directed edges stored once and shown from both ends. The core defines `within`, `member_of`, `knows`, `owns`, `found_at`, `wants`, `appears_in`, and `blocks`; a module may add its own (Alien adds `buddy_of` and `rival_of` between PCs, and `employer_of` between a Faction and a Job).

### Visibility

Every entity, field, and handout carries one of four visibility values: `gm`, `players`, `some_players` (explicit list), or `revealed` (was hidden, now public, with the session it was revealed in). Hidden agendas and secrets in Alien are ordinary `some_players` handouts; the core never special-cases them.

### Generator runs

When the GM accepts output from a generator, the core stores a run record: generator id, every roll made, the resulting entity ids, and the fields the GM edited afterward. This makes generated content reproducible, auditable, and re-rollable field by field.

## Game Module system

A game module is a versioned package of mostly data and a little sandboxed code that teaches the core one ruleset. The core ships a module runtime (schema validator, sheet renderer, table roller, procedure runner, rule-card viewer, tracker host); the module ships the content those run on. In v1 the Alien module is bundled at build time, but the contract below is what a dynamically loaded module would also satisfy.

### What a module provides

| Package | Form | What it declares | Alien example |
| --- | --- | --- | --- |
| `manifest` | JSON | id, version, ruleset edition, publisher, license notice, play modes, required core version | modes `cinematic`, `campaign` |
| `dice` | JSON + one TS adapter | die faces and symbols, how a pool is built, success rule, push semantics, special symbol effects | base d6 and stress d6, success on 6, push adds stress |
| `entities` | JSON Schema per type, with `x-sheet` layout and `x-computed` expressions | fields, enums, derived values, default visibility per field | Character with 4 attributes, 12 skills, derived Health and Resolve |
| `relationships` | JSON | extra typed edges beyond the core set | `buddy_of`, `rival_of`, `employer_of` |
| `tables` | JSON, one file per table | dice expression, rows with ranges, weights, modifiers, nested rolls, page ref | Atmosphere table, Panic Response table |
| `procedures` | TypeScript, sandboxed, seedable | step graphs that chain tables and create entities, with one step gating the next | Main World Creation, Job Generator |
| `templates` | JSON + Markdown | scaffolds for adventures, acts, scenes, sessions per mode | three-act cinematic adventure with per-act agendas |
| `rules` | Markdown front-matter cards | short paraphrased rule summaries, page ref, mode tag, links to entities and tables | "Pushing a roll", p. 43 |
| `trackers` | JSON widget specs | live table widgets bound to entity fields or session state | stress per PC, countdown clock, initiative order |
| `calendar` | JSON | in-world calendar for the timeline | Gregorian, year 2183 default |
| `migrations` | TypeScript | upgrade stored entities when the module version changes | none at v1 |
| `fixtures` | JSON | sample entities and expected generator outputs for conformance tests | one of each career, one generated colony |

### The contract in code

```typescript
export interface GameModule {
  manifest: ModuleManifest;
  dice: DiceSystem;                  // buildPool(), roll(), push(), symbols
  entityTypes: EntityTypeDef[];      // schema + sheet + computed fields + default visibility
  relationshipTypes: RelationshipTypeDef[];
  tables: RollTable[];               // pure data
  procedures: Procedure[];           // run(ctx, seed) => GeneratedGraph
  templates: Template[];             // adventure | act | scene | session, per mode
  rules: RuleCard[];                 // summary + pageRef + mode
  trackers: TrackerDef[];
  calendar: CalendarDef;
  modes: PlayMode[];
  hooks?: {
    onSessionEnd?(ctx): Prompt[];    // e.g. XP questions, mental trauma check
    onEntityChange?(ctx, entity): Effect[];
  };
}
```

### Rules the runtime enforces

- **Deterministic generation.** Every procedure and table roll takes a seed. The same seed and module version reproduce the same output, which is what makes generator runs auditable and re-rollable field by field.
- **Safe expressions.** Computed sheet fields and table modifiers use a small expression language (JSONLogic or equivalent), never `eval`. A module cannot reach the network, the filesystem, or another campaign.
- **Schema is the API.** The core never imports a module's TypeScript types. It reads schemas at runtime, so a module update cannot break the core's build.
- **Conformance suite.** Before a module loads, the core checks that every table covers its full dice range, every enum referenced in a sheet exists, every procedure terminates on 1,000 random seeds, and every rule card has a page reference.
- **Mode filtering.** Every rule card, template, and sheet field may carry a mode tag; the core hides what does not apply to the campaign's active mode.

### What a module may not do

A module may not reproduce rulebook prose beyond short paraphrased summaries, ship copyrighted art, or embed published adventure text. Reference data (table structures, stat lines, lists of names) is the intended scope; the licensing section covers why.

## Alien RPG module

The Alien module maps the Evolved Edition core rulebook onto the contract in the previous section: two play modes, one dice system, eleven entity types, roughly sixty tables, seven procedures, two adventure templates, seven trackers, and a rule-card set. Page numbers below are the book's printed folios (the PDF index runs four pages ahead).

### Play modes

The book tags rules with a Cinematic or Campaign icon (p. 18, 24). The module declares both modes and tags every rule card, template, and sheet field accordingly.

| Rule | Cinematic | Campaign | Page |
| --- | --- | --- | --- |
| Character source | pregenerated, shipped with the scenario | player-built, optionally via Life Paths | 24, 282 |
| Personal agenda | hidden handout, one per act | chosen, persistent, rewards XP | 27 |
| Meta-currency | Story Points, max 3, one per act for pursuing the agenda | none; XP instead | 27, 44, 158 |
| Advancement | none | XP after each session, nine yes/no questions | 30 |
| Structure | three acts: Setup, Tilt, Showdown | frame, jobs, shore leave, home base | 157 to 159 |
| PvP | GM "calls PvP", traitor becomes an NPC | buddy and rival chosen by players | 27, 158 |
| Mental trauma healing | not applicable | shore leave only | 74, 257 |

### Dice system

Two kinds of d6: base dice and stress dice. A 6 on either is a success; a 1 on a stress die is the facehugger symbol (p. 20). The adapter exposes five operations:

1. `buildPool`: base dice = attribute + skill, adjusted by difficulty, gear, and up to three helpers, never below one base die; stress dice = current stress level (p. 42 to 43).
2. `roll`: any 6 succeeds; extra sixes buy bonus effects (p. 43).
3. `push`: once per roll unless a talent allows more; stress +1, re-roll everything not showing a 6; forbidden if a stress die showed 1 on the first roll; androids and NPCs never push (p. 25, 42, 43).
4. `stressResponse`: when a stress die shows 1, roll D6 + stress − Resolve against an eight-row table from Keeping Cool to Mess Up (p. 44).
5. `panicRoll`: on a trigger, roll D6 + stress − Resolve against a thirteen-row table: Keeping Cool, Spooked, Noisy, Twitchy, Lose Item, Paranoid, Hesitant, Freeze, Seek Cover, Scream, Flee, Frenzy, Catatonic (p. 72 to 73).

A Story Point converts one base die to a success before or after pushing (p. 44). The tracker records every panic result in the session because a result of 9 or more triggers the mental trauma check at session end (p. 74).

### Entity types

| Type | Module fields (beyond the core base record) | Source |
| --- | --- | --- |
| Character (PC) | career; Strength, Agility, Wits, Empathy (1 to 5; android caps 8 key, 7 other); 12 skills (0 to 5) each bound to an attribute; talents as a set with stack counts; stress level; Resolve = ceil((Wits + Empathy)/2) + Seen It All; Health = ceil((Strength + Agility)/2) + Hardened; personal agenda; gear with weight and encumbrance limit 2 × Strength; signature item; cash; story points (cinematic); XP (campaign); conditions (stress responses, critical injuries, mental traumas); android flag | 25 to 30, 42, 46 to 51 |
| Character (NPC) | attributes, Health, a few skills, at most one talent, gear, trait, goal, appearance; 25 presets from Android covert to Thug | 155, 157, 258 |
| Creature | stage, speed, Health, Mobility, Observation, armor level with conditional overrides, acid splash, signature attacks (D6 table of dice, damage, armor piercing, effects), special abilities, lifecycle trigger, containment protocol; no attributes, never pushes, never dodges | 208 to 225, 227 to 231 |
| Item | subtype Weapon (modifier, damage with E/stun/fire qualifier, range min/max in A S M L E, ammo, power, weight, cost, special tags), Armor (armor level, air supply, weight, cost, special), Tool, Medical, Food (weight, cost, effect), Pharmaceutical (cost, effect) | 82 to 99 |
| Vehicle | encountered, length, passengers, maneuverability, speed, hull, armor, weapons, cost | 100 to 105 |
| Spaceship | class (C G J M R U X), manufacturer, cost, crew, signature, AI, thrusters, length, hull, FTL rating, armor level, passengers; internal modules, upgrades, and armaments as references into their own lists | 121 to 137 |
| Location: Star System | star spectral class and brightness class, region (Core, Outer Veil, Outer Rim, Frontier, Far Reach), arm or bloc for allegiance | 236, 243 |
| Location: Planet | location, affiliation, classification, climate, temperature, terrain, colonies, population, key resources; generator fields size and gravity, atmosphere, geosphere, orbital components | 192 to 201, 237 to 240 |
| Location: Colony | size category (Start-Up, Young, Established), population, missions, factions, allegiance, campaign hook; sector-style short block of affiliation, classification, population, resources | 240 to 242, 262 to 266 |
| Location: Site map | zones flagged cluttered or open; borders open, blocked, or door; crawlspaces and access points | 54 to 56 |
| Faction | history, products or military, leaders, locations, relations, current activities, one named NPC; 8 major entries plus a minor-corporation list | 162 to 177 |
| Job | frame, system distance, difficulty, payment, employer or sponsor, bonus rewards, mission or cargo, destination, complications (count = difficulty), plot twist | 244 to 252 |

Career, Skill, Talent, Critical Injury, Mental Trauma, Ship Module, Ship Upgrade, and Armament are reference enumerations, not campaign entities. A career record holds key attribute, three key skills, cash formula, three talents, six names, six appearances, three agendas, six gear picks, three signature items (p. 31 to 39).

### Tables

All tables are data files with a dice expression, rows, modifiers that reference earlier results, optional nested rolls, and a page reference.

| Family | Tables | Dice | Notes |
| --- | --- | --- | --- |
| Character | stress response, panic response, mental trauma, XP questions, nine career pick-lists, campaign theme | D6 + mods, D66, D3, D6 | p. 30, 44, 73, 74, 158 |
| Life Paths | human or android, origin (three levels), early life (three columns), life event, career entry, favors, disasters, postings per career, psych evaluation | 2D6, D6, D66 | each row carries attribute deltas, skill deltas, psych modifiers, bonus rolls (p. 282 to 289) |
| World | planet size, atmosphere, temperature, geosphere, terrestrial terrain, ice terrain, colony size, colony mission, orbital components, faction count and type, allegiance (two columns), campaign hooks | 2D6, D66, D3, 3D6 | orbital components recurses on 12+ (p. 237 to 242) |
| Star system | system objects per class, gas giant features, asteroid belt features | D6 with star-class mods | p. 243 |
| Jobs | per frame: employer or sponsor, bonus rewards, mission or cargo, destination, complications; plus plot twists | D66, D6, D3 | nested sub-tables under employers; Expedition "Wreckage" re-rolls destination (p. 244 to 252) |
| Encounters | star system, ship reactions, surface (two columns), general colony, five area tables | D66 with tens-digit mods, 2D6, 3D6 | cadence depends on where the ship or party is (p. 252 to 257) |
| Shore leave | events for Marines, events for others | D66, nested D6 | p. 257 to 258 |
| Creatures | one signature-attack table per variant, broken xenomorph, facehugger swarm size | D6 | p. 208, 213 |

### Procedures

1. **Main World Creation** (p. 237 to 242): size, atmosphere, temperature, geosphere, terrain, then colony size, missions, factions, orbital components, allegiance, hook. Each step's modifier reads an earlier result, so the step graph is drawn below.
2. **Star System Generator** (p. 243): roll counts of gas giants, terrestrial planets, ice planets, and asteroid belts modified by star brightness class, then run World Creation per body (ice forces Frozen, uninhabited bodies skip colony steps, gas giants add D6+4 moons).
3. **Job Generator** (p. 244 to 251): preamble rolls distance (D6−1), difficulty (D3), payment ((distance + difficulty) × PCs × $1,000), then the frame's pipeline, with as many complication rolls as the difficulty.
4. **Life Path** (p. 282 to 289): nine steps producing a complete PC with provenance per roll.
5. **Encounter check**: picks the right table and modifier from the party's current location and time elapsed.
6. **Shore leave week** (p. 257): each PC picks Heal, Recover, Pursue Agenda, or Socialize; resolves the roll and applies the result.
7. **Session end hook** (p. 30, 74): asks the nine XP questions in campaign mode; if any panic result in the session was 9 or more, prompts the Empathy roll and, on failure, the trauma table.

&#91;embedded content: Main World Creation pipeline · 11 steps, 6 of them modified by earlier results\]

Steps 6 to 11 are skipped for uninhabited worlds, which is why the procedure runner needs `skipIf`, `repeat`, and table selection by context rather than a flat list of tables.

### Templates

- **Cinematic adventure** (p. 157): player-facing intro ("What's the story, Mother?"), GM situation, characters with three agendas each, locations with maps, three acts of events flagged mandatory or optional, epilogue.
- **Campaign**: Session Zero checklist (p. 158), frame record with job table, employers, careers, ship, and salary band (p. 234 to 235), job card, shore-leave week.
- **Scene**: location, zone map, participants, encounter, clues, triggers.

### Trackers

| Tracker | Binds to | Rule |
| --- | --- | --- |
| Stress and panic | each PC's stress, Resolve, conditions | stress response and panic rolls, result log for trauma check |
| Story points | each PC, cinematic only | cap 3, awarded per act |
| Clock | session | rounds (5 to 10 s), stretches (5 to 10 min), shifts (5 to 10 h) (p. 55) |
| Countdown | scene | minutes as a consumable; supply roll per round (p. 55) |
| Supply | each PC's air, ammo, power items | roll stress dice equal to rating, each 1 reduces it (p. 28 to 29) |
| Initiative | encounter | cards 1 to 10; a creature draws one per point of Speed (p. 59, 208) |
| Stealth mode | scene with a zone map | hidden NPC positions, active or passive flags, one zone per stretch, optional simplified mode (p. 55 to 58) |

### Rule cards

About 120 short cards, each a paraphrase of one rule with its page and mode tag: for example "Pushing a roll" (p. 43), "Range bands" (p. 55), "Panic triggers" (p. 72), "Calling PvP" (p. 158), "Xenomorphs in campaign play" (p. 159). Cards link to the tables and entity fields they govern so a sheet field can open its rule.

### Known data gaps

- The Expedition sponsors sub-table for major corporations defines ranges 11 to 43 only (p. 250); the module fills 44 to 66 with the Cargo Run corporation list and marks the rows as a module decision.
- Stage VII and beyond xenomorphs have no stats (p. 220 to 221); the module ships them as lore-only creature records.
- Published cinematic scenarios are not included; the template is empty until the GM writes into it.

## Key user flows and UX surfaces

The GM moves through one loop: prepare, run, wrap up, prepare again. Nine surfaces serve that loop; five flows are the ones v1 must get right.

### Surfaces

| Surface | Who | What it shows | Module-supplied parts |
| --- | --- | --- | --- |
| Campaign home | GM | next session, active adventure, open hooks, job board (campaign mode), recent edits | job board columns, hook types |
| Atlas | GM, players (filtered) | location tree (sector to room), faction list, NPC roster, graph view of relationships | location subtypes, map conventions (zones) |
| Entity page | GM, players (filtered) | sheet, notes, backlinks (every scene and note that mentions it), timeline of appearances | sheet layout, computed fields |
| Adventure builder | GM | outline of acts and scenes, per-act handouts, event list with mandatory/optional flags, attached maps | adventure and act templates per mode |
| Generator workbench | GM | one procedure at a time, every step with its roll shown, re-roll per step, accept into the campaign | procedures and tables |
| Table mode | GM | current scene card, participants with quick stats, clock, initiative, trackers, handout reveal, running log | trackers (stress, countdown), dice adapter |
| Session wrap-up | GM | log summary, reward prompts, timeline entries, loose ends carried forward | `onSessionEnd` hooks (XP questions, trauma check) |
| Player view | players | own character sheet, revealed handouts, shared timeline, party roster | sheet layout, player-visible fields |
| Rules reference | GM, players | searchable rule cards filtered by mode, linked from sheet fields and trackers | rule cards |

### Flow 1: start a campaign

1. Create campaign, choose module (Alien) and play mode.
2. Campaign mode: choose frame (Space Truckers, Colonial Marines, Frontier Colonists), employment status, home base, and starting ship from the frame's defaults.
3. Work through the Session Zero checklist as a form that writes answers into the campaign: how the crew met, buddies and rivals, goals, employer, current location.
4. Invite players by link; each claims or creates a character.

### Flow 2: build a cinematic adventure

1. New adventure from the module's three-act cinematic template: player intro, GM situation, characters, locations, three acts with events, epilogue.
2. Add pregenerated PCs; for each, write one agenda per act as a `some_players` handout.
3. Add locations with maps; mark zones on the map as cluttered or open with blocked or open borders.
4. Fill each act's event list, flagging mandatory events; attach NPCs, creatures, clues.
5. Export a booklet (PDF) and per-player agenda cards.

### Flow 3: generate a job and its destination

1. Open the generator workbench, choose the frame's job procedure; the preamble rolls distance, difficulty, and payment first.
2. Step through employer, bonus rewards, mission or cargo, destination, and the number of complications the difficulty demands; re-roll any single step.
3. Optionally roll a plot twist; optionally generate the destination as a full star system and world.
4. Accept: a Job entity, its Location tree, and a Faction link for the employer are created with a generator-run record, and the job lands on the job board.

### Flow 4: run a session

1. Start a session from the campaign home; table mode opens on the first planned scene.
2. Advance the clock in rounds, stretches, or shifts; the GM rolls stress and panic from the tracker, and trackers write results back to the character.
3. Reveal handouts and clues with one tap; each reveal is logged with its scene and session.
4. Capture the log in a running note with inline entity references; mark scenes run or skipped.
5. Wrap up: answer the module's end-of-session prompts, confirm timeline entries, carry loose ends into the next session's plan.

### Flow 5: make an NPC

1. Start from a module stat-block preset (for Alien, the 25 typical NPCs) or blank.
2. Set name, appearance, trait, goal; adjust attributes and the few skills that matter.
3. Link to a faction, a home location, and the scenes they appear in; set visibility.

### Interaction rules

- Writing comes first: typing `@` in any note or scene opens entity search and creates the link; an unknown name offers to create the entity inline.
- Every generated value shows a small provenance mark; clicking it shows the roll and offers a re-roll.
- Table mode is readable at arm's length on a laptop or tablet and works with the network off.
- Players never see a GM-only field, even in exports or search results.

## System architecture

The app is a local-first web client that owns the campaign and syncs it through a thin server. Generation, sheets, and table mode all run in the browser so the GM can work with the network off; the server exists for sync, players, exports, and AI.

&#91;embedded content: system architecture · GM browser, server, storage, player browser\]

The player's browser never connects to the GM's document; it syncs a projection the server derives, plus the player's own sheet.

### Components

| Component | Runs | Responsibility | Talks to |
| --- | --- | --- | --- |
| UI shell | browser | surfaces from the flows section, routing, theming, offline indicator | module runtime, local store |
| Module runtime | browser (procedures in a Web Worker) | loads a module, validates schemas, renders sheets, rolls tables, runs procedures with a seed, serves rule cards, hosts trackers | local store |
| Local store | browser (IndexedDB) | the campaign as a CRDT document plus one sub-document per rich-text body; search index rebuilt from it | sync service |
| Sync service | server (WebSocket) | authenticates, persists CRDT updates, derives the player projection, enforces visibility on every document a player can open | Postgres, object storage |
| API service | server (HTTPS) | accounts, campaign membership, invites, module registry, exports, AI requests | Postgres, object storage, AI gateway |
| Export engine | browser for Markdown and JSON; server for PDF | renders adventures, handouts, and bundles | object storage |
| AI gateway | server | assembles prompts from visibility-filtered campaign context, calls the model provider, stamps provenance, rate-limits | model provider |
| Postgres | server | users, campaigns, memberships, CRDT update log and snapshots, a searchable projection of entities, audit of generator runs and AI requests |  |
| Object storage | server | maps, images, exported PDFs, campaign bundles |  |

### Three boundaries that matter

1. **Core to module.** The core reads schemas and data at runtime and never imports a module's code except through the sandboxed procedure runner. A module update cannot break the core's build; a procedure cannot reach the network or another campaign.
2. **GM document to player documents.** The GM's campaign document is never synced to a player. The sync service derives a one-way player projection containing only `players`, `revealed`, and that player's `some_players` content. Each player's character sheet is its own two-way document, shared between that player and the GM. This is what makes "players never see a GM-only field" a property of the architecture rather than of the UI.
3. **Client to server.** Documents move over the CRDT sync protocol; everything else (auth, invites, exports, AI) is ordinary request and response. The client works fully with the WebSocket down and reconciles when it returns.

### Request paths worth naming

- **Generate a job offline:** UI shell calls the module runtime; the procedure runs in the worker with a seed; results and the run record are written to the local store; sync happens later.
- **Reveal a handout:** the GM flips visibility in the local store; on sync, the sync service recomputes the affected player projection and pushes it; the player's browser updates without reload.
- **Ask for an AI suggestion:** the client sends the entity ids in scope; the API service loads only what the requesting role may see, calls the gateway, and returns a labeled suggestion that stays outside the campaign until the GM accepts it.
- **Export a PDF:** the client posts the adventure's Markdown and asset references; the server renders with the same templates and returns a file link.

### Non-functional targets

| Target | Value |
| --- | --- |
| Offline | every GM surface except invites, PDF export, and AI works with no network |
| Sync latency | under 2 s from GM edit to player view on a normal connection |
| Campaign size | 10,000 entities and 2,000 notes without visible slowdown in search or atlas |
| Generator determinism | identical output for identical seed and module version, verified in CI |
| Data loss | none on tab close, crash, or lost connection; CRDT updates are durable locally before they are sent |

## Data model and storage

A campaign is one CRDT document holding typed maps of records, plus one sub-document per rich-text body. The server keeps the update log, snapshots, and a relational projection of the same records for search, permissions, and exports. Rich text is the only thing that needs a CRDT; everything else is a record with a last-writer-wins field map, which keeps merges predictable.

### The campaign document

| Map | Record | Notes |
| --- | --- | --- |
| `meta` | campaign id, module id and version, mode, calendar, created at | one record |
| `entities` | id, type, name, summary, tags, visibility, `fields` (module schema), `sheetState`, created, updated | type is `core.character`, `alien.creature`, and so on |
| `relationships` | id, type, from, to, note, visibility | stored once, rendered from both ends |
| `adventures` | id, title, premise, status, acts (ordered ids) |  |
| `acts` | id, adventure, number, goal, handouts (ids), scenes (ordered ids) |  |
| `scenes` | id, act, purpose, location, participants, bodyDoc (sub-document id), clues, encounter, status |  |
| `sessions` | id, date, attendees, scenesRun, logDoc, rewards, nextPlan |  |
| `timeline` | id, inWorldDate, text, entities, session, visibility |  |
| `handouts` | id, kind, bodyDoc or asset, visibility, revealedIn (session) |  |
| `notes` | id, title, bodyDoc, attachedTo |  |
| `generatorRuns` | id, procedure, moduleVersion, seed, rolls (step, table, dice, result), produced (entity ids), editedFields | the provenance record |
| `trackerState` | per session: clock, initiative order, countdowns, panic log | cleared or archived at wrap-up |

Ids are ULIDs so records sort by creation time and merge without coordination. A sub-document holds one ProseMirror-compatible rich-text body with inline entity references stored as `{type: "ref", id}` nodes, which is what backlinks are computed from.

### Entity record shape

```json
{
  "id": "01J9...",
  "type": "alien.character",
  "name": "Deputy Marshal Okafor",
  "summary": "Tired, honest, two months from retirement",
  "tags": ["npc", "skyfire-down"],
  "visibility": {"level": "gm"},
  "fields": {
    "attributes": {"strength": 4, "agility": 4, "wits": 4, "empathy": 2},
    "skills": {"rangedCombat": 2, "observation": 2, "closeCombat": 2},
    "talents": [{"id": "investigator", "count": 1}],
    "trait": "cynical",
    "goal": "keep the colony out of the news"
  },
  "provenance": {"generatorRun": "01J9...", "preset": "alien.npc.colonial-marshal"},
  "created": "2026-10-18T07:12:00Z",
  "updated": "2026-10-18T07:12:00Z"
}
```

The module's JSON Schema validates `fields`; computed values (Health, Resolve, encumbrance limit) are never stored, only derived at render time from the schema's `x-computed` expressions.

### Server-side relational schema

| Table | Purpose |
| --- | --- |
| `users`, `sessions_auth` | accounts and login sessions |
| `campaigns` | id, owner, module, mode, current snapshot pointer |
| `memberships` | user, campaign, role (gm, player), character entity id |
| `invites` | token, campaign, role, expiry |
| `doc_updates` | document id, sequence, binary update, author, received at |
| `doc_snapshots` | document id, sequence, binary state, size |
| `entity_projection` | campaign, entity id, type, name, visibility, fields as JSONB, full-text column; rebuilt from updates by the sync service |
| `player_projections` | campaign, user, document id of the derived read-only doc, last derived sequence |
| `assets` | id, campaign, kind, object key, size, uploaded by |
| `exports` | id, campaign, kind, object key, created |
| `ai_requests` | id, campaign, user, scope entity ids, prompt hash, response id, accepted into entity id or null |
| `modules` | id, version, manifest, package object key, published at |

### Visibility enforcement

The sync service recomputes a player's projection whenever an update touches a record whose visibility includes that player. Projection rules are pure functions over records, tested in isolation. The `entity_projection` table carries visibility too, so server-side search for a player is filtered in SQL, never in application code after the fact.

### Export bundle

A campaign bundle is a zip: `campaign.json` (every map above, module id and version), `notes/<id>.md` with entity references as `[[id|name]]`, `assets/`, and `README.md` listing the module version needed to reimport. Importing a bundle whose module version is older runs that module's migrations first.

## AI assistance layer

AI in this app writes prose around structure the generators already produced; it never produces the structure. Every feature works with AI switched off, and v1 ships with it off by default per campaign.

### Where it helps

| Task | Input | Output | Lands where |
| --- | --- | --- | --- |
| Describe a generated place | a colony's rolled fields (size, mission, atmosphere, factions, hook) | two paragraphs of description in the module's tone | suggestion panel on the entity page |
| Voice an NPC | preset, trait, goal, faction | three sample lines and a mannerism | suggestion panel |
| Draft read-aloud text | scene purpose, location, participants | a short read-aloud paragraph | suggestion panel in the scene editor |
| Elaborate a complication or twist | the rolled complication row and the job | a concrete version tied to named entities | suggestion panel on the job card |
| Summarize a session | the running log note | summary, loose ends, entities mentioned | wrap-up form, each line accepted separately |
| Extract entities from pasted notes | free text | candidate NPCs, locations, clues with fields filled where stated | review list, nothing created until accepted |
| Name things | entity type, faction, region | ten names | inline picker |

### Where it stays out

- It never rolls dice, picks table rows, or replaces a procedure; generation is deterministic and comes from the module's tables.
- It never writes into the campaign without the GM accepting a specific suggestion, and accepted text keeps its provenance label forever.
- It never runs for players and never sees GM-only content on a player's behalf; the gateway loads context under the requesting role's visibility.
- It never sees the rulebook. Prompts include the module's paraphrased rule cards and the campaign's own records, nothing else.

### Mechanics

1. The client sends a task id and the entity ids in scope, not the content.
2. The API service loads those records under the requester's visibility, assembles the prompt from a per-task template plus the module's style notes (for Alien: the eight GM principles, p. 152, and the three themes, p. 153), and calls the provider through a provider-agnostic adapter.
3. The response is returned with `{source: "ai", model, promptHash, requestId}` and stored in `ai_requests`; acceptance records which entity it went into.
4. Keys live on the server only. A campaign may bring its own provider key or use a metered allowance.

### Quality

A golden set of 50 task-and-context pairs with a short rubric (in tone, uses only supplied facts, no rules text, right length) runs in CI against every prompt-template change. Any task that fails the "uses only supplied facts" check is blocked from release.

## Recommended tech stack

TypeScript end to end, a React client with a CRDT local store, a small Node sync and API server over Postgres. The choices below favor libraries with editor bindings and offline story already solved, because the local-first requirement is the hardest one on the list.

| Layer | Choice | Why this and not the obvious alternative |
| --- | --- | --- |
| Language | TypeScript everywhere, pnpm workspaces, Turborepo | one type system across core, modules, client, and server; module schemas are JSON so no TS types cross the module boundary |
| Client framework | React 19 with Vite, TanStack Router and Query | large hiring pool; Next.js adds a server runtime the client does not need |
| Rich text | Tiptap (ProseMirror) with the Yjs binding | the only mature editor with a CRDT binding and custom inline nodes for entity references |
| Local store and sync | Yjs, y-indexeddb, Hocuspocus server with Postgres persistence | rich text needs a CRDT anyway; Automerge is comparable but lacks the editor bindings; PowerSync or ElectricSQL would add a second sync system for structured data |
| Schemas | JSON Schema validated with Ajv; Zod for server inputs; JSONLogic for computed fields | modules must be data; Zod types would leak code across the boundary |
| Schema forms | a small in-house renderer over JSON Schema with `x-sheet` layout hints | generic form libraries cannot do dice-pool widgets or stacked talents |
| Procedure sandbox | Web Worker with no network, QuickJS-wasm when third-party modules arrive | first-party module needs only the worker; QuickJS adds real isolation later without changing the contract |
| Search | MiniSearch in the browser; Postgres full text on the projection | one campaign fits in memory; server search exists for players and cross-campaign features |
| Server | Node with Hono, tRPC for typed calls, Drizzle ORM | light, typed, boring |
| Auth | magic-link email plus OAuth (Google, Discord), Lucia-style sessions | Discord is where RPG groups already are |
| Database | Postgres 16, managed | JSONB for projections, logical backups of the update log |
| Object storage | S3-compatible (Cloudflare R2 or MinIO locally) | maps and PDFs are large and static |
| PDF export | Playwright Chromium rendering the same HTML templates as the client | one template set for screen and print |
| Offline | PWA service worker with precached shell and module data | the module's tables and rule cards must be available with the network off |
| AI | provider-agnostic adapter behind the API service | provider choice is a configuration, not an architecture decision |
| Testing | Vitest for units and module conformance, Playwright for flows, a seeded-generator snapshot suite | determinism is a contract, so it is tested like one |
| Deploy | containers on Fly.io or Render, Sentry, OpenTelemetry traces | small team, no Kubernetes |

### Repository layout

```text
campaign-forge/
  packages/
    core/            # domain model, CRDT store, visibility rules, export bundle
    module-sdk/      # GameModule contract, table roller, procedure runner, conformance suite
    module-alien/    # the Alien RPG module: data, procedures, templates, rule cards
    ui/              # schema form renderer, sheet widgets, trackers
  apps/
    web/             # the React client (PWA)
    server/          # Hono API, Hocuspocus sync, projections, exports, AI gateway
  tools/
    table-lint/      # checks dice coverage, page refs, enum references
    seed-campaign/   # builds the demo campaign from fixtures
```

The `module-alien` package is the only place the word "xenomorph" appears. Everything in `core`, `module-sdk`, and `ui` is tested against a tiny fixture module (`module-example`) so the core cannot quietly grow Alien-specific behavior.

## Roadmap and milestones

Five phases over roughly 22 weeks for a team of three to four, each ending at a gate that proves one architectural claim before the next phase builds on it. The module and its data come first because every later surface renders them; players and sync come late because the GM-alone product is already useful without them.

&#91;embedded content: roadmap · five phases over about 22 weeks, one gate each\]

The order is deliberate: Gate 1 proves the module contract on real data before any UI is designed around it, Gate 3 proves a session can be run before players are invited to watch one, and Gate 4 is a security review of the player projection rather than a feature demo. Week counts are estimates for sizing, not commitments.

## Risks, open questions, and licensing

The largest risk is not technical: the Alien setting is licensed property, and no community license covers it. The architecture already isolates that risk in one package; the decision about how to distribute that package is open.

### Licensing and IP (not legal advice; get a lawyer before any public release)

- **Setting content.** Alien is 20th Century Studios property licensed to Free League (rulebook credits, p. 1). Free League's third-party license covers its own game lines (Dragonbane, Coriolis, Forbidden Lands, Symbaroum) and does not list Alien ([Rascal News](https://www.rascal.news/free-league-expands-third-party-license-to-include-more-games-and-more-languages/)). Xenomorph lore, faction names, ship names, and table prose are therefore outside any open license.
- **Engine mechanics.** The Year Zero Engine SRD is available under Free League's Free Tabletop License, royalty-free, with the restriction that no Free League brand names or other copyrighted material beyond the SRD may be used ([Free League](https://freeleaguepublishing.com/community-content/free-tabletop-licenses/)). Whether stress dice and panic rolls are in the SRD must be checked against SRD 1.0 before relying on it.
- **Mitigation already in the design.** Mechanics live in `module-sdk` and could be split into a `module-yze` under the FTL; Alien-specific names, lore, and table rows live only in `module-alien`. Rule cards paraphrase and cite pages; the app never ships rulebook prose or art.
- **Three distribution options, to be decided before Phase 4.** (1) Personal and private use only, no public release. (2) Ship `module-alien` as schemas and empty tables, with an import tool the owner of the book uses to key in rows, so the app distributes structure, not content. (3) Approach Free League for a license for a digital companion. Option 2 is the fallback that keeps the public product legal if option 3 fails.

### Technical risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| CRDT document grows large for long campaigns | medium | sluggish load | one sub-document per rich-text body, loaded on demand; snapshot compaction on the server |
| Player projection leaks a GM-only field | low | severe | projection is a pure function with property-based tests; Gate 4 is an external review |
| Module tables transcribed with errors | high | wrong generator output | table-lint checks dice coverage; fixtures compare against hand-rolled examples; every row carries its page for spot checks |
| Schema-driven forms feel generic | medium | GMs leave | `x-sheet` layout plus bespoke widgets for dice pools, stress, and supply; the character sheet is designed by hand first and the schema fitted to it |
| Offline and sync edge cases | medium | lost edits | updates are durable in IndexedDB before send; Playwright tests run with the network cut mid-session |
| Second module exposes Alien assumptions in the core | medium | rework | `module-example` fixture in CI; the core never imports `module-alien` |

### Open questions

- [ ] Is the product personal, for a group of friends, or public? This decides the licensing path and whether Phase 3 (players and sync) is even needed in v1.
- [ ] Should table mode support a shared screen for players (a second, read-only window) in v1?
- [ ] Which second module proves the contract: another Year Zero game (cheap, same dice) or a different engine entirely (expensive, more convincing)?
- [ ] Does the GM want maps drawn in-app (zones and borders as data) or imported images with zone overlays? The scene model assumes the latter.
- [ ] Is there a budget for a hosted AI provider, or should v1 rely on bring-your-own-key?

## Appendix: repository seed

What the first commit should contain beyond the layout in the tech-stack section: the data-entry manifest for the Alien module, two file formats, and a glossary so the team and the codebase use the same words.

### Alien module data manifest

| File | Contents | Count | Pages |
| --- | --- | --- | --- |
| `data/skills.json` | 12 skills with governing attribute | 12 | 42, 46 to 47 |
| `data/careers.json` | key attribute, key skills, cash formula, talents, names, appearances, agendas, gear, signature items | 9 | 31 to 39 |
| `data/talents.json` | career talents and general talents, stack limits, mode tags | 56 | 48 to 51 |
| `data/tables/character/` | stress response, panic response, mental trauma, XP questions, campaign theme | 5 tables | 30, 44, 73, 74, 158 |
| `data/lifepath/` | origin, early life, life event, career entry, favors, disasters, postings, psych evaluation | 12 tables | 282 to 289 |
| `data/tables/world/` | size, atmosphere, temperature, geosphere, two terrain tables, colony size, mission, orbital components, factions, two allegiance columns, campaign hooks | 13 tables | 237 to 242 |
| `data/tables/system/` | system objects, gas giant features, asteroid belt features | 3 tables | 243 |
| `data/tables/jobs/` | per frame: employer or sponsor, bonus, mission or cargo, destination, complications; plus plot twists | 14 tables | 244 to 252 |
| `data/tables/encounters/` | star system, ship reactions, surface, general colony, five area tables | 9 tables | 252 to 257 |
| `data/tables/shore-leave/` | events for Marines, events for others | 2 tables | 257 to 258 |
| `data/npc-presets.json` | typical NPC stat blocks | 25 | 258 to 259 |
| `data/creatures/` | XX121 stages I to VI with variants, Neomorph stages III to V, four other species, broken xenomorph and swarm tables | about 24 records | 208 to 231 |
| `data/items/` | weapons, armor, tools, medical, pharmaceuticals, food | about 90 records | 82 to 99 |
| `data/vehicles.json` | vehicle stat blocks | 6 | 100 to 105 |
| `data/ships/` | classes, modules, armaments, upgrades, seven ship records | 5 files | 121 to 137 |
| `data/factions.json` | eight major entries with sections, minor corporation list | 8 + 10 | 162 to 177 |
| `data/charted-space/` | regions, sectors, systems, planets, colonies from Chapter 9 and the Tartarus Sector | about 40 locations | 180 to 201, 260 to 277 |
| `templates/` | cinematic adventure, campaign frames, session zero, job card, shore-leave week, scene | 6 | 157 to 159, 234 to 235 |
| `rules/` | rule cards with page and mode | about 120 | throughout |

Data entry is the single biggest task in Phase 0 and the easiest to get wrong. Each file carries its page range in front matter, `table-lint` checks dice coverage, and a second person spot-checks ten random rows per file against the book.

### Table file format

```json
{
  "id": "alien.world.atmosphere",
  "name": "Atmosphere",
  "page": 238,
  "dice": "2d6",
  "modifiers": [
    {"when": {"<=": [{"var": "planet.diameterKm"}, 4000]}, "add": -2},
    {"when": {"and": [{">": [{"var": "planet.diameterKm"}, 4000]}, {"<=": [{"var": "planet.diameterKm"}, 7000]}]}, "add": -4}
  ],
  "rows": [
    {"range": [-99, 3], "result": {"atmosphere": "thin"}},
    {"range": [4, 6], "result": {"atmosphere": "breathable"}},
    {"range": [7, 8], "result": {"atmosphere": "toxic"}},
    {"range": [9, 9], "result": {"atmosphere": "dense"}},
    {"range": [10, 10], "result": {"atmosphere": "corrosive"}},
    {"range": [11, 11], "result": {"atmosphere": "infiltrating"}},
    {"range": [12, 99], "result": {"atmosphere": "special"}, "gmDecides": true}
  ]
}
```

### Procedure sketch

```typescript
export const mainWorldCreation: Procedure = {
  id: "alien.world.create",
  page: 237,
  steps: [
    { id: "size",        table: "alien.world.size" },
    { id: "atmosphere",  table: "alien.world.atmosphere",  reads: ["size"] },
    { id: "temperature", table: "alien.world.temperature", reads: ["atmosphere"] },
    { id: "geosphere",   table: "alien.world.geosphere",   reads: ["atmosphere", "temperature"] },
    { id: "terrain",     table: ctx => ctx.planetClass === "ice" ? "alien.world.terrain-ice" : "alien.world.terrain" },
    { id: "colonySize",  table: "alien.world.colony-size",  reads: ["atmosphere", "size"], skipIf: ctx => !ctx.inhabited },
    { id: "missions",    table: "alien.world.colony-mission", reads: ["atmosphere", "colonySize"], repeat: ctx => ctx.missionCount },
    { id: "factions",    table: "alien.world.faction", repeat: "1d3" },
    { id: "orbital",     table: "alien.world.orbital", reads: ["colonySize"] },
    { id: "allegiance",  table: ctx => ctx.region === "icsc" ? "alien.world.allegiance-icsc" : "alien.world.allegiance-arms", skipIf: ctx => ctx.region === "upp" },
    { id: "hook",        table: "alien.world.campaign-hook", optional: true }
  ],
  produce: ctx => [planetEntity(ctx), colonyEntity(ctx), ...factionEntities(ctx)]
};
```

### Glossary

| Term | Meaning here |
| --- | --- |
| Module | a versioned package that teaches the core one ruleset |
| Procedure | a seeded, multi-step generator defined in module code over module tables |
| Generator run | the stored record of one procedure execution: seed, rolls, outputs, later edits |
| Entity | any world record: character, creature, location, faction, item, vehicle, clue, job, encounter |
| Adventure, Act, Scene | the narrative containment hierarchy; Scene is the unit read at the table |
| Session | one real-world sitting and its log |
| Handout | player-facing material with a visibility rule and a reveal state |
| Visibility | `gm`, `players`, `some_players`, or `revealed` on every record and field |
| Projection | the derived, read-only document a player syncs instead of the GM's campaign |
| Tracker | a live table-mode widget bound to entity fields or session state |
| Rule card | a paraphrased rule with page and mode tag |
| Mode | a module-declared play style that filters rules, templates, and fields (Alien: Cinematic, Campaign) |
| Frame | an Alien campaign premise: Space Truckers, Colonial Marines, Frontier Colonists |
| Round, Stretch, Shift | Alien time units of 5 to 10 seconds, minutes, and hours |
| Zone | a map area in Alien stealth and combat; cluttered or open, with open, blocked, or door borders |

### Sources

- Free League, *Alien: The Roleplaying Game, Core Rules, Evolved Edition* (2025), the attached PDF; page numbers are printed folios.
- [Free League: Free Tabletop Licenses](https://freeleaguepublishing.com/community-content/free-tabletop-licenses/)
- [Rascal News: Free League expands third-party license](https://www.rascal.news/free-league-expands-third-party-license-to-include-more-games-and-more-languages/)
