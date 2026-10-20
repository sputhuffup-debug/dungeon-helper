/** Procedure input form generated from the procedure's `inputs` JSON Schema. */
import type { CampaignStore } from "@campaign-forge/core";
import type { LoadedModule } from "@campaign-forge/module-sdk";
import { Button, IconButton } from "../../components/ui";
import { humanize } from "../../lib/format";
import { characterItem, entityHint, entitySnapshot, isCharacterArray, playerCharacters, schemaTypeOf, type Schema } from "./prefill";

export interface InputFormProps {
  properties: Record<string, Schema>;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  store: CampaignStore;
  module: Pick<LoadedModule, "entityType">;
}

export function InputForm({ properties, value, onChange, store, module }: InputFormProps) {
  const keys = Object.keys(properties);
  const extra = Object.keys(value).filter((k) => !(k in properties));
  const set = (key: string, v: unknown) => {
    const next = { ...value };
    if (v === undefined) delete next[key];
    else next[key] = v;
    onChange(next);
  };
  if (keys.length === 0 && extra.length === 0) return <p className="cf-muted">This procedure takes no inputs.</p>;
  return (
    <div className="prep-form" data-testid="procedure-inputs">
      {keys.map((key) => {
        const s = properties[key] as Schema;
        if (isCharacterArray(s)) {
          return <CharacterArrayInput key={key} name={key} schema={s} value={value[key]} onChange={(v) => set(key, v)} store={store} module={module} />;
        }
        const hint = entityHint(s);
        if (hint) {
          const current = value[key] && typeof value[key] === "object" ? (value[key] as { id?: string }).id : undefined;
          const options = store
            .list("entities")
            .filter((e) => hint.types.includes(e.type))
            .sort((a, b) => a.name.localeCompare(b.name));
          return (
            <label key={key} className="app-label prep-form__field">
              <span>{s.title ?? humanize(key)}</span>
              <select
                className="cf-select"
                aria-label={s.title ?? humanize(key)}
                value={current ?? ""}
                onChange={(e) => {
                  const picked = options.find((o) => o.id === e.target.value);
                  set(key, picked ? entitySnapshot(picked) : undefined);
                }}
                data-testid={`input-${key}`}
              >
                <option value="">None</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              {s.description && <span className="cf-muted prep-form__help">{s.description}</span>}
            </label>
          );
        }
        return (
          <label key={key} className="app-label prep-form__field">
            <span>{s.title ?? humanize(key)}</span>
            <ScalarInput name={key} schema={s} value={value[key]} onChange={(v) => set(key, v)} />
            {s.description && <span className="cf-muted prep-form__help">{s.description}</span>}
          </label>
        );
      })}
      {extra.length > 0 && (
        <div className="prep-form__extra">
          <span className="app-label">Passed in</span>
          <dl className="app-dl">
            {extra.map((k) => (
              <div key={k} className="app-dl__row">
                <dt>{humanize(k)}</dt>
                <dd className="cf-mono">{JSON.stringify(value[k])}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

/** One scalar input: enum select, number, boolean, or text. */
export function ScalarInput({ name, schema, value, onChange }: { name: string; schema: Schema; value: unknown; onChange: (v: unknown) => void }) {
  const type = schemaTypeOf(schema);
  const label = schema.title ?? humanize(name);
  if (Array.isArray(schema.enum)) {
    const hasDefault = schema.default !== undefined;
    return (
      <select
        className="cf-select"
        aria-label={label}
        value={value === undefined ? "" : String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") return onChange(undefined);
          const match = schema.enum?.find((x) => String(x) === raw);
          onChange(match ?? raw);
        }}
      >
        {(!hasDefault || value === undefined) && <option value="">Decide by rolling</option>}
        {schema.enum.map((opt) => (
          <option key={String(opt)} value={String(opt)}>
            {humanize(String(opt))}
          </option>
        ))}
      </select>
    );
  }
  if (type === "boolean") {
    if (schema.default === undefined) {
      return (
        <select
          className="cf-select"
          aria-label={label}
          value={value === true ? "yes" : value === false ? "no" : ""}
          onChange={(e) => onChange(e.target.value === "yes" ? true : e.target.value === "no" ? false : undefined)}
        >
          <option value="">Decide by rolling</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      );
    }
    return <input className="cf-checkbox" type="checkbox" aria-label={label} checked={value === true} onChange={(e) => onChange(e.target.checked)} />;
  }
  if (type === "integer" || type === "number") {
    return (
      <input
        className="cf-input"
        type="number"
        aria-label={label}
        min={schema.minimum}
        max={schema.maximum}
        step={type === "integer" ? 1 : "any"}
        value={typeof value === "number" ? value : ""}
        onChange={(e) => {
          if (e.target.value === "") return onChange(undefined);
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(type === "integer" ? Math.round(n) : n);
        }}
      />
    );
  }
  return (
    <input
      className="cf-input"
      aria-label={label}
      placeholder={schema.default === undefined ? "Generated when empty" : undefined}
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
    />
  );
}

/** A per-character list (items with id and name), filled from the campaign's PCs. */
function CharacterArrayInput({ name, schema, value, onChange, store, module }: { name: string; schema: Schema; value: unknown; onChange: (v: unknown) => void } & Pick<InputFormProps, "store" | "module">) {
  const items = Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
  const itemProps = Object.entries(schema.items?.properties ?? {}).filter(([k]) => k !== "id" && k !== "name");
  const pcs = playerCharacters(store, module);
  const missing = pcs.filter((pc) => !items.some((it) => it.id === pc.id));
  const setItem = (i: number, key: string, v: unknown) => onChange(items.map((it, j) => (j === i ? { ...it, [key]: v } : it)));
  return (
    <fieldset className="app-fieldset prep-form__array">
      <legend className="app-label">{schema.title ?? humanize(name)}</legend>
      {items.length === 0 && <p className="cf-muted">{pcs.length ? "No characters added." : "No player characters in this campaign yet. Mark a character as a PC to add it here."}</p>}
      {items.length > 0 && (
        <table className="cf-table prep-form__table">
          <thead>
            <tr>
              <th>Character</th>
              {itemProps.map(([k, s]) => (
                <th key={k}>{(s as Schema).title ?? humanize(k)}</th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={String(it.id ?? i)}>
                <td>{String(it.name ?? it.id ?? `#${i + 1}`)}</td>
                {itemProps.map(([k, s]) => (
                  <td key={k}>
                    <ScalarInput name={`${String(it.name ?? "")} ${k}`} schema={s as Schema} value={it[k]} onChange={(v) => setItem(i, k, v)} />
                  </td>
                ))}
                <td>
                  <IconButton size="sm" variant="ghost" label={`Remove ${String(it.name ?? "")}`} icon="×" onClick={() => onChange(items.filter((_, j) => j !== i))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {missing.length > 0 && (
        <div className="app-row">
          {missing.map((pc) => (
            <Button key={pc.id} size="sm" onClick={() => onChange([...items, characterItem(schema.items, pc)])}>
              + {pc.name}
            </Button>
          ))}
        </div>
      )}
    </fieldset>
  );
}
