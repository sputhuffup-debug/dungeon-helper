# Creatures, NPCs and factions

I checked this slice against the Evolved Edition core rules. All page numbers below are printed folios.

## What was checked

| File | Book pages |
|---|---|
| `src/data/creatures.ts`, `src/tables/creatures.ts`, `src/entities/creature.ts` | 204-231 (Engineers, xenomorph combat rules, XX121 stages I-VI, Neomorph, other extrasolar species), 120 |
| `src/data/npc-presets.ts` | 155-157 (NPC guidance), 258-259 (typical NPC list) |
| `src/data/factions.ts`, `src/data/minor-corporations.ts`, `src/entities/faction.ts` | 162-177 (Governments & Corporations), 166 (Colonial Administration), 120 (Church of Immaculate Incubation) |

## What changed

### Creatures: 32 presets, 30 verified
- **Stage numbering follows the book.** Stage I is the Ovomorph and The Queen's Egg. Stage II is the Facehugger, Praeto-Facehugger and Royal Facehugger. Stage III is the Chestburster, Bambi Burster, Imp and Queen Burster. Stage IV is the Drone, Scout and Stalker. Stage V is the Soldier, Worker and Sentry. Stage VI is the Praetorian, Charger (Crusher) and Queen. Before this, the module had the drone at III, the soldier at IV, the praetorian and crusher at V and the queen at VI.
- **Every stat line is now the book's.** That covers Speed, Health, MOBILITY, OBSERVATION, Armor Level, armor against fire and Acid Splash. Every one of the old values was wrong. For example, the old drone had Armor 6 and Acid 6, and the book has 2 (1 vs fire) and 8. A stat is only set when the book gives it: eggs have no skills, the Harvester has no OBSERVATION, and the Swarm has no numeric armor.
- **New fields:** `armorVsFire`, `attackTable` (the id of the table the creature rolls on), `rollTo` on attack rows, `swarmSpeed` on the Facehugger, and `classification`/`habitat`/`size`/`inWater` for the other species. All of these are in the schema.
- **Neomorph:** Stage I Egg Sacs and Stage II Motes are lore-only, because the book gives them no stat block. Then come the Bloodburster, the Neophyte (juvenile) and the Adult Neomorph.
- **Other species:** Harvester, Harvester Juvenile, Lion Worm, Tanakan Scorpionid (its in-water stats are kept as data) and The Swarm.
- **Lore-only entries:** Engineer (p. 204-207) and Deacon (p. 220 sidebar).
- **Removed because they are not in the book:** the old stage-III scout variant, the stage-IV worker and the crusher stat lines (all replaced by the book's versions), Facehugger Swarm as a creature, Bodyburster, Broken Xenomorph as a creature, and the neomorph spore pod and sprinter.
- **Renamed ids:** `neomorph-spore-pod` is now `neomorph-egg-sacs`, `neomorph-sprinter` is now `neomorph-neophyte`, and `xx121-crusher` is now `xx121-charger`. Nothing outside these files referenced the old ids.
- Every XX121 preset now carries the shared XX121 abilities from p. 210: Acid Splash, cold and vacuum immunity, radiation resistance and darkness.

### Attack tables: 12 tables, all verified
- There is one table per book table, and tables shared by several creatures keep a single id:
  - `facehugger`: 4 rows (1-2, 3-4, 5, 6+), with the last row open-ended to 99.
  - `chestburster`: 4 rows (1-3, 4, 5, 6).
  - `drone`: Drone, Scout & Stalker.
  - `soldier`: Soldier & Sentry.
  - `queen`: Praetorian, Charger & Queen.
  - `neomorph-bloodburster`: 4 rows.
  - `neomorph-adult`: Neophyte and adult.
  - `harvester`, `lion-worm`, `tanakan-scorpionid` and `swarm` are new.
- **Removed:** `alien.creatures.attack.worker`, because the book gives the Worker no attacks. `alien.creatures.attack.neomorph-sprinter` was replaced by the shared Neomorph table.
- **Broken xenomorph table:** it is on p. 208, not 213. The real rows are Rise Again, Wounded, Desperate Escape, Last Breath and Torn Apart (5-6).
- **Removed `alien.creatures.facehugger-swarm`.** The book's table is a lookup of Speed by number of facehuggers, not a die roll. The values (1-2 → 2, 3-5 → 3, 6-10 → 4, 11-20 → 5, 21+ → 6) are now `swarmSpeed` and an ability on the Facehugger.

### NPCs: 25 presets, all verified
- The book has exactly 25 typical NPCs, and the presets now use their exact names, attributes, skills, talent and gear. The printed Health of every entry matches the computed formula. The Mining wildcatter's 5 includes +1 from Hardened.
- The old presets gave NPCs careers, traits, goals and appearances that the book does not have. Those have been removed: the book leaves them to the GM (p. 157).
- The Corporate executive's $2,000 is stored as `cash: 2000`.
- Gear keeps the book's wording and links to an item preset through `itemId`, and the weight comes from that item. Four tiny items have no item preset and weigh 0: Handcuffs, Toy or doll, Penlight and Voice recorder.

### Factions: 20 presets, all verified
- **The 8 chapter entries:** `three-world-empire`, `united-americas`, `upp`, `icsc`, `icc` (new), `weyland-yutani`, `lasalle-bionational` (moved from the minor list to a major entry, same id) and `seegson`. Each one has the book's section headings as fields, its featured NPC with name and title as data, and the correct page. A section the book does not give is left as an empty string.
- **Two other book organizations, tagged `organization`:** `colonial-administration` (p. 166) and `church-of-immaculate-incubation` (p. 120, not 177).
- **The invented NPCs are gone,** for example "Director Ashford Blake". The featured NPCs are now the book's: Vihaa Reddy, Aeron Percival, Pham Dinh, Martin, Paul van Leuwen, Michael Bishop, Edina Lasalle and James Evans-Russell.
- **Minor corporations come from p. 162 ("The Company You Keep").** The list is Alphatech Hardware, Chigusa Corporation, Gemba Systec, Hyperdyne Systems, Jĭngtì Lóng Corporation, Kelland Mining Company, Koorlander Corp, Souta Corp, Lockmart and Steer City Cattle Company.
  - Removed because they are not on the list: Armat Battlefield Systems, GeoFund Investor, Gemini Exoplanet Solutions, Synthetech and Samani Communications.
  - The list is still 10 items. Its page is now 162; it was 176-177.
- **Reputation now starts at 0 for every faction.** It is a module convention, and the old non-zero values were invented.

## Still unverified, and why
- The two Stage VII+ creatures (`xx121-empress`, `xx121-king`). The book only mentions these forms as rumor on p. 220-221 and gives no stats, so they stay lore-only and flagged.
- **Module readings rather than book data:**
  - Corporate `allegiance`: W-Y `3we`, Lasalle `uas`, Seegson `independent`, ICC `independent`. The book never states these directly.
  - Minor corporations the book does not place are set to `unknown`.
  - The Harvester Juvenile's single attack row is named "Attack". The book gives only its dice and damage.

## Cross-slice issues
- **`tools/seed-campaign/src/build.ts`:** `NPC_POOL` crashes now (line 279), because only 4 of its 10 ids still exist.
  - Removed NPC ids, with the closest book entry for each:
    - `dock-worker`: no book entry.
    - `union-organizer`: no book entry.
    - `weyland-yutani-rep`: closest is `company-bureaucrat`.
    - `ship-captain`: closest is `ships-engineer`.
    - `company-agent`: closest is `corporate-killer` or `company-bureaucrat`.
    - `seegson-tech`: closest is `comtech`.
    - `android-overt`: closest is `android-refurbished`.
    - `colonial-marine`: closest is `squad-leader`.
    - `colonist`: closest is `homesteader`.
    - `officer`: closest is `squad-leader`.
    - `roughneck`: closest is `mining-wildcatter`.
    - `prisoner`: no book entry.
    - `upp-soldier`: closest is `mercenary`.
  - Kept ids: `android-covert`, `marshal`, `kid`, `corporate-exec`, `cultist`, `medic`, `mercenary`, `pilot`, `scientist`, `security-guard`, `smuggler`, `thug`.
  - Suggested pool: `colony-manager`, `company-bureaucrat`, `icc-inspector`, `smuggler`, `ships-engineer`, `salvage-expert`, `security-guard`, `corporate-exec`, `comtech`, `android-covert`. The existing `/weyland|company|corporate/` name match still finds "Company bureaucrat" and "Corporate executive".
- **`src/rules/creatures.ts` (rules agent):**
  - Page fixes:
    - `acid-splash`: should be 210.
    - `facehugger`: should be 212-214.
    - `chestburster`: should be 215-216.
    - `xenomorph-stages`: should be 217-221.
    - `broken-xenomorph`: should be 208.
    - `neomorph`: should be 223-225.
    - `other-species`: should be 227-231.
    - `containment`: the protocols are spread over 212-231.
  - Content fixes:
    - `facehugger-swarm`: Speed comes from the number of facehuggers, and each one must be killed separately. There is no rolled size.
    - `acid-splash`: the dice are the Acid Splash rating plus the damage taken, at Adjacent range, halving each round.
    - `neomorph`: the book has no "backburster".
- **`src/rules/gm-tools.ts`:** the `minor-corporations` card page should be 162, not 176-177.
- **`docs/alien-spot-check.md`:** it still lists the removed NPC ids and needs regenerating.
- **NPC talent ids referenced:** `cunning`, `spaceship-mechanic`, `eva-specialist`, `investigator`, `hard-to-catch`, `personal-safety`, `stoic`, `stealthy`, `surgeon`, `combat-veteran`, `hardened`, `full-throttle`, `analysis`, `field-commander`. All of them exist in `src/reference/talents.ts` as it stands now.
- **NPC gear item ids referenced:**
  - `eco-all-world-survival-suit`, `cutting-torch`, `watatsumi-dv-303-bolt-gun`, `armat-37a2-pump-shotgun`, `flashlight`
  - `motion-tracker`, `seegson-p-dat`, `personal-data-transmitter`, `seegson-system-diagnostic-device`, `electronic-tool-kit`
  - `armat-m42a-scope-rifle`, `knife`, `personal-medkit`, `recreational-drugs`, `357-magnum-revolver`
  - `surgical-kit`, `naproleve`, `armat-m41a-pulse-rifle`, `m40-hedp-grenade`, `seismic-survey-charge`
  - `m4a3-service-pistol`, `irc-mk50-compression-suit`, `weyland-es-4-electrostatic-pistol`, `maintenance-jack`, `stun-baton`, `rexim-rxf-m5-eva-pistol`

  `test/data.test.ts` asserts that every one of them resolves.
