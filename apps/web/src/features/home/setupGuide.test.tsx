import "fake-indexeddb/auto";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addPlayer, setCharacterOwner } from "@campaign-forge/core";
import { createCampaign, createEntity } from "../../state/actions";
import { CampaignContext, openCampaign, type CampaignContextValue } from "../../state/CampaignProvider";
import { setupLinkTarget, setupOf } from "../../state/setupActions";
import { initialInputs } from "../generate/prefill";
import { SetupGuide } from "./SetupGuide";

// The guide links to other routes; outside a router a plain anchor does.
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  Link: ({ children, className }: { children?: ReactNode; className?: string }) => <a className={className}>{children}</a>,
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

describe("a new campaign", () => {
  it("starts with the frame asked at creation and the setup guide switched on", async () => {
    const ctx = await open(await createCampaign({ name: "Marines", moduleId: "alien", mode: "campaign", settings: { frame: "colonial-marines" } }));
    expect(ctx.store.meta().settings).toEqual({ frame: "colonial-marines", setupGuide: { show: true } });
    // a cinematic campaign is not asked the frame
    const cine = await open(await createCampaign({ name: "One night", moduleId: "alien", mode: "cinematic", settings: { frame: "colonial-marines" } }));
    expect(cine.store.meta().settings).toEqual({ setupGuide: { show: true } });
  }, 30_000);

  it("feeds the frame to every procedure that asks for one, still changeable per run", async () => {
    const ctx = await open(await createCampaign({ name: "Frontier", moduleId: "alien", mode: "campaign", settings: { frame: "frontier-colonists" } }));
    for (const id of ["alien.job-board", "alien.job.create", "alien.between-jobs"]) {
      expect(initialInputs(ctx.module.procedure(id), ctx.store, ctx.module).frame, id).toBe("frontier-colonists");
    }
    ctx.store.updateMeta({ settings: { ...ctx.store.meta().settings, frame: "space-truckers" } });
    expect(initialInputs(ctx.module.procedure("alien.job-board"), ctx.store, ctx.module).frame).toBe("space-truckers");
  }, 30_000);
});

describe("the setup guide card", () => {
  it("lists the module's steps in order, ticks them from data and highlights the next one", async () => {
    const ctx = await open(await createCampaign({ name: "Haulers", moduleId: "alien", mode: "campaign" }));
    render(
      <Harness ctx={ctx}>
        <SetupGuide setup={setupOf(ctx)} />
      </Harness>,
    );
    const steps = () => within(screen.getByRole("list", { name: "Setup steps" })).getAllByRole("listitem");
    expect(steps().map((li) => li.getAttribute("data-step"))).toEqual([
      "alien.setup.crew",
      "setup.players",
      "alien.setup.ship",
      "alien.setup.home-base",
      "alien.setup.agendas",
      "alien.setup.threads",
      "alien.setup.job",
      "alien.setup.run-job",
    ]);
    expect(screen.getByTestId("setup-progress").textContent).toBe("0 of 8 done");
    const crew = steps()[0]!;
    expect(crew.getAttribute("aria-current")).toBe("step");
    expect([...crew.querySelectorAll("a")].map((a) => a.textContent)).toEqual(["Roll a Life Path", "+ Character"]);
    expect(within(crew).getByText("0 of 4")).toBeTruthy();
    cleanup();

    // two PCs, played by two players: the crew and the players are done, the ship is next
    const pcs = ["Ripley", "Hicks"].map((name) => createEntity(ctx, { type: "alien.character", name, fields: { isPC: true } }));
    pcs.forEach((pc, i) => setCharacterOwner(ctx.store, pc.id, addPlayer(ctx.store, { name: `Player ${i + 1}` }).id));
    render(
      <Harness ctx={ctx}>
        <SetupGuide setup={setupOf(ctx)} />
      </Harness>,
    );
    expect(screen.getByTestId("setup-progress").textContent).toBe("2 of 8 done");
    expect(steps().map((li) => li.getAttribute("data-done"))).toEqual(["true", "true", "false", "false", "false", "false", "false", "false"]);
    expect(steps()[2]!.getAttribute("aria-current")).toBe("step");
  }, 30_000);

  it("hides on 'Hide this' (Settings shows it again)", async () => {
    const ctx = await open(await createCampaign({ name: "Hide", moduleId: "example" }));
    render(
      <Harness ctx={ctx}>
        <SetupGuide setup={setupOf(ctx)} />
      </Harness>,
    );
    act(() => {
      fireEvent.click(screen.getByTestId("setup-hide"));
    });
    expect(ctx.store.meta().settings.setupGuide).toEqual({ show: false });
  }, 30_000);

  it("links a step to its page, procedure, new entity or entity", () => {
    expect(setupLinkTarget({ label: "PCs", page: "atlas", params: { tab: "pcs" } }, "C1")).toEqual({ to: "/c/$campaignId/atlas", params: { campaignId: "C1" }, search: { tab: "pcs" } });
    expect(setupLinkTarget({ label: "Roll", procedure: "x.proc" }, "C1")).toEqual({ to: "/c/$campaignId/generate/$procedureId", params: { campaignId: "C1", procedureId: "x.proc" }, search: {} });
    expect(setupLinkTarget({ label: "+ PC", newEntity: { type: "x.pc", pc: true } }, "C1")).toEqual({ to: "/c/$campaignId/entities/new", params: { campaignId: "C1" }, search: { type: "x.pc", pc: 1 } });
    expect(setupLinkTarget({ label: "Open", entity: true, entityId: "E1" }, "C1")).toEqual({ to: "/c/$campaignId/entities/$entityId", params: { campaignId: "C1", entityId: "E1" }, search: {} });
  });
});
