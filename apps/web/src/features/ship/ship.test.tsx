import "fake-indexeddb/auto";
import { ledgerBalance } from "@campaign-forge/core";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createCampaign, createEntity } from "../../state/actions";
import { CampaignContext, openCampaign, type CampaignContextValue } from "../../state/CampaignProvider";
import { hasShipPage, postPayout } from "../../state/shipActions";
import { PayoutButton } from "./PayoutButton";
import { initialInputs, pickedInputs } from "../generate/prefill";
import type { Procedure } from "@campaign-forge/module-sdk";
import { ShipPage } from "./ShipPage";

// The page links to other routes; outside a router a plain anchor does.
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  Link: ({ children, className }: { children?: ReactNode; className?: string }) => <a className={className}>{children}</a>,
}));

const opened: Array<() => void> = [];
afterEach(() => {
  cleanup();
  while (opened.length) opened.pop()?.();
});

let campaignId: string;
beforeAll(async () => {
  campaignId = await createCampaign({ name: "Wagon run", moduleId: "example" });
}, 30_000);

async function setup() {
  const ctx = await openCampaign(campaignId);
  opened.push(ctx.close);
  ctx.store.transact(() => {
    for (const e of ctx.store.list("entities")) ctx.store.remove("entities", e.id);
    for (const e of ctx.store.list("ledger")) ctx.store.remove("ledger", e.id);
    for (const e of ctx.store.list("travel")) ctx.store.remove("travel", e.id);
    ctx.store.updateMeta({ currentDate: "1000-01-28", settings: {} });
  });
  const wagon = createEntity(ctx, { type: "example.wagon", name: "Old Bess", fields: { oxen: 2, wear: 1, food: 10, goods: [{ item: "Salt", note: "Two barrels" }] } });
  const home = createEntity(ctx, { type: "example.place", name: "Millford", fields: { population: 40 } });
  const fair = createEntity(ctx, { type: "example.place", name: "Fairhaven", fields: { population: 300 } });
  return { ctx, wagon, home, fair };
}

const Harness = ({ ctx, children }: { ctx: CampaignContextValue; children: ReactNode }) => <CampaignContext.Provider value={ctx}>{children}</CampaignContext.Provider>;

describe("Ship page", () => {
  it("is offered when the module has a crew vehicle or a ledger", async () => {
    const { ctx } = await setup();
    expect(hasShipPage(ctx.module, "standard")).toBe(true);
  });

  it("picks the crew's vehicle and shows its stats and lists from the module's declaration", async () => {
    const { ctx, wagon } = await setup();
    render(
      <Harness ctx={ctx}>
        <ShipPage />
      </Harness>,
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Wagon");
    const picker = screen.getByTestId("ship-picker");
    act(() => {
      fireEvent.change(picker, { target: { value: wagon.id } });
    });
    expect(ctx.store.meta().settings["wagon"]).toBe(wagon.id);
    const card = screen.getByTestId("ship-card");
    expect(within(card).getByRole("heading", { name: "Old Bess" })).toBeTruthy();
    expect(card.querySelector('[data-stat="loadLimit"]')?.textContent).toContain("20");
    expect(card.querySelector('[data-stat="food"]')?.textContent).toContain("10");
    expect(within(card).getByText("Salt")).toBeTruthy();
  });

  it("adds ledger entries, signs them by category and sums the balance", async () => {
    const { ctx, wagon } = await setup();
    ctx.store.updateMeta({ settings: { wagon: wagon.id } });
    render(
      <Harness ctx={ctx}>
        <ShipPage />
      </Harness>,
    );
    expect(screen.getByTestId("funds-balance").textContent).toBe("0 sp");
    const form = screen.getByTestId("ledger-add");
    const add = (category: string, amount: string, note: string) =>
      act(() => {
        fireEvent.change(within(form).getByRole("combobox", { name: "Entry category" }), { target: { value: category } });
        fireEvent.change(within(form).getByRole("textbox", { name: "Amount" }), { target: { value: amount } });
        fireEvent.change(within(form).getByRole("textbox", { name: "Note" }), { target: { value: note } });
        fireEvent.click(screen.getByTestId("ledger-add-submit"));
      });
    add("reward", "50", "Bounty");
    add("repairs", "12", "New wheel");
    expect(screen.getByTestId("funds-balance").textContent).toBe("38 sp");
    expect(ledgerBalance(ctx.store)).toBe(38);
    const rows = screen.getAllByTestId("ledger-row");
    expect(rows.map((r) => r.getAttribute("data-category"))).toEqual(["reward", "repairs"]);
    expect(rows[1]!.textContent).toContain("−12 sp");
    expect(rows[1]!.textContent).toContain("38 sp");
    expect(ctx.store.list("ledger").find((e) => e.note === "New wheel")).toMatchObject({ amount: -12, inWorldDate: "1000-01-28", links: { ship: wagon.id } });
    // filter by category
    act(() => {
      fireEvent.change(screen.getByTestId("ledger-filter"), { target: { value: "repairs" } });
    });
    expect(screen.getAllByTestId("ledger-row")).toHaveLength(1);
  });

  it("plans a trip with the module rule and departs: the date moves and the arrival is logged", async () => {
    const { ctx, wagon, home, fair } = await setup();
    ctx.store.updateMeta({ settings: { wagon: wagon.id, here: home.id } });
    render(
      <Harness ctx={ctx}>
        <ShipPage />
      </Harness>,
    );
    act(() => {
      fireEvent.change(screen.getByTestId("travel-destination"), { target: { value: fair.id } });
      fireEvent.change(screen.getByTestId("travel-distance"), { target: { value: "20" } });
    });
    expect(screen.getByTestId("travel-days").textContent).toBe("3 days");
    expect(screen.getByTestId("travel-checks").textContent).toContain("Breakdown roll");
    act(() => {
      fireEvent.click(screen.getByTestId("depart"));
    });
    expect(screen.getByTestId("campaign-date").textContent).toBe("1000-02-01");
    expect(ctx.store.meta().settings["here"]).toBe(fair.id);
    expect(screen.getByTestId("travel-planner").textContent).toContain("on the road");
    expect(ctx.store.get("entities", wagon.id)?.fields.food).toBe(4);
    const [leg] = ctx.store.list("travel");
    expect(leg).toMatchObject({ from: home.id, to: fair.id, days: 3, distance: 20, status: "arrived", departDate: "1000-01-28", arriveDate: "1000-02-01" });
    expect(screen.getByTestId("travel-log").textContent).toContain("Fairhaven");
  });
});

describe("Payout button", () => {
  it("posts the entity's payout once and then shows it as paid", async () => {
    const { ctx, fair } = await setup();
    render(
      <Harness ctx={ctx}>
        <PayoutButton entity={fair} />
      </Harness>,
    );
    const button = screen.getByTestId("payout");
    expect(button.textContent).toContain("Collect bounty (300 sp)");
    act(() => {
      fireEvent.click(button);
    });
    expect(screen.getByTestId("payout-posted").textContent).toBe("Paid 300 sp");
    expect(ledgerBalance(ctx.store)).toBe(300);
    const payout = ctx.module.module.ledger!.payouts![0]!;
    expect(postPayout(ctx, ctx.store.get("entities", fair.id)!, payout).duplicate).toBe(true);
    expect(ctx.store.count("ledger")).toBe(1);
  });
});

describe("entity inputs (x-entity)", () => {
  it("pre-fill from the campaign setting and from the page's pick, as snapshots", async () => {
    const { ctx, wagon, fair } = await setup();
    ctx.store.updateMeta({ settings: { wagon: wagon.id } });
    const proc = {
      id: "p",
      name: "P",
      steps: [],
      produce: () => ({ entities: [], relationships: [] }),
      inputs: { type: "object", properties: { wagon: { type: "object", "x-entity": { types: ["example.wagon"], setting: "wagon" } }, place: { type: "object", "x-entity": { types: ["example.place"] } } } },
    } as unknown as Procedure;
    const inputs = initialInputs(proc, ctx.store, ctx.module);
    expect(inputs.wagon).toEqual({ id: wagon.id, name: "Old Bess", type: "example.wagon", fields: wagon.fields });
    expect(inputs.place).toBeUndefined();
    expect(pickedInputs(proc, ctx.store, `place:${fair.id},wagon:nope`)).toEqual({ place: { id: fair.id, name: "Fairhaven", type: "example.place", fields: fair.fields } });
  });
});
