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

d20 + ability modifier + proficiency × skill + bonus + modifier, against an optional DC, read as two degrees (success, failure) or four (with critical success and critical failure).

```json
{ "engine": "d20", "proficiency": { "var": "computed.proficiencyBonus" } }
```

| Option | Default | |
|---|---|---|
| `abilityModifier` | `true` | `attribute` is a score; add `floor((score - 10) / 2)`. `false` adds `attribute` as is (a game that writes modifiers down). |
| `proficiency` | `0` | JSONLogic. Multiplied by `skill` (0, 0.5, 1, 2) and rounded down. |
| `proficiencyMode` | `multiply` | `add`: the `proficiency` rule's value is added as is; the rule reads `skill` itself (e.g. a rank-based bonus, see below). |
| `bonus` | `0` | JSONLogic. A flat bonus on every roll. |
| `critOn` / `fumbleOn` | `20` / `1` | Natural results flagged as `critical` / `fumble`. |
| `critSucceeds` / `fumbleFails` | `false` | Let the natural result decide against a DC (otherwise it is only flagged). |
| `critMargin` | none | Four degrees of success: a total at or above DC + margin is a **critical success**, at or below DC − margin a **critical failure**, success and failure in between. |
| `naturalShift` | `false` | A natural `critOn`+ improves the degree one step, a natural `fumbleOn`- worsens it one step (with two degrees: a natural crit passes, a natural fumble fails). |
| `advantageNames` | `normal` / `advantage` / `disadvantage` | What the roll panel calls the roll modes, e.g. `{ "advantage": "fortune", "disadvantage": "misfortune" }`. The mechanics are unchanged. |
| `modifierChoices` | none | Up to four selects of situational modifiers (`{ id, title, choices: [{ label, value }] }`, first choice the default), e.g. a multiple attack penalty. The chosen value is added to the roll and shown in the breakdown. |
| `freeDice` | none | Other dice the table's free roll offers, by faces (e.g. `[4, 6, 8, 10, 12]` for damage); summed. |
| `labels` | `Success` / `Failure` / `Critical success` / `Critical failure` | Outcome labels. |

Roll panel options: **Roll** (normal, advantage: two d20 keep the higher, disadvantage: keep the lower; the other die is shown struck through), **DC**, **Modifier**, and one select per `modifierChoices` group. The app can also pass `adjustments`, labelled modifiers (`[{ "label": "Frightened 2 (status)", "value": -2 }]`) shown one by one in the breakdown: the combat panel builds attack rolls and saves from them, and a check rolled from a sheet carries the roller's condition modifiers this way. Without a DC the result has a total and no outcome. With two degrees `successes` is 1 on a pass, else 0; with four degrees it is 2 for a critical success, 1 for a success, 0 otherwise, and the outcome id is `critical-success`, `success`, `failure` or `critical-failure`.

A game with four degrees, attribute modifiers written down, and proficiency by rank (untrained 0; trained, expert, master, legendary = level + 2, 4, 6, 8), a multiple attack penalty and fortune / misfortune:

```json
{
  "engine": "d20",
  "abilityModifier": false,
  "proficiencyMode": "add",
  "proficiency": { "if": [{ ">": [{ "var": "skill" }, 0] }, { "+": [{ "var": ["fields.level", 1] }, { "*": [2, { "var": "skill" }] }] }, 0] },
  "critMargin": 10,
  "naturalShift": true,
  "advantageNames": { "advantage": "fortune", "disadvantage": "misfortune" },
  "modifierChoices": [{ "id": "map", "title": "Attack", "choices": [{ "label": "1st attack", "value": 0 }, { "label": "2nd attack (−5)", "value": -5 }, { "label": "3rd attack (−10)", "value": -10 }] }]
}
```

`packages/module-pf2e-orc` uses this setup.

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

## Who is best at a roll

The table's Hints tab ranks the party for each check and marks the best and worst. It asks the dice system how good each character's pool is (`poolStrength` in the SDK):

- `d20` and `2d6`: the flat bonus, so a +7 Stealth beats a +2 even though both roll one d20.
- `d100`: the roll-under target.
- `pool`: the number of dice.

A TypeScript dice system can define `strength(pool)` to rank its own way.

## Free rolls

The table's free roll lets the GM roll any number of each die kind. Engines roll a free pool as a plain sum (no outcome); pool engines count successes as usual.

## Dice rolled at the table

Many groups roll physical dice. Every roll surface in the app (the roll panel, the table's free roll and one-tap rolls, creature turns, generator steps, travel checks) can take the faces the GM typed instead of rolling, and treats them exactly like an app roll: outcome, successes, pushes, table rows, effects and the log (marked "entered", with the faces). Nothing per engine is needed, because every roll takes its randomness from the `Rng` it is given: the app passes an Rng that hands out the typed faces in order (`createEnteredRng` in the SDK) and asks for them in the order the roll uses them (`planEntry`, which runs the roll to find out).

The order each built-in engine uses:

| Engine | Dice asked for |
| --- | --- |
| `d20` | one d20; with advantage or disadvantage two d20, in order |
| `pool` | each die kind in config order, all of one kind first; a push asks only for the dice it re-rolls |
| `2d6` | two d6 (the total can be typed as one number) |
| `d100` | units d10 then tens d10, typed as one percentile; with bonus or penalty dice, the units, the tens, then each extra tens die |
| tables | the table's dice expression term by term (a d66 is typed as one number), then nested tables in row order |

A table's 2d6 or d66 is offered as one number (its total) with an "each die" switch; a total the dice cannot make is refused.

## Your own dice system (TypeScript only)

Implement `DiceSystem` (`buildPool`, `roll`, optional `push`, `describe`, optional `operations`). Set `resultStyle: "total"` and fill `total` / `outcome` when the result is a number rather than a success count, and `rollOptions` (a JSON Schema object of integer, number, boolean or string-enum properties) for options the roll panel should offer. The determinism check in `module-check` rolls it twice per seed.

Name the dice you roll so a GM entering physical dice sees what to roll: `rng.int(1, 6, { label: "Stress die", die: "stress" })` (the `die` is the DieSpec id, for its colour). Dice that read as one number at the table (a sum, a d66) can share a `group` (`facesGroup("2d6")` from the SDK makes one). Unlabelled dice still work, named by their range ("d6"). The determinism check confirms that typing back the faces an app roll used gives the same result, push and dice operations included (`enteredReplayProblem`).
