/**
 * `/maps/$mapId`: a site map bound to its record. A generated map (with a
 * `layout`) shows its deck plan views and exports (SiteMapPage); an image
 * map keeps the rectangle editor, whose edits are kept locally while the GM
 * drags and written to the store debounced, so a drag is one write rather
 * than hundreds.
 */
import type { Entity, Id, Scene, SiteMap } from "@campaign-forge/core";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { EntityPicker } from "../../components/EntityPicker";
import { VisibilitySelect } from "../../components/VisibilitySelect";
import { Badge, Button, Card, EmptyState, IconButton, ZoneMapEditor, pushToast } from "../../components/ui";
import { errorMessage } from "../../lib/format";
import { uploadAsset } from "../../state/actions";
import { deleteSiteMap, updateSiteMap } from "../../state/prepActions";
import { useAssetUrl, useCampaign, useList, useMeta, useRecord } from "../../state/hooks";
import { SiteMapPage } from "./SiteMapPage";

const WRITE_DELAY = 300;

function capturePointer(e: ReactPointerEvent<HTMLDivElement>) {
  const viewport = (e.target as Element).closest?.(".cf-map__viewport");
  if (viewport instanceof HTMLElement && e.button === 0 && typeof viewport.setPointerCapture === "function") {
    try {
      viewport.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
  }
}

export function MapPage() {
  const { mapId } = useParams({ from: "/c/$campaignId/maps/$mapId" });
  const ctx = useCampaign();
  const record = useRecord("maps", mapId);
  if (!record) {
    return (
      <div className="app-page">
        <EmptyState
          title="Map not found"
          text="It may have been deleted."
          action={
            <Link to="/c/$campaignId/adventures" params={{ campaignId: ctx.campaignId }} search={{}} className="cf-btn">
              Adventures
            </Link>
          }
        />
      </div>
    );
  }
  if (record.layout) return <GeneratedMapPage key={record.id} record={record} />;
  return <MapEditorPage key={record.id} record={record} />;
}

function GeneratedMapPage({ record }: { record: SiteMap }) {
  const [confirm, setConfirm] = useState(false);
  const scenes = useMapScenes(record.id);
  return (
    <>
      <SiteMapPage record={record} onDelete={() => setConfirm(true)} scenesCard={<MapScenesCard scenes={scenes} />} />
      <DeleteMapDialog record={record} scenes={scenes} open={confirm} onClose={() => setConfirm(false)} />
    </>
  );
}

function useMapScenes(mapId: Id): Scene[] {
  const sceneFilter = useMemo(() => (s: { map?: Id }) => s.map === mapId, [mapId]);
  return useList("scenes", sceneFilter);
}

function MapScenesCard({ scenes, onNavigate }: { scenes: Scene[]; onNavigate?: () => void }) {
  const ctx = useCampaign();
  const campaignId = ctx.campaignId;
  return (
    <Card title="Used in scenes">
      {scenes.length === 0 ? (
        <p className="cf-muted">Attach this map to a scene from the adventure builder.</p>
      ) : (
        <ul className="app-list">
          {scenes.map((s) => {
            const act = s.act ? ctx.store.get("acts", s.act) : undefined;
            return (
              <li key={s.id} className="app-list__row">
                {act ? (
                  <Link
                    to="/c/$campaignId/adventures/$adventureId"
                    params={{ campaignId, adventureId: act.adventure }}
                    search={{ node: `scene:${s.id}` }}
                    className="app-link-strong"
                    onClick={onNavigate}
                  >
                    {s.title}
                  </Link>
                ) : (
                  <strong>{s.title}</strong>
                )}
                {act && <span className="cf-muted">Act {act.number}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function DeleteMapDialog({ record, scenes, open, onClose }: { record: SiteMap; scenes: Scene[]; open: boolean; onClose: () => void }) {
  const ctx = useCampaign();
  const navigate = useNavigate();
  const campaignId = ctx.campaignId;
  return (
    <ConfirmDialog
      open={open}
      title={`Delete ${record.name}?`}
      danger
      confirmLabel="Delete"
      onCancel={onClose}
      onConfirm={() => {
        onClose();
        const back = scenes[0]?.act ? ctx.store.get("acts", scenes[0].act) : undefined;
        deleteSiteMap(ctx, record.id);
        if (back) void navigate({ to: "/c/$campaignId/adventures/$adventureId", params: { campaignId, adventureId: back.adventure }, search: {} });
        else void navigate({ to: "/c/$campaignId/home", params: { campaignId } });
      }}
    >
      <p>The zones go with it; scenes that use it lose their map.</p>
    </ConfirmDialog>
  );
}

/** Local draft of the zone data with a debounced write-back. */
function useDebouncedMap(record: SiteMap) {
  const ctx = useCampaign();
  const [draft, setDraft] = useState<SiteMap>(record);
  const pending = useRef<SiteMap | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = undefined;
    const next = pending.current;
    pending.current = undefined;
    if (next && ctx.store.has("maps", next.id)) updateSiteMap(ctx, next.id, { zones: next.zones, borders: next.borders, accessPoints: next.accessPoints });
  }, [ctx]);

  // external changes (other fields, or zones written elsewhere) when nothing local is pending
  useEffect(() => {
    if (!pending.current) setDraft(record);
    else setDraft((d) => ({ ...record, zones: d.zones, borders: d.borders, accessPoints: d.accessPoints }));
  }, [record]);

  useEffect(() => () => flush(), [flush]);

  const onChange = useCallback(
    (next: SiteMap) => {
      setDraft(next);
      pending.current = next;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, WRITE_DELAY);
    },
    [flush],
  );
  return { draft, onChange, flush };
}

function MapEditorPage({ record }: { record: SiteMap }) {
  const ctx = useCampaign();
  const meta = useMeta();
  const campaignId = ctx.campaignId;
  const { draft, onChange, flush } = useDebouncedMap(record);
  const imageUrl = useAssetUrl(record.asset);
  const location = useRecord("entities", record.location);
  const fileRef = useRef<HTMLInputElement>(null);
  const [picking, setPicking] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const locationTypes = useMemo(() => ctx.module.module.entityTypes.filter((t) => t.kind === "location").map((t) => t.id), [ctx.module]);
  const scenes = useMapScenes(record.id);

  const onImage = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const asset = await uploadAsset(ctx, file, file.name, record.visibility);
      const patch: Partial<SiteMap> = { asset: asset.id };
      if (asset.width && asset.height) {
        patch.width = asset.width;
        patch.height = asset.height;
      }
      updateSiteMap(ctx, record.id, patch);
    } catch (e) {
      pushToast(`Image upload failed: ${errorMessage(e)}`, { tone: "danger" });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeImage = () => updateSiteMap(ctx, record.id, { asset: undefined });

  return (
    <div className="app-page prep-mappage" data-testid="map-page">
      <header className="app-page__header">
        <div className="app-stack prep-mappage__meta">
          <input
            className="app-entity__name"
            aria-label="Map name"
            defaultValue={record.name}
            key={record.name}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== record.name) updateSiteMap(ctx, record.id, { name: v });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            data-testid="map-name"
          />
          <div className="app-row">
            <span className="cf-muted">Location</span>
            {location ? (
              <Link to="/c/$campaignId/entities/$entityId" params={{ campaignId, entityId: location.id }} className="app-link-strong">
                {location.name}
              </Link>
            ) : (
              <span className="cf-muted">none</span>
            )}
            <Button size="sm" onClick={() => setPicking(true)}>
              {location ? "Change" : "Pick location"}
            </Button>
            {location && <IconButton size="sm" variant="ghost" label="Clear location" icon="×" onClick={() => updateSiteMap(ctx, record.id, { location: undefined })} />}
            <VisibilitySelect value={record.visibility} onChange={(v) => updateSiteMap(ctx, record.id, { visibility: v })} hasPlayers={meta.members.some((m) => m.role === "player")} />
            <Badge>
              {draft.zones.length} zone{draft.zones.length === 1 ? "" : "s"}
            </Badge>
          </div>
        </div>
        <div className="app-row">
          <Button onClick={() => fileRef.current?.click()} disabled={busy} data-testid="map-upload">
            {record.asset ? "Replace image" : "Upload image"}
          </Button>
          {record.asset && (
            <Button variant="ghost" onClick={removeImage}>
              Remove image
            </Button>
          )}
          <Button variant="ghost" onClick={() => setConfirm(true)}>
            Delete
          </Button>
          <input ref={fileRef} type="file" accept="image/*" hidden aria-label="Map image" onChange={(e) => void onImage(e.target.files?.[0])} />
        </div>
      </header>

      {/* Capture the pointer on the viewport so a drag that ends outside it still ends (and creates its zone). */}
      <div className="prep-mappage__editor" onPointerDownCapture={capturePointer}>
        <ZoneMapEditor map={draft} imageUrl={imageUrl} onChange={onChange} />
      </div>

      <div className="app-grid">
        <Card title="Access points">
          {draft.accessPoints.length === 0 ? (
            <p className="cf-muted">Add vents, crawlspaces and hatches in the map panel.</p>
          ) : (
            <ul className="app-list">
              {draft.accessPoints.map((a) => (
                <li key={a.id} className="app-list__row">
                  <strong>{a.name}</strong>
                  {a.hidden && <Badge tone="warning">hidden</Badge>}
                  <span className="cf-muted">{a.zones.map((z) => draft.zones.find((x) => x.id === z)?.name ?? z).join(" ↔ ") || "no zones"}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <MapScenesCard scenes={scenes} onNavigate={flush} />
      </div>

      <EntityPicker
        open={picking}
        title="Map location"
        types={locationTypes}
        onClose={() => setPicking(false)}
        onPick={(e: Entity) => {
          setPicking(false);
          updateSiteMap(ctx, record.id, { location: e.id });
        }}
      />
      <DeleteMapDialog record={record} scenes={scenes} open={confirm} onClose={() => setConfirm(false)} />
    </div>
  );
}
