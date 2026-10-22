# JSONLogic cookbook

Every expression in a pack is [JSONLogic](https://jsonlogic.com): a JSON object whose single key is an operator. Literals (`3`, `"text"`, `true`) evaluate to themselves. The SDK evaluates it with `json-logic-js` plus a few operators of its own; `method` (which calls arbitrary object methods) is not allowed, and the validator rejects any operator not listed below.

**Operators**: `==` `===` `!=` `!==` `>` `>=` `<` `<=` `!!` `!` `%` `log` `in` `cat` `substr` `+` `*` `-` `/` `min` `max` `merge` `var` `missing` `missing_some` `if` `?:` `and` `or` `filter` `map` `reduce` `all` `none` `some`, plus the SDK's `floor` `ceil` `round` `sum` `count` `has` `lookup` `len` `words` `trim` `matches` `startsWith` `endsWith`.

## Where expressions appear and what they see

| Where | Data |
|---|---|
| `entityTypes[].computed.<name>` | `{ fields, computed }`; computed values run in order, so later ones read earlier ones |
| `tables[].modifiers[].when` / `.add` | the procedure context, flat: inputs and step results by name (`{ "var": "terrain.kind" }`) |
| procedure `skipIf`, `repeat`, `modifier`, `value`, `table` | `{ inputs, results, ...inputs, ...results }`; `value` also gets `roll` after a `roll` step |
| procedure `derive.<key>` | as above plus `result`, the step's own result |
| procedure `display` | as above plus `result` and `label`, the row label the step rolled (a list when it repeats) |
| `produce` names, fields, `when`, `each` | as above; inside `each`, `item` and `index` |
| `chains[].inputs.<name>` | as above |
| dice engine numbers (`proficiency`, `stat`, `target`, `count`) | the roll input: `attribute`, `skill`, `fields`, `computed`, options |
| `d20Combat` combatant `ac`, `hp.max`, `saves`, `speed`; a save effect's `dc` | the entity's `{ fields, computed }` |
| `d20Combat` attack `bonus` | `{ fields, computed, item }` (`item`: the attack's list item) |
| `d20Combat` condition effect `modifier` | `{ value }` (the condition's value) |
| `d20Combat` `zeroHp` `when` / condition values | `{ kind, type, fields, computed }` / `{ critical, conditions, fields, computed }` |

## Recipes

Ability modifier (d20 systems):
```json
{ "floor": { "/": [{ "-": [{ "var": "fields.abilities.strength" }, 10] }, 2] } }
```

Proficiency bonus by level (+2 at 1-4, +3 at 5-8, ...), with a default level of 1:
```json
{ "+": [2, { "floor": { "/": [{ "-": [{ "var": ["fields.level", 1] }, 1] }, 4] } }] }
```

Health left, never below zero:
```json
{ "max": [0, { "-": [{ "var": "computed.maxHp" }, { "var": ["fields.damage", 0] }] }] }
```

Carried weight, summed over a gear list:
```json
{ "sum": [{ "map": [{ "var": "fields.gear" }, { "var": "weight" }] }] }
```

A table modifier only in ruins:
```json
{ "when": { "==": [{ "var": "kind.kind" }, "ruin"] }, "add": 2, "label": "ruin" }
```

Pick a table by input:
```json
{ "if": [{ "var": "inputs.lucky" }, "my-pack.loot.rare", "my-pack.loot.common"] }
```

Repeat once per party member, at least once:
```json
{ "max": [1, { "var": "inputs.party" }] }
```

Build a name:
```json
{ "cat": ["The ", { "var": "results.kind.label" }, " of ", { "var": "inputs.region" }] }
```

The list of item names from a repeated step:
```json
{ "map": [{ "var": "results.loot" }, { "var": "item" }] }
```

Text checks (`matches` takes a pattern and optional flags `i`, `m`, `s`, `u`):
```json
{ "matches": [{ "var": "fields.notes" }, "^secret"] }
```

## Tips

- `{ "var": ["path", fallback] }` gives a default when the path is missing. `lookup` gives its fallback for a missing or empty key (an unset select).
- An object with more than one key is plain data, not an operator; to build an object in `produce`, set its fields one by one with dotted paths instead (`"abilities.might": 12`).
- A missing value in `+` or `*` gives `NaN`; give every `var` in arithmetic a fallback. The SDK's own operators (`floor`, `sum`, `max`...) read a missing value as 0. `if` treats `[]`, `0`, `""` and `null` as false.
- `module-check` evaluates every computed rule against default fields and runs every procedure with many seeds, so a rule that throws or reads a missing path shows up there, not at the table.
