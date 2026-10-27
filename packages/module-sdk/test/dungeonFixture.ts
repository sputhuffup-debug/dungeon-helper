/**
 * A tiny fictional pack with a dungeon map generator, for the engine's tests:
 * every site type, rooms and dressing tables, an encounter table that names
 * presets, a group picked by level, traps from presets, treasure from a list.
 */
import type { ModulePack } from "../src";

const rows = (names: string[], extra: (n: string, i: number) => Record<string, unknown> = () => ({})) =>
  names.map((name, i) => ({ range: [i + 1, i + 1] as [number, number], label: name, result: { name, readAloud: `You enter the ${name.toLowerCase()}.`, ...extra(name, i) } }));

export const FIXTURE_ARCHETYPES = ["halls", "caverns", "keep", "channels", "nave", "tunnels"] as const;

export function dungeonFixturePack(): ModulePack {
  const P = "fx";
  return {
    format: "campaign-forge-pack",
    formatVersion: 1,
    manifest: {
      id: P,
      name: "Fixture",
      version: "0.1.0",
      ruleset: "Fixture",
      licenseNotice: "Original test data.",
      requiredCore: "0.1.0",
      modes: [{ id: "one-shot", name: "One-shot" }],
      defaultMode: "one-shot",
      dataStatus: "verified",
      license: { name: "Original", attribution: "Original test data." },
    },
    dice: { engine: "d20" },
    entityTypes: [
      { id: `${P}.monster`, kind: "creature", name: "Monster", plural: "Monsters", schema: { type: "object", properties: { level: { type: "integer" }, kind: { type: "string" } } }, sheet: { sections: [] } },
      { id: `${P}.hazard`, kind: "creature", name: "Hazard", plural: "Hazards", schema: { type: "object", properties: { level: { type: "integer" }, dc: { type: "integer" } } }, sheet: { sections: [] } },
      {
        id: `${P}.location`,
        kind: "location",
        name: "Location",
        plural: "Locations",
        schema: { type: "object", properties: { description: { type: "string" }, secrets: { type: "string" } } },
        sheet: { sections: [] },
        subtypes: [
          { id: "dungeon", name: "Dungeon" },
          { id: "room", name: "Room" },
        ],
      },
      { id: `${P}.encounter`, kind: "encounter", name: "Encounter", plural: "Encounters", schema: { type: "object", properties: { creatures: { type: "string" }, xp: { type: "integer" } } }, sheet: { sections: [] } },
    ],
    presets: [
      { id: `${P}.preset.rat`, entityType: `${P}.monster`, name: "Rat", fields: { level: 1, kind: "beast" } },
      { id: `${P}.preset.bat`, entityType: `${P}.monster`, name: "Bat", fields: { level: 1, kind: "beast" } },
      { id: `${P}.preset.skeleton`, entityType: `${P}.monster`, name: "Skeleton", fields: { level: 2, kind: "undead" } },
      { id: `${P}.preset.ghoul`, entityType: `${P}.monster`, name: "Ghoul", fields: { level: 3, kind: "undead" } },
      { id: `${P}.preset.ogre`, entityType: `${P}.monster`, name: "Ogre", fields: { level: 4, kind: "giant" } },
      { id: `${P}.preset.pit`, entityType: `${P}.hazard`, name: "Hidden pit", fields: { level: 1, dc: 12 } },
      { id: `${P}.preset.blades`, entityType: `${P}.hazard`, name: "Scything blades", fields: { level: 3, dc: 15 } },
    ],
    referenceLists: [
      {
        id: `${P}.loot`,
        name: "Loot",
        items: [
          { id: "ring", name: "Copper ring", rarity: "common" },
          { id: "potion", name: "Red potion", rarity: "common" },
          { id: "sword", name: "Old sword", rarity: "rare" },
        ],
      },
    ],
    tables: [
      { id: `${P}.rooms`, name: "Rooms", dice: "1d8", original: true, rows: rows(["Guard room", "Store room", "Shrine", "Well room", "Barracks", "Larder", "Library", "Cell"], (n) => (n === "Well room" ? { flags: { water: true } } : {})) },
      { id: `${P}.lair`, name: "Lair", dice: "1d2", original: true, rows: rows(["Throne room", "Treasury"]) },
      { id: `${P}.entrance`, name: "Entrance", dice: "1d2", original: true, rows: rows(["Gate hall", "Vestibule"]) },
      { id: `${P}.dressing`, name: "Dressing", dice: "1d4", original: true, rows: ["Dust", "Bones", "Cobwebs", "A cold draught"].map((t, i) => ({ range: [i + 1, i + 1] as [number, number], label: t, result: { text: t } })) },
      {
        id: `${P}.enc`,
        name: "Encounters",
        dice: "1d3",
        original: true,
        rows: [
          { range: [1, 1], label: "Rats", result: { preset: `${P}.preset.rat`, n: 3 } },
          { range: [2, 2], label: "Skeletons", result: { preset: `${P}.preset.skeleton`, n: 2 } },
          { range: [3, 3], label: "Level-matched", result: { level: 3, n: 1 } },
        ],
      },
      { id: `${P}.doing`, name: "Doing", dice: "1d2", original: true, rows: ["Sleeping", "Arguing"].map((t, i) => ({ range: [i + 1, i + 1] as [number, number], label: t, result: { text: t } })) },
    ],
    mapGenerators: [
      {
        engine: "dungeon",
        id: `${P}.map.dungeon`,
        name: "Dungeon",
        original: true,
        config: {
          grid: { size: 5, unit: "ft", metres: 1.524 },
          siteTypes: FIXTURE_ARCHETYPES.map((a) => ({ id: a, label: a, archetype: a, rooms: `${P}.rooms`, lair: `${P}.lair`, entrance: `${P}.entrance`, keywords: [a], flags: { dark: 0.5 }, vars: { terrain: a } })),
          sizes: [
            { id: "small", label: "Small", rooms: [5, 8] },
            { id: "medium", label: "Medium", rooms: [9, 14] },
            { id: "large", label: "Large", rooms: [15, 22] },
          ],
          threats: [
            { id: "low", label: "Low", occupied: 0.2 },
            { id: "high", label: "High", occupied: 0.6, vars: { boost: 1 } },
          ],
          themes: [{ id: "undead", label: "Undead", keywords: ["crypt", "skeleton"], vars: { kind: "undead" } }],
          dressing: { rooms: [`${P}.dressing`] },
          doors: { notes: { locked: { cat: ["Locked; the key is with the ", { var: "room.name" }] }, secret: "Secret: search the wall" } },
          encounters: {
            table: `${P}.enc`,
            prefer: { if: [{ var: "theme" }, { "==": [{ var: "preset.fields.kind" }, { var: "theme.kind" }] }, true] },
            groups: [
              { n: { var: "result.n" }, id: { var: "result.preset" }, when: { var: "result.preset" } },
              { n: { var: "result.n" }, match: { "fields.level": { "+": [{ var: "result.level" }, { var: ["threat.boost", 0] }] } }, when: { var: "result.level" } },
            ],
            creatureType: `${P}.monster`,
            xp: { "*": [{ var: "preset.fields.level" }, 10] },
            activity: `${P}.doing`,
            detail: { cat: [{ var: "encounter.xp" }, " XP"] },
          },
          traps: {
            chance: { if: [{ var: "room.passage" }, 0.2, 0.3] },
            pick: { presets: `${P}.hazard`, where: { "<=": [{ var: "preset.fields.level" }, { "+": [{ var: "inputs.partyLevel" }, 1] }] } },
            label: { var: "preset.name" },
            detail: { cat: ["DC ", { var: "preset.fields.dc" }] },
          },
          treasure: {
            chance: { if: [{ var: "room.lair" }, 1, 0.3] },
            coins: "2d6",
            coinsLabel: { cat: [{ var: "coins" }, " gold"] },
            itemCount: { if: [{ var: "room.lair" }, 2, 1] },
            items: { lists: [`${P}.loot`], where: { "==": [{ var: "item.rarity" }, "common"] } },
          },
          legend: [{ target: { flag: "dark" }, label: "Darkness", icon: "dark" }],
          accept: {
            site: { type: `${P}.location`, subtype: "dungeon", fields: { description: { cat: ["A ", { var: "site.label" }, " of ", { var: "map.rooms" }, " rooms"] } } },
            room: { type: `${P}.location`, subtype: "room", fields: { description: { var: "room.readAloud" }, secrets: { var: "room.gmNote" } } },
            encounter: { type: `${P}.encounter`, fields: { creatures: { var: "encounter.label" }, xp: { var: "encounter.xp" } } },
          },
        },
      },
    ],
  } as unknown as ModulePack;
}
