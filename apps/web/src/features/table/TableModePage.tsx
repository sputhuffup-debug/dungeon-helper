/**
 * `/c/$campaignId/table/$sessionId`: table mode. A full-height surface in
 * large type (`cf-table-mode`) for running a session: clock and timer in the
 * header, the current scene, participants, reveals and the map on the left,
 * trackers, dice, the module's play-guide hints and the running log on the right. `?view=players` renders
 * the read-only player screen instead. Everything is local.
 */
import { appendTrackerLog, type Id } from "@campaign-forge/core";
import type { Effect, Prompt } from "@campaign-forge/module-sdk";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, EmptyState, PromptDialog, Tabs, pushToast, type PromptAnswer } from "../../components/ui";
import { errorMessage } from "../../lib/format";
import { useCampaign, useOfflineStatus, useRecord } from "../../state/hooks";
import {
  answerPrompt,
  applySessionEffects,
  logTable,
  rollOperation,
  sessionLabel,
  setTimer,
  startPlannedSession,
  TABLE_STATE,
  timerElapsedMs,
  type OperationRoll,
} from "../../state/tableActions";
import { SessionChecklist, useLogNotesAutoTick } from "../sessions/SessionChecklist";
import { WrapUpWizard } from "../sessions/WrapUp";
import { DicePanel } from "./DicePanel";
import { PlayGuidePanel, usePlayGuides } from "./PlayGuidePanel";
import { formatDuration, useCrossTabSync, useEntities, usePlayerCharacters, useSessionScenes, useSessionTrackerState, useTableState, useTick } from "./hooks";
import { EntityDrawer, Participants } from "./Participants";
import { PlayerScreen } from "./PlayerScreen";
import { RevealPanel } from "./RevealPanel";
import { RollResultDialog } from "./RollResultDialog";
import { SceneCard } from "./SceneCard";
import { SceneMap, useSceneMap } from "./SceneMap";
import { EventFeed, SessionLog } from "./SessionLog";
import { BoundTracker, TrackersPanel, useModeTrackers, type TrackerHandlers } from "./TrackersPanel";

export function TableModePage() {
  const { sessionId } = useParams({ from: "/c/$campaignId/table/$sessionId" });
  const search = useSearch({ from: "/c/$campaignId/table/$sessionId" });
  useCrossTabSync();
  if (search.view === "players") return <PlayerScreen sessionId={sessionId} />;
  return <GmTable sessionId={sessionId} />;
}

function GmTable({ sessionId }: { sessionId: Id }) {
  const ctx = useCampaign();
  const navigate = useNavigate();
  const campaignId = ctx.campaignId;
  const session = useRecord("sessions", sessionId);
  const { offline } = useOfflineStatus();
  const table = useTableState(sessionId);
  const scenes = useSessionScenes(sessionId);
  const scene = scenes.find((s) => s.id === table.sceneId);
  const pcs = usePlayerCharacters();
  const sceneParticipants = useEntities(scene?.participants ?? []);
  const others = useMemo(() => sceneParticipants.filter((e) => !pcs.some((p) => p.id === e.id)), [sceneParticipants, pcs]);
  const map = useSceneMap(scene);
  const trackers = useModeTrackers();
  const clock = trackers.find((t) => t.kind === "clock");
  const panelTrackers = trackers.filter((t) => t !== clock);

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
  const [tab, setTab] = useState("trackers");
  const hasGuide = usePlayGuides().length > 0;
  const resolveName = useCallback((id: string) => ctx.store.get("entities", id)?.name ?? id, [ctx.store]);

  const handlers = useMemo<TrackerHandlers>(
    () => ({
      onEffects: (effects: Effect[]) => {
        try {
          const raised = applySessionEffects(ctx, sessionId, effects);
          if (raised.length) setPrompts((p) => [...p, ...raised]);
        } catch (e) {
          pushToast(errorMessage(e), { tone: "danger" });
        }
      },
      onRollOperation: (operationId, entityId, extra) => {
        try {
          const r = rollOperation(ctx, sessionId, operationId, entityId, extra ?? {});
          setRoll(r);
          if (r.prompts.length) setPrompts((p) => [...p, ...r.prompts]);
        } catch (e) {
          pushToast(`Roll failed: ${errorMessage(e)}`, { tone: "danger" });
        }
      },
      onLog: (trackerId, text) => appendTrackerLog(ctx.store, sessionId, { tracker: trackerId, text }),
      onPrompts: (raised: Prompt[]) => setPrompts((p) => [...p, ...raised]),
    }),
    [ctx, sessionId],
  );

  const onAnswer = (answer: PromptAnswer) => {
    const prompt = prompts[0];
    setPrompts((p) => p.slice(1));
    if (!prompt) return;
    try {
      const out = answerPrompt(ctx, sessionId, prompt, answer, { record: false });
      if (out.roll) setRoll(out.roll);
      if (out.prompts.length) setPrompts((p) => [...p, ...out.prompts]);
    } catch (e) {
      pushToast(errorMessage(e), { tone: "danger" });
    }
  };

  const openPlayerScreen = () => {
    const url = `${window.location.origin}/c/${campaignId}/table/${sessionId}?view=players`;
    const w = window.open(url, `cf-players-${sessionId}`, "popup,width=1100,height=800");
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

  return (
    <div className="cf-table-mode app-table" data-testid="table-mode">
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
        <Timer sessionId={sessionId} running={!!table.timer?.running} timer={table.timer} />
        <span className="app-grow" />
        <Button onClick={openPlayerScreen}>Player screen</Button>
        {session.status === "planned" && (
          <Button variant="primary" onClick={() => startPlannedSession(ctx, sessionId)}>
            Start session
          </Button>
        )}
        {session.status === "running" && !wrapping && (
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
            onDone={() => void navigate({ to: "/c/$campaignId/home", params: { campaignId } })}
          />
        </div>
      ) : (
        <div className="app-table__grid">
          <div className="app-table__col">
            <SceneCard sessionId={sessionId} scenes={scenes} scene={scene} onOpenEntity={setDrawer} />
            <Participants pcs={pcs} others={others} onOpen={setDrawer} onRoll={(op, id) => handlers.onRollOperation(op, id)} lifecycle={{ sessionId, onPrompts: handlers.onPrompts }} />
            <RevealPanel sessionId={sessionId} scene={scene} />
            {map && <SceneMap sessionId={sessionId} map={map} scene={scene} participants={[...pcs, ...others]} />}
          </div>
          <div className="app-table__col">
            <Tabs
              value={tab === "hints" && !hasGuide ? "trackers" : tab}
              onChange={setTab}
              tabs={[
                { id: "trackers", label: "Trackers", content: <TrackersPanel sessionId={sessionId} trackers={panelTrackers} pcs={pcs} participants={others} map={map} handlers={handlers} /> },
                { id: "dice", label: "Dice", content: <DicePanel sessionId={sessionId} pcs={pcs} /> },
                ...(hasGuide ? [{ id: "hints", label: "Hints", content: <PlayGuidePanel sessionId={sessionId} pcs={pcs} /> }] : []),
                { id: "checklist", label: "Checklist", content: <SessionChecklist session={session} focus="play" title="Checklist" className="app-table__checklist" /> },
                {
                  id: "log",
                  label: "Log",
                  content: (
                    <div className="app-stack">
                      <SessionLog sessionId={sessionId} />
                      <EventFeed sessionId={sessionId} />
                    </div>
                  ),
                },
              ]}
            />
          </div>
        </div>
      )}

      <EntityDrawer entityId={drawer} sessionId={sessionId} onClose={() => setDrawer(undefined)} />
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
      <Button size="sm" variant="ghost" onClick={() => setTimer(ctx, sessionId, "reset")} aria-label="Reset timer">
        ↺
      </Button>
    </span>
  );
}
