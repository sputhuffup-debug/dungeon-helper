/**
 * The arcs in the session wrap-up (when the module keeps arcs): the seeded
 * clues the crew found this session, who noticed the crew on the job (faction
 * heat), and the job's NPCs to keep as contacts.
 */
import { cluesFor, markClueFound, seededClues, type CampaignMaps, type Id } from "@campaign-forge/core";
import { clueKindLabel } from "@campaign-forge/module-sdk";
import { useMemo, useState } from "react";
import { Badge, Button, Card, pushToast } from "../../components/ui";
import { arcsDefOf, recentJobs } from "../../state/arcActions";
import { useCampaign, useList, useMeta, useRecord } from "../../state/hooks";
import { JobContacts, WhoNoticed } from "./ArcEntityPanel";
import "./arcs.css";

export function ArcsWrapUp({ sessionId }: { sessionId: Id }) {
  const ctx = useCampaign();
  const meta = useMeta();
  const def = arcsDefOf(ctx.module, meta.mode);
  const session = useRecord("sessions", sessionId);
  const arcs = useList("arcs");
  const entities = useList("entities");
  const relationships = useList("relationships");
  const maps = useMemo<Pick<CampaignMaps, "arcs" | "entities" | "relationships">>(
    () => ({ arcs: Object.fromEntries(arcs.map((t) => [t.id, t])), entities: Object.fromEntries(entities.map((e) => [e.id, e])), relationships: Object.fromEntries(relationships.map((r) => [r.id, r])) }),
    [arcs, entities, relationships],
  );
  const jobs = useMemo(() => recentJobs(ctx), [ctx, entities]); // eslint-disable-line react-hooks/exhaustive-deps
  const [jobId, setJobId] = useState<string>(() => jobs[0]?.id ?? "");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  if (!def) return null;
  const seeded = seededClues(maps);
  const foundHere = cluesFor(maps, sessionId).filter((x) => x.clue.found?.session === sessionId);
  const markFound = () => {
    for (const key of picked) {
      const [thread, clue] = key.split("/");
      const x = seeded.find((s) => s.thread.id === thread && s.clue.id === clue);
      if (!thread || !clue || !x) continue;
      markClueFound(ctx.store, thread, clue, { session: sessionId, via: "wrap-up", ...(x.clue.seeded?.job ? { job: x.clue.seeded.job } : {}), ...(x.clue.seeded?.entity ? { entity: x.clue.seeded.entity } : {}) });
    }
    pushToast(`Marked ${picked.size} clue${picked.size === 1 ? "" : "s"} found in Session ${session?.number ?? ""}.`, { tone: "success" });
    setPicked(new Set());
  };
  return (
    <Card title={def.label ?? "Arcs"} subtitle="Clues found, who noticed the crew, contacts to keep. GM only; found clues and contacts reach the players' crew notes." data-testid="wrapup-arcs">
      <div className="app-stack">
        <div>
          <h4 className="offer-card__label">Clues the crew found this session</h4>
          {seeded.length === 0 && foundHere.length === 0 && <p className="cf-muted app-small">No clue is seeded in a job right now.</p>}
          <ul className="arc-panel__list">
            {foundHere.map(({ thread, clue }) => (
              <li key={clue.id} className="arc-panel__row app-small">
                <Badge tone="success">found</Badge> {thread.title}: {clue.text}
              </li>
            ))}
            {seeded.map(({ thread, clue }) => {
              const key = `${thread.id}/${clue.id}`;
              const job = clue.seeded?.job ? maps.entities[clue.seeded.job]?.name : undefined;
              return (
                <li key={key} className="arc-panel__row">
                  <label className="app-toggle">
                    <input
                      type="checkbox"
                      className="cf-checkbox"
                      checked={picked.has(key)}
                      onChange={(e) =>
                        setPicked((p) => {
                          const n = new Set(p);
                          if (e.target.checked) n.add(key);
                          else n.delete(key);
                          return n;
                        })
                      }
                      data-testid="wrapup-arc-clue"
                    />
                    <Badge tone="accent">{clueKindLabel(def, clue.kind)}</Badge> {clue.text}
                  </label>
                  <span className="cf-muted app-small">
                    {thread.title}
                    {job ? ` · in ${job}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
          {seeded.length > 0 && (
            <Button size="sm" disabled={picked.size === 0} onClick={markFound} data-testid="wrapup-arc-found">
              Mark found in Session {session?.number}
            </Button>
          )}
        </div>
        {jobs.length > 0 && (
          <>
            <label className="app-row">
              <span className="cf-muted">This job</span>
              <select className="cf-select arc-select-sm" aria-label="This job" value={jobId} onChange={(e) => setJobId(e.target.value)} data-testid="wrapup-arc-job">
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.name}
                  </option>
                ))}
              </select>
            </label>
            {jobId && <WhoNoticed jobId={jobId} def={def} maps={maps} />}
            {jobId && <JobContacts jobId={jobId} maps={maps} />}
          </>
        )}
      </div>
    </Card>
  );
}
