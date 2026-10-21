# Sheets and widgets

An entity type says what a kind of thing *is* (its `schema`), how its sheet *looks* (`sheet`) and what is *derived* from it (`computed`). The app renders every sheet from this data; nothing about a game is hard-coded.

```json
{
  "id": "my-pack.adventurer",
  "kind": "character",
  "name": "Adventurer",
  "plural": "Adventurers",
  "icon": "shield",
  "schema": { "type": "object", "properties": { "level": { "type": "integer", "minimum": 1, "maximum": 20, "default": 1 } }, "additionalProperties": false },
  "computed": { "proficiencyBonus": { "+": [2, { "floor": { "/": [{ "-": [{ "var": ["fields.level", 1] }, 1] }, 4] } }] } },
  "sheet": { "sections": [{ "id": "core", "title": "Core", "fields": [{ "path": "level", "widget": "number" }, { "path": "proficiencyBonus", "widget": "computed" }] }], "summary": ["level"] },
  "defaultVisibility": { "notes": "gm" },
  "playerEditable": ["notes"]
}
```

- `kind` is one of the core kinds: `character`, `creature`, `location`, `faction`, `item`, `vehicle`, `clue`, `job`, `encounter`. The app files entities by kind (characters with `isPC: true` are the player characters at the table).
- `icon`: one of `user`, `users`, `map`, `pin`, `shield`, `flag`, `box`, `truck`, `rocket`, `search`, `briefcase`, `bug`, `swords`, `note`; without one (or with an unknown name) the kind's own icon is used.
- `subtypes`: `{ id, name, sheet?, schema? }` for kinds of a kind (a location that is a ruin or a village); a subtype's sheet sections and schema add to the type's.
- `defaultVisibility`: field path → `gm`, `players`, `some_players` or `revealed`. `playerEditable`: paths a player may edit once sync arrives.

## The schema (safe subset)

`schema` is a JSON Schema (draft-07) for the entity's `fields`. Defaults (`default`) fill a new entity. Use `type`, `properties`, `required`, `additionalProperties`, `items`, `enum`, `const`, `minimum`, `maximum`, `minLength`, `maxLength`, `minItems`, `maxItems`, `anyOf`, `oneOf`, `allOf`, `definitions` and local `$ref` (`"#/definitions/..."`), `title`, `description`, `format`. Packs may not use `pattern`, `patternProperties`, `propertyNames`, `$data`, `$async`, `$id`, `$schema` or remote `$ref`.

## Computed values (rule 4)

Never store what can be derived. `computed` maps a name to JSONLogic over `{ fields, computed }`; values are worked out at render time, in order, so `hpLeft` can read `computed.maxHp`. Show one with a `computed` widget whose `path` is the name. See the [JSONLogic cookbook](jsonlogic.md).

## Layout

`sheet.sections[]`: `{ id, title, columns?, collapsed?, mode?, fields[] }`. `sheet.summary`: paths shown in list rows and quick-stat cards.

A field: `{ path, label?, widget?, rule?, mode?, readonly?, span?, options?, entityTypes?, config? }`.

- `path` is dotted (`abilities.might`); `skills.*` means the object at `skills`; `gear[].name` an item of a list.
- `rule` links a rule card id (a "?" button opens it).
- `options` for selects: a list (must match the schema `enum`) or `{ "ref": "<reference list id>" }`. On a `text` field, `options` turns it into free text with suggestions: as you type it offers the list's item names (items a supplement added included, labelled with their source and edition), and any other text is still accepted. `config.optionsFilter: { "field": "<sibling path>", "key": "<item key>" }` narrows the suggestions to items whose `key` matches the sibling field's value (case, punctuation and an id's `<namespace>.` prefix are ignored; with the sibling empty, or nothing matching, every item is offered). The fifth edition PC sheet uses it for subclasses (`{ "field": "class", "key": "class" }`) and subraces.
- `mode` limits the field (or section) to play modes.

## Widgets

| Widget | For | `config` |
|---|---|---|
| `text`, `textarea`, `richtext` | strings | `placeholder`, `rows`, `maxLength`; `text` with `options`: `optionsFilter` |
| `number`, `skill` | numbers | `min`, `max`, `step` (else the schema's `minimum`/`maximum`) |
| `attribute` | a big number with steppers | as `number` |
| `checkbox` | booleans | `text` |
| `select`, `multiselect`, `tags` | enums, lists of strings | `ref` (reference list) |
| `skills` | an object of skill ratings | `ref` (reference list whose items have `attribute`), `attributesPath` (default `attributes`), `min`, `max`, or an inline `skills` list; `levels` (named ratings shown as a select, e.g. `[{ "value": 0, "label": "—" }, { "value": 1, "label": "Proficient" }, { "value": 2, "label": "Expertise" }]`), `labels` (column headings: `skill`, `attribute`, `attributeValue`, `value`, `pool`), `hideZero` (list only rated skills, with a "Show all" toggle) |
| `talents` | a list of `{ id, count }` picked from a reference list | `ref`, `maxStack` |
| `conditions`, `gear` | conditions; a gear list with weights | `limitComputed`, `qty` |
| `supply`, `stress` | pips | `supplyMax`, `warnAt` |
| `computed` | a computed value (read-only) | |
| `dicepool` | a pool shown as a breakdown | `computed` |
| `ref`, `reflist` | links to other entities | `entityTypes` on the field |
| `list`, `object`, `table`, `statblock` | nested data, edited by schema | `columns`, `keys`, `valueWidget` |
| `entries` | a list of named texts (traits, actions, features), read like a stat block ("**Name.** text", Markdown) with an Edit toggle | `nameKey` (default `name`), `textKey` (default `desc`) |
| `image`, `zonemap` | an image asset; a zone map | |

### The skills widget and rolling

The skills widget is what makes a character rollable. Each row shows the skill, its attribute and the pool the dice engine builds for it (e.g. `1d20 + 5`), with a **Roll** button; table mode's skill roller offers the same skills plus "attribute only" rolls. Set it up so the engine gets what it needs:

- `config.ref`: a reference list whose items carry `attribute` (the attribute id the skill uses);
- `config.attributesPath`: where the attributes object lives (`abilities` for a d20 game);
- the roll input includes `fields` and `computed`, so the engine config can read e.g. `computed.proficiencyBonus`.

A sheet may have several skills widgets, each with its own storage path and list: a d20 sheet keeps skills at `skills.*` and saving throws at `saves.*` (a list of "Strength save"... items whose `attribute` is the ability). Table mode's skill roller offers every widget's items, grouped by the widget's label, so skill ids must be unique across a type's widgets. It also offers the creatures and NPCs in the current scene whose sheet has a skills widget. The roll button passes the row's name to the app, so the roll is titled "Stealth", not "stealth".

For a 2d6 game without skills, put the stats in `attributes` and roll "attribute only".
