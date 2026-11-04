/**
 * GM-facing polish in the Skyfire Down demo: "Preview as player" from the
 * Atlas carries into the job's page (a banner, no GM-only sections, and an
 * exit back to the full page); global search finds the rule cards; the GM
 * screen opens from Home and reads on screen; the job sheet names its enum
 * values; a PC's sheet has no NPC dossier and keeps its life cycle start in
 * the "More…" menu.
 */
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("load-demo").click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 30_000 });
});

const nav = (page: import("@playwright/test").Page, name: string) => page.getByRole("navigation", { name: "Campaign" }).getByRole("link", { name, exact: true });

test("preview as player from the Atlas into a job's page", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await nav(page, "Atlas").click();
  // machine tags are data, not filters
  const tags = page.getByRole("combobox", { name: "Filter by tag" });
  await expect(tags.locator("option").first()).toHaveText("All tags");
  expect(await tags.locator("option").allTextContents()).not.toContainEqual(expect.stringMatching(/^(within|subtype|frame):/));

  await page.getByTestId("preview-as-player").check();
  await expect(page).toHaveURL(/as=player/);
  await page.getByRole("tab", { name: /^Jobs/ }).click();
  await page.getByRole("table").getByRole("link").first().click();

  const banner = page.getByTestId("player-preview-banner");
  await expect(banner).toContainText("Previewing as a player");
  const entity = page.getByTestId("entity-page");
  await expect(entity).toHaveAttribute("data-preview", "player");
  await expect(page.getByTestId("player-preview-sheet")).toContainText("Briefing");
  for (const gm of ["Complications (GM)", "Behind the posting", "Employer's real intent", "Plot twist"]) await expect(entity).not.toContainText(gm);
  // read-only: no editable name, no tabs
  await expect(page.getByTestId("entity-title")).toHaveCount(0);

  // the exit opens the full GM page
  await banner.getByTestId("exit-player-preview").click();
  await expect(page.getByTestId("player-preview-banner")).toHaveCount(0);
  await expect(page.getByTestId("entity-page")).toContainText("Complications (GM)");
  // enum values by their labels on the job sheet
  await expect(page.getByRole("combobox", { name: "Frame" })).toHaveValue("space-truckers");
  await expect(page.getByRole("combobox", { name: "Frame" }).locator("option:checked")).toHaveText("Space Truckers");
  expect(errors).toEqual([]);
});

test("global search finds a rule card and opens it", async ({ page }) => {
  const search = page.getByRole("searchbox", { name: "Search campaign" });
  await search.fill("panic");
  const results = page.getByRole("listbox", { name: "Search results" });
  await expect(results.getByText("Rules", { exact: true })).toBeVisible();
  const hit = results.getByRole("group", { name: "Rules" }).getByRole("option", { name: /Panic roll/ });
  await expect(hit).toContainText("p. 72");
  await hit.click();
  await expect(page).toHaveURL(/\/rules\?rule=alien\.rule\.panic-roll/);
  await expect(page.getByRole("dialog", { name: "Panic roll" })).toBeVisible();
});

test("the GM screen opens from Home and reads on screen", async ({ page }) => {
  await page.getByTestId("home-gm-screen").click();
  await expect(page).toHaveURL(/\/gm-screen\?view=screen$/);
  const onScreen = page.getByTestId("gm-screen-onscreen");
  await expect(onScreen.getByRole("heading", { name: "GM side" })).toBeVisible();
  await expect(onScreen).toContainText("Stress and panic");
  await page.getByTestId("gm-screen-view-print").click();
  await expect(page.getByTestId("gm-screen-preview")).toBeVisible();
});

test("a PC's sheet has no NPC dossier; its life cycle start is under More", async ({ page }) => {
  await nav(page, "Atlas").click();
  await page.getByRole("tab", { name: /^PCs/ }).click();
  await page.getByRole("table").getByRole("link").first().click();
  const entity = page.getByTestId("entity-page");
  await expect(entity.locator('[data-section="attributes"], [data-section]').first()).toBeVisible();
  await expect(entity.locator('[data-section="npc"]')).toHaveCount(0);
  const start = entity.getByRole("button", { name: /^Start infection: / });
  await expect(start).toBeHidden();
  await page.getByTestId("entity-more").click();
  await expect(start).toBeVisible();
  await expect(start).not.toHaveClass(/cf-btn--danger/);
});
