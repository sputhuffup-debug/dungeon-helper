/**
 * Adventure sources ("Run this job") and template guidance: the contract's
 * small helpers. The app creates the adventure; a module says, through
 * `GameModule.adventureSources`, which records can be run, from which
 * template, and what goes where. Nothing here names a game.
 */
import { evaluateLogic, logicIssues } from "./logic";
import type { AdventureSourceDef, AdventureSourceInput, GameModule, PlayModeId, TemplateAdventure, TemplateScene } from "./types";

// ---------------------------------------------------------------------------
// template text: content and guidance
// ---------------------------------------------------------------------------

/** A paragraph that is guidance: wrapped as a whole in `_..._` (or `*...*`). */
const GUIDANCE = /^\s*([_*])(?![_*\s])([\s\S]*?\S)\1\s*$/;

/**
 * Split template text into content (written into the record) and guidance
 * (shown to the GM as placeholder text, never stored as content): a
 * paragraph wrapped in underscores is guidance, everything else content.
 */
export function templateText(text: string | undefined): { content: string; guide: string } {
  if (!text) return { content: "", guide: "" };
  const content: string[] = [];
  const guide: string[] = [];
  for (const para of text.split(/\n\s*\n/)) {
    if (!para.trim()) continue;
    const m = GUIDANCE.exec(para);
    if (m && !m[2]!.includes(m[1]!)) guide.push(m[2]!.trim());
    else content.push(para.trim());
  }
  return { content: content.join("\n\n"), guide: guide.join(" ") };
}

/** Every guidance paragraph of a template's text, for scans that keep it away from the players. */
export function templateGuidance(t: TemplateAdventure): string[] {
  const out: string[] = [];
  const add = (text: string | undefined) => {
    const g = templateText(text).guide;
    if (g) out.push(g);
  };
  add(t.premise);
  add(t.playerIntro);
  add(t.gmSituation);
  add(t.epilogue);
  for (const act of t.acts) {
    add(act.pacing);
    for (const s of act.scenes ?? []) {
      add(s.body);
      out.push(s.purpose);
    }
    for (const h of act.handouts ?? []) add(h.body);
  }
  return out.filter(Boolean);
}

/** The key an adventure source fills a template scene by: its id, else "<act number>.<scene number>". */
export function templateSceneKey(actNumber: number, index: number, scene: Pick<TemplateScene, "id">): string {
  return scene.id ?? `${actNumber}.${index + 1}`;
}

/**
 * "Arrival: the crew reaches..." -> "Arrival". A parenthetical aside (a note
 * to the GM) is dropped; long purposes are cut to a few words.
 */
export function sceneTitleFromPurpose(purpose: string, fallback = "Scene"): string {
  const text = purpose
    .replace(/[_*`]/g, "")
    .replace(/\s*\([^)]*\)?/g, "")
    .trim();
  if (!text) return fallback;
  const colon = text.indexOf(":");
  if (colon > 0 && colon <= 40) return text.slice(0, colon).trim();
  const firstSentence = text.split(/(?<=[.!?])\s/)[0]?.replace(/[.!?]$/, "") ?? text;
  if (firstSentence.length <= 40) return firstSentence;
  const words = firstSentence.split(/\s+/).slice(0, 5).join(" ");
  return `${words}…`;
}

// ---------------------------------------------------------------------------
// adventure sources
// ---------------------------------------------------------------------------

/** The module's adventure sources for an entity type in a play mode. */
export function adventureSourcesFor(module: Pick<GameModule, "adventureSources">, entityType: string, mode?: PlayModeId): AdventureSourceDef[] {
  return (module.adventureSources ?? []).filter((d) => d.entityType === entityType && (!mode || !d.mode?.length || d.mode.includes(mode)));
}

function truthy(rule: AdventureSourceDef["when"], fields: Record<string, unknown>): boolean {
  try {
    return !!evaluateLogic(rule ?? true, { fields });
  } catch {
    return false;
  }
}

/** The record can be run now (`when`, or always). */
export function sourceRunnable(def: Pick<AdventureSourceDef, "when">, fields: Record<string, unknown>): boolean {
  return def.when === undefined ? true : truthy(def.when, fields);
}

/** The record still waits for an outcome (`open`, or never). */
export function sourceOpen(def: Pick<AdventureSourceDef, "open">, fields: Record<string, unknown>): boolean {
  return def.open === undefined ? false : truthy(def.open, fields);
}

/** An empty input for dry runs and tests. */
export function emptyAdventureSourceInput(entityType: string, mode: PlayModeId = "default"): AdventureSourceInput {
  return { mode, entity: { id: "source-1", name: "Source", type: entityType, fields: {} }, links: [], maps: [], clues: [] };
}

export interface AdventureSourceIssue {
  severity: "error" | "warning";
  where: string;
  message: string;
}

/**
 * Conformance of `GameModule.adventureSources`: unique ids, a declared entity
 * type and adventure template, valid JSONLogic, outcomes with ids, and a dry
 * run on an empty input that must not throw, must be deterministic and must
 * name only scenes the template has.
 */
export function adventureSourceIssues(module: Pick<GameModule, "adventureSources" | "entityTypes" | "templates" | "manifest">): AdventureSourceIssue[] {
  const defs = module.adventureSources;
  if (defs === undefined) return [];
  const out: AdventureSourceIssue[] = [];
  const err = (where: string, message: string) => out.push({ severity: "error", where, message });
  if (!Array.isArray(defs)) return [{ severity: "error", where: "adventureSources", message: "adventureSources must be a list" }];
  const declared = new Set((module.manifest?.modes ?? []).map((m) => m.id));
  const seen = new Set<string>();
  for (const d of defs) {
    const where = `adventureSource:${String(d?.id)}`;
    if (!d || typeof d.id !== "string" || !d.id) {
      err("adventureSources", "an adventure source has no id");
      continue;
    }
    if (seen.has(d.id)) err(where, `duplicate adventure source "${d.id}"`);
    seen.add(d.id);
    if (!d.label) err(where, "needs a label");
    if (!module.entityTypes.some((t) => t.id === d.entityType)) err(where, `unknown entity type "${d.entityType}"`);
    for (const m of d.mode ?? []) if (!declared.has(m)) err(where, `mode "${m}" is not declared by the module`);
    for (const key of ["when", "open"] as const) {
      if (d[key] === undefined) continue;
      for (const m of logicIssues(d[key])) err(where, `${key}: ${m}`);
    }
    const outcomeIds = new Set<string>();
    for (const o of d.outcomes ?? []) {
      if (!o.id || !o.label) err(where, "every outcome needs an id and a label");
      else if (outcomeIds.has(o.id)) err(where, `duplicate outcome "${o.id}"`);
      outcomeIds.add(o.id);
    }
    const template = module.templates.find((t) => t.id === d.template);
    const scaffold = template?.scaffold as Partial<TemplateAdventure> | undefined;
    if (!template || template.kind !== "adventure" || !Array.isArray(scaffold?.acts)) {
      err(where, `template "${d.template}" is not an adventure template of the module`);
      continue;
    }
    const keys = new Set(scaffold.acts.flatMap((a) => (a.scenes ?? []).map((s, i) => templateSceneKey(a.number, i, s))));
    if (typeof d.prefill !== "function") {
      err(where, "prefill must be a function");
      continue;
    }
    try {
      const input = emptyAdventureSourceInput(d.entityType, d.mode?.[0] ?? module.manifest?.defaultMode ?? "default");
      const first = d.prefill(input);
      const second = d.prefill(emptyAdventureSourceInput(d.entityType, input.mode));
      if (JSON.stringify(first) !== JSON.stringify(second)) err(where, "prefill is not deterministic on an empty input");
      for (const k of [...Object.keys(first.scenes ?? {}), ...(first.plan ?? [])]) if (!keys.has(k)) err(where, `prefill names scene "${k}", which the template does not have`);
    } catch (e) {
      err(where, `prefill threw on an empty input: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (d.trip !== undefined) {
      if (typeof d.trip !== "function") err(where, "trip must be a function");
      else {
        try {
          const entity = { id: "", name: "", type: d.entityType, fields: {} };
          const a = d.trip({ entity });
          if (a !== undefined && (typeof a.days !== "number" || !Number.isFinite(a.days) || a.days < 0 || typeof a.text !== "string")) err(where, "trip must return { days, text } with days a number of 0 or more");
          if (JSON.stringify(a) !== JSON.stringify(d.trip({ entity }))) err(where, "trip is not deterministic on an empty input");
        } catch (e) {
          err(where, `trip threw on an empty input: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
    if (d.people !== undefined) {
      if (typeof d.people !== "function") err(where, "people must be a function");
      else {
        try {
          const a = d.people(emptyAdventureSourceInput(d.entityType, d.mode?.[0] ?? module.manifest?.defaultMode ?? "default"));
          const b = d.people(emptyAdventureSourceInput(d.entityType, d.mode?.[0] ?? module.manifest?.defaultMode ?? "default"));
          if (!Array.isArray(a)) err(where, "people must return a list");
          else if (JSON.stringify(a) !== JSON.stringify(b)) err(where, "people is not deterministic on an empty input");
        } catch (e) {
          err(where, `people threw on an empty input: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
  }
  return out;
}
