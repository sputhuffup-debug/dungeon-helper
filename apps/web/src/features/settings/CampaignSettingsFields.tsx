/**
 * The module's campaign settings (`GameModule.campaignSettings`) as fields:
 * a choice is a select, an entity a select of the campaign's entities with
 * "+ New…", text a text box. Shared by the New campaign dialog (values held
 * by the dialog) and Settings (values stored in `meta.settings`).
 */
import { campaignSettingOptions, type CampaignSettingDef, type GameModule, type PlayModeId } from "@campaign-forge/module-sdk";
import { useMemo, useState } from "react";
import { PageRef } from "../../components/ui";
import { useCampaign, useList, useMeta } from "../../state/hooks";
import { QuickCreateDialog } from "../entities/QuickCreateDialog";

const NEW_ENTITY = "__new__";

/** A choice or text setting; the dialog uses it before the campaign exists. */
export function SettingField({
  def,
  module,
  mode,
  value,
  onChange,
}: {
  def: CampaignSettingDef;
  module: Pick<GameModule, "referenceLists">;
  mode: PlayModeId;
  value: string;
  onChange: (value: string) => void;
}) {
  const options = useMemo(() => campaignSettingOptions(def, module, mode), [def, module, mode]);
  const chosen = options.find((o) => o.value === value);
  return (
    <label className="app-label" data-setting={def.key}>
      <span>
        {def.label} <PageRef page={def.page} cite={def.cite} />
      </span>
      {def.kind === "choice" ? (
        <select className="cf-select" value={value} onChange={(e) => onChange(e.target.value)} aria-label={def.label}>
          {def.default === undefined && <option value="">Not chosen</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input className="cf-input" value={value} onChange={(e) => onChange(e.target.value)} aria-label={def.label} />
      )}
      {(chosen?.hint || def.hint) && <span className="cf-muted app-setting__hint">{chosen?.hint ?? def.hint}</span>}
    </label>
  );
}

/** An entity setting in an open campaign: pick one, or make one and pick it. */
function EntitySettingField({ def, value, onChange }: { def: CampaignSettingDef; value: string; onChange: (value: string | undefined) => void }) {
  const ctx = useCampaign();
  const all = useList("entities");
  const [creating, setCreating] = useState(false);
  const types = def.entityTypes ?? [];
  const candidates = useMemo(() => all.filter((e) => types.includes(e.type)).sort((a, b) => a.name.localeCompare(b.name)), [all, types]);
  const first = ctx.module.entityType(types[0] ?? "");
  const current = candidates.some((c) => c.id === value) ? value : "";
  return (
    <>
      <label className="app-label" data-setting={def.key}>
        <span>
          {def.label} <PageRef page={def.page} cite={def.cite} />
        </span>
        <select
          className="cf-select"
          value={current}
          aria-label={def.label}
          onChange={(e) => {
            if (e.target.value === NEW_ENTITY) setCreating(true);
            else onChange(e.target.value || undefined);
          }}
        >
          <option value="">Not chosen</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {types.length > 1 ? ` (${ctx.module.entityType(c.type)?.name ?? c.type})` : ""}
            </option>
          ))}
          <option value={NEW_ENTITY}>+ New {first?.name.toLowerCase() ?? "entry"}…</option>
        </select>
        {def.hint && <span className="cf-muted app-setting__hint">{def.hint}</span>}
      </label>
      <QuickCreateDialog
        open={creating}
        types={types}
        title={`New ${def.label.toLowerCase()}`}
        onClose={() => setCreating(false)}
        onCreated={(entity) => {
          onChange(entity.id);
          setCreating(false);
        }}
      />
    </>
  );
}

/** Every campaign setting of the module for the campaign's mode, stored as they change. */
export function CampaignSettingsFields({ defs, onChange }: { defs: CampaignSettingDef[]; onChange: (key: string, value: string | undefined) => void }) {
  const ctx = useCampaign();
  const meta = useMeta();
  const settings = meta.settings ?? {};
  const mode = meta.mode;
  return (
    <>
      {defs.map((def) => {
        const raw = settings[def.key];
        const value = typeof raw === "string" ? raw : "";
        return def.kind === "entity" ? (
          <EntitySettingField key={def.key} def={def} value={value} onChange={(v) => onChange(def.key, v)} />
        ) : (
          <SettingField key={def.key} def={def} module={ctx.module.module} mode={mode} value={value} onChange={(v) => onChange(def.key, v)} />
        );
      })}
    </>
  );
}
