/**
 * The "Set up your campaign" guide and campaign settings: the generic runtime
 * behind `GameModule.setup` and `GameModule.campaignSettings`.
 *
 * - `composeSetupSteps` merges the core's generic steps with a module's own
 *   for a play mode (the module's layout hides and reorders steps).
 * - `evaluateSetupSteps` ticks each step from a `SetupSnapshot` (JSONLogic,
 *   never clicks) and resolves its links.
 * - `setupIssues` and `campaignSettingIssues` are the conformance checks.
 *
 * Nothing here names a game.
 */
import { evaluateLogic, logicIssues } from "./logic";
import {
  CORE_SETUP_STEP_IDS,
  RESERVED_SETTING_KEYS,
  SETUP_PAGES,
  type CampaignSettingDef,
  type CampaignSettingOption,
  type GameModule,
  type JsonLogicRule,
  type PageRef,
  type PlayModeId,
  type SetupLayout,
  type SetupLink,
  type SetupSnapshot,
  type SetupSnapshotEntity,
  type SetupStepDef,
} from "./types";

export interface SetupIssue {
  severity: "error" | "warning";
  where: string;
  message: string;
}

/** A snapshot of an empty campaign (the conformance suite dry-runs every rule on it). */
export function emptySetupSnapshot(mode: PlayModeId): SetupSnapshot {
  return {
    mode,
    settings: {},
    entityIds: [],
    entities: [],
    pcs: [],
    players: [],
    sessions: [],
    adventures: [],
    arcs: [],
    counts: { entities: 0, pcs: 0, unownedPcs: 0, players: 0, sessions: 0, plannedSessions: 0, playedSessions: 0, adventures: 0, arcs: 0, maps: 0, notes: 0, handouts: 0 },
  };
}

const inMode = (mode: PlayModeId) => (x: { mode?: PlayModeId[] }) => !x.mode || x.mode.length === 0 || x.mode.includes(mode);

/** The module's layout for a mode: the first that fits. */
export function setupLayoutFor(setup: GameModule["setup"], mode: PlayModeId): SetupLayout | undefined {
  return (setup?.layouts ?? []).find(inMode(mode));
}

/**
 * The guide's steps for a play mode, in order: the core steps (minus those
 * the layout hides), then the module's, both filtered by mode; the layout's
 * `order` moves the ids it names to the front, in its order.
 */
export function composeSetupSteps(coreSteps: readonly SetupStepDef[], setup: GameModule["setup"], mode: PlayModeId): SetupStepDef[] {
  const layout = setupLayoutFor(setup, mode);
  const hide = new Set(layout?.hide ?? []);
  const all = [...coreSteps.filter((s) => !hide.has(s.id)), ...(setup?.steps ?? [])].filter(inMode(mode));
  const byId = new Map(all.map((s) => [s.id, s]));
  const ordered: SetupStepDef[] = [];
  for (const id of layout?.order ?? []) {
    const s = byId.get(id);
    if (s && !ordered.includes(s)) ordered.push(s);
  }
  for (const s of all) if (!ordered.includes(s)) ordered.push(s);
  return ordered;
}

/** A link with its target resolved: an `entity` link carries the entity it opens. */
export interface SetupLinkState extends SetupLink {
  /** `entity` links: the id of the entity it opens. */
  entityId?: string;
}

export interface SetupStepState {
  id: string;
  label: string;
  hint?: string;
  page?: PageRef;
  done: boolean;
  /** `progress`, evaluated: how many of how many. */
  count?: { value: number; of: number };
  /** Links to show (an `entity` link that matches nothing is left out). */
  links: SetupLinkState[];
}

function truthy(rule: JsonLogicRule, data: unknown): boolean {
  try {
    return !!evaluateLogic(rule, data);
  } catch {
    return false;
  }
}

function numberOf(rule: JsonLogicRule, data: unknown): number {
  try {
    const v = Number(evaluateLogic(rule, data));
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

/** The first entity (by name, then id) a rule matches. */
export function matchSetupEntity(rule: JsonLogicRule, snapshot: SetupSnapshot): SetupSnapshotEntity | undefined {
  return [...snapshot.entities].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)).find((e) => truthy(rule, e));
}

/** Tick every step from the snapshot and resolve its links. Pure. */
export function evaluateSetupSteps(steps: readonly SetupStepDef[], snapshot: SetupSnapshot): SetupStepState[] {
  return steps.map((step) => {
    const links: SetupLinkState[] = [];
    for (const l of step.links ?? []) {
      if (l.entity !== undefined) {
        const e = matchSetupEntity(l.entity, snapshot);
        if (e) links.push({ ...l, entityId: e.id });
      } else links.push({ ...l });
    }
    return {
      id: step.id,
      label: step.label,
      ...(step.hint ? { hint: step.hint } : {}),
      ...(step.page !== undefined ? { page: step.page } : {}),
      done: truthy(step.done, snapshot),
      ...(step.progress ? { count: { value: numberOf(step.progress.count, snapshot), of: numberOf(step.progress.of, snapshot) } } : {}),
      links,
    };
  });
}

/** Done and total steps. */
export function setupProgress(states: readonly Pick<SetupStepState, "done">[]): { done: number; total: number } {
  return { done: states.filter((s) => s.done).length, total: states.length };
}

// ---------------------------------------------------------------------------
// campaign settings
// ---------------------------------------------------------------------------

/** The module's campaign settings for a play mode (only those asked at creation, with `atCreation`). */
export function campaignSettingsFor(module: Pick<GameModule, "campaignSettings">, mode: PlayModeId, opts: { atCreation?: boolean } = {}): CampaignSettingDef[] {
  return (module.campaignSettings ?? []).filter(inMode(mode)).filter((d) => !opts.atCreation || d.atCreation === true);
}

/** A choice setting's options: its own, else its reference list's items (in the mode, when given). */
export function campaignSettingOptions(def: CampaignSettingDef, module: Pick<GameModule, "referenceLists">, mode?: PlayModeId): CampaignSettingOption[] {
  if (def.options && def.options.length > 0) return def.options.map((o) => ({ ...o }));
  if (!def.list) return [];
  const list = module.referenceLists.find((l) => l.id === def.list);
  return (list?.items ?? []).filter((i) => mode === undefined || inMode(mode)(i)).map((i) => ({ value: i.id, label: i.name, ...(i.summary ? { hint: i.summary } : {}) }));
}

/** `meta.settings` values a new campaign starts with: each setting's `default` for the mode, overridden by `chosen`. Unknown keys and values outside a choice's options are dropped. */
export function initialCampaignSettings(module: Pick<GameModule, "campaignSettings" | "referenceLists">, mode: PlayModeId, chosen: Record<string, unknown> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const def of campaignSettingsFor(module, mode)) {
    const value = chosen[def.key] !== undefined && chosen[def.key] !== "" ? chosen[def.key] : def.default;
    if (value === undefined || value === "") continue;
    if (def.kind === "choice" && !campaignSettingOptions(def, module, mode).some((o) => o.value === value)) continue;
    if (typeof value !== "string") continue;
    out[def.key] = value;
  }
  return out;
}

// ---------------------------------------------------------------------------
// conformance
// ---------------------------------------------------------------------------

type CheckedModule = Pick<GameModule, "manifest" | "setup" | "campaignSettings" | "entityTypes" | "procedures" | "referenceLists" | "presets">;

function checkLink(l: SetupLink, where: string, module: CheckedModule, err: (where: string, message: string) => void): void {
  const targets = [l.page !== undefined, l.procedure !== undefined, l.newEntity !== undefined, l.entity !== undefined].filter(Boolean).length;
  if (!l || typeof l.label !== "string" || !l.label.trim()) err(where, "a link needs a label");
  if (targets !== 1) err(where, `link "${l?.label}" needs exactly one of page, procedure, newEntity or entity`);
  if (l.page !== undefined && !SETUP_PAGES.includes(l.page)) err(where, `link "${l.label}": unknown page "${l.page}" (one of ${SETUP_PAGES.join(", ")})`);
  if (l.params !== undefined && l.page === undefined) err(where, `link "${l.label}": params only go with a page`);
  if (l.procedure !== undefined && !module.procedures.some((p) => p.id === l.procedure)) err(where, `link "${l.label}": unknown procedure "${l.procedure}"`);
  if (l.newEntity !== undefined) {
    if (!module.entityTypes.some((t) => t.id === l.newEntity!.type)) err(where, `link "${l.label}": unknown entity type "${l.newEntity.type}"`);
    if (l.newEntity.preset !== undefined && !module.presets.some((p) => p.id === l.newEntity!.preset)) err(where, `link "${l.label}": unknown preset "${l.newEntity.preset}"`);
  }
  if (l.entity !== undefined) for (const m of logicIssues(l.entity)) err(where, `link "${l.label}": ${m}`);
}

/**
 * Conformance of `GameModule.setup`: unique, module-namespaced step ids with
 * a label and a `done` rule; valid JSONLogic; declared modes; links to known
 * pages, procedures and entity types; layouts that name known steps; and a
 * dry run of every rule on an empty campaign (it must not throw, and an
 * empty campaign must not count as set up).
 */
export function setupIssues(module: CheckedModule): SetupIssue[] {
  const def = module.setup;
  if (def === undefined) return [];
  const out: SetupIssue[] = [];
  const err = (where: string, message: string) => out.push({ severity: "error", where, message });
  const warn = (where: string, message: string) => out.push({ severity: "warning", where, message });
  if (!def || !Array.isArray(def.steps)) {
    err("setup", "setup needs a list of steps");
    return out;
  }
  const moduleId = module.manifest?.id ?? "";
  const declared = new Set((module.manifest?.modes ?? []).map((m) => m.id));
  const seen = new Set<string>();
  for (const s of def.steps) {
    const where = `setup:${String(s?.id)}`;
    if (!s || typeof s.id !== "string" || !s.id) {
      err("setup", "a step has no id");
      continue;
    }
    if (seen.has(s.id)) err(where, `duplicate setup step "${s.id}"`);
    seen.add(s.id);
    if (s.id.startsWith("setup.")) err(where, `"setup." is the core's prefix; namespace the id with the module id ("${moduleId}.…")`);
    else if (moduleId && !s.id.startsWith(`${moduleId}.`)) err(where, `step id must start with the module id ("${moduleId}.")`);
    if (typeof s.label !== "string" || !s.label.trim()) err(where, "step needs a label");
    if (s.done === undefined) err(where, "step needs a done rule");
    for (const m of s.mode ?? []) if (!declared.has(m)) err(where, `mode "${m}" is not declared by the module`);
    for (const m of logicIssues(s.done)) err(where, `done: ${m}`);
    if (s.progress) for (const m of [...logicIssues(s.progress.count), ...logicIssues(s.progress.of)]) err(where, `progress: ${m}`);
    for (const l of s.links ?? []) checkLink(l, where, module, err);
    const modes = s.mode && s.mode.length ? s.mode : [...declared];
    for (const mode of modes) {
      const empty = emptySetupSnapshot(mode);
      try {
        if (evaluateLogic(s.done, empty)) warn(where, `an empty campaign already counts as done in mode "${mode}"`);
      } catch (e) {
        err(where, `done rule throws on an empty campaign: ${(e as Error).message}`);
      }
    }
  }
  const known = new Set([...CORE_SETUP_STEP_IDS, ...seen]);
  for (const [i, layout] of (def.layouts ?? []).entries()) {
    const where = `setup:layout#${i}`;
    for (const m of layout.mode ?? []) if (!declared.has(m)) err(where, `mode "${m}" is not declared by the module`);
    for (const id of layout.hide ?? []) if (!CORE_SETUP_STEP_IDS.includes(id)) err(where, `hide names "${id}", which is not a core step (${CORE_SETUP_STEP_IDS.join(", ")})`);
    for (const id of layout.order ?? []) if (!known.has(id)) err(where, `order names unknown step "${id}"`);
  }
  return out;
}

/**
 * Conformance of `GameModule.campaignSettings`: unique keys that are not the
 * core's own, a label, a kind with what it needs (options or a known list,
 * known entity types), a default among the options, declared modes.
 */
export function campaignSettingIssues(module: CheckedModule): SetupIssue[] {
  const defs = module.campaignSettings;
  if (defs === undefined) return [];
  const out: SetupIssue[] = [];
  const err = (where: string, message: string) => out.push({ severity: "error", where, message });
  if (!Array.isArray(defs)) {
    err("campaignSettings", "campaignSettings must be a list");
    return out;
  }
  const declared = new Set((module.manifest?.modes ?? []).map((m) => m.id));
  const seen = new Set<string>();
  for (const d of defs) {
    const where = `campaignSetting:${String(d?.key)}`;
    if (!d || typeof d.key !== "string" || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(d.key)) {
      err(where, "a setting needs a key of letters, digits, _ and -");
      continue;
    }
    if (seen.has(d.key)) err(where, `duplicate campaign setting "${d.key}"`);
    seen.add(d.key);
    if (RESERVED_SETTING_KEYS.includes(d.key) || d.key.startsWith("tracker:")) err(where, `"${d.key}" is a core setting`);
    if (typeof d.label !== "string" || !d.label.trim()) err(where, "setting needs a label");
    for (const m of d.mode ?? []) if (!declared.has(m)) err(where, `mode "${m}" is not declared by the module`);
    if (d.kind === "choice") {
      if (d.list !== undefined && !module.referenceLists.some((l) => l.id === d.list)) err(where, `unknown reference list "${d.list}"`);
      const options = campaignSettingOptions(d, module);
      if (options.length === 0) err(where, "a choice needs options or a reference list with items");
      if (new Set(options.map((o) => o.value)).size !== options.length) err(where, "option values must be unique");
      if (d.default !== undefined && !options.some((o) => o.value === d.default)) err(where, `default "${d.default}" is not one of the options`);
    } else if (d.kind === "entity") {
      if (!d.entityTypes || d.entityTypes.length === 0) err(where, "an entity setting needs entityTypes");
      for (const t of d.entityTypes ?? []) if (!module.entityTypes.some((x) => x.id === t)) err(where, `unknown entity type "${t}"`);
      if (d.atCreation) err(where, "an entity setting cannot be asked at creation (a new campaign has no entities)");
    } else if (d.kind !== "text") err(where, `kind must be "choice", "entity" or "text"`);
  }
  return out;
}
