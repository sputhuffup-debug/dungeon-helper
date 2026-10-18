## Encounters, shore leave and charted space

Checked against the owner's rulebook (Evolved Edition) by the encounters-places agent, October 2026.

### What was checked

| File | Book pages (printed) |
|---|---|
| `packages/module-alien/src/tables/encounters.ts` | 252 (rules), 254-257 (tables) |
| `packages/module-alien/src/tables/shore-leave.ts` | 257-258 |
| `packages/module-alien/src/procedures/encounter.ts` | 252-257 |
| `packages/module-alien/src/procedures/shore-leave.ts` | 257 (with 27, 71, 73, 74, 116) |
| `packages/module-alien/src/templates/shoreLeave.ts` | 257-258, 116 |
| `packages/module-alien/src/data/charted-space.ts` | 112-113, 116, 180-201, 260-277; star maps on PDF pages 2-3 and p. 262 |

Printed p. 253 is full-page art; p. 267 and 275 are art as well.

### What changed

**Encounter tables.** Every table and row is now book-checked (no `unverified` flags).
- Star system encounters: the 36 printed D66 entries (research vessel through mobile construction rig). The book's tens-digit modifiers (Outer Rim or Frontier -3, uncharted space -5, a tens digit of 0 or less is no encounter) replace the invented "+10 per unit of time elapsed". The table-lint rule says D66 row bounds must be digit pairs, so each modified reading is its own pure-D66 table built from the same rows: `alien.encounters.star-system` (no modifier), `alien.encounters.star-system-remote` (-3) and `alien.encounters.star-system-uncharted` (-5). Rows that hold a vessel nest a Ship Reactions roll. Stations, platforms and rigs do not.
- Ship reactions: 2D6 with six bands (2, 3-4, 5-8, 9-10, 11, 12), where the module had seven invented ones.
- Surface encounters: 3D6, not D66. The two columns are uninhabited and colonized worlds, not terrestrial and ice. The result keys are now `uninhabited` and `colonized`. Rows 11-18 are blank for uninhabited worlds.
- General colony encounters: D66 with 42 entries running to 76, not 3D6. An established colony adds 1 to the tens digit, modelled as `alien.encounters.colony.general-established`.
- Area tables: the book has public, habitation, operations, spaceport and industrial areas, each D66. The invented admin, residential and medical tables (2D6) are gone. Operations is the one area table with an irregular row (64, then 65-66).
- Cadence (p. 252): roll before and after hyperspace. While lingering, roll daily near a habitable planet, weekly further out, monthly in unexplored systems. On a surface or in a colony, roll daily. This is recorded in the table notes.

**Encounter procedure.** Inputs are now `where` (10 choices), `region` (the region ids plus `uncharted`) and `colonySize`. `timeElapsed` is gone. The procedure picks the matching reading table. It produces no entity on "no encounter", and it fills the encounter schema's `setting`, `tableId` and `summary`.

**Shore leave tables.** There are two D66 tables of 12 events each, Colonial Marines (p. 257) and others (p. 258), with the book's ranges. The three Marines D6 sub-rolls (logistics luxuries, old friend, lieutenant) replace the invented "trouble" and "rumor" sub-tables. Money is stored as data: $300 favor, D6 x $200 jobs, D6 x $400 commodity with 50% resale, and a stress-die scam check (facehugger or success).

**Shore leave procedure and template.** These now follow the four activities on p. 257:
- Heal lets critical-injury healing time pass (p. 71).
- Recover is an Empathy roll that cannot be pushed; success removes one mental trauma (p. 74).
- Pursue Agenda gives 1 XP only on success (p. 27). It is now a prompt, not an automatic XP.
- Socialize is one event roll.

The procedure also adds weekly living expenses (p. 116: $25, $100, $300 or $2,000; new `livingStandard` input) and clears stress after a week in a safe place (p. 73).

**Charted space.** There are now 151 presets, replacing 50 guessed ones:
- 5 regions
- 4 blocs
- 10 sectors
- 34 star systems
- 33 planets and moons
- 38 colonies and stations
- 27 sites

Chapter 9 and chapter 11 stat blocks are copied as data: location, affiliation, classification, climate, temperature, terrain, colonies, population and key resources/resources. The Tartarus systems also carry the "public knowledge" and "what's really going on" lines in short paraphrase. Notable corrections:
- Rodina is the Beta Virginis world in Tartarus (p. 266), not a UPP capital in Kruger 60.
- Tientsin is 8 Eta Boötis A III in the Borodino Sector.
- The Solomons are the moons of Alpha Caeli V in the Far Reach.
- Thedus is in Epsilon Reticuli.
- Tartarus Sector is Outer Rim (p. 191, 260).
- Novgorod Station is a Seegson transfer station at Alpha Fornacis (p. 274).
- Anchorpoint Station (p. 113) is ICSC-governed, in GJ2066.
- The sites for Jackson's Star (p. 270-273), the Novgorod decks (p. 274-277) and Anchorpoint (p. 113) are added.

**Removed or renamed ids** (none is referenced outside `charted-space.ts`):
- Removed (not in the book): `alpha-centauri`, `epsilon-eridani`, `arcturus`, `kruger-60`, `solomons`, `thedus`, `tientsin`, `ariarcus`, `ariarcus-planet`, `ariarcus-landing`, `tanaka-5`, `sutters-world-system`, `sutters-world`, `sutters-landing`, `solomons-prime`, `olympia`, `luna-city`, `novgorod`, `port-solomon`, `thedus-mining-colony`, `new-osaka`, `tanaka-station`.
- Renamed: `zeta-reticuli-sector` to `cusp-of-tartarus`, `fiorina-system` to `fiori-16`, `anchorpoint-docks` to `anchorpoint-concourse`.
- Kept ids with corrected content: `rodina`, `tientsin-planet`, `thedus-planet`, `tanaka-5-planet`, `imperial-arm` (now "The Anglo-Japanese Arm").

The encounter tables `alien.encounters.colony.{admin,residential,medical}` and `alien.shore-leave.marines.{trouble,rumor}` are removed. Seven tables are added: `alien.encounters.star-system-remote`, `alien.encounters.star-system-uncharted`, `alien.encounters.colony.general-established`, `alien.encounters.colony.{public,habitation,operations}` and `alien.shore-leave.marines.{luxuries,old-friend,lieutenant}`. `alien.encounters.colony.industrial` and `.spaceport` keep their ids.

### What remains a module decision

The book does not print these values, so they are derived and explained in each file's header:
- `colonySize` is derived from numeric populations using the p. 240 ranges.
- `missions` use the p. 241 labels only where the text says what a colony does.
- `allegiance` maps the affiliation line to the field-doc ids.
- Star systems carry the book's own wording in `starNote` (binary, trinary, blue star, red dwarf). The book prints no spectral or brightness classes, so the data test now checks `starClass`/`brightness` only when present.
- The Far Reach is a region placed within the Frontier. Page 112 calls it a region; the p. 181 table lists it under the Frontier.
- GJ2066 (Anchorpoint) is placed in Tartarus Sector. It is drawn on the sector map (p. 262), but the text puts the station just past the rimward edge (p. 260).
- No row keeps `unverified: true`.

### Cross-slice issues

- **Seed campaign** (`tools/seed-campaign`): the home base still resolves through the `home-base` tag on `anchorpoint-station`. The ancestor chain is now Anchorpoint Station > GJ2066 > Tartarus Sector > The Outer Rim Territories. It used to be Solomons Prime > Solomons > Tartarus Sector > The Frontier. The home site is now "Anchorpoint Concourses" instead of "Anchorpoint Docks". No code change is needed. Scene names in the demo will differ.
- **Rule cards** (another slice) still describe the old shapes:
  - `alien.rule.encounter-cadence` (gm-tools): the cadence is wrong; see p. 252 above.
  - `alien.rule.encounter-tables` (gm-tools) says "nine tables ... two surface columns ... five colony areas, mostly D66 with modifiers for danger or remoteness". The book has star system D66 with -3/-5, ship reactions 2D6, surface 3D6 with uninhabited/colonized columns, general colony D66 with +1 if established, and five D66 area tables.
  - `alien.rule.shore-leave` (campaign-play) should say:
    - Heal is time for critical injuries.
    - Recover is an Empathy roll that cannot be pushed and removes one trauma.
    - Pursue Agenda gives 1 XP on success.
    - Socialize is one event roll.
    - Expenses are on p. 116.
  - `alien.rule.shore-leave-events` should mention the D6 sub-rolls instead of "a romance".
- **Shared tests**: I edited only my own assertions in `test/tables.test.ts`, `test/procedures.test.ts` and `test/data.test.ts`. The data test now checks `starClass`/`brightness` only when present, and `colonySize` only when the population is a number.
