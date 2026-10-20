# The crew's ship, money and travel

Checked against the Evolved Edition core rules: chapter 6 (space travel, living in space, money and salaries, spacecraft basics, ship damage and repairs, printed p. 108-147), the food and drink entries of chapter 5 (p. 99), fatigue (p. 75) and campaign play (p. 234-258). Page references are printed folios.

## What the book supports

| Topic | Pages | What the module does with it |
|---|---|---|
| FTL rating and travel time | 108, 122 | Days = FTL rating × parsecs (the book's example, rating 6 over 9 parsecs, is 54 days, and is a test). No ship is rated below 1. The star map counts one square per parsec (inside cover). |
| Overcharging engines | 108-109 | A planner note; not applied to the travel time (it lasts a week and risks the reactor). |
| Neurological Distortion Disorder | 109 | New table `alien.travel.ndd` (D6, 1-5, 6-7, 8-9, 10-11, 12+). Everyone awake rolls after each period of days equal to the FTL rating, +1 per roll after the first. Dementia outlasts the trip by D6 days and becomes a condition; psychosis becomes a log line for the GM. |
| Hypersleep | 109-110 | Sleepers wake fatigued (condition `alien.fatigued`); a shift awake and a good meal, or Hydr8tion, ends it. |
| Food and water | 75, 99 | Everyone awake eats and drinks every day. A prefab meal is $10 and shipboard water $2, so a person-day costs $12. |
| Ship classes, prices, modules and upgrades | 121-127 | Already in `data/ship-reference.ts`; a ledger category for fittings cites them. |
| Leasing a ship | 121 | 2% of the ship's price a year; computed `leasePerYear` (and `leasePerWeek`, that divided by 52 and rounded). |
| Starting ship, employees and freelancers | 234 | Rule card `alien.rule.starting-ship`; ownership `company`, `leased` or `owned`. |
| Ship damage, disabled ships | 144-146 | `hullDamage` is stored; `hullLeft`, `majorDamageAt` (half the Hull rounded up) and `disabled` are computed. A disabled ship cannot jump. |
| Minor and major component damage | 145-146 | New tables `alien.ship.minor-damage` (D66, 27 rows) and `alien.ship.major-damage` (2D6, 11 rows) with the book's names, ranges and repair rolls; effects paraphrased. Damage on the sheet carries the repair rolls still needed. |
| Repairs and spare parts | 146-147 | One Heavy Machinery roll per shift repairs hull (one point per success); component repairs need a mechanical part per Heavy Machinery roll and an electronic one per Comtech roll, used up on a success. Parts cost about $100,000 and $200,000. Hull and external repairs need a spacewalk or a dry dock. |
| Currencies | 116-117 | UA dollars ($); corporate notes and the three national currencies are a rule card. |
| Living expenses | 116 | Already used by the shore leave procedure ($25 to $2,000 a week). |
| Salaries, stasis pay | 117, 234-235 | Rule card `alien.rule.salaries`; a ledger category. Not posted automatically (wages go to each PC, not to the crew's funds). |
| Job payment and bonus rewards | 244-251 | The job generator's payment is the one-click payout on a job and the first step of Between jobs. A bonus can be an additional financial bonus or a debt cancelled. |
| Shore leave money | 257-258 | Side jobs (D6 × $200), favours ($300) and local goods (D6 × $400, sold at 50% profit) have a ledger category; the shore leave week itself already charges each PC's cash. |

## What the book does not have (GM bookkeeping only)

The book prices no docking or berthing fees, no fuel (it names the reactor fuels on p. 122 but gives no prices or fuel ratings), no dry-dock labour or hired repairs, and no loan or debt terms (it says corporate credit and loans exist, p. 117, and a bonus reward can cancel a debt, p. 244). These are ledger categories without a page reference: `docking`, `fuel`, `repairs`, `loan` and `other`. Between jobs takes docking and fuel as the GM's own figures and posts them only when the GM enters them.

The book has no ship supply ratings for air, food or water. Supply rolls (p. 28-29) cover a character's air, ammo and power only. So "supplies on arrival" are: the NDD rolls of anyone awake, hypersleep fatigue for sleepers, and the ship's `provisions` (person-days of food and water, a module bookkeeping field) going down by one per person per day awake. Androids are left out of all three: NDD is a disorder of mammals (p. 108) and androids never become fatigued (p. 75); that they eat nothing is a module decision. The book gives no time for travel inside one system, so a distance of 0 takes the days the GM enters.

The Displacement Drive Malfunction entry says the FTL rating is "halved"; since a lower rating is a faster ship, the planner flags the malfunction and leaves the travel time to the GM instead of changing it.

## Files

| File | What |
|---|---|
| `packages/module-alien/src/economy.ts` | Ledger currency, categories and payout; the crew ship definition |
| `packages/module-alien/src/travel.ts` | FTL travel plan and arrival checks |
| `packages/module-alien/src/procedures/between-jobs.ts` | The Between jobs procedure |
| `packages/module-alien/src/tables/ships.ts` | Minor and major component damage, NDD |
| `packages/module-alien/src/entities/spaceship.ts` | State in play and computed values on the ship sheet |
| `packages/module-alien/src/rules/money.ts`, `ships.ts`, `space-travel.ts` | Rule cards: currencies, salaries, spare parts, starting ship, arrival |

## Checks

A 10-word shingle check of every new and changed line of text (code, data, tests and this document) against the book's text found no matches, and no purchase watermark text.
