# GM screen

A module's `gmScreen` is the printable quick reference the app builds for a campaign (*Rules → GM screen*, or *Settings → Print*): a landscape tri-fold with three panels on the GM side and three on the side that faces the players, on Letter, A4, 11×17 or A3, or one card per panel (two to a sheet) for a binder. Every panel is made of **references to the module's own content**, so the screen never repeats rule text the module already holds and always cites it the same way. TypeScript modules set `gmScreen` on the `GameModule`; data packs put it in the main file. The contract is `GmScreenDef` in `packages/module-sdk/src/types.ts`.

```jsonc
"gmScreen": {
  "title": "GM screen",                       // optional
  "panels": [
    {
      "id": "checks",                           // the app remembers a campaign's choices by it
      "title": "Checks and DCs",
      "size": "third",                          // third (one fold, default), half (two folds), full (the whole side)
      "side": "gm",                             // gm (default) or players: what faces the table
      "optional": false,                        // true: offered in the picker, off until the GM adds it
      "mode": ["campaign"],                     // optional: only in these play modes
      "blocks": [
        { "kind": "rule", "rule": "mypack.rule.checks" },
        { "kind": "rule", "rule": "mypack.rule.travel", "title": "Travel pace", "section": "Travel Pace", "parts": [2] },
        { "kind": "table", "table": "mypack.table.panic", "columns": ["effect"] },
        { "kind": "list", "list": "mypack.actions", "where": { "==": [{ "var": "group" }, "Basic"] }, "columns": ["cost"] },
        { "kind": "conditions", "conditions": ["prone", "grabbed"] },
        { "kind": "guide", "tips": [0, 2], "entries": ["perception"], "cues": 1 },
        { "kind": "text", "title": "Cover", "text": "**Half cover**: +2 AC.", "original": true, "rules": ["mypack.rule.cover"] }
      ]
    }
  ]
}
```

## Blocks

Every block takes an optional `title` (default: the card's, table's or list's own name) and `mode`.

| Kind | Prints | Options |
|---|---|---|
| `rule` | A rule card's Markdown: paragraphs, lists, headings and tables | `section`: only the part under that heading of the card; `parts`: only these 0-based parts (paragraphs, lists, tables, headings) of the card or the section |
| `table` | A roll table, compactly: "Roll 1d6 + stress level − Resolve", then one row per line (range, label, result) | `columns`: result keys after the label (default the first of `effect`, `summary`, `text`, `description`); `notes`: print the table's notes |
| `list` | Reference list items: the name in bold, chosen columns, the summary (or description) | `items` (ids, in order), `where` (JSONLogic over each item), `columns`, `summary: false` (names only, run together on one line) |
| `conditions` | `d20Combat` conditions with their helper text | `conditions`: ids, in order (default all) |
| `guide` | A play guide's tips (the dice and rolling notes) and entries (label, summary and cues) | `guide` (default the first), `tips` (`true` or indexes), `entries`, `cues` (default 1) |
| `text` | A short quick-rules note in Markdown | `original: true` is required; cite what it summarizes with `page`, `cite` or `rules` (rule card ids) |

Ranges past what the dice roll print as open ends (`≤0`, `12+`); action glyphs that the PDF fonts lack print as `[1]`, `[2]`, `[3]`, `[free]`, `[reaction]`.

### Citations and licences

Each block prints its citation beside its title: `p. 72` or `pp. 72–73` for page-cited modules, the source of a section citation (`SRD 5.1`, `Player Core`) for section-cited ones, or `original`. A `text` block is always the module author's own words: for a source without an open licence that is the only way to add text to the screen, and it must stay a paraphrase; openly licensed text belongs in a rule card the block references. Keep notes short (`module-check` warns past 700 characters).

The GM side's footer carries the manifest's `licenseNotice` (and, for page-cited modules, which book the page numbers refer to); the player side's footer carries the licence's full `attribution` (CC-BY attributions, the ORC Notice), and cards end with a notices card. Supplements whose items the screen prints add their notice and attribution.

## Layout

Blocks flow down their panel's columns (a `half` panel may use two folds, `full` three) and panels stack in a fold when they fit. Type shrinks per panel within limits (7.5 to 6 pt on Letter and A4, 10.5 to 8.5 pt on 11×17 and A3, a little larger on cards) until the panel fits. A table row, a list or condition entry and a block's heading never split across folds; a table continuing in the next fold repeats its head. What still does not fit is left out and listed on the GM screen page (*Not everything fits*), and a panel with no room left on its side is listed too; the GM can untick a panel or give one more room. On cards a long panel continues on another card instead.

The GM's choices (which panels, their order within each side, their size, the paper, tri-fold or cards, fold marks) are saved with the campaign in `meta.settings.gmScreen`.

## Without a `gmScreen`

A module or pack that declares none still gets a screen: up to four panels of rule cards grouped by their most used tags (shortest cards first), the play guide's tips, and on the player side its `d20Combat` conditions or a reference list whose name says conditions. Declare `gmScreen` to choose what matters at the table.

## Checks

`module-check` (and the conformance suite) reports a `gmScreen` that references a missing rule card, table, list, list item, condition, play guide, tip or entry; a `section` that is not a heading of its card or `parts` out of range; a `text` block without `original: true`; duplicate panel ids, panels without a title or blocks, undeclared modes, and JSONLogic errors in `where`. The app's tests lay out every built-in module's default screen on every paper in both layouts and fail if anything is dropped.

Examples: `packages/module-example/packs/example-pack/pack.json` (small), `packages/module-dnd5e-srd/scripts/authored/gmScreen.ts`, `packages/module-pf2e-orc/scripts/authored/gmScreen.ts` and `packages/module-alien/src/gmScreen.ts`.
