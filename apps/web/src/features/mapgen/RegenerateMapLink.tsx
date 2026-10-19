/**
 * "Re-generate" for a saved generated map: opens the map workbench with the
 * map's stored generator, seed, brief and stage seeds. Renders nothing for
 * maps that were not generated. For the map page to drop in.
 */
import type { SiteMap } from "@campaign-forge/core";
import { Link } from "@tanstack/react-router";
import { useCampaign } from "../../state/hooks";

export function RegenerateMapLink({ map, className = "cf-btn cf-btn--sm", label = "Re-generate" }: { map: Pick<SiteMap, "id" | "generator">; className?: string; label?: string }) {
  const ctx = useCampaign();
  if (!map.generator) return null;
  return (
    <Link to="/c/$campaignId/maps/new" params={{ campaignId: ctx.campaignId }} search={{ map: map.id }} className={className} data-testid="regenerate-map" title={`Seed ${map.generator.seed}`}>
      {label}
    </Link>
  );
}
