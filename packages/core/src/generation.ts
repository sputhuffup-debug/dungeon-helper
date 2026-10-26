/**
 * Accepting generator output into the campaign, with provenance.
 */
import type { EntityPreset, GeneratedGraph } from "@campaign-forge/module-sdk";
import { clone } from "./paths";
import type { CampaignStore } from "./store";
import type { Entity, GeneratorRun, Id, Relationship, Visibility } from "./types";

export interface AcceptOptions {
  moduleId: string;
  stepSeeds?: Record<string, string>;
  pinned?: Record<string, unknown>;
  /** Re-rolled parts ("<step id>/<key>" -> seed) and pinned part values of the run. */
  partSeeds?: Record<string, string>;
  pinnedParts?: Record<string, unknown>;
  /** Parent for the graph's root entities (those without a `within` of their own). */
  within?: Id;
  /** Tags added to every created entity. */
  tags?: string[];
  visibility?: Visibility;
}

export interface AcceptResult {
  run: GeneratorRun;
  entities: Entity[];
  relationships: Relationship[];
  /** tempId -> real id */
  idMap: Record<string, Id>;
}

export function acceptGeneratedGraph(store: CampaignStore, graph: GeneratedGraph, opts: AcceptOptions): AcceptResult {
  return store.transact(() => {
    const runInput: Omit<GeneratorRun, "id" | "created" | "updated"> = {
      procedure: graph.procedure,
      moduleId: opts.moduleId,
      moduleVersion: graph.moduleVersion,
      ...(graph.supplements && graph.supplements.length > 0 ? { supplements: clone(graph.supplements) } : {}),
      seed: graph.seed,
      inputs: clone(graph.inputs),
      rolls: clone(graph.rolls),
      results: clone(graph.results),
      produced: [],
      editedFields: [],
    };
    if (opts.stepSeeds) runInput.stepSeeds = clone(opts.stepSeeds);
    // Steps rolled with physical dice keep the faces typed, so the run can be replayed.
    if (graph.entered && Object.keys(graph.entered).length > 0) runInput.stepDice = clone(graph.entered);
    if (opts.pinned) runInput.pinned = clone(opts.pinned);
    if (opts.partSeeds && Object.keys(opts.partSeeds).length > 0) runInput.partSeeds = clone(opts.partSeeds);
    if (opts.pinnedParts && Object.keys(opts.pinnedParts).length > 0) runInput.pinnedParts = clone(opts.pinnedParts);
    const run = store.insert("generatorRuns", runInput);

    const idMap: Record<string, Id> = {};
    const entities: Entity[] = [];
    for (const p of graph.produced.entities) {
      const tags = [...(p.tags ?? []), ...(opts.tags ?? [])];
      const input: Parameters<CampaignStore["createEntity"]>[0] = {
        type: p.type,
        name: p.name,
        fields: clone(p.fields),
        tags: [...new Set(tags)],
        provenance: p.preset !== undefined ? { generatorRun: run.id, preset: p.preset } : { generatorRun: run.id },
      };
      if (p.summary !== undefined) input.summary = p.summary;
      const subtype = p.subtype ?? (typeof p.fields.subtype === "string" ? p.fields.subtype : undefined);
      if (subtype !== undefined) input.subtype = subtype;
      if (opts.visibility) input.visibility = opts.visibility;
      const entity = store.createEntity(input);
      idMap[p.tempId] = entity.id;
      entities.push(entity);
    }

    const resolve = (ref: string): Id | undefined => idMap[ref] ?? (store.has("entities", ref) ? ref : undefined);

    const relationships: Relationship[] = [];
    for (const p of graph.produced.entities) {
      const id = idMap[p.tempId] as Id;
      const parent = p.within !== undefined ? resolve(p.within) : undefined;
      if (parent !== undefined && parent !== id) {
        relationships.push(store.createRelationship("within", id, parent));
      } else if (opts.within !== undefined) {
        relationships.push(store.createRelationship("within", id, opts.within));
      }
    }
    for (const r of graph.produced.relationships) {
      const from = resolve(r.from);
      const to = resolve(r.to);
      if (from === undefined || to === undefined) continue;
      relationships.push(store.createRelationship(r.type, from, to, r.note));
    }

    const finalRun = store.update("generatorRuns", run.id, { produced: entities.map((e) => e.id) });
    return { run: finalRun, entities, relationships, idMap };
  });
}

/** Record that the GM edited `path` of a generated entity, on the run and the entity. */
export function recordEdit(store: CampaignStore, runId: Id, entityId: Id, path: string): void {
  store.transact(() => {
    const run = store.get("generatorRuns", runId);
    if (run && !run.editedFields.some((e) => e.entity === entityId && e.path === path)) {
      store.update("generatorRuns", runId, { editedFields: [...run.editedFields, { entity: entityId, path }] });
    }
    const entity = store.get("entities", entityId);
    if (entity) {
      const edited = entity.provenance?.editedFields ?? [];
      if (!edited.includes(path)) {
        store.update("entities", entityId, { provenance: { ...(entity.provenance ?? {}), editedFields: [...edited, path] } });
      }
    }
  });
}

export type PresetOverrides = Partial<Pick<Entity, "name" | "summary" | "tags" | "visibility" | "subtype">> & {
  fields?: Record<string, unknown>;
  /** Create the entity under this (unused) id. */
  id?: Id;
};

/** Create an entity from a module preset, recording the preset in provenance. */
export function presetToEntity(store: CampaignStore, preset: EntityPreset, overrides: PresetOverrides = {}): Entity {
  const input: Parameters<CampaignStore["createEntity"]>[0] = {
    type: preset.entityType,
    name: overrides.name ?? preset.name,
    fields: { ...clone(preset.fields), ...clone(overrides.fields ?? {}) },
    tags: overrides.tags ?? [...(preset.tags ?? [])],
    provenance: { preset: preset.id },
  };
  const subtype = overrides.subtype ?? preset.subtype;
  if (subtype !== undefined) input.subtype = subtype;
  const summary = overrides.summary ?? preset.summary;
  if (summary !== undefined) input.summary = summary;
  if (overrides.visibility) input.visibility = overrides.visibility;
  if (overrides.id !== undefined) input.id = overrides.id;
  return store.createEntity(input);
}
