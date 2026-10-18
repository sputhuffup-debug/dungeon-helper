/** "Generated" panel on an entity page: the run's rolls, edits, a link back to the workbench and chained procedures. */
import type { Entity } from "@campaign-forge/core";
import { Link } from "@tanstack/react-router";
import { Badge, Card, PageRef, ProvenanceBadge, RollRecordList } from "../../components/ui";
import { formatDateTime } from "../../lib/format";
import { useCampaign, useRecord } from "../../state/hooks";
import { ChainButtons } from "./ChainButtons";

export function GeneratedPanel({ entity }: { entity: Entity }) {
  const ctx = useCampaign();
  const run = useRecord("generatorRuns", entity.provenance?.generatorRun);
  if (!run) return null;
  const procedure = ctx.module.procedure(run.procedure);
  const edited = run.editedFields.filter((e) => e.entity === entity.id).map((e) => e.path);
  const siblings = run.produced.filter((id) => id !== entity.id).map((id) => ctx.store.get("entities", id)).filter((e): e is Entity => !!e);
  return (
    <Card
      title={
        <span className="app-row">
          Generated <ProvenanceBadge kind="rolled" label="rolled" rolls={run.rolls} detail={`${procedure?.name ?? run.procedure}, seed ${run.seed}`} />
        </span>
      }
      subtitle={
        <>
          {procedure?.name ?? run.procedure} <PageRef page={procedure?.page} /> · seed <span className="cf-mono">{run.seed}</span> · {formatDateTime(run.created)} · module {run.moduleId} {run.moduleVersion}
        </>
      }
      actions={
        <Link
          to="/c/$campaignId/generate/$procedureId"
          params={{ campaignId: ctx.campaignId, procedureId: run.procedure }}
          search={{ run: run.id }}
          className="cf-btn cf-btn--sm"
          data-testid="reroll-in-workbench"
        >
          Re-roll in workbench
        </Link>
      }
      className="prep-generated"
      data-testid="generated-panel"
    >
      <div className="app-stack">
        {(Object.keys(run.stepSeeds ?? {}).length > 0 || Object.keys(run.pinned ?? {}).length > 0 || edited.length > 0) && (
          <div className="app-row">
            {Object.keys(run.stepSeeds ?? {}).map((s) => (
              <Badge key={`s-${s}`} tone="accent">
                re-rolled {s}
              </Badge>
            ))}
            {Object.keys(run.pinned ?? {}).map((s) => (
              <Badge key={`p-${s}`} tone="warning">
                pinned {s}
              </Badge>
            ))}
            {edited.map((p) => (
              <Badge key={`e-${p}`}>edited {p}</Badge>
            ))}
          </div>
        )}
        {siblings.length > 0 && (
          <p className="cf-muted">
            Same run:{" "}
            {siblings.map((s, i) => (
              <span key={s.id}>
                {i > 0 && ", "}
                <Link to="/c/$campaignId/entities/$entityId" params={{ campaignId: ctx.campaignId, entityId: s.id }} className="app-link-strong">
                  {s.name}
                </Link>
              </span>
            ))}
          </p>
        )}
        {run.rolls.length > 0 ? (
          <details className="prep-generated__rolls">
            <summary>
              {run.rolls.length} roll{run.rolls.length === 1 ? "" : "s"}
            </summary>
            <RollRecordList rolls={run.rolls} />
          </details>
        ) : (
          <p className="cf-muted">No table rolls (computed steps only).</p>
        )}
        <ChainButtons run={run} />
      </div>
    </Card>
  );
}
