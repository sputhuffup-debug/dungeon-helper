# Setting up a campaign (setup guide and campaign settings)

A new campaign's Home page leads with **Set up your campaign**: an ordered checklist from a blank campaign to its first session. Each step links straight to where it is done and ticks itself from campaign data, never from a click. The card shows "3 of 8 done", can be hidden (Settings shows it again), and disappears once every step is done.

A module shapes it in two optional, generic ways, both declarable by a data pack (main file only) as well as a TypeScript module:

- `setup`: its own steps, and per play mode which core steps to leave out and the order.
- `campaignSettings`: campaign-level settings, some asked in the New campaign dialog; procedure inputs with the same name start from them.

The contract is `SetupDef` and `CampaignSettingDef` in `packages/module-sdk/src/types.ts`; the runtime is `packages/module-sdk/src/setup.ts` (composing, ticking, conformance) and `packages/core/src/setup.ts` (the core steps, the snapshot, whether Home shows the card).

## Core steps

Every module gets these, in this order, unless its layout hides them:

| Id | Step | Done when |
|---|---|---|
| `setup.pcs` | Add the player characters | there is at least one PC |
| `setup.players` | Add the players and who plays whom | there is a player and every PC has one |
| `setup.session` | Plan the first session | there is a session |

A PC is a character-kind entity flagged `isPC` or played by a player.

## A step

```json
{
  "id": "lantern.setup.site",
  "label": "Map the first site",
  "hint": "The ruin the first delve goes into.",
  "mode": ["delve"],
  "done": { "some": [{ "var": "entities" }, { "==": [{ "var": "type" }, "lantern.site"] }] },
  "progress": { "count": { "var": "counts.pcs" }, "of": 4, "label": "PCs: a crew of four" },
  "links": [
    { "label": "+ Site", "newEntity": { "type": "lantern.site" }, "primary": true },
    { "label": "Roll a delve", "procedure": "lantern.proc.delve" }
  ],
  "cite": "LRD, Delving"
}
```

- `id` starts with the module id and a dot; `setup.` is the core's.
- `done` is JSONLogic over the snapshot below; truthy means done. An empty campaign should not count as done (the checker warns).
- `progress` (optional) shows "2 of 4" next to the label while the step is open; its `label` (JSONLogic, so a plain string will do) says what is counted and where the target comes from ("0 of 4 PCs: a crew of four until you add the players").
- `links`: where the step is done. Each has exactly one target:
  - `page`: an app page, one of `home`, `atlas`, `settings`, `ship`, `arcs`, `sessions`, `adventures`, `generate`, `primer`, `rules`, with `params` as its search (`{ "tab": "pcs" }` for the Atlas; `{ "section": "campaign" | "players" | "setup" }` for Settings);
  - `procedure`: a procedure to open in Generate;
  - `newEntity`: the New entity page for a type (`pc: true` starts a player character, `preset` picks one);
  - `entity`: JSONLogic over one snapshot entity at a time; the first match by name opens, and the link hides while nothing matches (e.g. "Open the job" before a job is taken);
  - `reference`: an entry of the Reference page, exactly one of `{ "list": "<list id>" }` (add `"item": "<item id>"` to open one of its items), `{ "table": "<table id>" }` or `{ "preset": "<preset id>" }`. The guide shows these apart, as *Look it up* links.
  The `primary` link of the next open step is the card's main button.
- Steps' wording is the module's own: a short paraphrase, never book prose.

## Order per mode

```json
"setup": {
  "steps": [ … ],
  "layouts": [
    { "mode": ["delve"], "hide": ["setup.session"], "order": ["lantern.setup.site"] },
    { "order": ["setup.pcs", "lantern.setup.site"] }
  ]
}
```

The first layout whose `mode` fits the campaign (or that has none) is used. `hide` names core steps to leave out; `order` names steps (core or the module's) to put first, in that order; the rest follow in their default order (core steps, then the module's). Steps with a `mode` show only in those modes.

## The snapshot

`done`, `progress` and `entity` read a `SetupSnapshot`: plain, sorted campaign data, the same every time for the same campaign.

| Key | Holds |
|---|---|
| `mode` | the campaign's play mode |
| `settings` | `meta.settings`: the crew's vehicle, campaign settings, ... |
| `entityIds` | every entity id: `{ "in": [{ "var": "settings.ship" }, { "var": "entityIds" }] }` is "a ship is chosen and still exists" |
| `entities` | `{ id, name, type, kind, subtype, tags, pc, owner, visibility, fields, handouts }`; `handouts` are those for that character (`{ kind, purpose }`) |
| `pcs` | the entities with `pc` |
| `players` | `{ id, name, characters }` |
| `sessions` | `{ id, number, status, scenes }` (`scenes`: planned into it) |
| `adventures` | `{ id, title, status, source, builder }` (`source`: the adventure source id it runs, e.g. a job) |
| `arcs` | arc threads: `{ id, status }` |
| `counts` | `entities`, `pcs`, `unownedPcs`, `players`, `sessions`, `plannedSessions`, `playedSessions`, `adventures`, `arcs`, `maps`, `notes`, `handouts` |

Inside `some`, `all` and `filter` a rule sees one element, so "every PC has an agenda" is `{ "and": [{ ">": [{ "var": "counts.pcs" }, 0] }, { "all": [{ "var": "pcs" }, { "!!": [{ "var": "fields.agenda" }] }] }] }` (json-logic's `all` is false on an empty list, but spell the count out for clarity).

## Campaign settings

```json
"campaignSettings": [
  { "key": "village", "label": "Home village", "kind": "choice", "options": [{ "value": "brindle", "label": "Brindle" }, { "value": "orrow", "label": "Orrow" }], "atCreation": true, "mode": ["saga"] },
  { "key": "camp", "label": "Base camp", "kind": "entity", "entityTypes": ["lantern.site"] }
]
```

- `key` is the `meta.settings` key. Core keys (`sessionChecklist`, `setupGuide`, `worldMinutes`, `gmScreen`, `characterDrafts`, `tracker:*`) are refused.
- `kind`: `choice` (from `options`, or from a reference list's items with `list`, their summaries as hints), `entity` (one of the campaign's entities of `entityTypes`; Settings offers "+ New…" to make one from a preset and choose it), or `text`.
- `default` is what a new campaign starts with; `atCreation` asks it in the New campaign dialog (not for `entity`: a new campaign has none).
- Settings shows every setting for the campaign's mode, under Campaign.
- **Procedure defaults:** a procedure input whose name is a setting's `key` starts from the setting's value (when it fits the input's `enum`), and the GM can still change it per run. That is how the Alien module's campaign frame, asked once at creation, reaches the job generator, the job board and between jobs.

## Checks

`checkModule` (and so `pnpm module-check`) reports: step ids not namespaced or duplicated, missing labels or `done` rules, unknown JSONLogic operators, undeclared modes, links without exactly one target or to unknown pages, procedures, entity types, presets, reference lists, list items or tables, layouts that hide non-core steps or order unknown ones, rules that throw on an empty campaign or already pass on one (a warning); and for settings, duplicate or core keys, choices without options, defaults outside the options, unknown lists and entity types. A data pack's step ids must start with the pack id, and its rules are checked as JSONLogic when it is validated.

## Showing the card

A campaign created in the app starts with `settings.setupGuide = { show: true }`; demos and imported campaigns do not, so their Home pages are unchanged. Home shows the card while it is switched on and a step is open; while it shows, "Start a session" steps back from the primary button. "Hide this" switches it off; Settings, Setup guide, switches it back on.
