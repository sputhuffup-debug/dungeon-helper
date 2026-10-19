/**
 * Table mode on a generated site map: the GM map with live state. Pick the
 * act; reveal zones to the players (fog); lock, seal, break or expose a
 * border; mark zone flags from the legend (e.g. burning); place and move
 * tokens; drop tracker pings (cleared when the clock passes a stretch); and
 * read the range between two zones. Distances follow every change.
 */
import {
  addPing,
  clearPings,
  liveOf,
  moveToken,
  placeToken,
  removeToken,
  revealZones,
  setAct,
  setBorderState,
  setZoneFlag,
  startLive,
  updateToken,
  zoneNumbers,
  type Entity,
  type Id,
  type Scene,
  type SiteMap,
} from "@campaign-forge/core";
import type { MapGeneratorDef, MapLegendEntry, MapZoneData } from "@campaign-forge/module-sdk";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Card, MapLegend, SiteMapView } from "../../components/ui";
import { useCampaign } from "../../state/hooks";
import { maxActOf, useMapGenerator, useMapPalette } from "../maps/siteMapFiles";
import "../maps/sitemap.css";
import { useSessionTrackerState } from "./hooks";
import { clearPingsOnStretch, clockStamp, ensureLive, measureRange, sceneActNumber, unrevealed, zoneExits, borderControls, type LiveTool } from "./siteMapLive";
import { useModeTrackers } from "./TrackersPanel";

const TOOLS: Array<{ id: LiveTool; label: string; hint: string }> = [
  { id: "select", label: "Select", hint: "Click a zone to see and change it." },
  { id: "reveal", label: "Reveal", hint: "Click a zone to show it to the players, again to hide it." },
  { id: "measure", label: "Range", hint: "Click two zones to read the range between them." },
  { id: "ping", label: "Ping", hint: "Click a zone to drop a tracker ping." },
];

function zoneName(z: MapZoneData | undefined, n: number | undefined): string {
  if (!z) return "?";
  const name = z.name ?? (z.layer === "duct" ? "Duct" : z.kind.replace(/-/g, " "));
  return n !== undefined ? `${n} ${name}` : name;
}

function flagTarget(e: MapLegendEntry): { flag: string; value: unknown } | undefined {
  return "flag" in e.target ? { flag: e.target.flag, value: e.target.value ?? true } : undefined;
}

export function LiveSiteMap({ sessionId, map, scene, participants }: { sessionId: Id; map: SiteMap; scene: Scene | undefined; participants: Entity[] }) {
  const ctx = useCampaign();
  const store = ctx.store;
  const def = useMapGenerator(map);
  const palette = useMapPalette();
  const layout = map.layout!;
  const live = liveOf(map);
  const legend = def?.legend ?? [];
  const numbers = useMemo(() => zoneNumbers(layout), [layout]);
  const byId = useMemo(() => new Map(layout.zones.map((z) => [z.id, z])), [layout]);
  const label = (id: string) => zoneName(byId.get(id), numbers.get(id));
  const maxAct = maxActOf(layout);

  // start live play the first time the map is on the table
  const actOfScene = sceneActNumber(store, scene);
  useEffect(() => {
    ensureLive(store, map, actOfScene);
  }, [store, map, actOfScene]);

  // tracker pings go stale when the clock passes a stretch
  const clock = useModeTrackers().find((t) => t.kind === "clock");
  const ts = useSessionTrackerState(sessionId);
  const stamp = clock ? clockStamp(clock.config, ts?.state[clock.id]) : "";
  const lastStamp = useRef<string | undefined>(undefined);
  useEffect(() => {
    lastStamp.current = clearPingsOnStretch(store, map, lastStamp.current, stamp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp]);

  const [tool, setTool] = useState<LiveTool>("select");
  const [selected, setSelected] = useState<string | undefined>();
  const [range, setRange] = useState<{ from?: string | undefined; to?: string | undefined }>({});
  const reading = useMemo(() => (range.from && range.to ? measureRange(layout, live, def, range.from, range.to) : undefined), [layout, live, def, range]);
  const fogged = useMemo(() => unrevealed(layout, live), [layout, live]);

  const onZone = (zone: string) => {
    switch (tool) {
      case "select":
        setSelected((s) => (s === zone ? undefined : zone));
        break;
      case "reveal":
        revealZones(store, map.id, [zone], !live.revealed.includes(zone));
        setSelected(zone);
        break;
      case "measure":
        setRange((r) => (!r.from || r.to ? { from: zone } : { from: r.from, to: zone }));
        break;
      case "ping":
        addPing(store, map.id, zone);
        break;
    }
  };

  const flagEntries = legend.filter((e) => "flag" in e.target);
  const zone = selected ? byId.get(selected) : undefined;
  const marks = [...(selected ? [selected] : []), ...(tool === "measure" ? [range.from, range.to].filter((x): x is string => !!x) : [])];

  return (
    <Card
      title="Map"
      subtitle={map.name}
      className="app-table__map app-livemap"
      data-testid="live-map"
      actions={
        <label className="app-row">
          <span className="cf-muted">Act</span>
          <select className="cf-select" aria-label="Act" value={live.act} onChange={(e) => setAct(store, map.id, Number(e.target.value))} data-testid="live-act">
            {Array.from({ length: maxAct }, (_, i) => i + 1).map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
      }
    >
      <div className="app-row app-livemap__tools" role="group" aria-label="Map tool">
        {TOOLS.map((t) => (
          <Button key={t.id} size="sm" variant={tool === t.id ? "primary" : "ghost"} aria-pressed={tool === t.id} onClick={() => setTool(t.id)} title={t.hint}>
            {t.label}
          </Button>
        ))}
        <span className="app-grow cf-muted">{TOOLS.find((t) => t.id === tool)?.hint}</span>
        <Badge>{live.revealed.length} revealed</Badge>
        {live.pings.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => clearPings(store, map.id)}>
            Clear {live.pings.length} ping{live.pings.length === 1 ? "" : "s"}
          </Button>
        )}
      </div>
      <SiteMapView
        layout={layout}
        view="gm"
        legend={legend}
        live={live}
        act={live.act}
        fogged={fogged}
        selected={marks}
        path={tool === "measure" ? reading?.path : undefined}
        onSelectZone={(z) => onZone(z)}
        palette={palette}
        title={map.name}
        className="app-livemap__map"
      />

      <RangePanel layout={layout} label={label} range={range} setRange={setRange} reading={reading} />

      {zone && (
        <ZonePanel
          key={zone.id}
          map={map}
          zone={zone}
          def={def}
          label={label}
          flagEntries={flagEntries}
          participants={participants}
          onClose={() => setSelected(undefined)}
        />
      )}
      {!zone && <p className="app-note">Select a zone to change its doors, flags and tokens.</p>}
      <TokenList map={map} label={label} />
      <details className="app-livemap__legend">
        <summary>Legend</summary>
        <MapLegend legend={legend} view="gm" palette={palette} />
      </details>
      <div className="app-row">
        <Button size="sm" variant="ghost" onClick={() => revealZones(store, map.id, layout.zones.map((z) => z.id))}>
          Reveal all
        </Button>
        <Button size="sm" variant="ghost" onClick={() => startLive(store, map.id, live.act)}>
          Reset the map
        </Button>
      </div>
    </Card>
  );
}

interface ZonePanelProps {
  map: SiteMap;
  zone: MapZoneData;
  def: MapGeneratorDef | undefined;
  label: (id: string) => string;
  flagEntries: MapLegendEntry[];
  participants: Entity[];
  onClose: () => void;
}

function ZonePanel({ map, zone, def, label, flagEntries, participants, onClose }: ZonePanelProps) {
  const { store } = useCampaign();
  const live = liveOf(map);
  const layout = map.layout!;
  const legend = def?.legend ?? [];
  const revealed = live.revealed.includes(zone.id);
  const zoneFlags = live.zoneFlags[zone.id] ?? {};
  const exits = zoneExits(layout, live, def, zone.id);
  const [tokenLabel, setTokenLabel] = useState("");
  const [gmOnly, setGmOnly] = useState(true);
  const here = live.tokens.filter((t) => t.zone === zone.id);
  const elsewhere = live.tokens.filter((t) => t.zone !== zone.id);
  const unplaced = participants.filter((p) => !live.tokens.some((t) => t.entity === p.id));
  return (
    <section className="app-livemap__zone" aria-label={`Zone ${label(zone.id)}`} data-testid="live-zone">
      <header className="app-row">
        <strong className="app-grow">{label(zone.id)}</strong>
        <Badge tone={revealed ? "success" : undefined}>{revealed ? "players see it" : "fogged"}</Badge>
        <Button size="sm" variant={revealed ? "ghost" : "primary"} onClick={() => revealZones(store, map.id, [zone.id], !revealed)} data-testid="reveal-zone">
          {revealed ? "Hide from players" : "Reveal to players"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => addPing(store, map.id, zone.id)}>
          Ping here
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close zone">
          ×
        </Button>
      </header>
      {flagEntries.length > 0 && (
        <div className="app-row" role="group" aria-label="Zone flags">
          {flagEntries.map((e, i) => {
            const t = flagTarget(e)!;
            const fromLayout = zone.flags?.[t.flag] === t.value;
            const on = zoneFlags[t.flag] === t.value || (fromLayout && zoneFlags[t.flag] === undefined);
            return (
              <label key={i} className="app-row app-livemap__flag" title={e.rule}>
                <input
                  type="checkbox"
                  className="cf-checkbox"
                  checked={on}
                  disabled={fromLayout && zoneFlags[t.flag] === undefined}
                  onChange={(ev) => setZoneFlag(store, map.id, zone.id, t.flag, ev.target.checked ? t.value : undefined)}
                />
                {e.label}
                {fromLayout && <span className="cf-muted">(map)</span>}
              </label>
            );
          })}
        </div>
      )}
      {exits.length > 0 && (
        <ul className="app-list app-livemap__exits" aria-label="Exits">
          {exits.map(({ border: b, other, override, state }) => {
            const can = borderControls(b);
            const kind = legend.find((e) => "border" in e.target && e.target.border === b.kind)?.label ?? b.kind;
            return (
              <li key={b.id} className="app-list__row" data-exit={b.id}>
                <span className="app-grow">
                  {label(other)} <span className="cf-muted">({kind})</span>
                </span>
                {state.locked && <Badge tone="danger">locked</Badge>}
                {state.sealed && <Badge tone="danger">sealed</Badge>}
                {state.destroyed && <Badge tone="warning">broken</Badge>}
                {b.hidden && <Badge tone={override.known ? "success" : "warning"}>{override.known ? "found" : "hidden"}</Badge>}
                {!state.passable && !state.locked && !state.sealed && <Badge>blocked</Badge>}
                {can.lock && !state.destroyed && (
                  <Button size="sm" variant="ghost" onClick={() => setBorderState(store, map.id, b.id, state.locked ? { locked: false, open: undefined } : { locked: true, open: undefined })} aria-label={`${state.locked ? "Unlock" : "Lock"} ${kind} to ${label(other)}`}>
                    {state.locked ? "Unlock" : "Lock"}
                  </Button>
                )}
                {can.seal && !state.destroyed && (
                  <Button size="sm" variant="ghost" onClick={() => setBorderState(store, map.id, b.id, { sealed: !state.sealed })} aria-label={`${state.sealed ? "Unseal" : "Seal"} ${kind} to ${label(other)}`}>
                    {state.sealed ? "Unseal" : "Seal"}
                  </Button>
                )}
                {can.destroy && (
                  <Button size="sm" variant="ghost" onClick={() => setBorderState(store, map.id, b.id, { destroyed: state.destroyed ? undefined : true })} aria-label={`${state.destroyed ? "Repair" : "Break"} ${kind} to ${label(other)}`}>
                    {state.destroyed ? "Repair" : "Break"}
                  </Button>
                )}
                {can.known && (
                  <label className="app-row" title="The players know about it: a found access point, or a lock they have tried.">
                    <input type="checkbox" className="cf-checkbox" checked={!!override.known} onChange={(ev) => setBorderState(store, map.id, b.id, { known: ev.target.checked ? true : undefined })} />
                    known
                  </label>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="app-stack">
        {here.length > 0 && (
          <ul className="app-list" aria-label="Tokens here">
            {here.map((t) => (
              <li key={t.id} className="app-list__row">
                <span className="app-grow">{t.label}</span>
                {t.gmOnly && <Badge>hidden</Badge>}
                <Button size="sm" variant="ghost" onClick={() => removeToken(store, map.id, t.id)}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="app-row" role="group" aria-label="Place a token">
          {elsewhere.length > 0 && (
            <select
              className="cf-select"
              aria-label="Move a token here"
              value=""
              onChange={(e) => {
                if (e.target.value) moveToken(store, map.id, e.target.value, zone.id);
              }}
            >
              <option value="">Move a token here…</option>
              {elsewhere.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} (in {label(t.zone)})
                </option>
              ))}
            </select>
          )}
          {unplaced.length > 0 && (
            <select
              className="cf-select"
              aria-label="Place a participant here"
              value=""
              onChange={(e) => {
                const p = participants.find((x) => x.id === e.target.value);
                if (p) placeToken(store, map.id, { label: p.name, zone: zone.id, gmOnly: false, entity: p.id });
              }}
            >
              <option value="">Place a participant…</option>
              {unplaced.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <input className="cf-input" aria-label="New token name" placeholder="New token" value={tokenLabel} onChange={(e) => setTokenLabel(e.target.value)} />
          <label className="app-row">
            <input type="checkbox" className="cf-checkbox" checked={gmOnly} onChange={(e) => setGmOnly(e.target.checked)} />
            hidden
          </label>
          <Button
            size="sm"
            disabled={!tokenLabel.trim()}
            onClick={() => {
              placeToken(store, map.id, { label: tokenLabel.trim(), zone: zone.id, gmOnly });
              setTokenLabel("");
            }}
          >
            Place
          </Button>
        </div>
      </div>
    </section>
  );
}

function RangePanel({
  layout,
  label,
  range,
  setRange,
  reading,
}: {
  layout: NonNullable<SiteMap["layout"]>;
  label: (id: string) => string;
  range: { from?: string | undefined; to?: string | undefined };
  setRange: (r: { from?: string | undefined; to?: string | undefined }) => void;
  reading: ReturnType<typeof measureRange> | undefined;
}) {
  const zones = layout.zones.filter((z) => z.kind !== "out-of-bounds");
  return (
    <div className="app-row app-livemap__range" role="group" aria-label="What range is that?">
      <span className="cf-muted">Range</span>
      <select className="cf-select" aria-label="Range from" value={range.from ?? ""} onChange={(e) => setRange({ from: e.target.value || undefined, to: range.to })}>
        <option value="">From…</option>
        {zones.map((z) => (
          <option key={z.id} value={z.id}>
            {label(z.id)}
          </option>
        ))}
      </select>
      <select className="cf-select" aria-label="Range to" value={range.to ?? ""} onChange={(e) => setRange({ from: range.from, to: e.target.value || undefined })}>
        <option value="">To…</option>
        {zones.map((z) => (
          <option key={z.id} value={z.id}>
            {label(z.id)}
          </option>
        ))}
      </select>
      <output className="app-livemap__reading" data-testid="range-reading" aria-live="polite">
        {reading
          ? reading.distance === undefined
            ? "No passable route"
            : `${reading.distance} zone${reading.distance === 1 ? "" : "s"}${reading.band ? ` · ${reading.band.label}` : ""}${reading.path && reading.path.length > 2 ? ` · via ${reading.path.slice(1, -1).map(label).join(", ")}` : ""}`
          : ""}
      </output>
    </div>
  );
}

function TokenList({ map, label }: { map: SiteMap; label: (id: string) => string }) {
  const { store } = useCampaign();
  const live = liveOf(map);
  if (live.tokens.length === 0) return null;
  return (
    <ul className="app-list app-livemap__tokens" aria-label="Tokens">
      {live.tokens.map((t) => (
        <li key={t.id} className="app-list__row">
          <span className="app-grow">
            {t.label} <span className="cf-muted">in {label(t.zone)}</span>
          </span>
          <label className="app-row" title="Hidden tokens stay off the player screen.">
            <input type="checkbox" className="cf-checkbox" checked={t.gmOnly} onChange={(e) => updateToken(store, map.id, t.id, { gmOnly: e.target.checked })} />
            hidden
          </label>
        </li>
      ))}
    </ul>
  );
}
