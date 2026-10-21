/**
 * Game modules on this device: the built-in modules and the data packs the GM
 * imported, with version, licence and attribution, and under each module the
 * supplements that extend it. Import a pack (its main file plus any parts) or
 * a supplement, see why one fails validation, or remove one.
 */
import { listCampaigns, type CampaignIndexEntry, type InstalledSupplementMeta } from "@campaign-forge/core";
// Types only: the SDK (and its validator) loads when a pack is imported, not with the campaign list.
import type { PackIssue } from "@campaign-forge/module-sdk";
import { useRef, useState } from "react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Badge, Button, Dialog, pushToast } from "../../components/ui";
import { errorMessage } from "../../lib/format";
import { importFiles, isSupplementResult, PackImportError, readPackFiles } from "../../modules/importPack";
import { listSupplements, removeImportedModule, removeSupplement, supplementProblems, type ModuleEntry } from "../../modules/registry";
import { useModuleList } from "../../modules/useModules";
import { ModuleLicenseView } from "./ModuleLicense";

const MAX_SHOWN = 60;

const issueText = (i: PackIssue) => `${i.file ? `${i.file}: ` : ""}${i.path}${i.item ? ` (${i.item})` : ""}: ${i.message}`;

function sizeText(bytes: number | undefined): string {
  if (!bytes) return "";
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} kB`;
}

const COUNT_NAMES: Record<string, [string, string]> = {
  referenceItems: ["list item", "list items"],
  referenceLists: ["list", "lists"],
  presets: ["preset", "presets"],
  tables: ["table", "tables"],
  procedures: ["generator", "generators"],
  templates: ["template", "templates"],
  rules: ["rule card", "rule cards"],
  playGuides: ["play guide", "play guides"],
};

/** "38 list items, 1 rule card" */
export function supplementCountText(counts: Record<string, number>): string {
  return Object.entries(counts)
    .map(([k, n]) => `${n} ${(COUNT_NAMES[k] ?? [k, k])[n === 1 ? 0 : 1]}`)
    .join(", ");
}

function SupplementRow({ s, onRemove }: { s: InstalledSupplementMeta; onRemove: (s: InstalledSupplementMeta) => void }) {
  const problems = supplementProblems(s.extends.module).find((p) => p.id === s.id);
  return (
    <li className="app-module app-module--supplement" data-testid={`supplement-${s.id}`}>
      <div className="app-module__head">
        <strong>{s.name}</strong>
        <span className="cf-mono cf-muted">{s.version}</span>
        <Badge tone="accent">Imported</Badge>
        <Badge>Supplement</Badge>
        {problems && <Badge tone="warning">Not applied</Badge>}
        <Button size="sm" variant="ghost" onClick={() => onRemove(s)} data-testid={`remove-supplement-${s.id}`}>
          Remove
        </Button>
      </div>
      <p className="cf-muted app-module__meta">
        <span className="cf-mono">{s.id}</span>
        {` · extends ${s.extends.module}${s.extends.version ? ` ${s.extends.version}` : ""}`}
        {Object.keys(s.counts).length > 0 ? ` · adds ${supplementCountText(s.counts)}` : ""}
        {s.authors && s.authors.length > 0 ? ` · by ${s.authors.join(", ")}` : ""}
        {` · imported ${new Date(s.importedAt).toLocaleDateString()}`}
        {s.bytes ? ` · ${sizeText(s.bytes)}` : ""}
      </p>
      {s.description && <p className="app-module__meta">{s.description}</p>}
      <p className="app-module__notice" data-testid={`supplement-notice-${s.id}`}>
        {s.licenseNotice}
      </p>
      {s.license && <ModuleLicenseView license={s.license} testId={`supplement-licence-${s.id}`} />}
      {problems && (
        <p className="app-note app-note--warning" data-testid={`supplement-problems-${s.id}`}>
          Left out when {s.extends.module} last loaded: {problems.issues.slice(0, 3).map(issueText).join("; ")}
        </p>
      )}
    </li>
  );
}

function ModuleRow({ entry, supplements, onRemove, onRemoveSupplement }: { entry: ModuleEntry; supplements: InstalledSupplementMeta[]; onRemove: (e: ModuleEntry) => void; onRemoveSupplement: (s: InstalledSupplementMeta) => void }) {
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
      {supplements.length > 0 && (
        <ul className="app-modules app-modules--supplements" aria-label={`Supplements for ${entry.name}`}>
          {supplements.map((s) => (
            <SupplementRow key={s.id} s={s} onRemove={onRemoveSupplement} />
          ))}
        </ul>
      )}
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
  const [supplementToRemove, setSupplementToRemove] = useState<{ s: InstalledSupplementMeta; campaigns: CampaignIndexEntry[] } | undefined>();
  const supplements = listSupplements();
  const moduleIds = new Set(modules.map((m) => m.id));
  const orphans = supplements.filter((s) => !moduleIds.has(s.extends.module));

  const onFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setBusy(true);
    setFailure(undefined);
    try {
      const result = await importFiles(await readPackFiles(list));
      if (isSupplementResult(result)) {
        const s = result.supplement;
        pushToast(result.replaced ? `Updated ${s.name} from ${result.replaced} to ${s.version}` : `Imported ${s.name} ${s.version} for ${result.base.name}`, { tone: "success" });
      } else {
        const what = `${result.entry.name} ${result.entry.version}`;
        pushToast(result.replaced ? `Updated ${result.entry.name} from ${result.replaced} to ${result.entry.version}` : `Imported ${what}`, { tone: "success" });
        onImported?.(result.entry);
      }
      if (result.warnings.length > 0) pushToast(`${result.warnings.length} warning(s): ${issueText(result.warnings[0]!)}`, { tone: "warning", timeout: 8000 });
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

  const askRemoveSupplement = async (s: InstalledSupplementMeta) => {
    let campaigns: CampaignIndexEntry[] = [];
    try {
      campaigns = (await listCampaigns()).filter((c) => c.moduleId === s.extends.module);
    } catch {
      /* the note just lists nothing */
    }
    setSupplementToRemove({ s, campaigns });
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
            {busy ? "Checking…" : "Import data pack or supplement…"}
          </Button>
        }
      >
        <p className="cf-muted">
          A data pack adds a game system as JSON: entity types, sheets, tables, rule cards, generators. A supplement adds options to a module you already have (list items such as
          backgrounds or subclasses, presets, tables, rule cards) and is listed under it. Both are checked before they are stored on this device, and nothing in them runs as code.
          Choose a pack&apos;s main file together with its part files, or one supplement file.
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
            <ModuleRow
              key={m.id}
              entry={m}
              supplements={supplements.filter((s) => s.extends.module === m.id)}
              onRemove={(e) => void askRemove(e)}
              onRemoveSupplement={(s) => void askRemoveSupplement(s)}
            />
          ))}
        </ul>
        {orphans.length > 0 && (
          <section data-testid="orphan-supplements">
            <h3 className="app-subtitle">Supplements for modules not on this device</h3>
            <ul className="app-modules">
              {orphans.map((s) => (
                <SupplementRow key={s.id} s={s} onRemove={(x) => void askRemoveSupplement(x)} />
              ))}
            </ul>
          </section>
        )}
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
      <ConfirmDialog
        open={!!supplementToRemove}
        title={`Remove “${supplementToRemove?.s.name ?? ""}”?`}
        confirmLabel="Remove supplement"
        danger
        busy={busy}
        onCancel={() => setSupplementToRemove(undefined)}
        onConfirm={async () => {
          if (!supplementToRemove) return;
          setBusy(true);
          try {
            await removeSupplement(supplementToRemove.s.id);
            pushToast(`Removed ${supplementToRemove.s.name}`);
          } catch (e) {
            pushToast(`Remove failed: ${errorMessage(e)}`, { tone: "danger" });
          } finally {
            setBusy(false);
            setSupplementToRemove(undefined);
          }
        }}
      >
        <div data-testid="remove-supplement-note">
          <p>
            Its list items, presets, tables and rule cards leave {supplementToRemove?.s.extends.module}. Sheets keep what was written on them (a background or subclass stays as text).
            {supplementToRemove && supplementToRemove.campaigns.length > 0
              ? ` ${supplementToRemove.campaigns.length === 1 ? "One campaign uses" : `${supplementToRemove.campaigns.length} campaigns use`} the module: ${supplementToRemove.campaigns.map((c) => c.name).join(", ")}.`
              : ""}
          </p>
        </div>
      </ConfirmDialog>
    </>
  );
}
