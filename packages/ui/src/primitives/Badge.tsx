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
