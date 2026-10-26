import { describe, expect, it } from "vitest";
import {
  checkModule,
  computeFields,
  defaultFieldsFor,
  groupWeaponPresets,
  planWeaponAttack,
  validateEntityFields,
  weaponHitDamage,
  weaponListConfig,
  weaponPresets,
  weaponsFieldOf,
} from "@campaign-forge/module-sdk";
import { alienModule } from "../src";
import { WEAPON_ATTACK, WEAPONS_CONFIG, characterType, weaponRowFromPreset } from "../src/entities";
import { weaponPresets as itemWeaponPresets } from "../src/data";

const preset = (id: string) => {
  const p = itemWeaponPresets.find((x) => x.id === `alien.item.${id}`);
  if (!p) throw new Error(`no preset ${id}`);
  return p;
};

const pc = (extra: Record<string, unknown> = {}) => ({ ...defaultFieldsFor(characterType), attributes: { strength: 3, agility: 4, wits: 3, empathy: 3 }, ...extra });

describe("weapons on the character sheet", () => {
  it("has a Weapons section after Gear with the weapons widget and its config", () => {
    const ids = characterType.sheet.sections.map((s) => s.id);
    expect(ids.indexOf("weapons")).toBe(ids.indexOf("gear") + 1);
    const field = weaponsFieldOf(characterType);
    expect(field?.path).toBe("weapons");
    expect(weaponListConfig(field)).toBe(WEAPONS_CONFIG);
    expect(characterType.sheet.create).toEqual(["isPC", "weapons"]);
  });

  it("copies a preset's stat line exactly and records the preset", () => {
    const row = weaponRowFromPreset(preset("armat-m41a-pulse-rifle"));
    expect(row).toEqual({
      name: "Armat M41A Pulse Rifle",
      presetId: "alien.item.armat-m41a-pulse-rifle",
      bonus: 2,
      damage: 2,
      damageType: "normal",
      rangeMin: "short",
      range: "long",
      ammo: 3,
      special: ["Armor piercing", "Full auto", "Grenade launcher"],
      weight: 1,
    });
    expect(validateEntityFields(characterType, pc({ weapons: [row] })).errors).toEqual([]);
  });

  it("validates a custom row and rejects an unknown range band", () => {
    expect(validateEntityFields(characterType, pc({ weapons: [{ name: "Shiv", bonus: 0, damage: 1, rangeMin: "adjacent", range: "adjacent", weight: 0.25, notes: "Hidden in a boot" }] })).valid).toBe(true);
    expect(validateEntityFields(characterType, pc({ weapons: [{ name: "Bad", range: "orbit" }] })).valid).toBe(false);
  });

  it("counts weapons toward encumbrance with the gear (derived, never stored)", () => {
    const fields = pc({
      gear: [{ name: "Tool kit", weight: 1, qty: 2 }],
      weapons: [weaponRowFromPreset(preset("armat-m41a-pulse-rifle")), weaponRowFromPreset(preset("knife")), weaponRowFromPreset(preset("m40-hedp-grenade"))],
    });
    const c = computeFields(characterType, fields);
    expect(c.encumbrance).toBe(2 + 1 + 0.5 + 0.25);
    expect(c.encumbranceLimit).toBe(6);
    expect("encumbrance" in fields).toBe(false);
    // weapons alone; a sheet without the list still works
    expect(computeFields(characterType, pc({ weapons: [{ name: "Axe", weight: 1 }] })).encumbrance).toBe(1);
    expect(computeFields(characterType, { ...pc(), weapons: undefined }).encumbrance).toBe(0);
  });

  it("leaves weapons kept as free-text gear rows alone", () => {
    const fields = pc({ gear: [{ name: "M4A3 Service Pistol", weight: 0.5, qty: 1, itemId: "alien.item.m4a3-service-pistol" }] });
    expect(validateEntityFields(characterType, fields).valid).toBe(true);
    expect(computeFields(characterType, fields).encumbrance).toBe(0.5);
  });
});

describe("the Add weapon picker's presets", () => {
  it("offers personal weapons only, grouped ranged / melee / explosive", () => {
    const offered = weaponPresets(WEAPONS_CONFIG, alienModule.presets);
    expect(offered.length).toBeGreaterThan(20);
    expect(offered.every((p) => p.entityType === "alien.item" && p.subtype === "weapon")).toBe(true);
    expect(offered.some((p) => (p.tags ?? []).includes("weapon:vehicle"))).toBe(false);
    expect(offered.some((p) => p.id === "alien.item.20mm-gatling-gun")).toBe(false);
    const groups = groupWeaponPresets(WEAPONS_CONFIG, offered);
    expect(groups.map((g) => g.label)).toEqual(["Ranged", "Melee", "Explosive"]);
    expect(groups[1]!.presets.map((p) => p.id)).toContain("alien.item.knife");
    expect(groups[2]!.presets.map((p) => p.id)).toContain("alien.item.m40-hedp-grenade");
    expect(groupWeaponPresets(WEAPONS_CONFIG, offered, "pulse").flatMap((g) => g.presets).every((p) => /pulse/i.test(p.name + p.summary))).toBe(true);
  });
});

describe("attacks with a weapon (p. 62-67)", () => {
  const rifle = weaponRowFromPreset(preset("armat-m41a-pulse-rifle"));
  const knife = weaponRowFromPreset(preset("knife"));

  it("rolls RANGED COMBAT from Short range with the modifier as gear dice", () => {
    const plan = planWeaponAttack(WEAPON_ATTACK, rifle);
    expect(plan.range.id).toBe("short");
    expect(plan.skillId).toBe("rangedCombat");
    expect(plan.pool).toEqual({ gear: 2, modifier: 0 });
    expect(plan.damage).toBe(2);
    expect(plan.armorPiercing).toBe(true);
    expect(plan.source).toBeUndefined();
    expect(plan.inRange).toBe(true);
    expect(plan.notes.some((n) => /ammo supply roll/.test(n))).toBe(true);
  });

  it("rolls CLOSE COMBAT at Adjacent, firearms included, at -2 per band under the minimum range", () => {
    const plan = planWeaponAttack(WEAPON_ATTACK, rifle, "adjacent");
    expect(plan.skillId).toBe("closeCombat");
    expect(plan.pool).toEqual({ gear: 2, modifier: -2 });
    const scope = weaponRowFromPreset(preset("armat-m42a-scope-rifle"));
    expect(planWeaponAttack(WEAPON_ATTACK, scope, "short").pool.modifier).toBe(-2);
    expect(planWeaponAttack(WEAPON_ATTACK, scope, "adjacent").pool.modifier).toBe(-4);
  });

  it("melee weapons attack at Adjacent with CLOSE COMBAT and cannot reach further", () => {
    const plan = planWeaponAttack(WEAPON_ATTACK, knife);
    expect(plan).toMatchObject({ skillId: "closeCombat", pool: { gear: 1 }, damage: 2, armorPiercing: false, inRange: true });
    expect(planWeaponAttack(WEAPON_ATTACK, knife, "short").inRange).toBe(false);
  });

  it("passes stun and fire to the armor rule and notes explosives", () => {
    expect(planWeaponAttack(WEAPON_ATTACK, weaponRowFromPreset(preset("stun-baton"))).source).toBe("stun");
    expect(planWeaponAttack(WEAPON_ATTACK, weaponRowFromPreset(preset("m240-incinerator-unit"))).source).toBe("fire");
    const grenade = planWeaponAttack(WEAPON_ATTACK, weaponRowFromPreset(preset("m40-hedp-grenade")));
    expect(grenade.skillId).toBe("rangedCombat");
    expect(grenade.notes.some((n) => /Explosive/.test(n))).toBe(true);
  });

  it("adds one damage per extra success; no success, no damage", () => {
    const plan = planWeaponAttack(WEAPON_ATTACK, rifle);
    expect(weaponHitDamage(plan, 0)).toBe(0);
    expect(weaponHitDamage(plan, 1)).toBe(2);
    expect(weaponHitDamage(plan, 3)).toBe(4);
  });

  it("the module's armor rule takes the hit the same way", () => {
    const hit = alienModule.combat!.resolveHit!({ damage: 2, extraSuccesses: 2, armor: 2, armorPiercing: true }, undefined as never);
    expect(hit.damage).toBe(2 + 2 - 1);
  });

  it("passes conformance: every offered preset rolls a skill the sheet has", () => {
    const report = checkModule(alienModule, { skipProcedureRuns: true });
    expect(report.issues.filter((i) => /weapons|attack/.test(`${i.where} ${i.message}`))).toEqual([]);
  });
});
