import { pageRefText, type PageRef as PageRefValue } from "@campaign-forge/module-sdk";
import { createContext, useContext, type ReactNode } from "react";
import { cx } from "../sheet/paths";

const PageRefsHidden = createContext(false);

/** Leave rulebook page refs out of everything inside (a view the players see, such as the player screen). */
export function HidePageRefs({ children }: { children: ReactNode }) {
  return <PageRefsHidden.Provider value={true}>{children}</PageRefsHidden.Provider>;
}

/** Whether page refs are left out here (inside `HidePageRefs`). */
export function usePageRefsHidden(): boolean {
  return useContext(PageRefsHidden);
}

/** "p. 43", "p. 42–43", or for pages cited together "p. 27, 158". */
export function formatPageRef(page: PageRefValue | undefined, prefix = "p."): string {
  return pageRefText(page, prefix);
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

/** Renders "p. 43", "p. 42–43", a section citation, or "Original". Renders nothing without any, or inside `HidePageRefs`. */
export function PageRef({ page, cite, original, prefix, className }: PageRefProps) {
  const hidden = useContext(PageRefsHidden);
  const text = formatCitation({ page, cite, original }, prefix);
  if (!text || hidden) return null;
  const title = page !== undefined ? "Rulebook page" : cite ? "Source" : "Written by the module author";
  return (
    <span className={cx("cf-page", page === undefined && "cf-page--cite", className)} title={title}>
      {text}
    </span>
  );
}
