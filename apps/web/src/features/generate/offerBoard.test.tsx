import "fake-indexeddb/auto";
import { generatorDraftOf } from "@campaign-forge/core";
import type { OfferDef } from "@campaign-forge/module-sdk";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CampaignContext, openCampaign, type CampaignContextValue } from "../../state/CampaignProvider";
import { writeDraft } from "../../state/draftActions";
import { offersOf } from "../../state/offerActions";
import { loadDemoCampaign } from "../../state/tableActions";
import { OfferBoard } from "./OfferBoard";
import { initialInputs } from "./prefill";
import { runGenerator } from "./runner";

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

const BOARD = "alien.job-board";
const NO_RUN = { stepSeeds: {}, pinned: {}, partSeeds: {}, pinnedParts: {} };
const controls = { partSeeds: {}, pinnedParts: {}, onReroll: () => undefined, onPin: () => undefined, onUnpin: () => undefined, onRerollOffer: () => undefined };

async function board(): Promise<{ ctx: CampaignContextValue; view: () => ReactNode; marked: string[][] }> {
  const ctx = await openCampaign(await loadDemoCampaign());
  opened.push(ctx.close);
  const procedure = ctx.module.procedure(BOARD)!;
  const inputs = initialInputs(procedure, ctx.store, ctx.module);
  const graph = runGenerator(ctx.module, { procedureId: BOARD, seed: "board-test", inputs });
  const set = offersOf(graph)!;
  writeDraft(ctx, { procedure: BOARD, moduleId: "alien", moduleVersion: ctx.module.manifest.version, seed: "board-test", inputs, offerKeys: set.offers.map((o) => o.key) }, { fresh: true });
  const marked: string[][] = [];
  const view = () => (
    <CampaignContext.Provider value={ctx}>
      <OfferBoard procedure={BOARD} def={procedure.offers as OfferDef} set={set} graph={graph} controls={controls} run={NO_RUN} onMarked={(k) => marked.push(k)} />
    </CampaignContext.Provider>
  );
  return { ctx, view, marked };
}

describe("the job board as a draft", () => {
  it("keeps a taken posting on the board, marked and linked to its job; the others can be kept as leads; the board comes back as it was", async () => {
    const { ctx, view, marked } = await board();
    const first = render(view());
    const cards = () => screen.getAllByTestId("offer-card");
    expect(cards()).toHaveLength(3);
    fireEvent.click(within(cards()[0]!).getByTestId("offer-accept"));
    await waitFor(() => expect(cards()[0]!.getAttribute("data-state")).toBe("accept"), { timeout: 8000 });
    expect(cards()).toHaveLength(3);
    const job = ctx.store.get("entities", generatorDraftOf(ctx.store, BOARD)!.offers![cards()[0]!.getAttribute("data-offer")!]!.record!)!;
    expect(within(cards()[0]!).getByTestId("offer-next").textContent).toBe(`Open the job: ${job.name}`);
    expect(within(cards()[0]!).getByTestId("offer-state").textContent).toBe("Taken");
    expect(within(cards()[0]!).queryByTestId("offer-accept")).toBeNull();
    expect(marked).toEqual([[cards()[0]!.getAttribute("data-offer")]]);
    // the others are still open
    expect(cards()[1]!.getAttribute("data-state")).toBe("open");
    expect(screen.getByTestId("offers-acted").textContent).toContain("1 of 3");

    // discard the third, then keep the other one as a lead (the board's buttons wait until the take has finished)
    await waitFor(() => expect(within(cards()[2]!).getByTestId("offer-discard").hasAttribute("disabled")).toBe(false), { timeout: 8000 });
    fireEvent.click(within(cards()[2]!).getByTestId("offer-discard"));
    await waitFor(() => expect(cards()).toHaveLength(2), { timeout: 8000 });
    fireEvent.click(screen.getByTestId("offers-keep-others"));
    await waitFor(() => expect(cards()[1]!.getAttribute("data-state")).toBe("keep"), { timeout: 8000 });
    expect(screen.queryByTestId("offers-keep-others")).toBeNull();
    first.unmount();

    // leave and come back: the same board, marks and all
    render(view());
    expect(cards().map((c) => c.getAttribute("data-state"))).toEqual(["accept", "keep"]);
    expect(screen.getByTestId("offers-discarded").textContent).toContain("1 posting discarded");
    fireEvent.click(within(screen.getByTestId("offers-discarded")).getByRole("button", { name: "Show again" }));
    await waitFor(() => expect(cards()).toHaveLength(3), { timeout: 8000 });
  });
});
