# Map generators

A map generator draws a site map for the campaign: a floor plan of zones (rooms and passages) with borders between them (walls, doors, stairs), markers (encounters, traps, treasure) and a key. The app shows it to the GM, projects a fogged copy to the players at the table, prints it and shares it (see [the app's features](../features/app.md)). TypeScript modules can write a generator in code (`MapGeneratorDef` in `packages/module-sdk/src/types.ts`; the Alien module's site generator is one). A data pack cannot run code, so it **configures a built-in engine** instead, the way it picks a dice engine:

```jsonc
"mapGenerators": [
  {
    "engine": "dungeon",                      // the built-in engine (the only one so far)
    "id": "mypack.map.dungeon",               // namespaced by the pack id
    "name": "Dungeon",
    "description": "Crypts and caves on a 5-foot grid.",
    "original": true,                         // or page / cite, like every table
    "mode": ["campaign"],                     // optional: only in these play modes
    "config": { … }                           // the engine's config: data and JSONLogic only
  }
]
```

The engine is code in the SDK; the config is data. Every rule in it is JSONLogic ([cookbook](jsonlogic.md)), and every random draw comes from the run's seeded streams, so the same seed, brief and module version give the same map (rule 3). The engine is loaded on demand: `moduleFromPackSource` loads it when a pack declares generators, and the web app keeps it out of the first page's code. TypeScript modules can declare a `PackMapGenerator` too (`createPackMapGenerator` from the SDK); the fifth edition and ORC packs build theirs in `scripts/authored/dungeon.ts`. `packages/module-example/packs/example-pack/pack.json` has a small complete example.

## The `dungeon` engine

It draws a dungeon of one or more levels on a square grid in four stages, each with its own random stream so the GM can re-roll one stage and keep the others:

| Stage | What it decides |
|---|---|
| `layout` (Floor plan) | Rooms, passages, levels and the stairs between them, the way in |
| `doors` (Doors and secrets) | How each link is joined: open, door, locked door, secret door, portcullis or bars, collapse; what is behind a secret door |
| `dressing` (Room purposes and dressing) | Each room's purpose, read-aloud line, GM note and dressing; zone flags (dark, difficult, water…) |
| `stocking` (Encounters, traps and treasure) | Encounters with creatures from the module, traps and hazards, treasure |

Each run checks its own map. A **block** check failing makes the engine try again on fresh sub-streams (up to 30 times): the way in exists, every room and passage can be reached from it (through locked and secret doors), stairs join every level to the next, no two rooms overlap (each outline matches its squares) and every level has at least three rooms. **Warnings** are shown on the workbench: a room only a secret door reaches, a key room that did not fit, encounter groups that found no creature, no treasure.

### The brief

The GM fills in (or the app reads from an adventure):

| Input | |
|---|---|
| `siteType` | One of the config's site types |
| `size` | One of the config's sizes (rooms in all, spread over the levels) |
| `levels` | 1 to `maxLevels` (default 3) |
| `partyLevel`, `partySize` | Ranges from the config (`partyLevel`, `partySize`: `{ min, max, default }`) |
| `threat` | The threat dial: one of the config's threats |
| `theme` | One of the config's themes, or `any` |
| `faction` | Free text, shown in the key |
| `keyRooms` | Rooms the adventure needs: `{ name, description, readAloud, lair }`; the lair one becomes the deepest, largest room |

Reading a brief from an adventure (*Map from this adventure*): scenes at locations whose subtype is in `keyRooms.locationSubtypes` (default `["dungeon"]`) become key rooms, the site type and theme come from keywords in the adventure's text, and the party's size from its PCs.

### Config

```jsonc
"config": {
  "grid": { "size": 5, "unit": "ft", "metres": 1.524 },   // one square
  "siteTypes": [ … ],                                      // below
  "sizes": [{ "id": "small", "label": "Small", "rooms": [5, 8] }],
  "maxLevels": 3,
  "partyLevel": { "min": 1, "max": 20, "default": 3 },
  "partySize": { "min": 1, "max": 8, "default": 4 },
  "threats": [{ "id": "standard", "label": "Standard", "occupied": 0.4, "vars": { "scale": 1 } }],
  "defaultThreat": "standard",
  "themes": [{ "id": "undead", "label": "The dead", "keywords": ["skeleton", "ghoul"], "vars": { "creatureType": "undead" }, "dressing": ["mypack.dungeon.bones"] }],
  "labels": { "passage": "Corridor" },
  "dressing": { "rooms": ["mypack.dungeon.dressing"], "passages": ["mypack.dungeon.passage"], "passageChance": 0.25 },
  "doors": { … },
  "encounters": { … },
  "traps": { … },
  "treasure": { … },
  "legend": [ … ],
  "zoneTables": [ … ],
  "accept": { … },
  "keyRooms": { "locationSubtypes": ["dungeon"] }
}
```

`threats[].occupied` is the share of rooms (besides the lair, which always has an encounter) that hold one. `vars` on site types, threats and themes are free values the rules below read as `site.<name>`, `threat.<name>` and `theme.<name>`. `labels` renames the map's words: `level`, `passage`, `outside`, `entrance`, `room`, `lair`, `encounter`, `trap`, `treasure`.

### Site types

```jsonc
{
  "id": "crypt",
  "label": "Crypt or tomb",
  "archetype": "halls",
  "keywords": ["crypt", "tomb", "barrow"],
  "rooms": "mypack.dungeon.crypt.rooms",       // room purposes
  "lair": "mypack.dungeon.crypt.lair",         // the deepest, largest room (default: rooms)
  "entrance": "mypack.dungeon.crypt.entrance", // the room the way in opens into (default: rooms)
  "hall": "mypack.dungeon.crypt.hall",         // the archetype's great hall, e.g. a temple's nave (default: rooms)
  "passageName": "Passage", "levelName": "Level", "outsideName": "Graveyard",
  "links": { "door": 4, "open": 2, "secret": 1 },  // relative odds of each join (defaults per archetype)
  "flags": { "dark": 0.7, "difficult": 0.1 },      // zone flags per room, with these chances
  "passageFlags": { "water": 1 },
  "vars": { "terrain": "underground" }
}
```

The **archetype** is the floor plan algorithm:

| Archetype | Plan |
|---|---|
| `halls` | Rectangular rooms joined by straight and bent corridors (crypts, tombs, vaults) |
| `caverns` | Irregular blob-shaped chambers joined by winding tunnels (caves) |
| `tunnels` | Small chambers strung along long, branching tunnels (mines) |
| `keep` | A walled footprint split into rooms around a central hall, corner towers, a gatehouse with a portcullis onto a bailey; upper levels repeat the footprint (towers and keeps go up, the others go down) |
| `channels` | Long water channels with walkways, rooms off them and an outfall behind bars (sewers, aqueducts) |
| `nave` | A long nave, sanctum and narthex with chapels on either side and a forecourt (temples) |

Room purpose tables (`rooms`, `lair`, `entrance`, `hall`) are ordinary roll tables whose row `result` is `{ name, readAloud?, gm?, tags?, flags?, dressing? }`: the room's name, the line the GM reads aloud (the players see it once the room is revealed), a GM note, tags the rules can read, zone flags (`{ "water": true }`) and a table rolled for that room's dressing. Dressing tables are any tables; their row label (or `result.text`) is a detail line.

### Picking from the module

Encounters, traps, locks and treasure all **pick something the module already has**: a table row, a preset (a creature, a hazard) or a reference list item. A pick is:

```jsonc
{
  "table": "mypack.dungeon.traps",            // roll first (id, or JSONLogic giving one); its row is `result`
  "id": { "var": "result.preset" },           // take this preset or list item…
  "presets": "mypack.monster",                // …or pick among presets of this entity type
  "lists": ["mypack.items"],                  // …or among items of these reference lists
  "match": { "fields.level": { "var": "level" } },     // fast equalities on the candidate
  "where": { "<=": [{ "var": "item.level" }, { "var": "inputs.partyLevel" }] },
  "fits": { "in": ["undead", { "var": "preset.tags" }] }  // preferred (the theme); the others are a fallback
}
```

The candidate is `preset` (or `item`) in `where` and `fits`. The rules' context is `{ inputs, site, theme, threat, level, room, result, preset, item, group, encounter, lock }`, with `room` `{ id, name, purpose, tags, area, depth, lair, entrance, key, passage, level }`.

### Doors

```jsonc
"doors": {
  "lock": { "lists": ["mypack.gear"], "match": { "id": "mypack.gear.lock" } },
  "notes": {
    "locked": { "cat": ["Locked (", { "var": "lock.name" }, "): DC 15 to pick."] },
    "secret": { "cat": ["Secret door: DC ", { "+": [10, { "var": "inputs.partyLevel" }] }, " to find."] }
  }
}
```

`notes` per join kind (`open`, `door`, `locked`, `secret`, `bars`, `rubble`) go into the key's exits; `locked` reads the `lock` the pick chose. On the map a locked door is a door that starts locked, a portcullis (`bars`) is a barred gap that may start locked, a collapse (`rubble`) blocks movement until cleared, and a secret door is a door hidden from the players until the GM marks it found. The engine only uses secret doors on loops or to reach a hidden room off a dead end, so the dungeon never needs one to be finished, and rubble only on loops.

### Encounters

```jsonc
"encounters": {
  "table": { "cat": ["mypack.encounter.", { "var": "site.terrain" }] },
  "prefer": { "in": ["undead", { "var": ["preset.tags", []] }] },
  "groups": [
    { "n": { "var": "result.count" }, "id": { "var": "result.preset" } },
    { "n": 1, "presets": "mypack.monster", "match": { "fields.level": { "var": "inputs.partyLevel" } }, "when": { "var": "room.lair" } }
  ],
  "creatureType": "mypack.monster",
  "xp": { "var": "preset.fields.xp" },
  "activity": "mypack.dungeon.activity",
  "detail": { "cat": [{ "var": "encounter.xp" }, " XP"] },
  "passages": 0.1,
  "cite": "My Rules, Building Encounters"
}
```

Each occupied room rolls `table`; each group then picks `n` creatures. `prefer` re-rolls the table (up to four more times) while the row's creature does not suit the theme; the engine keeps the roll whose groups all found a creature and that fits best. `xp` per creature sums into `encounter.xp`; `detail` is the key's line (XP, DCs, tactics); `activity` says what they are doing. `passages` is the chance a passage holds a wandering group. Use your game's own encounter rules here and cite them; where the rules give none, keep the tables original and say so.

### Traps and treasure

```jsonc
"traps": {
  "chance": { "*": [{ "var": "threat.trapChance" }, { "if": [{ "var": "room.passage" }, 0.5, 1] }] },
  "pick": { "table": "mypack.dungeon.traps" },
  "label": { "var": "result.name" },
  "detail": { "cat": ["DC ", { "var": "result.dc" }, " to spot. ", { "var": "result.effect" }] },
  "cite": "My Rules, Traps"
},
"treasure": {
  "chance": { "if": [{ "var": "room.lair" }, 1, 0.25] },
  "coins": { "cat": [{ "var": "inputs.partyLevel" }, "d6"] },  // a dice expression, rolled
  "coinsLabel": { "cat": [{ "*": [{ "var": "coins" }, 10] }, " gp"] },
  "itemCount": { "if": [{ "var": "room.lair" }, 2, 1] },
  "items": { "lists": ["mypack.magic-items"], "where": { "==": [{ "var": "item.rarity" }, "common"] } },
  "itemLabel": { "var": "item.name" },
  "original": true
}
```

A trap picked from a preset (e.g. a hazard) becomes an entity when the map is accepted; a trap from a table row stays a marker with its key text. Traps and treasure are GM-only marks: the players never see them, even in revealed rooms.

### Legend, zone tables, accept

`legend` entries are merged over the engine's own (same target replaces): give the flags your rooms use (`dark`, `difficult`, `water`, and the live `trap` flag's `found` and `sprung` values) your game's rule text and citation. `zoneTables` are module tables the GM rolls at the table for matching zones (as in TypeScript generators).

```jsonc
"accept": {
  "site": { "type": "mypack.location", "subtype": "dungeon", "fields": { "description": { "var": "map.name" } } },
  "room": { "type": "mypack.location", "subtype": "room", "fields": { "description": { "var": "room.readAloud" } } },
  "encounter": { "type": "mypack.encounter", "fields": { "xp": { "var": "encounter.xp" } } },
  "creatures": true,
  "hazards": true
}
```

When the GM saves a generated map with *Add its rooms, encounters and creatures to the campaign* ticked, the app creates (GM-only) the site (unless the GM picked an existing location), one entity per room within it, an encounter per encounter mark and a creature entity per creature from its preset (appearing in the encounter, or found in the room without an `encounter` type), and hazards from trap presets. Each room zone and mark links to its entity, the map's location is the site, and the adventure's scenes at the site (or its rooms) show the map. Field paths are dotted; values are JSONLogic over the context named in each entry (`map` `{ name, rooms, levels }`, `room` `{ name, readAloud, details, detailsText, gmNote, number, level, flags }`, `encounter` `{ label, detail, xp, groups, activity, creatures }`).

## What the map does with it

- **GM map**: every room numbered (passages unnumbered), doors, locks, secret doors, portcullises and collapses drawn, encounter, trap and treasure marks, a grid of squares (`grid`), and a room key with read-aloud text, description, encounters, traps (with DCs), treasure, exits and GM notes. The key exports as Markdown or CSV.
- **Player map**: at the table (the player screen, shares, player bundles) only what the party has found, cropped to it: unrevealed rooms and levels are left out entirely (not outlined), secret doors and the rooms behind them stay hidden until found, and no GM note, trap, treasure or encounter mark reaches the players. The printed player map is the whole plan for a battle mat, still without secret rooms and doors or any GM mark.
- **Table mode**: reveal rooms one at a time; open, lock, break or clear doors, portcullises and collapses; mark a secret door found; mark a trap found or sprung; place creature tokens from an encounter mark.
- **Prints**: Letter or A4 pages, tiles at 1 inch = 5 feet for 28 mm miniatures (or true 28 mm scale, or a 1 cm overview), and 24- or 36-inch rolls with a title block and a scale bar in feet.

## Checks

`pnpm module-check` validates `mapGenerators` against the schema, checks every table, preset type, list, theme and accept type the config names, and dry-runs each generator five times per site type (twice per seed, which must give the same map, and each run must pass its block checks). The SDK's own tests run each archetype over 100 seeds per size.
