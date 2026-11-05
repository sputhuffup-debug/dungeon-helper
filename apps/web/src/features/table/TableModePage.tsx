/**
 * `/c/$campaignId/table/$sessionId`: table mode. A full-height surface in
 * large type (`cf-table-mode`) for running a session: clock and timer in the
 * header, the current scene, the live map high up, participants as compact
 * rows, "This job" and reveals on the left, trackers, dice, the module's
 * play-guide hints and the running log on the right. Below desktop width the
 * same parts are full-height panels behind a bottom tab bar (Scene, Map,
 * Crew, Dice, Log). The header clock is the table's one round counter.
 * `?view=players` is the read-only player screen, which the campaign layout
 * renders on its own (`PlayerWindow`), outside the GM's shell. Everything is
 * local.
 */
import { appendTrackerLog, creatureTurnFor, d20CoveredTrackers, type Id } from "@campaign-forge/core";
import { upperFirst, type Effect, type Prompt } from "@campaign-forge/module-sdk";
import { Link, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { lazyView } from "../../components/lazyView";
import { Badge, Button, DiceModeSwitch, EmptyState, PromptDialog, Tabs, pushToast, useDiceRoller, type PromptAnswer } from "../../components/ui";
import { errorMessage } from "../../lib/format";
import { useCampaign, useOfflineStatus, useRecord, useTerms } from "../../state/hooks";
import {
  answerPrompt,
  answerRollOperation,
  applySessionEffects,
  logTable,
  operationRun,
  operationTitle,
  rollOperation,
  sessionLabel,
  restoreTimer,
  setTimer,
  startPlannedSession,
  TABLE_STATE,
  timerElapsedMs,
  type OperationRoll,
} from "../../state/tableActions";
import { isSessionZero } from "../../lib/sessionZero";
import { routeStoryPointEffects, type SessionAct } from "../../state/progressionActions";
import { SessionChecklist, useLogNotesAutoTick } from "../sessions/SessionChecklist";
import { useLandAfterWrapUp } from "../sessions/afterWrapUp";
import { CreatureTurnCard, TakeHitDialog, useInitiativeCurrent, type CombatHandlers } from "./Combat";
import { D20CombatPanel } from "./D20Combat";
import { DicePanel } from "./DicePanel";
import { PlayGuidePanel, usePlayGuides } from "./PlayGuidePanel";
import { formatDuration, useCrossTabSync, useEntities, usePlayerCharacters, useSessionScenes, useSessionTrackerState, useTableState, useTick } from "./hooks";
import { EntityDrawer, Participants } from "./Participants";
import { playerWindowName } from "./playerWindowName";
import { RevealPanel, useClearPlayerScreen } from "./RevealPanel";
import { RollResultDialog } from "./RollResultDialog";
import { SceneCard } from "./SceneCard";
import { TableRecap } from "./TableRecap";
import { ThisJob } from "./ThisJob";
import { NARROW_TABLE, useMediaQuery } from "../../lib/useMediaQuery";
import { SceneMap, useSceneMap } from "./SceneMap";
import { SpecialAttackDialog, useSpecialAttacks } from "./SpecialAttacks";
import { WeaponAttackDialog } from "./WeaponAttack";
import { EventFeed, SessionLog } from "./SessionLog";
import { BoundTracker, TrackersPanel, useModeTrackers, type TrackerHandlers } from "./TrackersPanel";

// The end-of-session wrap-up loads when the GM ends a session.
const WrapUpWizard = lazyView(() => import("../sessions/WrapUp").then((m) => m.WrapUpWizard), { what: "the wrap-up" });
// "Share with players" (card drawing, PDF writer, zip) loads when the GM opens it.
const ShareDialog = lazyView(() => import("../share/ShareDialog").then((m) => m.ShareDialog), { what: "sharing", loading: () => null });

type TablePanelId = "scene" | "map" | "crew" | "dice" | "log";
/** The phone and tablet tab bar: each a full-height panel, one tap away. */
const TABLE_PANELS: Array<{ id: TablePanelId; label: string; icon: string }> = [
  { id: "scene", label: "Scene", icon: "▤" },
  { id: "map", label: "Map", icon: "⌖" },
  // labelled with the module's word for the group ("Crew", "Party")
  { id: "crew", label: "Group", icon: "☰" },
  { id: "dice", label: "Dice", icon: "⚄" },
  { id: "log", label: "Log", icon: "✎" },
];

export function TableModePage() {
  const { sessionId } = useParams({ from: "/c/$campaignId/table/$sessionId" });
  useCrossTabSync();
  return <GmTable sessionId={sessionId} />;
}

function GmTable({ sessionId }: { sessionId: Id }) {
  const ctx = useCampaign();
  const roller = useDiceRoller();
  const terms = useTerms();
  const campaignId = ctx.campaignId;
  const land = useLandAfterWrapUp(campaignId);
  const session = useRecord("sessions", sessionId);
  const { offline } = useOfflineStatus();
  const table = useTableState(sessionId);
  const scenes = useSessionScenes(sessionId);
  const scene = scenes.find((s) => s.id === table.sceneId);
  const pcs = usePlayerCharacters();
  const sceneParticipants = useEntities(scene?.participants ?? []);
  const others = useMemo(() => sceneParticipants.filter((e) => !pcs.some((p) => p.id === e.id)), [sceneParticipants, pcs]);
  const map = useSceneMap(scene);
  const sceneAct = scene?.act ? ctx.store.get("acts", scene.act) : undefined;
  const currentAct = useMemo<SessionAct | undefined>(() => (sceneAct ? { adventure: sceneAct.adventure, number: sceneAct.number, ...(sceneAct.title ? { title: sceneAct.title } : {}) } : undefined), [sceneAct]);
  const trackers = useModeTrackers();
  const clock = trackers.find((t) => t.kind === "clock");
  // a d20 module's Combat panel already runs initiative and each combatant's hit points: show those once
  const covered = useMemo(() => d20CoveredTrackers(ctx.module, trackers), [ctx.module, trackers]);
  const panelTrackers = trackers.filter((t) => t !== clock && !covered.has(t.id));

  const ts = useSessionTrackerState(sessionId);
  useLogNotesAutoTick(sessionId, session?.logDoc, session?.status === "running");
  // a session started elsewhere (e.g. campaign home) gets its table state on first open
  const needsInit = session?.status === "running" && !ts?.state[TABLE_STATE];
  useEffect(() => {
    if (needsInit) startPlannedSession(ctx, sessionId);
  }, [needsInit, ctx, sessionId]);

  const [drawer, setDrawer] = useState<Id | undefined>();
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [roll, setRoll] = useState<OperationRoll | undefined>();
  const [wrapping, setWrapping] = useState(false);
  const [sharing, setSharing] = useState<"session" | "primer" | undefined>();
  const [tab, setTab] = useState("trackers");
  const narrow = useMediaQuery(NARROW_TABLE);
  const [panel, setPanel] = useState<TablePanelId>("scene");
  const hasGuide = usePlayGuides().length > 0;
  const resolveName = useCallback((id: string) => ctx.store.get("entities", id)?.name ?? id, [ctx.store]);

  // combat: take a hit, creature turns (opened from a card, or the creature holding the current initiative card), special attacks
  const hasCombat = !!ctx.module.module.combat;
  const specials = useSpecialAttacks();
  const [hitTarget, setHitTarget] = useState<Id | undefined>();
  const [specialPc, setSpecialPc] = useState<Id | undefined>();
  const [attackPc, setAttackPc] = useState<Id | undefined>();
  const [turnId, setTurnId] = useState<Id | undefined>();
  const [dismissedTurn, setDismissedTurn] = useState<string | undefined>();
  const initiative = useInitiativeCurrent(sessionId);
  const initiativeEntity = useRecord("entities", initiative?.entityId);
  const initiativeKey = initiative ? `${initiative.round}:${initiative.entityId}:${initiative.card}` : undefined;
  const autoTurn = hasCombat && initiativeEntity && creatureTurnFor(ctx.module, initiativeEntity) && dismissedTurn !== initiativeKey ? initiativeEntity.id : undefined;
  const shownTurn = turnId ?? autoTurn;
  const turnCreature = useRecord("entities", shownTurn);
  const everyone = useMemo(() => [...pcs, ...others], [pcs, others]);
  const turnTargets = useMemo(() => everyone.filter((e) => e.id !== shownTurn && ctx.module.entityType(e.type)?.kind === "character"), [everyone, shownTurn, ctx.module]);
  const combat = useMemo<CombatHandlers | undefined>(
    () =>
      hasCombat
        ? {
            sessionId,
            onTakeHit: setHitTarget,
            onCreatureTurn: (id) => setTurnId(id),
            onSpecialAttack: setSpecialPc,
            onOperationRoll: setRoll,
            hasSpecialAttacks: specials.length > 0,
          }
        : undefined,
    [hasCombat, sessionId, specials.length],
  );
  const closeTurn = () => {
    if (!turnId && initiativeKey) setDismissedTurn(initiativeKey);
    setTurnId(undefined);
  };

  const handlers = useMemo<TrackerHandlers>(
    () => ({
      onEffects: (effects: Effect[]) => {
        try {
          // story point changes from the tracker go through the advancement log
          const raised = applySessionEffects(ctx, sessionId, routeStoryPointEffects(ctx, effects, sessionId));
          if (raised.length) setPrompts((p) => [...p, ...raised]);
        } catch (e) {
          pushToast(errorMessage(e), { tone: "danger" });
        }
      },
      onRollOperation: (operationId, entityId, extra) => {
        try {
          // In the app, or with the dice rolled at the table (the page's dice mode)
          roller.roll({
            title: operationTitle(ctx, operationId, entityId),
            run: operationRun(ctx, operationId, entityId, extra ?? {}),
            perform: (entered) => {
              const r = rollOperation(ctx, sessionId, operationId, entityId, extra ?? {}, entered);
              setRoll(r);
              if (r.prompts.length) setPrompts((p) => [...p, ...r.prompts]);
            },
          });
        } catch (e) {
          pushToast(`Roll failed: ${errorMessage(e)}`, { tone: "danger" });
        }
      },
      onLog: (trackerId, text) => appendTrackerLog(ctx.store, sessionId, { tracker: trackerId, text }),
      onPrompts: (raised: Prompt[]) => setPrompts((p) => [...p, ...raised]),
    }),
    [ctx, sessionId, roller],
  );

  const onAnswer = (answer: PromptAnswer) => {
    const prompt = prompts[0];
    setPrompts((p) => p.slice(1));
    if (!prompt) return;
    const apply = (entered?: number[]) => {
      const out = answerPrompt(ctx, sessionId, prompt, answer, { record: false, ...(entered ? { entered } : {}) });
      if (out.roll) setRoll(out.roll);
      if (out.prompts.length) setPrompts((p) => [...p, ...out.prompts]);
    };
    try {
      const op = answerRollOperation(prompt, answer);
      if (op) roller.roll({ title: operationTitle(ctx, op, prompt.entity), run: operationRun(ctx, op, prompt.entity), perform: apply, onCancel: () => setPrompts((p) => [prompt, ...p]) });
      else apply();
    } catch (e) {
      pushToast(errorMessage(e), { tone: "danger" });
    }
  };

  const clearScreen = useClearPlayerScreen(sessionId);
  const openPlayerScreen = () => {
    const url = `${window.location.origin}/c/${campaignId}/table/${sessionId}?view=players`;
    const w = window.open(url, playerWindowName(sessionId), "popup,width=1100,height=800");
    if (!w) pushToast("The browser blocked the player screen window. Allow pop-ups for this site.", { tone: "warning" });
    else logTable(ctx, sessionId, "Player screen opened");
  };

  if (!session) {
    return (
      <div className="cf-table-mode app-table">
        <EmptyState title="No such session" text="It may have been deleted." action={<Link to="/c/$campaignId/sessions" params={{ campaignId }} className="cf-btn">Sessions</Link>} />
      </div>
    );
  }

  if (session.status === "done") {
    return (
      <div className="cf-table-mode app-table" data-testid="table-mode">
        <EmptyState
          title={`${sessionLabel(session)} is finished`}
          text="Its trackers are archived. Read what happened on the session page."
          action={
            <Link to="/c/$campaignId/sessions/$sessionId" params={{ campaignId, sessionId }} className="cf-btn cf-btn--primary">
              Session page
            </Link>
          }
        />
      </div>
    );
  }

  // the table's parts, laid out as two columns on a desktop and as panels behind a tab bar on phones and tablets
  const recapCard = <TableRecap sessionId={sessionId} />;
  const sceneCard = <SceneCard sessionId={sessionId} scenes={scenes} scene={scene} onOpenEntity={setDrawer} />;
  const creatureTurn = turnCreature && (
    <CreatureTurnCard
      key={turnCreature.id}
      sessionId={sessionId}
      creature={turnCreature}
      targets={turnTargets}
      participants={everyone}
      map={map}
      {...(initiative && initiative.entityId === turnCreature.id ? { current: { round: initiative.round, card: initiative.card } } : {})}
      onClose={closeTurn}
      onOperationRoll={setRoll}
    />
  );
  const d20Panel = ctx.module.module.d20Combat && <D20CombatPanel sessionId={sessionId} pcs={pcs} others={others} onOpen={setDrawer} />;
  const participantsCard = <Participants pcs={pcs} others={others} onOpen={setDrawer} onRoll={(op, id) => handlers.onRollOperation(op, id)} lifecycle={{ sessionId, onPrompts: handlers.onPrompts }} combat={combat} act={currentAct} onWeaponAttack={setAttackPc} />;
  const thisJob = <ThisJob sessionId={sessionId} scene={scene} map={map} onOpen={setDrawer} />;
  const revealPanel = <RevealPanel sessionId={sessionId} scene={scene} />;
  const mapView = map && <SceneMap sessionId={sessionId} map={map} scene={scene} participants={everyone} onPrompts={handlers.onPrompts} focus />;
  const trackersPanel = <TrackersPanel sessionId={sessionId} trackers={panelTrackers} pcs={pcs} participants={others} map={map} handlers={handlers} />;
  const dicePanel = <DicePanel sessionId={sessionId} pcs={pcs} others={others} />;
  const hintsPanel = hasGuide ? <PlayGuidePanel sessionId={sessionId} pcs={pcs} others={others} /> : null;
  const checklistPanel = <SessionChecklist session={session} focus="play" title="Checklist" className="app-table__checklist" />;
  const logPanel = (
    <div className="app-stack">
      <SessionLog sessionId={sessionId} />
      <EventFeed sessionId={sessionId} />
    </div>
  );

  return (
    <div className={`cf-table-mode app-table${narrow ? " app-table--narrow" : ""}`} data-testid="table-mode" data-layout={narrow ? "panels" : "columns"}>
      <header className="app-table__header">
        <Link to="/c/$campaignId/sessions/$sessionId" params={{ campaignId, sessionId }} className="cf-btn cf-btn--ghost" aria-label="Leave table mode">
          ← Leave
        </Link>
        <div className="app-table__title">
          <strong data-testid="table-session">{sessionLabel(session)}</strong>
          <Badge tone={session.status === "running" ? "success" : "warning"}>{session.status}</Badge>
          {offline && (
            <Badge tone="warning" title="No network. Table mode keeps working; everything is saved on this device.">
              Offline
            </Badge>
          )}
        </div>
        {narrow && <span className="app-table__header-break" aria-hidden />}
        <Timer sessionId={sessionId} running={!!table.timer?.running} timer={table.timer} />
        <span className="app-grow" />
        {!narrow && (
          <span className="app-table__screen" role="group" aria-label="Player screen controls">
            <Button onClick={openPlayerScreen}>Player screen</Button>
            <Button variant="ghost" onClick={clearScreen} data-testid="header-clear-screen" title="Take what you revealed off the player screen; pinned handouts stay">
              Clear screen
            </Button>
          </span>
        )}
        {narrow ? (
          <details className="app-table__menu" data-testid="table-menu">
            <summary className="cf-btn">More…</summary>
            <div
              className="app-table__menu-body"
              onClick={(e) => {
                const menu = e.currentTarget.closest("details");
                if (menu && (e.target as Element).closest("button")) menu.open = false;
              }}
            >
              <Button onClick={openPlayerScreen}>Player screen</Button>
              <Button onClick={clearScreen} data-testid="header-clear-screen">
                Clear the player screen
              </Button>
              {session && isSessionZero(session) && (
                <Button onClick={() => setSharing("primer")} data-testid="share-primer" title="Send the campaign primer to the group chat">
                  Share primer
                </Button>
              )}
              <Button onClick={() => setSharing("session")} data-testid="share-players" title="Send the player view to the group chat: images or a PDF">
                Share with players
              </Button>
              {session.status === "running" && !wrapping && (
                <Button variant="danger" onClick={() => setWrapping(true)} data-testid="end-session">
                  End session
                </Button>
              )}
            </div>
          </details>
        ) : (
          <>
            {session && isSessionZero(session) && (
              <Button onClick={() => setSharing("primer")} data-testid="share-primer" title="Send the campaign primer to the group chat">
                Share primer
              </Button>
            )}
            <Button onClick={() => setSharing("session")} data-testid="share-players" title="Send the player view to the group chat: images or a PDF">
              Share with players
            </Button>
          </>
        )}
        {session.status === "planned" && (
          <Button variant="primary" onClick={() => startPlannedSession(ctx, sessionId)}>
            Start session
          </Button>
        )}
        {session.status === "running" && !wrapping && !narrow && (
          <Button variant="danger" onClick={() => setWrapping(true)} data-testid="end-session">
            End session
          </Button>
        )}
      </header>
      {clock && !wrapping && (
        <div className="app-table__clock" data-testid="table-clock">
          <BoundTracker sessionId={sessionId} def={clock} entities={[]} {...handlers} />
        </div>
      )}

      {wrapping ? (
        <div className="app-table__wrapup">
          <WrapUpWizard
            sessionId={sessionId}
            onCancel={() => setWrapping(false)}
            onDone={(_next, landing) => land(landing)}
          />
        </div>
      ) : narrow ? (
        // phones and tablets: one full-height panel at a time, a tab bar at the bottom
        <>
          <div className="app-table__panels" data-panel={panel}>
            {TABLE_PANELS.map((p) => (
              <section
                key={p.id}
                id={`table-panel-${p.id}`}
                role="tabpanel"
                aria-labelledby={`table-tab-${p.id}`}
                className={`app-table__panel app-table__panel--${p.id}`}
                hidden={panel !== p.id}
                data-testid={`table-panel-${p.id}`}
              >
                {p.id === "scene" && (
                  <>
                    {recapCard}
                    {sceneCard}
                    {thisJob}
                    {revealPanel}
                    {hasGuide && (
                      <details className="app-table__hints">
                        <summary>Hints</summary>
                        {hintsPanel}
                      </details>
                    )}
                  </>
                )}
                {p.id === "map" && (mapView ?? <EmptyState title="No map for this scene" text="Give the scene a map, or set it at a place that has one." />)}
                {p.id === "crew" && (
                  <>
                    {creatureTurn}
                    {d20Panel}
                    {participantsCard}
                    {trackersPanel}
                  </>
                )}
                {p.id === "dice" && (
                  <>
                    <div className="app-row app-table__dicemode">
                      <DiceModeSwitch physical={roller.physical} onChange={roller.setPhysical} />
                    </div>
                    {dicePanel}
                  </>
                )}
                {p.id === "log" && (
                  <>
                    {logPanel}
                    {checklistPanel}
                  </>
                )}
              </section>
            ))}
          </div>
          <nav className="app-table__tabbar" aria-label="Table panels">
            <div role="tablist" className="app-table__tabbar-list">
              {TABLE_PANELS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  id={`table-tab-${p.id}`}
                  aria-selected={panel === p.id}
                  aria-controls={`table-panel-${p.id}`}
                  className={`app-table__tabbar-tab${panel === p.id ? " is-active" : ""}`}
                  onClick={() => setPanel(p.id)}
                  data-testid={`table-tab-${p.id}`}
                >
                  <span className="app-table__tabbar-icon" aria-hidden>
                    {p.icon}
                  </span>
                  <span>{p.id === "crew" ? upperFirst(terms.party) : p.label}</span>
                  {p.id === "crew" && turnCreature && <span className="app-table__tabbar-dot" title="A creature's turn" />}
                </button>
              ))}
            </div>
          </nav>
        </>
      ) : (
        <div className="app-table__grid">
          <div className="app-table__col">
            {recapCard}
            {sceneCard}
            {creatureTurn}
            {/* the live map high in the column: the GM's main surface when the scene has one */}
            {mapView}
            {d20Panel}
            {participantsCard}
            {thisJob}
            {revealPanel}
          </div>
          <div className="app-table__col">
            <Tabs
              // how every roll on this page is made: in the app, or with the dice rolled at the table
              extra={<DiceModeSwitch physical={roller.physical} onChange={roller.setPhysical} />}
              value={tab === "hints" && !hasGuide ? "trackers" : tab}
              onChange={setTab}
              tabs={[
                { id: "trackers", label: "Trackers", content: trackersPanel },
                { id: "dice", label: "Dice", content: dicePanel },
                ...(hasGuide ? [{ id: "hints", label: "Hints", content: hintsPanel }] : []),
                { id: "checklist", label: "Checklist", content: checklistPanel },
                { id: "log", label: "Log", content: logPanel },
              ]}
            />
          </div>
        </div>
      )}

      <EntityDrawer entityId={drawer} sessionId={sessionId} onClose={() => setDrawer(undefined)} />
      {hasCombat && <TakeHitDialog sessionId={sessionId} entityId={hitTarget} participants={everyone} map={map} onClose={() => setHitTarget(undefined)} onOperationRoll={setRoll} />}
      {specials.length > 0 && (
        <SpecialAttackDialog key={specialPc ?? "none"} open={!!specialPc} onClose={() => setSpecialPc(undefined)} sessionId={sessionId} pcs={pcs} others={others} {...(specialPc ? { initialPc: specialPc } : {})} />
      )}
      <WeaponAttackDialog key={attackPc ?? "none"} sessionId={sessionId} attackerId={attackPc} targets={everyone} onClose={() => setAttackPc(undefined)} />
      {sharing && <ShareDialog open onClose={() => setSharing(undefined)} sessionId={sessionId} sceneId={table.sceneId} {...(sharing === "primer" ? { primer: { defaultOn: true, only: true } } : {})} />}
      <RollResultDialog roll={roll} onClose={() => setRoll(undefined)} resolveName={resolveName} />
      <PromptDialog prompt={roll ? undefined : prompts[0]} onAnswer={onAnswer} onCancel={() => setPrompts((p) => p.slice(1))} resolveEntityName={(id) => ctx.store.get("entities", id)?.name} />
    </div>
  );
}

function Timer({ sessionId, running, timer }: { sessionId: Id; running: boolean; timer: ReturnType<typeof useTableState>["timer"] }) {
  const ctx = useCampaign();
  const now = useTick(1000, running);
  const ms = timerElapsedMs(timer, Math.max(now, Date.now()));
  return (
    <span className="app-table__timer" aria-label="Real-time timer">
      <span className="app-table__timer-value" data-testid="timer">
        {formatDuration(ms)}
      </span>
      {running ? (
        <Button size="sm" variant="ghost" onClick={() => setTimer(ctx, sessionId, "pause")}>
          Pause
        </Button>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setTimer(ctx, sessionId, "start")}>
          {ms > 0 ? "Resume" : "Start timer"}
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="app-table__timer-reset"
        disabled={ms === 0}
        title="Set the timer back to 00:00 (you can undo it)"
        onClick={() => {
          const before = setTimer(ctx, sessionId, "reset");
          pushToast(`Timer reset (it was ${formatDuration(ms)}).`, { action: { label: "Undo", onClick: () => restoreTimer(ctx, sessionId, before) } });
        }}
        aria-label="Reset timer"
      >
        ↺
      </Button>
    </span>
  );
}
