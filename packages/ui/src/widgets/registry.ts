import type { WidgetComponent } from "./types";

const widgets = new Map<string, WidgetComponent>();

/** Register (or replace) the component for a widget kind. Modules and the app can add kinds. */
export function registerWidget(kind: string, component: WidgetComponent): void {
  widgets.set(kind, component);
}

export function getWidget(kind: string): WidgetComponent | undefined {
  return widgets.get(kind);
}

export function hasWidget(kind: string): boolean {
  return widgets.has(kind);
}

export function widgetKinds(): string[] {
  return [...widgets.keys()];
}
