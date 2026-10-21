/**
 * "Hollowmere": the remaster demo (one-shot mode, ORC core rules data pack
 * `pf2e-orc`). A short original adventure, "Lamplight Under Hollowmere": the
 * lamp oil of a lakeside village keeps vanishing, the thieves are kobolds,
 * and the kobolds are stealing it because something worse has moved into
 * the caves under the old mill. Four level 1 characters built from Player
 * Core options have one night to sort it out.
 *
 * What it shows: player characters whose sheets derive every check total,
 * AC, Hit Points, class DC and spell DC from attribute modifiers and
 * proficiency ranks; Monster Core creatures (kobold warriors, giant
 * centipedes, a kobold cavern mage, xulgath) and a GM Core hazard from the
 * pack's presets in encounters budgeted by GM Core's XP numbers; a faction,
 * a quest, NPCs (one rolled with the pack's NPC generator); an adventure
 * from the pack's one-shot template; and a planned session whose first
 * scene is a fight, so table mode opens with the kobolds on the trackers.
 *
 * Original content in our own words, with no setting names. Stat blocks come
 * from the presets unchanged except for names. Deterministic: the generated
 * NPC, the tavern, each character's trinket and the weather depend only on
 * the seed and the module version; ids and timestamps are fresh.
 *
 * The pack is JSON loaded lazily, so this build is async. The web app passes
 * the module it already loaded; Node callers let it load the pack source.
 *
 * Browser-safe: no `node:` imports.
 */
import {
  createRng,
  createTableRegistry,
  defaultFieldsFor,
  loadModule,
  moduleFromPackSource,
  rollTable,
  runProcedure,
  type EntityPreset,
  type GameModule,
  type LoadedModule,
  type Rng,
} from "@campaign-forge/module-sdk";
import {
  CampaignStore,
  RichTextRegistry,
  acceptGeneratedGraph,
  autoTickChecklist,
  checklistItemsFor,
  docIdsOf,
  fromMarkdown,
  moduleChecklistItems,
  nameResolver,
  newId,
  presetToEntity,
  recordEdit,
  sessionChecklist,
  setChecklistItem,
  toMarkdown,
  type CampaignMaps,
  type Entity,
  type Id,
  type Scene,
  type Session,
  type Visibility,
} from "@campaign-forge/core";
import { pf2eOrcSource } from "@campaign-forge/module-pf2e-orc";

export const PF2E_DEMO_SEED = "hollowmere";
export const PF2E_DEMO_NAME = "Hollowmere";
export const PF2E_ADVENTURE_TITLE = "Lamplight Under Hollowmere";
export const PF2E_MODULE_ID = "pf2e-orc";

export interface BuildPf2eDemoOptions {
  seed?: string;
  name?: string;
  /** The ORC core rules module, if the caller already loaded it (the web app does); otherwise the pack source is loaded. */
  module?: GameModule;
}

export interface Pf2eDemoCampaign {
  store: CampaignStore;
  registry: RichTextRegistry;
  maps: CampaignMaps;
  /** Rich-text bodies as Markdown, keyed by doc id (`[[id|name]]` references). */
  docs: Record<Id, string>;
  /** Ids of the main records, for tests and the CLI. */
  ids: { adventure: Id; session: Id; pcs: Id[]; firstScene: Id; boss: Id; quest: Id; faction: Id; hazard: Id };
}

const PLAYERS: Visibility = { level: "players" };
const GM: Visibility = { level: "gm" };
const T = PF2E_MODULE_ID;

/** XP of a creature by its level relative to the party's, and of a simple hazard (GM Core, Building Encounters). */
const CREATURE_XP: Record<string, number> = { "-4": 10, "-3": 15, "-2": 20, "-1": 30, "0": 40, "1": 60, "2": 80, "3": 120, "4": 160 };
const SIMPLE_HAZARD_XP: Record<string, number> = { "-4": 2, "-3": 3, "-2": 4, "-1": 6, "0": 8, "1": 12, "2": 16, "3": 24, "4": 32 };
const PARTY_LEVEL = 1;

function ref(e: Pick<Entity, "id" | "name">): string {
  return `[[${e.id}|${e.name}]]`;
}

function writeDoc(registry: RichTextRegistry, docId: Id | undefined, markdown: string): void {
  if (!docId) return;
  fromMarkdown(registry.open(docId), markdown);
}

function requirePreset(mod: LoadedModule, id: string): EntityPreset {
  const p = mod.preset(id);
  if (!p) throw new Error(`remaster demo: module has no preset "${id}"`);
  return p;
}

/** Roll one of the pack's tables and read a string out of the row's result. */
function rollText(mod: LoadedModule, rng: Rng, tableId: string, key: string): string {
  const table = mod.module.tables.find((t) => t.id === tableId);
  if (!table) throw new Error(`remaster demo: module has no table "${tableId}"`);
  const rec = rollTable(table, rng, createTableRegistry(mod.module.tables));
  const v = (rec.result as Record<string, unknown> | undefined)?.[key];
  return typeof v === "string" ? v : String(rec.rowLabel ?? "");
}

// ---------------------------------------------------------------------------
// the party: four level 1 characters from Player Core options, written down as a player would
// ---------------------------------------------------------------------------

interface PcSpec {
  name: string;
  summary: string;
  fields: Record<string, unknown>;
}

const allTrained = { unarmored: 1, light: 1, medium: 1, heavy: 1 };

export const PF2E_PARTY: PcSpec[] = [
  {
    name: "Garrick Thornley",
    summary: "Human fighter, a former village watchman who still walks the lamp route out of habit.",
    fields: {
      ancestry: "human",
      heritage: "Skilled Human",
      background: "Guard",
      class: "fighter",
      subclass: "Shield and longsword",
      level: 1,
      keyAttribute: "strength",
      attributes: { strength: 4, dexterity: 1, constitution: 2, intelligence: 0, wisdom: 1, charisma: 0 },
      saves: { perception: 2, fortitude: 2, reflex: 2, will: 1 },
      skills: { athletics: 1, intimidation: 1, survival: 1, medicine: 1, society: 1, diplomacy: 1, "lore-a": 1 },
      loreTopics: { first: "Legal Lore" },
      classDcRank: 1,
      defenses: allTrained,
      attacks: { simple: 2, martial: 2, advanced: 1, unarmed: 2 },
      armor: { name: "Chain Mail", category: "medium", acBonus: 4, dexCap: 1, strength: 3, checkPenalty: -2, speedPenalty: -5, potency: 0 },
      shield: { name: "Steel Shield", acBonus: 2, hardness: 5, hp: 20, maxHp: 20 },
      hp: { current: 20, temp: 0 },
      speed: 25,
      heroPoints: 1,
      strikes: [
        { name: "Longsword", bonus: "+9 [+4/−1]", damage: "1d8+4 slashing", traits: "versatile P" },
        { name: "Javelin", bonus: "+6 [+1/−4]", damage: "1d6+4 piercing", traits: "thrown 30 feet" },
      ],
      feats: [
        { level: 1, type: "ancestry", name: "Natural Ambition" },
        { level: 1, type: "class", name: "Sudden Charge" },
        { level: 1, type: "class", name: "Reactive Shield" },
        { level: 1, type: "general", name: "Shield Block" },
      ],
      features: [
        { name: "Reactive Strike", desc: "A reaction: Strike a creature in reach that uses a manipulate or move action, or makes a ranged attack." },
        { name: "Shield Block", desc: "A reaction: when hit while the shield is raised, reduce the damage by the shield's Hardness (5)." },
      ],
      languages: ["Common", "Dwarven"],
      inventory: [
        { name: "Chain Mail", quantity: 1, bulk: 2 },
        { name: "Steel Shield", quantity: 1, bulk: 1 },
        { name: "Longsword", quantity: 1, bulk: 1 },
        { name: "Javelin", quantity: 4, bulk: 0.1 },
        { name: "Adventurer's Pack", quantity: 1, bulk: 1, notes: "Backpack, bedroll, chalk, flint and steel, rope, rations, soap, torches, waterskin" },
      ],
      coins: { cp: 0, sp: 6, gp: 4, pp: 0 },
      appearance: "Broad and weathered, a grey streak in his black beard, an old lamplighter's pole strapped across his pack.",
      personality: "Patient until someone hurts a neighbour; then very, very direct.",
    },
  },
  {
    name: "Brunhild Ashdelver",
    summary: "Dwarf cleric (warpriest) who keeps the village shrine and its sick-room.",
    fields: {
      ancestry: "dwarf",
      heritage: "Rock Dwarf",
      background: "Acolyte",
      class: "cleric",
      subclass: "Warpriest",
      level: 1,
      keyAttribute: "wisdom",
      attributes: { strength: 2, dexterity: 1, constitution: 2, intelligence: 0, wisdom: 4, charisma: -1 },
      saves: { perception: 1, fortitude: 2, reflex: 1, will: 2 },
      skills: { religion: 1, medicine: 1, diplomacy: 1, athletics: 1, "lore-a": 1 },
      loreTopics: { first: "Scribing Lore" },
      classDcRank: 1,
      defenses: { unarmored: 1, light: 1, medium: 1, heavy: 0 },
      attacks: { simple: 1, martial: 1, advanced: 0, unarmed: 1 },
      armor: { name: "Scale Mail", category: "medium", acBonus: 3, dexCap: 2, strength: 2, checkPenalty: -2, speedPenalty: -5, potency: 0 },
      shield: { name: "Wooden Shield", acBonus: 2, hardness: 3, hp: 12, maxHp: 12 },
      hp: { current: 20, temp: 0 },
      speed: 20,
      heroPoints: 1,
      spellcasting: { tradition: "divine", kind: "prepared", attribute: "wisdom", rank: 1 },
      slots: { r1: { max: 2, used: 0 } },
      spells: ["Divine Lance", "Guidance", "Shield", "Stabilize", "Light", "Bless", "Sanctuary", "Heal"],
      strikes: [{ name: "Morningstar", bonus: "+5 [+0/−5]", damage: "1d6+2 bludgeoning", traits: "versatile P" }],
      feats: [
        { level: 1, type: "ancestry", name: "Rock Runner" },
        { level: 1, type: "class", name: "Healing Hands" },
        { level: 1, type: "skill", name: "Student of the Canon" },
      ],
      features: [
        { name: "Divine Font", desc: "Four extra castings of heal each day, at the highest rank she can cast." },
        { name: "Warpriest doctrine", desc: "Trained in light and medium armor; expert in Fortitude saves." },
      ],
      languages: ["Common", "Dwarven", "Gnomish"],
      inventory: [
        { name: "Scale Mail", quantity: 1, bulk: 2 },
        { name: "Wooden Shield", quantity: 1, bulk: 1 },
        { name: "Morningstar", quantity: 1, bulk: 1 },
        { name: "Religious Symbol (Wooden)", quantity: 1, bulk: 0.1 },
        { name: "Healer's Toolkit", quantity: 1, bulk: 1 },
        { name: "Adventurer's Pack", quantity: 1, bulk: 1 },
      ],
      coins: { cp: 2, sp: 3, gp: 2, pp: 0 },
      appearance: "Short even for a dwarf, braids threaded with copper wire, ink on her fingers from copying prayers.",
      personality: "Brisk, practical, and quietly furious at anyone who leaves the sick to fend for themselves.",
    },
  },
  {
    name: "Sylvarien Moss",
    summary: "Elf wizard who came to Hollowmere to study the old mill's flooded tunnels.",
    fields: {
      ancestry: "elf",
      heritage: "Ancient Elf",
      background: "Scholar",
      class: "wizard",
      subclass: "School of Battle Magic",
      level: 1,
      keyAttribute: "intelligence",
      attributes: { strength: 0, dexterity: 2, constitution: 0, intelligence: 4, wisdom: 1, charisma: 0 },
      saves: { perception: 1, fortitude: 1, reflex: 1, will: 2 },
      skills: { arcana: 1, society: 1, occultism: 1, nature: 1, crafting: 1, diplomacy: 1, medicine: 1, "lore-a": 1 },
      loreTopics: { first: "Academia Lore" },
      classDcRank: 1,
      defenses: { unarmored: 1, light: 0, medium: 0, heavy: 0 },
      attacks: { simple: 1, martial: 0, advanced: 0, unarmed: 1 },
      armor: { name: "Explorer's clothing", category: "unarmored", acBonus: 0, potency: 0 },
      hp: { current: 12, temp: 0 },
      speed: 30,
      heroPoints: 1,
      focus: { current: 1, max: 1 },
      spellcasting: { tradition: "arcane", kind: "prepared", attribute: "intelligence", rank: 1 },
      slots: { r1: { max: 3, used: 0 } },
      spells: ["Electric Arc", "Ignition", "Detect Magic", "Telekinetic Hand", "Light", "Force Barrage", "Sleep", "Fear"],
      strikes: [{ name: "Staff", bonus: "+3 [−2/−7]", damage: "1d4 bludgeoning", traits: "two-hand d8" }],
      feats: [
        { level: 1, type: "ancestry", name: "Elven Lore" },
        { level: 1, type: "class", name: "Reach Spell" },
      ],
      features: [
        { name: "Arcane School", desc: "Battle magic: an extra 1st-rank slot for a school spell, and a school focus spell (1 Focus Point)." },
        { name: "Arcane Bond", desc: "Once a day, recast a spell she already cast today by drawing on her bonded staff." },
      ],
      languages: ["Common", "Elven", "Draconic", "Fey", "Gnomish", "Petran"],
      inventory: [
        { name: "Staff", quantity: 1, bulk: 1 },
        { name: "Spellbook (Blank)", quantity: 1, bulk: 0.1, notes: "No longer blank: her spells, and a sketch map of the mill tunnels" },
        { name: "Adventurer's Pack", quantity: 1, bulk: 1 },
        { name: "Healing Potion (Minor)", quantity: 1, bulk: 0.1 },
      ],
      coins: { cp: 0, sp: 4, gp: 7, pp: 0 },
      appearance: "Tall and stooped from reading, green coat patched at the elbows, ink-stained everything.",
      personality: "Curious to a fault; asks the monster a question before deciding whether to run.",
    },
  },
  {
    name: "Pip Tallowgrass",
    summary: "Halfling rogue (thief) who grew up on Hollowmere's docks and knows every cellar door.",
    fields: {
      ancestry: "halfling",
      heritage: "Gutsy Halfling",
      background: "Street Urchin",
      class: "rogue",
      subclass: "Thief",
      level: 1,
      keyAttribute: "dexterity",
      attributes: { strength: 0, dexterity: 4, constitution: 1, intelligence: 1, wisdom: 1, charisma: 2 },
      saves: { perception: 2, fortitude: 1, reflex: 2, will: 2 },
      skills: { stealth: 1, thievery: 1, acrobatics: 1, deception: 1, diplomacy: 1, society: 1, athletics: 1, performance: 1, survival: 1, "lore-a": 1 },
      loreTopics: { first: "Hollowmere Lore" },
      classDcRank: 1,
      defenses: { unarmored: 1, light: 1, medium: 0, heavy: 0 },
      attacks: { simple: 1, martial: 1, advanced: 0, unarmed: 1 },
      armor: { name: "Leather Armor", category: "light", acBonus: 1, dexCap: 4, checkPenalty: -1, potency: 0 },
      hp: { current: 15, temp: 0 },
      speed: 25,
      heroPoints: 1,
      strikes: [
        { name: "Rapier", bonus: "+7 [+2/−3]", damage: "1d6+4 piercing", traits: "deadly d8, disarm, finesse" },
        { name: "Sling", bonus: "+7 [+2/−3]", damage: "1d6 bludgeoning", traits: "propulsive, range increment 50 feet, reload 1" },
      ],
      feats: [
        { level: 1, type: "ancestry", name: "Halfling Luck" },
        { level: 1, type: "class", name: "Nimble Dodge" },
        { level: 1, type: "skill", name: "Pickpocket" },
      ],
      features: [
        { name: "Sneak Attack", desc: "+1d6 precision damage against an off-guard creature." },
        { name: "Surprise Attack", desc: "In the first round, creatures that have not acted are off-guard to her." },
        { name: "Thief racket", desc: "Adds her Dexterity modifier to damage with finesse melee weapons." },
      ],
      languages: ["Common", "Halfling", "Goblin"],
      inventory: [
        { name: "Leather Armor", quantity: 1, bulk: 1 },
        { name: "Rapier", quantity: 1, bulk: 1 },
        { name: "Sling", quantity: 1, bulk: 0.1 },
        { name: "Sling Bullets", quantity: 20, bulk: 0.01 },
        { name: "Thieves' Toolkit", quantity: 1, bulk: 0.1 },
        { name: "Adventurer's Pack", quantity: 1, bulk: 1 },
      ],
      coins: { cp: 9, sp: 1, gp: 3, pp: 0 },
      appearance: "Barefoot, freckled, a chipped tooth she shows off when she grins, which is often.",
      personality: "Loyal to the village that fed her, rude to everyone else, honest about almost nothing.",
    },
  },
];

export async function buildPf2eDemo(opts: BuildPf2eDemoOptions = {}): Promise<Pf2eDemoCampaign> {
  const seed = opts.seed ?? PF2E_DEMO_SEED;
  const name = opts.name ?? PF2E_DEMO_NAME;
  const game = opts.module ?? (await moduleFromPackSource(pf2eOrcSource));
  const mod = loadModule(game, { skipProcedureRuns: true });
  if (mod.manifest.id !== PF2E_MODULE_ID) throw new Error(`remaster demo: expected the ${PF2E_MODULE_ID} module, got "${mod.manifest.id}"`);
  const rng = createRng(`seed-campaign/pf2e/${seed}`);
  const registry = new RichTextRegistry();
  const cal = game.calendar;
  if (!cal) throw new Error("remaster demo: module has no calendar");
  const year = cal.defaultYear;
  const date = (m: number, d: number) => `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const store = CampaignStore.create({
    name,
    moduleId: mod.manifest.id,
    moduleVersion: mod.manifest.version,
    mode: "one-shot",
    calendarId: cal.id,
    currentDate: date(10, 3),
    gmName: "GM",
    settings: { seed },
  });

  // new records start from the schema defaults, as the app's "New" does
  const create = (input: Parameters<CampaignStore["createEntity"]>[0]): Entity => {
    const def = mod.entityType(input.type);
    if (!def) throw new Error(`remaster demo: module has no entity type "${input.type}"`);
    return store.createEntity({ ...input, fields: { ...defaultFieldsFor(def), ...(input.fields ?? {}) } });
  };

  // -- places ------------------------------------------------------------------
  const tavernName = `The ${rollText(mod, rng.fork("tavern/first"), `${T}.tavern.name-first`, "name")} ${rollText(mod, rng.fork("tavern/second"), `${T}.tavern.name-second`, "name")}`;
  const speciality = rollText(mod, rng.fork("tavern/special"), `${T}.tavern.special`, "text");
  const location = (entityName: string, subtype: string, fields: Record<string, unknown>, summary: string, visibility: Visibility = PLAYERS) =>
    create({ type: `${T}.location`, subtype, name: entityName, summary, fields, visibility, tags: ["demo"] });
  const village = location(
    "Hollowmere",
    "settlement",
    {
      environment: "plains",
      size: "village",
      level: 1,
      population: "about two hundred: fishers, millers and the lamplighters' guild of three",
      government: "Mayor Odalys Fenwright and a council that meets in the tavern",
      danger: "low",
      features: ["Forty oil lamps along the lake path, lit every dusk", "The old mill, idle since its wheel cracked", "A lakeside shrine with a sick-room"],
      description: "A village on the reedy shore of a black lake. Its lamps are its pride: fog comes off the water every night, and without them the lake path is a drowning waiting to happen.",
      secrets: "The mill was built over a cave mouth. The miller's family sealed it three generations ago and told nobody.",
    },
    "Lakeside village whose lamp oil keeps vanishing.",
  );
  const tavern = location(
    tavernName,
    "building",
    { environment: "plains", danger: "safe", features: [`House speciality: ${speciality}`, "A back room the council uses"], description: "Smoky beams, a fire that is never allowed to go out, and every rumour in Hollowmere by midnight." },
    `Hollowmere's only tavern. House speciality: ${speciality.charAt(0).toLowerCase()}${speciality.slice(1)}.`,
  );
  const mill = location(
    "The Old Mill",
    "building",
    { environment: "plains", danger: "moderate", features: ["A cracked waterwheel", "Oil barrels in the storeroom, three of them dry", "A trapdoor under the millstones"], description: "A three-storey stone mill at the lake's outflow. The village stores its lamp oil in the storeroom." },
    "Idle mill where the village keeps its lamp oil.",
  );
  const tunnels = location(
    "The Mill Tunnels",
    "dungeon",
    { environment: "underground", danger: "moderate", features: ["Knee-deep water in the lower runs", "Kobold scratch-marks counting lamps", "A rotten plank floor over an old sluice pit"], description: "Old millrace tunnels under the mill, half flooded, now a kobold road." },
    "Flooded millrace tunnels under the mill.",
    GM,
  );
  const caves = location(
    "The Glimmer Caves",
    "dungeon",
    {
      environment: "underground",
      danger: "high",
      features: ["Glowing fungus that dims when something big moves", "A kobold shrine smashed to pieces", "A stolen oil barrel used as a drum"],
      description: "Natural caves beyond the tunnels, where the kobold clan lived until the xulgath came up from below.",
      secrets: "The xulgath leader wants the mill as a way to the surface and the village as a larder.",
    },
    "Caves beyond the tunnels; the xulgath have taken them.",
    GM,
  );
  store.createRelationship("within", tavern.id, village.id, undefined, PLAYERS);
  store.createRelationship("within", mill.id, village.id, undefined, PLAYERS);
  store.createRelationship("within", tunnels.id, mill.id, "Through the trapdoor", GM);
  store.createRelationship("within", caves.id, tunnels.id, "Past the sluice pit", GM);

  // -- the party -----------------------------------------------------------------
  const prng = rng.fork("party");
  const pcs = PF2E_PARTY.map((spec, i) => {
    const trinket = rollText(mod, prng.fork(`trinket/${i}`), `${T}.treasure.trinket`, "text");
    const fields: Record<string, unknown> = { isPC: true, ...structuredClone(spec.fields) };
    fields["inventory"] = [...(fields["inventory"] as unknown[]), { name: `Trinket: ${trinket}`, quantity: 1, bulk: 0 }];
    return create({ type: `${T}.character`, name: spec.name, summary: spec.summary, fields, visibility: PLAYERS, tags: ["party"] });
  });
  const [garrick, brunhild, sylvarien, pip] = pcs as [Entity, Entity, Entity, Entity];
  store.createRelationship("knows", pip.id, garrick.id, "He caught her stealing apples, then bought her the apples", PLAYERS);
  store.createRelationship(`${T}.rival-of`, sylvarien.id, brunhild.id, "Disagree, loudly, about whether to open the sealed tunnels", PLAYERS);

  // -- factions and creatures (Monster Core presets) --------------------------------
  const clan = create({
    type: `${T}.faction`,
    name: "The Ember Tail kobolds",
    summary: "A small kobold clan driven out of the caves, stealing lamp oil to keep the dark at bay.",
    fields: {
      goal: "Win back their caves, or at least keep the xulgath from eating them.",
      leader: "Skrit Embertail, a kobold cavern mage",
      resources: "A dozen kobolds, a cart of stolen oil, and every secret passage under the village.",
      standing: 0,
      methods: "Night raids for oil, and traps; parley if cornered and treated with respect.",
      secrets: "Skrit would trade the clan's treasure for help against the xulgath.",
    },
    visibility: PLAYERS,
    tags: ["demo"],
  });
  const raiders = create({
    type: `${T}.faction`,
    name: "The xulgath raiders",
    summary: "Reptilian raiders up from the deep caves, led by a brute who wants the surface.",
    fields: { goal: "Take the mill and raid the village above it.", leader: "Vesh the Gnawer, a xulgath leader", standing: -3, methods: "Ambush in the dark; they hate bright light.", secrets: "Their leader is wounded and will not fight past half his strength." },
    visibility: GM,
    tags: ["demo", "villains"],
  });
  store.createRelationship("found_at", clan.id, tunnels.id, "Their road to the surface", GM);
  store.createRelationship("found_at", raiders.id, caves.id, "Their new den", GM);
  store.createRelationship(`${T}.rival-of`, clan.id, raiders.id, "Driven from the caves", GM);
  const creature = (presetId: string, entityName: string, summary?: string) =>
    presetToEntity(store, requirePreset(mod, presetId), { name: entityName, visibility: GM, ...(summary ? { summary } : {}) });
  const kobolds = [1, 2, 3].map((n) => creature(`${T}.preset.kobold-warrior`, `Kobold Warrior ${n}`));
  const centipedes = [1, 2].map((n) => creature(`${T}.preset.giant-centipede`, `Giant Centipede ${n}`));
  const skrit = creature(`${T}.preset.kobold-cavern-mage`, "Skrit Embertail", "Kobold cavern mage, chief of the Ember Tails. Would rather talk than fight.");
  const boss = creature(`${T}.preset.xulgath-leader`, "Vesh the Gnawer", "Xulgath leader. Creature 3, AC 18, HP 44.");
  const brute = creature(`${T}.preset.xulgath-warrior`, "Xulgath Warrior");
  const pit = presetToEntity(store, requirePreset(mod, `${T}.preset.hazard.hidden-pit`), { name: "The Sluice Pit", visibility: GM, summary: "An old sluice pit under rotten planks." });
  for (const k of [...kobolds, skrit]) store.createRelationship("member_of", k.id, clan.id, undefined, GM);
  for (const x of [boss, brute]) store.createRelationship("member_of", x.id, raiders.id, undefined, GM);
  for (const c of centipedes) store.createRelationship(`${T}.lairs-in`, c.id, tunnels.id, undefined, GM);
  store.createRelationship(`${T}.lairs-in`, boss.id, caves.id, undefined, GM);
  store.createRelationship(`${T}.serves`, brute.id, boss.id, undefined, GM);
  store.createRelationship(`${T}.guards`, pit.id, tunnels.id, undefined, GM);

  // -- NPCs ---------------------------------------------------------------------
  const npc = (entityName: string, summary: string, fields: Record<string, unknown>, visibility: Visibility = PLAYERS) =>
    create({ type: `${T}.npc`, name: entityName, summary, fields, visibility, tags: ["demo"] });
  const mayor = npc("Mayor Odalys Fenwright", "Hollowmere's mayor and the mill's owner; offers the reward.", {
    occupation: "Mayor and miller",
    ancestry: "Human",
    attitude: "friendly",
    appearance: "Sixty, flour in the creases of her knuckles forever, the mayor's chain worn under her shawl.",
    quirk: "Taps the table twice before she says no.",
    voice: "Warm and slow, then suddenly very precise about money.",
    motivation: "Keep the lamps lit without admitting what is under her mill.",
    secret: "She knows about the sealed cave mouth; her grandmother sealed it.",
    statBlock: "Halfling Street Watcher",
  });
  const lamplighter = npc("Tamsin Reed", "The last of the lamplighters' guild still willing to walk the lake path.", {
    occupation: "Lamplighter",
    ancestry: "Halfling",
    attitude: "helpful",
    appearance: "Soot to the elbows, a long brass lighting-pole, a lantern hung from her belt even by day.",
    quirk: "Counts the lamps under her breath wherever she goes.",
    voice: "Quick and quiet, as if the dark might be listening.",
    motivation: "Find out who is stealing the oil before someone drowns on the path.",
    secret: "She saw small figures carrying barrels into the mill and told nobody, because nobody believed her about the lights last year.",
    statBlock: "Halfling Troublemaker",
  });
  // the innkeeper: rolled with the pack's NPC generator, then given the tavern
  const npcProc = mod.procedure(`${T}.proc.npc`);
  if (!npcProc) throw new Error("remaster demo: module has no NPC generator");
  const npcGraph = runProcedure(npcProc, game, { seed: `${seed}/innkeeper`, inputs: {} });
  const npcAccepted = acceptGeneratedGraph(store, npcGraph, { moduleId: mod.manifest.id, visibility: PLAYERS });
  const rolled = npcAccepted.entities[0];
  if (!rolled) throw new Error("remaster demo: the NPC generator produced nothing");
  const innkeeper = store.update("entities", rolled.id, {
    summary: `${String(rolled.fields["ancestry"] ?? "")} innkeeper of ${tavernName}.`.trim(),
    fields: { ...rolled.fields, occupation: `Innkeeper of ${tavernName}`, attitude: "friendly" },
    tags: ["demo"],
  });
  for (const path of ["summary", "occupation", "attitude"]) recordEdit(store, npcAccepted.run.id, innkeeper.id, path);
  store.createRelationship("found_at", mayor.id, tavern.id, "Holds council in the back room", PLAYERS);
  store.createRelationship("found_at", innkeeper.id, tavern.id, undefined, PLAYERS);
  store.createRelationship("found_at", lamplighter.id, village.id, "Somewhere on the lake path, always", PLAYERS);
  store.createRelationship("knows", garrick.id, lamplighter.id, "They walked the lamp route together for years", PLAYERS);
  store.createRelationship("knows", brunhild.id, mayor.id, "The mayor pays for the shrine's sick-room", PLAYERS);

  // -- the quest -----------------------------------------------------------------
  const quest = create({
    type: `${T}.quest`,
    name: "Keep the Lamps Lit",
    summary: "Find out where Hollowmere's lamp oil is going, and stop it before the fog season.",
    fields: {
      hook: "Three barrels of lamp oil have vanished from the mill in a week, and half the lake path went dark last night.",
      patron: "Mayor Odalys Fenwright",
      objective: "Find the oil thieves and make the lake path safe again.",
      reward: "20 gp each, and the mayor's gratitude (which is worth more than it sounds).",
      deadline: "Before the autumn fogs, three nights from now.",
      status: "active",
      complications: "The thieves are refugees from something worse. Killing them solves the oil problem and leaves the xulgath with a clear road to the village.",
    },
    visibility: PLAYERS,
    tags: ["demo"],
  });
  store.createRelationship("wants", mayor.id, quest.id, "Patron", PLAYERS);
  store.createRelationship("blocks", raiders.id, quest.id, undefined, GM);

  // -- encounters (GM Core budgets for four level 1 characters) ---------------------------
  const xpOf = (e: Entity): number => {
    const diff = String(Number(e.fields["level"] ?? 0) - PARTY_LEVEL);
    return e.type === `${T}.hazard` ? (SIMPLE_HAZARD_XP[diff] ?? 0) : (CREATURE_XP[diff] ?? 0);
  };
  const encounter = (entityName: string, members: Entity[], threat: string, environment: string, extra: Record<string, unknown>) => {
    const counts = new Map<string, { n: number; level: number; xp: number }>();
    for (const c of members) {
      const label = mod.preset(String(c.provenance?.preset ?? ""))?.name ?? c.name;
      const prev = counts.get(label);
      counts.set(label, { n: (prev?.n ?? 0) + 1, level: Number(c.fields["level"] ?? 0), xp: xpOf(c) });
    }
    const e = create({
      type: `${T}.encounter`,
      name: entityName,
      fields: {
        environment,
        partyLevel: PARTY_LEVEL,
        partySize: 4,
        threat,
        creatures: [...counts].map(([label, { n, level, xp }]) => `${n} × ${label} (level ${level}, ${xp} XP each)`).join("; "),
        xpTotal: members.reduce((sum, c) => sum + xpOf(c), 0),
        status: "planned",
        ...extra,
      },
      visibility: GM,
      tags: ["demo"],
    });
    for (const c of members) store.createRelationship("appears_in", c.id, e.id, undefined, GM);
    return e;
  };
  const thieves = encounter("Oil thieves at the mill", kobolds, "low", "plains", {
    activity: "Three kobolds rolling an oil barrel to the trapdoor under the millstones.",
    twist: "One of them drops the barrel and begs: 'Not for us! For the light!'",
    tactics: "Spears from behind the millstones; they flee down the trapdoor at half strength. A successful Diplomacy or Intimidation check (DC 15) stops the fight.",
    treasure: "A string of copper coins (2 sp) and a kobold drawing of a big lizard with too many teeth.",
  });
  const sluice = encounter("The sluice pit", [pit, ...centipedes], "low", "underground", {
    activity: "Two giant centipedes nesting in the dry sluice, under the rotten planks.",
    twist: "The kobolds rigged the planks; they know where to step.",
    tactics: "The planks hide the pit (Stealth DC 18 to notice while Searching). The centipedes strike whoever falls in.",
    treasure: "An old miller's lockbox in the pit: 5 gp and the deed to the mill.",
  });
  const den = encounter("The xulgath den", [boss, brute], "severe", "underground", {
    activity: "Vesh and his warrior gnawing on a stolen goat by the light of a single stolen lamp.",
    twist: "If the kobolds were spared, Skrit's clan attacks from the side passage in round 2.",
    tactics: "Vesh opens with his stench and charges the brightest light; the warrior guards him. Vesh flees at half his Hit Points; a bright light (a lamp, Light, ignition) makes them hesitate.",
    treasure: "The kobold clan's hoard: 15 gp in old coins, a minor healing potion, and the cave mouth's original iron key.",
  });

  // -- the adventure from the pack's one-shot template --------------------------
  const template = mod.templatesFor("adventure", "one-shot")[0] ?? mod.templatesFor("adventure")[0];
  if (!template) throw new Error("remaster demo: module has no adventure template");
  const scaffold = template.scaffold as { acts?: Array<{ number: number; title?: string; goal: string; pacing?: string; scenes?: Array<{ purpose: string; mandatory?: boolean }> }> };
  const adventure = store.createAdventure({
    title: PF2E_ADVENTURE_TITLE,
    premise: "Hollowmere's lamp oil keeps vanishing. The thieves are kobolds, and the kobolds are stealing it because xulgath raiders have taken their caves under the old mill.",
    status: "planned",
    templateId: template.id,
    tags: ["demo", "one-shot"],
    hooksIn: ["Half the lake path went dark last night, and a fisher nearly walked into the water."],
    hooksOut: ["The cave mouth under the mill goes deeper than anyone thought, and something below the xulgath sent them up."],
    withDocs: true,
  });
  writeDoc(
    registry,
    adventure.playerIntroDoc,
    `Fog season is three nights off and the lamps of ${ref(village)} are going dark. ${ref(mayor)} wants to know who is taking the oil from ${ref(mill)}: ${ref(quest)}. You start in the mill storeroom at dusk, because tonight you are going to catch them.`,
  );
  writeDoc(
    registry,
    adventure.gmSituationDoc,
    [
      `${ref(boss)} leads ${ref(raiders)} up from the deep caves. His plan has three steps:`,
      "",
      `1. Drive ${ref(clan)} out of ${ref(caves)}.`,
      `2. Follow the kobolds' road through ${ref(tunnels)} to the mill.`,
      "3. On the first fog night, raid the village while the lamps are out.",
      "",
      `Each act the party does not stop a step, the next one happens. ${ref(skrit)} knows all three and will trade the clan's hoard for help.`,
    ].join("\n"),
  );
  writeDoc(registry, adventure.epilogueDoc, `If the xulgath are stopped, the Ember Tails light the lake path themselves on the first fog night, and ${ref(lamplighter)} has three new, very small apprentices. If not, the mill burns and the village learns what lives under it.`);

  interface SceneText {
    title: string;
    location: Entity;
    participants: Entity[];
    encounter?: Entity;
    body: string;
    readAloud: string;
  }
  const sceneText: Record<string, SceneText> = {
    "1.1": {
      title: "Oil thieves at the mill",
      location: mill,
      participants: kobolds,
      encounter: thieves,
      body: `${kobolds.map(ref).join(", ")} come up through the trapdoor for another barrel. Characters hiding in the storeroom roll Stealth for initiative. See ${ref(thieves)}.`,
      readAloud: "Midnight. Something scrapes under the millstones, a trapdoor lifts an inch, and a small scaled snout sniffs the air.",
    },
    "1.2": {
      title: "The mayor's offer",
      location: tavern,
      participants: [mayor, lamplighter, innkeeper],
      body: `At ${ref(tavern)}, ${ref(mayor)} doubles the reward and dodges questions about the trapdoor. ${ref(lamplighter)} has seen the thieves before; ${ref(innkeeper)} has heard the old mill rumours.`,
      readAloud: "The common room goes quiet when you come in carrying a kobold's spear and a barrel of lamp oil.",
    },
    "2.1": {
      title: "The sluice pit",
      location: tunnels,
      participants: [pit, ...centipedes],
      encounter: sluice,
      body: `The tunnels lead under the lake. ${ref(pit)} waits under rotten planks; ${centipedes.map(ref).join(" and ")} nest below. See ${ref(sluice)}.`,
      readAloud: "Water to the knee, then dry stone and old planks that creak like a ship. Something below them clicks.",
    },
    "2.2": {
      title: "Parley with the Ember Tails",
      location: tunnels,
      participants: [skrit],
      body: `${ref(skrit)} meets the party at a barricade of oil barrels with a lit match in each hand. Diplomacy (DC 15) or a fair offer earns the story of the xulgath and a guide to the caves.`,
      readAloud: "A barricade of barrels blocks the tunnel. On top of it, a kobold in a too-big hat holds two burning matches over an open barrel.",
    },
    "3.1": {
      title: "The xulgath den",
      location: caves,
      participants: [boss, brute, skrit],
      encounter: den,
      body: `${ref(boss)} and ${ref(brute)} in ${ref(caves)}. Light is a weapon here. See ${ref(den)}.`,
      readAloud: "The glowing fungus dims all at once, as if something huge just breathed on it. Then you smell them.",
    },
  };

  const scenes: Scene[] = [];
  for (const act of scaffold.acts ?? []) {
    const a = store.createAct(adventure.id, { number: act.number, goal: act.goal, ...(act.title ? { title: act.title } : {}), withPacingDoc: Boolean(act.pacing) });
    if (act.pacing) writeDoc(registry, a.pacingDoc, act.pacing);
    (act.scenes ?? []).forEach((s, i) => {
      const text = sceneText[`${act.number}.${i + 1}`];
      if (!text) return;
      const scene = store.createScene(a.id, {
        title: text.title,
        purpose: s.purpose,
        location: text.location.id,
        participants: text.participants.map((p) => p.id),
        ...(text.encounter ? { encounter: text.encounter.id } : {}),
        events: [{ id: newId(), text: s.purpose, mandatory: s.mandatory === true }],
        tags: ["demo"],
        withReadAloudDoc: true,
      });
      writeDoc(registry, scene.bodyDoc, text.body);
      writeDoc(registry, scene.readAloudDoc, text.readAloud);
      scenes.push(scene);
    });
  }
  const firstScene = scenes[0];
  if (!firstScene) throw new Error("remaster demo: the template made no scenes");

  // -- a handout: the kobold note ----------------------------------------------------
  const note = store.createHandout({ title: "A note in the oil barrel", kind: "text", visibility: PLAYERS, attachedTo: { kind: "scene", id: firstScene.id } });
  writeDoc(registry, note.bodyDoc, "SORRY FOR OIL. NEED LIGHT. BIG TEETH IN DARK. WILL PAY BACK. — EMBER TAILS");

  // -- timeline, the session, a tour note ---------------------------------------------
  store.createTimelineEvent({ inWorldDate: date(9, 24), text: "The first barrel of lamp oil goes missing from the mill.", entities: [mill.id], visibility: PLAYERS });
  store.createTimelineEvent({ inWorldDate: date(10, 2), text: "Half the lake path goes dark; a fisher nearly drowns.", entities: [village.id], visibility: PLAYERS });
  store.createTimelineEvent({ inWorldDate: date(10, 2), text: "The xulgath take the Glimmer Caves; the Ember Tails flee into the tunnels.", entities: [boss.id, caves.id], visibility: GM });

  const weather = rollText(mod, rng.fork("weather"), `${T}.travel.weather`, "text");
  const checklist = sessionChecklist(store.meta(), moduleChecklistItems(game.templates, mod.manifest.id));
  const session = store.createSession({ number: 1, date: "2026-11-28", title: PF2E_ADVENTURE_TITLE, status: "planned" });
  store.update("sessions", session.id, {
    nextPlan: [
      "Open in the mill storeroom at midnight: whoever is hiding rolls Stealth for initiative, everyone else Perception.",
      "Give everyone 1 Hero Point; the kobolds flee at half strength, and talking can end the fight.",
      `Weather tonight: ${weather.charAt(0).toLowerCase()}${weather.slice(1)}.`,
      "Keep the den fight under an hour; bright light is the party's best weapon.",
    ],
    plannedScenes: scenes.map((s) => s.id),
  } as Partial<Session>);
  writeDoc(registry, session.logDoc, "");
  autoTickChecklist(store, session.id, checklistItemsFor(checklist, "scenes-planned"));
  for (const id of ["prep.goal", "prep.opening", "prep.people", "prep.threat", `${T}.prep.levels`, `${T}.prep.encounters`, `${T}.prep.names`]) {
    if (checklist.some((c) => c.id === id)) setChecklistItem(store, session.id, id, true);
  }

  const tour = store.createNote({ title: `Demo tour: ${name}`, attachedTo: { kind: "campaign", id: store.id }, tags: ["demo"] });
  writeDoc(
    registry,
    tour.bodyDoc,
    [
      "## What this demo shows",
      "",
      `- **Character sheets**: open ${ref(garrick)}, ${ref(brunhild)}, ${ref(sylvarien)} or ${ref(pip)}. Attribute modifiers and proficiency ranks are written down; every check total, AC, Hit Points, class DC and spell DC is derived.`,
      `- **Monster Core creatures**: ${ref(kobolds[0]!)}, ${ref(boss)} and the rest came from the pack's presets with their stat blocks; ${ref(pit)} is a GM Core hazard.`,
      `- **Four degrees of success**: roll a skill from a sheet with a DC; beat it by 10 for a critical success, and watch a natural 20 or 1 move the result.`,
      `- **Table mode**: start session 1. The first scene is ${ref(thieves)}; roll initiative on the Trackers tab.`,
      `- **Generators**: ${ref(innkeeper)} was rolled with the NPC generator; try the encounter builder under Generate.`,
      "",
      "Original adventure; the rules content is ORC-licensed (see Settings for the ORC notice and attribution).",
    ].join("\n"),
  );

  const maps = store.toJSON();
  const resolve = nameResolver(store);
  const docs: Record<Id, string> = {};
  for (const id of docIdsOf(maps)) docs[id] = toMarkdown(registry.open(id), resolve);
  return {
    store,
    registry,
    maps,
    docs,
    ids: { adventure: adventure.id, session: session.id, pcs: pcs.map((p) => p.id), firstScene: firstScene.id, boss: boss.id, quest: quest.id, faction: clan.id, hazard: pit.id },
  };
}

/** Plain JSON for the web app's "Load PF2e demo" (load `maps` into a store, `docs` into the registry). */
export async function pf2eDemoJSON(seed: string = PF2E_DEMO_SEED, module?: GameModule): Promise<{ maps: CampaignMaps; docs: Record<Id, string> }> {
  const { store, registry, maps, docs } = await buildPf2eDemo({ seed, ...(module ? { module } : {}) });
  registry.closeAll();
  store.destroy();
  return { maps, docs };
}
