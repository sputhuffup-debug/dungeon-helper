import "fake-indexeddb/auto";
import type { Id } from "@campaign-forge/core";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CampaignContext, openCampaign, type CampaignContextValue } from "../../state/CampaignProvider";
import { runFromEntity } from "../../state/sourceActions";
import { loadDemoCampaign, markScene, startPlannedSession } from "../../state/tableActions";
import { CloseSourcesStep, useSessionSources } from "../sessions/CloseSources";
import { TableRecap } from "./TableRecap";

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  Link: ({ children, className, ...rest }: { children?: ReactNode; className?: string; "data-testid"?: string }) => (
    <a className={className} data-testid={rest["data-testid"]}>
      {children}
    </a>
  ),
}));

const opened: Array<() => void> = [];
afterEach(() => {
  cleanup();
  while (opened.length) opened.pop()?.();
});

async function skyfire(): Promise<{ ctx: CampaignContextValue; sessionId: Id }> {
  const id = await loadDemoCampaign();
  const ctx = await openCampaign(id);
  opened.push(ctx.close);
  return { ctx, sessionId: ctx.store.list("sessions").find((s) => s.number === 2)!.id };
}

const Harness = ({ ctx, children }: { ctx: CampaignContextValue; children: ReactNode }) => <CampaignContext.Provider value={ctx}>{children}</CampaignContext.Provider>;

describe("the recap at the top of the table", () => {
  it("shows session 2's read-aloud, puts it on the player screen, and goes away once a scene is run", async () => {
    const { ctx, sessionId } = await skyfire();
    startPlannedSession(ctx, sessionId);
    const view = render(
      <Harness ctx={ctx}>
        <TableRecap sessionId={sessionId} />
      </Harness>,
    );
    const card = screen.getByTestId("table-recap");
    expect(card.textContent).toContain("Previously on…");
    expect(screen.getByTestId("table-recap-lines").textContent).toContain("Mara Quill");
    fireEvent.click(screen.getByTestId("table-recap-show"));
    expect(ctx.store.get("sessions", sessionId)!.recap!.shown).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("table-recap-show").textContent).toBe("Hide from the players"));
    const scene = ctx.store.list("scenes")[0]!;
    markScene(ctx, sessionId, scene.id, "run");
    view.rerender(
      <Harness ctx={ctx}>
        <TableRecap sessionId={sessionId} />
      </Harness>,
    );
    await waitFor(() => expect(screen.queryByTestId("table-recap")).toBeNull());
  });

  it("offers to build a recap when there is none yet, and stays dismissed", async () => {
    const { ctx, sessionId } = await skyfire();
    ctx.store.update("sessions", sessionId, { recap: undefined });
    render(
      <Harness ctx={ctx}>
        <TableRecap sessionId={sessionId} />
      </Harness>,
    );
    fireEvent.click(screen.getByTestId("table-recap-build"));
    await waitFor(() => expect(ctx.store.get("sessions", sessionId)!.recap).toBeDefined());
    await waitFor(() => expect(screen.getByTestId("table-recap-show")).toBeTruthy());
    fireEvent.click(screen.getByTestId("table-recap-dismiss"));
    await waitFor(() => expect(screen.queryByTestId("table-recap")).toBeNull());
  });
});

function CloseStep({ sessionId }: { sessionId: Id }) {
  const sources = useSessionSources(sessionId);
  return <CloseSourcesStep sessionId={sessionId} sources={sources} />;
}

describe("Close the job in the wrap-up", () => {
  it("lists the job, closes it as done, marks its adventure done, collects the pay with an undo", async () => {
    const { ctx, sessionId } = await skyfire();
    const job = ctx.store.list("entities").find((e) => e.type === "alien.job" && e.fields.status === "accepted")!;
    const { adventure } = await runFromEntity(ctx, job.id, "campaign");
    render(
      <Harness ctx={ctx}>
        <CloseStep sessionId={sessionId} />
      </Harness>,
    );
    const card = screen.getAllByTestId("close-source").find((c) => c.getAttribute("data-entity") === job.id)!;
    expect(card.textContent).toContain(job.name);
    expect(card.textContent).toContain("open");
    fireEvent.click(card.querySelector('[data-testid="close-outcome-done"]')!);
    expect(ctx.store.get("entities", job.id)!.fields.status).toBe("done");
    expect(ctx.store.get("adventures", adventure.id)!.status).toBe("done");
    // the job stays listed with its outcome
    await waitFor(() => expect(screen.getAllByTestId("close-source").find((c) => c.getAttribute("data-entity") === job.id)!.textContent).toContain("Done"));
    const again = () => screen.getAllByTestId("close-source").find((c) => c.getAttribute("data-entity") === job.id)!;
    fireEvent.click(again().querySelector('[data-testid="payout"]')!);
    await waitFor(() => expect(again().querySelector('[data-testid="payout-posted"]')).not.toBeNull());
    expect(ctx.store.list("ledger").filter((e) => e.key === `job-payment:${job.id}`)).toHaveLength(1);
    fireEvent.click(again().querySelector('[data-testid="payout-undo"]')!);
    await waitFor(() => expect(again().querySelector('[data-testid="payout"]')).not.toBeNull());
    expect(ctx.store.list("ledger").filter((e) => e.key === `job-payment:${job.id}`)).toHaveLength(0);
    // the between-jobs link carries the job
    expect(again().querySelector('[data-testid="close-between-jobs"]')!.textContent).toContain(`Run between jobs for ${job.name}`);
  });
});
