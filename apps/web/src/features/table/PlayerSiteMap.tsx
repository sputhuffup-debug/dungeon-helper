/**
 * The player screen's map: the player projection of the scene's generated
 * map with fog over every zone the GM has not revealed. Only the projection
 * (`playerLayout`, `playerLive`) reaches this component's props, so spawns,
 * clues, NPCs, GM notes, hidden borders, unknown locks, pings and hidden
 * tokens cannot be drawn here. A duct sheet appears once the GM reveals one
 * of its zones, fogged elsewhere; duct event rolls stay in the GM's table
 * mode and the session log, which this screen never reads. Of the live hunt
 * the players get the motion tracker readout (blips at a range band and a
 * direction, never a zone) and the threats the GM has revealed.
 */
import { liveOf, playerLayout, playerLive, type SiteMap } from "@campaign-forge/core";
import { useMemo } from "react";
import { MapLegend, SiteMapView } from "../../components/ui";
import { useMapGenerator, useMapPalette } from "../maps/siteMapFiles";
import "../maps/sitemap.css";
import { TrackerReadout } from "./TrackerReadout";

export function PlayerSiteMap({ map }: { map: SiteMap }) {
  const def = useMapGenerator(map);
  const palette = useMapPalette();
  const legend = def?.legend;
  const view = useMemo(() => {
    if (!map.layout || !map.live) return undefined;
    const live = liveOf(map);
    const layout = playerLayout(map.layout, { act: live.act, revealed: live.revealed, legend, live });
    const pLive = playerLive(live, layout, legend);
    // framed on what the crew has seen and where they stand, so tokens and labels are big enough to read across the table
    const shown = new Set(layout.zones.map((z) => z.id));
    const focus = [...new Set([...pLive.tokens.map((t) => t.zone), ...live.revealed])].filter((z) => shown.has(z));
    return { layout, live: pLive, focus };
  }, [map, legend]);
  if (!view) return null;
  return (
    <section className="app-player__map" aria-label="Map" data-testid="player-map">
      <SiteMapView layout={view.layout} view="player" legend={legend} fogged={view.layout.fogged} live={view.live} passable={def?.passable} palette={palette} title={map.name} gridToggle={false} grid focus={view.focus.length ? view.focus : undefined} followFocus />
      <TrackerReadout tracker={view.live.tracker} bands={def?.rangeBands} />
      {legend && legend.length > 0 && (
        <details className="app-player__legend">
          <summary>Legend</summary>
          <MapLegend legend={legend} view="player" palette={palette} />
        </details>
      )}
    </section>
  );
}
