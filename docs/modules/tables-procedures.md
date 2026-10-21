# Tables and procedures

## Random tables

```json
{
  "id": "my-pack.site.danger",
  "name": "Danger",
  "family": "site",
  "cite": "Reference Document, Sites",
  "dice": "2d6",
  "modifiers": [{ "when": { "==": [{ "var": "kind.kind" }, "ruin"] }, "add": 2, "label": "ruin" }],
  "rows": [
    { "range": [-99, 5], "label": "Calm", "result": { "level": "calm" } },
    { "range": [6, 9], "label": "Tense", "result": { "level": "tense" } },
    { "range": [10, 99], "label": "Deadly", "result": { "level": "deadly" }, "gmDecides": true }
  ]
}
```

- `dice`: `NdX`, `dX`, `d66` (tens and units d6, 11-66), constants and sums (`1d6+2`, `3d6`).
- `rows[].range` is inclusive. Rows may not overlap and must cover **every** total the dice and numeric modifiers can make; use `-99` / `99` for open ends. `module-check` lists the gaps.
- `result` is a string or an object; an object result is what procedures and `derive` read.
- `rows[].roll`: nested rolls, `{ "table": "<id>", "as": "key", "times": 2 | "1d3" }`; the nested results land under `as` in the row's result.
- `modifiers`: `when` (JSONLogic, optional) and `add` (number or JSONLogic). A JSONLogic `add` cannot be enumerated, so cover its range with open-ended rows.
- `gmDecides`: the app shows the row and lets the GM choose.
- Cite the source with `page` (or `[first, last]`), `cite` for a section, or mark it `original`. Rows may cite their own `page` / `cite`.
- `mode`, `tags`, `notes`, `unverified` as in the contract.

## Procedures (generators)

A procedure is a list of steps rolled in order with a seed, then `produce` turns the results into entities and relationships the GM reviews and accepts. In a pack every part is declarative; each step gets its own seeded RNG, so re-rolling one step never changes another.

```json
{
  "id": "my-pack.proc.delve",
  "name": "Delve",
  "cite": "Reference Document, Delving",
  "inputs": { "type": "object", "properties": { "depth": { "type": "integer", "minimum": 0, "maximum": 3, "default": 1 } } },
  "steps": [
    { "id": "kind", "table": "my-pack.site.kind" },
    { "id": "danger", "table": "my-pack.site.danger", "reads": ["kind"], "modifier": { "var": "inputs.depth" }, "derive": { "hostile": { "!=": [{ "var": "result.level" }, "calm"] } } },
    { "id": "foes", "table": "my-pack.encounter.who", "skipIf": { "==": [{ "var": "results.danger.level" }, "calm"] }, "repeat": { "if": [{ "var": "results.danger.hostile" }, 2, 1] } },
    { "id": "coins", "roll": "2d6", "value": { "*": [{ "var": "roll" }, 10] } },
    { "id": "omen", "optional": true, "roll": "1d6" }
  ],
  "produce": {
    "entities": [
      { "tempId": "site", "type": "my-pack.site", "name": { "cat": ["The ", { "var": "results.kind.label" }] }, "fields": { "kind": { "var": "results.kind.kind" }, "coins": { "var": "results.coins" } } },
      { "tempId": "foe", "type": "my-pack.monster", "each": { "var": "results.foes" }, "when": { "==": [{ "var": "item.who" }, "monster"] },
        "name": { "cat": [{ "var": "item.label" }, " ", { "+": [{ "var": "index" }, 1] }] }, "within": "site",
        "links": [{ "type": "found_at", "to": "site" }] }
    ],
    "relationships": []
  },
  "chains": [{ "procedure": "my-pack.proc.delve", "label": "Delve deeper", "inputs": { "depth": { "+": [{ "var": "inputs.depth" }, 1] } } }]
}
```

### Steps

| Field | |
|---|---|
| `table` | A table id, or JSONLogic yielding one. |
| `roll` | A dice expression; the step's result is the total (recorded in the roll log). |
| `value` | JSONLogic; with `roll`, `{ "var": "roll" }` is the rolled total. |
| `reads` | Step ids it depends on: the step graph, and re-rolling one of them invalidates this step. |
| `skipIf` | JSONLogic; true skips the step. |
| `repeat` | A number, a dice expression (`"1d3"`) or JSONLogic. The result becomes a list. |
| `optional` | The GM ticks it to include it. |
| `modifier` | JSONLogic number added to the table roll, on top of the table's own modifiers. |
| `derive` | Keys added to the result: name → JSONLogic over the context plus `result`. A non-object result becomes `{ value, ...derived }`. |

Exactly one of `table`, `roll`/`value` per step. Results are stored under the step id: `{ "var": "results.danger.level" }`.

### `produce`

`entities[]`: `{ tempId, type, subtype?, preset?, name, summary?, tags?, fields?, within?, when?, each?, links? }`

- `name`, `summary` and each value in `fields` are JSONLogic (literals are fine). `fields` keys are dotted paths, so nested objects are set key by key.
- `when` produces the entity only when true; `each` produces one per item of a list, with `item` and `index` in the context and `-<index>` added to the `tempId`. In `within` and `links[].to`, `{index}` stands for the current index.
- `links`: relationships from this entity (`type`, `to`, `note?`), emitted with it.
- `preset`: start the entity from a preset of the same `type` (an id, or JSONLogic yielding one, e.g. `{ "var": "item.preset" }` for a monster rolled on a table): its fields come first and `fields` override them; its name, summary and tags fill in when the entity's own evaluate to nothing, and the accepted entity records the preset in its provenance. An unknown preset fails the run (and `module-check`).

`relationships[]`: `{ type, from, to, note?, when? }` between tempIds. A relationship (or `within`) pointing at an entity that a `when` left out is dropped with it.

The conformance suite runs every procedure with its default inputs against many seeds (`module-check`, 100 by default), and the determinism check runs each twice per seed. A procedure that throws, produces an unknown entity type or a dangling relationship fails there.
