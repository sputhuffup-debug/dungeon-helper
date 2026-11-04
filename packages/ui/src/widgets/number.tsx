import { Button } from "../primitives/Button";
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

/**
 * A number with steppers. `config.suggested` names a computed value offered
 * beside it (e.g. a hit point maximum from the fixed values per level): shown
 * after `config.suggestedLabel`, with a "Use" button while the value differs.
 */
export function NumberField(props: WidgetProps) {
  const { id, value, onChange, readonly, field, computed } = props;
  const { min, max, step } = bounds(props);
  const n = asNumber(value, fallback(props, min, max));
  const label = field.label ?? labelFromPath(field.path);
  const key = typeof field.config?.suggested === "string" ? field.config.suggested : undefined;
  const raw = key ? computed?.[key] : undefined;
  const suggested = typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
  const suggestion = suggested !== undefined && (
    <span className="cf-field__suggest cf-muted" data-testid="number-suggested">
      {typeof field.config?.suggestedLabel === "string" ? field.config.suggestedLabel : "Suggested"} {suggested}
      {!readonly && suggested !== n && (
        <Button size="sm" variant="ghost" onClick={() => onChange(suggested)} aria-label={`Use ${suggested} for ${label}`}>
          Use
        </Button>
      )}
    </span>
  );
  if (readonly)
    return (
      <div className="cf-field__readonly cf-mono">
        {n} {suggestion}
      </div>
    );
  const stepper = <Stepper id={id} value={n} min={min} max={max} step={step} onChange={onChange} label={label} />;
  return suggestion ? (
    <div className="cf-field__with-suggest">
      {stepper}
      {suggestion}
    </div>
  ) : (
    stepper
  );
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
  const text = typeof field.config?.text === "string" ? field.config.text : undefined;
  // named by its field ("Android"), never by its state: the Yes/No beside it is for the eye
  return (
    <label className="cf-check" htmlFor={id}>
      <input id={id} className="cf-checkbox" type="checkbox" checked={checked} disabled={readonly} onChange={(e) => onChange(e.target.checked)} aria-label={field.label ?? labelFromPath(field.path)} />
      <span aria-hidden={text ? undefined : true}>{text ?? (checked ? "Yes" : "No")}</span>
    </label>
  );
}
