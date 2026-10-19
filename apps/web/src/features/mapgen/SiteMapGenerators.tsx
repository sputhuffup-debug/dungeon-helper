/** The Generate page's "Site maps" section: the module's map generators and recently generated maps. */
import type { SiteMap } from "@campaign-forge/core";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Badge, PageRef } from "../../components/ui";
import { relativeTime } from "../../lib/format";
import { useCampaign, useList, useMeta } from "../../state/hooks";
import { checkSummary, checkSummaryLine, mapGeneratorsFor } from "../../state/mapgenActions";

const generatedOnly = (m: SiteMap) => !!m.layout;

export function SiteMapGenerators() {
  const ctx = useCampaign();
  const meta = useMeta();
  const campaignId = ctx.campaignId;
  const generators = mapGeneratorsFor(ctx.module, meta.mode);
  const maps = useList("maps", generatedOnly);
  const recent = useMemo(() => [...maps].sort((a, b) => (a.updated < b.updated ? 1 : -1)).slice(0, 6), [maps]);
  if (generators.length === 0) return null;
  return (
    <section className="app-section" aria-label="Site maps" data-testid="site-map-generators">
      <h2 className="app-subtitle">Site maps</h2>
      <ul className="app-cards">
        {generators.map((g) => (
          <li key={g.id}>
            <Link to="/c/$campaignId/maps/new" params={{ campaignId }} search={{ generator: g.id }} className="prep-proc-card" data-testid={`map-generator-${g.id}`}>
              <span className="prep-proc-card__head">
                <strong>Generate a site map: {g.name}</strong>
                <PageRef page={g.page} />
              </span>
              {g.description && <span className="cf-muted">{g.description}</span>}
              <span className="app-row">
                <Badge>{g.stages.length} stages</Badge>
                {g.inputsFromAdventure && <Badge tone="accent">from adventure</Badge>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {recent.length > 0 && (
        <ul className="app-list">
          {recent.map((m) => (
            <li key={m.id} className="app-list__row">
              <Link to="/c/$campaignId/maps/$mapId" params={{ campaignId, mapId: m.id }} className="app-link-strong">
                {m.name}
              </Link>
              <span className="cf-muted">{checkSummaryLine(checkSummary(m.layout))}</span>
              {m.generator && <span className="cf-mono cf-muted">{m.generator.seed}</span>}
              <span className="cf-muted">{relativeTime(m.updated)}</span>
              <Link to="/c/$campaignId/maps/new" params={{ campaignId }} search={{ map: m.id }} className="cf-btn cf-btn--sm cf-btn--ghost app-list__end">
                Re-generate
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
