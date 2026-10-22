/**
 * Turning a validated data pack into a GameModule. Nothing here evaluates
 * anything but JSONLogic (through `evaluateLogic`) and dice expressions
 * (through `rollDice`); the pack's strings are data, never code.
 *
 * Procedures: each declarative step becomes the contract's step functions:
 *   table (id or JSONLogic)  -> `table`
 *   roll / value             -> `compute` (the roll is seeded by the runner)
 *   skipIf / repeat / modifier / derive / display -> `skipIf` / `repeat` / `modifier` / `after` / `display`
 * and `produce` becomes a function that fills the entity templates.
 */
import { rollDice } from "../dice";
import { createDiceEngine } from "../engines";
import { evaluateLogic, evaluateNumber, setPath } from "../logic";
import { checkModule, type CheckModuleOptions, type ConformanceIssue } from "../module";
import type {
  CalendarDef,
  EntityPreset,
  GameModule,
  JsonLogicRule,
  Procedure,
  ProcedureContext,
  ProcedureStep,
  ProducedEntity,
  ProducedRelationship,
} from "../types";
import type { ModulePack, PackProcedure, PackProcedureStep, PackProduce } from "./types";
import { PACK_COLLECTIONS } from "./types";
import { jsonPath, mergePackParts, type PackIssue } from "./validate";

/** The JSONLogic data a procedure expression sees: inputs and results, flat and by name. */
export function procedureData(ctx: ProcedureContext, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...ctx.data(), inputs: ctx.inputs, results: ctx.results, ...extra };
}

function truthy(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0;
  return !!v;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function stepFromPack(step: PackProcedureStep): ProcedureStep {
  const out: ProcedureStep = { id: step.id };
  if (step.title !== undefined) out.title = step.title;
  if (step.page !== undefined) out.page = step.page;
  if (step.cite !== undefined) out.cite = step.cite;
  if (step.reads !== undefined) out.reads = [...step.reads];
  if (step.optional !== undefined) out.optional = step.optional;
  if (step.table !== undefined) {
    const rule = step.table;
    out.table = typeof rule === "string" ? rule : (ctx) => String(evaluateLogic(rule as JsonLogicRule, procedureData(ctx)) ?? "");
  } else if (step.roll !== undefined || step.value !== undefined) {
    const expr = step.roll;
    const value = step.value;
    out.compute = (ctx, rng) => {
      const extra: Record<string, unknown> = {};
      if (expr !== undefined) {
        const { raw, total } = rollDice(expr, rng);
        ctx.rolls.push({ step: step.id, dice: expr, raw, modifier: 0, total, result: total, ...(step.page !== undefined ? { page: step.page } : {}) });
        if (value === undefined) return total;
        extra.roll = total;
        extra.rollRaw = raw;
      }
      return evaluateLogic(value as JsonLogicRule, procedureData(ctx, extra));
    };
  }
  if (step.skipIf !== undefined) {
    const rule = step.skipIf;
    out.skipIf = (ctx) => truthy(evaluateLogic(rule, procedureData(ctx)));
  }
  if (step.repeat !== undefined) {
    const r = step.repeat;
    out.repeat = typeof r === "number" || typeof r === "string" ? r : (ctx) => evaluateNumber(r, procedureData(ctx));
  }
  if (step.modifier !== undefined) {
    const rule = step.modifier;
    out.modifier = (ctx) => evaluateNumber(rule, procedureData(ctx));
  }
  if (step.derive !== undefined) {
    const derive = Object.entries(step.derive);
    out.after = (ctx, result) => {
      const base: Record<string, unknown> = isPlainObject(result) ? { ...result } : { value: result };
      const data = procedureData(ctx, { result: base });
      for (const [key, rule] of derive) base[key] = evaluateLogic(rule, data);
      return base;
    };
  }
  if (step.display !== undefined) {
    const rule = step.display;
    const repeats = step.repeat !== undefined;
    out.display = (ctx, result, rolls) => {
      const labels = rolls.map((r) => r.rowLabel);
      const label = repeats ? labels : labels[0];
      return text(evaluateLogic(rule, procedureData(ctx, { result, label })));
    };
  }
  return out;
}

/** Presets a procedure's `produce` may start entities from, by id. */
export type PresetLookup = (id: string) => EntityPreset | undefined;

function clonePlain<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
}

function produceFromPack(produce: PackProduce, presets: PresetLookup = () => undefined): Procedure["produce"] {
  return (ctx) => {
    const base = procedureData(ctx);
    const entities: ProducedEntity[] = [];
    const links: ProducedRelationship[] = [];
    for (const def of produce.entities) {
      const many = def.each !== undefined;
      const items: unknown[] = many ? toList(evaluateLogic(def.each as JsonLogicRule, base)) : [undefined];
      items.forEach((item, index) => {
        const data = many ? { ...base, item, index } : base;
        if (def.when !== undefined && !truthy(evaluateLogic(def.when, data))) return;
        const sub = (s: string) => (many ? s.split("{index}").join(String(index)) : s);
        const tempId = many ? `${def.tempId}-${index}` : def.tempId;
        let preset: EntityPreset | undefined;
        if (def.preset !== undefined) {
          const presetId = text(evaluateLogic(def.preset, data));
          if (presetId) {
            preset = presets(presetId);
            if (!preset) throw new Error(`produce "${def.tempId}": unknown preset "${presetId}"`);
            if (preset.entityType !== def.type) throw new Error(`produce "${def.tempId}": preset "${presetId}" is a ${preset.entityType}, not a ${def.type}`);
          }
        }
        let fields: Record<string, unknown> = preset ? clonePlain(preset.fields) : {};
        for (const [path, rule] of Object.entries(def.fields ?? {})) {
          const v = evaluateLogic(rule, data);
          if (v !== undefined && v !== null) fields = setPath(fields, path, v);
        }
        const entity: ProducedEntity = { tempId, type: def.type, name: text(evaluateLogic(def.name, data)) || preset?.name || def.tempId, fields };
        const subtype = def.subtype ?? preset?.subtype;
        if (subtype !== undefined) entity.subtype = subtype;
        const summary = def.summary !== undefined ? text(evaluateLogic(def.summary, data)) : "";
        if (summary) entity.summary = summary;
        else if (preset?.summary) entity.summary = preset.summary;
        if (def.tags !== undefined || preset?.tags !== undefined) entity.tags = [...new Set([...(preset?.tags ?? []), ...(def.tags ?? [])])];
        if (preset) entity.preset = preset.id;
        if (def.within !== undefined) entity.within = sub(def.within);
        entities.push(entity);
        for (const l of def.links ?? []) {
          const rel: ProducedRelationship = { type: l.type, from: tempId, to: sub(l.to) };
          if (l.note !== undefined) {
            const note = text(evaluateLogic(l.note, data));
            if (note) rel.note = note;
          }
          links.push(rel);
        }
      });
    }
    for (const r of produce.relationships ?? []) {
      if (r.when !== undefined && !truthy(evaluateLogic(r.when, base))) continue;
      const rel: ProducedRelationship = { type: r.type, from: r.from, to: r.to };
      if (r.note !== undefined) {
        const note = text(evaluateLogic(r.note, base));
        if (note) rel.note = note;
      }
      links.push(rel);
    }
    // A link to an entity a `when` left out is dropped with it.
    const ids = new Set(entities.map((e) => e.tempId));
    const relationships = links.filter((l) => ids.has(l.from) && ids.has(l.to));
    for (const e of entities) if (e.within !== undefined && !ids.has(e.within)) delete e.within;
    return { entities, relationships };
  };
}

function toList(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (v === undefined || v === null || v === false) return [];
  return [v];
}

function text(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

/** A pack procedure as a contract procedure. */
export function procedureFromPack(proc: PackProcedure, presets?: PresetLookup): Procedure {
  const out: Procedure = { id: proc.id, name: proc.name, steps: proc.steps.map(stepFromPack), produce: produceFromPack(proc.produce, presets) };
  if (proc.description !== undefined) out.description = proc.description;
  if (proc.page !== undefined) out.page = proc.page;
  if (proc.cite !== undefined) out.cite = proc.cite;
  if (proc.original !== undefined) out.original = proc.original;
  if (proc.mode !== undefined) out.mode = [...proc.mode];
  if (proc.inputs !== undefined) out.inputs = proc.inputs;
  if (proc.chains !== undefined) {
    out.chains = proc.chains.map((c) => {
      const chain: NonNullable<Procedure["chains"]>[number] = { procedure: c.procedure, label: c.label };
      const inputs = c.inputs;
      if (inputs) chain.inputs = (ctx) => Object.fromEntries(Object.entries(inputs).map(([k, rule]) => [k, evaluateLogic(rule, procedureData(ctx))]));
      return chain;
    });
  }
  return out;
}

/** The calendar a pack gets when it declares none: twelve 30-day months. */
export function defaultPackCalendar(packId: string): CalendarDef {
  return {
    id: `${packId}.calendar`,
    name: "Calendar",
    defaultYear: 1,
    months: Array.from({ length: 12 }, (_, i) => ({ name: `Month ${i + 1}`, days: 30 })),
    format: "{year}-{month:02}-{day:02}",
  };
}

/**
 * Build a GameModule from a pack that passed `validatePack` (or
 * `mergePackParts`). The pack is copied, so later changes to the input do not
 * reach the module.
 */
export function packToModule(input: ModulePack): GameModule {
  const pack = JSON.parse(JSON.stringify(input)) as ModulePack;
  const presetIndex = new Map((pack.presets ?? []).map((p) => [p.id, p]));
  const presets: PresetLookup = (id) => presetIndex.get(id);
  const module: GameModule = {
    manifest: { ...pack.manifest },
    dice: createDiceEngine(pack.dice),
    entityTypes: pack.entityTypes ?? [],
    relationshipTypes: pack.relationshipTypes ?? [],
    referenceLists: pack.referenceLists ?? [],
    presets: pack.presets ?? [],
    tables: pack.tables ?? [],
    procedures: (pack.procedures ?? []).map((p) => procedureFromPack(p, presets)),
    templates: pack.templates ?? [],
    rules: pack.rules ?? [],
    trackers: pack.trackers ?? [],
    calendar: pack.calendar ?? defaultPackCalendar(pack.manifest.id),
  };
  if (pack.styleNotes) module.styleNotes = pack.styleNotes;
  if (pack.playGuides) module.playGuides = pack.playGuides;
  if (pack.primer) module.primer = pack.primer;
  return module;
}

const WHERE_COLLECTIONS: Record<string, (typeof PACK_COLLECTIONS)[number]> = {
  table: "tables",
  rule: "rules",
  entityType: "entityTypes",
  procedure: "procedures",
  preset: "presets",
  referenceList: "referenceLists",
  template: "templates",
  tracker: "trackers",
  playGuide: "playGuides",
  relationship: "relationshipTypes",
};

/** The JSON path (and item id) a conformance `where` ("table:x.y", "rule:z") points at in the pack. */
export function packPathOf(pack: ModulePack, where: string): { path: string; item?: string } {
  const colon = where.indexOf(":");
  const kind = colon === -1 ? where : where.slice(0, colon);
  const rest = colon === -1 ? "" : where.slice(colon + 1);
  const collection = WHERE_COLLECTIONS[kind];
  if (collection) {
    const items = (pack[collection] ?? []) as Array<{ id: string }>;
    // Longest id that the rest starts with ("entityType:a.b:section:s" -> "a.b").
    let best = -1;
    items.forEach((it, i) => {
      if ((rest === it.id || rest.startsWith(`${it.id}:`)) && (best === -1 || it.id.length > items[best]!.id.length)) best = i;
    });
    if (best !== -1) return { path: jsonPath([collection, best]), item: items[best]!.id };
  }
  if (kind.startsWith("manifest")) return { path: "$.manifest" };
  if (kind === "dice") return { path: "$.dice" };
  if (kind === "calendar") return { path: "$.calendar" };
  return { path: "$" };
}

/** Conformance issues as pack issues with JSON paths. */
export function conformanceToPackIssues(pack: ModulePack, issues: ConformanceIssue[]): PackIssue[] {
  return issues.map((i) => {
    const at = packPathOf(pack, i.where);
    const sub = at.item && i.where.length > i.where.indexOf(at.item) + at.item.length ? ` [${i.where.slice(i.where.indexOf(at.item) + at.item.length + 1)}]` : "";
    const out: PackIssue = { severity: i.severity, path: at.path, message: `${i.message}${sub}`, source: "conformance" };
    if (at.item) out.item = at.item;
    return out;
  });
}

export interface LoadPackResult {
  ok: boolean;
  issues: PackIssue[];
  /** The merged, validated pack (self-contained, no `parts`), when it validated. */
  pack?: ModulePack;
  /** The module, when the pack validated and passed conformance. */
  module?: GameModule;
}

export interface LoadPackOptions extends CheckModuleOptions {
  /** Part files for a split pack. */
  parts?: ReadonlyArray<{ name?: string; data: unknown }>;
}

/**
 * The whole path from untrusted JSON to a checked module: limits, schema,
 * pack checks, parts, conversion, then the SDK conformance suite.
 */
export function loadPack(input: unknown, options: LoadPackOptions = {}): LoadPackResult {
  const { parts, ...checkOptions } = options;
  const merged = mergePackParts(input, parts ?? []);
  if (!merged.ok || !merged.value) return { ok: false, issues: merged.issues };
  const pack = merged.value;
  let module: GameModule;
  try {
    module = packToModule(pack);
  } catch (e) {
    return { ok: false, issues: [...merged.issues, { severity: "error", path: "$", message: (e as Error).message, source: "pack" }], pack };
  }
  const report = checkModule(module, checkOptions);
  const issues = [...merged.issues, ...conformanceToPackIssues(pack, report.issues)];
  const ok = !issues.some((i) => i.severity === "error");
  return ok ? { ok, issues, pack, module } : { ok, issues, pack };
}

/**
 * Where a built-in pack's files come from: loaders for the main file and each
 * part, typically dynamic JSON imports so a bundler gives every file its own
 * lazily loaded chunk:
 *
 *   export const myPack: PackSource = {
 *     main: () => import("../pack/pack.json", { with: { type: "json" } }).then((m) => m.default),
 *     parts: { "rules.json": () => import("../pack/rules.json", { with: { type: "json" } }).then((m) => m.default) },
 *   };
 */
export interface PackSource {
  main: () => Promise<unknown>;
  /** Part file name (as the pack's `parts` lists it) -> loader. */
  parts?: Record<string, () => Promise<unknown>>;
}

export class PackLoadError extends Error {
  readonly issues: PackIssue[];
  constructor(issues: PackIssue[]) {
    const errors = issues.filter((i) => i.severity === "error");
    super(`Data pack failed validation with ${errors.length} error(s):\n${errors.slice(0, 20).map((i) => `  ${i.file ? `${i.file}: ` : ""}${i.path}${i.item ? ` (${i.item})` : ""}: ${i.message}`).join("\n")}`);
    this.name = "PackLoadError";
    this.issues = issues;
  }
}

/** Load every file of a pack source in parallel and merge them into one validated pack. Throws PackLoadError. */
export async function packFromSource(source: PackSource): Promise<ModulePack> {
  const [main, ...parts] = await Promise.all([source.main(), ...Object.entries(source.parts ?? {}).map(async ([name, load]) => ({ name, data: await load() }))]);
  const merged = mergePackParts(main, parts as Array<{ name: string; data: unknown }>);
  if (!merged.ok || !merged.value) throw new PackLoadError(merged.issues);
  return merged.value;
}

/**
 * A GameModule from a pack source (validated, not yet conformance-checked:
 * `loadModule` does that, as for any module).
 */
export async function moduleFromPackSource(source: PackSource): Promise<GameModule> {
  return packToModule(await packFromSource(source));
}
