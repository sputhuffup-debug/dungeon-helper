/** `/entities/$entityId`: header plus Sheet | Notes | Relationships | Backlinks | Timeline. */
import type { Entity } from "@campaign-forge/core";
import type { EntityTypeDef } from "@campaign-forge/module-sdk";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { EntityIcon } from "../../components/EntityIcon";
import { TagInput } from "../../components/TagInput";
import { VisibilitySelect } from "../../components/VisibilitySelect";
import { Button, EmptyState, IconButton, ProvenanceBadge, Tabs, pushToast } from "../../components/ui";
import { errorMessage } from "../../lib/format";
import { deleteEntity, setEntityImage, setEntityVisibility, updateEntity } from "../../state/actions";
import { useAssetUrl, useCampaign, useEntityType, useList, useMeta, useRecord } from "../../state/hooks";
import { BacklinksTab } from "./BacklinksTab";
import { NotesTab } from "./NotesTab";
import { RelationshipsTab } from "./RelationshipsTab";
import { SheetTab } from "./SheetTab";
import { TimelineTab } from "./TimelineTab";
import { EntityPrepPanels } from "../generate/EntityPrepPanels";

const TABS = ["sheet", "notes", "relationships", "backlinks", "timeline"] as const;

export function EntityPage() {
  const { entityId } = useParams({ from: "/c/$campaignId/entities/$entityId" });
  const search = useSearch({ from: "/c/$campaignId/entities/$entityId" });
  const navigate = useNavigate({ from: "/c/$campaignId/entities/$entityId" });
  const ctx = useCampaign();
  const entity = useRecord("entities", entityId);
  const def = useEntityType(entity?.type);

  if (!entity) {
    return (
      <div className="app-page">
        <EmptyState
          title="Entity not found"
          text="It may have been deleted."
          action={
            <Link to="/c/$campaignId/atlas" params={{ campaignId: ctx.campaignId }} className="cf-btn">
              Back to the atlas
            </Link>
          }
        />
      </div>
    );
  }

  const tab = (TABS as readonly string[]).includes(search.tab ?? "") ? (search.tab as string) : "sheet";
  return (
    <div className="app-page app-entity" data-testid="entity-page">
      <EntityHeader entity={entity} def={def} />
      <Tabs
        value={tab}
        onChange={(id) => void navigate({ search: { tab: id }, replace: true })}
        tabs={[
          { id: "sheet", label: "Sheet", content: <SheetTab entity={entity} def={def} /> },
          { id: "notes", label: <NotesLabel entityId={entity.id} />, content: <NotesTab entity={entity} /> },
          { id: "relationships", label: "Relationships", content: <RelationshipsTab entity={entity} def={def} /> },
          { id: "backlinks", label: "Backlinks", content: <BacklinksTab entity={entity} /> },
          { id: "timeline", label: "Timeline", content: <TimelineTab entity={entity} /> },
        ]}
      />
      <EntityPrepPanels entity={entity} def={def} />
    </div>
  );
}

function NotesLabel({ entityId }: { entityId: string }) {
  const notes = useList("notes");
  const n = notes.filter((x) => x.attachedTo?.kind === "entity" && x.attachedTo.id === entityId).length;
  return <>Notes{n ? ` (${n})` : ""}</>;
}

function EntityHeader({ entity, def }: { entity: Entity; def: EntityTypeDef | undefined }) {
  const ctx = useCampaign();
  const meta = useMeta();
  const navigate = useNavigate();
  const imageUrl = useAssetUrl(entity.image);
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(entity.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => setName(entity.name), [entity.name]);
  const run = entity.provenance?.generatorRun ? ctx.store.get("generatorRuns", entity.provenance.generatorRun) : undefined;
  const preset = entity.provenance?.preset ? ctx.module.preset(entity.provenance.preset) : undefined;
  const edited = entity.provenance?.editedFields ?? [];

  const commitName = () => {
    const n = name.trim();
    if (n && n !== entity.name) updateEntity(ctx, entity.id, { name: n });
    else setName(entity.name);
  };

  const onImage = async (file: File | undefined) => {
    if (!file) return;
    try {
      await setEntityImage(ctx, entity.id, file);
    } catch (e) {
      pushToast(`Image upload failed: ${errorMessage(e)}`, { tone: "danger" });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <header className="app-entity__header">
      <div className="app-entity__image">
        {imageUrl ? <img src={imageUrl} alt={`${entity.name}`} /> : <EntityIcon icon={def?.icon} kind={def?.kind} size={40} />}
        <div className="app-entity__image-actions">
          <Button size="sm" onClick={() => fileRef.current?.click()}>
            {entity.image ? "Change" : "Image"}
          </Button>
          {entity.image && <IconButton size="sm" variant="ghost" label="Remove image" icon="×" onClick={() => void setEntityImage(ctx, entity.id, undefined)} />}
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden aria-label="Upload image" onChange={(e) => void onImage(e.target.files?.[0])} />
      </div>
      <div className="app-entity__meta">
        <input
          className="app-entity__name"
          aria-label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setName(entity.name);
          }}
          data-testid="entity-title"
        />
        <div className="app-row">
          <span className="app-entity__type">
            <EntityIcon icon={def?.icon} kind={def?.kind} size={14} /> {def?.name ?? entity.type}
          </span>
          {def?.subtypes && def.subtypes.length > 0 && (
            <select className="cf-select cf-input--inline" aria-label="Subtype" value={entity.subtype ?? ""} onChange={(e) => updateEntity(ctx, entity.id, { subtype: e.target.value || undefined })}>
              <option value="">No subtype</option>
              {def.subtypes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          <VisibilitySelect value={entity.visibility} onChange={(v) => setEntityVisibility(ctx, entity.id, v)} hasPlayers={meta.members.some((m) => m.role === "player")} />
          {preset && <ProvenanceBadge kind="preset" label="preset" detail={`From preset “${preset.name}”`} />}
          {run && <ProvenanceBadge kind="rolled" label="generated" rolls={run.rolls} detail={`Procedure ${run.procedure}, seed ${run.seed}`} />}
          {edited.length > 0 && <ProvenanceBadge kind="edited" detail={`Edited after creation: ${edited.join(", ")}`} />}
        </div>
        <TagInput value={entity.tags} onChange={(tags) => updateEntity(ctx, entity.id, { tags })} />
        <input
            className="cf-input app-entity__summary"
            aria-label="Summary"
            placeholder="One-line summary"
            defaultValue={entity.summary ?? ""}
            key={entity.summary ?? ""}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== (entity.summary ?? "")) updateEntity(ctx, entity.id, { summary: v || undefined });
            }}
          />
      </div>
      <div className="app-entity__actions">
        <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
          Delete
        </Button>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${entity.name}?`}
        confirmLabel="Delete"
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          deleteEntity(ctx, entity.id);
          void navigate({ to: "/c/$campaignId/atlas", params: { campaignId: ctx.campaignId } });
        }}
      >
        <p>Its relationships and attached notes are removed too. References in other notes will show as deleted.</p>
      </ConfirmDialog>
    </header>
  );
}
