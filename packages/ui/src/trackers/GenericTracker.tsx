import { useEffect, useState } from "react";
import { Button } from "../primitives/Button";
import { TrackerFrame } from "./TrackerFrame";
import type { TrackerProps } from "./types";

/** Fallback for unknown tracker kinds: shows the state as JSON and lets the GM edit it. */
export function GenericTracker({ def, state, onChange, readonly, className }: TrackerProps) {
  const text = JSON.stringify(state ?? {}, null, 2);
  const [draft, setDraft] = useState(text);
  const [error, setError] = useState<string | undefined>();
  useEffect(() => setDraft(text), [text]);
  const apply = () => {
    try {
      onChange(JSON.parse(draft));
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <TrackerFrame def={def} className={className}>
      <div className="cf-muted">
        Unknown tracker kind <code>{def.kind}</code>. Editing raw state.
      </div>
      {readonly ? (
        <pre className="cf-generic__pre">{text}</pre>
      ) : (
        <>
          <textarea className="cf-textarea cf-generic__editor" aria-label="Tracker state" value={draft} onChange={(e) => setDraft(e.target.value)} />
          {error && <div className="cf-field__error">{error}</div>}
          <div>
            <Button size="sm" onClick={apply} disabled={draft === text}>
              Apply
            </Button>
          </div>
        </>
      )}
    </TrackerFrame>
  );
}
