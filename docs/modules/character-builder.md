# Character builder

A module's `characterBuilders` are step-by-step wizards that make a player character: each step offers choices, and each pick **grants** stored fields (ability bonuses, proficiencies, languages, speed, features, hit points, equipment rows). The app shows them as *Build a character* on the Atlas PCs tab and in *New entity*, keeps the draft until it is finished (so a player can come back to it), and ends on a review page with the sheet preview and every grant beside its source ("+2 Intelligence from background Sage"). A builder can also declare **level-up** steps, run against a character that already exists (a *Level up* button on its sheet).

Every rule is JSONLogic (rule 5), so a data pack declares a builder in its main file exactly as a TypeScript module sets `characterBuilders` on its `GameModule`. Grants write stored fields only: computed values (modifiers, proficiency bonus, spell slots) stay computed and are read by the rules through `computed` (rule 4). The contract is `CharacterBuilderDef` in `packages/module-sdk/src/types.ts`; the resolver is `resolveCharacterBuilder` in `packages/module-sdk/src/characterBuilder.ts`.

```jsonc
"characterBuilders": [
  {
    "id": "mypack.builder",
    "entityType": "mypack.adventurer",          // the sheet it fills
    "name": "Build an adventurer",
    "defaults": { "isPC": true },              // set before any grant
    "data": {},                                // lookup tables for rules (`data`)
    "itemData": {                              // structured data attached to list items as `item.builder`
      "mypack.backgrounds": { "miner": { "skill": "climb" } }
    },
    "steps": [ /* choice, abilities, fields and review steps, in order */ ],
    "finally": [ /* grants after every step: hit points from the final scores, AC */ ],
    "preview": [ { "label": "Hit points", "value": { "var": "computed.maxHp" } } ],
    "levelUp": { "when": { "<": [{ "var": "fields.level" }, 20] }, "steps": [], "finally": [] }
  }
]
```

## Steps

| Kind | What the player does | Main keys |
|---|---|---|
| `choice` | Picks one or more options; each pick grants fields and may bring sub-choices | `source`, `min`, `max`, `available`, `grants`, `subChoices`, `noun`, `columns` |
| `abilities` | Gets base ability scores with one of the step's methods; the step shows base, bonuses and final scores with modifiers | `path`, `abilities`, `methods`, `modifier`, `max` |
| `fields` | Types fields in directly (a name, an alignment, personality); `core.name` is the entity's name | `fields` (`path`, `label`, `widget`, `options`, `required`) |
| `review` | Reads the sheet preview, every grant with its source and what is left to do | `todo` (JSONLogic giving a list of lines) |

Every step takes `id`, `title`, `intro`, `guide` (tips for the side panel), `summary` (its line in the stepper; default: the names picked), `when` (skip the step unless it holds), `validate` and a citation (`page`, `cite` or `original`). A `choice` step without a `source` has nothing to pick itself: its grants apply once and it only asks its sub-choices (one equipment choice per line of a class's list, say).

### Choice sources

| Source | Options |
|---|---|
| `{ "list": "mypack.classes", "where": rule }` | The items of a reference list (supplement items included, with their source badge) that `where` keeps |
| `{ "options": [{ "id", "name", "summary", ... }] }` | Fixed options; extra keys are data for the rules (`item.<key>`) |
| `{ "values": rule, "list": "mypack.skills" }` | Options worked out from earlier choices: ids of `list` items (or names), plain strings, or objects with `id` and `name` |
| `{ "range": { "min": 1, "max": 20, "label": "Level" } }` | Whole numbers, shown as a number picker; `choices.<id>.value` is the number |
| `{ "presets": { "entityType", "tags" }, "where": rule }` | The module's presets |

`where` and `available` see the candidate as `option`. `available` false shows the option but it cannot be picked, with `availableText` as the reason ("Needs Intelligence 13."). `min` and `max` (numbers or JSONLogic, default 1 and 1) say how many to pick; a choice with exactly as many options as it must take picks them by itself. An option with `roll` (JSONLogic giving a dice expression) asks for a roll when picked: the app rolls it, or takes dice typed in from the table, and the total is `item.rolled`.

### Grants

```jsonc
{ "path": "abilities.dexterity", "op": "add", "value": 2 }
{ "path": { "cat": ["skills.", { "var": "item.id" }] }, "value": 1 }          // a path worked out from the pick
{ "path": "languages", "op": "append", "value": { "var": "item.builder.languages" } }
{ "path": "features", "op": "append",
  "each": { "list": "mypack.class-features", "where": { "==": [{ "var": "entry.class" }, { "var": "item.name" }] } },
  "object": { "name": { "var": "entry.name" }, "desc": { "var": "entry.description" } } }
{ "path": "classLevels", "op": "upsert", "key": "class",
  "object": { "class": { "var": "item.id" }, "level": { "+": [{ "var": ["current.level", 0] }, 1] } } }
{ "path": "$hitDie", "value": { "var": "item.builder.hitDie" } }               // a builder variable, never stored
```

| `op` | Effect |
|---|---|
| `set` (default) | Writes the value |
| `add` | Adds a number to the number there (0 when unset) |
| `append` | Adds to a list (a list value adds each element; equal elements are not added twice), or to a text field joined with `separator` (default ", ") |
| `remove` | Takes elements out of a list |
| `max` / `min` | Keeps the larger / smaller number (darkvision from a race and a lineage) |
| `upsert` | In a list of objects, merges into the object whose `key` equals the value's, or adds it; that object is `current` to the value's rules |

`value` is JSONLogic; `object` builds an object value key by key. `each` applies the grant once per element (`entry`): a JSONLogic list, or `{ "list", "where" }` for reference list items. `when` skips it. `label` is how the review page names it ("Hit point maximum 20 (average)"); without one the app writes it from the field's sheet label and the value ("+2 Dexterity", "Languages: Elvish"). `hidden` keeps bookkeeping off the review page. A path starting with `$` is a builder variable (`vars.<name>` to later rules); `core.name` and `core.summary` are the new entity's name and one-line summary.

Grants apply in step order, picks in the order they were made, each pick's sub-choices right after it. An `abilities` step's base scores are written **before any grant**, wherever the step sits, so increases from steps before and after it add to them. `finally` runs after every step.

### Sub-choices

A pick can bring choices of its own: a class's "choose two skills from…", a background's "+2 and +1 or +1 to all three", an equipment line's "(a) or (b)", a feat's "+1 to Strength or Dexterity". They are declared on the choice, with the pick's data deciding whether they apply and what they offer:

```jsonc
"subChoices": [
  {
    "id": "skills",
    "label": { "cat": ["Choose ", { "var": "item.builder.skills.choose" }, " skills"] },
    "when": { "var": "item.builder.skills" },
    "source": { "values": { "var": "item.builder.skills.from" }, "list": "mypack.skills" },
    "min": { "var": "item.builder.skills.choose" },
    "max": { "var": "item.builder.skills.choose" },
    "grants": [{ "path": { "cat": ["skills.", { "var": "item.id" }] }, "value": 1 }]
  },
  {
    "id": "equipment",
    "label": { "var": "entry.label" },
    "each": { "var": "item.builder.equipment" },                 // one choice per element, the element is `entry`
    "source": { "values": { "var": "entry.options" } }
  }
]
```

Sub-choices nest (a feat picked at an ability score improvement asks for its own increase). Their grants name the pick they belong to as their source unless they have a `noun` or `sourceLabel` of their own.

### Ability methods

| `kind` | Keys | The player |
|---|---|---|
| `array` | `values` (one per ability) | Assigns each value to one ability |
| `pointBuy` | `budget`, `costs` (score → points, every score from `min` to `max`), `min`, `max` | Raises scores from `min` within the budget |
| `roll` | `dice` (per score, e.g. `"4d6"`), `keep` (highest dice kept, e.g. 3), `count` | Rolls in the app (seeded) or types the dice rolled at the table, then assigns the totals |
| `manual` | `min`, `max` | Types each score |

Costs, arrays and dice are data, cited like any rule (`page`, `cite` or `original`). `modifier` (JSONLogic over `{ score }`) is shown beside each score; `max` warns about a final score above it. Rolled dice are stored in the draft as faces (`rollAbilityScores` with a seeded or entered Rng), so a draft always replays the same.

## The rule context

Every rule sees:

| Key | What it is |
|---|---|
| `choices` | Each step's picks: `choices.<step id>` is `{ id, ids, item, items, value, values, rolled, sub }`, sub-choices under `.sub.<id>` (a list for `each`). Later steps too: the builder resolves until the picks settle, so a class step's grants can read the starting level chosen after it |
| `item` | The pick a grant or sub-choice belongs to; `item.builder` holds the builder's `itemData` for it (an item's own `builder` key wins, so a supplement can bring its own) |
| `parent`, `picks` | The pick of the parent choice; every pick of the choice |
| `entry`, `option` | The element of an `each`; the candidate a source's `where` or `available` looks at |
| `fields`, `computed` | The character as the grants so far left it, and its computed values |
| `base` | The fields before the builder ran: the type's defaults, or the character being levelled up |
| `vars`, `data`, `mode` | Builder variables, the builder's `data`, and `"create"` or `"levelUp"` |

Inside `filter`, `map`, `some` and `reduce` a `var` sees only the element; precompute per-level tables in `data` or `itemData` and use `lookup`, or `find` to pick an object out of a list by an outer value (see the [JSONLogic cookbook](jsonlogic.md)).

## Validation

Each choice reports what is missing (fewer picks than `min`, a roll not made), what is wrong (more than `max`, a pick that is no longer available) and fails its `validate` checks (`{ rule, message, level }`, true means fine). The `abilities` step checks its method (each array value once, the point budget, the score range). The finished fields are validated against the entity type's schema. The stepper shows each step as done, to do or wrong, and *Create* stays off until nothing is missing or wrong.

`module-check` and the conformance suite report unknown entity types, lists, fields, list items in `itemData` and grant ops, JSONLogic errors in any rule, duplicate ids, ability methods that do not fit (an array of the wrong length, a point buy without a cost for every score), and run a dry run that picks the first options everywhere and checks the result.

## Level-up

`levelUp.steps` are ordinary steps run against an existing character (`base` and the starting `fields`); `levelUp.when` (JSONLogic over `{ fields, computed }`) says which characters can use it and `whenText` why not. The result is applied to the character, with every grant listed as on creation. A typical level-up picks the class to add a level in (`available` checks multiclass prerequisites from data), adds hit points (average, or a roll entered or rolled), upserts the class into a list of class levels, and asks the choices that level brings.

## Drafts

The app keeps drafts in the campaign (`meta.settings.characterDrafts`), one per unfinished character, with the picks by choice path, rolled dice, ability scores and typed fields. A choice's path is its step id, then `/<sub-choice id>` (with `.<n>` per `each` element, and `/<pick id>` under a choice that takes several picks). Picks that stop being options (a class changed) are kept but ignored.

## For the ORC follow-up and other systems

- Ability *boosts* (PF2e-style) are choice steps whose grants `add` to attribute fields, with `available` keeping picks distinct; the `abilities` step kind is optional.
- A pick's data drives everything: put structured data in `itemData` (or, for a supplement's items, a `builder` key on the item) rather than parsing text in rules.
- Per-level tables (counts by level, features by level) belong in `data` or `itemData`, read with `lookup`.

Examples: `packages/module-example/packs/example-pack/pack.json` (small) and `packages/module-dnd5e-srd/scripts/authored/builder.ts` (the fifth edition builder: editions, races and lineages, classes with multiclassing, backgrounds with origin feats, equipment packages, spells).
