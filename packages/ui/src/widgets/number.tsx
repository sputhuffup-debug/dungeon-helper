import { Stepper } from "../primitives/Stepper";
import { asNumber, labelFromPath } from "../sheet/paths";
import type { WidgetProps } from "./types";
import { configNumber } from "./types";

function bounds(props: WidgetProps): { min?: number; max?: number; step: number } {
  const { field, schema } = props;
  const min = configNumber(field, "min") ?? (typeof schema?.minimum === "number" ? schema.minimum : undefined);
  const max = configNumber(field, "max") ?? (typeof schema?.maximum === "number" ? schema.maximum : undefined);
  const step = configNumber(field, "step") ?? (typeof schema?.multipleOf === "number" ? schema.multipleOf : 1);
  return { min, max, step };
}

/**
 * What a missing value shows: the schema's default, else 0 kept inside the
 * bounds. (Not the minimum: an unset "bonus" field from -10 to 20 reads 0,
 * which is also what computed rules assume for it.)
 */
function fallback(props: WidgetProps, min: number | undefined, max: number | undefined): number {
  const d = props.schema?.default;
  if (typeof d === "number") return d;
  const low = Math.max(min ?? 0, 0);
  return max !== undefined ? Math.min(max, low) : low;
}

export function NumberField(props: WidgetProps) {
  const { id, value, onChange, readonly, field } = props;
  const { min, max, step } = bounds(props);
  const n = asNumber(value, fallback(props, min, max));
  if (readonly) return <div className="cf-field__readonly cf-mono">{n}</div>;
  return <Stepper id={id} value={n} min={min} max={max} step={step} onChange={onChange} label={field.label ?? labelFromPath(field.path)} />;
}

/** A big number with its label underneath and steppers. */
export function AttributeField(props: WidgetProps) {
  const { id, value, onChange, readonly, field } = props;
  const { min, max, step } = bounds(props);
  const n = asNumber(value, fallback(props, min, max));
  return (
    <div className="cf-attribute">
      {readonly ? (
        <span className="cf-attribute__value" data-testid="attribute-value">
          {n}
        </span>
      ) : (
        <Stepper id={id} big value={n} min={min} max={max} step={step} onChange={onChange} label={field.label ?? labelFromPath(field.path)} />
      )}
    </div>
  );
}

export function CheckboxField({ id, value, onChange, readonly, field }: WidgetProps) {
  const checked = value === true;
  return (
    <label className="cf-check" htmlFor={id}>
      <input id={id} className="cf-checkbox" type="checkbox" checked={checked} disabled={readonly} onChange={(e) => onChange(e.target.checked)} />
      <span>{typeof field.config?.text === "string" ? field.config.text : checked ? "Yes" : "No"}</span>
    </label>
  );
}
