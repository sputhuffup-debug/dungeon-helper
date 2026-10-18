/**
 * Entity helpers: schema validation (Ajv draft-07), computed fields
 * (JSONLogic over { fields, computed }), schema defaults and sheet filtering.
 */
import Ajv, { type ErrorObject, type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import { evaluateLogic } from "./logic";
import type { EntityTypeDef, JsonSchema, PlayModeId, SheetSection } from "./types";

export interface FieldValidationError {
  path: string;
  message: string;
}

export interface FieldValidationResult {
  valid: boolean;
  errors: FieldValidationError[];
}

let ajvInstance: Ajv | undefined;
function ajv(): Ajv {
  if (!ajvInstance) {
    ajvInstance = new Ajv({ allErrors: true, strict: false, useDefaults: false, coerceTypes: false });
    addFormats(ajvInstance);
  }
  return ajvInstance;
}

const validatorCache = new WeakMap<EntityTypeDef, ValidateFunction>();
const schemaCache = new WeakMap<JsonSchema, ValidateFunction>();

/** Compile (and cache) a validator for an arbitrary schema object. */
export function compileSchema(schema: JsonSchema): ValidateFunction {
  let fn = schemaCache.get(schema);
  if (!fn) {
    fn = ajv().compile(schema);
    schemaCache.set(schema, fn);
  }
  return fn;
}

function pointerToPath(pointer: string): string {
  return pointer
    .split("/")
    .filter((s) => s !== "")
    .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"))
    .join(".");
}

function formatErrors(errors: ErrorObject[] | null | undefined): FieldValidationError[] {
  return (errors ?? []).map((e) => {
    let path = pointerToPath(e.instancePath);
    const params = e.params as Record<string, unknown>;
    if (e.keyword === "required" && typeof params.missingProperty === "string") {
      path = path ? `${path}.${params.missingProperty}` : params.missingProperty;
    } else if (e.keyword === "additionalProperties" && typeof params.additionalProperty === "string") {
      path = path ? `${path}.${params.additionalProperty}` : params.additionalProperty;
    }
    let message = e.message ?? e.keyword;
    if (e.keyword === "enum" && Array.isArray(params.allowedValues)) {
      message = `${message}: ${(params.allowedValues as unknown[]).map(String).join(", ")}`;
    }
    return { path, message };
  });
}

/** Validate an entity's `fields` against its type schema. Validators are cached per def. */
export function validateEntityFields(def: EntityTypeDef, fields: unknown): FieldValidationResult {
  let fn = validatorCache.get(def);
  if (!fn) {
    fn = ajv().compile(def.schema);
    validatorCache.set(def, fn);
  }
  const valid = fn(fields) === true;
  return { valid, errors: valid ? [] : formatErrors(fn.errors) };
}

/** Validate arbitrary data against a schema (used for presets and reference items). */
export function validateAgainstSchema(schema: JsonSchema, data: unknown): FieldValidationResult {
  const fn = compileSchema(schema);
  const valid = fn(data) === true;
  return { valid, errors: valid ? [] : formatErrors(fn.errors) };
}

/**
 * Evaluate `def.computed` rules in declaration order against
 * `{ fields, computed }`, so later rules can read earlier ones.
 */
export function computeFields(def: EntityTypeDef, fields: Record<string, unknown>): Record<string, unknown> {
  const computed: Record<string, unknown> = {};
  for (const [name, rule] of Object.entries(def.computed ?? {})) {
    computed[name] = evaluateLogic(rule, { fields, computed: { ...computed } });
  }
  return computed;
}

function clone<T>(v: T): T {
  return v === null || typeof v !== "object" ? v : (JSON.parse(JSON.stringify(v)) as T);
}

/** Build a default object from a JSON Schema's `default` values (recursing into object properties). */
export function schemaDefaults(schema: JsonSchema, root: JsonSchema = schema): Record<string, unknown> {
  const resolved = resolveRef(schema, root);
  const out: Record<string, unknown> = {};
  if (resolved.default !== undefined && typeof resolved.default === "object" && resolved.default !== null && !Array.isArray(resolved.default)) {
    Object.assign(out, clone(resolved.default as Record<string, unknown>));
  }
  const props = resolved.properties;
  const required = new Set(Array.isArray(resolved.required) ? (resolved.required as string[]) : []);
  if (props && typeof props === "object") {
    for (const [key, raw] of Object.entries(props as Record<string, unknown>)) {
      if (!raw || typeof raw !== "object") continue;
      const sub = resolveRef(raw as JsonSchema, root);
      if (sub.default !== undefined) {
        out[key] = clone(sub.default);
        continue;
      }
      const type = sub.type;
      const isObject = type === "object" || (type === undefined && sub.properties !== undefined);
      if (isObject) {
        const nested = schemaDefaults(sub, root);
        if (Object.keys(nested).length > 0 || required.has(key)) out[key] = nested;
      } else if (type === "array" && required.has(key)) {
        out[key] = [];
      }
    }
  }
  return out;
}

/** Default `fields` for a new entity of this type. */
export function defaultFieldsFor(def: EntityTypeDef): Record<string, unknown> {
  return schemaDefaults(def.schema);
}

function inMode(item: { mode?: PlayModeId[] }, mode: PlayModeId): boolean {
  return !item.mode || item.mode.length === 0 || item.mode.includes(mode);
}

/** Sheet sections and fields that apply to `mode`. Sections emptied by filtering are dropped. */
export function sheetFieldsForMode(def: EntityTypeDef, mode: PlayModeId): SheetSection[] {
  const out: SheetSection[] = [];
  for (const section of def.sheet.sections) {
    if (!inMode(section, mode)) continue;
    const fields = section.fields.filter((f) => inMode(f, mode));
    if (fields.length === 0 && section.fields.length > 0) continue;
    out.push({ ...section, fields });
  }
  return out;
}

function resolveRef(schema: JsonSchema, root: JsonSchema): JsonSchema {
  const ref = schema.$ref;
  if (typeof ref !== "string" || !ref.startsWith("#/")) return schema;
  let cur: unknown = root;
  for (const seg of ref.slice(2).split("/")) {
    if (!cur || typeof cur !== "object") return schema;
    cur = (cur as Record<string, unknown>)[seg.replace(/~1/g, "/").replace(/~0/g, "~")];
  }
  return cur && typeof cur === "object" ? (cur as JsonSchema) : schema;
}

function isSchema(v: unknown): v is JsonSchema {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Walk a schema along a dotted path. Supports "a.b", array items as "gear[].name"
 * or "gear.0.name", and "attributes.*" (additionalProperties / patternProperties /
 * any declared property). Returns undefined when the path does not exist.
 */
export function schemaAt(root: JsonSchema, path: string): JsonSchema | undefined {
  let cur: JsonSchema | undefined = resolveRef(root, root);
  if (path === "") return cur;
  const segs = path.split(".").flatMap((s) => {
    const parts: string[] = [];
    let rest = s;
    while (rest.endsWith("[]")) {
      rest = rest.slice(0, -2);
      parts.unshift("[]");
    }
    if (rest !== "") parts.unshift(rest);
    return parts;
  });
  for (const seg of segs) {
    if (!cur) return undefined;
    cur = resolveRef(cur, root);
    if (seg === "[]" || /^\d+$/.test(seg)) {
      const items = cur.items;
      if (isSchema(items)) {
        cur = items;
        continue;
      }
      if (Array.isArray(items)) {
        const idx = seg === "[]" ? 0 : Number(seg);
        const it = items[idx];
        if (isSchema(it)) {
          cur = it;
          continue;
        }
      }
      return undefined;
    }
    const props = isSchema(cur.properties) ? cur.properties : undefined;
    if (seg === "*") {
      if (isSchema(cur.additionalProperties)) {
        cur = cur.additionalProperties;
        continue;
      }
      const pattern = isSchema(cur.patternProperties) ? Object.values(cur.patternProperties).find(isSchema) : undefined;
      if (pattern) {
        cur = pattern;
        continue;
      }
      const any = props ? Object.values(props).filter(isSchema) : [];
      if (any.length > 0) {
        cur = any.length === 1 ? any[0] : { anyOf: any };
        continue;
      }
      if (cur.additionalProperties === true) {
        cur = {};
        continue;
      }
      return undefined;
    }
    if (props && isSchema(props[seg])) {
      cur = props[seg];
      continue;
    }
    if (isSchema(cur.additionalProperties)) {
      cur = cur.additionalProperties;
      continue;
    }
    if (isSchema(cur.patternProperties)) {
      const hit = Object.entries(cur.patternProperties).find(([re, s]) => isSchema(s) && new RegExp(re).test(seg));
      if (hit && isSchema(hit[1])) {
        cur = hit[1];
        continue;
      }
    }
    return undefined;
  }
  return cur;
}

/** The sub-schema at a dotted field path of the entity type (see `schemaAt`). */
export function fieldSchemaAt(def: EntityTypeDef, path: string): JsonSchema | undefined {
  return schemaAt(def.schema, path);
}
