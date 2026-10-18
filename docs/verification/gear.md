# Gear, vehicles and spaceships

Checked against the Evolved Edition core rules: chapter 5 Gear & Tech (printed p. 82-105), the spaceship sections of chapter 6 (p. 121-147) and the equipment appendix tables (p. 308-313), which repeat most stat lines and were used to cross-check them.

## What was checked

| File | Pages | Result |
|---|---|---|
| `packages/module-alien/src/data/items.ts` | 82-99, 309, 313 | Rebuilt from the book: 89 items |
| `packages/module-alien/src/data/vehicles.ts` | 100-105, 313 | Rebuilt: the book's 6 vehicles |
| `packages/module-alien/src/data/ships.ts` | 128-138 | Rebuilt: the book's 7 spaceships |
| `packages/module-alien/src/data/ship-reference.ts` | 121-127 | Rebuilt: 7 classes, 40 module rows, 15 upgrades, 12 armaments |
| `packages/module-alien/src/entities/item.ts`, `vehicle.ts`, `spaceship.ts` | 82, 100, 122 | Schema fields fitted to the book's stat lines |
| `packages/module-alien/test/data.test.ts` | | Assertions for the above updated; two new ship arithmetic tests |

Every stat line, name and price is copied from the book. Summaries and effects are in my own words. Checked presets and the four ship reference lists no longer carry `unverified`.

## What changed

### Items (89, was 92)
- **Weapons (35):** 28 personal weapons from p. 82-89 and 309, plus 7 vehicle weapons from the p. 313 table (tagged `weapon:vehicle`, `portable: false`). Removed the invented Armat P-9 SHARP Rifle, M72 Starshell Flare, M20 Claymore Mine, Machete, Industrial Drill and Cattle Prod. Added VP-70MA6, Weyland ES-4, F44AA, M5A3 RPG Launcher (replaces the invented SADAR), Seismic Survey Charge and the vehicle weapons. Most stat lines changed: for example, the M4A3 is now +2 / 2 / A/M (it was +1 / 1 / medium), the M41A is +2 and the sentry gun costs $12,000.
- **Ranges** follow the book's min/max pairs: `rangeMin` + `range`, using the shared `RANGE_IDS` (`adjacent`...`extreme`). Damage "2E" becomes `damage: 2, explosive: true`. The `energy` damage type was dropped because the book has only normal, stun and fire.
- **Armor (7, was 10):** M3, Kevlar Riot Vest, IRC Mk.50, IRC Mk.35, Eco All-World, W-Y APEsuit, and the P-5000 Powered Work Loader, which the book lists under Suits & Armor. Removed the invented generic compression suit, the HAZMAT suit, UPP combat armor and corporate security armor. The armor levels are on the Evolved scale (M3 is now 2, it was 6).
- **Other gear:** computer mainframes and data storage (subtype `other`); diagnostics & display, vision devices and tools (subtype `tool`); 4 medical supplies; 5 pharmaceuticals; 7 food and drink. Each has a `gear:<book heading>` tag. All invented gear was removed (rope, climbing gear, respirator, ship's cat, cigarettes, and so on).
- **New item fields:** `portable` (false where the book prints weight N/A), `costText` (for prices like "$2–$100", "Varies" or "Free–$1.50"; `cost` then holds the low end), `explosive`, `munitionCost`, `skillBonus` (dice modifiers by skill id) and `skillLevels` (fixed skills of mainframes, the AutoDoc, the MedPod and the sentry gun).

### Vehicles (6)
NR-9 ATV, Daihotai 8×8 Tractor, M570/M577 APC, Aerodyne Gyrocar, UD-4 Cheyenne and WY-37B Cargo Lifter, with the exact stat lines. Removed the invented cargo hovercraft. The P-5000 power loader is now an item. Added the `armorNote` field for the NR-9's exposed occupants.

### Spaceships (7)
Starcub Shuttle, CM-93D Mule, CM-90S Corvus, CM-88G Bison, CM-88H Bison, CYG-NS3 Star Clipper and Conestoga-Class Frigate. Removed the invented Armadillo tug and Heliades survey vessel.
- The book's classes C/G/J/M/R/U/X are size classes, each with a price, base stats and module and hardpoint slots by size. They are not role names like "Commercial" or "Military".
- Modules are rows of module + size (`cargo-bay-iv`, `cryo-deck-ii`...), each with its capacity and cost. A ship lists an id once for each copy fitted. Upgrades carry `maxPurchases` where the book sets a limit. Armaments carry modifier, damage, range (`contact` to `extreme`, plus `surface` for the nuke), hardpoint size, cost and missile cost.
- New spaceship fields: `designation`, `troops`, `munitions` (missiles or mines carried, by armament id).
- **The arithmetic checks out.** A ship's printed price equals its class price, plus its AI mainframe, modules, upgrades, armaments and munitions. Its Hull, Thrusters, Signature, Armor and FTL equal the class base adjusted by its upgrades. Both checks are now tests, and all 7 ships pass. The arithmetic also settles three points the print leaves open:
  - "EEV II" on the Corvus, the Bisons and the Star Clipper is the $500,000 Class C Type 337. Only that price makes each total come out right.
  - The Conestoga is printed with class "Conestoga" (p. 138), not a letter. Its price, hull, crew and base stats match an R-class hull exactly, so it is stored as `R`.
  - The $10,000 price of Orbital Mines is per mine (the Conestoga carries 60), marked `costPerMunition`.

## Still flagged `unverified`, and why
- `alien.item.mu-th-ur-6500`: the chapter (p. 92) gives COMTECH 7 and the appendix (p. 310) gives COMTECH 6. I used 6, which fits the pattern of the other models.
- `alien.item.long-data-discs`: the chapter gives $5,000 and the appendix $30. I used the chapter price.

Other book inconsistencies were resolved without a flag and noted in each preset's summary:
- Corvus price: the p. 138 table says $16,550,000 and the stat block $18,350,000. The stat block is the one that adds up.
- Rexim pistol: the chapter heading prints RXF-M55, the appendix RXF-M5.
- APC: the chapter calls it the M570 series and the table the M577.
- Dropship: the chapter calls it the UD-4 and the table the UD-4L.

## Renamed or removed ids (references to fix elsewhere)
Renamed (no other file referenced the old ids except where listed):
- `alien.item.armat-sadar-m5-rocket-launcher` → `alien.item.m5a3-rpg-launcher`
- `alien.item.pr-put-personal-data-transmitter` → `alien.item.personal-data-transmitter` (the PR-PUT is now its own `pr-put-uplink-terminal`)
- `alien.item.samani-e-series-headset` → `alien.item.comm-unit` (the Samani E-Series is a watch: `samani-e-series-watch`)
- `alien.item.seegson-c-series-diagnostic` → `alien.item.seegson-system-diagnostic-device` (the C-Series is a tape recorder: `seegson-c-series-magnetic-tape-recorder`)
- `alien.vehicle.nr-6-atv` → `alien.vehicle.weyland-nr-9-atv`
- `alien.vehicle.p-5000-power-loader` → `alien.item.p-5000-power-loader` (armor)
- `alien.spaceship.lockmart-cm-88b-bison-tug` → `alien.spaceship.lockmart-cm-88h-bison`
- `alien.spaceship.starcub-class-corvette` → `alien.spaceship.lockmart-starcub-shuttle`

These ids were kept even though the book's name differs, because they are the same thing: `knife` (Combat Knife), `light-armor-vest` (Kevlar Riot Vest), `automed` (AutoDoc), `electronic-tool-kit` (Electronic Tools), `motion-tracker` (M314), `field-rations` (Prefab Meals), `purified-water` (Water Bottle), `fresh-food` (Colony Specialty Meals), `alcohol` (Beer and Booze), `x-stim` (X-Drugs), `bison-m-class-hauler` (CM-88G Bison), `conestoga-class-troop-transport`.

All old ship module, upgrade and armament ids were replaced; nothing outside `ships.ts` used them.

## Cross-slice issues
- `src/data/npc-presets.ts` (NPC slice) asks for removed ids, so these gear lines no longer link to an item:
  - line 160 and line 178: `pr-put-personal-data-transmitter` should be `personal-data-transmitter`.
  - line 249: `compression-suit` should be `irc-mk50-compression-suit`.
- `src/reference/frames.ts` line 86 lists the Corvus as "M-Class Salvage Vessel (p. 132)". The book says G-Class, with the stat block on p. 133.
- `src/reference/careers.ts` gear names match the book's item names, apart from free-text items that are not in the gear chapter.
- `docs/alien-field-names.md` needs these updates (the file is not mine):
  - items: new fields `portable`, `costText`, `explosive`, `munitionCost`, `skillBonus` and `skillLevels`; `damageType` is now normal/stun/fire; ranges use `adjacent`.
  - vehicles: new field `armorNote`.
  - spaceships: new fields `designation`, `troops` and `munitions`; module ids are size-specific.
- `src/rules/ships.ts` and `space-travel.ts` cite pages from the old layout. The modules, upgrades and armaments cards point at 128-137; the book has them on 122-127.
- `tools/seed-campaign`: three ships carry the `frame:space-truckers` tag, in the same relative order as before (Corvus, CM-88G Bison, CM-88H Bison), so the pick still works. The seed test currently fails further on (build.ts line 279, an NPC from the pool is missing), which is outside this slice.
