# Campaign Forge

A Game Master's workspace for tabletop RPG campaigns. Every game system is a plugin ("module"); v1 ships the Alien RPG Evolved Edition module. See `docs/architecture-seed.md` for the founding design document.

## v1 decisions (confirmed with the owner, Oct 2026)
- GM-only, local-first PWA. No server, no accounts, no player sync in v1. Data model keeps visibility and member shapes so sync can come later.
- Alien rulebook data: structure is exact (dice ranges, page refs, step graphs); rows and stat lines come from general knowledge and are flagged `unverified: true` until checked against the book.
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

## Commands
- `pnpm install`, `pnpm typecheck`, `pnpm test`, `pnpm dev` (web app), `pnpm table-lint`.
