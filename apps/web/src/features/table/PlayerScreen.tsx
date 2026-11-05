/**
 * The shared screen for the players (`?view=players`, opened in its own
 * window): the clock, the current scene's read-aloud text, the scene's
 * generated map with fog (player projection only) and the handouts the GM
 * put on it (revealed this session since the last "Clear the screen", and
 * the pinned ones). Read-only, with no rulebook page refs; it follows the
 * GM's tab through the cross-tab sync of the same local store. The scene's
 * heading is its player-facing one (`playerSceneHeading`), never the GM's
 * title.
 */
import { canSee, canSeeField, isPlayerCharacter, ownerMemberOf, playerSceneHeading, SHARE_VIEWER, type Entity, type Handout, type Id, type Viewer } from "@campaign-forge/core";
import { ruleFieldInputs, type D20CombatantDef, type EntityTypeDef } from "@campaign-forge/module-sdk";
import { useMemo } from "react";
import { Badge, EmptyState, HidePageRefs } from "../../components/ui";
import { combatantOf, combatOrder } from "../../state/d20Actions";
import { useCampaign } from "../../state/hooks";
import { hpState } from "./D20Combat";
import { useSessionTrackerState } from "./hooks";
import { RichTextView } from "../../editor";
import { useAssetUrl, useDocHasText, useList, useMeta, useRecord, useWorldDate } from "../../state/hooks";
import { useTableState } from "./hooks";
import { PlayerSiteMap } from "./PlayerSiteMap";
import { useSceneMap } from "./SceneMap";
import { BoundTracker, useModeTrackers } from "./TrackersPanel";
import { CrewNotesView } from "../arcs/CrewNotesView";
import { arcsDefOf, crewNotesFor } from "../../state/arcActions";
import { useMapVersion } from "../../state/hooks";
import { playerRecapFor } from "../../state/recapActions";
import { PlayerRecapView } from "../sessions/RecapText";
import { playerScreenHandouts } from "../../state/tableActions";

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

const STATE_LABEL = { unhurt: "Unhurt", hurt: "Hurt", bloodied: "Bloodied", down: "Down" } as const;

/**
 * May the table read this character's hit points: every field they come
 * from is visible to all the players, or to the player who plays it (an
 * owner-visible field of a PC the GM keeps from the others).
 */
function hitPointsShown(e: Entity, def: EntityTypeDef | undefined, cb: D20CombatantDef, owner: Viewer | undefined): boolean {
  if (!def) return false;
  const paths = [...(cb.hp.current ? [cb.hp.current] : []), ...(cb.hp.damage ? [cb.hp.damage] : []), ...ruleFieldInputs(def, cb.hp.max)];
  return [SHARE_VIEWER, ...(owner ? [owner] : [])].some((v) => paths.every((p) => canSeeField(e, def, p, v)));
}

/**
 * The fight as the players may see it, when the module's d20 combat says so
 * (`playerHealth`): the round, whose turn it is, and each combatant the
 * players can see. Player characters are always there by name (the players
 * play them), with their hit points when the players may see them, else how
 * hurt they look; creatures only how hurt they look. Combatants the GM keeps
 * hidden are left out, and a fight with none to show says so.
 */
function PlayerCombat({ sessionId }: { sessionId: Id }) {
  const ctx = useCampaign();
  const ts = useSessionTrackerState(sessionId);
  const entities = useList("entities");
  const def = ctx.module.module.d20Combat;
  const order = useMemo(() => (def?.playerHealth ? combatOrder(ctx, sessionId) : undefined), [ctx, sessionId, ts, def]);
  if (!def?.playerHealth || !order || order.order.length === 0) return null;
  const meta = ctx.store.meta();
  const rows = order.order.flatMap((p) => {
    const e = entities.find((x) => x.id === p.entityId);
    if (!e) return [];
    const typeDef = ctx.module.entityType(e.type);
    // a player character is in the fight by name even while the GM keeps its sheet from the players
    const pc = typeDef?.kind === "character" && isPlayerCharacter(e, ctx.module.module);
    if (!pc && !canSee(e.visibility, SHARE_VIEWER)) return [];
    const view = combatantOf(ctx, e);
    if (!view) return [];
    const ownerMember = pc ? ownerMemberOf(meta, e) : undefined;
    const owner: Viewer | undefined = ownerMember ? { role: "player", memberId: ownerMember.id, characters: [e.id] } : undefined;
    const showHp = pc && hitPointsShown(e, typeDef, view.def, owner);
    return [{ p, e, showHp, hp: view.hp, state: hpState(view.hp.current, view.hp.max) }];
  });
  return (
    <section className="app-player__combat" aria-label="Combat" data-testid="player-combat">
      <h2 className="app-subtitle">
        Combat <Badge tone="accent">Round {order.round}</Badge>
      </h2>
      {rows.length === 0 && <p className="cf-muted" data-testid="player-combat-empty">Everyone in this fight is hidden from the players for now.</p>}
      <ol className="app-player__combatants">
        {rows.map(({ p, e, showHp, hp, state }) => (
          <li key={p.id} className={order.current?.id === p.id ? "app-player__combatant app-player__combatant--current" : "app-player__combatant"} data-combatant={e.id}>
            <span>{e.name}</span>
            {showHp ? (
              <Badge tone={state === "down" ? "danger" : state === "bloodied" ? "warning" : "muted"}>
                HP {hp.current}/{hp.max}
              </Badge>
            ) : (
              <Badge tone={state === "down" ? "danger" : state === "bloodied" ? "warning" : "muted"}>{STATE_LABEL[state]}</Badge>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The whole crew's notes, when the module keeps arcs (nothing one player learnt alone). */
function PlayerCrewNotes() {
  const ctx = useCampaign();
  const meta = useMeta();
  const version = useMapVersion("*");
  const def = arcsDefOf(ctx.module, meta.mode);
  const notes = useMemo(() => (def ? crewNotesFor(ctx) : undefined), [ctx, def, version]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!notes || notes.empty) return null;
  return (
    <div className="app-player__notes">
      <CrewNotesView notes={notes} compact />
    </div>
  );
}

/**
 * A clue the GM revealed from the table ("This job"): only what the whole
 * crew's notes say about it (the player projection), once it is found.
 */
function PlayerSpotlight({ spotlight }: { spotlight: { thread: string; clue: string } | undefined }) {
  const ctx = useCampaign();
  const meta = useMeta();
  const version = useMapVersion("*");
  const def = arcsDefOf(ctx.module, meta.mode);
  const found = useMemo(() => {
    if (!def || !spotlight) return undefined;
    const thread = crewNotesFor(ctx).threads.find((t) => t.id === spotlight.thread);
    const clue = thread?.clues.find((c) => c.id === spotlight.clue && !c.personal);
    return thread && clue ? { thread: thread.title, text: clue.text } : undefined;
  }, [ctx, def, spotlight, version]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!found) return null;
  return (
    <section className="app-player__spotlight" aria-label="Just found" data-testid="player-spotlight">
      <h2 className="app-subtitle">Just found</h2>
      <p className="app-player__spotlight-text">{found.text}</p>
      <p className="cf-muted">{found.thread}</p>
    </section>
  );
}

/** The "Previously on…" read-aloud, while the GM shows it (the player projection's recap only). */
function PlayerRecap({ sessionId }: { sessionId: Id }) {
  const ctx = useCampaign();
  const version = useMapVersion("*");
  const recap = useMemo(() => playerRecapFor(ctx, sessionId, { requireShown: true }), [ctx, sessionId, version]); // eslint-disable-line react-hooks/exhaustive-deps
  return recap ? <PlayerRecapView recap={recap} /> : null;
}

export function PlayerScreen({ sessionId }: { sessionId: Id }) {
  const ctx = useCampaign();
  const meta = useMeta();
  const table = useTableState(sessionId);
  const scene = useRecord("scenes", table.sceneId);
  const map = useSceneMap(scene);
  const hasReadAloud = useDocHasText(scene?.readAloudDoc);
  const clock = useModeTrackers().find((t) => t.kind === "clock");
  const all = useList("handouts");
  const ts = useSessionTrackerState(sessionId);
  const session = useRecord("sessions", sessionId);
  const worldDate = useWorldDate();
  const handouts = useMemo(() => playerScreenHandouts(ctx, sessionId), [all, ts, session, sessionId, ctx]); // eslint-disable-line react-hooks/exhaustive-deps
  const acts = useList("acts");
  const entities = useList("entities");
  // the players' heading: the scene's player title, its visible location or its number, never the GM's title
  const heading = useMemo(
    () => (scene ? playerSceneHeading({ acts: Object.fromEntries(acts.map((a) => [a.id, a])), entities: Object.fromEntries(entities.map((e) => [e.id, e])) }, scene) : undefined),
    [scene, acts, entities],
  );
  return (
    <HidePageRefs>
    <div className="cf-table-mode app-table app-player" data-testid="player-screen">
      <header className="app-table__header">
        <strong className="app-player__campaign">{meta.name}</strong>
        {meta.currentDate && (
          <span className="cf-muted" data-testid="player-screen-date">
            {worldDate(meta.currentDate)}
          </span>
        )}
      </header>
      {clock && (
        <div className="app-table__clock">
          <BoundTracker sessionId={sessionId} def={clock} entities={[]} readonly onEffects={noop} onLog={noop} onRollOperation={noop} />
        </div>
      )}
      <div className="app-player__grid">
        <PlayerRecap sessionId={sessionId} />
        <PlayerSpotlight spotlight={table.spotlight} />
        <section className="app-player__scene" aria-label="Scene">
          {scene ? (
            <>
              <h2 className="app-player__scene-title" data-testid="player-scene-title">{heading}</h2>
              {/* an empty read-aloud shows nothing, not an empty bar */}
              {scene.readAloudDoc && hasReadAloud ? <RichTextView docId={scene.readAloudDoc} className="app-table__readaloud-text" /> : null}
              {map?.layout && <PlayerSiteMap map={map} />}
            </>
          ) : (
            <EmptyState title="Waiting for the GM" />
          )}
        </section>
        <PlayerCombat sessionId={sessionId} />
        <section className="app-player__handouts" aria-label="Handouts">
          <h2 className="app-subtitle">Handouts</h2>
          {handouts.length === 0 ? <p className="cf-muted">Nothing on the screen yet.</p> : handouts.map((h) => <PlayerHandout key={h.id} handout={h} />)}
        </section>
        <PlayerCrewNotes />
      </div>
    </div>
    </HidePageRefs>
  );
}
