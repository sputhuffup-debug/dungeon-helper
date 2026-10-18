/** `/adventures`: adventure cards with a status filter and a "New adventure" dialog over the module's templates. */
import type { Adventure, AdventureStatus } from "@campaign-forge/core";
import type { Template } from "@campaign-forge/module-sdk";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Badge, Button, Dialog, EmptyState, PageRef, pushToast } from "../../components/ui";
import { errorMessage, relativeTime } from "../../lib/format";
import { instantiateAdventureTemplate, isTemplateAdventure } from "../../state/prepActions";
import { useCampaign, useList, useMeta } from "../../state/hooks";

export const ADVENTURE_STATUSES: AdventureStatus[] = ["planned", "active", "done"];

export function statusTone(status: AdventureStatus): "muted" | "accent" | "success" {
  return status === "active" ? "accent" : status === "done" ? "success" : "muted";
}

export function AdventuresPage() {
  const ctx = useCampaign();
  const search = useSearch({ from: "/c/$campaignId/adventures" });
  const navigate = useNavigate({ from: "/c/$campaignId/adventures" });
  const adventures = useList("adventures");
  const acts = useList("acts");
  const [creating, setCreating] = useState(false);
  const status = ADVENTURE_STATUSES.includes(search.status as AdventureStatus) ? (search.status as AdventureStatus) : undefined;

  const shown = useMemo(
    () =>
      adventures
        .filter((a) => !status || a.status === status)
        .sort((a, b) => ADVENTURE_STATUSES.indexOf(a.status) - ADVENTURE_STATUSES.indexOf(b.status) || (a.updated < b.updated ? 1 : -1)),
    [adventures, status],
  );
  const counts = useMemo(() => {
    const m = new Map<string, { acts: number; scenes: number }>();
    for (const a of adventures) {
      const own = acts.filter((x) => x.adventure === a.id);
      m.set(a.id, { acts: a.acts.length, scenes: own.reduce((n, x) => n + x.scenes.length, 0) });
    }
    return m;
  }, [adventures, acts]);

  return (
    <div className="app-page" data-testid="adventures-page">
      <header className="app-page__header">
        <div>
          <h1 className="app-title">Adventures</h1>
          <p className="cf-muted">Acts, scenes, events and handouts, from a module template or blank.</p>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)} data-testid="new-adventure">
          New adventure
        </Button>
      </header>

      <div className="app-filters" role="group" aria-label="Filter by status">
        <Button size="sm" active={!status} onClick={() => void navigate({ search: {}, replace: true })}>
          All <span className="cf-muted">{adventures.length}</span>
        </Button>
        {ADVENTURE_STATUSES.map((s) => (
          <Button key={s} size="sm" active={status === s} onClick={() => void navigate({ search: { status: s }, replace: true })}>
            {s[0]?.toUpperCase()}
            {s.slice(1)} <span className="cf-muted">{adventures.filter((a) => a.status === s).length}</span>
          </Button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          title={adventures.length ? "No adventures with this status" : "No adventures yet"}
          text="Start one from the module's template: acts, scenes, handouts and the intro are scaffolded for you."
          action={
            <Button variant="primary" onClick={() => setCreating(true)}>
              New adventure
            </Button>
          }
        />
      ) : (
        <ul className="app-cards" data-testid="adventure-cards">
          {shown.map((a) => (
            <AdventureCard key={a.id} adventure={a} counts={counts.get(a.id) ?? { acts: 0, scenes: 0 }} />
          ))}
        </ul>
      )}
      <NewAdventureDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function AdventureCard({ adventure, counts }: { adventure: Adventure; counts: { acts: number; scenes: number } }) {
  const ctx = useCampaign();
  const template = adventure.templateId ? ctx.module.template(adventure.templateId) : undefined;
  return (
    <li>
      <Link to="/c/$campaignId/adventures/$adventureId" params={{ campaignId: ctx.campaignId, adventureId: adventure.id }} search={{}} className="prep-adv-card" data-testid="adventure-card">
        <span className="prep-adv-card__head">
          <strong>{adventure.title}</strong>
          <Badge tone={statusTone(adventure.status)}>{adventure.status}</Badge>
        </span>
        {adventure.premise && <span className="cf-muted prep-adv-card__premise">{adventure.premise.replace(/[_*]/g, "")}</span>}
        <span className="app-row cf-muted">
          <span>
            {counts.acts} act{counts.acts === 1 ? "" : "s"} · {counts.scenes} scene{counts.scenes === 1 ? "" : "s"}
          </span>
          {template && <span>· {template.name}</span>}
          <span className="app-list__end">{relativeTime(adventure.updated)}</span>
        </span>
      </Link>
    </li>
  );
}

function NewAdventureDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ctx = useCampaign();
  const meta = useMeta();
  const navigate = useNavigate();
  const [allModes, setAllModes] = useState(false);
  const [templateId, setTemplateId] = useState<string | undefined>(undefined);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const templates = useMemo(() => {
    const list = allModes ? ctx.module.templatesFor("adventure") : ctx.module.templatesFor("adventure", meta.mode);
    return list.filter((t) => isTemplateAdventure(t.scaffold));
  }, [ctx.module, meta.mode, allModes]);
  const chosen: string = templateId === undefined ? (templates[0]?.id ?? "blank") : templateId;
  const modeName = (id: string) => ctx.module.manifest.modes.find((m) => m.id === id)?.name ?? id;

  const create = async () => {
    setBusy(true);
    try {
      const template: Template | undefined = chosen === "blank" ? undefined : ctx.module.template(chosen);
      const adventure = await instantiateAdventureTemplate(ctx, template, { title });
      onClose();
      setTitle("");
      setTemplateId(undefined);
      void navigate({ to: "/c/$campaignId/adventures/$adventureId", params: { campaignId: ctx.campaignId, adventureId: adventure.id }, search: {} });
    } catch (e) {
      pushToast(`Could not create the adventure: ${errorMessage(e)}`, { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New adventure"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void create()} disabled={busy} data-testid="create-adventure">
            Create adventure
          </Button>
        </>
      }
    >
      <form
        className="app-form"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <label className="app-label">
          <span>Title</span>
          <input className="cf-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Uses the template's title when empty" aria-label="Adventure title" />
        </label>
        <fieldset className="app-fieldset" aria-label="Template">
          <legend className="app-label">Template</legend>
          {templates.map((t) => {
            const scaffold = isTemplateAdventure(t.scaffold) ? t.scaffold : undefined;
            return (
              <label key={t.id} className="app-radio">
                <input type="radio" name="adventure-template" value={t.id} checked={chosen === t.id} onChange={() => setTemplateId(t.id)} aria-label={t.name} />
                <span>
                  <strong>{t.name}</strong> <PageRef page={t.page} />
                  {t.mode && t.mode.length > 0 && <span className="cf-muted"> · {t.mode.map(modeName).join(", ")}</span>}
                  <br />
                  <span className="cf-muted">
                    {t.description ?? ""} {scaffold ? `(${scaffold.acts.length} acts)` : ""}
                  </span>
                </span>
              </label>
            );
          })}
          <label className="app-radio">
            <input type="radio" name="adventure-template" value="blank" checked={chosen === "blank"} onChange={() => setTemplateId("blank")} aria-label="Blank" />
            <span>
              <strong>Blank</strong>
              <br />
              <span className="cf-muted">An empty adventure; add acts and scenes yourself.</span>
            </span>
          </label>
          <label className="app-toggle">
            <input type="checkbox" checked={allModes} onChange={(e) => setAllModes(e.target.checked)} />
            Show templates for other play modes
          </label>
        </fieldset>
      </form>
    </Dialog>
  );
}
