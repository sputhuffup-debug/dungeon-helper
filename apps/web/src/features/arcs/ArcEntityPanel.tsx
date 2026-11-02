/**
 * The arcs on an entity's page (when the module keeps arcs in this mode):
 * - every record: the clues tied to it (seeded in it, carried by it, found
 *   in it), each marked found from here;
 * - a job: who may have noticed the crew (faction heat) and its NPCs to add
 *   to the crew's contacts when the job ends;
 * - an NPC: the contact card (stance, favours, grudges, what they know,
 *   where to find them) and the threads they work for;
 * - a faction: its heat and the threads it sponsors.
 */
import {
  addContact,
  adjustHeat,
  carriesHeat,
  cluesFor,
  cluesOf,
  contactCandidates,
  heatOf,
  heatSuggestions,
  markClueFound,
  removeContact,
  threadsInOrder,
  unmarkClueFound,
  updateContact,
  type CampaignMaps,
  type Entity,
} from "@campaign-forge/core";
import { CONTACT_STANCES, STANCE_LABELS, clueKindLabel, heatLabel, heatMax, type ArcsDef, type ContactStance, type EntityTypeDef } from "@campaign-forge/module-sdk";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AutoGrowText, Badge, Button, Card, IconButton, pushToast } from "../../components/ui";
import { arcsDefOf, clockText, currentSession } from "../../state/arcActions";
import { useCampaign, useList, useMeta } from "../../state/hooks";
import { ClockBar } from "./ClockBar";
import "./arcs.css";

type Maps = Pick<CampaignMaps, "arcs" | "entities" | "relationships">;

function useArcMaps(): Maps {
  const arcs = useList("arcs");
  const entities = useList("entities");
  const relationships = useList("relationships");
  return useMemo(() => ({ arcs: Object.fromEntries(arcs.map((t) => [t.id, t])), entities: Object.fromEntries(entities.map((e) => [e.id, e])), relationships: Object.fromEntries(relationships.map((r) => [r.id, r])) }), [arcs, entities, relationships]);
}

export function ArcEntityPanel({ entity, def: entityDef }: { entity: Entity; def: EntityTypeDef | undefined }) {
  const ctx = useCampaign();
  const meta = useMeta();
  const def = arcsDefOf(ctx.module, meta.mode);
  const maps = useArcMaps();
  if (!def) return null;
  const kind = entityDef?.kind;
  const job = kind === "job";
  const faction = carriesHeat(def, entity);
  const npc = kind === "character" && entity.fields.isPC !== true && !entity.ownerMemberId && (def.contacts?.entityTypes ?? []).includes(entity.type);
  const clues = cluesFor(maps, entity.id);
  const agentOf = threadsInOrder(Object.values(maps.arcs)).filter((t) => t.agents?.includes(entity.id));
  const sponsors = threadsInOrder(Object.values(maps.arcs)).filter((t) => t.sponsor === entity.id);
  if (!job && !faction && !npc && clues.length === 0) return null;
  return (
    <Card title={def.label ?? "Arcs"} subtitle="GM only. The players see found clues and met contacts in their crew notes." data-testid="arc-entity-panel">
      <div className="app-stack">
        {clues.length > 0 && <CluesHere entity={entity} job={job} clues={clues} def={def} />}
        {job && <WhoNoticed jobId={entity.id} def={def} maps={maps} />}
        {job && <JobContacts jobId={entity.id} maps={maps} />}
        {npc && <ContactCard entity={entity} maps={maps} def={def} />}
        {agentOf.length > 0 && (
          <p className="app-small" data-testid="arc-agent-of">
            Works for {agentOf.map((t) => `“${t.title}”`).join(", ")}.
          </p>
        )}
        {faction && <FactionHeat entity={entity} def={def} />}
        {sponsors.length > 0 && (
          <div>
            <h4 className="offer-card__label">Sponsors</h4>
            <ul className="arc-panel__list">
              {sponsors.map((t) => (
                <li key={t.id} className="arc-panel__row">
                  <Link to="/c/$campaignId/arcs" params={{ campaignId: ctx.campaignId }} className="app-link-strong">
                    {t.title}
                  </Link>
                  <ClockBar segments={t.clock.segments} filled={t.clock.filled} />
                  <span className="cf-mono app-small">{clockText(t)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

function CluesHere({ entity, job, clues, def }: { entity: Entity; job: boolean; clues: ReturnType<typeof cluesFor>; def: ArcsDef }) {
  const ctx = useCampaign();
  return (
    <div>
      <h4 className="offer-card__label">Clues</h4>
      <ul className="arc-panel__list" data-testid="arc-entity-clues">
        {clues.map(({ thread, clue }) => (
          <li key={clue.id} className={`arc-clue arc-clue--${clue.state}`} data-testid="arc-entity-clue" data-state={clue.state}>
            <div className="app-row arc-clue__head">
              <Badge tone="accent">{clueKindLabel(def, clue.kind)}</Badge>
              <Badge tone={clue.state === "found" ? "success" : clue.state === "seeded" ? "warning" : "muted"}>{clue.state}</Badge>
              <span className="cf-muted app-small">{thread.title}</span>
              {clue.seeded?.slotLabel && <span className="cf-muted app-small">· {clue.seeded.slotLabel}</span>}
            </div>
            <p className="arc-clue__text">{clue.seeded?.text ?? clue.text}</p>
            <div className="app-row">
              {clue.state !== "found" ? (
                <Button
                  size="sm"
                  onClick={() => {
                    const session = currentSession(ctx.store);
                    markClueFound(ctx.store, thread.id, clue.id, { via: job ? "job" : "entity", ...(session ? { session: session.id } : {}), ...(job ? { job: entity.id } : { entity: entity.id, ...(clue.seeded?.job ? { job: clue.seeded.job } : {}) }) });
                    pushToast(`Found${session ? ` in Session ${session.number}` : ""}: it is in the crew notes now.`, { tone: "success" });
                  }}
                  data-testid="arc-entity-clue-found"
                >
                  Mark found
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => unmarkClueFound(ctx.store, thread.id, clue.id)}>
                  Not found
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "Who noticed the crew this job?": the job's employer and the factions it names, each +1 heat. */
export function WhoNoticed({ jobId, def, maps }: { jobId: string; def: ArcsDef; maps: Maps }) {
  const ctx = useCampaign();
  if (!def.heat) return null;
  const suggestions = heatSuggestions(maps, def, jobId);
  const max = heatMax(def);
  return (
    <div data-testid="arc-who-noticed">
      <h4 className="offer-card__label">{def.heat.prompt ?? "Who noticed the crew?"}</h4>
      {suggestions.length === 0 ? (
        <p className="cf-muted app-small">No faction is tied to this job. Raise heat on the arc board.</p>
      ) : (
        <ul className="arc-panel__list">
          {suggestions.map(({ entity, why }) => {
            const heat = heatOf(def, maps.entities[entity.id] ?? entity);
            return (
              <li key={entity.id} className="arc-panel__row" data-testid="arc-heat-suggestion">
                <strong>{entity.name}</strong>
                <span className="cf-muted app-small">{why}</span>
                <Badge>{heatLabel(def, heat)}</Badge>
                <Button size="sm" disabled={heat >= max} onClick={() => adjustHeat(ctx.store, def, entity.id, 1)} data-testid="arc-heat-up">
                  +1 heat
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** The job's NPCs who could become contacts: tick the survivors, add them. */
export function JobContacts({ jobId, maps }: { jobId: string; maps: Maps }) {
  const ctx = useCampaign();
  const candidates = contactCandidates(maps, ctx.module.module, jobId);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const session = currentSession(ctx.store);
  if (candidates.length === 0) return null;
  const add = () => {
    for (const id of picked) {
      const e = maps.entities[id]!;
      const betrayer = (Array.isArray(maps.entities[jobId]?.fields.betrayers) ? (maps.entities[jobId]!.fields.betrayers as unknown[]) : []).includes(e.name);
      addContact(ctx.store, id, { stance: betrayer ? "hostile" : "neutral", ...(betrayer ? { betrayer: true } : {}), lastSeen: { job: jobId, ...(session ? { session: session.id } : {}) } }, { reveal: true });
    }
    pushToast(`Added ${picked.size} contact${picked.size === 1 ? "" : "s"}. The players see them in their crew notes.`, { tone: "success" });
    setPicked(new Set());
  };
  return (
    <div data-testid="arc-job-contacts">
      <h4 className="offer-card__label">Contacts from this job</h4>
      <p className="cf-muted app-small">When the job ends, tick the NPCs who lived and add them to the crew's contacts. Adding one lets the players see them.</p>
      <ul className="arc-panel__list">
        {candidates.map((e) => (
          <li key={e.id} className="arc-panel__row">
            <label className="app-toggle">
              <input
                type="checkbox"
                className="cf-checkbox"
                checked={picked.has(e.id)}
                onChange={(ev) =>
                  setPicked((p) => {
                    const n = new Set(p);
                    if (ev.target.checked) n.add(e.id);
                    else n.delete(e.id);
                    return n;
                  })
                }
                data-testid="arc-contact-candidate"
              />
              {e.name}
            </label>
            {e.visibility.level === "gm" && <Badge tone="warning">GM-only until met</Badge>}
          </li>
        ))}
      </ul>
      <Button size="sm" disabled={picked.size === 0} onClick={add} data-testid="arc-add-contacts">
        Add to contacts
      </Button>
    </div>
  );
}

function ContactCard({ entity, maps, def }: { entity: Entity; maps: Maps; def: ArcsDef }) {
  const ctx = useCampaign();
  const c = entity.contact;
  const [foundAt, setFoundAt] = useState(c?.foundAt ?? "");
  const [grudges, setGrudges] = useState((c?.grudges ?? []).join("\n"));
  const [note, setNote] = useState(c?.note ?? "");
  const [knowPick, setKnowPick] = useState("");
  const allClues = threadsInOrder(Object.values(maps.arcs)).flatMap((t) => cluesOf(t).map((x) => ({ t, c: x.clue })));
  if (!c) {
    return (
      <div className="app-row" data-testid="arc-contact-card">
        <span className="cf-muted app-small">Not one of the crew's contacts.</span>
        <Button size="sm" onClick={() => addContact(ctx.store, entity.id, { stance: "neutral" }, { reveal: true })} data-testid="arc-make-contact">
          Add to the crew's contacts
        </Button>
      </div>
    );
  }
  const set = (patch: Parameters<typeof updateContact>[2]) => updateContact(ctx.store, entity.id, patch);
  const stepper = (label: string, value: number, key: "owedToCrew" | "owedByCrew", testId: string) => (
    <span className="arc-panel__favours" data-testid={testId}>
      <span className="app-small">{label}</span>
      <IconButton size="sm" variant="ghost" icon="−" label={`${label}: one fewer`} disabled={value === 0} onClick={() => set({ [key]: value - 1 })} />
      <strong className="cf-mono">{value}</strong>
      <IconButton size="sm" variant="ghost" icon="+" label={`${label}: one more`} onClick={() => set({ [key]: value + 1 })} />
    </span>
  );
  const lastJob = c.lastSeen?.job ? maps.entities[c.lastSeen.job] : undefined;
  const lastSession = c.lastSeen?.session ? ctx.store.get("sessions", c.lastSeen.session) : undefined;
  return (
    <div className="app-stack" data-testid="arc-contact-card">
      <h4 className="offer-card__label">Crew contact</h4>
      <div className="arc-panel__row">
        <select className="cf-select arc-select-sm" aria-label="Stance" value={c.stance} onChange={(e) => set({ stance: e.target.value as ContactStance })} data-testid="arc-contact-stance">
          {CONTACT_STANCES.map((s) => (
            <option key={s} value={s}>
              {STANCE_LABELS[s]}
            </option>
          ))}
        </select>
        {stepper("Owes the crew", c.favours.owedToCrew, "owedToCrew", "arc-owed-to-crew")}
        {stepper("Crew owes them", c.favours.owedByCrew, "owedByCrew", "arc-owed-by-crew")}
        {c.betrayer && <Badge tone="danger">Betrayed the crew</Badge>}
      </div>
      <label className="app-label">
        <span>Where to find them (the players see this)</span>
        <AutoGrowText className="cf-input" aria-label="Where to find them" value={foundAt} onChange={(e) => setFoundAt(e.target.value)} onBlur={() => set({ foundAt })} data-testid="arc-contact-found-at" />
      </label>
      <label className="app-label">
        <span>Grudges, one per line (GM)</span>
        <AutoGrowText multiline className="cf-input" aria-label="Grudges" value={grudges} onChange={(e) => setGrudges(e.target.value)} onBlur={() => set({ grudges: grudges.split("\n") })} />
      </label>
      <div>
        <span className="app-small cf-muted">What they know (a way for the crew to find it)</span>
        <ul className="arc-panel__list">
          {c.knows.map((k) => {
            const x = allClues.find((y) => y.t.id === k.thread && y.c.id === k.clue);
            return (
              <li key={`${k.thread}/${k.clue}`} className="arc-panel__row app-small">
                {x ? `${x.t.title}: ${x.c.text}` : "A clue no longer on the board"}
                <IconButton size="sm" variant="ghost" icon="×" label="Forget it" onClick={() => set({ knows: c.knows.filter((y) => y !== k) })} />
              </li>
            );
          })}
        </ul>
        <div className="app-row">
          <select className="cf-select arc-select-sm" aria-label="Knows a clue" value={knowPick} onChange={(e) => setKnowPick(e.target.value)}>
            <option value="">Knows a clue…</option>
            {allClues
              .filter((x) => x.c.state !== "found" && !c.knows.some((k) => k.clue === x.c.id))
              .map((x) => (
                <option key={x.c.id} value={`${x.t.id}/${x.c.id}`}>
                  {x.t.title}: {clueKindLabel(def, x.c.kind)}: {x.c.text}
                </option>
              ))}
          </select>
          <Button
            size="sm"
            disabled={!knowPick}
            onClick={() => {
              const [thread, clue] = knowPick.split("/");
              if (thread && clue) set({ knows: [...c.knows, { thread, clue }] });
              setKnowPick("");
            }}
          >
            Add
          </Button>
        </div>
      </div>
      <label className="app-label">
        <span>Note (GM)</span>
        <AutoGrowText multiline className="cf-input" aria-label="Contact note" value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => set({ note })} />
      </label>
      {(lastJob || lastSession) && (
        <p className="cf-muted app-small">
          Last seen{lastJob ? ` on ${lastJob.name}` : ""}
          {lastSession ? `, Session ${lastSession.number}` : ""}.
        </p>
      )}
      <div className="app-row">
        <Button size="sm" variant="ghost" onClick={() => removeContact(ctx.store, entity.id)}>
          Remove from contacts
        </Button>
      </div>
    </div>
  );
}

function FactionHeat({ entity, def }: { entity: Entity; def: ArcsDef }) {
  const ctx = useCampaign();
  const heat = heatOf(def, entity);
  const max = heatMax(def);
  return (
    <div className="arc-panel__row" data-testid="arc-faction-heat">
      <h4 className="offer-card__label">Heat</h4>
      <Badge tone={heat >= max - 1 ? "danger" : heat >= max / 2 ? "warning" : "muted"}>
        {heat} · {heatLabel(def, heat)}
      </Badge>
      <ClockBar segments={max} filled={heat} label={`Heat ${heat} of ${max}`} />
      <IconButton size="sm" variant="ghost" icon="−" label="Cool down" disabled={heat === 0} onClick={() => adjustHeat(ctx.store, def, entity.id, -1)} />
      <IconButton size="sm" variant="ghost" icon="+" label="Heat up" disabled={heat >= max} onClick={() => adjustHeat(ctx.store, def, entity.id, 1)} />
    </div>
  );
}
