# Character slice: verification against the Evolved Edition core rules

Area: character creation, skills, talents, dice, stress, panic, critical injuries and mental trauma.
Book range checked: printed pages 24-51 and 54-77 (plus p. 78 for androids and p. 158 for campaign theme and story points).

## What was checked

| File | Pages | Result |
|---|---|---|
| `src/reference/skills.ts` | 42, 46-47 | 12 skills and bindings already correct. Page refs fixed (Observation, Survival, Comtech, Command and Piloting are on p. 46). Summaries rewritten from the book's skill descriptions. Verified. |
| `src/reference/careers.ts` | 31-39 | All nine careers rewritten: key attribute, key skills, cash, three talents, six names, six appearances, three agendas, six gear items and three signature items now come from the book. Verified. |
| `src/reference/talents.ts` | 48, 50, 51 | 27 career talents and 29 general talents (56 total) replace the invented list. Stack limits and mode tags follow the book. Verified. |
| `src/reference/criticalInjuries.ts` | 68-71 | The D66 table was rebuilt row by row: name, lethal flag, time limit, healing time, surgery flag, instant-death flag and a short effect. Verified. |
| `src/reference/mentalTraumas.ts` | 74 | Now a D66 table with 18 ranged rows (it was a d6 with 6 invented rows). Verified. |
| `src/tables/character.ts` | 44, 70, 72-74, 158 | Stress response, panic, mental trauma, critical injury and campaign theme tables follow the book. No `unverified` flags remain. |
| `src/dice/**` | 25, 28-29, 42-44, 77 | Pool building, the push rules, the facehugger rule, NPCs never pushing, story points and the android exemption all match the book. The supply roll fix is listed below. |
| `src/entities/character.ts`, `common.ts` | 25-28, 51, 55, 72-77 | Attribute and skill ranges, the android caps (8 in the key attribute, 7 in another) and the computed Health, Resolve and encumbrance formulas were checked. Conditions were added. |
| `src/hooks.ts` | 27, 30, 74, 158 | The XP questions, the trauma check and story points were checked. |

## Notable corrections

- **Careers.** Company Agent's key attribute is Wits and its cash is D6×1,000. Officer's key attribute is Empathy. Marshal's key skills include Command, not Manipulation. Medic's include Mobility, not Comtech. Cash was wrong for Marshal (D6×200), Medic (D6×200) and Officer (D6×300). Page numbers had been shifted by one and are now p. 31-39 in book order.
- **Talents.** The following were invented or in the wrong place and have been replaced: past-the-limit, take-control, hide, rush, compassion, field-surgeon, influence, tinkerer, breakthrough. General talents that do not exist were dropped: calm, economical, gearhead, quick-draw, quick-fire, sharpshooter, sixth-sense, steady-feet, talk-the-talk, tough, unbreakable, watchful, machinist, nerves-of-steel, healer, killer, pathfinder, space-legs, stress-eater, veteran. Some talents moved: `lucky` is now a Kid career talent, and `second-wind` is now a general talent (no longer a Roughneck talent). New ids: precise-shooter, company-resources, hard-to-catch, field-medic, surgeon, frontline-leader, like-the-back-of-your-hand, steady-hands, xenomorphology, plus 19 new general talents. Hardened and Seen It All stack up to 3. Like the Back of Your Hand and Weapon Specialist can be taken once per model (`stackLimit` 99). Bonus Shares is campaign-only.
- **Stress response.** The rows are now ≤0 Keeping Cool, 1 Jumpy, 2 Tunnel Vision, 3 Aggravated, 4 Shakes, 5 Frantic, 6 Deflated and 7+ Mess Up. Before, Keeping Cool ran up to 3 and the middle rows were invented.
- **Panic.** The rows are now ≤0 Keeping Cool through 12+ Catatonic. The thresholds had been offset by six. A trauma check is flagged on results of 9+ (Scream, Flee, Frenzy, Catatonic).
- **Mental trauma.** The table is now D66 with 18 rows. The dice operation now rolls d66, and the condition id is `mental-trauma:<trauma id>`. The table no longer carries the campaign-only mode tag, because the book applies the rule in both modes; only healing needs shore leave.
- **Critical injuries.** Rows 11-43 are not lethal and rows 44-66 are lethal. Time limits are shift for 44-52, stretch for 53-56 and round for 61-63. Rows 64-66 kill outright. Healing times were added. Row 43, Traumatized, makes a nested roll on the mental trauma table. Both the reference list and the table now take their rows from one source.
- **Campaign theme (p. 158).** The rows are Killing Greed, Corporate Intrigue, Tidings of War, New Opportunities, Secret Research and Echoes from the Past.
- **Dice.** A supply roll is capped at six dice. A new `reduceBy` input covers Precise Shooter, Calm Breather and Tech Savvy (two dice fewer, never below one). Story point page refs are now p. 44 and 158. The android exemption (cannot push, no stress, never panics) cites p. 25 and 77.
- **Character entity.** Fixed a bug: the talents widget reads `config.ref` and per-item `maxStack`. Neither was set, so no talents were offered and every talent was capped at 1. Talent items now carry `maxStack`. Hardened and Seen It All are capped at 3, and an entry without a count counts once. Resolve drops by 2 for each Overwhelmed trauma (not below 0). Pack Mule doubles the encumbrance limit. A new computed `maxEncumbrance` holds twice the limit (over-encumbered, p. 28). New fields: `fatigued` (p. 75) and `rads` (p. 77). Field descriptions now cite the correct pages.
- **Range bands.** In `common.ts`, `RANGE_IDS` now uses `adjacent` in place of `engaged` (p. 55), matching the item agent's `WEAPON_RANGE_IDS`. Nothing else referenced the old id. `RANGE_LABELS` and `RANGE_DESCRIPTIONS` were added.
- **Hooks.** The XP questions now follow p. 30: panic roll, dangerous event, discovery, extraordinary action and earning money. These replace the invented ones. The trauma check uses the highest panic result of the session and lowers the threshold to 1 for Panic Attacks. Its prompt says the check is Empathy alone and cannot be pushed. In cinematic mode, a per-PC "award a story point for the act agenda, max 3" prompt replaces the invented "reset story points to 0" prompt. The trauma check also runs in cinematic mode.

## Still unverified

Nothing in this slice. The android critical system damage table (p. 78) is not modelled: an android at zero Health still rolls on the human table. That table would be a follow-up.

## Cross-slice issues (not fixed here)

- `src/data/npc-presets.ts`: every talent id it uses now resolves. Another agent had already moved it to the book's ids. `tools/` and `apps/` contain none of the removed talent ids.
- `src/rules/stress-panic.ts` (`mental-trauma` card) still says to roll a D6 on the mental trauma table. The table is D66.
- `src/rules/combat.ts` (`range-bands` card) still says "Engaged". The book's band is "Adjacent", meaning in your face.
- `src/rules/campaign-play.ts` (`campaign-theme` card) lists themes that are not the six on p. 158.
- `docs/alien-field-names.md` still lists `"engaged"` as a weapon range id. The item and character code now use `adjacent`.
- `tools/seed-campaign/src/build.ts:279` crashes because fewer than six NPC preset ids from its pool still exist (`wildcard` is undefined). This comes from renamed NPC presets, not this slice. It also breaks the demo-campaign test in `apps/web`.
