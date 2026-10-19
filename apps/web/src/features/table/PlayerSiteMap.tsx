/**
 * The player screen's map: the player projection of the scene's generated
 * map with fog over every zone the GM has not revealed. Only the projection
 * (`playerLayout`, `playerLive`) reaches this component's props, so spawns,
 * clues, NPCs, GM notes, hidden borders, unknown locks, pings and hidden
 * tokens cannot be drawn here.
 */
import { liveOf, playerLayout, playerLive, type SiteMap } from "@campaign-forge/core";
import { useMemo } from "react";
import { MapLegend, SiteMapView } from "../../components/ui";
import { useMapGenerator, useMapPalette } from "../maps/siteMapFiles";
import "../maps/sitemap.css";

export function PlayerSiteMap({ map }: { map: SiteMap }) {
  const def = useMapGenerator(map);
  const palette = useMapPalette();
  const legend = def?.legend;
  const view = useMemo(() => {
    if (!map.layout || !map.live) return undefined;
    const live = liveOf(map);
    const layout = playerLayout(map.layout, { act: live.act, revealed: live.revealed, legend, live });
    return { layout, live: playerLive(live, layout, legend) };
  }, [map, legend]);
  if (!view) return null;
  return (
    <section className="app-player__map" aria-label="Map" data-testid="player-map">
      <SiteMapView layout={view.layout} view="player" legend={legend} fogged={view.layout.fogged} live={view.live} palette={palette} title={map.name} gridToggle={false} grid />
      {legend && legend.length > 0 && (
        <details className="app-player__legend">
          <summary>Legend</summary>
          <MapLegend legend={legend} view="player" palette={palette} />
        </details>
      )}
    </section>
  );
}
