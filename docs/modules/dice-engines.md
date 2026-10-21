# Dice engines

A pack picks one built-in engine in `dice`; a TypeScript module can use the same engines with `createDiceEngine(config)` or write its own `DiceSystem`. All randomness comes from the seeded RNG the app passes in, so a roll logged with its seed can be reproduced (rule 3).

## What the engine gets

When the GM rolls a skill from a sheet or at the table, the app builds the roll input from the character's **skills widget** (see [sheets](sheets.md)):

| Key | Meaning |
|---|---|
| `attribute` | The attribute's value (a score, a rating, a percentage) |
| `skill` | The skill's value (a rating, a proficiency multiplier, a percentage); 0 for an attribute-only roll |
| `attributeId`, `skillId` | What is rolled |
| `fields`, `computed` | The character's stored fields and computed values, for JSONLogic in the engine config |
| `modifier` and the engine's options | Set by the GM in the roll panel (see `rollOptions` below) |

Numbers in an engine config marked "JSONLogic" may be a number or a JSONLogic rule over this input, e.g. `{ "var": "computed.proficiencyBonus" }`.

Every result has `successes` (pool systems: dice showing a success; the others: the degree of success, 0 = failure), so anything that asks "did it succeed?" works for every engine. Total-style engines also set `total`, `target`, `outcome` (`{ id, label, tone }`) and the `critical` / `fumble` flags; the roll panel then leads with the total and the outcome instead of a success count.

## `d20`

d20 + ability modifier + proficiency × skill + bonus + modifier, against an optional DC.

```json
{ "engine": "d20", "proficiency": { "var": "computed.proficiencyBonus" } }
```

| Option | Default | |
|---|---|---|
| `abilityModifier` | `true` | `attribute` is a score; add `floor((score - 10) / 2)`. `false` adds `attribute` as is. |
| `proficiency` | `0` | JSONLogic. Multiplied by `skill` (0, 0.5, 1, 2) and rounded down. |
| `bonus` | `0` | JSONLogic. A flat bonus on every roll. |
| `critOn` / `fumbleOn` | `20` / `1` | Natural results flagged as `critical` / `fumble`. |
| `critSucceeds` / `fumbleFails` | `false` | Let the natural result decide against a DC (otherwise it is only flagged). |
| `freeDice` | none | Other dice the table's free roll offers, by faces (e.g. `[4, 6, 8, 10, 12]` for damage); summed. |
| `labels` | `Success` / `Failure` | Outcome labels. |

Roll panel options: **Roll** (normal, advantage: two d20 keep the higher, disadvantage: keep the lower; the other die is shown struck through), **DC**, **Modifier**. Without a DC the result has a total and no outcome. `successes` is 1 on a pass, else 0.

## `pool`

Roll a handful of dice; each face in `success` counts once. Generalizes Year Zero style pools.

```json
{ "engine": "pool", "dice": [{ "id": "base", "name": "Base die", "success": [6], "bane": [1] }, { "id": "gear", "name": "Gear die", "count": { "var": "fields.gearBonus" } }], "push": { "max": 1 } }
```

| Option | Default | |
|---|---|---|
| `dice` | one d6 succeeding on 6 | Die kinds: `id`, `name`, `faces` (6), `success` (the highest face), `bane` faces, `count` (JSONLogic; the first kind defaults to attribute + skill + modifier, others to none), `color` (hex or a CSS colour name). |
| `minDice` | `1` | Fewest dice of the first kind. |
| `push` | `{ "max": 1 }` | Re-roll every die that is not a success; `lockBanes: true` keeps banes too. `false`: no push. |
| `labels` | | Outcome labels. |

Roll panel option: **Modifier (dice)**. Results keep the success-count display.

## `2d6`

2d6 + stat + modifier, read as bands (Powered by the Apocalypse).

```json
{ "engine": "2d6", "stat": { "var": "fields.attributes.cool" }, "bands": [
  { "min": 10, "id": "strong-hit", "label": "Strong hit", "tone": "success" },
  { "min": 7, "id": "weak-hit", "label": "Weak hit", "tone": "partial" },
  { "min": -99, "id": "miss", "label": "Miss", "tone": "failure" }
] }
```

| Option | Default | |
|---|---|---|
| `stat` | attribute + skill | JSONLogic. |
| `bands` | 10+ / 7-9 / 6- as above | The highest band whose `min` the total reaches wins; the lowest must use `-99`. `successes` counts bands above the lowest (miss 0, weak 1, strong 2). |

Roll panel option: **Forward / ongoing**. Double sixes and double ones set `critical` / `fumble`.

## `d100`

Roll-under percentile with degrees of success (BRP, Call of Cthulhu style).

```json
{ "engine": "d100", "fumbleLowTarget": { "below": 50, "at": 96 }, "push": { "max": 1 } }
```

| Option | Default | |
|---|---|---|
| `target` | skill, or the attribute when skill is 0 | JSONLogic. The roll panel's modifier is added. |
| `degrees` | extreme ≤ 1/5, hard ≤ 1/2, regular ≤ target | `{ id, label, fraction, tone? }`, any order. `successes`: 3, 2, 1 for these, 0 for a failure. |
| `criticalAt` | `1` | A roll at or under it is a critical (the best degree); 0 for none. |
| `fumbleAt` | `100` | A roll at or over it is a fumble. |
| `fumbleLowTarget` | none | e.g. `{ "below": 50, "at": 96 }`: with a target under 50, fumbles start at 96. |
| `tensDice` | `true` | Bonus (+) and penalty (−) dice on the tens: extra tens dice, keep the best or worst. |
| `push` | `false` | `{ "max": 1 }`: re-roll the whole roll once. |

Roll panel options: **Target modifier**, **Bonus (+) / penalty (−) dice**.

## Free rolls

The table's free roll lets the GM roll any number of each die kind. Engines roll a free pool as a plain sum (no outcome); pool engines count successes as usual.

## Your own dice system (TypeScript only)

Implement `DiceSystem` (`buildPool`, `roll`, optional `push`, `describe`, optional `operations`). Set `resultStyle: "total"` and fill `total` / `outcome` when the result is a number rather than a success count, and `rollOptions` (a JSON Schema object of integer, number, boolean or string-enum properties) for options the roll panel should offer. The determinism check in `module-check` rolls it twice per seed.
