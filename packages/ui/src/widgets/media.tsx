import { useSheetContext } from "../context";
import { Button } from "../primitives/Button";
import type { WidgetProps } from "./types";

/** An asset id or URL string, with a preview when the context can resolve it. */
export function ImageField({ id, value, onChange, readonly, field }: WidgetProps) {
  const { resolveAssetUrl } = useSheetContext();
  const str = typeof value === "string" ? value : "";
  const url = str ? resolveAssetUrl?.(str) ?? (/^(https?:|data:|blob:|\/)/.test(str) ? str : undefined) : undefined;
  return (
    <div className="cf-image">
      {url && <img className="cf-image__preview" src={url} alt={field.label ?? "Image"} />}
      {readonly ? (
        !url && <span className="cf-muted">{str || "—"}</span>
      ) : (
        <input id={id} className="cf-input" type="text" placeholder="Asset id or URL" value={str} onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)} />
      )}
    </div>
  );
}

/** A map reference with an "open map" button. */
export function ZoneMapField({ value, field }: WidgetProps) {
  const { onOpenMap, resolveMap } = useSheetContext();
  const stored = typeof value === "string" && value ? value : undefined;
  const found = resolveMap?.(stored, field);
  const mapId = found?.id ?? stored;
  return (
    <div className="cf-zonemap-field" style={{ display: "flex", gap: 8, alignItems: "center" }} data-testid="zone-map-field">
      <span className={mapId ? undefined : "cf-muted"}>{found?.name ?? mapId ?? "No map"}</span>
      <Button size="sm" onClick={() => onOpenMap?.(mapId, field)} disabled={!onOpenMap || !mapId}>
        Open map
      </Button>
    </div>
  );
}
