/**
 * The published schema files stay in step with `src/pack/schema.ts` (which the
 * compiler keeps in step with the contract types). Regenerate with
 * `pnpm --filter @campaign-forge/module-sdk gen-schema`.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import Ajv from "ajv";
import { describe, expect, it } from "vitest";
import { MODULE_PACK_PART_SCHEMA, MODULE_PACK_SCHEMA, MODULE_SUPPLEMENT_SCHEMA } from "../src";
import { oneOfValues, schemaObject } from "../src/pack/schema";

const files = [
  { file: new URL("../schema/module-pack.schema.json", import.meta.url), schema: MODULE_PACK_SCHEMA },
  { file: new URL("../schema/module-pack-part.schema.json", import.meta.url), schema: MODULE_PACK_PART_SCHEMA },
  { file: new URL("../schema/module-supplement.schema.json", import.meta.url), schema: MODULE_SUPPLEMENT_SCHEMA },
];
const render = (schema: unknown) => `${JSON.stringify(schema, null, 2)}\n`;

describe("published pack schema", () => {
  if (process.env.UPDATE_SCHEMA) {
    it("writes the schema files", () => {
      for (const f of files) writeFileSync(f.file, render(f.schema));
    });
    return;
  }

  it("matches the TypeScript source (run `pnpm --filter @campaign-forge/module-sdk gen-schema` after changing it)", () => {
    for (const f of files) {
      expect(existsSync(f.file), `${f.file.pathname} is missing`).toBe(true);
      expect(readFileSync(f.file, "utf8")).toBe(render(f.schema));
    }
  });

  it("cannot drift from the contract types (checked by `pnpm typecheck`)", () => {
    interface Shape {
      a: string;
      b?: number;
    }
    expect(schemaObject<Shape>()({ a: {}, b: {} }, ["a"]).required).toEqual(["a"]);
    // @ts-expect-error a property of the type is missing from the schema
    schemaObject<Shape>()({ a: {} }, ["a"]);
    // @ts-expect-error the schema has a property the type does not
    schemaObject<Shape>()({ a: {}, b: {}, c: {} }, ["a"]);
    // @ts-expect-error a required key of the type is not required
    schemaObject<Shape>()({ a: {}, b: {} }, []);
    // @ts-expect-error an enum misses a member of the union
    oneOfValues<"x" | "y">()(["x"]);
  });

  it("validates the example pack with a plain JSON Schema validator", () => {
    const dir = new URL("../../module-example/packs/example-pack/", import.meta.url);
    const ajv = new Ajv({ allErrors: true, strict: false });
    const pack = ajv.compile(JSON.parse(readFileSync(files[0]!.file, "utf8")));
    const part = ajv.compile(JSON.parse(readFileSync(files[1]!.file, "utf8")));
    expect(pack(JSON.parse(readFileSync(new URL("pack.json", dir), "utf8"))), JSON.stringify(pack.errors)).toBe(true);
    expect(part(JSON.parse(readFileSync(new URL("rules.part.json", dir), "utf8"))), JSON.stringify(part.errors)).toBe(true);
    expect(pack({ format: "campaign-forge-pack", formatVersion: 1 })).toBe(false);
  });
});
