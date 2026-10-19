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

### Prose check

An automated check found no run of ten consecutive words shared between the new files (`src/maps/*`, `src/tables/maps.ts`, the new and changed rule cards, `test/maps.test.ts`) and the book text.
