import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "../sheet/paths";

export type BadgeTone = "muted" | "accent" | "danger" | "warning" | "success";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  children?: ReactNode;
}

export function Badge({ tone = "muted", className, children, ...rest }: BadgeProps) {
  return (
    <span className={cx("cf-badge", tone !== "muted" && `cf-badge--${tone}`, className)} {...rest}>
      {children}
    </span>
  );
}

/** Where an entry comes from: a small badge with the supplement's name (or the source a module gives its own items, e.g. "SRD 5.2"), and its edition. Renders nothing for an entry with neither. */
export function SourceBadge({ source, edition }: { source?: string | undefined; edition?: string | undefined }) {
  if (!source && !edition) return null;
  return (
    <>
      {edition && (
        <Badge className="cf-badge--edition" data-testid="edition-badge" title={`Edition: ${edition}`}>
          {edition}
        </Badge>
      )}
      {source && (
        <Badge tone="accent" className="cf-badge--source" data-testid="source-badge" title={`Source: ${source}`}>
          {source}
        </Badge>
      )}
    </>
  );
}
