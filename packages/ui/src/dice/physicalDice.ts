import { useCallback, useSyncExternalStore } from "react";

/** localStorage key of the per-device "I roll physical dice" preference. */
export const PHYSICAL_DICE_KEY = "cf-physical-dice";
const EVENT = "cf-physical-dice";

/** Whether this device's GM rolls physical dice (so "Enter dice" is the default). Off unless set. */
export function getPhysicalDice(): boolean {
  try {
    return globalThis.localStorage?.getItem(PHYSICAL_DICE_KEY) === "1";
  } catch {
    return false; // storage blocked: roll in the app
  }
}

export function setPhysicalDice(on: boolean): void {
  try {
    if (on) globalThis.localStorage?.setItem(PHYSICAL_DICE_KEY, "1");
    else globalThis.localStorage?.removeItem(PHYSICAL_DICE_KEY);
  } catch {
    /* storage blocked: the choice lasts until reload */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === PHYSICAL_DICE_KEY) onChange();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** The per-device preference and its setter (shared by every component, and across tabs). */
export function usePhysicalDicePreference(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, getPhysicalDice, () => false);
  const set = useCallback((next: boolean) => setPhysicalDice(next), []);
  return [on, set];
}
