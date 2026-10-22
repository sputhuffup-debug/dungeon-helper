/**
 * "Thornwick Crossing": the fifth edition demo (one-shot mode, SRD 5.1 data
 * pack `dnd5e-srd`). A short original adventure, "The Bell of Thornwick": a
 * goblin band has stolen a river village's flood bell, and four level 3
 * characters have one evening to bring it back.
 *
 * What it shows: player characters whose sheets derive every modifier,
 * save and skill bonus from the scores and proficiencies written down; SRD
 * monsters from the pack's presets (Goblin, Wolf, Bugbear) in the scenes and
 * encounters; a faction, a quest, NPCs (one rolled with the pack's NPC
 * generator); an adventure from the pack's one-shot template; and a planned
 * session whose first scene is a fight, so table mode opens with the
 * monsters on the hit point tracker; and a supplement (the original "Thornwick
 * Homebrew", installed with the demo) whose background one PC has.
 *
 * Original content in our own words (not a published adventure). Stat blocks
 * come from the SRD presets unchanged except for names. Deterministic: the
 * generated NPC, the tavern, each character's trinket and the weather depend
 * only on the seed and the module version; ids and timestamps are fresh.
 *
 * The pack is JSON loaded lazily, so this build is async. The web app passes
 * the module it already loaded; Node callers let it load the pack source.
 *
 * Browser-safe: no `node:` imports.
 */
import {
  checkSupplement,
  createRng,
  createTableRegistry,
  formatPackIssue,
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
import { dnd5eSrdSource, THORNWICK_SUPPLEMENT_ID, thornwickHomebrewSupplement } from "@campaign-forge/module-dnd5e-srd";
import { writeDemoPrimer } from "./primer";

export const DND5E_DEMO_SEED = "thornwick";
export const DND5E_DEMO_NAME = "Thornwick Crossing";
export const DND5E_ADVENTURE_TITLE = "The Bell of Thornwick";
export const DND5E_MODULE_ID = "dnd5e-srd";
/** The original supplement the demo uses (a PC's background comes from it); the web app installs it with the demo. */
export const DND5E_DEMO_SUPPLEMENT_ID = THORNWICK_SUPPLEMENT_ID;
export { thornwickHomebrewSupplement };

/** The SRD 5.1 module with the demo's supplement applied, as the app loads it once the supplement is installed. */
export async function dnd5eDemoModule(): Promise<GameModule> {
  const base = await moduleFromPackSource(dnd5eSrdSource);
  const res = checkSupplement(await thornwickHomebrewSupplement(), base);
  if (!res.ok || !res.module) throw new Error(`5e demo: the ${THORNWICK_SUPPLEMENT_ID} supplement does not fit:\n${res.issues.map(formatPackIssue).join("\n")}`);
  return res.module;
}

export interface BuildDnd5eDemoOptions {
  seed?: string;
  name?: string;
  /**
   * The SRD 5.1 module with the Thornwick Homebrew supplement applied, if the
   * caller already loaded it (the web app does, after installing the
   * supplement); otherwise the pack source is loaded and the supplement applied.
   */
  module?: GameModule;
}

export interface Dnd5eDemoCampaign {
  store: CampaignStore;
  registry: RichTextRegistry;
  maps: CampaignMaps;
  /** Rich-text bodies as Markdown, keyed by doc id (`[[id|name]]` references). */
  docs: Record<Id, string>;
  /** Ids of the main records, for tests and the CLI. */
  ids: { adventure: Id; session: Id; pcs: Id[]; firstScene: Id; boss: Id; quest: Id; faction: Id };
}

const PLAYERS: Visibility = { level: "players" };
const GM: Visibility = { level: "gm" };
const T = DND5E_MODULE_ID;

function ref(e: Pick<Entity, "id" | "name">): string {
  return `[[${e.id}|${e.name}]]`;
}

function writeDoc(registry: RichTextRegistry, docId: Id | undefined, markdown: string): void {
  if (!docId) return;
  fromMarkdown(registry.open(docId), markdown);
}

function requirePreset(mod: LoadedModule, id: string): EntityPreset {
  const p = mod.preset(id);
  if (!p) throw new Error(`5e demo: module has no preset "${id}"`);
  return p;
}

/** Roll one of the pack's tables and read a string out of the row's result. */
function rollText(mod: LoadedModule, rng: Rng, tableId: string, key: string): string {
  const table = mod.module.tables.find((t) => t.id === tableId);
  if (!table) throw new Error(`5e demo: module has no table "${tableId}"`);
  const rec = rollTable(table, rng, createTableRegistry(mod.module.tables));
  const v = (rec.result as Record<string, unknown> | undefined)?.[key];
  return typeof v === "string" ? v : String(rec.rowLabel ?? "");
}

// ---------------------------------------------------------------------------
// the party: four level 3 characters, written down as a player would
// ---------------------------------------------------------------------------

interface PcSpec {
  name: string;
  summary: string;
  fields: Record<string, unknown>;
}

const PARTY: PcSpec[] = [
  {
    name: "Brannoc Ashby",
    summary: "Human fighter (Champion) who used to guard the salt caravans.",
    fields: {
      class: "fighter",
      subclass: "Champion",
      level: 3,
      race: "Human",
      background: "Caravan guard",
      alignment: "lawful-good",
      xp: 950,
      abilities: { strength: 16, dexterity: 14, constitution: 15, intelligence: 9, wisdom: 13, charisma: 11 },
      saves: { "strength-save": 1, "constitution-save": 1 },
      skills: { athletics: 1, intimidation: 1, perception: 1, survival: 1 },
      ac: 19,
      speed: 30,
      hp: { max: 28, current: 28, temp: 0 },
      attacks: [
        { name: "Longsword", bonus: "+5", damage: "1d8 + 3 slashing", notes: "Versatile (1d10)" },
        { name: "Javelin", bonus: "+5", damage: "1d6 + 3 piercing", notes: "Thrown, 30/120 ft." },
      ],
      features: [
        { name: "Fighting Style: Defense", desc: "+1 to AC while wearing armor (included above)." },
        { name: "Second Wind", desc: "Once per short rest, a bonus action to regain 1d10 + 3 hit points." },
        { name: "Action Surge", desc: "Once per short rest, one extra action on your turn." },
        { name: "Improved Critical", desc: "Weapon attacks score a critical hit on a 19 or 20." },
      ],
      proficiencies: "All armor and shields; simple and martial weapons; vehicles (land).",
      languages: ["Common", "Halfling"],
      equipment: [
        { name: "Chain mail", quantity: 1 },
        { name: "Shield", quantity: 1 },
        { name: "Longsword", quantity: 1 },
        { name: "Javelin", quantity: 4 },
        { name: "Explorer's pack", quantity: 1 },
      ],
      coins: { cp: 0, sp: 14, ep: 0, gp: 22, pp: 0 },
      personality: {
        traits: "Talks to horses more than to people, and gets better answers.",
        ideals: "A road is only safe if someone keeps it safe.",
        bonds: "Owes Reeve Marr for a winter's lodging and a broken leg set straight.",
        flaws: "Never backs down from a challenge, even a stupid one.",
      },
      appearance: "Broad, sunburnt, a grey streak through his black hair; carries a dented caravan horn.",
    },
  },
  {
    name: "Wren Talliver",
    summary: "Halfling rogue (Thief) who grew up building and poling the Thornwick ferry.",
    fields: {
      class: "rogue",
      subclass: "Thief",
      level: 3,
      race: "Halfling",
      subrace: "Lightfoot",
      // from the Thornwick Homebrew supplement the demo installs
      background: "Ferrywright",
      alignment: "chaotic-good",
      xp: 950,
      abilities: { strength: 8, dexterity: 17, constitution: 12, intelligence: 13, wisdom: 10, charisma: 15 },
      saves: { "dexterity-save": 1, "intelligence-save": 1 },
      skills: { stealth: 2, "sleight-of-hand": 2, acrobatics: 1, deception: 1, perception: 1, investigation: 1 },
      ac: 14,
      speed: 25,
      hp: { max: 21, current: 21, temp: 0 },
      attacks: [
        { name: "Shortsword", bonus: "+5", damage: "1d6 + 3 piercing", notes: "Finesse, light" },
        { name: "Shortbow", bonus: "+5", damage: "1d6 + 3 piercing", notes: "80/320 ft." },
      ],
      features: [
        { name: "Sneak Attack", desc: "Once per turn, +2d6 damage with a finesse or ranged weapon when you have advantage or an ally is next to the target." },
        { name: "Cunning Action", desc: "Dash, Disengage or Hide as a bonus action." },
        { name: "Fast Hands", desc: "Use an object, pick a lock or disarm a trap as a bonus action." },
        { name: "Lucky", desc: "Reroll a natural 1 on an attack, check or save." },
        { name: "Right of Passage", desc: "Ferry folk, bargees and bridge keepers carry the party for free or a favour, and share what they saw on the water." },
      ],
      proficiencies: "Light armor; simple weapons, hand crossbows, longswords, rapiers, shortswords; thieves' tools; water vehicles.",
      languages: ["Common", "Halfling", "Thieves' cant"],
      equipment: [
        { name: "Leather armor", quantity: 1 },
        { name: "Shortsword", quantity: 2 },
        { name: "Shortbow", quantity: 1 },
        { name: "Arrows", quantity: 20 },
        { name: "Thieves' tools", quantity: 1 },
      ],
      coins: { cp: 30, sp: 8, ep: 0, gp: 9, pp: 0 },
      personality: {
        traits: "Hums the ferry songs when nervous, which is often.",
        ideals: "Everyone deserves a way across.",
        bonds: "Rang the ford bell every flood since she was seven.",
        flaws: "Cannot leave a locked box alone.",
      },
      appearance: "Small even for a halfling, river-brown curls, a pole-callused grin.",
    },
  },
  {
    name: "Isolde Fairweather",
    summary: "High elf wizard (Evocation) studying the old flood wards.",
    fields: {
      class: "wizard",
      subclass: "School of Evocation",
      level: 3,
      race: "Elf",
      subrace: "High elf",
      background: "Hedge scholar",
      alignment: "neutral-good",
      xp: 950,
      abilities: { strength: 8, dexterity: 15, constitution: 13, intelligence: 16, wisdom: 12, charisma: 10 },
      saves: { "intelligence-save": 1, "wisdom-save": 1 },
      skills: { arcana: 1, history: 1, investigation: 1, perception: 1, insight: 1 },
      ac: 12,
      speed: 30,
      hp: { max: 17, current: 17, temp: 0 },
      spells: ["Fire Bolt", "Mage Hand", "Light", "Magic Missile", "Shield", "Sleep", "Burning Hands", "Detect Magic", "Misty Step", "Scorching Ray"],
      attacks: [
        { name: "Fire Bolt", bonus: "+5", damage: "1d10 fire", notes: "Cantrip, 120 ft." },
        { name: "Dagger", bonus: "+4", damage: "1d4 + 2 piercing", notes: "Finesse, thrown 20/60 ft." },
      ],
      features: [
        { name: "Arcane Recovery", desc: "Once a day after a short rest, recover spell slots totalling up to 2 levels." },
        { name: "Sculpt Spells", desc: "Allies caught in your evocation spells can be spared from the effect." },
        { name: "Fey Ancestry", desc: "Advantage against being charmed; magic cannot put you to sleep." },
        { name: "Trance", desc: "Four hours of meditation count as a long rest's sleep." },
      ],
      proficiencies: "Daggers, darts, slings, quarterstaffs, light crossbows; longswords, shortswords, shortbows, longbows (elf).",
      languages: ["Common", "Elvish", "Draconic"],
      equipment: [
        { name: "Spellbook", quantity: 1 },
        { name: "Arcane focus (crystal)", quantity: 1 },
        { name: "Dagger", quantity: 1 },
        { name: "Scholar's pack", quantity: 1 },
      ],
      coins: { cp: 0, sp: 20, ep: 0, gp: 15, pp: 0 },
      personality: {
        traits: "Takes notes on everything, including insults.",
        ideals: "Old knowledge is a debt we owe the dead.",
        bonds: "Believes the ford bell is older than the village and wants to read its inscription.",
        flaws: "Assumes she is the cleverest person present.",
      },
      appearance: "Tall and ink-stained, silver hair in a hurried knot, spectacles she does not need.",
    },
  },
  {
    name: "Tobin Greaves",
    summary: "Hill dwarf cleric (Life Domain) who tends the ford-chapel's sick-house.",
    fields: {
      class: "cleric",
      subclass: "Life Domain",
      level: 3,
      race: "Dwarf",
      subrace: "Hill dwarf",
      background: "Acolyte",
      alignment: "lawful-good",
      xp: 950,
      abilities: { strength: 14, dexterity: 8, constitution: 15, intelligence: 10, wisdom: 16, charisma: 12 },
      saves: { "wisdom-save": 1, "charisma-save": 1 },
      skills: { insight: 1, religion: 1, medicine: 1, history: 1 },
      ac: 18,
      speed: 25,
      hp: { max: 27, current: 27, temp: 0 },
      spells: ["Sacred Flame", "Guidance", "Spare the Dying", "Bless", "Cure Wounds", "Healing Word", "Shield of Faith", "Lesser Restoration", "Spiritual Weapon"],
      attacks: [
        { name: "Warhammer", bonus: "+4", damage: "1d8 + 2 bludgeoning", notes: "Versatile (1d10)" },
        { name: "Sacred Flame", bonus: "DC 13 Dex", damage: "1d8 radiant", notes: "Cantrip, 60 ft." },
      ],
      features: [
        { name: "Disciple of Life", desc: "Healing spells of 1st level or higher restore 2 + the spell's level extra hit points." },
        { name: "Channel Divinity: Preserve Life", desc: "Share out 15 hit points of healing among creatures within 30 feet." },
        { name: "Dwarven Resilience", desc: "Advantage on saves against poison, and resistance to poison damage." },
        { name: "Dwarven Toughness", desc: "+1 hit point per level (included above)." },
      ],
      proficiencies: "Light, medium and heavy armor; shields; simple weapons; battleaxe, handaxe, light hammer, warhammer (dwarf); mason's tools.",
      languages: ["Common", "Dwarvish", "Celestial"],
      equipment: [
        { name: "Chain mail", quantity: 1 },
        { name: "Shield", quantity: 1 },
        { name: "Warhammer", quantity: 1 },
        { name: "Holy symbol (amulet)", quantity: 1 },
        { name: "Healer's kit", quantity: 1 },
      ],
      coins: { cp: 12, sp: 5, ep: 0, gp: 11, pp: 0 },
      personality: {
        traits: "Blesses every meal twice, the second time quietly for the cook.",
        ideals: "Mercy first, and hard work right after.",
        bonds: "Sister Edda took him in when the mines closed.",
        flaws: "Trusts anyone who prays, which has gone badly before.",
      },
      appearance: "Barrel-chested, a braided red beard tied with chapel ribbon, smells of lavender and liniment.",
    },
  },
];

// ---------------------------------------------------------------------------
// the build
// ---------------------------------------------------------------------------

/** Build the fifth edition demo into a fresh store and rich-text registry. */
export async function buildDnd5eDemo(opts: BuildDnd5eDemoOptions = {}): Promise<Dnd5eDemoCampaign> {
  const seed = opts.seed ?? DND5E_DEMO_SEED;
  const name = opts.name ?? DND5E_DEMO_NAME;
  const game = opts.module ?? (await dnd5eDemoModule());
  const mod = loadModule(game, { skipProcedureRuns: true });
  if (mod.manifest.id !== DND5E_MODULE_ID) throw new Error(`5e demo: expected the ${DND5E_MODULE_ID} module, got "${mod.manifest.id}"`);
  if (!mod.manifest.supplements?.some((s) => s.id === DND5E_DEMO_SUPPLEMENT_ID)) throw new Error(`5e demo: the module needs the ${DND5E_DEMO_SUPPLEMENT_ID} supplement applied`);
  const rng = createRng(`seed-campaign/dnd5e/${seed}`);
  const registry = new RichTextRegistry();
  const cal = game.calendar;
  if (!cal) throw new Error("5e demo: module has no calendar");
  const year = cal.defaultYear;
  const date = (m: number, d: number) => `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const store = CampaignStore.create({
    name,
    moduleId: mod.manifest.id,
    moduleVersion: mod.manifest.version,
    mode: "one-shot",
    calendarId: cal.id,
    currentDate: date(4, 14),
    gmName: "GM",
    settings: { seed },
  });

  // new records start from the schema defaults, as the app's "New" does
  const create = (input: Parameters<CampaignStore["createEntity"]>[0]): Entity => {
    const def = mod.entityType(input.type);
    if (!def) throw new Error(`5e demo: module has no entity type "${input.type}"`);
    return store.createEntity({ ...input, fields: { ...defaultFieldsFor(def), ...(input.fields ?? {}) } });
  };

  // -- places ------------------------------------------------------------------
  const tavernName = `The ${rollText(mod, rng.fork("tavern/first"), `${T}.tavern.name-first`, "name")} ${rollText(mod, rng.fork("tavern/second"), `${T}.tavern.name-second`, "name")}`;
  const speciality = rollText(mod, rng.fork("tavern/special"), `${T}.tavern.special`, "text");
  const location = (entityName: string, subtype: string, fields: Record<string, unknown>, summary: string, visibility: Visibility = PLAYERS) =>
    create({ type: `${T}.location`, subtype, name: entityName, summary, fields, visibility, tags: ["demo"] });
  const village = location(
    "Thornwick",
    "settlement",
    {
      environment: "grassland",
      size: "village",
      population: "about three hundred, mostly millers, ferry folk and farmers",
      ruler: "Reeve Hollis Marr",
      danger: "low",
      features: ["A stone causeway and toll ford over the Brackwater", "The ford-chapel, its bell tower empty since the theft", "A granary that feeds three villages through the floods"],
      description: "A river village that lives by its ford. When the spring flood comes the ford-chapel's bronze bell rings, and everyone climbs to the granary hill until the water drops.",
      secrets: "The bell-repair fund paid for the new mill wheel instead. The goblins heard about it in the tavern.",
    },
    "River village at the Brackwater ford, three days from the spring flood.",
  );
  const tavern = location(
    tavernName,
    "building",
    { environment: "urban", danger: "safe", features: [`House speciality: ${speciality}`, "A back room the reeve uses as his office"], description: "Low beams, a fire that never goes out, and every rumour in Thornwick by sundown." },
    `Thornwick's only inn. House speciality: ${speciality.charAt(0).toLowerCase()}${speciality.slice(1)}.`,
  );
  const tollhouse = location(
    "The Old Toll-house",
    "building",
    { environment: "grassland", danger: "moderate", features: ["Collapsed roof, one standing wall", "The toll chain still across the causeway"], description: "A ruined toll-house at the far end of the causeway, where the ransom note was nailed." },
    "A ruin at the far end of the causeway. The ransom note was nailed to its door.",
  );
  const wood = location(
    "Mossback Wood",
    "wilderness",
    { environment: "forest", danger: "moderate", features: ["Deer paths that double back on themselves", "A ravine with one rope bridge"], description: "Old oaks thick with moss, and fresh cart ruts where nobody should be driving a cart." },
    "Old forest east of the river; the goblins' cart ruts lead in.",
  );
  const tower = location(
    "The Sunken Watchtower",
    "dungeon",
    {
      environment: "swamp",
      danger: "high",
      features: ["Half drowned in the marsh, entered by the second-floor window", "A cracked bell-frame the goblins built on the roof"],
      description: "A border watchtower that sank a storey into the marsh a century ago.",
      secrets: "Grisk plans to ring the stolen bell on the first night of the flood: the village will run to the granary hill, straight into his ambush.",
    },
    "A sunken border tower in the marsh, lair of the Ashgrin band.",
    GM,
  );
  store.createRelationship("within", tavern.id, village.id, undefined, PLAYERS);
  store.createRelationship("within", tollhouse.id, village.id, undefined, PLAYERS);
  store.createRelationship("within", tower.id, wood.id, "In the marsh at the wood's edge", GM);

  // -- the party -----------------------------------------------------------------
  const prng = rng.fork("party");
  const pcs = PARTY.map((spec, i) => {
    const trinket = rollText(mod, prng.fork(`trinket/${i}`), `${T}.treasure.trinket`, "text");
    const fields: Record<string, unknown> = { isPC: true, ...structuredClone(spec.fields) };
    fields["equipment"] = [...(fields["equipment"] as unknown[]), { name: `Trinket: ${trinket}`, quantity: 1 }];
    return create({ type: `${T}.character`, name: spec.name, summary: spec.summary, fields, visibility: PLAYERS, tags: ["party"] });
  });
  const [brannoc, wren, isolde, tobin] = pcs as [Entity, Entity, Entity, Entity];
  store.createRelationship("knows", wren.id, tobin.id, "Both grew up within earshot of the bell", PLAYERS);
  store.createRelationship(`${T}.rival-of`, brannoc.id, isolde.id, "A running argument about whose plan it is", PLAYERS);

  // -- the faction and its monsters (SRD presets) --------------------------------
  const faction = create({
    type: `${T}.faction`,
    name: "The Ashgrin Band",
    summary: "Goblin raiders under a bugbear chief, newly settled in the marsh.",
    fields: {
      goal: "Raid Thornwick's granary on the first night of the flood.",
      leader: "Grisk Hollowjaw, a bugbear",
      alignment: "neutral-evil",
      resources: "A dozen goblins, two trained wolves, a sunken watchtower and a stolen cart.",
      standing: -2,
      methods: "Night raids, ransom notes, wolves to run down stragglers.",
      secrets: "Half the band would desert if Grisk fell, and one already has.",
    },
    visibility: PLAYERS,
    tags: ["demo", "villains"],
  });
  store.createRelationship("found_at", faction.id, tower.id, "Their lair", GM);
  const monster = (presetId: string, entityName: string, summary?: string) =>
    presetToEntity(store, requirePreset(mod, presetId), { name: entityName, visibility: GM, ...(summary ? { summary } : {}) });
  const goblins = [1, 2, 3, 4].map((n) => monster(`${T}.preset.goblin`, `Goblin ${n}`));
  const wolves = [1, 2].map((n) => monster(`${T}.preset.wolf`, `Wolf ${n}`));
  const boss = monster(`${T}.preset.bugbear`, "Grisk Hollowjaw", "Bugbear chief of the Ashgrin band. Medium humanoid (goblinoid), chaotic evil. CR 1 (200 XP), AC 16, HP 27.");
  for (const g of [...goblins, boss]) store.createRelationship("member_of", g.id, faction.id, undefined, GM);
  for (const w of wolves) store.createRelationship(`${T}.serves`, w.id, boss.id, "Raised from pups", GM);
  store.createRelationship(`${T}.lairs-in`, boss.id, tower.id, undefined, GM);

  // -- NPCs ---------------------------------------------------------------------
  const npc = (entityName: string, summary: string, fields: Record<string, unknown>, visibility: Visibility = PLAYERS) =>
    create({ type: `${T}.npc`, name: entityName, summary, fields, visibility, tags: ["demo"] });
  const reeve = npc("Reeve Hollis Marr", "Thornwick's harried reeve; offers the reward.", {
    occupation: "Reeve of Thornwick",
    race: "Human",
    alignment: "lawful-neutral",
    attitude: "friendly",
    appearance: "Fifty, ink on his cuffs, the reeve's chain worn under his coat so it will not catch on things.",
    quirk: "Counts on his fingers when he is worried.",
    voice: "Fast and apologetic, then suddenly firm.",
    motivation: "Get the bell back before the flood, without paying a ransom he cannot afford.",
    secret: "He spent the bell-repair fund on the mill wheel; the goblins know.",
    statBlock: "Noble",
  });
  const edda = npc("Sister Edda Vane", "Keeper of the ford-chapel and its sick-house.", {
    occupation: "Chapel keeper",
    race: "Half-elf",
    alignment: "neutral-good",
    attitude: "helpful",
    appearance: "Grey robes hitched up for wading, a lantern always lit at her belt.",
    quirk: "Finishes other people's prayers for them.",
    voice: "Low and patient; never raises it, never needs to.",
    motivation: "Ring the bell before the river rises, whatever the reeve's pride costs.",
    secret: "She saw the reeve's ledger and said nothing.",
    statBlock: "Acolyte",
  });
  const pockle = npc(
    "Pockle",
    "A goblin deserter hiding in Mossback Wood.",
    {
      occupation: "Deserter from the Ashgrin band",
      race: "Goblin",
      alignment: "chaotic-neutral",
      attitude: "unfriendly",
      appearance: "One ear notched, wrapped in a stolen chapel altar-cloth.",
      quirk: "Talks about himself in the third person when lying.",
      voice: "A wheedling whisper that jumps to a squeak.",
      motivation: "See Grisk fall so he can go home to the warren.",
      secret: "He is the one who told Grisk about the bell and the flood.",
      statBlock: "Goblin",
    },
    GM,
  );
  // the innkeeper: rolled with the pack's NPC generator, then given the inn
  const npcProc = mod.procedure(`${T}.proc.npc`);
  if (!npcProc) throw new Error("5e demo: module has no NPC generator");
  const npcGraph = runProcedure(npcProc, game, { seed: `${seed}/innkeeper`, inputs: {} });
  const npcAccepted = acceptGeneratedGraph(store, npcGraph, { moduleId: mod.manifest.id, visibility: PLAYERS });
  const rolled = npcAccepted.entities[0];
  if (!rolled) throw new Error("5e demo: the NPC generator produced nothing");
  const innkeeper = store.update("entities", rolled.id, {
    summary: `${String(rolled.fields["race"] ?? "")} innkeeper of ${tavernName}.`.trim(),
    fields: { ...rolled.fields, occupation: `Innkeeper of ${tavernName}`, statBlock: "Commoner", attitude: "friendly" },
    tags: ["demo"],
  });
  for (const path of ["summary", "occupation", "statBlock", "attitude"]) recordEdit(store, npcAccepted.run.id, innkeeper.id, path);
  store.createRelationship("found_at", reeve.id, tavern.id, "Holds court in the back room", PLAYERS);
  store.createRelationship("found_at", innkeeper.id, tavern.id, undefined, PLAYERS);
  store.createRelationship("found_at", edda.id, village.id, "At the ford-chapel", PLAYERS);
  store.createRelationship("found_at", pockle.id, wood.id, "Hiding near the ravine", GM);
  store.createRelationship("knows", tobin.id, edda.id, "She took him in when the mines closed", PLAYERS);
  store.createRelationship("knows", brannoc.id, reeve.id, "Owes him a winter's lodging", PLAYERS);
  store.createRelationship("member_of", pockle.id, faction.id, "Deserted a week ago", GM);

  // -- the quest -----------------------------------------------------------------
  const quest = create({
    type: `${T}.quest`,
    name: "Ring the Bell Again",
    summary: "Bring the ford bell home before the spring flood.",
    fields: {
      hook: "The ford bell is gone, the river is rising, and a ransom note is nailed to the old toll-house.",
      patron: "Reeve Hollis Marr",
      objective: "Recover the bronze bell from the Ashgrin band and hang it in the chapel tower before the flood.",
      reward: "60 gp each, and free passage on the ferry for life.",
      deadline: "Three days: the flood comes on the first of Blossom.",
      status: "active",
      complications: "The bell weighs as much as two people; carrying it home is its own problem. The reeve's secret comes out if Pockle talks.",
    },
    visibility: PLAYERS,
    tags: ["demo"],
  });
  store.createRelationship("wants", reeve.id, quest.id, "Patron", PLAYERS);
  store.createRelationship("blocks", faction.id, quest.id, undefined, GM);

  // -- encounters (creatures appear in them, as the encounter generator links them) --
  const xpOf = (e: Entity) => Number(e.fields["xp"] ?? 0);
  const crOf = (e: Entity) => {
    const cr = Number(e.fields["cr"] ?? 0);
    return cr === 0.25 ? "1/4" : cr === 0.5 ? "1/2" : cr === 0.125 ? "1/8" : String(cr);
  };
  const encounter = (entityName: string, creatures: Entity[], environment: string, extra: Record<string, unknown>) => {
    const counts = new Map<string, { n: number; cr: string }>();
    for (const c of creatures) {
      const preset = String(c.provenance?.preset ?? "");
      const label = mod.preset(preset)?.name ?? c.name;
      counts.set(label, { n: (counts.get(label)?.n ?? 0) + 1, cr: crOf(c) });
    }
    const e = create({
      type: `${T}.encounter`,
      name: entityName,
      fields: {
        environment,
        partyLevel: 3,
        creatures: [...counts].map(([label, { n, cr }]) => `${n} × ${label} (CR ${cr})`).join(", "),
        xpTotal: creatures.reduce((sum, c) => sum + xpOf(c), 0),
        status: "planned",
        ...extra,
      },
      visibility: GM,
      tags: ["demo"],
    });
    for (const c of creatures) store.createRelationship("appears_in", c.id, e.id, undefined, GM);
    return e;
  };
  const [g1, g2, g3, g4] = goblins as [Entity, Entity, Entity, Entity];
  const [w1, w2] = wolves as [Entity, Entity];
  const ambush = encounter("Ambush at the toll-house", [g1, g2, w1], "grassland", {
    activity: "Two goblins collecting the ransom, a wolf on watch.",
    twist: "One goblin carries the reeve's own seal, cut from the ransom note.",
    tactics: "Shortbows from behind the standing wall; the wolf goes for whoever is alone on the causeway. They flee at half strength.",
    treasure: "11 sp, a chapel candlestick, the torn seal.",
  });
  const ravine = encounter("The ravine crossing", [g3, g4], "forest", {
    activity: "Two goblins guarding the rope bridge, with a deadfall rigged on the near side.",
    twist: "Cutting the bridge is their orders; they would rather not.",
    tactics: "One shoots while the other saws at the ropes. Spotting the deadfall: DC 13 Wisdom (Perception).",
    treasure: "A rough map of the tower's flooded ground floor.",
  });
  const hall = encounter("Grisk's bell-frame", [boss, w2], "swamp", {
    activity: "Grisk and his wolf on the tower roof, hauling the bell into its new frame.",
    twist: "If the bell rings, the village starts for the granary hill: someone has to stop them.",
    tactics: "Grisk opens with a javelin, then closes to the morningstar; the wolf tries to knock casters prone. Grisk surrenders at 5 hit points.",
    treasure: "The bell, Grisk's purse (34 gp), a potion of healing.",
  });

  // -- the adventure from the pack's one-shot template --------------------------
  const template = mod.templatesFor("adventure", "one-shot")[0] ?? mod.templatesFor("adventure")[0];
  if (!template) throw new Error("5e demo: module has no adventure template");
  const scaffold = template.scaffold as { acts?: Array<{ number: number; title?: string; goal: string; pacing?: string; scenes?: Array<{ purpose: string; mandatory?: boolean }> }> };
  const adventure = store.createAdventure({
    title: DND5E_ADVENTURE_TITLE,
    premise: "Goblins have stolen Thornwick's flood bell, and the spring flood is three days off. Without the bell nobody will know when to climb the granary hill.",
    status: "planned",
    templateId: template.id,
    tags: ["demo", "one-shot"],
    hooksIn: ["A ransom note on the toll-house door: forty gold, or the bell goes in the river."],
    hooksOut: ["Pockle wants to go home to the warren, and the warren is under the old dwarf mines."],
    withDocs: true,
  });
  writeDoc(
    registry,
    adventure.playerIntroDoc,
    `The bell of ${ref(village)} is gone. You are at ${ref(tollhouse)} at dusk, because the ransom note said to come alone, and you did not. ${ref(reeve)} is paying for it to come home: ${ref(quest)}.`,
  );
  writeDoc(
    registry,
    adventure.gmSituationDoc,
    [
      `${ref(boss)} leads ${ref(faction)}. His plan has three steps:`,
      "",
      `1. Steal the bell and demand a ransom, to see what the village will pay.`,
      `2. Hang the bell in his own frame on ${ref(tower)}.`,
      `3. On the first flood night, ring it: the villagers run for the granary hill, into the wolves.`,
      "",
      `Each act the party does not stop a step, the next one happens. ${ref(pockle)} knows all three and wants a reason to talk.`,
    ].join("\n"),
  );
  writeDoc(registry, adventure.epilogueDoc, `If the bell rings from the chapel on flood night, ${ref(edda)} names a bell-rope after each character. If not, the granary burns and the reeve's secret comes out.`);

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
      title: "Ambush at the toll-house",
      location: tollhouse,
      participants: [g1, g2, w1],
      encounter: ambush,
      body: `${ref(g1)} and ${ref(g2)} wait behind the standing wall for the ransom; ${ref(w1)} lies in the reeds. A stealthy approach gets surprise. See ${ref(ambush)}.`,
      readAloud: "Mist sits on the river. The toll chain clinks in the wind, and somewhere behind the broken wall something is chewing.",
    },
    "1.2": {
      title: "The reeve's plea",
      location: tavern,
      participants: [reeve, edda, innkeeper],
      body: `Back at ${ref(tavern)}, ${ref(reeve)} offers the reward and dodges questions about the bell fund. ${ref(edda)} explains the flood. ${ref(innkeeper)} heard goblins mentioned the old tower.`,
      readAloud: "The common room goes quiet when you come in carrying a goblin's shortbow.",
    },
    "2.1": {
      title: "Into Mossback Wood",
      location: wood,
      participants: [pockle],
      body: `Cart ruts lead into ${ref(wood)}. ${ref(pockle)} shadows the party and can be caught (DC 12 Wisdom (Perception)) or coaxed out with food.`,
      readAloud: "The oaks close overhead. Fresh cart ruts, deep ones, wind between the trunks as if the cart were very heavy.",
    },
    "2.2": {
      title: "The ravine crossing",
      location: wood,
      participants: [g3, g4],
      encounter: ravine,
      body: `${ref(g3)} and ${ref(g4)} hold the rope bridge, with a deadfall on the near side. See ${ref(ravine)}.`,
      readAloud: "A rope bridge sways over a ravine full of white water. On the far side, two small figures are sawing at the ropes.",
    },
    "3.1": {
      title: "The sunken watchtower",
      location: tower,
      participants: [boss, w2, pockle],
      encounter: hall,
      body: `${ref(boss)} and ${ref(w2)} on the roof of ${ref(tower)}, hauling the bell into its frame. Stop the bell ringing, then deal with Grisk. See ${ref(hall)}.`,
      readAloud: "The tower leans out of the marsh like a drowned man's arm. On its roof, against the last light, a bell swings in a frame of lashed timber.",
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
  if (!firstScene) throw new Error("5e demo: the template made no scenes");

  // -- a handout: the ransom note ----------------------------------------------------
  const note = store.createHandout({ title: "The ransom note", kind: "text", visibility: PLAYERS, attachedTo: { kind: "scene", id: firstScene.id } });
  writeDoc(registry, note.bodyDoc, "BELL IS OURS. FORTY GOLD AT THE TOLL HOUSE OR BELL GOES IN THE RIVER. COME ALONE. NO TRICKS. NO PRIESTS.");

  // -- timeline, the session, a tour note ---------------------------------------------
  store.createTimelineEvent({ inWorldDate: date(4, 11), text: "The ford bell is stolen from the chapel tower in the night.", entities: [village.id], visibility: PLAYERS });
  store.createTimelineEvent({ inWorldDate: date(4, 12), text: "A ransom note appears on the old toll-house door.", entities: [tollhouse.id], visibility: PLAYERS });
  store.createTimelineEvent({ inWorldDate: date(4, 13), text: "Grisk's scouts count the guards on the granary hill.", entities: [boss.id, village.id], visibility: GM });

  const weather = rollText(mod, rng.fork("weather"), `${T}.travel.weather`, "text");
  const checklist = sessionChecklist(store.meta(), moduleChecklistItems(game.templates, mod.manifest.id));
  const session = store.createSession({ number: 1, date: "2026-11-21", title: DND5E_ADVENTURE_TITLE, status: "planned" });
  store.update("sessions", session.id, {
    nextPlan: [
      "Open at the toll-house at dusk: ask who is hiding where, then roll Stealth against the goblins' passive Perception (9).",
      "Roll initiative with everyone in the scene; the goblins flee at half strength.",
      `Weather on the road to the wood: ${weather.charAt(0).toLowerCase()}${weather.slice(1)}.`,
      "Keep the finale under an hour: the bell must not ring.",
    ],
    plannedScenes: scenes.map((s) => s.id),
  } as Partial<Session>);
  writeDoc(registry, session.logDoc, "");
  autoTickChecklist(store, session.id, checklistItemsFor(checklist, "scenes-planned"));
  for (const id of ["prep.goal", "prep.opening", "prep.people", "prep.threat", `${T}.prep.levels`, `${T}.prep.monsters`, `${T}.prep.names`]) {
    if (checklist.some((c) => c.id === id)) setChecklistItem(store, session.id, id, true);
  }

  const tour = store.createNote({ title: `Demo tour: ${name}`, attachedTo: { kind: "campaign", id: store.id }, tags: ["demo"] });
  writeDoc(
    registry,
    tour.bodyDoc,
    [
      "## What this demo shows",
      "",
      `- **Character sheets**: open ${ref(brannoc)}, ${ref(wren)}, ${ref(isolde)} or ${ref(tobin)}. Scores and proficiencies are written down; modifiers, proficiency bonus, saves, skills, passive scores and spellcasting numbers are derived.`,
      `- **SRD monsters**: ${ref(g1)}, ${ref(w1)} and ${ref(boss)} came from the pack's presets, with their stat blocks.`,
      `- **Table mode**: start session 1. The first scene is ${ref(ambush)}; roll Stealth from the Dice tab with advantage and a DC, then roll initiative on the Trackers tab.`,
      `- **Generators**: ${ref(innkeeper)} was rolled with the NPC generator; try the encounter generator under Generate.`,
      "",
      "Original adventure; the rules content is from the SRD 5.1 (CC-BY-4.0), see Settings for the attribution.",
    ].join("\n"),
  );

  // -- the campaign primer (original text) ----------------------------------------
  writeDemoPrimer(store, registry, game, {
    welcome: "**Thornwick Crossing** is a one-shot for four level 3 heroes: a river village has lost its flood bell to goblins, and the spring flood is three days away. Expect sneaking, a fight or two, a goblin who wants to talk, and a race against rising water.",
    setting: [
      "The Brackwater is a slow brown river that floods every spring. The villages along it live by its fords, ferries and mills, and every one of them keeps a bell to warn of the water.",
      "Roads are poor, the reeves are tired, and the old border towers in the marshes have been empty for a century. Or so everyone thought.",
    ].join("\n\n"),
    lore: null,
    places: null,
    tone: [
      "Heroic and a little muddy: real danger, but the heroes are expected to win, and the village is worth saving.",
      "- **Lines** (never in the game): harm to children; cruelty to animals for its own sake.",
      "- **Veils** (happen off screen): anything you ask for.",
      "- **Safety tools**: an X-card on the table and a check-in at the break.",
    ].join("\n\n"),
    "house-rules": [
      "- Critical hits: roll the damage dice twice, as the rules say.",
      "- A short rest takes a meal and a fire; a long rest needs a roof.",
      "- Potions: drinking your own is a bonus action, feeding one to a friend is an action.",
    ].join("\n"),
    characters: null,
    opening: null,
  });

  const maps = store.toJSON();
  const resolve = nameResolver(store);
  const docs: Record<Id, string> = {};
  for (const id of docIdsOf(maps)) docs[id] = toMarkdown(registry.open(id), resolve);
  return {
    store,
    registry,
    maps,
    docs,
    ids: { adventure: adventure.id, session: session.id, pcs: pcs.map((p) => p.id), firstScene: firstScene.id, boss: boss.id, quest: quest.id, faction: faction.id },
  };
}

/** Plain JSON for the web app's "Load 5e demo" (load `maps` into a store, `docs` into the registry). */
export async function dnd5eDemoJSON(seed: string = DND5E_DEMO_SEED, module?: GameModule): Promise<{ maps: CampaignMaps; docs: Record<Id, string> }> {
  const { store, registry, maps, docs } = await buildDnd5eDemo({ seed, ...(module ? { module } : {}) });
  registry.closeAll();
  store.destroy();
  return { maps, docs };
}
