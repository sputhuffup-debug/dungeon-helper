/**
 * Dotted-path helpers over plain JSON objects. Used for entity fields
 * ("attributes.strength"), effects and visibility overrides.
 */

export type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function splitPath(path: string): string[] {
  return path.split(".").filter((p) => p.length > 0);
}

/** Read a dotted path. Arrays are indexed by numeric segments. */
export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const seg of splitPath(path)) {
    if (Array.isArray(cur)) {
      cur = cur[Number(seg)];
    } else if (isObject(cur)) {
      cur = cur[seg];
    } else {
      return undefined;
    }
    if (cur === undefined) return undefined;
  }
  return cur;
}

/** Set a dotted path in place, creating intermediate objects. Returns `obj`. */
export function setPath<T extends JsonObject>(obj: T, path: string, value: unknown): T {
  const segs = splitPath(path);
  if (segs.length === 0) return obj;
  let cur: JsonObject = obj;
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i] as string;
    const next = cur[seg];
    if (isObject(next)) {
      cur = next;
    } else {
      const created: JsonObject = {};
      cur[seg] = created;
      cur = created;
    }
  }
  cur[segs[segs.length - 1] as string] = value;
  return obj;
}

/** Delete a dotted path in place. Returns true when something was removed. */
export function deletePath(obj: JsonObject, path: string): boolean {
  const segs = splitPath(path);
  if (segs.length === 0) return false;
  let cur: unknown = obj;
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i] as string;
    if (Array.isArray(cur)) cur = cur[Number(seg)];
    else if (isObject(cur)) cur = cur[seg];
    else return false;
  }
  const last = segs[segs.length - 1] as string;
  if (Array.isArray(cur)) {
    const idx = Number(last);
    if (Number.isInteger(idx) && idx >= 0 && idx < cur.length) {
      cur.splice(idx, 1);
      return true;
    }
    return false;
  }
  if (isObject(cur) && last in cur) {
    delete cur[last];
    return true;
  }
  return false;
}

/** Deep clone of plain JSON data. */
export function clone<T>(value: T): T {
  if (value === undefined || value === null) return value;
  return structuredClone(value);
}

/** Flatten every string leaf of a JSON value into one list (for search). */
export function stringLeaves(value: unknown, depth = 6, out: string[] = []): string[] {
  if (depth < 0) return out;
  if (typeof value === "string") {
    out.push(value);
  } else if (typeof value === "number" || typeof value === "boolean") {
    out.push(String(value));
  } else if (Array.isArray(value)) {
    for (const v of value) stringLeaves(v, depth - 1, out);
  } else if (isObject(value)) {
    for (const v of Object.values(value)) stringLeaves(v, depth - 1, out);
  }
  return out;
}
