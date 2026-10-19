/**
 * The guided builder's "Site map" card. Shown for any builder whose module
 * has a map generator that reads adventures: links the adventure's
 * generated maps with their check summary, or opens the map workbench with
 * the adventure so its locations, acts, puzzles and crew fill the brief.
 */
import type { Adventure, SiteMap } from "@campaign-forge/core";
import type { AdventureBuilderDef, LoadedModule, PlayModeId } from "@campaign-forge/module-sdk";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Badge, Card } from "../../components/ui";
import { useCampaign, useList, useMeta } from "../../state/hooks";
import { adventureMapGenerators, checkSummary, checkSummaryLine } from "../../state/mapgenActions";
import "./mapgen.css";

/**
 * Builder steps that show the card: the first step with a cast panel for a
 * location-kind role, and the step with the review panel. Empty when the
 * module has no map generator that reads adventures.
 */
export function siteMapSteps(builder: AdventureBuilderDef, module: Pick<LoadedModule, "module" | "tables" | "entityType">, mode?: PlayModeId): string[] {
  if (adventureMapGenerators(module, mode).length === 0) return [];
  const out: string[] = [];
  const locationRoles = new Set(builder.cast.filter((r) => module.entityType(r.entityType)?.kind === "location").map((r) => r.id));
  const locStep = builder.steps.find((s) => s.panels.some((p) => p.kind === "cast" && locationRoles.has(p.role)));
  if (locStep) out.push(locStep.id);
  const reviewStep = builder.steps.find((s) => s.panels.some((p) => p.kind === "review"));
  if (reviewStep && !out.includes(reviewStep.id)) out.push(reviewStep.id);
  if (out.length === 0) {
    const last = builder.steps[builder.steps.length - 1];
    if (last) out.push(last.id);
  }
  return out;
}

function checkTone(map: SiteMap): "danger" | "warning" | "success" | "muted" {
  const s = checkSummary(map.layout);
  if (s.total === 0) return "muted";
  return s.blockFailed ? "danger" : s.warnFailed ? "warning" : "success";
}

export function SiteMapCard({ adventure }: { adventure: Adventure }) {
  const ctx = useCampaign();
  const meta = useMeta();
  const campaignId = ctx.campaignId;
  const generators = adventureMapGenerators(ctx.module, meta.mode);
  const filter = useMemo(() => (m: SiteMap) => m.adventure === adventure.id && !!m.layout, [adventure.id]);
  const maps = useList("maps", filter);
  const sorted = useMemo(() => [...maps].sort((a, b) => (a.updated < b.updated ? 1 : -1)), [maps]);
  if (generators.length === 0) return null;
  const generator = generators.length === 1 ? generators[0]?.id : undefined;
  const search = generator ? { adventure: adventure.id, generator } : { adventure: adventure.id };
  return (
    <Card title="Site map" subtitle="A zone map of the adventure's site, built from its locations, acts, puzzles and crew." data-testid="site-map-card">
      <div className="app-stack">
        {sorted.length > 0 ? (
          <ul className="mapgen-card__maps">
            {sorted.map((m) => (
              <li key={m.id} className="mapgen-card__map" data-testid="site-map-entry">
                <Link to="/c/$campaignId/maps/$mapId" params={{ campaignId, mapId: m.id }} className="app-link-strong" data-testid="site-map-link">
                  {m.name}
                </Link>
                <Badge tone={checkTone(m)} data-testid="site-map-checks">
                  {checkSummaryLine(checkSummary(m.layout))}
                </Badge>
                {m.generator && <span className="cf-mono cf-muted app-small">{m.generator.seed}</span>}
                <Link to="/c/$campaignId/maps/new" params={{ campaignId }} search={{ map: m.id }} className="cf-btn cf-btn--sm cf-btn--ghost">
                  Re-generate
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="cf-muted">No site map yet. The generator reads this adventure for its key rooms, acts, puzzles and crew; you can edit the brief before generating.</p>
        )}
        <div className="app-row">
          <Link to="/c/$campaignId/maps/new" params={{ campaignId }} search={search} className={`cf-btn${sorted.length ? "" : " cf-btn--primary"}`} data-testid="generate-site-map">
            {sorted.length ? "Generate another site map" : "Generate a site map from this adventure"}
          </Link>
        </div>
      </div>
    </Card>
  );
}
