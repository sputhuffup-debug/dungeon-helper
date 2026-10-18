import { useState } from "react";
import { Button } from "../primitives/Button";
import { PageRef } from "../primitives/PageRef";
import { isRecord, newId } from "../sheet/paths";
import type { WidgetProps } from "./types";

export interface ConditionEntry {
  id: string;
  label: string;
  source?: string;
  page?: number | [number, number];
}

export function normalizeConditions(value: unknown): ConditionEntry[] {
  if (!Array.isArray(value)) return [];
  const out: ConditionEntry[] = [];
  for (const v of value) {
    if (typeof v === "string") out.push({ id: v, label: v });
    else if (isRecord(v) && typeof v.id === "string") {
      const entry: ConditionEntry = { id: v.id, label: typeof v.label === "string" ? v.label : v.id };
      if (typeof v.source === "string") entry.source = v.source;
      if (typeof v.page === "number" || Array.isArray(v.page)) entry.page = v.page as ConditionEntry["page"];
      out.push(entry);
    }
  }
  return out;
}

/** Chips with a remove button; a free-text add box for ad-hoc conditions. */
export function ConditionsField({ id, value, onChange, readonly }: WidgetProps) {
  const conditions = normalizeConditions(value);
  const [draft, setDraft] = useState("");
  const remove = (cid: string) => onChange(conditions.filter((c) => c.id !== cid));
  const add = () => {
    const label = draft.trim();
    if (!label) return;
    onChange([...conditions, { id: newId("cond"), label, source: "gm" }]);
    setDraft("");
  };
  return (
    <div className="cf-conditions">
      <div className="cf-chips">
        {conditions.length === 0 && <span className="cf-muted">None</span>}
        {conditions.map((c) => (
          <span key={c.id} className="cf-chip cf-chip--danger" title={c.source}>
            {c.label} <PageRef page={c.page} />
            {!readonly && (
              <button type="button" className="cf-chip__remove" aria-label={`Remove ${c.label}`} onClick={() => remove(c.id)}>
                ×
              </button>
            )}
          </span>
        ))}
      </div>
      {!readonly && (
        <div className="cf-tags__input">
          <input
            id={id}
            className="cf-input"
            type="text"
            value={draft}
            placeholder="Add condition…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <Button onClick={add} disabled={!draft.trim()}>
            Add
          </Button>
        </div>
      )}
    </div>
  );
}
