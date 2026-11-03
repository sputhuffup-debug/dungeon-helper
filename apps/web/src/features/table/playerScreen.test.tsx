/**
 * What the player screen shows is the GM's call: by default only the
 * handouts revealed this session, plus the pinned ones; "Clear the screen"
 * takes the reveals (and the recap and the clue in the spotlight) off, pins
 * stay, Undo puts it back. The leak protections hold whatever is pinned: a
 * GM-kept card or a personal handout never shows. No rulebook page refs.
 */
import "fake-indexeddb/auto";
import { CAMPAIGN_AGENDA_CARD_PURPOSE } from "@campaign-forge/module-alien";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ToastViewport, clearToasts } from "../../components/ui";
import { createCampaign } from "../../state/actions";
import { CampaignContext, openCampaign, type CampaignContextValue } from "../../state/CampaignProvider";
import { clearPlayerScreen, pinHandout, playerScreenHandouts, restorePlayerScreen, revealHandout, setSpotlight } from "../../state/tableActions";
import { PlayerScreen } from "./PlayerScreen";
import { RevealPanel } from "./RevealPanel";

const opened: Array<() => void> = [];
afterEach(() => {
  cleanup();
  clearToasts();
  while (opened.length) opened.pop()?.();
});

let campaignId: string;
beforeAll(async () => {
  campaignId = await createCampaign({ name: "Screen", moduleId: "alien" });
}, 30_000);

async function setup() {
  const ctx = await openCampaign(campaignId);
  opened.push(ctx.close);
  for (const h of ctx.store.list("handouts")) ctx.store.remove("handouts", h.id);
  const ava = ctx.store.createEntity({ type: "alien.character", name: "Ava", fields: { isPC: true } });
  const last = ctx.store.createSession({ status: "done" });
  const now = ctx.store.createSession({ status: "running" });
  const posting = ctx.store.createHandout({ title: "Posting: last job", kind: "text", visibility: { level: "gm" } });
  const friction = ctx.store.createHandout({ title: "Friction note", kind: "text", visibility: { level: "players" } });
  const map = ctx.store.createHandout({ title: "Station map", kind: "text", visibility: { level: "gm" } });
  const manifest = ctx.store.createHandout({ title: "Manifest", kind: "text", visibility: { level: "gm" } });
  const gmCard = ctx.store.createHandout({ title: "Ava: personal agenda", kind: "agenda", character: ava.id, purpose: CAMPAIGN_AGENDA_CARD_PURPOSE, visibility: { level: "gm" } });
  const personal = ctx.store.createHandout({ title: "Ava: private note", kind: "text", character: ava.id, visibility: { level: "gm" } });
  revealHandout(ctx, last.id, posting.id);
  return { ctx, last, now, posting, friction, map, manifest, gmCard, personal };
}

const titles = (ctx: CampaignContextValue, sessionId: string) => playerScreenHandouts(ctx, sessionId).map((h) => h.title);
const Harness = ({ ctx, children }: { ctx: CampaignContextValue; children: ReactNode }) => <CampaignContext.Provider value={ctx}>{children}</CampaignContext.Provider>;

describe("what the player screen shows", () => {
  it("only this session's reveals by default, then the pinned ones; never a GM-kept or personal handout, pinned or not", async () => {
    const { ctx, now, posting, friction, map, gmCard, personal } = await setup();
    // last session's posting and a handout merely visible to players stay off
    expect(titles(ctx, now.id)).toEqual([]);
    revealHandout(ctx, now.id, map.id);
    expect(titles(ctx, now.id)).toEqual(["Station map"]);
    pinHandout(ctx, now.id, friction.id, true);
    pinHandout(ctx, now.id, posting.id, true);
    expect(titles(ctx, now.id)).toEqual(["Station map", "Friction note", "Posting: last job"]);
    // pins never weaken the leak protections
    ctx.store.update("handouts", gmCard.id, { pinned: true, visibility: { level: "revealed", revealedIn: now.id }, revealedIn: now.id });
    ctx.store.update("handouts", personal.id, { pinned: true, toOwner: true });
    expect(titles(ctx, now.id)).not.toContain(gmCard.title);
    expect(titles(ctx, now.id)).not.toContain(personal.title);
    // a pinned handout hidden again leaves the screen
    act(() => ctx.store.update("handouts", friction.id, { visibility: { level: "gm" } }));
    expect(titles(ctx, now.id)).toEqual(["Station map", "Posting: last job"]);
  });

  it("Clear the screen takes the reveals, the recap and the spotlight off; pins stay; a new reveal shows; Undo puts it back", async () => {
    const { ctx, now, map, manifest, friction } = await setup();
    revealHandout(ctx, now.id, map.id);
    pinHandout(ctx, now.id, friction.id, true);
    setSpotlight(ctx, now.id, { thread: "t", clue: "c" });
    const before = clearPlayerScreen(ctx, now.id);
    expect(titles(ctx, now.id)).toEqual(["Friction note"]);
    await new Promise((r) => setTimeout(r, 5));
    revealHandout(ctx, now.id, manifest.id);
    expect(titles(ctx, now.id)).toEqual(["Manifest", "Friction note"]);
    // showing the map again after the clear puts it back up
    await new Promise((r) => setTimeout(r, 5));
    revealHandout(ctx, now.id, map.id);
    expect(titles(ctx, now.id)).toEqual(["Station map", "Manifest", "Friction note"]);
    restorePlayerScreen(ctx, now.id, before);
    expect(titles(ctx, now.id)).toEqual(["Station map", "Manifest", "Friction note"]);
    const log = ctx.store.list("trackerState").find((t) => t.session === now.id)!.log.map((l) => l.text);
    expect(log).toContain("Cleared the player screen");
    expect(log).toContain("Pinned to the player screen: Friction note");
  });

  it("the Reveal panel lists what is on the screen, pins and clears it (with Undo), and the player screen follows with no page refs", async () => {
    const { ctx, now, map, friction } = await setup();
    revealHandout(ctx, now.id, map.id);
    render(
      <Harness ctx={ctx}>
        <RevealPanel sessionId={now.id} scene={undefined} />
        <ToastViewport />
      </Harness>,
    );
    const players = render(
      <Harness ctx={ctx}>
        <PlayerScreen sessionId={now.id} />
      </Harness>,
    );
    const handouts = () => [...players.container.querySelectorAll(".app-player__handout")].map((h) => h.getAttribute("data-handout"));
    expect(handouts()).toEqual([map.id]);
    // no rulebook page refs on the players' side (the clock's p. 55)
    expect(players.container.querySelector(".cf-page")).toBeNull();
    expect(players.container.textContent).not.toMatch(/p\. \d/);

    const onScreen = screen.getByTestId("on-screen");
    expect(within(onScreen).getByText("Station map")).toBeTruthy();
    // pin the friction note from its row (it is visible to players, not revealed)
    const row = document.querySelector(`.app-reveals [data-handout="${friction.id}"]`) as HTMLElement;
    act(() => fireEvent.click(within(row).getByRole("button", { name: `Pin ${friction.title} to the player screen` })));
    await waitFor(() => expect(handouts()).toEqual([map.id, friction.id]));
    act(() => fireEvent.click(screen.getByTestId("clear-screen")));
    await waitFor(() => expect(handouts()).toEqual([friction.id]));
    // the map is still revealed; it can go back up
    const mapRow = document.querySelector(`.app-reveals [data-handout="${map.id}"]`) as HTMLElement;
    expect(within(mapRow).getByTestId("reveal-again")).toBeTruthy();
    act(() => fireEvent.click(screen.getByRole("button", { name: "Undo" })));
    await waitFor(() => expect(handouts()).toEqual([map.id, friction.id]));
  });
});
