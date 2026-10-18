import { useId } from "react";
import { clamp, cx } from "../sheet/paths";

export interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  /** Big number for attributes. */
  big?: boolean;
  label?: string;
  id?: string;
  className?: string;
  /** Allow typing a value directly (default true). */
  editable?: boolean;
}

export function Stepper({ value, onChange, min, max, step = 1, disabled, big, label, id, className, editable = true }: StepperProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const dec = () => onChange(clamp(value - step, min, max));
  const inc = () => onChange(clamp(value + step, min, max));
  const canDec = !disabled && (min === undefined || value > min);
  const canInc = !disabled && (max === undefined || value < max);
  return (
    <span className={cx("cf-stepper", big && "cf-stepper--big", className)} role="group" aria-label={label}>
      <button type="button" className="cf-stepper__btn" onClick={dec} disabled={!canDec} aria-label={`Decrease ${label ?? "value"}`}>
        −
      </button>
      <input
        id={inputId}
        className="cf-stepper__value"
        type="number"
        inputMode="numeric"
        value={Number.isFinite(value) ? value : ""}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        readOnly={!editable}
        aria-label={label}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "" || raw === "-") return;
          const n = Number(raw);
          if (Number.isFinite(n)) onChange(clamp(n, min, max));
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") {
            e.preventDefault();
            if (canInc) inc();
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            if (canDec) dec();
          }
        }}
      />
      <button type="button" className="cf-stepper__btn" onClick={inc} disabled={!canInc} aria-label={`Increase ${label ?? "value"}`}>
        +
      </button>
    </span>
  );
}
