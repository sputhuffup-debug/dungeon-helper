/**
 * A secret synthetic keeps its true make from the players by the module's
 * own rule: the Skyfire Down demo's covert android (made from the "Android,
 * covert" preset), shown to the players, previews with its cover scores as
 * its attributes and nothing that says android; Field visibility says why
 * those fields are GM-only. Ticking "Poses as human" by hand on another NPC
 * hides the same fields.
 */
import { expect, test, type Page } from "@playwright/test";

const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "Campaign" }).getByRole("link", { name, exact: true });

async function openNpc(page: Page, name: string) {
  await nav(page, "Atlas").click();
  await page.getByRole("tab", { name: /^NPCs/ }).click();
  await page.getByRole("table").getByRole("link", { name, exact: true }).click();
  await expect(page.getByTestId("entity-page")).toBeVisible();
}

test("a secret synthetic shows the players its cover, never its true make", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByTestId("load-demo").click();
  await expect(page).toHaveURL(/\/home$/, { timeout: 30_000 });

  // the demo's covert android, shown to the players
  await openNpc(page, "Constance Navona");
  await page.getByRole("combobox", { name: "Visibility", exact: true }).selectOption("players");

  // Field visibility: android, attributes, skills and talents GM-only, and why
  await page.getByTestId("field-visibility-open").click();
  const fv = page.getByTestId("field-visibility");
  for (const f of ["android", "attributes", "skills", "talents"]) {
    const row = fv.locator(`[data-field="${f}"]`);
    // the level as the menu names it ("GM only"), not lowercased into "gm only"
    await expect(row, f).toContainText("GM only by default");
    await expect(row.getByTestId("field-visibility-reason"), f).toContainText("Poses as human");
  }
  await page.keyboard.press("Escape");

  // as the players see it: the cover scores as attributes, no android, no cover, no skills or talents
  await page.goto(`${page.url().split("?")[0]}?as=player`);
  const sheet = page.getByTestId("player-preview-sheet");
  await expect(sheet).toContainText("Attributes");
  const preview = page.getByTestId("entity-page");
  for (const word of ["Android", "android", "synthetic", "Cover", "Secret", "Skills", "Talents"]) await expect(preview, word).not.toContainText(word);
  await expect(sheet.locator(".app-dl__row", { hasText: "Strength" })).toContainText("5");

  // the Atlas preview lists it with nothing that gives it away
  await nav(page, "Atlas").click();
  await page.getByTestId("preview-as-player").check();
  await page.getByRole("tab", { name: /^NPCs/ }).click();
  const row = page.getByRole("table").getByRole("row", { name: /Constance Navona/ });
  await expect(row).toBeVisible();
  await expect(row).not.toContainText(/android|synthetic/i);
  expect(errors).toEqual([]);
});
