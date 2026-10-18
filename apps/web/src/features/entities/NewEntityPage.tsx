/** `/entities/new?type=&preset=`: choose a type, optional subtype, a preset (or blank) and a name. */
import type { EntityPreset } from "@campaign-forge/module-sdk";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { EntityIcon } from "../../components/EntityIcon";
import { Badge, Button, Card, PageRef } from "../../components/ui";
import { humanize } from "../../lib/format";
import { createEntity, createEntityFromPreset } from "../../state/actions";
import { useCampaign, useMeta } from "../../state/hooks";

export function NewEntityPage() {
  const ctx = useCampaign();
  const meta = useMeta();
  const search = useSearch({ from: "/c/$campaignId/entities/new" });
  const navigate = useNavigate();
  const types = ctx.module.forMode(meta.mode).entityTypes;
  const initialPreset = search.preset ? ctx.module.preset(search.preset) : undefined;
  const [typeId, setTypeId] = useState(search.type ?? initialPreset?.entityType ?? types[0]?.id ?? "");
  const [subtype, setSubtype] = useState(search.subtype ?? initialPreset?.subtype ?? "");
  const [presetId, setPresetId] = useState(initialPreset?.id ?? "");
  const [name, setName] = useState(search.name ?? "");
  const [query, setQuery] = useState("");

  const def = ctx.module.entityType(typeId);
  const presets = useMemo(() => ctx.module.presetsFor(typeId), [ctx.module, typeId]);
  const preset = presetId ? ctx.module.preset(presetId) : undefined;

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = presets.filter((p) => (!subtype || !p.subtype || p.subtype === subtype) && (!q || p.name.toLowerCase().includes(q) || (p.summary ?? "").toLowerCase().includes(q) || (p.tags ?? []).some((t) => t.toLowerCase().includes(q))));
    const groups = new Map<string, EntityPreset[]>();
    for (const p of shown) {
      const key = p.subtype ? def?.subtypes?.find((s) => s.id === p.subtype)?.name ?? humanize(p.subtype) : groupTag(p) ?? "Presets";
      groups.set(key, [...(groups.get(key) ?? []), p]);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [presets, query, subtype, def]);

  const create = () => {
    if (!def) return;
    const entity = preset
      ? createEntityFromPreset(ctx, preset, { name: name.trim() || preset.name, subtype: subtype || preset.subtype })
      : createEntity(ctx, { type: def.id, name: name.trim() || `New ${def.name.toLowerCase()}`, subtype: subtype || undefined });
    void navigate({ to: "/c/$campaignId/entities/$entityId", params: { campaignId: ctx.campaignId, entityId: entity.id } });
  };

  return (
    <div className="app-page app-page--narrow">
      <h1 className="app-title">New {def?.name.toLowerCase() ?? "entity"}</h1>
      <form
        className="app-form"
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <div className="app-form__row">
          <label className="app-label">
            Type
            <select
              className="cf-select"
              value={typeId}
              onChange={(e) => {
                setTypeId(e.target.value);
                setSubtype("");
                setPresetId("");
              }}
              data-testid="entity-type"
            >
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          {def?.subtypes && def.subtypes.length > 0 && (
            <label className="app-label">
              Subtype
              <select className="cf-select" value={subtype} onChange={(e) => setSubtype(e.target.value)}>
                <option value="">None</option>
                {def.subtypes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <fieldset className="app-fieldset">
          <legend className="app-label">Start from</legend>
          <label className={`app-preset${presetId === "" ? " is-selected" : ""}`}>
            <input type="radio" name="preset" checked={presetId === ""} onChange={() => setPresetId("")} />
            <EntityIcon icon={def?.icon} kind={def?.kind} />
            <span>
              <strong>Blank</strong> <span className="cf-muted">schema defaults</span>
            </span>
          </label>
          {presets.length > 0 && (
            <>
              <input className="cf-input" type="search" placeholder={`Search ${presets.length} presets`} aria-label="Search presets" value={query} onChange={(e) => setQuery(e.target.value)} />
              <div className="app-presets" role="radiogroup" aria-label="Presets">
                {grouped.map(([group, list]) => (
                  <div key={group} className="app-presets__group">
                    <div className="app-presets__title">{group}</div>
                    {list.map((p) => (
                      <label key={p.id} className={`app-preset${presetId === p.id ? " is-selected" : ""}`}>
                        <input
                          type="radio"
                          name="preset"
                          value={p.id}
                          checked={presetId === p.id}
                          onChange={() => {
                            setPresetId(p.id);
                            if (p.subtype) setSubtype(p.subtype);
                          }}
                        />
                        <span className="app-preset__body">
                          <strong>{p.name}</strong>
                          {p.summary && <span className="cf-muted"> {p.summary}</span>}
                        </span>
                        <PageRef page={p.page} />
                        {p.unverified && <Badge tone="warning">unverified</Badge>}
                      </label>
                    ))}
                  </div>
                ))}
                {grouped.length === 0 && <p className="cf-muted">No preset matches.</p>}
              </div>
            </>
          )}
        </fieldset>

        <label className="app-label">
          Name
          <input className="cf-input" value={name} placeholder={preset?.name ?? `New ${def?.name.toLowerCase() ?? "entity"}`} onChange={(e) => setName(e.target.value)} data-testid="entity-name" />
        </label>
        {preset && (
          <Card title={preset.name} subtitle="Preset preview">
            <PresetFields preset={preset} />
          </Card>
        )}
        <div className="app-row">
          <Button variant="primary" type="submit" disabled={!def} data-testid="create-entity">
            Create {def?.name.toLowerCase() ?? "entity"}
          </Button>
          <Button variant="ghost" onClick={() => history.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

function groupTag(p: EntityPreset): string | undefined {
  const t = (p.tags ?? []).find((x) => x !== "npc");
  return t ? humanize(t) : undefined;
}

function PresetFields({ preset }: { preset: EntityPreset }) {
  const rows = Object.entries(preset.fields).filter(([, v]) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0));
  return (
    <dl className="app-dl">
      {rows.slice(0, 14).map(([k, v]) => (
        <div key={k} className="app-dl__row">
          <dt>{humanize(k)}</dt>
          <dd>{formatValue(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.map((x) => (typeof x === "object" && x !== null ? String((x as Record<string, unknown>).name ?? (x as Record<string, unknown>).id ?? JSON.stringify(x)) : String(x))).join(", ");
  return Object.entries(v as Record<string, unknown>)
    .filter(([, x]) => x !== undefined && x !== null && x !== "" && x !== 0)
    .map(([k, x]) => `${humanize(k)} ${typeof x === "object" ? JSON.stringify(x) : String(x)}`)
    .join(", ");
}
