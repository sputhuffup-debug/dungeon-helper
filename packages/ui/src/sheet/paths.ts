/**
 * Sheet field paths are schema paths ("skills.*", "gear[].name"). The value a
 * widget edits lives at the prefix before the first wildcard or array marker.
 */
export function valuePathOf(fieldPath: string): string {
  const segs: string[] = [];
  for (const raw of fieldPath.split(".")) {
    if (raw === "*" || raw === "") break;
    const idx = raw.indexOf("[]");
    if (idx >= 0) {
      if (idx > 0) segs.push(raw.slice(0, idx));
      break;
    }
    segs.push(raw);
  }
  return segs.join(".");
}

/** "attributes.might" -> "Might"; "favoredSkill" -> "Favored skill"; "gear[].name" -> "Gear". */
export function labelFromPath(fieldPath: string): string {
  const vp = valuePathOf(fieldPath) || fieldPath;
  const last = vp.split(".").filter(Boolean).pop() ?? vp;
  return humanize(last);
}

export function humanize(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

let counter = 0;
/** Unique-enough ids for new records created in the UI (zones, countdowns...). */
export function newId(prefix = "id"): string {
  counter += 1;
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  const rand = g.crypto?.randomUUID ? g.crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}_${rand}`;
}

export function clamp(n: number, min?: number, max?: number): number {
  let v = n;
  if (typeof min === "number" && v < min) v = min;
  if (typeof max === "number" && v > max) v = max;
  return v;
}

export function asNumber(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return fallback;
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
