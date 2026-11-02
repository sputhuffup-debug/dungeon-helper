import { describe, expect, it } from "vitest";
import type { LongAgendaDef, LongAgendaDraftSet } from "@campaign-forge/module-sdk";
import {
  LONG_AGENDA_FRICTION_PURPOSE,
  LONG_AGENDA_PURPOSE,
  applyLongAgendaWrites,
  longAgendaHandoutsOf,
  longAgendaMarkdown,
  longAgendaOverwrites,
  longAgendaProgress,
  longAgendaWrites,
  projectCampaignForViewer,
  setLongAgendaTension,
} from "../src";
import { PERSON, fixtureModule, newStore } from "./fixtures";

/** A made-up game's long agendas: a quest per hero, a step per outing, and who they bicker with. */
const DEF: LongAgendaDef = {
  field: "quest",
  summaryField: "plan",
  progressInput: "progress",
  outcomes: [
    { id: "on", label: "Moved on" },
    { id: "stuck", label: "Stuck" },
  ],
  paths: { title: "name", summary: "line", beat: "step.text", beatJob: "step.outing", tension: "heat", history: "steps", friction: "bicker" },
  details: [{ label: "For", path: "patron" }],
  tension: { levels: [{ id: "cool", label: "Cool" }, { id: "warm", label: "Warm", text: "Words at dinner." }] },
  handouts: { agenda: "{name}'s quest", friction: "{name} bickers", frictionIntro: "Everyone knows:" },
};

function setFor(ids: string[]): LongAgendaDraftSet {
  return {
    stage: "deal",
    job: "Outing 1",
    friction: [],
    characters: ids.map((id, i) => ({
      id,
      name: `Hero ${i + 1}`,
      inCampaign: true,
      title: "Find the bell",
      summary: "Find the old bell before winter.",
      slots: [],
      beat: { text: "Ask the miller about it.", slots: [] },
      record: {
        name: "Find the bell",
        line: "Find the old bell before winter.",
        step: { text: "Ask the miller about it.", outing: "Outing 1" },
        heat: 0,
        steps: [{ job: "Outing 0", text: "Look in the barn.", outcome: "stuck" }],
        patron: "the abbess",
        bicker: [{ text: `You and Hero ${i === 0 ? 2 : 1} argue about the map.` }],
      },
    })),
  };
}

describe("long-term agendas (game-agnostic)", () => {
  it("writes the record and the summary field, and keeps a GM-only agenda handout and a players' friction handout per character", () => {
    const store = newStore();
    const a = store.createEntity({ type: PERSON.id, name: "Hero 1", fields: { plan: "" }, visibility: { level: "players" } });
    const b = store.createEntity({ type: PERSON.id, name: "Hero 2", fields: { plan: "" }, visibility: { level: "players" } });
    const writes = longAgendaWrites(DEF, setFor([a.id, b.id]), { [a.id]: { summary: "Find the bell, and ring it.", beat: "Ask the abbess instead." } });
    expect(longAgendaOverwrites(store, DEF, writes)).toEqual([]);
    const res = applyLongAgendaWrites(store, DEF, writes);
    expect(res.written).toEqual([a.id, b.id]);
    const ea = store.get("entities", a.id)!;
    expect(ea.fields.plan).toBe("Find the bell, and ring it.");
    expect((ea.fields.quest as Record<string, unknown>).line).toBe("Find the bell, and ring it.");
    expect((ea.fields.quest as { step: { text: string } }).step.text).toBe("Ask the abbess instead.");

    const h = longAgendaHandoutsOf(store, a.id);
    expect(h.agenda).toMatchObject({ kind: "agenda", character: a.id, purpose: LONG_AGENDA_PURPOSE, visibility: { level: "gm" }, title: "Hero 1's quest" });
    expect(h.friction).toMatchObject({ kind: "text", character: a.id, purpose: LONG_AGENDA_FRICTION_PURPOSE, visibility: { level: "players" }, title: "Hero 1 bickers" });
    const agendaDoc = res.docs.find((d) => d.docId === h.agenda!.bodyDoc)!.markdown;
    expect(agendaDoc).toContain("**Find the bell**: Find the bell, and ring it.");
    expect(agendaDoc).toContain("**Beat for Outing 1:** Ask the abbess instead.");
    expect(agendaDoc).toContain("**Tension:** Cool");
    expect(agendaDoc).toContain("**For:** the abbess");
    expect(agendaDoc).toContain("- Outing 0: Look in the barn. (stuck)");
    expect(res.docs.find((d) => d.docId === h.friction!.bodyDoc)!.markdown).toBe("Everyone knows:\n\n- You and Hero 2 argue about the map.");

    // accepting again updates the same two handouts
    applyLongAgendaWrites(store, DEF, longAgendaWrites(DEF, setFor([a.id, b.id])));
    expect(store.list("handouts").filter((x) => x.character === a.id)).toHaveLength(2);

    // the players see the friction handouts and nothing of the goals
    const view = projectCampaignForViewer(store.toJSON(), fixtureModule, { role: "player" });
    const seen = Object.values(view.handouts);
    expect(seen.map((x) => x.purpose).sort()).toEqual([LONG_AGENDA_FRICTION_PURPOSE, LONG_AGENDA_FRICTION_PURPOSE]);
    for (const e of Object.values(view.entities)) expect(e.fields.plan).toBeUndefined();
  });

  it("asks before replacing a summary the GM wrote, but not one the last accept wrote", () => {
    const store = newStore();
    const a = store.createEntity({ type: PERSON.id, name: "Hero 1", fields: { plan: "Retire to the coast." } });
    const writes = longAgendaWrites(DEF, setFor([a.id]));
    expect(longAgendaOverwrites(store, DEF, writes)).toEqual([{ characterId: a.id, name: "Hero 1", current: "Retire to the coast.", next: "Find the old bell before winter." }]);
    applyLongAgendaWrites(store, DEF, writes);
    expect(longAgendaOverwrites(store, DEF, longAgendaWrites(DEF, setFor([a.id]), { [a.id]: { summary: "Something new." } }))).toEqual([]);
  });

  it("passes stored records and marked outcomes to the next run, and the GM can set the tension within the ladder", () => {
    const store = newStore();
    const a = store.createEntity({ type: PERSON.id, name: "Hero 1", fields: {} });
    const b = store.createEntity({ type: PERSON.id, name: "Hero 2", fields: {} });
    applyLongAgendaWrites(store, DEF, longAgendaWrites(DEF, setFor([a.id])));
    const progress = longAgendaProgress(DEF, [store.get("entities", a.id)!, store.get("entities", b.id)!], { [a.id]: "stuck", [b.id]: "bogus" });
    expect(progress[0]).toMatchObject({ id: a.id, outcome: "stuck", record: { name: "Find the bell" } });
    expect(progress[1]).toEqual({ id: b.id, name: "Hero 2" });

    const doc = setLongAgendaTension(store, DEF, a.id, 9)!;
    expect((store.get("entities", a.id)!.fields.quest as { heat: number }).heat).toBe(1);
    expect(doc.markdown).toContain("**Tension:** Warm. Words at dinner.");
    expect(longAgendaMarkdown(DEF, store.get("entities", a.id)!.fields.quest as Record<string, unknown>)).toBe(doc.markdown);
    setLongAgendaTension(store, DEF, a.id, -3);
    expect((store.get("entities", a.id)!.fields.quest as { heat: number }).heat).toBe(0);
  });
});
