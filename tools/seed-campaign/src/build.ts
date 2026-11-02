/**
 * "Skyfire Down": the demo Alien campaign (campaign mode, Space Truckers frame),
 * built only from module data and module procedures, deterministically from a
 * seed. Record ids and timestamps are fresh ULIDs on every build; everything
 * else (names, types, fields, structure, text) depends only on the seed and
 * the module version.
 *
 * Besides the job, the crew and the adventure it carries a xenomorph life
 * cycle already running on an NPC (the module's `alien.gestation` tracker),
 * and a planned first session whose checklist the app fills in. The Life Path
 * may roll android PCs, whose critical injuries use the android table.
 *
 * The crew's ship is set up for campaign play: it is the campaign's crew ship
 * with hull damage, a broken component, spare parts, provisions and cargo on
 * its sheet; one finished travel leg brought it from the job's destination
 * system to the home base; and the crew funds ledger holds a few entries
 * (the last run's pay, docking, food and water, an advance on the new job).
 *
 * The crew has a little history: each PC earned XP on two earlier runs (the
 * module's end-of-session questions, logged in the advancement log) and the
 * first PC has already spent some of it on a talent.
 *
 * Four players (Sam, Priya, Mateo, Jun) each play one PC: each PC's agenda
 * card for the job is given to its player, and one note is shared with Priya
 * alone, so every player's packet differs.
 *
 * The arc board holds two campaign threads dealt by the module. The job board
 * seeded one clue of the first into "Ore to the spaceport" (Mara Quill's
 * secret), found in session 1; a clue of the second is seeded with Mara, now
 * a crew contact who owes the crew a favour; the last run's employer has
 * noticed the crew (heat), and the second thread's clock moved between jobs.
 *
 * Browser-safe: no `node:` imports here or in index.ts (the web app offers
 * "Load demo campaign" through `demoCampaignJSON`). File I/O lives in cli.ts.
 */
import {
  CAMPAIGN_INPUT_HINT,
  addDaysToDate,
  createRng,
  createTableRegistry,
  procedureContext,
  loadModule,
  runProcedure,
  type CampaignInputHint,
  type EntityPreset,
  type GeneratedGraph,
  type LongAgendaDraftSet,
  type LoadedModule,
  type Offer,
  type OfferSet,
  type Procedure,
  type ProcedureContext,
  type Rng,
} from "@campaign-forge/module-sdk";
import {
  CampaignStore,
  RichTextRegistry,
  acceptGeneratedGraph,
  advanceHunt,
  applyHuntAdvance,
  applyHuntMove,
  carriedSensors,
  emptyLive,
  sweepReadings,
  huntMarkerSources,
  huntOf,
  huntSeed,
  liveOf,
  moveHuntToken,
  placeHuntSource,
  placeToken,
  recordSweep,
  revealZones,
  startLive,
  suggestHuntMove,
  zonePath,
  addPlayer,
  addContact,
  applyArcTicks,
  applyOfferArcLinks,
  arcsSnapshot,
  createThread,
  markClueFound,
  planArcTicks,
  seedClue,
  setHeat,
  type ArcThread,
  applyLongAgendaWrites,
  applySpend,
  campaignSnapshot,
  departTravel,
  longAgendaProgress,
  longAgendaWrites,
  postAward,
  postLedgerEntry,
  docIdsOf,
  fromMarkdown,
  nameResolver,
  newId,
  presetToEntity,
  recordEdit,
  runMapGenerator,
  toMarkdown,
  type AcceptResult,
  type CampaignMaps,
  type Entity,
  type HuntState,
  type Id,
  type SiteMapLiveState,
  type Visibility,
} from "@campaign-forge/core";
import { alienModule, campaignAgendasProcedure, campaignThread, jobBoard, siteMapGenerator, weaponRowFromPreset, type JobSiteBrief } from "@campaign-forge/module-alien";
import { slotLabel } from "@campaign-forge/module-sdk";
import { startInfection } from "./infection";

/**
 * What each career carries aboard a hauler on this run (original demo
 * choices; the stats are copied from the module's weapon presets).
 */
const CREW_WEAPONS: Record<string, string[]> = {
  "colonial-marine": ["armat-m41a-pulse-rifle", "knife"],
  "colonial-marshal": ["357-magnum-revolver", "stun-baton"],
  "company-agent": ["weyland-es-4-electrostatic-pistol"],
  kid: ["blunt-instrument"],
  medic: ["stun-baton"],
  officer: ["m4a3-service-pistol"],
  pilot: ["vp-70ma6-service-pistol"],
  roughneck: ["cutting-torch-weapon", "fire-axe"],
  scientist: ["knife"],
};

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
  return procedureContext(graph.inputs, graph.results, graph.rolls, createTableRegistry(alienModule.tables));
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
    const weaponIds = CREW_WEAPONS[str(pc.fields["career"])] ?? ["knife"];
    fields["weapons"] = weaponIds.map((id) => weaponRowFromPreset(requirePreset(mod, `alien.item.${id}`)));
    edited.push("weapons");
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

  // -- long-term agendas (campaign play): dealt for the last run, then moved on by its outcome --
  setupCampaignAgendas(store, registry, mod, { seed, pcs, job });

  // -- creatures -----------------------------------------------------------
  const creaturePool = mod.presetsFor("alien.creature").filter((p) => p.fields["loreOnly"] !== true);
  const creatures = sample(rng.fork("creatures"), creaturePool, 2).map((p) => presetToEntity(store, p, { visibility: GM }));
  for (const c of creatures) store.createRelationship("found_at", c.id, planet.id, "Waiting at the destination", GM);

  // -- a life cycle already running: an NPC at the port carries an embryo --
  // Infected before a long hypersleep, which slows gestation after revival (p. 216): the
  // embryo grows at a quarter of the normal pace, so the crew has a few shifts to notice.
  const host = [wildcard, ...npcs].find((n) => n.fields["android"] !== true && n.id !== contact.id) ?? wildcard;
  startInfection(store, mod, { host, stage: "gestating", pace: "much-slower", seed: `${seed}/infection` });

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
      "",
      `Closer to home: ${ref(host)} carries a xenomorph embryo, picked up off-station before a long hypersleep that slowed it. It is growing; the life-cycle tracker counts it down at the table.`,
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

  // -- the players at the table: one per PC, each PC's agenda given to them, one note for one player
  setupPlayers(store, registry, pcs);

  // -- timeline, session, note ------------------------------------------------
  store.createTimelineEvent({ inWorldDate: `${cal.defaultYear}-05-28`, text: `The ${SHIP_NAME} docks at ${homeBase.name} after a dry month.`, entities: [ship.id, homeBase.id], visibility: PLAYERS });
  store.createTimelineEvent({ inWorldDate: `${cal.defaultYear}-05-30`, text: `${destination.name} stops answering routine traffic.`, entities: [destination.id], visibility: GM });

  const session = store.createSession({ number: 1, date: "2026-11-07", title: "The offer", status: "planned" });
  store.update("sessions", session.id, {
    nextPlan: [
      `Run the briefing with ${contact.name}.`,
      `Let the crew haggle; the ceiling is $${Math.round(payment * 1.25).toLocaleString("en-US")}.`,
      "End on hypersleep, or on the first complication if time allows.",
      `Check the life-cycle tracker: ${host.name} is carrying an embryo.`,
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

  // -- the ship in play: its state, the trip that brought it in, the crew's funds --
  setupShip(store, { ship, job, system, homeBase, pcs, cargo, year: cal.defaultYear, seed });

  // -- the crew's advancement: XP from two earlier runs, one talent bought ---
  setupAdvancement(store, { pcs, system, year: cal.defaultYear });

  // -- the arc board: two campaign threads, dealt before the next job --
  const threads = setupThreads(store, mod, { seed });

  // -- the next job: a job board with three postings, one taken, with its site map; it carries a clue of the first thread --
  const board = setupJobBoard(store, registry, mod, { seed, pcs, threads });

  // -- the arcs in play: the clue found in session 1, Mara Quill a contact, heat, a clock moved between jobs --
  setupArcsInPlay(store, { threads, board, session: session.id, employer: employer.id, homeSite, seed });

  const maps = store.toJSON();
  const resolve = nameResolver(store);
  const docs: Record<Id, string> = {};
  for (const id of docIdsOf(maps)) docs[id] = toMarkdown(registry.open(id), resolve);
  return { store, registry, maps, docs };
}

// ---------------------------------------------------------------------------
// the players
// ---------------------------------------------------------------------------

/** The demo's players (original names), one per PC in build order, with the GM's contact note for each. */
export const DEMO_PLAYERS: ReadonlyArray<{ name: string; contact: string }> = [
  { name: "Sam", contact: "@sam in the group chat" },
  { name: "Priya", contact: "@priya, prefers email" },
  { name: "Mateo", contact: "@mateo" },
  { name: "Jun", contact: "@jun, joins by video" },
];

/** Title of the demo handout shared with one player only (the second). */
export const DEMO_PRIVATE_HANDOUT = "An unsigned note";

/**
 * Who plays which PC: four players, each PC's agenda card for the job given
 * to its player (their packet gets it), and one handout shared with the
 * second player alone. Their long-term agenda's goal, beat and tension reach
 * them through the character's owner-visible fields.
 */
function setupPlayers(store: CampaignStore, registry: RichTextRegistry, pcs: Entity[]): void {
  const members = pcs.map((pc, i) => {
    const p = DEMO_PLAYERS[i] ?? { name: `Player ${i + 1}`, contact: "" };
    const member = addPlayer(store, { name: p.name, contact: p.contact, characters: [pc.id] });
    return member;
  });
  for (const h of store.list("handouts")) {
    if (h.kind === "agenda" && h.attachedTo?.kind === "adventure" && h.character) store.update("handouts", h.id, { toOwner: true });
  }
  const second = pcs[1];
  const priya = members[1];
  if (!second || !priya) return;
  const note = store.createHandout({ title: DEMO_PRIVATE_HANDOUT, kind: "text", visibility: { level: "some_players", players: [priya.id] }, character: second.id });
  writeDoc(
    registry,
    note.bodyDoc,
    [
      "Folded into the seal of your locker when you came back from the docks:",
      "",
      "> The manifest they will show you is not the cargo. Count the cryo pods yourself before you sign. Keep this between us.",
    ].join("\n"),
  );
}

// ---------------------------------------------------------------------------
// the ship in play
// ---------------------------------------------------------------------------

/** Real-world date of the demo's bookkeeping (the week before session 1). */
const LEDGER_REAL_DATE = "2026-11-01";

interface ShipSetup {
  ship: Entity;
  job: Entity;
  system: Entity;
  homeBase: Entity;
  pcs: Entity[];
  cargo: string;
  year: number;
  seed: string;
}

/**
 * The crew's ship as the app's Ship page shows it: some hull damage and a
 * broken coffee maker from the dry month, one spare part, food and water for
 * a couple of weeks, the job's cargo waiting to load, one finished leg from
 * the job's destination system to the home base (the crew slept through it)
 * and a short ledger. Amounts and dates are fixed; the leg's arrival rolls
 * come from a seed, so the build stays deterministic.
 */
function setupShip(store: CampaignStore, s: ShipSetup): void {
  const minor = alienModule.tables.find((t) => t.id === "alien.ship.minor-damage");
  const coffee = minor?.rows.find((r) => r.label === "Coffee Maker Malfunction")?.result as Record<string, unknown> | undefined;
  const fields: Record<string, unknown> = {
    ...s.ship.fields,
    hullDamage: 2,
    componentDamage: coffee
      ? [{ name: str(coffee["name"]), severity: "minor", effect: str(coffee["effect"]), heavyMachinery: 1, comtech: 0, system: str(coffee["system"]) }]
      : [],
    spareParts: { mechanical: 1, electronic: 0 },
    provisions: 60,
    cargo: [{ item: `${s.cargo} (to load)`, amount: "One hold", note: `For ${s.job.name}` }],
    ownership: "company",
  };
  store.update("entities", s.ship.id, { fields });

  // The last run: Y87-544 to the home base, one parsec at the ship's FTL rating, everyone in hypersleep.
  const date = (m: number, d: number) => `${s.year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const ftl = Number(fields["ftl"] ?? 0) || 1;
  const arrive = date(5, 28);
  store.updateMeta({ currentDate: addDaysBack(arrive, ftl) });
  departTravel(store, alienModule, {
    ship: s.ship.id,
    from: s.system.id,
    to: s.homeBase.id,
    distance: 1,
    options: { crew: s.pcs.map((pc) => ({ id: pc.id, name: pc.name, awake: false, android: pc.fields["android"] === true })) },
    seed: `${s.seed}/travel/1`,
    applyEffects: false,
    moveVehicle: false,
    timeline: false,
    visibility: PLAYERS,
    note: "The dry month: an empty run back from the survey drop.",
  });
  store.updateMeta({ currentDate: date(6, 1) });

  const post = (m: number, d: number, amount: number, category: string, note: string, links: Record<string, string> = {}) =>
    postLedgerEntry(store, { amount, category, note, inWorldDate: date(m, d), realDate: LEDGER_REAL_DATE, links: { ship: s.ship.id, ...links }, visibility: PLAYERS, source: { kind: "manual" } });
  post(5, 28, 6500, "other", "Crew kitty carried over");
  post(5, 28, 12000, "job-payment", `Pay for the last run to ${s.system.name}`);
  post(5, 28, -450, "docking", `Berth at ${s.homeBase.name}, first week`);
  post(5, 29, -720, "provisions", "Food and water: 60 person-days");
  post(6, 1, 1000, "other", `Advance against ${s.job.name}`, { job: s.job.id });
}

// ---------------------------------------------------------------------------
// the crew's advancement
// ---------------------------------------------------------------------------

/** XP questions each PC answered yes on the crew's two runs before this campaign (module award ids without the `alien.award.` prefix). */
const EARLIER_RUN_AWARDS: readonly string[][] = [
  ["participated", "danger", "money", "discovery", "buddy"],
  ["participated", "danger", "money", "extraordinary"],
  ["participated", "agenda", "money", "discovery"],
  ["participated", "panic", "danger", "money"],
];
const LAST_RUN_AWARDS: readonly string[][] = [
  ["participated", "agenda", "danger", "discovery", "extraordinary", "money"],
  ["participated", "buddy", "danger", "money", "discovery"],
  ["participated", "rival", "panic", "danger", "money"],
  ["participated", "rival", "danger", "extraordinary", "money"],
];
/** General talents the first PC may have bought, in order of preference. */
const BOUGHT_TALENTS = ["spaceship-mechanic", "zero-g-training", "eva-specialist"];

/**
 * XP from the crew's two runs before this campaign, posted as the wrap-up
 * posts it (no session record: those runs were played before this campaign's
 * log starts), and one spend between runs: the first PC learns a general
 * talent. Dates and amounts are fixed.
 */
function setupAdvancement(store: CampaignStore, s: { pcs: Entity[]; system: Entity; year: number }): void {
  const realDate = LEDGER_REAL_DATE;
  const award = (runs: readonly string[][], reason: string, inWorldDate: string) =>
    s.pcs.forEach((pc, i) => {
      const questions = (runs[i] ?? runs[0]!).map((id) => `alien.award.${id}`);
      postAward(store, alienModule, { character: pc.id, questions, reason, inWorldDate, realDate, source: { kind: "import" } });
    });
  award(EARLIER_RUN_AWARDS, "An earlier run, before the dry month", `${s.year}-04-12`);
  award(LAST_RUN_AWARDS, `The last run to ${s.system.name}`, `${s.year}-05-28`);
  const first = s.pcs[0];
  if (!first) return;
  const held = new Set(((store.get("entities", first.id)?.fields["talents"] as Array<{ id?: string }> | undefined) ?? []).map((t) => t.id));
  const talent = BOUGHT_TALENTS.find((id) => !held.has(id));
  if (talent) applySpend(store, alienModule, { character: first.id, option: "alien.spend.talent", target: talent, mode: "campaign", inWorldDate: `${s.year}-05-31`, realDate, source: { kind: "import" } });
}

// ---------------------------------------------------------------------------
// long-term agendas
// ---------------------------------------------------------------------------

/** What the GM marked for each PC's goal after the last run, by PC order (the second PC's stalled). */
export const DEMO_AGENDA_OUTCOMES: readonly string[] = ["advanced", "stalled", "advanced", "resolved"];
export const DEMO_AGENDA_JOBS = ["Job 1", "Job 2"] as const;

/**
 * The module's campaign agendas, as the app deals them: a goal, a beat and
 * open friction for each PC on the last run (Job 1), accepted onto the
 * sheets with a GM-only agenda handout and a players' friction handout each;
 * then the last run's outcomes (one goal advanced, one stalled, one
 * resolved) deal the beats for the job in hand (Job 2). Seeded runs, both
 * recorded as generator runs.
 */
function setupCampaignAgendas(store: CampaignStore, registry: RichTextRegistry, mod: LoadedModule, s: { seed: string; pcs: Entity[]; job: Entity }): void {
  const proc = campaignAgendasProcedure;
  const def = proc.longAgendas!;
  const props = (proc.inputs as { properties: Record<string, Record<string, unknown>> }).properties;
  const hint = props["campaign"]![CAMPAIGN_INPUT_HINT] as CampaignInputHint;
  const snapshot = () => campaignSnapshot(store, hint, (t) => mod.entityType(t)?.kind);
  const job = { id: s.job.id, name: s.job.name, type: s.job.type, fields: s.job.fields };
  // the crew in build order (the app passes them sorted by name)
  const pcs = s.pcs.map((pc) => ({ id: pc.id, name: pc.name, goal: "random" }));
  const accept = (graph: GeneratedGraph) => {
    const set = graph.results["longAgendaDrafts"] as LongAgendaDraftSet;
    const res = applyLongAgendaWrites(store, def, longAgendaWrites(def, set));
    for (const d of res.docs) writeDoc(registry, d.docId, d.markdown);
    acceptGeneratedGraph(store, graph, { moduleId: mod.manifest.id });
  };
  accept(runProcedure(proc, alienModule, { seed: `${s.seed}/agendas`, inputs: { campaign: snapshot(), pcs, friction: "simmering", job, jobLabel: DEMO_AGENDA_JOBS[0] } }));
  const outcomes = Object.fromEntries(s.pcs.map((pc, i) => [pc.id, DEMO_AGENDA_OUTCOMES[i]]));
  const progress = longAgendaProgress(
    def,
    s.pcs.map((pc) => store.get("entities", pc.id)!),
    outcomes,
  );
  accept(runProcedure(proc, alienModule, { seed: `${s.seed}/agendas/${DEMO_AGENDA_JOBS[1]}`, inputs: { campaign: snapshot(), pcs, friction: "simmering", job, jobLabel: DEMO_AGENDA_JOBS[1], progress } }));
}

/** What the demo's job board must deal for the posting it takes (deterministic: boards are dealt in order until one fits). */
export const DEMO_BOARD = { postings: 3, treachery: "rare", maxBoards: 400 } as const;

/** True for the demo's posting: difficulty 3, three NPCs, exactly one betrayer, and a brief with rogue humans and a xenomorph. */
export function isDemoPosting(o: Offer): boolean {
  const job = o.produced.entities[0]!;
  const brief = job.fields["siteBrief"] as JobSiteBrief | undefined;
  return (
    job.fields["difficulty"] === 3 &&
    o.produced.entities.filter((e) => e.type === "alien.character").length === 3 &&
    (job.fields["betrayers"] as string[]).length === 1 &&
    !!brief &&
    brief.inputs.hostiles.length > 0 &&
    brief.inputs.threats.some((t) => t.creature.includes("xx121"))
  );
}

/**
 * The job board between jobs: three postings dealt at the docks; the crew
 * takes the difficulty-3 one (one NPC betrays them, so its site plays as 2),
 * which adds the job, its employer, three NPCs (the contact visible to the
 * players), the players' posting handout and a site map generated from the
 * job's brief, saved with the job's site. Boards are dealt from fixed seeds
 * in order until one has such a posting.
 */
function setupJobBoard(store: CampaignStore, registry: RichTextRegistry, mod: LoadedModule, s: { seed: string; pcs: Entity[]; threads: ArcThread[] }): DemoBoard {
  const props = (jobBoard.inputs as { properties: Record<string, Record<string, unknown>> }).properties;
  const hint = props["campaign"]![CAMPAIGN_INPUT_HINT] as CampaignInputHint;
  const campaign = campaignSnapshot(store, hint, (t) => mod.entityType(t)?.kind);
  // the board seeds the first clue of the first thread; heat, clocks and contacts weight it (none have moved yet)
  const first = s.threads[0];
  const clue = first?.stages[0]?.clues[0];
  const arcs = arcsSnapshot(store.toJSON(), alienModule, { seedClue: first && clue ? `${first.id}/${clue.id}` : "none", influence: true });
  const inputs = { postings: DEMO_BOARD.postings, frame: DEMO_FRAME, treachery: DEMO_BOARD.treachery, campaign, arcs };
  let graph: GeneratedGraph | undefined;
  let offer: Offer | undefined;
  let k = 0;
  for (; k < DEMO_BOARD.maxBoards && !offer; k++) {
    graph = runProcedure(jobBoard, alienModule, { seed: `${s.seed}/board/${k}`, inputs });
    offer = (graph.results["offers"] as OfferSet).offers.find(isDemoPosting);
  }
  if (!graph || !offer) throw new Error("demo campaign: no job board dealt a difficulty-3 posting with one betrayer, rogue humans and an alien");
  // the GM pins the clue on the taken posting, as its contact's secret
  const index = (graph.results["offers"] as OfferSet).offers.indexOf(offer) + 1;
  const pinnedParts = { "offers/clue": { posting: index, slot: DEMO_ARCS.slot, at: 0 } };
  if (clue) {
    graph = runProcedure(jobBoard, alienModule, { seed: `${s.seed}/board/${k - 1}`, inputs, pinnedParts });
    offer = (graph.results["offers"] as OfferSet).offers[index - 1]!;
  }
  const def = jobBoard.offers!;
  const entities = offer.produced.entities.map((e, i) => (i === 0 ? { ...e, fields: { ...e.fields, ...(def.accept.fields ?? {}) } } : e));
  const accepted = acceptGeneratedGraph(store, { ...graph, produced: { entities, relationships: offer.produced.relationships } }, { moduleId: mod.manifest.id, ...(clue ? { pinnedParts } : {}) });
  const job = accepted.entities[0]!;
  applyOfferArcLinks(store, offer.arcLinks, { job: job.id, posting: offer.key, run: accepted.run.id, idMap: accepted.idMap, slotLabel: (id) => slotLabel(alienModule.arcs, id) });
  const h = offer.handout!;
  const handout = store.createHandout({ title: h.title, kind: "text", visibility: PLAYERS, attachedTo: { kind: "entity", id: job.id }, ...(h.purpose ? { purpose: h.purpose } : {}), withBody: true });
  writeDoc(registry, handout.bodyDoc, h.body);

  // the job's site and its map, from the job's brief
  const brief = siteMapGenerator.briefFromEntity!({ id: job.id, name: job.name, type: job.type, fields: job.fields })!;
  const site = brief.site!;
  const location = store.createEntity({ type: site.type, name: site.name, ...(site.subtype ? { subtype: site.subtype } : {}), ...(site.summary ? { summary: site.summary } : {}), fields: {} });
  store.createRelationship(site.relationship, location.id, job.id);
  const mapSeed = `${s.seed}/job-site`;
  const result = runMapGenerator(alienModule, siteMapGenerator, JSON.parse(JSON.stringify(brief.inputs)), { seed: mapSeed });
  const created = store.createMap({ name: brief.name ?? `${job.name}: site map`, location: location.id });
  store.update("maps", created.id, { layout: JSON.parse(JSON.stringify(result.layout)), generator: { id: siteMapGenerator.id, seed: mapSeed, inputs: JSON.parse(JSON.stringify(brief.inputs)), attempts: result.attempts } });

  // the live hunt on the job's site map, and the scene that puts it on the table
  setupLiveHunt(store, registry, { mapId: created.id, location: location.id, job, pcs: s.pcs });
  return { job, contact: accepted.idMap["npc-1"]!, offer };
}

interface DemoBoard {
  job: Entity;
  /** The posting's contact NPC (Mara Quill). */
  contact: Id;
  offer: Offer;
}

// ---------------------------------------------------------------------------
// campaign arcs
// ---------------------------------------------------------------------------

/** The demo's arc board: how many threads, where the board seeds the clue, the heat and where to find the contact. */
export const DEMO_ARCS = { threads: 2, slot: "npc-secret", heat: 2, favours: 1 } as const;

/** Two threads from the module's generator, sponsored by factions already in the campaign, put on the arc board. */
function setupThreads(store: CampaignStore, mod: LoadedModule, s: { seed: string }): ArcThread[] {
  const props = (campaignThread.inputs as { properties: Record<string, Record<string, unknown>> }).properties;
  const hint = props["campaign"]![CAMPAIGN_INPUT_HINT] as CampaignInputHint;
  const campaign = campaignSnapshot(store, hint, (t) => mod.entityType(t)?.kind);
  const graph = runProcedure(campaignThread, alienModule, { seed: `${s.seed}/threads`, inputs: { threads: DEMO_ARCS.threads, sponsors: "campaign", stages: "random", campaign, arcs: arcsSnapshot(store.toJSON(), alienModule) } });
  const offers = (graph.results["offers"] as OfferSet).offers;
  const accepted = acceptGeneratedGraph(store, { ...graph, produced: { entities: [], relationships: [] } }, { moduleId: mod.manifest.id });
  return offers.map((o) => createThread(store, o.arc!, { source: { module: mod.manifest.id, procedure: campaignThread.id, run: accepted.run.id, offer: o.key } }));
}

/**
 * The arcs one session in: the clue the board seeded in the taken posting was
 * found in session 1 (from Mara Quill); Mara is a crew contact who owes the
 * crew a favour and knows a clue of the second thread (seeded with her, not
 * found); the last run's employer noticed the crew; and between jobs the
 * second thread's clock rolled forward (ignored, so it moves at least one).
 */
function setupArcsInPlay(store: CampaignStore, s: { threads: ArcThread[]; board: DemoBoard; session: Id; employer: Id; homeSite: Entity; seed: string }): void {
  const [first, second] = s.threads;
  const arcs = alienModule.arcs!;
  const seeded = first ? s.board.offer.arcLinks?.find((l) => l.kind === "clue") : undefined;
  if (first && seeded?.clue) markClueFound(store, first.id, seeded.clue, { session: s.session, job: s.board.job.id, entity: s.board.contact, via: "wrap-up" });
  const known = second?.stages[0]?.clues.find((c) => c.state === "unseen");
  const mara = store.get("entities", s.board.contact)!;
  addContact(store, mara.id, {
    stance: "friendly",
    owedToCrew: DEMO_ARCS.favours,
    foundAt: `${s.homeSite.name}, at the cargo brokers' stalls`,
    place: s.homeSite.id,
    lastSeen: { job: s.board.job.id, session: s.session },
    ...(second && known ? { knows: [{ thread: second.id, clue: known.id }] } : {}),
    note: "Brokered the ore run; still owes the crew for getting her cargo past customs last month.",
  });
  if (second && known) seedClue(store, second.id, known.id, { entity: mara.id, slot: "contact", slotLabel: slotLabel(arcs, "contact"), text: `${mara.name} knows it: ${known.text}.` });
  setHeat(store, arcs, s.employer, DEMO_ARCS.heat);
  if (second) {
    const plan = planArcTicks({ arcs: Object.fromEntries(store.list("arcs").map((t) => [t.id, t])) }, arcs, `${s.seed}/between-jobs`).filter((p) => p.thread === second.id);
    applyArcTicks(store, plan, { session: s.session, note: "Between jobs" });
  }
}

/**
 * The live hunt on the job's site map (act 3): the crew has come in from the
 * start to `crewZone` (the zones on the way revealed), the XX121 stalker and
 * the UPP fire team move hidden through the site for `stretches` stretches
 * (each taking the app's suggested move), and the colonial marshal, who
 * carries the M314 motion tracker, sweeps: blips A and B. A scene outside
 * the adventure's acts ("The ore run") shows the map in table mode.
 */
export const DEMO_HUNT = {
  scene: "The ore run",
  act: 3,
  crewZone: "Z22",
  stretches: 2,
  tracker: "M314 Motion Tracker",
  sweeper: "colonial-marshal",
  /** The instant of the sweep (a fixed in-world evening). */
  at: "2026-11-07T21:30:00.000Z",
} as const;

function setupLiveHunt(store: CampaignStore, registry: RichTextRegistry, s: { mapId: Id; location: Id; job: Entity; pcs: Entity[] }): void {
  const layout = store.get("maps", s.mapId)!.layout!;
  const hunt = siteMapGenerator.hunt!;
  // the marshal draws the M314 from the ship's locker (her career's gear list carries one, p. 96)
  const sweeper = s.pcs.find((pc) => pc.tags.includes(DEMO_HUNT.sweeper)) ?? s.pcs[0]!;
  const gear = [...((store.get("entities", sweeper.id)!.fields["gear"] as Array<Record<string, unknown>> | undefined) ?? [])];
  gear.push({ name: DEMO_HUNT.tracker, weight: 1, qty: 1, supply: 5 });
  store.update("entities", sweeper.id, { fields: { ...store.get("entities", sweeper.id)!.fields, gear } });
  const sensor = carriedSensors(hunt, store.get("entities", sweeper.id)!)[0];
  if (!sensor) throw new Error("demo hunt: the sweeper carries no motion tracker");

  const location = store.get("entities", s.location)!;
  const scene = store.createScene(undefined, {
    title: DEMO_HUNT.scene,
    purpose: "The crew crosses the site with the ore; something moves in the ducts.",
    location: s.location,
    map: s.mapId,
    tags: ["demo"],
  });
  writeDoc(registry, scene.bodyDoc, `The crew hauls the ore across ${ref(location)} for ${ref(s.job)}. Something moves in the ducts, and the UPP fire team is sweeping the rings. Move the hidden threats each stretch; ${ref(sweeper)} reads them on the motion tracker.`);

  // the threats: the XX121 spawn and the UPP fire team (else the first rogue humans) from the map's marks
  const sources = huntMarkerSources(layout, hunt);
  const markOf = (x: (typeof sources)[number]) => layout.markers.find((m) => m.id === x.marker);
  const stalker = sources.find((x) => x.mover === "creature" && String(x.data["creature"]).includes("xx121")) ?? sources.find((x) => x.mover === "creature");
  const upp = sources.find((x) => markOf(x)?.data?.["group"] === "upp-squad") ?? sources.find((x) => markOf(x)?.kind === "hostile");
  const threats = [stalker, upp].filter((x): x is (typeof sources)[number] => !!x);

  // The crew stands in `crewZone`, come in from the start; the threats close in for a few stretches,
  // each taking its suggested move; the marshal sweeps. Tried on a copy first: the demo's crew zone,
  // then other floor zones in turn, until the sweep picks up every threat.
  const targetsAt = (zone: string) => s.pcs.map((pc) => ({ zone, label: pc.name }));
  const play = (crewZone: string, route: string[]) => {
    const live: SiteMapLiveState = { ...emptyLive(DEMO_HUNT.act), revealed: route, tokens: s.pcs.map((pc) => ({ id: pc.id, label: pc.name, zone: crewZone, gmOnly: false, entity: pc.id })) };
    const state: HuntState = { step: 0, tokens: threats.map((src, i) => ({ id: `t${i}`, label: src.label, zone: src.zone!, mover: src.mover, state: "hidden", home: src.zone!, trail: [], ...(src.marker ? { marker: src.marker } : {}), data: src.data, ...(src.route ? { route: src.route, routeAt: 0 } : {}) })), sweeps: [] };
    live.hunt = state;
    for (let i = 0; i < DEMO_HUNT.stretches; i++) {
      applyHuntAdvance(state, hunt.steps[0]!.id);
      for (const t of state.tokens) {
        const move = suggestHuntMove(layout, live, t, { def: siteMapGenerator, targets: targetsAt(crewZone), seed: huntSeedOf });
        if (move) applyHuntMove(state, t.id, move.best.zone, { path: move.best.path, trail: hunt.trail });
      }
    }
    return sweepReadings(layout, live, siteMapGenerator, sensor, crewZone).length;
  };
  const huntSeedOf = huntSeed(store.get("maps", s.mapId)!);
  const act = { act: DEMO_HUNT.act, live: { borders: {} }, passable: siteMapGenerator.passable };
  const floor = layout.zones.filter((z) => z.kind !== "out-of-bounds" && z.layer !== "duct" && z.id !== layout.start).map((z) => z.id);
  let crewZone: string | undefined;
  let route: string[] | undefined;
  for (const zone of [DEMO_HUNT.crewZone, ...floor.filter((z) => z !== DEMO_HUNT.crewZone)].filter((z) => floor.includes(z))) {
    const way = zonePath(layout, layout.start!, zone, act);
    if (!way) continue;
    if (!crewZone) [crewZone, route] = [zone, way];
    if (play(zone, way) >= threats.length) {
      [crewZone, route] = [zone, way];
      break;
    }
  }
  if (!crewZone || !route) return;

  // the same on the map, through the app's own live helpers
  startLive(store, s.mapId, DEMO_HUNT.act);
  revealZones(store, s.mapId, route);
  for (const pc of s.pcs) placeToken(store, s.mapId, { label: pc.name, zone: crewZone, gmOnly: false, entity: pc.id });
  const tokens = threats.map((src) => placeHuntSource(store, s.mapId, src));
  for (let i = 0; i < DEMO_HUNT.stretches; i++) {
    advanceHunt(store, s.mapId, hunt.steps[0]!.id);
    for (const id of tokens) {
      const m = store.get("maps", s.mapId)!;
      const t = huntOf(liveOf(m)).tokens.find((x) => x.id === id)!;
      const move = suggestHuntMove(layout, liveOf(m), t, { def: siteMapGenerator, targets: targetsAt(crewZone), seed: huntSeed(m) });
      if (move) moveHuntToken(store, s.mapId, id, move.best.zone, { path: move.best.path, trail: hunt.trail });
    }
  }
  recordSweep(store, s.mapId, { by: { name: sweeper.name, entity: sweeper.id }, from: crewZone, sensor, def: siteMapGenerator, at: DEMO_HUNT.at });
}

/** `date` minus `days` on the Gregorian-style module calendar (the leg's departure). */
function addDaysBack(date: string, days: number): string {
  return addDaysToDate(alienModule.calendar, date, -days);
}

/** Plain JSON for the web app's "Load demo campaign" (load `maps` into a store, `docs` into the registry). */
export function demoCampaignJSON(seed: string = DEMO_SEED): { maps: CampaignMaps; docs: Record<Id, string> } {
  const { store, registry, maps, docs } = buildDemoCampaign({ seed });
  registry.closeAll();
  store.destroy();
  return { maps, docs };
}
