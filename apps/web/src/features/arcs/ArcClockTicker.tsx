/**
 * Thread clocks between jobs: every active thread rolls the module's dice
 * (an ignored thread moves further), previewed before anything moves; the
 * GM applies the roll, re-rolls the seed, or moves a clock by hand on the
 * board. Milestones a tick reaches show their payoff suggestions, which the
 * next job board picks up.
 */
import { applyArcTicks, planArcTicks, type ArcMilestone, type ClockMove } from "@campaign-forge/core";
import { payoffLabel, type ArcsDef } from "@campaign-forge/module-sdk";
import { useMemo, useState } from "react";
import { Badge, Button, Card, pushToast } from "../../components/ui";
import { currentSession } from "../../state/arcActions";
import { useCampaign, useList } from "../../state/hooks";
import { newSeed } from "../generate/runner";
import { ClockBar } from "./ClockBar";

export function ArcClockTicker({ def, seed: fixedSeed }: { def: ArcsDef; seed?: string }) {
  const ctx = useCampaign();
  const threads = useList("arcs");
  const [seed, setSeed] = useState(() => fixedSeed ?? newSeed());
  const [moves, setMoves] = useState<ClockMove[] | undefined>();
  const plan = useMemo(() => (def.tick ? planArcTicks({ arcs: Object.fromEntries(threads.map((t) => [t.id, t])) }, def, seed) : []), [threads, def, seed]);
  if (!def.tick) return null;
  const tick = def.tick;
  const steps = [...tick.steps].sort((a, b) => a.min - b.min);
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
      subtitle={`Each active thread rolls ${tick.dice}: ${steps.map((s) => `${s.min}+ ${s.ticks === 0 ? "nothing" : `+${s.ticks}`}`).join(", ")}; a thread the crew ignored moves ${tick.ignored} more.`}
      data-testid="arc-ticker"
    >
      {plan.length === 0 ? (
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
      <div className="app-row">
        <Button variant="primary" onClick={apply} disabled={plan.length === 0} data-testid="arc-tick-apply">
          Move the clocks
        </Button>
        <Button variant="ghost" onClick={() => setSeed(newSeed())} disabled={plan.length === 0} data-testid="arc-tick-reroll">
          Re-roll
        </Button>
        <span className="cf-muted app-small cf-mono">seed {seed}</span>
      </div>
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
