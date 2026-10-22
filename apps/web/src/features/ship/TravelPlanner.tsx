/**
 * Travel planner: pick a destination from the atlas, enter the distance, see
 * the module's travel time and the checks it calls for, then depart. Departing
 * records the leg, rolls the arrival checks from a fresh seed (kept on the
 * leg) or takes the faces of dice rolled at the table (kept too), applies
 * their effects and moves the in-world date.
 */
import { knownDistance, planTravel, travelArrivalRun, travelLog, type Entity, type Id, type TravelLeg } from "@campaign-forge/core";
import { addDaysToDate, type Procedure, type TravelDef, type TravelPlan } from "@campaign-forge/module-sdk";
import { useMemo, useState } from "react";
import { Badge, Button, Card, PageRef, pushToast, useDiceRoller, type RollRequest } from "../../components/ui";
import { errorMessage } from "../../lib/format";
import { useCampaign, useList, useMeta } from "../../state/hooks";
import { departShip, whereIsShip } from "../../state/shipActions";
import { InputForm } from "../generate/InputForm";
import { initialInputs, inputProperties } from "../generate/prefill";
import { newSeed } from "../generate/runner";

function destinationsOf(entities: Entity[], def: TravelDef): Entity[] {
  return entities
    .filter((e) => def.destinations.some((d) => d.entityType === e.type && (!d.subtypes || (e.subtype !== undefined && d.subtypes.includes(e.subtype)))))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function TravelPlanner({ def, ship }: { def: TravelDef; ship?: Entity }) {
  const ctx = useCampaign();
  const roller = useDiceRoller();
  const meta = useMeta();
  const entities = useList("entities");
  const legs = useList("travel");
  const here = useMemo(() => whereIsShip(ctx), [ctx, legs, entities, meta]);
  const places = useMemo(() => destinationsOf(entities, def), [entities, def]);
  const subtypeName = (e: Entity) => ctx.module.entityType(e.type)?.subtypes?.find((s) => s.id === e.subtype)?.name ?? e.subtype ?? "";
  const groups = useMemo(() => {
    const out = new Map<string, Entity[]>();
    for (const p of places) {
      const k = subtypeName(p) || "Places";
      out.set(k, [...(out.get(k) ?? []), p]);
    }
    return [...out.entries()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places]);

  const optionsProcedure = useMemo(() => ({ inputs: def.options ?? { type: "object", properties: {} } }) as unknown as Procedure, [def]);
  const [from, setFrom] = useState<Id | undefined>(here?.id);
  const [to, setTo] = useState<Id | undefined>();
  const [distance, setDistance] = useState("");
  const [days, setDays] = useState("");
  const [options, setOptions] = useState<Record<string, unknown>>(() => initialInputs(optionsProcedure, ctx.store, ctx.module));
  const [arrived, setArrived] = useState<TravelLeg | undefined>();
  const origin = from ?? here?.id;

  const plan = useMemo((): { plan?: TravelPlan; error?: string } => {
    if (!to) return {};
    try {
      return {
        plan: planTravel(ctx.store, ctx.module.module, {
          to,
          distance: Number(distance) || 0,
          options,
          ...(origin ? { from: origin } : {}),
          ...(ship ? { ship: ship.id } : {}),
          ...(days.trim() !== "" && Number.isFinite(Number(days)) ? { days: Number(days) } : {}),
        }),
      };
    } catch (e) {
      return { error: errorMessage(e) };
    }
  }, [ctx, to, distance, options, origin, ship, days, entities]);

  const chooseDestination = (id: string) => {
    setTo(id || undefined);
    setArrived(undefined);
    const known = id ? knownDistance(ctx.store, origin, id) : undefined;
    setDistance(known !== undefined ? String(known) : "");
  };

  /** Departing rolls the arrival checks: in the app, or with the dice rolled at the table. */
  const departRequest = (): RollRequest | undefined => {
    if (!to || !plan.plan || plan.plan.blocked) return undefined;
    const input = {
      to,
      distance: Number(distance) || 0,
      options,
      ...(origin ? { from: origin } : {}),
      ...(days.trim() !== "" && Number.isFinite(Number(days)) ? { days: Number(days) } : {}),
    };
    const destination = places.find((pl) => pl.id === to)?.name ?? "the destination";
    return {
      title: `Arrival at ${destination}`,
      run: travelArrivalRun(ctx.store, ctx.module.module, { ...input, ...(ship ? { ship: ship.id } : {}) }),
      perform: (entered) => {
        const res = departShip(ctx, { ...input, seed: newSeed(), ...(entered ? { entered } : {}) });
        setArrived(res.leg);
        setFrom(res.leg.to);
        setTo(undefined);
        setDistance("");
        setDays("");
        pushToast(`Arrived at ${res.leg.toName}${res.leg.arriveDate ? ` on ${res.leg.arriveDate}` : ""}.`, { tone: "success" });
      },
    };
  };
  const depart = (enter = false) => {
    try {
      const req = departRequest();
      if (req) (enter ? roller.enter : roller.roll)(req);
    } catch (e) {
      pushToast(`Could not depart: ${errorMessage(e)}`, { tone: "danger" });
    }
  };

  const p = plan.plan;
  return (
    <Card title="Travel planner" subtitle={here ? `At ${here.name}${meta.currentDate ? ` · ${meta.currentDate}` : ""}` : meta.currentDate} data-testid="travel-planner">
      <div className="app-stack">
        <div className="app-form__row">
          <label className="app-label">
            <span>From</span>
            <select className="cf-select" aria-label="From" value={origin ?? ""} onChange={(e) => setFrom(e.target.value || undefined)}>
              <option value="">Unknown</option>
              {places.map((pl) => (
                <option key={pl.id} value={pl.id}>
                  {pl.name}
                </option>
              ))}
            </select>
          </label>
          <label className="app-label">
            <span>Destination</span>
            <select className="cf-select" aria-label="Destination" value={to ?? ""} onChange={(e) => chooseDestination(e.target.value)} data-testid="travel-destination">
              <option value="">Choose a destination</option>
              {groups.map(([group, list]) => (
                <optgroup key={group} label={group}>
                  {list
                    .filter((pl) => pl.id !== origin)
                    .map((pl) => (
                      <option key={pl.id} value={pl.id}>
                        {pl.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="app-label">
            <span>
              Distance ({def.distance.plural}) <PageRef page={def.distance.page} />
            </span>
            <input className="cf-input cf-mono" type="number" min={0} step="any" aria-label="Distance" value={distance} onChange={(e) => setDistance(e.target.value)} data-testid="travel-distance" />
          </label>
          <label className="app-label">
            <span>Days (your own figure)</span>
            <input className="cf-input cf-mono" type="number" min={0} step={1} aria-label="Days override" placeholder="by the rule" value={days} onChange={(e) => setDays(e.target.value)} />
          </label>
        </div>
        {def.distance.help && <p className="cf-muted">{def.distance.help}</p>}
        {plan.error && <p className="app-note app-note--warning">{plan.error}</p>}
        {p && (
          <div className="ship-plan" data-testid="travel-plan">
            <p className="ship-plan__summary">
              <strong data-testid="travel-days">{p.days} days</strong> · {p.summary}
              {meta.currentDate && !p.blocked && <span className="cf-muted"> · arrive {addDaysToDate(ctx.module.module.calendar, meta.currentDate, p.days)}</span>}
            </p>
            {p.blocked && (
              <p className="app-note app-note--warning" role="alert">
                {p.blocked}
              </p>
            )}
            {p.checks.length > 0 && (
              <ul className="app-list" aria-label="Checks on the way" data-testid="travel-checks">
                {p.checks.map((c) => (
                  <li key={c.id} className="app-list__row">
                    <Badge tone={c.when === "arrival" ? "accent" : "muted"}>{c.when}</Badge>
                    <span>
                      {c.label}
                      {c.dice && c.count > 1 ? ` (${c.count} × ${c.dice})` : c.dice ? ` (${c.dice})` : ""}
                    </span>
                    <PageRef page={c.page} />
                  </li>
                ))}
              </ul>
            )}
            {p.notes.length > 0 && (
              <ul className="app-bullets cf-muted">
                {p.notes.map((n, i) => (
                  <li key={i}>
                    {n.text} <PageRef page={n.page} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {def.options && <InputForm properties={inputProperties(optionsProcedure)} value={options} onChange={setOptions} store={ctx.store} module={ctx.module} />}
        <div className="app-row">
          <Button variant="primary" disabled={!p || !!p.blocked} onClick={() => depart()} data-testid="depart">
            Depart
          </Button>
          {!roller.physical && p && !p.blocked && p.checks.some((c) => c.dice) && (
            <Button variant="ghost" onClick={() => depart(true)} data-testid="depart-enter" title="Depart and type the arrival dice rolled at the table">
              Depart, enter dice
            </Button>
          )}
          {!ship && <span className="cf-muted">Choose the crew's ship to plan a trip.</span>}
        </div>
        {arrived && <LegDetail leg={arrived} open />}
      </div>
    </Card>
  );
}

export function LegDetail({ leg, open }: { leg: TravelLeg; open?: boolean }) {
  return (
    <details className="ship-leg" open={open} data-testid="travel-leg">
      <summary>
        <span className="cf-mono">{leg.departDate ?? "?"}</span> → <span className="cf-mono">{leg.arriveDate ?? "?"}</span>: {leg.fromName ?? "?"} to <strong>{leg.toName}</strong>
        <span className="cf-muted">
          {" "}
          · {leg.days} days{leg.summary ? ` · ${leg.summary}` : ""}
        </span>
      </summary>
      {leg.log && leg.log.length > 0 && (
        <ul className="app-bullets" data-testid="arrival-log">
          {leg.log.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
      {leg.entered ? (
        <p className="cf-muted cf-small" data-testid="travel-entered">
          <Badge tone="accent">entered</Badge> Rolled at the table: <span className="cf-mono">{leg.entered.join(" ") || "no dice"}</span>
          {leg.effectsApplied ? " · effects applied" : ""}
        </p>
      ) : (
        leg.seed && (
          <p className="cf-muted cf-small">
            Seed <span className="cf-mono">{leg.seed}</span>
            {leg.effectsApplied ? " · effects applied" : ""}
          </p>
        )
      )}
    </details>
  );
}

export function TravelLog({ shipId }: { shipId?: Id }) {
  const ctx = useCampaign();
  const legs = useList("travel");
  const log = useMemo(() => travelLog(ctx.store, shipId ? { ship: shipId } : {}).reverse(), [ctx.store, shipId, legs]);
  return (
    <Card title="Travel log" data-testid="travel-log">
      {log.length === 0 ? (
        <p className="cf-muted">No trips logged yet.</p>
      ) : (
        <div className="app-stack">
          {log.map((leg) => (
            <LegDetail key={leg.id} leg={leg} />
          ))}
        </div>
      )}
    </Card>
  );
}
