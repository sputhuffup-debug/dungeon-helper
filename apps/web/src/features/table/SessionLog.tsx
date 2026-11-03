/** The running session log: a rich-text note with @ mentions, a quick timestamped line, and the tracker event feed. */
import type { Id } from "@campaign-forge/core";
import { useMemo, useState } from "react";
import { AutoGrowText, Badge, Button, Card, pushToast } from "../../components/ui";
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
        <AutoGrowText className="cf-input app-grow" aria-label="Log line" placeholder="What just happened…" value={line} onChange={(e) => setLine(e.target.value)} />
        <Button type="submit" variant="primary" disabled={!line.trim()}>
          Add timestamped line
        </Button>
      </form>
      <RichTextEditor docId={session.logDoc} label="Session log" placeholder="Running notes. Type @ to link an NPC, place or clue." />
    </Card>
  );
}

/**
 * Log entries newest first, with a run of the same text one after another
 * (five sweeps with no movement) folded into its newest entry and a count.
 * Entries that carry roll data are never folded: each roll is its own.
 */
export function collapseRepeats<T extends { text: string; at: string; data?: unknown }>(newestFirst: T[]): Array<T & { count: number; since?: string }> {
  const out: Array<T & { count: number; since?: string }> = [];
  for (const e of newestFirst) {
    const last = out[out.length - 1];
    if (last && last.text === e.text && !isRoll(e.data) && !isRoll(last.data)) {
      last.count += 1;
      last.since = e.at;
      continue;
    }
    out.push({ ...e, count: 1 });
  }
  return out;
}

/** Recent tracker events (clock, rolls, reveals, effects), newest first; repeated lines show once with a count. */
export function EventFeed({ sessionId, max = 30 }: { sessionId: Id; max?: number }) {
  const ts = useSessionTrackerState(sessionId);
  const entries = useMemo(() => (ts ? collapseRepeats([...ts.log].reverse()).slice(0, max) : []), [ts, max]);
  return (
    <Card title="Events">
      {entries.length === 0 ? (
        <p className="cf-muted">Tracker changes, rolls and reveals land here.</p>
      ) : (
        <ul className="cf-tracker__log app-table__feed" aria-label="Session events">
          {entries.map((e, i) => (
            <li key={i} data-count={e.count}>
              <span className="cf-tracker__log-time">{shortTime(e.at)}</span>
              <span>{e.text}</span>
              {e.count > 1 && (
                <Badge title={`${e.count} times since ${shortTime(e.since ?? e.at)}`} data-testid="event-count">
                  ×{e.count}
                </Badge>
              )}
              {enteredFaces(e.data) && (
                <Badge tone="accent" title={`Rolled at the table: ${enteredFaces(e.data)!.join(" ")}`} data-testid="event-entered">
                  entered
                </Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** A dice roll's log entry (it carries the roll's seed). */
const isRoll = (data: unknown): boolean => !!data && typeof data === "object" && typeof (data as { seed?: unknown }).seed === "string";

/** Faces typed for a roll made with dice rolled at the table, from a log entry's data. */
export function enteredFaces(data: unknown): number[] | undefined {
  const entered = data && typeof data === "object" ? (data as { entered?: unknown }).entered : undefined;
  return Array.isArray(entered) ? (entered as number[]) : undefined;
}

function shortTime(at: string): string {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? at.slice(11, 16) : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
