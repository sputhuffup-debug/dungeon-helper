/**
 * The Reveal panel never puts a personal handout on the shared screen with one
 * tap: the GM's own agenda card (kept with the GM by the module) has no reveal
 * at all, a handout written for one character goes to that player or asks
 * before showing everyone, and anything revealed can be hidden again.
 */
import "fake-indexeddb/auto";
import { canSeeHandout } from "@campaign-forge/core";
import { CAMPAIGN_AGENDA_CARD_PURPOSE } from "@campaign-forge/module-alien";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createCampaign } from "../../state/actions";
import { CampaignContext, openCampaign, type CampaignContextValue } from "../../state/CampaignProvider";
import { RevealPanel } from "./RevealPanel";

const opened: Array<() => void> = [];
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  while (opened.length) opened.pop()?.();
});

let campaignId: string;
beforeAll(async () => {
  campaignId = await createCampaign({ name: "Reveal", moduleId: "alien" });
}, 30_000);

async function setup() {
  const ctx = await openCampaign(campaignId);
  opened.push(ctx.close);
  const ava = ctx.store.createEntity({ type: "alien.character", name: "Ava" });
  const session = ctx.store.createSession({ status: "running" });
  const gmCard = ctx.store.createHandout({ title: "Ava: personal agenda", kind: "agenda", character: ava.id, purpose: CAMPAIGN_AGENDA_CARD_PURPOSE, visibility: { level: "gm" } });
  const personal = ctx.store.createHandout({ title: "Ava: private note", kind: "text", character: ava.id, visibility: { level: "gm" } });
  const open = ctx.store.createHandout({ title: "Station map", kind: "text", visibility: { level: "gm" } });
  return { ctx, session, gmCard, personal, open };
}

function renderPanel(ctx: CampaignContextValue, sessionId: string) {
  return render(
    <CampaignContext.Provider value={ctx}>
      <RevealPanel sessionId={sessionId} scene={undefined} />
    </CampaignContext.Provider>,
  );
}

const row = (id: string) => document.querySelector(`[data-handout="${id}"]`) as HTMLElement;
const vis = (ctx: CampaignContextValue, id: string) => ctx.store.get("handouts", id)!.visibility.level;

describe("RevealPanel", () => {
  it("offers no reveal for the GM's own agenda card, and players never see it", async () => {
    const { ctx, session, gmCard } = await setup();
    renderPanel(ctx, session.id);
    const r = within(row(gmCard.id));
    expect(r.queryByRole("button", { name: /Reveal/ })).toBeNull();
    expect(r.queryByRole("button", { name: /Show .* to everyone/ })).toBeNull();
    expect(r.getByTestId("reveal-gm-only").textContent).toContain("this card stays with you");
    // even forced to revealed, the projection keeps it away from players
    act(() => void ctx.store.update("handouts", gmCard.id, { visibility: { level: "revealed", revealedIn: session.id } }));
    const maps = ctx.store.toJSON();
    expect(canSeeHandout(maps.handouts[gmCard.id]!, { role: "player" }, maps, ctx.module.module)).toBe(false);
  });

  it("asks before showing a personal handout to everyone, and can hide it again", async () => {
    const { ctx, session, personal } = await setup();
    renderPanel(ctx, session.id);
    const r = within(row(personal.id));
    expect(r.queryByRole("button", { name: `Reveal ${personal.title}` })).toBeNull();
    // the app's own confirm dialog (not the browser's window.confirm): Cancel keeps it with its player
    const confirm = vi.spyOn(window, "confirm");
    fireEvent.click(r.getByRole("button", { name: `Show ${personal.title} to everyone` }));
    expect(screen.getByTestId("reveal-everyone-question").textContent).toContain("every player sees");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(vis(ctx, personal.id)).toBe("gm");
    fireEvent.click(r.getByRole("button", { name: `Show ${personal.title} to everyone` }));
    act(() => fireEvent.click(screen.getByRole("button", { name: "Show everyone" })));
    expect(vis(ctx, personal.id)).toBe("revealed");
    expect(confirm).not.toHaveBeenCalled();
    act(() => fireEvent.click(within(row(personal.id)).getByRole("button", { name: `Hide ${personal.title} from the players` })));
    expect(vis(ctx, personal.id)).toBe("gm");
  });

  it("reveals a shared handout with one tap", async () => {
    const { ctx, session, open } = await setup();
    renderPanel(ctx, session.id);
    act(() => fireEvent.click(within(row(open.id)).getByRole("button", { name: `Reveal ${open.title}` })));
    expect(vis(ctx, open.id)).toBe("revealed");
    expect(screen.getByRole("button", { name: `Hide ${open.title} from the players` })).toBeTruthy();
  });
});
