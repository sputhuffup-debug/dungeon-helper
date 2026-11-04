/**
 * GM-facing polish: an entity page previewed as a player (only the player
 * projection, a banner and an exit), global search finding rule cards, and
 * the landing page's "Start a campaign" button named with its visible text.
 */
import "fake-indexeddb/auto";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createCampaign } from "../../state/actions";
import { CampaignContext, openCampaign } from "../../state/CampaignProvider";
import { listModules } from "../../modules/registry";
import { ModuleSection } from "../campaigns/CampaignListPage";
import { GlobalSearch } from "../shell/GlobalSearch";
import { PlayerPreview } from "./PlayerPreview";

const nav = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useNavigate: () => nav.navigate,
  Link: ({ children, to, search, params, ...rest }: { children: ReactNode; to: string; search?: Record<string, unknown>; params?: Record<string, string> }) => (
    <a href="#" data-to={to} data-search={JSON.stringify(search ?? {})} data-params={JSON.stringify(params ?? {})} {...rest}>
      {children}
    </a>
  ),
}));

const opened: Array<() => void> = [];
afterEach(() => {
  cleanup();
  nav.navigate.mockReset();
  while (opened.length) opened.pop()?.();
});

let campaignId: string;
beforeAll(async () => {
  campaignId = await createCampaign({ name: "Preview (Alien)", moduleId: "alien", mode: "campaign" });
}, 30_000);

async function open() {
  const ctx = await openCampaign(campaignId);
  opened.push(ctx.close);
  return ctx;
}

describe("preview as player on an entity page", () => {
  it("renders the player projection: the posting, never the GM's complications, twist or intent", async () => {
    const ctx = await open();
    const job = ctx.store.createEntity({
      type: "alien.job",
      name: "Ore run to Hadley",
      visibility: { level: "players" },
      tags: ["job-board", "smuggling", "within:alien.location.x"],
      fields: { frame: "space-truckers", status: "accepted", cargo: "Ore", complications: ["SECRET-COMPLICATION"], plotTwist: "SECRET-TWIST", employerIntent: "SECRET-INTENT", posting: { title: "Ore run", pitch: "Haul ore to Hadley." } },
    });
    const contact = ctx.store.createEntity({ type: "alien.character", name: "Ken Ibana", visibility: { level: "players" }, fields: {} });
    const insider = ctx.store.createEntity({ type: "alien.character", name: "SECRET-INSIDER", visibility: { level: "gm" }, fields: {} });
    ctx.store.createRelationship("employer_of", contact.id, job.id, undefined, { level: "players" });
    ctx.store.createRelationship("employer_of", insider.id, job.id, undefined, { level: "players" });
    render(
      <CampaignContext.Provider value={ctx}>
        <PlayerPreview entity={ctx.store.get("entities", job.id)!} />
      </CampaignContext.Provider>,
    );
    const banner = screen.getByTestId("player-preview-banner");
    expect(banner.textContent).toContain("Previewing as a player");
    // the exit drops the preview from the same page
    const exit = within(banner).getByTestId("exit-player-preview");
    expect(exit.dataset.search).toBe("{}");
    expect(JSON.parse(exit.dataset.params!)).toEqual({ campaignId, entityId: job.id });
    const page = screen.getByTestId("entity-page");
    expect(page.textContent).toContain("Ore run to Hadley");
    expect(page.textContent).toContain("Haul ore to Hadley.");
    // enum values by their labels; the GM's own tags, never machine tags nor the generator's bookkeeping ones
    expect(page.textContent).toContain("Space Truckers");
    expect(page.textContent).toContain("smuggling");
    expect(page.textContent).not.toContain("job-board");
    expect(page.textContent).not.toContain("within:");
    for (const secret of ["SECRET-COMPLICATION", "SECRET-TWIST", "SECRET-INTENT", "SECRET-INSIDER", "Complications (GM)", "Behind the posting"]) expect(page.textContent).not.toContain(secret);
    // a link to another entity keeps the preview
    const link = screen.getByRole("link", { name: "Ken Ibana" });
    expect(link.dataset.search).toBe(JSON.stringify({ as: "player" }));
  });

  it("says when players cannot see the entity at all", async () => {
    const ctx = await open();
    const secret = ctx.store.createEntity({ type: "alien.character", name: "Hidden android", visibility: { level: "gm" }, fields: { secret: "SECRET-ORDERS" } });
    render(
      <CampaignContext.Provider value={ctx}>
        <PlayerPreview entity={secret} />
      </CampaignContext.Provider>,
    );
    expect(screen.getByTestId("player-preview-banner").textContent).toContain("Players cannot see this entity at all.");
    expect(screen.getByText("Hidden from players")).toBeTruthy();
    expect(screen.getByTestId("entity-page").textContent).not.toContain("SECRET-ORDERS");
  });
});

describe("global search", () => {
  it("finds the module's rule cards with their page references, and opens one on the Rules page", async () => {
    const ctx = await open();
    render(
      <CampaignContext.Provider value={ctx}>
        <GlobalSearch />
      </CampaignContext.Provider>,
    );
    fireEvent.change(screen.getByRole("searchbox", { name: "Search campaign" }), { target: { value: "panic" } });
    const results = screen.getByRole("listbox", { name: "Search results" });
    const rules = within(results).getByRole("group", { name: "Rules" });
    const hit = within(rules).getByRole("option", { name: /Panic roll/ });
    expect(hit.textContent).toContain("p. 72");
    // the Panic roll table is a Reference entry, in its own group
    const table = within(within(results).getByRole("group", { name: "Reference" })).getByRole("option", { name: /Panic roll/ });
    expect(table.textContent).toContain("Table");
    fireEvent.click(hit);
    expect(nav.navigate).toHaveBeenCalledWith({ to: "/c/$campaignId/rules", params: { campaignId }, search: { rule: "alien.rule.panic-roll" } });
  });

  it("opens a reference entry on the Reference page: a list item with its list", async () => {
    const ctx = await open();
    render(
      <CampaignContext.Provider value={ctx}>
        <GlobalSearch />
      </CampaignContext.Provider>,
    );
    fireEvent.change(screen.getByRole("searchbox", { name: "Search campaign" }), { target: { value: "full throttle" } });
    const reference = within(screen.getByRole("listbox", { name: "Search results" })).getByRole("group", { name: "Reference" });
    const hit = within(reference).getByRole("option", { name: /Full Throttle/ });
    expect(hit.textContent).toContain("Talents");
    fireEvent.click(hit);
    expect(nav.navigate).toHaveBeenCalledWith({ to: "/c/$campaignId/reference", params: { campaignId }, search: { tab: "lists", list: "alien.talents", item: "full-throttle" } });
  });
});

describe("the landing page", () => {
  it("names Start a campaign with its visible text first, then the game", () => {
    const alien = listModules().find((m) => m.id === "alien")!;
    render(<ModuleSection module={alien} campaigns={[]} busy={false} onStart={() => {}} onDemo={() => {}} onDelete={() => {}} />);
    const button = screen.getByRole("button", { name: `Start a campaign: ${alien.name}` });
    expect(button.textContent).toContain("Start a campaign");
    expect(screen.queryByRole("button", { name: /Start a Alien/ })).toBeNull();
  });
});
