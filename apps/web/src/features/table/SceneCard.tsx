/** The current scene: navigation, read-aloud in large type, body, location, events, run / skip. */
import type { Id, Scene } from "@campaign-forge/core";
import { newId } from "@campaign-forge/core";
import { useState } from "react";
import { Badge, Button, Card, EmptyState } from "../../components/ui";
import { RichTextEditor, RichTextView } from "../../editor";
import { markScene, setCurrentScene, toggleSceneEvent } from "../../state/tableActions";
import { useCampaign, useRecord } from "../../state/hooks";

export interface SceneCardProps {
  sessionId: Id;
  scenes: Scene[];
  scene: Scene | undefined;
  onOpenEntity: (id: Id) => void;
}

const STATUS_TONE = { planned: "muted", run: "success", skipped: "warning" } as const;

export function SceneCard({ sessionId, scenes, scene, onOpenEntity }: SceneCardProps) {
  const ctx = useCampaign();
  const index = scene ? scenes.findIndex((s) => s.id === scene.id) : -1;
  const act = useRecord("acts", scene?.act);
  const adventure = useRecord("adventures", act?.adventure);
  const location = useRecord("entities", scene?.location);
  const [editing, setEditing] = useState(false);
  const go = (id: Id | undefined) => {
    setEditing(false);
    setCurrentScene(ctx, sessionId, id);
  };

  const nav = (
    <div className="app-row app-table__scene-nav">
      <Button onClick={() => go(scenes[index - 1]?.id)} disabled={index <= 0} aria-label="Previous scene">
        ← Prev
      </Button>
      <select className="cf-select app-table__scene-select" aria-label="Scene" value={scene?.id ?? ""} onChange={(e) => go(e.target.value || undefined)}>
        {!scene && <option value="">Choose a scene…</option>}
        {scenes.map((s, i) => (
          <option key={s.id} value={s.id}>
            {i + 1}. {s.title}
            {s.status !== "planned" ? ` (${s.status})` : ""}
          </option>
        ))}
      </select>
      <Button onClick={() => go(scenes[index + 1]?.id)} disabled={index < 0 || index >= scenes.length - 1} aria-label="Next scene">
        Next →
      </Button>
    </div>
  );

  if (!scene) {
    return (
      <Card title="Scene" className="app-table__scene">
        {scenes.length > 0 ? nav : null}
        <EmptyState title="No scene" text={scenes.length ? "Pick the scene the crew is in." : "This campaign has no scenes yet. Build them in an adventure, or run the session from the log alone."} />
      </Card>
    );
  }

  return (
    <Card
      className="app-table__scene"
      data-testid="scene-card"
      title={
        <span className="app-row">
          <span data-testid="scene-title">{scene.title}</span>
          <Badge tone={STATUS_TONE[scene.status]}>{scene.status}</Badge>
        </span>
      }
      subtitle={[adventure?.title, act ? `Act ${act.number}${act.title ? `: ${act.title}` : ""}` : undefined, `Scene ${index + 1} of ${scenes.length}`].filter(Boolean).join(" · ")}
    >
      {nav}
      {scene.purpose && <p className="app-table__purpose">{scene.purpose}</p>}
      {location && (
        <p className="app-row">
          <span className="cf-muted">Location</span>
          <button type="button" className="app-linkbtn" onClick={() => onOpenEntity(location.id)}>
            {location.name}
          </button>
        </p>
      )}
      <section aria-label="Read-aloud" className="app-table__readaloud">
        {scene.readAloudDoc ? (
          <>
            {editing ? (
              <RichTextEditor docId={scene.readAloudDoc} className="app-table__readaloud-text" label="Read-aloud text" placeholder="Read-aloud text for the players…" />
            ) : (
              <RichTextView docId={scene.readAloudDoc} className="app-table__readaloud-text" placeholder="No read-aloud text yet." />
            )}
            <Button size="sm" variant="ghost" onClick={() => setEditing(!editing)} active={editing}>
              {editing ? "Done editing" : "Edit read-aloud"}
            </Button>
          </>
        ) : (
          <div className="app-row">
            <span className="cf-muted">No read-aloud text.</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                ctx.store.update("scenes", scene.id, { readAloudDoc: newId() });
                setEditing(true);
              }}
            >
              Add read-aloud text
            </Button>
          </div>
        )}
      </section>
      <details className="app-table__body">
        <summary>Scene notes</summary>
        <RichTextView docId={scene.bodyDoc} placeholder="No notes." />
      </details>
      {scene.events.length > 0 && (
        <ul className="app-table__events" aria-label="Events">
          {scene.events.map((ev) => (
            <li key={ev.id} className={ev.done ? "is-done" : undefined}>
              <label className="app-toggle">
                <input type="checkbox" className="cf-checkbox" checked={!!ev.done} onChange={(e) => toggleSceneEvent(ctx, scene.id, ev.id, e.target.checked)} />
                <span>{ev.text}</span>
              </label>
              {ev.mandatory && <Badge tone="danger">mandatory</Badge>}
            </li>
          ))}
        </ul>
      )}
      <div className="app-row">
        <Button variant="primary" onClick={() => markScene(ctx, sessionId, scene.id, "run")} disabled={scene.status === "run"} data-testid="mark-run">
          Mark run
        </Button>
        <Button onClick={() => markScene(ctx, sessionId, scene.id, "skipped")} disabled={scene.status === "skipped"}>
          Skip
        </Button>
        {scene.status !== "planned" && (
          <Button variant="ghost" onClick={() => markScene(ctx, sessionId, scene.id, "planned")}>
            Reopen
          </Button>
        )}
      </div>
    </Card>
  );
}
