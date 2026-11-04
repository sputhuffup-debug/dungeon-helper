/**
 * The header search finds what the Reference page lists (a reference list's
 * item, an entity preset, a roll table) and opens it there.
 */
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("load-demo").click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 30_000 });
});

async function searchFor(page: import("@playwright/test").Page, query: string) {
  // no dialog left open: closing one moves focus, which would close the results under the click
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const box = page.getByRole("searchbox", { name: "Search campaign" });
  await box.click();
  await box.fill(query);
  const results = page.getByRole("listbox", { name: "Search results" });
  const group = results.getByRole("group", { name: "Reference" });
  await expect(group).toBeVisible();
  return group;
}

test("search opens a reference list item, a roll table and a preset on the Reference page", async ({ page }) => {
  // a talent from the Talents list opens in its dialog
  let results = await searchFor(page, "full throttle");
  const talent = results.getByRole("option", { name: /Full Throttle/ });
  await expect(talent).toContainText("Talents");
  await expect(talent).toContainText("p. 50");
  await talent.click();
  await expect(page).toHaveURL(/\/reference\?.*item=full-throttle/);
  const dialog = page.getByRole("dialog", { name: "Full Throttle" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("+2 dice to Piloting");
  await expect(page.getByRole("combobox", { name: "Reference list" })).toHaveValue("alien.talents");
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(page).not.toHaveURL(/item=/);

  // a roll table opens in the table dialog
  results = await searchFor(page, "critical injuries");
  await results.getByRole("option", { name: /Critical injuries/ }).filter({ hasText: "Table" }).click();
  await expect(page).toHaveURL(/\/reference\?.*table=/);
  await expect(page.getByRole("dialog", { name: /Critical injuries/ })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await expect(page).not.toHaveURL(/table=/);

  // a preset: the Presets tab, filtered to it, its row marked
  results = await searchFor(page, "engineer");
  await results.getByRole("option", { name: /engineer/ }).filter({ hasText: "Preset" }).first().click();
  await expect(page).toHaveURL(/\/reference\?.*preset=/);
  await expect(page.getByRole("tab", { name: /Presets/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("tr.is-target")).toContainText("engineer");
  await expect(page.getByRole("searchbox", { name: "Filter presets" })).toHaveValue(/engineer/);
});
