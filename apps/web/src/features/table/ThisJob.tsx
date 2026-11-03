/**
 * "This job" in table mode (GM only): the record the scene's adventure was
 * run from (`Adventure.source`), or the one the scene's place is linked to
 * (a job's site), with the arc clues seeded in it or with its people (Mark
 * found, Reveal on the player screen) and what the module says about each
 * person (`AdventureSourceDef.people`: agenda, secret, whether they turn on
 * the crew). Nothing here is drawn on the player screen; Reveal shows only
 * the clue's crew-notes text there, once it is found. Generic: the module
 * names the record ("job") and writes the notes.
 */
import { adventureSourceInput, cluesFor, markClueFound, sourceDefOf, unmarkClueFound, type ArcClue, type ArcThread, type CampaignMaps, type Entity, type Id, type Scene, type SiteMap } from "@campaign-forge/core";
import { clueKindLabel, type AdventureSourceDef, type AdventureSourcePerson } from "@campaign-forge/module-sdk";
import { useMemo } from "react";
import { Badge, Button, Card, pushToast } from "../../components/ui";
import { arcsDefOf } from "../../state/arcActions";
import { useCampaign, useList, useMeta, useRecord } from "../../state/hooks";
import { sourceDefFor, sourceNoun } from "../../state/sourceActions";
import { setSpotlight } from "../../state/tableActions";
import { useTableState } from "./hooks";

type Maps = Pick<CampaignMaps, "entities" | "relationships" | "maps" | "arcs">;

/** The campaign's records as maps, live (for the pure core helpers). */
function useSourceMaps(): Maps {
  const entities = useList("entities");
  const relationships = useList("relationships");
  const maps = useList("maps");
  const arcs = useList("arcs");
  return useMemo(
    () => ({
      entities: Object.fromEntries(entities.map((e) => [e.id, e])),
      relationships: Object.fromEntries(relationships.map((r) => [r.id, r])),
      maps: Object.fromEntries(maps.map((m) => [m.id, m])),
      arcs: Object.fromEntries(arcs.map((t) => [t.id, t])),
    }),
    [entities, relationships, maps, arcs],
  );
}

/**
 * The record the scene plays out: its adventure's source, else a record
 * the scene's place (or its map's place) is linked to that the module can
 * run in this mode (a job, through its site).
 */
export function useTableSource(scene: Scene | undefined, map: SiteMap | undefined): { entity: Entity; def: AdventureSourceDef } | undefined {
  const ctx = useCampaign();
  const meta = useMeta();
  const act = useRecord("acts", scene?.act);
  const adventure = useRecord("adventures", act?.adventure);
  const relationships = useList("relationships");
  const entities = useList("entities");
  return useMemo(() => {
    const byId = new Map(entities.map((e) => [e.id, e]));
    if (adventure?.source) {
      const entity = byId.get(adventure.source.entity);
      const def = sourceDefOf(ctx.module.module, adventure) ?? (entity ? sourceDefFor(ctx, entity, meta.mode) : undefined);
      if (entity && def) return { entity, def };
    }
    for (const place of [scene?.location, map?.location]) {
      if (!place) continue;
      for (const r of relationships) {
        if (r.from !== place && r.to !== place) continue;
        const other = byId.get(r.from === place ? r.to : r.from);
        const def = other ? sourceDefFor(ctx, other, meta.mode) : undefined;
        if (other && def) return { entity: other, def };
      }
    }
    return undefined;
  }, [ctx, meta.mode, adventure, scene?.location, map?.location, relationships, entities]);
}

/** The module's notes on the record's people, with their records (GM only). */
export function useSourcePeople(entity: Entity | undefined, def: AdventureSourceDef | undefined): Array<AdventureSourcePerson & { record: Entity }> {
  const ctx = useCampaign();
  const meta = useMeta();
  const maps = useSourceMaps();
  return useMemo(() => {
    if (!entity || !def?.people) return [];
    try {
      const people = def.people(adventureSourceInput(maps, ctx.module.module, entity.id, meta.mode));
      return people.flatMap((p) => (maps.entities[p.entity] ? [{ ...p, record: maps.entities[p.entity]! }] : []));
    } catch {
      return [];
    }
  }, [entity, def, maps, ctx.module, meta.mode]);
}

/** One person's GM notes: role, stance and the labelled lines. */
export function PersonNotes({ person, onOpen }: { person: AdventureSourcePerson & { record: Entity }; onOpen?: (id: Id) => void }) {
  return (
    <div className="app-thisjob__person" data-testid="source-person" data-entity={person.entity}>
      <div className="app-row">
        {onOpen ? (
          <button type="button" className="app-linkbtn app-link-strong" onClick={() => onOpen(person.entity)} aria-label={`Open ${person.record.name}`}>
            {person.record.name}
          </button>
        ) : (
          <strong>{person.record.name}</strong>
        )}
        {person.role && <Badge tone="accent">{person.role}</Badge>}
      </div>
      <PersonNoteLines person={person} />
    </div>
  );
}

/** A person's stance and labelled GM notes (the job page shows these under each NPC). */
export function PersonNoteLines({ person }: { person: Pick<AdventureSourcePerson, "notes" | "stance" | "entity"> }) {
  return (
    <div className="app-thisjob__lines" data-testid="person-notes" data-entity={person.entity}>
      {person.stance && (
        <Badge tone={person.stance.tone ?? "muted"} data-testid="source-person-stance">
          {person.stance.label}
        </Badge>
      )}
      {person.notes.length > 0 && (
        <dl className="app-thisjob__notes">
          {person.notes.map((n, i) => (
            <div key={i} className="app-thisjob__note">
              <dt>{n.label}</dt>
              <dd>{n.text}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/** Arc clues tied to the record or to one of its people (seeded, carried or found there), each once. */
function useSourceClues(entity: Entity | undefined, people: Id[]): Array<{ thread: ArcThread; clue: ArcClue }> {
  const maps = useSourceMaps();
  const key = people.join(",");
  return useMemo(() => {
    if (!entity) return [];
    const seen = new Set<string>();
    const out: Array<{ thread: ArcThread; clue: ArcClue }> = [];
    for (const id of [entity.id, ...(key ? key.split(",") : [])]) {
      for (const x of cluesFor(maps, id)) {
        if (seen.has(x.clue.id)) continue;
        seen.add(x.clue.id);
        out.push({ thread: x.thread, clue: x.clue });
      }
    }
    return out;
  }, [entity, key, maps]);
}

export function ThisJob({ sessionId, scene, map, onOpen }: { sessionId: Id; scene: Scene | undefined; map: SiteMap | undefined; onOpen: (id: Id) => void }) {
  const ctx = useCampaign();
  const meta = useMeta();
  const source = useTableSource(scene, map);
  const people = useSourcePeople(source?.entity, source?.def);
  const relationships = useList("relationships");
  // everyone linked to the record, for the clues seeded with them (a contact who knows something)
  const linked = useMemo(() => (source ? relationships.filter((r) => r.from === source.entity.id || r.to === source.entity.id).map((r) => (r.from === source.entity.id ? r.to : r.from)) : []), [relationships, source]);
  const clues = useSourceClues(source?.entity, linked);
  const arcs = arcsDefOf(ctx.module, meta.mode);
  const table = useTableState(sessionId);
  const session = useRecord("sessions", sessionId);
  if (!source) return null;
  const noun = sourceNoun(ctx, source.def);
  const job = source.entity;

  const markFound = (thread: ArcThread, clue: ArcClue) => {
    markClueFound(ctx.store, thread.id, clue.id, { via: "job", session: sessionId, job: job.id, ...(clue.seeded?.entity ? { entity: clue.seeded.entity } : {}) });
    pushToast(`Found${session ? ` in Session ${session.number}` : ""}: it is in the crew notes now.`, { tone: "success" });
  };
  const reveal = (thread: ArcThread, clue: ArcClue) => {
    if (clue.state !== "found") markClueFound(ctx.store, thread.id, clue.id, { via: "job", session: sessionId, job: job.id, ...(clue.seeded?.entity ? { entity: clue.seeded.entity } : {}) });
    setSpotlight(ctx, sessionId, { thread: thread.id, clue: clue.id });
    pushToast("On the player screen: what the crew notes say about it.", { tone: "success" });
  };
  const onScreen = (clue: ArcClue) => table.spotlight?.clue === clue.id;

  return (
    <Card
      title={`This ${noun}`}
      subtitle={job.name}
      className="app-thisjob"
      data-testid="this-job"
      actions={
        <>
          <Badge title="Never on the player screen, shares or packets">GM only</Badge>
          <Button size="sm" variant="ghost" onClick={() => onOpen(job.id)} aria-label={`Open ${job.name}`}>
            Open
          </Button>
        </>
      }
    >
      <div className="app-stack">
        {clues.length > 0 && (
          <section aria-label={`Clues in this ${noun}`}>
            <h4 className="app-table__group-title">Clues</h4>
            <ul className="app-reveals">
              {clues.map(({ thread, clue }) => (
                <li key={clue.id} className={`app-reveal arc-clue--${clue.state}`} data-testid="this-job-clue" data-state={clue.state} data-clue={clue.id}>
                  <div className="app-reveal__row">
                    {arcs && <Badge tone="accent">{clueKindLabel(arcs, clue.kind)}</Badge>}
                    <Badge tone={clue.state === "found" ? "success" : clue.state === "seeded" ? "warning" : "muted"}>{clue.state}</Badge>
                    <span className="cf-muted app-small">
                      {thread.title}
                      {clue.seeded?.slotLabel ? ` · ${clue.seeded.slotLabel}` : ""}
                    </span>
                  </div>
                  <p className="app-reveal__body">{clue.seeded?.text ?? clue.text}</p>
                  {clue.playerText && <p className="cf-muted app-small app-reveal__body">Crew notes: {clue.playerText}</p>}
                  <div className="app-row app-thisjob__actions">
                    {clue.state !== "found" ? (
                      <Button size="sm" onClick={() => markFound(thread, clue)} data-testid="this-job-found" title="The crew learnt it: it goes into their crew notes">
                        Mark found
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => unmarkClueFound(ctx.store, thread.id, clue.id)}>
                        Mark not found
                      </Button>
                    )}
                    {onScreen(clue) ? (
                      <Button size="sm" variant="ghost" onClick={() => setSpotlight(ctx, sessionId, undefined)} data-testid="this-job-unreveal">
                        Off the screen
                      </Button>
                    ) : (
                      <Button size="sm" variant="primary" onClick={() => reveal(thread, clue)} disabled={!!clue.players} title={clue.players ? "One player learnt it alone: it stays in their packet" : "Mark it found and show it on the player screen"} data-testid="this-job-reveal">
                        Reveal
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
        {people.length > 0 && (
          <section aria-label={`People in this ${noun}`}>
            <h4 className="app-table__group-title">People</h4>
            <ul className="app-thisjob__people">
              {people.map((p) => (
                <li key={p.entity}>
                  <PersonNotes person={p} onOpen={onOpen} />
                </li>
              ))}
            </ul>
          </section>
        )}
        {clues.length === 0 && people.length === 0 && <p className="cf-muted">No clues seeded in it and no notes on its people.</p>}
      </div>
    </Card>
  );
}
