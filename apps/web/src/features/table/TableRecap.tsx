/**
 * Table mode: a compact "Previously on…" at the top of the table, for a
 * session with a recap or a session played before it, until the first scene
 * is marked run or the GM dismisses it. It reuses the session page's recap
 * actions: build it, put the read-aloud on the player screen, hide it.
 */
import { hasRecapSource, type Id, type RecapSection } from "@campaign-forge/core";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Badge, Button, Card, IconButton, pushToast } from "../../components/ui";
import { errorMessage } from "../../lib/format";
import { useCampaign, useList, useRecord } from "../../state/hooks";
import { buildRecap, dismissTableRecap, showRecapOnPlayerScreen } from "../../state/recapActions";
import { useTableState } from "./hooks";
import "../sessions/recap.css";

/** How many read-aloud lines the card shows before "and n more". */
const SHOWN_LINES = 4;

const readAloudLines = (sections: RecapSection[]) => sections.flatMap((s) => s.lines.filter((l) => !l.off && l.text.trim()).map((l) => ({ key: `${s.id}|${l.key}|${l.ref ?? ""}`, text: l.text })));

export function TableRecap({ sessionId }: { sessionId: Id }) {
  const ctx = useCampaign();
  const session = useRecord("sessions", sessionId);
  const sessions = useList("sessions");
  const table = useTableState(sessionId);
  const [busy, setBusy] = useState(false);
  const canRecap = useMemo(() => hasRecapSource({ sessions: Object.fromEntries(sessions.map((s) => [s.id, s])) }, sessionId), [sessions, sessionId]);
  if (!session || session.status === "done" || table.recapDismissed || session.scenesRun.length > 0) return null;
  const recap = session.recap;
  if (!recap && !canRecap) return null;
  const shown = !!recap?.shown;
  const lines = recap ? readAloudLines(recap.players) : [];

  const build = async () => {
    setBusy(true);
    try {
      await buildRecap(ctx, sessionId);
    } catch (e) {
      pushToast(`Could not build the recap: ${errorMessage(e)}`, { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      className="app-recap app-table__recap"
      title="Previously on…"
      subtitle={recap ? `Read it aloud before the first scene${shown ? "; it is on the player screen" : ""}.` : "Nothing built yet for this session."}
      actions={<IconButton size="sm" variant="ghost" icon="×" label="Dismiss the recap" onClick={() => dismissTableRecap(ctx, sessionId)} data-testid="table-recap-dismiss" />}
      data-testid="table-recap"
    >
      {recap ? (
        <>
          {lines.length === 0 ? (
            <p className="cf-muted app-small">Nothing the players can be told yet: add a line on the session page.</p>
          ) : (
            <ul className="app-table__recap-lines" data-testid="table-recap-lines">
              {lines.slice(0, SHOWN_LINES).map((l) => (
                <li key={l.key}>{l.text}</li>
              ))}
              {lines.length > SHOWN_LINES && <li className="cf-muted">and {lines.length - SHOWN_LINES} more on the session page</li>}
            </ul>
          )}
          <div className="app-row">
            <Button size="sm" variant={shown ? "default" : "primary"} onClick={() => showRecapOnPlayerScreen(ctx, sessionId, !shown)} data-testid="table-recap-show">
              {shown ? "Hide from the players" : "Show to the players"}
            </Button>
            {shown && <Badge tone="success">On the player screen</Badge>}
            <Link to="/c/$campaignId/sessions/$sessionId" params={{ campaignId: ctx.campaignId, sessionId }} className="cf-btn cf-btn--ghost cf-btn--sm">
              Edit the recap
            </Link>
          </div>
        </>
      ) : (
        <div className="app-row">
          <Button size="sm" variant="primary" onClick={() => void build()} disabled={busy} data-testid="table-recap-build">
            {busy ? "Building…" : "Build the recap"}
          </Button>
          <span className="cf-muted app-small">From what the campaign recorded since the last session.</span>
        </div>
      )}
    </Card>
  );
}
