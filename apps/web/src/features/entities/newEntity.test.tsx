import "fake-indexeddb/auto";
import { computeFields } from "@campaign-forge/module-sdk";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createCampaign } from "../../state/actions";
import { CampaignContext, openCampaign } from "../../state/CampaignProvider";
import { NewEntityPage } from "./NewEntityPage";

const nav = vi.hoisted(() => ({ search: {} as Record<string, unknown>, navigate: vi.fn() }));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useSearch: () => nav.search,
  useNavigate: () => nav.navigate,
}));

const opened: Array<() => void> = [];
afterEach(() => {
  cleanup();
  nav.navigate.mockReset();
  while (opened.length) opened.pop()?.();
});

let alienId: string;
let exampleId: string;
beforeAll(async () => {
  alienId = await createCampaign({ name: "New PC (Alien)", moduleId: "alien", mode: "campaign" });
  exampleId = await createCampaign({ name: "New hero", moduleId: "example" });
}, 30_000);

async function renderPage(campaignId: string, search: Record<string, unknown>) {
  const ctx = await openCampaign(campaignId);
  opened.push(ctx.close);
  nav.search = search;
  render(
    <CampaignContext.Provider value={ctx}>
      <NewEntityPage />
    </CampaignContext.Provider>,
  );
  return ctx;
}

describe("new entity form: the fields the sheet asks for at creation", () => {
  it("creates an Alien PC from the Atlas's PCs tab with a preset rifle and a custom knife", async () => {
    const ctx = await renderPage(alienId, { type: "alien.character", pc: 1 });
    const create = screen.getByTestId("create-fields");
    // from the PCs tab: ticked as a player character
    expect(create.querySelector<HTMLInputElement>('[data-path="isPC"] input[type="checkbox"]')!.checked).toBe(true);
    fireEvent.click(within(create).getByRole("button", { name: "Add weapon" }));
    const picker = screen.getByTestId("weapon-picker");
    expect(within(picker).getAllByRole("heading").map((h) => h.textContent)).toEqual(["Ranged", "Melee", "Explosive"]);
    // vehicle-mounted weapons are not offered for a personal sheet
    expect(within(picker).queryByText("20 mm Gatling Gun")).toBeNull();
    fireEvent.change(within(picker).getByRole("searchbox", { name: "Search weapons" }), { target: { value: "M41A" } });
    const row = within(picker).getByRole("row", { name: /Armat M41A Pulse Rifle/ });
    expect(row.textContent).toContain("+2");
    expect(row.textContent).toContain("S/L");
    expect(row.textContent).toContain("$1200");
    expect(row.textContent).toContain("p. 84");
    fireEvent.click(within(row).getByRole("button", { name: "Add Armat M41A Pulse Rifle" }));
    fireEvent.click(within(create).getByRole("button", { name: "Custom weapon" }));
    fireEvent.change(within(create).getByRole("textbox", { name: "Weapon 2 name" }), { target: { value: "Knife" } });
    fireEvent.change(within(create).getByRole("spinbutton", { name: "Knife damage" }), { target: { value: "2" } });
    fireEvent.change(within(create).getByRole("spinbutton", { name: "Knife weight" }), { target: { value: "0.5" } });
    expect(within(create).getByTestId("weapons-total").textContent).toMatch(/Weapons weight 1\.5\s*Encumbrance 1\.5 \/ 6/);
    fireEvent.change(screen.getByTestId("entity-name"), { target: { value: "Vera Okafor" } });
    fireEvent.click(screen.getByTestId("create-entity"));

    const pc = ctx.store.list("entities").find((e) => e.name === "Vera Okafor")!;
    expect(pc.fields.isPC).toBe(true);
    expect(pc.fields.weapons).toEqual([
      { name: "Armat M41A Pulse Rifle", presetId: "alien.item.armat-m41a-pulse-rifle", bonus: 2, damage: 2, damageType: "normal", rangeMin: "short", range: "long", ammo: 3, special: ["Armor piercing", "Full auto", "Grenade launcher"], weight: 1 },
      { name: "Knife", bonus: 0, damage: 2, damageType: "normal", explosive: false, rangeMin: "adjacent", range: "adjacent", special: [], weight: 0.5 },
    ]);
    expect(computeFields(ctx.module.entityType("alien.character")!, pc.fields).encumbrance).toBe(1.5);
    expect("encumbrance" in pc.fields).toBe(false);
    expect(nav.navigate).toHaveBeenCalledWith(expect.objectContaining({ params: { campaignId: ctx.campaignId, entityId: pc.id } }));
  });

  it("starts from an NPC preset and keeps the weapons picked while the preset changes", async () => {
    const ctx = await renderPage(alienId, { type: "alien.character" });
    const create = screen.getByTestId("create-fields");
    expect(create.querySelector<HTMLInputElement>('[data-path="isPC"] input[type="checkbox"]')!.checked).toBe(false);
    fireEvent.click(within(create).getByRole("button", { name: "Add weapon" }));
    fireEvent.click(within(screen.getByTestId("weapon-picker")).getByRole("button", { name: "Add Combat Knife" }));
    const preset = ctx.module.presetsFor("alien.character")[0]!;
    fireEvent.click(screen.getByRole("radio", { name: new RegExp(preset.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }));
    expect(within(create).getByRole("rowheader", { name: "Combat Knife" })).toBeTruthy();
    fireEvent.click(screen.getByTestId("create-entity"));
    const npc = ctx.store.list("entities").find((e) => e.provenance?.preset === preset.id)!;
    expect((npc.fields.weapons as Array<{ name: string }>).map((w) => w.name)).toEqual(["Combat Knife"]);
    expect(npc.fields.isPC).not.toBe(true);
  });

  it("asks nothing more for a type whose sheet declares no creation fields", async () => {
    await renderPage(exampleId, { type: "example.hero" });
    expect(screen.queryByTestId("create-fields")).toBeNull();
  });
});
