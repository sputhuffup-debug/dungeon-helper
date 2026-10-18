import { cx } from "../sheet/paths";

export interface PipsProps {
  value: number;
  max: number;
  min?: number;
  onChange?: (value: number) => void;
  readonly?: boolean;
  /** Value at or above which the filled pips switch to the warning colour. */
  warnAt?: number;
  /** Value at or above which the filled pips switch to the danger colour. */
  dangerAt?: number;
  label?: string;
  showValue?: boolean;
  className?: string;
}

/**
 * A row of clickable pips. Clicking pip n sets the value to n; clicking the
 * current value lowers it by one, so a single tap can both raise and lower.
 */
export function Pips({ value, max, min = 0, onChange, readonly, warnAt, dangerAt, label, showValue = true, className }: PipsProps) {
  const v = Math.max(min, Math.min(max, Math.round(value)));
  const tone = dangerAt !== undefined && v >= dangerAt ? "danger" : warnAt !== undefined && v >= warnAt ? "warn" : undefined;
  const interactive = !readonly && !!onChange;
  const pips = [];
  for (let i = 1; i <= max; i++) {
    const on = i <= v;
    pips.push(
      <button
        key={i}
        type="button"
        className={cx("cf-pip", on && "cf-pip--on")}
        aria-label={`${label ? label + " " : ""}${i} of ${max}`}
        aria-pressed={on}
        disabled={!interactive}
        onClick={() => {
          if (!interactive) return;
          const next = i === v ? Math.max(min, i - 1) : i;
          onChange?.(next);
        }}
      />,
    );
  }
  return (
    <span
      className={cx("cf-pips", tone === "warn" && "cf-pips--warn", tone === "danger" && "cf-pips--danger", !interactive && "cf-pips--readonly", className)}
      role="group"
      aria-label={label}
    >
      {pips}
      {showValue && (
        <span className="cf-pips__value" data-testid="pips-value">
          {v}/{max}
        </span>
      )}
    </span>
  );
}
