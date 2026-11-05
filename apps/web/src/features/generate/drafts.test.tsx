/**
 * The workbench's drafts: a deal is kept as soon as it is dealt (the GM may
 * have read it to the table, so coming back shows the same deal), a kept
 * draft that reopens after the campaign changed says so and reads it again
 * on request, an old draft from before drafts kept their campaign is read
 * afresh with its seed, "New deal" starts the draft's age over, and the
 * pinned-slots badge counts only the GM's pins.
 */
import "fake-indexeddb/auto";
import { generatorDraftOf, saveGeneratorDraft } from "@campaign-forge/core";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCampaign, createEntity } from "../../state/actions";
import { CampaignContext, openCampaign, type CampaignContextValue } from "../../state/CampaignProvider";
import { campaignContext, changedContext, initialInputs, rereadInputs } from "./prefill";
import { ProcedurePage } from "./ProcedurePage";

const nav = vi.hoisted(() => ({ procedureId: "alien.job.create", search: {} as Record<string, unknown>, navigate: vi.fn() }));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  Link: ({ children, className }: { children?: ReactNode; className?: string }) => <a className={className}>{children}</a>,
  useParams: () => ({ procedureId: nav.procedureId }),
  useSearch: () => nav.search,
  useNavigate: () => nav.navigate,
}));

const opened: Array<() => void> = [];
afterEach(() => {
  cleanup();
  nav.navigate.mockReset();
  nav.search = {};
  while (opened.length) opened.pop()?.();
});

const JOB = "alien.job.create";

async function campaign(pcs: string[]): Promise<CampaignContextValue> {
  const ctx = await openCampaign(await createCampaign({ name: "Drafts", moduleId: "alien", mode: "campaign" }));
  opened.push(ctx.close);
  for (const name of pcs) createEntity(ctx, { type: "alien.character", name, fields: { isPC: true } });
  return ctx;
}

function page(ctx: CampaignContextValue) {
  return render(
    <CampaignContext.Provider value={ctx}>
      <ProcedurePage />
    </CampaignContext.Provider>,
  );
}

const seed = () => (screen.getByTestId("seed") as HTMLInputElement).value;
const pcs = () => (screen.getByLabelText("PCs") as HTMLInputElement).value;

describe("the workbench keeps a deal as soon as it is dealt", () => {
  // Walkthrough 3 (A3): a deal nobody changed used to be dropped on leaving, so a board read out at the table came back different.
  it("keeps an untouched deal with the campaign it read; the next visit reopens the same deal; a change is saved too", async () => {
    const ctx = await campaign(["Rhea", "Dov", "Sefa"]);
    page(ctx);
    const dealt = seed();
    await waitFor(() => expect(generatorDraftOf(ctx.store, JOB)?.seed).toBe(dealt));
    expect(screen.getByTestId("draft-status").getAttribute("data-state")).toBe("saved");
    expect(generatorDraftOf(ctx.store, JOB)?.context?.pcCount).toBeTruthy();
    cleanup();

    // the next visit: the same deal, said so
    page(ctx);
    expect(seed()).toBe(dealt);
    expect(screen.getByTestId("draft-note").textContent).toContain("as you left it");
    fireEvent.click(screen.getByTestId("new-seed"));
    expect(seed()).not.toBe(dealt);
    await waitFor(() => expect(generatorDraftOf(ctx.store, JOB)?.seed).toBe(seed()));
  }, 30_000);

  it("reopened after the campaign changed: says what changed and reads it again on request, same seed", async () => {
    const ctx = await campaign(["Rhea", "Dov", "Sefa"]);
    page(ctx);
    await waitFor(() => expect(generatorDraftOf(ctx.store, JOB)).toBeDefined());
    const kept = seed();
    expect(pcs()).toBe("3");
    cleanup();

    // a fourth PC joins
    createEntity(ctx, { type: "alien.character", name: "Lark", fields: { isPC: true } });
    page(ctx);
    expect(seed()).toBe(kept);
    expect(pcs()).toBe("3");
    expect(screen.getByTestId("draft-note").textContent).toContain("as you left it");
    expect(screen.getByTestId("draft-stale").textContent).toContain("The campaign changed since this was dealt (PCs)");
    fireEvent.click(screen.getByTestId("draft-reread"));
    expect(pcs()).toBe("4");
    expect(seed()).toBe(kept);
    expect(screen.queryByTestId("draft-stale")).toBeNull();
    await waitFor(() => expect(generatorDraftOf(ctx.store, JOB)?.inputs.pcCount).toBe(4));
    cleanup();

    // reopened again: nothing changed since the re-read
    page(ctx);
    expect(screen.queryByTestId("draft-stale")).toBeNull();
  }, 30_000);

  it("an old draft from before drafts kept their campaign is read afresh with its seed, and kept again with the campaign it read", async () => {
    const ctx = await campaign(["Rhea", "Dov", "Sefa"]);
    // kept the old way: dealt when the campaign had no PCs, never changed
    const procedure = ctx.module.procedure(JOB)!;
    saveGeneratorDraft(ctx.store, { procedure: JOB, moduleId: "alien", moduleVersion: ctx.module.manifest.version, seed: "old-seed", inputs: { ...initialInputs(procedure, ctx.store, ctx.module), pcCount: 4 } });
    page(ctx);
    expect(seed()).toBe("old-seed");
    expect(pcs()).toBe("3");
    expect(screen.queryByTestId("draft-note")).toBeNull();
    await waitFor(() => expect(generatorDraftOf(ctx.store, JOB)?.context).toBeDefined());
    expect(generatorDraftOf(ctx.store, JOB)).toMatchObject({ seed: "old-seed", inputs: { pcCount: 3 } });
  }, 30_000);

  it("New deal drops the deal on the page, so the next kept draft is dated from then", async () => {
    const ctx = await campaign(["Rhea"]);
    page(ctx);
    await waitFor(() => expect(generatorDraftOf(ctx.store, JOB)).toBeDefined());
    const before = generatorDraftOf(ctx.store, JOB)!;
    await act(async () => new Promise((r) => setTimeout(r, 20)));
    fireEvent.click(screen.getByTestId("new-deal"));
    expect(generatorDraftOf(ctx.store, JOB)).toBeUndefined();
    const deal = nav.navigate.mock.calls.at(-1)?.[0] as { search: { deal: string } };
    expect(deal.search.deal).toBeTruthy();
    cleanup();

    // the fresh deal the address asked for: kept at once, a new draft with its own age
    nav.search = { deal: deal.search.deal };
    page(ctx);
    // the consumed nonce is dropped from the address at once
    expect(nav.navigate.mock.calls.at(-1)?.[0]).toMatchObject({ replace: true, search: {} });
    await waitFor(() => expect(generatorDraftOf(ctx.store, JOB)).toBeDefined());
    expect(generatorDraftOf(ctx.store, JOB)?.seed).toBe(seed());
    const after = generatorDraftOf(ctx.store, JOB)!;
    expect(after.id).not.toBe(before.id);
    expect(after.created > before.created).toBe(true);
  }, 30_000);
});

describe("the campaign a draft read", () => {
  it("fingerprints the campaign-filled inputs, names the changed ones and reads them again keeping per-PC choices", async () => {
    const ctx = await campaign(["Rhea", "Dov"]);
    const agendas = ctx.module.procedure("alien.campaign-agendas")!;
    const settings = ctx.store.meta().settings ?? {};
    const before = initialInputs(agendas, ctx.store, ctx.module);
    const was = campaignContext(agendas, before, settings);
    expect(changedContext(agendas, was, campaignContext(agendas, before, settings))).toEqual([]);
    // the GM locks Rhea's goal, then Sefa joins the crew
    const chars = before.pcs as Array<Record<string, unknown>>;
    const edited = { ...before, pcs: chars.map((c) => (c.name === "Rhea" ? { ...c, goal: "ship" } : c)) };
    createEntity(ctx, { type: "alien.character", name: "Sefa", fields: { isPC: true } });
    const now = initialInputs(agendas, ctx.store, ctx.module);
    const changed = changedContext(agendas, was, campaignContext(agendas, now, settings)).map((c) => c.key);
    expect(changed).toContain("pcs");
    const reread = rereadInputs(agendas, edited, now, settings);
    const names = (reread.pcs as Array<{ name: string; goal?: string }>).map((c) => [c.name, c.goal]);
    expect(names.map((n) => n[0])).toEqual(["Dov", "Rhea", "Sefa"]);
    expect(names.find((n) => n[0] === "Rhea")?.[1]).toBe("ship");
  }, 30_000);
});

describe("a job board's pins", () => {
  it("counts the slots the GM pinned, not a posting taken (which stays pinned on its own)", async () => {
    const ctx = await campaign(["Rhea"]);
    nav.procedureId = "alien.job-board";
    try {
      page(ctx);
      const cards = () => screen.getAllByTestId("offer-card");
      fireEvent.click(cards()[0]!.querySelector<HTMLButtonElement>('[data-testid="offer-accept"]')!);
      await waitFor(() => expect(cards()[0]!.getAttribute("data-state")).toBe("accept"), { timeout: 10_000 });
      expect(generatorDraftOf(ctx.store, "alien.job-board")?.offers).toBeDefined();
      expect(screen.queryByTestId("pinned-slots")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Pin posting 2" }));
      expect(screen.getByTestId("pinned-slots").textContent).toBe("1 slot pinned");
    } finally {
      nav.procedureId = JOB;
    }
  }, 30_000);
});
