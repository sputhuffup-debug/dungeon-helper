/**
 * The dungeon map generator (the SDK's built-in `dungeon` engine) and its
 * tables. What is ours and what is the ORC core rules':
 *
 * - room purposes, read-aloud lines and dressing: original, shared with the
 *   fifth edition pack (its scripts/authored/dungeonText.ts);
 * - encounters: GM Core's XP budget for the threat and the party's size, spent
 *   through the pack's encounter-shape tables (creature levels relative to
 *   the party) on Monster Core creatures, with the lair one threat step up
 *   (cited; the step up is our choice);
 * - traps: GM Core hazards by level, with their own Stealth DCs and disable
 *   checks (cited, from the hazard presets);
 * - locks: the lock items' own Thievery DCs (cited from the items); secret
 *   doors: GM Core's DC by level (cited);
 * - treasure: coins by level and items within a level or two of the party's
 *   are an original stocking table; the items are the core books'.
 *
 * With the built-in supplement on, its creatures and hazards count too.
 */
import type { DungeonEncounterGroup, MapLegendEntry, PackMapGenerator, RollTable } from "@campaign-forge/module-sdk";
import { PASSAGE_DRESSING, ROOM_DRESSING, SENSES, SITES, type RoomText, type SiteId } from "../../../module-dnd5e-srd/scripts/authored/dungeonText.ts";
import { cite, CREATURE, ENCOUNTER, HAZARD, id, LOCATION } from "../ids.ts";
import { CREATURE_XP, THREAT_BUDGETS } from "./entityTypes.ts";
import { cat, ifs, lookup, max, min, mul, sub, v, type Rule } from "./logic.ts";
import { DC_BY_LEVEL } from "./templates.ts";
import { BUILDING_ENCOUNTERS, LEVEL_MAX, LEVEL_MIN } from "./tables.ts";

export const DUNGEON_GENERATOR = id("map.dungeon");

/** Location environment for each site type. */
const ENVIRONMENT: Record<SiteId, string> = { crypt: "underground", cave: "underground", keep: "plains", sewer: "urban", temple: "forest", mine: "underground" };
/** Creature traits a site type favours when the brief names no theme (our own judgement). */
const SITE_TRAITS: Record<SiteId, [string, string]> = { crypt: ["undead", "spirit"], cave: ["animal", "beast"], keep: ["humanoid", "construct"], sewer: ["animal", "ooze"], temple: ["undead", "fiend"], mine: ["humanoid", "elemental"] };

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

/** The pack's dungeon tables: room purposes per site type and dressing. */
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
  return out;
}

const level: Rule = v("inputs.partyLevel", 1);
const size: Rule = v("inputs.partySize", 4);
const THREATS = Object.keys(THREAT_BUDGETS);
/** The lair is one threat step up (an extreme threat stays extreme). */
const lairStep = (t: string) => THREATS[Math.min(THREATS.length - 1, THREATS.indexOf(t) + 1)]!;
const OCCUPIED: Record<string, number> = { trivial: 0.25, low: 0.35, moderate: 0.45, severe: 0.55, extreme: 0.65 };
const TRAP_CHANCE: Record<string, number> = { trivial: 0.08, low: 0.12, moderate: 0.16, severe: 0.2, extreme: 0.25 };

/** GM Core's budget for the room's threat (one step up in the lair) and the party's size. */
const budget: Rule = {
  "+": [ifs(v("room.lair"), v("threat.lairBudget"), v("threat.budget")), mul(sub(size, 4), ifs(v("room.lair"), v("threat.lairPer"), v("threat.per")))],
};
/** The encounter-shape table for that budget (party levels 1, 2 and 18–20 have their own). */
const shapeTable: Rule = cat(id("encounter.budget-"), budget, ifs({ "<=": [level, 2] }, cat("-l", level), { ">=": [level, 18] }, cat("-l", level), ""));

/** The theme's creatures first; without a theme, the site type's. */
const fits: Rule = {
  or: [
    { has: [v("preset.fields.traits", []), v("theme.trait1", "-")] },
    { has: [v("preset.fields.traits", []), v("theme.trait2", "-")] },
    { and: [{ "!": v("theme") }, { or: [{ has: [v("preset.fields.traits", []), v("site.trait1", "-")] }, { has: [v("preset.fields.traits", []), v("site.trait2", "-")] }] }] },
  ],
};

function group(k: number): DungeonEncounterGroup {
  return {
    n: v(`result.n${k}`, 0),
    when: v(`result.n${k}`, 0),
    match: { "fields.level": max(LEVEL_MIN, min(LEVEL_MAX, { "+": [level, v(`result.o${k}`, 0)] })) },
    where: { "!": { in: [v("preset.fields.rarity"), ["unique"]] } },
    fits,
  };
}

const legend: MapLegendEntry[] = [
  { target: { flag: "dark" }, label: "Darkness", icon: "dark", rule: "No light: a creature without darkvision cannot see anything here without a light of its own." },
  { target: { flag: "difficult" }, label: "Difficult terrain", icon: "collapse", rule: "Rubble, roots or slick stone: each square costs 5 more feet of movement to enter." },
  { target: { flag: "water" }, label: "Water", icon: "water", rule: "Wading water, or deep enough that crossing it means Swimming (Athletics)." },
  { target: { flag: "trap", value: "found" }, label: "Trap found", icon: "hazard", rule: "The party has found a hazard here and knows where it is." },
  { target: { flag: "trap", value: "sprung" }, label: "Trap sprung", icon: "hazard", color: "#c43f27", rule: "A hazard went off here." },
];

const THEMES: PackMapGenerator["config"]["themes"] = [
  { id: "undead", label: "The dead", keywords: ["undead", "skeleton", "skeletons", "zombie", "zombies", "ghoul", "ghost", "wight", "wraith", "vampire", "lich", "necromancer", "haunted"], vars: { trait1: "undead" } },
  { id: "xulgath", label: "Xulgaths from below", keywords: ["xulgath", "xulgaths"], vars: { trait1: "xulgath" } },
  { id: "goblinoid", label: "Goblins and hobgoblins", keywords: ["goblin", "goblins", "hobgoblin", "hobgoblins"], vars: { trait1: "goblin", trait2: "hobgoblin" } },
  { id: "kobold", label: "Kobolds", keywords: ["kobold", "kobolds"], vars: { trait1: "kobold" } },
  { id: "cult", label: "A cult", keywords: ["cult", "cultist", "cultists", "demon", "devil", "fiend"], vars: { trait1: "fiend", trait2: "human" } },
  { id: "aberrant", label: "Things from below", keywords: ["aberration", "aberrant", "tentacle", "tentacles"], vars: { trait1: "aberration" } },
  { id: "beasts", label: "Beasts", keywords: ["wolf", "wolves", "bear", "spider", "spiders", "beast", "beasts", "rats", "centipede", "centipedes"], vars: { trait1: "animal" } },
];

/** The generator's declaration (the pack's `mapGenerators`). */
export function dungeonGenerator(): PackMapGenerator {
  const sites = Object.entries(SITES) as Array<[SiteId, (typeof SITES)[SiteId]]>;
  const dcs = Object.fromEntries(DC_BY_LEVEL.map((dc, i) => [String(i), dc]));
  return {
    engine: "dungeon",
    id: DUNGEON_GENERATOR,
    name: "Dungeon",
    description:
      "An original dungeon on a 5-foot grid: a crypt, cave, keep, sewer, ruined temple or mine of one to three levels, with doors, locks, secret doors, portcullises and collapses, room purposes and dressing, encounters built from GM Core's XP budgets on Monster Core creatures, GM Core hazards for traps and treasure from the core books' items. Accept it to add the dungeon, its rooms, encounters, creatures and hazards to the campaign.",
    cite: BUILDING_ENCOUNTERS,
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
        vars: { environment: ENVIRONMENT[site], trait1: SITE_TRAITS[site][0], trait2: SITE_TRAITS[site][1] },
      })),
      sizes: [
        { id: "small", label: "Small", rooms: [5, 8] },
        { id: "medium", label: "Medium", rooms: [9, 14] },
        { id: "large", label: "Large", rooms: [15, 22] },
      ],
      maxLevels: 3,
      partyLevel: { min: 1, max: 20, default: 1 },
      partySize: { min: 2, max: 8, default: 4 },
      threats: THREATS.map((t) => ({
        id: t,
        label: t.charAt(0).toUpperCase() + t.slice(1),
        occupied: OCCUPIED[t] ?? 0.45,
        vars: { budget: THREAT_BUDGETS[t]!.budget, per: THREAT_BUDGETS[t]!.perCharacter, lairThreat: lairStep(t), lairBudget: THREAT_BUDGETS[lairStep(t)]!.budget, lairPer: THREAT_BUDGETS[lairStep(t)]!.perCharacter, trapChance: TRAP_CHANCE[t] ?? 0.15, danger: t === "extreme" || t === "severe" ? "deadly" : t === "trivial" ? "moderate" : "high" },
      })),
      defaultThreat: "moderate",
      themes: THEMES,
      dressing: { rooms: [id("dungeon.dressing"), id("dungeon.sense")], passages: [id("dungeon.passage")], passageChance: 0.3 },
      doors: {
        lock: { lists: [id("equipment.items"), id("equipment.gear")], where: { and: [{ startsWith: [v("item.id"), "lock-"] }, { "<=": [v("item.level", 0), { "+": [level, 1] }] }] }, fits: { ">=": [v("item.level", 0), sub(level, 4)] } },
        notes: {
          locked: cat("Locked: ", v("lock.name", "a lock"), ". ", v("lock.summary", "Pick a Lock (Thievery) to open it.")),
          secret: cat("Secret door: a character who Seeks here finds it with a Perception DC ", lookup(dcs, level, 15), " (DC by level)."),
          bars: "A portcullis or grate: Force Open (Athletics) to lift or bend it.",
          rubble: "Collapsed: impassable until it is cleared.",
        },
      },
      encounters: {
        table: shapeTable,
        groups: [group(1), group(2), group(3)],
        creatureType: CREATURE,
        xp: lookup(CREATURE_XP, sub(v("preset.fields.level", 0), level), 0),
        activity: id("encounter.activity"),
        detail: cat(v("encounter.xp", 0), " XP, a ", ifs(v("room.lair"), v("threat.lairThreat"), v("threat.id")), " encounter for ", size, " characters of level ", level, " (", budget, " XP budget)"),
        passages: 0.06,
        cite: BUILDING_ENCOUNTERS,
      },
      traps: {
        chance: mul(v("threat.trapChance", 0.15), ifs(v("room.passage"), 0.6, 1)),
        pick: {
          presets: HAZARD,
          where: {
            and: [
              { ">=": [v("preset.fields.level", 0), sub(level, 3)] },
              { "<=": [v("preset.fields.level", 0), { "+": [level, 1] }] },
              { "!": { has: [v("preset.fields.traits", []), "kaiju"] } },
              { "!": { has: [v("preset.fields.traits", []), "mythic"] } },
            ],
          },
          fits: { has: [v("preset.fields.traits", []), "trap"] },
        },
        label: v("preset.name"),
        detail: cat(
          ifs({ "==": [v("preset.fields.complexity"), "complex"] }, "Complex", "Simple"),
          " hazard ",
          v("preset.fields.level", 0),
          ". Stealth DC ",
          { "+": [v("preset.fields.stealth", 0), 10] },
          ifs(v("preset.fields.stealthNote", ""), cat(" ", v("preset.fields.stealthNote")), ""),
          ". Disable: ",
          v("preset.fields.disable", "see its stat block"),
          ".",
        ),
        cite: cite("GM Core", "Hazards"),
      },
      treasure: {
        chance: ifs(v("room.lair"), 1, v("room.entrance"), 0.05, 0.3),
        coins: cat(mul(ifs(v("room.lair"), 3, 1), max(1, level)), "d6"),
        coinsLabel: cat(mul(v("coins", 0), ifs({ "<=": [level, 4] }, 1, { "<=": [level, 8] }, 5, { "<=": [level, 12] }, 20, { "<=": [level, 16] }, 80, 300)), " gp"),
        itemCount: ifs(v("room.lair"), 2, { ">=": [v("room.depth", 0), 3] }, 1, 0),
        items: {
          lists: [id("equipment.consumables"), id("equipment.items"), id("equipment.treasure")],
          where: {
            and: [
              { "<=": [v("item.level", 0), { "+": [level, 1] }] },
              { ">=": [v("item.level", 0), sub(level, 2)] },
              { "!": { in: ["uncommon", v("item.traits", "")] } },
              { "!": { in: ["rare", v("item.traits", "")] } },
              { "!": { startsWith: [v("item.id"), "lock-"] } },
            ],
          },
        },
        itemLabel: cat(v("item.name"), " (level ", v("item.level", 0), ", ", v("item.price", "?"), ")"),
        original: true,
      },
      legend,
      accept: {
        site: { type: LOCATION, subtype: "dungeon", fields: { environment: v("site.environment"), level, danger: v("threat.danger", "high"), description: v("site.description"), secrets: ifs(v("faction"), cat("Held by ", v("faction"), "."), "") } },
        room: { type: LOCATION, subtype: "room", fields: { environment: v("site.environment"), level, description: v("room.readAloud"), features: v("room.details"), secrets: v("room.gmNote") } },
        encounter: {
          type: ENCOUNTER,
          fields: { environment: v("site.environment"), partyLevel: level, partySize: size, threat: ifs(v("room.lair"), v("threat.lairThreat"), v("threat.id")), creatures: v("encounter.label"), xpTotal: v("encounter.xp"), activity: v("encounter.activity"), status: "planned", notes: v("encounter.detail") },
        },
      },
      keyRooms: { locationSubtypes: ["dungeon"] },
    },
  };
}
