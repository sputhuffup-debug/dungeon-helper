/** The scene's zone map with participant tokens; positions live in the session's tracker state. */
import type { Entity, Id, Scene, SiteMap } from "@campaign-forge/core";
import { useMemo, useState } from "react";
import { Card, ZoneMapView, type MapToken } from "../../components/ui";
import { useAssetUrl, useCampaign, useList } from "../../state/hooks";
import { POSITIONS_STATE, setPosition } from "../../state/tableActions";
import { useSessionTrackerState } from "./hooks";

/** The scene's map: `scene.map`, else a map of the scene's location. */
export function useSceneMap(scene: Scene | undefined): SiteMap | undefined {
  const maps = useList("maps");
  return useMemo(() => {
    if (!scene) return undefined;
    return (scene.map ? maps.find((m) => m.id === scene.map) : undefined) ?? (scene.location ? maps.find((m) => m.location === scene.location) : undefined);
  }, [maps, scene]);
}

export function SceneMap({ sessionId, map, participants }: { sessionId: Id; map: SiteMap; participants: Entity[] }) {
  const ctx = useCampaign();
  const url = useAssetUrl(map.asset);
  const ts = useSessionTrackerState(sessionId);
  const positions = (ts?.state[POSITIONS_STATE] ?? {}) as Record<string, string>;
  const [zone, setZone] = useState<string | undefined>();
  const tokens: MapToken[] = participants.filter((p) => positions[p.id]).map((p) => ({ id: p.id, label: p.name, zone: positions[p.id]! }));
  const zoneName = (id: string | undefined) => map.zones.find((z) => z.id === id)?.name;

  return (
    <Card title="Map" subtitle={map.name} className="app-table__map">
      <ZoneMapView map={map} imageUrl={url} tokens={tokens} selectedZone={zone} onSelectZone={setZone} />
      {zone && <p className="app-note">Selected zone: {zoneName(zone)}. Use “Here” to move someone into it.</p>}
      <ul className="app-list" aria-label="Positions">
        {participants.map((p) => (
          <li key={p.id} className="app-list__row">
            <span className="app-grow">{p.name}</span>
            <select className="cf-select app-table__zone-select" aria-label={`${p.name} zone`} value={positions[p.id] ?? ""} onChange={(e) => setPosition(ctx, sessionId, p.id, e.target.value || undefined)}>
              <option value="">Not on the map</option>
              {map.zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                  {z.cluttered ? " (cluttered)" : ""}
                </option>
              ))}
            </select>
            {zone && (
              <button type="button" className="cf-btn cf-btn--sm" onClick={() => setPosition(ctx, sessionId, p.id, zone)}>
                Here
              </button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
