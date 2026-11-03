# Session recaps ("Previously on…")

Every campaign gets a recap at the start of a session, whatever its game: core builds it from what the campaign already records. A TypeScript module can add its own lines (jobs, clues, contacts, a ship's state) through `recap` contributors. Data packs get the core recap; contributors are code.

There is no AI layer: every line is a templated sentence filled from data. Same campaign state, same recap.

## What core builds

`buildSessionRecap` (packages/core/src/recap.ts) covers the sessions before the target that were played (status `running` or `done`):

| Span | Covers |
|---|---|
| `{ kind: "last" }` (default) | the last played session |
| `{ kind: "last-n", n }` | the last `n` |
| `{ kind: "all" }` | every one: the story so far |

It writes two recaps, apart:

- **The GM's** (`recap.gm`): each covered session with its summary and a line or two of its log, timeline entries of those sessions, scenes run, what was revealed, who and where the crew met (the cast and place of the scenes run, whole-entity reveals, whoever a clue was found with), rewards, who played, the wrap-up's answers, loose ends (the wrap-up's `looseEnds` and the target session's plan), and **What the players don't know** (section id `secrets`): clues placed in a job or with an NPC that the crew has not found, and contacts who betrayed the crew.
- **The players' read-aloud** (`recap.players`): which sessions it covers, timeline entries they may see, handouts and fields revealed to them, who and where they met. Built from the player projection only (see below).

Then each contributor of the module adds sections for each audience. Sections with the same `id` merge, so a module can add lines to a core section such as `secrets`. Sections sort by `order`; the core ones use 10 to 100 (`RECAP_SECTION_ORDER` in the sdk), a module section without one sits at 45.

## A contributor

```ts
import type { RecapContributor } from "@campaign-forge/module-sdk";

export const shipRecap: RecapContributor = {
  id: "moon.recap",
  build: (s) => {
    const lines = s.travel.map((t) => ({ key: "moon.trip", ref: t.id, text: `The crew reached ${t.toName}.` }));
    return lines.length ? [{ id: "moon.trips", title: "Trips", audience: s.audience, order: 55, lines }] : [];
  },
};

export const moonModule: GameModule = { /* … */ recap: { contributors: [shipRecap] } };
```

`build` is called twice, once with the GM's snapshot and once with the players'. Return sections for the snapshot's `audience`; sections for the other audience are dropped. Keep it pure: no clock, no randomness.

Each line has a `key` and, when it is about one record, a `ref` (the record's id). Together they identify the line in its section: when the GM regenerates, a line with the same key and ref keeps its on/off switch and, if the GM rewrote it, the GM's text. Use the same key for the same kind of line every time. `links` name records the app turns into links: `label` is the text in the line to link (usually the record's name).

### The snapshot

`RecapSnapshot` carries the target session, the sessions covered, `since` (records changed at or after it count as new; absent for the story so far), entities (with kind, PC flag, contact, conditions), relationships, reveals in the covered sessions, thread clues, clock movements, payoffs waiting, faction heat (with its value at the previous recap), ledger entries since and the balance, travel legs, and live hunts.

**The players' snapshot is the player projection.** Core copies it field by field from `projectCampaignForViewer` with the group viewer, like crew notes, shares and packets: entities and fields the players may not see are not in it; clues are only found ones the whole crew learnt, under the thread's player title, in their player text; there are no clock movements, payoffs, heat or settings; contacts carry only since, favours and where to find them; hunts carry only threats revealed on the players' map. A contributor cannot leak what it is not given, so write the players' lines from the snapshot as it is and do not reach for anything else. Core also drops any link in a players' line to a record the players cannot see.

### Conformance

`module-check` (`checkModule`) dry-runs every contributor on an empty snapshot of each audience: it must not throw, must return well-formed sections (an id, a title, an audience, lines with a key and text), must be deterministic, and given a players' snapshot must return players' sections only. Contributor ids must be unique and their `mode` declared.

## Stored on the session

The recap is stored on the session (`Session.recap`) as a draft the GM edits: lines switched off (`off`), rewritten (`edited`) or added (`custom`). Regenerating rebuilds every line from the data and keeps those choices; a rewritten line whose source is gone stays as one of the GM's lines. It travels in bundles with the session.

The session record is GM-only and never reaches a player projection. Players get the read-aloud only through `playerRecap`: the players' sections, switched-off lines left out, and only once the GM has shown it on the player screen (`recap.shown`) or picked it for a share or a packet.
