import { cx } from "../sheet/paths";

export interface HealthBarProps {
  /** Maximum health. */
  max: number;
  /** Damage taken. */
  damage: number;
  label?: string;
  /** Health is down to zero (shown in the danger colour, with the broken label). */
  broken?: boolean;
  brokenLabel?: string;
  className?: string;
}

/**
 * Health left as a bar of segments (one per point up to 20, a plain bar
 * beyond) with "left/max". Damage taken is drawn as empty segments.
 */
export function HealthBar({ max, damage, label = "Health", broken, brokenLabel = "Broken", className }: HealthBarProps) {
  const m = Math.max(0, Math.round(max));
  const left = Math.max(0, m - Math.max(0, Math.round(damage)));
  const ratio = m > 0 ? left / m : 0;
  const tone = broken || (m > 0 && left === 0) ? "danger" : ratio <= 0.34 ? "warn" : undefined;
  const segments = m <= 20;
  return (
    <span
      className={cx("cf-health", tone && `cf-health--${tone}`, className)}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={m}
      aria-valuenow={left}
      aria-valuetext={`${left} of ${m}${broken ? `, ${brokenLabel}` : ""}`}
    >
      <span className="cf-health__bar" aria-hidden="true">
        {segments ? (
          Array.from({ length: m }, (_, i) => <span key={i} className={cx("cf-health__seg", i < left && "cf-health__seg--on")} />)
        ) : (
          <span className="cf-health__fill" style={{ width: `${Math.round(ratio * 100)}%` }} />
        )}
      </span>
      <span className="cf-health__value" data-testid="health-value">
        {left}/{m}
      </span>
      {broken && <span className="cf-health__broken">{brokenLabel}</span>}
    </span>
  );
}
