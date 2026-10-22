/** `/`: campaigns on this device, create, import, delete. */
import { listCampaigns, type CampaignIndexEntry } from "@campaign-forge/core";
import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Badge, Button, Card, Dialog, EmptyState, IconButton, pushToast, useTheme } from "../../components/ui";
import { errorMessage, relativeTime } from "../../lib/format";
import { loadModuleById, moduleEntry } from "../../modules/registry";
import { useModuleList } from "../../modules/useModules";
import { ModuleLicenseView } from "../modules/ModuleLicense";
import { ModulesDialog } from "../modules/ModulesDialog";
import type { DemoKind } from "../../state/tableActions";

// The campaign list is the first page: the store actions (Yjs documents,
// bundle import, demo data, game modules) load only when a button needs them.
const actions = () => import("../../state/actions");
const demoActions = () => import("../../state/tableActions");

export function CampaignListPage() {
  const [campaigns, setCampaigns] = useState<CampaignIndexEntry[] | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [creating, setCreating] = useState(false);
  const [modulesOpen, setModulesOpen] = useState(false);
  // re-render when imported packs are read, so campaign badges name them
  useModuleList();
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
      const { importCampaignBundle } = await actions();
      const { id, installedPack, installedSupplements, skippedSupplements, enabledSupplements } = await importCampaignBundle(new Uint8Array(await file.arrayBuffer()));
      pushToast(installedPack ? `Campaign imported with its game module ${installedPack}` : "Campaign imported", { tone: "success" });
      if (installedSupplements) pushToast(`Installed from the bundle: ${installedSupplements.join(", ")}`, { tone: "success" });
      if (enabledSupplements) pushToast(`Switched on for the bundle: ${enabledSupplements.join(", ")}`, { tone: "success" });
      if (skippedSupplements) pushToast(`Supplements not installed: ${skippedSupplements.join("; ")}`, { tone: "warning", timeout: 10000 });
      await navigate({ to: "/c/$campaignId/home", params: { campaignId: id } });
    } catch (e) {
      pushToast(`Import failed: ${errorMessage(e)}`, { tone: "danger", timeout: 8000 });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onLoadDemo = async (kind: DemoKind) => {
    setBusy(true);
    try {
      const { loadDemoCampaign } = await demoActions();
      const id = await loadDemoCampaign(undefined, kind);
      await navigate({ to: "/c/$campaignId/home", params: { campaignId: id } });
    } catch (e) {
      pushToast(`Could not load the demo: ${errorMessage(e)}`, { tone: "danger" });
      setBusy(false);
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
        <Button onClick={() => setModulesOpen(true)} data-testid="open-modules">
          Game modules…
        </Button>
        <Button onClick={() => void onLoadDemo("campaign")} disabled={busy} data-testid="load-demo" title="Skyfire Down: campaign play with a job, a crew and a running infection">
          Load demo campaign
        </Button>
        <Button onClick={() => void onLoadDemo("cinematic")} disabled={busy} data-testid="load-demo-cinematic" title="Cold Harbor: a cinematic one-shot made with the guided builder, with a live site map">
          Load cinematic demo
        </Button>
        <Button onClick={() => void onLoadDemo("dnd5e")} disabled={busy} data-testid="load-demo-5e" title="Thornwick Crossing: a fifth edition one-shot with the SRD 5.1 module, four level 3 characters and a goblin ambush">
          Load 5e demo
        </Button>
        <Button onClick={() => void onLoadDemo("pf2e")} disabled={busy} data-testid="load-demo-pf2e" title="Hollowmere: a second edition remaster one-shot with the ORC core rules, four level 1 characters and kobold oil thieves">
          Load PF2e demo
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
      <ModulesDialog open={modulesOpen} onClose={() => setModulesOpen(false)} />
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
            const { deleteCampaign } = await actions();
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
  const modules = useModuleList();
  const [modulesOpen, setModulesOpen] = useState(false);
  const [name, setName] = useState("");
  const [moduleId, setModuleId] = useState(modules[0]?.id ?? "alien");
  const [mode, setMode] = useState(modules[0]?.defaultMode ?? "");
  const [gmName, setGmName] = useState("");
  const [loadError, setLoadError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const entry = moduleEntry(moduleId);

  // The dialog shows the static manifest; the module itself starts loading in
  // the background so "Create campaign" is quick, and a failed load shows here.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoadError(undefined);
    loadModuleById(moduleId).catch((e: unknown) => alive && setLoadError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [moduleId, open, attempt]);

  const chooseModule = (id: string) => {
    setModuleId(id);
    setMode(moduleEntry(id)?.defaultMode ?? "");
  };

  const submit = async () => {
    setBusy(true);
    try {
      const { createCampaign } = await actions();
      const id = await createCampaign({ name, moduleId, mode, gmName });
      setName("");
      onCreated(id);
    } catch (e) {
      pushToast(`Could not create the campaign: ${errorMessage(e)}`, { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const modeDef = entry?.modes.find((m) => m.id === mode);
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
          <Button variant="primary" type="submit" form="create-campaign" disabled={!entry || busy || !name.trim()}>
            {busy ? "Creating…" : "Create campaign"}
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
          <select className="cf-select" value={moduleId} onChange={(e) => chooseModule(e.target.value)}>
            {modules.map((m) => (
              <option key={m.id} value={m.id}>
                {m.dev ? `${m.name} (fixture)` : m.source === "imported" ? `${m.name} (imported)` : m.name}
              </option>
            ))}
          </select>
        </label>
        <p className="cf-muted">
          Another game system?{" "}
          <button type="button" className="app-linkbtn" onClick={() => setModulesOpen(true)} data-testid="create-import-pack">
            Import a data pack…
          </button>
        </p>
        {entry?.license && <ModuleLicenseView license={entry.license} />}
        {loadError && (
          <p className="cf-field__error" role="alert">
            Could not load the game module: {loadError}{" "}
            <Button variant="ghost" size="sm" onClick={() => setAttempt((a) => a + 1)}>
              Retry
            </Button>
          </p>
        )}
        <fieldset className="app-fieldset">
          <legend className="app-label">Play mode</legend>
          {entry?.modes.map((m) => (
            <label key={m.id} className="app-radio">
              <input type="radio" name="mode" value={m.id} checked={mode === m.id} onChange={() => setMode(m.id)} />
              <span>
                <strong>{m.name}</strong>
                {m.description && <span className="cf-muted"> — {m.description}</span>}
              </span>
            </label>
          ))}
        </fieldset>
        {modeDef && entry?.dataStatus !== "verified" && (
          <p className="app-note app-note--warning">{entry?.dataStatus === "partially-verified" ? "Module data is partially verified against its source: spot-checked, not checked line by line." : "Module data is unverified against the rulebook."}</p>
        )}
        <label className="app-label">
          GM name
          <input className="cf-input" value={gmName} onChange={(e) => setGmName(e.target.value)} placeholder="GM" />
        </label>
      </form>
      <ModulesDialog
        open={modulesOpen}
        onClose={() => setModulesOpen(false)}
        onImported={(e) => {
          setModulesOpen(false);
          chooseModule(e.id);
        }}
      />
    </Dialog>
  );
}
