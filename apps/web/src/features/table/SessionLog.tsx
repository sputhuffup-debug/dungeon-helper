/** The running session log: a rich-text note with @ mentions, a quick timestamped line, and the tracker event feed. */
import type { Id } from "@campaign-forge/core";
import { useMemo, useState } from "react";
import { Button, Card, pushToast } from "../../components/ui";
import { RichTextEditor } from "../../editor";
import { errorMessage } from "../../lib/format";
import { useCampaign, useRecord } from "../../state/hooks";
import { appendLogLine } from "../../state/tableActions";
import { useSessionTrackerState } from "./hooks";

export function SessionLog({ sessionId }: { sessionId: Id }) {
  const ctx = useCampaign();
  const session = useRecord("sessions", sessionId);
  const [line, setLine] = useState("");
  const add = async () => {
    if (!line.trim()) return;
    try {
      await appendLogLine(ctx, sessionId, line);
      setLine("");
    } catch (e) {
      pushToast(`Could not add the line: ${errorMessage(e)}`, { tone: "danger" });
    }
  };
  if (!session) return null;
  return (
    <Card title="Session log" className="app-table__log">
      <form
        className="app-row"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <input className="cf-input app-grow" aria-label="Log line" placeholder="What just happened…" value={line} onChange={(e) => setLine(e.target.value)} />
        <Button type="submit" variant="primary" disabled={!line.trim()}>
          Add timestamped line
        </Button>
      </form>
      <RichTextEditor docId={session.logDoc} label="Session log" placeholder="Running notes. Type @ to link an NPC, place or clue." />
    </Card>
  );
}

/** Recent tracker events (clock, rolls, reveals, effects), newest first. */
export function EventFeed({ sessionId, max = 30 }: { sessionId: Id; max?: number }) {
  const ts = useSessionTrackerState(sessionId);
  const entries = useMemo(() => (ts ? [...ts.log].reverse().slice(0, max) : []), [ts, max]);
  return (
    <Card title="Events">
      {entries.length === 0 ? (
        <p className="cf-muted">Tracker changes, rolls and reveals land here.</p>
      ) : (
        <ul className="cf-tracker__log app-table__feed" aria-label="Session events">
          {entries.map((e, i) => (
            <li key={i}>
              <span className="cf-tracker__log-time">{shortTime(e.at)}</span>
              <span>{e.text}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function shortTime(at: string): string {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? at.slice(11, 16) : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
