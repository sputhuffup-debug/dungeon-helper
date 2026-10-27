/**
 * The dungeon map generator (the SDK's built-in `dungeon` engine) and its
 * tables. What is ours and what is the SRD's:
 *
 * - room purposes, read-aloud lines and dressing: original (dungeonText.ts);
 * - encounters: the pack's own original encounter tables by terrain and
 *   level band (tables.ts), the count scaled by the threat dial and the
 *   party's size (original; the SRD 5.1 has no encounter-building rules);
 * - traps: the SRD 5.1 sample traps with their DCs and damage, and the SRD's
 *   Trap Save DCs and Attack Bonuses and Damage Severity by Level tables for
 *   scaling them (cited);
 * - locks: the SRD's Lock (DC 15 to pick, cited from the item);
 * - treasure: coins and the rarity of magic items by level band are an
 *   original stocking table; the items are the SRD's magic items.
 */
import type { MapLegendEntry, RollTable } from "@campaign-forge/module-sdk";
import type { PackMapGenerator } from "@campaign-forge/module-sdk";
import { ENCOUNTER, id, LIST, LOCATION, MONSTER } from "../ids.ts";
import { PASSAGE_DRESSING, ROOM_DRESSING, SENSES, SITES, type RoomText, type SiteId } from "./dungeonText.ts";
import { cat, ifs, lookup, max, mul, v, type Rule } from "./logic.ts";

export const DUNGEON_GENERATOR = id("map.dungeon");
const TRAPS_CITE = "SRD 5.1 — Adventuring: Traps, Sample Traps";
const TRAPS_IN_PLAY = "SRD 5.1 — Adventuring: Traps, Traps in Play";

/** Encounter-table terrain for each site type (the pack's encounter tables). */
const TERRAIN: Record<SiteId, string> = { crypt: "underground", cave: "underground", keep: "grassland", sewer: "urban", temple: "urban", mine: "underground" };

function roomTable(tableId: string, name: string, rows: RoomText[]): RollTable {
  return {
    id: id(tableId),
    name,
    family: "dungeon",
    original: true,
    dice: `1d${rows.length}`,
    rows: rows.map((r, i) => ({
      range: [i + 1, i + 1] as [number, number],
      label: r.name,
      result: { name: r.name, readAloud: r.readAloud, ...(r.gm ? { gm: r.gm } : {}), ...(r.tags ? { tags: r.tags } : {}), ...(r.flags ? { flags: r.flags } : {}) },
    })),
  };
}

function textTable(tableId: string, name: string, lines: string[]): RollTable {
  return { id: id(tableId), name, family: "dungeon", original: true, dice: `1d${lines.length}`, rows: lines.map((t, i) => ({ range: [i + 1, i + 1] as [number, number], label: t, result: { text: t } })) };
}

/** The SRD 5.1 sample traps, in short (numbers as the SRD gives them). */
const SAMPLE_TRAPS: Array<{ name: string; spot: string; effect: string }> = [
  { name: "Collapsing roof", spot: "Trip wire: spot it with DC 10; disable it with thieves' tools, DC 15 Dexterity.", effect: "The ceiling falls: DC 15 Dexterity save, 22 (4d10) bludgeoning damage, half as much on a success; the floor becomes difficult terrain." },
  { name: "Falling net", spot: "Trip wire and net: spot them with DC 10; break the wire with thieves' tools, DC 15 Dexterity.", effect: "A 10-foot-square net: those under it are restrained, and knocked prone on a failed DC 10 Strength save; a DC 10 Strength check frees one (the net has AC 10 and 20 hit points)." },
  { name: "Fire-breathing statue", spot: "Pressure plate and scorch marks: spot them with DC 15; an iron spike under the plate stops it.", effect: "A 30-foot cone of fire: DC 13 Dexterity save, 22 (4d10) fire damage, half as much on a success; dispel magic (DC 13) destroys the trap." },
  { name: "Simple pit", spot: "A covered pit: spot it with DC 10.", effect: "A 10-foot fall: 1d6 bludgeoning damage for every 10 feet." },
  { name: "Hidden pit", spot: "DC 15 Wisdom (Perception) notices the untrodden floor; DC 15 Intelligence (Investigation) confirms the cover.", effect: "A fall of 10 or 20 feet; a spike wedged under the cover makes it safe." },
  { name: "Locking pit", spot: "DC 15 Wisdom (Perception) notices the untrodden floor; DC 15 Intelligence (Investigation) confirms the cover.", effect: "A fall of 10 or 20 feet, and the cover snaps shut: DC 20 Strength to pry it open, or DC 15 Dexterity with thieves' tools from inside." },
  { name: "Spiked pit", spot: "DC 15 Wisdom (Perception) notices the untrodden floor; DC 15 Intelligence (Investigation) confirms the cover.", effect: "A fall of 10 or 20 feet onto spikes: 11 (2d10) piercing damage more; poisoned spikes add a DC 13 Constitution save, 22 (4d10) poison damage, half as much on a success." },
  { name: "Poison darts", spot: "Dart holes: spot them with DC 15, or find the pressure plate with DC 15 Intelligence (Investigation).", effect: "Four darts, each +8 to hit a random creature within 10 feet: 2 (1d4) piercing damage and a DC 15 Constitution save, 11 (2d10) poison damage, half as much on a success." },
  { name: "Poison needle", spot: "In a lock: DC 20 Intelligence (Investigation) notices it; thieves' tools and DC 15 Dexterity disarm it.", effect: "1 piercing and 11 (2d10) poison damage, and a DC 15 Constitution save or poisoned for 1 hour." },
  { name: "Rolling sphere", spot: "Pressure plate and trapdoor: DC 15 Wisdom (Perception) spots them; DC 15 Intelligence (Investigation) reads the stonework.", effect: "A 10-foot stone sphere rolls 60 feet a turn (initiative +8): DC 15 Dexterity save or 55 (10d10) bludgeoning damage and prone; a DC 20 Strength check slows it by 15 feet." },
];

/** SRD 5.1, Traps in Play: Trap Save DCs and Attack Bonuses, and Damage Severity by Level. */
const TRAP_SAVE: Record<string, string> = { setback: "10–11", dangerous: "12–15", deadly: "16–20" };
const TRAP_ATTACK: Record<string, string> = { setback: "+3 to +5", dangerous: "+6 to +8", deadly: "+9 to +12" };
const TRAP_DAMAGE: Record<string, string> = {
  "1-setback": "1d10", "1-dangerous": "2d10", "1-deadly": "4d10",
  "2-setback": "2d10", "2-dangerous": "4d10", "2-deadly": "10d10",
  "3-setback": "4d10", "3-dangerous": "10d10", "3-deadly": "18d10",
  "4-setback": "10d10", "4-dangerous": "18d10", "4-deadly": "24d10",
};

/** Magic item rarity by level band (original stocking table). */
const RARITY: Record<number, Array<[string, number]>> = {
  1: [["Common", 3], ["Uncommon", 7]],
  2: [["Uncommon", 6], ["Rare", 4]],
  3: [["Rare", 5], ["Very Rare", 5]],
  4: [["Very Rare", 5], ["Legendary", 5]],
};

function rarityTables(): RollTable[] {
  return Object.entries(RARITY).map(([tier, rows]) => {
    let at = 1;
    return {
      id: id(`dungeon.treasure.rarity-${tier}`),
      name: `Treasure: magic item rarity (levels ${["1–4", "5–10", "11–16", "17–20"][Number(tier) - 1]})`,
      family: "dungeon",
      original: true,
      dice: "1d10",
      notes: "Which rarity a magic item in a dungeon's treasure has, by the party's level band. Original stocking table.",
      rows: rows.map(([rarity, n]) => {
        const row = { range: [at, at + n - 1] as [number, number], label: rarity, result: { rarity } };
        at += n;
        return row;
      }),
    };
  });
}

/** The pack's dungeon tables: room purposes per site type, dressing, sample traps, treasure rarity. */
export function dungeonTables(): RollTable[] {
  const out: RollTable[] = [];
  for (const [site, t] of Object.entries(SITES) as Array<[SiteId, (typeof SITES)[SiteId]]>) {
    out.push(roomTable(`dungeon.${site}.rooms`, `${t.label}: rooms`, t.rooms));
    out.push(roomTable(`dungeon.${site}.lair`, `${t.label}: the lair`, t.lairs));
    out.push(roomTable(`dungeon.${site}.entrance`, `${t.label}: the way in`, t.entrances));
    if (t.halls) out.push(roomTable(`dungeon.${site}.hall`, `${t.label}: the great hall`, t.halls));
  }
  out.push(textTable("dungeon.dressing", "Dungeon room dressing", ROOM_DRESSING));
  out.push(textTable("dungeon.sense", "Dungeon smells and sounds", SENSES));
  out.push(textTable("dungeon.passage", "Dungeon passage dressing", PASSAGE_DRESSING));
  out.push({
    id: id("dungeon.traps"),
    name: "Dungeon traps (SRD sample traps)",
    family: "dungeon",
    cite: TRAPS_CITE,
    dice: `1d${SAMPLE_TRAPS.length}`,
    notes: "The SRD 5.1's sample traps with their own DCs and damage. Scale them for the party with the Trap Save DCs and Damage Severity by Level tables (the dungeon key does).",
    rows: SAMPLE_TRAPS.map((t, i) => ({ range: [i + 1, i + 1] as [number, number], label: t.name, result: { ...t } })),
  });
  out.push(...rarityTables());
  return out;
}

const tier: Rule = ifs({ "<=": [v("inputs.partyLevel", 1), 4] }, 1, { "<=": [v("inputs.partyLevel", 1), 10] }, 2, { "<=": [v("inputs.partyLevel", 1), 16] }, 3, 4);
const terrain: Rule = ifs(v("theme.terrain", ""), v("theme.terrain"), v("site.terrain", "underground"));

const legend: MapLegendEntry[] = [
  { target: { flag: "dark" }, label: "Darkness", icon: "dark", rule: "Heavily obscured: a creature effectively suffers from the blinded condition when trying to see something in it. Darkvision sees darkness as dim light.", cite: "SRD 5.1 — Adventuring: The Environment, Vision and Light" },
  { target: { flag: "difficult" }, label: "Difficult terrain", icon: "collapse", rule: "Every foot of movement costs 1 extra foot.", cite: "SRD 5.1 — Combat: Movement and Position, Difficult Terrain" },
  { target: { flag: "water" }, label: "Water", icon: "water", rule: "Swimming: each foot costs 1 extra foot (2 in difficult terrain), unless the creature has a swimming speed.", cite: "SRD 5.1 — Adventuring: Movement, Special Types of Movement" },
  { target: { flag: "trap", value: "found" }, label: "Trap found", icon: "hazard", rule: "The party has found a trap here and knows where it is." },
  { target: { flag: "trap", value: "sprung" }, label: "Trap sprung", icon: "hazard", color: "#c43f27", rule: "A trap went off here." },
];

const THEMES: PackMapGenerator["config"]["themes"] = [
  { id: "undead", label: "The dead", keywords: ["undead", "skeleton", "skeletons", "zombie", "ghoul", "ghost", "wight", "wraith", "vampire", "lich", "necromancer", "haunted"], vars: { creatureType: "undead", terrain: "underground" } },
  { id: "goblinoid", label: "Goblins and their kin", keywords: ["goblin", "goblins", "hobgoblin", "hobgoblins", "bugbear", "bugbears"], vars: { creatureSubtype: "goblinoid", terrain: "forest" } },
  { id: "cult", label: "A cult", keywords: ["cult", "cultist", "cultists", "demon", "devil", "fiend"], vars: { creatureType: "humanoid", altType: "fiend", terrain: "urban" } },
  { id: "aberrant", label: "Things from below", keywords: ["aberration", "aberrant", "tentacle", "tentacles", "deep ones"], vars: { creatureType: "aberration", terrain: "underground" } },
  { id: "raiders", label: "Raiders and bandits", keywords: ["bandit", "bandits", "raider", "raiders", "brigand", "brigands", "orc", "orcs", "gnoll", "gnolls"], vars: { creatureType: "humanoid", terrain: "grassland" } },
  { id: "beasts", label: "Beasts", keywords: ["wolf", "wolves", "bear", "spider", "spiders", "beast", "beasts", "rats"], vars: { creatureType: "beast" } },
  { id: "marsh", label: "Marsh things", keywords: ["marsh", "swamp", "bog", "fen", "mire"], vars: { terrain: "swamp" } },
];

/** The generator's declaration (the pack's `mapGenerators`). */
export function dungeonGenerator(): PackMapGenerator {
  const sites = Object.entries(SITES) as Array<[SiteId, (typeof SITES)[SiteId]]>;
  return {
    engine: "dungeon",
    id: DUNGEON_GENERATOR,
    name: "Dungeon",
    description:
      "An original dungeon on a 5-foot grid: a crypt, cave, keep, sewer, ruined temple or mine of one to three levels, with doors, locks, secret doors, portcullises and collapses, room purposes and dressing, encounters from the pack's encounter tables (SRD monsters), the SRD's sample traps scaled for the party, and treasure from the SRD's magic items. Accept it to add the dungeon, its rooms, encounters and monsters to the campaign.",
    original: true,
    config: {
      grid: { size: 5, unit: "ft", metres: 1.524 },
      siteTypes: sites.map(([site, t]) => ({
        id: site,
        label: t.label,
        archetype: t.archetype,
        description: t.description,
        keywords: t.keywords,
        rooms: id(`dungeon.${site}.rooms`),
        lair: id(`dungeon.${site}.lair`),
        entrance: id(`dungeon.${site}.entrance`),
        ...(t.halls ? { hall: id(`dungeon.${site}.hall`) } : {}),
        passageName: t.passageName,
        outsideName: t.outsideName,
        levelName: t.levelName,
        flags: t.flags,
        ...(t.passageFlags ? { passageFlags: t.passageFlags } : {}),
        vars: { terrain: TERRAIN[site] },
      })),
      sizes: [
        { id: "small", label: "Small", rooms: [5, 8] },
        { id: "medium", label: "Medium", rooms: [9, 14] },
        { id: "large", label: "Large", rooms: [15, 22] },
      ],
      maxLevels: 3,
      partyLevel: { min: 1, max: 20, default: 3 },
      partySize: { min: 1, max: 8, default: 4 },
      threats: [
        { id: "quiet", label: "Quiet (few occupied rooms)", occupied: 0.25, vars: { scale: 0.75, trapChance: 0.1, severity: "setback", danger: "moderate" } },
        { id: "standard", label: "Standard", occupied: 0.4, vars: { scale: 1, trapChance: 0.15, severity: "setback", danger: "high" } },
        { id: "dangerous", label: "Dangerous", occupied: 0.55, vars: { scale: 1.4, trapChance: 0.2, severity: "dangerous", danger: "high" } },
        { id: "deadly", label: "Deadly", occupied: 0.7, vars: { scale: 2, trapChance: 0.28, severity: "deadly", danger: "deadly" } },
      ],
      defaultThreat: "standard",
      themes: THEMES,
      dressing: { rooms: [id("dungeon.dressing"), id("dungeon.sense")], passages: [id("dungeon.passage")], passageChance: 0.3 },
      doors: {
        lock: { lists: [LIST.gear], id: "lock" },
        notes: {
          // the SRD's Lock: DC 15 to pick with thieves' tools (its description, shortened)
          locked: cat("Locked (", v("lock.name", "Lock"), "): a creature proficient with thieves' tools picks it with a DC 15 Dexterity check; the key opens it."),
          secret: "Secret door: found by searching, with Wisdom (Perception) or Intelligence (Investigation); a medium task is DC 15, a hard one DC 20.",
          bars: "A portcullis or grate: raising or bending it is a Strength (Athletics) check.",
          rubble: "Collapsed: impassable until it is dug out.",
        },
      },
      encounters: {
        table: cat(id("encounter."), terrain, "-", tier),
        prefer: { or: [{ "!": v("theme") }, { "==": [v("preset.fields.creatureType"), v("theme.creatureType", "-")] }, { "==": [v("preset.fields.creatureType"), v("theme.altType", "-")] }, { "==": [v("preset.fields.creatureSubtype"), v("theme.creatureSubtype", "-")] }] },
        groups: [
          {
            // the table's count, scaled by the threat dial, the lair and the party's size (original)
            n: max(1, { round: mul(mul(v("result.count.n", 1), mul(v("threat.scale", 1), ifs(v("room.lair"), 1.5, 1))), { "/": [v("inputs.partySize", 4), 4] }) }),
            id: v("result.preset"),
          },
        ],
        creatureType: MONSTER,
        xp: v("preset.fields.xp", 0),
        activity: id("encounter.activity"),
        detail: cat("CR ", v("result.cr", "?"), " each; ", v("encounter.xp", 0), " XP in all"),
        passages: 0.08,
        original: true,
      },
      traps: {
        chance: mul(v("threat.trapChance", 0.15), ifs(v("room.passage"), 0.6, 1)),
        pick: { table: id("dungeon.traps") },
        label: v("result.name"),
        detail: cat(
          v("result.spot"),
          " ",
          v("result.effect"),
          " For a ",
          v("threat.severity"),
          " trap at this level: save DC ",
          lookup(TRAP_SAVE, v("threat.severity"), "10–11"),
          ", attack ",
          lookup(TRAP_ATTACK, v("threat.severity"), "+3 to +5"),
          ", damage ",
          lookup(TRAP_DAMAGE, cat(tier, "-", v("threat.severity")), "1d10"),
          ".",
        ),
        cite: TRAPS_IN_PLAY,
      },
      treasure: {
        chance: ifs(v("room.lair"), 1, v("room.entrance"), 0.05, 0.3),
        coins: ifs(v("room.lair"), "4d6", "2d6"),
        coinsLabel: cat(mul(v("coins", 0), lookup({ 1: 5, 2: 25, 3: 250, 4: 2500 }, tier, 5)), " gp"),
        itemCount: ifs(v("room.lair"), 2, { ">=": [v("room.depth", 0), 3] }, 1, 0),
        items: { table: cat(id("dungeon.treasure.rarity-"), tier), lists: [LIST.magicItems], where: { "==": [v("item.rarity"), v("result.rarity")] } },
        itemLabel: cat(v("item.name"), " (", v("item.rarity"), ")"),
        original: true,
      },
      legend,
      accept: {
        site: { type: LOCATION, subtype: "dungeon", fields: { environment: terrain, danger: v("threat.danger", "high"), description: v("site.description"), secrets: ifs(v("faction"), cat("Held by ", v("faction"), "."), "") } },
        room: { type: LOCATION, subtype: "room", fields: { environment: terrain, description: v("room.readAloud"), features: v("room.details"), secrets: v("room.gmNote") } },
        encounter: { type: ENCOUNTER, fields: { environment: terrain, partyLevel: v("inputs.partyLevel"), creatures: v("encounter.label"), xpTotal: v("encounter.xp"), activity: v("encounter.activity"), status: "planned", notes: v("encounter.detail") } },
      },
      keyRooms: { locationSubtypes: ["dungeon"] },
    },
  };
}
