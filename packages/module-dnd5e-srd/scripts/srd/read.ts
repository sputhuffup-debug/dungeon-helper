/**
 * Reading the 5e-bits/5e-database SRD 5.1 JSON (src/2014/en) as untrusted
 * data: every file is parsed with JSON.parse and every value is read through a
 * typed accessor, so nothing from the source is ever run, and only the fields
 * we copy reach the pack. `image` and API `url` fields are never copied.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type Raw = Record<string, unknown>;

const FILE_LIMIT = 8 * 1024 * 1024;

/** One source file as a list of objects. Throws on anything else. */
export function readSource(dir: string, name: string): Raw[] {
  if (!/^5e-SRD-[A-Za-z-]+\.json$/.test(name)) throw new Error(`unexpected source file name ${name}`);
  const text = readFileSync(join(dir, name), "utf8");
  if (text.length > FILE_LIMIT) throw new Error(`${name} is larger than expected`);
  const data: unknown = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error(`${name} is not a JSON list`);
  return data.filter((x): x is Raw => x !== null && typeof x === "object" && !Array.isArray(x));
}

/** A string field, trimmed; control characters other than newlines and tabs are dropped. */
export function str(v: unknown, fallback = ""): string {
  if (typeof v !== "string") return fallback;
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
}

export function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export function bool(v: unknown): boolean {
  return v === true;
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

/** A list of strings (non-strings dropped). */
export function strs(v: unknown): string[] {
  return arr(v)
    .map((x) => str(x))
    .filter((x) => x.length > 0);
}

/** `desc` as one Markdown text: a string, or paragraphs joined by blank lines (bullet runs kept together). */
export function text(v: unknown): string {
  if (typeof v === "string") return str(v);
  const parts = strs(v);
  let out = "";
  parts.forEach((p, i) => {
    if (i === 0) out = p;
    else {
      const prev = parts[i - 1] ?? "";
      const listy = (s: string) => /^([-*•]|\d+[.)])\s/.test(s) || s.startsWith("|");
      out += listy(p) && (listy(prev) || prev.endsWith(":")) ? `\n${p}` : `\n\n${p}`;
    }
  });
  return out;
}

/** The `name` of an API reference object ({ index, name, url }). */
export function refName(v: unknown): string {
  return str(obj(v).name);
}

export function refIndex(v: unknown): string {
  return str(obj(v).index);
}

/** A safe id segment: lower case letters, digits and hyphens. */
export function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** An id-safe copy of a source index. */
export function index(v: unknown): string {
  const s = slug(str(v));
  if (!s) throw new Error(`missing index in source entry ${JSON.stringify(v)}`);
  return s;
}

const ORD = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];
export function ordinal(n: number): string {
  return ORD[n] ?? `${n}th`;
}

/** "1/8", "1/4", "1/2" or the number. */
export function crLabel(cr: number): string {
  if (cr === 0.125) return "1/8";
  if (cr === 0.25) return "1/4";
  if (cr === 0.5) return "1/2";
  return String(cr);
}

export function signed(n: number): string {
  return n < 0 ? `−${Math.abs(n)}` : `+${n}`;
}

/** "1d6+2" as "1d6 + 2". */
export function diceText(s: string): string {
  return s.replace(/\s*([+-])\s*/g, " $1 ").trim();
}

export function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

/** Cost as "15 gp". */
export function cost(v: unknown): string {
  const c = obj(v);
  const q = num(c.quantity, NaN);
  const unit = str(c.unit);
  return Number.isFinite(q) && unit ? `${q} ${unit}` : "";
}
