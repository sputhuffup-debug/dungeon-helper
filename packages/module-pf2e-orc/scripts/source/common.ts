/** What every converter shares: the text pipeline, Reserved Material scrubbing and small formatters. */
import { findReserved, scrub, scrubLine, type ScrubLog } from "./reserved.ts";
import { arr, num, obj, str, strs, type Entry, type Raw } from "./read.ts";
import { firstSentence, toMarkdown, type TextContext } from "./text.ts";

export interface Ctx {
  text: TextContext;
  scrub: ScrubLog;
  /** Free-form conversion notes. */
  notes: string[];
}

/** Description HTML → Markdown, without Reserved Material. */
export function md(ctx: Ctx, html: unknown): string {
  return scrub(toMarkdown(html, ctx.text), ctx.scrub);
}

/** A one-line plain string (a name list, a note), without Reserved Material ("" when it named one). */
export function line(ctx: Ctx, s: unknown): string {
  const plain = toMarkdown(str(s), ctx.text).replace(/\*+/g, "").replace(/\n+/g, " ").trim();
  return scrubLine(plain, ctx.scrub);
}

export { firstSentence };

/**
 * Whether an entry may be used: its name is not Reserved Material, and it is
 * not a unique (named) creature or artifact. Dropped entries are logged.
 */
export function usable(ctx: Ctx, e: Entry): boolean {
  const term = findReserved(e.name);
  if (term) {
    ctx.scrub.dropped.push(`${e.folder}: ${e.name} (name is Reserved Material: ${term.term})`);
    return false;
  }
  if (str(obj(e.system.traits).rarity) === "unique") {
    ctx.scrub.dropped.push(`${e.folder}: ${e.name} (unique: a named character or artifact of the setting)`);
    return false;
  }
  return true;
}

const ACTION_GLYPH: Record<string, string> = { "1": "◆", "2": "◆◆", "3": "◆◆◆" };

/** Action cost as glyph text: ◆, ◆◆, ◆◆◆, ↺ (reaction), ◇ (free action); "" for passive. */
export function actionCost(system: Raw): string {
  const type = str(obj(system.actionType).value);
  const n = num(obj(system.actions).value, 0);
  if (type === "action") return ACTION_GLYPH[String(n)] ?? "◆";
  if (type === "reaction") return "↺";
  if (type === "free") return "◇";
  return "";
}

/** A spell's casting time ("1", "2", "1 to 3", "reaction", "10 minutes") as glyphs or text. */
export function castTime(value: string): string {
  const v = value.trim();
  if (ACTION_GLYPH[v]) return ACTION_GLYPH[v]!;
  const range = /^(\d) (?:to|-) (\d)$/.exec(v);
  if (range) return `${ACTION_GLYPH[range[1]!] ?? range[1]} to ${ACTION_GLYPH[range[2]!] ?? range[2]}`;
  if (v === "reaction") return "↺";
  if (v === "free") return "◇";
  return v;
}

const words = (s: string) => s.replace(/-/g, " ");
const UPPER: Record<string, string> = { b: "B", p: "P", s: "S" };

/** A trait slug as printed: "deadly-d10" → "deadly d10", "reach-15" → "reach 15 feet", "versatile-p" → "versatile P". */
export function traitText(slug: string): string {
  let m = /^(reach|thrown|volley|range-increment|range|aura|emanation|tethered)-(\d+)$/.exec(slug);
  if (m) return `${words(m[1]!)} ${m[2]} feet`;
  m = /^versatile-([bps])$/.exec(slug);
  if (m) return `versatile ${UPPER[m[1]!]}`;
  m = /^(.*)-(d\d+)$/.exec(slug);
  if (m) return `${words(m[1]!)} ${m[2]}`;
  m = /^(.*)-(\d+)$/.exec(slug);
  if (m) return `${words(m[1]!)} ${m[2]}`;
  return words(slug);
}

/** Traits (rarity first when not common) as one comma-separated line. */
export function traitsLine(system: Raw, extra: string[] = []): string {
  const t = obj(system.traits);
  const rarity = str(t.rarity);
  const list = [...(rarity && rarity !== "common" ? [rarity] : []), ...strs(t.value).map(traitText), ...extra];
  return [...new Set(list)].join(", ");
}

const PER: Record<string, string> = { turn: "turn", round: "round", day: "day", PT1M: "minute", PT10M: "10 minutes", PT1H: "hour", PT24H: "day", P1W: "week", P1M: "month", P1Y: "year" };
const TIMES = ["", "once", "twice", "three times"];

/** `frequency: { max, per }` as "once per day". */
export function frequencyText(v: unknown): string {
  const f = obj(v);
  if (Object.keys(f).length === 0) return "";
  const max = num(f.max, 1);
  const per = str(f.per);
  return `${TIMES[max] ?? `${max} times`} per ${PER[per] ?? per.toLowerCase()}`;
}

/** Price `{ value: { gp, sp, cp, pp }, per }` as "1 gp 5 sp" (and "for 10"). */
export function priceText(v: unknown): string {
  const p = obj(v);
  const value = obj(p.value);
  const parts = ["pp", "gp", "sp", "cp"].filter((k) => num(value[k], 0) > 0).map((k) => `${num(value[k])} ${k}`);
  const per = num(p.per, 1);
  if (parts.length === 0) return "—";
  return `${parts.join(" ")}${per > 1 ? ` (for ${per})` : ""}`;
}

/** Bulk 0.1 → "L", 0 → "—", n → "n". */
export function bulkText(v: unknown): string {
  const b = num(obj(v).value, 0);
  if (b === 0) return "—";
  if (b < 1) return "L";
  return String(b);
}

/** Bulk as a number for sums (light = 0.1). */
export function bulkValue(v: unknown): number {
  const b = num(obj(v).value, 0);
  return b > 0 && b < 1 ? 0.1 : b;
}

/** Prerequisites `{ value: [{ value }] }` as one line. */
export function prerequisites(ctx: Ctx, system: Raw): string {
  return arr(obj(system.prerequisites).value)
    .map((p) => line(ctx, obj(p).value))
    .filter(Boolean)
    .join("; ");
}

/** "+5" / "−2". */
export function signed(n: number): string {
  return n < 0 ? `−${Math.abs(n)}` : `+${n}`;
}

/** Title case a slug: "low-light-vision" → "Low-Light Vision". */
export function titleSlug(slug: string): string {
  return slug.replace(/(^|[\s-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase()).replace(/-(?=[A-Z][a-z]+(\s|$))/g, " ");
}

/** "Ordinal" spell ranks: 1st, 2nd, 3rd, 4th. */
export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** Unique, stable ids within a list: the slug, then "-2", "-3" for repeats. */
export function uniqueIds(): (name: string) => string {
  const seen = new Map<string, number>();
  return (name: string) => {
    const base = name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  };
}
