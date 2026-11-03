import { describe, expect, it } from "vitest";
import {
  adventureSourceIssues,
  adventureSourcesFor,
  emptyAdventureSourceInput,
  sceneTitleFromPurpose,
  sourceOpen,
  sourceRunnable,
  templateGuidance,
  templateSceneKey,
  templateText,
} from "../src/adventureSource";
import { checkModule } from "../src/module";
import { CONTRACT_VERSION, type AdventureSourceDef, type GameModule, type Template } from "../src/types";

const quest: Template = {
  id: "min.quest",
  kind: "adventure",
  name: "Quest",
  scaffold: {
    title: "Quest",
    premise: "_What the quest is, in one line._",
    playerIntro: "Hear ye.\n\n_What the herald says. Leave out the trap._",
    acts: [
      { number: 1, goal: "Go", scenes: [{ id: "hook", title: "The hook", purpose: "Hook: someone asks (link the patron)." }, { purpose: "Road", body: "_Who is on the road._" }] },
      { number: 2, goal: "Win", scenes: [{ purpose: "The lair" }] },
    ],
  },
};

const source = (over: Partial<AdventureSourceDef> = {}): AdventureSourceDef => ({
  id: "min.run",
  entityType: "min.thing",
  template: "min.quest",
  label: "Run it",
  when: { "==": [{ var: "fields.color" }, "red"] },
  open: { "==": [{ var: "fields.color" }, "red"] },
  outcomes: [{ id: "won", label: "Won", set: { path: "color", value: "blue" }, closes: true }],
  prefill: (input) => ({ title: `Quest for ${input.entity.name}`, scenes: { hook: { title: "Ask" }, "1.2": { body: "Dust." }, "2.1": { participants: [] } }, plan: ["hook", "2.1"] }),
  ...over,
});

const moduleWith = (defs: AdventureSourceDef[], templates: Template[] = [quest]) => ({
  manifest: { id: "min", modes: [{ id: "a", name: "A" }], defaultMode: "a" } as unknown as GameModule["manifest"],
  entityTypes: [{ id: "min.thing" }] as unknown as GameModule["entityTypes"],
  templates,
  adventureSources: defs,
});

describe("template text and guidance", () => {
  it("keeps underscored paragraphs as guidance, the rest as content", () => {
    expect(templateText("_The offer as the employer makes it._")).toEqual({ content: "", guide: "The offer as the employer makes it." });
    expect(templateText("What's the story, Mother?\n\n_Read aloud by the GM._")).toEqual({ content: "What's the story, Mother?", guide: "Read aloud by the GM." });
    expect(templateText("Short. One scene with the employer.")).toEqual({ content: "Short. One scene with the employer.", guide: "" });
    // emphasis inside a paragraph is content, not guidance
    expect(templateText("Roll _twice_ and keep _one_.")).toEqual({ content: "Roll _twice_ and keep _one_.", guide: "" });
    expect(templateText(undefined)).toEqual({ content: "", guide: "" });
  });

  it("lists every guidance paragraph and scene purpose of a template", () => {
    const g = templateGuidance(quest.scaffold as never);
    expect(g).toContain("What the quest is, in one line.");
    expect(g).toContain("What the herald says. Leave out the trap.");
    expect(g).toContain("Who is on the road.");
    expect(g).toContain("Hook: someone asks (link the patron).");
  });

  it("titles scenes from their purpose without a bracketed aside", () => {
    expect(sceneTitleFromPurpose("Arrival at the destination (link the location).")).toBe("Arrival at the destination");
    expect(sceneTitleFromPurpose("Briefing: the employer makes the offer (link the job).")).toBe("Briefing");
    expect(sceneTitleFromPurpose("Arrival at the destination (link…")).toBe("Arrival at the destination");
    expect(sceneTitleFromPurpose("")).toBe("Scene");
    expect(templateSceneKey(2, 0, {})).toBe("2.1");
    expect(templateSceneKey(1, 0, { id: "hook" })).toBe("hook");
  });
});

describe("adventure sources", () => {
  it("runs a record when `when` holds and keeps it open while `open` holds", () => {
    const def = source();
    expect(sourceRunnable(def, { color: "red" })).toBe(true);
    expect(sourceRunnable(def, { color: "blue" })).toBe(false);
    expect(sourceRunnable({}, {})).toBe(true);
    expect(sourceOpen(def, { color: "red" })).toBe(true);
    expect(sourceOpen({}, { color: "red" })).toBe(false);
    expect(adventureSourcesFor(moduleWith([def]), "min.thing", "a")).toEqual([def]);
    expect(adventureSourcesFor(moduleWith([{ ...def, mode: ["b"] }]), "min.thing", "a")).toEqual([]);
  });

  it("passes a well-formed source", () => {
    expect(adventureSourceIssues(moduleWith([source()]))).toEqual([]);
    expect(source().prefill(emptyAdventureSourceInput("min.thing"))).toMatchObject({ title: "Quest for Source" });
  });

  it("catches unknown types and templates, bad rules, scenes the template lacks, duplicate outcomes, throwing or random prefills", () => {
    const messages = (defs: AdventureSourceDef[]) => adventureSourceIssues(moduleWith(defs)).map((i) => i.message);
    expect(messages([source({ entityType: "min.nope" })])).toContain('unknown entity type "min.nope"');
    expect(messages([source({ template: "min.nope" })])).toContain('template "min.nope" is not an adventure template of the module');
    expect(messages([source({ when: { nope: [1] } })]).some((m) => m.startsWith("when:"))).toBe(true);
    expect(messages([source({ prefill: () => ({ scenes: { lair: {} }, plan: ["3.1"] }) })])).toEqual(['prefill names scene "lair", which the template does not have', 'prefill names scene "3.1", which the template does not have']);
    expect(messages([source({ outcomes: [{ id: "x", label: "X" }, { id: "x", label: "Y" }] })])).toContain('duplicate outcome "x"');
    expect(messages([source({ prefill: () => { throw new Error("boom"); } })])).toEqual(["prefill threw on an empty input: boom"]);
    let n = 0;
    expect(messages([source({ prefill: () => ({ title: String(n++) }) })])).toEqual(["prefill is not deterministic on an empty input"]);
    expect(messages([source(), source()])).toContain('duplicate adventure source "min.run"');
  });
});

describe("checkModule: template text", () => {
  const base = (): GameModule =>
    ({
      manifest: { id: "min", version: "1.0.0", name: "Min", ruleset: "Min", licenseNotice: "none", requiredCore: CONTRACT_VERSION, modes: [{ id: "a", name: "A" }], defaultMode: "a", dataStatus: "verified" },
      dice: { dice: [{ id: "d6", name: "d6", faces: 6 }], buildPool: () => ({ dice: { d6: 1 } }), roll: (pool: never) => ({ pool, dice: [], successes: 0, symbols: {}, pushes: 0, canPush: false }), describe: () => "" },
      entityTypes: [{ id: "min.thing", kind: "item", name: "Thing", plural: "Things", schema: { type: "object", properties: { color: { type: "string" } } }, sheet: { sections: [{ id: "s", title: "S", fields: [{ path: "color" }] }] } }],
      relationshipTypes: [],
      referenceLists: [],
      presets: [],
      tables: [],
      procedures: [],
      templates: [quest],
      rules: [],
      trackers: [],
      calendar: { id: "min.cal", name: "Cal", defaultYear: 1, months: [{ name: "M", days: 30 }] },
    }) as unknown as GameModule;

  it("refuses raw entity type ids in template text, and checks the adventure sources", () => {
    const m = base();
    expect(checkModule(m, { seeds: 5 }).issues.filter((i) => i.severity === "error")).toEqual([]);
    m.templates = [{ ...quest, scaffold: { ...(quest.scaffold as object), premise: "Link the min.thing entity." } as never }];
    expect(checkModule(m, { seeds: 5 }).issues.map((i) => i.message)).toContain('template text names the raw type id "min.thing"; say it in words');
    m.templates = [{ ...quest, scaffold: { ...(quest.scaffold as object), premise: "Ids like min.things or min.thing.weight are other names." } as never }];
    expect(checkModule(m, { seeds: 5 }).issues.filter((i) => i.severity === "error")).toEqual([]);
    m.templates = [quest];
    m.adventureSources = [source({ template: "min.missing" })];
    expect(checkModule(m, { seeds: 5 }).issues.map((i) => `${i.where}: ${i.message}`)).toContain('adventureSource:min.run: template "min.missing" is not an adventure template of the module');
  });
});
