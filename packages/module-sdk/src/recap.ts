/**
 * "Previously on…" session recaps: the contract's small helpers. The recap
 * itself is built by core (`buildSessionRecap`) from the campaign; a module
 * adds its own lines through `GameModule.recap` contributors, which read a
 * `RecapSnapshot` and return sections. Nothing here names a game.
 */
import type { GameModule, PlayModeId, RecapAudience, RecapSectionDraft, RecapSnapshot } from "./types";

/** Section ids and sort order of the core recap; a module can add lines to any of them (same id and audience) or bring its own. */
export const RECAP_SECTION_ORDER = {
  story: 10,
  world: 15,
  scenes: 20,
  revealed: 30,
  met: 40,
  rewards: 50,
  table: 60,
  wrapup: 70,
  "loose-ends": 80,
  secrets: 90,
  notes: 100,
} as const;

export type CoreRecapSectionId = keyof typeof RECAP_SECTION_ORDER;

/** Order a module section takes when it gives none: after the found and met records, before rewards. */
export const RECAP_MODULE_ORDER = 45;

export const RECAP_AUDIENCES: readonly RecapAudience[] = ["gm", "players"];

/** An empty snapshot (for dry runs and tests). */
export function emptyRecapSnapshot(audience: RecapAudience, mode: PlayModeId = "default"): RecapSnapshot {
  const session = { id: "session-2", number: 2, date: "2026-01-08", label: "Session 2" };
  return {
    audience,
    mode,
    campaign: "Recap check",
    session,
    sessions: [{ id: "session-1", number: 1, date: "2026-01-01", label: "Session 1" }],
    since: "2026-01-01T00:00:00.000Z",
    settings: {},
    entities: [],
    relationships: [],
    reveals: [],
    clues: [],
    ticks: [],
    payoffs: [],
    heat: [],
    ledger: [],
    balance: 0,
    travel: [],
    hunts: [],
  };
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Problems with a list of sections a contributor returned (shape only). */
export function recapSectionIssues(sections: unknown): string[] {
  if (!Array.isArray(sections)) return ["build() must return a list of sections"];
  const out: string[] = [];
  sections.forEach((s, i) => {
    if (!isRec(s)) return void out.push(`section ${i + 1} is not an object`);
    if (typeof s.id !== "string" || !s.id) out.push(`section ${i + 1} has no id`);
    if (typeof s.title !== "string" || !s.title) out.push(`section "${String(s.id)}" has no title`);
    if (!RECAP_AUDIENCES.includes(s.audience as RecapAudience)) out.push(`section "${String(s.id)}" has an audience other than "gm" or "players"`);
    if (s.order !== undefined && (typeof s.order !== "number" || !Number.isFinite(s.order))) out.push(`section "${String(s.id)}" has an order that is not a number`);
    if (!Array.isArray(s.lines)) return void out.push(`section "${String(s.id)}" has no lines list`);
    (s.lines as unknown[]).forEach((l, j) => {
      if (!isRec(l) || typeof l.key !== "string" || !l.key || typeof l.text !== "string") out.push(`section "${String(s.id)}" line ${j + 1} needs a key and a text`);
    });
  });
  return out;
}

export interface RecapIssue {
  severity: "error" | "warning";
  where: string;
  message: string;
}

/**
 * Conformance of `GameModule.recap`: unique contributor ids, declared modes,
 * and a dry run on an empty snapshot for each audience: it must not throw,
 * must return well-formed sections, must be deterministic, and given a
 * players snapshot must return players sections only.
 */
export function recapIssues(module: Pick<GameModule, "recap" | "manifest">): RecapIssue[] {
  const def = module.recap;
  if (def === undefined) return [];
  const out: RecapIssue[] = [];
  const err = (where: string, message: string) => out.push({ severity: "error", where, message });
  if (!isRec(def) || !Array.isArray(def.contributors)) {
    err("recap", "recap needs a list of contributors");
    return out;
  }
  const declared = new Set((module.manifest?.modes ?? []).map((m) => m.id));
  const seen = new Set<string>();
  for (const c of def.contributors) {
    const where = `recap:${String(c?.id)}`;
    if (!c || typeof c.id !== "string" || !c.id) {
      err("recap", "a contributor has no id");
      continue;
    }
    if (seen.has(c.id)) err(where, `duplicate recap contributor "${c.id}"`);
    seen.add(c.id);
    for (const m of c.mode ?? []) if (!declared.has(m)) err(where, `mode "${m}" is not declared by the module`);
    if (typeof c.build !== "function") {
      err(where, "build must be a function");
      continue;
    }
    for (const audience of RECAP_AUDIENCES) {
      const mode = c.mode?.[0] ?? module.manifest?.defaultMode ?? "default";
      let first: RecapSectionDraft[];
      let second: RecapSectionDraft[];
      try {
        first = c.build(emptyRecapSnapshot(audience, mode));
        second = c.build(emptyRecapSnapshot(audience, mode));
      } catch (e) {
        err(where, `build threw on an empty ${audience} snapshot: ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }
      for (const m of recapSectionIssues(first)) err(where, m);
      if (JSON.stringify(first) !== JSON.stringify(second)) err(where, `build is not deterministic on an empty ${audience} snapshot`);
      if (audience === "players" && Array.isArray(first) && first.some((s) => isRec(s) && s.audience !== "players")) err(where, "given a players snapshot, build must return players sections only");
    }
  }
  return out;
}
