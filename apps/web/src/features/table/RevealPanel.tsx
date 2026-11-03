/**
 * Handouts (scene, act, adventure) and the scene's clues, revealed (or hidden
 * again) and logged with the scene; personal handouts go to their player, not
 * the shared screen. On top, what the player screen shows now, with "Clear
 * the screen" and a pin per handout that should stay.
 */
import { canSee, handoutStaysWithGm, type Entity, type Handout, type Id, type Scene, type Visibility } from "@campaign-forge/core";
import { GiveToPlayer } from "../../components/GiveToPlayer";
import { useCallback, useMemo, useState } from "react";
import { Badge, Button, Card, pushToast, type BadgeTone } from "../../components/ui";
import { RichTextView } from "../../editor";
import { useAssetUrl, useCampaign, useList, useRecord } from "../../state/hooks";
import { clearPlayerScreen, hideHandout, pinHandout, playerScreenHandouts, restorePlayerScreen, revealEntityAtTable, revealHandout } from "../../state/tableActions";
import { useEntities, useSessionTrackerState, useTableState } from "./hooks";

const VIS: Record<Visibility["level"], { label: string; tone: BadgeTone }> = {
  gm: { label: "GM only", tone: "muted" },
  some_players: { label: "Some players", tone: "warning" },
  players: { label: "Players", tone: "accent" },
  revealed: { label: "Revealed", tone: "success" },
};

export function VisibilityBadge({ visibility }: { visibility: Visibility }) {
  const v = VIS[visibility.level] ?? VIS.gm;
  return <Badge tone={v.tone}>{v.label}</Badge>;
}

/**
 * One handout. Its button depends on who it is for: the module keeps some
 * with the GM (no reveal at all); one written for a single character goes to
 * that player's packet, and showing it to everyone asks first; anything else
 * reveals with one tap. A revealed handout can be hidden again.
 */
function HandoutRow({ handout, onReveal, onHide, sessionId, onScreen }: { handout: Handout; onReveal: () => void; onHide: () => void; sessionId: Id; onScreen: boolean }) {
  const ctx = useCampaign();
  const [open, setOpen] = useState(false);
  const character = useRecord("entities", handout.character);
  const url = useAssetUrl(open ? handout.asset : undefined);
  const revealed = handout.visibility.level === "revealed";
  const staysWithGm = handoutStaysWithGm(handout, ctx.module.module);
  const personal = !!handout.character && !canSee(handout.visibility, { role: "player" });
  const showEveryone = () => {
    const who = character ? `${character.name}'s` : "this";
    if (window.confirm(`This puts ${who} handout "${handout.title}" on the screen every player sees. Show it to everyone?`)) onReveal();
  };
  return (
    <li className={`app-reveal${personal || staysWithGm ? " app-reveal--private" : ""}`} data-handout={handout.id}>
      <div className="app-reveal__row">
        <button type="button" className="app-linkbtn app-reveal__title" onClick={() => setOpen(!open)} aria-expanded={open}>
          {handout.title}
        </button>
        <Badge>{handout.kind}</Badge>
        {character && <span className="cf-muted">for {character.name}</span>}
        <VisibilityBadge visibility={handout.visibility} />
        {revealed && handout.revealedIn === sessionId && <span className="cf-muted">this session</span>}
        {onScreen && <Badge tone="success">on screen</Badge>}
        {!staysWithGm && !personal && canSee(handout.visibility, { role: "player" }) && <PinButton handout={handout} sessionId={sessionId} />}
        {staysWithGm ? (
          <span className="cf-muted app-reveal__note" data-testid="reveal-gm-only">
            {staysWithGm}
          </span>
        ) : revealed ? (
          <>
            {!onScreen && (
              <Button variant="ghost" onClick={onReveal} aria-label={`Show ${handout.title} on the player screen again`} data-testid="reveal-again">
                Show again
              </Button>
            )}
            <Button variant="ghost" onClick={onHide} aria-label={`Hide ${handout.title} from the players`} data-testid="reveal-hide">
              Hide again
            </Button>
          </>
        ) : personal ? (
          <>
            <GiveToPlayer handout={handout} />
            <Button variant="ghost" onClick={showEveryone} aria-label={`Show ${handout.title} to everyone`} data-testid="reveal-everyone">
              Show everyone…
            </Button>
          </>
        ) : (
          <Button variant="primary" onClick={onReveal} aria-label={`Reveal ${handout.title}`}>
            Reveal
          </Button>
        )}
      </div>
      {open && (
        <div className="app-reveal__body">
          {url && <img src={url} alt={handout.title} className="app-reveal__image" />}
          {handout.bodyDoc && <RichTextView docId={handout.bodyDoc} placeholder="Empty handout." />}
        </div>
      )}
    </li>
  );
}

/** Pin a handout to the player screen, or unpin it. */
function PinButton({ handout, sessionId }: { handout: Handout; sessionId: Id }) {
  const ctx = useCampaign();
  const pinned = !!handout.pinned;
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => pinHandout(ctx, sessionId, handout.id, !pinned)}
      aria-pressed={pinned}
      aria-label={`${pinned ? "Unpin" : "Pin"} ${handout.title} ${pinned ? "from" : "to"} the player screen`}
      title={pinned ? "Unpin: it leaves the screen at the next clear" : "Pin: it stays on the player screen, this session and the next, until unpinned"}
      data-testid="reveal-pin"
    >
      {pinned ? "Unpin" : "Pin"}
    </Button>
  );
}

/** The handouts on the player screen right now (live). */
export function usePlayerScreenHandouts(sessionId: Id): Handout[] {
  const ctx = useCampaign();
  const all = useList("handouts");
  const ts = useSessionTrackerState(sessionId);
  const session = useRecord("sessions", sessionId);
  return useMemo(() => playerScreenHandouts(ctx, sessionId), [all, ts, session, sessionId, ctx]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** "Clear the screen", with an Undo on its toast. */
export function useClearPlayerScreen(sessionId: Id): () => void {
  const ctx = useCampaign();
  return useCallback(() => {
    const before = clearPlayerScreen(ctx, sessionId);
    pushToast("Player screen cleared. Pinned handouts stay.", { action: { label: "Undo", onClick: () => restorePlayerScreen(ctx, sessionId, before) } });
  }, [ctx, sessionId]);
}

/**
 * What the player screen shows now (handouts, a clue in the spotlight, the
 * recap) and "Clear the screen"; under it, the other handouts every player
 * may already see (a job's posting, frictions), off the screen until pinned.
 */
function OnScreen({ sessionId, handouts }: { sessionId: Id; handouts: Handout[] }) {
  const ctx = useCampaign();
  const all = useList("handouts");
  const offScreen = useMemo(() => {
    const on = new Set(handouts.map((h) => h.id));
    return all.filter((h) => !on.has(h.id) && canSee(h.visibility, { role: "player" }) && handoutStaysWithGm(h, ctx.module.module) === undefined).sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  }, [all, handouts, ctx]);
  const table = useTableState(sessionId);
  const session = useRecord("sessions", sessionId);
  const clear = useClearPlayerScreen(sessionId);
  const extras = [...(session?.recap?.shown ? ["the recap"] : []), ...(table.spotlight ? ["a clue"] : [])];
  const empty = handouts.length === 0 && extras.length === 0;
  return (
    <section className="app-reveal__screen" aria-label="On the player screen" data-testid="on-screen">
      <div className="app-row">
        <h4 className="app-table__group-title app-grow">On the player screen</h4>
        <Button size="sm" onClick={clear} disabled={empty || (handouts.every((h) => h.pinned) && extras.length === 0)} data-testid="clear-screen">
          Clear the screen
        </Button>
      </div>
      {empty ? (
        <p className="cf-muted app-small">Nothing but the scene. A handout you reveal goes up here; pin one to keep it there.</p>
      ) : (
        <ul className="app-reveal__onscreen">
          {handouts.map((h) => (
            <li key={h.id} className="app-row" data-onscreen={h.id}>
              <span className="app-grow">{h.title}</span>
              {h.pinned && <Badge tone="accent">pinned</Badge>}
              <PinButton handout={h} sessionId={sessionId} />
            </li>
          ))}
          {extras.length > 0 && <li className="cf-muted app-small">Also {extras.join(" and ")}.</li>}
        </ul>
      )}
      {offScreen.length > 0 && (
        <details className="app-reveal__offscreen" data-testid="off-screen">
          <summary className="cf-muted">Players can see {offScreen.length === 1 ? "1 other handout" : `${offScreen.length} other handouts`}, off the screen</summary>
          <ul className="app-reveal__onscreen">
            {offScreen.map((h) => (
              <li key={h.id} className="app-row" data-offscreen={h.id}>
                <span className="app-grow">{h.title}</span>
                <PinButton handout={h} sessionId={sessionId} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

export function RevealPanel({ sessionId, scene }: { sessionId: Id; scene: Scene | undefined }) {
  const ctx = useCampaign();
  const act = useRecord("acts", scene?.act);
  const adventureId = act?.adventure;
  const all = useList("handouts");
  const handouts = useMemo(() => {
    const groups: Array<{ title: string; items: Handout[] }> = [];
    const of = (kind: "scene" | "act" | "adventure", id: Id | undefined) => (id ? all.filter((h) => h.attachedTo?.kind === kind && h.attachedTo.id === id) : []);
    const sceneItems = of("scene", scene?.id);
    const actItems = of("act", act?.id);
    const advItems = of("adventure", adventureId);
    if (sceneItems.length) groups.push({ title: "This scene", items: sceneItems });
    if (actItems.length) groups.push({ title: act ? `Act ${act.number}` : "Act", items: actItems });
    if (advItems.length) groups.push({ title: "Adventure", items: advItems });
    if (!scene) {
      const loose = all.filter((h) => !h.attachedTo);
      if (loose.length) groups.push({ title: "Campaign", items: loose });
    }
    return groups;
  }, [all, scene, act, adventureId]);
  const clues = useEntities(scene?.clues ?? []);
  const onScreen = usePlayerScreenHandouts(sessionId);
  const onScreenIds = useMemo(() => new Set(onScreen.map((h) => h.id)), [onScreen]);

  return (
    <Card title="Reveal" className="app-table__reveal" data-testid="reveal-panel">
      <OnScreen sessionId={sessionId} handouts={onScreen} />
      {handouts.length === 0 && clues.length === 0 && <p className="cf-muted">No handouts or clues for this scene.</p>}
      {handouts.map((g) => (
        <section key={g.title} aria-label={`Handouts: ${g.title}`}>
          <h4 className="app-table__group-title">{g.title}</h4>
          <ul className="app-reveals">
            {g.items.map((h) => (
              <HandoutRow key={h.id} handout={h} sessionId={sessionId} onScreen={onScreenIds.has(h.id)} onReveal={() => revealHandout(ctx, sessionId, h.id, scene?.id)} onHide={() => hideHandout(ctx, sessionId, h.id)} />
            ))}
          </ul>
        </section>
      ))}
      {clues.length > 0 && (
        <section aria-label="Clues">
          <h4 className="app-table__group-title">Clues</h4>
          <ul className="app-reveals">
            {clues.map((c: Entity) => {
              const revealed = c.visibility.level === "revealed";
              const text = typeof c.fields.text === "string" ? c.fields.text : c.summary;
              return (
                <li key={c.id} className="app-reveal" data-clue={c.id}>
                  <div className="app-reveal__row">
                    <span className="app-reveal__title">{c.name}</span>
                    <VisibilityBadge visibility={c.visibility} />
                    <Button variant={revealed ? "ghost" : "primary"} onClick={() => revealEntityAtTable(ctx, sessionId, c.id, scene?.id)} disabled={revealed} aria-label={`Reveal ${c.name}`}>
                      {revealed ? "Revealed" : "Reveal"}
                    </Button>
                  </div>
                  {text && <p className="cf-muted app-reveal__body">{text}</p>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </Card>
  );
}
