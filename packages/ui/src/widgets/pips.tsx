import { Pips } from "../primitives/Pips";
import { Stepper } from "../primitives/Stepper";
import { asNumber, labelFromPath } from "../sheet/paths";
import type { WidgetProps } from "./types";
import { configNumber } from "./types";

/** Supply rating 0..6 as pips. */
export function SupplyField({ value, onChange, readonly, field }: WidgetProps) {
  const max = configNumber(field, "max", 6) as number;
  return <Pips value={asNumber(value, 0)} max={max} onChange={onChange} readonly={readonly} label={field.label ?? labelFromPath(field.path)} />;
}

/** Stress 0..10 as pips with +/- steppers; highlights at the warning threshold. */
export function StressField({ id, value, onChange, readonly, field }: WidgetProps) {
  const max = configNumber(field, "max", 10) as number;
  const warnAt = configNumber(field, "warnAt", 5) as number;
  const n = asNumber(value, 0);
  const label = field.label ?? labelFromPath(field.path);
  return (
    <div className="cf-stress" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <Pips value={n} max={max} onChange={onChange} readonly={readonly} warnAt={warnAt} dangerAt={max} label={label} showValue={false} />
      {readonly ? <span className="cf-tracker__num">{n}</span> : <Stepper id={id} value={n} min={0} max={max} onChange={onChange} label={label} />}
    </div>
  );
}
