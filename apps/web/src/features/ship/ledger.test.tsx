/**
 * Per-PC accounts read the PC sheet's cash (the module's `accountField`): a
 * PC with $700 on the sheet shows $700, filtering the ledger by that PC
 * starts its running balance there, and an entry posted to the PC moves the
 * sheet's cash, so the money is never counted twice.
 */
import "fake-indexeddb/auto";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createCampaign, createEntity } from "../../state/actions";
import { CampaignContext, openCampaign, type CampaignContextValue } from "../../state/CampaignProvider";
import { FundsSummary, LedgerCard } from "./Ledger";

const opened: Array<() => void> = [];
afterEach(() => {
  cleanup();
  while (opened.length) opened.pop()?.();
});

let campaignId: string;
beforeAll(async () => {
  campaignId = await createCampaign({ name: "Cash", moduleId: "alien", mode: "campaign" });
}, 30_000);

const Harness = ({ ctx, children }: { ctx: CampaignContextValue; children: ReactNode }) => <CampaignContext.Provider value={ctx}>{children}</CampaignContext.Provider>;

describe("personal accounts and sheet cash", () => {
  it("shows each PC's sheet cash, starts a PC's ledger from it, and moves the sheet when an entry is posted to the PC", async () => {
    const ctx = await openCampaign(campaignId);
    opened.push(ctx.close);
    const def = ctx.module.module.ledger!;
    const dana = createEntity(ctx, { type: "alien.character", name: "Dana", fields: { isPC: true, cash: 700 } });
    createEntity(ctx, { type: "alien.character", name: "An NPC", fields: { isPC: false, cash: 50 } });
    render(
      <Harness ctx={ctx}>
        <FundsSummary def={def} />
        <LedgerCard def={def} />
      </Harness>,
    );
    const account = () => within(screen.getByRole("list", { name: "Personal accounts" })).getAllByRole("listitem").map((li) => li.textContent);
    expect(account()).toEqual(["Dana$700"]);
    expect(screen.getByTestId("funds-balance").textContent).toBe("$0");

    // the ledger for Dana alone: what the sheet holds before any entry
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by account" }), { target: { value: dana.id } });
    expect(screen.getByTestId("ledger-opening").textContent).toContain("$700");

    // pay Dana $300 from the form: the sheet moves, the account reads the sheet, the crew funds do not change
    const form = screen.getByTestId("ledger-add");
    fireEvent.change(within(form).getByRole("combobox", { name: "Entry category" }), { target: { value: "salary" } });
    fireEvent.change(within(form).getByRole("textbox", { name: "Amount" }), { target: { value: "300" } });
    fireEvent.change(within(form).getByRole("combobox", { name: "Account" }), { target: { value: dana.id } });
    fireEvent.click(within(form).getByTestId("ledger-add-submit"));
    expect(ctx.store.get("entities", dana.id)!.fields.cash).toBe(1000);
    expect(account()).toEqual(["Dana$1,000"]);
    expect(screen.getByTestId("funds-balance").textContent).toBe("$0");
    const rows = screen.getAllByTestId("ledger-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.textContent).toContain("$1,000");

    // deleting the entry takes the money back off the sheet
    fireEvent.click(within(rows[0]!).getByRole("button", { name: /Delete entry/ }));
    expect(ctx.store.get("entities", dana.id)!.fields.cash).toBe(700);
    expect(account()).toEqual(["Dana$700"]);
  });
});
