## What changed

## Checks
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm table-lint`
- [ ] `pnpm --filter @campaign-forge/web build` and `pnpm --filter @campaign-forge/web test:e2e`
- [ ] Rulebook data checked against the book, paraphrased, with page refs (no book prose, no watermark)

## Publish (user-facing features)
- [ ] Screenshot shot added to `apps/web/screenshots/readme.spec.ts` and regenerated with `pnpm screenshots`
- [ ] Image, caption and feature line on the right page: `docs/features/app.md` for app features, the module's `docs/features/<module>.md` for module features (README only for headline features)
- [ ] Demo campaign updated so the feature is visible in a demo
