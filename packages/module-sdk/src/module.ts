/**
 * Module conformance suite (`checkModule`) and loader (`loadModule`).
 * The checks mirror architecture seed section 5: dice coverage, page refs,
 * dangling references, declared modes, procedure termination.
 */
import { diceOutcomes, parseDiceExpression } from "./dice";
import { computeFields, defaultFieldsFor, fieldSchemaAt, schemaDefaults, validateAgainstSchema, validateEntityFields } from "./entities";
import { runProcedure } from "./procedures";
import { createTableRegistry } from "./tables";
import { lifecycleConfig, lifecycleConfigIssues } from "./lifecycle";
import { logicIssues } from "./logic";
import { CORE_NARRATIVE_FIELDS, REVIEW_COLLECTIONS, REVIEW_CONTEXT_KEYS, narrativeEntityType } from "./review";
import {
  type AdventureBuilderDef,
  type NarrativeFieldsDef,
  type NarrativeKind,
  type TemplateAdventure,
  CONTRACT_VERSION,
  CORE_RELATIONSHIP_TYPES,
  SESSION_CHECKLIST_EVENTS,
  SESSION_CHECKLIST_RESERVED_PREFIXES,
  type EntityPreset,
  type EntityTypeDef,
  type GameModule,
  type PageRef,
  type PlayGuideDef,
  type PlayModeId,
  type Procedure,
  type ProgressionPoolDef,
  type ProgressionPoolId,
  type ReferenceItem,
  type ReferenceList,
  type RelationshipTypeDef,
  type RollTable,
  type RuleCard,
  type TableRegistry,
  type Template,
  type TemplateChecklist,
  type TemplateKind,
  type TrackerDef,
} from "./types";

export type IssueSeverity = "error" | "warning";

export interface ConformanceIssue {
  severity: IssueSeverity;
  /** Where the problem is, e.g. "table:alien.world.size" or "rule:alien.push". */
  where: string;
  message: string;
}

export interface ConformanceReport {
  ok: boolean;
  issues: ConformanceIssue[];
}

export interface CheckModuleOptions {
  /** Random seeds each procedure is run with. Default 200. */
  seeds?: number;
  /** Per-procedure inputs for the termination check; defaults come from the procedure's input schema. */
  procedureInputs?: Record<string, Record<string, unknown>>;
  /** Skip the (slow) procedure termination check. */
  skipProcedureRuns?: boolean;
}

class Collector {
  issues: ConformanceIssue[] = [];
  error(where: string, message: string): void {
    this.issues.push({ severity: "error", where, message });
  }
  warn(where: string, message: string): void {
    this.issues.push({ severity: "warning", where, message });
  }
}

function validPage(page: PageRef | undefined): boolean {
  if (typeof page === "number") return Number.isInteger(page) && page > 0;
  if (Array.isArray(page) && page.length === 2) {
    const [a, b] = page;
    return Number.isInteger(a) && Number.isInteger(b) && a > 0 && b >= a;
  }
  return false;
}

/** A section citation: a short non-empty line of text. */
export function validCite(cite: unknown): boolean {
  return typeof cite === "string" && cite.trim().length > 0 && cite.length <= 200 && !/[\r\n]/.test(cite);
}

/** Something that should cite its source: a valid page, a valid cite, or `original: true`. */
export function citesSource(item: { page?: PageRef; cite?: string; original?: boolean }): boolean {
  return (item.page !== undefined && validPage(item.page)) || (item.cite !== undefined && validCite(item.cite)) || item.original === true;
}

function checkCite(item: { cite?: unknown }, where: string, c: Collector, label = ""): void {
  if (item.cite !== undefined && !validCite(item.cite)) c.error(where, `${label}cite must be one line of text (1-200 characters)`);
}

function checkUnique<T>(items: T[], key: (item: T) => string, where: (item: T) => string, label: string, c: Collector): void {
  const seen = new Set<string>();
  for (const item of items) {
    const k = key(item);
    if (seen.has(k)) c.error(where(item), `duplicate ${label} id "${k}"`);
    seen.add(k);
  }
}

function checkModes(modes: PlayModeId[] | undefined, declared: Set<PlayModeId>, where: string, c: Collector): void {
  if (!modes) return;
  for (const m of modes) if (!declared.has(m)) c.error(where, `references undeclared mode "${m}"`);
}

/** All subset sums of numeric modifier adds (each modifier is on or off). */
function modifierOffsets(table: RollTable): number[] {
  let sums = new Set<number>([0]);
  for (const m of table.modifiers ?? []) {
    if (typeof m.add !== "number") continue;
    const next = new Set<number>(sums);
    for (const s of sums) next.add(s + m.add);
    sums = next;
  }
  return [...sums];
}

function checkTable(table: RollTable, registry: TableRegistry, declaredModes: Set<PlayModeId>, c: Collector): void {
  const where = `table:${table.id}`;
  if (!table.name) c.warn(where, "table has no name");
  if (table.page !== undefined && !validPage(table.page)) c.error(where, "invalid page reference");
  checkCite(table, where, c);
  checkModes(table.mode, declaredModes, where, c);
  if (table.rows.length === 0) {
    c.error(where, "table has no rows");
    return;
  }
  let outcomes: number[];
  try {
    outcomes = diceOutcomes(table.dice);
  } catch (e) {
    c.error(where, `invalid dice expression "${table.dice}": ${(e as Error).message}`);
    return;
  }
  for (const [i, row] of table.rows.entries()) {
    if (row.range.length !== 2 || row.range[0] > row.range[1]) c.error(where, `row ${i} has an invalid range [${row.range.join(", ")}]`);
    if (row.page !== undefined && !validPage(row.page)) c.error(where, `row ${i} has an invalid page reference`);
    checkCite(row, where, c, `row ${i} `);
    for (const nr of row.roll ?? []) {
      if (!registry.get(nr.table)) c.error(where, `row ${i} nests unknown table "${nr.table}"`);
      if (!nr.as) c.error(where, `row ${i} nested roll on "${nr.table}" has no "as" key`);
      if (typeof nr.times === "string") {
        try {
          parseDiceExpression(nr.times);
        } catch (e) {
          c.error(where, `row ${i} nested roll "times" is not a dice expression: ${(e as Error).message}`);
        }
      }
    }
  }
  // Pairwise overlap.
  for (let i = 0; i < table.rows.length; i++) {
    for (let j = i + 1; j < table.rows.length; j++) {
      const a = table.rows[i]!.range;
      const b = table.rows[j]!.range;
      if (a[0] <= b[1] && b[0] <= a[1]) c.error(where, `rows ${i} and ${j} overlap ([${a.join("-")}] and [${b.join("-")}])`);
    }
  }
  // Coverage of every achievable total, including every combination of numeric modifiers.
  const offsets = modifierOffsets(table);
  const totals = new Set<number>();
  for (const o of outcomes) for (const off of offsets) totals.add(o + off);
  const gaps: number[] = [];
  for (const t of [...totals].sort((x, y) => x - y)) {
    const covering = table.rows.filter((r) => t >= r.range[0] && t <= r.range[1]).length;
    if (covering === 0) gaps.push(t);
  }
  if (gaps.length > 0) c.error(where, `no row covers total${gaps.length > 1 ? "s" : ""} ${gaps.join(", ")} (dice ${table.dice})`);
  // Rows beyond the numeric outcome set may still be reachable through a
  // JSONLogic modifier (e.g. "+ stress - resolve"), which cannot be enumerated.
  const hasDynamicModifier = (table.modifiers ?? []).some((m) => typeof m.add !== "number");
  if (!hasDynamicModifier) {
    for (const [i, row] of table.rows.entries()) {
      const reachable = [...totals].some((t) => t >= row.range[0] && t <= row.range[1]);
      if (!reachable) c.warn(where, `row ${i} [${row.range.join("-")}] is unreachable with dice ${table.dice}`);
    }
  }
  for (const [i, m] of (table.modifiers ?? []).entries()) {
    if (m.add === undefined || m.add === null) c.error(where, `modifier ${i} has no "add"`);
  }
}

function findEntityTypeForFieldRef(types: EntityTypeDef[], ref: string): { def: EntityTypeDef; path: string } | undefined {
  let best: { def: EntityTypeDef; path: string } | undefined;
  for (const def of types) {
    if (ref === def.id) return { def, path: "" };
    if (ref.startsWith(def.id + ".") && (!best || def.id.length > best.def.id.length)) {
      best = { def, path: ref.slice(def.id.length + 1) };
    }
  }
  return best;
}

function fieldPathExists(def: EntityTypeDef, path: string): boolean {
  if (fieldSchemaAt(def, path) !== undefined) return true;
  if (def.computed && Object.prototype.hasOwnProperty.call(def.computed, path)) return true;
  for (const sub of def.subtypes ?? []) {
    if (sub.schema && fieldSchemaAt({ ...def, schema: sub.schema }, path) !== undefined) return true;
  }
  return false;
}

function checkEntityType(def: EntityTypeDef, module: GameModule, declaredModes: Set<PlayModeId>, c: Collector, where = `entityType:${def.id}`): void {
  checkModes(def.mode, declaredModes, where, c);
  if (!def.schema || typeof def.schema !== "object") {
    c.error(where, "schema is missing");
    return;
  }
  const refLists = new Set(module.referenceLists.map((l) => l.id));
  const ruleIds = new Set(module.rules.map((r) => r.id));
  checkUnique(def.subtypes ?? [], (s) => s.id, () => where, "subtype", c);
  const walkSections = (sections: EntityTypeDef["sheet"]["sections"], schemaOwner: EntityTypeDef, prefix: string): void => {
    checkUnique(sections, (s) => s.id, (s) => `${prefix}:section:${s.id}`, "section", c);
    for (const section of sections) {
      const sw = `${prefix}:section:${section.id}`;
      checkModes(section.mode, declaredModes, sw, c);
      for (const field of section.fields) {
        const fw = `${sw}:field:${field.path}`;
        checkModes(field.mode, declaredModes, fw, c);
        const isComputed = field.widget === "computed";
        const inSchema = fieldSchemaAt(schemaOwner, field.path) !== undefined;
        const inComputed = def.computed !== undefined && Object.prototype.hasOwnProperty.call(def.computed, field.path);
        if (isComputed) {
          if (!inComputed && !inSchema) c.error(fw, `computed widget path "${field.path}" is not a computed value or schema field`);
        } else if (!inSchema) {
          c.error(fw, `sheet field path "${field.path}" does not exist in the schema`);
        }
        if (field.options && !Array.isArray(field.options)) {
          if (!refLists.has(field.options.ref)) c.error(fw, `options reference unknown reference list "${field.options.ref}"`);
        } else if (Array.isArray(field.options)) {
          const schema = fieldSchemaAt(schemaOwner, field.path);
          const enumValues = schema && Array.isArray(schema.enum) ? (schema.enum as unknown[]) : undefined;
          if (enumValues) {
            for (const opt of field.options) {
              if (!enumValues.includes(opt)) c.error(fw, `select option "${opt}" is not in the schema enum`);
            }
          }
        }
        if (field.rule !== undefined && !ruleIds.has(field.rule) && /^[\w.-]+$/.test(field.rule) && field.rule.includes(".")) {
          c.warn(fw, `rule "${field.rule}" looks like a rule card id but no such rule exists`);
        }
        for (const t of field.entityTypes ?? []) {
          if (!module.entityTypes.some((et) => et.id === t)) c.error(fw, `entityTypes references unknown entity type "${t}"`);
        }
      }
    }
  };
  walkSections(def.sheet.sections, def, where);
  for (const sub of def.subtypes ?? []) {
    if (sub.sheet) walkSections(sub.sheet.sections, sub.schema ? { ...def, schema: sub.schema } : def, `${where}:subtype:${sub.id}`);
  }
  for (const path of def.sheet.summary ?? []) {
    if (!fieldPathExists(def, path)) c.error(where, `summary path "${path}" does not exist`);
  }
  for (const path of Object.keys(def.defaultVisibility ?? {})) {
    if (!fieldPathExists(def, path)) c.error(where, `defaultVisibility path "${path}" does not exist`);
  }
  for (const path of def.playerEditable ?? []) {
    if (!fieldPathExists(def, path)) c.error(where, `playerEditable path "${path}" does not exist`);
  }
  // Computed rules must evaluate against default fields without throwing.
  try {
    computeFields(def, defaultFieldsFor(def));
  } catch (e) {
    c.error(where, `computed rules threw on default fields: ${(e as Error).message}`);
  }
  try {
    validateEntityFields(def, {});
  } catch (e) {
    c.error(where, `schema does not compile: ${(e as Error).message}`);
  }
}

function checkRule(rule: RuleCard, module: GameModule, declaredModes: Set<PlayModeId>, c: Collector): void {
  const where = `rule:${rule.id}`;
  if (rule.page !== undefined && !validPage(rule.page)) c.error(where, "invalid page reference");
  checkCite(rule, where, c);
  if (rule.page === undefined && rule.cite === undefined && rule.original !== true) c.error(where, "rule card cites no source: give it a page, a cite, or mark it original");
  if (!rule.summary) c.warn(where, "rule card has no summary");
  checkModes(rule.mode, declaredModes, where, c);
  const links = rule.links ?? {};
  for (const t of links.tables ?? []) if (!module.tables.some((x) => x.id === t)) c.error(where, `links to unknown table "${t}"`);
  for (const r of links.rules ?? []) if (!module.rules.some((x) => x.id === r)) c.error(where, `links to unknown rule "${r}"`);
  for (const t of links.trackers ?? []) if (!module.trackers.some((x) => x.id === t)) c.error(where, `links to unknown tracker "${t}"`);
  for (const f of links.fields ?? []) {
    const hit = findEntityTypeForFieldRef(module.entityTypes, f);
    if (!hit) c.error(where, `links to field "${f}" of an unknown entity type`);
    else if (hit.path !== "" && !fieldPathExists(hit.def, hit.path)) c.error(where, `links to unknown field "${hit.path}" of "${hit.def.id}"`);
  }
}

function checkProcedureStatic(proc: Procedure, module: GameModule, declaredModes: Set<PlayModeId>, c: Collector): void {
  const where = `procedure:${proc.id}`;
  checkModes(proc.mode, declaredModes, where, c);
  if (proc.page !== undefined && !validPage(proc.page)) c.error(where, "invalid page reference");
  checkCite(proc, where, c);
  checkUnique(proc.steps, (s) => s.id, (s) => `${where}:step:${s.id}`, "step", c);
  const stepIds = proc.steps.map((s) => s.id);
  for (const [i, step] of proc.steps.entries()) {
    const sw = `${where}:step:${step.id}`;
    if (step.page !== undefined && !validPage(step.page)) c.error(sw, "invalid page reference");
    if (step.table === undefined && step.compute === undefined) c.error(sw, "step has neither table nor compute");
    if (typeof step.table === "string" && !module.tables.some((t) => t.id === step.table)) c.error(sw, `unknown table "${step.table}"`);
    if (typeof step.repeat === "string") {
      try {
        parseDiceExpression(step.repeat);
      } catch (e) {
        c.error(sw, `repeat is not a dice expression: ${(e as Error).message}`);
      }
    }
    for (const r of step.reads ?? []) {
      const idx = stepIds.indexOf(r);
      if (idx === -1) c.error(sw, `reads unknown step "${r}"`);
      else if (idx >= i) c.warn(sw, `reads step "${r}" which runs later`);
    }
  }
  for (const chain of proc.chains ?? []) {
    if (!module.procedures.some((p) => p.id === chain.procedure)) c.error(where, `chains into unknown procedure "${chain.procedure}"`);
  }
}

function checkProcedureRuns(proc: Procedure, module: GameModule, options: CheckModuleOptions, c: Collector): void {
  const where = `procedure:${proc.id}`;
  const seeds = options.seeds ?? 200;
  const inputs = options.procedureInputs?.[proc.id] ?? (proc.inputs ? schemaDefaults(proc.inputs) : {});
  const includeOptional = proc.steps.filter((s) => s.optional).map((s) => s.id);
  for (let i = 0; i < seeds; i++) {
    const seed = `conformance-${i}`;
    try {
      const graph = runProcedure(proc, module, { seed, inputs, includeOptional });
      if (!graph.produced || !Array.isArray(graph.produced.entities) || !Array.isArray(graph.produced.relationships)) {
        c.error(where, `produce() returned an invalid graph for seed "${seed}"`);
        return;
      }
      const tempIds = new Set<string>();
      for (const e of graph.produced.entities) {
        if (tempIds.has(e.tempId)) c.error(where, `duplicate produced tempId "${e.tempId}" for seed "${seed}"`);
        tempIds.add(e.tempId);
        if (!module.entityTypes.some((t) => t.id === e.type)) c.error(where, `produced entity of unknown type "${e.type}" for seed "${seed}"`);
      }
      for (const r of graph.produced.relationships) {
        if (!tempIds.has(r.from) || !tempIds.has(r.to)) c.error(where, `relationship "${r.type}" references unknown tempId for seed "${seed}"`);
      }
      if (c.issues.some((iss) => iss.where === where && iss.message.endsWith(`for seed "${seed}"`))) return;
    } catch (e) {
      c.error(where, `threw for seed "${seed}": ${(e as Error).message}`);
      return;
    }
  }
}

function checkPreset(preset: EntityPreset, module: GameModule, c: Collector): void {
  const where = `preset:${preset.id}`;
  if (preset.page !== undefined && !validPage(preset.page)) c.error(where, "invalid page reference");
  checkCite(preset, where, c);
  const def = module.entityTypes.find((t) => t.id === preset.entityType);
  if (!def) {
    c.error(where, `unknown entity type "${preset.entityType}"`);
    return;
  }
  const res = validateEntityFields(def, preset.fields);
  for (const err of res.errors) c.warn(where, `fields.${err.path}: ${err.message}`);
}

function checkTracker(tracker: TrackerDef, module: GameModule, declaredModes: Set<PlayModeId>, c: Collector): void {
  const where = `tracker:${tracker.id}`;
  checkModes(tracker.mode, declaredModes, where, c);
  if (tracker.page !== undefined && !validPage(tracker.page)) c.error(where, "invalid page reference");
  checkCite(tracker, where, c);
  for (const r of tracker.rules ?? []) if (!module.rules.some((x) => x.id === r)) c.error(where, `references unknown rule "${r}"`);
  for (const b of tracker.binds ?? []) {
    const typed = findEntityTypeForFieldRef(module.entityTypes, b);
    if (typed) {
      if (typed.path !== "" && !fieldPathExists(typed.def, typed.path)) c.error(where, `binds unknown field "${typed.path}" of "${typed.def.id}"`);
    } else if (!module.entityTypes.some((t) => fieldPathExists(t, b))) {
      c.error(where, `binds path "${b}" that exists on no entity type`);
    }
  }
  if (tracker.kind === "lifecycle") {
    for (const issue of lifecycleConfigIssues(lifecycleConfig(tracker.config), module)) c.error(where, issue);
  }
}

function checkReferenceList(list: ReferenceList, declaredModes: Set<PlayModeId>, c: Collector): void {
  const where = `referenceList:${list.id}`;
  if (list.page !== undefined && !validPage(list.page)) c.error(where, "invalid page reference");
  checkCite(list, where, c);
  checkUnique(list.items, (i) => i.id, (i) => `${where}:item:${i.id}`, "item", c);
  for (const item of list.items) {
    checkModes(item.mode, declaredModes, `${where}:item:${item.id}`, c);
    if (item.page !== undefined && !validPage(item.page)) c.error(`${where}:item:${item.id}`, "invalid page reference");
    checkCite(item, `${where}:item:${item.id}`, c);
    if (list.itemSchema) {
      const res = validateAgainstSchema(list.itemSchema, item);
      for (const err of res.errors) c.warn(`${where}:item:${item.id}`, `${err.path}: ${err.message}`);
    }
  }
}

function checkTemplate(t: Template, moduleId: string, declaredModes: Set<PlayModeId>, c: Collector): void {
  const where = `template:${t.id}`;
  checkModes(t.mode, declaredModes, where, c);
  if (t.page !== undefined && !validPage(t.page)) c.error(where, "invalid page reference");
  checkCite(t, where, c);
  if (!t.scaffold || typeof t.scaffold !== "object") c.error(where, "template has no scaffold");
  if (t.appliesTo !== undefined && t.kind !== "checklist") c.error(where, "appliesTo is only for checklist templates");
  if (t.appliesTo !== undefined && t.appliesTo !== "session" && t.appliesTo !== "session-zero") c.error(where, `unknown appliesTo "${String(t.appliesTo)}"`);
  if (t.kind === "checklist" && t.appliesTo === "session" && t.scaffold && typeof t.scaffold === "object") checkSessionChecklist(t, moduleId, declaredModes, c);
}

/** A session checklist template: phases, namespaced unique ids, declared modes, pages and auto-tick events. */
function checkSessionChecklist(t: Template, moduleId: string, declaredModes: Set<PlayModeId>, c: Collector): void {
  const where = `template:${t.id}`;
  const items = (t.scaffold as Partial<TemplateChecklist>).items;
  if (!Array.isArray(items) || items.length === 0) {
    c.error(where, "session checklist has no items");
    return;
  }
  checkUnique(items, (i) => i.id, (i) => `${where}:item:${i.id}`, "checklist item", c);
  for (const item of items) {
    const iw = `${where}:item:${item.id}`;
    if (item.phase !== "prep" && item.phase !== "play" && item.phase !== "wrap") c.error(iw, "session checklist item needs a phase (prep, play or wrap)");
    if (!item.text) c.error(iw, "checklist item has no text");
    if (typeof item.id !== "string" || !item.id.startsWith(`${moduleId}.`)) c.error(iw, `session checklist item ids must start with the module id ("${moduleId}.")`);
    else if (SESSION_CHECKLIST_RESERVED_PREFIXES.some((p) => item.id.startsWith(p))) c.error(iw, "session checklist item id clashes with the core checklist");
    checkModes(item.mode, declaredModes, iw, c);
    if (item.page !== undefined && !validPage(item.page)) c.error(iw, "invalid page reference");
    if (item.autoWhen !== undefined && !SESSION_CHECKLIST_EVENTS.includes(item.autoWhen)) c.error(iw, `unknown autoWhen event "${String(item.autoWhen)}"`);
  }
}


// ---------------------------------------------------------------------------
// narrative fields and adventure builders
// ---------------------------------------------------------------------------

const NARRATIVE_KINDS: NarrativeKind[] = ["adventure", "act", "scene"];

function checkNarrativeFields(defs: NarrativeFieldsDef[], module: GameModule, declaredModes: Set<PlayModeId>, c: Collector): void {
  for (const [i, def] of defs.entries()) {
    const where = `narrativeFields:${String(def.kind)}${defs.filter((d) => d.kind === def.kind).length > 1 ? `#${i}` : ""}`;
    if (!NARRATIVE_KINDS.includes(def.kind)) {
      c.error(where, `unknown narrative kind "${String(def.kind)}" (adventure, act or scene)`);
      continue;
    }
    if (!def.schema || typeof def.schema !== "object") {
      c.error(where, "schema is missing");
      continue;
    }
    if (!def.sheet || !Array.isArray(def.sheet.sections)) {
      c.error(where, "sheet is missing");
      continue;
    }
    checkModes(def.mode, declaredModes, where, c);
    checkEntityType(narrativeEntityType(def), module, declaredModes, c, where);
  }
  // Two defs for the same kind that both apply to one mode: only the first is used.
  for (const kind of NARRATIVE_KINDS) {
    const ofKind = defs.filter((d) => d.kind === kind);
    for (const mode of declaredModes) {
      const hits = ofKind.filter((d) => !d.mode || d.mode.length === 0 || d.mode.includes(mode));
      if (hits.length > 1) c.warn(`narrativeFields:${kind}`, `${hits.length} narrative field defs apply to mode "${mode}"; only the first is used`);
    }
  }
}

function narrativePathExists(defs: NarrativeFieldsDef[], kind: NarrativeKind, path: string): boolean {
  if (path.startsWith("core.")) return CORE_NARRATIVE_FIELDS[kind].includes(path.slice(5));
  return defs.some((d) => d.kind === kind && fieldPathExists(narrativeEntityType(d), path));
}

function checkLogic(rule: unknown, where: string, label: string, c: Collector): void {
  for (const issue of logicIssues(rule)) c.error(where, `${label}: ${issue}`);
}

function checkBuilder(b: AdventureBuilderDef, module: GameModule, declaredModes: Set<PlayModeId>, c: Collector): void {
  const where = `builder:${b.id}`;
  const narrative = module.narrativeFields ?? [];
  if (!b.name) c.warn(where, "builder has no name");
  checkModes(b.mode, declaredModes, where, c);
  if (b.page !== undefined && !validPage(b.page)) c.error(where, "invalid page reference");

  // Template: it scaffolds the acts the act panels point at.
  let actNumbers: Set<number> | undefined;
  if (b.templateId !== undefined) {
    const t = module.templates.find((x) => x.id === b.templateId);
    if (!t) c.error(where, `unknown template "${b.templateId}"`);
    else if (t.kind !== "adventure" || !Array.isArray((t.scaffold as Partial<TemplateAdventure>).acts)) c.error(where, `template "${b.templateId}" is not an adventure template`);
    else {
      const scaffold = t.scaffold as TemplateAdventure;
      actNumbers = new Set(scaffold.acts.map((a) => a.number));
      // Scaffold `fields` seed the narrative fields: they must fit the schema the builder's modes use.
      const defFor = (kind: NarrativeKind) => narrative.find((d) => d.kind === kind && (!d.mode || !b.mode || d.mode.some((m) => b.mode!.includes(m))));
      const checkSeed = (kind: NarrativeKind, fields: Record<string, unknown> | undefined, label: string) => {
        if (fields === undefined) return;
        const def = defFor(kind);
        if (!def) {
          c.warn(where, `template ${label} sets fields but the module has no ${kind} narrative fields`);
          return;
        }
        for (const err of validateAgainstSchema(def.schema, fields).errors) c.warn(where, `template ${label} fields.${err.path}: ${err.message}`);
      };
      checkSeed("adventure", scaffold.fields, "adventure");
      for (const act of scaffold.acts) {
        checkSeed("act", act.fields, `act ${act.number}`);
        for (const [i, sc] of (act.scenes ?? []).entries()) checkSeed("scene", sc.fields, `act ${act.number} scene ${i + 1}`);
      }
    }
  }

  // Cast roles.
  const cast = Array.isArray(b.cast) ? b.cast : [];
  checkUnique(cast, (r) => r.id, (r) => `${where}:cast:${r.id}`, "cast role", c);
  const roles = new Set(cast.map((r) => r.id));
  for (const role of cast) {
    const rw = `${where}:cast:${role.id}`;
    if (REVIEW_CONTEXT_KEYS.includes(role.id)) c.error(rw, `cast role id "${role.id}" clashes with a review context key (${REVIEW_CONTEXT_KEYS.join(", ")})`);
    const def = module.entityTypes.find((t) => t.id === role.entityType);
    if (!def) {
      c.error(rw, `unknown entity type "${role.entityType}"`);
      continue;
    }
    if (role.subtype !== undefined && !(def.subtypes ?? []).some((s) => s.id === role.subtype)) c.error(rw, `entity type "${def.id}" has no subtype "${role.subtype}"`);
    for (const path of role.fields ?? []) if (!fieldPathExists(def, path)) c.error(rw, `field "${path}" does not exist on "${def.id}"`);
    for (const path of Object.keys(role.defaults ?? {})) if (!fieldPathExists(def, path)) c.error(rw, `default "${path}" is not a field of "${def.id}"`);
    if (role.min !== undefined && role.max !== undefined && role.min > role.max) c.error(rw, `min ${role.min} is greater than max ${role.max}`);
  }

  // Steps and panels.
  const steps = Array.isArray(b.steps) ? b.steps : [];
  if (steps.length === 0) c.error(where, "builder has no steps");
  checkUnique(steps, (s) => s.id, (s) => `${where}:step:${s.id}`, "step", c);
  const stepIds = new Set(steps.map((s) => s.id));
  for (const step of steps) {
    const sw = `${where}:step:${step.id}`;
    if (step.page !== undefined && !validPage(step.page)) c.error(sw, "invalid page reference");
    for (const [i, panel] of (step.panels ?? []).entries()) {
      const pw = `${sw}:panel:${i}`;
      switch (panel.kind) {
        case "adventure":
          for (const f of panel.fields) if (!narrativePathExists(narrative, "adventure", f)) c.error(pw, `adventure field "${f}" is neither a core field nor in the adventure narrative fields`);
          break;
        case "cast":
        case "agendas":
          if (!roles.has(panel.role)) c.error(pw, `${panel.kind} panel references unknown cast role "${panel.role}"`);
          break;
        case "act":
          if (!Number.isInteger(panel.act) || panel.act < 1) c.error(pw, `act number ${String(panel.act)} is invalid`);
          else if (actNumbers && !actNumbers.has(panel.act)) c.error(pw, `act ${panel.act} is not one of the template's acts (${[...actNumbers].join(", ")})`);
          else if (!actNumbers) c.warn(pw, "act panel in a builder without a template: the act may not exist");
          for (const f of panel.fields) if (!narrativePathExists(narrative, "act", f)) c.error(pw, `act field "${f}" is neither a core field nor in the act narrative fields`);
          if (panel.sceneFields && !panel.scenes) c.warn(pw, "sceneFields are only shown when scenes is true");
          for (const f of panel.sceneFields ?? []) if (!narrativePathExists(narrative, "scene", f)) c.error(pw, `scene field "${f}" is neither a core field nor in the scene narrative fields`);
          break;
        case "review":
          break;
        default:
          c.error(pw, `unknown panel kind "${String((panel as { kind: unknown }).kind)}"`);
      }
    }
  }

  // Review rules.
  const rules = Array.isArray(b.review) ? b.review : [];
  checkUnique(rules, (r) => r.id, (r) => `${where}:review:${r.id}`, "review rule", c);
  const collections = new Set([...REVIEW_COLLECTIONS, ...roles]);
  for (const rule of rules) {
    const rw = `${where}:review:${rule.id}`;
    if (!stepIds.has(rule.step)) c.error(rw, `references unknown step "${rule.step}"`);
    if (rule.level !== "bad" && rule.level !== "warn") c.error(rw, `level must be "bad" or "warn", not "${String(rule.level)}"`);
    if (rule.each !== undefined && !collections.has(rule.each)) c.error(rw, `each names unknown collection "${rule.each}" (known: ${[...collections].join(", ")})`);
    if (rule.when === undefined && rule.check === undefined) c.error(rw, "rule has neither when nor check");
    if (rule.check !== undefined && typeof rule.check !== "function") c.error(rw, "check must be a function");
    if (rule.when !== undefined) checkLogic(rule.when, rw, "when", c);
    if (rule.value !== undefined) checkLogic(rule.value, rw, "value", c);
    if (!rule.message) c.error(rw, "rule has no message");
    if (rule.page !== undefined && !validPage(rule.page)) c.error(rw, "invalid page reference");
  }
}

/** Play guides: unique ids, entries pointing at declared groups, valid pages and modes. */
function checkPlayGuide(g: PlayGuideDef, declaredModes: Set<PlayModeId>, c: Collector): void {
  const where = `playGuide:${g.id}`;
  if (!g.title) c.warn(where, "play guide has no title");
  checkModes(g.mode, declaredModes, where, c);
  for (const [i, tip] of (g.tips ?? []).entries()) {
    if (!tip.text) c.error(where, `tip ${i} has no text`);
    if (tip.page !== undefined && !validPage(tip.page)) c.error(where, `tip ${i} has an invalid page reference`);
  }
  const groups = Array.isArray(g.groups) ? g.groups : [];
  if (!Array.isArray(g.groups)) c.error(where, "groups must be a list");
  checkUnique(groups, (x) => x.id, (x) => `${where}:group:${x.id}`, "play guide group", c);
  for (const grp of groups) if (grp.page !== undefined && !validPage(grp.page)) c.error(`${where}:group:${grp.id}`, "invalid page reference");
  const groupIds = new Set(groups.map((x) => x.id));
  const entries = Array.isArray(g.entries) ? g.entries : [];
  if (!Array.isArray(g.entries)) c.error(where, "entries must be a list");
  checkUnique(entries, (e) => e.id, (e) => `${where}:entry:${e.id}`, "play guide entry", c);
  for (const e of entries) {
    const ew = `${where}:entry:${e.id}`;
    if (!e.label) c.warn(ew, "entry has no label");
    if (e.kind !== "attribute" && e.kind !== "skill") c.error(ew, `kind must be "attribute" or "skill", not "${String(e.kind)}"`);
    if (e.group !== undefined && !groupIds.has(e.group)) c.error(ew, `references unknown group "${e.group}"`);
    if (!Array.isArray(e.callFor)) c.error(ew, "callFor must be a list");
    else if (e.callFor.length === 0) c.warn(ew, "entry has no callFor cues");
    if (e.roll !== undefined && (typeof e.roll !== "string" || e.roll.trim() === "")) c.error(ew, "roll must be a non-empty string");
    if (e.page !== undefined && !validPage(e.page)) c.error(ew, "invalid page reference");
    checkCite(e, ew, c);
    checkModes(e.mode, declaredModes, ew, c);
  }
}

function majorOf(version: string): number | undefined {
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(version) ?? /(\d+)/.exec(version);
  return m && m[1] !== undefined ? Number(m[1]) : undefined;
}


function checkEconomy(module: GameModule, declaredModes: Set<PlayModeId>, c: Collector): void {
  const types = new Set(module.entityTypes.map((t) => t.id));
  const rules = new Set(module.rules.map((r) => r.id));
  const checkRules = (ids: string[] | undefined, where: string) => {
    for (const r of ids ?? []) if (!rules.has(r)) c.error(where, `references unknown rule "${r}"`);
  };
  const ledger = module.ledger;
  if (ledger) {
    const w = "ledger";
    if (!ledger.currency?.symbol || !ledger.currency?.name) c.error(w, "currency needs a name and a symbol");
    const d = ledger.currency?.decimals;
    if (d !== undefined && (!Number.isInteger(d) || d < 0 || d > 4)) c.error(w, "currency decimals must be an integer from 0 to 4");
    if (ledger.currency?.page !== undefined && !validPage(ledger.currency.page)) c.error(w, "currency has an invalid page reference");
    if (!ledger.defaultAccount) c.error(w, "defaultAccount needs a name");
    if (!Array.isArray(ledger.categories) || ledger.categories.length === 0) c.error(w, "ledger declares no categories");
    checkUnique(ledger.categories ?? [], (x) => x.id, (x) => `ledger:category:${x.id}`, "ledger category", c);
    for (const cat of ledger.categories ?? []) {
      const cw = `ledger:category:${cat.id}`;
      if (!cat.label) c.error(cw, "category has no label");
      if (!["in", "out", "either"].includes(cat.direction)) c.error(cw, `invalid direction "${String(cat.direction)}"`);
      if (cat.page !== undefined && !validPage(cat.page)) c.error(cw, "invalid page reference");
      if (cat.rule !== undefined) checkRules([cat.rule], cw);
    }
    const cats = new Set((ledger.categories ?? []).map((x) => x.id));
    for (const t of ledger.accountEntityTypes ?? []) if (!types.has(t)) c.error(w, `accountEntityTypes references unknown entity type "${t}"`);
    for (const p of ledger.payouts ?? []) {
      const pw = `ledger:payout:${p.entityType}`;
      if (!types.has(p.entityType)) c.error(pw, `unknown entity type "${p.entityType}"`);
      if (!cats.has(p.category)) c.error(pw, `unknown ledger category "${p.category}"`);
      if (!p.amountPath) c.error(pw, "payout has no amountPath");
      if (p.page !== undefined && !validPage(p.page)) c.error(pw, "invalid page reference");
    }
    checkModes(ledger.mode, declaredModes, w, c);
    checkRules(ledger.rules, w);
  }
  const ship = module.crewShip;
  if (ship) {
    const w = "crewShip";
    if (!Array.isArray(ship.entityTypes) || ship.entityTypes.length === 0) c.error(w, "crewShip lists no entity types");
    for (const t of ship.entityTypes ?? []) if (!types.has(t)) c.error(w, `unknown entity type "${t}"`);
    if (!ship.setting) c.error(w, "crewShip needs a campaign setting key");
    if (ship.betweenJobs !== undefined && !module.procedures.some((p) => p.id === ship.betweenJobs)) c.error(w, `betweenJobs references unknown procedure "${ship.betweenJobs}"`);
    if (ship.sections) {
      const sections = new Set(ship.entityTypes.flatMap((t) => module.entityTypes.find((e) => e.id === t)?.sheet.sections.map((s) => s.id) ?? []));
      for (const s of ship.sections) if (!sections.has(s)) c.error(w, `unknown sheet section "${s}"`);
    }
    const known = (path: string) =>
      ship.entityTypes.some((t) => {
        const def = module.entityTypes.find((e) => e.id === t);
        return !!def && (fieldSchemaAt(def, path) !== undefined || Object.prototype.hasOwnProperty.call(def.computed ?? {}, path));
      });
    for (const st of ship.stats ?? []) {
      if (!known(st.path)) c.error(w, `stat "${st.label}" reads unknown field or computed key "${st.path}"`);
      if (st.max !== undefined && !known(st.max)) c.error(w, `stat "${st.label}" reads unknown max "${st.max}"`);
      if (st.rule !== undefined) checkRules([st.rule], w);
    }
    for (const l of ship.lists ?? []) {
      if (!known(l.path)) c.error(w, `list "${l.label}" reads unknown field "${l.path}"`);
      if (l.rule !== undefined) checkRules([l.rule], w);
    }
    checkModes(ship.mode, declaredModes, w, c);
    checkRules(ship.rules, w);
  }
  const travel = module.travel;
  if (travel) {
    const w = "travel";
    if (typeof travel.plan !== "function" || typeof travel.arrive !== "function") c.error(w, "travel needs plan() and arrive()");
    if (!travel.distance?.unit) c.error(w, "travel needs a distance unit");
    if (!Array.isArray(travel.destinations) || travel.destinations.length === 0) c.error(w, "travel lists no destination types");
    for (const d of travel.destinations ?? []) {
      const def = module.entityTypes.find((t) => t.id === d.entityType);
      if (!def) c.error(w, `unknown destination entity type "${d.entityType}"`);
      for (const s of d.subtypes ?? []) if (def && !def.subtypes?.some((x) => x.id === s)) c.error(w, `unknown subtype "${s}" of "${d.entityType}"`);
    }
    if (travel.page !== undefined && !validPage(travel.page)) c.error(w, "invalid page reference");
    if (travel.distance?.page !== undefined && !validPage(travel.distance.page)) c.error(w, "distance has an invalid page reference");
    checkModes(travel.mode, declaredModes, w, c);
    checkRules(travel.rules, w);
  }
}

function checkProgression(module: GameModule, declaredModes: Set<PlayModeId>, c: Collector): void {
  const def = module.progression;
  if (!def) return;
  const w = "progression";
  const rules = new Set(module.rules.map((r) => r.id));
  const lists = new Map(module.referenceLists.map((l) => [l.id, l]));
  const checkRule = (id: string | undefined, where: string) => {
    if (id !== undefined && !rules.has(id)) c.error(where, `references unknown rule "${id}"`);
  };
  const page = (p: PageRef | undefined, where: string) => {
    if (p !== undefined && !validPage(p)) c.error(where, "invalid page reference");
  };
  checkModes(def.mode, declaredModes, w, c);
  for (const r of def.rules ?? []) checkRule(r, w);
  if (!Array.isArray(def.entities) || def.entities.length === 0) c.error(w, "progression lists no entity types");
  const types = (def.entities ?? []).map((e) => module.entityTypes.find((t) => t.id === e.type));
  for (const [i, e] of (def.entities ?? []).entries()) {
    if (!types[i]) c.error(w, `unknown entity type "${e.type}"`);
    if (e.when !== undefined) checkLogic(e.when, w, `entity "${e.type}" when`, c);
  }
  const known = (path: string) => types.some((t) => !!t && fieldSchemaAt(t, path) !== undefined);
  const pools: Array<[ProgressionPoolId, ProgressionPoolDef | undefined]> = [
    ["experience", def.experience],
    ["story", def.storyPoints],
  ];
  for (const [id, pool] of pools) {
    if (!pool) continue;
    const pw = `progression:pool:${id}`;
    if (!pool.path) c.error(pw, "pool has no field path");
    else if (!known(pool.path)) c.error(pw, `pool path "${pool.path}" is not a field of the advancing entity types`);
    if (!pool.label) c.error(pw, "pool has no label");
    if (pool.max !== undefined && pool.max < (pool.min ?? 0)) c.error(pw, "max is below min");
    page(pool.page, pw);
    checkRule(pool.rule, pw);
    checkModes(pool.mode, declaredModes, pw, c);
  }
  const sp = def.storyPoints;
  if (sp) {
    const pw = "progression:pool:story";
    if (!Array.isArray(sp.uses) || sp.uses.length === 0) c.warn(pw, "story points list no uses");
    checkUnique(sp.uses ?? [], (u) => u.id, (u) => `${pw}:use:${u.id}`, "story point use", c);
    for (const u of sp.uses ?? []) {
      const uw = `${pw}:use:${u.id}`;
      page(u.page, uw);
      if (u.operation !== undefined && !module.dice?.operations?.[u.operation]) c.error(uw, `unknown dice operation "${u.operation}"`);
      if (u.cost !== undefined && (!Number.isInteger(u.cost) || u.cost < 1)) c.error(uw, "cost must be a positive integer");
    }
    for (const e of sp.earn ?? []) page(e.page, pw);
    if (sp.carryOver) {
      page(sp.carryOver.page, pw);
      if (!Number.isInteger(sp.carryOver.max) || sp.carryOver.max < 0) c.error(pw, "carryOver.max must be a non-negative integer");
    }
  }
  const hasPool = (id: ProgressionPoolId) => (id === "experience" ? !!def.experience : !!def.storyPoints);
  checkUnique(def.awards ?? [], (a) => a.id, (a) => `progression:award:${a.id}`, "award question", c);
  for (const a of def.awards ?? []) {
    const aw = `progression:award:${a.id}`;
    if (!a.text) c.error(aw, "award question has no text");
    if (!hasPool(a.pool ?? "experience")) c.error(aw, `pays into pool "${a.pool ?? "experience"}", which the progression does not define`);
    if (a.amount !== undefined && (!Number.isInteger(a.amount) || a.amount < 1)) c.error(aw, "amount must be a positive integer");
    if (a.timing !== undefined && !["session", "act", "downtime"].includes(a.timing)) c.error(aw, `invalid timing "${String(a.timing)}"`);
    if (a.when !== undefined) checkLogic(a.when, aw, "when", c);
    if (a.page === undefined) c.warn(aw, "award question has no page reference");
    page(a.page, aw);
    checkModes(a.mode, declaredModes, aw, c);
  }
  checkUnique(def.spends ?? [], (s) => s.id, (s) => `progression:spend:${s.id}`, "spend option", c);
  for (const s of def.spends ?? []) {
    const sw = `progression:spend:${s.id}`;
    if (!s.label) c.error(sw, "spend option has no label");
    if (!hasPool(s.pool ?? "experience")) c.error(sw, `is paid from pool "${s.pool ?? "experience"}", which the progression does not define`);
    const t = s.target;
    if (!t || (t.kind !== "level" && t.kind !== "pick")) c.error(sw, "target must be a level or a pick");
    else {
      if (!known(t.path)) c.error(sw, `target path "${t.path}" is not a field of the advancing entity types`);
      if (t.ref !== undefined && !lists.has(t.ref)) c.error(sw, `unknown reference list "${t.ref}"`);
      if (t.kind === "level") {
        if (!Number.isFinite(t.max)) c.error(sw, "level target needs a max");
        if (!t.ref && !t.keys) c.warn(sw, "level target has neither ref nor keys; keys come from the sheet");
        for (const k of t.keys ?? []) if (!known(`${t.path}.${k}`)) c.error(sw, `key "${k}" is not a field under "${t.path}"`);
      }
    }
    checkLogic(s.cost, sw, "cost", c);
    if (s.available !== undefined) checkLogic(s.available, sw, "available", c);
    for (const ch of s.checks ?? []) {
      checkLogic(ch.ok, sw, "check", c);
      if (ch.level !== "block" && ch.level !== "confirm") c.error(sw, `invalid check level "${String(ch.level)}"`);
      page(ch.page, sw);
    }
    if (s.page === undefined) c.warn(sw, "spend option has no page reference");
    page(s.page, sw);
    checkRule(s.rule, sw);
    checkModes(s.mode, declaredModes, sw, c);
  }
  for (const n of def.notes ?? []) {
    page(n.page, w);
    checkModes(n.mode, declaredModes, w, c);
  }
}

/** Run every conformance check. `ok` is true when no error-severity issue was found. */
export function checkModule(module: GameModule, options: CheckModuleOptions = {}): ConformanceReport {
  const c = new Collector();
  const manifest = module.manifest;
  const mw = `manifest:${manifest?.id ?? "?"}`;
  if (!manifest || !manifest.id) c.error("manifest", "manifest id is missing");
  if (!manifest?.version) c.error(mw, "manifest version is missing");
  if (!manifest?.licenseNotice) c.warn(mw, "manifest has no license notice");
  const declaredModes = new Set<PlayModeId>((manifest?.modes ?? []).map((m) => m.id));
  if (declaredModes.size === 0) c.error(mw, "manifest declares no play modes");
  checkUnique(manifest?.modes ?? [], (m) => m.id, () => mw, "mode", c);
  if (manifest && !declaredModes.has(manifest.defaultMode)) c.error(mw, `defaultMode "${manifest.defaultMode}" is not a declared mode`);
  for (const m of manifest?.modes ?? []) if (m.page !== undefined && !validPage(m.page)) c.error(mw, `mode "${m.id}" has an invalid page reference`);
  const license = manifest?.license;
  if (license !== undefined) {
    if (!license.name || typeof license.name !== "string") c.error(mw, "license needs a name");
    if (!license.attribution || typeof license.attribution !== "string") c.error(mw, "license needs the attribution text it requires");
    if (license.url !== undefined && !/^https?:\/\//i.test(license.url)) c.error(mw, "license url must be an http(s) link");
  }
  if (manifest?.sourceBook?.url !== undefined && !/^https?:\/\//i.test(manifest.sourceBook.url)) c.error(mw, "sourceBook url must be an http(s) link");
  if (manifest?.citationStyle !== undefined && manifest.citationStyle !== "page" && manifest.citationStyle !== "section") c.error(mw, `citationStyle must be "page" or "section"`);
  const requiredMajor = manifest ? majorOf(manifest.requiredCore) : undefined;
  const coreMajor = majorOf(CONTRACT_VERSION);
  if (requiredMajor === undefined) c.error(mw, `requiredCore "${manifest?.requiredCore}" is not a semver version`);
  else if (requiredMajor !== coreMajor) c.error(mw, `requiredCore "${manifest?.requiredCore}" does not match contract version ${CONTRACT_VERSION}`);

  // Dice system.
  if (!module.dice) c.error("dice", "dice system is missing");
  else {
    checkUnique(module.dice.dice, (d) => d.id, (d) => `dice:${d.id}`, "die", c);
    for (const d of module.dice.dice) if (!Number.isInteger(d.faces) || d.faces < 1) c.error(`dice:${d.id}`, "die has invalid faces");
    if (module.dice.resultStyle !== undefined && module.dice.resultStyle !== "successes" && module.dice.resultStyle !== "total") c.error("dice", `resultStyle must be "successes" or "total"`);
    for (const [id, op] of Object.entries(module.dice.operations ?? {})) {
      if (op.id !== id) c.warn(`dice:operation:${id}`, `operation id "${op.id}" differs from its key "${id}"`);
      if (op.page !== undefined && !validPage(op.page)) c.error(`dice:operation:${id}`, "invalid page reference");
    }
  }

  // Tables.
  checkUnique(module.tables, (t) => t.id, (t) => `table:${t.id}`, "table", c);
  const registry = createTableRegistry(module.tables);
  for (const t of module.tables) checkTable(t, registry, declaredModes, c);

  // Entity types and relationships.
  checkUnique(module.entityTypes, (t) => t.id, (t) => `entityType:${t.id}`, "entity type", c);
  for (const def of module.entityTypes) checkEntityType(def, module, declaredModes, c);
  checkUnique(module.relationshipTypes, (r) => r.id, (r) => `relationship:${r.id}`, "relationship type", c);
  const coreRel = new Set(CORE_RELATIONSHIP_TYPES.map((r) => r.id));
  for (const r of module.relationshipTypes) {
    if (coreRel.has(r.id)) c.error(`relationship:${r.id}`, `clashes with core relationship type "${r.id}"`);
  }

  // Reference lists, presets.
  checkUnique(module.referenceLists, (l) => l.id, (l) => `referenceList:${l.id}`, "reference list", c);
  for (const l of module.referenceLists) checkReferenceList(l, declaredModes, c);
  checkUnique(module.presets, (p) => p.id, (p) => `preset:${p.id}`, "preset", c);
  for (const p of module.presets) checkPreset(p, module, c);

  // Rules, trackers, templates.
  checkUnique(module.rules, (r) => r.id, (r) => `rule:${r.id}`, "rule", c);
  for (const r of module.rules) checkRule(r, module, declaredModes, c);
  checkUnique(module.trackers, (t) => t.id, (t) => `tracker:${t.id}`, "tracker", c);
  for (const t of module.trackers) checkTracker(t, module, declaredModes, c);
  checkUnique(module.templates, (t) => t.id, (t) => `template:${t.id}`, "template", c);
  for (const t of module.templates) checkTemplate(t, manifest?.id ?? "", declaredModes, c);

  // Narrative fields and adventure builders.
  if (module.narrativeFields !== undefined && !Array.isArray(module.narrativeFields)) c.error("narrativeFields", "narrativeFields must be a list");
  else checkNarrativeFields(module.narrativeFields ?? [], module, declaredModes, c);
  if (module.adventureBuilders !== undefined && !Array.isArray(module.adventureBuilders)) c.error("adventureBuilders", "adventureBuilders must be a list");
  else {
    checkUnique(module.adventureBuilders ?? [], (b) => b.id, (b) => `builder:${b.id}`, "adventure builder", c);
    for (const b of module.adventureBuilders ?? []) checkBuilder(b, module, declaredModes, c);
  }

  // Play guides.
  if (module.playGuides !== undefined && !Array.isArray(module.playGuides)) c.error("playGuides", "playGuides must be a list");
  else {
    checkUnique(module.playGuides ?? [], (g) => g.id, (g) => `playGuide:${g.id}`, "play guide", c);
    for (const g of module.playGuides ?? []) checkPlayGuide(g, declaredModes, c);
  }

  // Procedures.
  checkUnique(module.procedures, (p) => p.id, (p) => `procedure:${p.id}`, "procedure", c);
  for (const p of module.procedures) checkProcedureStatic(p, module, declaredModes, c);
  const hadErrors = c.issues.some((i) => i.severity === "error");
  if (!options.skipProcedureRuns && !hadErrors) {
    for (const p of module.procedures) checkProcedureRuns(p, module, options, c);
  }

  // Money, the crew's vehicle and travel.
  checkEconomy(module, declaredModes, c);

  // Character progression.
  checkProgression(module, declaredModes, c);

  // Calendar.
  const cal = module.calendar;
  if (!cal) c.error("calendar", "calendar is missing");
  else {
    if (!Array.isArray(cal.months) || cal.months.length === 0) c.error(`calendar:${cal.id}`, "calendar has no months");
    for (const m of cal.months ?? []) if (!Number.isInteger(m.days) || m.days < 1) c.error(`calendar:${cal.id}`, `month "${m.name}" has invalid days`);
  }

  // Migrations.
  for (const m of module.migrations ?? []) {
    if (!m.from || !m.to) c.error("migrations", "migration is missing from/to versions");
  }

  return { ok: !c.issues.some((i) => i.severity === "error"), issues: c.issues };
}

/** Keep items whose `mode` is absent, empty, or includes `mode`. */
export function filterByMode<T extends { mode?: PlayModeId[] }>(items: readonly T[], mode: PlayModeId): T[] {
  return items.filter((i) => !i.mode || i.mode.length === 0 || i.mode.includes(mode));
}

export interface ModuleModeView {
  mode: PlayModeId;
  rules: RuleCard[];
  templates: Template[];
  trackers: TrackerDef[];
  tables: RollTable[];
  procedures: Procedure[];
  entityTypes: EntityTypeDef[];
}

export interface LoadedModule {
  module: GameModule;
  manifest: GameModule["manifest"];
  report: ConformanceReport;
  tables: TableRegistry;
  relationshipTypes: RelationshipTypeDef[];
  entityType(id: string): EntityTypeDef | undefined;
  table(id: string): RollTable | undefined;
  procedure(id: string): Procedure | undefined;
  rule(id: string): RuleCard | undefined;
  rulesForField(typeId: string, path: string): RuleCard[];
  rulesForTable(tableId: string): RuleCard[];
  referenceList(id: string): ReferenceList | undefined;
  referenceItem(listId: string, itemId: string): ReferenceItem | undefined;
  preset(id: string): EntityPreset | undefined;
  presetsFor(entityType: string): EntityPreset[];
  template(id: string): Template | undefined;
  templatesFor(kind: TemplateKind, mode?: PlayModeId): Template[];
  tracker(id: string): TrackerDef | undefined;
  forMode(mode: PlayModeId): ModuleModeView;
  /** The module's fields for a narrative kind in a mode (the first def that applies), if any. */
  narrativeFieldsFor(kind: NarrativeKind, mode?: PlayModeId): NarrativeFieldsDef | undefined;
  builder(id: string): AdventureBuilderDef | undefined;
  /** Adventure builders, filtered by mode when one is given. */
  buildersFor(mode?: PlayModeId): AdventureBuilderDef[];
}

export class ModuleConformanceError extends Error {
  readonly report: ConformanceReport;
  constructor(moduleId: string, report: ConformanceReport) {
    const errors = report.issues.filter((i) => i.severity === "error");
    super(`Module "${moduleId}" failed conformance with ${errors.length} error(s):\n` + errors.map((e) => `  ${e.where}: ${e.message}`).join("\n"));
    this.name = "ModuleConformanceError";
    this.report = report;
  }
}

function indexBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T> {
  const m = new Map<string, T>();
  for (const i of items) m.set(key(i), i);
  return m;
}

/** Check a module and build fast lookups. Throws ModuleConformanceError on errors. */
export function loadModule(module: GameModule, options: CheckModuleOptions = {}): LoadedModule {
  const report = checkModule(module, options);
  if (!report.ok) throw new ModuleConformanceError(module.manifest?.id ?? "?", report);

  const entityTypes = indexBy(module.entityTypes, (t) => t.id);
  const tables = createTableRegistry(module.tables);
  const procedures = indexBy(module.procedures, (p) => p.id);
  const rules = indexBy(module.rules, (r) => r.id);
  const referenceLists = indexBy(module.referenceLists, (l) => l.id);
  const referenceItems = new Map<string, Map<string, ReferenceItem>>();
  for (const l of module.referenceLists) referenceItems.set(l.id, indexBy(l.items, (i) => i.id));
  const presets = indexBy(module.presets, (p) => p.id);
  const templates = indexBy(module.templates, (t) => t.id);
  const trackers = indexBy(module.trackers, (t) => t.id);
  const builders = indexBy(module.adventureBuilders ?? [], (b) => b.id);
  const rulesByField = new Map<string, RuleCard[]>();
  const rulesByTable = new Map<string, RuleCard[]>();
  for (const r of module.rules) {
    for (const f of r.links?.fields ?? []) rulesByField.set(f, [...(rulesByField.get(f) ?? []), r]);
    for (const t of r.links?.tables ?? []) rulesByTable.set(t, [...(rulesByTable.get(t) ?? []), r]);
  }
  const relationshipTypes = [...CORE_RELATIONSHIP_TYPES, ...module.relationshipTypes];

  return {
    module,
    manifest: module.manifest,
    report,
    tables,
    relationshipTypes,
    entityType: (id) => entityTypes.get(id),
    table: (id) => tables.get(id),
    procedure: (id) => procedures.get(id),
    rule: (id) => rules.get(id),
    rulesForField: (typeId, path) => rulesByField.get(`${typeId}.${path}`) ?? [],
    rulesForTable: (tableId) => rulesByTable.get(tableId) ?? [],
    referenceList: (id) => referenceLists.get(id),
    referenceItem: (listId, itemId) => referenceItems.get(listId)?.get(itemId),
    preset: (id) => presets.get(id),
    presetsFor: (entityType) => module.presets.filter((p) => p.entityType === entityType),
    template: (id) => templates.get(id),
    templatesFor: (kind, mode) => {
      const ofKind = module.templates.filter((t) => t.kind === kind);
      return mode === undefined ? ofKind : filterByMode(ofKind, mode);
    },
    tracker: (id) => trackers.get(id),
    forMode: (mode) => ({
      mode,
      rules: filterByMode(module.rules, mode),
      templates: filterByMode(module.templates, mode),
      trackers: filterByMode(module.trackers, mode),
      tables: filterByMode(module.tables, mode),
      procedures: filterByMode(module.procedures, mode),
      entityTypes: filterByMode(module.entityTypes, mode),
    }),
    narrativeFieldsFor: (kind, mode) => {
      const ofKind = (module.narrativeFields ?? []).filter((d) => d.kind === kind);
      return (mode === undefined ? ofKind : filterByMode(ofKind, mode))[0];
    },
    builder: (id) => builders.get(id),
    buildersFor: (mode) => (mode === undefined ? [...(module.adventureBuilders ?? [])] : filterByMode(module.adventureBuilders ?? [], mode)),
  };
}
