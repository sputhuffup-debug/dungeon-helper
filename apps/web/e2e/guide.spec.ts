/**
 * The Guide page: the Alien module's "Your first Alien campaign", opened from
 * a new campaign's setup checklist and from Home, its "Take me there" links
 * followed into the campaign (the Life Path, the players, a new location,
 * the job once one is taken), and the same guide from the campaign list
 * before any campaign exists. Along the way, the relationship the guide
 * shows: "+ Add relationship", "Choose…" and back to the dialog.
 */
import { expect, test, type Page } from "@playwright/test";

const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "Campaign" }).getByRole("link", { name, exact: true });
const step = (page: Page, title: RegExp) => page.getByRole("article", { name: title });
const takeMeThere = (page: Page, title: string) => page.getByRole("group", { name: `Take me there: ${title}` });

async function openGuide(page: Page) {
  await page.getByTestId("home-guide").click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/guide$/);
  await expect(page.getByRole("heading", { level: 1, name: "Your first Alien campaign" })).toBeVisible();
}

test("guide: from a new campaign's checklist and Home, its links lead into the campaign", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto("/");
  await page.getByRole("button", { name: "New campaign" }).click();
  const dialog = page.getByRole("dialog", { name: "New campaign" });
  await dialog.getByLabel("Name", { exact: true }).fill("Breakwater Freight");
  await dialog.getByRole("button", { name: "Create campaign" }).click();
  await expect(page).toHaveURL(/\/home$/);

  // from the setup checklist
  await page.getByTestId("setup-guide").getByTestId("setup-open-guide").click();
  await expect(page).toHaveURL(/\/guide$/);
  const guide = page.getByTestId("guide");
  await expect(guide.getByRole("navigation", { name: "Chapters" }).getByRole("link")).toHaveCount(8);
  await expect(guide.getByRole("article")).toHaveCount(30);
  await expect(page.getByTestId("guide-mode-note")).toHaveCount(0);
  // the first step's screenshot is built in and loads
  const img = step(page, /Start a campaign/).getByRole("img");
  await expect(img).toBeVisible();
  expect(await img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
  // a chapter link jumps to its chapter
  await guide.getByRole("navigation", { name: "Chapters" }).getByRole("link", { name: "A session" }).click();
  await expect(page).toHaveURL(/\/guide#session$/);
  await expect(page.locator("#session")).toBeInViewport();

  // Take me there: the Life Path
  await takeMeThere(page, "Roll a character with the Life Path").getByRole("link", { name: "Roll a Life Path" }).click();
  await expect(page).toHaveURL(/\/generate\/alien\.lifepath$/);
  await expect(page.getByTestId("workbench")).toBeVisible();

  // from Home: the players, in Settings
  await nav(page, "Home").click();
  await openGuide(page);
  await takeMeThere(page, "Add the players and who plays whom").getByRole("link", { name: "Open Players" }).click();
  await expect(page).toHaveURL(/\/settings\?section=players$/);
  await expect(page.getByTestId("players-card")).toBeVisible();

  // a new location, then put a place inside it the way the guide shows
  await nav(page, "Home").click();
  await openGuide(page);
  await takeMeThere(page, "Add a station").getByRole("link", { name: "New location" }).click();
  await expect(page).toHaveURL(/\/entities\/new\?type=alien\.location$/);
  await page.getByTestId("entity-name").fill("Halvorsen Relay");
  await page.getByTestId("create-entity").click();
  await expect(page).toHaveURL(/\/entities\/[0-9A-Z]{26}$/);
  await nav(page, "Home").click();
  await page.getByRole("link", { name: "+ Location" }).click();
  await page.getByTestId("entity-name").fill("The Lantern Bar");
  await page.getByTestId("create-entity").click();
  await page.getByRole("tab", { name: "Relationships" }).click();
  await page.getByTestId("add-relationship").click();
  const link = page.getByRole("dialog", { name: "Link The Lantern Bar" });
  await link.getByRole("combobox", { name: "Relationship type" }).selectOption({ label: "within" });
  await link.getByRole("button", { name: "Choose…" }).click();
  await page.getByRole("dialog", { name: "Choose an entity" }).getByRole("option", { name: /Halvorsen Relay/ }).click();
  // back on the dialog with the target chosen (it used to close when the picker opened)
  await expect(link).toBeVisible();
  await expect(link).toContainText("Halvorsen Relay");
  await link.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("list", { name: "Relationships" })).toContainText("within");
  await nav(page, "Atlas").click();
  await expect(page.getByRole("tree", { name: "Locations" }).getByRole("group")).toContainText("The Lantern Bar");

  // "Open the job" waits for a job: none yet, then one taken from the job board
  await nav(page, "Home").click();
  await openGuide(page);
  await expect(takeMeThere(page, "The job's people")).toHaveCount(0);
  await takeMeThere(page, "Deal a job board").getByRole("link", { name: "Deal a job board" }).click();
  await expect(page).toHaveURL(/\/generate\/alien\.job-board$/);
  const posting = page.getByTestId("offer-board").getByTestId("offer-card").first();
  await posting.getByTestId("offer-accept").click();
  await expect(posting).toHaveAttribute("data-state", "accept");
  await nav(page, "Home").click();
  await openGuide(page);
  await takeMeThere(page, "The job's people").getByRole("link", { name: "Open the job" }).click();
  await expect(page).toHaveURL(/\/entities\/[0-9A-Z]{26}$/);
  await expect(page.getByTestId("job-panel")).toBeVisible();
  await expect(page.getByTestId("run-from-entity")).toHaveText("Run this job");

  expect(errors).toEqual([]);
});

test("guide: the campaign list opens a module's guide before any campaign, without links", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.locator('[data-module="alien"]').getByTestId("module-guide").click();
  await expect(page).toHaveURL(/\/guide\/alien$/);
  await expect(page.getByRole("heading", { level: 1, name: "Your first Alien campaign" })).toBeVisible();
  await expect(page.getByTestId("guide-no-campaign")).toContainText("Start a campaign with Alien RPG (Evolved Edition)");
  await expect(page.getByRole("article")).toHaveCount(30);
  await expect(page.getByTestId("guide-link")).toHaveCount(0);
  // the other built-in modules have no guide yet: no button
  await page.getByRole("link", { name: "← All campaigns" }).click();
  await expect(page.locator('[data-module="dnd5e-srd"]').getByTestId("module-guide")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("guide: a cinematic campaign says the guide is written for campaign play", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New campaign" }).click();
  const dialog = page.getByRole("dialog", { name: "New campaign" });
  await dialog.getByLabel("Name", { exact: true }).fill("One night");
  await dialog.getByRole("radio", { name: /^Cinematic/ }).check();
  await dialog.getByRole("button", { name: "Create campaign" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await openGuide(page);
  await expect(page.getByTestId("guide-mode-note")).toContainText("Written for Campaign play. This campaign is Cinematic");
});
