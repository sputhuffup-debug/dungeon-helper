/**
 * A character's Progression tab: the pools (XP to spend, Story Points), the
 * lifetime totals summed from the advancement log, Spend XP and undo of the
 * last spend, story point spends with a reason, and the full history.
 * Loaded on demand from the entity page.
 */
import type { AdvancementEntry, Entity } from "@campaign-forge/core";
import { advancementTotals } from "@campaign-forge/core";
import { useMemo, useState } from "react";
import { Badge, Button, Card, PageRef, Pips, pushToast } from "../../components/ui";
import { errorMessage } from "../../lib/format";
import { poolValue } from "@campaign-forge/module-sdk";
import { useCampaign, useList, useMeta } from "../../state/hooks";
import { carryOverStoryPoints, historyOf, lastSpendUndoOf, poolOf, progressionOf, spendOptionsOf, undoSpend } from "../../state/progressionActions";
import { sessionLabel } from "../../state/tableActions";
import { SpendDialog } from "./SpendDialog";
import { StoryPointSpend } from "./StoryPointControl";
import "./progression.css";

export function ProgressionTab({ entity }: { entity: Entity }) {
  const ctx = useCampaign();
  const { mode } = useMeta();
  const log = useList("advancement");
  const sessions = useList("sessions");
  const def = progressionOf(ctx.module, mode);
  const xp = poolOf(ctx.module, mode, "experience");
  const story = poolOf(ctx.module, mode, "story");
  const totals = useMemo(() => advancementTotals(ctx.store, entity.id), [ctx.store, entity.id, log]);
  const history = useMemo(() => historyOf(ctx, entity.id), [ctx, entity.id, log]);
  const undo = useMemo(() => lastSpendUndoOf(ctx, entity.id), [ctx, entity.id, log, entity]);
  const [spending, setSpending] = useState(false);
  const canSpend = spendOptionsOf(ctx).length > 0;
  if (!def) return <p className="cf-muted">This game has no advancement rules for this play mode.</p>;
  const notes = (def.notes ?? []).filter((n) => !n.mode || n.mode.includes(mode));
  const sessionName = (id: string | undefined) => {
    const s = id ? sessions.find((x) => x.id === id) : undefined;
    return s ? sessionLabel(s) : "Before play";
  };
  const poolLabel = (pool: AdvancementEntry["pool"]) => (pool === "experience" ? (xp?.label ?? "XP") : (story?.label ?? "Story"));

  const doUndo = () => {
    try {
      const e = undoSpend(ctx, entity.id);
      pushToast(`Undone: ${e.reason}. ${e.spend?.cost ?? 0} ${poolLabel(e.pool)} back.`, { tone: "success" });
    } catch (err) {
      pushToast(errorMessage(err), { tone: "danger" });
    }
  };

  return (
    <div className="prog-tab app-stack" data-testid="progression-tab">
      <div className="prog-pools">
        {xp && (
          <Card
            title={xp.name ?? xp.label}
            subtitle={"spendWhenText" in xp ? (xp as { spendWhenText?: string }).spendWhenText : undefined}
            actions={
              <span className="app-row">
                <Button onClick={doUndo} disabled={!undo.ok} title={undo.ok ? `Undo: ${undo.entry?.reason}` : undo.reason} data-testid="undo-spend">
                  Undo last spend
                </Button>
                {canSpend && (
                  <Button variant="primary" onClick={() => setSpending(true)} data-testid="spend-xp">
                    Spend {xp.label}
                  </Button>
                )}
              </span>
            }
          >
            <div className="prog-pool">
              <span className="prog-pool__value" data-testid="pool-experience">
                {poolValue(xp, entity.fields)}
              </span>
              <span className="prog-pool__label">
                {xp.label} to spend <PageRef page={xp.page} />
              </span>
              <span className="cf-muted prog-pool__totals" data-testid="xp-totals">
                Earned {totals.experience.earned} · spent {totals.experience.spent}
                {totals.experience.adjusted ? ` · adjusted ${totals.experience.adjusted > 0 ? "+" : ""}${totals.experience.adjusted}` : ""}
              </span>
            </div>
          </Card>
        )}
        {story && def.storyPoints && (
          <Card title={story.name ?? story.label} actions={<StoryPointSpend entity={entity} />}>
            <div className="prog-pool">
              <Pips value={poolValue(story, entity.fields)} max={story.max ?? 3} label={`${entity.name} ${story.label}`} readonly />
              <span className="prog-pool__label" data-testid="pool-story" data-value={poolValue(story, entity.fields)}>
                <PageRef page={story.page} />
              </span>
              <span className="cf-muted prog-pool__totals">
                Earned {totals.story.earned} · spent {totals.story.spent}
              </span>
            </div>
            <ul className="app-bullets">
              {def.storyPoints.earn.map((e, i) => (
                <li key={`earn${i}`}>
                  {e.text} <PageRef page={e.page} />
                </li>
              ))}
              {def.storyPoints.uses.map((u) => (
                <li key={u.id}>
                  <strong>{u.label}.</strong> {u.text} <PageRef page={u.page} />
                </li>
              ))}
            </ul>
            {def.storyPoints.carryOver && (
              <p className="app-row">
                <span className="cf-muted app-grow">
                  {def.storyPoints.carryOver.text} <PageRef page={def.storyPoints.carryOver.page} />
                </span>
                <Button
                  size="sm"
                  disabled={poolValue(story, entity.fields) <= def.storyPoints.carryOver.max}
                  onClick={() => {
                    const e = carryOverStoryPoints(ctx, entity.id);
                    if (e) pushToast(`${entity.name} keeps ${def.storyPoints!.carryOver!.max} ${story.label}.`, { tone: "success" });
                  }}
                >
                  End of adventure
                </Button>
              </p>
            )}
          </Card>
        )}
      </div>

      <Card title="History" subtitle="Every award and spend, newest first. Totals are summed from this list.">
        {history.length === 0 ? (
          <p className="cf-muted">Nothing earned or spent yet.</p>
        ) : (
          <table className="cf-table prog-history" data-testid="advancement-history">
            <thead>
              <tr>
                <th>When</th>
                <th className="prog-num">Change</th>
                <th>What</th>
                <th>Session</th>
              </tr>
            </thead>
            <tbody>
              {history.map((e) => (
                <tr key={e.id} data-kind={e.kind}>
                  <td className="cf-mono">{e.inWorldDate ?? e.realDate}</td>
                  <td className={`prog-num cf-mono${e.amount < 0 ? " is-negative" : ""}`}>
                    {e.amount > 0 ? "+" : ""}
                    {e.amount} {poolLabel(e.pool)}
                  </td>
                  <td>
                    <Badge tone={e.kind === "award" ? "success" : e.kind === "spend" ? "accent" : "muted"}>{e.kind}</Badge> {e.reason}
                    {e.capped ? <span className="cf-muted"> ({e.capped} over the cap)</span> : null}
                  </td>
                  <td>{e.act !== undefined ? `${sessionName(e.session)}, act ${e.act}` : sessionName(e.session)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {notes.length > 0 && (
        <Card title="Also">
          <ul className="app-bullets">
            {notes.map((n, i) => (
              <li key={i}>
                {n.text} <PageRef page={n.page} />
              </li>
            ))}
          </ul>
        </Card>
      )}
      {canSpend && <SpendDialog entityId={entity.id} open={spending} onClose={() => setSpending(false)} />}
    </div>
  );
}
