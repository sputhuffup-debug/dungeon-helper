import { describe, expect, it } from "vitest";
import { addCatalogItem, catalogPlacement, catalogPresets, gearCatalogConfig, gearCatalogFieldOf, groupCatalogPresets, sheetFieldAt } from "../src/gear";
import { checkModule } from "../src/module";
import { procedureFromPack } from "../src/pack/loader";
import { CONTRACT_VERSION, type EntityPreset, type EntityTypeDef, type GameModule, type GearCatalogConfig, type WeaponListConfig } from "../src/types";

const weapons: WeaponListConfig = { copy: ["damage", "weight"], columns: [{ key: "damage", label: "Dmg" }] };
const catalog: GearCatalogConfig = {
  presets: { entityType: "x.item", excludeTags: ["mounted"], where: { "!=": [{ var: "fields.portable" }, false] }, groups: [{ tag: "arms", label: "Arms" }, { tag: "kit", label: "Kit" }] },
  columns: [{ key: "price", label: "Price", numeric: true }],
  copy: { weight: "weight", supply: "charges" },
  routes: [{ path: "weapons", subtypes: ["weapon"] }],
};
const def = {
  id: "x.hero",
  sheet: {
    sections: [
      { id: "gear", title: "Gear", fields: [{ path: "gear", widget: "gear", label: "Gear", config: { catalog } }] },
      { id: "arms", title: "Arms", fields: [{ path: "weapons", widget: "weapons", label: "Weapons", config: weapons }] },
    ],
  },
} as unknown as EntityTypeDef;
const gearField = gearCatalogFieldOf(def)!;

const presets: EntityPreset[] = [
  { id: "x.item.bow", entityType: "x.item", subtype: "weapon", name: "Bow", tags: ["arms"], fields: { damage: 2, weight: 1, price: 30 } },
  { id: "x.item.lamp", entityType: "x.item", subtype: "tool", name: "Lamp", summary: "Brass.", tags: ["kit"], fields: { weight: 0.5, charges: 3, price: 5 } },
  { id: "x.item.cannon", entityType: "x.item", subtype: "weapon", name: "Cannon", tags: ["arms", "mounted"], fields: { damage: 9 } },
  { id: "x.item.forge", entityType: "x.item", subtype: "tool", name: "Forge", tags: ["kit"], fields: { portable: false } },
  { id: "x.item.rope", entityType: "x.item", subtype: "tool", name: "Rope", fields: { weight: 1 } },
  { id: "y.item.bow", entityType: "y.item", subtype: "weapon", name: "Elsewhere", fields: {} },
];

describe("the gear catalog", () => {
  it("reads the field's catalog and finds sheet fields", () => {
    expect(gearField.path).toBe("gear");
    expect(gearCatalogConfig(gearField)).toBe(catalog);
    expect(gearCatalogConfig({ path: "gear", widget: "gear", config: { catalog: { presets: {} } } })).toBeUndefined();
    expect(sheetFieldAt(def, "weapons")?.widget).toBe("weapons");
  });

  it("offers the type's presets the filters keep, grouped and searchable", () => {
    expect(catalogPresets(catalog, presets).map((p) => p.id)).toEqual(["x.item.bow", "x.item.lamp", "x.item.rope"]);
    expect(groupCatalogPresets(catalog, presets).map((g) => [g.label, g.presets.map((p) => p.name)])).toEqual([
      ["Arms", ["Bow"]],
      ["Kit", ["Lamp"]],
      ["Other", ["Rope"]],
    ]);
    expect(groupCatalogPresets(catalog, presets, "brass").map((g) => g.label)).toEqual(["Kit"]);
  });

  it("sends a routed preset to its list, built with that field's config, the rest to the gear", () => {
    expect(catalogPlacement(def, gearField, presets[0]!)).toMatchObject({ path: "weapons", routed: true, row: { name: "Bow", damage: 2, weight: 1, presetId: "x.item.bow" } });
    expect(catalogPlacement(def, gearField, presets[1]!, { name: "Old lamp" })).toMatchObject({ path: "gear", routed: false, row: { name: "Old lamp", weight: 0.5, supply: 3, qty: 1, presetId: "x.item.lamp" } });
  });

  it("adds items without changing the input: one row per weapon, a gear row's quantity raised", () => {
    const start = { gear: [{ name: "Lamp", weight: 0.5, qty: 1, presetId: "x.item.lamp" }], weapons: [] as unknown[], name: "kept" };
    const once = addCatalogItem(def, gearField, start, presets[1]!);
    expect(once.fields.gear).toEqual([{ name: "Lamp", weight: 0.5, qty: 2, presetId: "x.item.lamp" }]);
    expect(start.gear[0]!.qty).toBe(1);
    const two = addCatalogItem(def, gearField, once.fields, presets[0]!, { qty: 2 });
    expect((two.fields.weapons as unknown[]).length).toBe(2);
    expect(two.fields.name).toBe("kept");
    expect(two.placement.field.label).toBe("Weapons");
  });

  it("is checked by the conformance suite: row keys, routes and sources (and a character procedure's type)", () => {
    const bad: GearCatalogConfig = { ...catalog, copy: { heft: "weight" }, routes: [{ path: "nowhere", subtypes: ["weapon"] }], presets: { entityType: "x.nothing" } };
    const mod: GameModule = {
      manifest: { id: "x", version: "1.0.0", name: "X", ruleset: "X", licenseNotice: "none", requiredCore: CONTRACT_VERSION, modes: [{ id: "a", name: "A" }], defaultMode: "a", dataStatus: "verified" },
      dice: {
        dice: [{ id: "d6", name: "d6", faces: 6 }],
        buildPool: () => ({ dice: { d6: 1 } }),
        roll: (pool, rng) => ({ pool, dice: [{ die: "d6", value: rng.int(1, 6) }], successes: 0, symbols: {}, pushes: 0, canPush: false }),
        describe: () => "",
      },
      entityTypes: [
        {
          id: "x.hero",
          kind: "character",
          name: "Hero",
          plural: "Heroes",
          schema: { type: "object", properties: { gear: { type: "array", items: { type: "object", properties: { name: { type: "string" }, qty: { type: "integer" }, presetId: { type: "string" } } } } } },
          sheet: { sections: [{ id: "g", title: "G", fields: [{ path: "gear", widget: "gear", config: { catalog: bad } }] }] },
        },
      ],
      relationshipTypes: [],
      referenceLists: [],
      presets: [],
      tables: [],
      procedures: [
        { id: "x.roll", name: "Roll", steps: [{ id: "one", compute: () => 1 }], produce: () => ({ entities: [], relationships: [] }), createsCharacter: { entityType: "x.ghost", label: "" } },
      ],
      templates: [],
      rules: [],
      trackers: [],
      calendar: { id: "c", name: "C", defaultYear: 1, months: [{ name: "M", days: 30 }], format: "{year}" },
    };
    const messages = checkModule(mod, { skipProcedureRuns: true }).issues.map((i) => i.message);
    expect(messages).toEqual(expect.arrayContaining([
      'gear catalog references unknown entity type "x.nothing"',
      'catalog row key "heft" is not a property of the gear rows',
      'catalog route to "nowhere", which is not a field of the sheet',
      'createsCharacter names unknown entity type "x.ghost"',
      "createsCharacter needs a label",
    ]));
  });
});

describe("a procedure that makes a character", () => {
  it("is carried over from a data pack", () => {
    const proc = procedureFromPack({ id: "x.roll", name: "Roll", steps: [{ id: "a", value: 1 }], produce: { entities: [] }, createsCharacter: { entityType: "x.hero", label: "Roll a hero", pc: true } } as never);
    expect(proc.createsCharacter).toEqual({ entityType: "x.hero", label: "Roll a hero", pc: true });
  });
});
