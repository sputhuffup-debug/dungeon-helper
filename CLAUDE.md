# Campaign Forge

A Game Master's workspace for tabletop RPG campaigns. Every game system is a plugin ("module"); v1 ships the Alien RPG Evolved Edition module. See `docs/architecture-seed.md` for the founding design document.

## v1 decisions (confirmed with the owner, Oct 2026)
- GM-only, local-first PWA. No server, no accounts, no player sync in v1. Data model keeps visibility and member shapes so sync can come later.
- Alien rulebook data was verified against the owner's copy of the Evolved Edition core rules (Oct 2026); see `docs/verification/`. Numbers, names and stat lines are exact; effects and rule summaries are short paraphrases, never book prose. Only entries the book does not supply keep `unverified: true`.
- Never commit the rulebook PDF, its extracted text, or its per-copy purchase watermark.
- Maps: imported images with rectangular zone overlays (cluttered/open, borders open/blocked/door) stored as data.
- No AI layer in v1. Provenance fields stay in the model.

## Layout
- `packages/module-sdk` the GameModule contract (`src/types.ts` is the API), dice expression parser, seeded RNG, table roller, procedure runner, JSONLogic evaluator, conformance suite.
- `packages/core` game-agnostic domain model (`src/types.ts`), Yjs campaign store with IndexedDB persistence, visibility, backlinks, search, export/import bundle.
- `packages/module-alien` the Alien module: data, procedures, templates, rule cards. The only package allowed to know what a xenomorph is.
- `packages/module-example` a tiny fixture module; core, sdk and ui are tested against it so the core never grows Alien-specific behaviour.
- `packages/ui` schema-driven sheet renderer, widgets, trackers (React).
- `apps/web` the React 19 + Vite PWA.
- `tools/table-lint` dice coverage, page refs, enum references. `tools/seed-campaign` builds the demo campaign.

## Rules every package obeys
1. Rules live in modules, never in core. Core/sdk/ui must not import `module-alien`.
2. Every table and rule card cites its page. Rows are paraphrase or data, never book prose.
3. Deterministic generation: same seed + module version => same output. Tested in CI.
4. Computed values (Health, Resolve...) are never stored; derived from `x-computed`/`computed` JSONLogic at render time.
5. No `eval`. Expressions are JSONLogic.
6. Packages export from `src/index.ts` (no build step; consumers import TS directly via workspace links).

## Publishing a feature
Every user-facing feature ships with a README screenshot in the same PR:
1. Add a named shot for it to `apps/web/screenshots/readme.spec.ts`, built from a demo campaign (add what the shot needs to the demos in `tools/seed-campaign` so it stays reproducible).
2. Run `pnpm screenshots` (or one shot with `-g "<name>"`) and look at the image before committing.
3. Add the image to the README's Screenshots section with a one-line caption, and update the "What it does" list.
4. `pnpm test` fails if the README points at a missing image or an image is unused.
Shots never show the rulebook's text or its purchase watermark; demos use original content.

## Commands
- `pnpm install`, `pnpm typecheck`, `pnpm test`, `pnpm dev` (web app), `pnpm table-lint`.
- `pnpm screenshots` rebuilds the web app and regenerates every README screenshot in `docs/screenshots/`.
