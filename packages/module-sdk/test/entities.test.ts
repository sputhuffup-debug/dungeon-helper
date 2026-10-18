import { describe, expect, it } from "vitest";
import { computeFields, defaultFieldsFor, fieldSchemaAt, sheetFieldsForMode, validateEntityFields } from "../src/entities";
import type { EntityTypeDef } from "../src/types";

const def: EntityTypeDef = {
  id: "t.char",
  kind: "character",
  name: "Char",
  plural: "Chars",
  schema: {
    type: "object",
    properties: {
      attributes: {
        type: "object",
        properties: { str: { type: "integer", minimum: 1, maximum: 5, default: 2 }, agi: { type: "integer", default: 3 } },
        required: ["str"],
      },
      gear: { type: "array", items: { type: "object", properties: { name: { type: "string" }, weight: { type: "number" } } } },
      skills: { type: "object", additionalProperties: { type: "integer" } },
      email: { type: "string", format: "email" },
      kind: { type: "string", enum: ["a", "b"] },
      tags: { type: "array", items: { type: "string" } },
    },
    required: ["attributes", "tags"],
    additionalProperties: false,
  },
  computed: {
    health: { "+": [{ var: "fields.attributes.str" }, { var: "fields.attributes.agi" }] },
    half: { ceil: [{ "/": [{ var: "computed.health" }, 2] }] },
  },
  sheet: {
    sections: [
      { id: "a", title: "A", fields: [{ path: "attributes.str" }, { path: "attributes.agi", mode: ["x"] }] },
      { id: "b", title: "B", mode: ["y"], fields: [{ path: "kind" }] },
      { id: "c", title: "C", fields: [{ path: "email", mode: ["y"] }] },
    ],
  },
};

describe("validateEntityFields", () => {
  it("accepts valid fields and reports errors with dotted paths", () => {
    expect(validateEntityFields(def, { attributes: { str: 3 }, tags: [] })).toEqual({ valid: true, errors: [] });
    const res = validateEntityFields(def, { attributes: { str: 9 }, email: "nope", kind: "c", extra: 1 });
    expect(res.valid).toBe(false);
    const paths = res.errors.map((e) => e.path);
    expect(paths).toContain("attributes.str");
    expect(paths).toContain("email");
    expect(paths).toContain("kind");
    expect(paths).toContain("tags");
    expect(paths).toContain("extra");
    expect(res.errors.find((e) => e.path === "kind")?.message).toMatch(/a, b/);
    // Second call uses the cached validator.
    expect(validateEntityFields(def, { attributes: { str: 3 }, tags: [] }).valid).toBe(true);
  });
});

describe("computeFields", () => {
  it("evaluates rules in order, later ones reading earlier ones", () => {
    expect(computeFields(def, { attributes: { str: 3, agi: 2 } })).toEqual({ health: 5, half: 3 });
  });
});

describe("defaultFieldsFor", () => {
  it("collects schema defaults", () => {
    expect(defaultFieldsFor(def)).toEqual({ attributes: { str: 2, agi: 3 }, tags: [] });
  });
});

describe("sheetFieldsForMode", () => {
  it("filters sections and fields by mode", () => {
    const x = sheetFieldsForMode(def, "x");
    expect(x.map((s) => s.id)).toEqual(["a"]);
    expect(x[0]?.fields.map((f) => f.path)).toEqual(["attributes.str", "attributes.agi"]);
    const y = sheetFieldsForMode(def, "y");
    expect(y.map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(y[0]?.fields.map((f) => f.path)).toEqual(["attributes.str"]);
  });
});

describe("fieldSchemaAt", () => {
  it("walks properties, array items and wildcards", () => {
    expect(fieldSchemaAt(def, "attributes.str")).toMatchObject({ type: "integer" });
    expect(fieldSchemaAt(def, "gear[].name")).toEqual({ type: "string" });
    expect(fieldSchemaAt(def, "gear.0.weight")).toEqual({ type: "number" });
    expect(fieldSchemaAt(def, "skills.*")).toEqual({ type: "integer" });
    expect(fieldSchemaAt(def, "skills.anything")).toEqual({ type: "integer" });
    expect(fieldSchemaAt(def, "attributes.*")).toBeDefined();
    expect(fieldSchemaAt(def, "attributes.nope")).toBeUndefined();
    expect(fieldSchemaAt(def, "nope")).toBeUndefined();
    expect(fieldSchemaAt(def, "")).toBe(def.schema);
  });
});
