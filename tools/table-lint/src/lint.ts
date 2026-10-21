/**
 * Tool-level lint over a GameModule: wraps the sdk conformance suite
 * (`checkModule`) and adds the data-entry checks from the architecture seed's
 * repository appendix: a citation (page, section cite, or `original`) on every table, id/family convention, d66
 * bounds, row labels, rule-card summary length (no book prose), preset field
 * validation, `within:` containment tags, reference item ids and procedure
 * chains, plus a data-status summary (how much is still `unverified`).
 */
import {
  checkModule,
  parseDiceExpression,
  validateEntityFields,
  type CheckModuleOptions,
  type ConformanceIssue,
  type EntityPreset,
  type GameModule,
  type ReferenceList,
  type RollTable,
  type RuleCard,
} from "@campaign-forge/module-sdk";

export type IssueSeverity = "error" | "warning";

export interface Issue {
  severity: IssueSeverity;
  /** Where the problem is, e.g. "table:alien.world.size" (same convention as the sdk). */
  where: string;
  message: string;
  /** "sdk" for conformance-suite issues, "lint" for the tool-level checks. */
  source: "sdk" | "lint";
}

export interface FamilyStats {
  tables: number;
  rows: number;
  /** Tables flagged `unverified`. */
  unverified: number;
  /** Rows flagged `unverified` (on the row or inherited from the table). */
  unverifiedRows: number;
}

export interface PresetTypeStats {
  presets: number;
  unverified: number;
}

export interface LintStats {
  tables: number;
  rowsTotal: number;
  unverifiedTables: number;
  unverifiedRows: number;
  rulesTotal: number;
  presetsTotal: number;
  unverifiedPresets: number;
  referenceLists: number;
  unverifiedReferenceLists: number;
  procedures: number;
  byFamily: Record<string, FamilyStats>;
  presetsByType: Record<string, PresetTypeStats>;
}

export interface LintReport {
  ok: boolean;
  errors: Issue[];
  warnings: Issue[];
  stats: LintStats;
}

export interface LintOptions extends CheckModuleOptions {
  /** Rule-card summaries longer than this many characters get a warning. Default 600. */
  maxSummaryChars?: number;
  /** Rule-card summaries with more sentences than this get a warning. Default 3. */
  maxSummarySentences?: number;
}

/** Prefix convention for containment tags on presets (see module-alien data/types.ts). */
export const WITHIN_TAG = "within:";

class Issues {
  readonly list: Issue[] = [];
  error(where: string, message: string): void {
    this.list.push({ severity: "error", where, message, source: "lint" });
  }
  warn(where: string, message: string): void {
    this.list.push({ severity: "warning", where, message, source: "lint" });
  }
}

/** Family a table belongs to: the declared `family`, else the second id segment. */
export function tableFamily(table: Pick<RollTable, "id" | "family">): string {
  if (table.family) return table.family;
  const seg = table.id.split(".")[1];
  return seg && seg.length > 0 ? seg : "(none)";
}

function isDigitPair(n: number): boolean {
  if (!Number.isInteger(n) || n < 11 || n > 66) return false;
  const tens = Math.floor(n / 10);
  const units = n % 10;
  return tens >= 1 && tens <= 6 && units >= 1 && units <= 6;
}

function isPureD66(dice: string): boolean {
  try {
    const parsed = parseDiceExpression(dice);
    return parsed.terms.length === 1 && parsed.terms[0]?.kind === "d66";
  } catch {
    return false;
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Count sentences in a summary. Page references ("p. 44"), common
 * abbreviations and decimal numbers do not end a sentence.
 */
export function countSentences(text: string): number {
  const cleaned = text
    .replace(/\b(pp?|e\.g|i\.e|vs|etc|no|cf|approx)\.\s*(?=[\d(a-z])/gi, "$1 ")
    .replace(/(\d)\.(\d)/g, "$1$2")
    .replace(/\.{3}|…/g, " ");
  return cleaned
    .split(/(?<=[.!?])["')\]]*\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0).length;
}

function checkTable(table: RollTable, moduleId: string, c: Issues): void {
  const where = `table:${table.id}`;
  // Rule 2: every table cites its source, by page or by section, unless the module author wrote it.
  if (table.page === undefined && table.cite === undefined && table.original !== true) c.error(where, "table cites no source: give it a page, a cite, or mark it original");

  const segments = table.id.split(".");
  if (segments.length < 3 || segments.some((s) => s.length === 0)) {
    c.error(where, `table id does not follow "<moduleId>.<family>.<name>"`);
  } else {
    if (segments[0] !== moduleId) c.error(where, `table id does not start with the module id "${moduleId}"`);
    const idFamily = segments[1];
    if (table.family === undefined) c.warn(where, `table declares no family (id suggests "${idFamily}")`);
    else if (table.family !== idFamily) c.error(where, `family "${table.family}" does not match the id segment "${idFamily}"`);
  }

  for (const [i, row] of table.rows.entries()) {
    const hasLabel = typeof row.label === "string" && row.label.trim().length > 0;
    if (!hasLabel && !isPlainObject(row.result)) c.error(where, `row ${i} [${row.range.join("-")}] has neither a label nor an object result`);
  }

  if (isPureD66(table.dice)) {
    for (const [i, row] of table.rows.entries()) {
      // -99 and 99 are the contract's open-ended bounds (modifiers can push totals past 11..66).
      const bad = row.range.filter((b) => Math.abs(b) !== 99 && !isDigitPair(b));
      if (bad.length > 0) c.error(where, `row ${i} [${row.range.join("-")}] has d66 bound${bad.length > 1 ? "s" : ""} ${bad.join(", ")} that ${bad.length > 1 ? "are" : "is"} not a pair of digits 1-6`);
    }
  }
}

function checkRule(rule: RuleCard, opts: Required<Pick<LintOptions, "maxSummaryChars" | "maxSummarySentences">>, c: Issues): void {
  const where = `rule:${rule.id}`;
  const summary = rule.summary ?? "";
  if (summary.length > opts.maxSummaryChars) {
    c.warn(where, `summary is ${summary.length} characters (limit ${opts.maxSummaryChars}); paraphrase, do not reproduce book prose`);
  }
  const sentences = countSentences(summary);
  if (sentences > opts.maxSummarySentences) {
    c.warn(where, `summary has ${sentences} sentences (limit ${opts.maxSummarySentences}); looks like verbatim text rather than a paraphrase`);
  }
  const quoted = /"([^"]{60,})"|“([^”]{60,})”/.exec(summary);
  if (quoted) c.warn(where, "summary contains a long quoted passage; rule cards must not quote the book");
}

function checkPreset(preset: EntityPreset, module: GameModule, presetIds: Set<string>, c: Issues): void {
  const where = `preset:${preset.id}`;
  const def = module.entityTypes.find((t) => t.id === preset.entityType);
  if (def) {
    const res = validateEntityFields(def, preset.fields);
    for (const err of res.errors) c.error(where, `fields${err.path ? "." + err.path : ""} ${err.message}`);
    const subtype = (preset as EntityPreset & { subtype?: string }).subtype;
    if (subtype !== undefined && !(def.subtypes ?? []).some((s) => s.id === subtype)) {
      c.error(where, `subtype "${subtype}" is not declared by entity type "${def.id}"`);
    }
  }
  for (const tag of preset.tags ?? []) {
    if (!tag.startsWith(WITHIN_TAG)) continue;
    const parent = tag.slice(WITHIN_TAG.length);
    if (!presetIds.has(parent)) c.error(where, `within tag points at unknown preset "${parent}"`);
  }
}

/** Follow `within:` tags upwards; report cycles. */
function checkWithinCycles(presets: EntityPreset[], c: Issues): void {
  const parentOf = new Map<string, string>();
  for (const p of presets) {
    const tag = (p.tags ?? []).find((t) => t.startsWith(WITHIN_TAG));
    if (tag) parentOf.set(p.id, tag.slice(WITHIN_TAG.length));
  }
  for (const start of parentOf.keys()) {
    const seen = new Set<string>([start]);
    let cur = parentOf.get(start);
    while (cur !== undefined) {
      if (seen.has(cur)) {
        c.error(`preset:${start}`, `within chain is circular (${[...seen, cur].join(" -> ")})`);
        break;
      }
      seen.add(cur);
      cur = parentOf.get(cur);
    }
  }
}

function checkReferenceList(list: ReferenceList, c: Issues): void {
  const seen = new Set<string>();
  for (const item of list.items) {
    if (seen.has(item.id)) c.error(`referenceList:${list.id}:item:${item.id}`, `reference item id "${item.id}" is not unique in list "${list.id}"`);
    seen.add(item.id);
  }
}

function familyStats(module: GameModule): Record<string, FamilyStats> {
  const out: Record<string, FamilyStats> = {};
  for (const t of module.tables) {
    const fam = tableFamily(t);
    const s = out[fam] ?? { tables: 0, rows: 0, unverified: 0, unverifiedRows: 0 };
    s.tables += 1;
    s.rows += t.rows.length;
    if (t.unverified) s.unverified += 1;
    s.unverifiedRows += t.rows.filter((r) => r.unverified || t.unverified).length;
    out[fam] = s;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

function presetStats(module: GameModule): Record<string, PresetTypeStats> {
  const out: Record<string, PresetTypeStats> = {};
  for (const p of module.presets) {
    const s = out[p.entityType] ?? { presets: 0, unverified: 0 };
    s.presets += 1;
    if (p.unverified) s.unverified += 1;
    out[p.entityType] = s;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

function fromSdk(issue: ConformanceIssue): Issue {
  return { severity: issue.severity, where: issue.where, message: issue.message, source: "sdk" };
}

/**
 * SPDX ids of licences that allow the source text to be used as written (with
 * attribution): Creative Commons BY / BY-SA, CC0, and the ORC License, which
 * SPDX does not list, as the license reference `LicenseRef-ORC`.
 */
const OPEN_TEXT_LICENSES = /^(CC-BY(-SA)?-\d|CC0-|LicenseRef-ORC$)/i;

/** Whether the module's source text is openly licensed (`manifest.license.spdx`), so rule cards may quote it. */
export function hasOpenLicense(module: GameModule): boolean {
  const spdx = module.manifest?.license?.spdx;
  return typeof spdx === "string" && OPEN_TEXT_LICENSES.test(spdx.trim());
}

/** Run the sdk conformance suite plus the tool-level checks. `ok` is true when there are no errors. */
export function lintModule(module: GameModule, opts: LintOptions = {}): LintReport {
  const { maxSummaryChars = 600, maxSummarySentences = 3, ...checkOpts } = opts;
  const sdkReport = checkModule(module, { seeds: 200, ...checkOpts });
  const c = new Issues();
  const moduleId = module.manifest?.id ?? "";

  for (const t of module.tables) checkTable(t, moduleId, c);
  // Openly licensed text (e.g. an SRD under CC-BY-4.0) may be used as written, so its rule cards are not checked for book prose.
  if (!hasOpenLicense(module)) for (const r of module.rules) checkRule(r, { maxSummaryChars, maxSummarySentences }, c);
  const presetIds = new Set(module.presets.map((p) => p.id));
  for (const p of module.presets) checkPreset(p, module, presetIds, c);
  checkWithinCycles(module.presets, c);
  for (const l of module.referenceLists) checkReferenceList(l, c);
  const procedureIds = new Set(module.procedures.map((p) => p.id));
  for (const p of module.procedures) {
    for (const chain of p.chains ?? []) {
      if (!procedureIds.has(chain.procedure)) c.error(`procedure:${p.id}`, `chains into unknown procedure "${chain.procedure}"`);
    }
  }

  // The lint upgrades preset field problems to errors; drop the sdk's warning for the same thing.
  const lintErrorWheres = new Set(c.list.filter((i) => i.severity === "error").map((i) => i.where));
  const sdkIssues = sdkReport.issues
    .filter((i) => !(i.severity === "warning" && i.where.startsWith("preset:") && i.message.startsWith("fields.") && lintErrorWheres.has(i.where)))
    .map(fromSdk);

  const all = [...sdkIssues, ...c.list];
  const byFamily = familyStats(module);
  const stats: LintStats = {
    tables: module.tables.length,
    rowsTotal: module.tables.reduce((n, t) => n + t.rows.length, 0),
    unverifiedTables: module.tables.filter((t) => t.unverified).length,
    unverifiedRows: Object.values(byFamily).reduce((n, f) => n + f.unverifiedRows, 0),
    rulesTotal: module.rules.length,
    presetsTotal: module.presets.length,
    unverifiedPresets: module.presets.filter((p) => p.unverified).length,
    referenceLists: module.referenceLists.length,
    unverifiedReferenceLists: module.referenceLists.filter((l) => l.unverified).length,
    procedures: module.procedures.length,
    byFamily,
    presetsByType: presetStats(module),
  };
  const errors = all.filter((i) => i.severity === "error");
  const warnings = all.filter((i) => i.severity === "warning");
  return { ok: errors.length === 0, errors, warnings, stats };
}
