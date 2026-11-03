# Adventure sources ("Run this job")

[Writing a game module](README.md)

A campaign record can carry most of an adventure already: a job has its offer, its secrets, its people, its site and its map. An **adventure source** lets the GM run such a record as an adventure in one click instead of retyping it into an empty template. A TypeScript module declares `adventureSources` (packs cannot: the prefill is code). The app then:

- shows the source's button (e.g. *Run this job*) on the record's page, beside an accepted offer on a board, and as a picker under the template in *Adventures → New*;
- makes an adventure from the source's template, fills it with what `prefill` returns, links the two both ways (`Adventure.source`, and the button on the record turns into *Open the adventure*), and plans the scenes `plan` names into the session being played, else the next planned one, else a new one. Running the same record again opens the same adventure;
- before filling, makes the record's site when one of the module's map generators reads a brief from it (`briefFromEntity` with a `site`), so a scene set there shows the site map as soon as one is generated (saving a map from the record's brief also puts it on the adventure's scenes at the site);
- at the end of a session, adds a wrap-up step (*Close the job*) for every record the session ran (its adventure had a scene planned or run) and every record still `open`: the outcomes, the record's payout if the ledger has one (with an undo), the adventure marked done, and a link to the module's between-jobs procedure with the record picked. Finishing the session lands there when a record was closed;
- skips the scenes of an adventure that is done, or whose record is no longer `open`, when table mode picks a scene by itself;
- in table mode, shows a *This job* section (GM only) when the scene's adventure was made from the record, or the scene is set at a place linked to it: the arc clues seeded with the record or its people (*Mark found*, *Reveal* on the player screen) and what `people` says about each of them. The record's page shows the same notes under its people.

## The definition

```ts
import type { AdventureSourceDef } from "@campaign-forge/module-sdk";

export const runJob: AdventureSourceDef = {
  id: "alien.run-job",
  entityType: "alien.job",
  template: "alien.template.job-card", // an adventure template of the module
  label: "Run this job",
  noun: "job", // "Close the job", "Fill it from a job"
  mode: ["campaign"],
  when: { "==": [{ var: "fields.status" }, "accepted"] }, // JSONLogic over { fields }: when it can be run
  open: { "==": [{ var: "fields.status" }, "accepted"] }, // still waiting for an outcome after play
  outcomes: [
    { id: "done", label: "Done", set: { path: "status", value: "done" }, closes: true, tone: "success" },
    { id: "failed", label: "Failed", set: { path: "status", value: "failed" }, closes: true, tone: "danger" },
    { id: "carried", label: "Carried over" },
  ],
  prefill: (input) => ({ title: input.entity.name /* … */ }),
};
```

An outcome with `set` writes that field on the record; `closes` marks the adventure done with it (the GM can untick that).

## What `prefill` reads and returns

The core hands `prefill` an `AdventureSourceInput` (pure: same campaign, same input):

- `entity`: the record (`id`, `name`, `type`, `fields`, `summary`, `visibility`) and `gmFields`, the field paths the players may not see;
- `links`: every record linked to it, with the relationship, its direction (`"in"`: that record → this one), the note and the other record's kind and visibility;
- `maps`: saved site maps whose location is the record or a linked record (`generated` when it has a layout);
- `clues`: campaign arc clues seeded with the record, with their thread, text, state and slot.

It returns an `AdventureSourceFill`: `title`, `premise`, `playerIntro` (players may read it), `gmSituation`, `epilogue` (Markdown), `scenes` by template scene key, and `plan`, the scene keys to plan into the next session. A scene fill sets `title`, `body` (GM notes), `readAloud`, `location`, `map`, `participants` and extra `events` (a clue to find, say). Ids must come from the input; unknown ones are dropped. A scene's key is its `TemplateScene.id`, else `"<act number>.<scene number>"`; give the template's scenes ids.

Only `title`, `playerIntro` and a scene's `title` and `readAloud` can reach the players (the player screen, shares and packets). Keep complications, intents, betrayals and secrets in `gmSituation` and scene bodies, and keep `gmFields` out of the player text.

## The record's people (`people`)

`people(input)` (optional, pure) returns one `AdventureSourcePerson` per person worth a note at the table: the record id (`entity`, one of the input's links), a `role` (the link's note, e.g. "Contact"), labelled `notes` (`{ label: "Agenda", text }`, `{ label: "Secret", text }`) and a `stance` (`{ label: "Turns on the crew", tone: "danger" }`). The app shows them only to the GM: under *This job* in table mode and under the record's people on its page; nothing here reaches the player screen, shares or packets.

## Template guidance is never content

In a template's text a paragraph wrapped in underscores, `_like this_`, is **guidance**: the app keeps it beside the record (`guide`) and shows it as placeholder text on the empty field, for the GM only. It is never written into the adventure, so an empty template scene shows the GM what to write and shows the players nothing. Other paragraphs are content and are written as they are. A placeholder title such as `<Scenario title>` is guidance too.

- `TemplateScene.title` is the scene's title, which the players see on the player screen: short, no notes. Without it the title is a few words of `purpose`, with any bracketed aside dropped. `purpose` stays GM-facing.
- Name things in words. `module-check` refuses template text that names a raw entity type id ("link the alien.job entity"): write "Link the job".
- The core keeps template guidance out of shares even in adventures made before this rule (`isTemplateGuidance`, `playerSceneTitle`).

## Checks

`checkModule` (and so `pnpm module-check`) runs `adventureSourceIssues`: unique ids, a declared entity type and mode, an adventure template of the module, valid `when` and `open`, unique outcome ids, and a dry run of `prefill` on an empty input that must not throw, must be deterministic and must name only scenes the template has, and of `people` (a list, deterministic). Test your prefill on real records too: the Alien module's `test/runJob.test.ts` deals job boards and checks that nothing GM-only reaches what the players read.
