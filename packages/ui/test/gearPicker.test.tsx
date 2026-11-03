/**
 * The gear widget's "From the gear list…" (a weapon goes to the weapons
 * list, the rest to the gear, again raises the quantity) and a ref field
 * picked from a dropdown of other player characters, with an older typed
 * name still shown and linked in one click. A tiny made-up game.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import type { EntityPreset, EntityTypeDef, GearCatalogConfig, WeaponListConfig } from "@campaign-forge/module-sdk";
import { SheetRenderer, type SheetEntityRef } from "../src/index";

const weapons: WeaponListConfig = { copy: ["damage", "weight"], columns: [{ key: "damage", label: "Damage", numeric: true }] };
const catalog: GearCatalogConfig = {
  presets: { entityType: "demo.item", excludeTags: ["mounted"], groups: [{ tag: "arms", label: "Arms" }, { tag: "kit", label: "Kit" }] },
  columns: [{ label: "Price", display: { cat: [{ var: "price" }, " gp"] } }],
  copy: { weight: "weight" },
  routes: [{ path: "arms", subtypes: ["weapon"] }],
};
const row = { type: "object", properties: { name: { type: "string" }, weight: { type: "number" }, qty: { type: "integer" }, presetId: { type: "string" }, damage: { type: "integer" } } };
const def: EntityTypeDef = {
  id: "demo.hero",
  kind: "character",
  name: "Hero",
  plural: "Heroes",
  schema: { type: "object", properties: { pack: { type: "array", default: [], items: row }, arms: { type: "array", default: [], items: row }, friend: { type: "string" } } },
  sheet: {
    sections: [
      { id: "who", title: "Who", fields: [{ path: "friend", label: "Friend", widget: "ref", entityTypes: ["demo.hero"], config: { pick: "select", pc: true } }] },
      { id: "pack", title: "Pack", fields: [{ path: "pack", label: "Pack", widget: "gear", config: { catalog } }] },
      { id: "arms", title: "Arms", fields: [{ path: "arms", label: "Arms", widget: "weapons", config: weapons as unknown as Record<string, unknown> }] },
    ],
  },
};
const presets: EntityPreset[] = [
  { id: "demo.sling", entityType: "demo.item", subtype: "weapon", name: "Sling", page: 12, tags: ["arms"], fields: { damage: 1, weight: 0.5, price: 2 } },
  { id: "demo.lantern", entityType: "demo.item", subtype: "tool", name: "Lantern", summary: "Oil and a wick.", page: 20, tags: ["kit"], fields: { weight: 1, price: 5 } },
  { id: "demo.ballista", entityType: "demo.item", subtype: "weapon", name: "Ballista", tags: ["arms", "mounted"], fields: { damage: 6 } },
];
const heroes: SheetEntityRef[] = [
  { id: "01HERO00000000000000000001", name: "Ada", fields: {}, pc: true },
  { id: "01HERO00000000000000000002", name: "Bo", fields: {}, pc: true },
  { id: "01HERO00000000000000000003", name: "Innkeeper", fields: {} },
];

function Harness({ initial, onFields, readonly }: { initial: Record<string, unknown>; onFields?: (f: Record<string, unknown>) => void; readonly?: boolean }) {
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
      entitiesOf={(type) => (type === "demo.hero" ? heroes : [])}
      resolveEntityName={(id) => heroes.find((h) => h.id === id)?.name}
      entityId="01HERO00000000000000000001"
    />
  );
}

const last = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.at(-1)![0] as Record<string, Array<Record<string, unknown>>>;

describe("gear widget: From the gear list", () => {
  it("adds a weapon to the weapons list and other gear to the gear, raising a quantity, and stays open saying where it went", () => {
    const onFields = vi.fn();
    render(<Harness initial={{ pack: [], arms: [] }} onFields={onFields} />);
    fireEvent.click(screen.getByTestId("gear-from-list"));
    const picker = screen.getByTestId("gear-picker");
    expect(within(picker).getAllByRole("heading").map((h) => h.textContent)).toEqual(["Arms", "Kit"]);
    expect(within(picker).queryByText("Ballista")).toBeNull();
    expect(within(picker).getByRole("row", { name: /Lantern/ })).toHaveTextContent(/5 gp.*p\. 20/);
    fireEvent.click(within(picker).getByRole("button", { name: "Add Sling" }));
    expect(last(onFields).arms).toEqual([{ name: "Sling", damage: 1, weight: 0.5, presetId: "demo.sling" }]);
    expect(last(onFields).pack).toEqual([]);
    expect(within(picker).getByTestId("gear-picker-status")).toHaveTextContent("Added Sling to Arms.");
    fireEvent.change(within(picker).getByRole("searchbox", { name: "Search the gear list" }), { target: { value: "wick" } });
    fireEvent.click(within(picker).getByRole("button", { name: "Add Lantern" }));
    fireEvent.click(within(picker).getByRole("button", { name: "Add Lantern" }));
    expect(last(onFields).pack).toEqual([{ name: "Lantern", weight: 1, qty: 2, presetId: "demo.lantern" }]);
    expect(within(picker).getByTestId("gear-picker-status")).toHaveTextContent("Added Lantern to Pack.");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByTestId("gear-picker")).toBeNull();
    expect(screen.getByRole("rowheader", { name: "Sling" })).toBeInTheDocument();
  });

  it("is not offered on a read-only sheet", () => {
    render(<Harness readonly initial={{ pack: [{ name: "Lantern", qty: 1 }], arms: [] }} />);
    expect(screen.queryByTestId("gear-from-list")).toBeNull();
  });
});

describe("ref widget: a pick of other player characters", () => {
  const select = () => document.querySelector<HTMLSelectElement>('[data-path="friend"] select')!;
  it("offers the other PCs, never the sheet's own character or an NPC, and stores the id", () => {
    const onFields = vi.fn();
    render(<Harness initial={{}} onFields={onFields} />);
    expect([...select().options].map((o) => o.text)).toEqual(["None", "Bo"]);
    fireEvent.change(select(), { target: { value: "01HERO00000000000000000002" } });
    expect(last(onFields).friend).toBe("01HERO00000000000000000002");
    expect(select().value).toBe("01HERO00000000000000000002");
  });

  it("shows an older typed name as typed and links it to the PC of that name in one click", () => {
    const onFields = vi.fn();
    render(<Harness initial={{ friend: "bo " }} onFields={onFields} />);
    expect(select().selectedOptions[0]!.text).toBe("“bo” (typed)");
    fireEvent.click(screen.getByRole("button", { name: "Link to Bo" }));
    expect(last(onFields).friend).toBe("01HERO00000000000000000002");
    expect(screen.queryByRole("button", { name: /Link to/ })).toBeNull();
  });

  it("keeps a typed name nobody has, and reads as text on a read-only sheet", () => {
    render(<Harness initial={{ friend: "Parker" }} />);
    expect(screen.getByText("Typed by hand: pick who it is.")).toBeInTheDocument();
    expect(select().selectedOptions[0]!.text).toBe("“Parker” (typed)");
  });

  it("reads the picked name read-only", () => {
    render(<Harness readonly initial={{ friend: "01HERO00000000000000000002" }} />);
    expect(document.querySelector('[data-path="friend"]')).toHaveTextContent("Bo");
  });
});
