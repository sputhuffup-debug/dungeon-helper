/**
 * The shared screen for the players (`?view=players`, opened in its own
 * window): the clock, the current scene's read-aloud text, the scene's
 * generated map with fog (player projection only) and every handout the
 * players may see. Read-only; it follows the GM's tab through the
 * cross-tab sync of the same local store.
 */
import { canSee, type Handout, type Id } from "@campaign-forge/core";
import { useMemo } from "react";
import { EmptyState } from "../../components/ui";
import { RichTextView } from "../../editor";
import { useAssetUrl, useList, useMeta, useRecord } from "../../state/hooks";
import { useTableState } from "./hooks";
import { PlayerSiteMap } from "./PlayerSiteMap";
import { useSceneMap } from "./SceneMap";
import { BoundTracker, useModeTrackers } from "./TrackersPanel";

const noop = () => undefined;

function PlayerHandout({ handout }: { handout: Handout }) {
  const url = useAssetUrl(handout.asset);
  return (
    <article className="app-player__handout" data-handout={handout.id}>
      <h3 className="app-player__handout-title">{handout.title}</h3>
      {url && <img src={url} alt={handout.title} className="app-reveal__image" />}
      {handout.bodyDoc && <RichTextView docId={handout.bodyDoc} />}
    </article>
  );
}

export function PlayerScreen({ sessionId }: { sessionId: Id }) {
  const meta = useMeta();
  const table = useTableState(sessionId);
  const scene = useRecord("scenes", table.sceneId);
  const map = useSceneMap(scene);
  const clock = useModeTrackers().find((t) => t.kind === "clock");
  const all = useList("handouts");
  const handouts = useMemo(
    () => all.filter((h) => canSee(h.visibility, { role: "player" })).sort((a, b) => (b.revealedIn === sessionId ? 1 : 0) - (a.revealedIn === sessionId ? 1 : 0) || b.updated.localeCompare(a.updated)),
    [all, sessionId],
  );
  return (
    <div className="cf-table-mode app-table app-player" data-testid="player-screen">
      <header className="app-table__header">
        <strong className="app-player__campaign">{meta.name}</strong>
        {meta.currentDate && <span className="cf-muted">{meta.currentDate}</span>}
      </header>
      {clock && (
        <div className="app-table__clock">
          <BoundTracker sessionId={sessionId} def={clock} entities={[]} readonly onEffects={noop} onLog={noop} onRollOperation={noop} />
        </div>
      )}
      <div className="app-player__grid">
        <section className="app-player__scene" aria-label="Scene">
          {scene ? (
            <>
              <h2 className="app-player__scene-title">{scene.title}</h2>
              {scene.readAloudDoc ? <RichTextView docId={scene.readAloudDoc} className="app-table__readaloud-text" /> : null}
              {map?.layout && <PlayerSiteMap map={map} />}
            </>
          ) : (
            <EmptyState title="Waiting for the GM" />
          )}
        </section>
        <section className="app-player__handouts" aria-label="Handouts">
          <h2 className="app-subtitle">Handouts</h2>
          {handouts.length === 0 ? <p className="cf-muted">Nothing revealed yet.</p> : handouts.map((h) => <PlayerHandout key={h.id} handout={h} />)}
        </section>
      </div>
    </div>
  );
}
