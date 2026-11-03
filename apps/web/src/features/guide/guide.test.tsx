import "fake-indexeddb/auto";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { GuideDef } from "@campaign-forge/module-sdk";
import { guideSteps } from "@campaign-forge/module-sdk";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCampaign, createEntity } from "../../state/actions";
import { CampaignContext, openCampaign, type CampaignContextValue } from "../../state/CampaignProvider";
import { guideImageUrl } from "./guideImages";
import { GuidePage } from "./GuidePage";
import { GuideView } from "./GuideView";

// Outside a router, a link is an anchor that says where it goes.
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  Link: ({ children, className, to, params, search }: { children?: ReactNode; className?: string; to: string; params?: Record<string, string>; search?: Record<string, unknown> }) => (
    <a href="#" className={className} data-to={to} data-params={JSON.stringify(params ?? {})} data-search={JSON.stringify(search ?? {})}>
      {children}
    </a>
  ),
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

const FIXTURE: GuideDef = {
  id: "fx.guide",
  title: "Fixture guide",
  summary: "Two chapters.",
  chapters: [
    {
      id: "one",
      title: "First",
      intro: "Begin *here*.",
      steps: [
        { id: "a", title: "Step A", body: ["Click *Go*, then wait.", "Second paragraph."], image: { key: "a", alt: "Picture of A" }, links: [{ label: "Home", page: "home" }, { label: "Nowhere", page: "rules" }] },
        { id: "b", title: "Step B", body: ["No picture."], image: { key: "missing", alt: "Not there" } },
      ],
    },
    { id: "two", title: "Second", steps: [{ id: "c", title: "Step C", body: ["Last."] }] },
  ],
};

describe("GuideView", () => {
  it("lists the chapters, numbers the steps, marks labels and shows the images it has", () => {
    render(<GuideView guide={FIXTURE} moduleId="fx" imageUrl={(m, k) => (k === "a" ? `/img/${m}-${k}.png` : undefined)} />);
    const toc = screen.getByRole("navigation", { name: "Chapters" });
    expect(within(toc).getAllByRole("link").map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["First", "#one"],
      ["Second", "#two"],
    ]);
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent?.trim())).toEqual(["1.1 Step A", "1.2 Step B", "2.1 Step C"]);
    const a = screen.getByRole("article", { name: /Step A/ });
    expect(a.id).toBe("one-a");
    expect([...a.querySelectorAll("em.guide-ui")].map((e) => e.textContent)).toEqual(["Go"]);
    expect(within(a).getByRole("img", { name: "Picture of A" }).getAttribute("src")).toBe("/img/fx-a.png");
    // an image whose file is missing is left out, not broken
    expect(within(screen.getByRole("article", { name: /Step B/ })).queryByRole("img")).toBeNull();
    // no link targets: no "Take me there"
    expect(screen.queryAllByTestId("guide-link")).toEqual([]);
  });

  it("shows a step's links that have a target, the first as the main one", () => {
    render(<GuideView guide={FIXTURE} moduleId="fx" imageUrl={() => undefined} linkTarget={(l) => (l.page === "home" ? { to: "/c/$campaignId/home", params: { campaignId: "c1" }, search: {} } : undefined)} />);
    const links = within(screen.getByRole("group", { name: "Take me there: Step A" })).getAllByRole("link");
    expect(links.map((l) => [l.textContent, l.getAttribute("data-to")])).toEqual([["Home", "/c/$campaignId/home"]]);
    expect(links[0]!.className).toContain("cf-btn--primary");
  });
});

describe("the Guide page in a campaign", () => {
  it("renders the module's guide with links into this campaign; 'Open the job' waits for a taken job", async () => {
    const ctx = await open(await createCampaign({ name: "Haulers", moduleId: "alien", mode: "campaign" }));
    const guide = ctx.module.module.guide!;
    const view = () =>
      render(
        <CampaignContext.Provider value={ctx}>
          <GuidePage />
        </CampaignContext.Provider>,
      );
    view();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(guide.title);
    expect(screen.getAllByRole("article")).toHaveLength(guideSteps(guide).length);
    expect(screen.queryByTestId("guide-mode-note")).toBeNull();
    // a procedure link and a settings link, for this campaign
    const lifePath = within(screen.getByRole("group", { name: /^Take me there: Roll a character/ })).getByRole("link");
    expect(lifePath.getAttribute("data-to")).toBe("/c/$campaignId/generate/$procedureId");
    expect(JSON.parse(lifePath.getAttribute("data-params")!)).toEqual({ campaignId: ctx.campaignId, procedureId: "alien.lifepath" });
    const players = within(screen.getByRole("group", { name: /^Take me there: Add the players/ })).getByRole("link");
    expect(JSON.parse(players.getAttribute("data-search")!)).toEqual({ section: "players" });
    // no job yet: the job's people step has nowhere to go
    expect(screen.queryByRole("group", { name: /^Take me there: The job's people/ })).toBeNull();
    cleanup();

    const job = createEntity(ctx, { type: "alien.job", name: "Ice run", fields: { status: "accepted" } });
    view();
    const openJob = within(screen.getByRole("group", { name: /^Take me there: The job's people/ })).getByRole("link", { name: "Open the job" });
    expect(openJob.getAttribute("data-to")).toBe("/c/$campaignId/entities/$entityId");
    expect(JSON.parse(openJob.getAttribute("data-params")!)).toEqual({ campaignId: ctx.campaignId, entityId: job.id });
  }, 30_000);

  it("says which play mode it is written for in a campaign of another mode", async () => {
    const ctx = await open(await createCampaign({ name: "One night", moduleId: "alien", mode: "cinematic" }));
    render(
      <CampaignContext.Provider value={ctx}>
        <GuidePage />
      </CampaignContext.Provider>,
    );
    expect(screen.getByTestId("guide-mode-note").textContent).toContain("Written for Campaign play. This campaign is Cinematic");
  }, 30_000);
});

describe("guide images", () => {
  it("ships every Alien guide step's screenshot with the app", async () => {
    const { alienModule } = await import("@campaign-forge/module-alien");
    for (const { step } of guideSteps(alienModule.guide!)) expect(guideImageUrl("alien", step.image!.key), step.id).toBeTruthy();
    expect(guideImageUrl("alien", "no-such-step")).toBeUndefined();
  }, 30_000);
});
