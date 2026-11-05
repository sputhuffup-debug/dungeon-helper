import { signed } from "@campaign-forge/module-sdk";
import { ProvenanceBadge } from "../primitives/ProvenanceBadge";
import { isRecord } from "../sheet/paths";
import type { WidgetProps } from "./types";

/** Read-only derived value from `computed[path]`, with a provenance mark. `config.signed: true` shows a number as a modifier ("+2", "−1", "+0"). */
export function ComputedField({ value, computed, path, field }: WidgetProps) {
  const key = typeof field.config?.computed === "string" ? field.config.computed : path;
  const v = computed[key] ?? value;
  const text =
    v === undefined || v === null
      ? "—"
      : typeof v === "number" && field.config?.signed === true
        ? signed(v)
        : typeof v === "boolean"
          ? v
            ? "Yes"
            : "No"
          : isRecord(v) || Array.isArray(v)
            ? JSON.stringify(v)
            : String(v);
  return (
    <div className="cf-field__value">
      <span data-testid={`computed-${key}`}>{text}</span>
      <ProvenanceBadge kind="computed" detail={`Derived from the sheet (${key}).`} />
    </div>
  );
}
