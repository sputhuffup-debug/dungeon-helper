import { describe, expect, it } from "vitest";
import { checkModule } from "../src/module";
import { CONTRACT_VERSION, type GameModule, type PlayGuideDef } from "../src/types";

function moduleWith(playGuides: PlayGuideDef[]): GameModule {
  return {
    manifest: {
      id: "pg",
      version: "1.0.0",
      name: "PG",
      ruleset: "PG",
      licenseNotice: "none",
      requiredCore: CONTRACT_VERSION,
      modes: [{ id: "a", name: "A" }],
      defaultMode: "a",
      dataStatus: "verified",
    },
    dice: {
      dice: [{ id: "d6", name: "d6", faces: 6 }],
      buildPool: () => ({ dice: { d6: 1 } }),
      roll: (pool, rng) => ({ pool, dice: [{ die: "d6", value: rng.int(1, 6) }], successes: 0, symbols: {}, pushes: 0, canPush: false }),
      describe: () => "",
    },
    entityTypes: [],
    relationshipTypes: [],
    referenceLists: [],
    presets: [],
    tables: [],
    procedures: [],
    templates: [],
    rules: [],
    trackers: [],
    calendar: { id: "pg.cal", name: "Cal", defaultYear: 1, months: [{ name: "M", days: 30 }] },
    playGuides,
  };
}

function guide(): PlayGuideDef {
  return {
    id: "pg.guide",
    title: "Guide",
    tips: [{ text: "Roll when it matters.", page: 3 }],
    groups: [{ id: "body", label: "Body", page: 2 }],
    entries: [
      { id: "body", label: "Body", group: "body", kind: "attribute", roll: "attr:body", callFor: ["a door is stuck"], page: 2 },
      { id: "climb", label: "Climb", group: "body", kind: "skill", roll: "climb", callFor: ["a wall"], mode: ["a"] },
    ],
  };
}

const errors = (m: GameModule) =>
  checkModule(m, { skipProcedureRuns: true })
    .issues.filter((i) => i.severity === "error")
    .map((i) => `${i.where}: ${i.message}`);

describe("checkModule: play guides", () => {
  it("accepts a valid guide, and modules without one", () => {
    expect(errors(moduleWith([guide()]))).toEqual([]);
    const none = moduleWith([]);
    delete none.playGuides;
    expect(errors(none)).toEqual([]);
  });

  it("rejects entries that reference an unknown group", () => {
    const g = guide();
    g.entries[1]!.group = "mind";
    expect(errors(moduleWith([g]))).toContain('playGuide:pg.guide:entry:climb: references unknown group "mind"');
  });

  it("rejects duplicate guide, group and entry ids", () => {
    const g = guide();
    g.groups.push({ id: "body", label: "Again" });
    g.entries.push({ ...g.entries[0]! });
    const found = errors(moduleWith([g, guide()]));
    expect(found).toContain('playGuide:pg.guide: duplicate play guide id "pg.guide"');
    expect(found).toContain('playGuide:pg.guide:group:body: duplicate play guide group id "body"');
    expect(found).toContain('playGuide:pg.guide:entry:body: duplicate play guide entry id "body"');
  });

  it("rejects bad pages, kinds and undeclared modes", () => {
    const g = guide();
    g.tips = [{ text: "x", page: 0 }];
    g.entries[0]!.page = [5, 2];
    (g.entries[1] as { kind: string }).kind = "talent";
    g.entries[1]!.mode = ["z"];
    const found = errors(moduleWith([g]));
    expect(found).toContain("playGuide:pg.guide: tip 0 has an invalid page reference");
    expect(found).toContain("playGuide:pg.guide:entry:body: invalid page reference");
    expect(found).toContain('playGuide:pg.guide:entry:climb: kind must be "attribute" or "skill", not "talent"');
    expect(found).toContain('playGuide:pg.guide:entry:climb: references undeclared mode "z"');
  });

  it("warns about an entry with no cues", () => {
    const g = guide();
    g.entries[0]!.callFor = [];
    const warnings = checkModule(moduleWith([g]), { skipProcedureRuns: true }).issues.filter((i) => i.severity === "warning");
    expect(warnings.map((w) => w.message)).toContain("entry has no callFor cues");
  });
});
