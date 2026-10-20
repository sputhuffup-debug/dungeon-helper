/**
 * In-world dates on a module calendar: parse, format and count days. The
 * calendar is exactly what the module declares (its months and their days,
 * no leap rules), so travel and other day counts stay deterministic.
 */
import type { CalendarDef, CurrencyDef } from "./types";

export interface CalendarDate {
  year: number;
  /** 1-based. */
  month: number;
  /** 1-based. */
  day: number;
}

const DEFAULT_FORMAT = "{year}-{month:02}-{day:02}";
const TOKEN = /\{(year|month|day)(?::0(\d))?\}/g;

/** Render a date with the calendar's format template. */
export function formatCalendarDate(cal: CalendarDef, date: CalendarDate): string {
  return (cal.format ?? DEFAULT_FORMAT).replace(TOKEN, (_m, key: string, pad?: string) => {
    const v = key === "year" ? date.year : key === "month" ? date.month : date.day;
    return pad ? String(v).padStart(Number(pad), "0") : String(v);
  });
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Parse a date written in the calendar's format. Undefined when it does not match or is out of range. */
export function parseCalendarDate(cal: CalendarDef, text: string | undefined): CalendarDate | undefined {
  if (typeof text !== "string" || !text.trim()) return undefined;
  const format = cal.format ?? DEFAULT_FORMAT;
  const order: Array<"year" | "month" | "day"> = [];
  let pattern = "";
  let last = 0;
  for (const m of format.matchAll(TOKEN)) {
    pattern += escapeRegExp(format.slice(last, m.index));
    pattern += m[1] === "year" ? "(-?\\d+)" : "(\\d{1,2})";
    order.push(m[1] as "year" | "month" | "day");
    last = (m.index ?? 0) + m[0].length;
  }
  pattern += escapeRegExp(format.slice(last));
  const match = new RegExp(`^${pattern}$`).exec(text.trim());
  if (!match) return undefined;
  const out: CalendarDate = { year: 0, month: 1, day: 1 };
  order.forEach((key, i) => (out[key] = Number(match[i + 1])));
  const month = cal.months[out.month - 1];
  if (!month || out.day < 1 || out.day > month.days) return undefined;
  return out;
}

function daysInYear(cal: CalendarDef): number {
  return cal.months.reduce((n, m) => n + m.days, 0);
}

/** Day number counted from day 1 of year 0 (for differences). */
export function calendarDayNumber(cal: CalendarDef, date: CalendarDate): number {
  let n = date.year * daysInYear(cal);
  for (let i = 0; i < date.month - 1; i++) n += cal.months[i]?.days ?? 0;
  return n + date.day - 1;
}

/** The date `days` after (or before, when negative) `date`. */
export function addCalendarDays(cal: CalendarDef, date: CalendarDate, days: number): CalendarDate {
  const perYear = daysInYear(cal);
  let n = calendarDayNumber(cal, date) + Math.trunc(days);
  const year = Math.floor(n / perYear);
  n -= year * perYear;
  let month = 1;
  for (const m of cal.months) {
    if (n < m.days) break;
    n -= m.days;
    month++;
  }
  return { year, month, day: n + 1 };
}

/** Add days to a formatted date string. Returns the input unchanged when it does not parse. */
export function addDaysToDate(cal: CalendarDef, text: string, days: number): string {
  const date = parseCalendarDate(cal, text);
  return date ? formatCalendarDate(cal, addCalendarDays(cal, date, days)) : text;
}

/** Whole days from `a` to `b` (negative when `b` is earlier); undefined if either does not parse. */
export function daysBetween(cal: CalendarDef, a: string, b: string): number | undefined {
  const da = parseCalendarDate(cal, a);
  const db = parseCalendarDate(cal, b);
  if (!da || !db) return undefined;
  return calendarDayNumber(cal, db) - calendarDayNumber(cal, da);
}

/** Compare two formatted dates chronologically; unparseable dates sort as strings, after parseable ones. */
export function compareCalendarDates(cal: CalendarDef, a: string | undefined, b: string | undefined): number {
  const da = parseCalendarDate(cal, a);
  const db = parseCalendarDate(cal, b);
  if (da && db) return calendarDayNumber(cal, da) - calendarDayNumber(cal, db);
  if (da) return -1;
  if (db) return 1;
  return (a ?? "").localeCompare(b ?? "");
}

// ---------------------------------------------------------------------------
// money
// ---------------------------------------------------------------------------

/** Round an amount to the currency's decimals. */
export function roundAmount(currency: Pick<CurrencyDef, "decimals">, amount: number): number {
  const f = 10 ** Math.max(0, currency.decimals ?? 0);
  return Math.round((Number.isFinite(amount) ? amount : 0) * f) / f;
}

/** "$1,250" / "−$300" / "+$4,000" (with `sign`). */
export function formatAmount(currency: CurrencyDef, amount: number, opts: { sign?: boolean } = {}): string {
  const decimals = Math.max(0, currency.decimals ?? 0);
  const value = roundAmount(currency, amount);
  const digits = Math.abs(value).toLocaleString(currency.locale ?? "en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const body = currency.symbolAfter ? `${digits} ${currency.symbol}` : `${currency.symbol}${digits}`;
  if (value < 0) return `−${body}`;
  return opts.sign && value > 0 ? `+${body}` : body;
}
