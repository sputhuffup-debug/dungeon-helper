# Licensing and citations

Two rules from the project's `CLAUDE.md` apply to every module:

- **Every table and rule card cites its source.** By page, by section, or by saying the module author wrote it.
- **Book prose only when the licence allows it.** For a rulebook without an open licence (the Alien core rules, for example), rows and rule cards are paraphrase or data, never the book's text. Openly licensed content (the D&D 5e SRD 5.1 under CC-BY-4.0, for example) may be used as written, with the licence's attribution shipped in the module and shown in the app.

## The licence and its attribution

```json
"license": {
  "spdx": "CC-BY-4.0",
  "name": "Creative Commons Attribution 4.0 International",
  "url": "https://creativecommons.org/licenses/by/4.0/",
  "attribution": "This work includes material taken from the System Reference Document 5.1 (\"SRD 5.1\") by Wizards of the Coast LLC, available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License."
}
```

- `license` is required in a data pack and recommended in every TypeScript module.
- `attribution` is shown as written, as plain text, in the module list (*Game modules…*), in the New campaign dialog and in the campaign's Settings → Game module. Put everything the licence asks you to credit there.
- `url` and `sourceBook.url` must be `http(s)`; the app links nothing else.
- `licenseNotice` stays a short notice for exports and the settings page; it is not a substitute for the attribution.
- When you write your own game, say so (`"name": "All rights reserved"` and your own credit line) or pick an open licence.

## Citing the source

| Field | Use it for |
|---|---|
| `page: 42` or `page: [42, 43]` | A printed book. Set `manifest.sourceBook` to the book the pages point to. |
| `cite: "SRD 5.1, Combat: Cover"` | A source cited by section (a web SRD, a numbered rule): one line, at most 200 characters. Set `manifest.citationStyle` to `section`. |
| `original: true` | Content the module author wrote (advice, summaries, invented tables): nothing to cite. |

`page` and `cite` are accepted on tables and their rows, rule cards, reference lists and items, presets, procedures and their steps, templates, trackers, play modes and play guide entries; `original` on tables, rule cards, reference lists, presets, procedures, templates and play guides. Rule cards and tables must carry one of the three: the conformance suite (rule cards) and table-lint (tables) report the ones that do not. The app shows "p. 42", the section citation, or "Original" next to each.

## Keeping data honest

- `manifest.dataStatus` says whether the data was checked against the source: `unverified` shows a warning when a campaign is created and in Settings.
- `unverified: true` on a table, row, preset or reference list marks entries you could not check.
- table-lint warns about rule card summaries that look like copied prose (long, many sentences, long quotes). For openly licensed text that is expected; for anything else, paraphrase.
- Never commit a rulebook PDF, its extracted text or a purchase watermark.
