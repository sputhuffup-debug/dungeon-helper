import { useEffect, useRef, type ReactNode } from "react";
import { cx } from "../sheet/paths";
import { IconButton } from "./Button";

export interface DialogProps {
  open: boolean;
  onClose?: () => void;
  title?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
  /** Close when the backdrop is clicked (default true). */
  dismissable?: boolean;
}

/** A native <dialog> shown modally while `open`. */
export function Dialog({ open, onClose, title, children, footer, className, dismissable = true }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open) {
      if (!el.open) {
        if (typeof el.showModal === "function") el.showModal();
        else el.setAttribute("open", "");
      }
    } else if (el.open) {
      if (typeof el.close === "function") el.close();
      else el.removeAttribute("open");
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={cx("cf-dialog", className)}
      aria-labelledby={title ? "cf-dialog-title" : undefined}
      onCancel={(e) => {
        e.preventDefault();
        if (dismissable) onClose?.();
      }}
      onClose={() => onClose?.()}
      onClick={(e) => {
        if (dismissable && e.target === ref.current) onClose?.();
      }}
    >
      {open && (
        <>
          <div className="cf-dialog__header">
            <h2 className="cf-dialog__title" id="cf-dialog-title">
              {title}
            </h2>
            {onClose && <IconButton label="Close" icon="×" variant="ghost" onClick={onClose} />}
          </div>
          <div className="cf-dialog__body">{children}</div>
          {footer && <div className="cf-dialog__footer">{footer}</div>}
        </>
      )}
    </dialog>
  );
}

export interface DrawerProps {
  open: boolean;
  onClose?: () => void;
  side?: "left" | "right";
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/** A slide-in side panel. Always mounted so it can animate; inert while closed. */
export function Drawer({ open, onClose, side = "right", title, children, className }: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div className={cx("cf-drawer", `cf-drawer--${side}`, open && "cf-drawer--open", className)} aria-hidden={!open}>
      <div className="cf-drawer__backdrop" onClick={onClose} />
      <aside className="cf-drawer__panel" role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}>
        <div className="cf-drawer__header">
          <h2 className="cf-drawer__title">{title}</h2>
          {onClose && <IconButton label="Close" icon="×" variant="ghost" onClick={onClose} />}
        </div>
        <div className="cf-drawer__body">{open ? children : null}</div>
      </aside>
    </div>
  );
}
