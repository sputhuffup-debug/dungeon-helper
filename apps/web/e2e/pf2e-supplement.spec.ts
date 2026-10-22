/**
 * The built-in supplement "Remaster ORC books" end to end: listed under the
 * ORC core rules module with its badges, licence and switch (off by
 * default); switched on, the Hollowmere demo's module has its ancestries,
 * classes and creatures (with source badges), a character can take one of
 * its ancestries and classes with the right Hit Points, and Settings lists it
 * as active; switched off, its content is gone again.
 */
import { expect, test } from "@playwright/test";

test("built-in supplement: off by default, switched on per device, its content in the module, off again", async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 1000 });

  // 1. listed under its module, with its licence, off by default
  await page.goto("/");
  await page.getByTestId("open-modules").click();
  const modules = page.getByRole("dialog", { name: "Game modules" });
  const row = modules.getByTestId("module-pf2e-orc").getByTestId("supplement-pf2e-orc-books");
  await expect(row).toContainText("Remaster ORC books");
  await expect(row).toContainText("Built-in");
  await expect(row).toContainText("Supplement");
  await expect(row).toContainText("extends pf2e-orc ^0.1.0");
  const licence = row.getByTestId("supplement-licence-pf2e-orc-books");
  await expect(licence).toContainText("This product is licensed under the ORC License located at the Library of Congress at TX 9-307-067");
  await expect(licence).toContainText("Pathfinder Howl of the Wild © 2023, Paizo Inc.; Authors: Kate Baker");
  await expect(licence).toContainText("Not affiliated with or endorsed by Paizo Inc. Pathfinder is a trademark of Paizo Inc.");
  const toggle = row.getByTestId("toggle-supplement-pf2e-orc-books");
  await expect(toggle).not.toBeChecked();

  // 2. switched on for this device (and still on after a reload)
  await toggle.check();
  await expect(toggle).toBeChecked();
  await expect(row).toContainText("On on this device");
  await page.reload();
  await page.getByTestId("open-modules").click();
  await expect(page.getByRole("dialog", { name: "Game modules" }).getByTestId("toggle-supplement-pf2e-orc-books")).toBeChecked();
  await page.getByRole("dialog", { name: "Game modules" }).getByRole("button", { name: "Close" }).click();

  // 3. the demo's module has its content, marked with its source
  await page.getByTestId("load-demo-pf2e").click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 90_000 });
  const base = page.url().replace(/\/home$/, "");
  await page.goto(`${base}/reference`);
  await page.getByRole("combobox", { name: "Reference list" }).selectOption("pf2e-orc.ancestries");
  const centaur = page.getByTestId("reference-items").getByRole("row").filter({ hasText: "Centaur" });
  await expect(centaur.getByTestId("source-badge")).toHaveText("Remaster ORC books");
  await expect(centaur).toContainText("Large");
  const dwarf = page.getByTestId("reference-items").getByRole("row").filter({ hasText: "Dwarf" });
  await expect(dwarf.getByTestId("source-badge")).toHaveCount(0);
  await page.getByRole("combobox", { name: "Reference list" }).selectOption("pf2e-orc-books.feats.class-commander");
  await expect(page.getByTestId("reference-items").getByRole("row").first()).toBeVisible();

  // 4. a Monster Core 2 creature from its presets
  await page.goto(`${base}/entities/new?type=pf2e-orc.creature`);
  await page.getByRole("searchbox", { name: "Search presets" }).fill("adlet");
  await page.getByRole("radio", { name: /^Adlet/ }).check();
  await page.getByTestId("create-entity").click();
  await expect(page.getByTestId("entity-page")).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: "AC", exact: true })).toHaveValue("29");

  // 5. a character takes one of its ancestries and classes: Hit Points follow (Minotaur 10 + (Guardian 12 + Con 2) × level 1)
  await page.goto(`${base}/atlas`);
  await page.getByRole("tab", { name: /^PCs/ }).click();
  await page.getByRole("tabpanel").getByRole("link", { name: "Brunhild Ashdelver", exact: true }).click();
  await expect(page.getByTestId("computed-hpMax")).toHaveText("20");
  await page.getByRole("combobox", { name: "Ancestry", exact: true }).selectOption({ label: "Minotaur (Remaster ORC books)" });
  await page.getByRole("combobox", { name: "Class", exact: true }).selectOption({ label: "Guardian (Remaster ORC books)" });
  await expect(page.getByTestId("computed-hpMax")).toHaveText("24");

  // 6. settings list it as active, as built in
  await page.goto(`${base}/settings`);
  const active = page.getByTestId("active-supplement-pf2e-orc-books");
  await expect(active).toContainText("Remaster ORC books");
  await expect(active).toContainText("Built-in");

  // 7. switched off, the module loads without it
  await page.goto("/");
  await page.getByTestId("open-modules").click();
  await page.getByRole("dialog", { name: "Game modules" }).getByTestId("toggle-supplement-pf2e-orc-books").uncheck();
  await page.getByRole("dialog", { name: "Game modules" }).getByRole("button", { name: "Close" }).click();
  await page.goto(`${base}/reference`);
  await page.getByRole("combobox", { name: "Reference list" }).selectOption("pf2e-orc.ancestries");
  await expect(page.getByTestId("reference-items").getByRole("row").filter({ hasText: "Dwarf" })).toBeVisible();
  await expect(page.getByTestId("reference-items").getByRole("row").filter({ hasText: "Centaur" })).toHaveCount(0);

  expect(errors).toEqual([]);
});
