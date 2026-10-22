/**
 * Dice rolled at the table. Many groups roll physical dice; the GM types the
 * faces and the app treats them exactly like an app roll. Every engine, table
 * roll, dice operation and procedure step takes its randomness from the Rng it
 * is given (rule 3), so an Rng that hands out the typed faces makes them
 * consume the physical dice in the same order an app roll would, with no code
 * per engine:
 *
 * - `createEnteredRng(faces)` answers each `int(min, max)` with the next face,
 *   checking it is a whole number in range; running out, a face out of range
 *   or faces left over throw an `EnteredDiceError` the UI can show.
 * - `probeDice(run)` and `planEntry(run, values)` run the same roll function
 *   to find out which dice it asks for, in order, with the labels the engines
 *   pass in `DieHint` ("Base die", "Stress die", "d66 tens d6"), and where a
 *   group of dice can be typed as one number (a 2d6 total, a d66, a d100).
 *   Later dice can depend on earlier ones (a nested table, a re-roll), so the
 *   plan is rebuilt as faces come in.
 * - `recordDice(rng)` keeps the faces an app roll used, so a test (and
 *   the determinism check) can confirm that typing them reproduces the roll.
 *
 * Consumption order of the built-in engines (each `int` call is one die):
 *   d20     one d20; with advantage or disadvantage two d20 in order.
 *   2d6     two d6 in order (a "2d6" group: the total can be typed).
 *   d100    the units d10 (0-9), then the tens d10 (0-9), then one more tens
 *           d10 per bonus or penalty die; without those a "d100" group (type
 *           the percentile; 00 + 0 is 100).
 *   pool    each die kind in the engine's order (`dice` config), all of one
 *           kind before the next; a push re-rolls the dice it does not keep,
 *           in pool order.
 *   tables  the table's dice expression term by term (a d66 is tens then
 *           ones), then nested tables in row order.
 * A `fork(name)` of an entered Rng shares its faces, so forked sub-streams
 * (nested tables, procedure steps) take the next faces in the order they roll.
 */
import type { DiceGroup, DieHint, Rng } from "./types";

export type EnteredDiceErrorCode = "missing" | "range" | "integer" | "extra" | "random" | "too-many";

/** Why entered dice do not fit the roll; `index` is the face it is about (0-based). */
export class EnteredDiceError extends Error {
  readonly code: EnteredDiceErrorCode;
  readonly index: number;
  readonly request?: DieRequest;
  constructor(code: EnteredDiceErrorCode, message: string, index: number, request?: DieRequest) {
    super(message);
    this.name = "EnteredDiceError";
    this.code = code;
    this.index = index;
    if (request) this.request = request;
  }
}

/** One die a roll asks for. */
export interface DieRequest {
  min: number;
  max: number;
  /** "Stress die", "d20", "d66 tens d6", or the range ("d6", "0–9") when the roll gave no label. */
  label: string;
  /** DieSpec id, when the roll said. */
  die?: string;
  group?: DiceGroup;
  /** The roll named the die (a `DieHint` label). */
  named?: boolean;
}

const STANDARD = new Set([2, 3, 4, 6, 8, 10, 12, 20, 100]);

/** A die's name from its range: "d6", "d10 (0–9)", or "1–37" for a pick that is not a usual die. */
export function dieLabel(min: number, max: number): string {
  if (min === 1 && STANDARD.has(max)) return `d${max}`;
  if (min === 0 && max === 9) return "d10 (0–9)";
  return `${min}–${max}`;
}

/**
 * Is this a die a GM would roll at the table? True when the roll named it
 * (a `DieHint` label or group) or its range is a usual die (1..N for a d2 to
 * d100, or 0..9); false for a pick from a list (`int(0, 37)`) or a made-up
 * number (`int(100, 999)`).
 */
export function isDieRequest(req: DieRequest): boolean {
  if (req.named || req.group) return true;
  return (req.min === 1 && STANDARD.has(req.max)) || (req.min === 0 && req.max === 9);
}

function bounds(min: number, max: number): [number, number] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) throw new Error("rng.int: bounds must be finite");
  return [Math.ceil(Math.min(min, max)), Math.floor(Math.max(min, max))];
}

function requestOf(lo: number, hi: number, hint: DieHint | undefined): DieRequest {
  const req: DieRequest = { min: lo, max: hi, label: hint?.label ?? dieLabel(lo, hi) };
  if (hint?.label) req.named = true;
  if (hint?.die) req.die = hint.die;
  if (hint?.group) req.group = hint.group;
  return req;
}

/** "a d6 shows 1–6" style range text. */
function showsText(req: DieRequest): string {
  return `${req.label} shows ${req.min}–${req.max}`;
}

export interface EnteredRng extends Rng {
  /** Faces used so far. */
  readonly used: number;
  /** Faces not used yet. */
  remaining(): number;
  /** Each die asked for so far, in order. */
  readonly requests: readonly DieRequest[];
}

export interface EnteredRngOptions {
  /**
   * Where `next()` (randomness that is not a die, e.g. a map layout) comes
   * from. Without one, `next()` throws: the roll needs the app's dice.
   */
  fallback?: Rng;
}

/**
 * An Rng that answers each `int(min, max)` with the next entered face. A
 * range of one value (`int(3, 3)`) needs no die and takes no face.
 */
export function createEnteredRng(faces: readonly number[], options: EnteredRngOptions = {}): EnteredRng {
  const state = { i: 0 };
  const requests: DieRequest[] = [];
  const make = (fallback: Rng | undefined): EnteredRng => ({
    next(): number {
      if (!fallback) throw new EnteredDiceError("random", "This roll uses the app's randomness, not dice: roll it in the app.", state.i);
      return fallback.next();
    },
    int(min: number, max: number, hint?: DieHint): number {
      const [lo, hi] = bounds(min, max);
      if (lo === hi) return lo;
      const req = requestOf(lo, hi, hint);
      const at = state.i;
      if (at >= faces.length) throw new EnteredDiceError("missing", `Needs more dice: the ${req.label} is missing.`, at, req);
      const v = faces[at]!;
      if (!Number.isInteger(v)) throw new EnteredDiceError("integer", `Die ${at + 1}: a ${showsText(req)}; "${v}" is not a whole number.`, at, req);
      if (v < lo || v > hi) throw new EnteredDiceError("range", `Die ${at + 1}: a ${showsText(req)}, not ${v}.`, at, req);
      state.i++;
      requests.push(req);
      return v;
    },
    fork(name: string): Rng {
      return make(fallback?.fork(name));
    },
    get used() {
      return state.i;
    },
    remaining() {
      return Math.max(0, faces.length - state.i);
    },
    get requests() {
      return requests;
    },
  });
  return make(options.fallback);
}

/**
 * Run a roll with entered faces. Every face must be used: a roll that needs
 * more, or fewer, throws an `EnteredDiceError`.
 */
export function rollEntered<T>(run: (rng: Rng) => T, faces: readonly number[], options: EnteredRngOptions = {}): T {
  const rng = createEnteredRng(faces, options);
  const value = run(rng);
  assertAllUsed(rng);
  return value;
}

/** Throws when an entered Rng was given more faces than the roll used. */
export function assertAllUsed(rng: EnteredRng): void {
  const left = rng.remaining();
  if (left > 0) throw new EnteredDiceError("extra", `This roll uses ${rng.used} ${rng.used === 1 ? "die" : "dice"}; ${left} more ${left === 1 ? "was" : "were"} entered.`, rng.used);
}

/** Is this an entered-dice Rng (as opposed to a seeded one)? */
export function isEnteredRng(rng: Rng): rng is EnteredRng {
  return typeof (rng as Partial<EnteredRng>).remaining === "function" && "requests" in rng;
}

/**
 * Wrap an Rng to keep the faces it hands out, in the order they are used
 * (forks included). Feeding `faces` to `createEnteredRng` replays the roll.
 */
export function recordDice(rng: Rng): {
  rng: Rng;
  faces: number[];
  requests: DieRequest[];
} {
  const faces: number[] = [];
  const requests: DieRequest[] = [];
  const wrap = (inner: Rng): Rng => ({
    next: () => inner.next(),
    int(min: number, max: number, hint?: DieHint): number {
      const [lo, hi] = bounds(min, max);
      const v = inner.int(min, max, hint);
      if (lo !== hi) {
        faces.push(v);
        requests.push(requestOf(lo, hi, hint));
      }
      return v;
    },
    fork: (name: string) => wrap(inner.fork(name)),
  });
  return { rng: wrap(rng), faces, requests };
}

export interface DiceProbe {
  /** Every die the roll asks for, in order: the entered ones, then the rest as if each showed its lowest face. */
  requests: DieRequest[];
  /** How many of the entered faces the roll used. */
  used: number;
  /** The roll ran to the end (false when it needed more dice than `max`, or failed). */
  complete: boolean;
  /** An entered face that does not fit, or the roll's own error. */
  error?: string;
  /** Index of the face the error is about. */
  errorIndex?: number;
}

/**
 * Find out which dice a roll asks for. `run` must be pure (a dice system's
 * roll or push, a table roll, an operation's `run`): it is run with the
 * entered `prefix` faces first, then with each further die at its lowest
 * face, recording every request. Dice that depend on earlier faces (a nested
 * table, a re-roll of the non-successes) are right once those faces are in.
 */
export function probeDice(run: (rng: Rng) => unknown, prefix: readonly number[] = [], options: EnteredRngOptions & { max?: number } = {}): DiceProbe {
  const max = options.max ?? 200;
  const requests: DieRequest[] = [];
  let used = 0;
  const fallback = options.fallback;
  const make = (fb: Rng | undefined): Rng => ({
    next: () => (fb ? fb.next() : 0),
    int(min: number, max_: number, hint?: DieHint): number {
      const [lo, hi] = bounds(min, max_);
      if (lo === hi) return lo;
      const req = requestOf(lo, hi, hint);
      const at = requests.length;
      if (at >= max) throw new EnteredDiceError("too-many", `This roll asks for more than ${max} dice.`, at, req);
      requests.push(req);
      if (at < prefix.length) {
        const v = prefix[at]!;
        if (!Number.isInteger(v)) throw new EnteredDiceError("integer", `A ${showsText(req)}.`, at, req);
        if (v < lo || v > hi) throw new EnteredDiceError("range", `A ${showsText(req)}.`, at, req);
        used = at + 1;
        return v;
      }
      return lo;
    },
    fork: (name: string) => make(fb?.fork(name)),
  });
  try {
    run(make(fallback));
    return { requests, used, complete: true };
  } catch (e) {
    const out: DiceProbe = {
      requests,
      used,
      complete: false,
      error: e instanceof Error ? e.message : String(e),
    };
    if (e instanceof EnteredDiceError) out.errorIndex = e.index;
    return out;
  }
}

/** One input of the entry form: a single die, or a group of dice typed as one number. */
export interface EntrySlot {
  label: string;
  min: number;
  max: number;
  /** How many dice the slot stands for (a group's total covers several). */
  dice: number;
  /** DieSpec id of the slot's die, when every die in it is the same kind. */
  die?: string;
  /** True when the slot is a group's number (a 2d6 total, a d66). */
  group?: boolean;
  /** The value typed for it. */
  value?: number;
  /** Why the value does not fit. */
  error?: string;
  /** False for slots after the first one still missing or wrong: they may change once it is in. */
  settled: boolean;
}

export interface EntryPlan {
  slots: EntrySlot[];
  /** Every face, in roll order, when every slot is filled in and fits; feed these to `createEnteredRng`. */
  faces?: number[];
  /** Dice still to enter (counting a group as its dice). */
  missing: number;
  /** The roll itself failed (not a value that does not fit). */
  error?: string;
}

export interface PlanEntryOptions extends EntryPlanOptionsBase {
  /** Offer a group's number (2d6 total, d66, d100) as one input (default true). */
  totals?: boolean;
}

interface EntryPlanOptionsBase extends EnteredRngOptions {
  /** Most dice a roll may ask for (default 200). */
  max?: number;
}

/** Consecutive requests from `start` that share the first one's group, when it has one and totals are on. */
function slotSize(requests: readonly DieRequest[], start: number, totals: boolean): number {
  const first = requests[start];
  if (!first?.group || !totals) return 1;
  let n = 1;
  while (requests[start + n]?.group === first.group) n++;
  return n;
}

function slotOf(requests: readonly DieRequest[], start: number, size: number): EntrySlot {
  const first = requests[start]!;
  if (size > 1 && first.group) {
    const kinds = new Set(requests.slice(start, start + size).map((r) => r.die));
    const slot: EntrySlot = {
      label: first.group.label,
      min: first.group.min,
      max: first.group.max,
      dice: size,
      group: true,
      settled: true,
    };
    if (kinds.size === 1 && first.die) slot.die = first.die;
    return slot;
  }
  const slot: EntrySlot = {
    label: first.label,
    min: first.min,
    max: first.max,
    dice: 1,
    settled: true,
  };
  if (first.die) slot.die = first.die;
  return slot;
}

/** Faces for a slot's value, or the reason it does not fit. */
function slotFaces(requests: readonly DieRequest[], start: number, size: number, slot: EntrySlot, value: number): number[] | string {
  if (!Number.isInteger(value)) return `Type a whole number (${slot.min}–${slot.max}).`;
  if (slot.group) {
    const faces = requests[start]!.group!.faces(value);
    if (!faces || faces.length !== size) return `${slot.label} can't make ${value} (${slot.min}–${slot.max}).`;
    for (let k = 0; k < size; k++) {
      const r = requests[start + k]!;
      if (faces[k]! < r.min || faces[k]! > r.max) return `${slot.label} can't make ${value}.`;
    }
    return faces;
  }
  if (value < slot.min || value > slot.max) return `A ${slot.label} shows ${slot.min}–${slot.max}.`;
  return [value];
}

const isNum = (v: unknown): v is number => typeof v === "number" && !Number.isNaN(v);

/**
 * The entry form for a roll: one slot per die (or per group with `totals`),
 * in roll order, each with its typed value checked. `values[i]` is what was
 * typed in slot i (undefined when empty). When every slot fits, `faces` holds
 * the faces to roll with. The plan is rebuilt slot by slot, so dice that
 * depend on earlier ones (a nested table row) appear once those are in.
 */
export function planEntry(run: (rng: Rng) => unknown, values: ReadonlyArray<number | undefined | null>, options: PlanEntryOptions = {}): EntryPlan {
  const totals = options.totals !== false;
  const faces: number[] = [];
  const slots: EntrySlot[] = [];
  for (let guard = 0; guard < 1000; guard++) {
    const probe = probeDice(run, faces, options);
    if (probe.error && (probe.errorIndex === undefined || probe.errorIndex >= faces.length)) {
      return { slots, missing: 0, error: probe.error };
    }
    const requests = probe.requests;
    let at = faces.length;
    if (at >= requests.length) return { slots, faces: [...faces], missing: 0 };
    // The next slot: fill it in if its value fits, else lay out the rest unsettled.
    const size = slotSize(requests, at, totals);
    const slot = slotOf(requests, at, size);
    const value = values[slots.length];
    if (isNum(value)) {
      slot.value = value;
      const got = slotFaces(requests, at, size, slot, value);
      if (Array.isArray(got)) {
        slots.push(slot);
        faces.push(...got);
        continue;
      }
      slot.error = got;
    }
    slots.push(slot);
    let missing = slot.error || !isNum(value) ? size : 0;
    at += size;
    while (at < requests.length) {
      const n = slotSize(requests, at, totals);
      const rest = slotOf(requests, at, n);
      rest.settled = false;
      const v = values[slots.length];
      if (isNum(v)) {
        rest.value = v;
        const got = slotFaces(requests, at, n, rest, v);
        if (typeof got === "string") {
          rest.error = got;
          missing += n;
        }
      } else missing += n;
      slots.push(rest);
      at += n;
    }
    return { slots, missing };
  }
  return { slots, missing: 0, error: "This roll asks for too many dice." };
}

/** Run a roll with the faces of a finished plan. */
export function rollPlanned<T>(run: (rng: Rng) => T, plan: EntryPlan, options: EnteredRngOptions = {}): T {
  if (!plan.faces) throw new EnteredDiceError("missing", plan.error ?? `Needs ${plan.missing} more ${plan.missing === 1 ? "die" : "dice"}.`, 0);
  return rollEntered(run, plan.faces, options);
}

/**
 * Which dice a roll asks for, as a short line: consecutive dice with the same
 * label counted ("Base die ×4, Stress die ×2", "d20 ×2"). A group reads as
 * its name ("2d6", "d66"), or die by die with `totals: false` ("d66 tens d6,
 * d66 ones d6").
 */
export function describeDiceToEnter(run: (rng: Rng) => unknown, options: PlanEntryOptions = {}): string {
  const plan = planEntry(run, [], options);
  const parts: Array<{ label: string; n: number }> = [];
  for (const s of plan.slots) {
    const last = parts[parts.length - 1];
    if (last && last.label === s.label) last.n++;
    else parts.push({ label: s.label, n: 1 });
  }
  return parts.map((p) => (p.n > 1 ? `${p.label} ×${p.n}` : p.label)).join(", ");
}

/** "needs 2 more dice" style text for a plan that is not complete. */
export function missingText(plan: EntryPlan): string | undefined {
  if (plan.error) return plan.error;
  if (plan.faces) return undefined;
  const wrong = plan.slots.find((s) => s.error);
  if (wrong) return wrong.error;
  return `Needs ${plan.missing} more ${plan.missing === 1 ? "die" : "dice"}.`;
}

/**
 * An Rng that names every die it hands out after `prefix` ("Ripley: d20"),
 * for a roll that rolls the same dice for several people (initiative).
 */
export function labelDice(rng: Rng, prefix: string): Rng {
  const groups = new Map<DiceGroup, DiceGroup>();
  const wrap = (inner: Rng): Rng => ({
    next: () => inner.next(),
    int(min: number, max: number, hint?: DieHint): number {
      const [lo, hi] = bounds(min, max);
      let group = hint?.group;
      if (group) {
        const named = groups.get(group) ?? { ...group, label: `${prefix}: ${group.label}` };
        groups.set(group, named);
        group = named;
      }
      return inner.int(min, max, { ...hint, label: `${prefix}: ${hint?.label ?? dieLabel(lo, hi)}`, ...(group ? { group } : {}) });
    },
    fork: (name: string) => wrap(inner.fork(name)),
  });
  return wrap(rng);
}
