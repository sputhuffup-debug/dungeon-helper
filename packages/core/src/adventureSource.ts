/**
 * Adventure sources ("Run this job"): what the core hands a module's
 * `AdventureSourceDef.prefill` (the record, what links to it, the site maps
 * of linked places, the arc clues seeded with it), and the two-way link
 * between a record and the adventure that runs it. The core never learns
 * what the record means; the module says what goes where.
 */
import { adventureSourcesFor, sourceOpen, type AdventureSourceDef, type AdventureSourceInput, type AdventureSourceLink, type GameModule, type PlayModeId } from "@campaign-forge/module-sdk";
import type { Adventure, CampaignMaps, Entity, Id } from "./types";

type SourceMaps = Pick<CampaignMaps, "entities" | "relationships" | "maps" | "arcs">;
type ModuleLike = Pick<GameModule, "entityTypes"> & Partial<Pick<GameModule, "adventureSources">>;

function snapshot(e: Entity, module: ModuleLike): AdventureSourceLink["entity"] {
  const kind = module.entityTypes.find((t) => t.id === e.type)?.kind;
  return {
    id: e.id,
    name: e.name,
    type: e.type,
    fields: structuredClone(e.fields),
    ...(kind ? { kind } : {}),
    ...(e.summary ? { summary: e.summary } : {}),
    visibility: e.visibility.level,
  };
}

/**
 * The prefill input for a record: the record, every record linked to it (in
 * a stable order), saved site maps of the linked places, and the arc clues
 * seeded with it. Pure: same campaign, same input.
 */
export function adventureSourceInput(maps: SourceMaps, module: ModuleLike, entityId: Id, mode: PlayModeId): AdventureSourceInput {
  const entity = maps.entities[entityId];
  if (!entity) throw new Error(`entities/${entityId} not found`);
  const rels = Object.values(maps.relationships)
    .filter((r) => r.from === entityId || r.to === entityId)
    .sort((a, b) => a.created.localeCompare(b.created) || a.id.localeCompare(b.id));
  const links: AdventureSourceLink[] = [];
  for (const r of rels) {
    const out = r.from === entityId;
    const other = maps.entities[out ? r.to : r.from];
    if (!other) continue;
    links.push({ relationship: r.type, direction: out ? "out" : "in", ...(r.note ? { note: r.note } : {}), entity: snapshot(other, module) });
  }
  const places = new Set([entityId, ...links.map((l) => l.entity.id)]);
  const siteMaps = Object.values(maps.maps)
    .filter((m) => m.location && places.has(m.location))
    .sort((a, b) => Number(!!b.layout) - Number(!!a.layout) || a.created.localeCompare(b.created) || a.id.localeCompare(b.id))
    .map((m) => ({ id: m.id, name: m.name, location: m.location!, ...(m.layout ? { generated: true } : {}) }));
  const clues: AdventureSourceInput["clues"] = [];
  const threads = Object.values(maps.arcs ?? {}).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  for (const t of threads) {
    for (const stage of t.stages) {
      for (const c of stage.clues) {
        if (c.seeded?.job !== entityId && c.seeded?.entity !== entityId) continue;
        clues.push({
          thread: t.id,
          threadTitle: t.title,
          clue: c.id,
          text: c.text,
          ...(c.playerText && c.playerText !== c.text ? { playerText: c.playerText } : {}),
          ...(c.unlocks ? { unlocks: c.unlocks } : {}),
          kind: c.kind,
          state: c.state,
          ...(c.seeded?.slotLabel ? { slotLabel: c.seeded.slotLabel } : {}),
          ...(c.seeded?.entity ? { entity: c.seeded.entity } : {}),
        });
      }
    }
  }
  const { kind: _kind, ...self } = snapshot(entity, module);
  // field paths the players may not see: the type's defaults, then the GM's overrides
  const levels: Record<string, string> = { ...(module.entityTypes.find((t) => t.id === entity.type)?.defaultVisibility ?? {}) };
  for (const [path, v] of Object.entries(entity.fieldVisibility ?? {})) levels[path] = v.level;
  const gmFields = Object.keys(levels)
    .filter((p) => levels[p] === "gm")
    .sort();
  return { mode, entity: { ...self, ...(gmFields.length ? { gmFields } : {}) }, links, maps: siteMaps, clues };
}

/** The adventure that runs a record, if one was made from it. */
export function adventureOfSource(adventures: Record<Id, Adventure> | readonly Adventure[], entityId: Id): Adventure | undefined {
  const list = Array.isArray(adventures) ? (adventures as readonly Adventure[]) : Object.values(adventures as Record<Id, Adventure>);
  return list.filter((a) => a.source?.entity === entityId).sort((a, b) => a.created.localeCompare(b.created))[0];
}

/** The module's source definition an adventure was made from. */
export function sourceDefOf(module: Partial<Pick<GameModule, "adventureSources">>, adventure: Pick<Adventure, "source"> | undefined): AdventureSourceDef | undefined {
  const id = adventure?.source?.def;
  return id ? module.adventureSources?.find((d) => d.id === id) : undefined;
}

/** The first adventure source the module offers for this record in this mode. */
export function adventureSourceFor(module: Partial<Pick<GameModule, "adventureSources">>, entity: Pick<Entity, "type">, mode?: PlayModeId): AdventureSourceDef | undefined {
  return adventureSourcesFor({ adventureSources: module.adventureSources ?? [] }, entity.type, mode)[0];
}

/**
 * An adventure the table should skip: marked done, or run from a record
 * its module no longer counts as open (e.g. a job marked done or failed).
 */
export function adventureClosed(maps: Pick<CampaignMaps, "entities">, module: Partial<Pick<GameModule, "adventureSources">>, adventure: Pick<Adventure, "status" | "source">): boolean {
  if (adventure.status === "done") return true;
  const def = sourceDefOf(module, adventure);
  const entity = adventure.source ? maps.entities[adventure.source.entity] : undefined;
  if (!def || !entity || def.open === undefined) return false;
  return !sourceOpen(def, entity.fields);
}
