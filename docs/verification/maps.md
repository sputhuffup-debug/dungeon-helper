## Site map generator and location tables

Checked against the owner's rulebook (Evolved Edition) in October 2026 while building the site map generator `alien.map.site`. Page numbers are printed folios.

### What was checked

| Area | Book pages | Where it lives |
|---|---|---|
| Zones, cluttered and open, borders, line of sight, range bands | 54-55 | `src/maps/data.ts` (range bands, legend), checks in `src/maps/generator.ts` |
| Stealth movement, Speed per stretch, active and passive enemies | 55 | spawn data, rule cards `stealth-mode`, `creature-speed` |
| Detection, the hidden GM map, crawlspaces and access points | 56 | legend, duct zones, new card `hidden-map`, card `crawlspaces` |
| Darkness | 57 | `dark` flag and legend |
| Motion tracker range | 58 | spawn distance (5+ zones) |
| Doors and hatches: lock, break (armor 2, 10 damage), Comtech; Adjacent as touching tokens | 61 | door armor and HP, range bands |
| Cover by a door or hatch | 66 | legend |
| Barrier armor (furniture 1, inner 2, outer 3, armored 4+) | 68 | `BARRIER_ARMOR` |
| Vacuum, explosive decompression, falling | 75 | legend, `atmosphere`, `outerHull`, `autoSeal`, `dropM` |
| Zero gravity, explosions in closed zones, fire and its spread | 76 | legend, `gravity`, `flammable`, the fire-spread check |
| Radiation levels | 77 | `radiation` flag |
| Creature Speed, Health, Mobility, Observation | 208-225 | already verified in `src/data/creatures.ts`; the spec's table matches it |
| Facehugger swarm Speed by number | 213 | swarm Speed in the spawn data |
| Location matrices (environment, salvage; section and access not used) | 296-297 | `src/tables/maps.ts` |
| Anomalous environment matrix | 298 | `src/tables/maps.ts` |
| Encounter timer presence levels and starting presence | 303 | `ENEMY_PRESENCE`, `layout.meta.acts`, new card `encounter-timer` |
| Enemy threat tiers | 305 | `CREATURE_TIERS`, new card `enemy-threat` |

### What changed

- New tables (family `maps`, all book-checked, no `unverified` flags): `alien.maps.location-detail` (the Environment Matrix, D66, 35 words plus "roll twice" on 66), `alien.maps.anomalous-detail` (D66, 36 entries) and `alien.maps.salvage` (D66, a common and a rare item per row). Entries are one- to four-word names, copied exactly as data.
- New rule cards: `hidden-map` (p. 56), `location-details` (p. 296-298, linked to the three tables), `encounter-timer` (p. 303) and `enemy-threat` (p. 305). The `crawlspaces` card now says the cutting torch takes Heavy Machinery with one try per stretch, and that acid only burns through a duct floor under gravity.

### Where the spec and the book differ (the generator follows the book)

- Acid blood burns a new access point through a duct floor only where there is gravity (p. 56); the spec leaves the condition out.
- Door and hatch rules (quick action to lock, a +2 dice close combat attack against armor 2 and 10 damage, Comtech for electronic locks) are on p. 61, which the spec does not cite.
- Explosive decompression (p. 75) needs a missed shot that could actually breach the bulkhead, and then a stress die roll; the same stray-shot rule for outer bulkheads and reactors is on p. 68.
- The threat tiers (p. 305) grade an encounter by the encounter check's roll, with example enemies; the book names only Facehugger (lesser), Drones (greater) and the Queen (overwhelming). The tier of every other creature, the group rule (two to five lesser foes count as greater, six or more or two greater as overwhelming) and the tier costs 1/3/6 are module decisions taken from the owner's spec.
- The book's guidance for the starting enemy presence (p. 303) is All Clear with no warning, Confirmed with known enemies and Closing or Near when they converge. The generator keeps the owner's per-act mapping (Act 1 All Clear or Uncertain, Act 2 Suspected or Confirmed, Act 3 Closing), which fits that guidance.
- The spec's "location detail" table is the book's Environment Matrix (p. 297). The book prints two more matrices for the same purpose on p. 296 (section and access); they are not used. The Anomalous Environment Matrix on p. 298 is added for derelicts and alien ruins.
- The salvage matrix has a common and a rare column, and the book does not say when to read which. The generator reads the rare column in key rooms and dead ends (module decision, noted on the table).
- Falling damage rounds down and needs gravity (p. 75); the generator only stores the drop height.

### Module decisions (no book data)

- Act budgets by crew size (`ACT_BUDGETS`), the 40% cluttered and darkness heuristics, the path length per runtime, first contact about three stretches into an act, duct shares per density, room catalogs and site profiles are the owner's or the module's choices, not book rules.
- Rock walls in mines and alien ruins use armor 4 (the armored-bulkhead floor), and blast doors use armor 4 with no damage track.

### Duct sheets (October 2026)

Each duct network is now its own generated level: a maze on its own sheet per deck, linked to rooms by labelled access points and to other sheets by shafts, with generated hazards and a GM-only duct event table. The book facts used, checked against the owner's copy:

| Fact | Book | Where it lives |
|---|---|---|
| Corridors and crawlspaces are cut into zones by doors or lines; zones up to about 25 m | 54-55 | runs split at 25 m or less, the `duct-size` check |
| In a narrow crawlspace such as an air shaft, other characters block line of sight, friends included | 55 | `singleFile` legend entry and flag |
| Nobody can move past anyone else in a narrow crawlspace | 61 | `singleFile` legend entry; event "Someone in the way" |
| Crawlspaces run beside, over or under rooms, shown as outlines | 56 | sheets over each deck and a crawlspace under the bottom deck |
| An access point costs one zone of movement to enter | 56 | access legend entry |
| A cutting torch seals an access point: Heavy Machinery, full action, one try per stretch; not even a Xenomorph breaks a sealed point | 56 | access and sealed legend entries |
| Acid blood eats a hole in a duct floor within a stretch, but only under gravity; over a room the hole is a new access point | 56 | sealed legend entry (the GM picks the room, since a sheet is not drawn to the deck's scale) |
| Crawlspace zones are open: no hiding, no cover | 56, 66 | `cluttered: false` on every duct zone, `crawlspace-open` check |
| Passive Observation when coming into line of sight; keeping guard for a stretch gives +2 dice | 56 | events "Shape at a junction", "Watch point" |
| Darkness: -2 dice to Observation for humans and androids, Xenomorphs unaffected, a flashlight removes it | 57 | every duct zone is `dark`; event "Working light" |
| The motion tracker detects movement within four zones | 58 | event "Tracker ping" |
| Jump or climb is a full action rolled with Mobility; using machinery is Heavy Machinery, a terminal is Comtech, persuading is Manipulation | 60 | shaft and vent fan legend entries, events |
| Recovery: 1 Health per stretch resting in a safe area unless fatigued | 68 | event "Dry pocket" |
| Barrier armor: inner bulkhead 2 | 68 | collapsed section (armor 2) |
| A metal door or hatch takes 10 damage before it gives in | 61 | collapsed section (10 damage) |
| Stress rises from an unnerving encounter as the GM decides | 72 | events "Scratching ahead", "Something left behind" |
| Resting a stretch in a safe area reduces stress by 1 | 73 | event "Dry pocket" |
| Extreme heat: Survival rolls at an interval the GM sets; a failure makes you fatigued, which ends when the hazard is remedied | 75 | hot pipes legend entry; event "Something drips" |
| Under water, a Survival roll every round (suffocation) | 75 | flooded legend entry |
| Falling in gravity: half the height in metres, rounded down; a controlled jump rolls Mobility and each success takes 1 off; body armor does not help | 75 | shaft and one-way drop legend entries; event "Panel gives way" |
| A fire attack rolls base dice equal to the intensity, 1 damage per success, armor works normally | 76 | event "Steam burst" (intensity 3) |
| The Salvage Matrix | 297 | event "Maintenance cache" rolls it |

Module decisions (no book rule), marked as such in the legend, the table notes and here:

- The duct sheet itself: a maze of runs, junctions, bends, dead ends and vent chambers, 8-20 zones per sheet, exits scattered at random so the sheet does not mirror the deck, and the cap of seven exits per sheet.
- A running vent fan blocks the duct until stopped (Comtech or Heavy Machinery). For distances it does not block, since the crew can stop it.
- Hot pipes call for one Survival roll per crossing.
- A flooded duct stretch is under water from end to end. The book has no swimming rule; it gives only the suffocation roll.
- A collapsed section is a hidden wall between two duct zones, armor 2 and 10 damage (an inner bulkhead that gives way like a door). It is only placed where the sheet stays connected without it.
- A one-way drop is a shaft too sheer to climb back, so it is passable downward only. Shafts are 4 m, a deck's height, as for ladders.
- Hazard odds per site type (`DUCT_HAZARD_ODDS`), and every sheet carries at least one danger.
- The duct event table `alien.maps.duct-events` is a module table (homebrew), flagged `unverified`. It is D66 read in pairs: 11-26 encounters, 31-46 dangers, 51-66 comforts. The steam burst's intensity 3, "The duct narrows" and "A loud knock" are module rules; the other rows apply the book rules cited on them.

New and changed checks: `duct-rooms` (every sheet reaches two or more rooms through unsealed access points), `duct-exits` (every exit is labelled and its floor zone points back), `duct-size` (duct zones 25 m or less, runs 1 m wide, no sheet over 20 zones), `crawlspace-open` (now also single file), `duct-access` (networks span sheets through shafts), `layout-intact` (overlaps checked on duct sheets too), `no-spoilers` (exit labels, duct hazards and unfound duct zones stay off the player map).

### Prose check

An automated check found no run of ten consecutive words shared between the new files (`src/maps/*`, `src/tables/maps.ts`, the new and changed rule cards, `test/maps.test.ts`) and the book text. The same check was run again over the duct sheet work (`src/maps/*`, `src/tables/maps.ts`, `test/ducts.test.ts`, `test/maps.test.ts`, this file and `docs/alien-field-names.md`) with the same result.
