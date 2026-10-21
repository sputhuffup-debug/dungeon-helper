/**
 * Game modules on this device: the built-in modules and the data packs the GM
 * imported, with version, licence and attribution. Import a pack (its main
 * file plus any parts), see why one fails validation, or remove one.
 */
import { listCampaigns, type CampaignIndexEntry } from "@campaign-forge/core";
// Types only: the SDK (and its validator) loads when a pack is imported, not with the campaign list.
import type { PackIssue } from "@campaign-forge/module-sdk";
import { useRef, useState } from "react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Badge, Button, Dialog, pushToast } from "../../components/ui";
import { errorMessage } from "../../lib/format";
import { importPackFiles, PackImportError, readPackFiles } from "../../modules/importPack";
import { removeImportedModule, type ModuleEntry } from "../../modules/registry";
import { useModuleList } from "../../modules/useModules";
import { ModuleLicenseView } from "./ModuleLicense";

const MAX_SHOWN = 60;

const issueText = (i: PackIssue) => `${i.file ? `${i.file}: ` : ""}${i.path}${i.item ? ` (${i.item})` : ""}: ${i.message}`;

function sizeText(bytes: number | undefined): string {
  if (!bytes) return "";
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} kB`;
}

function ModuleRow({ entry, onRemove }: { entry: ModuleEntry; onRemove: (e: ModuleEntry) => void }) {
  return (
    <li className="app-module" data-testid={`module-${entry.id}`}>
      <div className="app-module__head">
        <strong>{entry.name}</strong>
        <span className="cf-mono cf-muted">{entry.version}</span>
        {entry.source === "imported" ? <Badge tone="accent">Imported</Badge> : <Badge>Built-in</Badge>}
        {entry.format === "pack" && <Badge>Data pack</Badge>}
        {entry.dev && <Badge tone="warning">Fixture</Badge>}
        {entry.dataStatus !== "verified" && <Badge tone="warning">{entry.dataStatus}</Badge>}
        {entry.source === "imported" && (
          <Button size="sm" variant="ghost" onClick={() => onRemove(entry)} data-testid={`remove-module-${entry.id}`}>
            Remove
          </Button>
        )}
      </div>
      <p className="cf-muted app-module__meta">
        <span className="cf-mono">{entry.id}</span>
        {entry.ruleset ? ` · ${entry.ruleset}` : ""}
        {entry.publisher ? ` · ${entry.publisher}` : ""}
        {` · ${entry.modes.map((m) => m.name).join(", ")}`}
        {entry.importedAt ? ` · imported ${new Date(entry.importedAt).toLocaleDateString()}` : ""}
        {entry.bytes ? ` · ${sizeText(entry.bytes)}` : ""}
      </p>
      {entry.license && <ModuleLicenseView license={entry.license} testId={`module-licence-${entry.id}`} />}
    </li>
  );
}

function IssueList({ issues }: { issues: PackIssue[] }) {
  const errors = issues.filter((i) => i.severity === "error");
  const shown = (errors.length > 0 ? errors : issues).slice(0, MAX_SHOWN);
  return (
    <div className="app-module-issues" role="alert" data-testid="pack-errors">
      <ul className="app-issues">
        {shown.map((i, n) => (
          <li key={n}>
            <code>{`${i.file ? `${i.file}: ` : ""}${i.path}`}</code>
            {i.item ? <span className="cf-muted"> ({i.item})</span> : null} {i.message}
          </li>
        ))}
      </ul>
      {issues.length > shown.length && <p className="cf-muted">…and {issues.length - shown.length} more.</p>}
    </div>
  );
}

export function ModulesDialog({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported?: (entry: ModuleEntry) => void }) {
  const modules = useModuleList();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ message: string; issues: PackIssue[] } | undefined>();
  const [toRemove, setToRemove] = useState<{ entry: ModuleEntry; campaigns: CampaignIndexEntry[] } | undefined>();

  const onFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setBusy(true);
    setFailure(undefined);
    try {
      const result = await importPackFiles(await readPackFiles(list));
      const what = `${result.entry.name} ${result.entry.version}`;
      pushToast(result.replaced ? `Updated ${result.entry.name} from ${result.replaced} to ${result.entry.version}` : `Imported ${what}`, { tone: "success" });
      if (result.warnings.length > 0) pushToast(`${result.warnings.length} warning(s): ${issueText(result.warnings[0]!)}`, { tone: "warning", timeout: 8000 });
      onImported?.(result.entry);
    } catch (e) {
      setFailure(e instanceof PackImportError ? { message: e.message, issues: e.issues } : { message: errorMessage(e), issues: [] });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const askRemove = async (entry: ModuleEntry) => {
    let campaigns: CampaignIndexEntry[] = [];
    try {
      campaigns = (await listCampaigns()).filter((c) => c.moduleId === entry.id);
    } catch {
      /* the warning just lists nothing */
    }
    setToRemove({ entry, campaigns });
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title="Game modules"
        className="app-modules-dialog"
        footer={
          <Button variant="primary" disabled={busy} onClick={() => fileRef.current?.click()} data-testid="import-pack">
            {busy ? "Checking…" : "Import data pack…"}
          </Button>
        }
      >
        <p className="cf-muted">
          A data pack adds a game system as JSON: entity types, sheets, tables, rule cards, generators. It is checked before it is stored on this device, and nothing in it runs as code. Choose
          the pack&apos;s main file, together with its part files if it has any.
        </p>
        <input ref={fileRef} type="file" accept=".json,application/json" multiple hidden aria-label="Data pack files" data-testid="pack-file-input" onChange={(e) => void onFiles(e.target.files)} />
        {failure && (
          <div className="app-note app-note--warning">
            <p>
              <strong>Not imported.</strong> {failure.message}
            </p>
            {failure.issues.length > 0 && <IssueList issues={failure.issues} />}
          </div>
        )}
        <ul className="app-modules" aria-label="Game modules">
          {modules.map((m) => (
            <ModuleRow key={m.id} entry={m} onRemove={(e) => void askRemove(e)} />
          ))}
        </ul>
      </Dialog>
      <ConfirmDialog
        open={!!toRemove}
        title={`Remove “${toRemove?.entry.name ?? ""}”?`}
        confirmLabel="Remove module"
        danger
        busy={busy}
        onCancel={() => setToRemove(undefined)}
        onConfirm={async () => {
          if (!toRemove) return;
          setBusy(true);
          try {
            await removeImportedModule(toRemove.entry.id);
            pushToast(`Removed ${toRemove.entry.name}`);
          } catch (e) {
            pushToast(`Remove failed: ${errorMessage(e)}`, { tone: "danger" });
          } finally {
            setBusy(false);
            setToRemove(undefined);
          }
        }}
      >
        {toRemove && toRemove.campaigns.length > 0 ? (
          <div data-testid="remove-module-warning">
            <p>
              {toRemove.campaigns.length === 1 ? "One campaign uses" : `${toRemove.campaigns.length} campaigns use`} this module. {toRemove.campaigns.length === 1 ? "It" : "They"} will not open until
              you import the pack again (a campaign bundle exported earlier carries a copy of it).
            </p>
            <ul>
              {toRemove.campaigns.map((c) => (
                <li key={c.id}>{c.name}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p>No campaign on this device uses it. You can import it again at any time.</p>
        )}
      </ConfirmDialog>
    </>
  );
}
