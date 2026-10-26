/**
 * `/generate/$procedureId`: the generator workbench. Inputs from the
 * procedure's JSON Schema, a seed, every step with its rolls, per-step
 * re-roll, pin and "enter roll" (dice rolled at the table, one step or the
 * whole run step by step), a preview of what will be created, accept into
 * the campaign, chained procedures and recent runs.
 */
import { loadAdventureSnapshot, plainText, type GeneratorRun, type Id } from "@campaign-forge/core";
import { isDieRequest, probeDice, type AgendaDraftCharacter, type GeneratedGraph, type Procedure, type RollRecord } from "@campaign-forge/module-sdk";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, PageRef, pushToast } from "../../components/ui";
import { errorMessage, relativeTime } from "../../lib/format";
import { acceptGenerated } from "../../state/prepActions";
import { useCampaign, useList, useMeta } from "../../state/hooks";
import { InputForm } from "./InputForm";
import { AgendaAccept, AgendaDraftCards, agendaDraftsOf, AgendaReportCard, type AgendaEdits } from "./AgendaDrafts";
import { initialInputs, inputProperties, isAdventureInput, pickedInputs } from "./prefill";
import { PreviewPanel } from "./PreviewPanel";
import { ResultsPanel } from "./ResultsPanel";
import { changedSteps, contextFromRun, newSeed, requestFromRun, runGenerator, stepRun, stepViews, withoutDependentDice, type GeneratorRequest } from "./runner";
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
    const docText = (id: Id) => (ctx.registry.has(id) ? plainText(ctx.registry.open(id)) : "");
    const picked = pickedInputs(procedure, ctx.store, search.pick, docText);
    const inputs0 = initialInputs(procedure, ctx.store, ctx.module, { docText, picked });
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
  const [stepDice, setStepDice] = useState<Record<string, number[]>>(initial.request.stepDice ?? {});
  /** Steps waiting for dice rolled at the table, the first one shown (one step, or the whole run step by step). */
  const [enterQueue, setEnterQueue] = useState<string[]>([]);
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
  /** One part of a step re-rolled or pinned on its own (agenda slots). */
  const [partSeeds, setPartSeeds] = useState<Record<string, string>>(initial.request.partSeeds ?? {});
  const [pinnedParts, setPinnedParts] = useState<Record<string, unknown>>(initial.request.pinnedParts ?? {});
  /** The GM's own text for agenda drafts. */
  const [edits, setEdits] = useState<AgendaEdits>({});

  const outcome = useMemo((): { graph?: GeneratedGraph; error?: string } => {
    try {
      return { graph: runGenerator(ctx.module, { procedureId: procedure.id, seed, inputs, stepSeeds, stepDice, pinned, includeOptional, partSeeds, pinnedParts }) };
    } catch (e) {
      return { error: errorMessage(e) };
    }
  }, [ctx.module, procedure.id, seed, inputs, stepSeeds, stepDice, pinned, includeOptional, partSeeds, pinnedParts]);
  const graph = outcome.graph;
  const drafts = useMemo(() => agendaDraftsOf(graph), [graph]);

  // An adventure input reads the adventure's rich text (its hidden situation) once the docs have loaded.
  const adventureKeys = useMemo(() => Object.entries(inputProperties(procedure)).filter(([, s]) => isAdventureInput(s)).map(([k]) => k), [procedure]);
  const adventureIds = adventureKeys.map((k) => (inputs[k] as { id?: string } | undefined)?.id ?? "").join("|");
  useEffect(() => {
    if (adventureKeys.length === 0 || initial.restoredFrom) return;
    let alive = true;
    void (async () => {
      for (const key of adventureKeys) {
        const id = (inputs[key] as { id?: unknown } | undefined)?.id;
        if (typeof id !== "string") continue;
        const snap = await loadAdventureSnapshot(ctx.store, ctx.registry, id, ctx.whenDocSynced).catch(() => undefined);
        if (!alive || !snap) continue;
        setInputs((cur) => ((cur[key] as { id?: unknown } | undefined)?.id === id && JSON.stringify(cur[key]) !== JSON.stringify(snap) ? { ...cur, [key]: snap } : cur));
      }
    })();
    return () => {
      alive = false;
    };
    // re-read when another adventure is picked
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adventureIds]);

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
    setStepDice((d) => withoutDependentDice(procedure, d, stepId, true));
    setStepSeeds((s) => ({ ...s, [stepId]: newSeed() }));
  };
  // Dice rolled at the table: a step takes the typed faces; steps that read it re-run (their own typed dice are dropped).
  const entering = enterQueue[0];
  const enterRun = useMemo(
    () => (entering ? stepRun(ctx.module, { procedureId: procedure.id, seed, inputs, stepSeeds, stepDice, pinned, includeOptional }, entering) : undefined),
    [ctx.module, procedure.id, entering, seed, inputs, stepSeeds, stepDice, pinned, includeOptional],
  );
  const enterStep = (stepId: string, faces: number[]) => {
    setCompareTo(graph);
    setAccepted(undefined);
    setPinned((p) => {
      const n = { ...p };
      delete n[stepId];
      return n;
    });
    setStepDice((d) => ({ ...withoutDependentDice(procedure, d, stepId), [stepId]: faces }));
    setEnterQueue((q) => q.slice(1));
  };
  const clearEntered = (stepId: string) => {
    setCompareTo(graph);
    setStepDice((d) => withoutDependentDice(procedure, d, stepId, true));
  };
  /** Steps that roll dice (so they can take dice rolled at the table); a step that only picks names from lists does not. */
  const diceSteps = useMemo(() => {
    const req: GeneratorRequest = { procedureId: procedure.id, seed, inputs, stepSeeds, stepDice, pinned, includeOptional };
    const out = new Set<string>();
    if (!graph) return out;
    for (const s of steps) if (s.state === "rolled" && probeDice(stepRun(ctx.module, req, s.id)).requests.some(isDieRequest)) out.add(s.id);
    return out;
    // the steps follow the graph
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);
  /** Enter dice for every step that rolls, in order (pinned and skipped steps are left alone). */
  const enterWholeRun = () => setEnterQueue(steps.filter((s) => diceSteps.has(s.id)).map((s) => s.id));
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
    setStepDice({});
    // pinned slots stay; re-rolled ones roll with the new seed
    setPartSeeds({});
    setSeed(newSeed());
  };
  const partControls = {
    partSeeds,
    pinnedParts,
    onReroll: (key: string) => {
      setCompareTo(graph);
      setPartSeeds((p) => ({ ...p, [key]: newSeed() }));
    },
    onPin: (key: string) => {
      if (!graph?.parts || !Object.prototype.hasOwnProperty.call(graph.parts, key)) return;
      const value = graph.parts[key];
      setPinnedParts((p) => ({ ...p, [key]: value }));
    },
    onUnpin: (key: string) =>
      setPinnedParts((p) => {
        const n = { ...p };
        delete n[key];
        return n;
      }),
  };
  /** Lock (or free) a character's arc: the input the drafts name for it. */
  const lockArc = (c: AgendaDraftCharacter) => {
    const lock = c.lock;
    if (!lock) return;
    setCompareTo(graph);
    setInputs((cur) => {
      const next: Record<string, unknown> = JSON.parse(JSON.stringify(cur));
      let node: unknown = next;
      for (const seg of lock.path.slice(0, -1)) node = (node as Record<string | number, unknown> | undefined)?.[seg];
      const last = lock.path[lock.path.length - 1];
      if (node && typeof node === "object" && last !== undefined) (node as Record<string | number, unknown>)[last] = lock.locked ? "random" : lock.value;
      return next;
    });
  };
  const editDraft = (key: string, text: string | undefined) =>
    setEdits((e) => {
      const next = { ...e };
      if (text === undefined) delete next[key];
      else next[key] = text;
      return next;
    });
  const adventureId = adventureKeys.map((k) => (inputs[k] as { id?: string } | undefined)?.id).find((x): x is string => typeof x === "string");

  const accept = () => {
    if (!graph) return;
    try {
      const res = acceptGenerated(ctx, { graph, stepSeeds, pinned, names, within, partSeeds, pinnedParts });
      setEnterQueue([]);
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

      <div className={`prep-workbench__grid${drafts ? " has-agendas" : ""}`}>
        <div className="app-stack prep-workbench__main">
          <Card title="Inputs">
            <div className="app-stack">
              <InputForm
                properties={inputProperties(procedure)}
                value={inputs}
                onChange={edit(setInputs)}
                store={ctx.store}
                module={ctx.module}
                docText={(id) => (ctx.registry.has(id) ? plainText(ctx.registry.open(id)) : "")}
              />
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
                {Object.keys(partSeeds).length > 0 && <Badge tone="accent">{Object.keys(partSeeds).length} slots re-rolled</Badge>}
                {Object.keys(pinnedParts).length > 0 && <Badge tone="warning">{Object.keys(pinnedParts).length} slots pinned</Badge>}
                {Object.keys(stepDice).length > 0 && (
                  <Badge tone="accent" data-testid="entered-steps">
                    {Object.keys(stepDice).length} entered
                  </Badge>
                )}
                <Button variant="ghost" onClick={enterWholeRun} disabled={diceSteps.size === 0} data-testid="enter-whole-run" title="Type the dice rolled at the table for each step, in order">
                  Enter dice for every step
                </Button>
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
            <div className="app-note app-note--warning" role="alert">
              <p>The procedure could not run with these inputs: {outcome.error}</p>
              {Object.keys(stepDice).length > 0 && (
                <Button size="sm" onClick={() => setStepDice({})}>
                  Forget the entered dice
                </Button>
              )}
            </div>
          ) : (
            drafts && (
              <>
                {drafts.report && <AgendaReportCard report={drafts.report} />}
                <AgendaDraftCards drafts={drafts} controls={partControls} edits={edits} onEdit={editDraft} onLock={lockArc} />
              </>
            )
          )}
          {!outcome.error && (
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
                entering={entering && enterRun ? { stepId: entering, run: enterRun, remaining: enterQueue.length } : undefined}
                canEnter={diceSteps}
                dice={ctx.module.module.dice.dice}
                onEnter={(stepId) => setEnterQueue([stepId])}
                onEntered={enterStep}
                onSkipEnter={() => setEnterQueue((q) => q.slice(1))}
                onCancelEnter={() => setEnterQueue([])}
                onClearEntered={clearEntered}
              />
            </section>
          )}
        </div>

        <aside className="app-stack prep-workbench__side">
          {graph && drafts ? (
            <>
              <AgendaAccept drafts={drafts} edits={edits} graph={graph} adventureId={adventureId} run={{ stepSeeds, pinned, partSeeds, pinnedParts }} />
            </>
          ) : (
            <>
              {graph && <PreviewPanel graph={graph} names={names} onRename={(tempId, name) => setNames((n) => ({ ...n, [tempId]: name }))} />}
              <div className="app-row">
                <Button variant="primary" size="lg" disabled={!graph || !!accepted} onClick={accept} data-testid="accept">
                  {accepted ? "Accepted" : "Accept into campaign"}
                </Button>
              </div>
            </>
          )}
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
                {Object.keys(r.stepDice ?? {}).length > 0 && <Badge tone="accent">{Object.keys(r.stepDice ?? {}).length} entered</Badge>}
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
