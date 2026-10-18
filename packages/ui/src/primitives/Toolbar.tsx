import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "../sheet/paths";

export interface ToolbarProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: ReactNode;
  children?: ReactNode;
}

export function Toolbar({ title, className, children, ...rest }: ToolbarProps) {
  return (
    <div className={cx("cf-toolbar", className)} role="toolbar" {...rest}>
      {title && <span className="cf-toolbar__title">{title}</span>}
      {children}
    </div>
  );
}

export function ToolbarGroup({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("cf-toolbar__group", className)} {...rest}>
      {children}
    </div>
  );
}

export function ToolbarSpacer() {
  return <span className="cf-toolbar__spacer" />;
}

export interface EmptyStateProps {
  title: ReactNode;
  text?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, text, action, className }: EmptyStateProps) {
  return (
    <div className={cx("cf-empty", className)}>
      <h3 className="cf-empty__title">{title}</h3>
      {text && <p className="cf-empty__text">{text}</p>}
      {action}
    </div>
  );
}
