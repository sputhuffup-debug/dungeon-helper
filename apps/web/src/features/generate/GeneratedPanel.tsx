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
  // a run names its generator: a procedure, or a site map generator; never its id
  const generatorName = procedure?.name ?? ctx.module.module.mapGenerators?.find((g) => g.id === run.procedure)?.name ?? "A generator";
  const moduleName = run.moduleId === ctx.module.manifest.id ? ctx.module.manifest.name : run.moduleId;
  const tableName = (id: string) => ctx.module.table(id)?.name;
  const edited = run.editedFields.filter((e) => e.entity === entity.id).map((e) => e.path);
  const siblings = run.produced.filter((id) => id !== entity.id).map((id) => ctx.store.get("entities", id)).filter((e): e is Entity => !!e);
  return (
    <Card
      title={
        <span className="app-row">
          Generated <ProvenanceBadge kind="rolled" label="rolled" rolls={run.rolls} detail={`${generatorName}, seed ${run.seed}`} tableName={tableName} />
        </span>
      }
      subtitle={
        <>
          {generatorName} <PageRef page={procedure?.page} /> · seed <span className="cf-mono">{run.seed}</span> · {formatDateTime(run.created)} · {moduleName} {run.moduleVersion}
          {run.supplements && run.supplements.length > 0 ? ` + ${run.supplements.map((s) => `${s.id} ${s.version}`).join(", ")}` : ""}
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
        {(Object.keys(run.stepSeeds ?? {}).length > 0 || Object.keys(run.stepDice ?? {}).length > 0 || Object.keys(run.pinned ?? {}).length > 0 || edited.length > 0) && (
          <div className="app-row">
            {Object.entries(run.stepDice ?? {}).map(([s, faces]) => (
              <Badge key={`d-${s}`} tone="accent" title={`Rolled at the table: ${faces.join(" ")}`}>
                entered {s}
              </Badge>
            ))}
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
            <RollRecordList rolls={run.rolls} tableName={tableName} />
          </details>
        ) : (
          <p className="cf-muted">No table rolls (computed steps only).</p>
        )}
        <ChainButtons run={run} />
      </div>
    </Card>
  );
}
