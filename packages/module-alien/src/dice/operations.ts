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
import { CRITICAL_INJURY_TABLE, MENTAL_TRAUMA_TABLE, PANIC_TABLE, STRESS_RESPONSE_TABLE } from "./tableIds";
import { rollOnTable } from "./tableLookup";

const num = (v: unknown, fallback = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const str = (v: unknown): string | undefined => (typeof v === "string" && v.length > 0 ? v : undefined);

const characterInput = {
  entity: { type: "string", description: "Character entity id the effects apply to." },
  stress: { type: "integer", minimum: 0, default: 0 },
  resolve: { type: "integer", minimum: 0, default: 0, description: "Computed Resolve." },
  extraModifier: { type: "integer", default: 0 },
};

/** D6 + stress − Resolve; same formula for stress response (p. 44) and panic (p. 72). */
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
  return { stress, resolve, ...rollOnTable(tables, tableId, rng, { step, dice: "d6", modifier: stress - resolve + extra }) };
}

export const stressResponse: DiceOperation = {
  id: "stressResponse",
  name: "Stress response",
  page: 44,
  input: { type: "object", properties: characterInput },
  run(input, rng, tables): DiceOperationResult {
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
    const { record, row } = stressLookup(tables, rng, input, PANIC_TABLE, "panicRoll");
    const total = record.total;
    const traumaCheck = total >= 9;
    const label = record.rowLabel ?? `Panic ${total}`;
    const entity = str(input.entity);
    const effects: Effect[] = [
      {
        kind: "log",
        text: `Panic roll (p. 72-73): ${label} (total ${total})${traumaCheck ? "; counts toward the mental trauma check at session end (p. 74)" : ""}.`,
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

/** Spend a Story Point to turn one base die into a success, before or after a push (p. 44). */
export const storyPoint: DiceOperation = {
  id: "storyPoint",
  name: "Spend a Story Point",
  page: 44,
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

/** Supply roll (p. 28-29): roll stress dice equal to the rating; every 1 reduces it by one. */
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
    },
  },
  run(input, rng): DiceOperationResult {
    const rating = Math.max(0, Math.floor(num(input.rating)));
    const raw: number[] = [];
    for (let n = 0; n < rating; n++) raw.push(rng.int(1, 6));
    const ones = raw.filter((v) => v === 1).length;
    const after = Math.max(0, rating - ones);
    const what = str(input.label) ?? "supply";
    const record: RollRecord = {
      step: "supplyRoll",
      dice: `${rating}d6`,
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
    const { record, row } = rollOnTable(tables, MENTAL_TRAUMA_TABLE, rng, { step: "mentalTrauma", dice: "d6" });
    const label = record.rowLabel ?? `Mental trauma ${record.total}`;
    const entity = str(input.entity);
    const effects: Effect[] = [{ kind: "log", text: `Mental trauma (p. 74): ${label}.` }];
    if (entity) {
      effects.push({
        kind: "addCondition",
        entity,
        condition: { id: `mental-trauma:${record.total}`, label, source: MENTAL_TRAUMA_TABLE, page: 74 },
      });
    }
    return { total: record.total, rolls: [record], result: { row: row?.result ?? null, total: record.total }, label, effects };
  },
};

export const criticalInjury: DiceOperation = {
  id: "criticalInjury",
  name: "Critical injury",
  page: [69, 70],
  input: { type: "object", properties: { entity: { type: "string" } } },
  run(input, rng, tables): DiceOperationResult {
    const { record, row } = rollOnTable(tables, CRITICAL_INJURY_TABLE, rng, { step: "criticalInjury", dice: "d66" });
    const label = record.rowLabel ?? `Critical injury ${record.total}`;
    const entity = str(input.entity);
    const effects: Effect[] = [{ kind: "log", text: `Critical injury (p. 69-70): ${label} (${record.total}).` }];
    if (entity) {
      effects.push({
        kind: "addCondition",
        entity,
        condition: { id: `critical-injury:${record.total}`, label, source: CRITICAL_INJURY_TABLE, page: [69, 70] },
      });
    }
    return { total: record.total, rolls: [record], result: { row: row?.result ?? null, total: record.total }, label, effects };
  },
};

export const operations: Record<string, DiceOperation> = {
  stressResponse,
  panicRoll,
  storyPoint,
  supplyRoll,
  mentalTrauma,
  criticalInjury,
};

export { FACEHUGGER };
