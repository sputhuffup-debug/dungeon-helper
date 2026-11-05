/**
 * The player screen's window: the campaign layout renders this in place of
 * the GM's shell (see `playerWindowName.ts`), so the window the players look
 * at holds nothing but their view. No sidebar, header, search or global
 * hotkeys are mounted, and record links inside it open nothing.
 */
import type { Id } from "@campaign-forge/core";
import { useEffect } from "react";
import { RecordLinksContext, type RecordLinks } from "../../components/EntityLinkContext";
import { useMeta } from "../../state/hooks";
import { useCrossTabSync } from "./hooks";
import { PlayerScreen } from "./PlayerScreen";

// mentions and record chips in read-aloud text and handouts go nowhere on the players' screen
const NO_LINKS: RecordLinks = { openEntity: () => undefined, openNote: () => undefined, openAdventure: () => undefined, openSession: () => undefined };

export function PlayerWindow({ sessionId }: { sessionId: Id }) {
  const meta = useMeta();
  useCrossTabSync();
  useEffect(() => {
    document.title = `${meta.name} · Player screen`;
  }, [meta.name]);
  return (
    <RecordLinksContext.Provider value={NO_LINKS}>
      <main className="app-player-window" id="main" data-testid="player-window">
        <PlayerScreen sessionId={sessionId} />
      </main>
    </RecordLinksContext.Provider>
  );
}
