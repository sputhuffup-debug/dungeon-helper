import { useSheetContext } from "../context";
import { Button, IconButton } from "../primitives/Button";
import { cx } from "../sheet/paths";
import type { WidgetProps } from "./types";

function EntityName({ id }: { id: string }) {
  const { resolveEntityName } = useSheetContext();
  const name = resolveEntityName?.(id);
  return <span className="cf-ref__name" title={id}>{name ?? id}</span>;
}

/** A single entity reference: resolved name, pick and clear. */
export function RefField({ value, onChange, readonly, field }: WidgetProps) {
  const { onPickEntity } = useSheetContext();
  const id = typeof value === "string" && value ? value : undefined;
  return (
    <div className="cf-ref">
      {id ? <EntityName id={id} /> : <span className={cx("cf-ref__name", "cf-ref__name--empty")}>None</span>}
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
