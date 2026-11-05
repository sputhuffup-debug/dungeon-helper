/**
 * "Your first 5e campaign" (the pack's `guide`): the built pack carries it,
 * it passes the contract's checks, every step has text and a screenshot that
 * exists, its links go to procedures, types, pages and Reference entries the
 * module has, its cites are sections the pack already cites, and its example
 * names are its own.
 */
import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { evaluateLogic, guideImageFile, guideIssues, guideSteps, moduleFromPackSource, SETUP_PAGES, type GameModule } from "@campaign-forge/module-sdk";
import { beforeAll, describe, expect, it } from "vitest";
import { FIRST_CAMPAIGN_GUIDE_ID, firstCampaignGuide } from "../scripts/authored/firstCampaign";
import { dnd5eSrdSource } from "../src";

const SCREENSHOTS = fileURLToPath(new URL("../../../docs/screenshots/", import.meta.url));
const steps = guideSteps(firstCampaignGuide);

let module: GameModule;
beforeAll(async () => {
  module = await moduleFromPackSource(dnd5eSrdSource);
}, 60_000);

/** Every `cite` string anywhere in the module's data except the guide. */
function citesOutsideTheGuide(m: GameModule): Set<string> {
  const out = new Set<string>();
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) if (k === "cite" && typeof v === "string") out.add(v);
      else if (k !== "guide") walk(v);
  };
  walk(m);
  return out;
}

describe("the first campaign guide", () => {
  it("is the pack's guide, for campaign play, with no conformance issues (warnings included)", () => {
    expect(module.guide).toEqual(firstCampaignGuide);
    expect(firstCampaignGuide.id).toBe(FIRST_CAMPAIGN_GUIDE_ID);
    expect(FIRST_CAMPAIGN_GUIDE_ID).toBe("dnd5e-srd.first-campaign");
    expect(firstCampaignGuide.mode).toEqual(["campaign"]);
    expect(guideIssues(module)).toEqual([]);
  });

  it("walks campaign, party, places, people, connections, an adventure and a session", () => {
    expect(firstCampaignGuide.chapters.map((c) => c.id)).toEqual(["campaign", "party", "places", "people", "connections", "adventure", "session"]);
    expect(steps.length).toBeGreaterThanOrEqual(20);
  });

  it("gives every step text and a screenshot named after it that exists and stays small", () => {
    for (const { step } of steps) {
      expect(step.body.length, step.id).toBeGreaterThan(0);
      expect(step.body.every((p) => p.trim().length > 0 && p.length <= 600), step.id).toBe(true);
      expect(step.image?.key, step.id).toBe(step.id);
      expect(step.image?.alt.trim(), step.id).toBeTruthy();
      const file = `${SCREENSHOTS}${guideImageFile("dnd5e-srd", step.image!.key)}`;
      expect(existsSync(file), `${file} (run the guide-dnd5e-srd screenshots)`).toBe(true);
      expect(statSync(file).size, file).toBeLessThan(300 * 1024);
    }
  });

  it("links every step but the first somewhere in the app, to things the module has, a Reference entry never first", () => {
    for (const { step } of steps.slice(1)) {
      expect(step.links?.length, step.id).toBeGreaterThan(0);
      expect(step.links![0]!.reference, `${step.id}: the first link is the Take me there`).toBeUndefined();
    }
    for (const { step } of steps)
      for (const l of step.links ?? []) {
        if (l.page) expect(SETUP_PAGES, `${step.id}: ${l.label}`).toContain(l.page);
        if (l.procedure) expect(module.procedures.map((p) => p.id), `${step.id}: ${l.label}`).toContain(l.procedure);
        if (l.newEntity) expect(module.entityTypes.map((t) => t.id), `${step.id}: ${l.label}`).toContain(l.newEntity.type);
      }
  });

  it("opens the quest: the entity links match a quest of any status, not a PC or an NPC", () => {
    const rules = steps.flatMap(({ step }) => (step.links ?? []).flatMap((l) => (l.entity !== undefined ? [l.entity] : [])));
    expect(rules.length).toBeGreaterThan(0);
    const entity = (type: string, fields: Record<string, unknown>) => ({ id: "x", name: "x", type, tags: [], pc: false, visibility: "gm", fields, handouts: [] });
    for (const rule of rules) {
      expect(evaluateLogic(rule, entity("dnd5e-srd.quest", { status: "rumour" }))).toBeTruthy();
      expect(evaluateLogic(rule, entity("dnd5e-srd.quest", { status: "active" }))).toBeTruthy();
      expect(evaluateLogic(rule, entity("dnd5e-srd.character", {}))).toBeFalsy();
      expect(evaluateLogic(rule, entity("dnd5e-srd.npc", {}))).toBeFalsy();
    }
  });

  it("cites only SRD sections the pack already cites", () => {
    const known = citesOutsideTheGuide(module);
    const cited = steps.flatMap(({ step }) => (step.cite ? [step.cite] : []));
    expect(cited.length).toBeGreaterThan(0);
    for (const c of cited) expect(known, c).toContain(c);
    for (const { step } of steps) expect(step.page, `${step.id}: the SRD is cited by section, not page`).toBeUndefined();
  });

  it("keeps to its own example names, never a published adventure's", () => {
    const text = JSON.stringify(firstCampaignGuide);
    for (const name of ["The Wilby Watch", "Doran Kettleby", "Mira Fenwick", "Wilby", "The Lucky Lantern", "Quilla Greyhame", "Barrowfield Chapel", "Captain Hollis Varrow", "Brother Tobin Marsh", "The Opened Graves", "The Barrowfield Crypt"]) expect(text).toContain(name);
    for (const banned of ["Thornwick", "Phandalin", "Saltmarsh", "Barovia", "Waterdeep", "Forgotten Realms", "Dungeons & Dragons"]) expect(text).not.toContain(banned);
  });
});
