/**
 * "Your first Alien campaign" (`alienModule.guide`): it passes the
 * contract's checks, every step has text and a screenshot that exists, its
 * links go to procedures, types and pages the module has, and the "Open the
 * job" links find the job the guide takes.
 */
import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { evaluateLogic, guideImageFile, guideIssues, guideSteps, SETUP_PAGES } from "@campaign-forge/module-sdk";
import { describe, expect, it } from "vitest";
import { alienModule, CAMPAIGN, FIRST_CAMPAIGN_GUIDE_ID, firstCampaignGuide } from "../src";

const SCREENSHOTS = fileURLToPath(new URL("../../../docs/screenshots/", import.meta.url));
const steps = guideSteps(firstCampaignGuide);

describe("the first campaign guide", () => {
  it("is the module's guide, for campaign play, with no conformance issues (warnings included)", () => {
    expect(alienModule.guide).toBe(firstCampaignGuide);
    expect(firstCampaignGuide.id).toBe(FIRST_CAMPAIGN_GUIDE_ID);
    expect(firstCampaignGuide.mode).toEqual([CAMPAIGN]);
    expect(guideIssues(alienModule)).toEqual([]);
  });

  it("walks campaign, crew, ship, places, people, connections, an adventure and a session", () => {
    expect(firstCampaignGuide.chapters.map((c) => c.id)).toEqual(["campaign", "crew", "ship", "places", "people", "connections", "adventure", "session"]);
    expect(steps.length).toBeGreaterThanOrEqual(20);
  });

  it("gives every step text and a screenshot named after it that exists and stays small", () => {
    for (const { step } of steps) {
      expect(step.body.length, step.id).toBeGreaterThan(0);
      expect(step.body.every((p) => p.trim().length > 0 && p.length <= 600), step.id).toBe(true);
      expect(step.image?.key, step.id).toBe(step.id);
      expect(step.image?.alt.trim(), step.id).toBeTruthy();
      const file = `${SCREENSHOTS}${guideImageFile("alien", step.image!.key)}`;
      expect(existsSync(file), `${file} (run the guide-alien screenshots)`).toBe(true);
      expect(statSync(file).size, file).toBeLessThan(300 * 1024);
    }
  });

  it("links every step but the first somewhere in the app, to things the module has", () => {
    for (const { step } of steps.slice(1)) expect(step.links?.length, step.id).toBeGreaterThan(0);
    for (const { step } of steps)
      for (const l of step.links ?? []) {
        if (l.page) expect(SETUP_PAGES, `${step.id}: ${l.label}`).toContain(l.page);
        if (l.procedure) expect(alienModule.procedures.map((p) => p.id), `${step.id}: ${l.label}`).toContain(l.procedure);
        if (l.newEntity) expect(alienModule.entityTypes.map((t) => t.id), `${step.id}: ${l.label}`).toContain(l.newEntity.type);
      }
  });

  it("opens the taken job: the entity links match an accepted job, not an offered one or a PC", () => {
    const rules = steps.flatMap(({ step }) => (step.links ?? []).flatMap((l) => (l.entity !== undefined ? [l.entity] : [])));
    expect(rules.length).toBeGreaterThan(0);
    const entity = (type: string, fields: Record<string, unknown>) => ({ id: "x", name: "x", type, tags: [], pc: false, visibility: "gm", fields, handouts: [] });
    for (const rule of rules) {
      expect(evaluateLogic(rule, entity("alien.job", { status: "accepted" }))).toBeTruthy();
      expect(evaluateLogic(rule, entity("alien.job", { status: "offered" }))).toBeFalsy();
      expect(evaluateLogic(rule, entity("alien.character", { status: "accepted" }))).toBeFalsy();
    }
  });

  it("keeps to its own example names, never a published scenario's", () => {
    const text = JSON.stringify(firstCampaignGuide);
    for (const name of ["Breakwater Freight", "Juno Okafor", "Tobias Reyne", "Marigold Dawn", "Halvorsen Relay", "The Lantern Bar", "Oskar Brandt", "Wen Halloran", "Brannock Deep"]) expect(text).toContain(name);
    for (const banned of ["Hope's Last Day", "Hope’s Last Day", "Chariot of the Gods", "Destroyer of Worlds", "Hadley", "Ripley", "Starter Set"]) expect(text).not.toContain(banned);
  });
});
