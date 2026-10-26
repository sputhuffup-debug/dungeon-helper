import { describe, expect, it } from "vitest";
import {
  attackRanges,
  blankWeaponRow,
  defaultAttackRange,
  groupWeaponPresets,
  planWeaponAttack,
  weaponColumnText,
  weaponHitDamage,
  weaponListConfig,
  weaponPresets,
  weaponRowFrom,
  weaponsFieldOf,
  weaponsWeight,
} from "../src/weapons";
import type { EntityPreset, EntityTypeDef, WeaponAttackConfig, WeaponListConfig } from "../src/types";

const cfg: WeaponListConfig = {
  presets: { entityType: "x.item", subtype: "weapon", excludeTags: ["mounted"], groups: [{ tag: "far", label: "Missile" }, { tag: "near", label: "Hand" }] },
  copy: ["bonus", "damage", "special", "weight"],
  columns: [{ key: "damage", label: "Dmg" }, { label: "Bonus", display: { cat: ["+", { var: "bonus" }] } }, { key: "special", label: "Special" }, { key: "loud", label: "Loud" }],
};

const presets: EntityPreset[] = [
  { id: "bow", entityType: "x.item", subtype: "weapon", name: "Bow", summary: "Yew.", tags: ["far"], fields: { bonus: 1, damage: 2, special: ["Two hands"], weight: 1, price: 30 } },
  { id: "axe", entityType: "x.item", subtype: "weapon", name: "Axe", tags: ["near"], fields: { bonus: 0, damage: 3, weight: 1 } },
  { id: "cannon", entityType: "x.item", subtype: "weapon", name: "Cannon", tags: ["far", "mounted"], fields: { damage: 9 } },
  { id: "rope", entityType: "x.item", subtype: "tool", name: "Rope", fields: {} },
  { id: "rock", entityType: "x.item", subtype: "weapon", name: "Rock", fields: { damage: 1 } },
  { id: "other", entityType: "y.item", subtype: "weapon", name: "Elsewhere", fields: {} },
];

describe("weapon list helpers", () => {
  it("reads a field's config and finds the weapons field", () => {
    const def = { sheet: { sections: [{ id: "a", title: "A", fields: [{ path: "gear", widget: "gear" }, { path: "arms", widget: "weapons", config: cfg }] }] } } as unknown as EntityTypeDef;
    expect(weaponsFieldOf(def)?.path).toBe("arms");
    expect(weaponListConfig(weaponsFieldOf(def))).toBe(cfg);
    expect(weaponListConfig({ path: "x", config: { columns: [] } })).toBeUndefined();
  });

  it("filters presets by type, subtype and tags, groups them in order and searches", () => {
    const offered = weaponPresets(cfg, presets);
    expect(offered.map((p) => p.id)).toEqual(["bow", "axe", "rock"]);
    expect(weaponPresets({ ...cfg, presets: { entityType: "x.item", tags: ["near"] } }, presets).map((p) => p.id)).toEqual(["axe"]);
    expect(groupWeaponPresets(cfg, offered).map((g) => [g.label, g.presets.map((p) => p.id)])).toEqual([
      ["Missile", ["bow"]],
      ["Hand", ["axe"]],
      ["Other", ["rock"]],
    ]);
    expect(groupWeaponPresets(cfg, offered, "yew").map((g) => g.label)).toEqual(["Missile"]);
    expect(weaponPresets({ copy: [], columns: [] }, presets)).toEqual([]);
  });

  it("copies the configured stats (cloned) with the preset or item link; a blank row takes the schema defaults", () => {
    const row = weaponRowFrom(cfg, presets[0]!, { presetId: "bow" });
    expect(row).toEqual({ name: "Bow", bonus: 1, damage: 2, special: ["Two hands"], weight: 1, presetId: "bow" });
    expect(row.special).not.toBe(presets[0]!.fields.special);
    expect(weaponRowFrom({ ...cfg, itemKey: "linked" }, { name: "Old axe", fields: { damage: 3 } }, { itemId: "E1" })).toEqual({ name: "Old axe", damage: 3, linked: "E1" });
    expect(blankWeaponRow({ type: "object", properties: { damage: { type: "integer", default: 1 }, notes: { type: "string" } } })).toEqual({ damage: 1, name: "" });
  });

  it("formats columns and sums weight", () => {
    const row = weaponRowFrom(cfg, presets[0]!);
    expect(cfg.columns.map((c) => weaponColumnText(c, row))).toEqual(["2", "+1", "Two hands", ""]);
    expect(weaponsWeight(cfg, [row, { name: "x", weight: 0.5 }, { name: "y" }])).toBe(1.5);
  });
});

describe("weapon attacks", () => {
  const attack: WeaponAttackConfig = {
    ranges: [{ id: "touch", label: "Touch" }, { id: "near", label: "Near" }, { id: "far", label: "Far" }],
    skill: { if: [{ "==": [{ var: "range" }, "touch"] }, "brawl", "aim"] },
    pool: { bonus: { var: "weapon.bonus" }, penalty: { "*": [-1, { var: "closer" }] } },
    damage: { var: "weapon.damage" },
    extraSuccessesAddDamage: true,
    armorPiercing: { in: ["Piercing", { var: ["weapon.special", []] }] },
    source: { var: "weapon.kind" },
    notes: [{ when: { var: "beyond" }, text: "Out of range." }],
  };
  const bow = { name: "Bow", bonus: 1, damage: 2, rangeMin: "near", range: "far", special: ["Piercing"], kind: "arrow" };

  it("works out the skill, pool numbers, damage and armor options at a band", () => {
    expect(defaultAttackRange(attack, bow)).toBe("near");
    expect(attackRanges(attack, bow).map((r) => r.id)).toEqual(["touch", "near", "far"]);
    expect(planWeaponAttack(attack, bow)).toEqual({ range: { id: "near", label: "Near" }, skillId: "aim", pool: { bonus: 1, penalty: 0 }, damage: 2, extraSuccessesAddDamage: true, armorPiercing: true, source: "arrow", inRange: true, notes: [] });
    expect(planWeaponAttack(attack, bow, "touch")).toMatchObject({ skillId: "brawl", pool: { bonus: 1, penalty: -1 } });
  });

  it("a weapon without ranges reaches every band from the nearest; beyond the maximum is out of range", () => {
    expect(defaultAttackRange(attack, { name: "Rock" })).toBe("touch");
    expect(attackRanges(attack, { name: "Rock" })).toHaveLength(3);
    const knife = { name: "Knife", rangeMin: "touch", range: "touch", damage: 1 };
    expect(attackRanges(attack, knife).map((r) => r.id)).toEqual(["touch"]);
    expect(planWeaponAttack(attack, knife, "far")).toMatchObject({ inRange: false, notes: ["Out of range."], armorPiercing: false });
  });

  it("damage: none without a success, then base plus extra successes when the config says so", () => {
    const plan = planWeaponAttack(attack, bow);
    expect([0, 1, 2, 4].map((s) => weaponHitDamage(plan, s))).toEqual([0, 2, 3, 5]);
    expect(weaponHitDamage({ ...plan, extraSuccessesAddDamage: false }, 4)).toBe(2);
  });
});
