/** Workbench panels: the generator's stages with per-stage re-run, and the validation checklist. */
import type { MapCheck, MapGeneratorDef } from "@campaign-forge/module-sdk";
import { Badge, Button, PageRef } from "../../components/ui";
import { checkSummary, checkSummaryLine, isFailedCheck } from "../../state/mapgenActions";

export interface StageListProps {
  generator: Pick<MapGeneratorDef, "stages">;
  seed: string;
  stageSeeds: Record<string, string>;
  /** The stage re-run last; it and the stages after it are marked. */
  rerun?: string;
  disabled?: boolean;
  onRerun: (stageId: string) => void;
  onReset: (stageId: string) => void;
}

export function StageList({ generator, seed, stageSeeds, rerun, disabled, onRerun, onReset }: StageListProps) {
  const rerunIndex = rerun ? generator.stages.findIndex((s) => s.id === rerun) : -1;
  if (generator.stages.length === 0) return <p className="cf-muted">This generator has no stages to re-run alone.</p>;
  return (
    <ol className="mapgen-stages" data-testid="map-stages">
      {generator.stages.map((stage, i) => {
        const own = stageSeeds[stage.id];
        const state = rerunIndex < 0 ? undefined : i === rerunIndex ? "rerun" : i > rerunIndex ? "follows" : undefined;
        return (
          <li key={stage.id} className={`mapgen-stage${state ? ` is-${state}` : ""}`} data-testid={`stage-${stage.id}`} data-custom-seed={own ? "true" : "false"}>
            <span className="mapgen-stage__n">{i + 1}</span>
            <span className="mapgen-stage__body">
              <strong>{stage.title}</strong>
              <span className="cf-muted app-small">
                Seed <span className="cf-mono" data-testid={`stage-seed-${stage.id}`}>{own ?? seed}</span>
                {own ? " (re-run)" : " (main seed)"}
              </span>
            </span>
            {state === "rerun" && <Badge tone="accent">re-run</Badge>}
            {state === "follows" && <Badge>follows</Badge>}
            <span className="mapgen-stage__actions">
              {own && (
                <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onReset(stage.id)}>
                  Main seed
                </Button>
              )}
              <Button size="sm" disabled={disabled} onClick={() => onRerun(stage.id)} data-testid={`rerun-${stage.id}`} aria-label={`Re-run ${stage.title}`}>
                Re-run this stage
              </Button>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function ChecksPanel({ checks, failedCheck }: { checks: MapCheck[]; failedCheck?: string }) {
  const summary = checkSummary({ checks });
  const groups: Array<{ level: MapCheck["level"]; title: string; note: string }> = [
    { level: "block", title: "Block checks", note: "A failing block check makes the generator rebuild the map." },
    { level: "warn", title: "Warnings", note: "Advice for review; the map is kept." },
  ];
  return (
    <section className="app-stack" aria-label="Checks" data-testid="map-checks">
      <p className={`guided-review__summary${summary.blockFailed ? " is-bad" : summary.warnFailed ? " mapgen-summary--warn" : " is-ready"}`} data-testid="map-check-summary">
        {checkSummaryLine(summary)}
      </p>
      {checks.length === 0 && <p className="cf-muted">This generator reports no checks.</p>}
      {groups.map((g) => {
        const list = checks.filter((c) => c.level === g.level);
        if (list.length === 0) return null;
        return (
          <div key={g.level} className="app-stack" data-testid={`checks-${g.level}`}>
            <h3 className="prep-h4">
              {g.title} <span className="cf-muted app-small">{g.note}</span>
            </h3>
            <ul className="guided-review">
              {list.map((c) => {
                const failing = isFailedCheck(c, failedCheck);
                const level = c.ok ? "ok" : g.level === "block" ? "bad" : "warn";
                return (
                  <li
                    key={c.id}
                    className={`guided-review__item is-${level}${failing ? " mapgen-check--failing" : ""}`}
                    data-testid={failing ? "failed-check" : `check-${c.id}`}
                    data-ok={c.ok ? "true" : "false"}
                  >
                    <span className="guided-review__icon" aria-hidden="true">
                      {c.ok ? "✓" : level === "bad" ? "✕" : "!"}
                    </span>
                    <span className="guided-review__message">
                      {c.message}
                      {failing && <strong className="mapgen-check__why"> Kept failing on every attempt.</strong>}
                    </span>
                    <span className="cf-sr-only">{c.ok ? "(passes)" : "(fails)"}</span>
                    {c.page !== undefined && <PageRef page={c.page} />}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
