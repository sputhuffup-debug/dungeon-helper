/**
 * `/adventures/$adventureId`: the adventure builder. Header (title, premise,
 * status, hooks, tags, exports), an outline of acts and their ordered scenes,
 * and a pane that edits the selected node (overview, act or scene).
 * `?view=booklet|agendas` shows the print views instead. An adventure made
 * with a module builder opens in the guided view (`?step=`); `?view=outline`
 * shows this outline for it.
 */
import type { Act, Adventure, AdventureStatus, Id } from "@campaign-forge/core";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { TagInput } from "../../components/TagInput";
import { Badge, Button, EmptyState, IconButton, PageRef, pushToast } from "../../components/ui";
import { downloadFile, slug } from "../../lib/download";
import { errorMessage } from "../../lib/format";
import { addAct, addScene, deleteAct, deleteAdventure, deleteScene, moveAct, moveScene, updateAdventure } from "../../state/prepActions";
import { useCampaign, useList, useRecord } from "../../state/hooks";
import { ActEditor } from "./ActEditor";
import { ADVENTURE_STATUSES, statusTone } from "./AdventuresPage";
import { bookletMarkdown } from "./booklet";
import { CommitInput, CommitTextarea } from "./fields";
import { GuidedBuilder, ViewToggle } from "./guided/GuidedBuilder";
import { OverviewEditor } from "./OverviewEditor";
import { AgendaCardsView, BookletView } from "./PrintViews";
import { SceneEditor } from "./SceneEditor";

export function AdventurePage() {
  const { adventureId } = useParams({ from: "/c/$campaignId/adventures/$adventureId" });
  const search = useSearch({ from: "/c/$campaignId/adventures/$adventureId" });
  const ctx = useCampaign();
  const adventure = useRecord("adventures", adventureId);
  if (!adventure) {
    return (
      <div className="app-page">
        <EmptyState
          title="Adventure not found"
          text="It may have been deleted."
          action={
            <Link to="/c/$campaignId/adventures" params={{ campaignId: ctx.campaignId }} search={{}} className="cf-btn">
              All adventures
            </Link>
          }
        />
      </div>
    );
  }
  if (search.view === "booklet" || search.view === "booklet-print") return <BookletView adventure={adventure} autoPrint={search.view === "booklet-print"} />;
  if (search.view === "agendas" || search.view === "agendas-print") return <AgendaCardsView adventure={adventure} autoPrint={search.view === "agendas-print"} />;
  const builder = adventure.builderId ? ctx.module.builder(adventure.builderId) : undefined;
  if (builder && search.view !== "outline") return <GuidedBuilder adventure={adventure} builder={builder} stepId={search.step} />;
  return <Builder adventure={adventure} node={search.node} />;
}

type Pending = { kind: "act" | "scene" | "adventure"; id: Id; title: string } | undefined;

function Builder({ adventure, node }: { adventure: Adventure; node: string | undefined }) {
  const ctx = useCampaign();
  const navigate = useNavigate({ from: "/c/$campaignId/adventures/$adventureId" });
  const acts = useList("acts");
  const scenes = useList("scenes");
  const [confirm, setConfirm] = useState<Pending>(undefined);
  const [exporting, setExporting] = useState(false);
  const template = adventure.templateId ? ctx.module.template(adventure.templateId) : undefined;
  const guided = adventure.builderId ? ctx.module.builder(adventure.builderId) : undefined;

  const select = (n: string) => void navigate({ search: (prev) => ({ ...(prev.view === "outline" ? { view: "outline" } : {}), node: n }), replace: true });
  const actById = (id: Id) => acts.find((a) => a.id === id);
  const sceneById = (id: Id) => scenes.find((s) => s.id === id);

  const [kind, nodeId] = (node ?? "overview").split(":") as [string, string | undefined];
  const selectedAct = kind === "act" && nodeId ? actById(nodeId) : undefined;
  const selectedScene = kind === "scene" && nodeId ? sceneById(nodeId) : undefined;
  const current = selectedAct ? `act:${selectedAct.id}` : selectedScene ? `scene:${selectedScene.id}` : "overview";

  const onExport = async () => {
    setExporting(true);
    try {
      const md = await bookletMarkdown(ctx, adventure.id);
      downloadFile(md, `${slug(adventure.title)}.md`, "text/markdown");
    } catch (e) {
      pushToast(`Export failed: ${errorMessage(e)}`, { tone: "danger" });
    } finally {
      setExporting(false);
    }
  };

  const onAddAct = () => {
    const act = addAct(ctx, adventure.id);
    select(`act:${act.id}`);
  };
  const onAddScene = (act: Act) => {
    const s = addScene(ctx, act.id);
    select(`scene:${s.id}`);
  };

  const onConfirmDelete = () => {
    const p = confirm;
    setConfirm(undefined);
    if (!p) return;
    if (p.kind === "act") {
      deleteAct(ctx, p.id);
      select("overview");
    } else if (p.kind === "scene") {
      const s = sceneById(p.id);
      deleteScene(ctx, p.id);
      select(s?.act ? `act:${s.act}` : "overview");
    } else {
      deleteAdventure(ctx, p.id);
      void navigate({ to: "/c/$campaignId/adventures", params: { campaignId: ctx.campaignId }, search: {} });
    }
  };

  return (
    <div className="app-page prep-builder" data-testid="adventure-builder">
      <header className="prep-builder__header">
        <div className="app-stack prep-builder__meta">
          <p className="cf-muted">
            <Link to="/c/$campaignId/adventures" params={{ campaignId: ctx.campaignId }} search={{}} className="app-link-strong">
              Adventures
            </Link>{" "}
            <Badge tone={statusTone(adventure.status)}>{adventure.status}</Badge>
            {template && (
              <>
                {" "}
                · from {template.name} <PageRef page={template.page} />
              </>
            )}
          </p>
          {guided && <ViewToggle adventureId={adventure.id} current="outline" />}
          <CommitInput value={adventure.title} label="Adventure title" className="app-entity__name" onCommit={(v) => updateAdventure(ctx, adventure.id, { title: v.trim() || adventure.title })} testId="adventure-title" />
          <CommitTextarea value={adventure.premise ?? ""} label="Premise" placeholder="The premise in one paragraph" rows={2} onCommit={(v) => updateAdventure(ctx, adventure.id, { premise: v.trim() || undefined })} />
          <div className="prep-builder__lists">
            <div className="app-label">
              <span>Hooks in</span>
              <TagInput value={adventure.hooksIn} onChange={(hooksIn) => updateAdventure(ctx, adventure.id, { hooksIn })} label="Hooks in" placeholder="Add hook, Enter" />
            </div>
            <div className="app-label">
              <span>Hooks out</span>
              <TagInput value={adventure.hooksOut} onChange={(hooksOut) => updateAdventure(ctx, adventure.id, { hooksOut })} label="Hooks out" placeholder="Add hook, Enter" />
            </div>
            <div className="app-label">
              <span>Tags</span>
              <TagInput value={adventure.tags} onChange={(tags) => updateAdventure(ctx, adventure.id, { tags })} />
            </div>
          </div>
        </div>
        <div className="app-stack prep-builder__actions">
          <label className="app-label">
            <span>Status</span>
            <select className="cf-select" aria-label="Adventure status" value={adventure.status} onChange={(e) => updateAdventure(ctx, adventure.id, { status: e.target.value as AdventureStatus })}>
              {ADVENTURE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <Button onClick={() => void onExport()} disabled={exporting} data-testid="export-booklet">
            Export booklet (Markdown)
          </Button>
          <Link to="/c/$campaignId/adventures/$adventureId" params={{ campaignId: ctx.campaignId, adventureId: adventure.id }} search={{ view: "booklet-print" }} className="cf-btn" data-testid="print-booklet">
            Print booklet
          </Link>
          <Link to="/c/$campaignId/adventures/$adventureId" params={{ campaignId: ctx.campaignId, adventureId: adventure.id }} search={{ view: "agendas-print" }} className="cf-btn" data-testid="agenda-cards-link">
            Agenda cards
          </Link>
          <Button variant="ghost" onClick={() => setConfirm({ kind: "adventure", id: adventure.id, title: adventure.title })}>
            Delete adventure
          </Button>
        </div>
      </header>

      <div className="prep-builder__body">
        <nav className="prep-outline" aria-label="Outline" data-testid="outline">
          <button type="button" className={`prep-outline__node${current === "overview" ? " is-active" : ""}`} onClick={() => select("overview")}>
            Overview
          </button>
          <ol className="prep-outline__acts">
            {adventure.acts.map((actId, ai) => {
              const act = actById(actId);
              if (!act) return null;
              const actKey = `act:${act.id}`;
              return (
                <li key={act.id} className="prep-outline__act" data-testid="outline-act">
                  <div className={`prep-outline__row${current === actKey ? " is-active" : ""}`}>
                    <button type="button" className="prep-outline__node prep-outline__node--act" onClick={() => select(actKey)}>
                      Act {act.number}
                      {act.title ? `: ${act.title}` : ""}
                    </button>
                    <span className="prep-outline__tools">
                      <IconButton size="sm" variant="ghost" label={`Move act ${act.number} up`} icon="↑" disabled={ai === 0} onClick={() => moveAct(ctx, act.id, -1)} />
                      <IconButton size="sm" variant="ghost" label={`Move act ${act.number} down`} icon="↓" disabled={ai === adventure.acts.length - 1} onClick={() => moveAct(ctx, act.id, 1)} />
                      <IconButton size="sm" variant="ghost" label={`Delete act ${act.number}`} icon="×" onClick={() => setConfirm({ kind: "act", id: act.id, title: `Act ${act.number}${act.title ? `: ${act.title}` : ""}` })} />
                    </span>
                  </div>
                  <ol className="prep-outline__scenes">
                    {act.scenes.map((sceneId, si) => {
                      const scene = sceneById(sceneId);
                      if (!scene) return null;
                      const sceneKey = `scene:${scene.id}`;
                      const mandatory = scene.events.some((e) => e.mandatory) || scene.tags.includes("mandatory");
                      return (
                        <li key={scene.id} className={`prep-outline__row${current === sceneKey ? " is-active" : ""}`} data-testid="outline-scene">
                          <button type="button" className="prep-outline__node" onClick={() => select(sceneKey)}>
                            <span className={`prep-outline__dot prep-outline__dot--${scene.status}`} aria-hidden="true" />
                            {scene.title}
                            {mandatory && <span className="prep-outline__flag" title="Has mandatory events">!</span>}
                          </button>
                          <span className="prep-outline__tools">
                            <IconButton size="sm" variant="ghost" label={`Move ${scene.title} up`} icon="↑" disabled={si === 0} onClick={() => moveScene(ctx, scene.id, -1)} />
                            <IconButton size="sm" variant="ghost" label={`Move ${scene.title} down`} icon="↓" disabled={si === act.scenes.length - 1} onClick={() => moveScene(ctx, scene.id, 1)} />
                            <IconButton size="sm" variant="ghost" label={`Delete ${scene.title}`} icon="×" onClick={() => setConfirm({ kind: "scene", id: scene.id, title: scene.title })} />
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                  <Button size="sm" variant="ghost" className="prep-outline__add" onClick={() => onAddScene(act)} aria-label={`Add scene to act ${act.number}`}>
                    + Scene
                  </Button>
                </li>
              );
            })}
          </ol>
          <Button size="sm" onClick={onAddAct} data-testid="add-act">
            + Act
          </Button>
        </nav>

        <section className="prep-builder__pane" aria-label="Editor">
          {selectedAct ? (
            <ActEditor key={selectedAct.id} act={selectedAct} />
          ) : selectedScene ? (
            <>
              {selectedScene.act && actById(selectedScene.act) && (
                <p className="cf-muted">
                  <button type="button" className="app-linkbtn" onClick={() => select(`act:${selectedScene.act}`)}>
                    Act {actById(selectedScene.act)?.number}
                    {actById(selectedScene.act)?.title ? `: ${actById(selectedScene.act)?.title}` : ""}
                  </button>{" "}
                  / <Badge tone={selectedScene.status === "run" ? "success" : selectedScene.status === "skipped" ? "warning" : "muted"}>{selectedScene.status}</Badge>
                </p>
              )}
              <SceneEditor key={selectedScene.id} scene={selectedScene} />
            </>
          ) : (
            <OverviewEditor adventure={adventure} onSelect={select} />
          )}
        </section>
      </div>

      <ConfirmDialog open={!!confirm} title={`Delete ${confirm?.title ?? ""}?`} danger confirmLabel="Delete" onCancel={() => setConfirm(undefined)} onConfirm={onConfirmDelete}>
        <p>
          {confirm?.kind === "adventure"
            ? "Its acts, scenes and handouts are removed too."
            : confirm?.kind === "act"
              ? "Its scenes and handouts are removed too."
              : "The scene and its handouts are removed."}
        </p>
      </ConfirmDialog>
    </div>
  );
}
