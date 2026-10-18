/**
 * "Skyfire Down": the demo Alien campaign (campaign mode, Space Truckers frame),
 * built only from module data and module procedures, deterministically from a
 * seed. Record ids and timestamps are fresh ULIDs on every build; everything
 * else (names, types, fields, structure, text) depends only on the seed and
 * the module version.
 *
 * Browser-safe: no `node:` imports here or in index.ts (the web app offers
 * "Load demo campaign" through `demoCampaignJSON`). File I/O lives in cli.ts.
 */
import {
  createRng,
  createTableRegistry,
  getPath,
  loadModule,
  runProcedure,
  type EntityPreset,
  type GeneratedGraph,
  type LoadedModule,
  type Procedure,
  type ProcedureContext,
  type Rng,
} from "@campaign-forge/module-sdk";
import {
  CampaignStore,
  RichTextRegistry,
  acceptGeneratedGraph,
  docIdsOf,
  fromMarkdown,
  nameResolver,
  newId,
  presetToEntity,
  recordEdit,
  toMarkdown,
  type AcceptResult,
  type CampaignMaps,
  type Entity,
  type Id,
  type Visibility,
} from "@campaign-forge/core";
import { alienModule } from "@campaign-forge/module-alien";

export const DEMO_SEED = "skyfire-down";
export const DEMO_NAME = "Skyfire Down";
export const DEMO_FRAME = "space-truckers";
const SHIP_NAME = "MV Skyfire";
const PC_COUNT = 4;
const WITHIN = "within:";

export interface BuildDemoOptions {
  seed?: string;
  name?: string;
}

export interface DemoCampaign {
  store: CampaignStore;
  registry: RichTextRegistry;
  maps: CampaignMaps;
  /** Rich-text bodies as Markdown, keyed by doc id (`[[id|name]]` references). */
  docs: Record<Id, string>;
}

const PLAYERS: Visibility = { level: "players" };
const GM: Visibility = { level: "gm" };

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error("pick from an empty list");
  return items[rng.int(0, items.length - 1)] as T;
}

/** `n` distinct items in a seeded order (partial Fisher-Yates). */
function sample<T>(rng: Rng, items: readonly T[], n: number): T[] {
  const pool = [...items];
  const out: T[] = [];
  while (out.length < n && pool.length > 0) out.push(pool.splice(rng.int(0, pool.length - 1), 1)[0] as T);
  return out;
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : fallback;
}

function ref(e: Pick<Entity, "id" | "name">): string {
  return `[[${e.id}|${e.name}]]`;
}

function requirePreset(mod: LoadedModule, id: string): EntityPreset {
  const p = mod.preset(id);
  if (!p) throw new Error(`demo campaign: module has no preset "${id}"`);
  return p;
}

function requireProcedure(mod: LoadedModule, id: string): Procedure {
  const p = mod.procedure(id);
  if (!p) throw new Error(`demo campaign: module has no procedure "${id}"`);
  return p;
}

/** Rebuild a ProcedureContext from a finished run so a chain's `inputs(ctx)` can read it. */
function contextOf(graph: GeneratedGraph): ProcedureContext {
  const tables = createTableRegistry(alienModule.tables);
  return {
    inputs: graph.inputs,
    results: graph.results,
    rolls: graph.rolls,
    tables,
    get<T = unknown>(stepId: string): T | undefined {
      if (Object.prototype.hasOwnProperty.call(graph.results, stepId)) return graph.results[stepId] as T;
      return getPath(graph.results, stepId) as T | undefined;
    },
    data: () => ({ ...graph.inputs, ...graph.results }),
  };
}

/** Run a procedure with every optional step included. */
function run(proc: Procedure, seed: string, inputs: Record<string, unknown>): GeneratedGraph {
  const includeOptional = proc.steps.filter((s) => s.optional).map((s) => s.id);
  return runProcedure(proc, alienModule, { seed, inputs, includeOptional });
}

/**
 * Procedures put a location's subtype in `fields.subtype`; core keeps it on
 * `entity.subtype` and acceptGeneratedGraph does not copy it over. Lift it.
 */
function liftSubtypes(store: CampaignStore, mod: LoadedModule, accepted: AcceptResult): void {
  for (const e of accepted.entities) {
    const sub = e.fields["subtype"];
    const def = mod.entityType(e.type);
    if (typeof sub === "string" && def?.subtypes?.some((s) => s.id === sub)) store.update("entities", e.id, { subtype: sub });
  }
}

function writeDoc(registry: RichTextRegistry, docId: Id | undefined, markdown: string): void {
  if (!docId) return;
  fromMarkdown(registry.open(docId), markdown);
}

// ---------------------------------------------------------------------------
// the build
// ---------------------------------------------------------------------------

/** Build the demo campaign into a fresh store and rich-text registry. */
export function buildDemoCampaign(opts: BuildDemoOptions = {}): DemoCampaign {
  const seed = opts.seed ?? DEMO_SEED;
  const name = opts.name ?? DEMO_NAME;
  const rng = createRng(`seed-campaign/${seed}`);
  const mod = loadModule(alienModule, { skipProcedureRuns: true });
  const moduleId = mod.manifest.id;
  const registry = new RichTextRegistry();

  // Frame record from the module's reference data.
  const frame = mod.referenceItem("alien.frames", DEMO_FRAME);
  if (!frame) throw new Error(`demo campaign: module has no frame "${DEMO_FRAME}"`);

  // Ship and home base presets chosen from module data.
  const shipPresets = mod.presetsFor("alien.spaceship").filter((p) => (p.tags ?? []).includes(`frame:${DEMO_FRAME}`));
  const shipPreset = pick(rng.fork("ship"), shipPresets);
  const homeBasePreset = mod.presetsFor("alien.location").find((p) => (p.tags ?? []).includes("home-base")) ?? requirePreset(mod, "alien.location.anchorpoint-station");

  const cal = alienModule.calendar;
  const store = CampaignStore.create({
    name,
    moduleId,
    moduleVersion: mod.manifest.version,
    mode: "campaign",
    calendarId: cal.id,
    currentDate: `${cal.defaultYear}-06-01`,
    gmName: "GM",
    settings: { frame: DEMO_FRAME, homeBase: homeBasePreset.id, shipPresetId: shipPreset.id, seed },
  });

  // -- home base: import the preset and its `within:` ancestors -------------
  const locationByPreset = new Map<string, Entity>();
  const importLocation = (presetId: string): Entity => {
    const existing = locationByPreset.get(presetId);
    if (existing) return existing;
    const preset = requirePreset(mod, presetId);
    const parentTag = (preset.tags ?? []).find((t) => t.startsWith(WITHIN));
    const parent = parentTag ? importLocation(parentTag.slice(WITHIN.length)) : undefined;
    const entity = presetToEntity(store, preset, { visibility: PLAYERS });
    if (parent) store.createRelationship("within", entity.id, parent.id, undefined, PLAYERS);
    locationByPreset.set(presetId, entity);
    return entity;
  };
  const homeBase = importLocation(homeBasePreset.id);
  // A site inside the home base (e.g. the docks), when the module has one.
  const sitePreset = mod.presetsFor("alien.location").find((p) => p.subtype === "site" && (p.tags ?? []).includes(`${WITHIN}${homeBasePreset.id}`));
  const homeSite = sitePreset ? importLocation(sitePreset.id) : homeBase;
  const sector = [...locationByPreset.values()].find((e) => e.subtype === "sector");

  // -- player characters: Life Path, then a name from the career list ------
  const usedNames = new Set<string>();
  const pcs: Entity[] = [];
  const lifepath = requireProcedure(mod, "alien.lifepath");
  for (let n = 1; n <= PC_COUNT; n++) {
    const graph = run(lifepath, `${seed}/pc${n}`, {});
    const accepted = acceptGeneratedGraph(store, graph, { moduleId, visibility: PLAYERS });
    const pc = accepted.entities[0];
    if (!pc) throw new Error("life path produced no character");
    const career = mod.referenceItem("alien.careers", str(pc.fields["career"]));
    const prng = rng.fork(`pc${n}`);
    const names = strings(career?.["names"]).filter((x) => !usedNames.has(x));
    const pcName = names.length > 0 ? pick(prng.fork("name"), names) : `Crew member ${n}`;
    usedNames.add(pcName);
    const fields = { ...pc.fields };
    const appearance = strings(career?.["appearances"]);
    const agendas = strings(career?.["agendas"]);
    const signature = strings(career?.["signatureItems"]);
    const edited: string[] = [];
    if (appearance.length) {
      fields["appearance"] = pick(prng.fork("appearance"), appearance);
      edited.push("appearance");
    }
    if (agendas.length) {
      fields["personalAgenda"] = pick(prng.fork("agenda"), agendas);
      edited.push("personalAgenda");
    }
    if (signature.length) {
      fields["signatureItem"] = pick(prng.fork("signature"), signature);
      edited.push("signatureItem");
    }
    const updated = store.update("entities", pc.id, { name: pcName, fields, tags: [...pc.tags, "crew"] });
    for (const path of ["name", ...edited]) recordEdit(store, accepted.run.id, pc.id, path);
    pcs.push(updated);
  }
  const [pc1, pc2, pc3, pc4] = pcs as [Entity, Entity, Entity, Entity];
  store.createRelationship("buddy_of", pc1.id, pc2.id, "Shipped out together twice before", PLAYERS);
  store.createRelationship("rival_of", pc3.id, pc4.id, "Both want the first officer's bunk", PLAYERS);

  // -- the ship ------------------------------------------------------------
  const ship = presetToEntity(store, shipPreset, {
    name: SHIP_NAME,
    summary: `${shipPreset.name}, the crew's ship. ${shipPreset.summary ?? ""}`.trim(),
    visibility: PLAYERS,
  });
  for (const pc of pcs) store.createRelationship("crew_of", pc.id, ship.id, undefined, PLAYERS);
  store.createRelationship("found_at", ship.id, homeSite.id, "Berthed between jobs", PLAYERS);

  // -- factions --------------------------------------------------------------
  const wy = presetToEntity(store, requirePreset(mod, "alien.faction.weyland-yutani"), { visibility: PLAYERS });
  const minorPresets = mod.presetsFor("alien.faction").filter((p) => p.fields["minor"] === true);
  const minor = presetToEntity(store, pick(rng.fork("minor-corp"), minorPresets), { visibility: PLAYERS });
  store.createRelationship("stationed_at", wy.id, homeBase.id, undefined, PLAYERS);

  // -- NPCs: six presets from a pool that fits a trucking crew's port of call --
  const NPC_POOL = [
    "alien.npc.colony-manager",
    "alien.npc.company-bureaucrat",
    "alien.npc.icc-inspector",
    "alien.npc.smuggler",
    "alien.npc.ships-engineer",
    "alien.npc.salvage-expert",
    "alien.npc.security-guard",
    "alien.npc.corporate-exec",
    "alien.npc.comtech",
    "alien.npc.android-covert",
  ].filter((id) => mod.preset(id));
  const nrng = rng.fork("npcs");
  const npcPresets = sample(nrng.fork("pick"), NPC_POOL, 6).map((id) => requirePreset(mod, id));
  const npcNamePool = (mod.referenceList("alien.careers")?.items ?? []).flatMap((c) => strings(c["names"])).filter((x) => !usedNames.has(x));
  const npcNames = sample(nrng.fork("names"), npcNamePool, npcPresets.length);
  const npcs: Entity[] = npcPresets.map((preset, i) => {
    const personal = npcNames[i] ?? `NPC ${i + 1}`;
    usedNames.add(personal);
    return presetToEntity(store, preset, { name: `${personal}, ${preset.name}`, visibility: GM });
  });
  const [contact, ally, , , , wildcard] = npcs as [Entity, Entity, Entity, Entity, Entity, Entity];
  for (const npc of npcs) store.createRelationship("found_at", npc.id, homeSite.id, undefined, GM);
  const corporate = npcs.find((n) => n.id !== contact.id && /weyland|company|corporate/i.test(n.name));
  if (corporate) store.createRelationship("member_of", corporate.id, wy.id, undefined, GM);
  store.createRelationship("member_of", wildcard.id, minor.id, "Quietly on the payroll", GM);
  store.createRelationship("knows", contact.id, pc1.id, "Owes them a favour", GM);
  store.createRelationship("knows", ally.id, pc3.id, undefined, GM);

  // -- the job, its destination system and world ------------------------------
  const jobProc = requireProcedure(mod, "alien.job.create");
  const jobGraph = run(jobProc, `${seed}/job`, { frame: DEMO_FRAME, pcCount: PC_COUNT });
  const jobAccepted = acceptGeneratedGraph(store, jobGraph, { moduleId, visibility: PLAYERS });
  const jobId = jobAccepted.idMap["job"];
  const employerId = jobAccepted.idMap["employer"];
  if (!jobId || !employerId) throw new Error("job procedure did not produce a job and an employer");

  const systemChain = (jobProc.chains ?? []).find((c) => c.procedure === "alien.system.create");
  if (!systemChain) throw new Error("job procedure does not chain into the system generator");
  const systemProc = requireProcedure(mod, systemChain.procedure);
  // The chain passes the job's destination text (e.g. "An established colony") as the system
  // name; drop it so the generator rolls a designation. The text stays on the job's fields.
  const { name: _destinationText, ...systemInputs } = systemChain.inputs ? systemChain.inputs(contextOf(jobGraph)) : {};
  const systemGraph = run(systemProc, `${seed}/system`, systemInputs);
  const systemAccepted = acceptGeneratedGraph(store, systemGraph, { moduleId, visibility: GM, ...(sector ? { within: sector.id } : {}) });
  liftSubtypes(store, mod, systemAccepted);
  const systemId = systemAccepted.idMap["system"];
  if (!systemId) throw new Error("system procedure produced no system");

  // The destination: the first world body as a full world. It replaces that body's stub planet.
  const worldChain = (systemProc.chains ?? []).find((c) => c.procedure === "alien.world.create");
  if (!worldChain) throw new Error("system procedure does not chain into world creation");
  const worldProc = requireProcedure(mod, worldChain.procedure);
  const worldInputs = worldChain.inputs ? worldChain.inputs(contextOf(systemGraph)) : {};
  const worldGraph = run(worldProc, `${seed}/world`, Object.fromEntries(Object.entries(worldInputs).filter(([, v]) => v !== undefined)));
  const stubId = systemAccepted.idMap["body-1"];
  const worldAccepted = acceptGeneratedGraph(store, worldGraph, { moduleId, visibility: GM, within: systemId });
  liftSubtypes(store, mod, worldAccepted);
  if (stubId) {
    store.remove("entities", stubId);
    store.update("generatorRuns", systemAccepted.run.id, { produced: systemAccepted.run.produced.filter((id) => id !== stubId) });
  }
  const planetId = worldAccepted.idMap["planet"];
  if (!planetId) throw new Error("world procedure produced no planet");
  const colonyId = worldAccepted.idMap["colony"];
  const destinationId = colonyId ?? planetId;
  store.createRelationship("found_at", jobId, destinationId, "Delivery point", PLAYERS);

  const get = (id: Id): Entity => {
    const e = store.get("entities", id);
    if (!e) throw new Error(`entity ${id} vanished`);
    return e;
  };
  const job = get(jobId);
  const employer = get(employerId);
  const system = get(systemId);
  const planet = get(planetId);
  const destination = get(destinationId);
  store.createRelationship("knows", contact.id, employer.id, "Brokered the contract", GM);

  // -- creatures -----------------------------------------------------------
  const creaturePool = mod.presetsFor("alien.creature").filter((p) => p.fields["loreOnly"] !== true);
  const creatures = sample(rng.fork("creatures"), creaturePool, 2).map((p) => presetToEntity(store, p, { visibility: GM }));
  for (const c of creatures) store.createRelationship("found_at", c.id, planet.id, "Waiting at the destination", GM);

  // -- the adventure from the module's campaign-mode adventure template --------
  const template = mod.templatesFor("adventure", "campaign")[0] ?? mod.templatesFor("adventure")[0];
  if (!template) throw new Error("module has no adventure template");
  const scaffold = template.scaffold as { acts?: Array<{ number: number; title?: string; goal: string; pacing?: string; scenes?: Array<{ purpose: string; mandatory?: boolean }> }> };
  const complications = strings(job.fields["complications"]);
  const twist = str(job.fields["plotTwist"]);
  const cargo = str(job.fields["cargo"], str(job.fields["mission"], "the cargo"));
  const payment = Number(job.fields["payment"] ?? 0);
  const distance = Number(job.fields["distance"] ?? 0);

  const adventure = store.createAdventure({
    title: `${name}: the ${system.name} run`,
    premise: `The crew of the ${SHIP_NAME} takes ${distance === 0 ? "an in-system" : `a ${distance}-system`} haul of ${cargo.toLowerCase()} for ${employer.name}. The pay is good. That should worry them.`,
    status: "planned",
    templateId: template.id,
    tags: ["demo", DEMO_FRAME],
    hooksIn: [`${employer.name} needs a ship that asks no questions.`],
    hooksOut: ["Whatever made the destination go quiet may follow the crew home."],
    withDocs: true,
  });
  writeDoc(
    registry,
    adventure.playerIntroDoc,
    `${ref(contact)} waves the crew over at ${ref(homeSite)}. A job for ${ref(employer)}: ${ref(job)}.\n\nPay on delivery: **$${payment.toLocaleString("en-US")}**. Destination: ${ref(destination)} in the ${ref(system)} system.`,
  );
  writeDoc(
    registry,
    adventure.gmSituationDoc,
    [
      `What the crew is not told:`,
      "",
      ...(complications.length ? complications.map((c) => `- ${c}`) : ["- Nothing yet; roll a complication if the job runs smoothly."]),
      ...(twist ? [`- Twist: ${twist}`] : []),
      "",
      `Something is loose on ${ref(planet)}: ${creatures.map(ref).join(" and ")}.`,
    ].join("\n"),
  );
  writeDoc(registry, adventure.epilogueDoc, `If the crew gets paid, ${ref(employer)} offers a second contract. If not, ${ref(wildcard)} knows someone who buys salvage.`);

  const sceneText = (actNo: number, sceneNo: number, purpose: string): { body: string; location: Entity; participants: Entity[] } => {
    const tag = `${actNo}.${sceneNo}`;
    switch (tag) {
      case "1.1":
        return { body: `${ref(contact)} meets the crew in ${ref(homeSite)} and pitches ${ref(job)}. ${ref(corporate ?? ally)} listens from the next table.`, location: homeSite, participants: [contact, ...(corporate ? [corporate] : [ally])] };
      case "1.2":
        return { body: `Loading the ${ref(ship)}. ${ref(ally)} offers cheap fuel; ${ref(wildcard)} wants a crate added to the manifest.`, location: homeSite, participants: [ally, wildcard] };
      case "2.1":
        return { body: `Hypersleep out of ${ref(homeBase)}. ${ref(ship)} wakes the crew early; roll an encounter.`, location: ship, participants: [] };
      case "2.2":
        return { body: `En route: ${complications[0] ?? "a fault in the cargo bay"}. ${ref(wildcard)}'s crate is warm to the touch.`, location: ship, participants: [] };
      case "3.1":
        return { body: `Arrival at ${ref(destination)} on ${ref(planet)}. Nobody answers the hail.`, location: destination, participants: [] };
      case "3.2":
        return { body: `${complications[0] ?? "The dock is empty"}. Tracks lead toward the habitat. ${ref(creatures[0] ?? planet)}.`, location: destination, participants: creatures.slice(0, 1) };
      case "3.3":
        return { body: `${twist || complications[1] || "The cargo is not what the manifest says"}. ${ref(creatures[1] ?? planet)} closes in.`, location: planet, participants: creatures.slice(1, 2) };
      case "4.1":
        return { body: `Back at ${ref(homeBase)}, ${ref(contact)} counts out the pay, or explains why there is none.`, location: homeBase, participants: [contact] };
      default:
        return { body: `${purpose} At ${ref(destination)}.`, location: destination, participants: [] };
    }
  };

  for (const act of scaffold.acts ?? []) {
    const a = store.createAct(adventure.id, { number: act.number, goal: act.goal, ...(act.title ? { title: act.title } : {}), withPacingDoc: Boolean(act.pacing) });
    if (act.pacing) writeDoc(registry, a.pacingDoc, act.pacing);
    (act.scenes ?? []).forEach((s, i) => {
      const text = sceneText(act.number, i + 1, s.purpose);
      const title = s.purpose.split(/[:(.]/)[0]?.trim() || `Scene ${i + 1}`;
      const scene = store.createScene(a.id, {
        title,
        purpose: s.purpose,
        location: text.location.id,
        participants: text.participants.map((p) => p.id),
        events: [{ id: newId(), text: s.purpose, mandatory: s.mandatory === true }],
        tags: ["demo"],
      });
      writeDoc(registry, scene.bodyDoc, text.body);
    });
  }

  // -- one agenda handout per PC ---------------------------------------------
  for (const pc of pcs) {
    const fresh = get(pc.id);
    const handout = store.createHandout({
      title: `Agenda: ${fresh.name}`,
      kind: "agenda",
      visibility: { level: "some_players", players: [] },
      attachedTo: { kind: "adventure", id: adventure.id },
      character: fresh.id,
    });
    writeDoc(registry, handout.bodyDoc, `${str(fresh.fields["personalAgenda"], "Get through this job alive.")}\n\nOn this run, keep an eye on ${ref(wildcard)}.`);
  }

  // -- timeline, session, note ------------------------------------------------
  store.createTimelineEvent({ inWorldDate: `${cal.defaultYear}-05-28`, text: `The ${SHIP_NAME} docks at ${homeBase.name} after a dry month.`, entities: [ship.id, homeBase.id], visibility: PLAYERS });
  store.createTimelineEvent({ inWorldDate: `${cal.defaultYear}-05-30`, text: `${destination.name} stops answering routine traffic.`, entities: [destination.id], visibility: GM });

  const session = store.createSession({ number: 1, date: "2026-11-07", title: "The offer", status: "planned" });
  store.update("sessions", session.id, {
    nextPlan: [
      `Run the briefing with ${contact.name}.`,
      `Let the crew haggle; the ceiling is $${Math.round(payment * 1.25).toLocaleString("en-US")}.`,
      "End on hypersleep, or on the first complication if time allows.",
    ],
  });
  writeDoc(registry, session.logDoc, `Plan: briefing in ${ref(homeSite)}, loading the ${ref(ship)}, departure.`);

  const note = store.createNote({ title: `Campaign frame: ${str(frame["name"], DEMO_FRAME)}`, attachedTo: { kind: "campaign", id: store.id }, tags: ["frame", "demo"] });
  writeDoc(
    registry,
    note.bodyDoc,
    [
      `## ${str(frame["name"], DEMO_FRAME)}`,
      "",
      str(frame["summary"]),
      "",
      `- Ship: ${ref(ship)}`,
      `- Home base: ${ref(homeBase)}`,
      `- Usual employers: ${ref(wy)}, ${ref(minor)}`,
      `- Pay: ${str(frame["salaryBand"], "per job")}`,
    ].join("\n"),
  );

  store.updateMeta({ settings: { ...store.meta().settings, homeBase: homeBase.id, homeBasePresetId: homeBasePreset.id, ship: ship.id, employer: wy.id } });

  const maps = store.toJSON();
  const resolve = nameResolver(store);
  const docs: Record<Id, string> = {};
  for (const id of docIdsOf(maps)) docs[id] = toMarkdown(registry.open(id), resolve);
  return { store, registry, maps, docs };
}

/** Plain JSON for the web app's "Load demo campaign" (load `maps` into a store, `docs` into the registry). */
export function demoCampaignJSON(seed: string = DEMO_SEED): { maps: CampaignMaps; docs: Record<Id, string> } {
  const { store, registry, maps, docs } = buildDemoCampaign({ seed });
  registry.closeAll();
  store.destroy();
  return { maps, docs };
}
