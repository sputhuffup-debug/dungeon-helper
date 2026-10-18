import { useState } from "react";
import type { MapZone, MapZoneBorder } from "@campaign-forge/core";
import { Badge } from "../primitives/Badge";
import { Button, IconButton } from "../primitives/Button";
import { cx, isRecord, newId } from "../sheet/paths";
import { TrackerFrame, TrackerLog } from "./TrackerFrame";
import { nowIso, stateRecord, type TrackerProps } from "./types";

export interface HiddenNpc {
  id: string;
  name: string;
  zone: string;
  active: boolean;
  /** Zone the GM chose for the next stretch. */
  nextZone?: string;
}

export interface StealthState {
  npcs: HiddenNpc[];
  simplified: boolean;
  zones?: Array<{ id: string; name: string }>;
  log?: Array<{ at: string; text: string }>;
}

export function stealthState(state: unknown): StealthState {
  const s = stateRecord(state);
  const npcs = (Array.isArray(s.npcs) ? s.npcs : []).filter(isRecord).map((n) => ({
    id: String(n.id ?? newId("npc")),
    name: String(n.name ?? "?"),
    zone: String(n.zone ?? ""),
    active: n.active !== false,
    nextZone: typeof n.nextZone === "string" ? n.nextZone : undefined,
  }));
  const zones = Array.isArray(s.zones) ? s.zones.filter(isRecord).map((z) => ({ id: String(z.id), name: String(z.name ?? z.id) })) : undefined;
  const log = Array.isArray(s.log) ? s.log.filter(isRecord).map((l) => ({ at: String(l.at ?? ""), text: String(l.text ?? "") })) : [];
  return { npcs, simplified: s.simplified === true, zones, log };
}

function adjacent(zoneId: string, zones: Array<{ id: string; name: string }>, borders: MapZoneBorder[] | undefined): Array<{ id: string; name: string }> {
  if (!borders || borders.length === 0) return zones.filter((z) => z.id !== zoneId);
  const ids = new Set<string>();
  for (const b of borders) {
    if (b.kind === "blocked") continue;
    if (b.from === zoneId) ids.add(b.to);
    if (b.to === zoneId) ids.add(b.from);
  }
  return zones.filter((z) => ids.has(z.id));
}

/** Hidden NPC positions per zone; active ones move each stretch to a zone the GM picks. */
export function StealthTracker({ def, state, onChange, zones: zoneProp, borders, onLog, readonly, className }: TrackerProps) {
  const st = stealthState(state);
  const zones: Array<{ id: string; name: string }> = zoneProp ? zoneProp.map((z: MapZone) => ({ id: z.id, name: z.name })) : st.zones ?? [];
  const [name, setName] = useState("");
  const [zone, setZone] = useState("");
  const [zoneName, setZoneName] = useState("");
  const zoneLabel = (id: string) => zones.find((z) => z.id === id)?.name ?? id ?? "?";
  const commit = (patch: Partial<StealthState>, logText?: string) => {
    const log = logText ? [...(st.log ?? []), { at: nowIso(), text: logText }] : st.log;
    onChange({ ...stateRecord(state), ...st, ...patch, log });
    if (logText) onLog?.(logText);
  };

  const addNpc = () => {
    const n = name.trim();
    if (!n) return;
    const z = zone || zones[0]?.id || "";
    commit({ npcs: [...st.npcs, { id: newId("npc"), name: n, zone: z, active: true }] }, `${n} hidden in ${zoneLabel(z)}`);
    setName("");
  };
  const addZone = () => {
    const n = zoneName.trim();
    if (!n) return;
    commit({ zones: [...(st.zones ?? []), { id: newId("zone"), name: n }] });
    setZoneName("");
  };
  const update = (id: string, patch: Partial<HiddenNpc>) => commit({ npcs: st.npcs.map((n) => (n.id === id ? { ...n, ...patch } : n)) });
  const remove = (id: string) => commit({ npcs: st.npcs.filter((n) => n.id !== id) });
  const advance = () => {
    const moved: string[] = [];
    const npcs = st.npcs.map((n) => {
      if (!n.active || !n.nextZone || n.nextZone === n.zone) return n;
      moved.push(`${n.name} → ${zoneLabel(n.nextZone)}`);
      return { ...n, zone: n.nextZone, nextZone: undefined };
    });
    commit({ npcs }, moved.length ? `Stretch passes: ${moved.join(", ")}` : "Stretch passes: nobody moved");
  };

  return (
    <TrackerFrame
      def={def}
      className={className}
      actions={
        <>
          <label className="cf-check">
            <input className="cf-checkbox" type="checkbox" checked={st.simplified} disabled={readonly} onChange={(e) => commit({ simplified: e.target.checked })} />
            Simplified
          </label>
          {!readonly && (
            <Button size="sm" variant="primary" onClick={advance} disabled={st.npcs.length === 0}>
              Advance stretch
            </Button>
          )}
        </>
      }
    >
      {st.npcs.length === 0 && <span className="cf-muted">No hidden NPCs</span>}
      {st.npcs.map((n) => (
        <div key={n.id} className={cx("cf-tracker__row", n.active && "cf-tracker__row--warn")} data-npc={n.id}>
          <span className="cf-tracker__name">{n.name}</span>
          <Badge tone={n.active ? "warning" : "muted"}>{n.active ? "active" : "passive"}</Badge>
          {!st.simplified && <span data-testid={`npc-zone-${n.id}`}>in {zoneLabel(n.zone)}</span>}
          {!readonly && (
            <>
              <Button size="sm" variant="ghost" onClick={() => update(n.id, { active: !n.active })} aria-label={`Toggle ${n.name} active`}>
                {n.active ? "Set passive" : "Set active"}
              </Button>
              {!st.simplified && zones.length > 0 && (
                <select className="cf-select" style={{ width: "auto" }} aria-label={`${n.name} next zone`} value={n.nextZone ?? ""} onChange={(e) => update(n.id, { nextZone: e.target.value || undefined })} disabled={!n.active}>
                  <option value="">Stay</option>
                  {adjacent(n.zone, zones, borders).map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
                </select>
              )}
              <IconButton size="sm" variant="ghost" label={`Remove ${n.name}`} icon="×" onClick={() => remove(n.id)} />
            </>
          )}
        </div>
      ))}
      {!readonly && (
        <div className="cf-tracker__add">
          <input className="cf-input" aria-label="Hidden NPC name" placeholder="Hidden NPC" value={name} onChange={(e) => setName(e.target.value)} />
          {zones.length > 0 && (
            <select className="cf-select" aria-label="Starting zone" value={zone} onChange={(e) => setZone(e.target.value)}>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          )}
          <Button size="sm" onClick={addNpc} disabled={!name.trim()}>
            Add
          </Button>
        </div>
      )}
      {!readonly && !zoneProp && (
        <div className="cf-tracker__add">
          <input className="cf-input" aria-label="New zone name" placeholder="Add a zone" value={zoneName} onChange={(e) => setZoneName(e.target.value)} />
          <Button size="sm" variant="ghost" onClick={addZone} disabled={!zoneName.trim()}>
            Add zone
          </Button>
        </div>
      )}
      <TrackerLog entries={st.log ?? []} />
    </TrackerFrame>
  );
}
