/**
 * `/ship`: the crew's own vehicle (the module's `crewShip`), the group's funds
 * and ledger (`ledger`), the travel planner and log (`travel`), and the way
 * into the module's between-jobs procedure. Every piece shows only when the
 * module defines it for the campaign's play mode.
 */
import type { Entity } from "@campaign-forge/core";
import { getPath, type CrewShipDef, type EntityTypeDef } from "@campaign-forge/module-sdk";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Badge, Card, EmptyState, PageRef } from "../../components/ui";
import { humanize } from "../../lib/format";
import { useCampaign, useComputed, useList, useMeta, useRecord } from "../../state/hooks";
import { chooseCrewShip, crewShipDefOf, ledgerDefOf, money, travelDefOf, whereIsShip } from "../../state/shipActions";
import { SheetTab } from "../entities/SheetTab";
import { FundsSummary, LedgerCard } from "./Ledger";
import { TravelLog, TravelPlanner } from "./TravelPlanner";
import "./ship.css";

export function ShipPage() {
  const ctx = useCampaign();
  const meta = useMeta();
  const shipDef = crewShipDefOf(ctx.module, meta.mode);
  const ledgerDef = ledgerDefOf(ctx.module, meta.mode);
  const travelDef = travelDefOf(ctx.module, meta.mode);
  const shipId = shipDef ? meta.settings?.[shipDef.setting] : undefined;
  const ship = useRecord("entities", typeof shipId === "string" ? shipId : undefined);
  const crewShip = ship && shipDef?.entityTypes.includes(ship.type) ? ship : undefined;
  const label = shipDef?.label ?? "Ship";

  if (!shipDef && !ledgerDef) {
    return (
      <div className="app-page">
        <EmptyState title={`No ${label.toLowerCase()} in this mode`} text={`The ${ctx.module.manifest.name} module has no crew vehicle or ledger for this play mode.`} />
      </div>
    );
  }

  return (
    <div className="app-page ship-page" data-testid="ship-page">
      <header className="app-page__header">
        <div>
          <h1 className="app-title">{label}</h1>
          <p className="cf-muted">
            {crewShip ? `${crewShip.name}, the crew's ${label.toLowerCase()}` : `Choose the crew's ${label.toLowerCase()}`}
            {meta.currentDate && (
              <>
                {" · In-world date "}
                <span className="cf-mono" data-testid="campaign-date">
                  {meta.currentDate}
                </span>
              </>
            )}
          </p>
        </div>
      </header>

      <div className="ship-layout">
        <div className="app-stack ship-layout__main">
          {shipDef && <ShipCard def={shipDef} ship={crewShip} />}
          {ledgerDef && <LedgerCard def={ledgerDef} {...(crewShip ? { shipId: crewShip.id } : {})} />}
        </div>
        <aside className="app-stack ship-layout__side">
          {ledgerDef && (
            <Card title="Funds" subtitle="Summed from the ledger, never stored.">
              <FundsSummary def={ledgerDef} />
            </Card>
          )}
          {shipDef?.betweenJobs && <BetweenJobsCard procedureId={shipDef.betweenJobs} />}
          {travelDef && <TravelPlanner def={travelDef} {...(crewShip ? { ship: crewShip } : {})} />}
          {travelDef && <TravelLog {...(crewShip ? { shipId: crewShip.id } : {})} />}
        </aside>
      </div>
    </div>
  );
}

function ShipPicker({ def, ship }: { def: CrewShipDef; ship?: Entity }) {
  const ctx = useCampaign();
  const all = useList("entities");
  const candidates = useMemo(() => all.filter((e) => def.entityTypes.includes(e.type)).sort((a, b) => a.name.localeCompare(b.name)), [all, def]);
  return (
    <label className="app-label ship-picker">
      <span>Crew's {(def.label ?? "ship").toLowerCase()}</span>
      <select className="cf-select" aria-label={`Crew's ${(def.label ?? "ship").toLowerCase()}`} value={ship?.id ?? ""} onChange={(e) => chooseCrewShip(ctx, e.target.value || undefined)} data-testid="ship-picker">
        <option value="">None chosen</option>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function display(v: unknown): string {
  if (v === undefined || v === null || v === "") return "—";
  if (typeof v === "number") return v.toLocaleString("en-US");
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "string") return humanize(v);
  return String(v);
}

/** A compact read of the vehicle's state (the module's `stats` and `lists`), then its sheet sections for editing. */
function ShipCard({ def, ship }: { def: CrewShipDef; ship?: Entity }) {
  const ctx = useCampaign();
  const typeDef = ship ? ctx.module.entityType(ship.type) : undefined;
  const computed = useComputed(ship);
  const legs = useList("travel");
  const here = useMemo(() => whereIsShip(ctx), [ctx, legs, ship]);
  const [editing, setEditing] = useState(false);
  const sheetDef = useMemo((): EntityTypeDef | undefined => {
    if (!typeDef) return undefined;
    const wanted = def.sections;
    return wanted ? { ...typeDef, sheet: { ...typeDef.sheet, sections: typeDef.sheet.sections.filter((s) => wanted.includes(s.id)) } } : typeDef;
  }, [typeDef, def.sections]);

  if (!ship) {
    return (
      <Card title={def.label ?? "Ship"} data-testid="ship-card">
        <div className="app-stack">
          <p className="cf-muted">Pick which {(def.label ?? "ship").toLowerCase()} is the crew's own. Its state then shows here, and travel uses it.</p>
          <ShipPicker def={def} />
        </div>
      </Card>
    );
  }

  const read = (path: string): unknown => {
    const v = getPath(ship.fields, path);
    return v !== undefined ? v : computed[path];
  };

  return (
    <Card
      title={
        <Link to="/c/$campaignId/entities/$entityId" params={{ campaignId: ctx.campaignId, entityId: ship.id }} className="app-link-strong">
          {ship.name}
        </Link>
      }
      subtitle={[typeDef?.name, here ? `at ${here.name}` : ""].filter(Boolean).join(" · ")}
      data-testid="ship-card"
      actions={<ShipPicker def={def} ship={ship} />}
    >
      <div className="app-stack">
        {def.stats && def.stats.length > 0 && (
          <div className="ship-stats" aria-label="State at a glance">
            {def.stats.map((st) => {
              const v = read(st.path);
              if (st.format === "flag") {
                return v === true ? (
                  <Badge key={st.path} tone="danger">
                    {st.label}
                  </Badge>
                ) : null;
              }
              const text = st.format === "money" && typeof v === "number" ? money(ctx, v) : display(v);
              const max = st.max !== undefined ? read(st.max) : undefined;
              return (
                <span key={st.path} className="app-stat" data-stat={st.path}>
                  <span className="app-stat__label">{st.label}</span>
                  <span className="app-stat__value">
                    {text}
                    {max !== undefined ? `/${display(max)}` : ""}
                  </span>
                </span>
              );
            })}
          </div>
        )}
        {def.lists && def.lists.length > 0 && (
          <div className="ship-columns">
            {def.lists.map((l) => {
              const items = Array.isArray(read(l.path)) ? (read(l.path) as unknown[]).filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null) : [];
              return (
                <section key={l.path} aria-label={l.label} data-list={l.path}>
                  <h4 className="prep-h4">{l.label}</h4>
                  {items.length === 0 ? (
                    <p className="cf-muted">{l.empty ?? "None."}</p>
                  ) : (
                    <ul className="app-list">
                      {items.map((it, i) => (
                        <li key={i} className="app-list__row">
                          {l.badge && it[l.badge] !== undefined && <Badge tone="warning">{String(it[l.badge])}</Badge>}
                          <span>
                            <strong>{String(it[l.title] ?? "")}</strong>
                            {(l.detail ?? [])
                              .map((k) => it[k])
                              .filter((x) => x !== undefined && x !== "")
                              .map((x, j) => (
                                <span key={j} className="cf-muted">
                                  {" "}
                                  · {String(x)}
                                </span>
                              ))}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        )}
        <details className="ship-sheet" open={editing} onToggle={(e) => setEditing((e.target as HTMLDetailsElement).open)}>
          <summary>Edit the {(def.label ?? "ship").toLowerCase()}'s state</summary>
          {editing && <SheetTab entity={ship} def={sheetDef} />}
        </details>
      </div>
    </Card>
  );
}

function BetweenJobsCard({ procedureId }: { procedureId: string }) {
  const ctx = useCampaign();
  const procedure = ctx.module.procedure(procedureId);
  const payoutTypes = new Set((ctx.module.module.ledger?.payouts ?? []).map((p) => p.entityType));
  const entities = useList("entities");
  const jobs = useMemo(() => entities.filter((e) => payoutTypes.has(e.type)).sort((a, b) => a.name.localeCompare(b.name)), [entities]); // eslint-disable-line react-hooks/exhaustive-deps
  const [job, setJob] = useState<string>("");
  const chosen = job || jobs.find((j) => j.fields.status === "accepted")?.id || jobs[0]?.id || "";
  if (!procedure) return null;
  return (
    <Card title={procedure.name} subtitle={procedure.description} data-testid="between-jobs">
      <div className="app-stack">
        {jobs.length > 0 && (
          <label className="app-label">
            <span>Job just finished</span>
            <select className="cf-select" aria-label="Job just finished" value={chosen} onChange={(e) => setJob(e.target.value)}>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="app-row">
          <Link
            to="/c/$campaignId/generate/$procedureId"
            params={{ campaignId: ctx.campaignId, procedureId }}
            search={chosen ? { pick: `job:${chosen}` } : {}}
            className="cf-btn cf-btn--primary"
            data-testid="between-jobs-link"
          >
            Run {procedure.name.toLowerCase()}
          </Link>
          <PageRef page={procedure.page} />
        </div>
      </div>
    </Card>
  );
}
