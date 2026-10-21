/**
 * `/generate/$procedureId`: the generator workbench. Inputs from the
 * procedure's JSON Schema, a seed, every step with its rolls, per-step
 * re-roll and pin, a preview of what will be created, accept into the
 * campaign, chained procedures and recent runs.
 */
import type { GeneratorRun, Id } from "@campaign-forge/core";
import type { GeneratedGraph, Procedure, RollRecord } from "@campaign-forge/module-sdk";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, PageRef, pushToast } from "../../components/ui";
import { errorMessage, relativeTime } from "../../lib/format";
import { acceptGenerated } from "../../state/prepActions";
import { useCampaign, useList, useMeta } from "../../state/hooks";
import { InputForm } from "./InputForm";
import { initialInputs, inputProperties, pickedInputs } from "./prefill";
import { PreviewPanel } from "./PreviewPanel";
import { ResultsPanel } from "./ResultsPanel";
import { changedSteps, contextFromRun, newSeed, requestFromRun, runGenerator, stepViews, type GeneratorRequest } from "./runner";
import { StepList } from "./StepList";
import { ChainButtons } from "./ChainButtons";

interface ProcedureSearch {
  pick?: string;
  run?: string;
  chainFrom?: string;
  chain?: number;
  within?: string;
}

export function ProcedurePage() {
  const { procedureId } = useParams({ from: "/c/$campaignId/generate/$procedureId" });
  const search = useSearch({ from: "/c/$campaignId/generate/$procedureId" });
  const ctx = useCampaign();
  const procedure = ctx.module.procedure(procedureId);
  if (!procedure) {
    return (
      <div className="app-page">
        <EmptyState
          title="Unknown procedure"
          text={`The ${ctx.module.manifest.name} module has no procedure “${procedureId}”.`}
          action={
            <Link to="/c/$campaignId/generate" params={{ campaignId: ctx.campaignId }} className="cf-btn">
              All generators
            </Link>
          }
        />
      </div>
    );
  }
  const key = `${procedureId}|${search.run ?? ""}|${search.chainFrom ?? ""}|${search.chain ?? ""}|${search.within ?? ""}|${search.pick ?? ""}`;
  return <Workbench key={key} procedure={procedure} search={search} />;
}

interface Initial {
  request: GeneratorRequest;
  within?: Id;
  origin?: { run: GeneratorRun; label: string };
  restoredFrom?: GeneratorRun;
}

function useInitial(procedure: Procedure, search: ProcedureSearch): Initial {
  const ctx = useCampaign();
  return useMemo(() => {
    const inputs0 = { ...initialInputs(procedure, ctx.store, ctx.module), ...pickedInputs(procedure, ctx.store, search.pick) };
    const base: GeneratorRequest = { procedureId: procedure.id, seed: newSeed(), inputs: inputs0, stepSeeds: {}, pinned: {}, includeOptional: [] };
    if (search.run) {
      const run = ctx.store.get("generatorRuns", search.run);
      if (run && run.procedure === procedure.id) return { request: requestFromRun(procedure, run), restoredFrom: run };
    }
    if (search.chainFrom !== undefined && search.chain !== undefined) {
      const origin = ctx.store.get("generatorRuns", search.chainFrom);
      const originProc = origin ? ctx.module.procedure(origin.procedure) : undefined;
      const chain = originProc?.chains?.[search.chain];
      if (origin && chain && chain.procedure === procedure.id) {
        let chained: Record<string, unknown> = {};
        try {
          chained = chain.inputs ? chain.inputs(contextFromRun(ctx.module, origin)) : {};
        } catch {
          chained = {};
        }
        const inputs = { ...base.inputs };
        for (const [k, v] of Object.entries(chained)) if (v !== undefined) inputs[k] = v;
        const within = search.within ?? origin.produced[0];
        const init: Initial = { request: { ...base, inputs }, origin: { run: origin, label: chain.label } };
        if (within) init.within = within;
        return init;
      }
    }
    const init: Initial = { request: base };
    if (search.within) init.within = search.within;
    return init;
    // computed once per mount (the page is keyed by its search)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

function Workbench({ procedure, search }: { procedure: Procedure; search: ProcedureSearch }) {
  const ctx = useCampaign();
  const meta = useMeta();
  const navigate = useNavigate();
  const campaignId = ctx.campaignId;
  const initial = useInitial(procedure, search);

  const [seed, setSeed] = useState(initial.request.seed);
  const [inputs, setInputs] = useState<Record<string, unknown>>(initial.request.inputs ?? {});
  const [stepSeeds, setStepSeeds] = useState<Record<string, string>>(initial.request.stepSeeds ?? {});
  const [pinned, setPinned] = useState<Record<string, unknown>>(initial.request.pinned ?? {});
  const [pinnedRolls, setPinnedRolls] = useState<Record<string, RollRecord[]>>(() => {
    const out: Record<string, RollRecord[]> = {};
    const run = initial.restoredFrom;
    if (run?.pinned) for (const id of Object.keys(run.pinned)) out[id] = run.rolls.filter((r) => r.step === id);
    return out;
  });
  const [includeOptional, setIncludeOptional] = useState<string[]>(initial.request.includeOptional ?? []);
  const [names, setNames] = useState<Record<string, string>>({});
  const [within, setWithin] = useState<Id | undefined>(initial.within);
  const [compareTo, setCompareTo] = useState<GeneratedGraph | undefined>();
  const [accepted, setAccepted] = useState<GeneratorRun | undefined>();

  const outcome = useMemo((): { graph?: GeneratedGraph; error?: string } => {
    try {
      return { graph: runGenerator(ctx.module, { procedureId: procedure.id, seed, inputs, stepSeeds, pinned, includeOptional }) };
    } catch (e) {
      return { error: errorMessage(e) };
    }
  }, [ctx.module, procedure.id, seed, inputs, stepSeeds, pinned, includeOptional]);
  const graph = outcome.graph;

  const steps = useMemo(() => stepViews(procedure, graph, { stepSeeds, pinned }), [procedure, graph, stepSeeds, pinned]);
  const changed = useMemo(() => changedSteps(compareTo, graph), [compareTo, graph]);
  const withinEntity = within ? ctx.store.get("entities", within) : undefined;
  const inMode = ctx.module.forMode(meta.mode).procedures.some((p) => p.id === procedure.id);

  const edit = <T,>(setter: (v: T) => void) => (v: T) => {
    setCompareTo(undefined);
    setAccepted(undefined);
    setter(v);
  };

  const reroll = (stepId: string) => {
    setCompareTo(graph);
    setAccepted(undefined);
    setStepSeeds((s) => ({ ...s, [stepId]: newSeed() }));
  };
  const resetStepSeed = (stepId: string) => {
    setCompareTo(graph);
    setStepSeeds((s) => {
      const n = { ...s };
      delete n[stepId];
      return n;
    });
  };
  const pin = (stepId: string) => {
    if (!graph) return;
    setPinned((p) => ({ ...p, [stepId]: graph.results[stepId] }));
    setPinnedRolls((r) => ({ ...r, [stepId]: graph.rolls.filter((x) => x.step === stepId) }));
  };
  const unpin = (stepId: string) => {
    setCompareTo(graph);
    setPinned((p) => {
      const n = { ...p };
      delete n[stepId];
      return n;
    });
  };
  const toggleOptional = (stepId: string, include: boolean) => {
    setCompareTo(undefined);
    setIncludeOptional((list) => (include ? [...new Set([...list, stepId])] : list.filter((x) => x !== stepId)));
  };
  const freshSeed = () => {
    setCompareTo(undefined);
    setAccepted(undefined);
    setStepSeeds({});
    setSeed(newSeed());
  };

  const accept = () => {
    if (!graph) return;
    try {
      const res = acceptGenerated(ctx, { graph, stepSeeds, pinned, names, within });
      const root = res.entities[0];
      if (root) {
        pushToast(`Accepted ${res.entities.length} entit${res.entities.length === 1 ? "y" : "ies"} into the campaign.`, { tone: "success" });
        void navigate({ to: "/c/$campaignId/entities/$entityId", params: { campaignId, entityId: root.id } });
      } else {
        setAccepted(res.run);
        pushToast("Run recorded.", { tone: "success" });
      }
    } catch (e) {
      pushToast(`Accept failed: ${errorMessage(e)}`, { tone: "danger" });
    }
  };

  return (
    <div className="app-page prep-workbench" data-testid="workbench">
      <header className="app-page__header">
        <div>
          <p className="cf-muted">
            <Link to="/c/$campaignId/generate" params={{ campaignId }} className="app-link-strong">
              Generate
            </Link>{" "}
            / {procedure.id}
          </p>
          <h1 className="app-title">
            {procedure.name} <PageRef page={procedure.page} cite={procedure.cite} original={procedure.original} />
          </h1>
          {procedure.description && <p className="cf-muted prep-lead">{procedure.description}</p>}
        </div>
      </header>

      {!inMode && <p className="app-note app-note--warning">This procedure is meant for another play mode; it still runs.</p>}
      {initial.restoredFrom && (
        <p className="app-note">
          Restored run from {relativeTime(initial.restoredFrom.created)} (seed <span className="cf-mono">{initial.restoredFrom.seed}</span>). Re-roll any step and accept to create new entities; the original run stays as it is.
        </p>
      )}
      {initial.origin && (
        <p className="app-note">
          Chained from {ctx.module.procedure(initial.origin.run.procedure)?.name ?? initial.origin.run.procedure}: {initial.origin.label}.
        </p>
      )}

      <div className="prep-workbench__grid">
        <div className="app-stack prep-workbench__main">
          <Card title="Inputs">
            <div className="app-stack">
              <InputForm properties={inputProperties(procedure)} value={inputs} onChange={edit(setInputs)} store={ctx.store} module={ctx.module} />
              <div className="app-row prep-seed">
                <label className="app-label">
                  <span>Seed</span>
                  <input className="cf-input cf-mono" aria-label="Seed" value={seed} onChange={(e) => edit(setSeed)(e.target.value)} data-testid="seed" />
                </label>
                <Button onClick={freshSeed} data-testid="new-seed">
                  New seed
                </Button>
                {Object.keys(stepSeeds).length > 0 && (
                  <span className="cf-muted">
                    {Object.keys(stepSeeds).length} step{Object.keys(stepSeeds).length === 1 ? "" : "s"} re-rolled
                  </span>
                )}
                {Object.keys(pinned).length > 0 && <Badge tone="warning">{Object.keys(pinned).length} pinned</Badge>}
              </div>
              {within && (
                <p className="app-row">
                  <span>
                    Results go within <strong>{withinEntity?.name ?? within}</strong>.
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => setWithin(undefined)}>
                    Don’t nest
                  </Button>
                </p>
              )}
            </div>
          </Card>

          {outcome.error ? (
            <p className="app-note app-note--warning" role="alert">
              The procedure could not run with these inputs: {outcome.error}
            </p>
          ) : (
            <section aria-label="Steps" className="app-stack">
              <h2 className="app-subtitle">Steps</h2>
              <StepList
                steps={steps}
                changed={changed}
                pinnedRolls={pinnedRolls}
                includeOptional={includeOptional}
                onReroll={reroll}
                onPin={pin}
                onUnpin={unpin}
                onResetSeed={resetStepSeed}
                onToggleOptional={toggleOptional}
              />
            </section>
          )}
        </div>

        <aside className="app-stack prep-workbench__side">
          {graph && <PreviewPanel graph={graph} names={names} onRename={(tempId, name) => setNames((n) => ({ ...n, [tempId]: name }))} />}
          <div className="app-row">
            <Button variant="primary" size="lg" disabled={!graph || !!accepted} onClick={accept} data-testid="accept">
              {accepted ? "Accepted" : "Accept into campaign"}
            </Button>
          </div>
          {accepted && (
            <>
              <ResultsPanel results={accepted.results} runId={accepted.id} />
              <ChainButtons run={accepted} />
            </>
          )}
        </aside>
      </div>

      <RecentRuns procedure={procedure} />
    </div>
  );
}

function RecentRuns({ procedure }: { procedure: Procedure }) {
  const ctx = useCampaign();
  const filter = useMemo(() => (r: GeneratorRun) => r.procedure === procedure.id, [procedure.id]);
  const runs = useList("generatorRuns", filter);
  const recent = useMemo(() => [...runs].sort((a, b) => (a.created < b.created ? 1 : -1)).slice(0, 10), [runs]);
  return (
    <section className="app-section" aria-label="Recent runs">
      <h2 className="app-subtitle">Recent runs</h2>
      {recent.length === 0 ? (
        <p className="cf-muted">Accepted runs of this procedure are listed here with their seed.</p>
      ) : (
        <ul className="app-list" data-testid="recent-runs">
          {recent.map((r) => {
            const first = r.produced[0] ? ctx.store.get("entities", r.produced[0]) : undefined;
            return (
              <li key={r.id} className="app-list__row">
                <span className="cf-mono">{r.seed}</span>
                {Object.keys(r.stepSeeds ?? {}).length > 0 && <Badge tone="accent">{Object.keys(r.stepSeeds ?? {}).length} re-rolled</Badge>}
                {first ? (
                  <Link to="/c/$campaignId/entities/$entityId" params={{ campaignId: ctx.campaignId, entityId: first.id }} className="app-link-strong">
                    {first.name}
                  </Link>
                ) : (
                  <span className="cf-muted">{r.produced.length ? `${r.produced.length} entities` : "no entities"}</span>
                )}
                <span className="cf-muted">{relativeTime(r.created)}</span>
                <Link
                  to="/c/$campaignId/generate/$procedureId"
                  params={{ campaignId: ctx.campaignId, procedureId: procedure.id }}
                  search={{ run: r.id }}
                  className="cf-btn cf-btn--sm cf-btn--ghost app-list__end"
                >
                  Re-open with this seed
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
