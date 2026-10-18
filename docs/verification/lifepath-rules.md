# Verification: life path, rule cards, play-mode data (`lifepath-rules`)

Checked against *Alien: The Roleplaying Game, Core Rules, Evolved Edition*. All page numbers are printed folios.

## What was checked

| File | Book pages |
|---|---|
| `src/tables/lifepath.ts` | 282-289 (life path appendix) |
| `src/procedures/lifepath.ts` | 282-289, plus career gear lists and career talents (31-39, 48-50) |
| `src/rules/*.ts` (all cards) | whole book: chapters 1-7 (10-159), 8-11 (162-280), appendices (282-309) and the index |
| `src/templates/cinematicAdventure.ts`, `scene.ts` | 54-55, 152-158 |
| `src/styleNotes.ts` | 19, 152-155 |
| `src/trackers.ts` | 20, 28-29, 44, 55-60, 72-74, 158, 208 |
| `src/modes.ts`, `manifest.ts`, `calendar.ts` | 18, 24, 108, star map |

Mode icons were located by scanning the PDF's vector graphics: they appear at the mode descriptions (p. 18, 24), the agendas (p. 27), character development (p. 30), Cinematic Play (p. 157), Campaign Play (p. 158) and the chapter 11 opener (p. 234). Mode tags follow those icons, plus sections whose own text limits them to one mode (Story Points, shore leave, trauma healing).

## Life path: what changed

The old tables were invented and followed a different structure. They now follow the book:

- **Human or android**: 2D6, 11-12 android (was 1D6). Androids add +3 to two attributes.
- **Origin**: 2D6 super-nation (ICSC 2-4, 3WE 5-6, UA 7-8, UPP 9-10, Independents 11-12), each with nested D6 sub-affiliation and D6 home tables (10 new tables, `alien.lifepath.origin.<nation>.affiliation|home`). The old core/outer/frontier "levels" are gone. `region` is set only where the home names a region outright.
- **Random general skill**: new D66 table (12 skills in threes, p. 286).
- **Early life**: three D66 tables of 12 rows, one per column: `early-life` (attributes), `early-life.company` (story only), `early-life.experience` (skills and psych +2 to −2).
- **Life event**: D66 in pairs (18 rows): two specified attribute points, psych modifiers, plus the 11-12 cash roll (2D6×50) and bonus gear roll and the 15-16 extra general skill.
- **Career entry** (2D6 random career) was removed: the book has no such table. In its place, `LIFEPATH_CAREERS` holds requirements, paycheck dice and three career skills (p. 286), and nine D3 `alien.lifepath.career-skill.<career>` tables.
- **Favors / disasters**: the book's six entries each, with their effects as data (extra gear roll, extra paycheck, random skill, attribute loss, lost item, career ended).
- **Postings**: the book's posting names per career; 5-6 grant a bonus career gear roll in every career.
- **Psych evaluation**: 2D6 with the book's ten bands (≤0 up to ≥14), where high is over-eager and low is unstable. The invented starting-stress outcome was removed.

Totals: 38 lifepath tables, 225 rows, none flagged unverified.

The procedure was rewritten to follow the nine steps in order, with 13 step ids: `humanOrAndroid`, `origin`, `originSkills`, `earlyLife`, `earlyLifeCompany`, `earlyLifeExperience`, `lifeEvent`, `lifeEventSkills`, `career`, `term1`-`term3`, `psych`. It handles applications (unpushed rolls; the Kid needs none; failure tries other qualifying careers, then "pulls a fast one"), D3 career skills, career gear rolls with re-rolls, paychecks, favors with re-rolls, disasters, a random career talent each term, −1 attribute per extra term, skill cap 5, attribute caps 5/8 and minimum 2 (humans). New inputs are `career` and `terms` (default 1).

Module decisions where the book leaves the choice to the player are listed in the procedure's header comment. The main ones: attribute points go to the requirements first; skill tests use the best career skill; the charmed-life bonus gear roll uses the hired career's list; a sacking ends the career after the current term.

## Rule cards: what changed

- 147 cards became 180. Every page now points to the true folio, and every summary was rewritten as a paraphrase of at most 3 sentences. Many summaries had described first-edition or invented rules, for example: armor rolled as dice (it is a flat reduction); slow/fast actions (they are full/quick); Engaged range (it is Adjacent); a D6 trauma table (it is D66); a signature item that relieves stress; Command, meals or signature items relieving stress; "five XP buys a skill"; air rolled per shift; food and water as supply ratings; a facehugger swarm "size"; the "backburster"; a three-step difficulty scale; and invented GM principles and themes.
- Removed (not in the book): `starving`, `dehydrated`, `exhausted`, `freezing`, `conditions`, `derelicts`. The Evolved Edition uses a single fatigue rule, now covered by `fatigue`, `suffocation`, `food-water` (hunger and thirst), `sleep-deprivation` and `heat-cold`. None of the removed ids was referenced outside `src/rules`.
- Added: `skills`, `switching-attributes`, `passive-rolls`, `negotiating-position`, `stopping-panic`, `detection`, `crawlspaces`, `motion-tracker`, `social-mode`, `holding-off`, `giving-orders`, `movement`, `special-attacks`, `friendly-fire`, `barriers`, `android-damage`, `fatigue`, `suffocation`, `sleep-deprivation`, `heat-cold`, `vacuum`, `explosive-decompression`, `falling`, `zero-gravity`, `fire`, `disease`, `radiation`, `living-expenses`, `overcharging-engines`, `ndd`, `running-dark`, `ship-space-panic`, `ovomorph`, `goals-and-rewards`, `adventure-structure`, `stress-and-horror`, `stages-of-fear`, `splitting-the-team`, `solo-mode` (Last Survivor, p. 291-307).
- Retitled with the same id: `difficulty` → Modifiers, `fast-actions` → Quick actions, `slow-actions` → Full actions, `block-dodge` → Defend and dodge, `docking-landing` → Planetfall, `life-support` → Air scrubbers, `damage-types` → Stun and explosive damage, `vehicles` → Vehicle combat (p. 78-79), `campaign-theme` → Campaign focus. `weapons` and `armor` moved from `combat.ts` to `gear-supply.ts`. Every id that entities or trackers reference was kept.
- `ship-actions` was rewritten in new wording, organised by crew post.
- Links: the cards now link to verified tables (life path, creature attack tables, broken xenomorph, plot twist, encounter, shore-leave, world/system and campaign-theme tables). The dropped link was `alien.creatures.facehugger-swarm`, a table that no longer exists. `T.campaignTheme` was added to `rules/card.ts`.

## Templates, style notes, trackers, modes

- The cinematic adventure scaffold now follows p. 157-158: player intro, situation, characters with per-act agendas, locations, three acts of mostly optional, stand-alone events (one mandatory each), PvP in act III, and an epilogue as a survivor's sign-off. The scene template's page is 157 (zones p. 54-55).
- `styleNotes.ts` holds the real eight principles (Use the Films … Reveal the Universe), the three themes with their six sub-themes, and new `horrorNotes` from p. 154-155.
- Trackers:
  - Supply: kinds are now air, ammo and power only, with `max: 6` and the book's roll cadence.
  - Initiative: actions are full/quick, with `surpriseCard: 1`.
  - Stealth: an opposed passive Observation roll for both sides (it had been Mobility vs Observation), darkness −2, keeping guard +2, M314 range of four zones.
  - Story points: `carryOver: 1`.
  - Page refs corrected throughout.
- Modes are paraphrased from p. 18. The calendar comment now cites the star map's 2183 date. `dataStatus` was not touched.

## Still unverified

- Nothing in this slice is flagged `unverified`.
- `table-lint` warns that four psych-evaluation rows (≤0, 1, 13, ≥14) are unreachable on a bare 2D6. This is expected: they are reached through the procedure's psych modifier.
- Interpretations, not book data: the generator's choices for the player (see the procedure header), and the reading of the android "+3 to two attributes" as +3 to each of two attributes.

## Cross-slice notes

- `docs/alien-spot-check.md` still lists the old, invented life path rows (generated by the spot-check tool) and should be regenerated.
- The shared test `procedures.test.ts` requires every roll record to name a table. Life path skill tests, paychecks, gear and talent picks are therefore kept in each step result's `rolls` list rather than the global roll log.
- `tools/seed-campaign` and `apps/web` needed no change: seed-campaign tests pass with the new procedure.
