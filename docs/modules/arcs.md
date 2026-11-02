# Campaign arcs

A module can give long campaigns an **arc board**: threads (a faction's scheme told across several jobs), clues the boards seed into jobs, clocks that tick between jobs, faction heat, crew notes for the players and a contacts network. The engine is generic (`packages/core/src/arcs.ts`); the module supplies the words, the thread generator and the numbers. The Alien module's declaration is `packages/module-alien/src/arcs.ts`, its generator `procedures/campaign-thread.ts` and its board integration `procedures/job-board-arcs.ts`.

Arcs need code: a thread generator is a procedure, so declare them in a [TypeScript module](typescript-modules.md). They are not in the data pack format.

## Declaring arcs

`GameModule.arcs` is an `ArcsDef` (`packages/module-sdk/src/types.ts`):

| Field | What it is |
|---|---|
| `label` | Nav and page title (default "Arcs"). The Arcs page shows in the campaign nav only for modules (and play modes, `mode`) that declare arcs. |
| `generator` | The procedure that deals threads. It must deal offers (`Procedure.offers`); each offer carries its thread as `Offer.arc` (an `ArcDraft`). |
| `boards` | Procedures that read the arcs (an `x-arcs` input) and seed clues, such as a job board. Their input form offers the clue to seed and the influence toggle. |
| `betweenJobs` | The procedure the GM runs between jobs: its page shows the thread clock ticker. |
| `clueKinds` | Clue kinds with labels, e.g. fact, object, person, place. |
| `slots` | Where a board can place a clue (labels for the arc board and the job page). |
| `heat` | Faction heat: the entity types that carry it, the field path (keep it GM-only with `defaultVisibility`), one label per level from 0 (the number of labels sets the maximum), and the wrap-up question. |
| `tick` | Thread clocks between jobs: the dice each active thread rolls, the segments a total gives (the step with the highest `min` reached), and extra segments for an ignored thread (no clue found since its clock last moved). |
| `payoffs` | Payoff kinds a reached milestone can suggest (a posting from the sponsor, a returning grudge, a specific threat, a complication). |
| `contacts` | Entity types an NPC contact can be. |
| `crewNotes` | The players' view's title (default "Crew notes"). |

`checkModule` verifies the procedures exist, the generator deals offers, the heat field is in the faction schema, the tick dice parse and the ids are unique.

## Drafting a thread

An offer's `arc` is an `ArcDraft`: a GM title and a separate player-facing title, the sponsor (an offer tempId when the offer creates the faction, else an existing entity id), the goal, method, weakness and cost of ignoring it, the stages in order (each with clues: kind, the GM's text, the crew notes text, what it unlocks) and the clock (segments, milestones with the stage they open and their payoff suggestions). Accepting the offer creates its entities (a new sponsor) and the thread, GM-only, at the end of the board.

Write player text that gives nothing away: the crew notes only ever show a thread's player title (once one of its clues is found) and the found clues' player text. Never put the sponsor's name, the goal or the method in them; the Alien tests scan for it.

Every part of a thread should be a `ctx.part` of its offer, so the GM re-rolls or pins the sponsor, the scheme, a stage or the clock on its own. Keep it seeded: the same seed and inputs deal the same threads.

## Boards that read the arcs

Give the board an input whose schema carries `"x-arcs": {}`. The app fills it with an `ArcSnapshot`: every thread with its clues (and their states), clock and unused payoffs, faction heat above zero, the crew's contacts (stance, favours, grudges, the clues they know), and the GM's choices: `seedClue` (`"none"`, `"auto"`, or `"<thread id>/<clue id>"`) and `influence` (default on). The snapshot is stored with the run, so the run replays the same.

What the board does with it is the module's call. Record it on each offer:

- `Offer.arcLinks`: a clue the offer's material carries (thread, clue, slot, the text as placed, the NPC tempId or contact id it rides on), an NPC that works for a thread (`agent`), a payoff it used, a contact it brought back. Accepting the offer seeds the clue with its job, posting, run and slot, ties the agent, marks the payoff used and records where the contact was last seen.
- `Offer.influences`: one short GM-only line per thing that weighted the offer. The app shows them on the card as "Influenced by".

Keep every decision a seeded part of its offer. A board with no threads, heat or contacts, or with the influence off and no clue to seed, should deal exactly what it dealt before arcs; the Alien job board tests this against a hash recorded before arcs existed.

## What the core does

- Threads live in the campaign's `arcs` map: always GM-only, carried in bundles (ids remapped on "import as new"), absent from every player projection.
- Clues move unseen, seeded, found. The GM marks them found from the job page, the NPC, the arc board or the session wrap-up; a found clue records the session and the job, and can be marked as learnt by one player only (it then reaches that player's notes and packet alone).
- `planArcTicks` rolls every active thread from `<seed>/<column>`; nothing moves until applied. Reaching a milestone lists its payoffs, which boards then deal.
- Heat lives on the faction (the declared field); contacts on the NPC (`Entity.contact`). The player projection of a contact keeps where to find them and the favours only.
- `crewNotes(maps, module, viewer)` is the only view of the arcs the players get: copied from the player projection and the found clues, for the whole crew or one player. The player screen shows it, and the group share and player packets offer it as a section.
