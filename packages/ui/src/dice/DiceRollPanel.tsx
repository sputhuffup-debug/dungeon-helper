import { useEffect, useId, useMemo, useRef, useState } from "react";
import { probeDice, rollEntered, type DiceSystem, type DieSpec, type RollResult, type Rng } from "@campaign-forge/module-sdk";
import { Badge } from "../primitives/Badge";
import { Button } from "../primitives/Button";
import { cx, humanize } from "../sheet/paths";
import { DicePoolView } from "../widgets/dicepool";
import { DieFace } from "./DieFace";
import { DiceModeSwitch, useDiceRoller } from "./DiceRoller";
import { EnterDice } from "./EnterDice";
import { rollOptionFields, showsTotal, toneBadge, type RollOptionField } from "./outcome";

export interface DiceRollPanelProps {
  dice: DiceSystem;
  /** Module-specific input for `buildPool` (attribute, skill, modifier...). */
  input: Record<string, unknown>;
  /** A roll or push was made; `entered` holds the faces typed when the dice were rolled at the table. */
  onRolled: (result: RollResult, entered?: number[]) => void;
  rng: Rng;
  allowPush?: boolean;
  storyPoints?: number;
  /**
   * Spend a story point. It gets the roll shown (if any); returning a result
   * shows that instead (e.g. one die turned into a success). Nothing is
   * logged here: the handler logs the spend and the changed roll. When the
   * spend rolls dice and they were rolled at the table, `entered` has them.
   */
  onSpendStoryPoint?: (result: RollResult | undefined, entered?: number[]) => RollResult | void;
  /** The spend as a pure function of its Rng, so dice it rolls can be entered (none asked when it rolls none). */
  storyPointRun?: (result: RollResult, rng: Rng) => unknown;
  /** Name of the pool on the badge (default "Story points"). */
  storyPointName?: string;
  /** Spend button label (default "Spend"). */
  storyPointLabel?: string;
  /** The spend acts on a roll, so the button waits for one. */
  storyPointNeedsResult?: boolean;
  /** Extra input passed to `push` (e.g. the entity id). */
  pushInput?: Record<string, unknown>;
  /** Start from an existing result (e.g. re-opening a log entry). */
  initialResult?: RollResult;
  /** Faces typed for `initialResult`, when it was rolled at the table. */
  initialEntered?: number[];
  /** Start in "Enter dice" mode (default: the page's mode, from the per-device preference). */
  physical?: boolean;
  /** Leave out the panel's own In app / Enter dice switch (the page has one, e.g. table mode's). */
  hideModeSwitch?: boolean;
  title?: string;
  className?: string;
}

export function specById(dice: DiceSystem, id: string): DieSpec | undefined {
  return dice.dice.find((d) => d.id === id);
}

function initialOptions(fields: RollOptionField[], input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = input[f.key] ?? f.defaultValue;
    if (v !== undefined) out[f.key] = v;
  }
  return out;
}

/** The dice system's `rollOptions` (a DC, advantage, bonus dice...) as small inputs. */
function RollOptions({ fields, values, onChange }: { fields: RollOptionField[]; values: Record<string, unknown>; onChange: (next: Record<string, unknown>) => void }) {
  const id = useId();
  if (fields.length === 0) return null;
  const set = (key: string, v: unknown) => {
    const next = { ...values };
    if (v === undefined) delete next[key];
    else next[key] = v;
    onChange(next);
  };
  return (
    <div className="cf-dice__options" data-testid="roll-options">
      {fields.map((f) => {
        const fid = `${id}-${f.key}`;
        const value = values[f.key];
        return (
          <label key={f.key} className="cf-dice__option" htmlFor={fid}>
            <span>{f.label}</span>
            {f.kind === "enum" ? (
              <select id={fid} className="cf-select" value={typeof value === "string" ? value : ""} onChange={(e) => set(f.key, e.target.value || undefined)} data-testid={`roll-option-${f.key}`}>
                {f.defaultValue === undefined && <option value="">—</option>}
                {f.values!.map((v) => (
                  <option key={v} value={v}>
                    {humanize(v)}
                  </option>
                ))}
              </select>
            ) : f.kind === "boolean" ? (
              <input id={fid} type="checkbox" className="cf-checkbox" checked={value === true} onChange={(e) => set(f.key, e.target.checked)} data-testid={`roll-option-${f.key}`} />
            ) : (
              <input
                id={fid}
                type="number"
                inputMode="numeric"
                className="cf-input cf-dice__number"
                value={typeof value === "number" ? value : ""}
                min={f.min}
                max={f.max}
                placeholder="—"
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  const n = Number(raw);
                  set(f.key, raw === "" || !Number.isFinite(n) ? undefined : n);
                }}
                data-testid={`roll-option-${f.key}`}
              />
            )}
          </label>
        );
      })}
    </div>
  );
}

/** Pool breakdown, roll options, roll and push buttons, die faces, then successes or total and outcome, and the module's description. */
export function DiceRollPanel({ dice, input, onRolled, rng, allowPush = true, storyPoints, onSpendStoryPoint, storyPointRun, storyPointName, storyPointLabel, storyPointNeedsResult, pushInput, initialResult, initialEntered, physical: physicalProp, hideModeSwitch, title, className }: DiceRollPanelProps) {
  const roller = useDiceRoller();
  const [physical, setPhysical] = useState(physicalProp ?? roller.physical);
  useEffect(() => {
    if (physicalProp === undefined) setPhysical(roller.physical);
  }, [roller.physical, physicalProp]);
  /** What the entry form is for, in "Enter dice" mode. */
  const [entering, setEntering] = useState<"roll" | "push" | "story" | undefined>();
  /** Faces typed for the result shown (undefined when it was rolled in the app). */
  const [entered, setEntered] = useState<number[] | undefined>(initialEntered);
  const optionFields = useMemo(() => rollOptionFields(dice.rollOptions), [dice]);
  const [options, setOptions] = useState<Record<string, unknown>>(() => initialOptions(optionFields, input));
  // Key the pool on the input's content so a parent passing a fresh inline
  // object on every render does not rebuild the pool or clear the result.
  const inputKey = JSON.stringify({ input: input ?? {}, options });
  const pool = useMemo(() => dice.buildPool({ ...input, ...options }), [dice, inputKey]);
  const [result, setResult] = useState<RollResult | undefined>(initialResult);
  const lastKey = useRef(inputKey);
  useEffect(() => {
    if (lastKey.current === inputKey) return;
    lastKey.current = inputKey;
    setResult(undefined);
    setEntering(undefined);
    setEntered(undefined);
  }, [inputKey]);

  const baseId = dice.dice[0]?.id;
  const show = (r: RollResult, faces?: number[]) => {
    setResult(r);
    setEntered(faces);
    setEntering(undefined);
    if (faces) onRolled(r, faces);
    else onRolled(r);
  };
  const roll = () => show(dice.roll(pool, rng));
  const push = () => {
    if (!result || !dice.push) return;
    if (physical) return setEntering("push");
    show(dice.push(result, rng, pushInput));
  };
  const spend = (faces?: number[]) => {
    if (!onSpendStoryPoint) return;
    const next = faces ? onSpendStoryPoint(result, faces) : onSpendStoryPoint(result);
    setEntering(undefined);
    if (next) {
      setResult(next);
      // a spend that rolls no dice keeps the roll's own "entered" mark
      if (faces) setEntered(faces);
    }
  };
  const startSpend = () => {
    // Ask for dice only when the spend rolls some.
    if (physical && result && storyPointRun && probeDice((r) => storyPointRun(result, r)).requests.length > 0) return setEntering("story");
    spend();
  };
  const entry: { run: (r: Rng) => unknown; submit: (faces: number[]) => void; label: string } | undefined = !physical
    ? undefined
    : entering === "push" && result && dice.push
      ? { run: (r) => dice.push!(result, r, pushInput), submit: (faces) => show(rollEntered((r) => dice.push!(result, r, pushInput), faces), faces), label: "Use these dice for the push" }
      : entering === "story" && result && storyPointRun
        ? { run: (r) => storyPointRun(result, r), submit: (faces) => spend(faces), label: "Use these dice" }
        : entering === "roll" || !result
          ? { run: (r) => dice.roll(pool, r), submit: (faces) => show(rollEntered((r) => dice.roll(pool, r), faces), faces), label: "Use these dice" }
          : undefined;
  const hasPush = typeof dice.push === "function";
  const canPush = !!result && result.canPush && allowPush && hasPush;
  const totalStyle = showsTotal(dice, result);
  const symbolEntries = result ? Object.entries(result.symbols).filter(([, n]) => n > 0) : [];

  return (
    <div className={cx("cf-dice", className)} data-testid="dice-panel" data-style={totalStyle ? "total" : "successes"}>
      {title && <strong>{title}</strong>}
      <div className="cf-dice__pool">
        <DicePoolView pool={pool} />
      </div>
      <RollOptions fields={optionFields} values={options} onChange={setOptions} />
      <div className="cf-dice__actions">
        {!physical ? (
          <Button variant="primary" size="lg" onClick={roll}>
            {result ? "Roll again" : "Roll"}
          </Button>
        ) : (
          result &&
          entering !== "roll" && (
            <Button variant="primary" size="lg" onClick={() => setEntering("roll")} data-testid="enter-new-roll">
              Enter a new roll
            </Button>
          )
        )}
        {result && hasPush && (
          <Button onClick={push} disabled={!canPush || entering === "push"} title={canPush ? (physical ? "Enter the re-rolled dice" : "Re-roll per the push rule") : "No push available"}>
            Push
          </Button>
        )}
        {storyPoints !== undefined && (
          <span className="cf-dice__story">
            <Badge tone="accent">
              {storyPointName ?? "Story points"}: {storyPoints}
            </Badge>{" "}
            {onSpendStoryPoint && (
              <Button
                size="sm"
                onClick={startSpend}
                disabled={storyPoints <= 0 || (!!storyPointNeedsResult && !result)}
                data-testid="spend-story-point"
              >
                {storyPointLabel ?? "Spend"}
              </Button>
            )}
          </span>
        )}
        {!hideModeSwitch && (
          <DiceModeSwitch
            className="cf-dice__mode"
            physical={physical}
            onChange={(on) => {
              setPhysical(on);
              setEntering(undefined);
            }}
          />
        )}
      </div>
      {entry && (
        <EnterDice
          key={`${entering ?? "roll"}:${inputKey}:${result?.pushes ?? -1}:${result?.successes ?? -1}`}
          run={entry.run}
          dice={dice.dice}
          submitLabel={entry.label}
          onSubmit={(faces) => entry.submit(faces)}
          {...(result ? { onCancel: () => setEntering(undefined) } : {})}
        />
      )}
      {result && (
        <>
          <div className="cf-dice__faces" aria-label="Rolled dice">
            {result.dice.map((d, i) => (
              <DieFace key={i} spec={specById(dice, d.die)} value={d.value} kept={d.kept} dropped={d.dropped} special={d.die !== baseId} />
            ))}
          </div>
          <div className="cf-dice__summary">
            {totalStyle && result.total !== undefined ? (
              <>
                <span className="cf-dice__successes cf-dice__total" data-testid="roll-total">
                  {result.total}
                </span>
                {result.target !== undefined && <span className="cf-muted">vs {result.target}</span>}
                {result.outcome && (
                  <Badge tone={toneBadge(result.outcome.tone)} data-testid="roll-outcome" data-outcome={result.outcome.id}>
                    {result.outcome.label}
                  </Badge>
                )}
                {result.critical && result.outcome?.tone !== "critical" && <Badge tone="success">critical</Badge>}
                {result.fumble && result.outcome?.tone !== "fumble" && <Badge tone="danger">fumble</Badge>}
              </>
            ) : (
              <>
                <span className="cf-dice__successes" data-testid="successes">
                  {result.successes}
                </span>
                <span className="cf-muted">{result.successes === 1 ? "success" : "successes"}</span>
                {symbolEntries.map(([sym, n]) => (
                  <Badge key={sym} tone={sym === "success" ? "success" : "danger"}>
                    {sym} ×{n}
                  </Badge>
                ))}
              </>
            )}
            {result.pushes > 0 && <Badge tone="warning">pushed ×{result.pushes}</Badge>}
            {entered && (
              <Badge tone="accent" data-testid="roll-entered" title={`Rolled at the table: ${entered.join(" ")}`}>
                entered
              </Badge>
            )}
            <span className="cf-dice__describe" data-testid="describe">
              {dice.describe(result)}
            </span>
          </div>
          {result.notes && result.notes.length > 0 && (
            <ul className="cf-dice__notes">
              {result.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
