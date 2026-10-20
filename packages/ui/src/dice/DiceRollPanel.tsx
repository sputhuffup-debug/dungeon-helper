import { useEffect, useMemo, useRef, useState } from "react";
import type { DiceSystem, DieSpec, RollResult, Rng } from "@campaign-forge/module-sdk";
import { Badge } from "../primitives/Badge";
import { Button } from "../primitives/Button";
import { cx } from "../sheet/paths";
import { DicePoolView } from "../widgets/dicepool";
import { DieFace } from "./DieFace";

export interface DiceRollPanelProps {
  dice: DiceSystem;
  /** Module-specific input for `buildPool` (attribute, skill, modifier...). */
  input: Record<string, unknown>;
  onRolled: (result: RollResult) => void;
  rng: Rng;
  allowPush?: boolean;
  storyPoints?: number;
  /**
   * Spend a story point. It gets the roll shown (if any); returning a result
   * shows that instead (e.g. one die turned into a success). Nothing is
   * logged here: the handler logs the spend and the changed roll.
   */
  onSpendStoryPoint?: (result: RollResult | undefined) => RollResult | void;
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
  title?: string;
  className?: string;
}

export function specById(dice: DiceSystem, id: string): DieSpec | undefined {
  return dice.dice.find((d) => d.id === id);
}

/** Pool breakdown, roll and push buttons, die faces, successes and the module's description. */
export function DiceRollPanel({ dice, input, onRolled, rng, allowPush = true, storyPoints, onSpendStoryPoint, storyPointName, storyPointLabel, storyPointNeedsResult, pushInput, initialResult, title, className }: DiceRollPanelProps) {
  // Key the pool on the input's content so a parent passing a fresh inline
  // object on every render does not rebuild the pool or clear the result.
  const inputKey = JSON.stringify(input ?? {});
  const pool = useMemo(() => dice.buildPool(input), [dice, inputKey]);
  const [result, setResult] = useState<RollResult | undefined>(initialResult);
  const lastKey = useRef(inputKey);
  useEffect(() => {
    if (lastKey.current === inputKey) return;
    lastKey.current = inputKey;
    setResult(undefined);
  }, [inputKey]);

  const baseId = dice.dice[0]?.id;
  const roll = () => {
    const r = dice.roll(pool, rng);
    setResult(r);
    onRolled(r);
  };
  const push = () => {
    if (!result || !dice.push) return;
    const r = dice.push(result, rng, pushInput);
    setResult(r);
    onRolled(r);
  };
  const canPush = !!result && result.canPush && allowPush && typeof dice.push === "function";
  const symbolEntries = result ? Object.entries(result.symbols).filter(([, n]) => n > 0) : [];

  return (
    <div className={cx("cf-dice", className)} data-testid="dice-panel">
      {title && <strong>{title}</strong>}
      <div className="cf-dice__pool">
        <DicePoolView pool={pool} />
      </div>
      <div className="cf-dice__actions">
        <Button variant="primary" size="lg" onClick={roll}>
          {result ? "Roll again" : "Roll"}
        </Button>
        {result && (
          <Button onClick={push} disabled={!canPush} title={canPush ? "Re-roll per the push rule" : "No push available"}>
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
                onClick={() => {
                  const next = onSpendStoryPoint(result);
                  if (next) setResult(next);
                }}
                disabled={storyPoints <= 0 || (!!storyPointNeedsResult && !result)}
                data-testid="spend-story-point"
              >
                {storyPointLabel ?? "Spend"}
              </Button>
            )}
          </span>
        )}
      </div>
      {result && (
        <>
          <div className="cf-dice__faces" aria-label="Rolled dice">
            {result.dice.map((d, i) => (
              <DieFace key={i} spec={specById(dice, d.die)} value={d.value} kept={d.kept} special={d.die !== baseId} />
            ))}
          </div>
          <div className="cf-dice__summary">
            <span className="cf-dice__successes" data-testid="successes">
              {result.successes}
            </span>
            <span className="cf-muted">{result.successes === 1 ? "success" : "successes"}</span>
            {symbolEntries.map(([sym, n]) => (
              <Badge key={sym} tone={sym === "success" ? "success" : "danger"}>
                {sym} ×{n}
              </Badge>
            ))}
            {result.pushes > 0 && <Badge tone="warning">pushed ×{result.pushes}</Badge>}
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
