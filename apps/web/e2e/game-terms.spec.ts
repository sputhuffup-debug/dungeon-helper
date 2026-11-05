/**
 * The app's shared screens speak the game's own words (`GameModule.terms`,
 * entity type names, the dice's roll mode names), never Alien's: in the ORC
 * demo Hollowmere the Atlas has Quests, a quest page lists the people in this
 * quest, the dungeon map counts levels, the phone table's tab is the Party,
 * the drafted summary says what the party played and the wrap-up's rewards
 * name coin, not cash; raw ids and dev words stay out of the Generate list,
 * the new-entity page and the Rules page at phone width.
 */
import { expect, test, type Page } from "@playwright/test";

const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "Campaign" }).getByRole("link", { name, exact: true });
const pageWidth = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth);

test("ORC (Hollowmere): quests, levels, the party, coin; no Alien words, raw ids or sideways scroll", async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.goto("/");
  await page.getByTestId("load-demo-pf2e").click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 60_000 });
  const base = page.url().replace(/\/home$/, "");

  // Atlas: the quests tab and a quest page in the module's own words
  await page.goto(`${base}/atlas`);
  await page.getByRole("tab", { name: /^Quests/ }).click();
  await page.getByRole("tabpanel").getByRole("link").first().click();
  await expect(page.getByTestId("job-npcs")).toContainText("People in this quest");
  await expect(page.getByTestId("entity-page")).not.toContainText("People in this job");

  // Generate: one step reads "1 step"; the site map counts levels, and its notes never speak of decks or ducts
  await page.goto(`${base}/generate`);
  await expect(page.getByTestId("procedures")).not.toContainText(/\b1 steps\b/);
  await page.getByRole("link", { name: "The Glimmer Caves", exact: true }).first().click();
  const map = page.getByTestId("map-page");
  await expect(map).toBeVisible();
  await expect(map.locator(".app-page__header").getByText("1 level", { exact: true })).toBeVisible();
  await expect(map.locator(".app-page__header")).not.toContainText(/deck/i);
  await map.getByRole("tab", { name: "Tracking map" }).click();
  await expect(map).toContainText("One page per level.");

  // New entity: a blank start says what it is
  await page.goto(`${base}/entities/new?type=pf2e-orc.npc`);
  await expect(page.getByText("start from empty fields")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("schema defaults");

  // the table at phone width: the panel of participants is the Party's
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/home`);
  await nav(page, "Sessions").click();
  await page.getByRole("button", { name: "Start session 1" }).click();
  await expect(page.getByTestId("table-mode")).toBeVisible();
  await expect(page.getByTestId("table-tab-crew")).toHaveText(/Party/);
  await expect(page.getByTestId("table-tab-crew")).not.toContainText("Crew");
  await page.getByTestId("table-tab-scene").click();
  await page.getByTestId("mark-run").click();

  // the wrap-up: the drafted summary names the party, the rewards name coin
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.getByTestId("end-session").click();
  const wrap = page.getByTestId("wrapup");
  await expect(wrap.getByRole("textbox", { name: "Session summary" })).toHaveValue(/^The party played one scene: /);
  await expect(wrap).not.toContainText("the hunt");
  await expect(wrap).not.toContainText("panic");
  await wrap.getByRole("list", { name: "Wrap-up steps" }).getByRole("button", { name: /Rewards$/ }).click();
  await expect(wrap).toContainText("Free entries per character: coin, gear, a favour owed, a new ally.");
  await expect(wrap).not.toContainText("cash");

  // the Rules page fits a phone: a long section citation wraps beside its card
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/rules`);
  await expect(page.locator(".cf-rulelist__item").first()).toBeVisible();
  expect(await pageWidth(page)).toBeLessThanOrEqual(390);

  expect(errors).toEqual([]);
});
