/** Small editing controls shared by the adventure builder panes. */
import type { CoreEntityKind } from "@campaign-forge/module-sdk";
import type { Entity, Id } from "@campaign-forge/core";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { EntityIcon } from "../../components/EntityIcon";
import { EntityPicker } from "../../components/EntityPicker";
import { Button, IconButton } from "../../components/ui";
import { useCampaign, useMapVersion } from "../../state/hooks";

/** Entity type ids of the given core kinds in the campaign's module. */
export function useTypesOfKind(kinds: CoreEntityKind[]): string[] {
  const { module } = useCampaign();
  const key = kinds.join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => module.module.entityTypes.filter((t) => kinds.includes(t.kind)).map((t) => t.id), [module, key]);
}

/** A text input that commits on blur / Enter and follows outside changes. */
export function CommitInput({ value, onCommit, label, placeholder, className, testId }: { value: string; onCommit: (v: string) => void; label: string; placeholder?: string; className?: string; testId?: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <input
      className={className ?? "cf-input"}
      aria-label={label}
      placeholder={placeholder}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text !== value) onCommit(text);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setText(value);
      }}
      data-testid={testId}
    />
  );
}

export function CommitTextarea({ value, onCommit, label, placeholder, rows = 3 }: { value: string; onCommit: (v: string) => void; label: string; placeholder?: string; rows?: number }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <textarea
      className="cf-textarea"
      aria-label={label}
      placeholder={placeholder}
      rows={rows}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text !== value) onCommit(text);
      }}
    />
  );
}

function EntityChip({ id, onRemove }: { id: Id; onRemove?: () => void }) {
  const ctx = useCampaign();
  useMapVersion("entities");
  const e = ctx.store.get("entities", id);
  const def = e ? ctx.module.entityType(e.type) : undefined;
  return (
    <span className={`cf-chip${e ? "" : " cf-chip--danger"}`}>
      <EntityIcon icon={def?.icon} kind={def?.kind} size={12} />
      {e ? (
        <Link to="/c/$campaignId/entities/$entityId" params={{ campaignId: ctx.campaignId, entityId: id }} className="prep-chip-link">
          {e.name}
        </Link>
      ) : (
        <span>deleted</span>
      )}
      {onRemove && (
        <button type="button" className="cf-chip__remove" aria-label={`Remove ${e?.name ?? id}`} onClick={onRemove}>
          ×
        </button>
      )}
    </span>
  );
}

/** One entity reference with pick / clear. */
export function EntityRefInput({ value, onChange, types, label }: { value: Id | undefined; onChange: (id: Id | undefined) => void; types: string[]; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="app-row">
      {value ? <EntityChip id={value} /> : <span className="cf-muted">None</span>}
      <Button size="sm" onClick={() => setOpen(true)} aria-label={`Pick ${label.toLowerCase()}`}>
        {value ? "Change" : "Pick"}
      </Button>
      {value && <IconButton size="sm" variant="ghost" label={`Clear ${label.toLowerCase()}`} icon="×" onClick={() => onChange(undefined)} />}
      <EntityPicker
        open={open}
        title={`Choose ${label.toLowerCase()}`}
        types={types}
        onClose={() => setOpen(false)}
        onPick={(e: Entity) => {
          setOpen(false);
          onChange(e.id);
        }}
      />
    </div>
  );
}

/** Several entity references as chips with an "Add" picker. */
export function EntityListInput({ value, onChange, types, label }: { value: Id[]; onChange: (ids: Id[]) => void; types?: string[]; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="cf-chips">
      {value.length === 0 && <span className="cf-muted">None</span>}
      {value.map((id) => (
        <EntityChip key={id} id={id} onRemove={() => onChange(value.filter((x) => x !== id))} />
      ))}
      <Button size="sm" onClick={() => setOpen(true)} aria-label={`Add ${label.toLowerCase()}`}>
        + Add
      </Button>
      <EntityPicker
        open={open}
        title={`Add ${label.toLowerCase()}`}
        types={types}
        exclude={value}
        onClose={() => setOpen(false)}
        onPick={(e: Entity) => {
          setOpen(false);
          onChange([...value, e.id]);
        }}
      />
    </div>
  );
}
