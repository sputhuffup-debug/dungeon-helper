/**
 * `/maps/new?generator=&adventure=&map=`: the site map workbench. Pick one
 * of the module's map generators, fill its brief (prefilled from an
 * adventure when one is given), set a seed and generate: the GM map
 * preview, the stages with "re-run this stage", attempts and the
 * validation checklist. Save the result to the campaign as a site map.
 * `map=` re-opens a saved generated map with its seed, brief and stage seeds.
 */
import { castMembers, type Adventure, type Entity, type Id, type SiteMap } from "@campaign-forge/core";
import type { MapGeneratorDef, MapGeneratorResult } from "@campaign-forge/module-sdk";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, PageRef, pushToast } from "../../components/ui";
import { adventureTitle, errorMessage, humanize } from "../../lib/format";
import { useCampaign, useList, useMeta } from "../../state/hooks";
import {
  adventurePrefill,
  findMapGenerator,
  generatedMapsOf,
  layoutDiff,
  mapGeneratorsFor,
  mapInputDefaults,
  requestFromMap,
  rerunStage,
  resetStage,
  runMapGenerator,
  saveGeneratedMap,
  type LayoutDiff,
  type MapGeneratorRequest,
} from "../../state/mapgenActions";
import { newSeed } from "../generate/runner";
import type { Schema } from "../generate/prefill";
import { BriefForm, enumLabel } from "./BriefForm";
import { MapPreview } from "./MapPreview";
import { ChecksPanel, StageList } from "./panels";
import "./mapgen.css";

export function MapGenPage() {
  const search = useSearch({ from: "/c/$campaignId/maps/new" });
  const ctx = useCampaign();
  const meta = useMeta();
  const navigate = useNavigate();
  const campaignId = ctx.campaignId;
  const generators = mapGeneratorsFor(ctx.module, meta.mode);
  const saved = search.map ? ctx.store.get("maps", search.map) : undefined;
  const adventureId = search.adventure ?? saved?.adventure;
  const adventure = adventureId ? ctx.store.get("adventures", adventureId) : undefined;
  const fallbackId = adventure ? generators.find((g) => g.inputsFromAdventure)?.id : undefined;
  const generatorId = search.generator ?? saved?.generator?.id ?? fallbackId ?? (generators.length === 1 ? generators[0]?.id : undefined);
  const generator = findMapGenerator(ctx.module, generatorId);
  const pick = (id: string) => void navigate({ to: "/c/$campaignId/maps/new", params: { campaignId }, search: { ...search, generator: id }, replace: true });

  return (
    <div className="app-page mapgen" data-testid="mapgen">
      <header className="app-page__header">
        <div>
          <p className="cf-muted">
            <Link to="/c/$campaignId/generate" params={{ campaignId }} className="app-link-strong">
              Generate
            </Link>{" "}
            / site map
          </p>
          <h1 className="app-title">
            {generator ? generator.name : "Generate a site map"} {generator && <PageRef page={generator.page} />}
          </h1>
          {generator?.description && <p className="cf-muted prep-lead">{generator.description}</p>}
        </div>
        {generators.length > 1 && (
          <label className="app-label">
            <span>Generator</span>
            <select className="cf-select" aria-label="Generator" value={generator?.id ?? ""} onChange={(e) => e.target.value && pick(e.target.value)} data-testid="generator-select">
              {!generator && <option value="">Choose…</option>}
              {generators.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>

      {generators.length === 0 && !generator ? (
        <EmptyState title="No map generators" text={`The ${ctx.module.manifest.name} module has no site map generators for this play mode.`} />
      ) : !generator ? (
        <ul className="app-cards" data-testid="map-generators">
          {generators.map((g) => (
            <li key={g.id}>
              <button type="button" className="prep-proc-card mapgen-pick" onClick={() => pick(g.id)} data-testid={`map-generator-${g.id}`}>
                <span className="prep-proc-card__head">
                  <strong>{g.name}</strong>
                  <PageRef page={g.page} />
                </span>
                {g.description && <span className="cf-muted">{g.description}</span>}
                <span className="app-row">
                  <Badge>{g.stages.length} stages</Badge>
                  {g.inputsFromAdventure && <Badge tone="accent">from adventure</Badge>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Workbench key={`${generator.id}|${adventureId ?? ""}|${saved?.id ?? ""}`} generator={generator} adventure={adventure} saved={saved?.generator?.id === generator.id ? saved : undefined} />
      )}
    </div>
  );
}

interface Run {
  request: MapGeneratorRequest;
  result?: MapGeneratorResult;
  error?: string;
  /** The stored layout of a re-opened map (not re-generated yet). */
  stored?: boolean;
  diff?: LayoutDiff;
}

function Workbench({ generator, adventure, saved }: { generator: MapGeneratorDef; adventure: Adventure | undefined; saved: SiteMap | undefined }) {
  const ctx = useCampaign();
  const navigate = useNavigate();
  const campaignId = ctx.campaignId;
  const fromSaved = saved ? requestFromMap(saved) : undefined;
  const prefillable = !!adventure && !!generator.inputsFromAdventure && !fromSaved;

  const [seed, setSeed] = useState(() => fromSaved?.seed ?? newSeed());
  const [inputs, setInputs] = useState<Record<string, unknown>>(() => fromSaved?.inputs ?? mapInputDefaults(generator));
  const [stageSeeds, setStageSeeds] = useState<Record<string, string>>(() => fromSaved?.stageSeeds ?? {});
  const [fromAdventure, setFromAdventure] = useState<string[]>([]);
  const [prefill, setPrefill] = useState<"idle" | "loading" | "done" | "error">(prefillable ? "loading" : "idle");
  const [prefillError, setPrefillError] = useState<string | undefined>();
  const [run, setRun] = useState<Run | undefined>(() =>
    saved?.layout && fromSaved ? { request: fromSaved, result: { layout: saved.layout, attempts: saved.generator?.attempts ?? 1 }, stored: true } : undefined,
  );
  const [rerun, setRerun] = useState<string | undefined>();
  const [name, setName] = useState(() => saved?.name ?? (adventure ? `${adventureTitle(adventure)} site map` : generator.name));
  const [location, setLocation] = useState<Id | "">(() => saved?.location ?? "");

  useEffect(() => {
    if (!prefillable || !adventure) return;
    let cancelled = false;
    adventurePrefill(ctx, generator, adventure.id)
      .then((p) => {
        if (cancelled) return;
        setInputs(p.inputs);
        setFromAdventure(p.fromAdventure);
        setPrefill("done");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setPrefillError(errorMessage(e));
        setPrefill("error");
      });
    return () => {
      cancelled = true;
    };
    // once per mount (the workbench is keyed by generator and adventure)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const request: MapGeneratorRequest = useMemo(() => ({ seed, inputs, stageSeeds }), [seed, inputs, stageSeeds]);
  const stale = !!run && JSON.stringify(run.request) !== JSON.stringify(request);

  const generate = (req: MapGeneratorRequest, opts: { compare?: boolean } = {}) => {
    try {
      const result = runMapGenerator(ctx.module, generator.id, req);
      const next: Run = { request: req, result };
      if (opts.compare && run?.result) next.diff = layoutDiff(run.result.layout, result.layout);
      setRun(next);
    } catch (e) {
      setRun({ request: req, error: errorMessage(e) });
    }
  };

  const onGenerate = () => {
    setRerun(undefined);
    generate(request);
  };
  const onRerun = (stageId: string) => {
    const next = rerunStage(request, stageId, newSeed());
    setStageSeeds(next.stageSeeds ?? {});
    setRerun(stageId);
    generate(next, { compare: true });
  };
  const onReset = (stageId: string) => {
    const next = resetStage(request, stageId);
    setStageSeeds(next.stageSeeds ?? {});
    setRerun(stageId);
    if (run) generate(next, { compare: true });
  };
  const onNewSeed = () => {
    const next: MapGeneratorRequest = { ...request, seed: newSeed(), stageSeeds: {} };
    setSeed(next.seed);
    setStageSeeds({});
    setRerun(undefined);
    if (run) generate(next);
  };

  const save = (asNew: boolean) => {
    const result = run?.result;
    if (!run || !result) return;
    try {
      const input: Parameters<typeof saveGeneratedMap>[2] = {
        name,
        generator: { id: generator.id, seed: run.request.seed, inputs: run.request.inputs ?? {}, stageSeeds: run.request.stageSeeds ?? {} },
      };
      if (adventure) input.adventureId = adventure.id;
      if (location) input.locationId = location;
      if (saved && !asNew) input.mapId = saved.id;
      const map = saveGeneratedMap(ctx, result, input);
      pushToast(saved && !asNew ? "Site map updated." : "Site map saved to the campaign.", { tone: "success" });
      void navigate({ to: "/c/$campaignId/maps/$mapId", params: { campaignId, mapId: map.id } });
    } catch (e) {
      pushToast(`Save failed: ${errorMessage(e)}`, { tone: "danger" });
    }
  };

  const schema = generator.inputs as Schema;
  const result = run?.result;

  return (
    <>
      {adventure && <AdventureNote adventure={adventure} generator={generator} saved={saved} prefill={prefill} prefillError={prefillError} fromAdventure={fromAdventure} inputs={inputs} />}
      {saved && (
        <p className="app-note" data-testid="regenerate-note">
          Re-opened <strong>{saved.name}</strong> with its stored seed <span className="cf-mono">{saved.generator?.seed}</span>, brief and stage seeds. Generate to rebuild it, re-run any stage, then update the map or save a new one.
        </p>
      )}

      <div className="mapgen__grid">
        <div className="app-stack mapgen__main">
          <Card title="Brief">
            <div className="app-stack">
              {prefill === "loading" ? <p className="cf-muted">Reading the adventure…</p> : <BriefForm schema={schema} value={inputs} onChange={setInputs} fromAdventure={fromAdventure} />}
              <div className="app-row prep-seed">
                <label className="app-label">
                  <span>Seed</span>
                  <input className="cf-input cf-mono" aria-label="Seed" value={seed} onChange={(e) => setSeed(e.target.value)} data-testid="map-seed" />
                </label>
                <Button onClick={onNewSeed} data-testid="map-new-seed">
                  New seed
                </Button>
                {Object.keys(stageSeeds).length > 0 && (
                  <span className="cf-muted">
                    {Object.keys(stageSeeds).length} stage{Object.keys(stageSeeds).length === 1 ? "" : "s"} re-run
                  </span>
                )}
              </div>
              <div className="app-row">
                <Button variant="primary" onClick={onGenerate} disabled={prefill === "loading" || seed.trim() === ""} data-testid="map-generate">
                  {run ? "Generate again" : "Generate"}
                </Button>
                {stale && <span className="cf-muted" data-testid="map-stale">The brief or seed changed since this map was generated.</span>}
              </div>
            </div>
          </Card>

          {run?.error && (
            <p className="app-note app-note--warning" role="alert">
              The generator could not run with this brief: {run.error}
            </p>
          )}

          {result && (
            <Card
              title={run?.stored ? "Saved layout (GM map)" : "GM map"}
              actions={
                <span className="app-row">
                  <Badge data-testid="map-attempts">
                    {result.attempts} attempt{result.attempts === 1 ? "" : "s"}
                  </Badge>
                  <Badge>{result.layout.zones.length} zones</Badge>
                </span>
              }
            >
              <div className="app-stack">
                {result.failedCheck && (
                  <p className="app-note app-note--warning" role="alert" data-testid="map-failed">
                    No attempt passed every block check; the last attempt is shown. Still failing: {failedCheckText(result)}.
                  </p>
                )}
                {run?.diff && (
                  <p className="cf-muted app-small" data-testid="map-diff">
                    Changed by the re-run: {run.diff.zones} zones, {run.diff.borders} borders, {run.diff.markers} markers.
                  </p>
                )}
                <MapPreview layout={result.layout} generator={generator} />
              </div>
            </Card>
          )}
        </div>

        <aside className="app-stack mapgen__side">
          <Card title="Stages" subtitle="Re-run one stage with a new seed; earlier stages stay, later stages follow.">
            <StageList generator={generator} seed={seed} stageSeeds={stageSeeds} rerun={rerun} disabled={prefill === "loading"} onRerun={onRerun} onReset={onReset} />
          </Card>
          {result && (
            <Card title="Checks">
              <ChecksPanel checks={result.layout.checks} failedCheck={result.failedCheck} />
            </Card>
          )}
          {result && (
            <Card title="Save to campaign">
              <div className="app-stack">
                <label className="app-label">
                  <span>Map name</span>
                  <input className="cf-input" aria-label="Map name" value={name} onChange={(e) => setName(e.target.value)} data-testid="map-name" />
                </label>
                <LocationSelect adventure={adventure} value={location} onChange={setLocation} />
                {stale && <p className="cf-muted app-small">Saves the map shown, generated from the earlier brief and seed.</p>}
                <div className="app-row">
                  <Button variant="primary" onClick={() => save(false)} data-testid="map-save">
                    {saved ? "Update map" : "Save to campaign"}
                  </Button>
                  {saved && (
                    <Button onClick={() => save(true)} data-testid="map-save-new">
                      Save as new map
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}

function failedCheckText(result: MapGeneratorResult): string {
  const c = result.layout.checks.find((x) => x.id === result.failedCheck || x.message === result.failedCheck);
  return c ? c.message : String(result.failedCheck);
}

function AdventureNote({
  adventure,
  generator,
  saved,
  prefill,
  prefillError,
  fromAdventure,
  inputs,
}: {
  inputs: Record<string, unknown>;
  adventure: Adventure;
  generator: MapGeneratorDef;
  saved: SiteMap | undefined;
  prefill: "idle" | "loading" | "done" | "error";
  prefillError: string | undefined;
  fromAdventure: string[];
}) {
  const ctx = useCampaign();
  const campaignId = ctx.campaignId;
  const mapsFilter = useMemo(() => (m: SiteMap) => m.adventure === adventure.id && !!m.layout, [adventure.id]);
  useList("maps", mapsFilter);
  const others = generatedMapsOf(ctx.store, adventure.id).filter((m) => m.id !== saved?.id);
  const props = (generator.inputs as Schema).properties ?? {};
  return (
    <div className="app-stack">
      <p className="app-note" data-testid="adventure-note">
        For the adventure{" "}
        <Link to="/c/$campaignId/adventures/$adventureId" params={{ campaignId, adventureId: adventure.id }} search={{}} className="app-link-strong">
          {adventureTitle(adventure)}
        </Link>
        .{" "}
        {prefill === "done" &&
          (fromAdventure.length ? (
            <span data-testid="prefill-summary">
              From the adventure: {fromAdventure.filter((k) => !(Array.isArray(inputs[k]) && (inputs[k] as unknown[]).length === 0)).map((k) => `${props[k]?.title ?? humanize(k)}${countOf(props[k], inputs[k])}`).join(", ")}. Edit anything before generating.
            </span>
          ) : (
            <span>The adventure did not supply any settings yet; the defaults are used.</span>
          ))}
        {prefill === "error" && <span>The adventure could not be read ({prefillError}); the defaults are used.</span>}
        {!generator.inputsFromAdventure && <span>This generator does not read adventures; fill the brief by hand.</span>}
      </p>
      {others.length > 0 && (
        <p className="cf-muted" data-testid="existing-maps">
          This adventure already has {others.length === 1 ? "a site map" : `${others.length} site maps`}:{" "}
          {others.map((m, i) => (
            <span key={m.id}>
              {i > 0 && ", "}
              <Link to="/c/$campaignId/maps/$mapId" params={{ campaignId, mapId: m.id }} className="app-link-strong">
                {m.name}
              </Link>{" "}
              (
              <Link to="/c/$campaignId/maps/new" params={{ campaignId }} search={{ map: m.id }} className="app-link">
                re-generate
              </Link>
              )
            </span>
          ))}
          . Saving here adds another.
        </p>
      )}
    </div>
  );
}

/** " (3)" for a list, ": 4" for a scalar, "" otherwise. */
function countOf(schema: Schema | undefined, v: unknown): string {
  if (Array.isArray(schema?.enum)) return `: ${enumLabel(schema, v)}`;
  if (Array.isArray(v)) return ` (${v.length})`;
  if (typeof v === "number" || typeof v === "boolean") return `: ${String(v)}`;
  if (typeof v === "string" && v.length <= 24) return `: ${v}`;
  return "";
}

/** Locations in the adventure's cast, as the map's site. */
function LocationSelect({ adventure, value, onChange }: { adventure: Adventure | undefined; value: Id | ""; onChange: (v: Id | "") => void }) {
  const ctx = useCampaign();
  const locations = useMemo(() => {
    if (!adventure) return [] as Entity[];
    const seen = new Set<Id>();
    const out: Entity[] = [];
    for (const role of Object.keys(adventure.cast ?? {})) {
      for (const e of castMembers(ctx.store, adventure.id, role)) {
        if (seen.has(e.id) || ctx.module.entityType(e.type)?.kind !== "location") continue;
        seen.add(e.id);
        out.push(e);
      }
    }
    return out;
  }, [ctx, adventure]);
  if (locations.length === 0) return null;
  return (
    <label className="app-label">
      <span>Site (location)</span>
      <select className="cf-select" aria-label="Site location" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">None</option>
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    </label>
  );
}
