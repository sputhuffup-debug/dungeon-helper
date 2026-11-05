/**
 * A job's prep panel, under its tabs: the people involved in it (each with
 * who can see them), its player handouts (a job board posting), and the site
 * brief a map generator reads from it (module-sdk `briefFromEntity`) with
 * "Generate site map" and the site maps made from it. A map generated from
 * an earlier brief says so.
 */
import type { Entity, Handout, Id, Relationship, SiteMap } from "@campaign-forge/core";
import { nounOf, type EntityMapBrief, type MapGeneratorDef } from "@campaign-forge/module-sdk";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Badge, Card } from "../../components/ui";
import { useCampaign, useList, useMeta } from "../../state/hooks";
import { mapGeneratorsFor } from "../../state/mapgenActions";
import { enumLabel } from "../mapgen/BriefForm";
import type { Schema } from "../generate/prefill";
import { sourceDefFor } from "../../state/sourceActions";
import { PersonNoteLines, useSourcePeople } from "../table/ThisJob";

/** The first map generator (for this mode) that reads a brief from the entity, with the brief. */
export function entityBrief(generators: MapGeneratorDef[], entity: Pick<Entity, "id" | "name" | "type" | "fields">): { generator: MapGeneratorDef; brief: EntityMapBrief } | undefined {
  for (const g of generators) {
    const brief = g.briefFromEntity?.({ id: entity.id, name: entity.name, type: entity.type, fields: entity.fields });
    if (brief) return { generator: g, brief };
  }
  return undefined;
}

/** Locations linked to the entity as its site (`relationship` from the site to the entity). */
export function sitesOf(entities: (id: Id) => Entity | undefined, relationships: Relationship[], entityId: Id, relationship: string): Entity[] {
  return relationships.filter((r) => r.type === relationship && r.to === entityId).map((r) => entities(r.from)).filter((e): e is Entity => !!e);
}

/** True when a map was generated from another brief than the entity's current one (the brief was re-rolled or edited since). */
export function briefChanged(map: Pick<SiteMap, "generator">, inputs: Record<string, unknown>): boolean {
  return stable(map.generator?.inputs ?? {}) !== stable(inputs ?? {});
}
/** JSON with object keys sorted, so key order never reads as a change. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v) ?? "null";
}

export function JobPanel({ entity }: { entity: Entity }) {
  const ctx = useCampaign();
  const meta = useMeta();
  const campaignId = ctx.campaignId;
  const relationships = useList("relationships");
  const handoutFilter = useMemo(() => (h: Handout) => h.attachedTo?.kind === "entity" && h.attachedTo.id === entity.id, [entity.id]);
  const handouts = useList("handouts", handoutFilter);
  const maps = useList("maps");
  const found = entityBrief(mapGeneratorsFor(ctx.module, meta.mode), entity);
  const people = relationships
    .filter((r) => (r.to === entity.id || r.from === entity.id) && r.type !== "within")
    .map((r) => ({ r, other: ctx.store.get("entities", r.from === entity.id ? r.to : r.from) }))
    .filter((x): x is { r: Relationship; other: Entity } => !!x.other && ctx.module.entityType(x.other.type)?.kind === "character");
  // the module's GM notes on each person (agenda, secret, whether they turn on the crew), as at the table
  const personNotes = useSourcePeople(entity, sourceDefFor(ctx, entity, meta.mode));
  const notesOf = (id: Id) => personNotes.find((x) => x.entity === id && (x.notes.length > 0 || !!x.stance));
  const sites = found?.brief.site ? sitesOf((id) => ctx.store.get("entities", id), relationships, entity.id, found.brief.site.relationship) : [];
  const siteMaps: SiteMap[] = maps.filter((m) => m.location && sites.some((s) => s.id === m.location) && !!m.layout);
  if (people.length === 0 && handouts.length === 0 && !found) return null;
  const props = ((found?.generator.inputs as Schema | undefined)?.properties ?? {}) as Record<string, Schema>;
  const inputs = found?.brief.inputs ?? {};
  const count = (k: string) => (Array.isArray(inputs[k]) ? (inputs[k] as unknown[]).length : 0);
  // the record's own type names it: "People in this quest"
  const noun = nounOf(ctx.module.entityType(entity.type)?.name ?? "job");

  return (
    <div className="job-panel" data-testid="job-panel">
      {people.length > 0 && (
        <Card title={`People in this ${noun}`} data-testid="job-npcs" className="job-panel__wide">
          <ul className="job-panel__npcs">
            {people.map(({ r, other }) => {
              const open = other.visibility.level !== "gm";
              return (
                <li key={r.id} className="job-panel__npc" data-testid="job-npc" data-visibility={other.visibility.level}>
                  <div className="app-row">
                    <Link to="/c/$campaignId/entities/$entityId" params={{ campaignId, entityId: other.id }} className="app-link-strong">
                      {other.name}
                    </Link>
                    {r.note && <Badge tone="accent">{r.note}</Badge>}
                    <Badge tone={open ? "success" : "warning"}>{open ? "players see" : "GM only until met"}</Badge>
                  </div>
                  {other.summary && <p className="cf-muted app-small">{other.summary}</p>}
                  {notesOf(other.id) && <PersonNoteLines person={notesOf(other.id)!} />}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {handouts.length > 0 && (
        <Card title="Handouts" data-testid="job-handouts">
          <ul className="app-list">
            {handouts.map((h) => (
              <li key={h.id} className="app-list__row">
                <strong>{h.title}</strong>
                <Badge tone={h.visibility.level === "gm" ? "warning" : "success"}>{h.visibility.level === "gm" ? "GM only" : "players"}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {found && (
        <Card
          title="Site brief (GM)"
          subtitle={found.generator.name}
          data-testid="job-brief"
          actions={
            <Link to="/c/$campaignId/maps/new" params={{ campaignId }} search={{ generator: found.generator.id, from: entity.id }} className="cf-btn cf-btn--sm cf-btn--primary" data-testid="job-generate-map">
              Generate site map
            </Link>
          }
        >
          <div className="app-stack">
            {(found.brief.summary ?? []).length > 0 && (
              <ul className="job-panel__brief" data-testid="job-brief-summary">
                {found.brief.summary!.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            )}
            <p className="app-row app-small" data-testid="job-brief-inputs">
              {["site_type", "size", "decks"].filter((k) => inputs[k] !== undefined).map((k) => (
                <Badge key={k}>
                  {props[k]?.title ?? k}: {Array.isArray(props[k]?.enum) ? enumLabel(props[k], inputs[k]) : String(inputs[k])}
                </Badge>
              ))}
              {["threats", "hostiles", "key_rooms", "npcs"].filter((k) => count(k) > 0).map((k) => (
                <Badge key={k} tone={k === "hostiles" ? "danger" : "muted"}>
                  {props[k]?.title ?? k}: {count(k)}
                </Badge>
              ))}
            </p>
            {siteMaps.length > 0 ? (
              <ul className="app-list" data-testid="job-site-maps">
                {siteMaps.map((m) => (
                  <li key={m.id} className="app-list__row">
                    <Link to="/c/$campaignId/maps/$mapId" params={{ campaignId, mapId: m.id }} className="app-link-strong">
                      {m.name}
                    </Link>
                    {briefChanged(m, inputs) && (
                      <Badge tone="warning" data-testid="job-brief-changed" title="Generate again to rebuild the map from the current brief">
                        brief changed since this map was generated
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="cf-muted app-small">No site map yet. Generate one from this brief; it is saved with the {noun}'s site.</p>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
