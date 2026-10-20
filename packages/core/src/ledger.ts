/**
 * The campaign ledger: money in and out, by account and category. Entries are
 * the only stored state; every balance (and the running balance column) is
 * summed from them on read, never stored.
 *
 * Game-agnostic: currency, categories and personal-account types come from
 * the module's `LedgerDef`, but nothing here needs one.
 */
import { compareCalendarDates, formatAmount, roundAmount, type CalendarDef, type CurrencyDef, type LedgerDef, type LedgerEffect, type LedgerLinks } from "@campaign-forge/module-sdk";
import { now } from "./ids";
import type { CampaignStore, NewRecord } from "./store";
import type { Id, LedgerEntry, Visibility } from "./types";

const GM: Visibility = { level: "gm" };

/** Fallback when a module has no currency: whole units, no symbol. */
export const PLAIN_CURRENCY: CurrencyDef = { name: "unit", symbol: "", decimals: 0 };

export interface PostLedgerInput {
  amount: number;
  category: string;
  note?: string;
  /** Defaults to the campaign's current in-world date. */
  inWorldDate?: string;
  /** Defaults to today. */
  realDate?: string;
  /** Entity id of a personal account; the shared account when absent. */
  account?: Id;
  links?: LedgerLinks;
  key?: string;
  source?: LedgerEntry["source"];
  visibility?: Visibility;
  /** Round to the currency's decimals (default: whole units). */
  currency?: Pick<CurrencyDef, "decimals">;
}

/** The entry already posted under `key`, if any. */
export function ledgerEntryByKey(store: CampaignStore, key: string): LedgerEntry | undefined {
  return store.list("ledger").find((e) => e.key === key);
}

/**
 * Add an entry. With a `key` that is already posted, nothing is added and the
 * existing entry comes back with `duplicate: true`.
 */
export function postLedgerEntry(store: CampaignStore, input: PostLedgerInput): { entry: LedgerEntry; duplicate: boolean } {
  if (!Number.isFinite(input.amount)) throw new Error("ledger amount must be a finite number");
  if (!input.category) throw new Error("ledger entry needs a category");
  if (input.key) {
    const existing = ledgerEntryByKey(store, input.key);
    if (existing) return { entry: existing, duplicate: true };
  }
  const rec: NewRecord<"ledger"> = {
    amount: roundAmount(input.currency ?? {}, input.amount),
    category: input.category,
    realDate: input.realDate ?? now().slice(0, 10),
    visibility: input.visibility ?? GM,
  };
  const date = input.inWorldDate ?? store.meta().currentDate;
  if (date) rec.inWorldDate = date;
  if (input.note?.trim()) rec.note = input.note.trim();
  if (input.account) rec.account = input.account;
  const links = cleanLinks(input.links);
  if (links) rec.links = links;
  if (input.key) rec.key = input.key;
  if (input.source) rec.source = input.source;
  return { entry: store.insert("ledger", rec), duplicate: false };
}

/** Post a `ledger` effect (from a procedure, travel or a hook). */
export function postLedgerEffect(store: CampaignStore, effect: LedgerEffect, extra: Pick<PostLedgerInput, "source" | "currency" | "inWorldDate"> = {}): { entry: LedgerEntry; duplicate: boolean } {
  const input: PostLedgerInput = { amount: effect.amount, category: effect.category, note: effect.note, ...extra };
  if (effect.account) input.account = effect.account;
  if (effect.links) input.links = effect.links;
  if (effect.key) input.key = effect.key;
  return postLedgerEntry(store, input);
}

function cleanLinks(links: LedgerLinks | undefined): LedgerLinks | undefined {
  if (!links) return undefined;
  const out: LedgerLinks = {};
  for (const [k, v] of Object.entries(links) as Array<[keyof LedgerLinks, string | undefined]>) if (typeof v === "string" && v) out[k] = v;
  return Object.keys(out).length ? out : undefined;
}

export function updateLedgerEntry(store: CampaignStore, id: Id, patch: Partial<Pick<LedgerEntry, "amount" | "category" | "note" | "inWorldDate" | "realDate" | "account" | "links">>): LedgerEntry {
  return store.update("ledger", id, patch);
}

export function removeLedgerEntry(store: CampaignStore, id: Id): boolean {
  return store.remove("ledger", id);
}

// ---------------------------------------------------------------------------
// reading
// ---------------------------------------------------------------------------

export interface LedgerFilter {
  /** `null` = the shared account only; an id = that personal account; absent = every account. */
  account?: Id | null;
  categories?: string[];
  /** Entries linked to this record (job, session, ship, character or travel leg). */
  linkedTo?: Id;
}

function matches(e: LedgerEntry, f: LedgerFilter): boolean {
  if (f.account === null && e.account) return false;
  if (typeof f.account === "string" && e.account !== f.account) return false;
  if (f.categories && f.categories.length > 0 && !f.categories.includes(e.category)) return false;
  if (f.linkedTo && !Object.values(e.links ?? {}).includes(f.linkedTo)) return false;
  return true;
}

/**
 * Entries in book order: by in-world date (when the calendar is known), then
 * real date, then creation time. Entries without an in-world date sort after
 * dated ones on the same real day.
 */
export function sortLedger(entries: LedgerEntry[], calendar?: CalendarDef): LedgerEntry[] {
  return [...entries].sort((a, b) => {
    if (a.inWorldDate && b.inWorldDate && a.inWorldDate !== b.inWorldDate) {
      const c = calendar ? compareCalendarDates(calendar, a.inWorldDate, b.inWorldDate) : a.inWorldDate.localeCompare(b.inWorldDate);
      if (c !== 0) return c;
    }
    if (a.realDate !== b.realDate) return a.realDate.localeCompare(b.realDate);
    return a.created.localeCompare(b.created) || a.id.localeCompare(b.id);
  });
}

export function ledgerEntries(store: CampaignStore, filter: LedgerFilter = {}, calendar?: CalendarDef): LedgerEntry[] {
  return sortLedger(store.list("ledger").filter((e) => matches(e, filter)), calendar);
}

/** Sum of entries matching the filter (computed on every call). */
export function ledgerBalance(store: CampaignStore, filter: LedgerFilter = { account: null }): number {
  let total = 0;
  for (const e of store.list("ledger")) if (matches(e, filter)) total += e.amount;
  return Math.round(total * 10000) / 10000;
}

/** Balance per account: `""` is the shared account, other keys are entity ids. */
export function ledgerBalances(store: CampaignStore): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of store.list("ledger")) {
    const k = e.account ?? "";
    out[k] = Math.round(((out[k] ?? 0) + e.amount) * 10000) / 10000;
  }
  return out;
}

export interface LedgerRow {
  entry: LedgerEntry;
  /** Balance after this entry, over the rows shown (computed, never stored). */
  balance: number;
}

/** Entries with a running balance over exactly those entries, in book order. */
export function ledgerRows(store: CampaignStore, filter: LedgerFilter = {}, calendar?: CalendarDef): LedgerRow[] {
  let balance = 0;
  return ledgerEntries(store, filter, calendar).map((entry) => {
    balance = Math.round((balance + entry.amount) * 10000) / 10000;
    return { entry, balance };
  });
}

/** Totals by category over the filtered entries. */
export function ledgerTotalsByCategory(store: CampaignStore, filter: LedgerFilter = {}): Record<string, { in: number; out: number }> {
  const out: Record<string, { in: number; out: number }> = {};
  for (const e of store.list("ledger")) {
    if (!matches(e, filter)) continue;
    const t = (out[e.category] ??= { in: 0, out: 0 });
    if (e.amount >= 0) t.in += e.amount;
    else t.out += e.amount;
  }
  return out;
}

// ---------------------------------------------------------------------------
// export
// ---------------------------------------------------------------------------

function csvCell(v: unknown): string {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export interface LedgerCsvOptions {
  filter?: LedgerFilter;
  calendar?: CalendarDef;
  ledger?: Pick<LedgerDef, "categories" | "defaultAccount" | "currency">;
  /** Names for linked records and personal accounts (entity ids). */
  resolve?: (id: Id) => string;
}

/**
 * CSV of the ledger: one row per entry with the running balance. Amounts are
 * plain numbers (no symbol) so spreadsheets can sum them.
 */
export function ledgerToCsv(store: CampaignStore, opts: LedgerCsvOptions = {}): string {
  const label = (id: string) => opts.ledger?.categories.find((c) => c.id === id)?.label ?? id;
  const name = (id: Id | undefined) => (id ? (opts.resolve?.(id) ?? id) : "");
  const header = ["In-world date", "Real date", "Account", "Category", "Note", "Amount", "Balance", "Job", "Session", "Ship", "Character", "Travel"];
  const lines = [header.join(",")];
  for (const { entry: e, balance } of ledgerRows(store, opts.filter ?? {}, opts.calendar)) {
    lines.push(
      [
        e.inWorldDate ?? "",
        e.realDate,
        e.account ? name(e.account) : (opts.ledger?.defaultAccount ?? "Shared funds"),
        label(e.category),
        e.note ?? "",
        e.amount,
        balance,
        name(e.links?.job),
        e.links?.session ?? "",
        name(e.links?.ship),
        name(e.links?.character),
        e.links?.travel ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\n") + "\n";
}

/** Format an amount with the module currency (plain numbers without one). */
export function formatMoney(ledger: Pick<LedgerDef, "currency"> | undefined, amount: number, opts: { sign?: boolean } = {}): string {
  return formatAmount(ledger?.currency ?? PLAIN_CURRENCY, amount, opts);
}
