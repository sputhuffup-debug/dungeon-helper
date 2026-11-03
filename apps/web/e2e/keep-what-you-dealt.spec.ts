/**
 * Keep what you dealt (Skyfire Down): a job board stays as dealt when the
 * GM leaves and comes back (or reloads), taking a posting keeps the board
 * with that posting marked taken, the others can be kept as leads, and
 * "New deal" is the only thing that deals afresh. A dealt agenda set
 * survives navigation, and once accepted the page says so and points
 * onward. The wrap-up drafts an empty summary from the log and keeps what
 * the GM types when they leave and come back.
 */
import { expect, test, type Page } from "@playwright/test";

const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "Campaign" }).getByRole("link", { name, exact: true });

async function loadSkyfire(page: Page): Promise<string> {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByTestId("load-demo").click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 30_000 });
  return page.url().replace(/\/home$/, "");
}

const titles = async (page: Page) => (await page.getByTestId("offer-board").getByTestId("offer-card").locator("h3").allInnerTexts()).map((t) => t.trim());
const saved = (page: Page) => expect(page.getByTestId("draft-status")).toHaveAttribute("data-state", "saved");

test("job board: the same board after leaving and reloading; a taken posting stays, marked; the others kept as leads; New deal deals afresh", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const base = await loadSkyfire(page);

  await nav(page, "Generate").click();
  await page.getByTestId("procedure-alien.job-board").click();
  await page.getByTestId("seed").fill("e2e-keep-board");
  const cards = page.getByTestId("offer-board").getByTestId("offer-card");
  await expect(cards).toHaveCount(3);
  const dealt = await titles(page);
  await saved(page);

  // leave and come back: the same board, said so, with "New deal" beside it
  await nav(page, "Home").click();
  await nav(page, "Generate").click();
  // the board is listed as a draft among the recent runs
  await expect(page.getByTestId("generate-recent").getByTestId("recent-draft").filter({ hasText: "Job board" })).toContainText("0 of 3 postings");
  await page.getByTestId("procedure-alien.job-board").click();
  await expect(page.getByTestId("seed")).toHaveValue("e2e-keep-board");
  expect(await titles(page)).toEqual(dealt);
  await expect(page.getByTestId("draft-note")).toContainText("as you left it");
  await expect(page.getByTestId("new-deal")).toBeVisible();
  await expect(page.getByTestId("recent-draft")).toContainText("0 of 3 postings taken or kept");

  // take the first posting: it stays on the board, marked, the job its next step
  await cards.first().getByTestId("offer-accept").click();
  await expect(cards.first()).toHaveAttribute("data-state", "accept");
  await expect(cards.first().getByTestId("offer-state")).toHaveText("Taken");
  await expect(cards).toHaveCount(3);
  expect(await titles(page)).toEqual(dealt);
  await expect(page.getByTestId("offers-acted")).toContainText("1 of 3");
  const job = cards.first().getByTestId("offer-next");
  await expect(job).toContainText("Open the job:");
  await job.click();
  await expect(page).toHaveURL(/\/entities\/[0-9A-Z]{26}$/);
  await expect(page.getByTestId("entity-page")).toContainText(dealt[0]!.replace(/^Posting 1:\s*/, ""));

  // back, then a reload: the board as it was, the taken posting marked
  await page.goBack();
  await expect(cards).toHaveCount(3);
  await expect(cards.first()).toHaveAttribute("data-state", "accept");
  await page.reload();
  await expect(cards).toHaveCount(3);
  expect(await titles(page)).toEqual(dealt);
  await expect(cards.first()).toHaveAttribute("data-state", "accept");
  await expect(cards.nth(1)).toHaveAttribute("data-state", "open");
  await expect(page.getByTestId("draft-note")).toContainText("1 of 3 postings taken or kept");

  // keep the other two as leads
  await page.getByTestId("offers-keep-others").click();
  await expect(cards.nth(1)).toHaveAttribute("data-state", "keep");
  await expect(cards.nth(2)).toHaveAttribute("data-state", "keep");
  await expect(cards.nth(1).getByTestId("offer-next")).toContainText("Open the lead:");
  await page.goto(`${base}/atlas`);
  await page.getByRole("tab", { name: /^Jobs/ }).click();
  for (const t of dealt.slice(1)) await expect(page.getByRole("tabpanel")).toContainText(t.replace(/^Posting \d:\s*/, ""));

  // New deal asks first (this board has work on it), then deals afresh
  await page.goto(`${base}/generate/alien.job-board`);
  await expect(cards.first()).toHaveAttribute("data-state", "accept");
  await page.getByTestId("new-deal").click();
  await page.getByRole("dialog").getByRole("button", { name: "New deal" }).click();
  await expect(page.getByTestId("seed")).not.toHaveValue("e2e-keep-board");
  await expect(page).toHaveURL(/\/generate\/alien\.job-board$/);
  await expect(cards).toHaveCount(3);
  for (let i = 0; i < 3; i++) await expect(cards.nth(i)).toHaveAttribute("data-state", "open");
  expect(errors).toEqual([]);
});

test("campaign agendas: the dealt set survives navigation; accepted, the page says so and points to the agenda", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const base = await loadSkyfire(page);
  await page.goto(`${base}/generate/alien.campaign-agendas`);
  const cards = page.getByTestId("long-agenda-drafts").getByTestId("long-agenda-character");
  await expect(cards).toHaveCount(4);
  const seed = await page.getByTestId("seed").inputValue();
  const first = cards.first();
  const name = (await first.locator("h3").innerText()).trim();
  const beat = first.getByRole("textbox", { name: `${name}, beat` });
  await beat.fill("Get the dock office on side before the next run.");
  await saved(page);

  // check a PC, come back: the same deal and the beat as typed
  await nav(page, "Atlas").click();
  await page.getByRole("tab", { name: /^PCs/ }).click();
  await nav(page, "Generate").click();
  await page.getByTestId("procedure-alien.campaign-agendas").click();
  await expect(page.getByTestId("seed")).toHaveValue(seed);
  await expect(cards.first().getByRole("textbox", { name: `${name}, beat` })).toHaveValue("Get the dock office on side before the next run.");

  // accept: the main button becomes the agenda; "Accept again" asks and says what it does
  await page.getByTestId("long-agenda-accept").click();
  await expect(page.getByTestId("long-agenda-accepted")).toContainText("Wrote 4 long-term agendas");
  await expect(page.getByTestId("long-agenda-accept")).toHaveCount(0);
  await expect(page.getByTestId("long-agenda-open-first")).toHaveText(new RegExp(`^Open .+'s agenda$`));
  await page.getByTestId("accept-again").click();
  await expect(page.getByTestId("accept-again-warning")).toContainText("records a second run");
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();

  // reopened later: it says it was accepted
  await saved(page);
  await page.reload();
  await expect(page.getByTestId("draft-note")).toContainText("You accepted this deal");
  await expect(page.getByTestId("long-agenda-accepted")).toBeVisible();
  await page.getByTestId("long-agenda-open-first").click();
  await expect(page).toHaveURL(/\/entities\/[0-9A-Z]{26}\?tab=agenda$/);
  expect(errors).toEqual([]);
});

test("wrap-up: an empty summary is drafted from the log; what the GM types survives leaving and a reload", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await loadSkyfire(page);
  await nav(page, "Sessions").click();
  await page.getByRole("button", { name: "Start session 2" }).click();
  await expect(page.getByTestId("table-mode")).toBeVisible();
  await page.getByTestId("mark-run").click();

  // the summary is drafted from what the session logged, marked as a draft
  await page.getByTestId("end-session").click();
  const wrap = page.getByTestId("wrapup");
  const summary = wrap.getByRole("textbox", { name: "Session summary" });
  await expect(summary).toHaveValue(/^The crew played one scene: /);
  await expect(wrap.getByTestId("summary-drafted")).toHaveText("Draft");

  // the GM's own words, then off to the table and back
  await summary.fill("The crew landed at the outpost and found the doors welded shut.");
  await expect(wrap.getByTestId("summary-drafted")).toHaveCount(0);
  await wrap.getByRole("list", { name: "Wrap-up steps" }).getByRole("button", { name: /Loose ends$/ }).click();
  await wrap.getByRole("textbox", { name: "Loose ends" }).fill("Who welded the doors?");
  await expect(wrap.getByTestId("wrapup-saved")).toHaveAttribute("data-saved", "");
  await page.waitForTimeout(600);
  await wrap.getByRole("button", { name: "Back to the table" }).click();
  await page.getByTestId("end-session").click();
  // back where they left: the loose ends step, and the summary as typed
  await expect(wrap.getByRole("textbox", { name: "Loose ends" })).toHaveValue("Who welded the doors?");
  await wrap.getByRole("list", { name: "Wrap-up steps" }).getByRole("button", { name: /Summary$/ }).click();
  await expect(summary).toHaveValue("The crew landed at the outpost and found the doors welded shut.");

  // a reload keeps it too
  await page.reload();
  await expect(page.getByTestId("table-mode")).toBeVisible();
  await page.getByTestId("end-session").click();
  await wrap.getByRole("list", { name: "Wrap-up steps" }).getByRole("button", { name: /Summary$/ }).click();
  await expect(summary).toHaveValue("The crew landed at the outpost and found the doors welded shut.");
  await expect(wrap.getByTestId("summary-drafted")).toHaveCount(0);
  expect(errors).toEqual([]);
});
