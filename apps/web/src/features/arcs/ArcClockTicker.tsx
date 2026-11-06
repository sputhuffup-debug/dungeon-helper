/**
 * Thread clocks between jobs: every active thread rolls the module's dice
 * (an ignored thread moves further), previewed before anything moves; the
 * GM applies the roll, re-rolls the seed, or moves a clock by hand on the
 * board. Milestones a tick reaches show their payoff suggestions, which the
 * next job board picks up. Inside the between-jobs procedure the ticker is
 * `linked`: accepting the run moves the clocks (a checkbox leaves them be).
 */
import { applyArcTicks, planArcTicks, type ArcMilestone, type ClockMove } from "@campaign-forge/core";
import { diceRange, payoffLabel, type ArcsDef } from "@campaign-forge/module-sdk";
import { useMemo, useState } from "react";
import { Badge, Button, Card, pushToast } from "../../components/ui";
import { currentSession } from "../../state/arcActions";
import { useCampaign, useList } from "../../state/hooks";
import { newSeed } from "../generate/runner";
import { ClockBar } from "./ClockBar";
import "./arcs.css";

/** The ticker inside a procedure whose accept moves the clocks: the seed and the choice live with the procedure. */
export interface LinkedTicker {
  seed: string;
  onReroll: () => void;
  include: boolean;
  onInclude: (on: boolean) => void;
  /** What accepting moved (once accepted). */
  moved?: ClockMove[];
}

const SEGMENT_WORDS = ["no move", "one segment", "two segments", "three segments", "four segments"];

/**
 * The tick table as ranges of the roll: "1–2 no move (the sponsor waits), 3–5
 * one segment (…), 6 two segments (…)", each with its step's label when it has one.
 */
export function tickStepsText(tick: NonNullable<ArcsDef["tick"]>): string {
  const steps = [...tick.steps].sort((a, b) => a.min - b.min);
  let max = Number.POSITIVE_INFINITY;
  try {
    max = diceRange(tick.dice)[1];
  } catch {
    // not a dice expression: open-ended ranges
  }
  return steps
    .map((s, i) => {
      const top = i + 1 < steps.length ? steps[i + 1]!.min - 1 : max;
      const range = top === s.min ? `${s.min}` : Number.isFinite(top) ? `${s.min}–${top}` : `${s.min}+`;
      const moves = SEGMENT_WORDS[s.ticks] ?? `${s.ticks} segments`;
      // "The sponsor waits" reads mid-sentence as "the sponsor waits" (an acronym keeps its case)
      const label = s.label && /^[A-Z][a-z]/.test(s.label) ? s.label[0]!.toLowerCase() + s.label.slice(1) : s.label;
      return `${range} ${moves}${label ? ` (${label})` : ""}`;
    })
    .join(", ");
}

export function ArcClockTicker({ def, seed: fixedSeed, linked }: { def: ArcsDef; seed?: string; linked?: LinkedTicker }) {
  const ctx = useCampaign();
  const threads = useList("arcs");
  const [ownSeed, setSeed] = useState(() => fixedSeed ?? newSeed());
  const [ownMoves, setMoves] = useState<ClockMove[] | undefined>();
  const seed = linked?.seed ?? ownSeed;
  const moves = linked?.moved ?? ownMoves;
  const plan = useMemo(() => (def.tick ? planArcTicks({ arcs: Object.fromEntries(threads.map((t) => [t.id, t])) }, def, seed) : []), [threads, def, seed]);
  if (!def.tick) return null;
  const tick = def.tick;
  const apply = () => {
    const session = currentSession(ctx.store);
    const done = applyArcTicks(ctx.store, plan, { ...(session ? { session: session.id } : {}), note: "Between jobs" });
    setMoves(done);
    const reached = done.flatMap((m) => m.reached);
    pushToast(reached.length ? `Clocks moved: ${reached.length} milestone${reached.length === 1 ? "" : "s"} reached.` : "Clocks moved.", { tone: reached.length ? "warning" : "success" });
    setSeed(newSeed());
  };
  return (
    <Card
      title="Thread clocks between jobs"
      subtitle={`Each active thread rolls ${tick.dice}: ${tickStepsText(tick)}; a thread the crew ignored moves ${tick.ignored} more.`}
      data-testid="arc-ticker"
    >
      {linked?.moved ? (
        // accepted: what the run moved, not the next roll's preview
        linked.moved.length > 0 && (
          <ul className="arc-ticker" aria-label="Clocks moved" data-testid="arc-moved">
            {linked.moved.map((m) => (
              <li key={m.thread.id} className="arc-ticker__row" data-testid="arc-moved-row">
                <span className="arc-ticker__title">{m.thread.title}</span>
                <span className="app-small">
                  {m.from}/{m.thread.clock.segments} → <strong>{m.to}</strong> · moved
                </span>
                <ClockBar segments={m.thread.clock.segments} filled={m.to} milestones={m.thread.clock.milestones.map((x) => x.at)} />
              </li>
            ))}
          </ul>
        )
      ) : plan.length === 0 ? (
        <p className="cf-muted">No active thread on the arc board.</p>
      ) : (
        <ul className="arc-ticker" aria-label="Planned ticks">
          {plan.map((p) => {
            const t = threads.find((x) => x.id === p.thread)!;
            return (
              <li key={p.thread} className="arc-ticker__row" data-testid="arc-tick">
                <span className="arc-ticker__title">{p.title}</span>
                <span className="cf-mono app-small" title={`Seed ${p.roll.seed}`}>
                  {tick.dice} → {p.roll.faces.join(", ")}
                </span>
                {p.ignored && (
                  <Badge tone="warning" title="No clue of it was found since its clock last moved">
                    ignored +{p.roll.ignored}
                  </Badge>
                )}
                <span className="app-small">
                  {p.from}/{t.clock.segments} → <strong>{p.to}</strong>
                  {p.roll.label ? ` · ${p.roll.label}` : ""}
                </span>
                <ClockBar segments={t.clock.segments} filled={p.from} next={p.to} milestones={t.clock.milestones.map((m) => m.at)} />
                {p.reaches.map((m) => (
                  <Milestone key={m.at} m={m} def={def} />
                ))}
              </li>
            );
          })}
        </ul>
      )}
      {linked ? (
        linked.moved ? (
          <p className="cf-muted app-small" data-testid="arc-tick-done">
            {linked.moved.length ? `Moved with the run: ${linked.moved.map((m) => `${m.thread.title} ${m.from}→${m.to}`).join(", ")}.` : "The clocks were left as they were."}
          </p>
        ) : (
          <div className="app-row">
            <label className="app-toggle">
              <input type="checkbox" checked={linked.include} disabled={plan.length === 0} onChange={(e) => linked.onInclude(e.target.checked)} data-testid="arc-tick-include" />
              Move the clocks when I accept
            </label>
            <Button variant="ghost" onClick={linked.onReroll} disabled={plan.length === 0} data-testid="arc-tick-reroll">
              Re-roll
            </Button>
            <span className="cf-muted app-small cf-mono">seed {seed}</span>
          </div>
        )
      ) : (
        <div className="app-row">
          <Button variant="primary" onClick={apply} disabled={plan.length === 0} data-testid="arc-tick-apply">
            Move the clocks
          </Button>
          <Button variant="ghost" onClick={() => setSeed(newSeed())} disabled={plan.length === 0} data-testid="arc-tick-reroll">
            Re-roll
          </Button>
          <span className="cf-muted app-small cf-mono">seed {seed}</span>
        </div>
      )}
      {moves && moves.some((m) => m.reached.length) && (
        <div className="app-note" data-testid="arc-tick-reached">
          {moves
            .filter((m) => m.reached.length)
            .map((m) => (
              <div key={m.thread.id}>
                <strong>{m.thread.title}</strong>
                {m.reached.map((r) => (
                  <Milestone key={r.at} m={r} def={def} />
                ))}
              </div>
            ))}
          <p className="cf-muted app-small">The next job board deals these payoffs when the arcs weight it.</p>
        </div>
      )}
    </Card>
  );
}

export function Milestone({ m, def }: { m: ArcMilestone; def: ArcsDef }) {
  return (
    <p className="arc-milestone app-small" data-testid="arc-milestone">
      <Badge tone="danger">{m.at}</Badge> {m.text}
      {(m.payoffs ?? []).map((p, i) => (
        <span key={i} className="arc-milestone__payoff">
          {" "}
          <Badge tone={p.used ? "muted" : "warning"} title={payoffLabel(def, p.kind)}>
            {p.used ? "used" : payoffLabel(def, p.kind)}
          </Badge>{" "}
          {p.text}
        </span>
      ))}
    </p>
  );
}
