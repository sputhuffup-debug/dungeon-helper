import { ProvenanceBadge } from "../primitives/ProvenanceBadge";
import { isRecord } from "../sheet/paths";
import type { WidgetProps } from "./types";

/** Read-only derived value from `computed[path]`, with a provenance mark. */
export function ComputedField({ value, computed, path, field }: WidgetProps) {
  const key = typeof field.config?.computed === "string" ? field.config.computed : path;
  const v = computed[key] ?? value;
  const text = v === undefined || v === null ? "—" : typeof v === "boolean" ? (v ? "Yes" : "No") : isRecord(v) || Array.isArray(v) ? JSON.stringify(v) : String(v);
  return (
    <div className="cf-field__value">
      <span data-testid={`computed-${key}`}>{text}</span>
      <ProvenanceBadge kind="computed" detail={`Derived from the sheet (${key}).`} />
    </div>
  );
}
