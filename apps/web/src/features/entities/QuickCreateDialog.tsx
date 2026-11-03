/**
 * Make one entity without leaving the page: a type (when several fit), a
 * preset or blank, and a name. Used where a picker would otherwise dead-end
 * on "none yet", e.g. "+ New ship…" for the crew's ship, or a home base in
 * Settings; `onCreated` then selects what was made.
 */
import type { Entity } from "@campaign-forge/core";
import type { EntityPreset } from "@campaign-forge/module-sdk";
import { useEffect, useMemo, useState } from "react";
import { Button, Dialog } from "../../components/ui";
import { humanize } from "../../lib/format";
import { createEntity, createEntityFromPreset } from "../../state/actions";
import { useCampaign } from "../../state/hooks";

export interface QuickCreateDialogProps {
  open: boolean;
  /** Entity types offered, in order (the first is preselected). */
  types: string[];
  /** Dialog title, e.g. "New ship". */
  title: string;
  onClose: () => void;
  onCreated: (entity: Entity) => void;
}

export function QuickCreateDialog({ open, types, title, onClose, onCreated }: QuickCreateDialogProps) {
  const ctx = useCampaign();
  const defs = useMemo(() => types.map((t) => ctx.module.entityType(t)).filter((d) => !!d), [ctx.module, types]);
  const [typeId, setTypeId] = useState(defs[0]?.id ?? "");
  const [presetId, setPresetId] = useState("");
  const [name, setName] = useState("");
  const def = ctx.module.entityType(typeId);
  const presets = useMemo(() => ctx.module.presetsFor(typeId), [ctx.module, typeId]);
  const preset = presetId ? ctx.module.preset(presetId) : undefined;

  // a fresh form each time it opens
  useEffect(() => {
    if (!open) return;
    setTypeId(defs[0]?.id ?? "");
    setPresetId("");
    setName("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const groups = useMemo(() => {
    const out = new Map<string, EntityPreset[]>();
    for (const p of presets) {
      const key = p.subtype ? (def?.subtypes?.find((s) => s.id === p.subtype)?.name ?? humanize(p.subtype)) : "Presets";
      out.set(key, [...(out.get(key) ?? []), p]);
    }
    return [...out.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [presets, def]);

  const create = () => {
    if (!def) return;
    const entity = preset
      ? createEntityFromPreset(ctx, preset, { name: name.trim() || preset.name, ...(preset.subtype ? { subtype: preset.subtype } : {}) })
      : createEntity(ctx, { type: def.id, name: name.trim() || `New ${def.name.toLowerCase()}` });
    onCreated(entity);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="quick-create" disabled={!def} data-testid="quick-create-submit">
            Create and choose
          </Button>
        </>
      }
    >
      <form
        id="quick-create"
        className="app-form"
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        {defs.length > 1 && (
          <label className="app-label">
            Type
            <select
              className="cf-select"
              value={typeId}
              onChange={(e) => {
                setTypeId(e.target.value);
                setPresetId("");
              }}
            >
              {defs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="app-label">
          Start from
          <select className="cf-select" value={presetId} onChange={(e) => setPresetId(e.target.value)} data-testid="quick-create-preset">
            <option value="">Blank {def?.name.toLowerCase() ?? ""}</option>
            {groups.map(([group, list]) => (
              <optgroup key={group} label={group}>
                {list.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        {preset?.summary && <p className="cf-muted">{preset.summary}</p>}
        <label className="app-label">
          Name
          <input className="cf-input" value={name} placeholder={preset?.name ?? `New ${def?.name.toLowerCase() ?? "entity"}`} onChange={(e) => setName(e.target.value)} data-testid="quick-create-name" />
        </label>
      </form>
    </Dialog>
  );
}
