/**
 * "Your first ORC campaign" (the pack's `guide`): it passes the contract's
 * checks once the pack is loaded, every step has text and a screenshot that
 * exists, its links go to procedures, types, pages and Reference entries the
 * module has, its citations are ones the module's data already uses, and its
 * text keeps to original names: no Reserved Material and no trademark.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { evaluateLogic, guideImageFile, guideIssues, guideSteps, moduleFromPackSource, SETUP_PAGES, type GameModule, type GuideDef } from "@campaign-forge/module-sdk";
import { beforeAll, describe, expect, it } from "vitest";
import { FIRST_CAMPAIGN_GUIDE_ID, firstCampaignGuide } from "../scripts/authored/firstCampaign.ts";
import { anyReservedPattern } from "../scripts/source/reserved.ts";
import { pf2eOrcSource } from "../src";

const SCREENSHOTS = fileURLToPath(new URL("../../../docs/screenshots/", import.meta.url));
const PACK_DIR = fileURLToPath(new URL("../pack/", import.meta.url));

let module: GameModule;
let guide: GuideDef;

beforeAll(async () => {
  module = await moduleFromPackSource(pf2eOrcSource);
  guide = module.guide!;
}, 120_000);

describe("the first campaign guide", () => {
  it("is the pack's guide, for campaign play, with no conformance issues (warnings included)", () => {
    expect(guide).toEqual(JSON.parse(JSON.stringify(firstCampaignGuide)));
    expect(guide.id).toBe(FIRST_CAMPAIGN_GUIDE_ID);
    expect(guide.id).toBe("pf2e-orc.first-campaign");
    expect(guide.title).toBe("Your first ORC campaign");
    expect(guide.mode).toEqual(["campaign"]);
    expect(guideIssues(module)).toEqual([]);
  });

  it("walks the campaign, the party, places, people, connections, an adventure and a session", () => {
    expect(guide.chapters.map((c) => c.id)).toEqual(["campaign", "party", "places", "people", "connections", "adventure", "session"]);
    expect(guideSteps(guide).length).toBeGreaterThanOrEqual(20);
  });

  it("gives every step text and a screenshot named after it that exists and stays small", () => {
    for (const { step } of guideSteps(guide)) {
      expect(step.body.every((p) => p.trim().length > 0 && p.length <= 600), step.id).toBe(true);
      expect(step.image?.key, step.id).toBe(step.id);
      expect(step.image?.alt.trim(), step.id).toBeTruthy();
      const file = `${SCREENSHOTS}${guideImageFile("pf2e-orc", step.image!.key)}`;
      expect(existsSync(file), `${file} (run the guide-pf2e-orc screenshots)`).toBe(true);
      expect(statSync(file).size, file).toBeLessThan(300 * 1024);
    }
  });

  it("links every step but the first somewhere in the app, to things the module has; Reference links are never the main one", () => {
    const steps = guideSteps(guide);
    for (const { step } of steps.slice(1)) {
      expect(step.links?.length, step.id).toBeGreaterThan(0);
      expect(step.links![0]!.reference, `${step.id}: the first link is the main "Take me there"`).toBeUndefined();
    }
    for (const { step } of steps)
      for (const l of step.links ?? []) {
        const what = `${step.id}: ${l.label}`;
        if (l.page) expect(SETUP_PAGES, what).toContain(l.page);
        if (l.procedure) expect(module.procedures.map((p) => p.id), what).toContain(l.procedure);
        if (l.newEntity) expect(module.entityTypes.map((t) => t.id), what).toContain(l.newEntity.type);
        if (l.reference?.list) expect(module.referenceLists.map((x) => x.id), what).toContain(l.reference.list);
        if (l.reference?.table) expect(module.tables.map((x) => x.id), what).toContain(l.reference.table);
        if (l.reference?.preset) expect(module.presets.map((x) => x.id), what).toContain(l.reference.preset);
      }
  });

  it("opens the quest from the quest board: the entity link matches a quest, not an NPC", () => {
    const rules = guideSteps(guide).flatMap(({ step }) => (step.links ?? []).flatMap((l) => (l.entity !== undefined ? [l.entity] : [])));
    expect(rules.length).toBeGreaterThan(0);
    const entity = (type: string) => ({ id: "x", name: "x", type, tags: [], pc: false, visibility: "gm", fields: { status: "rumour" }, handouts: [] });
    for (const rule of rules) {
      expect(evaluateLogic(rule, entity("pf2e-orc.quest"))).toBeTruthy();
      expect(evaluateLogic(rule, entity("pf2e-orc.npc"))).toBeFalsy();
    }
  });

  it("cites only what the module's data already cites, in the same form", () => {
    const read = (name: string) => JSON.parse(readFileSync(`${PACK_DIR}${name}`, "utf8")) as Record<string, unknown>;
    const { guide: _guide, ...rest } = read("pack.json");
    const data = JSON.stringify(rest) + JSON.stringify(read("tables.json"));
    const cited = guideSteps(guide).filter(({ step }) => step.cite);
    expect(cited.length).toBeGreaterThan(0);
    for (const { step } of guideSteps(guide)) expect(step.page, step.id).toBeUndefined();
    for (const { step } of cited) expect(data, `${step.id}: ${step.cite}`).toContain(`"cite":${JSON.stringify(step.cite)}`);
  });

  it("keeps to its own example names, with no Reserved Material and no trademark", () => {
    const text = JSON.stringify(guide);
    for (const name of ["The Wardens of Mossford", "Ilsa Varrow", "Tamsin Reed", "Mossford", "Ferryman's Rest", "Ivyford", "Merry Crow", "Bram Oakhollow", "Corin Dale", "Hesper Quill", "Odalys Brand", "Crowfoot Warren"]) expect(text).toContain(name);
    expect(text.match(anyReservedPattern("g")) ?? []).toEqual([]);
    expect(text).not.toMatch(/pathfinder|paizo|golarion/i);
  });
});
