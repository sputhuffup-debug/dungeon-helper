import { describe, expect, it } from "vitest";
import {
  presets,
  dataReferenceLists,
  npcPresets,
  creaturePresets,
  itemPresets,
  vehiclePresets,
  shipPresets,
  factionPresets,
  locationPresets,
  presetSubtype,
  SHIP_MODULE_IDS,
  SHIP_UPGRADE_IDS,
  SHIP_ARMAMENT_IDS,
  WITHIN_TAG,
} from "../src/data";
import { shipClasses, shipModules, shipUpgrades, shipArmaments } from "../src/data";
import { talentItems } from "../src/reference";

const ENTITY_TYPE_IDS = [
  "alien.character",
  "alien.creature",
  "alien.location",
  "alien.faction",
  "alien.item",
  "alien.vehicle",
  "alien.spaceship",
  "alien.clue",
  "alien.job",
  "alien.encounter",
];

const SKILL_IDS = [
  "heavyMachinery",
  "closeCombat",
  "stamina",
  "rangedCombat",
  "mobility",
  "piloting",
  "observation",
  "survival",
  "comtech",
  "manipulation",
  "command",
  "medicalAid",
];

const ITEM_SUBTYPES = ["weapon", "armor", "tool", "medical", "pharmaceutical", "food", "other"];
const LOCATION_SUBTYPES = ["region", "sector", "star-system", "planet", "colony", "site"];
const RANGES = ["adjacent", "short", "medium", "long", "extreme"];

function fields<T = Record<string, unknown>>(p: { fields: Record<string, unknown> }): T {
  return p.fields as T;
}

describe("alien data presets", () => {
  it("have unique ids", () => {
    const ids = presets.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("use one of the ten entity type ids", () => {
    for (const p of presets) expect(ENTITY_TYPE_IDS, p.id).toContain(p.entityType);
  });

  it("are all flagged unverified with a page reference", () => {
    for (const p of presets) {
      // Checked presets drop the flag; any that keep it (book gaps or contradictions) carry `true`.
      if (p.unverified !== undefined) expect(p.unverified, p.id).toBe(true);
      expect(p.page, p.id).toBeDefined();
    }
  });

  it("meet the minimum counts from the data manifest", () => {
    expect(npcPresets.length).toBeGreaterThanOrEqual(25);
    expect(creaturePresets.length).toBeGreaterThanOrEqual(20);
    expect(itemPresets.length).toBeGreaterThanOrEqual(80);
    expect(vehiclePresets.length).toBeGreaterThanOrEqual(6);
    expect(shipPresets.length).toBeGreaterThanOrEqual(7);
    expect(factionPresets.length).toBeGreaterThanOrEqual(18);
    expect(locationPresets.length).toBeGreaterThanOrEqual(35);
  });

  it("carry the subtype both as a top-level property and a subtype: tag where a subtype exists", () => {
    for (const p of presets) {
      const direct = (p as { subtype?: string }).subtype;
      const tag = p.tags?.find((t) => t.startsWith("subtype:"))?.slice("subtype:".length);
      expect(direct, p.id).toBe(tag);
      expect(presetSubtype(p), p.id).toBe(direct);
    }
  });
});

describe("NPC presets", () => {
  it("are non-player alien.character records with attributes and known skill ids", () => {
    for (const p of npcPresets) {
      expect(p.entityType).toBe("alien.character");
      const f = fields<{ isPC: boolean; attributes: Record<string, number>; skills: Record<string, number>; talents: unknown[] }>(p);
      expect(f.isPC, p.id).toBe(false);
      for (const attr of ["strength", "agility", "wits", "empathy"]) {
        expect(typeof f.attributes[attr], `${p.id}.${attr}`).toBe("number");
      }
      for (const skillId of Object.keys(f.skills)) expect(SKILL_IDS, `${p.id} skill ${skillId}`).toContain(skillId);
      expect(f.talents.length, p.id).toBeLessThanOrEqual(1);
    }
  });

  it("are the 25 typical NPCs of p. 258-259 with book talents and gear linked to item presets", () => {
    expect(npcPresets).toHaveLength(25);
    const talentIds = new Set(talentItems.map((t) => t.id));
    const itemIds = new Set(itemPresets.map((i) => i.id));
    for (const p of npcPresets) {
      expect(p.page, p.id).toEqual([258, 259]);
      const f = fields<{ talents: Array<{ id: string }>; gear: Array<{ name: string; weight: unknown; itemId?: string }> }>(p);
      for (const t of f.talents) expect(talentIds.has(t.id), `${p.id} talent ${t.id}`).toBe(true);
      for (const g of f.gear) {
        expect(typeof g.weight, `${p.id} gear ${g.name}`).toBe("number");
        if (g.itemId) expect(itemIds.has(g.itemId), `${p.id} gear ${g.itemId}`).toBe(true);
      }
    }
    const byId = Object.fromEntries(npcPresets.map((p) => [p.id, fields<{ attributes: Record<string, number>; skills: Record<string, number> }>(p)]));
    expect(byId["alien.npc.android-covert"]!.attributes).toEqual({ strength: 7, agility: 6, wits: 3, empathy: 1 });
    expect(byId["alien.npc.medic"]!.skills).toEqual({ stamina: 3, mobility: 2, observation: 3, manipulation: 3, medicalAid: 4 });
  });
});

describe("creature presets", () => {
  it("have signature-attack rows covering D6 1..6 without gaps, none (eggs, Worker), or are lore-only", () => {
    for (const p of creaturePresets) {
      expect(p.entityType).toBe("alien.creature");
      const f = fields<{ loreOnly?: boolean; attacks?: Array<{ roll: number; rollTo?: number; name: string; dice: number; damage: unknown; effect: string }> }>(p);
      if (f.loreOnly) {
        expect(f.attacks, p.id).toBeUndefined();
        continue;
      }
      if (f.attacks!.length === 0) continue;
      let next = 1;
      for (const a of f.attacks!) {
        expect(a.roll, `${p.id} ${a.name}`).toBe(next);
        next = (a.rollTo ?? a.roll) + 1;
        expect(a.name, p.id).toBeTruthy();
        expect(typeof a.dice, p.id).toBe("number");
        expect(a.effect, p.id).toBeTruthy();
      }
      expect(next, p.id).toBeGreaterThan(6);
    }
  });

  it("carry Speed, Health and armor unless lore-only; skills are numbers where given", () => {
    for (const p of creaturePresets) {
      const f = fields<Record<string, unknown>>(p);
      expect(typeof f.species, p.id).toBe("string");
      expect(typeof f.stage, p.id).toBe("string");
      if (f.loreOnly) continue;
      for (const key of ["speed", "health"]) expect(typeof f[key], `${p.id}.${key}`).toBe("number");
      expect(typeof f.armor === "number" || typeof f.armorNotes === "string", `${p.id}.armor`).toBe(true);
      for (const key of ["mobility", "observation"]) if (f[key] !== undefined) expect(typeof f[key], `${p.id}.${key}`).toBe("number");
    }
  });

  it("match the book's roster and spot-checked stat lines (p. 212-231)", () => {
    const byId = Object.fromEntries(creaturePresets.map((p) => [p.id.replace("alien.creature.", ""), fields<Record<string, unknown>>(p)]));
    expect(Object.keys(byId)).toHaveLength(32);
    const line = (id: string) => {
      const f = byId[id]!;
      return [f.speed, f.health, f.mobility, f.observation, f.armor, f.acidSplash];
    };
    expect(line("xx121-drone")).toEqual([2, 7, 8, 8, 2, 8]);
    expect(line("xx121-sentry")).toEqual([2, 8, 12, 10, 2, 10]);
    expect(line("xx121-queen")).toEqual([2, 18, 6, 12, 4, 10]);
    expect(line("xx121-charger")).toEqual([1, 20, 4, 5, 5, 10]);
    expect(line("neomorph-adult")).toEqual([2, 6, 9, 8, 1, undefined]);
    expect(line("lion-worm")).toEqual([2, 8, 10, 8, 1, undefined]);
    expect(byId["xx121-drone"]!.stage).toBe("IV");
    expect(byId["xx121-soldier"]!.stage).toBe("V");
    expect(byId["xx121-queen"]!.stage).toBe("VI");
    const stage7 = creaturePresets.filter((p) => fields<{ stage: string }>(p).stage.startsWith("VII"));
    for (const p of stage7) expect(p.unverified, p.id).toBe(true);
  });
});

describe("item presets", () => {
  it("use a known subtype", () => {
    for (const p of itemPresets) {
      expect(p.entityType).toBe("alien.item");
      expect(ITEM_SUBTYPES, p.id).toContain(presetSubtype(p));
    }
  });

  it("weapons have bonus, damage and range", () => {
    const weapons = itemPresets.filter((p) => presetSubtype(p) === "weapon");
    expect(weapons.length).toBeGreaterThanOrEqual(25);
    for (const p of weapons) {
      const f = fields<{ bonus: unknown; damage: unknown; range: string; weight: unknown; cost: unknown }>(p);
      expect(typeof f.bonus, p.id).toBe("number");
      expect(typeof f.damage, p.id).toBe("number");
      expect(RANGES, p.id).toContain(f.range);
      expect(typeof f.weight, p.id).toBe("number");
      expect(typeof f.cost, p.id).toBe("number");
    }
  });

  it("armor has an armor rating", () => {
    const armor = itemPresets.filter((p) => presetSubtype(p) === "armor");
    expect(armor.length).toBe(7); // Suits & Armor, p. 90-91, including the P-5000 loader
    for (const p of armor) expect(typeof fields<{ armorRating: unknown }>(p).armorRating, p.id).toBe("number");
  });

  it("every item has weight and cost", () => {
    for (const p of itemPresets) {
      const f = fields<{ weight: unknown; cost: unknown }>(p);
      expect(typeof f.weight, p.id).toBe("number");
      expect(typeof f.cost, p.id).toBe("number");
    }
  });
});

describe("vehicle and spaceship presets", () => {
  it("vehicles carry the stat line", () => {
    for (const p of vehiclePresets) {
      expect(p.entityType).toBe("alien.vehicle");
      const f = fields<Record<string, unknown>>(p);
      for (const key of ["maneuverability", "speed", "hull", "armor", "cost"]) expect(typeof f[key], `${p.id}.${key}`).toBe("number");
      expect(Array.isArray(f.weapons), p.id).toBe(true);
    }
  });

  it("ships reference known module, upgrade and armament ids", () => {
    for (const p of shipPresets) {
      expect(p.entityType).toBe("alien.spaceship");
      const f = fields<{ shipClass: string; modules: string[]; upgrades: string[]; armaments: string[]; hull: number; ftl: number }>(p);
      expect(["C", "G", "J", "M", "R", "U", "X"], p.id).toContain(f.shipClass);
      for (const m of f.modules) expect(SHIP_MODULE_IDS, `${p.id} module ${m}`).toContain(m);
      for (const u of f.upgrades) expect(SHIP_UPGRADE_IDS, `${p.id} upgrade ${u}`).toContain(u);
      for (const a of f.armaments) expect(SHIP_ARMAMENT_IDS, `${p.id} armament ${a}`).toContain(a);
      expect(typeof f.hull, p.id).toBe("number");
      expect(typeof f.ftl, p.id).toBe("number");
    }
  });

  it("match the book's vehicle and ship lists (p. 100-105, 128-138)", () => {
    expect(vehiclePresets).toHaveLength(6);
    expect(shipPresets).toHaveLength(7);
    expect(itemPresets).toHaveLength(89); // 35 weapons (7 vehicle-mounted), 7 armor, 24 tools, 7 other, 4 medical, 5 pharmaceuticals, 7 food
  });

  it("ship prices add up from class, AI, modules, upgrades and armaments (p. 121-127)", () => {
    const price = (list: { items: Array<{ id: string; cost?: unknown }> }, id: string): number => Number(list.items.find((i) => i.id === id)!.cost);
    const mainframes = new Map(itemPresets.map((i) => [i.name, Number(i.fields["cost"])]));
    for (const p of shipPresets) {
      const f = fields<{ shipClass: string; ai: string; modules: string[]; upgrades: string[]; armaments: string[]; munitions: Record<string, number>; cost: number }>(p);
      let total = price(shipClasses, f.shipClass);
      if (f.ai !== "None") total += mainframes.get(f.ai)!;
      for (const m of f.modules) total += price(shipModules, m);
      for (const u of f.upgrades) total += price(shipUpgrades, u);
      for (const a of f.armaments) {
        const row = shipArmaments.items.find((i) => i.id === a)!;
        const count = f.munitions[a] ?? 0;
        total += row.costPerMunition ? count * Number(row.cost) : Number(row.cost) + count * Number(row.munitionCost ?? 0);
      }
      expect(total, p.id).toBe(f.cost);
    }
  });

  it("ship stats follow from the class plus upgrades (p. 121, 127)", () => {
    for (const p of shipPresets) {
      const f = fields<{ shipClass: string; upgrades: string[]; hull: number; thrusters: number; signature: number; armor: number; ftl: number }>(p);
      const cls = shipClasses.items.find((c) => c.id === f.shipClass)!;
      const n = (id: string) => f.upgrades.filter((u) => u === id).length;
      expect(f.hull, p.id).toBe(Number(cls.hull) + n("reinforced-frame"));
      expect(f.thrusters, p.id).toBe(Number(cls.thrusters) + n("overpowered-thrusters") - n("external-module-i") - n("external-module-ii") - n("external-module-iii") - n("external-module-iv") - n("external-module-v"));
      expect(f.signature, p.id).toBe(Number(cls.signature) - 2 * n("stealth-technology"));
      expect(f.armor, p.id).toBe(n("armored-bulkheads"));
      if (cls.ftl !== null) expect(f.ftl, p.id).toBe(Number(cls.ftl) - n("boosted-displacement-drives"));
    }
  });
});

describe("faction presets", () => {
  it("have the eight chapter entries (p. 162-177), two other organizations and the ten minor corporations of p. 162", () => {
    const major = factionPresets.filter((p) => p.tags?.includes("major"));
    const other = factionPresets.filter((p) => p.tags?.includes("organization"));
    const minor = factionPresets.filter((p) => fields<{ minor: boolean }>(p).minor === true);
    expect(major.map((p) => p.id.replace("alien.faction.", ""))).toEqual([
      "three-world-empire",
      "united-americas",
      "upp",
      "icsc",
      "icc",
      "weyland-yutani",
      "lasalle-bionational",
      "seegson",
    ]);
    expect(other.map((p) => p.id.replace("alien.faction.", ""))).toEqual(["colonial-administration", "church-of-immaculate-incubation"]);
    expect(minor).toHaveLength(10);
    for (const p of minor) expect(p.page, p.id).toBe(162);
  });

  it("non-minor factions carry every section as a string, and chapter entries a featured NPC", () => {
    for (const p of factionPresets) {
      if (fields<{ minor: boolean }>(p).minor) continue;
      const f = fields<Record<string, unknown>>(p);
      for (const key of ["history", "products", "military", "leaders", "locations", "relations", "currentActivities"]) {
        expect(typeof f[key], `${p.id}.${key}`).toBe("string");
      }
      for (const key of ["history", "leaders", "locations", "relations", "currentActivities"]) {
        expect((f[key] as string).length, `${p.id}.${key}`).toBeGreaterThan(0);
      }
      if (p.tags?.includes("major")) expect(f.notableNpc, p.id).toBeTruthy();
    }
  });
});

describe("location presets", () => {
  it("use a known subtype and valid within: tags", () => {
    const ids = new Set(locationPresets.map((p) => p.id));
    for (const p of locationPresets) {
      expect(p.entityType).toBe("alien.location");
      expect(LOCATION_SUBTYPES, p.id).toContain(presetSubtype(p));
      for (const tag of p.tags ?? []) {
        if (!tag.startsWith(WITHIN_TAG)) continue;
        const parent = tag.slice(WITHIN_TAG.length);
        expect(ids.has(parent), `${p.id} within ${parent}`).toBe(true);
        expect(parent).not.toBe(p.id);
      }
    }
  });

  it("star systems, planets and colonies carry their subtype fields", () => {
    for (const p of locationPresets) {
      const f = fields<Record<string, unknown>>(p);
      switch (presetSubtype(p)) {
        case "star-system":
          // The book gives no spectral classes for charted systems (p. 180-201, 260-277); when present they must be valid.
          if (f.starClass !== undefined) expect(["O", "B", "A", "F", "G", "K", "M"], p.id).toContain(f.starClass);
          if (f.brightness !== undefined) expect(["Ia", "Ib", "II", "III", "IV", "V", "D"], p.id).toContain(f.brightness);
          expect(Array.isArray(f.bodies), p.id).toBe(true);
          break;
        case "planet":
          expect(["terrestrial", "ice", "gas-giant", "asteroid-belt"], p.id).toContain(f.planetType);
          expect(typeof f.inhabited, p.id).toBe("boolean");
          break;
        case "colony":
          // Colony size is derived from a numeric population (p. 240 ranges); colonies without one have none.
          if (typeof f.population === "number") expect(["start-up", "young", "established"], p.id).toContain(f.colonySize);
          else expect(f.colonySize, p.id).toBeUndefined();
          expect(Array.isArray(f.missions), p.id).toBe(true);
          break;
        case "site":
          expect(typeof f.description, p.id).toBe("string");
          break;
      }
    }
  });

  it("include the five regions", () => {
    const regionIds = locationPresets.filter((p) => presetSubtype(p) === "region").map((p) => fields<{ regionId?: string }>(p).regionId).filter(Boolean);
    expect(regionIds).toEqual(expect.arrayContaining(["core", "outer-veil", "outer-rim", "frontier", "far-reach"]));
  });

  it("are checked against the book and carry its stat blocks", () => {
    const byId = (id: string) => locationPresets.find((p) => p.id === `alien.location.${id}`)!;
    for (const p of locationPresets) {
      expect(p.unverified, p.id).toBeUndefined();
      expect(p.page, p.id).toBeDefined();
    }
    const parentOf = (id: string) => byId(id).tags!.find((t) => t.startsWith(WITHIN_TAG))!.slice(WITHIN_TAG.length + "alien.location.".length);
    // Anchorpoint Station (p. 113) sits in GJ2066, drawn on the Tartarus Sector map (p. 262), in the Outer Rim (p. 191, 260).
    expect(parentOf("anchorpoint-station")).toBe("gj2066");
    expect(parentOf("gj2066")).toBe("tartarus-sector");
    expect(parentOf("tartarus-sector")).toBe("outer-rim");
    expect(byId("anchorpoint-station").tags).toContain("home-base");
    expect(locationPresets.some((p) => presetSubtype(p) === "site" && p.tags!.includes(`${WITHIN_TAG}alien.location.anchorpoint-station`))).toBe(true);
    // Sample stat lines copied from the book.
    expect(fields<Record<string, unknown>>(byId("lv-426-acheron")).temperature).toBe("10 °C");
    expect(fields<Record<string, unknown>>(byId("torin-prime")).population).toBe("700,000 civilians, 50,000 security forces");
    expect(fields<Record<string, unknown>>(byId("the-solomons")).population).toBe(3000000);
    expect(fields<Record<string, unknown>>(byId("skyfire-down")).resources).toBe("Minerals, heavy metals, helium 3, convict labor");
    expect(parentOf("rodina")).toBe("beta-virginis");
    // The twelve Tartarus systems of chapter 11 (p. 260-261) plus the three minor ones (p. 266).
    const tartarus = locationPresets.filter((p) => presetSubtype(p) === "star-system" && p.tags!.includes(`${WITHIN_TAG}alien.location.tartarus-sector`)).map((p) => p.id.slice("alien.location.".length));
    expect(tartarus).toEqual(expect.arrayContaining(["ross-619", "khadaji", "gj229a", "nn3325", "gamma-leporis", "gl408", "gl300", "hip53020", "hip51317", "gl257ab", "gj2034", "beta-virginis", "gl285", "gl382", "gj11038"]));
  });
});

describe("reference lists", () => {
  it("ship the five data-owned lists with unique kebab-case item ids", () => {
    const listIds = dataReferenceLists.map((l) => l.id);
    expect(listIds).toEqual(["alien.ship-classes", "alien.ship-modules", "alien.ship-upgrades", "alien.ship-armaments", "alien.minor-corporations"]);
    for (const list of dataReferenceLists) {
      if (list.id.startsWith("alien.ship-")) expect(list.unverified, list.id).toBeUndefined(); // checked against p. 121-127
      else if (list.unverified !== undefined) expect(list.unverified, list.id).toBe(true);
      expect(list.page, list.id).toBeDefined();
      const ids = list.items.map((i) => i.id);
      expect(new Set(ids).size, list.id).toBe(ids.length);
      if (list.id === "alien.ship-classes") continue;
      for (const id of ids) expect(id, list.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("have the expected sizes", () => {
    const byId = Object.fromEntries(dataReferenceLists.map((l) => [l.id, l.items.length]));
    expect(byId["alien.ship-classes"]).toBe(7);
    expect(byId["alien.ship-modules"]).toBe(40); // one row per module size, p. 123
    expect(byId["alien.ship-upgrades"]).toBe(15); // p. 127
    expect(byId["alien.ship-armaments"]).toBe(12); // 9 offensive + 3 defensive, p. 125
    expect(byId["alien.minor-corporations"]).toBe(10);
  });

  it("offensive armaments carry range (and damage, except the nuke); all name a hardpoint size", () => {
    const arms = dataReferenceLists.find((l) => l.id === "alien.ship-armaments")!;
    for (const a of arms.items) {
      expect(["I", "II", "III"], a.id).toContain(a.hardpoint);
      if (a.kind !== "offensive") continue;
      if (a.id !== "tactical-nuke") expect(typeof a.damage, a.id).toBe("number");
      expect(["contact", "short", "medium", "long", "extreme", "surface"], a.id).toContain(a.range);
    }
  });
});
