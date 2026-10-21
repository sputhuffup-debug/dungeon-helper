/**
 * Supplements: additive JSON data for an existing module.
 *
 * A supplement names the module it extends (and optionally a semver range of
 * its versions) and adds to it: items for the module's own reference lists,
 * new reference lists, presets, tables, procedures, templates, rule cards and
 * play guides. It never overrides or removes anything, and it carries no code
 * (every expression is JSONLogic, as in a data pack). Every id it adds starts
 * with "<supplement id>.", so its content can always be told apart from the
 * module's and from other supplements'.
 *
 * The path from untrusted JSON to a merged module:
 *
 * 1. `validateSupplement`: size limits, the published JSON Schema
 *    (`schema/module-supplement.schema.json`), namespacing, JSONLogic and the
 *    safe JSON Schema subset (the same checks as a data pack);
 * 2. `checkSupplementAgainst`: the base module is the one it extends, in a
 *    version it accepts, and every list it adds to exists there (items are
 *    checked against the list's `itemSchema`);
 * 3. `applySupplements`: merge, in a fixed order (by supplement id), so the
 *    same module version plus the same supplements always give the same
 *    module; added reference items carry `source` (the supplement's name) and
 *    the module's manifest lists the applied supplements;
 * 4. `checkSupplement` runs all of that plus the conformance suite and the
 *    determinism check on the merged module, keeping only the issues about the
 *    supplement's own content.
 */
import { checkDeterminism } from "../determinism";
import { validateAgainstSchema } from "../entities";
import { checkModule, type ConformanceIssue } from "../module";
import type { AppliedSupplement, EntityPreset, GameModule, ReferenceItem, ReferenceList } from "../types";
import { conformanceToPackIssues, procedureFromPack, type PresetLookup } from "./loader";
import { PACK_FORMAT, PACK_PART_FORMAT, SUPPLEMENT_COLLECTIONS, SUPPLEMENT_FORMAT, type ModulePack, type ModuleSupplement, type PackCollections } from "./types";
import { checkLimits, finishValidation, jsonPath, schemaIssues, semanticChecks, supplementSchemaValidator, walkerFor, type PackIssue, type PackValidation } from "./validate";

// ---------------------------------------------------------------------------
// Semver ranges (the small subset supplements need)
// ---------------------------------------------------------------------------

type Triple = [number, number, number];
type Comparator = { op: ">=" | ">" | "<=" | "<" | "="; v: Triple };

const VERSION_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function parseVersion(v: string): Triple | undefined {
  const m = VERSION_RE.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : undefined;
}

function cmp(a: Triple, b: Triple): number {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! < b[i]! ? -1 : 1;
  return 0;
}

/** "1", "1.2", "1.2.3", "1.x", "1.2.*": the numbers given (undefined for missing or wildcard parts). */
function parsePartial(s: string): Array<number | undefined> | undefined {
  const m = /^v?(\d+|[xX*])(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?(?:-[0-9A-Za-z.-]+)?$/.exec(s);
  if (!m) return undefined;
  const parts = [m[1], m[2], m[3]].map((p) => (p === undefined || /^[xX*]$/.test(p) ? undefined : Number(p)));
  // nothing given after a wildcard ("1.x.3" is not a range)
  const firstWild = parts.findIndex((p) => p === undefined);
  if (firstWild !== -1 && parts.slice(firstWild).some((p) => p !== undefined)) return undefined;
  return parts;
}

function comparatorsOf(token: string): Comparator[] | undefined {
  if (token === "*" || token === "x" || token === "X" || token === "") return [];
  const m = /^(\^|~|>=|<=|>|<|=)?(.+)$/.exec(token);
  if (!m) return undefined;
  const op = m[1] ?? "";
  const p = parsePartial(m[2]!);
  if (!p) return undefined;
  const [maj, min, pat] = p;
  if (maj === undefined) return op === "" || op === "=" || op === ">=" || op === "<=" ? [] : undefined;
  const low: Triple = [maj, min ?? 0, pat ?? 0];
  switch (op) {
    case "^": {
      const high: Triple = maj > 0 || min === undefined ? [maj + 1, 0, 0] : min > 0 || pat === undefined ? [0, min + 1, 0] : [0, 0, pat + 1];
      return [{ op: ">=", v: low }, { op: "<", v: high }];
    }
    case "~": {
      const high: Triple = min === undefined ? [maj + 1, 0, 0] : [maj, min + 1, 0];
      return [{ op: ">=", v: low }, { op: "<", v: high }];
    }
    case ">=":
    case ">":
    case "<=":
    case "<":
      return [{ op, v: low }];
    default: {
      // "1.2.3" exactly; "1.2" / "1.2.x" any patch; "1" / "1.x" any minor
      if (pat !== undefined && min !== undefined) return [{ op: "=", v: low }];
      const high: Triple = min === undefined ? [maj + 1, 0, 0] : [maj, min + 1, 0];
      return [{ op: ">=", v: low }, { op: "<", v: high }];
    }
  }
}

function parseRange(range: string): Comparator[][] | undefined {
  const sets: Comparator[][] = [];
  for (const alt of range.split("||")) {
    const tokens = alt
      .trim()
      .replace(/(\^|~|>=|<=|>|<|=)\s+/g, "$1")
      .split(/\s+/)
      .filter(Boolean);
    const set: Comparator[] = [];
    for (const t of tokens) {
      const c = comparatorsOf(t);
      if (!c) return undefined;
      set.push(...c);
    }
    sets.push(set);
  }
  return sets.length > 0 ? sets : undefined;
}

/** Whether `range` is a semver range this SDK understands ("^0.1.0", "~1.2", ">=1.0.0 <2.0.0", "1.x", "*", "a || b"). */
export function isValidVersionRange(range: string): boolean {
  return parseRange(range) !== undefined;
}

/** Whether `version` (semver) is in `range`. An unparseable version or range never matches. */
export function satisfiesVersionRange(version: string, range: string): boolean {
  const v = parseVersion(version);
  const sets = parseRange(range);
  if (!v || !sets) return false;
  return sets.some((set) =>
    set.every((c) => {
      const d = cmp(v, c.v);
      return c.op === ">=" ? d >= 0 : c.op === ">" ? d > 0 : c.op === "<=" ? d <= 0 : c.op === "<" ? d < 0 : d === 0;
    }),
  );
}

// ---------------------------------------------------------------------------
// 1. Validation on its own
// ---------------------------------------------------------------------------

/** Top-level keys a supplement may not have, with the reason (checked before the schema, for a clearer message). */
const NOT_IN_SUPPLEMENTS: Record<string, string> = {
  entityTypes: "a supplement cannot add or change entity types (sheets); it adds data only",
  relationshipTypes: "a supplement cannot add relationship types",
  trackers: "a supplement cannot add trackers",
  dice: "a supplement cannot change the dice; it uses the base module's",
  calendar: "a supplement cannot change the calendar",
  parts: "a supplement is one file (no parts)",
  styleNotes: "a supplement has no style notes",
};

/** Validate a supplement on its own: limits, schema, namespacing, JSONLogic, safe embedded schemas. */
export function validateSupplement(input: unknown): PackValidation<ModuleSupplement> {
  const limits = checkLimits(input);
  if (limits.length > 0) return { ok: false, issues: limits };
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, issues: [{ severity: "error", path: "$", message: "a supplement is a JSON object", source: "schema" }] };
  const doc = input as Record<string, unknown>;
  if (doc.format === PACK_FORMAT || doc.format === PACK_PART_FORMAT) {
    return { ok: false, issues: [{ severity: "error", path: "$.format", message: `this is a data pack, not a supplement (a supplement has "format": "${SUPPLEMENT_FORMAT}")`, source: "schema" }] };
  }
  if (doc.format !== SUPPLEMENT_FORMAT) return { ok: false, issues: [{ severity: "error", path: "$.format", message: `not a Campaign Forge supplement (format must be "${SUPPLEMENT_FORMAT}")`, source: "schema" }] };
  const early: PackIssue[] = [];
  for (const [key, why] of Object.entries(NOT_IN_SUPPLEMENTS)) if (key in doc) early.push({ severity: "error", path: jsonPath([key]), message: why, source: "schema" });
  const validate = supplementSchemaValidator();
  if (!validate(input)) {
    const known = new Set(Object.keys(NOT_IN_SUPPLEMENTS));
    // the early messages say it better than "unknown property"
    const rest = schemaIssues(input, validate.errors).filter((i) => !(i.path === "$" && [...known].some((k) => i.message === `unknown property "${k}"`)));
    return { ok: false, issues: [...early, ...rest] };
  }
  if (early.length > 0) return { ok: false, issues: early };
  const s = input as unknown as ModuleSupplement;
  const id = s.manifest.id;
  const prefix = `${id}.`;
  const issues: PackIssue[] = [];
  const w = walkerFor(issues, s);
  semanticChecks(s as unknown as PackCollections & Record<string, unknown>, id, w);
  if (s.manifest.extends.module === id) w.error(["manifest", "id"], `a supplement's id cannot be the id of the module it extends ("${id}")`);
  const range = s.manifest.extends.version;
  if (range !== undefined && !isValidVersionRange(range)) w.error(["manifest", "extends", "version"], `"${range}" is not a semver range (try "^0.1.0", ">=0.1.0 <0.2.0" or "*")`);
  for (const [listId, items] of Object.entries(s.referenceItems ?? {})) {
    const seen = new Set<string>();
    items.forEach((item, i) => {
      const at = ["referenceItems", listId, i, "id"];
      if (!item.id.startsWith(prefix)) w.error(at, `reference item id "${item.id}" must start with "${prefix}" (ids are namespaced by the supplement id)`);
      if (seen.has(item.id)) w.error(at, `duplicate item id "${item.id}" in the items for "${listId}"`);
      seen.add(item.id);
    });
    if (items.length === 0) w.warn(["referenceItems", listId], "no items");
  }
  // Rule cards and tables cite their source (rule 2). A bare page number would point at the base module's book.
  for (const c of ["rules", "tables"] as const) {
    (s[c] ?? []).forEach((x: { page?: unknown; cite?: string; original?: boolean }, i: number) => {
      if (x.cite === undefined && !x.original) {
        if (x.page !== undefined) w.warn([c, i], `a page number here points at the base module's book; say which book with "cite" (e.g. "My Setting Guide, p. 12") or mark it "original"`);
        else w.error([c, i], `needs "cite" (the book or document it comes from) or "original": true`);
      }
    });
  }
  return finishValidation(issues, s);
}

// ---------------------------------------------------------------------------
// 2. Against the base module
// ---------------------------------------------------------------------------

/** Problems with applying a validated supplement to `base`: wrong module or version, lists or entity types it does not have. */
export function checkSupplementAgainst(supplement: ModuleSupplement, base: Pick<GameModule, "manifest" | "referenceLists" | "entityTypes" | "presets" | "tables" | "rules" | "procedures" | "templates" | "playGuides">): PackIssue[] {
  const issues: PackIssue[] = [];
  const w = walkerFor(issues, supplement);
  const m = supplement.manifest;
  if (m.extends.module !== base.manifest.id) {
    w.error(["manifest", "extends", "module"], `this supplement extends "${m.extends.module}", not "${base.manifest.id}"`);
    return issues;
  }
  if (m.extends.version !== undefined && !satisfiesVersionRange(base.manifest.version, m.extends.version)) {
    w.error(["manifest", "extends", "version"], `this supplement needs ${m.extends.module} ${m.extends.version}, but the module is version ${base.manifest.version}`);
  }
  const lists = new Map(base.referenceLists.map((l) => [l.id, l]));
  for (const [listId, items] of Object.entries(supplement.referenceItems ?? {})) {
    const list = lists.get(listId);
    if (!list) {
      const known = base.referenceLists.map((l) => l.id);
      w.error(["referenceItems", listId], `"${base.manifest.id}" has no reference list "${listId}" (it has: ${known.slice(0, 40).join(", ")}${known.length > 40 ? ", …" : ""})`);
      continue;
    }
    const existing = new Set(list.items.map((i) => i.id));
    items.forEach((item, i) => {
      if (existing.has(item.id)) w.error(["referenceItems", listId, i, "id"], `"${listId}" already has an item "${item.id}"`);
      if (list.itemSchema) {
        for (const err of validateAgainstSchema(list.itemSchema, item).errors) w.error(["referenceItems", listId, i], `does not fit the list's item schema: ${err.path} ${err.message}`.trim());
      }
    });
  }
  const types = new Set(base.entityTypes.map((t) => t.id));
  (supplement.presets ?? []).forEach((p, i) => {
    if (!types.has(p.entityType)) w.error(["presets", i, "entityType"], `"${base.manifest.id}" has no entity type "${p.entityType}" (it has: ${[...types].join(", ")})`);
  });
  // Namespacing keeps ids apart; a clash means the base module itself uses the supplement's prefix.
  const taken = new Set<string>([...base.referenceLists, ...base.presets, ...base.tables, ...base.rules, ...base.procedures, ...base.templates, ...(base.playGuides ?? [])].map((x) => x.id));
  for (const c of SUPPLEMENT_COLLECTIONS) {
    ((supplement[c] ?? []) as Array<{ id: string }>).forEach((x, i) => {
      if (taken.has(x.id)) w.error([c, i, "id"], `"${base.manifest.id}" already has "${x.id}"`);
    });
  }
  return issues;
}

// ---------------------------------------------------------------------------
// 3. Merging
// ---------------------------------------------------------------------------

const byId = (a: ModuleSupplement, b: ModuleSupplement) => (a.manifest.id < b.manifest.id ? -1 : a.manifest.id > b.manifest.id ? 1 : 0);

function withSource(items: ReferenceItem[], source: string): ReferenceItem[] {
  return items.map((i) => ({ ...i, source }));
}

/** What the module's manifest records about an applied supplement. */
export function appliedSupplementInfo(s: ModuleSupplement): AppliedSupplement {
  const out: AppliedSupplement = { id: s.manifest.id, name: s.manifest.name, version: s.manifest.version, licenseNotice: s.manifest.licenseNotice };
  if (s.manifest.license) out.license = s.manifest.license;
  return out;
}

/**
 * Merge validated supplements into a module, by supplement id (so the result
 * does not depend on the order they were installed in). The base module is
 * not changed; lists that gain items are copied. Supplements should have
 * passed `validateSupplement` and `checkSupplementAgainst` for this module.
 */
export function applySupplements(base: GameModule, supplements: readonly ModuleSupplement[]): GameModule {
  if (supplements.length === 0) return base;
  const sorted = (JSON.parse(JSON.stringify(supplements)) as ModuleSupplement[]).sort(byId);
  const added = new Map<string, ReferenceItem[]>();
  const newLists: ReferenceList[] = [];
  const presets: EntityPreset[] = [...base.presets];
  for (const s of sorted) {
    const name = s.manifest.name;
    for (const [listId, items] of Object.entries(s.referenceItems ?? {})) added.set(listId, [...(added.get(listId) ?? []), ...withSource(items, name)]);
    for (const l of s.referenceLists ?? []) newLists.push({ ...l, items: withSource(l.items, name) });
    presets.push(...(s.presets ?? []));
  }
  const presetIndex = new Map(presets.map((p) => [p.id, p]));
  const lookup: PresetLookup = (id) => presetIndex.get(id);
  const module: GameModule = {
    ...base,
    manifest: { ...base.manifest, supplements: [...(base.manifest.supplements ?? []), ...sorted.map(appliedSupplementInfo)] },
    referenceLists: [...base.referenceLists.map((l) => (added.has(l.id) ? { ...l, items: [...l.items, ...added.get(l.id)!] } : l)), ...newLists],
    presets,
    tables: [...base.tables, ...sorted.flatMap((s) => s.tables ?? [])],
    procedures: [...base.procedures, ...sorted.flatMap((s) => (s.procedures ?? []).map((p) => procedureFromPack(p, lookup)))],
    templates: [...base.templates, ...sorted.flatMap((s) => s.templates ?? [])],
    rules: [...base.rules, ...sorted.flatMap((s) => s.rules ?? [])],
  };
  const guides = sorted.flatMap((s) => s.playGuides ?? []);
  if (guides.length > 0) module.playGuides = [...(base.playGuides ?? []), ...guides];
  return module;
}

/** The applied supplement an id belongs to ("<supplement id>.…"), if any. */
export function supplementOf(manifest: { supplements?: AppliedSupplement[] }, id: string | undefined): AppliedSupplement | undefined {
  if (!id) return undefined;
  return manifest.supplements?.find((s) => id.startsWith(`${s.id}.`));
}

// ---------------------------------------------------------------------------
// 4. The whole check
// ---------------------------------------------------------------------------

/** A JSON path into the supplement for a conformance `where` on the merged module. */
function supplementPathOf(s: ModuleSupplement, where: string): { path: string; item?: string } {
  const item = /^referenceList:([^:]+):item:(.+)$/.exec(where);
  if (item) {
    const [, listId, itemId] = item;
    const idx = (s.referenceItems?.[listId!] ?? []).findIndex((i) => itemId === i.id || itemId!.startsWith(`${i.id}:`));
    if (idx !== -1) return { path: jsonPath(["referenceItems", listId!, idx]), item: s.referenceItems![listId!]![idx]!.id };
  }
  return { path: "" };
}

/** Conformance (or lint) issues on a merged module that are about the supplement's own content, as issues with JSON paths into the supplement. */
export function conformanceToSupplementIssues(s: ModuleSupplement, issues: ConformanceIssue[], source: PackIssue["source"]): PackIssue[] {
  const prefix = `${s.manifest.id}.`;
  const asPack = s as unknown as ModulePack;
  return issues
    .filter((i) => i.where.includes(prefix))
    .map((i) => {
      const at = supplementPathOf(s, i.where);
      if (at.path) {
        const out: PackIssue = { severity: i.severity, path: at.path, message: i.message, source };
        if (at.item) out.item = at.item;
        return out;
      }
      return { ...conformanceToPackIssues(asPack, [i])[0]!, source };
    });
}

export interface CheckSupplementOptions {
  /** Seeds per procedure for the conformance run (default 50; procedures only run when the supplement adds some). */
  seeds?: number;
  /** Seeds per procedure for the determinism check (default 10). */
  determinismSeeds?: number;
  /** Other supplements already applied to the module (their content is in the merged module; their issues are not reported). */
  alongside?: readonly ModuleSupplement[];
}

export interface CheckSupplementResult {
  ok: boolean;
  issues: PackIssue[];
  /** The validated supplement. */
  supplement?: ModuleSupplement;
  /** The base module with the supplement (and `alongside`) merged in, when it passed. */
  module?: GameModule;
}

/**
 * Everything that has to hold before a supplement is installed for `base`:
 * validation, the base-module checks, then the conformance suite and the
 * determinism check over the merged module (issues about the supplement's own
 * content only).
 */
export function checkSupplement(input: unknown, base: GameModule, options: CheckSupplementOptions = {}): CheckSupplementResult {
  const v = validateSupplement(input);
  if (!v.ok || !v.value) return { ok: false, issues: v.issues };
  const supplement = v.value;
  const against = checkSupplementAgainst(supplement, base);
  const issues = [...v.issues, ...against];
  if (against.some((i) => i.severity === "error")) return { ok: false, issues, supplement };
  const others = (options.alongside ?? []).filter((o) => o.manifest.id !== supplement.manifest.id);
  let module: GameModule;
  try {
    module = applySupplements(base, [...others, supplement]);
  } catch (e) {
    return { ok: false, issues: [...issues, { severity: "error", path: "$", message: (e as Error).message, source: "pack" }], supplement };
  }
  const hasProcedures = (supplement.procedures ?? []).length > 0;
  const report = checkModule(module, { seeds: options.seeds ?? 50, skipProcedureRuns: !hasProcedures });
  issues.push(...conformanceToSupplementIssues(supplement, report.issues, "conformance"));
  if (hasProcedures && !issues.some((i) => i.severity === "error")) {
    const own = { ...module, procedures: module.procedures.filter((p) => p.id.startsWith(`${supplement.manifest.id}.`)) };
    issues.push(...conformanceToSupplementIssues(supplement, checkDeterminism(own, { seeds: options.determinismSeeds ?? 10 }), "determinism"));
  }
  const ok = !issues.some((i) => i.severity === "error");
  return ok ? { ok, issues, supplement, module } : { ok, issues, supplement };
}

/** How many entries a supplement adds, per collection (for the module list). */
export function supplementCounts(s: ModuleSupplement): Record<string, number> {
  const out: Record<string, number> = {};
  const items = Object.values(s.referenceItems ?? {}).reduce((n, l) => n + l.length, 0);
  if (items > 0) out.referenceItems = items;
  for (const c of SUPPLEMENT_COLLECTIONS) {
    const n = (s[c] ?? []).length;
    if (n > 0) out[c] = n;
  }
  return out;
}
