import type { PageRef as PageRefValue } from "@campaign-forge/module-sdk";
import { cx } from "../sheet/paths";

export function formatPageRef(page: PageRefValue | undefined, prefix = "p."): string {
  if (page === undefined || page === null) return "";
  if (typeof page === "number") return `${prefix} ${page}`;
  const [a, b] = page;
  return a === b ? `${prefix} ${a}` : `${prefix} ${a}–${b}`;
}

export interface PageRefProps {
  page?: PageRefValue;
  prefix?: string;
  className?: string;
}

/** Renders "p. 43" or "p. 42–43". Renders nothing without a page. */
export function PageRef({ page, prefix, className }: PageRefProps) {
  const text = formatPageRef(page, prefix);
  if (!text) return null;
  return (
    <span className={cx("cf-page", className)} title="Rulebook page">
      {text}
    </span>
  );
}
