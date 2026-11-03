/**
 * What the GM reads: every enum the module declares (entity fields and
 * procedure inputs) carries `enumLabels`, every procedure input has a title,
 * NPC-only sheet sections stay off a PC's sheet, and generated text has no
 * template seams (verbs agree with plural cargo; the thread's agent is "a
 * ..." where the crew meets them and "the ..." after).
 */
import { describe, expect, it } from "vitest";
import { enumLabel, runProcedure, sectionApplies, type JsonSchema, type ModuleManifest, type OfferSet } from "@campaign-forge/module-sdk";
import { entityTypes } from "../src/entities/index";
import { procedures } from "../src/procedures/index";
import { campaignThread, type ThreadData } from "../src/procedures/campaign-thread";
import { jobBoard, pluralCargo } from "../src/procedures/job-board";
import { tables } from "../src/tables/index";

const mod = { tables, manifest: { id: "alien", version: "0.0.0-test" } as ModuleManifest };
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Every enum under a schema, with its path. */
function enums(schema: unknown, path: string, out: Array<{ path: string; schema: JsonSchema }> = []): Array<{ path: string; schema: JsonSchema }> {
  if (!isRec(schema)) return out;
  if (Array.isArray(schema.enum) && path !== "" && !path.endsWith("{}")) out.push({ path, schema });
  if (isRec(schema.properties)) for (const [k, v] of Object.entries(schema.properties)) enums(v, path ? `${path}.${k}` : k, out);
  if (isRec(schema.items)) enums(schema.items, `${path}[]`, out);
  return out;
}

describe("labels", () => {
  const all = [
    ...entityTypes.flatMap((t) => enums(t.schema, "").map((e) => ({ ...e, where: t.id }))),
    ...procedures.flatMap((p) => enums(p.inputs, "").map((e) => ({ ...e, where: `${p.id} input` }))),
  ];

  it("gives every enum a label per value", () => {
    expect(all.length).toBeGreaterThan(40);
    const missing = all.filter(({ schema }) => {
      const labels = schema.enumLabels;
      return !Array.isArray(labels) || labels.length !== (schema.enum as unknown[]).length || labels.some((l) => typeof l !== "string" || !l.trim());
    });
    expect(missing.map((m) => `${m.where} ${m.path}`)).toEqual([]);
  });

  it("names enum values as people say them", () => {
    const job = entityTypes.find((t) => t.id === "alien.job")!;
    const props = job.schema.properties as Record<string, JsonSchema>;
    expect(enumLabel(props.frame, "space-truckers")).toBe("Space Truckers");
    expect(enumLabel(props.status, "accepted")).toBe("Accepted");
    const loc = entityTypes.find((t) => t.id === "alien.location")!;
    expect(enumLabel((loc.schema.properties as Record<string, JsonSchema>).region, "outer-rim")).toBe("Outer Rim");
  });

  it("titles every procedure input (and the columns of per-character inputs)", () => {
    const untitled: string[] = [];
    for (const p of procedures) {
      const props = (isRec(p.inputs) && isRec(p.inputs.properties) ? p.inputs.properties : {}) as Record<string, JsonSchema>;
      for (const [k, s] of Object.entries(props)) {
        if (typeof s.title !== "string") untitled.push(`${p.id} ${k}`);
        const items = isRec(s.items) && isRec(s.items.properties) ? (s.items.properties as Record<string, JsonSchema>) : {};
        for (const [ik, is] of Object.entries(items)) if (ik !== "id" && ik !== "name" && typeof is.title !== "string") untitled.push(`${p.id} ${k}[].${ik}`);
      }
    }
    expect(untitled).toEqual([]);
  });
});

describe("the NPC dossier", () => {
  const character = entityTypes.find((t) => t.id === "alien.character")!;
  const dossier = character.sheet.sections.find((s) => s.id === "npc")!;

  it("shows on NPCs and stays off a PC's sheet", () => {
    expect(sectionApplies(dossier, { isPC: false })).toBe(true);
    expect(sectionApplies(dossier, {})).toBe(true);
    expect(sectionApplies(dossier, { isPC: true })).toBe(false);
  });

  it("still shows on a PC when something in it is filled in", () => {
    expect(sectionApplies(dossier, { isPC: true, voice: "Gravelly" })).toBe(true);
  });
});

describe("template grammar", () => {
  it("knows plural cargo", () => {
    for (const p of ["metal ingots or pellets", "industrial gases", "weapons & armor", "livestock/animals", "pressure suits", "radioactives", "medicinal goods"]) expect(pluralCargo(p), p).toBe(true);
    for (const s of ["foodstuff", "timber", "ice/water", "oil", "ore", "single oversized item", "colony construction", "wreckage/salvage", "animal feed", "fertilizer"]) expect(pluralCargo(s), s).toBe(false);
  });

  it("never pairs plural cargo with a singular verb in a posting", () => {
    const pitches: string[] = [];
    for (let i = 0; i < 120; i++) {
      const g = runProcedure(jobBoard, mod, { seed: `grammar-${i}`, inputs: { postings: 3, frame: "space-truckers" } });
      for (const o of (g.results.offers as OfferSet).offers) pitches.push(String((o.produced.entities[0]!.fields.posting as { pitch: string }).pitch));
    }
    const seams = pitches.filter((t) => /\b(\w+s) goes to\b/i.test(t) && pluralCargo(t.match(/([\w/& ]+?) goes to/i)?.[1] ?? ""));
    expect(seams).toEqual([]);
    expect(pitches.some((t) => / go to /.test(t))).toBe(true);
  });

  it("names the thread's agent with 'a' once, then 'the'", () => {
    const later: string[] = [];
    for (let i = 0; i < 60; i++) {
      const g = runProcedure(campaignThread, mod, { seed: `agent-${i}`, inputs: { threads: 3 } });
      for (const o of (g.results.offers as OfferSet).offers) {
        const arc = o.arc as { stages: ThreadData["stages"] } | undefined;
        for (const st of arc?.stages ?? []) for (const c of st.clues) later.push(c.unlocks);
      }
    }
    expect(later.length).toBeGreaterThan(100);
    expect(later.filter((u) => /^(Names|Describes|Meets|Who) an? /.test(u))).toEqual([]);
    expect(later.some((u) => /^(Names|Describes|Meets|Who) the /.test(u))).toBe(true);
  });
});
