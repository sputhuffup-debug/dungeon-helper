/** Settings: campaign name, mode, in-world date, members, session checklist, export/import, delete, module info. */
import { exportMarkdown } from "@campaign-forge/core";
import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Badge, Button, Card } from "../../components/ui";
import { downloadFile, slug } from "../../lib/download";
import { adventureTitle, errorMessage } from "../../lib/format";
import { deleteCampaign, exportCampaignBundle, exportCampaignJSON, importBundleIntoCampaign, updateMeta } from "../../state/actions";
import { useCampaign, useList, useMeta } from "../../state/hooks";
import { pushToast } from "../../components/ui";
import { ChecklistSettings } from "./ChecklistSettings";
import { moduleEntry, supplementMeta, supplementProblems } from "../../modules/registry";
import { ModuleLicenseView, safeHttpUrl } from "../modules/ModuleLicense";

export function SettingsPage() {
  const ctx = useCampaign();
  const meta = useMeta();
  const navigate = useNavigate();
  const adventures = useList("adventures");
  const [pendingMode, setPendingMode] = useState<string | undefined>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adventureId, setAdventureId] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const manifest = ctx.module.manifest;
  const warnings = ctx.module.report.issues.filter((i) => i.severity === "warning");
  const entry = moduleEntry(manifest.id);
  const sourceUrl = safeHttpUrl(manifest.sourceBook?.url);

  const run = async (label: string, fn: () => Promise<unknown> | unknown) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      pushToast(`${label} failed: ${errorMessage(e)}`, { tone: "danger", timeout: 8000 });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-page app-page--narrow">
      <h1 className="app-title">Settings</h1>

      <Card title="Campaign">
        <div className="app-form">
          <label className="app-label">
            Name
            <input
              className="cf-input"
              defaultValue={meta.name}
              key={meta.name}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== meta.name) updateMeta(ctx, { name: v });
              }}
              data-testid="settings-name"
            />
          </label>
          <label className="app-label">
            Play mode
            <select className="cf-select" value={meta.mode} onChange={(e) => setPendingMode(e.target.value)}>
              {manifest.modes.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="app-label">
            In-world date
            <input
              className="cf-input"
              defaultValue={meta.currentDate ?? ""}
              key={meta.currentDate ?? ""}
              placeholder={ctx.module.module.calendar.format ?? "date"}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v !== (meta.currentDate ?? "")) updateMeta(ctx, { currentDate: v || undefined });
              }}
            />
          </label>
        </div>
      </Card>

      <Card title="Members" subtitle="Campaign Forge v1 is GM-only; players arrive with sync in a later version.">
        <ul className="app-list">
          {meta.members.map((m) => (
            <li key={m.id} className="app-list__row">
              <input
                className="cf-input cf-input--inline"
                aria-label="Member name"
                defaultValue={m.name}
                key={m.name}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== m.name) updateMeta(ctx, { members: meta.members.map((x) => (x.id === m.id ? { ...x, name: v } : x)) });
                }}
              />
              <Badge tone="accent">{m.role.toUpperCase()}</Badge>
            </li>
          ))}
        </ul>
      </Card>

      <ChecklistSettings />

      <Card title="Export and import">
        <div className="app-stack">
          <div className="app-row">
            <Button variant="primary" disabled={busy} onClick={() => void run("Export", () => exportCampaignBundle(ctx))} data-testid="export-bundle">
              Export bundle (.zip)
            </Button>
            <Button disabled={busy} onClick={() => void run("Export", () => exportCampaignJSON(ctx))}>
              Export JSON
            </Button>
          </div>
          <div className="app-row">
            <select className="cf-select" aria-label="Adventure to export" value={adventureId} onChange={(e) => setAdventureId(e.target.value)} disabled={adventures.length === 0}>
              <option value="">{adventures.length ? "Choose an adventure" : "No adventures yet"}</option>
              {adventures.map((a) => (
                <option key={a.id} value={a.id}>
                  {adventureTitle(a)}
                </option>
              ))}
            </select>
            <Button
              disabled={!adventureId || busy}
              onClick={() =>
                void run("Export", async () => {
                  const a = ctx.store.get("adventures", adventureId);
                  if (!a) return;
                  const docs = [a.playerIntroDoc, a.gmSituationDoc, a.epilogueDoc].filter((d): d is string => !!d);
                  for (const d of docs) await ctx.whenDocSynced(d);
                  const md = exportMarkdown(ctx.store, ctx.registry, { kind: "adventure", id: adventureId }, ctx.module.module);
                  downloadFile(md, `${slug(a.title)}.md`, "text/markdown");
                })
              }
            >
              Export adventure Markdown
            </Button>
          </div>
          <div className="app-row">
            <Button disabled={busy} onClick={() => fileRef.current?.click()}>
              Import bundle into this campaign…
            </Button>
            <span className="cf-muted">Records get new ids, so nothing here is overwritten.</span>
            <input
              ref={fileRef}
              type="file"
              accept=".zip,application/zip"
              hidden
              aria-label="Import bundle into this campaign"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                void run("Import", async () => {
                  const { records, installedSupplements, skippedSupplements } = await importBundleIntoCampaign(ctx, new Uint8Array(await file.arrayBuffer()));
                  pushToast(`Imported ${records} records`, { tone: "success" });
                  if (installedSupplements) pushToast(`Installed from the bundle: ${installedSupplements.join(", ")}. Reopen the campaign to use them.`, { tone: "success", timeout: 8000 });
                  if (skippedSupplements) pushToast(`Supplements not installed: ${skippedSupplements.join("; ")}`, { tone: "warning", timeout: 10000 });
                }).finally(() => {
                  if (fileRef.current) fileRef.current.value = "";
                });
              }}
            />
          </div>
        </div>
      </Card>

      <Card title="Game module" subtitle={`${manifest.name} ${manifest.version}`}>
        <div className="app-stack" data-testid="module-info">
          <p className="app-row">
            <span>
              {manifest.ruleset}
              {manifest.edition ? ` · ${manifest.edition}` : ""}
              {manifest.publisher ? ` · ${manifest.publisher}` : ""}
            </span>
            {entry?.source === "imported" ? <Badge tone="accent">Imported</Badge> : <Badge>Built-in</Badge>}
            {entry?.format === "pack" && <Badge>Data pack</Badge>}
          </p>
          {manifest.authors && manifest.authors.length > 0 && <p className="cf-muted">By {manifest.authors.join(", ")}</p>}
          {manifest.license && <ModuleLicenseView license={manifest.license} testId="module-attribution" />}
          {manifest.dataStatus !== "verified" && (
            <p className="app-note app-note--warning" data-testid="data-status">
              {manifest.dataStatus === "partially-verified"
                ? `Data partially verified against ${manifest.sourceBook?.title ?? "the rulebook"}: spot-checked, not checked line by line. Rows and stat lines may differ from the source.`
                : "Data unverified against the rulebook. Rows and stat lines may differ from the printed book."}
            </p>
          )}
          {manifest.sourceBook && (
            <p className="cf-muted">
              {manifest.citationStyle === "section" ? "Citations" : "Page references"}:{" "}
              {sourceUrl ? (
                <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
                  {manifest.sourceBook.title}
                </a>
              ) : (
                manifest.sourceBook.title
              )}
              {manifest.sourceBook.year ? ` (${manifest.sourceBook.year})` : ""}. {manifest.sourceBook.pageNote ?? ""}
            </p>
          )}
          <details>
            <summary>Licence notice</summary>
            <p className="app-licence">{manifest.licenseNotice}</p>
          </details>
          {warnings.length > 0 && (
            <details>
              <summary>
                {warnings.length} conformance warning{warnings.length === 1 ? "" : "s"}
              </summary>
              <ul className="app-issues">
                {warnings.map((w, i) => (
                  <li key={i}>
                    <code>{w.where}</code> {w.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </Card>

      <SupplementsCard />

      <Card title="Danger zone">
        <Button variant="danger" onClick={() => setConfirmDelete(true)}>
          Delete campaign
        </Button>
      </Card>

      <ConfirmDialog
        open={pendingMode !== undefined}
        title="Change play mode?"
        confirmLabel="Change mode"
        onCancel={() => setPendingMode(undefined)}
        onConfirm={() => {
          if (pendingMode) updateMeta(ctx, { mode: pendingMode });
          setPendingMode(undefined);
        }}
      >
        <p>
          Sheets, rule cards, templates and generators follow the mode. Fields that only exist in the other mode stay stored but are hidden. Switch to{" "}
          <strong>{manifest.modes.find((m) => m.id === pendingMode)?.name}</strong>?
        </p>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirmDelete}
        title={`Delete “${meta.name}”?`}
        confirmLabel="Delete campaign"
        danger
        busy={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() =>
          void run("Delete", async () => {
            const id = ctx.campaignId;
            setConfirmDelete(false);
            await navigate({ to: "/" });
            await deleteCampaign(id);
            pushToast("Campaign deleted");
          })
        }
      >
        <p>Everything stored for this campaign on this device is removed. Export a bundle first if you want a backup.</p>
      </ConfirmDialog>
    </div>
  );
}

/** The supplements merged into this campaign's module, and any installed one that was left out. */
function SupplementsCard() {
  const ctx = useCampaign();
  const manifest = ctx.module.manifest;
  const active = manifest.supplements ?? [];
  const left = supplementProblems(manifest.id);
  return (
    <Card title="Supplements" subtitle={active.length > 0 ? `${active.length} active for ${manifest.name}` : undefined}>
      <div className="app-stack" data-testid="supplements-info">
        {active.length === 0 && left.length === 0 && <p className="cf-muted">No supplements extend this module on this device.</p>}
        {active.length > 0 && (
          <ul className="app-modules">
            {active.map((s) => {
              const meta = supplementMeta(s.id);
              return (
                <li key={s.id} className="app-module app-module--supplement" data-testid={`active-supplement-${s.id}`}>
                  <div className="app-module__head">
                    <strong>{s.name}</strong>
                    <span className="cf-mono cf-muted">{s.version}</span>
                    <Badge>Supplement</Badge>
                  </div>
                  {meta?.description && <p className="app-module__meta">{meta.description}</p>}
                  <p className="app-module__notice">{s.licenseNotice}</p>
                  {s.license && <ModuleLicenseView license={s.license} testId={`supplement-attribution-${s.id}`} />}
                </li>
              );
            })}
          </ul>
        )}
        {left.map((p) => (
          <p key={p.id} className="app-note app-note--warning" data-testid={`supplement-left-out-${p.id}`}>
            {supplementMeta(p.id)?.name ?? p.id} is installed but was left out: {p.issues[0]?.message ?? "it did not fit the module"}
          </p>
        ))}
        <p className="cf-muted">
          Installed supplements apply to every campaign that uses {manifest.name} on this device, and travel with an exported bundle. Add or remove them under Game modules on the campaign list.
          Generated content records the supplements that were active.
        </p>
      </div>
    </Card>
  );
}
