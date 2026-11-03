import "fake-indexeddb/auto";
import { checklistStateOf, threadsInOrder, type Id } from "@campaign-forge/core";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CampaignContext, openCampaign, type CampaignContextValue } from "../../state/CampaignProvider";
import { loadDemoCampaign } from "../../state/tableActions";
import { PlayerScreen } from "../table/PlayerScreen";
import { RecapCard } from "./RecapCard";

const opened: Array<() => void> = [];
afterEach(() => {
  cleanup();
  while (opened.length) opened.pop()?.();
});

async function skyfire(): Promise<{ ctx: CampaignContextValue; sessionId: Id }> {
  const id = await loadDemoCampaign();
  const ctx = await openCampaign(id);
  opened.push(ctx.close);
  const sessionId = ctx.store.list("sessions").find((s) => s.number === 2)!.id;
  return { ctx, sessionId };
}

function Card({ ctx, sessionId }: { ctx: CampaignContextValue; sessionId: Id }) {
  return (
    <CampaignContext.Provider value={ctx}>
      <RecapCard session={ctx.store.get("sessions", sessionId)!} />
    </CampaignContext.Provider>
  );
}

describe("the recap card", () => {
  it("shows the demo's recap for session 2, switches a line off, keeps it off on regenerate, and shows the read-aloud on the player screen", async () => {
    const { ctx, sessionId } = await skyfire();
    const gmTitle = threadsInOrder(ctx.store.list("arcs"))[0]!.title;
    const view = render(<Card ctx={ctx} sessionId={sessionId} />);
    const card = screen.getByTestId("recap-card");
    expect(card.textContent).toContain("Since last session · Session 1");
    const gm = within(card).getByTestId("recap-gm");
    expect(gm.textContent).toContain(gmTitle);
    expect(gm.textContent).toContain("What the players don't know");

    // switch the first loose end off
    const loose = within(gm).getByRole("region", { name: "Loose ends" });
    const line = within(loose).getAllByTestId("recap-line")[0]!;
    const text = within(line).getByTestId("recap-line-text").textContent!;
    fireEvent.click(within(line).getByRole("checkbox"));
    const stored = () => ctx.store.get("sessions", sessionId)!.recap!.gm.find((s) => s.id === "loose-ends")!.lines[0]!;
    expect(stored()).toMatchObject({ text, off: true });
    view.rerender(<Card ctx={ctx} sessionId={sessionId} />);
    fireEvent.click(screen.getByTestId("recap-regenerate"));
    await waitFor(() => expect(screen.getByTestId("recap-regenerate").textContent).toBe("Regenerate"));
    expect(stored()).toMatchObject({ text, off: true });

    // the read-aloud tab, then show it on the player screen (ticks "Start with a recap")
    view.rerender(<Card ctx={ctx} sessionId={sessionId} />);
    fireEvent.click(screen.getByRole("tab", { name: /Read-aloud/ }));
    const players = screen.getByTestId("recap-players");
    expect(players.textContent).toContain("Session 1: The offer, played 7 Nov 2026.");
    expect(players.textContent).not.toContain(gmTitle);
    fireEvent.click(screen.getByTestId("recap-show"));
    expect(ctx.store.get("sessions", sessionId)!.recap!.shown).toBeTruthy();
    expect(checklistStateOf(ctx.store.get("sessions", sessionId))["play.recap"]).toBe(true);

    cleanup();
    render(
      <CampaignContext.Provider value={ctx}>
        <PlayerScreen sessionId={sessionId} />
      </CampaignContext.Provider>,
    );
    await act(async () => undefined);
    const read = screen.getByTestId("player-recap");
    expect(read.textContent).toContain("Previously on Skyfire Down");
    expect(read.textContent).toContain("Mara Quill");
    const screenText = screen.getByTestId("player-screen").textContent!;
    expect(screenText).not.toContain(gmTitle);
    expect(screenText).not.toContain("What the players don't know");
    expect(screenText).not.toContain(text);
  });

  it("is not on the player screen until the GM shows it", async () => {
    const { ctx, sessionId } = await skyfire();
    render(
      <CampaignContext.Provider value={ctx}>
        <PlayerScreen sessionId={sessionId} />
      </CampaignContext.Provider>,
    );
    await act(async () => undefined);
    expect(screen.queryByTestId("player-recap")).toBeNull();
  });
});
