import type {
  DiceOperation,
  DiceOperationResult,
  Effect,
  RollRecord,
  RollResult,
  Rng,
  TableRegistry,
} from "@campaign-forge/module-sdk";
import { BASE_DIE, STRESS_DIE, SUCCESS, FACEHUGGER } from "./pool";
import { ANDROID_CRITICAL_DAMAGE_TABLE, CRITICAL_INJURY_TABLE, MENTAL_TRAUMA_TABLE, PANIC_TABLE, STRESS_RESPONSE_TABLE } from "./tableIds";
import { rollOnTable } from "./tableLookup";

const num = (v: unknown, fallback = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const str = (v: unknown): string | undefined => (typeof v === "string" && v.length > 0 ? v : undefined);
const rowId = (result: unknown): string | undefined =>
  result && typeof result === "object" ? str((result as { id?: unknown }).id) : undefined;

const characterInput = {
  entity: { type: "string", description: "Character entity id the effects apply to." },
  stress: { type: "integer", minimum: 0, default: 0 },
  resolve: { type: "integer", minimum: 0, default: 0, description: "Computed Resolve." },
  extraModifier: { type: "integer", default: 0 },
  android: { type: "boolean", default: false, description: "Androids have no stress level and never make panic rolls (p. 25, 77)." },
};

/** A panic result at or above this calls for a mental trauma check after the session (p. 74). */
export const PANIC_TRAUMA_THRESHOLD = 9;

/** Androids have no stress and never panic (p. 25, 77): no roll, no effects beyond a log line. */
function androidExempt(name: string, input: Record<string, unknown>): DiceOperationResult | undefined {
  if (input.android !== true) return undefined;
  const label = "No effect: androids do not suffer stress or panic";
  return { rolls: [], result: { exempt: true, label }, label, effects: [{ kind: "log", text: `${name} (p. 25, 77): ${label}.` }] };
}

/** D6 + stress − Resolve; same formula for stress response (p. 44) and panic (p. 72-73). */
function stressLookup(
  tables: TableRegistry,
  rng: Rng,
  input: Record<string, unknown>,
  tableId: string,
  step: string,
) {
  const stress = Math.max(0, num(input.stress));
  const resolve = Math.max(0, num(input.resolve));
  const extra = num(input.extraModifier);
  return {
    stress,
    resolve,
    ...rollOnTable(tables, tableId, rng, {
      step,
      context: { stress, resolve },
      extraModifier: extra,
      fallbackDice: "1d6",
      fallbackModifier: stress - resolve,
    }),
  };
}

export const stressResponse: DiceOperation = {
  id: "stressResponse",
  name: "Stress response",
  page: 44,
  input: { type: "object", properties: characterInput },
  run(input, rng, tables): DiceOperationResult {
    const exempt = androidExempt("Stress response", input);
    if (exempt) return exempt;
    const { record, row } = stressLookup(tables, rng, input, STRESS_RESPONSE_TABLE, "stressResponse");
    const label = record.rowLabel ?? `Stress response ${record.total}`;
    const entity = str(input.entity);
    const effects: Effect[] = [{ kind: "log", text: `Stress response (p. 44): ${label} (total ${record.total}).` }];
    if (entity && row) {
      effects.push({
        kind: "addCondition",
        entity,
        condition: { id: `stress-response:${record.total}`, label, source: STRESS_RESPONSE_TABLE, page: 44 },
      });
    }
    return { total: record.total, rolls: [record], result: { row: row?.result ?? null, total: record.total }, label, effects };
  },
};

export const panicRoll: DiceOperation = {
  id: "panicRoll",
  name: "Panic roll",
  page: [72, 73],
  input: { type: "object", properties: { ...characterInput, trigger: { type: "string" } } },
  run(input, rng, tables): DiceOperationResult {
    const exempt = androidExempt("Panic roll", input);
    if (exempt) return exempt;
    const { record, row } = stressLookup(tables, rng, input, PANIC_TABLE, "panicRoll");
    const total = record.total;
    const traumaCheck = total >= PANIC_TRAUMA_THRESHOLD;
    const label = record.rowLabel ?? `Panic ${total}`;
    const entity = str(input.entity);
    const effects: Effect[] = [
      {
        kind: "log",
        text: `Panic roll (p. 72-73): ${label} (total ${total})${traumaCheck ? "; calls for a mental trauma check after the session (p. 74)" : ""}.`,
      },
    ];
    if (entity) {
      effects.push({
        kind: "addCondition",
        entity,
        condition: { id: `panic:${total}`, label, source: PANIC_TABLE, page: [72, 73] },
      });
    }
    return {
      total,
      rolls: [record],
      result: { row: row?.result ?? null, total, traumaCheck, label, ...(entity ? { entity } : {}) },
      label,
      effects,
    };
  },
};

/** Cinematic play: spend a Story Point to turn one base die into a success, before or after a push (p. 44, 158). */
export const storyPoint: DiceOperation = {
  id: "storyPoint",
  name: "Spend a Story Point",
  page: [44, 158],
  input: {
    type: "object",
    required: ["result"],
    properties: {
      entity: { type: "string" },
      result: { type: "object", description: "The RollResult to improve." },
    },
  },
  run(input): DiceOperationResult {
    const prev = input.result as RollResult | undefined;
    const entity = str(input.entity);
    const record: RollRecord = { step: "storyPoint", dice: "-", raw: [], modifier: 0, total: 0, result: null, page: 44 };
    if (!prev || !Array.isArray(prev.dice)) {
      return { rolls: [record], result: null, label: "No roll to improve", effects: [] };
    }
    const idx = prev.dice.findIndex((d) => d.die === BASE_DIE && d.value !== 6);
    if (idx < 0) {
      return { rolls: [record], result: prev, label: "No base die left to convert", effects: [] };
    }
    const dice = prev.dice.map((d, i) => (i === idx ? { ...d, value: 6, kept: true } : d));
    const result: RollResult = {
      ...prev,
      dice,
      successes: prev.successes + 1,
      symbols: { ...prev.symbols, [SUCCESS]: (prev.symbols[SUCCESS] ?? 0) + 1 },
      notes: [...(prev.notes ?? []), "Story Point spent: one base die counts as a success (p. 44)."],
      meta: { ...(prev.meta ?? {}), storyPointSpent: true },
    };
    record.total = result.successes;
    record.result = { successes: result.successes };
    const effects: Effect[] = [{ kind: "log", text: "Story Point spent (p. 44)." }];
    if (entity) effects.push({ kind: "incrementField", entity, path: "storyPoints", by: -1, min: 0, max: 3 });
    return { total: result.successes, rolls: [record], result, label: `${result.successes} successes after Story Point`, effects };
  },
};

/** Most stress dice a supply roll uses (p. 28). */
export const SUPPLY_MAX_DICE = 6;

/**
 * Supply roll (p. 28-29): roll stress dice equal to the rating (at most six); every 1
 * reduces it by one. Precise Shooter, Calm Breather and Tech Savvy roll two dice fewer,
 * to a minimum of one (`reduceBy: 2`, p. 48, 51).
 */
export const supplyRoll: DiceOperation = {
  id: "supplyRoll",
  name: "Supply roll",
  page: [28, 29],
  input: {
    type: "object",
    required: ["rating"],
    properties: {
      entity: { type: "string" },
      rating: { type: "integer", minimum: 0 },
      path: { type: "string", description: "Field path holding the rating, e.g. gear.2.supply" },
      label: { type: "string", description: "What is being consumed: air, ammo, power, food, water..." },
      reduceBy: { type: "integer", minimum: 0, default: 0, description: "Dice fewer to roll (talents), never below one die." },
    },
  },
  run(input, rng): DiceOperationResult {
    const rating = Math.max(0, Math.floor(num(input.rating)));
    const reduceBy = Math.max(0, Math.floor(num(input.reduceBy)));
    const capped = Math.min(SUPPLY_MAX_DICE, rating);
    const diceCount = rating === 0 ? 0 : Math.max(1, capped - reduceBy);
    const raw: number[] = [];
    for (let n = 0; n < diceCount; n++) raw.push(rng.int(1, 6));
    const ones = raw.filter((v) => v === 1).length;
    const after = Math.max(0, rating - ones);
    const what = str(input.label) ?? "supply";
    const record: RollRecord = {
      step: "supplyRoll",
      dice: `${diceCount}d6`,
      raw,
      modifier: 0,
      total: ones,
      rowLabel: `${ones} ${ones === 1 ? "one" : "ones"}`,
      result: { before: rating, lost: ones, after },
      page: [28, 29],
    };
    const entity = str(input.entity);
    const path = str(input.path);
    const effects: Effect[] = [{ kind: "log", text: `Supply roll for ${what}: ${rating} -> ${after}${after === 0 ? " (depleted)" : ""}.` }];
    if (entity && path && ones > 0) effects.push({ kind: "incrementField", entity, path, by: -ones, min: 0 });
    return {
      total: ones,
      rolls: [record],
      result: { before: rating, lost: ones, after, depleted: after === 0, die: STRESS_DIE },
      label: `${what}: ${rating} -> ${after}`,
      effects,
    };
  },
};

export const mentalTrauma: DiceOperation = {
  id: "mentalTrauma",
  name: "Mental trauma",
  page: 74,
  input: { type: "object", properties: { entity: { type: "string" } } },
  run(input, rng, tables): DiceOperationResult {
    const { record, row } = rollOnTable(tables, MENTAL_TRAUMA_TABLE, rng, { step: "mentalTrauma", fallbackDice: "d66" });
    const label = record.rowLabel ?? `Mental trauma ${record.total}`;
    const entity = str(input.entity);
    const effects: Effect[] = [{ kind: "log", text: `Mental trauma (p. 74): ${label}.` }];
    if (entity) {
      effects.push({
        kind: "addCondition",
        entity,
        condition: { id: `mental-trauma:${rowId(row?.result) ?? record.total}`, label, source: MENTAL_TRAUMA_TABLE, page: 74 },
      });
    }
    return { total: record.total, rolls: [record], result: { row: row?.result ?? null, total: record.total }, label, effects };
  },
};

/** Condition id prefix for android critical system damage; the suffix is the row id. */
export const ANDROID_DAMAGE_CONDITION = "android-critical:";

const conditionIds = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/**
 * Android critical system damage (p. 78): D6 on the android table; a result the android
 * already has (from its `conditions`) moves one step up, ending at System Shutdown.
 */
export const androidCriticalDamage: DiceOperation = {
  id: "androidCriticalDamage",
  name: "Android critical damage",
  page: 78,
  input: {
    type: "object",
    properties: {
      entity: { type: "string" },
      conditions: { type: "array", items: { type: "string" }, description: "Ids of the android's current conditions." },
    },
  },
  run(input, rng, tables): DiceOperationResult {
    const { record } = rollOnTable(tables, ANDROID_CRITICAL_DAMAGE_TABLE, rng, { step: "androidCriticalDamage", fallbackDice: "1d6" });
    const table = tables.get(ANDROID_CRITICAL_DAMAGE_TABLE);
    const rowAt = (step: number) => table?.rows.find((r) => step >= r.range[0] && step <= r.range[1]);
    const idAt = (step: number) => {
      const res = rowAt(step)?.result;
      return res && typeof res === "object" && typeof (res as { id?: unknown }).id === "string" ? (res as { id: string }).id : `step-${step}`;
    };
    const has = new Set(conditionIds(input.conditions));
    const rolled = Math.min(6, Math.max(1, record.total));
    let step = rolled;
    while (step < 6 && has.has(ANDROID_DAMAGE_CONDITION + idAt(step))) step++;
    const row = rowAt(step);
    const res = (row?.result ?? {}) as { id?: string; effect?: string; shutdown?: boolean };
    const label = row?.label ?? `Critical damage ${step}`;
    const shifted = step !== rolled;
    const entity = str(input.entity);
    const effects: Effect[] = [
      {
        kind: "log",
        text: `Android critical damage (p. 78): ${label}${shifted ? ` (rolled ${rolled}, already had it, moved up to ${step})` : ` (${rolled})`}${res.shutdown ? "; system shutdown, beyond repair" : ""}.`,
      },
    ];
    if (entity) {
      effects.push({
        kind: "addCondition",
        entity,
        condition: { id: ANDROID_DAMAGE_CONDITION + (res.id ?? `step-${step}`), label, source: ANDROID_CRITICAL_DAMAGE_TABLE, page: 78 },
      });
    }
    return {
      total: step,
      rolls: [record],
      result: { row: res, rolled, step, shifted, shutdown: res.shutdown === true },
      label,
      effects,
    };
  },
};

export const criticalInjury: DiceOperation = {
  id: "criticalInjury",
  name: "Critical injury",
  page: 70,
  characterRoll: true,
  input: {
    type: "object",
    properties: {
      entity: { type: "string" },
      android: { type: "boolean", default: false, description: "Androids roll on the critical system damage table instead (p. 78)." },
      conditions: { type: "array", items: { type: "string" } },
    },
  },
  run(input, rng, tables): DiceOperationResult {
    if (input.android === true) return androidCriticalDamage.run(input, rng, tables);
    const { record, row } = rollOnTable(tables, CRITICAL_INJURY_TABLE, rng, { step: "criticalInjury", fallbackDice: "d66" });
    const label = record.rowLabel ?? `Critical injury ${record.total}`;
    const entity = str(input.entity);
    const res = (row?.result ?? {}) as { fatal?: boolean; timeLimit?: string | null; instantDeath?: boolean };
    const lethal = res.instantDeath ? "; killed outright" : res.fatal && res.timeLimit ? `; lethal, death roll every ${res.timeLimit}` : "";
    const effects: Effect[] = [{ kind: "log", text: `Critical injury (p. 70): ${label} (${record.total})${lethal}.` }];
    if (entity) {
      effects.push({
        kind: "addCondition",
        entity,
        condition: { id: `critical-injury:${record.total}`, label, source: CRITICAL_INJURY_TABLE, page: 70 },
      });
    }
    return { total: record.total, rolls: [record], result: { row: row?.result ?? null, total: record.total }, label, effects };
  },
};

/** Host condition set when the facehugger has implanted its embryo (p. 214). */
export const IMPLANTED_CONDITION = "xx121:implanted";

/**
 * The facehug insemination check (p. 214): every stretch after the facehug,
 * one stress die; the facehugger result means the host is implanted, and
 * removing the facehugger can no longer save them. Run by the life-cycle
 * tracker on each stretch of the facehug stage, or by the GM.
 */
export const inseminationCheck: DiceOperation = {
  id: "inseminationCheck",
  name: "Insemination check",
  page: 214,
  input: {
    type: "object",
    properties: {
      entity: { type: "string", description: "The facehugged host." },
      conditions: { type: "array", items: { type: "string" }, description: "The host's condition ids." },
    },
  },
  run(input, rng): DiceOperationResult {
    const entity = str(input.entity);
    const conditions = Array.isArray(input.conditions) ? input.conditions : [];
    if (conditions.includes(IMPLANTED_CONDITION)) {
      const label = "Already implanted: no roll needed";
      return { rolls: [], result: { implanted: true, rolled: false }, label, effects: [{ kind: "log", text: `Insemination check (p. 214): ${label}.` }] };
    }
    const value = rng.int(1, 6);
    const implanted = value === 1;
    const label = implanted ? "Facehugger symbol: implanted" : `Stress die ${value}: not yet`;
    const record: RollRecord = { step: "inseminationCheck", dice: "1d6", raw: [value], modifier: 0, total: value, rowLabel: label, result: { implanted }, page: 214 };
    const effects: Effect[] = [{ kind: "log", text: `Insemination check (p. 214): ${label}.` }];
    if (implanted && entity) {
      effects.push({ kind: "addCondition", entity, condition: { id: IMPLANTED_CONDITION, label: "Implanted", source: "inseminationCheck", page: 214 } });
    }
    return { total: value, rolls: [record], result: { implanted, rolled: true, die: value }, label, effects };
  },
};

export const operations: Record<string, DiceOperation> = {
  stressResponse,
  panicRoll,
  storyPoint,
  supplyRoll,
  mentalTrauma,
  criticalInjury,
  androidCriticalDamage,
  inseminationCheck,
};

export { FACEHUGGER };
