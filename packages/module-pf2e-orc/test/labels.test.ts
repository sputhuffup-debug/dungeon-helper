/**
 * What the GM reads: every enum the pack declares (entity fields, procedure
 * inputs, reference list columns) carries `enumLabels`, one per value, so no
 * raw id ("unarmored") reaches a select, a sheet or the Atlas.
 */
import { enumLabel, moduleFromPackSource, type GameModule, type JsonSchema } from "@campaign-forge/module-sdk";
import { beforeAll, describe, expect, it } from "vitest";
import { pf2eOrcSource } from "../src";

let module: GameModule;
beforeAll(async () => {
  module = await moduleFromPackSource(pf2eOrcSource);
}, 60_000);

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Every enum under a schema, with its path. */
function enums(schema: unknown, path: string, out: Array<{ path: string; schema: JsonSchema }> = []): Array<{ path: string; schema: JsonSchema }> {
  if (!isRec(schema)) return out;
  if (Array.isArray(schema.enum)) out.push({ path, schema: schema as JsonSchema });
  if (isRec(schema.properties)) for (const [k, v] of Object.entries(schema.properties)) enums(v, path ? `${path}.${k}` : k, out);
  if (isRec(schema.items)) enums(schema.items, `${path}[]`, out);
  return out;
}

describe("labels", () => {
  it("gives every enum a label per value", () => {
    const all = [
      ...module.entityTypes.flatMap((t) => enums(t.schema, "").map((e) => ({ ...e, where: t.id }))),
      ...(module.procedures ?? []).flatMap((p) => enums(p.inputs, "").map((e) => ({ ...e, where: `${p.id} input` }))),
      ...(module.referenceLists ?? []).flatMap((l) => enums(l.itemSchema, "").map((e) => ({ ...e, where: `${l.id} list` }))),
    ];
    expect(all.length).toBeGreaterThan(20);
    const missing = all.filter(({ schema }) => {
      const labels = schema.enumLabels;
      return !Array.isArray(labels) || labels.length !== (schema.enum as unknown[]).length || labels.some((l) => typeof l !== "string" || !l.trim());
    });
    expect(missing.map((m) => `${m.where} ${m.path}`)).toEqual([]);
  });

  it("names values as people say them", () => {
    const pc = module.entityTypes.find((t) => (t.schema.properties as Record<string, JsonSchema> | undefined)?.initiativeSkill)!;
    const props = pc.schema.properties as Record<string, JsonSchema>;
    expect(enumLabel(props.initiativeSkill, "occultism")).toBe("Occultism");
    expect(enumLabel(props.partialBoosts, "charisma")).toBe("Charisma");
    expect(enumLabel((props.armor!.properties as Record<string, JsonSchema>).category, "unarmored")).toBe("Unarmored");
  });
});
