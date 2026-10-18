import { useCallback, useEffect, useState } from "react";

export type ThemePreference = "light" | "dark" | "system";
const KEY = "cf-theme";

function readStored(): ThemePreference {
  try {
    const v = globalThis.localStorage?.getItem(KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* storage blocked */
  }
  return "system";
}

function apply(pref: ThemePreference): void {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  if (pref === "system") el.removeAttribute("data-theme");
  else el.setAttribute("data-theme", pref);
}

function systemTheme(): "light" | "dark" {
  try {
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    }
  } catch {
    /* no matchMedia */
  }
  return "dark";
}

/**
 * Reads and writes the `data-theme` attribute on <html> and remembers the
 * choice in localStorage (wrapped in try/catch: private windows may throw).
 */
export function useTheme() {
  const [theme, setThemeState] = useState<ThemePreference>(() => readStored());
  const [system, setSystem] = useState<"light" | "dark">(() => systemTheme());

  useEffect(() => {
    apply(theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    let mq: MediaQueryList | undefined;
    try {
      mq = window.matchMedia("(prefers-color-scheme: light)");
    } catch {
      return;
    }
    const onChange = () => setSystem(systemTheme());
    mq.addEventListener?.("change", onChange);
    return () => mq?.removeEventListener?.("change", onChange);
  }, []);

  const setTheme = useCallback((pref: ThemePreference) => {
    setThemeState(pref);
    try {
      if (pref === "system") globalThis.localStorage?.removeItem(KEY);
      else globalThis.localStorage?.setItem(KEY, pref);
    } catch {
      /* storage blocked */
    }
  }, []);

  const resolved: "light" | "dark" = theme === "system" ? system : theme;
  const toggle = useCallback(() => setTheme(resolved === "dark" ? "light" : "dark"), [resolved, setTheme]);

  return { theme, resolved, setTheme, toggle };
}
