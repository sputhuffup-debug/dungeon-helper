# Combat at the table: verification against the Evolved Edition core rules

File: `packages/module-alien/src/combat.ts` (`alienModule.combat`), with the rule cards in `src/rules/combat.ts` and `src/rules/creatures.ts`, the `damage` fields in `src/entities/character.ts` and `creature.ts`, and the `criticalInjury` operation in `src/dice/operations.ts`.
Checked in October 2026 against the owner's copy. Page numbers are printed folios.

Numbers, names and table ids are the book's. Notes, effects and card summaries are short paraphrases. Tests: `packages/module-alien/test/combat.test.ts`.

## Damage taken and Health

| Fact | Page | Where |
|---|---|---|
| Health = Strength + Agility halved, rounded up; Hardened adds to it | 67 | `computed.health` (unchanged) |
| Damage reduces Health; you cannot go below zero, and further damage at zero gives another critical injury | 68 | `damage` field, `healthRemaining = max(0, health - damage)` |
| At zero Health you are broken: roll a critical injury at once | 68 | character `broken` -> `alien.character.critical-injury` |
| A critical injury you already have (14 and up) is re-rolled | 68 | `criticalInjury` operation re-rolls a result found in `conditions` |
| NPCs are broken the same way; the GM may let a minor NPC simply die | 69 | NPCs are `alien.character`, so the character entry covers them; `broken` card |
| A synthetic at zero Health rolls on the critical system damage table, again for each further hit; a result it already has moves one step up | 78 | android `broken` entry (`when` on `fields.android`, which secret androids also tick) -> `androidCriticalDamage` |
| Damage of double your maximum Health in one hit kills outright | 71 | `death` card (unchanged) |
| A Xenomorph at zero Health rolls on the Broken Xenomorph table, unless in Aliens mode; Facehuggers and Chestbursters are destroyed instead | 208-209 | creature `broken` entry |
| The Swarm cannot be killed; at zero Health it leaves | 231 | creature-turn note; no broken table |

Both `damage` fields are integers, minimum 0, default 0. Characters list `damage` in `playerEditable` next to `stress`; creatures keep it GM-only. No migration: the module ships `migrations: []` and earlier field additions did not bump the version. A missing `damage` reads as 0, and every preset still validates.

### Which creatures roll the broken table

The book's Xenomorph combat rules (p. 208) open a chapter section that covers Neomorphs, Praetomorphs and XX121 together, and the Neomorph uses the same Speed and signature attack rules. So the table applies to:

- XX121 of every stage except II (Facehugger, Praeto-Facehugger, Royal Facehugger) and III (Chestburster, Bambi Burster, Imp, Queen Burster). Eggs (Stage I) are included, as the text names no exception for them.
- Every Neomorph stage with stats, the Bloodburster included. The book's exception names only Facehuggers and Chestbursters.

Harvesters, Lion Worms and Tanakan Scorpionids are "other extrasolar species" (p. 227), not Xenomorphs, and the book gives them no zero-Health rule. They get no table; a creature-turn note says the GM decides.

## The armor rule (`resolveHit`)

| Step | Page |
|---|---|
| Damage = base damage + 1 per success beyond the first (`extraSuccesses`) | 62, 64 |
| Armor level is subtracted from the damage of an external attack. No dice are rolled | 67 |
| Armor piercing: armor counts one step lower, to a minimum of zero | 67 |
| Weak spot (attack at −2 dice): one more step lower, after armor piercing (`weakSpot`, added to `HitInput`) | 62, 65, 67 |
| Fire: body armor works as normal (p. 76). Creatures with a vs-fire value in their stat line use it (`armorBySource: { fire: "armorVsFire" }`) | 76, stat lines |
| Fall (`source: "fall"`): body armor does not help | 75 |
| Stun (`source: "stun"`): armor applies, but no Health is lost; a STAMINA roll at minus the damage instead. Xenomorphs are immune unless noted, otherwise resist with MOBILITY | 71, 209 |
| Acid (`source: "acid"`): armor applies, and the acid eats a point of armor per point of damage (noted in `explain`, not computed) | 210 |

Worked checks in the tests: the Rexim example (base 1, two successes) gives 2 (p. 67); 2 + 1 extra against armor 2 gives 1; damage 2, armor piercing, against armor 2 gives 1; a Drone hit by fire uses its 1 vs fire (p. 217).

Not modelled: the breach limit applies only to barriers and vehicles (p. 68, 79), not to characters or creatures. Conditional armor (the Charger's front, the Scorpionid against firearms, the Harvester's underbelly) stays in `armorNotes`; the GM adjusts the armor in the hit.

## Opposed rolls

`opposedTies: defender`: the active roller needs more successes than the opponent (p. 44). Defending (p. 62) and dodging (p. 65) cancel one attacking success per success, which gives the same result. In open rolls with no clear active side a tie has no winner (p. 44); this is noted in `text`.

## Creature turns (`creatureTurns`, p. 208-210)

`entityType: alien.creature`, `speedPath: speed`, `attackTablePath: attackTable`, page 208. Notes and their sources:

| Note | Page |
|---|---|
| One full turn and one initiative card per point of Speed; each turn is a signature attack or a move; no full/quick split | 208 (and 59) |
| Roll D6 on the table; roll again if it repeats the previous attack | 208 |
| The GM may choose the attack instead | 208 |
| Some rows add to the next roll (Facehugger +1/+2, Harvester and Lion Worm +1 to max 6, Swarm +1) | 213, 228, 229, 231 |
| A Praetorian re-rolls Charge | 221 |
| Attacks are at Adjacent range unless stated; Short to Adjacent comes free with the attack | 208 |
| Moving instead: two zones, or one zone then in to Adjacent; Neomorph sprint and the Scorpionid in water add a zone | 208, 225, 230 |
| Never defends or dodges, rolls skill level as base dice, never pushes; its attacks can be defended unless stated | 208 |
| Grappled: every turn tries to break free, MOBILITY against CLOSE COMBAT | 208 |
| Ambush: card #1 for the first turn only | 208 |
| Broken Xenomorph table at zero Health; Facehuggers and Chestbursters destroyed | 209 |
| Aliens mode | 209 |
| A stretch immobile restores all Health | 209 |
| Swarm leaves at zero Health | 231 |
| No zero-Health rule for Harvesters, Lion Worms, Scorpionids | 227-230 |

Every creature preset with an `attackTable` resolves to a registered `1d6` table whose rows carry `{ name, dice, damage, armorPiercing, effect }` (test). The attack rows themselves were verified earlier (`creatures-npcs-factions.md`).

### Acid splash (`onDamaged`, p. 210)

| Field | Value | Book |
|---|---|---|
| `ratingPath` | `acidSplash` | each XX121 stat line has an Acid Splash rating; Neomorph blood is not acidic (p. 223), other species have none |
| `addDamageTaken` | true | rating plus the damage taken from the attack |
| `damageTakenCapPath` | `health` | the damage counted is at most the Xenomorph's maximum Health (added to `DamageReactionDef`) |
| `damage` | 1 | base damage 1 |
| `reach` | everyone at Adjacent range, and the floor | all Adjacent targets, and the floor |
| `exceptSources` | `fire` | fire damage does not trigger it |
| `text` | armor loses a point per point of damage; anyone damaged by the first splash, even if armor absorbed it, is attacked again at the start of each round with half the dice rounded up, until a roll does no damage; the floor likewise | p. 210 |

The book's example (rating 8, 5 damage from a Smartgun, 13 base dice) is a test.

## Special attacks (p. 62)

All four are close combat attacks: a full action rolled with CLOSE COMBAT (`closeCombat`), declared before rolling, with no weapon bonus dice, doing no damage on a hit. The target may defend as normal, so `opposed` is `closeCombat` (Xenomorphs never defend, p. 208).

| id | Name | Effect (paraphrase) |
|---|---|---|
| `disarm` | Disarm | take an item from the target; keep it or throw it into the next zone |
| `pass` | Pass | get past an enemy blocking your movement (blocking, p. 61) |
| `shove` | Shove | push the target to Short range, through a door or hatch if wanted |
| `grapple` | Grapple | target can only try to break free (full action, opposed CLOSE COMBAT; Xenomorphs MOBILITY); the grappler can only make grapple attacks, unarmed and not defendable |

A search of the full text for "special attack" finds only p. 62 (and its index entries). Weak spots (p. 62, 65) are an attack option handled by `resolveHit`, ramming (p. 79) is a PILOTING close combat attack, and neither is a special attack. No entry is mode-specific.

## Rule cards changed

- `special-attacks` (p. 62): the four results, full action, no weapon bonus, defendable.
- `damage-armor` (p. 67-76): no armor dice, armor piercing floors at zero, weak spot −2 dice, armor vs fire and falls.
- `broken` (p. 68-69): NPCs break the same way; links the damage field and both tables.
- `android-damage` (p. 78): further hits roll again, repeats move up.
- `creature-attacks` (p. 208): repeat re-roll, GM choice, free Short-to-Adjacent move, grappled Xenomorphs.
- `acid-splash` (p. 210): the maximum Health cap and who is attacked again.
- `broken-xenomorph` (p. 208-209): Facehuggers and Chestbursters are destroyed.
- The play guide's Close Combat cue points at the special attacks list.

The combat panel links these cards: initiative, actions, attack-close, special-attacks, grappling, block-dodge, attack-ranged, damage-armor, armor, broken, critical-injuries, death, android-damage, creature-attacks, creature-speed, creature-armor, acid-splash, broken-xenomorph.

## Corrections to earlier data

- The `criticalInjury` operation did not re-roll an injury the character already had (p. 68). It now does, for results 14 and up, using the character's `critical-injury:<d66>` conditions.
- The XX121 Acid Splash ability and the `acid-splash` card left out the floor, the maximum Health cap, and that armor-absorbed hits still repeat.

## Prose check

A 10-word shingle check of all new and changed text against the book's text found no matches, and no purchase watermark text.
