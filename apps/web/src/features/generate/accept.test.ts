import "fake-indexeddb/auto";
import { relationshipsOf } from "@campaign-forge/core";
import { afterEach, describe, expect, it } from "vitest";
import { createCampaign } from "../../state/actions";
import { openCampaign, type CampaignContextValue } from "../../state/CampaignProvider";
import { acceptGenerated, applyGeneratorEffects } from "../../state/prepActions";
import { initialInputs } from "./prefill";
import { effectsOf } from "./ResultsPanel";
import { chainOptions, requestFromRun, runGenerator } from "./runner";

const opened: Array<() => void> = [];
afterEach(() => {
  while (opened.length) opened.pop()?.();
});

async function open(): Promise<CampaignContextValue> {
  const id = await createCampaign({ name: "Jobs", moduleId: "alien", mode: "campaign" });
  const ctx = await openCampaign(id);
  opened.push(ctx.close);
  return ctx;
}

describe("accepting generator output", () => {
  it("creates the job and employer with provenance, a run record and the employer link", async () => {
    const ctx = await open();
    const graph = runGenerator(ctx.module, { procedureId: "alien.job.create", seed: "s-1", inputs: { frame: "space-truckers", pcCount: 3 }, stepSeeds: { bonus: "again" } });
    const res = acceptGenerated(ctx, { graph, stepSeeds: { bonus: "again" }, pinned: {}, names: { job: "Haul ore to Hadley" } });

    expect(res.entities).toHaveLength(2);
    const [jobEntity, employer] = res.entities;
    expect(jobEntity?.type).toBe("alien.job");
    expect(jobEntity?.name).toBe("Haul ore to Hadley");
    expect(jobEntity?.fields.status).toBe("offered");
    expect(jobEntity?.provenance?.generatorRun).toBe(res.run.id);
    expect(jobEntity?.provenance?.editedFields).toEqual(["name"]);
    expect(employer?.type).toBe("alien.faction");
    expect(employer?.provenance?.generatorRun).toBe(res.run.id);

    const run = ctx.store.get("generatorRuns", res.run.id)!;
    expect(run.procedure).toBe("alien.job.create");
    expect(run.seed).toBe("s-1");
    expect(run.stepSeeds).toEqual({ bonus: "again" });
    expect(run.pinned).toBeUndefined();
    expect(run.produced).toEqual([jobEntity?.id, employer?.id]);
    expect(run.rolls.length).toBeGreaterThan(3);
    expect(run.editedFields).toEqual([{ entity: jobEntity?.id, path: "name" }]);

    const rels = relationshipsOf(ctx.store, jobEntity!.id, ctx.module);
    expect(rels.some((r) => r.rel.type === "employer_of" && r.rel.from === employer?.id)).toBe(true);

    // the run reproduces from its record
    const again = runGenerator(ctx.module, requestFromRun(ctx.module.procedure("alien.job.create")!, run));
    expect(again.results).toEqual(graph.results);
  });

  it("chains the job into the system generator and nests the result within the job", async () => {
    const ctx = await open();
    const graph = runGenerator(ctx.module, { procedureId: "alien.job.create", seed: "chain", inputs: { frame: "space-truckers", pcCount: 4 } });
    const job = acceptGenerated(ctx, { graph });
    const options = chainOptions(ctx.module, ctx.module.procedure("alien.job.create")!, job.run);
    expect(options).toHaveLength(1);
    expect(options[0]?.procedure).toBe("alien.system.create");
    expect(options[0]?.inputs.name).toBe(job.entities[0]?.fields.destination);

    const sysGraph = runGenerator(ctx.module, { procedureId: "alien.system.create", seed: "sys", inputs: options[0]!.inputs });
    const sys = acceptGenerated(ctx, { graph: sysGraph, within: job.entities[0]!.id });
    const system = sys.entities[0]!;
    const within = ctx.store.list("relationships").filter((r) => r.type === "within" && r.from === system.id);
    expect(within.map((r) => r.to)).toEqual([job.entities[0]!.id]);
    // bodies sit within the system, not the job
    for (const body of sys.entities.slice(1)) {
      expect(ctx.store.list("relationships").find((r) => r.type === "within" && r.from === body.id)?.to).toBe(system.id);
    }
    // only bodies that exist offer a world chain
    const worldChains = chainOptions(ctx.module, ctx.module.procedure("alien.system.create")!, sys.run);
    expect(worldChains).toHaveLength(sys.entities.length - 1);
    expect(worldChains.every((c) => c.procedure === "alien.world.create")).toBe(true);
  });

  it("pre-fills inputs from the campaign and applies shore-leave effects", async () => {
    const ctx = await open();
    ctx.store.updateMeta({ settings: { frame: "colonial-marines" } });
    const hicks = ctx.store.createEntity({ type: "alien.character", name: "Hicks", fields: { isPC: true, career: "colonial-marine", stress: 4, xp: 0 } });
    const vasquez = ctx.store.createEntity({ type: "alien.character", name: "Vasquez", fields: { isPC: true, career: "colonial-marine", stress: 2, xp: 1 } });
    ctx.store.createEntity({ type: "alien.character", name: "Burke", fields: { isPC: false } });

    const jobInputs = initialInputs(ctx.module.procedure("alien.job.create"), ctx.store, ctx.module);
    expect(jobInputs).toEqual({ frame: "colonial-marines", pcCount: 2 });

    const shore = ctx.module.procedure("alien.shore-leave")!;
    const inputs = initialInputs(shore, ctx.store, ctx.module);
    const chars = inputs.characters as Array<Record<string, unknown>>;
    expect(chars.map((c) => c.name)).toEqual(["Hicks", "Vasquez"]);
    expect(chars.every((c) => c.isMarine === true)).toBe(true);
    chars[0]!.choice = "recover";
    chars[1]!.choice = "pursue-agenda";

    const graph = runGenerator(ctx.module, { procedureId: "alien.shore-leave", seed: "leave", inputs });
    const res = acceptGenerated(ctx, { graph });
    expect(res.entities).toEqual([]);
    expect(ctx.store.get("generatorRuns", res.run.id)?.produced).toEqual([]);

    const effects = effectsOf(res.run.results).filter((e) => e.kind !== "prompt");
    const applied = applyGeneratorEffects(ctx, effects);
    expect(applied.skipped).toEqual([]);
    expect(ctx.store.get("entities", hicks.id)?.fields.stress).toBe(0);
    expect(ctx.store.get("entities", vasquez.id)?.fields.xp).toBe(2);
  });
});
