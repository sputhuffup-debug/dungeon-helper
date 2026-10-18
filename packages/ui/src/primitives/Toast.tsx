import { useCallback, useEffect, useSyncExternalStore } from "react";
import { cx } from "../sheet/paths";

export type ToastTone = "info" | "success" | "warning" | "danger";

export interface Toast {
  id: string;
  text: string;
  tone: ToastTone;
  /** ms; 0 keeps it until dismissed. */
  timeout: number;
}

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

export function dismissToast(id: string): void {
  const t = timers.get(id);
  if (t) clearTimeout(t);
  timers.delete(id);
  toasts = toasts.filter((x) => x.id !== id);
  emit();
}

export function pushToast(text: string, options: { tone?: ToastTone; timeout?: number } = {}): string {
  const id = `toast_${++seq}`;
  const toast: Toast = { id, text, tone: options.tone ?? "info", timeout: options.timeout ?? 4000 };
  toasts = [...toasts, toast];
  emit();
  if (toast.timeout > 0) timers.set(id, setTimeout(() => dismissToast(id), toast.timeout));
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
  const push = useCallback((text: string, options?: { tone?: ToastTone; timeout?: number }) => pushToast(text, options), []);
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
        <div key={t.id} className={cx("cf-toast", t.tone !== "info" && `cf-toast--${t.tone}`)}>
          <span>{t.text}</span>
          <button type="button" className="cf-chip__remove" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
