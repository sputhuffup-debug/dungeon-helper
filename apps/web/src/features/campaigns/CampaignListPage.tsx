/** `/`: campaigns on this device, create, import, delete. */
import { listCampaigns, type CampaignIndexEntry } from "@campaign-forge/core";
import type { LoadedModule } from "@campaign-forge/module-sdk";
import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Badge, Button, Card, Dialog, EmptyState, IconButton, pushToast, useTheme } from "../../components/ui";
import { errorMessage, relativeTime } from "../../lib/format";
import { listModules, loadModuleById, moduleEntry } from "../../modules/registry";
import { createCampaign, deleteCampaign, importCampaignBundle } from "../../state/actions";

export function CampaignListPage() {
  const [campaigns, setCampaigns] = useState<CampaignIndexEntry[] | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<CampaignIndexEntry | undefined>();
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { resolved, toggle } = useTheme();

  const refresh = useCallback(() => {
    listCampaigns()
      .then(setCampaigns)
      .catch((e: unknown) => setError(errorMessage(e)));
  }, []);
  useEffect(refresh, [refresh]);

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const id = await importCampaignBundle(new Uint8Array(await file.arrayBuffer()));
      pushToast("Campaign imported", { tone: "success" });
      await navigate({ to: "/c/$campaignId/home", params: { campaignId: id } });
    } catch (e) {
      pushToast(`Import failed: ${errorMessage(e)}`, { tone: "danger", timeout: 8000 });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="app-page app-page--narrow app-landing">
      <header className="app-landing__header">
        <div>
          <h1 className="app-title">Campaign Forge</h1>
          <p className="cf-muted">Your campaigns live on this device and work offline.</p>
        </div>
        <IconButton variant="ghost" label={resolved === "dark" ? "Switch to light theme" : "Switch to dark theme"} icon={resolved === "dark" ? "☀" : "☾"} onClick={toggle} />
      </header>
      <div className="app-row">
        <Button variant="primary" onClick={() => setCreating(true)}>
          New campaign
        </Button>
        <Button onClick={() => fileRef.current?.click()} disabled={busy}>
          Import bundle…
        </Button>
        <input ref={fileRef} type="file" accept=".zip,application/zip" hidden aria-label="Import bundle file" onChange={(e) => void onImport(e.target.files?.[0])} />
      </div>
      {error && <p className="cf-field__error">{error}</p>}
      {campaigns === undefined ? (
        <p className="cf-muted">Loading…</p>
      ) : campaigns.length === 0 ? (
        <EmptyState title="No campaigns yet" text="Create one to start preparing: pick a game module and a play mode." action={<Button variant="primary" onClick={() => setCreating(true)}>Create a campaign</Button>} />
      ) : (
        <ul className="app-cards" aria-label="Campaigns">
          {campaigns.map((c) => (
            <li key={c.id}>
              <Card
                title={
                  <Link to="/c/$campaignId/home" params={{ campaignId: c.id }} className="app-link-strong">
                    {c.name}
                  </Link>
                }
                subtitle={`Updated ${relativeTime(c.updated)}`}
                actions={<IconButton variant="ghost" label={`Delete ${c.name}`} icon="×" onClick={() => setToDelete(c)} />}
              >
                <Badge>{moduleEntry(c.moduleId)?.name ?? c.moduleId}</Badge>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <CreateCampaignDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(id) => {
          setCreating(false);
          void navigate({ to: "/c/$campaignId/home", params: { campaignId: id } });
        }}
      />
      <ConfirmDialog
        open={!!toDelete}
        title={`Delete “${toDelete?.name ?? ""}”?`}
        confirmLabel="Delete campaign"
        danger
        busy={busy}
        onCancel={() => setToDelete(undefined)}
        onConfirm={async () => {
          if (!toDelete) return;
          setBusy(true);
          try {
            await deleteCampaign(toDelete.id);
            pushToast("Campaign deleted");
          } catch (e) {
            pushToast(`Delete failed: ${errorMessage(e)}`, { tone: "danger" });
          } finally {
            setBusy(false);
            setToDelete(undefined);
            refresh();
          }
        }}
      >
        <p>This removes the campaign, its notes and its images from this device. Export a bundle first if you want a backup. This cannot be undone.</p>
      </ConfirmDialog>
    </div>
  );
}

function CreateCampaignDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const modules = listModules();
  const [name, setName] = useState("");
  const [moduleId, setModuleId] = useState(modules[0]?.id ?? "alien");
  const [mode, setMode] = useState("");
  const [gmName, setGmName] = useState("");
  const [loaded, setLoaded] = useState<LoadedModule | undefined>();
  const [loadError, setLoadError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoaded(undefined);
    setLoadError(undefined);
    loadModuleById(moduleId)
      .then((m) => {
        if (!alive) return;
        setLoaded(m);
        setMode(m.manifest.defaultMode);
      })
      .catch((e: unknown) => alive && setLoadError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [moduleId, open]);

  const submit = async () => {
    if (!loaded) return;
    setBusy(true);
    try {
      const id = await createCampaign({ name, moduleId, mode, gmName });
      setName("");
      onCreated(id);
    } catch (e) {
      pushToast(`Could not create the campaign: ${errorMessage(e)}`, { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const modeDef = loaded?.manifest.modes.find((m) => m.id === mode);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New campaign"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="create-campaign" disabled={!loaded || busy || !name.trim()}>
            Create campaign
          </Button>
        </>
      }
    >
      <form
        id="create-campaign"
        className="app-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="app-label">
          Name
          <input className="cf-input" autoFocus required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Hadley's Hope" />
        </label>
        <label className="app-label">
          Game module
          <select className="cf-select" value={moduleId} onChange={(e) => setModuleId(e.target.value)}>
            {modules.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        {loadError && <p className="cf-field__error">{loadError}</p>}
        <fieldset className="app-fieldset">
          <legend className="app-label">Play mode</legend>
          {!loaded && !loadError && <span className="cf-muted">Loading module…</span>}
          {loaded?.manifest.modes.map((m) => (
            <label key={m.id} className="app-radio">
              <input type="radio" name="mode" value={m.id} checked={mode === m.id} onChange={() => setMode(m.id)} />
              <span>
                <strong>{m.name}</strong>
                {m.description && <span className="cf-muted"> — {m.description}</span>}
              </span>
            </label>
          ))}
        </fieldset>
        {modeDef && loaded?.manifest.dataStatus !== "verified" && (
          <p className="app-note app-note--warning">Module data is {loaded?.manifest.dataStatus}: unverified against the rulebook.</p>
        )}
        <label className="app-label">
          GM name
          <input className="cf-input" value={gmName} onChange={(e) => setGmName(e.target.value)} placeholder="GM" />
        </label>
      </form>
    </Dialog>
  );
}
