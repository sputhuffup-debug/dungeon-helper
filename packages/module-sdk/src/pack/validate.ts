/**
 * Validating an untrusted data pack, before anything else touches it:
 *
 * 1. size and shape limits (bytes, nesting depth, string and list lengths)
 *    and no `__proto__` / `constructor` / `prototype` keys anywhere;
 * 2. the published JSON Schema (`schema.ts`);
 * 3. what the schema cannot say: every id starts with "<pack id>.", every
 *    JSONLogic expression uses known operators only, every embedded JSON
 *    Schema stays in the safe subset, the dice engine accepts its config.
 *
 * Issues carry a JSON path (`$.tables[3].rows[2].range`) and, when the path is
 * inside a collection item, that item's id.
 */
import Ajv, { type ErrorObject, type ValidateFunction } from "ajv";
import { createDiceEngine } from "../engines";
import { logicIssues } from "../logic";
import type { JsonLogicRule } from "../types";
import { MODULE_PACK_PART_SCHEMA, MODULE_PACK_SCHEMA, MODULE_SUPPLEMENT_PART_SCHEMA, MODULE_SUPPLEMENT_SCHEMA } from "./schema";
import { PACK_COLLECTIONS, PACK_FORMAT, PACK_PART_FORMAT, type ModulePack, type ModulePackPart, type PackCollections } from "./types";

export type PackIssueSource = "json" | "limits" | "schema" | "pack" | "conformance" | "lint" | "determinism";

export interface PackIssue {
  severity: "error" | "warning";
  /** JSON path into the pack file, e.g. "$.tables[3].rows[2]". "$" for the whole file. */
  path: string;
  message: string;
  /** Id of the collection item the path is in (e.g. the table id), when there is one. */
  item?: string;
  /** Which check found it. */
  source: PackIssueSource;
  /** The part file the path is in, for split packs. */
  file?: string;
}

export interface PackValidation<T> {
  ok: boolean;
  issues: PackIssue[];
  /** The validated pack (only when `ok`). */
  value?: T;
}

/** Caps on an imported pack. Generous for a full SRD, small enough to stop a hostile file early. */
export const PACK_LIMITS = {
  /** Bytes of JSON text in one file. */
  maxBytes: 16 * 1024 * 1024,
  /** Nesting depth of objects and lists. */
  maxDepth: 40,
  /** Characters in one string. */
  maxStringLength: 100_000,
  /** Items in one list. */
  maxArrayLength: 20_000,
  /** Keys in one object. */
  maxObjectKeys: 5_000,
  /** Files in one split pack. */
  maxParts: 64,
} as const;

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/** "$.tables[3].rows[2]" from path segments. */
export function jsonPath(segments: ReadonlyArray<string | number>): string {
  let out = "$";
  for (const s of segments) {
    if (typeof s === "number") out += `[${s}]`;
    else if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s)) out += `.${s}`;
    else out += `[${JSON.stringify(s)}]`;
  }
  return out;
}

function pointerSegments(pointer: string): Array<string | number> {
  return pointer
    .split("/")
    .slice(1)
    .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"))
    .map((s) => (/^\d+$/.test(s) ? Number(s) : s));
}

/** The id of the collection item a path points into (e.g. tables[3] -> its id). */
function itemAt(doc: unknown, segments: ReadonlyArray<string | number>): string | undefined {
  // a supplement's items for a base list: referenceItems[<list id>][i]
  if (segments[0] === "referenceItems" && typeof segments[1] === "string" && typeof segments[2] === "number") {
    const lists = (doc as { referenceItems?: Record<string, unknown> } | undefined)?.referenceItems;
    const items = lists?.[segments[1]];
    const item = Array.isArray(items) ? (items[segments[2]] as Record<string, unknown> | undefined) : undefined;
    return typeof item?.id === "string" ? item.id : undefined;
  }
  const [collection, index] = segments;
  if (typeof collection !== "string" || typeof index !== "number" || !(PACK_COLLECTIONS as readonly string[]).includes(collection)) return undefined;
  const list = (doc as Record<string, unknown> | undefined)?.[collection];
  const item = Array.isArray(list) ? (list[index] as Record<string, unknown> | undefined) : undefined;
  return typeof item?.id === "string" ? item.id : undefined;
}

/** One line for an issue: "$.tables[3].rows[2] (example.table.x): message". */
export function formatPackIssue(issue: PackIssue): string {
  return `${issue.file ? `${issue.file}: ` : ""}${issue.path}${issue.item ? ` (${issue.item})` : ""}: ${issue.message}`;
}

// ---------------------------------------------------------------------------
// 0. Parsing and limits
// ---------------------------------------------------------------------------

/** Parse pack JSON text, refusing oversized input. Throws an Error with a readable message. */
export function parsePackJson(text: string, name = "pack"): unknown {
  if (typeof text !== "string") throw new Error(`${name}: not text`);
  if (text.length > PACK_LIMITS.maxBytes) throw new Error(`${name}: ${(text.length / 1024 / 1024).toFixed(1)} MB is over the ${PACK_LIMITS.maxBytes / 1024 / 1024} MB limit; split the pack into parts`);
  try {
    return JSON.parse(text) as unknown;
  } catch (e) {
    throw new Error(`${name}: not valid JSON (${(e as Error).message})`);
  }
}

/** Depth, size and forbidden-key checks over any JSON value. */
export function checkLimits(value: unknown): PackIssue[] {
  const issues: PackIssue[] = [];
  const add = (segments: Array<string | number>, message: string) => {
    if (issues.length < 50) issues.push({ severity: "error", path: jsonPath(segments), message, source: "limits" });
  };
  const walk = (v: unknown, segments: Array<string | number>, depth: number): void => {
    if (issues.length >= 50) return;
    if (depth > PACK_LIMITS.maxDepth) return add(segments, `nested deeper than ${PACK_LIMITS.maxDepth} levels`);
    if (typeof v === "string") {
      if (v.length > PACK_LIMITS.maxStringLength) add(segments, `text longer than ${PACK_LIMITS.maxStringLength} characters`);
      return;
    }
    if (typeof v === "number") {
      if (!Number.isFinite(v)) add(segments, "number is not finite");
      return;
    }
    if (v === null || typeof v !== "object") return;
    if (Array.isArray(v)) {
      if (v.length > PACK_LIMITS.maxArrayLength) return add(segments, `list longer than ${PACK_LIMITS.maxArrayLength} items`);
      v.forEach((x, i) => walk(x, [...segments, i], depth + 1));
      return;
    }
    const keys = Object.keys(v);
    if (keys.length > PACK_LIMITS.maxObjectKeys) return add(segments, `object with more than ${PACK_LIMITS.maxObjectKeys} keys`);
    for (const k of keys) {
      if (FORBIDDEN_KEYS.has(k)) {
        add([...segments, k], `the key "${k}" is not allowed`);
        continue;
      }
      walk((v as Record<string, unknown>)[k], [...segments, k], depth + 1);
    }
  };
  walk(value, [], 0);
  return issues;
}

// ---------------------------------------------------------------------------
// 1. Schema
// ---------------------------------------------------------------------------

let validators: { pack: ValidateFunction; part: ValidateFunction } | undefined;
function schemaValidators(): { pack: ValidateFunction; part: ValidateFunction } {
  if (!validators) {
    // Our own, trusted schema. `strict: false` because draft-07 `if/then` with `definitions` trips strict mode.
    const ajv = new Ajv({ allErrors: true, strict: false });
    validators = { pack: ajv.compile(MODULE_PACK_SCHEMA), part: ajv.compile(MODULE_PACK_PART_SCHEMA) };
  }
  return validators;
}

let supplementValidator: ValidateFunction | undefined;
/** The compiled supplement schema (see `supplement.ts`). */
export function supplementSchemaValidator(): ValidateFunction {
  if (!supplementValidator) supplementValidator = new Ajv({ allErrors: true, strict: false }).compile(MODULE_SUPPLEMENT_SCHEMA);
  return supplementValidator;
}

let supplementPartValidator: ValidateFunction | undefined;
/** The compiled schema of a split supplement's part file. */
export function supplementPartSchemaValidator(): ValidateFunction {
  if (!supplementPartValidator) supplementPartValidator = new Ajv({ allErrors: true, strict: false }).compile(MODULE_SUPPLEMENT_PART_SCHEMA);
  return supplementPartValidator;
}

/** Schema errors as pack issues (shared with the supplement validator). */
export function schemaIssues(doc: unknown, errors: ErrorObject[] | null | undefined): PackIssue[] {
  const out: PackIssue[] = [];
  const seen = new Set<string>();
  for (const e of errors ?? []) {
    // "must match then schema" / "must match a schema in anyOf" repeat what the branch errors say.
    if (e.keyword === "if" || (e.keyword === "anyOf" && (errors ?? []).some((x) => x !== e && x.instancePath.startsWith(e.instancePath) && x.keyword !== "anyOf"))) continue;
    const segments = pointerSegments(e.instancePath);
    const params = e.params as Record<string, unknown>;
    let message = e.message ?? e.keyword;
    if (e.keyword === "additionalProperties" && typeof params.additionalProperty === "string") message = `unknown property "${params.additionalProperty}"`;
    else if (e.keyword === "required" && typeof params.missingProperty === "string") message = `missing required property "${params.missingProperty}"`;
    else if (e.keyword === "enum" && Array.isArray(params.allowedValues)) message = `must be one of: ${(params.allowedValues as unknown[]).map((v) => JSON.stringify(v)).join(", ")}`;
    else if (e.keyword === "const") message = `must be ${JSON.stringify(params.allowedValue)}`;
    const issue: PackIssue = { severity: "error", path: jsonPath(segments), message, source: "schema" };
    const item = itemAt(doc, segments);
    if (item) issue.item = item;
    const key = `${issue.path}|${message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(issue);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 2. What the schema cannot say
// ---------------------------------------------------------------------------

/** JSON Schema keywords an embedded schema may not use (code paths, regexes, remote refs). */
const UNSAFE_SCHEMA_KEYWORDS = new Set(["$data", "$async", "$id", "id", "pattern", "patternProperties", "propertyNames", "$schema", "$comment"]);

/** Keywords whose value maps names to sub-schemas. */
const SCHEMA_MAP_KEYWORDS = new Set(["properties", "definitions", "$defs", "dependencies"]);
/** Keywords whose value is data, not a schema. */
const SCHEMA_DATA_KEYWORDS = new Set(["default", "enum", "const", "examples", "required", "title", "description"]);

/** Problems with an embedded JSON Schema (entity fields, item schemas, procedure inputs). */
export function unsafeSchemaIssues(schema: unknown): Array<{ segments: Array<string | number>; message: string }> {
  const out: Array<{ segments: Array<string | number>; message: string }> = [];
  const walk = (node: unknown, segments: Array<string | number>): void => {
    if (Array.isArray(node)) {
      node.forEach((n, i) => walk(n, [...segments, i]));
      return;
    }
    if (node === null || typeof node !== "object") return;
    for (const [k, v] of Object.entries(node)) {
      const at = [...segments, k];
      if (UNSAFE_SCHEMA_KEYWORDS.has(k)) out.push({ segments: at, message: `JSON Schema keyword "${k}" is not allowed in a pack` });
      if (k === "$ref" && (typeof v !== "string" || !v.startsWith("#/"))) out.push({ segments: at, message: `$ref must point inside the same schema ("#/...")` });
      // Data, and app hints such as "x-entity", are not schemas.
      if (SCHEMA_DATA_KEYWORDS.has(k) || k.startsWith("x-")) continue;
      if (SCHEMA_MAP_KEYWORDS.has(k) && v && typeof v === "object" && !Array.isArray(v)) {
        for (const [name, sub] of Object.entries(v as Record<string, unknown>)) walk(sub, [...at, name]);
        continue;
      }
      walk(v, at);
    }
  };
  walk(schema, []);
  return out;
}

const PATH_SEGMENT_FORBIDDEN = /(^|\.)(__proto__|constructor|prototype)(\.|$)/;

export interface Walker {
  error(segments: Array<string | number>, message: string): void;
  warn(segments: Array<string | number>, message: string): void;
}

function checkLogicAt(rule: unknown, segments: Array<string | number>, w: Walker): void {
  if (rule === undefined) return;
  for (const issue of logicIssues(rule as JsonLogicRule)) w.error(segments, `JSONLogic: ${issue}`);
}

function checkSchemaAt(schema: unknown, segments: Array<string | number>, w: Walker): void {
  if (schema === undefined) return;
  for (const i of unsafeSchemaIssues(schema)) w.error([...segments, ...i.segments], i.message);
}

function asList(v: unknown): Array<Record<string, unknown>> {
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Array<Record<string, unknown>>) : [];
}

/** Namespacing, JSONLogic and embedded-schema checks over the collections of a pack, a part or a supplement. */
export function semanticChecks(doc: PackCollections & Record<string, unknown>, packId: string, w: Walker): void {
  const prefix = `${packId}.`;
  const ns = (id: unknown, segments: Array<string | number>, what: string) => {
    if (typeof id === "string" && !id.startsWith(prefix)) w.error(segments, `${what} id "${id}" must start with "${prefix}" (ids are namespaced by the pack id)`);
  };
  const what: Record<string, string> = {
    entityTypes: "entity type",
    relationshipTypes: "relationship type",
    referenceLists: "reference list",
    presets: "preset",
    tables: "table",
    procedures: "procedure",
    templates: "template",
    rules: "rule card",
    trackers: "tracker",
    playGuides: "play guide",
  };
  for (const c of PACK_COLLECTIONS) {
    asList(doc[c]).forEach((item, i) => ns(item.id, [c, i, "id"], what[c] ?? c));
  }

  asList(doc.entityTypes).forEach((t, i) => {
    checkSchemaAt(t.schema, ["entityTypes", i, "schema"], w);
    for (const [k, rule] of Object.entries((t.computed as Record<string, unknown> | undefined) ?? {})) checkLogicAt(rule, ["entityTypes", i, "computed", k], w);
    asList(t.subtypes).forEach((s, j) => checkSchemaAt(s.schema, ["entityTypes", i, "subtypes", j, "schema"], w));
    const sheet = t.sheet as { sections?: unknown } | undefined;
    asList(sheet?.sections).forEach((s, j) =>
      asList(s.fields).forEach((f, k) => {
        if (typeof f.path === "string" && PATH_SEGMENT_FORBIDDEN.test(f.path)) w.error(["entityTypes", i, "sheet", "sections", j, "fields", k, "path"], "field path uses a reserved name");
      }),
    );
  });
  asList(doc.referenceLists).forEach((l, i) => checkSchemaAt(l.itemSchema, ["referenceLists", i, "itemSchema"], w));
  asList(doc.tables).forEach((t, i) =>
    asList(t.modifiers).forEach((m, j) => {
      checkLogicAt(m.when, ["tables", i, "modifiers", j, "when"], w);
      checkLogicAt(m.add, ["tables", i, "modifiers", j, "add"], w);
    }),
  );
  asList(doc.procedures).forEach((p, i) => {
    const at = (...rest: Array<string | number>) => ["procedures", i, ...rest];
    checkSchemaAt(p.inputs, at("inputs"), w);
    asList(p.steps).forEach((s, j) => {
      const does = ["table", "roll", "value"].filter((k) => s[k] !== undefined);
      if (does.length === 0) w.error(at("steps", j), "step needs one of table, roll or value");
      if (s.table !== undefined && (s.roll !== undefined || s.value !== undefined)) w.error(at("steps", j), "a table step cannot also have roll or value");
      if (s.table !== undefined && typeof s.table !== "string") checkLogicAt(s.table, at("steps", j, "table"), w);
      checkLogicAt(s.value, at("steps", j, "value"), w);
      checkLogicAt(s.skipIf, at("steps", j, "skipIf"), w);
      if (s.repeat !== undefined && typeof s.repeat === "object") checkLogicAt(s.repeat, at("steps", j, "repeat"), w);
      checkLogicAt(s.modifier, at("steps", j, "modifier"), w);
      for (const [k, rule] of Object.entries((s.derive as Record<string, unknown> | undefined) ?? {})) checkLogicAt(rule, at("steps", j, "derive", k), w);
      checkLogicAt(s.display, at("steps", j, "display"), w);
    });
    const produce = (p.produce ?? {}) as Record<string, unknown>;
    asList(produce.entities).forEach((e, j) => {
      const pe = (...rest: Array<string | number>) => at("produce", "entities", j, ...rest);
      for (const k of ["preset", "name", "summary", "when", "each"]) checkLogicAt(e[k], pe(k), w);
      for (const [path, rule] of Object.entries((e.fields as Record<string, unknown> | undefined) ?? {})) {
        if (PATH_SEGMENT_FORBIDDEN.test(path)) w.error(pe("fields", path), "field path uses a reserved name");
        checkLogicAt(rule, pe("fields", path), w);
      }
      asList(e.links).forEach((l, k) => checkLogicAt(l.note, pe("links", k, "note"), w));
    });
    asList(produce.relationships).forEach((r, j) => {
      checkLogicAt(r.note, at("produce", "relationships", j, "note"), w);
      checkLogicAt(r.when, at("produce", "relationships", j, "when"), w);
    });
    asList(p.chains).forEach((ch, j) => {
      for (const [k, rule] of Object.entries((ch.inputs as Record<string, unknown> | undefined) ?? {})) checkLogicAt(rule, at("chains", j, "inputs", k), w);
    });
  });
}

export function walkerFor(issues: PackIssue[], doc: unknown, source: PackIssueSource = "pack"): Walker {
  const push = (severity: PackIssue["severity"], segments: Array<string | number>, message: string) => {
    const issue: PackIssue = { severity, path: jsonPath(segments), message, source };
    const item = itemAt(doc, segments);
    if (item) issue.item = item;
    issues.push(issue);
  };
  return { error: (s, m) => push("error", s, m), warn: (s, m) => push("warning", s, m) };
}

/** ok when no issue is an error; the value only when ok. */
export function finishValidation<T>(issues: PackIssue[], value: T): PackValidation<T> {
  const ok = !issues.some((i) => i.severity === "error");
  return ok ? { ok, issues, value } : { ok, issues };
}

/** Validate a pack (the main file of a split pack is validated on its own here; see `mergePackParts`). */
export function validatePack(input: unknown): PackValidation<ModulePack> {
  const limits = checkLimits(input);
  if (limits.length > 0) return { ok: false, issues: limits };
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, issues: [{ severity: "error", path: "$", message: "a pack is a JSON object", source: "schema" }] };
  const doc = input as Record<string, unknown>;
  if (doc.format === PACK_PART_FORMAT) return { ok: false, issues: [{ severity: "error", path: "$.format", message: "this is a part of a split pack; import it together with the pack's main file", source: "schema" }] };
  if (doc.format !== PACK_FORMAT) return { ok: false, issues: [{ severity: "error", path: "$.format", message: `not a Campaign Forge data pack (format must be "${PACK_FORMAT}")`, source: "schema" }] };
  const { pack } = schemaValidators();
  if (!pack(input)) return { ok: false, issues: schemaIssues(input, pack.errors) };
  const p = input as unknown as ModulePack;
  const issues: PackIssue[] = [];
  const w = walkerFor(issues, p);
  semanticChecks(p as unknown as PackCollections & Record<string, unknown>, p.manifest.id, w);
  if (p.calendar && !p.calendar.id.startsWith(`${p.manifest.id}.`)) w.error(["calendar", "id"], `calendar id "${p.calendar.id}" must start with "${p.manifest.id}."`);
  checkLogicAt((p.dice as unknown as Record<string, unknown>).proficiency, ["dice", "proficiency"], w);
  checkLogicAt((p.dice as unknown as Record<string, unknown>).bonus, ["dice", "bonus"], w);
  checkLogicAt((p.dice as unknown as Record<string, unknown>).stat, ["dice", "stat"], w);
  checkLogicAt((p.dice as unknown as Record<string, unknown>).target, ["dice", "target"], w);
  asList((p.dice as unknown as Record<string, unknown>).dice).forEach((d, i) => checkLogicAt(d.count, ["dice", "dice", i, "count"], w));
  try {
    createDiceEngine(p.dice);
  } catch (e) {
    w.error(["dice"], (e as Error).message);
  }
  if (!p.manifest.modes.some((m) => m.id === p.manifest.defaultMode)) w.error(["manifest", "defaultMode"], `"${p.manifest.defaultMode}" is not one of the declared modes`);
  return finishValidation(issues, p);
}

/** Validate one part of a split pack. */
export function validatePackPart(input: unknown, expectedPack?: string): PackValidation<ModulePackPart> {
  const limits = checkLimits(input);
  if (limits.length > 0) return { ok: false, issues: limits };
  if (!input || typeof input !== "object" || (input as Record<string, unknown>).format !== PACK_PART_FORMAT) {
    return { ok: false, issues: [{ severity: "error", path: "$.format", message: `not a pack part (format must be "${PACK_PART_FORMAT}")`, source: "schema" }] };
  }
  const { part } = schemaValidators();
  if (!part(input)) return { ok: false, issues: schemaIssues(input, part.errors) };
  const p = input as unknown as ModulePackPart;
  if (expectedPack !== undefined && p.pack !== expectedPack) return { ok: false, issues: [{ severity: "error", path: "$.pack", message: `part belongs to pack "${p.pack}", not "${expectedPack}"`, source: "pack" }] };
  const issues: PackIssue[] = [];
  semanticChecks(p as unknown as PackCollections & Record<string, unknown>, p.pack, walkerFor(issues, p));
  return finishValidation(issues, p);
}

/**
 * Join a pack's main file and its parts into one self-contained pack (no
 * `parts`). Every part the main file lists must be given, once, and belong to
 * this pack. Each file is validated on its own first; issues name the file.
 */
export function mergePackParts(mainInput: unknown, partInputs: ReadonlyArray<{ name?: string; data: unknown }> = []): PackValidation<ModulePack> {
  const main = validatePack(mainInput);
  if (!main.ok || !main.value) return main;
  const pack = main.value;
  const declared = pack.parts ?? [];
  const issues: PackIssue[] = [...main.issues];
  if (partInputs.length > PACK_LIMITS.maxParts) return { ok: false, issues: [{ severity: "error", path: "$.parts", message: `more than ${PACK_LIMITS.maxParts} parts`, source: "limits" }] };
  const parts: ModulePackPart[] = [];
  const seen = new Set<string>();
  for (const input of partInputs) {
    const res = validatePackPart(input.data, pack.manifest.id);
    const file = input.name ?? (input.data as { name?: string } | undefined)?.name ?? "part";
    for (const i of res.issues) issues.push({ ...i, file });
    if (!res.ok || !res.value) continue;
    const part = res.value;
    if (!declared.includes(part.name)) issues.push({ severity: "error", path: "$.name", message: `part "${part.name}" is not listed in the pack's parts (${declared.join(", ") || "none"})`, source: "pack", file });
    else if (seen.has(part.name)) issues.push({ severity: "error", path: "$.name", message: `part "${part.name}" was given twice`, source: "pack", file });
    else {
      seen.add(part.name);
      parts.push(part);
    }
  }
  for (const name of declared) if (!seen.has(name) && !issues.some((i) => i.file === name)) issues.push({ severity: "error", path: "$.parts", message: `part "${name}" is missing`, source: "pack" });
  if (issues.some((i) => i.severity === "error")) return { ok: false, issues };
  if (parts.length === 0 && declared.length === 0) return { ok: true, issues, value: pack };
  const merged: ModulePack & Record<string, unknown> = { ...pack };
  delete merged.parts;
  // Parts are joined in the order the pack lists them, so the result does not depend on file order.
  const ordered = declared.map((n) => parts.find((p) => p.name === n)!);
  for (const c of PACK_COLLECTIONS) {
    const all = [...((pack[c] as unknown[] | undefined) ?? []), ...ordered.flatMap((p) => (p[c] as unknown[] | undefined) ?? [])];
    if (all.length > 0) (merged as Record<string, unknown>)[c] = all;
  }
  return { ok: true, issues, value: merged };
}
