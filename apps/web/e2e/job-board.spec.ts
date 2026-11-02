/**
 * The job board in Skyfire Down (campaign mode): deal three postings, re-roll
 * one part, discard one, take another; the job page shows its NPCs, the
 * players' posting handout and its site brief; "Generate site map" opens the
 * map generator with the brief, and the saved map's rogue humans are in the
 * GM's zone key but not on the player map.
 *
 * The board's seed is picked Node-side from the same demo the app loads, so
 * the posting taken has rogue humans in its brief.
 */
import { campaignSnapshot } from "@campaign-forge/core";
import { alienModule, jobBoard, type JobSiteBrief } from "@campaign-forge/module-alien";
import { runProcedure, type CampaignInputHint, type OfferSet } from "@campaign-forge/module-sdk";
import { buildDemoCampaign } from "@campaign-forge/seed-campaign";
import { expect, test } from "@playwright/test";

/** A board seed whose first posting holds rogue humans, for the Skyfire Down demo as the app loads it. */
function boardSeed(): string {
  const demo = buildDemoCampaign();
  const hint = (jobBoard.inputs as { properties: Record<string, Record<string, unknown>> }).properties["campaign"]!["x-campaign"] as CampaignInputHint;
  const campaign = campaignSnapshot(demo.store, hint, (t) => alienModule.entityTypes.find((e) => e.id === t)?.kind);
  try {
    for (let k = 0; k < 200; k++) {
      const seed = `e2e-board-${k}`;
      const g = runProcedure(jobBoard, alienModule, { seed, inputs: { postings: 3, frame: "space-truckers", employerBias: "any", treachery: "rare", pcCount: 4, campaign } });
      const first = (g.results["offers"] as OfferSet).offers[0]!;
      if ((first.produced.entities[0]!.fields["siteBrief"] as JobSiteBrief).inputs.hostiles.length > 0) return seed;
    }
  } finally {
    demo.registry.closeAll();
    demo.store.destroy();
  }
  throw new Error("no board seed with rogue humans");
}

test("job board: deal postings, take one, see its NPCs and brief, generate its site map; rogue humans in the GM key, not on the player map", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByTestId("load-demo").click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 30_000 });
  const base = page.url().replace(/\/home$/, "");

  // the board, from Generate
  await page.goto(`${base}/generate`);
  await page.getByTestId("procedure-alien.job-board").click();
  await page.getByTestId("seed").fill(boardSeed());
  const board = page.getByTestId("offer-board");
  const cards = board.getByTestId("offer-card");
  await expect(cards).toHaveCount(3);
  await expect(cards.first().getByTestId("offer-player-text")).toContainText("Risk rating");
  await expect(cards.first().getByTestId("offer-gm-text")).toContainText("rogue humans");
  await expect(cards.first().getByTestId("offer-player-text")).not.toContainText("BETRAYER");

  // re-roll one part of the second posting: its title changes, the first posting does not
  const second = cards.nth(1);
  const title = (await second.locator("h3").innerText()).replace(/^Posting 2:\s*/, "").trim();
  const firstTitle = await cards.first().locator("h3").innerText();
  await second.locator("summary").click();
  await second.getByRole("button", { name: `Re-roll Title for ${title}` }).click();
  await expect(second.locator("h3")).not.toContainText(title);
  await expect(cards.first().locator("h3")).toHaveText(firstTitle);

  // discard the third, take the first
  await cards.nth(2).getByTestId("offer-discard").click();
  await expect(cards).toHaveCount(2);
  await expect(board.getByTestId("offers-discarded")).toContainText("1 posting discarded");
  const taken = firstTitle.replace(/^Posting 1:\s*/, "").trim();
  await cards.first().getByTestId("offer-accept").click();
  await expect(page).toHaveURL(/\/entities\/[0-9A-Z]{26}$/);
  await expect(page.getByTestId("entity-page")).toContainText(taken);
  const jobUrl = page.url();

  // the job page: its NPCs (the contact visible to the players), the posting handout, the site brief
  const panel = page.getByTestId("job-panel");
  const npcs = panel.getByTestId("job-npc");
  expect(await npcs.count()).toBeGreaterThanOrEqual(1);
  await expect(npcs.first()).toHaveAttribute("data-visibility", "players");
  await expect(npcs.first()).toContainText("Contact");
  await expect(panel.getByTestId("job-handouts")).toContainText(`Posting: ${taken}`);
  await expect(panel.getByTestId("job-brief-summary")).toContainText("Difficulty");
  await expect(panel.getByTestId("job-brief-inputs")).toContainText("Rogue humans");

  // generate its site map from the brief and save it with the job's site
  await panel.getByTestId("job-generate-map").click();
  await expect(page).toHaveURL(/\/maps\/new\?generator=alien\.map\.site&from=/);
  await expect(page.getByTestId("entity-brief-note")).toContainText(taken);
  await page.getByTestId("map-seed").fill("e2e-site");
  await page.getByTestId("map-generate").click();
  await expect(page.getByTestId("map-preview")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("map-save").click();
  await expect(page).toHaveURL(/\/maps\/[0-9A-Z]{26}$/);

  // the GM map's zone key holds the rogue humans; the player map does not
  const mapPage = page.getByTestId("map-page");
  await expect(mapPage.getByTestId("sitemap")).toHaveAttribute("data-view", "gm");
  await expect(mapPage.getByTestId("zone-key").locator('[data-mark="hostile"]').first()).toBeVisible();
  await page.getByRole("tab", { name: "Player map" }).click();
  await expect(mapPage.getByTestId("sitemap")).toHaveAttribute("data-view", "player");
  await expect(mapPage.getByTestId("sitemap").locator('[data-marker-kind="hostile"], [data-marker-kind="spawn"], [data-marker-kind="npc"]')).toHaveCount(0);

  // back on the job: the site map is listed with it
  await page.goto(jobUrl);
  await expect(page.getByTestId("job-site-maps")).toContainText(taken);

  expect(errors).toEqual([]);
});
