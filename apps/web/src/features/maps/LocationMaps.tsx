/** "Maps" section on a location's page: site maps placed at this location, and a button to add one. */
import { mapZoneCount, type Entity, type Id, type SiteMap } from "@campaign-forge/core";
import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { Badge, Button, Card, type SheetContextValue } from "../../components/ui";
import { createSiteMap } from "../../state/prepActions";
import { useCampaign, useList } from "../../state/hooks";

/**
 * The sheet's zone map field for a record: the map its field names, else a
 * saved map whose location is the record (a generated site map first), so
 * a job's site shows its site map even when the field was never set. "Open
 * map" goes to the map page (`newTab`: in another tab, e.g. from table mode).
 */
export function useZoneMapField(entityId: Id | undefined, opts: { newTab?: boolean } = {}): Pick<SheetContextValue, "resolveMap" | "onOpenMap"> {
  const ctx = useCampaign();
  const navigate = useNavigate();
  const maps = useList("maps");
  const resolveMap = useCallback(
    (id: string | undefined) => {
      const m = id ? maps.find((x) => x.id === id) : (maps.find((x) => x.location === entityId && !!x.layout) ?? maps.find((x) => x.location === entityId));
      return m ? { id: m.id, name: m.name } : undefined;
    },
    [maps, entityId],
  );
  const newTab = !!opts.newTab;
  const onOpenMap = useCallback(
    (id: string | undefined) => {
      if (!id) return;
      if (newTab) window.open(`${window.location.origin}/c/${ctx.campaignId}/maps/${id}`, "_blank", "noopener");
      else void navigate({ to: "/c/$campaignId/maps/$mapId", params: { campaignId: ctx.campaignId, mapId: id } });
    },
    [ctx.campaignId, navigate, newTab],
  );
  return { resolveMap, onOpenMap };
}

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
                {mapZoneCount(m)} zone{mapZoneCount(m) === 1 ? "" : "s"}
              </Badge>
              {!m.asset && !m.layout && <span className="cf-muted">no image</span>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
