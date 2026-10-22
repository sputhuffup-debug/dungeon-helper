/**
 * Reading the Foundry VTT pf2e system's compendium sources (`packs/pf2e/<dir>/**.json`)
 * as untrusted data: every file is parsed with JSON.parse and every value is
 * read through a typed accessor, so nothing from the source is ever run and
 * only the fields we copy reach the pack. Images, icons, `rules` (Foundry
 * automation), flags and ids are never copied.
 *
 * Only entries whose `publication` is ORC-licensed, remastered, and from one
 * of the allowed books are kept (the four core books for the module, the
 * supplement's allow-list for the supplement); every other entry is counted
 * as an exclusion with its reason.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { BOOKS } from "../ids.ts";

export type Raw = Record<string, unknown>;

const FILE_LIMIT = 4 * 1024 * 1024;

export function str(v: unknown, fallback = ""): string {
  if (typeof v !== "string") return fallback;
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
}
export function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
export function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
export function obj(v: unknown): Raw {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {};
}
export function objs(v: unknown): Raw[] {
  return arr(v).filter((x): x is Raw => x !== null && typeof x === "object" && !Array.isArray(x));
}
export function strs(v: unknown): string[] {
  return arr(v)
    .map((x) => str(x))
    .filter((x) => x.length > 0);
}
/** `a.b.c` inside a raw object. */
export function at(o: unknown, path: string): unknown {
  let cur: unknown = o;
  for (const k of path.split(".")) cur = obj(cur)[k];
  return cur;
}

/** One parsed source entry, with where it came from. */
export interface Entry {
  /** Folder under packs/pf2e (e.g. "spells"). */
  folder: string;
  /** Path below the folder (e.g. "spells/rank-3/fireball.json"). */
  file: string;
  name: string;
  type: string;
  system: Raw;
  items: Raw[];
  /** The core book, without "Pathfinder" (e.g. "Player Core"). */
  book: string;
}

export interface ReadLog {
  /** folder → reason → count */
  excluded: Record<string, Record<string, number>>;
  included: Record<string, number>;
}

export function newLog(): ReadLog {
  return { excluded: {}, included: {} };
}

export function exclude(log: ReadLog, folder: string, reason: string): void {
  const f = (log.excluded[folder] ??= {});
  f[reason] = (f[reason] ?? 0) + 1;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith(".json") && !name.startsWith("_")) out.push(p);
  }
  return out;
}

/** The publication of an entry: `system.publication`, or `system.details.publication` for actors. */
export function publicationOf(system: Raw): { title: string; license: string; remaster: boolean } | undefined {
  const pub = obj(system.publication ?? obj(system.details).publication);
  if (Object.keys(pub).length === 0) return undefined;
  return { title: str(pub.title), license: str(pub.license), remaster: pub.remaster === true };
}

/** Which books to keep: publication title → the book as cited, and how the exclusion reason names them. */
export interface BookFilter {
  books: Record<string, string>;
  label: string;
}

export const CORE_BOOKS: BookFilter = { books: BOOKS, label: "Player Core, Player Core 2, GM Core or Monster Core" };

/**
 * Every ORC, remastered entry from one of the books in `filter` (by default
 * the four core books) in `packs/pf2e/<folder>`, sorted by file path. Other
 * entries are logged as exclusions with the reason.
 */
export function readFolder(root: string, folder: string, log: ReadLog, filter: BookFilter = CORE_BOOKS): Entry[] {
  const dir = join(root, "packs", "pf2e", folder);
  const out: Entry[] = [];
  for (const path of walk(dir)) {
    const text = readFileSync(path, "utf8");
    if (text.length > FILE_LIMIT) throw new Error(`${path} is larger than expected`);
    const data: unknown = JSON.parse(text);
    const raw = obj(data);
    const system = obj(raw.system);
    const pub = publicationOf(system);
    if (!pub) {
      exclude(log, folder, "no publication data");
      continue;
    }
    const book = filter.books[pub.title];
    if (pub.license !== "ORC") {
      exclude(log, folder, `licence ${pub.license || "unknown"} (not ORC)`);
      continue;
    }
    if (!pub.remaster) {
      exclude(log, folder, "not remastered");
      continue;
    }
    if (!book) {
      exclude(log, folder, `ORC, but not from ${filter.label}`);
      continue;
    }
    const name = str(raw.name);
    if (!name) throw new Error(`${path}: entry without a name`);
    out.push({ folder, file: relative(join(root, "packs", "pf2e"), path), name, type: str(raw.type), system, items: objs(raw.items), book });
  }
  log.included[folder] = (log.included[folder] ?? 0) + out.length;
  return out;
}

/** Read a JSON localization file (static/lang/*.json) as a nested object of strings. */
export function readLocalization(root: string, files: string[]): Raw {
  const merged: Raw = {};
  const merge = (into: Raw, from: Raw) => {
    for (const [k, v] of Object.entries(from)) {
      if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
      if (v !== null && typeof v === "object" && !Array.isArray(v)) merge((into[k] = obj(into[k])) as Raw, v as Raw);
      else if (typeof v === "string") into[k] = v;
    }
  };
  for (const f of files) merge(merged, obj(JSON.parse(readFileSync(join(root, "static", "lang", f), "utf8"))));
  return merged;
}
