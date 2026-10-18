import { describe, expect, it } from "vitest";
import {
  advanceLifecycles,
  createRng,
  createTableRegistry,
  durationMinutes,
  forceAdvance,
  lifecycleConfig,
  lifecycleConfigIssues,
  startLifecycle,
  type Effect,
  type LifecycleStage,
} from "@campaign-forge/module-sdk";
import { alienModule } from "../src";
import { IMPLANTED_CONDITION, inseminationCheck } from "../src/dice/operations";
import { EMERGED_FROM, gestationConfig, LIFECYCLE_CONDITIONS } from "../src/lifecycle";
import { relationshipTypes } from "../src/relationships";
import { tables } from "../src/tables";
import { CLOCK_TRACKER, GESTATION_TRACKER, trackers } from "../src/trackers";

const tracker = trackers.find((t) => t.id === GESTATION_TRACKER)!;
const config = lifecycleConfig(tracker.config);
const stage = (variant: string, id: string): LifecycleStage => config.variants.find((v) => v.id === variant)!.stages.find((s) => s.id === id)!;
const SHIFT = 450;
const STRETCH = 7.5;

describe("alien.gestation tracker", () => {
  it("is a campaign-scoped lifecycle tracker whose config references existing presets, operations and relationships", () => {
    expect(tracker).toMatchObject({ kind: "lifecycle", scope: "campaign", page: [212, 219] });
    expect(lifecycleConfigIssues(config, alienModule)).toEqual([]);
    expect(relationshipTypes.some((r) => r.id === EMERGED_FROM)).toBe(true);
    expect(config.variants.map((v) => v.id)).toEqual(["standard", "bambi", "praetomorph", "queen", "ovomorphing"]);
  });

  it("uses the clock tracker's minutes per round, stretch and shift", () => {
    const clockUnits = (trackers.find((t) => t.id === CLOCK_TRACKER)!.config!.units as Array<{ id: string; minutes: number }>).map((u) => [u.id, u.minutes]);
    for (const [id, minutes] of clockUnits) expect(config.units.find((u) => u.id === id)?.minutes, String(id)).toBe(minutes);
  });

  it("maps each stage with a creature to a preset of the same XX121 stage", () => {
    const presets = new Map(alienModule.presets.map((p) => [p.id, p]));
    const seen = new Set<string>();
    for (const v of config.variants) {
      for (const s of v.stages) {
        if (!s.creaturePreset) continue;
        const p = presets.get(s.creaturePreset);
        expect(p, s.creaturePreset).toBeDefined();
        expect(p!.fields.species).toBe("xx121");
        expect(`Stage ${String(p!.fields.stage)}`, `${v.id}/${s.id}`).toBe(s.label);
        seen.add(s.creaturePreset);
      }
    }
    expect([...seen].sort()).toEqual(
      ["chestburster", "bambi-burster", "imp", "queen-burster", "drone", "scout", "stalker", "soldier", "worker", "sentry", "ovomorph"].map((x) => `alien.creature.xx121-${x}`).sort(),
    );
  });

  it("has the book's timings (p. 212-216) and flags the module's own choices", () => {
    // Ovomorphing: 24-36 hours, four to six shifts (p. 212)
    expect(stage("ovomorphing", "cocooned").duration).toEqual({ amount: [4, 6], unit: "shift" });
    const egg = durationMinutes(config, stage("ovomorphing", "cocooned").duration!, createRng("egg"));
    expect(egg).toBeGreaterThanOrEqual(4 * SHIFT);
    expect(egg).toBeLessThanOrEqual(6 * SHIFT);
    for (const v of ["standard", "bambi", "praetomorph", "queen"]) {
      // facehugger drops off within one shift; insemination check every stretch (p. 214)
      expect(stage(v, "facehugged").duration).toEqual({ amount: 1, unit: "shift" });
      expect(stage(v, "facehugged").check).toMatchObject({ operation: "inseminationCheck", every: { amount: 1, unit: "stretch" }, stopCondition: IMPLANTED_CONDITION });
      expect(stage(v, "facehugged").removal?.blockedByCondition).toBe(IMPLANTED_CONDITION);
    }
    // a shift later the chestburster is born; within one shift it is Stage IV (p. 214, 216)
    expect(stage("standard", "gestating").duration).toEqual({ amount: 1, unit: "shift" });
    expect(stage("praetomorph", "gestating").duration).toEqual({ amount: 1, unit: "shift" });
    expect(stage("standard", "chestburster").duration).toEqual({ amount: 1, unit: "shift" });
    expect(stage("bambi", "bambi-burster").duration).toEqual({ amount: 1, unit: "shift" });
    // Stage IV waits for the GM (a Queen's pheromones, p. 217-219)
    expect(stage("standard", "drone").duration).toBeUndefined();
    expect(stage("standard", "drone").next?.map((n) => n.to)).toEqual(["soldier", "worker"]);
    expect(stage("standard", "scout").next?.map((n) => n.to)).toEqual(["sentry"]);
    expect(stage("praetomorph", "stalker").next).toBeUndefined();
    // stages the book leaves without a number are module decisions
    for (const [v, s] of [["bambi", "gestating"], ["praetomorph", "imp"], ["queen", "gestating"], ["standard", "chestburster"], ["bambi", "bambi-burster"]] as const) {
      expect(stage(v, s).unverified, `${v}/${s}`).toBe(true);
      expect(stage(v, s).note, `${v}/${s}`).toMatch(/book (does not say|says .* gives no)/);
    }
    expect(stage("queen", "gestating").duration).toEqual({ amount: 3, unit: "day" });
    expect(stage("praetomorph", "imp").duration).toEqual({ amount: 0.5, unit: "shift" });
    expect(stage("bambi", "gestating").duration).toEqual({ amount: 0.5, unit: "shift" });
  });

  it("runs the standard cycle: facehug, insemination checks, birth with witnesses, Stage IV, molt to Soldier", () => {
    const registry = createTableRegistry(tables);
    const conditions = new Set<string>();
    const checkEffects: Effect[] = [];
    let n = 0;
    const ctx = {
      newId: () => "xeno-1",
      hasCondition: (_e: string, c: string) => conditions.has(c),
      runCheck: () => {
        const r = inseminationCheck.run({ entity: "kane", conditions: [...conditions] }, createRng(`check-${n++}`), registry);
        for (const e of r.effects ?? []) if (e.kind === "addCondition") conditions.add(e.condition.id);
        checkEffects.push(...(r.effects ?? []));
      },
      witnesses: [{ id: "ripley", name: "Ripley" }],
    };
    let r = startLifecycle(config, { instances: [] }, { id: "inf-1", variant: "standard", host: "kane", hostName: "Kane", seed: "s" }, { at: 0 });
    expect(r.effects).toContainEqual({ kind: "addCondition", entity: "kane", condition: { id: LIFECYCLE_CONDITIONS.facehugged, label: "Facehugged: unconscious, cannot be woken", source: "alien.gestation", page: 214 } });
    r = advanceLifecycles(config, r.state, SHIFT, { ...ctx, at: SHIFT });
    expect(r.state.instances[0]!.stage).toBe("gestating");
    expect(conditions.has(IMPLANTED_CONDITION)).toBe(true);
    expect(checkEffects.filter((e) => e.kind === "log").length).toBeGreaterThan(0);
    r = advanceLifecycles(config, r.state, SHIFT, { ...ctx, at: 2 * SHIFT });
    const inst = r.state.instances[0]!;
    expect(inst).toMatchObject({ stage: "chestburster", creature: "xeno-1" });
    expect(r.effects).toContainEqual({ kind: "createFromPreset", preset: "alien.creature.xx121-chestburster", id: "xeno-1", name: "Xenomorph from Kane", link: { type: "emerged_from", to: "kane" } });
    expect(r.effects.some((e) => e.kind === "addCondition" && e.condition.id === LIFECYCLE_CONDITIONS.killedByChestburster)).toBe(true);
    expect(r.effects.find((e) => e.kind === "prompt")).toMatchObject({ prompt: { kind: "roll", entity: "ripley", roll: { operation: "panicRoll" }, page: 216 } });
    r = advanceLifecycles(config, r.state, SHIFT, { ...ctx, at: 3 * SHIFT });
    expect(r.state.instances[0]!.stage).toBe("drone");
    expect(r.effects).toContainEqual({ kind: "applyPreset", entity: "xeno-1", preset: "alien.creature.xx121-drone" });
    r = advanceLifecycles(config, r.state, 10 * SHIFT, { ...ctx, at: 13 * SHIFT });
    expect(r.state.instances[0]!.stage).toBe("drone");
    r = forceAdvance(config, r.state, "inf-1", "soldier", { at: 13 * SHIFT });
    expect(r.effects).toContainEqual({ kind: "applyPreset", entity: "xeno-1", preset: "alien.creature.xx121-soldier" });
  });
});

describe("insemination check (p. 214)", () => {
  const registry = createTableRegistry(tables);
  it("rolls one stress die; the facehugger symbol (1) implants the host; deterministic per seed", () => {
    const run = (seed: string) => inseminationCheck.run({ entity: "kane", conditions: [] }, createRng(seed), registry);
    expect(run("a")).toEqual(run("a"));
    const outcomes = Array.from({ length: 60 }, (_, i) => run(`s${i}`));
    for (const o of outcomes) {
      const die = o.rolls[0]!.raw[0]!;
      expect(die).toBeGreaterThanOrEqual(1);
      expect(die).toBeLessThanOrEqual(6);
      const implanted = (o.result as { implanted: boolean }).implanted;
      expect(implanted).toBe(die === 1);
      expect(o.effects!.some((e) => e.kind === "addCondition" && e.condition.id === IMPLANTED_CONDITION)).toBe(implanted);
    }
    expect(outcomes.some((o) => (o.result as { implanted: boolean }).implanted)).toBe(true);
    expect(outcomes.some((o) => !(o.result as { implanted: boolean }).implanted)).toBe(true);
  });

  it("does not roll for a host already implanted", () => {
    const r = inseminationCheck.run({ entity: "kane", conditions: [IMPLANTED_CONDITION] }, createRng("x"), registry);
    expect(r.rolls).toEqual([]);
    expect(r.result).toEqual({ implanted: true, rolled: false });
  });
});

describe("gestation config export", () => {
  it("is the tracker's config", () => {
    expect(tracker.config).toBe(gestationConfig);
  });
});
