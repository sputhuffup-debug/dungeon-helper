/**
 * The wrap-up's award checklist, from the module's `progression`: the
 * end-of-session questions as a grid (one column per advancing PC, ticks,
 * totals, then Award), and the end-of-act awards (e.g. a Story Point per act)
 * for the acts this session played. Posting goes through the advancement log.
 */
import type { Entity, Id } from "@campaign-forge/core";
import { useMemo, useState } from "react";
import { Badge, Button, Card, PageRef, pushToast } from "../../components/ui";
import { errorMessage } from "../../lib/format";
import { poolValue, type AwardQuestionDef, type AwardRow } from "@campaign-forge/module-sdk";
import { useCampaign, useList, useMeta, useRecord } from "../../state/hooks";
import {
  actAwardOf,
  awardQuestionsOf,
  awardRowsFor,
  entityAdvances,
  poolOf,
  postActAward,
  postSessionAwards,
  progressionOf,
  sessionActs,
  sessionAwardsOf,
  type SessionAct,
} from "../../state/progressionActions";
import { usePlayerCharacters } from "../table/hooks";
import "./progression.css";

/** The advancing PCs, kept in step with the store. */
function useAdvancingPcs(): Entity[] {
  const { module } = useCampaign();
  const { mode } = useMeta();
  const pcs = usePlayerCharacters();
  return useMemo(() => pcs.filter((e) => entityAdvances(module, mode, e)), [pcs, module, mode]);
}

export function AwardsStep({ sessionId }: { sessionId: Id }) {
  const ctx = useCampaign();
  const { mode } = useMeta();
  const pcs = useAdvancingPcs();
  const def = progressionOf(ctx.module, mode);
  const sessionQs = useMemo(() => (def ? awardQuestionsOf(ctx, "session") : []), [ctx, def]);
  const actQs = useMemo(() => (def ? awardQuestionsOf(ctx, "act") : []), [ctx, def]);
  if (!def || pcs.length === 0 || (sessionQs.length === 0 && actQs.length === 0)) return null;
  const notes = (def.notes ?? []).filter((n) => !n.mode || n.mode.includes(mode));
  return (
    <div className="app-stack" data-testid="awards">
      {sessionQs.length > 0 && <SessionAwards sessionId={sessionId} pcs={pcs} questions={sessionQs} />}
      {actQs.length > 0 && <ActAwards sessionId={sessionId} pcs={pcs} questions={actQs} />}
      {notes.length > 0 && (
        <ul className="app-bullets prog-notes" aria-label="Other advancement">
          {notes.map((n, i) => (
            <li key={i}>
              {n.text} <PageRef page={n.page} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SessionAwards({ sessionId, pcs, questions }: { sessionId: Id; pcs: Entity[]; questions: AwardQuestionDef[] }) {
  const ctx = useCampaign();
  const { mode } = useMeta();
  const log = useList("advancement");
  const rows = useMemo(() => Object.fromEntries(pcs.map((pc) => [pc.id, awardRowsFor(ctx, pc, sessionId, "session")])) as Record<Id, AwardRow[]>, [ctx, pcs, sessionId]);
  const posted = useMemo(() => Object.fromEntries(pcs.map((pc) => [pc.id, sessionAwardsOf(ctx, sessionId, pc.id)])), [ctx, pcs, sessionId, log]);
  const [ticks, setTicks] = useState<Record<Id, string[]>>(() => Object.fromEntries(pcs.map((pc) => [pc.id, (rows[pc.id] ?? []).filter((r) => r.ticked).map((r) => r.question.id)])));
  const pools = { experience: poolOf(ctx.module, mode, "experience"), story: poolOf(ctx.module, mode, "story") };
  const label = (pool: "experience" | "story") => pools[pool]?.label ?? pool;
  const ticked = (pcId: Id) => {
    const done = posted[pcId] ?? [];
    return done.length ? done.flatMap((e) => e.questions ?? []) : (ticks[pcId] ?? []);
  };
  const totals = (pcId: Id) => {
    const ids = new Set(ticked(pcId));
    const out: Record<string, number> = {};
    for (const q of questions) if (ids.has(q.id)) out[q.pool ?? "experience"] = (out[q.pool ?? "experience"] ?? 0) + (q.amount ?? 1);
    return out;
  };
  const toggle = (pcId: Id, qid: string, on: boolean) => setTicks((t) => ({ ...t, [pcId]: on ? [...new Set([...(t[pcId] ?? []), qid])] : (t[pcId] ?? []).filter((x) => x !== qid) }));
  const pending = pcs.filter((pc) => !(posted[pc.id]?.length) && (ticks[pc.id]?.length ?? 0) > 0);
  const award = () => {
    try {
      const entries = postSessionAwards(ctx, sessionId, Object.fromEntries(pending.map((pc) => [pc.id, ticks[pc.id] ?? []])));
      const byPc = pending.map((pc) => `${pc.name} ${entries.filter((e) => e.character === pc.id).map((e) => `+${e.amount} ${label(e.pool)}`).join(", ")}`);
      pushToast(`Awarded: ${byPc.join("; ")}.`, { tone: "success" });
    } catch (e) {
      pushToast(`Could not post the awards: ${errorMessage(e)}`, { tone: "danger" });
    }
  };
  return (
    <Card
      title="Experience"
      subtitle="Tick each question a player can answer yes to. The group talks it through; the GM has the final say."
      actions={
        <Button variant="primary" onClick={award} disabled={pending.length === 0} data-testid="award-xp">
          Award
        </Button>
      }
    >
      <div className="prog-awards__scroll">
        <table className="cf-table prog-awards" data-testid="award-checklist">
          <thead>
            <tr>
              <th scope="col">Question</th>
              {pcs.map((pc) => (
                <th key={pc.id} scope="col" className="prog-awards__pc" data-pc={pc.id}>
                  {pc.name}
                  {posted[pc.id]?.length ? (
                    <Badge tone="success" data-testid="awarded">
                      Awarded
                    </Badge>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {questions.map((q) => (
              <tr key={q.id} data-question={q.id}>
                <td className="prog-awards__q">
                  <span>{q.text}</span> <PageRef page={q.page} />
                  {q.hint && <span className="cf-muted prog-awards__hint">{q.hint}</span>}
                </td>
                {pcs.map((pc) => {
                  const row = rows[pc.id]?.find((r) => r.question.id === q.id);
                  const done = !!posted[pc.id]?.length;
                  const on = ticked(pc.id).includes(q.id);
                  return (
                    <td key={pc.id} className={`prog-awards__cell${row && !row.applies ? " is-na" : ""}`}>
                      <input
                        type="checkbox"
                        className="cf-checkbox"
                        aria-label={`${pc.name}: ${q.text}`}
                        checked={on}
                        disabled={done || (row ? !row.applies : false)}
                        title={row?.reason}
                        onChange={(e) => toggle(pc.id, q.id, e.target.checked)}
                      />
                      {row?.suggested && !done && <span className="prog-awards__suggested" title="Suggested from the session's log">•</span>}
                      {row && !row.applies && <span className="cf-muted prog-awards__na">{row.reason ?? "n/a"}</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="prog-awards__q">
                <strong>Total</strong>
              </td>
              {pcs.map((pc) => {
                const t = totals(pc.id);
                const xp = pools.experience;
                const now = xp ? poolValue(xp, pc.fields) : 0;
                const done = !!posted[pc.id]?.length;
                return (
                  <td key={pc.id} data-total={pc.id} className="prog-awards__total">
                    <strong>
                      +{t.experience ?? 0} {label("experience")}
                    </strong>
                    {xp && <span className="cf-muted">{done ? `now ${now}` : `${now} → ${now + (t.experience ?? 0)}`}</span>}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}

function ActAwards({ sessionId, pcs, questions }: { sessionId: Id; pcs: Entity[]; questions: AwardQuestionDef[] }) {
  const ctx = useCampaign();
  const { mode } = useMeta();
  const session = useRecord("sessions", sessionId);
  useList("advancement");
  const acts = useMemo(() => sessionActs(ctx, session), [ctx, session]);
  const pool = poolOf(ctx.module, mode, questions[0]?.pool ?? "story");
  const [ticks, setTicks] = useState<Set<string>>(new Set());
  const cellKey = (act: SessionAct, pcId: Id, q: string) => `${act.adventure ?? ""}|${act.number}|${pcId}|${q}`;
  const award = () => {
    try {
      let n = 0;
      for (const act of acts)
        for (const pc of pcs)
          for (const q of questions) {
            if (!ticks.has(cellKey(act, pc.id, q.id)) || actAwardOf(ctx, act, pc.id, q.id)) continue;
            postActAward(ctx, { character: pc.id, act, question: q.id, sessionId });
            n++;
          }
      setTicks(new Set());
      pushToast(`${n} ${pool?.label ?? "award"}${n === 1 ? "" : "s"} awarded.`, { tone: "success" });
    } catch (e) {
      pushToast(`Could not post the awards: ${errorMessage(e)}`, { tone: "danger" });
    }
  };
  const pendingCount = [...ticks].length;
  return (
    <Card
      title={pool?.name ?? pool?.label ?? "Awards"}
      subtitle="At the end of each act. Already awarded acts are ticked and locked."
      actions={
        <Button variant="primary" onClick={award} disabled={pendingCount === 0} data-testid="award-acts">
          Award {pool?.label ?? ""}
        </Button>
      }
    >
      {questions.map((q) => (
        <div key={q.id} className="app-stack">
          <p>
            {q.text} <PageRef page={q.page} />
            {q.hint && <span className="cf-muted"> {q.hint}</span>}
          </p>
          <table className="cf-table prog-awards" data-testid="act-awards">
            <thead>
              <tr>
                <th scope="col">Act</th>
                {pcs.map((pc) => (
                  <th key={pc.id} scope="col" className="prog-awards__pc">
                    {pc.name}
                    {pool && (
                      <span className="cf-muted prog-awards__have" data-have={pc.id}>
                        {poolValue(pool, pc.fields)}
                        {pool.max !== undefined ? `/${pool.max}` : ""} {pool.label}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {acts.map((act) => (
                <tr key={`${act.adventure ?? ""}:${act.number}`} data-act={act.number}>
                  <td className="prog-awards__q">
                    <strong>Act {act.number}</strong>
                    {act.title ? <span className="cf-muted"> {act.title}</span> : null}
                  </td>
                  {pcs.map((pc) => {
                    const done = !!actAwardOf(ctx, act, pc.id, q.id);
                    const k = cellKey(act, pc.id, q.id);
                    return (
                      <td key={pc.id} className="prog-awards__cell">
                        <input
                          type="checkbox"
                          className="cf-checkbox"
                          aria-label={`${pc.name}, act ${act.number}: ${q.text}`}
                          checked={done || ticks.has(k)}
                          disabled={done}
                          onChange={(e) =>
                            setTicks((t) => {
                              const next = new Set(t);
                              if (e.target.checked) next.add(k);
                              else next.delete(k);
                              return next;
                            })
                          }
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </Card>
  );
}
