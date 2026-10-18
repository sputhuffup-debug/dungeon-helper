/** "Maps" section on a location's page: site maps placed at this location, and a button to add one. */
import type { Entity, SiteMap } from "@campaign-forge/core";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { Badge, Button, Card } from "../../components/ui";
import { createSiteMap } from "../../state/prepActions";
import { useCampaign, useList } from "../../state/hooks";

export function LocationMaps({ entity }: { entity: Entity }) {
  const ctx = useCampaign();
  const navigate = useNavigate();
  const filter = useMemo(() => (m: SiteMap) => m.location === entity.id, [entity.id]);
  const maps = useList("maps", filter);
  const create = () => {
    const map = createSiteMap(ctx, { name: `${entity.name} map`, location: entity.id });
    void navigate({ to: "/c/$campaignId/maps/$mapId", params: { campaignId: ctx.campaignId, mapId: map.id } });
  };
  return (
    <Card
      title="Maps"
      actions={
        <Button size="sm" onClick={create} data-testid="location-new-map">
          + Map
        </Button>
      }
      data-testid="location-maps"
    >
      {maps.length === 0 ? (
        <p className="cf-muted">No zone maps for this location yet.</p>
      ) : (
        <ul className="app-list">
          {maps.map((m) => (
            <li key={m.id} className="app-list__row">
              <Link to="/c/$campaignId/maps/$mapId" params={{ campaignId: ctx.campaignId, mapId: m.id }} className="app-link-strong">
                {m.name}
              </Link>
              <Badge>
                {m.zones.length} zone{m.zones.length === 1 ? "" : "s"}
              </Badge>
              {!m.asset && <span className="cf-muted">no image</span>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
