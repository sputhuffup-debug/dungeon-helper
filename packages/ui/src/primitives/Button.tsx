import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "../sheet/paths";

export type ButtonVariant = "default" | "primary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Toggle-style pressed state. */
  active?: boolean;
  children?: ReactNode;
}

export function Button({ variant = "default", size = "md", active, className, type = "button", children, ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx("cf-btn", variant !== "default" && `cf-btn--${variant}`, size !== "md" && `cf-btn--${size}`, active && "cf-btn--active", className)}
      aria-pressed={active === undefined ? undefined : active}
      {...rest}
    >
      {children}
    </button>
  );
}

export interface IconButtonProps extends Omit<ButtonProps, "children"> {
  /** Accessible name; rendered visually hidden. */
  label: string;
  /** The glyph (text or an SVG). */
  icon: ReactNode;
}

export function IconButton({ label, icon, className, ...rest }: IconButtonProps) {
  return (
    <Button className={cx("cf-btn--icon", className)} aria-label={label} title={label} {...rest}>
      <span aria-hidden="true">{icon}</span>
    </Button>
  );
}
