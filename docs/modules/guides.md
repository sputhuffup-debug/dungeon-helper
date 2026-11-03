# The GM's guide

A module (or data pack) can ship a step-by-step guide for the GM: a walkthrough from a new campaign to its first session, in the module's own words. The app shows it on the **Guide** page (reachable from a campaign's Home, the setup checklist and, for built-in modules, the campaign list), and `pnpm guides` writes the same text to a docs page, so there is one source for both.

The Alien module's guide is the example: [Your first Alien campaign](../guides/alien-first-campaign.md), from `packages/module-alien/src/firstCampaign.ts`.

## The shape

`GameModule.guide` (`GuideDef` in `packages/module-sdk/src/types.ts`; `guide` in a pack's main file):

```json
{
  "guide": {
    "id": "my-pack.first-campaign",
    "title": "Your first campaign",
    "summary": "From a new campaign to the end of session 1.",
    "mode": ["campaign"],
    "chapters": [
      {
        "id": "crew",
        "title": "Make the crew",
        "intro": "A character for each player.",
        "steps": [
          {
            "id": "pc",
            "title": "Make a character",
            "body": ["Click *+ Character*, name them and click *Create character*."],
            "image": { "key": "pc", "alt": "The New character page" },
            "links": [{ "label": "New character", "newEntity": { "type": "my-pack.character", "pc": true } }],
            "page": 12
          }
        ]
      }
    ]
  }
}
```

- `id` starts with the module id. Chapter, step and image ids are lowercase slugs, unique in the guide.
- `body` is a few short paragraphs of plain text. `*Label*` marks a button or label exactly as the app shows it; the Guide page shows it in bold and the docs page keeps it as Markdown emphasis.
- `mode` lists the play modes the guide is written for; in a campaign of another mode the page says so.
- `links` are the step's "Take me there" buttons, the same shape as a setup step's links: exactly one of `page` (with `params`), `procedure`, `newEntity` or `entity` (a JSONLogic rule over one entity of the setup snapshot; the link stays hidden until something matches, e.g. "Open the job" before a job is taken). See [Setting up a campaign](setup.md).
- `image.key` names the step's screenshot: `docs/screenshots/guide-<module id>-<key>.png`. Images are optional; a missing file is left out of the page.
- `page` and `cite` cite the source as everywhere else.

`module-check` (the conformance suite) checks all of it: namespaced and unique ids, a body on every step, alt text, links with one target the module has, declared modes, and `*` marks in pairs.

## Screenshots and the docs page

For a built-in module, the screenshots come from a script that does the steps in the app: add a test to `apps/web/screenshots/readme.spec.ts` that starts from a blank campaign and drives the UI step by step, saving `guide-<module id>-<step>.png` cropped to the panel each step is about (the Alien one is `guide-alien`). Use fixed names and seeds so the images stay the same between runs, and navigate in the app rather than reloading.

The app builds the images in (`apps/web/src/features/guide/guideImages.ts` finds every `guide-*.png`) and the service worker precaches them, so the Guide page reads offline, text and images.

`pnpm guides` writes `docs/guides/<guide id with dashes>.md` for every built-in module with a guide (`tools/guides`). Its test fails while a committed page differs from what the module's data would write, and `tools/docs-check` checks the page's images and links like the feature pages'. Link the page from the module's feature page (or the README).
