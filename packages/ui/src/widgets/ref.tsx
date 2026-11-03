import { useMemo } from "react";
import { useSheetContext } from "../context";
import { Button, IconButton } from "../primitives/Button";
import { cx } from "../sheet/paths";
import type { WidgetProps } from "./types";

function EntityName({ id }: { id: string }) {
  const { resolveEntityName } = useSheetContext();
  const name = resolveEntityName?.(id);
  return <span className="cf-ref__name" title={id}>{name ?? id}</span>;
}

function stringList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/**
 * A ref limited to cast members: `config.castRoles` (role ids the host's
 * `castMembers` resolves) and an optional `config.everyoneValue` /
 * `config.everyoneLabel` choice meaning "the whole group".
 */
function CastRefSelect({ id, value, onChange, readonly, field, invalid }: WidgetProps) {
  const { castMembers, resolveEntityName } = useSheetContext();
  const roles = stringList(field.config?.castRoles);
  const everyone = typeof field.config?.everyoneValue === "string" ? field.config.everyoneValue : undefined;
  const everyoneLabel = typeof field.config?.everyoneLabel === "string" ? field.config.everyoneLabel : "Everyone";
  const current = typeof value === "string" ? value : "";
  const options: Array<{ id: string; name: string }> = [];
  const seen = new Set<string>();
  for (const role of roles) {
    for (const m of castMembers?.(role) ?? []) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      options.push(m);
    }
  }
  if (current && current !== everyone && !seen.has(current)) options.push({ id: current, name: resolveEntityName?.(current) ?? current });
  const label = (v: string) => (v === everyone ? everyoneLabel : (options.find((o) => o.id === v)?.name ?? v));
  if (readonly) return <span className="cf-ref__name">{current ? label(current) : "None"}</span>;
  return (
    <select id={id} className={cx("cf-select", invalid && "cf-select--invalid")} value={current} onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}>
      {everyone === undefined ? <option value="">None</option> : current === "" && <option value="">Choose…</option>}
      {everyone !== undefined && <option value={everyone}>{everyoneLabel}</option>}
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}

/** Looks like a record id (a ULID), not a name someone typed. */
const ID_SHAPE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * `config.pick: "select"`: a dropdown of the campaign's entities of the
 * field's `entityTypes` (only player characters with `config.pc`), never the
 * entity itself. A value that is no entity's id is older free text: it is
 * shown as typed, kept until the GM picks someone, and "Link to …" converts
 * it in one click when an entity has that name.
 */
function RefSelect({ id, value, onChange, readonly, field, invalid }: WidgetProps) {
  const { entitiesOf, resolveEntityName, entityId } = useSheetContext();
  const current = typeof value === "string" ? value : "";
  const types = field.entityTypes ?? [];
  const pcOnly = field.config?.pc === true;
  const options = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ id: string; name: string }> = [];
    for (const t of types) {
      for (const e of entitiesOf?.(t) ?? []) {
        if (seen.has(e.id) || e.id === entityId || (pcOnly && !e.pc)) continue;
        seen.add(e.id);
        out.push({ id: e.id, name: e.name });
      }
    }
    return out;
  }, [types, entitiesOf, entityId, pcOnly]);
  const resolved = current ? resolveEntityName?.(current) : undefined;
  const legacy = current && resolved === undefined && !ID_SHAPE.test(current) ? current.trim() : "";
  const match = legacy ? options.find((o) => sameName(o.name, legacy)) : undefined;
  const label = resolved ?? (legacy || (current ? "Missing record" : "None"));
  if (readonly) return <span className={cx("cf-ref__name", !current && "cf-ref__name--empty")}>{label}</span>;
  const missing = current && !options.some((o) => o.id === current);
  return (
    <div className="cf-ref cf-ref--select">
      <select
        id={id}
        className={cx("cf-select", invalid && "cf-select--invalid")}
        value={current}
        onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
        data-legacy={legacy ? "true" : undefined}
      >
        <option value="">None</option>
        {missing && <option value={current}>{legacy ? `“${legacy}” (typed)` : label}</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      {legacy && (
        <span className="cf-ref__legacy cf-muted">
          {match ? (
            <Button size="sm" onClick={() => onChange(match.id)}>
              Link to {match.name}
            </Button>
          ) : (
            "Typed by hand: pick who it is."
          )}
        </span>
      )}
    </div>
  );
}

/** A single entity reference: resolved name, pick and clear (or a dropdown with `config.pick: "select"`). */
export function RefField(props: WidgetProps) {
  const { value, onChange, readonly, field } = props;
  const { onPickEntity, castMembers, entitiesOf } = useSheetContext();
  if (castMembers && stringList(field.config?.castRoles).length > 0) return <CastRefSelect {...props} />;
  if (field.config?.pick === "select" && (entitiesOf || readonly)) return <RefSelect {...props} />;
  const id = typeof value === "string" && value ? value : undefined;
  const everyone = typeof field.config?.everyoneValue === "string" && id === field.config.everyoneValue;
  return (
    <div className="cf-ref">
      {everyone ? (
        <span className="cf-ref__name">{typeof field.config?.everyoneLabel === "string" ? field.config.everyoneLabel : "Everyone"}</span>
      ) : id ? (
        <EntityName id={id} />
      ) : (
        <span className={cx("cf-ref__name", "cf-ref__name--empty")}>None</span>
      )}
      {!readonly && onPickEntity && (
        <Button size="sm" onClick={() => onPickEntity(field, value)}>
          Pick
        </Button>
      )}
      {!readonly && id && <IconButton size="sm" variant="ghost" label="Clear" icon="×" onClick={() => onChange(undefined)} />}
    </div>
  );
}

/** A list of entity references. */
export function RefListField({ value, onChange, readonly, field }: WidgetProps) {
  const { onPickEntity } = useSheetContext();
  const ids = Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  return (
    <div className="cf-ref" style={{ flexDirection: "column", alignItems: "stretch" }}>
      <div className="cf-chips">
        {ids.length === 0 && <span className="cf-muted">None</span>}
        {ids.map((id) => (
          <span key={id} className="cf-chip">
            <EntityName id={id} />
            {!readonly && (
              <button type="button" className="cf-chip__remove" aria-label={`Remove ${id}`} onClick={() => onChange(ids.filter((x) => x !== id))}>
                ×
              </button>
            )}
          </span>
        ))}
      </div>
      {!readonly && onPickEntity && (
        <div>
          <Button size="sm" onClick={() => onPickEntity(field, value)}>
            Pick
          </Button>
        </div>
      )}
    </div>
  );
}
