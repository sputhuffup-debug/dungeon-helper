import type { PageRef as PageRefValue } from "@campaign-forge/module-sdk";
import { cx } from "../sheet/paths";

export function formatPageRef(page: PageRefValue | undefined, prefix = "p."): string {
  if (page === undefined || page === null) return "";
  if (typeof page === "number") return `${prefix} ${page}`;
  const [a, b] = page;
  return a === b ? `${prefix} ${a}` : `${prefix} ${a}–${b}`;
}

/** "p. 43", or the section citation, or "Original" for module-authored content; "" when there is nothing to show. */
export function formatCitation(source: { page?: PageRefValue; cite?: string; original?: boolean }, prefix = "p."): string {
  if (source.page !== undefined) return formatPageRef(source.page, prefix);
  if (typeof source.cite === "string" && source.cite.trim()) return source.cite.trim();
  return source.original ? "Original" : "";
}

export interface PageRefProps {
  page?: PageRefValue;
  /** Section citation, shown when there is no page (e.g. "SRD 5.1, Conditions"). */
  cite?: string;
  /** Module-authored content: shows "Original" when there is neither page nor cite. */
  original?: boolean;
  prefix?: string;
  className?: string;
}

/** Renders "p. 43", "p. 42–43", a section citation, or "Original". Renders nothing without any. */
export function PageRef({ page, cite, original, prefix, className }: PageRefProps) {
  const text = formatCitation({ page, cite, original }, prefix);
  if (!text) return null;
  const title = page !== undefined ? "Rulebook page" : cite ? "Source" : "Written by the module author";
  return (
    <span className={cx("cf-page", page === undefined && "cf-page--cite", className)} title={title}>
      {text}
    </span>
  );
}
