# Verification: campaign frame, world, star system and job generators

Book pages checked: printed p. 234-252 (campaign frames 234-235, star types and planet names 236, Main World Creation 237-242, Star System Generator 243, Job Generator 244-252), plus p. 158-159 for the session zero checklist and p. 132-137 for the frames' suggested ships.

## What was checked, by file

- `src/tables/world.ts` (p. 236-242): every dice expression, range, label and modifier was rewritten to match the book. All 17 tables are verified (no `unverified` flags).
- `src/tables/system.ts` (p. 243): rebuilt as four count tables plus two feature tables. All 6 are verified.
- `src/tables/jobs.ts` (p. 244-252): rebuilt for all three frames plus plot twists. 22 tables, all verified except the 3 known-gap rows.
- `src/procedures/world.ts`, `system.ts`, `job.ts`: step order, skip rules, repeat counts and formulas now follow the book.
- `src/reference/frames.ts` (p. 234-235): careers, employers, ships, salaries and job pages now come from the book.
- `src/templates/sessionZero.ts`, `campaignFrame.ts`, `jobCard.ts`: checklist items now follow the session zero questions on p. 158, and page refs were checked.
- My assertions in `test/tables.test.ts` and `test/procedures.test.ts` were rewritten to pin the book's shapes.

## Notable corrections

- **Planet size**: 2D6 with 8 rows (<1,000 km up to 20,000 km / 2 G). The invented gas giant row is gone. Ice planets get −2 and gas giant moons −4, read from the `planetType` and `gasGiantMoon` inputs.
- **Atmosphere modifiers**: the printed values are 4,000 km or less **−2** and 4,001-7,000 km **−4**. The previous agent had them the other way round. The module now follows the print, odd as it looks.
- **Temperature**: the rows are 6-7 Temperate and 8-10 Hot. Modifiers are thin −4, dense **−1**, and corrosive/infiltrating **+6**. Ice planets are forced to Frozen (module mechanism: a −20 modifier labelled with the reason).
- **Geosphere**: now 6 rows, from Desert to Water World. Modifiers are thin/dense/corrosive/infiltrating −4, hot −2, burning −4, frozen −2. A world with no atmosphere (only possible as a GM pin) becomes a desert world.
- **Terrain**: the terrestrial table is the book's d66 list. The ice planet table is **2D6 with 11 rows**, not d66.
- **Colony size**: ≤7 Start-Up (3D6×10 people, 1 mission), 8-10 Young (3D6×100, D3−1 missions), 11+ Established (2D6×1000, D3 missions). Modifiers are breathable +1, corrosive/infiltrating −2, ≤4,000 km −3. Population and mission count are now rolled as numbers in their own steps. Young colonies can end up with 0 missions.
- **Colony mission**: the book's 11 rows. Modifiers are toxic/corrosive/infiltrating +1, breathable +1, start-up −1, established +4.
- **Orbital components**: **2D6**, not 3D6. Young colony +1, established +2. "D3 moons" rolls a nested D3. 12+ means "Roll D6 times" (nested `1d6` rolls on the extra-rolls table). Uninhabited worlds skip this table and roll D3−1 moons instead.
- **Factions**: D3 factions, each rolled on a D6 type table (Newcomers ... Colonial leadership), mapped to faction entity types.
- **Allegiance**: two **3D6** tables (ICSC; American or Anglo-Japanese Arm). UPP colonies don't roll. The world input `allegianceBloc` is now `american-arm | anglo-japanese-arm | icsc | upp`. The colony's `allegiance` holds the bloc id (or `independent`) and `affiliation` holds the corporation or government.
- **Campaign hooks**: all 36 paraphrased from p. 242.
- **Names**: inhabited main worlds take a name from the p. 236 list. Uninhabited bodies get an `LV-###` designation.
- **Star system**: separate rolls per body type (gas giants D6−1, terrestrial D6, ice D6+1, belts D6−3) with the book's star-type modifiers. Gas giants get D6+4 moons. The feature tables are the book's. The star type is derived from spectral and brightness class. The system input's brightness enum is now III/IV/V/D (the book has no class I/II stars in charted space). There are now 13 world chains (6 terrestrial + 7 ice at most), and each chain passes `inhabited: false`.
- **Job basics**: distance D6−1, difficulty D3, payment = (distance+difficulty)×PCs×$1,000. New optional inputs: `paymentRaises` (+20% each) and `bonusRolls` (one bonus roll per success spent). The bonus step now repeats `bonusRolls` times, so 0 by default. Each frame's bonus table matches the book's dice: truckers d66, marines D6, colonists D6.
- **Employers**:
  - Cargo Run employer is the book's d66, with mining (D6) and major corporation (d66) sub-tables.
  - Colonial Marines have **no employer table** (p. 235). The step is skipped, and the employer comes from a new `marineCorps` input (USCMC by default).
  - Expedition sponsors are the book's d66, with major corporation, mining (D6) and government (D6) sub-tables.
  - Removed invented sub-tables: truckers minor-corporation, government, private and criminal; all marine employer tables.
- **Cargo, missions, destinations and complications**: all replaced with the book's rows (labels exact, descriptions paraphrased).
  - Row counts: truckers cargo 22, destinations 11, complications 8; marines missions 14, destinations 12, complications 14; colonists missions 9, destinations 11, complications 7; plot twists 9.
  - New shared `alien.jobs.ship-type` (D6). It is used by the truckers' Starship destination and the colonists' Wreckage destination. Wreckage also re-rolls where the wreck lies.
- **Frames**: careers, suggested employers, ship and weekly salary are now the book's. Following the coordinator's note, the Corvus is G-Class (its stat block, p. 133; the frame text on p. 235 says M-Class). The frame records also gained `shipPresets` ids from `src/data/ships.ts`.
- **Session zero**: the checklist now asks the p. 158 questions, plus the frame and employees-or-freelancers choices (p. 234) and home base (p. 159). Removed items the book doesn't have: tone/lines and veils, lethality, XP reminder, agendas.

## Still unverified, and why

- `alien.jobs.colonists.employer.corporation` rows 44-46, 51-53 and 54-66 are the known data gap. The book's list stops at 41-43. These rows copy the Cargo Run major corporation list (p. 244), keep `unverified: true`, and say so in a `note`.
- Module decisions the book doesn't cover:
  - A further 12+ on the orbital extra rolls, or Wreckage on the wreck-location re-roll, is left to the GM (`gmDecides`) instead of recursing. The shared test forbids tables that nest themselves.
  - Body order and names in the system generator.
  - The random destination star the job generator picks from the six p. 236 star types.

## Cross-slice issues (not fixed here)

- `src/rules/campaign-play.ts`: the `alien.rule.session-zero` card mentions "tone and limits", which is not in the book (p. 158).
- `src/entities/location.ts`: field descriptions are out of date.
  - `geosphere` now uses `desert | arid | dry-temperate | wet-temperate | wet | water`.
  - Pages: orbital components and colony size are on p. 240, colony missions and factions p. 240-241, geosphere p. 239, star classes p. 236.
- `tools/seed-campaign`: the world chain now always produces an uninhabited body, so the demo destination is a planet without a colony (the `colonyId ?? planetId` fallback covers this). The seed test currently fails earlier, at `build.ts:279` (NPC preset pool), which is not my slice.
- `apps/web` generate tests: the job, system and world chains pass. The one failure is in shore leave (not my slice).
