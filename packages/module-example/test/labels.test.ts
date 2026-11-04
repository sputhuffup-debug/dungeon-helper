/**
 * What the GM reads: every enum the example module and its data pack declare
 * (entity fields, template fields, procedure inputs, reference list columns)
 * carries `enumLabels`, one per value, so no raw id reaches a select or sheet.
 */
import { enumLabel, moduleFromPackSource, type GameModule, type JsonSchema } from "@campaign-forge/module-sdk";
import { describe, expect, it } from "vitest";
import { examplePackSource } from "../src";
import { exampleModule } from "../src/index";

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Every enum under a schema, with its path. */
function enums(schema: unknown, path: string, out: Array<{ path: string; schema: JsonSchema }> = []): Array<{ path: string; schema: JsonSchema }> {
  if (!isRec(schema)) return out;
  if (Array.isArray(schema.enum)) out.push({ path, schema: schema as JsonSchema });
  if (isRec(schema.properties)) for (const [k, v] of Object.entries(schema.properties)) enums(v, path ? `${path}.${k}` : k, out);
  if (isRec(schema.items)) enums(schema.items, `${path}[]`, out);
  return out;
}

function unlabelled(module: GameModule): string[] {
  const all = [
    ...module.entityTypes.flatMap((t) => enums(t.schema, "").map((e) => ({ ...e, where: t.id }))),
    ...module.templates.flatMap((t) => enums((t as { schema?: unknown }).schema, "").map((e) => ({ ...e, where: `${t.kind} template` }))),
    ...module.procedures.flatMap((p) => enums(p.inputs, "").map((e) => ({ ...e, where: `${p.id} input` }))),
    ...module.referenceLists.flatMap((l) => enums(l.itemSchema, "").map((e) => ({ ...e, where: `${l.id} list` }))),
  ];
  expect(all.length).toBeGreaterThan(3);
  return all
    .filter(({ schema }) => {
      const labels = schema.enumLabels;
      return !Array.isArray(labels) || labels.length !== (schema.enum as unknown[]).length || labels.some((l) => typeof l !== "string" || !l.trim());
    })
    .map((m) => `${m.where} ${m.path}`);
}

describe("labels", () => {
  it("gives every enum of the TypeScript module a label per value", () => {
    expect(unlabelled(exampleModule)).toEqual([]);
    const location = exampleModule.entityTypes.find((t) => (t.schema.properties as Record<string, JsonSchema> | undefined)?.terrain)!;
    expect(enumLabel((location.schema.properties as Record<string, JsonSchema>).danger, "uneasy")).toBe("Uneasy");
  });

  it("gives every enum of the data pack a label per value", async () => {
    const pack = await moduleFromPackSource(examplePackSource);
    expect(unlabelled(pack)).toEqual([]);
    const pc = pack.entityTypes.find((t) => (t.schema.properties as Record<string, JsonSchema> | undefined)?.background)!;
    expect(enumLabel((pc.schema.properties as Record<string, JsonSchema>).background, "wanderer")).toBe("Wanderer");
  });
});
