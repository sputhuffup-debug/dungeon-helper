import type { TrackerComponent } from "./types";

const trackers = new Map<string, TrackerComponent>();

export function registerTracker(kind: string, component: TrackerComponent): void {
  trackers.set(kind, component);
}

export function getTracker(kind: string): TrackerComponent | undefined {
  return trackers.get(kind);
}

export function hasTracker(kind: string): boolean {
  return trackers.has(kind);
}

export function trackerKinds(): string[] {
  return [...trackers.keys()];
}
