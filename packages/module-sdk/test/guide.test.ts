/**
 * The GM's guide hook (`GameModule.guide`): numbering, the `*Label*` marks,
 * file names, the conformance checks, and a data pack declaring one.
 * Generic: nothing here names a real game.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { guideDocFile, guideFitsMode, guideImageFile, guideIssues, guideSteps, guideText } from "../src/guide";
import { checkModule } from "../src/module";
import { loadPack, validatePack } from "../src/pack";
import { CONTRACT_VERSION, type GameModule, type GuideDef } from "../src/types";

function moduleWith(extra: Partial<GameModule> = {}): GameModule {
  return {
    manifest: {
      id: "gd",
      version: "1.0.0",
      name: "GD",
      ruleset: "GD",
      licenseNotice: "none",
      requiredCore: CONTRACT_VERSION,
      modes: [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
      defaultMode: "a",
      dataStatus: "verified",
    },
    dice: { dice: [{ id: "d6", name: "d6", faces: 6 }], buildPool: () => ({ dice: { d6: 1 } }), roll: (pool) => ({ pool, dice: [], successes: 0, symbols: {}, pushes: 0, canPush: false }), describe: () => "" },
    entityTypes: [{ id: "gd.cart", kind: "vehicle", name: "Cart", plural: "Carts", schema: { type: "object", properties: {} }, sheet: { sections: [] } }],
    relationshipTypes: [],
    referenceLists: [],
    presets: [],
    tables: [],
    procedures: [],
    templates: [],
    rules: [],
    trackers: [],
    calendar: { id: "gd.cal", name: "Cal", defaultYear: 1, months: [{ name: "M", days: 30 }] },
    ...extra,
  };
}

const GUIDE: GuideDef = {
  id: "gd.first-trip",
  title: "Your first trip",
  summary: "From a new campaign to the first trip.",
  mode: ["a"],
  chapters: [
    {
      id: "start",
      title: "Start",
      intro: "Make the campaign.",
      steps: [
        { id: "make", title: "Make it", body: ["Click *New campaign*.", "Then name it."], image: { key: "make", alt: "The dialog" }, links: [{ label: "Home", page: "home" }] },
        { id: "cart", title: "A cart", body: ["Click *+ Cart*."], links: [{ label: "New cart", newEntity: { type: "gd.cart" } }] },
      ],
    },
    { id: "go", title: "Go", steps: [{ id: "go", title: "Go", body: ["Off you go."] }] },
  ],
};

const issues = (m: GameModule) => guideIssues(m).map((i) => `${i.severity} ${i.where}: ${i.message}`);

describe("the guide runtime", () => {
  it("numbers the steps chapter by chapter, with anchors", () => {
    expect(guideSteps(GUIDE).map((s) => [s.number, s.anchor, s.step.title])).toEqual([
      ["1.1", "start-make", "Make it"],
      ["1.2", "start-cart", "A cart"],
      ["2.1", "go-go", "Go"],
    ]);
  });

  it("splits a paragraph into plain text and *Label* marks; an unpaired * stays text", () => {
    expect(guideText("Click *New campaign*, then *Create*.")).toEqual([{ text: "Click " }, { text: "New campaign", ui: true }, { text: ", then " }, { text: "Create", ui: true }, { text: "." }]);
    expect(guideText("2 * 3")).toEqual([{ text: "2 * 3" }]);
    expect(guideText("")).toEqual([]);
  });

  it("names the image and docs files", () => {
    expect(guideImageFile("gd", "make")).toBe("guide-gd-make.png");
    expect(guideDocFile(GUIDE)).toBe("gd-first-trip.md");
  });

  it("knows the modes it is written for", () => {
    expect(guideFitsMode(GUIDE, "a")).toBe(true);
    expect(guideFitsMode(GUIDE, "b")).toBe(false);
    expect(guideFitsMode({}, "b")).toBe(true);
  });
});

describe("guide conformance", () => {
  it("accepts a well-formed guide, and a module without one", () => {
    expect(issues(moduleWith({ guide: GUIDE }))).toEqual([]);
    expect(issues(moduleWith())).toEqual([]);
    // checkModule runs it
    expect(checkModule(moduleWith({ guide: GUIDE }), { skipProcedureRuns: true }).issues.filter((i) => i.where.startsWith("guide"))).toEqual([]);
  });

  it("finds bad ids, missing text, duplicate steps and images, unknown targets and undeclared modes", () => {
    const bad: GuideDef = {
      id: "other.guide",
      title: "",
      summary: "x",
      mode: ["z"],
      chapters: [
        {
          id: "Start",
          title: "x",
          steps: [],
        },
        {
          id: "c",
          title: "",
          steps: [
            { id: "s", title: "S", body: [], image: { key: "Bad Key", alt: "" } },
            { id: "s", title: "S2", body: ["One *mark."], image: { key: "img", alt: "a" } },
            { id: "t", title: "T", body: ["x"], image: { key: "img", alt: "b" }, links: [{ label: "Go", procedure: "gd.nope" }, { label: "Both", page: "home", procedure: "gd.nope" }, { label: "Cart", newEntity: { type: "gd.boat" } }] },
          ],
        },
      ],
    };
    const found = issues(moduleWith({ guide: bad }));
    const expected = [
      'error guide: guide id "other.guide" must start with the module id ("gd.")',
      "error guide: the guide needs a title",
      'error guide: mode "z" is not declared by the module',
      'error guide: chapter id "Start" must be lowercase letters, digits and "-"',
      "error guide:c: chapter needs a title",
      "error guide:c/s: step needs a body of non-empty paragraphs",
      'error guide:c/s: image key "Bad Key" must be lowercase letters, digits and "-"',
      "error guide:c/s: image needs alt text",
      'error guide:c/s: duplicate step "s"',
      'warning guide:c/s: an unpaired "*" in "One *mark.…" (mark labels as *Label*)',
      'error guide:c/t: image "img" is used by another step',
      'error guide:c/t: link "Go": unknown procedure "gd.nope"',
      'error guide:c/t: link "Both" needs exactly one of page, procedure, newEntity, entity or reference',
      'error guide:c/t: link "Both": unknown procedure "gd.nope"',
      'error guide:c/t: link "Cart": unknown entity type "gd.boat"',
    ];
    for (const e of expected) expect(found, e).toContain(e);
    expect(found).toHaveLength(expected.length);
  });

  it("checks Reference page links: one list (with an item of it), table or preset the module has", () => {
    const mod = (links: NonNullable<GuideDef["chapters"][number]["steps"][number]["links"]>) =>
      moduleWith({
        referenceLists: [{ id: "gd.talents", name: "Talents", items: [{ id: "quick", name: "Quick" }] }],
        tables: [{ id: "gd.mishap", name: "Mishap", dice: "d6", rows: [] }],
        presets: [{ id: "gd.mule", entityType: "gd.cart", name: "Mule", fields: {} }],
        guide: { ...GUIDE, chapters: [{ id: "c", title: "C", steps: [{ id: "s", title: "S", body: ["x"], links }] }] },
      } as Partial<GameModule>);
    expect(issues(mod([{ label: "Talents", reference: { list: "gd.talents" } }, { label: "Quick", reference: { list: "gd.talents", item: "quick" } }, { label: "Mishap", reference: { table: "gd.mishap" } }, { label: "Mule", reference: { preset: "gd.mule" } }]))).toEqual([]);
    expect(
      issues(
        mod([
          { label: "No list", reference: { list: "gd.nope" } },
          { label: "No item", reference: { list: "gd.talents", item: "slow" } },
          { label: "Lone item", reference: { item: "quick" } },
          { label: "Two", reference: { table: "gd.mishap", preset: "gd.mule" } },
          { label: "No table", reference: { table: "gd.nope" } },
          { label: "No preset", reference: { preset: "gd.nope" } },
          { label: "And a page", page: "home", reference: { table: "gd.mishap" } },
        ]),
      ),
    ).toEqual([
      'error guide:c/s: link "No list": unknown reference list "gd.nope"',
      'error guide:c/s: link "No item": list "gd.talents" has no item "slow"',
      'error guide:c/s: link "Lone item": reference needs exactly one of list, table or preset',
      'error guide:c/s: link "Two": reference needs exactly one of list, table or preset',
      'error guide:c/s: link "No table": unknown table "gd.nope"',
      'error guide:c/s: link "No preset": unknown preset "gd.nope"',
      'error guide:c/s: link "And a page" needs exactly one of page, procedure, newEntity, entity or reference',
    ]);
  });

  it("rejects a guide with no chapters", () => {
    expect(issues(moduleWith({ guide: { ...GUIDE, chapters: [] } }))).toEqual(["error guide: the guide needs at least one chapter"]);
  });
});

describe("a data pack's guide", () => {
  const dir = new URL("../../module-example/packs/example-pack/", import.meta.url);
  const read = (name: string) => JSON.parse(readFileSync(new URL(name, dir), "utf8")) as Record<string, unknown>;
  const guide = {
    id: "example-pack.start",
    title: "Start here",
    summary: "One step.",
    chapters: [{ id: "one", title: "One", steps: [{ id: "site", title: "A site", body: ["Click *+ Site*."], image: { key: "site", alt: "A site" }, links: [{ label: "New site", newEntity: { type: "example-pack.site" } }] }] }],
  };
  const parts = () => [{ name: "rules.part.json", data: read("rules.part.json") }];

  it("validates and loads it onto the module", () => {
    const loaded = loadPack({ ...read("pack.json"), guide }, { parts: parts(), skipProcedureRuns: true });
    expect(loaded.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(loaded.module?.guide?.chapters[0]?.steps[0]?.title).toBe("A site");
  });

  it("rejects a guide step with no body, and a link to a type the pack lacks", () => {
    const broken = structuredClone(guide);
    (broken.chapters[0]!.steps[0] as { body: string[] }).body = [];
    expect(validatePack({ ...read("pack.json"), guide: broken }).issues.some((i) => i.severity === "error" && i.path.startsWith("$.guide"))).toBe(true);
    const unknown = structuredClone(guide);
    unknown.chapters[0]!.steps[0]!.links[0]!.newEntity.type = "example-pack.nope";
    const loaded = loadPack({ ...read("pack.json"), guide: unknown }, { parts: parts(), skipProcedureRuns: true });
    expect(loaded.issues.map((i) => i.message)).toContain('link "New site": unknown entity type "example-pack.nope"');
  });
});
