/**
 * Campaign data as procedure inputs: the plain snapshots the app passes for
 * `"x-campaign"` and `"x-adventure"` inputs (module-sdk), so a procedure can
 * aim at the campaign's people, places and things. Snapshots are plain JSON,
 * sorted for stable output, and stored with the run, so a run replays the
 * same even after the campaign changes.
 */
import type { AdventureSnapshot, CampaignEntitySummary, CampaignInputHint, CampaignSnapshot } from "@campaign-forge/module-sdk";
import { adventureActs } from "./builder";
import { getPath } from "./paths";
import type { RichTextRegistry } from "./richtext";
import { plainText } from "./richtext";
import type { CampaignStore } from "./store";
import type { Entity, Id } from "./types";

/** A player character: a character-kind entity flagged as a PC or owned by a member (as `isPlayerCharacter`). */
function isPc(e: Pick<Entity, "fields" | "ownerMemberId">, kind: string | undefined): boolean {
  return kind === "character" && (e.fields.isPC === true || !!e.ownerMemberId);
}

const byName = <T extends { name: string; id: string }>(a: T, b: T) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

/** The campaign's entities (as summaries) and the relationships between them, filtered by the hint. */
export function campaignSnapshot(store: CampaignStore, hint: CampaignInputHint, kindOf: (type: string) => string | undefined): CampaignSnapshot {
  const entities: CampaignEntitySummary[] = [];
  for (const e of store.list("entities")) {
    const kind = kindOf(e.type);
    if (hint.types && !hint.types.includes(e.type)) continue;
    if (hint.kinds && (!kind || !hint.kinds.includes(kind))) continue;
    const summary: CampaignEntitySummary = { id: e.id, name: e.name, type: e.type, tags: [...e.tags].sort() };
    if (kind) summary.kind = kind;
    if (e.subtype) summary.subtype = e.subtype;
    if (isPc(e, kind)) summary.pc = true;
    for (const path of hint.fields ?? []) {
      const v = getPath(e.fields, path);
      if (typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v))) (summary.fields ??= {})[path] = v;
    }
    entities.push(summary);
  }
  entities.sort(byName);
  const ids = new Set(entities.map((e) => e.id));
  const relationships = store
    .list("relationships")
    .filter((r) => ids.has(r.from) && ids.has(r.to) && (!hint.relationships || hint.relationships.includes(r.type)))
    .map((r) => ({ type: r.type, from: r.from, to: r.to }))
    .sort((a, b) => a.type.localeCompare(b.type) || a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
  return { entities, relationships };
}

function stringFields(fields: Record<string, unknown> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields ?? {})) if (typeof v === "string" && v.trim() !== "") out[k] = v.trim();
  return out;
}

/** The rich-text docs an adventure snapshot reads. */
export function adventureSnapshotDocIds(store: CampaignStore, adventureId: Id): Id[] {
  const a = store.get("adventures", adventureId);
  return a?.gmSituationDoc ? [a.gmSituationDoc] : [];
}

/**
 * An adventure as a procedure input: premise, hidden situation (`docText`
 * reads the rich text, "" when not loaded), string narrative fields, acts,
 * the cast by role and the named rooms of its site maps.
 */
export function adventureSnapshot(store: CampaignStore, adventureId: Id, docText: (id: Id) => string): AdventureSnapshot | undefined {
  const a = store.get("adventures", adventureId);
  if (!a) return undefined;
  const acts = adventureActs(store, a).map((act) => ({ number: act.number, title: act.title ?? "", goal: act.goal ?? "", fields: stringFields(act.fields) }));
  const cast: Record<string, string[]> = {};
  for (const [role, ids] of Object.entries(a.cast ?? {})) cast[role] = ids.filter((id) => store.has("entities", id));
  const rooms = new Set<string>();
  for (const m of store.list("maps")) {
    if (m.adventure !== adventureId || !m.layout) continue;
    for (const z of m.layout.zones) if (z.name && z.layer !== "duct" && (z.key || z.kind === "room")) rooms.add(z.name.trim());
  }
  return {
    id: a.id,
    title: a.title,
    premise: a.premise ?? "",
    situation: a.gmSituationDoc ? docText(a.gmSituationDoc).trim() : "",
    fields: stringFields(a.fields),
    acts,
    cast,
    rooms: [...rooms].filter(Boolean).sort((x, y) => x.localeCompare(y)),
  };
}

/** `adventureSnapshot` once its rich text has loaded (`whenDocSynced` waits for a doc's stored content). */
export async function loadAdventureSnapshot(store: CampaignStore, registry: RichTextRegistry, adventureId: Id, whenDocSynced?: (id: Id) => Promise<void>): Promise<AdventureSnapshot | undefined> {
  const ids = adventureSnapshotDocIds(store, adventureId);
  await Promise.all(
    ids.map((id) => {
      registry.open(id);
      return (whenDocSynced ? whenDocSynced(id) : registry.whenReady(id)).catch(() => undefined);
    }),
  );
  return adventureSnapshot(store, adventureId, (id) => (registry.has(id) ? plainText(registry.open(id)) : ""));
}
