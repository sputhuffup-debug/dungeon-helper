import type { ComponentType } from "react";
import type { Effect, Rng, TrackerDef } from "@campaign-forge/module-sdk";
import type { MapZone, MapZoneBorder } from "@campaign-forge/core";
import { getPath } from "@campaign-forge/module-sdk";
import { isRecord } from "../sheet/paths";

export interface TrackerEntity {
  id: string;
  name: string;
  /** Entity type id, used to strip "type.path" prefixes from `def.binds`. */
  type?: string;
  fields: Record<string, unknown>;
  computed?: Record<string, unknown>;
  /** Core entity kind ("character", "creature"...). */
  kind?: string;
  /** Ids of the entity's current conditions. */
  conditions?: string[];
  /** Preset the entity was made from, if any. */
  preset?: string;
}

export interface TrackerProps {
  def: TrackerDef;
  state: unknown;
  onChange: (state: unknown) => void;
  /** Characters (or other entities) the tracker rows are about. */
  entities?: TrackerEntity[];
  /** Declarative changes to entities for the app to apply. */
  onEffects?: (effects: Effect[]) => void;
  /** Append a line to the session log. */
  onLog?: (text: string) => void;
  /** Ask the app to run a module dice operation for an entity. */
  onRollOperation?: (operationId: string, entityId?: string, extra?: Record<string, unknown>) => void;
  rng?: Rng;
  /** In-world minutes elapsed in the campaign (for trackers that run on play time). */
  worldMinutes?: number;
  /**
   * Who can witness events (e.g. for panic prompts). When omitted, trackers fall back to
   * every character-kind entity they were given.
   */
  witnesses?: Array<{ id: string; name: string }>;
  /** For the stealth tracker: zones of the current scene map. */
  zones?: MapZone[];
  borders?: MapZoneBorder[];
  readonly?: boolean;
  className?: string;
}

export type TrackerComponent = ComponentType<TrackerProps>;

export function stateRecord(state: unknown): Record<string, unknown> {
  return isRecord(state) ? state : {};
}

/**
 * Binds look like "fieldPath" or "entityType.fieldPath". Resolve to a path
 * that exists on the entity's fields, preferring the type-stripped form.
 */
export function resolveBindPath(bind: string, entity: TrackerEntity): string {
  if (entity.type && bind.startsWith(`${entity.type}.`)) return bind.slice(entity.type.length + 1);
  if (getPath(entity.fields, bind) !== undefined) return bind;
  const segs = bind.split(".");
  for (let i = 1; i < segs.length; i++) {
    const candidate = segs.slice(i).join(".");
    if (getPath(entity.fields, candidate) !== undefined) return candidate;
  }
  return bind;
}

export function randomInt(rng: Rng | undefined, min: number, max: number): number {
  if (rng) return rng.int(min, max);
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function nowIso(): string {
  return new Date().toISOString();
}
