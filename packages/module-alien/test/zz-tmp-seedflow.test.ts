import { it, expect } from "vitest";
import { runProcedure, createTableRegistry, type ProcedureContext, type GeneratedGraph, validateEntityFields } from "@campaign-forge/module-sdk";
import { procedures } from "../src/procedures/index";
import { tables } from "../src/tables/index";
import { entityTypes } from "../src/entities/index";
const mod = { tables, manifest: { id: "alien", version: "x" } as never };
const reg = createTableRegistry(tables);
const ctxOf = (g: GeneratedGraph): ProcedureContext => ({ inputs: g.inputs, results: g.results, rolls: g.rolls, tables: reg, get: (id: string) => g.results[id] as never, data: () => ({ ...g.inputs, ...g.results }) });
it("seed flow", () => {
  for (let i = 0; i < 40; i++) {
    const job = procedures.find((p) => p.id === "alien.job.create")!;
    const jg = runProcedure(job, mod, { seed: `s${i}/job`, inputs: { frame: ["space-truckers","colonial-marines","frontier-colonists"][i%3], pcCount: 4 }, includeOptional: ["plotTwist"] });
    const sys = procedures.find((p) => p.id === "alien.system.create")!;
    const { name: _n, ...si } = job.chains![0]!.inputs!(ctxOf(jg));
    const sg = runProcedure(sys, mod, { seed: `s${i}/system`, inputs: si });
    const wc = sys.chains!.find((c) => c.procedure === "alien.world.create")!;
    const wi = Object.fromEntries(Object.entries(wc.inputs!(ctxOf(sg))).filter(([, v]) => v !== undefined));
    const world = procedures.find((p) => p.id === "alien.world.create")!;
    const wg = runProcedure(world, mod, { seed: `s${i}/world`, inputs: wi });
    const main = runProcedure(world, mod, { seed: `s${i}/main`, inputs: {}, includeOptional: ["hook"] });
    for (const g of [jg, sg, wg, main]) for (const e of g.produced.entities) {
      const def = entityTypes.find((t) => t.id === e.type)!;
      const res = validateEntityFields(def, e.fields);
      expect(res.errors, `${e.type} ${JSON.stringify(e.fields)}`).toEqual([]);
    }
    if (i < 3) console.log(JSON.stringify(jg.produced.entities[0]!.fields), "\n", JSON.stringify(sg.produced.entities[0]!.fields.bodies), "\n", JSON.stringify(wg.produced.entities[0]), "\n", JSON.stringify(main.produced.entities.slice(0,2)));
  }
});
