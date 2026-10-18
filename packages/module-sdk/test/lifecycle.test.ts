import { describe, expect, it } from "vitest";
import {
  advanceLifecycles,
  bindPlaceholders,
  checkModule,
  dismissLifecycle,
  durationMinutes,
  forceAdvance,
  formatLifecycleDuration,
  formatLifecycleMinutes,
  lifecycleConfig,
  lifecycleConfigIssues,
  lifecycleState,
  removalBlocked,
  removeLifecycle,
  setLifecyclePace,
  setLifecyclePaused,
  startLifecycle,
  type LifecycleConfig,
  type LifecycleInstance,
  type LifecycleState,
} from "../src";
import { createRng } from "../src/rng";
import { CONTRACT_VERSION, type Effect, type GameModule } from "../src/types";

const config: LifecycleConfig = lifecycleConfig({
  units: [
    { id: "hour", name: "Hour", minutes: 60 },
    { id: "day", name: "Day", minutes: 1440 },
  ],
  paces: [
    { id: "slower", label: "Slower", factor: 0.5 },
    { id: "normal", label: "Normal", factor: 1 },
    { id: "faster", label: "Faster", factor: 2 },
  ],
  defaultPace: "normal",
  defaultVariant: "curse",
  spawn: { name: "{host}'s shade", link: { type: "knows" }, keep: ["notes"] },
  labels: { instance: "Curse" },
  variants: [
    {
      id: "curse",
      name: "Curse",
      sourcePresets: ["p.witch"],
      stages: [
        {
          id: "marked",
          name: "Marked",
          duration: { amount: 1, unit: "day" },
          next: [{ to: "fading" }],
          check: { label: "Omen", operation: "omen", every: { amount: 6, unit: "hour" }, stopCondition: "doomed" },
          removal: { label: "Lift the curse", blockedByCondition: "doomed", effects: [{ kind: "log", text: "{host} is free." }] },
        },
        { id: "fading", name: "Fading", duration: { amount: 1, unit: "day" }, next: [{ to: "shade" }] },
        {
          id: "shade",
          name: "Shade",
          creaturePreset: "p.shade",
          duration: { amount: 12, unit: "hour" },
          next: [{ to: "wraith" }, { to: "ghoul" }],
          onEnter: [{ kind: "addCondition", entity: "$host", condition: { id: "gone", label: "Gone ({stage})" } }],
          witnessPrompt: { text: "{witness} sees {host} fade.", operation: "omen" },
        },
        { id: "wraith", name: "Wraith", creaturePreset: "p.wraith", next: [{ to: "lord", condition: "When the GM says" }] },
        { id: "ghoul", name: "Ghoul", creaturePreset: "p.ghoul" },
        { id: "lord", name: "Lord", creaturePreset: "p.lord" },
      ],
    },
    { id: "slow", name: "Slow", stages: [{ id: "waiting", name: "Waiting", duration: { amount: [2, 4], unit: "day" }, next: [{ to: "done" }] }, { id: "done", name: "Done" }] },
  ],
});

const start = (state: LifecycleState = { instances: [] }, at = 0, variant = "curse") =>
  startLifecycle(config, state, { id: "i1", variant, host: "h1", hostName: "Ana", seed: "seed-1" }, { at, newId: () => "spawn-1" });

const only = (s: LifecycleState): LifecycleInstance => s.instances[0]!;

describe("lifecycle durations and formatting", () => {
  it("converts units, rolls ranges in whole units and formats", () => {
    expect(durationMinutes(config, { amount: 1, unit: "day" })).toBe(1440);
    expect(durationMinutes(config, { amount: [2, 4], unit: "day" })).toBe(3 * 1440);
    const rolled = durationMinutes(config, { amount: [2, 4], unit: "day" }, createRng("x"));
    expect([2880, 4320, 5760]).toContain(rolled);
    expect(formatLifecycleDuration(config, { amount: [2, 4], unit: "day" })).toBe("2–4 Days");
    expect(formatLifecycleDuration(config, { amount: 1, unit: "day" })).toBe("1 Day");
    expect(formatLifecycleMinutes(config, 90)).toBe("1.5 Hours");
    expect(() => durationMinutes(config, { amount: 1, unit: "week" })).toThrow(/unknown time unit/);
  });

  it("binds $placeholders and {text}", () => {
    expect(bindPlaceholders({ entity: "$host", text: "{host} at {stage}", keep: "$unknown" }, { host: "h1" }, { host: "Ana" })).toEqual({ entity: "h1", text: "Ana at {stage}", keep: "$unknown" });
  });
});

describe("lifecycle runner", () => {
  it("starts at the first stage with a log", () => {
    const r = start();
    expect(only(r.state)).toMatchObject({ id: "i1", stage: "marked", progress: 0, duration: 1440, pace: "normal", paused: false, started: 0, history: [{ stage: "marked", at: 0 }] });
    expect(r.effects).toEqual([
      { kind: "log", text: "Curse started: Ana, Curse." },
      { kind: "log", text: "Curse (Ana): Marked." },
    ]);
  });

  it("keeps a check due when it could not roll, and runs it on a later advance", () => {
    const state = start().state;
    let canRoll = false;
    let rolled = 0;
    const runCheck = () => {
      if (!canRoll) return false;
      rolled++;
      return true;
    };
    // 7 hours: the 6-hour check is due but cannot roll yet
    let r = advanceLifecycles(config, state, 420, { at: 420, runCheck });
    expect(rolled).toBe(0);
    expect(only(r.state).checksDone).toBe(0);
    // next advance can roll: the missed check runs then
    canRoll = true;
    r = advanceLifecycles(config, r.state, 60, { at: 480, runCheck });
    expect(rolled).toBe(1);
    expect(only(r.state).checksDone).toBe(1);
  });

  it("advances with time, runs due checks until the stop condition, carries the excess over and spawns", () => {
    let state = start().state;
    const doomed = new Set<string>();
    const checks: number[] = [];
    // The callback sees the checks completed before this one.
    const runCheck = (inst: LifecycleInstance) => {
      checks.push(inst.checksDone + 1);
      if (inst.checksDone + 1 === 2) doomed.add(inst.host);
    };
    const hasCondition = (e: string, c: string) => c === "doomed" && doomed.has(e);
    // 5 hours: no check due yet
    let r = advanceLifecycles(config, state, 300, { at: 300, runCheck, hasCondition });
    expect(checks).toEqual([]);
    expect(only(r.state).progress).toBe(300);
    // to 20 hours: checks at 6 and 12 hours; the second dooms the host so the 18-hour one is skipped
    r = advanceLifecycles(config, r.state, 900, { at: 1200, runCheck, hasCondition });
    expect(checks).toEqual([1, 2]);
    expect(removalBlocked(config, only(r.state), hasCondition)).toBe(true);
    // one more day and a half: marked ends at 24h, fading ends at 48h, shade starts with 8 hours in
    r = advanceLifecycles(config, r.state, 2160, { at: 3360, runCheck, hasCondition, newId: () => "spawn-1", witnesses: [{ id: "h1", name: "Ana" }, { id: "w1", name: "Bo" }] });
    state = r.state;
    expect(only(state)).toMatchObject({ stage: "shade", progress: 480, duration: 720, creature: "spawn-1" });
    expect(only(state).history).toEqual([
      { stage: "marked", at: 0 },
      { stage: "fading", at: 1440 },
      { stage: "shade", at: 2880 },
    ]);
    const kinds = r.effects.map((e) => e.kind);
    expect(kinds).toEqual(["log", "log", "createFromPreset", "addCondition", "prompt"]);
    expect(r.effects[2]).toEqual({ kind: "createFromPreset", preset: "p.shade", id: "spawn-1", name: "Ana's shade", link: { type: "knows", to: "h1" } });
    expect(r.effects[3]).toEqual({ kind: "addCondition", entity: "h1", condition: { id: "gone", label: "Gone (Shade)" } });
    const prompt = r.effects[4] as Extract<Effect, { kind: "prompt" }>;
    expect(prompt.prompt).toMatchObject({ kind: "roll", entity: "w1", text: "Bo sees Ana fade.", roll: { operation: "omen" } });

    // the timed shade stage moves to its default next stage (wraith), which then waits for the GM
    r = advanceLifecycles(config, state, 5000, { at: 8360 });
    expect(only(r.state)).toMatchObject({ stage: "wraith", creature: "spawn-1", progress: 5000 - 240 });
    expect(only(r.state).duration).toBeUndefined();
    expect(r.effects).toContainEqual({ kind: "applyPreset", entity: "spawn-1", preset: "p.wraith", keep: ["notes"] });
    // waiting: more time only adds to the time in stage
    r = advanceLifecycles(config, r.state, 1000, { at: 9360 });
    expect(only(r.state).stage).toBe("wraith");
    expect(r.effects).toEqual([]);
    // the GM moves it on
    r = forceAdvance(config, r.state, "i1", "lord", { at: 9360 });
    expect(only(r.state)).toMatchObject({ stage: "lord", progress: 0 });
    expect(only(r.state).history.at(-1)).toEqual({ stage: "lord", at: 9360, forced: true });
    expect(r.effects).toContainEqual({ kind: "applyPreset", entity: "spawn-1", preset: "p.lord", keep: ["notes"] });
    expect(() => forceAdvance(config, r.state, "i1", undefined, { at: 9360 })).toThrow(/cannot move/);
  });

  it("pauses, changes pace, forces a chosen branch and removes", () => {
    let state = start().state;
    state = setLifecyclePaused(config, state, "i1", true).state;
    expect(advanceLifecycles(config, state, 5000, { at: 5000 }).state).toEqual(state);
    state = setLifecyclePaused(config, state, "i1", false).state;
    const paced = setLifecyclePace(config, state, "i1", "faster");
    expect(paced.effects).toEqual([{ kind: "log", text: "Curse (Ana): pace Faster." }]);
    // 12 hours at double pace finish the one-day stage
    const r = advanceLifecycles(config, paced.state, 720, { at: 720 });
    expect(only(r.state).stage).toBe("fading");
    expect(only(r.state).history.at(-1)).toEqual({ stage: "fading", at: 720 });
    const slow = advanceLifecycles(config, setLifecyclePace(config, state, "i1", "slower").state, 1440, { at: 1440 });
    expect(only(slow.state)).toMatchObject({ stage: "marked", progress: 720 });

    // force from fading to shade, then pick the second branch
    let f = forceAdvance(config, r.state, "i1", undefined, { at: 800, newId: () => "c9" });
    expect(only(f.state)).toMatchObject({ stage: "shade", creature: "c9" });
    f = forceAdvance(config, f.state, "i1", "ghoul", { at: 800 });
    expect(only(f.state).stage).toBe("ghoul");

    // removal before the stop condition ends it with the stage's effects
    const removed = removeLifecycle(config, state, "i1", { at: 50, hasCondition: () => false });
    expect(only(removed.state).ended).toEqual({ reason: "Lift the curse", at: 50 });
    expect(removed.effects).toEqual([
      { kind: "log", text: "Curse (Ana): Lift the curse." },
      { kind: "log", text: "Ana is free." },
    ]);
    expect(advanceLifecycles(config, removed.state, 10000, { at: 10050 }).state).toEqual(removed.state);
    expect(() => removeLifecycle(config, state, "i1", { at: 50, hasCondition: () => true })).toThrow(/blocked/);
    expect(dismissLifecycle(removed.state, "i1").instances).toEqual([]);
  });

  it("is deterministic: same seed and advances give the same state", () => {
    const run = () => {
      let s = startLifecycle(config, { instances: [] }, { id: "a", variant: "slow", host: "h", hostName: "H", seed: "s-42" }, { at: 0 }).state;
      const out: number[] = [only(s).duration!];
      for (let i = 0; i < 10; i++) {
        s = advanceLifecycles(config, s, 720, { at: (i + 1) * 720 }).state;
        out.push(only(s).progress);
      }
      return { out, state: s };
    };
    expect(run()).toEqual(run());
    expect([2880, 4320, 5760]).toContain(run().out[0]);
  });

  it("reads loose state and config defaults", () => {
    expect(lifecycleState(undefined)).toEqual({ instances: [] });
    const s = lifecycleState({ instances: [{ id: "x", variant: "curse", host: "h", stage: "marked", ended: { reason: "r", at: 3 } }, "junk"] });
    expect(s.instances[0]).toMatchObject({ id: "x", hostName: "h", progress: 0, pace: "normal", paused: false, ended: { reason: "r", at: 3 }, seed: "x" });
    const c = lifecycleConfig(undefined);
    expect(c.paces.map((p) => p.id)).toEqual(["slower", "normal", "faster"]);
    expect(c.defaultPace).toBe("normal");
  });
});

describe("lifecycle conformance", () => {
  const module = (cfg: LifecycleConfig): GameModule => ({
    manifest: { id: "m", version: "1.0.0", name: "M", ruleset: "M", licenseNotice: "none", requiredCore: CONTRACT_VERSION, modes: [{ id: "a", name: "A" }], defaultMode: "a", dataStatus: "verified" },
    dice: { dice: [{ id: "d6", name: "d6", faces: 6 }], buildPool: () => ({ dice: { d6: 1 } }), roll: (pool) => ({ pool, dice: [], successes: 0, symbols: {}, pushes: 0, canPush: false }), describe: () => "", operations: { omen: { id: "omen", name: "Omen", input: {}, run: () => ({ rolls: [], result: null, label: "" }) } } },
    entityTypes: [{ id: "m.person", kind: "character", name: "P", plural: "Ps", schema: { type: "object" }, sheet: { sections: [] } }],
    relationshipTypes: [],
    referenceLists: [],
    presets: ["p.witch", "p.shade", "p.wraith", "p.ghoul", "p.lord"].map((id) => ({ id, entityType: "m.person", name: id, fields: {} })),
    tables: [],
    procedures: [],
    templates: [],
    rules: [],
    trackers: [{ id: "m.curse", name: "Curse", kind: "lifecycle", scope: "campaign", config: cfg as unknown as Record<string, unknown> }],
    calendar: { id: "c", name: "C", defaultYear: 1, months: [{ name: "M", days: 30 }] },
  });

  it("accepts a sound config and reports broken references", () => {
    expect(checkModule(module(config)).issues.filter((i) => i.severity === "error")).toEqual([]);
    const broken: LifecycleConfig = {
      ...config,
      spawn: { name: "x", link: { type: "nope" } },
      variants: [{ id: "curse", name: "C", sourcePresets: ["p.none"], stages: [{ id: "a", name: "A", creaturePreset: "p.none", duration: { amount: 1, unit: "week" }, next: [{ to: "zz" }], check: { label: "c", operation: "none", every: { amount: 1, unit: "hour" } } }] }],
    };
    const m = module(broken);
    expect(lifecycleConfigIssues(broken, m)).toEqual([
      'spawn link uses unknown relationship type "nope"',
      'variant curse: unknown source preset "p.none"',
      'variant curse, stage a: unknown time unit "week"',
      'variant curse, stage a: unknown preset "p.none"',
      'variant curse, stage a: next stage "zz" does not exist',
      'variant curse, stage a: unknown check operation "none"',
    ]);
    expect(checkModule(m).ok).toBe(false);
  });
});
