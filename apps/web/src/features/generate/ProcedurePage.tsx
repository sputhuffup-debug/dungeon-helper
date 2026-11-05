/**
 * `/generate/$procedureId`: the generator workbench. Inputs from the
 * procedure's JSON Schema, a seed, every step with its rolls, per-step
 * re-roll, pin and "enter roll" (dice rolled at the table, one step or the
 * whole run step by step), a preview of what will be created, accept into
 * the campaign, chained procedures and recent runs.
 *
 * The page is the procedure's draft (core `GeneratorDraft`): a deal is kept
 * in the campaign as soon as it is dealt (the GM may have read it out at the
 * table), then the seed, inputs, re-rolls, pins, entered dice and the GM's
 * edits are saved as they change, so leaving and coming back (or reloading)
 * shows the same deal. A past run reopened (`?run=`) is kept once the GM
 * changes it (the run itself is already in the campaign). "New deal" deals
 * a fresh one. A search that asks for a run
 * (`?run=`, `?chainFrom=`, `?pick=`) starts a new draft unless the draft
 * already came from it; `?deal=` deals afresh and is dropped from the
 * address at once (the page stays as dealt). A kept draft remembers what the campaign
 * looked like when dealt (`GeneratorDraft.context`): reopened after the
 * campaign changed, the page says what changed and offers to read it again.
 * Once accepted, the main button is the next step and "Accept again" asks first.
 */
import { clearGeneratorDraft, draftIsOpen, generatorDraftOf, loadAdventureSnapshot, plainText, type ClockMove, type GeneratorDraft, type GeneratorDraftAccept, type GeneratorDraftInput, type GeneratorRun, type Id } from "@campaign-forge/core";
import { clueKindLabel, isDieRequest, probeDice, type AgendaDraftCharacter, type GeneratedGraph, type Procedure, type RollRecord } from "@campaign-forge/module-sdk";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Card, EmptyState, PageRef, pushToast } from "../../components/ui";
import { errorMessage, relativeTime } from "../../lib/format";
import { acceptGenerated } from "../../state/prepActions";
import { applyRunEffects, effectsToApply } from "../../state/runEffects";
import { useCampaign, useList, useMeta } from "../../state/hooks";
import { InputForm } from "./InputForm";
import { AgendaAccept, AgendaDraftCards, agendaDraftsOf, AgendaReportCard, type AgendaEdits } from "./AgendaDrafts";
import { LongAgendaAccept, LongAgendaDraftCards, type LongAgendaEdits } from "../agendas/LongAgendas";
import { longAgendaDraftsOf } from "../../state/longAgendaActions";
import { campaignContext, changedContext, initialInputs, inputProperties, isAdventureInput, pickedInputs, rereadInputs } from "./prefill";
import { PreviewPanel } from "./PreviewPanel";
import { describeEffect, EffectsPicker, isEffect, plainEffectsOf, ResultsPanel } from "./ResultsPanel";
import { crewShipDefOf, money } from "../../state/shipActions";
import { planNextSession, sortSessions } from "../../state/tableActions";
import { changedSteps, contextFromRun, newSeed, requestFromRun, runGenerator, stepRun, stepViews, withoutDependentDice, type DescribeValue, type GeneratorRequest } from "./runner";
import { StepList } from "./StepList";
import { ChainButtons } from "./ChainButtons";
import { OfferBoard } from "./OfferBoard";
import { offersOf, withoutPartsOf } from "../../state/offerActions";
import { arcsDefOf } from "../../state/arcActions";
import { ArcClockTicker } from "../arcs/ArcClockTicker";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { AcceptedActions } from "./AcceptedActions";
import { compactEdits, draftEditsOf, draftHasWork, draftSourceKey, writeDraft, type DraftEdits } from "../../state/draftActions";

interface ProcedureSearch {
  pick?: string;
  run?: string;
  chainFrom?: string;
  chain?: number;
  within?: string;
  deal?: string;
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
  return <KeyedWorkbench procedure={procedure} search={search} />;
}

/** The workbench, remounted for each new request; dropping a consumed `?deal=` from the address keeps the page as it is. */
function KeyedWorkbench({ procedure, search }: { procedure: Procedure; search: ProcedureSearch }) {
  const lastDeal = useRef<{ procedure: string; deal?: string }>({ procedure: procedure.id });
  if (lastDeal.current.procedure !== procedure.id) lastDeal.current = { procedure: procedure.id };
  if (search.deal) lastDeal.current.deal = search.deal;
  const key = `${procedure.id}|${search.run ?? ""}|${search.chainFrom ?? ""}|${search.chain ?? ""}|${search.within ?? ""}|${search.pick ?? ""}|${lastDeal.current.deal ?? ""}`;
  return <Workbench key={key} procedure={procedure} search={search} />;
}

interface Initial {
  request: GeneratorRequest;
  within?: Id;
  origin?: { run: GeneratorRun; label: string };
  restoredFrom?: GeneratorRun;
  /** The saved draft the page reopened (the same deal as the GM left it). */
  draft?: GeneratorDraft;
  /** What the search asked for (kept on the draft so the same request reopens it). */
  source?: string;
  pinnedRolls?: Record<string, RollRecord[]>;
  edits?: DraftEdits;
  accepted?: GeneratorDraftAccept;
  /** The campaign as the deal read it (`GeneratorDraft.context`). */
  context?: Record<string, string>;
  /** The campaign-filled inputs as the campaign stands now, and their fingerprints. */
  now: { inputs: Record<string, unknown>; context: Record<string, string> };
  /** An old draft nobody touched, read again from the campaign: dropped from the campaign on opening. */
  dropDraft?: boolean;
}

/** The chained procedure's label, when the search chains from a run. */
function chainOrigin(ctx: ReturnType<typeof useCampaign>, procedure: Procedure, search: ProcedureSearch): Initial["origin"] {
  if (search.chainFrom === undefined || search.chain === undefined) return undefined;
  const origin = ctx.store.get("generatorRuns", search.chainFrom);
  const chain = origin ? ctx.module.procedure(origin.procedure)?.chains?.[search.chain] : undefined;
  return origin && chain && chain.procedure === procedure.id ? { run: origin, label: chain.label } : undefined;
}

/** The page as the saved draft left it. */
function fromDraft(ctx: ReturnType<typeof useCampaign>, procedure: Procedure, draft: GeneratorDraft, search: ProcedureSearch, now: Initial["now"]): Initial {
  const request: GeneratorRequest = {
    procedureId: procedure.id,
    seed: draft.seed,
    inputs: structuredClone(draft.inputs ?? {}),
    stepSeeds: { ...(draft.stepSeeds ?? {}) },
    pinned: structuredClone(draft.pinned ?? {}),
    includeOptional: [...(draft.includeOptional ?? [])],
    ...(draft.stepDice ? { stepDice: structuredClone(draft.stepDice) } : {}),
    ...(draft.partSeeds ? { partSeeds: { ...draft.partSeeds } } : {}),
    ...(draft.pinnedParts ? { pinnedParts: structuredClone(draft.pinnedParts) } : {}),
  };
  const settings = ctx.store.meta().settings ?? {};
  // a draft from before drafts kept their campaign: what its own inputs read
  const context = draft.context ?? campaignContext(procedure, draft.inputs ?? {}, settings);
  const init: Initial = { request, draft, edits: draftEditsOf(draft), context, now };
  if (draft.within) init.within = draft.within;
  if (draft.source) init.source = draft.source;
  if (draft.pinnedRolls) init.pinnedRolls = structuredClone(draft.pinnedRolls);
  // the accept still counts while its run is in the campaign
  if (draft.accepted && ctx.store.has("generatorRuns", draft.accepted.run)) init.accepted = draft.accepted;
  const origin = chainOrigin(ctx, procedure, search);
  if (origin) init.origin = origin;
  if (search.run) {
    const run = ctx.store.get("generatorRuns", search.run);
    if (run && run.procedure === procedure.id) init.restoredFrom = run;
  }
  return init;
}

function useInitial(procedure: Procedure, search: ProcedureSearch): Initial {
  const ctx = useCampaign();
  return useMemo(() => {
    const source = draftSourceKey(search);
    const existing = generatorDraftOf(ctx.store, procedure.id);
    const docText = (id: Id) => (ctx.registry.has(id) ? plainText(ctx.registry.open(id)) : "");
    const picked = pickedInputs(procedure, ctx.store, search.pick, docText);
    const inputs0 = initialInputs(procedure, ctx.store, ctx.module, { docText, picked });
    const now = { inputs: inputs0, context: campaignContext(procedure, inputs0, ctx.store.meta().settings ?? {}) };
    const mine = !search.deal && existing && (source === undefined || existing.source === source) ? existing : undefined;
    // an old draft nobody touched from before drafts kept their campaign: read the campaign again, same seed (kept again as dealt)
    const untouched = mine && !mine.context && !draftHasWork(mine) && !mine.accepted;
    // reopen the draft unless a fresh deal was asked for, or the search asks for something the draft did not come from
    if (mine && !untouched) return fromDraft(ctx, procedure, mine, search, now);
    const withSource = (init: Initial): Initial => ({ ...init, ...(source ? { source } : {}), ...(untouched ? { dropDraft: true } : {}) });
    const base: GeneratorRequest = { procedureId: procedure.id, seed: untouched ? mine.seed : newSeed(), inputs: inputs0, stepSeeds: {}, pinned: {}, includeOptional: [] };
    if (search.run) {
      const run = ctx.store.get("generatorRuns", search.run);
      if (run && run.procedure === procedure.id) {
        const pinnedRolls: Record<string, RollRecord[]> = {};
        for (const id of Object.keys(run.pinned ?? {})) pinnedRolls[id] = run.rolls.filter((r) => r.step === id);
        return withSource({ request: requestFromRun(procedure, run), restoredFrom: run, pinnedRolls, context: now.context, now });
      }
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
        const init: Initial = { request: { ...base, inputs }, origin: { run: origin, label: chain.label }, context: now.context, now };
        if (within) init.within = within;
        return withSource(init);
      }
    }
    const init: Initial = { request: base, context: now.context, now };
    if (search.within) init.within = search.within;
    return withSource(init);
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
  const [pinnedRolls, setPinnedRolls] = useState<Record<string, RollRecord[]>>(() => initial.pinnedRolls ?? {});
  const [includeOptional, setIncludeOptional] = useState<string[]>(initial.request.includeOptional ?? []);
  const [names, setNames] = useState<Record<string, string>>(initial.edits?.names ?? {});
  const [within, setWithin] = useState<Id | undefined>(initial.within);
  const [compareTo, setCompareTo] = useState<GeneratedGraph | undefined>();
  /** The accept the draft records (the run, when, what the page shows about it); cleared when the run changes. */
  const [acceptMark, setAcceptMark] = useState<GeneratorDraftAccept | undefined>(initial.accepted);
  const accepted = useMemo(() => (acceptMark ? ctx.store.get("generatorRuns", acceptMark.run) : undefined), [ctx.store, acceptMark]);
  const setAccepted = (v: undefined) => setAcceptMark(v);
  /** One part of a step re-rolled or pinned on its own (agenda slots). */
  const [partSeeds, setPartSeeds] = useState<Record<string, string>>(initial.request.partSeeds ?? {});
  const [pinnedParts, setPinnedParts] = useState<Record<string, unknown>>(initial.request.pinnedParts ?? {});
  /** The GM's own text for agenda drafts. */
  const [edits, setEdits] = useState<AgendaEdits>(initial.edits?.agenda ?? {});
  /** The GM's own text for long-term agenda drafts (goal summary and beat per character). */
  const [longEdits, setLongEdits] = useState<LongAgendaEdits>((initial.edits?.longAgenda as LongAgendaEdits | undefined) ?? {});
  /** Effects the GM unticked before accepting (by index in the run's effects); what accepting applied. */
  const [unticked, setUnticked] = useState<Set<number>>(() => new Set(initial.edits?.unticked ?? []));
  const appliedNow = Array.isArray(acceptMark?.detail?.applied) ? (acceptMark.detail.applied as number[]) : undefined;
  /** Between jobs: the thread clocks move when the run is accepted (the GM can leave them be). */
  const [clockSeed, setClockSeed] = useState(() => initial.edits?.clockSeed ?? newSeed());
  const [moveClocks, setMoveClocks] = useState(initial.edits?.moveClocks ?? true);
  const clocksMoved = Array.isArray(acceptMark?.detail?.clocks) ? (acceptMark.detail.clocks as ClockMove[]) : undefined;
  const [askNewDeal, setAskNewDeal] = useState(false);
  /** What the campaign looked like to this deal (kept on the draft). */
  const [context, setContext] = useState<Record<string, string> | undefined>(initial.context);

  const outcome = useMemo((): { graph?: GeneratedGraph; error?: string } => {
    try {
      return { graph: runGenerator(ctx.module, { procedureId: procedure.id, seed, inputs, stepSeeds, stepDice, pinned, includeOptional, partSeeds, pinnedParts }) };
    } catch (e) {
      return { error: errorMessage(e) };
    }
  }, [ctx.module, procedure.id, seed, inputs, stepSeeds, stepDice, pinned, includeOptional, partSeeds, pinnedParts]);
  const graph = outcome.graph;
  const drafts = useMemo(() => agendaDraftsOf(graph), [graph]);
  const longDrafts = useMemo(() => (procedure.longAgendas ? longAgendaDraftsOf(graph) : undefined), [graph, procedure.longAgendas]);
  const offers = useMemo(() => (procedure.offers ? offersOf(graph) : undefined), [graph, procedure.offers]);
  const offerKeys = useMemo(() => offers?.offers.map((o) => o.key), [offers]);

  // The draft: saved to the campaign once the GM changes the deal (at once), then as the page changes (a moment later) and on leaving.
  const draftInput = useMemo((): GeneratorDraftInput => {
    const nonEmpty = <T extends object>(v: T | undefined): T | undefined => (v && Object.keys(v).length > 0 ? v : undefined);
    const draftEdits = compactEdits({ agenda: edits, longAgenda: longEdits, names, unticked: [...unticked].sort((a, b) => a - b), moveClocks, ...(clockSeed ? { clockSeed } : {}) });
    const out: GeneratorDraftInput = { procedure: procedure.id, moduleId: ctx.module.manifest.id, moduleVersion: ctx.module.manifest.version, seed, inputs };
    const opt = { stepSeeds: nonEmpty(stepSeeds), stepDice: nonEmpty(stepDice), pinned: nonEmpty(pinned), pinnedRolls: nonEmpty(pinnedRolls), partSeeds: nonEmpty(partSeeds), pinnedParts: nonEmpty(pinnedParts), includeOptional: includeOptional.length ? includeOptional : undefined, within, edits: draftEdits, source: initial.source, offerKeys: offerKeys?.length ? offerKeys : undefined, accepted: acceptMark, context };
    for (const [k, v] of Object.entries(opt)) if (v !== undefined) (out as unknown as Record<string, unknown>)[k] = v;
    return out;
  }, [procedure.id, ctx.module, seed, inputs, stepSeeds, stepDice, pinned, pinnedRolls, partSeeds, pinnedParts, includeOptional, within, edits, longEdits, names, unticked, moveClocks, clockSeed, initial.source, offerKeys, acceptMark, context]);
  const pendingSave = useRef<(() => void) | undefined>(undefined);
  /** The deal is in the campaign (a reopened draft, or one dealt here; a restored run once changed). */
  const kept = useRef(!!initial.draft);
  /** The deal as it opened (and as the page itself changed it, e.g. an adventure's text loading): changing it keeps the draft. */
  const baseline = useRef<string | undefined>(undefined);
  /** The page changed the inputs itself (not the GM): the baseline follows. */
  const pageChange = useRef(false);
  const lastAccept = useRef(acceptMark);
  const [saved, setSaved] = useState(!!initial.draft);
  const [isKept, setIsKept] = useState(!!initial.draft);
  /** Write the draft now (the first write replaces any older draft of the procedure); `extra` lands with it. */
  const keepNow = (extra: Partial<GeneratorDraftInput> = {}) => {
    pendingSave.current = undefined;
    try {
      writeDraft(ctx, { ...draftInput, ...extra }, { fresh: !kept.current });
      setSaved(true);
    } catch {
      // a campaign closed under the page: nothing to keep
      return;
    }
    if (!kept.current) {
      kept.current = true;
      setIsKept(true);
    }
  };
  useEffect(() => {
    // a fresh deal asked for: the draft it replaces goes; an old untouched one read afresh goes too
    if ((search.deal || initial.dropDraft) && !initial.draft) clearGeneratorDraft(ctx.store, procedure.id);
    // the request is dropped from the address (the page stays as it is), so a reload reopens what this deal becomes
    if (search.deal) {
      const { deal: _deal, ...rest } = search;
      void navigate({ to: "/c/$campaignId/generate/$procedureId", params: { campaignId, procedureId: procedure.id }, search: rest, replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const json = JSON.stringify(draftInput);
    if (baseline.current === undefined || pageChange.current) {
      const opening = baseline.current === undefined;
      baseline.current = json;
      pageChange.current = false;
      // a deal is kept as soon as it is dealt: coming back shows it as dealt, never a different one
      if (opening && !kept.current && !initial.restoredFrom) {
        lastAccept.current = acceptMark;
        keepNow();
      }
      return;
    }
    // a restored run is kept once the GM changes it
    if (!kept.current) {
      if (json === baseline.current) return;
      lastAccept.current = acceptMark;
      keepNow();
      return;
    }
    // an accept (or its mark cleared) is written at once: it is what the page says on coming back
    if (acceptMark !== lastAccept.current) {
      lastAccept.current = acceptMark;
      keepNow();
      return;
    }
    const write = () => keepNow();
    setSaved(false);
    pendingSave.current = write;
    const t = window.setTimeout(write, 300);
    return () => window.clearTimeout(t);
    // the draft follows the page's state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftInput]);
  useEffect(() => {
    const flush = () => pendingSave.current?.();
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);
  const liveDraft = useRecordDraft(procedure.id);

  // An adventure input reads the adventure's rich text (its hidden situation) once the docs have loaded.
  const adventureKeys = useMemo(() => Object.entries(inputProperties(procedure)).filter(([, s]) => isAdventureInput(s)).map(([k]) => k), [procedure]);
  const adventureIds = adventureKeys.map((k) => (inputs[k] as { id?: string } | undefined)?.id ?? "").join("|");
  useEffect(() => {
    if (adventureKeys.length === 0 || initial.restoredFrom || initial.draft) return;
    let alive = true;
    void (async () => {
      for (const key of adventureKeys) {
        const id = (inputs[key] as { id?: unknown } | undefined)?.id;
        if (typeof id !== "string") continue;
        const snap = await loadAdventureSnapshot(ctx.store, ctx.registry, id, ctx.whenDocSynced).catch(() => undefined);
        if (!alive || !snap) continue;
        setInputs((cur) => {
          if ((cur[key] as { id?: unknown } | undefined)?.id !== id || JSON.stringify(cur[key]) === JSON.stringify(snap)) return cur;
          // the page filled this in, not the GM: an untouched deal stays untouched
          if (!kept.current) pageChange.current = true;
          return { ...cur, [key]: snap };
        });
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
  const arcsDef = arcsDefOf(ctx.module, meta.mode);
  // a run that creates nothing but carries effects (shore leave, between jobs): accepting applies them
  const effectsRun = !!graph && graph.produced.entities.length === 0 && plainEffectsOf(graph.results).length > 0;
  const clocksWithRun = arcsDef?.tick && arcsDef.betweenJobs === procedure.id ? arcsDef : undefined;
  const isBetweenJobs = procedure.id === crewShipDefOf(ctx.module, meta.mode)?.betweenJobs || procedure.id === arcsDef?.betweenJobs;
  const toApply = effectsRun && graph ? effectsToApply(ctx.store, graph.results, unticked) : [];

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
      setAccepted(undefined);
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
  /** A whole offer re-rolled: its own seed is new, and its parts start afresh (pins stay). */
  const offerControls = {
    ...partControls,
    onRerollOffer: (key: string) => {
      setCompareTo(graph);
      setPartSeeds((p) => ({ ...withoutPartsOf(p, key), [key]: newSeed() }));
    },
  };
  /** Lock (or free) a character's arc: the input the drafts name for it. */
  const lockArc = (c: Pick<AgendaDraftCharacter, "lock">) => {
    const lock = c.lock;
    if (!lock) return;
    setCompareTo(graph);
    setAccepted(undefined);
    setInputs((cur) => {
      const next: Record<string, unknown> = JSON.parse(JSON.stringify(cur));
      let node: unknown = next;
      for (const seg of lock.path.slice(0, -1)) node = (node as Record<string | number, unknown> | undefined)?.[seg];
      const last = lock.path[lock.path.length - 1];
      if (node && typeof node === "object" && last !== undefined) (node as Record<string | number, unknown>)[last] = lock.locked ? "random" : lock.value;
      return next;
    });
  };
  const editDraft = (key: string, text: string | undefined) => {
    setAccepted(undefined);
    setEdits((e) => {
      const next = { ...e };
      if (text === undefined) delete next[key];
      else next[key] = text;
      return next;
    });
  };
  const adventureId = adventureKeys.map((k) => (inputs[k] as { id?: string } | undefined)?.id).find((x): x is string => typeof x === "string");

  const accept = () => {
    if (!graph) return;
    try {
      const res = acceptGenerated(ctx, { graph, stepSeeds, pinned, names, within, partSeeds, pinnedParts });
      setEnterQueue([]);
      const root = res.entities[0];
      if (root) {
        // the draft remembers the accept (written now, before the page leaves), so coming back says so
        const mark = { run: res.run.id, at: new Date().toISOString() };
        keepNow({ accepted: mark });
        lastAccept.current = mark;
        setAcceptMark(mark);
        pushToast(`Accepted ${res.entities.length} entit${res.entities.length === 1 ? "y" : "ies"} into the campaign.`, { tone: "success" });
        void navigate({ to: "/c/$campaignId/entities/$entityId", params: { campaignId, entityId: root.id } });
      } else {
        // one step: the ticked effects are applied and (between jobs) the clocks move with the run
        const done: string[] = [];
        const detail: Record<string, unknown> = {};
        if (effectsRun || clocksWithRun) {
          const out = applyRunEffects(ctx, res.run, { unticked, ...(clocksWithRun && moveClocks ? { clocks: { def: clocksWithRun, seed: clockSeed } } : {}) });
          if (effectsRun) detail.applied = out.applied;
          if (out.result) done.push(`${out.result.applied.length} effect${out.result.applied.length === 1 ? "" : "s"} applied${out.result.skipped.length ? `, ${out.result.skipped.length} skipped` : ""}`);
          if (clocksWithRun) detail.clocks = out.moved ?? [];
          const reached = (out.moved ?? []).flatMap((m) => m.reached).length;
          if (out.moved?.length) done.push(`clocks moved${reached ? ` (${reached} milestone${reached === 1 ? "" : "s"} reached)` : ""}`);
        }
        setAcceptMark({ run: res.run.id, at: new Date().toISOString(), ...(Object.keys(detail).length ? { detail } : {}) });
        pushToast(done.length ? `Run recorded: ${done.join("; ")}.` : "Run recorded.", { tone: "success" });
      }
    } catch (e) {
      pushToast(`Accept failed: ${errorMessage(e)}`, { tone: "danger" });
    }
  };

  /** Deal afresh: a new seed and inputs read from the campaign again (what the address asked for is kept). */
  const newDeal = () => {
    setAskNewDeal(false);
    pendingSave.current = undefined;
    // the deal on the page goes now, so leaving before changing the new one never brings it back
    clearGeneratorDraft(ctx.store, procedure.id);
    const { run: _run, deal: _deal, ...rest } = search;
    void navigate({ to: "/c/$campaignId/generate/$procedureId", params: { campaignId, procedureId: procedure.id }, search: { ...rest, deal: newSeed() }, replace: true });
  };
  const markAccepted = (runId: Id | undefined, detail: Record<string, unknown>) => {
    if (runId) setAcceptMark({ run: runId, at: new Date().toISOString(), detail });
  };
  /** What changed in the campaign since a reopened draft was dealt (nothing once accepted: that deal is done). */
  const staleInputs = useMemo(() => (initial.draft && !acceptMark ? changedContext(procedure, context, initial.now.context) : []), [initial.draft, initial.now.context, acceptMark, procedure, context]);
  /** Read the campaign again into the reopened draft: same seed, re-rolls, pins and edits; the campaign's inputs as they are now. */
  const reread = () => {
    setCompareTo(graph);
    setAccepted(undefined);
    setInputs((cur) => rereadInputs(procedure, cur, initial.now.inputs, ctx.store.meta().settings ?? {}));
    setContext(initial.now.context);
  };
  /** Slots the GM pinned (an offer taken or kept stays pinned on its own: not counted). */
  const gmPinnedParts = Object.keys(pinnedParts).filter((k) => !liveDraft?.offers?.[k]).length;
  const offersActed = offers ? offers.offers.filter((o) => liveDraft?.offers?.[o.key] && liveDraft.offers[o.key]!.as !== "discard").length : 0;
  const root = accepted?.produced[0] ? ctx.store.get("entities", accepted.produced[0]) : undefined;
  // effects in a step's result read as the Effects list does: names, money, no ids
  const describeStepValue: DescribeValue = (o) =>
    isEffect(o)
      ? describeEffect(
          o,
          (id) => ctx.store.get("entities", id)?.name ?? "someone",
          (id) => ctx.module.preset(id)?.name ?? id,
          (n) => money(ctx, n, { sign: true }),
        )
      : undefined;

  return (
    <div className="app-page prep-workbench" data-testid="workbench">
      <header className="app-page__header">
        <div>
          <p className="cf-muted">
            <Link to="/c/$campaignId/generate" params={{ campaignId }} className="app-link-strong">
              Generate
            </Link>{" "}
            / {procedure.name}
          </p>
          <h1 className="app-title">
            {procedure.name} <PageRef page={procedure.page} cite={procedure.cite} original={procedure.original} />
          </h1>
          {procedure.description && <p className="cf-muted prep-lead">{procedure.description}</p>}
        </div>
        <div className="app-stack prep-deal">
          <Button onClick={() => (draftHasWork(liveDraft) && !accepted ? setAskNewDeal(true) : newDeal())} data-testid="new-deal" title="Deal this procedure afresh: a new seed, inputs read from the campaign again. What you accepted stays.">
            New deal
          </Button>
          <span className="cf-muted app-small" data-testid="draft-status" data-state={!isKept ? "unkept" : saved ? "saved" : "saving"} title={isKept ? undefined : "A past run you have not changed is not kept as a draft: it stays in Recent runs."}>
            {!isKept ? "Kept once you change it" : saved ? "Draft kept in the campaign" : "Saving the draft…"}
          </span>
        </div>
      </header>
      <ConfirmDialog open={askNewDeal} title={`Deal a new ${procedure.name}?`} confirmLabel="New deal" danger onCancel={() => setAskNewDeal(false)} onConfirm={newDeal}>
        <p>
          The re-rolls, pins and edits on this deal go{offers ? `, and its open ${procedure.offers?.noun ?? "offer"}s with it` : ""}. What you already accepted or kept stays in the campaign.
        </p>
      </ConfirmDialog>

      {!inMode && <p className="app-note app-note--warning">This procedure is meant for another play mode; it still runs.</p>}
      {initial.draft && (
        <p className="app-note" data-testid="draft-note">
          {accepted
            ? `You accepted this deal ${relativeTime(acceptMark?.at ?? accepted.created)}. It is kept here as it was; “New deal” deals a fresh one.`
            : offers && offersActed > 0
              ? `The board you dealt ${relativeTime(initial.draft.created)}, as you left it: ${offersActed} of ${offers.offers.length} ${procedure.offers?.noun ?? "offer"}s taken or kept. “New deal” deals a fresh one.`
              : `Your draft from ${relativeTime(initial.draft.created)}, as you left it (seed ${initial.draft.seed}). “New deal” deals a fresh one.`}
        </p>
      )}
      {staleInputs.length > 0 && (
        <div className="app-note app-note--warning app-row" role="status" data-testid="draft-stale">
          <span className="app-grow">
            The campaign changed since this was dealt ({staleInputs.map((x) => x.title).join(", ")}); the deal still reads it as it was then.
          </span>
          <Button size="sm" variant="primary" onClick={reread} data-testid="draft-reread" title="Keep the seed, re-rolls, pins and your edits; read the campaign as it is now">
            Use the campaign as it is now
          </Button>
          <Button size="sm" onClick={() => (draftHasWork(liveDraft) ? setAskNewDeal(true) : newDeal())}>
            New deal
          </Button>
        </div>
      )}
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

      <div className={`prep-workbench__grid${drafts || longDrafts || offers ? " has-agendas" : ""}`}>
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
                arcsBoard={!!arcsDef?.boards?.includes(procedure.id)}
                clueKind={(k) => clueKindLabel(arcsDef, k)}
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
                {Object.keys(partSeeds).length > 0 && <Badge tone="accent">{Object.keys(partSeeds).length} slot{Object.keys(partSeeds).length === 1 ? "" : "s"} re-rolled</Badge>}
                {gmPinnedParts > 0 && (
                  <Badge tone="warning" data-testid="pinned-slots">
                    {gmPinnedParts} slot{gmPinnedParts === 1 ? "" : "s"} pinned
                  </Badge>
                )}
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
            <>
              {drafts && (
                <>
                  {drafts.report && <AgendaReportCard report={drafts.report} />}
                  <AgendaDraftCards drafts={drafts} controls={partControls} edits={edits} onEdit={editDraft} onLock={lockArc} />
                </>
              )}
              {offers && procedure.offers && graph && (
                <OfferBoard
                  procedure={procedure.id}
                  def={procedure.offers}
                  set={offers}
                  graph={graph}
                  controls={offerControls}
                  run={{ stepSeeds, pinned, partSeeds, pinnedParts }}
                  onBeforeAct={() => {
                    if (!kept.current) keepNow();
                  }}
                  onMarked={(keys) => {
                    setPinnedParts((p) => {
                      const n = { ...p };
                      for (const k of keys) if (graph.parts && Object.prototype.hasOwnProperty.call(graph.parts, k)) n[k] = graph.parts[k];
                      return n;
                    });
                    // what taking it changed in the campaign is the GM's own doing: not news when the board reopens
                    setContext(campaignContext(procedure, initialInputs(procedure, ctx.store, ctx.module, { docText: (id) => (ctx.registry.has(id) ? plainText(ctx.registry.open(id)) : ""), picked: pickedInputs(procedure, ctx.store, search.pick) }), ctx.store.meta().settings ?? {}));
                  }}
                />
              )}
              {longDrafts && procedure.longAgendas && (
                <>
                  {longDrafts.report && <AgendaReportCard report={longDrafts.report} title="No-betrayal check" />}
                  <LongAgendaDraftCards
                    def={procedure.longAgendas}
                    set={longDrafts}
                    controls={partControls}
                    edits={longEdits}
                    onEdit={(id, patch) => {
                      setAccepted(undefined);
                      setLongEdits((cur) => {
                        const n = { ...cur };
                        if (patch) n[id] = patch;
                        else delete n[id];
                        return n;
                      });
                    }}
                    onLock={lockArc}
                  />
                </>
              )}
            </>
          )}
          {!outcome.error && (
            <section aria-label="Steps" className="app-stack">
              <h2 className="app-subtitle">Steps</h2>
              <StepList
                describe={describeStepValue}
                tableName={(id) => ctx.module.table(id)?.name}
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
          {clocksWithRun ? (
            <ArcClockTicker
              def={clocksWithRun}
              linked={{
                seed: clockSeed,
                onReroll: () => setClockSeed(newSeed()),
                include: moveClocks,
                onInclude: setMoveClocks,
                ...(clocksMoved && accepted ? { moved: clocksMoved } : {}),
              }}
            />
          ) : (
            arcsDef && arcsDef.betweenJobs === procedure.id && <ArcClockTicker def={arcsDef} />
          )}
          {graph && drafts ? (
            <>
              <AgendaAccept drafts={drafts} edits={edits} graph={graph} adventureId={adventureId} run={{ stepSeeds, pinned, partSeeds, pinnedParts }} accepted={acceptMark} onAccepted={(id, d) => markAccepted(id, { ...d })} />
            </>
          ) : graph && longDrafts && procedure.longAgendas ? (
            <LongAgendaAccept def={procedure.longAgendas} set={longDrafts} edits={longEdits} graph={graph} run={{ stepSeeds, pinned, partSeeds, pinnedParts }} accepted={acceptMark} onAccepted={(id, d) => markAccepted(id, { ...d })} />
          ) : offers && procedure.offers ? (
            <Card title="Accepting">
              <p className="cf-muted app-small" data-testid="offers-accept-note">
                Accept each {procedure.offers.noun} on its own card: “{procedure.offers.accept.label}”{procedure.offers.keep ? ` or “${procedure.offers.keep.label}”` : ""}. Each adds its records to the campaign and a handout with only what the players read.
              </p>
            </Card>
          ) : (
            <>
              {graph && !effectsRun && <PreviewPanel graph={graph} names={names} onRename={(tempId, name) => setNames((n) => ({ ...n, [tempId]: name }))} />}
              {graph && effectsRun && !accepted && (
                <EffectsPicker
                  results={graph.results}
                  unticked={unticked}
                  onToggle={(i, on) =>
                    setUnticked((cur) => {
                      const n = new Set(cur);
                      if (on) n.delete(i);
                      else n.add(i);
                      return n;
                    })
                  }
                />
              )}
              {accepted ? (
                <AcceptedActions
                  note={
                    <p>
                      Accepted {relativeTime(acceptMark?.at ?? accepted.created)}
                      {accepted.produced.length ? `: ${accepted.produced.length} record${accepted.produced.length === 1 ? "" : "s"} in the campaign` : ""}.
                    </p>
                  }
                  onward={
                    root ? (
                      <Link to="/c/$campaignId/entities/$entityId" params={{ campaignId, entityId: root.id }} className="cf-btn cf-btn--primary cf-btn--lg" data-testid="accept-next">
                        Open {root.name}
                      </Link>
                    ) : undefined
                  }
                  again={
                    accepted.produced.length
                      ? `Accepting again creates another copy of every record this run makes (${accepted.produced.length}): duplicates of what is already in the campaign.`
                      : "Accepting again records the run a second time and applies its effects again (payments the ledger already holds are skipped): duplicates."
                  }
                  onAgain={accept}
                />
              ) : (
                <div className="app-row">
                  <Button variant="primary" size="lg" disabled={!graph} onClick={accept} data-testid="accept" className="prep-accept">
                    {effectsRun || clocksWithRun ? acceptLabel(toApply.length, !!clocksWithRun && moveClocks) : "Accept into campaign"}
                  </Button>
                </div>
              )}
            </>
          )}
          {accepted && !drafts && !longDrafts && !offers && (
            <>
              {accepted.produced.length === 0 && <ResultsPanel results={accepted.results} runId={accepted.id} {...(appliedNow ? { applied: appliedNow } : {})} />}
              {isBetweenJobs ? <NextAfterBetweenJobs run={accepted} /> : <ChainButtons run={accepted} />}
            </>
          )}
        </aside>
      </div>

      <RecentRuns procedure={procedure} draft={liveDraft} offerKeys={offerKeys} />
    </div>
  );
}

/** "Accept and apply 3 effects and move the clocks". */
function acceptLabel(effects: number, clocks: boolean): string {
  const parts = [effects ? `apply ${effects} effect${effects === 1 ? "" : "s"}` : "", clocks ? "move the clocks" : ""].filter(Boolean);
  return parts.length ? `Accept and ${parts.join(" and ")}` : "Accept into campaign";
}

/** After between jobs: deal the next board of offers (the arcs' board), the run's other chained procedures (shore leave), plan the next session; once each. */
function NextAfterBetweenJobs({ run }: { run: GeneratorRun }) {
  const ctx = useCampaign();
  const meta = useMeta();
  const navigate = useNavigate();
  const sessions = useList("sessions");
  const arcsDef = arcsDefOf(ctx.module, meta.mode);
  const board = arcsDef?.boards?.[0] ? ctx.module.procedure(arcsDef.boards[0]) : undefined;
  const next = sortSessions(sessions.filter((s) => s.status === "planned"))[0];
  // the next board is a fresh deal, not the board left from before the job
  const dealNonce = useMemo(() => newSeed(), []);
  return (
    <Card title="Next" subtitle="The crew is settled. Deal what comes next." data-testid="between-jobs-next">
      <div className="app-row">
        {board && (
          <Link to="/c/$campaignId/generate/$procedureId" params={{ campaignId: ctx.campaignId, procedureId: board.id }} search={{ deal: dealNonce }} className="cf-btn cf-btn--primary" data-testid="deal-next-board">
            Deal the next {board.name.toLowerCase()}
          </Link>
        )}
        {next ? (
          <Link to="/c/$campaignId/sessions/$sessionId" params={{ campaignId: ctx.campaignId, sessionId: next.id }} className="cf-btn" data-testid="plan-next-session">
            Plan the next session (Session {next.number})
          </Link>
        ) : (
          <Button
            onClick={() => {
              const s = planNextSession(ctx);
              void navigate({ to: "/c/$campaignId/sessions/$sessionId", params: { campaignId: ctx.campaignId, sessionId: s.id } });
            }}
            data-testid="plan-next-session"
          >
            Plan the next session
          </Button>
        )}
      </div>
      {/* the chained board would be a second "deal the next board" */}
      <ChainButtons run={run} {...(board ? { exclude: [board.id] } : {})} />
    </Card>
  );
}

/** The procedure's draft, live. */
function useRecordDraft(procedureId: string): GeneratorDraft | undefined {
  const ctx = useCampaign();
  const drafts = useList("generatorDrafts");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => generatorDraftOf(ctx.store, procedureId), [ctx.store, procedureId, drafts]);
}

function RecentRuns({ procedure, draft, offerKeys }: { procedure: Procedure; draft: GeneratorDraft | undefined; offerKeys: string[] | undefined }) {
  const ctx = useCampaign();
  const filter = useMemo(() => (r: GeneratorRun) => r.procedure === procedure.id, [procedure.id]);
  const runs = useList("generatorRuns", filter);
  const recent = useMemo(() => [...runs].sort((a, b) => (a.created < b.created ? 1 : -1)).slice(0, 10), [runs]);
  const openDraft = draft && draftIsOpen(draft, offerKeys) ? draft : undefined;
  const marked = Object.values(openDraft?.offers ?? {}).filter((o) => o.as !== "discard").length;
  return (
    <section className="app-section" aria-label="Recent runs">
      <h2 className="app-subtitle">Recent runs</h2>
      {recent.length === 0 && !openDraft ? (
        <p className="cf-muted">Drafts and accepted runs of this procedure are listed here with their seed.</p>
      ) : (
        <ul className="app-list" data-testid="recent-runs">
          {openDraft && (
            <li className="app-list__row" data-testid="recent-draft">
              <Badge tone="warning">Draft</Badge>
              <span className="cf-mono">{openDraft.seed}</span>
              <span className="cf-muted">
                {offerKeys?.length ? `${marked} of ${offerKeys.length} ${procedure.offers?.noun ?? "offer"}s taken or kept · ` : "not accepted · "}
                changed {relativeTime(openDraft.updated)}
              </span>
              <span className="cf-muted app-list__end">This page</span>
            </li>
          )}
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
