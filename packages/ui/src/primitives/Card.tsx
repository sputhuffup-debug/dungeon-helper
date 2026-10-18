import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "../sheet/paths";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Rendered at the right of the header. */
  actions?: ReactNode;
  footer?: ReactNode;
  elevated?: boolean;
  children?: ReactNode;
}

export function Card({ title, subtitle, actions, footer, elevated, className, children, ...rest }: CardProps) {
  return (
    <section className={cx("cf-card", elevated && "cf-card--elevated", className)} {...rest}>
      {(title || actions || subtitle) && (
        <header className="cf-card__header">
          <div>
            {title && <h3 className="cf-card__title">{title}</h3>}
            {subtitle && <p className="cf-card__subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="cf-card__actions">{actions}</div>}
        </header>
      )}
      <div className="cf-card__body">{children}</div>
      {footer && <footer className="cf-card__actions">{footer}</footer>}
    </section>
  );
}
