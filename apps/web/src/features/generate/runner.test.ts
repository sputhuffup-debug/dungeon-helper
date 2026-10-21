import { alienModule } from "@campaign-forge/module-alien";
import { exampleModule, examplePackSource } from "@campaign-forge/module-example";
import { dependentSteps, loadModule, loadPack, packFromSource, type GeneratedGraph } from "@campaign-forge/module-sdk";
import { describe, expect, it } from "vitest";
import { changedSteps, includedOptional, newSeed, runGenerator, stepViews, summarizeValue, UnknownProcedureError, type GeneratorRequest } from "./runner";

const alien = loadModule(alienModule, { skipProcedureRuns: true });
const example = loadModule(exampleModule, { skipProcedureRuns: true });

const job = (over: Partial<GeneratorRequest> = {}): GeneratorRequest => ({ procedureId: "alien.job.create", seed: "nostromo", inputs: { frame: "space-truckers", pcCount: 4 }, ...over });

/** Find a step seed that actually changes the step's result (a re-roll can land on the same row). */
function rerollUntilChanged(base: GeneratorRequest, step: string): { req: GeneratorRequest; graph: GeneratedGraph } {
  const before = runGenerator(alien, base);
  for (let i = 0; i < 50; i++) {
    const req = { ...base, stepSeeds: { ...(base.stepSeeds ?? {}), [step]: `reroll-${i}` } };
    const graph = runGenerator(alien, req);
    if (JSON.stringify(graph.results[step]) !== JSON.stringify(before.results[step])) return { req, graph };
  }
  throw new Error(`no seed changed ${step}`);
}

describe("runGenerator", () => {
  it("is deterministic: same seed and inputs give the same graph", () => {
    const a = runGenerator(alien, job());
    const b = runGenerator(alien, job());
    expect(b).toEqual(a);
    expect(a.procedure).toBe("alien.job.create");
    expect(a.produced.entities.map((e) => e.type)).toEqual(["alien.job", "alien.faction"]);
    const c = runGenerator(alien, job({ seed: "sulaco" }));
    expect(JSON.stringify(c.results)).not.toBe(JSON.stringify(a.results));
  });

  it("re-rolling one step changes only it and the steps that read it", () => {
    const base = job();
    const before = runGenerator(alien, base);
    const procedure = alien.procedure("alien.job.create")!;

    const { graph: afterEmployer } = rerollUntilChanged(base, "employer");
    const changedE = changedSteps(before, afterEmployer);
    expect([...changedE]).toEqual(["employer"]);

    const { graph: afterDifficulty } = rerollUntilChanged(base, "difficulty");
    const allowed = new Set(["difficulty", ...dependentSteps(procedure, "difficulty")]);
    expect(allowed).toEqual(new Set(["difficulty", "payment", "complications"]));
    const changedD = changedSteps(before, afterDifficulty);
    expect(changedD.has("difficulty")).toBe(true);
    expect(changedD.has("payment")).toBe(true);
    for (const id of changedD) expect(allowed.has(id)).toBe(true);
    for (const id of ["distance", "employer", "bonus", "mission", "destination", "destinationStar"]) {
      expect(afterDifficulty.results[id]).toEqual(before.results[id]);
    }
  });

  it("keeps pinned values and records optional steps", () => {
    const first = runGenerator(alien, job());
    const pinned = { employer: first.results.employer };
    const other = runGenerator(alien, job({ seed: "another", pinned, includeOptional: ["plotTwist"] }));
    expect(other.results.employer).toEqual(first.results.employer);
    expect(other.rolls.some((r) => r.step === "employer")).toBe(false);
    expect(other.results.plotTwist).toBeDefined();
    expect(first.skipped).toContainEqual({ step: "plotTwist", reason: "optional" });
    expect(includedOptional(alien.procedure("alien.job.create")!, other.results)).toEqual(["plotTwist"]);
  });

  it("builds step views with rolls, skips, pins and dependents", () => {
    const procedure = alien.procedure("alien.job.create")!;
    const graph = runGenerator(alien, job({ pinned: { bonus: { label: "Fixed" } } }));
    const views = stepViews(procedure, graph, { pinned: { bonus: { label: "Fixed" } }, stepSeeds: { mission: "x" } });
    expect(views.map((v) => v.id)).toEqual(procedure.steps.map((s) => s.id));
    const employer = views.find((v) => v.id === "employer")!;
    expect(employer.rolls.length).toBe(1);
    expect(employer.table).toBe("alien.jobs.truckers.employer");
    expect(employer.rolls[0]?.raw.length).toBeGreaterThan(0);
    expect(views.find((v) => v.id === "bonus")?.state).toBe("pinned");
    expect(views.find((v) => v.id === "mission")?.customSeed).toBe(true);
    expect(views.find((v) => v.id === "plotTwist")?.state).toBe("optional-off");
    expect(views.find((v) => v.id === "difficulty")?.dependents).toEqual(["payment", "complications"]);
    const complications = views.find((v) => v.id === "complications")!;
    expect(complications.repeat).toBe(true);
    expect(complications.rolls.every((r) => r.iteration !== undefined)).toBe(true);
  });

  it("runs the fixture module's procedure (core stays game-agnostic) and reports skipped steps", () => {
    const graph = runGenerator(example, { procedureId: "example.proc.expedition", seed: "s1", inputs: { days: 2 } });
    const views = stepViews(example.procedure("example.proc.expedition")!, graph);
    expect(views.map((v) => v.id)).toEqual(["terrain", "danger", "encounters", "omen"]);
    expect(views.find((v) => v.id === "omen")?.skipReason).toMatch(/Optional/);
    expect(() => runGenerator(example, { procedureId: "nope", seed: "s" })).toThrow(UnknownProcedureError);
  });

  it("carries a step's display line into its view; steps without one keep the generic rendering", async () => {
    const pack = loadPack(await packFromSource(examplePackSource), { skipProcedureRuns: true }).module!;
    const loaded = loadModule(pack, { skipProcedureRuns: true });
    const procedure = loaded.procedure("example-pack.proc.delve")!;
    const graph = runGenerator(loaded, { procedureId: procedure.id, seed: "s1", inputs: { depth: 1, lucky: false } });
    const views = stepViews(procedure, graph);
    const danger = views.find((v) => v.id === "danger")!;
    expect(danger.display).toBe(graph.display?.danger);
    expect(danger.display).toMatch(/^(Calm|Tense|Perilous|Deadly)/);
    expect(views.filter((v) => v.display !== undefined).map((v) => v.id)).toEqual(["danger"]);
    // the Alien generators declare none, so their steps render as before
    expect(stepViews(alien.procedure("alien.job.create")!, runGenerator(alien, job())).some((v) => v.display !== undefined)).toBe(false);
  });

  it("formats values compactly and makes fresh seeds", () => {
    expect(summarizeValue({ label: "Weyland-Yutani", detail: { name: "W-Y", factionType: "corporation" } })).toBe("Weyland-Yutani (detail: W-Y (factionType: corporation))");
    expect(summarizeValue([{ label: "A" }, { label: "B" }])).toBe("A; B");
    expect(summarizeValue(true)).toBe("yes");
    expect(summarizeValue("x".repeat(400)).length).toBe(220);
    const a = newSeed();
    expect(a).toMatch(/^[0-9a-z]{4,10}$/);
    expect(newSeed()).not.toBe(a);
  });
});
