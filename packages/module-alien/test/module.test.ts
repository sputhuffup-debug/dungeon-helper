import { describe, expect, it } from "vitest";
import { checkModule } from "@campaign-forge/module-sdk";
import alienModule, { alienModule as named, ALIEN_MODULE_ID, onEntityChange, onSessionEnd } from "../src";
import { DEAD_CONDITION, STABILISED_CONDITION, onClockAdvance } from "../src/hooks";

describe("alienModule", () => {
  it("exports the module as default and named with id 'alien'", () => {
    expect(named).toBe(alienModule);
    expect(ALIEN_MODULE_ID).toBe("alien");
    expect(alienModule.manifest.id).toBe("alien");
  });

  it("passes the sdk conformance suite with zero errors", () => {
    // Tables, procedures and data come from folders owned by other agents; when a folder is
    // still a placeholder the suite simply has less to check. See the report for the note.
    if (alienModule.tables.length === 0) console.warn("module.test: tables/ is empty (Agent B not landed yet)");
    if (alienModule.procedures.length === 0) console.warn("module.test: procedures/ is empty (Agent B not landed yet)");
    if (alienModule.presets.length === 0) console.warn("module.test: data/ is empty (Agent C not landed yet)");
    const report = checkModule(alienModule, { seeds: 50 });
    const errors = report.issues.filter((i) => i.severity === "error");
    expect(errors.map((e) => `${e.where}: ${e.message}`)).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("reports conformance warnings only for things outside this package's control", () => {
    const report = checkModule(alienModule, { skipProcedureRuns: true });
    const mine = report.issues.filter(
      (i) => i.severity === "warning" && (i.where.startsWith("rule:") || i.where.startsWith("tracker:") || i.where.startsWith("template:") || i.where.startsWith("entityType:") || i.where.startsWith("dice:")),
    );
    expect(mine.map((w) => `${w.where}: ${w.message}`)).toEqual([]);
  });
});

describe("hooks", () => {
  const pcs = [
    { id: "pc1", name: "Parker", fields: { isPC: true, stress: 3 } },
    { id: "pc2", name: "Ash", fields: { isPC: true, android: true } },
  ];

  it("leaves XP to the progression award checklist: no XP prompts at session end in campaign mode", () => {
    const prompts = onSessionEnd({ mode: "campaign", characters: pcs, trackerState: {} });
    expect(prompts).toEqual([]);
  });

  it("adds a trauma-check roll prompt for a character with a panic result of 9+", () => {
    const prompts = onSessionEnd({
      mode: "campaign",
      characters: pcs,
      trackerState: { "alien.stress": { panicLog: [{ entity: "pc1", total: 11, label: "Paranoid" }, { entity: "pc2", total: 12 }] } },
    });
    const rolls = prompts.filter((p) => p.kind === "roll");
    expect(rolls).toHaveLength(1); // the android is skipped
    expect(rolls[0]!.entity).toBe("pc1");
    expect(rolls[0]!.page).toBe(74);
    expect(rolls[0]!.roll?.operation).toBe("mentalTrauma");
  });

  // Walkthrough 3 (A14): a lethal critical injury's death roll each round was neither tracked nor prompted
  it("asks for a death roll each time a lethal injury's time limit passes, until stabilised or dead (p. 68, 71)", () => {
    const entity = (conditions: string[]) => ({ id: "pc1", name: "Desmond", type: "alien.character", fields: {}, conditions });
    const round = (conditions: string[], units = ["round"]) => onClockAdvance({ mode: "campaign", units, counters: { round: 4 }, entities: [entity(conditions)] });
    const [p] = round(["critical-injury:63", "critical-injury:12"]);
    expect(p).toMatchObject({ id: "alien.death-roll:pc1:63:round:4", kind: "choice", entity: "pc1", page: [68, 71] });
    expect(p!.text).toContain("Massive Hemorrhage is lethal");
    expect(p!.options?.map((o) => o.id)).toEqual(["survived", "stabilised", "dead"]);
    expect(p!.options?.find((o) => o.id === "dead")?.effects).toContainEqual({ kind: "addCondition", entity: "pc1", condition: { id: DEAD_CONDITION, label: "Dead", page: 71 } });
    // a stretch-long bleed waits for a stretch; a stabilised injury or a dead character asks nothing
    expect(round(["critical-injury:53"])).toEqual([]);
    expect(round(["critical-injury:53"], ["stretch"])).toHaveLength(1);
    expect(round(["critical-injury:63", `${STABILISED_CONDITION}63`])).toEqual([]);
    expect(round(["critical-injury:63", DEAD_CONDITION])).toEqual([]);
    // instantly fatal results and harmless ones ask nothing
    expect(round(["critical-injury:64", "critical-injury:13"])).toEqual([]);
  });

  it("leaves Story Points to the progression's end-of-act award in cinematic mode (p. 158)", () => {
    expect(onSessionEnd({ mode: "cinematic", characters: pcs, trackerState: {} })).toEqual([]);
  });

  it("lowers the trauma threshold to 1 for a character with Panic Attacks (p. 74)", () => {
    const chars = [{ id: "pc3", name: "Kane", fields: { isPC: true, mentalTraumas: [{ id: "panic-attacks", label: "Panic Attacks" }] } }, ...pcs];
    const prompts = onSessionEnd({
      mode: "campaign",
      characters: chars,
      trackerState: { "alien.stress": { panicLog: [{ entity: "pc3", total: 2 }, { entity: "pc1", total: 8 }] } },
    });
    expect(prompts.filter((p) => p.kind === "roll").map((p) => p.entity)).toEqual(["pc3"]);
  });

  it("clamps negative stress to zero on entity change", () => {
    const effects = onEntityChange({ mode: "campaign" }, { id: "pc1", type: "alien.character", fields: { stress: -2 } });
    expect(effects).toEqual([{ kind: "setField", entity: "pc1", path: "stress", value: 0 }]);
    expect(onEntityChange({ mode: "campaign" }, { id: "pc1", type: "alien.character", fields: { stress: 2 } })).toEqual([]);
    expect(onEntityChange({ mode: "campaign" }, { id: "x", type: "alien.creature", fields: { stress: -2 } })).toEqual([]);
  });
});
