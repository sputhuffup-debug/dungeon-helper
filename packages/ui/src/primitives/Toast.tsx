import { useCallback, useEffect, useSyncExternalStore } from "react";
import { cx } from "../sheet/paths";

export type ToastTone = "info" | "success" | "warning" | "danger";

/** A button on a toast, e.g. "Undo". Pressing it runs `onClick` and dismisses the toast. */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  text: string;
  tone: ToastTone;
  /** ms; 0 keeps it until dismissed. */
  timeout: number;
  /** How many times the same text was pushed while it was showing (shown as "×3"). */
  count: number;
  action?: ToastAction;
}

export interface ToastOptions {
  tone?: ToastTone;
  timeout?: number;
  action?: ToastAction;
}

/** At most this many toasts show at once; a new one pushes the oldest out. */
export const MAX_TOASTS = 3;

/* A tiny module-level store so `useToasts` works anywhere without a provider. */
let toasts: Toast[] = [];
const listeners = new Set<() => void>();
let seq = 0;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function snapshot() {
  return toasts;
}

function clearTimer(id: string) {
  const t = timers.get(id);
  if (t) clearTimeout(t);
  timers.delete(id);
}

function arm(toast: Toast) {
  clearTimer(toast.id);
  if (toast.timeout > 0) timers.set(toast.id, setTimeout(() => dismissToast(toast.id), toast.timeout));
}

export function dismissToast(id: string): void {
  clearTimer(id);
  toasts = toasts.filter((x) => x.id !== id);
  emit();
}

/**
 * Show a toast. The same text (and tone) pushed again while it shows does
 * not stack: the toast counts up ("×2") and its timer starts over. At most
 * `MAX_TOASTS` show; a new one pushes the oldest out.
 */
export function pushToast(text: string, options: ToastOptions = {}): string {
  const tone = options.tone ?? "info";
  const same = !options.action ? toasts.find((t) => t.text === text && t.tone === tone && !t.action) : undefined;
  if (same) {
    const bumped: Toast = { ...same, count: same.count + 1, timeout: options.timeout ?? same.timeout };
    toasts = [...toasts.filter((t) => t.id !== same.id), bumped];
    arm(bumped);
    emit();
    return same.id;
  }
  const id = `toast_${++seq}`;
  const toast: Toast = { id, text, tone, timeout: options.timeout ?? (options.action ? 8000 : 4000), count: 1, ...(options.action ? { action: options.action } : {}) };
  const next = [...toasts, toast];
  for (const old of next.slice(0, Math.max(0, next.length - MAX_TOASTS))) clearTimer(old.id);
  toasts = next.slice(-MAX_TOASTS);
  arm(toast);
  emit();
  return id;
}

export function clearToasts(): void {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
  toasts = [];
  emit();
}

export function useToasts() {
  const list = useSyncExternalStore(subscribe, snapshot, snapshot);
  const push = useCallback((text: string, options?: ToastOptions) => pushToast(text, options), []);
  const dismiss = useCallback((id: string) => dismissToast(id), []);
  return { toasts: list, push, dismiss, clear: clearToasts };
}

/** Fixed-position list of the current toasts. Mount once near the app root. */
export function ToastViewport({ className }: { className?: string }) {
  const { toasts: list, dismiss } = useToasts();
  useEffect(() => () => undefined, []);
  if (list.length === 0) return null;
  return (
    <div className={cx("cf-toasts", className)} role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={cx("cf-toast", t.tone !== "info" && `cf-toast--${t.tone}`)} data-testid="toast">
          <span>
            {t.text}
            {t.count > 1 && (
              <span className="cf-toast__count" aria-label={`${t.count} times`}>
                {" "}
                ×{t.count}
              </span>
            )}
          </span>
          {t.action && (
            <button
              type="button"
              className="cf-btn cf-btn--sm cf-toast__action"
              onClick={() => {
                dismiss(t.id);
                t.action!.onClick();
              }}
            >
              {t.action.label}
            </button>
          )}
          <button type="button" className="cf-chip__remove" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
