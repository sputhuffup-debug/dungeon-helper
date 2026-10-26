import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { computeFields, type EntityPreset, type EntityTypeDef, type WeaponListConfig } from "@campaign-forge/module-sdk";
import { SheetRenderer, type SheetEntityRef } from "../src/index";

/** A tiny game with a weapons list: nothing here is any real module's data. */
const config: WeaponListConfig = {
  presets: {
    entityType: "demo.item",
    subtype: "weapon",
    excludeTags: ["mounted"],
    groups: [
      { tag: "kind:missile", label: "Missile" },
      { tag: "kind:hand", label: "Hand" },
    ],
  },
  items: { entityType: "demo.item", subtype: "weapon" },
  copy: ["bonus", "damage", "reach", "weight"],
  edit: ["bonus", "damage", "reach", "weight", "tags", "notes"],
  columns: [
    { label: "Bonus", display: { if: [{ ">": [{ var: "bonus" }, 0] }, { cat: ["+", { var: "bonus" }] }, { var: "bonus" }] }, numeric: true },
    { key: "damage", label: "Damage", numeric: true },
    { key: "reach", label: "Reach" },
    { key: "weight", label: "Weight", numeric: true },
  ],
  pickerColumns: [
    { key: "damage", label: "Damage", numeric: true },
    { label: "Price", display: { cat: [{ var: "price" }, " gp"] } },
  ],
  totalComputed: "load",
  limitComputed: "loadLimit",
};

const def: EntityTypeDef = {
  id: "demo.hero",
  kind: "character",
  name: "Hero",
  plural: "Heroes",
  schema: {
    type: "object",
    properties: {
      strength: { type: "integer", default: 2 },
      pack: { type: "array", default: [], items: { type: "object", properties: { name: { type: "string" }, weight: { type: "number" } } } },
      arms: {
        type: "array",
        default: [],
        items: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string", title: "Arm" },
            presetId: { type: "string" },
            itemId: { type: "string" },
            bonus: { type: "integer", default: 0, title: "Bonus" },
            damage: { type: "integer", default: 1, title: "Damage" },
            reach: { type: "string", enum: ["near", "far"], default: "near", title: "Reach" },
            weight: { type: "number", default: 1, title: "Weight" },
            tags: { type: "array", items: { type: "string" }, title: "Tags" },
            notes: { type: "string", title: "Notes" },
          },
        },
      },
    },
  },
  computed: {
    loadLimit: { "*": [{ var: "fields.strength" }, 2] },
    load: { "+": [{ sum: [{ map: [{ var: "fields.pack" }, { var: "weight" }] }] }, { sum: [{ map: [{ var: "fields.arms" }, { var: "weight" }] }] }] },
  },
  sheet: { sections: [{ id: "arms", title: "Arms", fields: [{ path: "arms", label: "Arms", widget: "weapons", config: config as unknown as Record<string, unknown> }] }] },
};

const presets: EntityPreset[] = [
  { id: "demo.sling", entityType: "demo.item", subtype: "weapon", name: "Sling", summary: "Stones and a strap.", page: 12, tags: ["kind:missile"], fields: { bonus: 1, damage: 1, reach: "far", weight: 0.5, price: 2 } },
  { id: "demo.club", entityType: "demo.item", subtype: "weapon", name: "Club", page: 13, tags: ["kind:hand"], fields: { bonus: 0, damage: 2, reach: "near", weight: 1, price: 0 } },
  { id: "demo.ballista", entityType: "demo.item", subtype: "weapon", name: "Ballista", page: 14, tags: ["kind:missile", "mounted"], fields: { bonus: 0, damage: 6, reach: "far", weight: 0, price: 500 } },
  { id: "demo.lantern", entityType: "demo.item", subtype: "tool", name: "Lantern", fields: { weight: 1 } },
  { id: "demo.oddity", entityType: "demo.item", subtype: "weapon", name: "Odd stick", fields: { damage: 1, weight: 1 } },
];

const campaignItems: SheetEntityRef[] = [
  { id: "E1", name: "Grandad's sword", subtype: "weapon", fields: { bonus: 2, damage: 3, reach: "near", weight: 1, price: 40 } },
  { id: "E2", name: "Rope", subtype: "tool", fields: { weight: 1 } },
];

function Harness({ initial, readonly, onFields }: { initial: Record<string, unknown>; readonly?: boolean; onFields?: (f: Record<string, unknown>) => void }) {
  const [fields, setFields] = useState(initial);
  return (
    <SheetRenderer
      def={def}
      mode="standard"
      fields={fields}
      readonly={readonly}
      onChange={(next) => {
        setFields(next);
        onFields?.(next);
      }}
      presetsFor={(type) => presets.filter((p) => p.entityType === type)}
      entitiesOf={() => campaignItems}
    />
  );
}

const lastFields = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.at(-1)![0] as { arms: Array<Record<string, unknown>> };

describe("weapons widget", () => {
  it("shows each row's stats as columns, with the weight and the computed load", () => {
    render(<Harness initial={{ strength: 2, pack: [{ name: "Bedroll", weight: 1 }], arms: [{ name: "Spear", bonus: 1, damage: 2, reach: "near", weight: 1 }] }} />);
    const table = screen.getByTestId("weapons-table");
    const row = within(table).getByRole("row", { name: /Spear/ });
    expect(within(row).getAllByRole("cell").map((c) => c.textContent)).toEqual(["+1", "2", "near", "1", "EditRemove Spear"].map((t) => t.replace("Remove Spear", "×")));
    expect(screen.getByTestId("weapons-total")).toHaveTextContent(/Weapons weight 1\s*Encumbrance 2 \/ 4/);
  });

  it("is a plain table when read-only (player view)", () => {
    render(<Harness readonly initial={{ arms: [{ name: "Spear", damage: 2 }] }} />);
    expect(screen.getByRole("rowheader", { name: "Spear" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add weapon|Custom weapon|Edit|Remove/ })).toBeNull();
  });

  it("Add weapon: a searchable picker grouped by tag, leaving out excluded presets; picking copies the stats and the preset id", () => {
    const onFields = vi.fn();
    render(<Harness initial={{ arms: [] }} onFields={onFields} />);
    fireEvent.click(screen.getByRole("button", { name: "Add weapon" }));
    const picker = screen.getByTestId("weapon-picker");
    expect(within(picker).getAllByRole("heading").map((h) => h.textContent)).toEqual(["Missile", "Hand", "Other"]);
    expect(within(picker).queryByText("Ballista")).toBeNull();
    expect(within(picker).queryByText("Lantern")).toBeNull();
    const sling = within(picker).getByRole("row", { name: /Sling/ });
    expect(sling).toHaveTextContent("2 gp");
    expect(sling).toHaveTextContent("p. 12");
    fireEvent.change(within(picker).getByRole("searchbox", { name: "Search weapons" }), { target: { value: "club" } });
    expect(within(picker).queryByText("Sling")).toBeNull();
    fireEvent.click(within(picker).getByRole("button", { name: "Add Club" }));
    expect(lastFields(onFields).arms).toEqual([{ name: "Club", bonus: 0, damage: 2, reach: "near", weight: 1, presetId: "demo.club" }]);
    expect(screen.queryByTestId("weapon-picker")).toBeNull();
    expect(screen.getByRole("rowheader", { name: "Club" })).toBeInTheDocument();
  });

  it("Custom weapon adds a blank row with the schema defaults and opens its editor", () => {
    const onFields = vi.fn();
    render(<Harness initial={{ arms: [] }} onFields={onFields} />);
    fireEvent.click(screen.getByRole("button", { name: "Custom weapon" }));
    expect(lastFields(onFields).arms).toEqual([{ name: "", bonus: 0, damage: 1, reach: "near", weight: 1 }]);
    fireEvent.change(screen.getByRole("textbox", { name: "Weapon 1 name" }), { target: { value: "Knife" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Knife damage" }), { target: { value: "2" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Knife weight" }), { target: { value: "0.5" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Knife reach" }), { target: { value: "far" } });
    const tags = screen.getByRole("textbox", { name: "Knife tags" });
    fireEvent.change(tags, { target: { value: "hidden, cheap" } });
    fireEvent.blur(tags);
    fireEvent.change(screen.getByRole("textbox", { name: "Knife notes" }), { target: { value: "In the boot" } });
    expect(lastFields(onFields).arms).toEqual([{ name: "Knife", bonus: 0, damage: 2, reach: "far", weight: 0.5, tags: ["hidden", "cheap"], notes: "In the boot" }]);
    fireEvent.click(screen.getByRole("button", { name: "Edit Knife" }));
    expect(screen.queryByRole("textbox", { name: "Weapon 1 name" })).toBeNull();
    expect(screen.getByTestId("weapons-total")).toHaveTextContent("Weapons weight 0.5");
  });

  it("From campaign items links an item entity of the configured subtype", () => {
    const onFields = vi.fn();
    render(<Harness initial={{ arms: [] }} onFields={onFields} />);
    fireEvent.click(screen.getByRole("button", { name: "From campaign items" }));
    const picker = screen.getByTestId("weapon-picker");
    expect(within(picker).queryByText("Rope")).toBeNull();
    fireEvent.click(within(picker).getByRole("button", { name: "Add Grandad's sword" }));
    expect(lastFields(onFields).arms).toEqual([{ name: "Grandad's sword", bonus: 2, damage: 3, reach: "near", weight: 1, itemId: "E1" }]);
  });

  it("removes a row", () => {
    const onFields = vi.fn();
    render(<Harness initial={{ arms: [{ name: "Spear" }, { name: "Club" }] }} onFields={onFields} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Spear" }));
    expect(lastFields(onFields).arms).toEqual([{ name: "Club" }]);
  });

  it("offers no preset picker when the host supplies no presets", () => {
    render(<SheetRenderer def={def} mode="standard" fields={{ arms: [] }} onChange={() => {}} />);
    expect(screen.queryByRole("button", { name: "Add weapon" })).toBeNull();
    expect(screen.queryByRole("button", { name: "From campaign items" })).toBeNull();
    expect(screen.getByRole("button", { name: "Custom weapon" })).toBeInTheDocument();
    expect(computeFields(def, { strength: 3, arms: [{ name: "x", weight: 2 }] }).load).toBe(2);
  });
});
