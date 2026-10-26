/** A builder step of typed fields: a name, an alignment, personality, appearance. */
import { builderFieldLabel, type CharacterBuilderFieldsStep, type EntityTypeDef, type GameModule } from "@campaign-forge/module-sdk";
import { useEffect, useState } from "react";
import type { StoredDraft } from "./drafts";

export interface FieldsViewProps {
  module: GameModule;
  def: EntityTypeDef | undefined;
  step: CharacterBuilderFieldsStep;
  draft: StoredDraft;
  onDraft: (next: StoredDraft) => void;
}

export function FieldsView({ module, def, step, draft, onDraft }: FieldsViewProps) {
  const values = draft.values?.[step.id] ?? {};
  const set = (path: string, value: unknown) => {
    const next = { ...values };
    if (value === "" || value === undefined) delete next[path];
    else next[path] = value;
    onDraft({ ...draft, values: { ...draft.values, [step.id]: next } });
  };
  return (
    <div className="cb-fields app-form" data-testid="fields-step">
      {step.fields.map((f) => {
        const label = f.label ?? builderFieldLabel(module, def, f.path);
        const v = values[f.path];
        const options = Array.isArray(f.options) ? f.options.map((o) => ({ id: o, name: o })) : f.options ? (module.referenceLists.find((l) => l.id === (f.options as { ref: string }).ref)?.items ?? []).map((i) => ({ id: i.id, name: i.name })) : [];
        return (
          <label key={f.path} className={`app-label cb-field${f.widget === "textarea" ? " cb-field--wide" : ""}`}>
            <span>
              {label}
              {f.required && <span aria-hidden="true"> *</span>}
            </span>
            {f.widget === "select" || options.length > 0 ? (
              <select className="cf-select" value={typeof v === "string" ? v : ""} onChange={(e) => set(f.path, e.target.value)} required={f.required} data-testid={`field:${f.path}`}>
                <option value="">—</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            ) : f.widget === "number" ? (
              <input className="cf-input" type="number" value={typeof v === "number" ? v : ""} onChange={(e) => set(f.path, e.target.value === "" ? undefined : Number(e.target.value))} required={f.required} data-testid={`field:${f.path}`} />
            ) : f.widget === "textarea" ? (
              <TextArea value={typeof v === "string" ? v : ""} onCommit={(t) => set(f.path, t)} testId={`field:${f.path}`} />
            ) : (
              <TextInput value={typeof v === "string" ? v : ""} onCommit={(t) => set(f.path, t)} required={f.required} testId={`field:${f.path}`} />
            )}
            {f.help && <span className="cf-muted app-small">{f.help}</span>}
          </label>
        );
      })}
    </div>
  );
}

/** Typing stays local; the draft is written as the player goes (debounced by the page) and on blur. */
function TextInput({ value, onCommit, required, testId }: { value: string; onCommit: (v: string) => void; required?: boolean | undefined; testId: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <input
      className="cf-input"
      value={text}
      required={required}
      onChange={(e) => {
        setText(e.target.value);
        onCommit(e.target.value);
      }}
      data-testid={testId}
    />
  );
}

function TextArea({ value, onCommit, testId }: { value: string; onCommit: (v: string) => void; testId: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <textarea
      className="cf-input cb-field__area"
      rows={3}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onCommit(e.target.value);
      }}
      data-testid={testId}
    />
  );
}
