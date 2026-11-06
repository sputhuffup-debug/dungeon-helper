/**
 * Page references (`PageRef`): a page, an inclusive range, or a list of
 * either for content the book covers in separate places
 * (`{ pages: [27, 158] }` reads "p. 27, 158", never "p. 27–158").
 */
import type { PageRef } from "./types";

/** The spans a page reference covers, in its order: `[first, last]` each (a single page is `[p, p]`). */
export function pageRefSpans(page: PageRef | undefined | null): Array<[number, number]> {
  if (page === undefined || page === null) return [];
  if (typeof page === "number") return [[page, page]];
  if (Array.isArray(page)) return [[page[0], page[1]]];
  if (typeof page === "object" && Array.isArray(page.pages)) return page.pages.map((p): [number, number] => (typeof p === "number" ? [p, p] : [p[0], p[1]]));
  return [];
}

/** The first page a reference names (for sorting and links), if any. */
export function firstPage(page: PageRef | undefined | null): number | undefined {
  return pageRefSpans(page)[0]?.[0];
}

/** Whether a page reference is well formed: positive whole pages, ranges in order, a list with at least one entry. */
export function validPageRef(page: unknown): boolean {
  const one = (p: unknown): boolean => {
    if (typeof p === "number") return Number.isInteger(p) && p > 0;
    return Array.isArray(p) && p.length === 2 && p.every((x) => Number.isInteger(x) && (x as number) > 0) && (p[0] as number) <= (p[1] as number);
  };
  if (typeof page === "number" || Array.isArray(page)) return one(page);
  if (page && typeof page === "object" && Array.isArray((page as { pages?: unknown }).pages)) {
    const list = (page as { pages: unknown[] }).pages;
    return list.length > 0 && list.every(one) && Object.keys(page).length === 1;
  }
  return false;
}

/**
 * A page reference as text: "p. 43", "p. 42–43", "p. 27, 158",
 * "p. 27, 44–46". `prefix` replaces "p."; `dash` is the range sign.
 */
export function pageRefText(page: PageRef | undefined | null, prefix = "p.", dash = "–"): string {
  const spans = pageRefSpans(page);
  if (!spans.length) return "";
  return `${prefix} ${spans.map(([a, b]) => (a === b ? String(a) : `${a}${dash}${b}`)).join(", ")}`;
}
