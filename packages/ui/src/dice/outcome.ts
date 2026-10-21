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
  min?: number;
  max?: number;
  values?: string[];
  defaultValue?: unknown;
}

/** The fields of a dice system's `rollOptions` schema the roll panel can render. Other properties are ignored. */
export function rollOptionFields(schema: JsonSchema | undefined): RollOptionField[] {
  const props = schema && typeof schema.properties === "object" && schema.properties ? (schema.properties as Record<string, JsonSchema>) : {};
  const out: RollOptionField[] = [];
  for (const [key, s] of Object.entries(props)) {
    if (!s || typeof s !== "object") continue;
    const label = typeof s.title === "string" ? s.title : humanize(key);
    if (Array.isArray(s.enum) && s.enum.every((v) => typeof v === "string")) out.push({ key, label, kind: "enum", values: s.enum as string[], defaultValue: s.default });
    else if (s.type === "integer" || s.type === "number") out.push({ key, label, kind: "number", ...(typeof s.minimum === "number" ? { min: s.minimum } : {}), ...(typeof s.maximum === "number" ? { max: s.maximum } : {}), defaultValue: s.default });
    else if (s.type === "boolean") out.push({ key, label, kind: "boolean", defaultValue: s.default });
  }
  return out;
}
