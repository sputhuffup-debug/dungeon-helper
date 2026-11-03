/**
 * After a run is accepted: what happened, the next step as the main button
 * (open what it made), and "Accept again" demoted to a quiet button with a
 * confirm that says what a second accept does.
 */
import { useState, type ReactNode } from "react";
import { Button } from "../../components/ui";
import { ConfirmDialog } from "../../components/ConfirmDialog";

export interface AcceptedActionsProps {
  /** "Accepted 2 minutes ago. Wrote 4 agendas." */
  note: ReactNode;
  /** The next step: links styled as the main button (and any secondary ones). */
  onward?: ReactNode;
  /** What accepting again does, for the confirm ("It creates another copy of every record: duplicates."). */
  again: string;
  onAgain: () => void;
  busy?: boolean;
}

export function AcceptedActions({ note, onward, again, onAgain, busy }: AcceptedActionsProps) {
  const [asking, setAsking] = useState(false);
  return (
    <div className="app-stack prep-accepted" data-testid="accepted-actions">
      <div className="app-note" data-testid="accepted-note">
        {note}
      </div>
      {onward && (
        <div className="app-row prep-accepted__onward" data-testid="accept-onward">
          {onward}
        </div>
      )}
      <div className="app-row">
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => setAsking(true)} data-testid="accept-again">
          Accept again…
        </Button>
      </div>
      <ConfirmDialog
        open={asking}
        title="Accept this run again?"
        confirmLabel="Accept again"
        danger
        busy={busy}
        onCancel={() => setAsking(false)}
        onConfirm={() => {
          setAsking(false);
          onAgain();
        }}
      >
        <p data-testid="accept-again-warning">{again}</p>
      </ConfirmDialog>
    </div>
  );
}
