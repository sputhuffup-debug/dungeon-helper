import { describe, expect, it } from "vitest";
import { adventureSnapshot, campaignSnapshot, plainText } from "@campaign-forge/core";
import { agendaDraftsProcedure, alienModule, buildCast } from "@campaign-forge/module-alien";
import { CAMPAIGN_INPUT_HINT, loadModule, runProcedure, type AgendaDraftSet, type CampaignInputHint } from "@campaign-forge/module-sdk";
import { buildCinematicDemo } from "../src/cinematic";

/** The agenda generator's inputs for the Cold Harbor demo, as the app fills them. */
function coldHarborInputs() {
  const demo = buildCinematicDemo();
  const mod = loadModule(alienModule, { skipProcedureRuns: true });
  const props = (agendaDraftsProcedure.inputs as { properties: Record<string, Record<string, unknown>> }).properties;
  const hint = props.campaign![CAMPAIGN_INPUT_HINT] as CampaignInputHint;
  const campaign = campaignSnapshot(demo.store, hint, (t) => mod.entityType(t)?.kind);
  const adventure = adventureSnapshot(demo.store, demo.ids.adventure, (id) => plainText(demo.registry.open(id)))!;
  const pcs = (adventure.cast.pcs ?? []).map((id) => ({ id, name: demo.store.get("entities", id)!.name, arc: "random" }));
  return { demo, inputs: { campaign, adventure, pcs, betrayal: "frayed" } };
}

describe("agenda drafts for Cold Harbor", () => {
  const { demo, inputs } = coldHarborInputs();
  const names = new Set(demo.store.list("entities").map((e) => e.name));

  it("reads the party, the story and the site from the demo", () => {
    const cast = buildCast(inputs);
    expect(cast.party.map((p) => p.name)).toEqual(["Rosa Ilunga", "Ana Kovac", "Teo Marsh", "Jun Akiyama"]);
    expect(cast.party.find((p) => p.name === "Teo Marsh")!.rivals).toHaveLength(1);
    expect(cast.pools.company).toBe("Weyland-Yutani");
    expect(cast.pools.items[0]!.name).toBe("the specimen");
    expect(cast.pools.npcs.map((n) => n.name)).toEqual(expect.arrayContaining(["Dr. Mara Lindqvist", "Elias Brandt", "Nell Okoro"]));
    expect(cast.pools.exits.map((p) => p.name)).toContain("Shuttle Bay");
    expect(cast.pools.leader.name).toBe("Rosa Ilunga");
    expect(cast.pools.hasCountdown).toBe(true);
  });

  it("drafts three acts for each of the four PCs, aimed at the demo's people and places, the same for the same seed", () => {
    const g = runProcedure(agendaDraftsProcedure, alienModule, { seed: "cold-harbor", inputs });
    const set = g.results.agendaDrafts as AgendaDraftSet;
    expect(set.characters.map((c) => c.name)).toEqual(["Rosa Ilunga", "Ana Kovac", "Teo Marsh", "Jun Akiyama"]);
    expect(set.characters.every((c) => c.inCampaign && c.acts.length === 3)).toBe(true);
    const targets = set.characters.flatMap((c) => c.acts.map((a) => a.slots.find((s) => s.label === "Target")!.text));
    expect(targets.some((t) => names.has(t))).toBe(true);
    expect(set.report?.pairs).toHaveLength(6);
    expect(runProcedure(agendaDraftsProcedure, alienModule, { seed: "cold-harbor", inputs })).toEqual(g);
  });
});
