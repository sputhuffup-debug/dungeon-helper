import "fake-indexeddb/auto";
import type { Id } from "@campaign-forge/core";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CampaignContext, openCampaign, type CampaignContextValue } from "../../state/CampaignProvider";
import { loadDemoCampaign, markScene, startPlannedSession } from "../../state/tableActions";
import { wrapUpDraftOf } from "../../state/wrapUpActions";
import { WrapUpWizard } from "./WrapUp";

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

async function running(): Promise<{ ctx: CampaignContextValue; sessionId: Id }> {
  const id = await loadDemoCampaign();
  const ctx = await openCampaign(id);
  opened.push(ctx.close);
  const sessionId = ctx.store.list("sessions").find((s) => s.number === 2)!.id;
  startPlannedSession(ctx, sessionId);
  return { ctx, sessionId };
}

const wizard = (ctx: CampaignContextValue, sessionId: Id) => (
  <CampaignContext.Provider value={ctx}>
    <WrapUpWizard sessionId={sessionId} onDone={() => undefined} />
  </CampaignContext.Provider>
);
const summaryBox = () => screen.getByRole("textbox", { name: "Session summary" }) as HTMLTextAreaElement;

describe("the wrap-up wizard keeps what the GM typed", () => {
  it("drafts an empty summary from the log (marked as a draft), autosaves edits, and shows them again after leaving", async () => {
    const { ctx, sessionId } = await running();
    const scene = ctx.store.list("scenes").find((s) => s.title)!;
    markScene(ctx, sessionId, scene.id, "run");

    const first = render(wizard(ctx, sessionId));
    await waitFor(() => expect(summaryBox().value).toContain("The crew played one scene"), { timeout: 8000 });
    expect(screen.getByTestId("summary-drafted").textContent).toBe("Draft");

    fireEvent.change(summaryBox(), { target: { value: "The crew got the ore out, short one crate." } });
    expect(screen.queryByTestId("summary-drafted")).toBeNull();
    // the step they were on is kept too
    fireEvent.click(screen.getByRole("button", { name: /^Next: End-of-session questions/ }));
    await waitFor(() => expect(wrapUpDraftOf(ctx.store.get("sessions", sessionId))).toMatchObject({ summary: "The crew got the ore out, short one crate.", step: "prompts" }), { timeout: 8000 });
    expect(wrapUpDraftOf(ctx.store.get("sessions", sessionId)).summaryDrafted).toBeUndefined();
    first.unmount();

    render(wizard(ctx, sessionId));
    // back on the questions step, where they left
    expect(screen.getByRole("button", { name: /End-of-session questions/ }).getAttribute("aria-current")).toBe("step");
    fireEvent.click(screen.getByRole("button", { name: /Summary$/ }));
    expect(summaryBox().value).toBe("The crew got the ore out, short one crate.");
    expect(screen.queryByTestId("summary-drafted")).toBeNull();
  });

  it("saves the loose ends on leaving, even before the pause", async () => {
    const { ctx, sessionId } = await running();
    const view = render(wizard(ctx, sessionId));
    fireEvent.click(screen.getByRole("button", { name: /Loose ends$/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "Loose ends" }), { target: { value: "Who wants the crate?" } });
    view.unmount();
    expect(wrapUpDraftOf(ctx.store.get("sessions", sessionId)).looseEnds).toBe("Who wants the crate?");
    render(wizard(ctx, sessionId));
    expect((screen.getByRole("textbox", { name: "Loose ends" }) as HTMLTextAreaElement).value).toBe("Who wants the crate?");
  });
});
