/**
 * The setup guide hook (`GameModule.setup`) and campaign settings
 * (`GameModule.campaignSettings`): composing and ordering steps, ticking them
 * from a snapshot, the conformance checks, and the data pack's version
 * (against the example pack). Generic: nothing here names a real game.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkModule } from "../src/module";
import { loadPack, validatePack } from "../src/pack";
import { campaignSettingOptions, campaignSettingsFor, composeSetupSteps, emptySetupSnapshot, evaluateSetupSteps, initialCampaignSettings, setupProgress } from "../src/setup";
import { CONTRACT_VERSION, CORE_SETUP_STEP_IDS, type CampaignSettingDef, type GameModule, type SetupDef, type SetupSnapshot, type SetupStepDef } from "../src/types";

function moduleWith(extra: Partial<GameModule> = {}): GameModule {
  return {
    manifest: {
      id: "st",
      version: "1.0.0",
      name: "ST",
      ruleset: "ST",
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
    entityTypes: [{ id: "st.cart", kind: "vehicle", name: "Cart", plural: "Carts", schema: { type: "object", properties: {} }, sheet: { sections: [] } }],
    relationshipTypes: [],
    referenceLists: [
      {
        id: "st.roads",
        name: "Roads",
        items: [
          { id: "north", name: "North road", summary: "Cold." },
          { id: "south", name: "South road", mode: ["b"] },
        ],
      },
    ],
    presets: [],
    tables: [],
    procedures: [],
    templates: [],
    rules: [],
    trackers: [],
    calendar: { id: "st.cal", name: "Cal", defaultYear: 1, months: [{ name: "M", days: 30 }] },
    ...extra,
  };
}

const issues = (m: GameModule) => checkModule(m, { skipProcedureRuns: true }).issues.map((i) => `${i.severity} ${i.where}: ${i.message}`);

/** Stand-ins for the core's generic steps (the core owns the real ones). */
const CORE: SetupStepDef[] = CORE_SETUP_STEP_IDS.map((id) => ({ id, label: id, done: { ">": [{ var: "counts.pcs" }, 0] } }));

const cartStep: SetupStepDef = {
  id: "st.setup.cart",
  label: "Get a cart",
  done: { some: [{ var: "entities" }, { "==": [{ var: "type" }, "st.cart"] }] },
  progress: { count: { var: "counts.entities" }, of: 1 },
  links: [
    { label: "+ Cart", newEntity: { type: "st.cart" }, primary: true },
    { label: "Open the cart", entity: { "==": [{ var: "type" }, "st.cart"] } },
  ],
};
const roadStep: SetupStepDef = { id: "st.setup.road", label: "Pick a road", mode: ["b"], done: { "!!": [{ var: "settings.road" }] }, links: [{ label: "Settings", page: "settings", params: { section: "campaign" } }] };
const setup: SetupDef = {
  steps: [cartStep, roadStep],
  layouts: [
    { mode: ["a"], order: ["st.setup.cart", "setup.players"] },
    { mode: ["b"], hide: ["setup.session"], order: ["st.setup.road"] },
  ],
};

function snapshotWith(patch: Partial<SetupSnapshot>): SetupSnapshot {
  const base = emptySetupSnapshot("a");
  return { ...base, ...patch, counts: { ...base.counts, ...(patch.counts ?? {}) } };
}

describe("composeSetupSteps", () => {
  it("puts the layout's order first, then the rest in default order, filtered by mode", () => {
    expect(composeSetupSteps(CORE, setup, "a").map((s) => s.id)).toEqual(["st.setup.cart", "setup.players", "setup.pcs", "setup.session"]);
    expect(composeSetupSteps(CORE, setup, "b").map((s) => s.id)).toEqual(["st.setup.road", "setup.pcs", "setup.players", "st.setup.cart"]);
  });

  it("is the core steps alone without a module setup", () => {
    expect(composeSetupSteps(CORE, undefined, "a").map((s) => s.id)).toEqual([...CORE_SETUP_STEP_IDS]);
  });
});

describe("evaluateSetupSteps", () => {
  const steps = composeSetupSteps(CORE, setup, "a");

  it("ticks nothing on an empty campaign and hides entity links that match nothing", () => {
    const states = evaluateSetupSteps(steps, emptySetupSnapshot("a"));
    expect(states.every((s) => !s.done)).toBe(true);
    const cart = states.find((s) => s.id === "st.setup.cart")!;
    expect(cart.count).toEqual({ value: 0, of: 1 });
    expect(cart.links.map((l) => l.label)).toEqual(["+ Cart"]);
    expect(setupProgress(states)).toEqual({ done: 0, total: 4 });
  });

  it("ticks steps from data and resolves an entity link to the first match by name", () => {
    const cart = (id: string, name: string) => ({ id, name, type: "st.cart", kind: "vehicle", tags: [], pc: false, visibility: "gm", fields: {}, handouts: [] });
    const snap = snapshotWith({ entities: [cart("2", "Zebra cart"), cart("1", "Apple cart")], entityIds: ["1", "2"], counts: { ...emptySetupSnapshot("a").counts, entities: 2 } });
    const states = evaluateSetupSteps(steps, snap);
    const step = states.find((s) => s.id === "st.setup.cart")!;
    expect(step.done).toBe(true);
    expect(step.count).toEqual({ value: 2, of: 1 });
    expect(step.links.find((l) => l.label === "Open the cart")?.entityId).toBe("1");
    expect(setupProgress(states)).toEqual({ done: 1, total: 4 });
  });

  it("says what a count counts: its label, a string or a rule over the snapshot", () => {
    const step = (label: unknown): SetupStepDef => ({ id: "st.setup.n", label: "N", done: false, progress: { count: 0, of: { var: "counts.players" }, label: label as SetupStepDef["label"] } });
    const snap = snapshotWith({ counts: { ...emptySetupSnapshot("a").counts, players: 3 } });
    expect(evaluateSetupSteps([step("carts")], snap)[0]!.count).toEqual({ value: 0, of: 3, label: "carts" });
    expect(evaluateSetupSteps([step({ if: [{ ">": [{ var: "counts.players" }, 0] }, "carts, one per player", "carts"] })], snap)[0]!.count?.label).toBe("carts, one per player");
    // a rule that is not text, or throws, shows no label
    expect(evaluateSetupSteps([step({ var: "counts.players" })], snap)[0]!.count).toEqual({ value: 0, of: 3 });
    expect(issues(moduleWith({ setup: { steps: [{ ...step({ nope: [1] }), mode: ["a"] }] } })).some((i) => i.includes("progress"))).toBe(true);
  });

  it("treats a rule that throws as not done", () => {
    const [state] = evaluateSetupSteps([{ id: "st.setup.x", label: "X", done: { nope: [1] } }], emptySetupSnapshot("a"));
    expect(state!.done).toBe(false);
  });
});

describe("checkModule: setup", () => {
  it("accepts a valid setup and modules without one", () => {
    expect(issues(moduleWith())).toEqual([]);
    expect(issues(moduleWith({ setup }))).toEqual([]);
  });

  it("reports ids, labels, links, modes, layouts and rules that do not fit", () => {
    const found = issues(
      moduleWith({
        setup: {
          steps: [
            { id: "setup.mine", label: "Core prefix", done: false },
            { id: "other.step", label: "", done: { bogus: [] } },
            { id: "st.dupe", label: "A", done: false, mode: ["z"] },
            { id: "st.dupe", label: "B", done: false },
            {
              id: "st.links",
              label: "Links",
              done: { "==": [{ var: "counts.pcs" }, 0] },
              links: [
                { label: "Two targets", page: "ship", procedure: "st.proc" },
                { label: "Nowhere", page: "attic" as never },
                { label: "No such type", newEntity: { type: "st.boat" } },
                { label: "Params without a page", procedure: "st.none", params: { tab: "x" } },
              ],
            },
          ],
          layouts: [{ mode: ["q"], hide: ["st.links"], order: ["st.unknown"] }],
        },
      }),
    );
    expect(found).toEqual(
      expect.arrayContaining([
        'error setup:setup.mine: "setup." is the core\'s prefix; namespace the id with the module id ("st.…")',
        'error setup:other.step: step id must start with the module id ("st.")',
        "error setup:other.step: step needs a label",
        'error setup:other.step: done: unknown operator "bogus"',
        'error setup:st.dupe: mode "z" is not declared by the module',
        'error setup:st.dupe: duplicate setup step "st.dupe"',
        'error setup:st.links: link "Two targets" needs exactly one of page, procedure, newEntity, entity or reference',
        'error setup:st.links: link "Two targets": unknown procedure "st.proc"',
        'error setup:st.links: link "Nowhere": unknown page "attic" (one of home, atlas, settings, ship, arcs, sessions, adventures, generate, primer, rules)',
        'error setup:st.links: link "No such type": unknown entity type "st.boat"',
        'error setup:st.links: link "Params without a page": params only go with a page',
        'warning setup:st.links: an empty campaign already counts as done in mode "a"',
        'error setup:layout#0: mode "q" is not declared by the module',
        'error setup:layout#0: hide names "st.links", which is not a core step (setup.pcs, setup.players, setup.session)',
        'error setup:layout#0: order names unknown step "st.unknown"',
      ]),
    );
  });
});

describe("campaign settings", () => {
  const road: CampaignSettingDef = { key: "road", label: "Road", kind: "choice", list: "st.roads", default: "north", atCreation: true };
  const camp: CampaignSettingDef = { key: "camp", label: "Camp", kind: "entity", entityTypes: ["st.cart"], mode: ["b"] };
  const motto: CampaignSettingDef = { key: "motto", label: "Motto", kind: "text", atCreation: true, mode: ["b"] };
  const m = moduleWith({ campaignSettings: [road, camp, motto] });

  it("filters by mode and by what is asked at creation", () => {
    expect(campaignSettingsFor(m, "a").map((d) => d.key)).toEqual(["road"]);
    expect(campaignSettingsFor(m, "b").map((d) => d.key)).toEqual(["road", "camp", "motto"]);
    expect(campaignSettingsFor(m, "b", { atCreation: true }).map((d) => d.key)).toEqual(["road", "motto"]);
  });

  it("reads choice options from a reference list, in the mode", () => {
    expect(campaignSettingOptions(road, m, "a")).toEqual([{ value: "north", label: "North road", hint: "Cold." }]);
    expect(campaignSettingOptions(road, m, "b").map((o) => o.value)).toEqual(["north", "south"]);
  });

  it("starts a campaign from defaults and the GM's choices, dropping values that do not fit", () => {
    expect(initialCampaignSettings(m, "a")).toEqual({ road: "north" });
    expect(initialCampaignSettings(m, "b", { road: "south", motto: "Onward", stray: "x" })).toEqual({ road: "south", motto: "Onward" });
    expect(initialCampaignSettings(m, "a", { road: "south" })).toEqual({});
  });

  it("checks keys, kinds, options, defaults and types", () => {
    expect(issues(m)).toEqual([]);
    const found = issues(
      moduleWith({
        campaignSettings: [
          { key: "setupGuide", label: "Clash", kind: "text" },
          { key: "road", label: "", kind: "choice" },
          { key: "road", label: "Again", kind: "choice", options: [{ value: "x", label: "X" }], default: "y" },
          { key: "list", label: "List", kind: "choice", list: "st.none" },
          { key: "base", label: "Base", kind: "entity", entityTypes: ["st.boat"], atCreation: true },
          { key: "bad key", label: "Bad", kind: "text" },
        ],
      }),
    );
    expect(found).toEqual(
      expect.arrayContaining([
        'error campaignSetting:setupGuide: "setupGuide" is a core setting',
        "error campaignSetting:road: setting needs a label",
        "error campaignSetting:road: a choice needs options or a reference list with items",
        'error campaignSetting:road: duplicate campaign setting "road"',
        'error campaignSetting:road: default "y" is not one of the options',
        'error campaignSetting:list: unknown reference list "st.none"',
        'error campaignSetting:base: unknown entity type "st.boat"',
        "error campaignSetting:base: an entity setting cannot be asked at creation (a new campaign has no entities)",
        "error campaignSetting:bad key: a setting needs a key of letters, digits, _ and -",
      ]),
    );
  });
});

describe("pack setup and campaign settings", () => {
  const dir = new URL("../../module-example/packs/example-pack/", import.meta.url);
  const read = (name: string) => JSON.parse(readFileSync(new URL(name, dir), "utf8")) as Record<string, unknown>;

  it("loads the example pack's steps and settings", () => {
    const loaded = loadPack(read("pack.json"), { parts: [{ name: "rules.part.json", data: read("rules.part.json") }], skipProcedureRuns: true });
    expect(loaded.ok).toBe(true);
    const module = loaded.module!;
    expect(module.setup?.steps.map((s) => s.id)).toEqual(["example-pack.setup.site"]);
    expect(composeSetupSteps(CORE, module.setup, "delve").map((s) => s.id)).toEqual(["example-pack.setup.site", "setup.pcs", "setup.players"]);
    expect(campaignSettingsFor(module, "saga", { atCreation: true }).map((d) => d.key)).toEqual(["village"]);
    expect(campaignSettingsFor(module, "delve")).toEqual([]);
  });

  it("rejects a step id outside the pack's namespace and bad JSONLogic", () => {
    const pack = read("pack.json");
    const res = validatePack({ ...pack, setup: { steps: [{ id: "elsewhere.step", label: "X", done: { nope: 1 } }] } });
    expect(res.ok).toBe(false);
    expect(res.issues.map((i) => `${i.path}: ${i.message}`)).toEqual(
      expect.arrayContaining(['$.setup.steps[0].id: setup step id "elsewhere.step" must start with "example-pack." (ids are namespaced by the pack id)', '$.setup.steps[0].done: JSONLogic: unknown operator "nope"']),
    );
  });

  it("rejects a malformed setting by the schema", () => {
    const res = validatePack({ ...read("pack.json"), campaignSettings: [{ key: "x", label: "X", kind: "dial" }] });
    expect(res.ok).toBe(false);
  });
});
