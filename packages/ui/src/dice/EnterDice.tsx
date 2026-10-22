import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { missingText, planEntry, type DieSpec, type EntrySlot, type Rng } from "@campaign-forge/module-sdk";
import { Button } from "../primitives/Button";
import { cx } from "../sheet/paths";

export interface EnterDiceProps {
  /**
   * The roll as a pure function of its Rng: a pool roll or push, a table
   * roll, a dice operation's `run`. It is run to find out which dice to ask
   * for, in the order the roll uses them.
   */
  run: (rng: Rng) => unknown;
  /** Every face, in roll order, once they all fit. */
  onSubmit: (faces: number[]) => void;
  onCancel?: () => void;
  /** Offer to roll this one in the app instead. */
  onRollInApp?: () => void;
  /** Its label (default "Roll in app"). */
  rollInAppLabel?: string;
  /** Submit button label (default "Use these dice"). */
  submitLabel?: string;
  /** The dice system's dice, for each input's colour. */
  dice?: DieSpec[];
  title?: ReactNode;
  /** Focus the first input when shown (default true). */
  autoFocus?: boolean;
  /** Where randomness that is not a die comes from while planning. */
  fallback?: Rng;
  className?: string;
}

/** "2d6 total" for a sum of dice; "d66" and "d100" read as the number itself. */
function slotLabel(slot: EntrySlot): string {
  return slot.group && /^\d+d\d+|[+-]/.test(slot.label) ? `${slot.label} total` : slot.label;
}

const parse = (text: string | undefined): number | undefined => {
  const t = (text ?? "").trim();
  if (t === "" || t === "-") return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : Number.NaN;
};

/**
 * Type the dice rolled at the table: one input per die (or one per group,
 * e.g. a 2d6 total or a d66, unless "each die" is ticked), in the order the
 * roll uses them, each checked as it is typed. Dice that depend on earlier
 * ones (a nested table, a re-roll) appear once those are in. A one-digit die
 * moves on to the next input by itself; Enter submits when every die fits.
 */
export function EnterDice({ run, onSubmit, onCancel, onRollInApp, rollInAppLabel = "Roll in app", submitLabel = "Use these dice", dice, title, autoFocus = true, fallback, className }: EnterDiceProps) {
  const id = useId();
  const [texts, setTexts] = useState<string[]>([]);
  const [eachDie, setEachDie] = useState(false);
  const [advance, setAdvance] = useState<number | undefined>();
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const values = texts.map(parse);
  const plan = useMemo(() => planEntry(run, values, { totals: !eachDie, ...(fallback ? { fallback } : {}) }), [run, JSON.stringify(values), eachDie, fallback]);
  const showToggle = eachDie || plan.slots.some((s) => s.group);
  // Wrong values explain themselves next to their input; the line below says what is still missing.
  const status = plan.error ?? (plan.faces ? (plan.slots.length === 0 ? "No dice needed." : undefined) : plan.slots.some((s) => s.error) ? undefined : missingText(plan));

  useEffect(() => {
    if (autoFocus) inputs.current[0]?.focus();
    // focus once, when shown
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (advance === undefined) return;
    setAdvance(undefined);
    inputs.current[advance]?.focus();
    inputs.current[advance]?.select();
  }, [advance]);

  const setText = (i: number, text: string) => {
    const next = [...texts];
    while (next.length <= i) next.push("");
    next[i] = text;
    setTexts(next);
    const slot = plan.slots[i];
    const v = parse(text);
    // One-digit dice move on as soon as they are typed (tablet friendly).
    if (slot && v !== undefined && slot.min >= 0 && slot.max <= 9 && v >= slot.min && v <= slot.max && Number.isInteger(v)) setAdvance(i + 1);
  };

  const submit = () => {
    if (plan.faces) {
      onSubmit(plan.faces);
      return;
    }
    const first = plan.slots.findIndex((s) => s.value === undefined || s.error);
    if (first >= 0) inputs.current[first]?.focus();
  };

  return (
    <form
      className={cx("cf-enter", className)}
      data-testid="enter-dice"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {title && <div className="cf-enter__title">{title}</div>}
      {plan.slots.length > 0 && (
        <div className="cf-enter__slots" role="group" aria-label="Dice rolled at the table">
          {plan.slots.map((slot, i) => {
            const spec = slot.die ? dice?.find((d) => d.id === slot.die) : undefined;
            const style = spec?.color ? ({ "--cf-die-color": spec.color } as CSSProperties) : undefined;
            const label = slotLabel(slot);
            const errId = `${id}-err-${i}`;
            // as wide as the longest number the slot takes; the range as a hint when it fits
            const digits = Math.max(String(slot.min).length, String(slot.max).length);
            const range = `${slot.min}–${slot.max}`;
            const inputStyle = { width: `${(digits * 0.7 + 1.6).toFixed(1)}em` };
            return (
              <label key={i} className={cx("cf-enter__slot", !slot.settled && "cf-enter__slot--unsettled", spec?.color && "cf-enter__slot--colored")} style={style} data-die={slot.die}>
                <span className="cf-enter__label">{label}</span>
                <input
                  ref={(el) => {
                    inputs.current[i] = el;
                  }}
                  className={cx("cf-input", "cf-enter__input", slot.error && "cf-enter__input--error")}
                  type="text"
                  inputMode="numeric"
                  pattern="-?[0-9]*"
                  autoComplete="off"
                  enterKeyHint={i === plan.slots.length - 1 ? "done" : "next"}
                  placeholder={range.length <= 4 ? range : undefined}
                  style={inputStyle}
                  aria-label={`Die ${i + 1}: ${label}`}
                  aria-invalid={slot.error ? true : undefined}
                  aria-describedby={slot.error ? errId : undefined}
                  data-testid={`enter-die-${i}`}
                  value={texts[i] ?? ""}
                  onChange={(e) => setText(i, e.target.value)}
                />
                {slot.error && (
                  <span id={errId} className="cf-enter__error" role="alert">
                    {slot.error}
                  </span>
                )}
              </label>
            );
          })}
        </div>
      )}
      <div className="cf-enter__actions">
        <Button type="submit" variant="primary" disabled={!plan.faces} data-testid="enter-dice-submit">
          {submitLabel}
        </Button>
        {showToggle && (
          <label className="cf-check cf-enter__each">
            <input
              type="checkbox"
              className="cf-checkbox"
              checked={eachDie}
              onChange={(e) => {
                setEachDie(e.target.checked);
                setTexts([]);
              }}
              data-testid="enter-each-die"
            />
            Each die
          </label>
        )}
        {onRollInApp && (
          <Button variant="ghost" onClick={onRollInApp} data-testid="enter-dice-roll-in-app">
            {rollInAppLabel}
          </Button>
        )}
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        {status && (
          <span className={cx("cf-enter__status", plan.error ? "cf-enter__status--error" : "cf-muted")} aria-live="polite" data-testid="enter-dice-status">
            {status}
          </span>
        )}
      </div>
    </form>
  );
}
