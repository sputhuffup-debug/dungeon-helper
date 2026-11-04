/**
 * After a job: Home says there is no active adventure (and links the done
 * ones) rather than "No adventures yet", the job board card shows the pay in
 * the module's money, the between-jobs clock box shows what the run moved
 * (not the next roll's preview), and a scene's Clues picker makes a new clue
 * when none fits.
 */
import "fake-indexeddb/auto";
import { applyArcTicks, planArcTicks, type ClockMove } from "@campaign-forge/core";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCampaign, createEntity } from "../../state/actions";
import { CampaignContext, openCampaign, type CampaignContextValue } from "../../state/CampaignProvider";
import { loadDemoCampaign } from "../../state/tableActions";
import { ArcClockTicker } from "../arcs/ArcClockTicker";
import { EntityListInput } from "../adventures/fields";
import { HomePage } from "./HomePage";

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  Link: ({ children, className, ...rest }: { children?: ReactNode; className?: string; "data-testid"?: string }) => (
    <a className={className} data-testid={rest["data-testid"]}>
      {children}
    </a>
  ),
  useNavigate: () => () => undefined,
}));

const opened: Array<() => void> = [];
afterEach(() => {
  cleanup();
  while (opened.length) opened.pop()?.();
});

async function open(id: string): Promise<CampaignContextValue> {
  const ctx = await openCampaign(id);
  opened.push(ctx.close);
  return ctx;
}
const Harness = ({ ctx, children }: { ctx: CampaignContextValue; children: ReactNode }) => <CampaignContext.Provider value={ctx}>{children}</CampaignContext.Provider>;

describe("Home after a job", () => {
  it("says no adventure is active and links the done one; the job card's pay is in dollars", async () => {
    const ctx = await open(await createCampaign({ name: "After", moduleId: "alien", mode: "campaign" }));
    ctx.store.createAdventure({ title: "The haul", status: "done" });
    createEntity(ctx, { type: "alien.job", name: "Technical Parts", fields: { status: "done", jobType: "job", distance: 5, difficulty: 3, payment: 24000 } });
    render(
      <Harness ctx={ctx}>
        <HomePage />
      </Harness>,
    );
    expect(screen.queryByText("No adventures yet.")).toBeNull();
    expect(screen.getByTestId("home-adventures-none-active").textContent).toBe("No active adventures. 1 done.");
    const card = within(screen.getByRole("region", { name: "Job board" })).getByText("Technical Parts").closest("a")!;
    expect(card.textContent).toContain("Payment $24,000");
    expect(card.textContent).not.toContain("($)");
  }, 30_000);
});

describe("the between-jobs clock box once accepted", () => {
  it("shows the moves the run made, not a preview of the next roll", async () => {
    const ctx = await open(await loadDemoCampaign());
    const def = ctx.module.module.arcs!;
    const plan = planArcTicks({ arcs: Object.fromEntries(ctx.store.list("arcs").map((t) => [t.id, t])) }, def, "moved");
    expect(plan.length).toBeGreaterThan(0);
    const moved: ClockMove[] = applyArcTicks(ctx.store, plan);
    render(
      <Harness ctx={ctx}>
        <ArcClockTicker def={def} linked={{ seed: "next-preview", onReroll: () => undefined, include: true, onInclude: () => undefined, moved }} />
      </Harness>,
    );
    const rows = screen.getAllByTestId("arc-moved-row");
    expect(rows).toHaveLength(moved.length);
    expect(rows[0]!.textContent).toContain(`${moved[0]!.from}/${moved[0]!.thread.clock.segments} → ${moved[0]!.to}`);
    expect(screen.queryAllByTestId("arc-tick")).toEqual([]);
  }, 30_000);
});

describe("a scene's Clues picker", () => {
  it("makes a new clue named by the search and adds it, when none fits", async () => {
    const ctx = await open(await createCampaign({ name: "Clues", moduleId: "alien", mode: "campaign" }));
    const picked: string[][] = [];
    render(
      <Harness ctx={ctx}>
        <EntityListInput value={[]} types={["alien.clue"]} label="Clue" create="alien.clue" onChange={(ids) => picked.push(ids)} />
      </Harness>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add clue" }));
    expect(screen.getByText(/Make a new clue here/)).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search entities" }), { target: { value: "Bloody handprint" } });
    fireEvent.click(screen.getByTestId("picker-create"));
    expect(picked).toHaveLength(1);
    const made = ctx.store.get("entities", picked[0]![0]!)!;
    expect(made).toMatchObject({ type: "alien.clue", name: "Bloody handprint", visibility: { level: "gm" } });
  }, 30_000);
});
