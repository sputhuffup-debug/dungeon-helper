import { relationshipTypes, relationshipsOf, type Entity } from "@campaign-forge/core";
import type { CoreEntityKind, EntityTypeDef, RelationshipTypeDef } from "@campaign-forge/module-sdk";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { EntityIcon } from "../../components/EntityIcon";
import { EntityPicker } from "../../components/EntityPicker";
import { AutoGrowText, Button, Dialog, EmptyState, IconButton } from "../../components/ui";
import { linkEntities, unlinkEntities } from "../../state/actions";
import { useCampaign, useMapVersion } from "../../state/hooks";

interface Option {
  value: string;
  type: RelationshipTypeDef;
  direction: "out" | "in";
  label: string;
}

function optionsFor(types: RelationshipTypeDef[], kind: CoreEntityKind | undefined): Option[] {
  const out: Option[] = [];
  for (const t of types) {
    const fromOk = !t.fromKinds || !kind || t.fromKinds.includes(kind);
    const toOk = !t.toKinds || !kind || t.toKinds.includes(kind);
    if (fromOk) out.push({ value: `${t.id}:out`, type: t, direction: "out", label: t.forward });
    if (!t.symmetric && toOk && t.reverse !== t.forward) out.push({ value: `${t.id}:in`, type: t, direction: "in", label: t.reverse });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

export function RelationshipsTab({ entity, def }: { entity: Entity; def: EntityTypeDef | undefined }) {
  const ctx = useCampaign();
  const version = useMapVersion("relationships");
  // re-render when linked entities are renamed or removed
  useMapVersion("entities");
  const rels = useMemo(
    () => relationshipsOf(ctx.store, entity.id, ctx.module.module),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx.store, ctx.module, entity.id, version],
  );
  const options = useMemo(() => optionsFor(relationshipTypes(ctx.module.module), def?.kind), [ctx.module, def?.kind]);
  const [adding, setAdding] = useState(false);

  return (
    <div className="app-stack">
      <div className="app-row">
        <Button variant="primary" onClick={() => setAdding(true)} data-testid="add-relationship">
          + Add relationship
        </Button>
      </div>
      {rels.length === 0 ? (
        <EmptyState title="No relationships" text="Link this entity to factions, places, people and things." />
      ) : (
        <ul className="app-list" aria-label="Relationships">
          {rels.map((r) => {
            const other = ctx.store.get("entities", r.other);
            const odef = other ? ctx.module.entityType(other.type) : undefined;
            return (
              <li key={r.rel.id} className="app-list__row">
                <span className="cf-muted app-rel__label">{r.label}</span>
                <EntityIcon icon={odef?.icon} kind={odef?.kind} size={14} />
                {other ? (
                  <Link to="/c/$campaignId/entities/$entityId" params={{ campaignId: ctx.campaignId, entityId: other.id }} className="app-link-strong">
                    {other.name}
                  </Link>
                ) : (
                  <span className="cf-muted">(deleted)</span>
                )}
                {r.rel.note && <span className="cf-muted">— {r.rel.note}</span>}
                <IconButton className="app-list__end" size="sm" variant="ghost" label="Remove relationship" icon="×" onClick={() => unlinkEntities(ctx, r.rel.id)} />
              </li>
            );
          })}
        </ul>
      )}
      <AddRelationshipDialog open={adding} onClose={() => setAdding(false)} entity={entity} options={options} />
    </div>
  );
}

function AddRelationshipDialog({ open, onClose, entity, options }: { open: boolean; onClose: () => void; entity: Entity; options: Option[] }) {
  const ctx = useCampaign();
  const [value, setValue] = useState(options[0]?.value ?? "");
  const [target, setTarget] = useState<Entity | undefined>();
  const [note, setNote] = useState("");
  const [picking, setPicking] = useState(false);
  const opt = options.find((o) => o.value === value) ?? options[0];
  const allowedKinds = opt ? (opt.direction === "out" ? opt.type.toKinds : opt.type.fromKinds) : undefined;
  const allowedTypes = allowedKinds ? ctx.module.module.entityTypes.filter((t) => allowedKinds.includes(t.kind)).map((t) => t.id) : undefined;

  const submit = () => {
    if (!opt || !target) return;
    if (opt.direction === "out") linkEntities(ctx, opt.type.id, entity.id, target.id, note.trim() || undefined);
    else linkEntities(ctx, opt.type.id, target.id, entity.id, note.trim() || undefined);
    setTarget(undefined);
    setNote("");
    onClose();
  };

  return (
    <>
      <Dialog
        open={open && !picking}
        onClose={onClose}
        title={`Link ${entity.name}`}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} disabled={!opt || !target}>
              Add
            </Button>
          </>
        }
      >
        <div className="app-form">
          <label className="app-label">
            {entity.name} …
            <select className="cf-select" value={opt?.value ?? ""} onChange={(e) => setValue(e.target.value)} aria-label="Relationship type">
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <div className="app-label">
            Target
            <div className="app-row">
              <span>{target ? target.name : <span className="cf-muted">none chosen</span>}</span>
              <Button size="sm" onClick={() => setPicking(true)}>
                Choose…
              </Button>
            </div>
          </div>
          <label className="app-label">
            Note
            <AutoGrowText value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" />
          </label>
        </div>
      </Dialog>
      <EntityPicker
        open={picking}
        types={allowedTypes}
        exclude={[entity.id]}
        onClose={() => setPicking(false)}
        onPick={(e) => {
          setTarget(e);
          setPicking(false);
        }}
      />
    </>
  );
}
