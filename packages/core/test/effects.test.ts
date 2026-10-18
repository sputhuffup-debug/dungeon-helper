import { describe, expect, it } from "vitest";
import { appendTrackerLog, applyEffects, archiveTrackerState, getTrackerState, updateTrackerState } from "../src";
import { newStore } from "./fixtures";

describe("applyEffects", () => {
  it("sets, increments with clamping, manages conditions, logs and returns prompts", () => {
    const store = newStore();
    const pc = store.createEntity({ type: "example.person", name: "Ripley", fields: { stats: { grit: 3 } } });
    const session = store.createSession();
    const result = applyEffects(
      store,
      [
        { kind: "setField", entity: pc.id, path: "stats.wit", value: 2 },
        { kind: "incrementField", entity: pc.id, path: "stats.grit", by: 5, max: 6 },
        { kind: "incrementField", entity: pc.id, path: "stats.grit", by: -10, min: 0 },
        { kind: "incrementField", entity: pc.id, path: "counters.panic", by: 1 },
        { kind: "addCondition", entity: pc.id, condition: { id: "shaken", label: "Shaken" } },
        { kind: "addCondition", entity: pc.id, condition: { id: "shaken", label: "Shaken again" } },
        { kind: "addCondition", entity: pc.id, condition: { id: "hurt", label: "Hurt" } },
        { kind: "removeCondition", entity: pc.id, conditionId: "shaken" },
        { kind: "log", text: "Something happened" },
        { kind: "prompt", prompt: { id: "p", text: "Roll?", kind: "yesno" } },
        { kind: "setField", entity: "missing", path: "x", value: 1 },
      ],
      { sessionId: session.id },
    );
    const after = store.get("entities", pc.id)!;
    expect(after.fields).toEqual({ stats: { grit: 0, wit: 2 }, counters: { panic: 1 } });
    expect(after.conditions?.map((c) => c.id)).toEqual(["hurt"]);
    expect(after.conditions?.[0]?.since).toBeTruthy();
    expect(result.prompts).toEqual([{ id: "p", text: "Roll?", kind: "yesno" }]);
    expect(result.applied).toHaveLength(9);
    expect(result.applied.every((a) => a.session === session.id)).toBe(true);
    expect(result.skipped).toEqual([{ effect: { kind: "setField", entity: "missing", path: "x", value: 1 }, reason: "entities/missing not found" }]);
    const log = getTrackerState(store, session.id).log;
    expect(log).toHaveLength(9);
    expect(log.find((l) => l.tracker === "log")?.text).toBe("Something happened");
    expect(log[1]?.text).toBe("Ripley: stats.grit +5");
  });

  it("applies without a session and clamps to max when increasing", () => {
    const store = newStore();
    const pc = store.createEntity({ type: "example.person", name: "R", fields: { stress: 9 } });
    const r = applyEffects(store, [{ kind: "incrementField", entity: pc.id, path: "stress", by: 3, min: 0, max: 10 }]);
    expect(store.get("entities", pc.id)?.fields["stress"]).toBe(10);
    expect(r.applied[0]?.session).toBeUndefined();
    expect(store.count("trackerState")).toBe(0);
  });
});

describe("trackers", () => {
  it("creates state on demand, merges patches, logs and archives", () => {
    const store = newStore();
    const session = store.createSession();
    const ts = getTrackerState(store, session.id);
    expect(getTrackerState(store, session.id).id).toBe(ts.id);
    updateTrackerState(store, session.id, "clock", { segments: 6, filled: 1 });
    updateTrackerState(store, session.id, "clock", { filled: 2 });
    updateTrackerState(store, session.id, "initiative", ["a", "b"]);
    expect(getTrackerState(store, session.id).state).toEqual({ clock: { segments: 6, filled: 2 }, initiative: ["a", "b"] });
    appendTrackerLog(store, session.id, { tracker: "clock", text: "tick", data: { filled: 2 } });
    expect(getTrackerState(store, session.id).log).toMatchObject([{ tracker: "clock", text: "tick", data: { filled: 2 } }]);
    const archived = archiveTrackerState(store, session.id);
    expect(archived?.archived).toBe(true);
    const fresh = getTrackerState(store, session.id);
    expect(fresh.id).not.toBe(ts.id);
    expect(fresh.state).toEqual({});
    expect(() => getTrackerState(store, "nope")).toThrow();
    store.remove("sessions", session.id);
    expect(store.count("trackerState")).toBe(0);
  });
});
