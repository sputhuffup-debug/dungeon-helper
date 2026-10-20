/**
 * "Cold Harbor": the cinematic demo campaign (one-shot, Alien cinematic mode).
 *
 * Built the way the guided cinematic builder builds an adventure: the
 * builder's template frame (three acts with default lengths and fear stages,
 * one blank event each), the builder id, cast roles (PCs, crew NPCs,
 * locations with puzzles), narrative fields, one agenda handout per PC per act
 * (core `ensureAgendas`), events with the mandatory flag stored as templates
 * store it, then every field the builder asks for filled in. The site map
 * comes from the module's `alien.map.site` generator, briefed from the
 * adventure's review context through `inputsFromAdventure`, and is linked to
 * every scene and to the station location. Live table state, a running
 * infection and a planned first session make table mode show it all at once.
 *
 * Original content (not a published scenario). Rule numbers come from the
 * module; text is our own. Deterministic: names, fields, text and the map
 * depend only on the seed and the module version; ids and timestamps are fresh.
 *
 * Browser-safe: no `node:` imports.
 */
import { createRng, runAdventureReview, type AdventureBuilderDef, type CastRoleDef, type EntityTypeDef, type LoadedModule, type MapGeneratorDef, type ReviewResult, type Rng, type SiteLayout, type TemplateAdventure } from "@campaign-forge/module-sdk";
import {
  CampaignStore,
  RichTextRegistry,
  addPing,
  addToCast,
  autoTickChecklist,
  buildAdventureReviewContext,
  castMemberFields,
  checklistItemsFor,
  createCastMember,
  docIdsOf,
  ensureAgendas,
  fromMarkdown,
  moduleChecklistItems,
  nameResolver,
  narrativeDefaults,
  newId,
  placeToken,
  plainText,
  presetToEntity,
  revealZones,
  runMapGenerator,
  sessionChecklist,
  setBorderState,
  setChecklistItem,
  startLive,
  toMarkdown,
  type Act,
  type Adventure,
  type CampaignMaps,
  type Entity,
  type Id,
  type Scene,
  type Session,
  type Visibility,
} from "@campaign-forge/core";
import { loadModule } from "@campaign-forge/module-sdk";
import { CINEMATIC, CINEMATIC_BUILDER_ID, DEFAULT_YEAR, MAP_GENERATOR_ID, alienModule, careerItems, type CareerItem } from "@campaign-forge/module-alien";
import { startInfection } from "./infection";

export const CINEMATIC_DEMO_SEED = "cold-harbor";
export const CINEMATIC_DEMO_NAME = "Cold Harbor Relay";
export const CINEMATIC_ADVENTURE_TITLE = "Cold Harbor";

export interface BuildCinematicDemoOptions {
  seed?: string;
  name?: string;
}

export interface CinematicDemoCampaign {
  store: CampaignStore;
  registry: RichTextRegistry;
  maps: CampaignMaps;
  /** Rich-text bodies as Markdown, keyed by doc id (`[[id|name]]` references). */
  docs: Record<Id, string>;
  /** Ids of the main records, for tests and the CLI. */
  ids: { adventure: Id; map: Id; station: Id; session: Id; sessionZero: Id; host: Id; facehugger: Id };
  /** The builder's review of the finished adventure. */
  review: ReviewResult;
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

function sample<T>(rng: Rng, items: readonly T[], n: number): T[] {
  const pool = [...items];
  const out: T[] = [];
  while (out.length < n && pool.length > 0) out.push(pool.splice(rng.int(0, pool.length - 1), 1)[0] as T);
  return out;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const ref = (e: Pick<Entity, "id" | "name">): string => `[[${e.id}|${e.name}]]`;

function writeDoc(registry: RichTextRegistry, docId: Id | undefined, markdown: string): void {
  if (!docId) return;
  fromMarkdown(registry.open(docId), markdown);
}

function requireEntityType(mod: LoadedModule, id: string): EntityTypeDef {
  const def = mod.entityType(id);
  if (!def) throw new Error(`cinematic demo: module has no entity type "${id}"`);
  return def;
}

const normalize = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** A gear line for a career gear name, linked to the module's item preset when one matches (as the NPC presets do). */
function gearLine(mod: LoadedModule, name: string): Record<string, unknown> {
  const items = mod.presetsFor("alien.item");
  const item = items.find((p) => normalize(p.name) === normalize(name)) ?? items.find((p) => normalize(name).includes(normalize(p.name)) && normalize(p.name).length > 4);
  const w = item?.fields["weight"];
  const line: Record<string, unknown> = { name, weight: typeof w === "number" ? w : 1, qty: 1 };
  if (item) line.itemId = item.id;
  return line;
}

/**
 * Starting stats by the creation rules (p. 25-26), from the career's data: the
 * key attribute at 5 and the other three at 3 (14 points); 3, 3 and 2 in the
 * three key skills plus 1 in two other skills (10 points); one of the
 * career's three talents, two of its gear items, a signature item and a look.
 */
function pregenFields(mod: LoadedModule, career: CareerItem, rng: Rng, skillIds: readonly string[]): Record<string, unknown> {
  const attributes: Record<string, number> = { strength: 3, agility: 3, wits: 3, empathy: 3 };
  attributes[career.keyAttribute] = 5;
  const order = sample(rng.fork("key-skills"), career.keySkills, 3);
  const skills: Record<string, number> = Object.fromEntries(skillIds.map((s) => [s, 0]));
  order.forEach((s, i) => (skills[s] = i < 2 ? 3 : 2));
  for (const s of sample(rng.fork("other-skills"), skillIds.filter((x) => !career.keySkills.includes(x)), 2)) skills[s] = 1;
  return {
    career: career.id,
    attributes,
    skills,
    talents: [{ id: pick(rng.fork("talent"), career.talents), count: 1 }],
    gear: sample(rng.fork("gear"), career.gear.filter((g) => !/^D6 doses/i.test(g)), 2).map((g) => gearLine(mod, g)),
    signatureItem: pick(rng.fork("signature"), career.signatureItems),
    appearance: sample(rng.fork("appearance"), career.appearances, 2).join("; "),
  };
}

// ---------------------------------------------------------------------------
// the script (original text)
// ---------------------------------------------------------------------------

interface PcSpec {
  key: string;
  name: string;
  career: string;
  background: string;
  agendas: [string, string, string];
  signOff: string;
}

const PCS: PcSpec[] = [
  {
    key: "rosa",
    name: "Rosa Ilunga",
    career: "officer",
    background: "Relief team lead on her third Frontier rotation. She took this run because the hazard bonus clears her family's colony debt.",
    agendas: [
      "Get the inner lock open and the whole relief team aboard within the first hour.",
      "Keep the team together; talk anyone who wants to split up out of it, whatever the reason.",
      "Get every survivor onto the shuttle, even if it means leaving the specimen and the bonus behind.",
    ],
    signOff: "This is Rosa Ilunga, relief lead. Cold Harbor is lost. If you find this, do not dock. End of report.",
  },
  {
    key: "ana",
    name: "Ana Kovac",
    career: "medic",
    background: "Company medic who trained under Dr. Lindqvist. She signed the annex's biohazard waiver last year without reading it.",
    agendas: [
      "Keep Dr. Lindqvist alive and stop anyone from pulling the thing off her face.",
      "Find out what is growing inside Lindqvist before the others do, and keep your notes to yourself.",
      "Get Lindqvist's research off the station, even if the people who carry it do not make it.",
    ],
    signOff: "Ana Kovac, medical. I signed the waiver. I am sorry. I kept her notes; they are on this drive.",
  },
  {
    key: "teo",
    name: "Teo Marsh",
    career: "roughneck",
    background: "Station technician who helped build the relay's heat exchangers and knows every crawlway by touch.",
    agendas: [
      "Find out why the heat failed and get the reactor back up to full power.",
      "Quietly copy Elias Brandt's access log; you are sure he is lying about the specimen pod.",
      "Expose Brandt to the others and stop him from reaching the shuttle with the specimen, by force if needed.",
    ],
    signOff: "Teo Marsh. The heat never failed. Somebody turned it off. Check the synthetic's logs.",
  },
  {
    key: "jun",
    name: "Jun Akiyama",
    career: "company-agent",
    background: "Weyland-Yutani liaison attached to the relief team at the last minute, with a sealed brief from the research division.",
    agendas: [
      "Recover any biological material from the annex intact and keep it hidden from the crew.",
      "Make sure the specimen survives the night, whatever it costs the station staff or the relief team.",
      "Get the specimen aboard the company shuttle; if a crewmate stands in the way, shoot them.",
    ],
    signOff: "Akiyama, Weyland-Yutani liaison. Specimen status: lost. Recommend a full survey team. Personal note: I would not come.",
  },
];

interface NpcSpec {
  key: string;
  name: string;
  preset: string;
  fields: Record<string, unknown>;
}

const NPCS: NpcSpec[] = [
  {
    key: "lindqvist",
    name: "Dr. Mara Lindqvist",
    preset: "alien.npc.scientist",
    fields: {
      role: "Research lead of the annex",
      trait: "Brilliant, proud, sure she is the only adult in the room",
      appearance: "Tall, grey braid, frostbitten fingertips, lab coat over a thermal suit",
      voice: "Precise and clipped; corrects people's grammar when she is frightened",
      goal: "Publish the first study of the specimen under her own name",
      fears: "Being remembered as the scientist who doomed her station",
      secret: "She opened the specimen pod against orders and lied in the annex log about it",
      tells: "Keeps touching her sternum; eats anything put in front of her; avoids the Cold Lab",
      sampleLines: "\"It is a once-in-a-century find. Do you understand that?\" / \"I am fine. I am only hungry.\"",
      arc: "Act 1: found unconscious with the creature on her face. Act 2: wakes, lies about what happened, and the chestburster kills her. Act 3: her notes are all that is left.",
    },
  },
  {
    key: "brandt",
    name: "Elias Brandt",
    preset: "alien.npc.android-covert",
    fields: {
      role: "Comms officer, the only staff member still on his feet",
      trait: "Unfailingly polite and helpful",
      appearance: "Neat company fatigues, clean-shaven, no frost on him at all",
      voice: "Warm, unhurried, uses everyone's first name from the start",
      goal: "Deliver the specimen to the company shuttle alive",
      fears: "Nothing; he imitates worry when someone is watching",
      secret: "He is a synthetic with orders to keep the specimen alive; he unlocked the pod himself and will betray the crew to protect it",
      tells: "Never shivers in the unheated corridors; answers before the console finishes loading; his coffee is always full and always cold",
      sampleLines: "\"Take all the time you need. I have kept the lights on for nine days.\" / \"Let us not be hasty about the specimen.\"",
      arc: "Act 1: the helpful survivor. Act 2: his story starts to crack. Act 3: he turns, sets the reactor to scram and tries to lock the crew out of the Shuttle Bay.",
      android: true,
      secretAndroid: true,
      coverAttributes: { strength: 3, agility: 3, wits: 4, empathy: 3 },
      fairClues: [
        "He never shivers, even where the crew's breath fogs.",
        "His coffee mug is always full and always cold.",
        "The comms log shows him working nine days without a single sleep shift.",
      ],
      secretOrders: "Keep the specimen alive and get it aboard the company shuttle. The relief crew is expendable.",
    },
  },
  {
    key: "okoro",
    name: "Nell Okoro",
    preset: "alien.npc.pilot",
    fields: {
      role: "Pilot of the station's company shuttle",
      trait: "Jokes when scared, and she is scared all the time now",
      appearance: "Flight jacket over two sweaters, mirrored shades pushed up into her hair",
      voice: "Fast and dry, with flight slang",
      goal: "Get off Cold Harbor before anything else goes wrong",
      fears: "Dying in the dark where nobody will find her",
      secret: "She hid in the Shuttle Bay for three days and left the others to freeze",
      tells: "Always knows the time to the second; flinches at duct noises",
      sampleLines: "\"Clamps off, wheels up, nobody waves goodbye.\" / \"I am not going back in there.\"",
      arc: "Act 1: hiding. Act 2: bargains for a seat. Act 3: will abandon anyone not aboard when the countdown hits zero.",
    },
  },
];

interface LocationSpec {
  key: string;
  name: string;
  fields: Record<string, string>;
}

const LOCATIONS: LocationSpec[] = [
  {
    key: "ring",
    name: "Docking Ring",
    fields: {
      description: "A frost-rimed ring of berths where the tender docks; viewports iced over on the inside.",
      secret: "A cargo manifest stuck under a bench lists one specimen pod, received eleven days ago.",
      puzzle: "The inner lock is on station lockdown and refuses the relief codes.",
      puzzleClue: "A maintenance tag on the lockdown panel says to reset it at the breaker, not at the panel.",
      puzzleSolution: "Pull the lockdown breaker in the service locker beside the lock; the door cycles normally.",
      puzzleFallback: "Cut the inner door with a torch: a shift of loud work that wakes anything aboard.",
      threat: "When the door finally opens, every light on the ring starts to blink.",
    },
  },
  {
    key: "lab",
    name: "Cold Lab",
    fields: {
      description: "The research annex's freezer lab, kept below zero; benches, sample racks and an open specimen pod.",
      secret: "The annex log was edited: the pod was opened on Lindqvist's order, not by accident.",
      puzzle: "The specimen freezer's biolock asks for a spoken passphrase.",
      puzzleClue: "Lindqvist's voice memos end every entry with the same two words: Tethra blue.",
      puzzleSolution: "Say \"Tethra blue\" in a calm voice; the biolock opens.",
      puzzleFallback: "Smash the freezer glass: it opens, and the annex alarm sounds for a full stretch.",
      threat: "The facehugger clings to Lindqvist on the centre bench.",
    },
  },
  {
    key: "control",
    name: "Relay Control",
    fields: {
      description: "The relay's command deck, with the uplink console and a window onto the big dish.",
      secret: "Brandt's access log shows he unlocked the specimen pod himself.",
      puzzle: "The uplink dish ignores commands; its alignment table has been wiped.",
      puzzleClue: "A star chart in Brandt's locker has three stars circled in red, numbered one to three.",
      puzzleSolution: "Align the dish to the three circled stars in order; the uplink locks on.",
      puzzleFallback: "Go out on the hull and turn the dish by hand: two stretches in vacuum with air supply rolls.",
      threat: "Vents above the console, where something can drop down unseen.",
    },
  },
  {
    key: "bay",
    name: "Shuttle Bay",
    fields: {
      description: "A hangar with the station's company shuttle in launch clamps and a pressure door to the ring.",
      secret: "Okoro has stocked the shuttle with food for one.",
      puzzle: "The launch clamps are slaved to a company authorization code.",
      puzzleClue: "Akiyama's corporate card carries a clearance chip; Brandt's log shows the same code in use.",
      puzzleSolution: "Swipe the corporate card, or key in the code from Brandt's log, and the clamps release.",
      puzzleFallback: "Torch the clamps: loud, and the shuttle leaves damaged.",
      threat: "The grown creature waits in the hangar's roof ducts.",
    },
  },
];

interface EventSpec {
  title: string;
  mandatory: boolean;
  /** PC or NPC key the event is aimed at; everyone when absent. */
  aimedAt?: string;
  trigger: string;
  body: string;
  readAloud?: string;
  location: string;
  participants?: string[];
}

interface ActSpec {
  title: string;
  goal: string;
  pacing: string;
  pressure: string;
  relief?: string;
  actEnd?: string;
  events: EventSpec[];
}

// Text is ours. Act texts name only the rooms they happen in: the map generator places a
// location's key room in the first act whose text names it (module `inputsFromAdventure`).
const ACTS: ActSpec[] = [
  {
    title: "Setup",
    goal: "The relief team boards the dark station, finds Lindqvist facehugged in the Cold Lab and meets the helpful Brandt.",
    pacing: "Slow and cold. Let them explore; show the frost, the dead lights and the empty bunks before anything moves.",
    pressure: "The heat is failing; the station creaks as it cools and breath fogs in every corridor.",
    relief: "Brandt brews real coffee in the galley and tells a funny story about the last relief crew, until the lights cut out mid-sentence.",
    actEnd: "The creature drops off Lindqvist's face, dead, and she starts to breathe on her own.",
    events: [
      {
        title: "Docking",
        mandatory: true,
        trigger: "Start of play",
        body: "The tender mates with the Docking Ring. Frost on the inside of the viewports, and the inner lock is on lockdown.",
        readAloud: "The clamps bite. The tender shudders and goes quiet. Through the porthole the ring is dark except for one amber light, blinking.",
        location: "ring",
      },
      {
        title: "Brandt's welcome",
        mandatory: false,
        aimedAt: "rosa",
        trigger: "Once the inner lock is open",
        body: "Brandt steps out of the dark, calm and polite, and says he has kept the relay running alone for nine days. He offers coffee.",
        location: "ring",
        participants: ["brandt"],
      },
      {
        title: "The Cold Lab",
        mandatory: true,
        aimedAt: "ana",
        trigger: "When the team reaches the annex",
        body: "Lindqvist lies on the centre bench in the Cold Lab with a facehugger wrapped around her face. Her pulse is steady; the specimen pod beside her is open and empty.",
        location: "lab",
        participants: ["lindqvist", "facehugger"],
      },
      {
        title: "Company mail",
        mandatory: false,
        aimedAt: "jun",
        trigger: "Any quiet moment in the annex",
        body: "Jun's handheld chirps: an encrypted message from the research division asks for any biological material, recovered intact.",
        location: "lab",
      },
    ],
  },
  {
    title: "Tilt",
    goal: "Lindqvist wakes up starving, Brandt's story starts to crack, and the chestburster tears out of her while the team works on the uplink.",
    pacing: "Raise the pressure, give them one warm meal, then break it. Award Story Points at the end of the act without saying why.",
    pressure: "Something moves in the ducts; the motion tracker pings twice and goes quiet.",
    relief: "The team gets the galley heater running and eats hot ration packs while Lindqvist sleeps, until she wakes up screaming.",
    actEnd: "The uplink comes back on line and shows the company shuttle is already fuelled, with Brandt listed as its only passenger.",
    events: [
      {
        title: "She wakes up hungry",
        mandatory: false,
        aimedAt: "ana",
        trigger: "The facehugger has dropped off",
        body: "Lindqvist wakes ravenous and insists she is fine. Call for an Observation roll: she keeps touching her chest.",
        location: "lab",
        participants: ["lindqvist"],
      },
      {
        title: "The chestburster",
        mandatory: true,
        trigger: "During the uplink repair, or whenever the tracker says it is born",
        body: "Lindqvist convulses at the console in Relay Control. The chestburster tears out of her and vanishes into a vent. Panic rolls for everyone who sees it.",
        location: "control",
        participants: ["lindqvist"],
      },
      {
        title: "Brandt's log",
        mandatory: false,
        aimedAt: "teo",
        trigger: "Teo works the console alone",
        body: "Teo finds Brandt's access log: he unlocked the specimen pod himself, two hours before Lindqvist went in.",
        location: "control",
        participants: ["brandt"],
      },
      {
        title: "Running cold",
        mandatory: false,
        trigger: "After the birth",
        body: "The heat dies for good and the air scrubbers drop to backup. Air supply rolls every stretch away from the galley.",
        location: "control",
      },
    ],
  },
  {
    title: "Showdown",
    goal: "The grown xenomorph hunts the crew toward the Shuttle Bay while Brandt tries to get the specimen aboard; launch before the countdown ends.",
    pacing: "Horror: show the creature. Short, deadly fights; if a PC turns on the group, call it and play it out.",
    pressure: "A 30-minute countdown: Brandt has set the reactor to scram, and the shuttle launches when it reaches zero.",
    events: [
      {
        title: "The hunt",
        mandatory: true,
        trigger: "Start of the act",
        body: "The xenomorph, now a Drone, moves through the ducts toward the crew. Motion tracker pings close in from two sides.",
        location: "bay",
      },
      {
        title: "Brandt turns",
        mandatory: false,
        aimedAt: "rosa",
        trigger: "When the crew reaches the hangar door",
        body: "Brandt drops the act: he is a synthetic, and he locks the pressure door with the crew outside and the specimen case in his hand.",
        location: "bay",
        participants: ["brandt"],
      },
      {
        title: "Launch",
        mandatory: true,
        aimedAt: "jun",
        trigger: "Countdown at five minutes",
        body: "Release the clamps and launch the shuttle before the scram. Okoro will not wait for anyone; whoever is left behind stays with the station.",
        location: "bay",
        participants: ["okoro"],
      },
    ],
  },
];

const ADVENTURE = {
  premise: "A Weyland-Yutani relay above the ice moon Tethra-4 went quiet after its research annex took in a specimen pod. A relief team docks to restore the uplink.",
  tagline: "The relay stopped talking nine days ago. Your shift starts now.",
  theme: "secret-research",
  targetHours: 4,
  contentNote:
    "Agreed at session 0: body horror (implantation and a chestburster), crew deaths and a synthetic's betrayal are in. No harm to children. Fade to black on request; the X-card is on the table.",
  playerIntro:
    "Cold Harbor is a Weyland-Yutani deep-space relay anchored above the ice moon Tethra-4. Nine days ago its signal dropped to a carrier tone.\n\nYour relief team rides the tender *Halvard* in to find out why, restore the uplink and bring the station staff home. The contract pays a hazard bonus if the uplink is live within twelve hours.",
  gmSituation:
    "The research annex took in a specimen pod recovered from a drifting survey probe. Dr. Lindqvist opened it against orders; a facehugger took her in the Cold Lab.\n\nThe comms officer, Elias Brandt, is a synthetic with orders to keep the specimen alive and get it onto the company shuttle, crew expendable. He shut the heat down to keep the staff in their bunks; most of them froze. The pilot, Nell Okoro, hid in the hangar.",
  truthTie: "Ana Kovac trained under Lindqvist and signed the annex's biohazard waiver without reading it; the specimen is on station because of her signature.",
  threats:
    "A facehugger already on Lindqvist (Act 1); the chestburster it seeds (Act 2); the grown xenomorph Drone (Act 3). Brandt, the synthetic, works against the crew throughout.",
  zoneOrder: "Docking Ring > Cold Lab > Relay Control > Shuttle Bay",
  countdown: "Brandt sets the reactor to scram: 30 minutes on the countdown tracker. The shuttle launches when it reaches zero, with or without the crew.",
  openingNarration:
    "The tender Halvard drifts the last hundred metres on thrusters. Cold Harbor hangs above Tethra-4 like a broken wheel, every window dark. The docking clamps bite, the hull groans, and a single amber light on the ring starts to blink. What do you do?",
  epilogue:
    "Each survivor records a last report on the shuttle's beacon before hypersleep. The beacon keeps transmitting after they are asleep.",
};

// ---------------------------------------------------------------------------
// the build
// ---------------------------------------------------------------------------

function requireBuilder(mod: LoadedModule): AdventureBuilderDef {
  const builder = mod.builder(CINEMATIC_BUILDER_ID);
  if (!builder) throw new Error(`cinematic demo: module has no builder "${CINEMATIC_BUILDER_ID}"`);
  return builder;
}

function role(builder: AdventureBuilderDef, id: string): CastRoleDef {
  const r = builder.cast.find((x) => x.id === id);
  if (!r) throw new Error(`cinematic demo: builder has no cast role "${id}"`);
  return r;
}

function requireGenerator(mod: LoadedModule): MapGeneratorDef {
  const g = (mod.module.mapGenerators ?? []).find((x) => x.id === MAP_GENERATOR_ID);
  if (!g) throw new Error(`cinematic demo: module has no map generator "${MAP_GENERATOR_ID}"`);
  return g;
}

/** Top-level defaults of a generator's inputs schema (what the workbench's brief starts from). */
function inputDefaults(g: MapGeneratorDef): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const props = (g.inputs as { properties?: Record<string, { default?: unknown }> }).properties ?? {};
  for (const [k, s] of Object.entries(props)) if (s && s.default !== undefined) out[k] = clone(s.default);
  return out;
}

/**
 * Create the adventure as the guided builder does (apps/web `instantiateBuilder`):
 * the builder's template frame, the builder id, one empty list per cast role and
 * the module's narrative field defaults under the template's own fields.
 */
function instantiateBuilder(store: CampaignStore, mod: LoadedModule, builder: AdventureBuilderDef, title: string): Adventure {
  const template = builder.templateId ? mod.template(builder.templateId) : undefined;
  const scaffold = (template?.scaffold ?? { acts: [] }) as TemplateAdventure & { fields?: Record<string, unknown>; acts: Array<TemplateAdventure["acts"][number] & { fields?: Record<string, unknown> }> };
  return store.transact(() => {
    const adv = store.createAdventure({ title, status: "planned", withDocs: true, ...(template ? { templateId: template.id } : {}) });
    const actDefaults = narrativeDefaults(mod, "act", CINEMATIC);
    const sceneDefaults = narrativeDefaults(mod, "scene", CINEMATIC);
    for (const ta of scaffold.acts) {
      const act = store.createAct(adv.id, { number: ta.number, goal: ta.goal, withPacingDoc: true, ...(ta.title ? { title: ta.title } : {}) });
      store.update("acts", act.id, { fields: { ...actDefaults, ...clone(ta.fields ?? {}) } });
      for (const ts of ta.scenes ?? []) {
        const mandatory = ts.mandatory === true;
        const scene = store.createScene(act.id, {
          title: ts.purpose || "New scene",
          tags: [mandatory ? "mandatory" : "optional"],
          events: [{ id: newId(), text: ts.purpose, mandatory }],
          withReadAloudDoc: true,
          ...(ts.purpose ? { purpose: ts.purpose } : {}),
        });
        store.update("scenes", scene.id, { fields: { ...sceneDefaults, ...clone(ts.fields ?? {}) } });
      }
    }
    const cast: Record<string, Id[]> = {};
    for (const r of builder.cast) cast[r.id] = [];
    const fields = { ...narrativeDefaults(mod, "adventure", CINEMATIC), ...clone(scaffold.fields ?? {}) };
    return store.update("adventures", adv.id, { builderId: builder.id, cast, fields });
  });
}

/** Build the cinematic demo campaign into a fresh store and rich-text registry. */
export function buildCinematicDemo(opts: BuildCinematicDemoOptions = {}): CinematicDemoCampaign {
  const seed = opts.seed ?? CINEMATIC_DEMO_SEED;
  const name = opts.name ?? CINEMATIC_DEMO_NAME;
  const rng = createRng(`seed-campaign/cinematic/${seed}`);
  const mod = loadModule(alienModule, { skipProcedureRuns: true });
  const builder = requireBuilder(mod);
  const generator = requireGenerator(mod);
  const registry = new RichTextRegistry();
  const year = DEFAULT_YEAR;

  const cal = alienModule.calendar;
  const store = CampaignStore.create({
    name,
    moduleId: mod.manifest.id,
    moduleVersion: mod.manifest.version,
    mode: CINEMATIC,
    calendarId: cal.id,
    currentDate: `${year}-03-14`,
    gmName: "GM",
    settings: { seed, demo: "cinematic" },
  });

  // -- the adventure, from the builder's frame ---------------------------------
  const created = instantiateBuilder(store, mod, builder, CINEMATIC_ADVENTURE_TITLE);
  const adventureId = created.id;
  store.update("adventures", adventureId, { premise: ADVENTURE.premise, tags: ["demo", "one-shot"] });

  // -- the station that holds the map, and the cast locations inside it --------
  const locationType = requireEntityType(mod, "alien.location");
  const station = store.createEntity({
    type: "alien.location",
    subtype: "site",
    name: "Cold Harbor Relay",
    summary: "A Weyland-Yutani deep-space relay and research annex above the ice moon Tethra-4.",
    fields: castMemberFields(locationType, { defaults: { description: "A ring-and-spoke relay station: docking ring, research annex, command deck and a hangar for the company shuttle." } }),
    visibility: PLAYERS,
    tags: ["demo"],
  });

  const locations = new Map<string, Entity>();
  for (const spec of LOCATIONS) {
    const e = createCastMember(store, mod, adventureId, role(builder, "locations"), spec.name);
    const fields = { ...e.fields, ...spec.fields };
    locations.set(spec.key, store.update("entities", e.id, { fields, summary: spec.fields["description"] ?? "", visibility: PLAYERS }));
    store.createRelationship("within", e.id, station.id, undefined, PLAYERS);
  }

  // -- pregenerated PCs with full sheets ----------------------------------------
  const skillIds = Object.keys((requireEntityType(mod, "alien.character").schema as { properties: { skills: { properties: Record<string, unknown> } } }).properties.skills.properties);
  const people = new Map<string, Entity>();
  const pcs: Entity[] = [];
  for (const spec of PCS) {
    const career = careerItems.find((c) => c.id === spec.career);
    if (!career) throw new Error(`cinematic demo: no career "${spec.career}"`);
    const e = createCastMember(store, mod, adventureId, role(builder, "pcs"), spec.name);
    const fields = { ...e.fields, ...pregenFields(mod, career, rng.fork(`pc/${spec.key}`), skillIds), background: spec.background, isPC: true };
    const pc = store.update("entities", e.id, { fields, summary: `${career.name}. ${spec.background}`, visibility: PLAYERS, tags: ["pc", "pregenerated"] });
    people.set(spec.key, pc);
    pcs.push(pc);
  }

  // -- crew NPCs from the module's typical NPC stat lines (p. 258-259) ----------
  for (const spec of NPCS) {
    const preset = mod.preset(spec.preset);
    if (!preset) throw new Error(`cinematic demo: module has no preset "${spec.preset}"`);
    const e = presetToEntity(store, preset, { name: spec.name, fields: { ...castMemberFields(requireEntityType(mod, "alien.character"), role(builder, "npcs")), ...clone(preset.fields), ...clone(spec.fields), isPC: false }, visibility: GM });
    addToCast(store, adventureId, "npcs", e.id);
    people.set(spec.key, e);
  }
  const lindqvist = people.get("lindqvist")!;
  const brandt = people.get("brandt")!;
  const okoro = people.get("okoro")!;
  store.createRelationship("found_at", lindqvist.id, locations.get("lab")!.id, "Facehugged on the centre bench", GM);
  store.createRelationship("found_at", brandt.id, locations.get("control")!.id, undefined, GM);
  store.createRelationship("found_at", okoro.id, locations.get("bay")!.id, "Hiding in the shuttle", GM);
  store.createRelationship("knows", people.get("ana")!.id, lindqvist.id, "Trained under her", PLAYERS);
  store.createRelationship("rival_of", people.get("teo")!.id, people.get("jun")!.id, "Company man against station hand", PLAYERS);

  // -- the creature threat ------------------------------------------------------
  const huggerPreset = mod.preset("alien.creature.xx121-facehugger");
  if (!huggerPreset) throw new Error("cinematic demo: module has no facehugger preset");
  const facehugger = presetToEntity(store, huggerPreset, { name: "Facehugger (Cold Lab specimen)", visibility: GM });
  store.createRelationship("found_at", facehugger.id, locations.get("lab")!.id, "Attached to Dr. Lindqvist", GM);
  people.set("facehugger", facehugger);

  // -- narrative fields: basics, situation, opening and epilogue ----------------
  const adventure = store.get("adventures", adventureId)!;
  const signOffs = Object.fromEntries(PCS.map((p) => [people.get(p.key)!.id, p.signOff]));
  store.update("adventures", adventureId, {
    fields: {
      ...(adventure.fields ?? {}),
      tagline: ADVENTURE.tagline,
      year,
      theme: ADVENTURE.theme,
      targetHours: ADVENTURE.targetHours,
      contentNote: ADVENTURE.contentNote,
      truthTie: ADVENTURE.truthTie,
      threats: ADVENTURE.threats,
      zoneOrder: ADVENTURE.zoneOrder,
      countdown: ADVENTURE.countdown,
      openingNarration: ADVENTURE.openingNarration,
      signOffs,
    },
  });
  writeDoc(registry, adventure.playerIntroDoc, ADVENTURE.playerIntro);
  writeDoc(registry, adventure.gmSituationDoc, ADVENTURE.gmSituation);
  writeDoc(registry, adventure.epilogueDoc, ADVENTURE.epilogue);

  // -- the three acts and their events ------------------------------------------
  const sceneDefaults = narrativeDefaults(mod, "scene", CINEMATIC);
  const acts: Act[] = adventure.acts.map((id) => store.get("acts", id)!);
  const scenes: Scene[] = [];
  ACTS.forEach((spec, i) => {
    const act = acts[i];
    if (!act) throw new Error(`cinematic demo: the builder frame has no act ${i + 1}`);
    store.update("acts", act.id, {
      title: spec.title,
      goal: spec.goal,
      fields: { ...(act.fields ?? {}), pressure: spec.pressure, ...(spec.relief ? { relief: spec.relief } : {}), ...(spec.actEnd ? { actEnd: spec.actEnd } : {}) },
    });
    writeDoc(registry, act.pacingDoc, spec.pacing);
    spec.events.forEach((ev, j) => {
      const loc = locations.get(ev.location);
      if (!loc) throw new Error(`cinematic demo: no location "${ev.location}"`);
      const events = [{ id: newId(), text: ev.title, mandatory: ev.mandatory }];
      const tags = [ev.mandatory ? "mandatory" : "optional"];
      const participants = (ev.participants ?? []).map((k) => people.get(k)!.id);
      const aimedAt = ev.aimedAt ? people.get(ev.aimedAt)!.id : "everyone";
      // the frame's blank first event is filled in; the rest are added as the builder adds them
      const first = j === 0 ? store.get("scenes", store.get("acts", act.id)!.scenes[0]!) : undefined;
      const scene = first
        ? store.update("scenes", first.id, { title: ev.title, tags, events, location: loc.id, participants })
        : store.createScene(act.id, { title: ev.title, tags, events, location: loc.id, participants, withReadAloudDoc: true });
      const withFields = store.update("scenes", scene.id, { fields: { ...sceneDefaults, ...(scene.fields ?? {}), aimedAt, trigger: ev.trigger } });
      writeDoc(registry, withFields.bodyDoc, ev.body);
      if (ev.readAloud) writeDoc(registry, withFields.readAloudDoc, ev.readAloud);
      scenes.push(withFields);
    });
  });

  // -- agendas: one handout per PC per act ----------------------------------------
  for (const spec of PCS) {
    const pc = people.get(spec.key)!;
    const byAct = ensureAgendas(store, adventureId, pc.id);
    acts.forEach((act, i) => writeDoc(registry, byAct[act.id]?.bodyDoc, spec.agendas[i] ?? ""));
  }

  // -- the review, as the builder's Review step runs it ------------------------
  const docText = (id: Id | undefined) => (id && registry.has(id) ? plainText(registry.open(id)) : "");
  const reviewContext = buildAdventureReviewContext(store, docText, mod, adventureId, { mode: CINEMATIC, roles: builder.cast.map((r) => r.id) });
  const review = runAdventureReview(builder, reviewContext);

  // -- the site map, briefed from the adventure ---------------------------------
  const supplied = generator.inputsFromAdventure?.(reviewContext) ?? {};
  const inputs: Record<string, unknown> = { ...inputDefaults(generator), ...Object.fromEntries(Object.entries(supplied).filter(([, v]) => v !== undefined).map(([k, v]) => [k, clone(v)])) };
  const mapSeed = seed;
  const result = runMapGenerator(alienModule, generator, clone(inputs), { seed: mapSeed });
  const created2 = store.createMap({ name: `${CINEMATIC_ADVENTURE_TITLE} site map`, location: station.id });
  const map = store.update("maps", created2.id, { layout: clone(result.layout), generator: { id: generator.id, seed: mapSeed, inputs, attempts: result.attempts }, adventure: adventureId });
  for (const s of scenes) store.update("scenes", s.id, { map: map.id });

  // -- sessions: a finished session 0 and the planned one-shot -------------------
  const checklist = sessionChecklist(store.meta(), moduleChecklistItems(alienModule.templates, mod.manifest.id));
  const zero = store.createSession({ number: 0, date: "2026-11-07", title: "Pitch and safety", status: "planned" });
  store.update("sessions", zero.id, {
    status: "done",
    summary: "Pitched Cold Harbor, agreed the content note and the X-card, picked the four pregenerated PCs and read their backgrounds aloud. Act 1 agendas go out at the start of session 1.",
  });
  writeDoc(registry, zero.logDoc, "Pitch, content note, X-card. Players chose: Rosa, Ana, Teo, Jun.");
  for (const item of checklist) setChecklistItem(store, zero.id, item.id, true);

  const session = store.createSession({ number: 1, date: "2026-11-14", title: "Cold Harbor", status: "planned" });
  store.update("sessions", session.id, {
    nextPlan: [
      "Hand out the Act 1 agendas before the opening narration.",
      "Run the opening, then let them work the Docking Ring lock.",
      "Keep an eye on the life-cycle tracker: Lindqvist's facehugger drops off within a shift.",
      "Start the 30-minute countdown when Brandt sets the scram in Act 3.",
    ],
    plannedScenes: scenes.map((s) => s.id),
  } as Partial<Session>);
  writeDoc(registry, session.logDoc, "");
  // planning the scenes ticks "Sketch a few scenes" as the app does; the rest was done by hand
  autoTickChecklist(store, session.id, checklistItemsFor(checklist, "scenes-planned"));
  for (const id of ["prep.goal", "prep.opening", "prep.people", "prep.threat", "prep.materials", "alien.prep.agendas", "alien.prep.infections"]) {
    if (checklist.some((c) => c.id === id)) setChecklistItem(store, session.id, id, true);
  }

  // -- live table state on the map for session 1 --------------------------------
  const layout = map.layout as SiteLayout;
  startLive(store, map.id, 1);
  const start = layout.start;
  if (start) {
    const floor = (zoneId: string) => {
      const z = layout.zones.find((x) => x.id === zoneId);
      const deck = z ? layout.decks.find((d) => d.id === z.deck) : undefined;
      return !!z && z.layer !== "duct" && deck?.layer !== "duct";
    };
    const touching = layout.borders.filter((b) => (b.a === start || b.b === start) && b.kind !== "wall");
    const other = (b: (typeof touching)[number]) => (b.a === start ? b.b : b.a);
    const corridor = touching.map(other).find((z) => floor(z) && layout.zones.find((x) => x.id === z)?.kind === "corridor") ?? touching.map(other).find(floor);
    if (corridor) revealZones(store, map.id, [corridor]);
    // a locked door at the edge of what the players can see
    const seen = new Set([start, ...(corridor ? [corridor] : [])]);
    const door =
      layout.borders.find((b) => b.kind === "door" && (seen.has(b.a) || seen.has(b.b)) && !(seen.has(b.a) && seen.has(b.b))) ?? layout.borders.find((b) => b.kind === "door");
    if (door) setBorderState(store, map.id, door.id, { locked: true, known: true });
    for (const pc of pcs) placeToken(store, map.id, { label: pc.name, zone: start, entity: pc.id });
    // a motion tracker ping one zone beyond the locked door
    const beyond = door ? (seen.has(door.a) ? door.b : door.a) : corridor ?? start;
    addPing(store, map.id, beyond, `${year}-03-14T21:00:00.000Z`);
  }

  // -- the running infection: the facehugger is already on Lindqvist -------------
  startInfection(store, mod, { host: lindqvist, source: facehugger, seed: `${seed}/lindqvist` });

  // -- timeline and a tour note ---------------------------------------------------
  store.createTimelineEvent({ inWorldDate: `${year}-03-03`, text: "Cold Harbor's research annex receives a specimen pod from a drifting survey probe.", entities: [station.id, locations.get("lab")!.id], visibility: GM });
  store.createTimelineEvent({ inWorldDate: `${year}-03-05`, text: "Cold Harbor's signal drops to a carrier tone.", entities: [station.id], visibility: PLAYERS });
  const note = store.createNote({ title: "Demo tour: Cold Harbor", attachedTo: { kind: "campaign", id: store.id }, tags: ["demo"] });
  writeDoc(
    registry,
    note.bodyDoc,
    [
      "## What this demo shows",
      "",
      `- **Guided builder**: open ${CINEMATIC_ADVENTURE_TITLE} under Adventures; every step is filled in, and the Review step lists what passed.`,
      `- **Site map**: generated from the adventure with the site map generator (seed \`${mapSeed}\`), linked to every scene and to ${ref(station)}.`,
      "- **Table mode**: start session 1. The live map has the start and a corridor revealed, a locked door, a token per PC and a tracker ping.",
      `- **Life cycle**: ${ref(lindqvist)} is facehugged. Advance the clock and the tracker moves her infection on.`,
      `- **Androids**: ${ref(brandt)} is a secret synthetic; his critical injuries roll on the android damage table.`,
      "- **Session checklist**: session 0 is done and fully ticked; session 1 is partly prepared.",
    ].join("\n"),
  );

  const maps = store.toJSON();
  const resolve = nameResolver(store);
  const docs: Record<Id, string> = {};
  for (const id of docIdsOf(maps)) docs[id] = toMarkdown(registry.open(id), resolve);
  return { store, registry, maps, docs, ids: { adventure: adventureId, map: map.id, station: station.id, session: session.id, sessionZero: zero.id, host: lindqvist.id, facehugger: facehugger.id }, review };
}

/** Plain JSON for the web app's "Load cinematic demo" (load `maps` into a store, `docs` into the registry). */
export function cinematicDemoJSON(seed: string = CINEMATIC_DEMO_SEED): { maps: CampaignMaps; docs: Record<Id, string> } {
  const { store, registry, maps, docs } = buildCinematicDemo({ seed });
  registry.closeAll();
  store.destroy();
  return { maps, docs };
}
