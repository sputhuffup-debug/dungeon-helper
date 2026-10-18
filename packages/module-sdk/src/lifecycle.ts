/**
 * Life-cycle runner: timed stages that advance with in-world time.
 *
 * A module describes a life cycle as data (a tracker of kind "lifecycle"
 * whose `config` is a `LifecycleConfig`): variants, each an ordered list of
 * stages with a duration in the module's clock units, the stages that may
 * follow, an optional periodic check (a dice operation), an optional removal
 * action and effects to apply on entering the stage. A stage with a
 * `creaturePreset` spawns an entity from that preset the first time, and
 * swaps the same entity onto the next preset at later stages.
 *
 * Everything here is pure and game-agnostic: functions take the state and
 * return the next state plus the effects for the app to apply. Ranged
 * durations are rolled with an Rng seeded from the instance seed and the
 * stage id, so the same seed and the same clock advances give the same
 * outcome.
 */
import { createRng } from "./rng";
import { CORE_RELATIONSHIP_TYPES, type Effect, type PageRef, type Rng } from "./types";

// ---------------------------------------------------------------------------
// Data shapes
// ---------------------------------------------------------------------------

export interface LifecycleUnit {
  id: string;
  name: string;
  plural?: string;
  /** In-world minutes per unit. */
  minutes: number;
}

export interface LifecycleDuration {
  /** A fixed count of `unit`, or an inclusive [min, max] range rolled when the stage starts. */
  amount: number | [number, number];
  unit: string;
}

export interface LifecycleTransition {
  /** Stage id within the same variant. */
  to: string;
  label?: string;
  /** When the step happens (shown to the GM for stages that wait). */
  condition?: string;
  page?: PageRef;
}

export interface LifecycleCheck {
  label: string;
  /** Dice operation id; it runs with the host as its entity. */
  operation: string;
  /** How often the check is due while the stage lasts. */
  every: LifecycleDuration;
  /** Host condition id that makes further checks pointless (the check has hit). */
  stopCondition?: string;
  page?: PageRef;
  note?: string;
}

export interface LifecycleRemoval {
  label: string;
  note?: string;
  page?: PageRef;
  /** Host condition id that makes removal impossible. */
  blockedByCondition?: string;
  blockedNote?: string;
  /** Applied when the GM removes it; `$host`, `$creature`, `$source` and `{host}` placeholders are bound. */
  effects?: Effect[];
}

export interface LifecycleWitnessPrompt {
  text: string;
  /** Dice operation each witness rolls. */
  operation: string;
  page?: PageRef;
}

export interface LifecycleStage {
  id: string;
  name: string;
  /** Short tag such as a stage number. */
  label?: string;
  page?: PageRef;
  summary?: string;
  /** The spawned entity takes this preset on entering the stage (created on first use). */
  creaturePreset?: string;
  /** Absent: the stage lasts until the GM advances it. */
  duration?: LifecycleDuration;
  /** Stages that may follow; the first is taken when a timed stage runs out. Absent or empty: final stage. */
  next?: LifecycleTransition[];
  /** Shown while the stage waits for the GM. */
  waitNote?: string;
  /** Shown on a final stage. */
  finalNote?: string;
  check?: LifecycleCheck;
  removal?: LifecycleRemoval;
  /** Applied on entering the stage, with placeholders bound. */
  onEnter?: Effect[];
  /** On entering, every witness gets a roll prompt for this operation. */
  witnessPrompt?: LifecycleWitnessPrompt;
  unverified?: boolean;
  note?: string;
}

export interface LifecycleVariant {
  id: string;
  name: string;
  summary?: string;
  page?: PageRef;
  /** Preset ids of the source creature that leads to this variant (used to preselect it). */
  sourcePresets?: string[];
  stages: LifecycleStage[];
  unverified?: boolean;
  note?: string;
}

export interface LifecyclePace {
  id: string;
  label: string;
  /** Multiplier on elapsed time: 2 runs twice as fast. */
  factor: number;
}

export interface LifecycleConfig {
  units: LifecycleUnit[];
  paces: LifecyclePace[];
  defaultPace: string;
  variants: LifecycleVariant[];
  defaultVariant: string;
  /** How a spawned entity is named and linked. `name` may use {host} and {stage}. */
  spawn: { name: string; link?: { type: string; note?: string }; keep?: string[] };
  /**
   * Where the app offers a start action: entity kinds that can be the subject,
   * kinds that can be the source, and a field that, when truthy, rules an
   * entity out as a subject.
   */
  start?: { label: string; entityKinds: string[]; sourceKinds?: string[]; exemptField?: string };
  labels?: { instance?: string; subject?: string; creature?: string };
  pauseNote?: string;
  paceNote?: string;
}

export interface LifecycleHistoryEntry {
  stage: string;
  /** World minutes. */
  at: number;
  forced?: boolean;
}

export interface LifecycleInstance {
  id: string;
  variant: string;
  host: string;
  hostName: string;
  /** Entity spawned by the cycle, once it exists. */
  creature?: string;
  /** The entity that started it, if known. */
  source?: string;
  stage: string;
  /** Pace-weighted minutes spent in the current stage. */
  progress: number;
  /** Minutes the current stage lasts at normal pace (rolled for ranges); absent when it waits for the GM. */
  duration?: number;
  pace: string;
  paused: boolean;
  /** World minutes when the cycle and the current stage began. */
  started: number;
  stageStarted: number;
  /** Checks already run in the current stage. */
  checksDone: number;
  history: LifecycleHistoryEntry[];
  ended?: { reason: string; at: number };
  seed: string;
}

export interface LifecycleState {
  instances: LifecycleInstance[];
}

export interface LifecycleContext {
  /** World minutes now (after the advance, for `advanceLifecycles`). */
  at: number;
  /** Entities that see what happens (for witness prompts); the host and the creature are skipped. */
  witnesses?: Array<{ id: string; name: string }>;
  /** Id for a spawned entity. Default `${instance.id}-spawn`. */
  newId?: () => string;
  /** Whether an entity has a condition (for checks and blocked removals). */
  hasCondition?: (entity: string, condition: string) => boolean;
  /**
   * Run one due check (the app rolls the operation and applies its effects). Return
   * `false` when it could not roll (e.g. no session to log to); the check then stays
   * due and runs on a later advance instead of being lost.
   */
  runCheck?: (instance: LifecycleInstance, check: LifecycleCheck) => boolean | void;
}

export interface LifecycleResult {
  state: LifecycleState;
  /** Effects for the app to apply, in order. */
  effects: Effect[];
}

// ---------------------------------------------------------------------------
// Reading config and state
// ---------------------------------------------------------------------------

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);

const DEFAULT_PACES: LifecyclePace[] = [
  { id: "slower", label: "Slower", factor: 0.5 },
  { id: "normal", label: "Normal", factor: 1 },
  { id: "faster", label: "Faster", factor: 2 },
];

/** A tracker's config as a LifecycleConfig, with defaults for anything missing. */
export function lifecycleConfig(config: Record<string, unknown> | undefined): LifecycleConfig {
  const c = config ?? {};
  const units = Array.isArray(c.units) ? (c.units.filter(isRecord) as unknown as LifecycleUnit[]).filter((u) => typeof u.minutes === "number") : [];
  const paces = Array.isArray(c.paces) && c.paces.length ? (c.paces.filter(isRecord) as unknown as LifecyclePace[]) : DEFAULT_PACES;
  const variants = Array.isArray(c.variants) ? (c.variants.filter(isRecord) as unknown as LifecycleVariant[]) : [];
  const spawn = isRecord(c.spawn) ? (c.spawn as unknown as LifecycleConfig["spawn"]) : { name: "{stage} ({host})" };
  const out: LifecycleConfig = {
    units,
    paces,
    defaultPace: str(c.defaultPace, paces.find((p) => p.factor === 1)?.id ?? paces[0]?.id ?? "normal"),
    variants,
    defaultVariant: str(c.defaultVariant, variants[0]?.id ?? ""),
    spawn,
  };
  if (isRecord(c.start)) out.start = c.start as unknown as NonNullable<LifecycleConfig["start"]>;
  if (isRecord(c.labels)) out.labels = c.labels as LifecycleConfig["labels"];
  if (typeof c.pauseNote === "string") out.pauseNote = c.pauseNote;
  if (typeof c.paceNote === "string") out.paceNote = c.paceNote;
  return out;
}

/** A tracker's state as a LifecycleState (instances with missing fields defaulted). */
export function lifecycleState(state: unknown): LifecycleState {
  const raw = isRecord(state) && Array.isArray(state.instances) ? state.instances : [];
  const instances: LifecycleInstance[] = raw.filter(isRecord).map((r) => {
    const inst: LifecycleInstance = {
      id: str(r.id),
      variant: str(r.variant),
      host: str(r.host),
      hostName: str(r.hostName, str(r.host)),
      stage: str(r.stage),
      progress: num(r.progress, 0),
      pace: str(r.pace, "normal"),
      paused: r.paused === true,
      started: num(r.started, 0),
      stageStarted: num(r.stageStarted, 0),
      checksDone: num(r.checksDone, 0),
      history: Array.isArray(r.history) ? (r.history.filter(isRecord) as unknown as LifecycleHistoryEntry[]) : [],
      seed: str(r.seed, str(r.id)),
    };
    if (typeof r.creature === "string") inst.creature = r.creature;
    if (typeof r.source === "string") inst.source = r.source;
    if (typeof r.duration === "number") inst.duration = r.duration;
    if (isRecord(r.ended)) inst.ended = { reason: str(r.ended.reason), at: num(r.ended.at, 0) };
    return inst;
  });
  return { instances };
}

export function lifecycleVariant(config: LifecycleConfig, variantId: string): LifecycleVariant | undefined {
  return config.variants.find((v) => v.id === variantId);
}

export function lifecycleStage(config: LifecycleConfig, variantId: string, stageId: string): LifecycleStage | undefined {
  return lifecycleVariant(config, variantId)?.stages.find((s) => s.id === stageId);
}

export function unitMinutes(config: LifecycleConfig, unitId: string): number {
  const u = config.units.find((x) => x.id === unitId);
  if (!u) throw new Error(`Life cycle: unknown time unit "${unitId}"`);
  return u.minutes;
}

export function paceFactor(config: LifecycleConfig, paceId: string): number {
  const f = config.paces.find((p) => p.id === paceId)?.factor;
  return typeof f === "number" && f > 0 ? f : 1;
}

/** Minutes for a duration; a range is rolled in whole units with `rng` (its midpoint without one). */
export function durationMinutes(config: LifecycleConfig, d: LifecycleDuration, rng?: Rng): number {
  const per = unitMinutes(config, d.unit);
  if (Array.isArray(d.amount)) {
    const [lo, hi] = d.amount;
    const n = rng ? rng.int(Math.min(lo, hi), Math.max(lo, hi)) : (lo + hi) / 2;
    return n * per;
  }
  return d.amount * per;
}

/** "1 Shift", "4–6 Shifts". */
export function formatLifecycleDuration(config: LifecycleConfig, d: LifecycleDuration): string {
  const u = config.units.find((x) => x.id === d.unit);
  const name = (n: number) => (u ? (n === 1 ? u.name : u.plural ?? `${u.name}s`) : d.unit);
  if (Array.isArray(d.amount)) return `${d.amount[0]}–${d.amount[1]} ${name(2)}`;
  return `${d.amount} ${name(d.amount)}`;
}

/** Minutes in the largest unit that fits, e.g. "2 Stretches", "1.5 Shifts". */
export function formatLifecycleMinutes(config: LifecycleConfig, minutes: number): string {
  if (minutes <= 0) return "0";
  const units = [...config.units].sort((a, b) => b.minutes - a.minutes);
  const unit = units.find((u) => minutes >= u.minutes) ?? units[units.length - 1];
  if (!unit) return `${Math.round(minutes)} min`;
  const n = Math.round((minutes / unit.minutes) * 10) / 10;
  return `${n} ${n === 1 ? unit.name : unit.plural ?? `${unit.name}s`}`;
}

/** The stages that may follow the instance's current stage. */
export function nextTransitions(config: LifecycleConfig, inst: LifecycleInstance): LifecycleTransition[] {
  return lifecycleStage(config, inst.variant, inst.stage)?.next ?? [];
}

/** Active instances whose subject is `entityId`. */
export function activeLifecyclesFor(state: LifecycleState, entityId: string): LifecycleInstance[] {
  return state.instances.filter((i) => !i.ended && (i.host === entityId || i.creature === entityId));
}

// ---------------------------------------------------------------------------
// Placeholders
// ---------------------------------------------------------------------------

/**
 * Bind placeholders in module-declared effects: a string equal to `$name` is
 * replaced by `vars[name]`; `{name}` inside other strings by `text[name]`.
 */
export function bindPlaceholders<T>(value: T, vars: Record<string, string | undefined>, text: Record<string, string | undefined> = {}): T {
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") {
      if (v.startsWith("$") && v.slice(1) in vars) return vars[v.slice(1)] ?? v;
      return v.replace(/\{(\w+)\}/g, (m, k: string) => text[k] ?? m);
    }
    if (Array.isArray(v)) return v.map(walk);
    if (isRecord(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value) as T;
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

function stageTitle(stage: LifecycleStage): string {
  return stage.label ? `${stage.name} (${stage.label})` : stage.name;
}

function instanceLabel(config: LifecycleConfig): string {
  return config.labels?.instance ?? "Life cycle";
}

/** Enter `stage`: reset the stage clock, roll its duration, spawn or swap the creature, bind its effects. */
function enterStage(config: LifecycleConfig, inst: LifecycleInstance, stage: LifecycleStage, at: number, ctx: LifecycleContext, effects: Effect[], forced: boolean): void {
  inst.stage = stage.id;
  inst.progress = 0;
  inst.checksDone = 0;
  inst.stageStarted = at;
  if (stage.duration) inst.duration = durationMinutes(config, stage.duration, createRng(`${inst.seed}:${stage.id}`));
  else delete inst.duration;
  inst.history = [...inst.history, { stage: stage.id, at, ...(forced ? { forced: true } : {}) }];

  effects.push({ kind: "log", text: `${instanceLabel(config)} (${inst.hostName}): ${stageTitle(stage)}${forced ? ", advanced by the GM" : ""}.` });
  const text = { host: inst.hostName, stage: stage.name };
  if (stage.creaturePreset) {
    if (!inst.creature) {
      const id = ctx.newId?.() ?? `${inst.id}-spawn`;
      inst.creature = id;
      const create: Effect = { kind: "createFromPreset", preset: stage.creaturePreset, id, name: bindPlaceholders(config.spawn.name, {}, text) };
      if (config.spawn.link) create.link = { type: config.spawn.link.type, to: inst.host, ...(config.spawn.link.note ? { note: config.spawn.link.note } : {}) };
      effects.push(create);
    } else {
      effects.push({ kind: "applyPreset", entity: inst.creature, preset: stage.creaturePreset, ...(config.spawn.keep ? { keep: [...config.spawn.keep] } : {}) });
    }
  }
  const vars = { host: inst.host, creature: inst.creature, source: inst.source };
  if (stage.onEnter) effects.push(...bindPlaceholders(stage.onEnter, vars, text));
  if (stage.witnessPrompt) {
    for (const w of ctx.witnesses ?? []) {
      if (w.id === inst.host || w.id === inst.creature) continue;
      effects.push({
        kind: "prompt",
        prompt: {
          id: `${inst.id}:${stage.id}:${w.id}`,
          kind: "roll",
          text: bindPlaceholders(stage.witnessPrompt.text, {}, { ...text, witness: w.name }),
          roll: { operation: stage.witnessPrompt.operation },
          entity: w.id,
          ...(stage.witnessPrompt.page !== undefined ? { page: stage.witnessPrompt.page } : {}),
        },
      });
    }
  }
}

function cloneState(state: LifecycleState): LifecycleState {
  return { instances: state.instances.map((i) => ({ ...i, history: [...i.history], ...(i.ended ? { ended: { ...i.ended } } : {}) })) };
}

export interface StartLifecycleInput {
  id: string;
  variant: string;
  host: string;
  hostName: string;
  /** Seed for rolled durations. Default: the id. */
  seed?: string;
  source?: string;
  /** Start at this stage instead of the variant's first. */
  stage?: string;
  pace?: string;
}

/** Start a new instance at the variant's first stage (or `input.stage`). */
export function startLifecycle(config: LifecycleConfig, state: LifecycleState, input: StartLifecycleInput, ctx: LifecycleContext): LifecycleResult {
  const variant = lifecycleVariant(config, input.variant);
  if (!variant) throw new Error(`Life cycle: unknown variant "${input.variant}"`);
  const stage = input.stage ? variant.stages.find((s) => s.id === input.stage) : variant.stages[0];
  if (!stage) throw new Error(`Life cycle: variant "${variant.id}" has no stage "${input.stage ?? "(first)"}"`);
  const next = cloneState(state);
  const inst: LifecycleInstance = {
    id: input.id,
    variant: variant.id,
    host: input.host,
    hostName: input.hostName,
    stage: stage.id,
    progress: 0,
    pace: input.pace ?? config.defaultPace,
    paused: false,
    started: ctx.at,
    stageStarted: ctx.at,
    checksDone: 0,
    history: [],
    seed: input.seed ?? input.id,
  };
  if (input.source) inst.source = input.source;
  const effects: Effect[] = [{ kind: "log", text: `${instanceLabel(config)} started: ${inst.hostName}, ${variant.name}.` }];
  enterStage(config, inst, stage, ctx.at, ctx, effects, false);
  next.instances.push(inst);
  return { state: next, effects };
}

/** Run the due checks of the current stage up to pace-weighted progress `upTo`. */
function runDueChecks(config: LifecycleConfig, inst: LifecycleInstance, stage: LifecycleStage, upTo: number, ctx: LifecycleContext): void {
  const check = stage.check;
  if (!check || !ctx.runCheck) return;
  const every = durationMinutes(config, check.every);
  if (every <= 0) return;
  const due = Math.floor(upTo / every + 1e-9);
  while (inst.checksDone < due) {
    if (check.stopCondition && ctx.hasCondition?.(inst.host, check.stopCondition)) return;
    if (ctx.runCheck(inst, check) === false) return;
    inst.checksDone += 1;
  }
}

/**
 * Advance every running instance by `minutes` of world time (`ctx.at` is the
 * time after the advance). Paused instances do not move; the pace multiplies
 * elapsed time. Timed stages that run out move to their first `next` stage,
 * carrying the excess over; stages without a duration wait for the GM.
 */
export function advanceLifecycles(config: LifecycleConfig, state: LifecycleState, minutes: number, ctx: LifecycleContext): LifecycleResult {
  const next = cloneState(state);
  const effects: Effect[] = [];
  if (!(minutes > 0)) return { state: next, effects };
  const begin = ctx.at - minutes;
  for (const inst of next.instances) {
    if (inst.ended || inst.paused) continue;
    const factor = paceFactor(config, inst.pace);
    let remaining = minutes * factor;
    let realUsed = 0;
    for (let guard = 0; guard < 100 && remaining > 0; guard++) {
      const stage = lifecycleStage(config, inst.variant, inst.stage);
      if (!stage) break;
      const duration = inst.duration;
      const reach = duration === undefined ? inst.progress + remaining : Math.min(duration, inst.progress + remaining);
      runDueChecks(config, inst, stage, reach, ctx);
      const follow = stage.next?.[0];
      if (duration === undefined || inst.progress + remaining < duration || !follow) {
        inst.progress = reach;
        break;
      }
      const used = duration - inst.progress;
      remaining -= used;
      realUsed += used / factor;
      const target = lifecycleStage(config, inst.variant, follow.to);
      if (!target) break;
      enterStage(config, inst, target, begin + realUsed, ctx, effects, false);
    }
  }
  return { state: next, effects };
}

function withInstance(state: LifecycleState, id: string, fn: (inst: LifecycleInstance, next: LifecycleState) => void): LifecycleState {
  const next = cloneState(state);
  const inst = next.instances.find((i) => i.id === id);
  if (!inst) throw new Error(`Life cycle: no instance "${id}"`);
  fn(inst, next);
  return next;
}

/** Move an instance to the next stage now (`to`, else the default next stage). */
export function forceAdvance(config: LifecycleConfig, state: LifecycleState, id: string, to: string | undefined, ctx: LifecycleContext): LifecycleResult {
  const effects: Effect[] = [];
  const next = withInstance(state, id, (inst) => {
    if (inst.ended) throw new Error("Life cycle: this instance has ended");
    const options = nextTransitions(config, inst);
    const choice = to === undefined ? options[0] : options.find((o) => o.to === to);
    if (!choice) throw new Error(`Life cycle: stage "${inst.stage}" cannot move to "${to ?? "(none)"}"`);
    const target = lifecycleStage(config, inst.variant, choice.to);
    if (!target) throw new Error(`Life cycle: unknown stage "${choice.to}"`);
    enterStage(config, inst, target, ctx.at, ctx, effects, true);
  });
  return { state: next, effects };
}

export function setLifecyclePaused(config: LifecycleConfig, state: LifecycleState, id: string, paused: boolean): LifecycleResult {
  let host = "";
  const next = withInstance(state, id, (inst) => {
    inst.paused = paused;
    host = inst.hostName;
  });
  return { state: next, effects: [{ kind: "log", text: `${instanceLabel(config)} (${host}): ${paused ? "paused" : "resumed"}.` }] };
}

export function setLifecyclePace(config: LifecycleConfig, state: LifecycleState, id: string, pace: string): LifecycleResult {
  let host = "";
  const next = withInstance(state, id, (inst) => {
    inst.pace = pace;
    host = inst.hostName;
  });
  const label = config.paces.find((p) => p.id === pace)?.label ?? pace;
  return { state: next, effects: [{ kind: "log", text: `${instanceLabel(config)} (${host}): pace ${label}.` }] };
}

/** Whether the current stage's removal is blocked (by a host condition). */
export function removalBlocked(config: LifecycleConfig, inst: LifecycleInstance, hasCondition?: (entity: string, condition: string) => boolean): boolean {
  const removal = lifecycleStage(config, inst.variant, inst.stage)?.removal;
  if (!removal) return true;
  return !!removal.blockedByCondition && !!hasCondition?.(inst.host, removal.blockedByCondition);
}

/** Apply the current stage's removal: its effects, and the instance ends. */
export function removeLifecycle(config: LifecycleConfig, state: LifecycleState, id: string, ctx: LifecycleContext): LifecycleResult {
  const effects: Effect[] = [];
  const next = withInstance(state, id, (inst) => {
    const stage = lifecycleStage(config, inst.variant, inst.stage);
    const removal = stage?.removal;
    if (!stage || !removal) throw new Error(`Life cycle: stage "${inst.stage}" has no removal`);
    if (removalBlocked(config, inst, ctx.hasCondition)) throw new Error(`Life cycle: ${removal.blockedNote ?? "removal is blocked"}`);
    inst.ended = { reason: removal.label, at: ctx.at };
    effects.push({ kind: "log", text: `${instanceLabel(config)} (${inst.hostName}): ${removal.label}.` });
    if (removal.effects) effects.push(...bindPlaceholders(removal.effects, { host: inst.host, creature: inst.creature, source: inst.source }, { host: inst.hostName, stage: stage.name }));
  });
  return { state: next, effects };
}

/** Stop tracking an instance (no effects on entities). */
export function dismissLifecycle(state: LifecycleState, id: string): LifecycleState {
  return { instances: cloneState(state).instances.filter((i) => i.id !== id) };
}

// ---------------------------------------------------------------------------
// Conformance
// ---------------------------------------------------------------------------

/**
 * Problems in a lifecycle config against its module: unknown units, stages,
 * presets, dice operations and relationship types. Used by `checkModule` for
 * trackers of kind "lifecycle".
 */
export function lifecycleConfigIssues(
  config: LifecycleConfig,
  module: { presets: Array<{ id: string }>; dice: { operations?: Record<string, unknown> }; relationshipTypes: Array<{ id: string }> },
): string[] {
  const issues: string[] = [];
  const units = new Set(config.units.map((u) => u.id));
  const presets = new Set(module.presets.map((p) => p.id));
  const ops = new Set(Object.keys(module.dice.operations ?? {}));
  const checkDuration = (d: LifecycleDuration | undefined, where: string) => {
    if (d && !units.has(d.unit)) issues.push(`${where}: unknown time unit "${d.unit}"`);
  };
  if (config.units.length === 0) issues.push("no time units");
  if (!config.paces.some((p) => p.id === config.defaultPace)) issues.push(`unknown default pace "${config.defaultPace}"`);
  if (!config.variants.some((v) => v.id === config.defaultVariant)) issues.push(`unknown default variant "${config.defaultVariant}"`);
  const link = config.spawn.link?.type;
  if (link && !module.relationshipTypes.some((r) => r.id === link) && !CORE_RELATIONSHIP_TYPES.some((r) => r.id === link)) issues.push(`spawn link uses unknown relationship type "${link}"`);
  for (const v of config.variants) {
    const ids = new Set(v.stages.map((s) => s.id));
    if (v.stages.length === 0) issues.push(`variant ${v.id}: no stages`);
    for (const p of v.sourcePresets ?? []) if (!presets.has(p)) issues.push(`variant ${v.id}: unknown source preset "${p}"`);
    for (const s of v.stages) {
      const where = `variant ${v.id}, stage ${s.id}`;
      checkDuration(s.duration, where);
      if (s.creaturePreset && !presets.has(s.creaturePreset)) issues.push(`${where}: unknown preset "${s.creaturePreset}"`);
      for (const n of s.next ?? []) if (!ids.has(n.to)) issues.push(`${where}: next stage "${n.to}" does not exist`);
      if (s.check) {
        checkDuration(s.check.every, `${where} check`);
        if (!ops.has(s.check.operation)) issues.push(`${where}: unknown check operation "${s.check.operation}"`);
      }
      if (s.witnessPrompt && !ops.has(s.witnessPrompt.operation)) issues.push(`${where}: unknown witness operation "${s.witnessPrompt.operation}"`);
    }
  }
  return issues;
}
