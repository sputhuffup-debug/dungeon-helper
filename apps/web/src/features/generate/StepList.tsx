/** Every procedure step in order: its rolls, result, skip reason, and per-step re-roll / pin / include / enter roll. */
import type { DieSpec, RollRecord, Rng } from "@campaign-forge/module-sdk";
import { Badge, Button, EnterDice, PageRef, ProvenanceBadge, RollRecordList } from "../../components/ui";
import { summarizeValue, type StepView } from "./runner";

export interface StepListProps {
  steps: StepView[];
  /** Steps whose result changed with the last re-roll. */
  changed: Set<string>;
  /** Rolls remembered for pinned steps (the runner does not roll them). */
  pinnedRolls: Record<string, RollRecord[]>;
  includeOptional: string[];
  onReroll: (stepId: string) => void;
  onPin: (stepId: string) => void;
  onUnpin: (stepId: string) => void;
  onResetSeed: (stepId: string) => void;
  onToggleOptional: (stepId: string, include: boolean) => void;
  /** The step whose dice are being typed (rolled at the table), with its roll and how many steps are queued. */
  entering?: { stepId: string; run: (rng: Rng) => unknown; remaining: number };
  /** Steps that roll dice; only they offer "Enter roll". */
  canEnter?: Set<string>;
  onEnter?: (stepId: string) => void;
  onEntered?: (stepId: string, faces: number[]) => void;
  /** Leave this step as rolled and move on (entering the whole run). */
  onSkipEnter?: () => void;
  onCancelEnter?: () => void;
  /** Back to the step's seed. */
  onClearEntered?: (stepId: string) => void;
  /** The module's dice, for the entry inputs' colours. */
  dice?: DieSpec[];
}

export function StepList({ steps, changed, pinnedRolls, includeOptional, onReroll, onPin, onUnpin, onResetSeed, onToggleOptional, entering, canEnter, onEnter, onEntered, onSkipEnter, onCancelEnter, onClearEntered, dice }: StepListProps) {
  const titleOf = (id: string) => steps.find((s) => s.id === id)?.title ?? id;
  return (
    <ol className="prep-steps" aria-label="Procedure steps">
      {steps.map((s, i) => {
        const rolls = s.state === "pinned" ? (pinnedRolls[s.id] ?? []) : s.rolls;
        const inactive = s.state === "skipped" || s.state === "optional-off";
        return (
          <li key={s.id} className={`prep-step${inactive ? " is-inactive" : ""}${changed.has(s.id) ? " is-changed" : ""}`} data-step={s.id} data-testid={`step-${s.id}`}>
            <header className="prep-step__head">
              <span className="prep-step__num">{i + 1}</span>
              <div className="prep-step__title">
                <strong>{s.title}</strong>
                <span className="app-row prep-step__meta">
                  <PageRef page={s.page} />
                  {s.table && <span className="cf-mono cf-muted">{s.table}</span>}
                  {s.kind === "compute" && <span className="cf-muted">computed</span>}
                  {s.repeat && <span className="cf-muted">repeats</span>}
                  {s.optional && <Badge>optional</Badge>}
                  {s.state === "pinned" && <Badge tone="warning">pinned</Badge>}
                  {s.customSeed && !s.entered && <Badge tone="accent">re-rolled</Badge>}
                  {s.entered && (
                    <Badge tone="accent" data-testid={`step-entered-${s.id}`} title={`Rolled at the table: ${s.entered.join(" ")}`}>
                      entered
                    </Badge>
                  )}
                  {changed.has(s.id) && <Badge tone="success">changed</Badge>}
                </span>
              </div>
              <div className="app-row prep-step__actions">
                {s.optional && (
                  <label className="app-toggle">
                    <input type="checkbox" checked={includeOptional.includes(s.id)} onChange={(e) => onToggleOptional(s.id, e.target.checked)} aria-label={`Include ${s.title}`} />
                    Include
                  </label>
                )}
                {!inactive && s.state !== "pinned" && (
                  <Button size="sm" onClick={() => onReroll(s.id)} aria-label={`Re-roll ${s.title}`} title={s.dependents.length ? `Also changes: ${s.dependents.map(titleOf).join(", ")}` : "Only this step changes"}>
                    Re-roll
                  </Button>
                )}
                {!inactive && s.state !== "pinned" && onEnter && (canEnter?.has(s.id) ?? true) && (
                  <Button size="sm" variant="ghost" onClick={() => onEnter(s.id)} aria-label={`Enter roll for ${s.title}`} title="Type the dice rolled at the table for this step" data-testid={`enter-roll-${s.id}`}>
                    Enter roll
                  </Button>
                )}
                {s.entered && onClearEntered && (
                  <Button size="sm" variant="ghost" onClick={() => onClearEntered(s.id)} aria-label={`Undo entered roll of ${s.title}`}>
                    Undo
                  </Button>
                )}
                {s.customSeed && !s.entered && s.state !== "pinned" && (
                  <Button size="sm" variant="ghost" onClick={() => onResetSeed(s.id)} aria-label={`Undo re-roll of ${s.title}`}>
                    Undo
                  </Button>
                )}
                {s.state === "pinned" ? (
                  <Button size="sm" variant="ghost" onClick={() => onUnpin(s.id)} aria-label={`Unpin ${s.title}`}>
                    Unpin
                  </Button>
                ) : (
                  s.hasResult && (
                    <Button size="sm" variant="ghost" onClick={() => onPin(s.id)} aria-label={`Pin ${s.title}`} title="Keep this value when other steps are re-rolled">
                      Pin
                    </Button>
                  )
                )}
              </div>
            </header>

            {entering?.stepId === s.id && onEntered && (
              <EnterDice
                key={s.id}
                title={entering.remaining > 1 ? `Dice for “${s.title}” (${entering.remaining} steps to go)` : `Dice for “${s.title}”`}
                run={entering.run}
                dice={dice}
                onSubmit={(faces) => onEntered(s.id, faces)}
                {...(entering.remaining > 1 && onSkipEnter ? { onRollInApp: onSkipEnter, rollInAppLabel: "Keep the app's roll" } : {})}
                {...(onCancelEnter ? { onCancel: onCancelEnter } : {})}
                className="prep-step__enter"
              />
            )}
            {inactive ? (
              <p className="cf-muted prep-step__skip">{s.skipReason}</p>
            ) : (
              <div className="prep-step__body">
                {rolls.length > 0 && (
                  <ul className="prep-rolls">
                    {rolls.map((r, j) => (
                      <RollLine key={`${r.step}-${r.iteration ?? 0}-${j}`} roll={r} />
                    ))}
                  </ul>
                )}
                {s.hasResult && (
                  <div className="prep-step__result">
                    <span className="prep-step__value" data-testid={`step-result-${s.id}`}>
                      {s.display ?? summarizeValue(s.result)}
                    </span>
                    <ProvenanceBadge kind={s.state === "pinned" ? "edited" : s.kind === "compute" ? "computed" : "rolled"} label={s.state === "pinned" ? "pinned" : undefined} rolls={rolls} detail={`Step ${s.id}`} onReroll={s.state === "pinned" ? undefined : () => onReroll(s.id)} />
                  </div>
                )}
                {s.hasResult && typeof s.result === "object" && s.result !== null && !(Array.isArray(s.result) && s.result.length === 0) && (
                  <details className="prep-step__raw">
                    <summary>Raw result</summary>
                    <pre className="cf-mono">{JSON.stringify(s.result, null, 2)}</pre>
                  </details>
                )}
                {s.dependents.length > 0 && s.state !== "pinned" && <p className="cf-muted prep-step__deps">Re-rolling also changes: {s.dependents.map(titleOf).join(", ")}</p>}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function RollLine({ roll }: { roll: RollRecord }) {
  return (
    <li className="prep-roll">
      {roll.iteration !== undefined && <span className="prep-roll__iter">#{roll.iteration + 1}</span>}
      <span className="cf-mono prep-roll__dice" data-testid="roll-dice">
        {roll.dice} → [{roll.raw.join(", ")}]
        {roll.modifier ? ` ${roll.modifier > 0 ? "+" : "−"}${Math.abs(roll.modifier)}` : ""} = <strong>{roll.total}</strong>
      </span>
      <span className="prep-roll__row">{roll.rowLabel ?? summarizeValue(roll.result, 80)}</span>
      <PageRef page={roll.page} cite={roll.cite} />
      {roll.nested && roll.nested.length > 0 && (
        <div className="prep-roll__nested">
          <RollRecordList rolls={roll.nested} />
        </div>
      )}
    </li>
  );
}
