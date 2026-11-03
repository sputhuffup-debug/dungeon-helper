import type { DiceSystem, JsonSchema, RollResult, RollTone } from "@campaign-forge/module-sdk";
import type { BadgeTone } from "../primitives/Badge";
import { humanize } from "../sheet/paths";

/** Badge colour for an outcome tone. */
export function toneBadge(tone: RollTone | undefined): BadgeTone {
  switch (tone) {
    case "critical":
    case "success":
      return "success";
    case "partial":
      return "warning";
    case "failure":
    case "fumble":
      return "danger";
    default:
      return "muted";
  }
}

/** Whether results of this dice system lead with a total (d20, 2d6, d100) rather than a success count. */
export function showsTotal(dice: DiceSystem | undefined, result?: RollResult): boolean {
  if (dice?.resultStyle) return dice.resultStyle === "total";
  return result?.total !== undefined && result.outcome !== undefined && result.symbols.success === undefined;
}

/** A one-line summary of a result for logs: "17 · Success" or "2 ✓". */
export function resultHeadline(dice: DiceSystem | undefined, result: RollResult): string {
  if (showsTotal(dice, result) && result.total !== undefined) return `${result.total}${result.outcome ? ` · ${result.outcome.label}` : ""}`;
  return `${result.successes} ✓`;
}

export interface RollOptionField {
  key: string;
  label: string;
  kind: "number" | "boolean" | "enum";
  /** A small whole-number range with a default (e.g. dice −10 to +10): the panel shows a − / + stepper. */
  stepper?: boolean;
  min?: number;
  max?: number;
  values?: string[];
  defaultValue?: unknown;
}

/** Widest integer range shown as a stepper rather than a number box. */
const STEPPER_RANGE = 20;

/** The fields of a dice system's `rollOptions` schema the roll panel can render. Other properties are ignored. */
export function rollOptionFields(schema: JsonSchema | undefined): RollOptionField[] {
  const props = schema && typeof schema.properties === "object" && schema.properties ? (schema.properties as Record<string, JsonSchema>) : {};
  const out: RollOptionField[] = [];
  for (const [key, s] of Object.entries(props)) {
    if (!s || typeof s !== "object") continue;
    const label = typeof s.title === "string" ? s.title : humanize(key);
    if (Array.isArray(s.enum) && s.enum.every((v) => typeof v === "string")) out.push({ key, label, kind: "enum", values: s.enum as string[], defaultValue: s.default });
    else if (s.type === "integer" || s.type === "number") {
      const stepper = s.type === "integer" && typeof s.minimum === "number" && typeof s.maximum === "number" && s.maximum - s.minimum <= STEPPER_RANGE && typeof s.default === "number";
      out.push({ key, label, kind: "number", ...(typeof s.minimum === "number" ? { min: s.minimum } : {}), ...(typeof s.maximum === "number" ? { max: s.maximum } : {}), defaultValue: s.default, ...(stepper ? { stepper: true } : {}) });
    }
    else if (s.type === "boolean") out.push({ key, label, kind: "boolean", defaultValue: s.default });
  }
  return out;
}

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");

/**
 * The roll options the GM changed from where the panel started, as short
 * text for a log line: "Modifier +1", "DC 15", "Roll: advantage".
 */
export function rollOptionNotes(fields: RollOptionField[], values: Record<string, unknown>, start: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const f of fields) {
    // "Modifier (dice)" reads "Modifier +1" in a log line
    const label = f.label.replace(/\s*\([^)]*\)$/, "") || f.label;
    const v = values[f.key];
    if (v === undefined || JSON.stringify(v) === JSON.stringify(start[f.key] ?? f.defaultValue)) continue;
    if (f.kind === "boolean") {
      if (v === true) out.push(label);
    } else if (f.kind === "enum") out.push(`${label}: ${humanize(String(v)).toLowerCase()}`);
    else if (typeof v === "number") out.push(`${label} ${f.stepper || (f.min !== undefined && f.min < 0) ? signed(v) : v}`);
  }
  return out;
}
