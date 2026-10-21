/**
 * Supplements end to end: import the original "Thornwick Homebrew" supplement
 * for the SRD 5.1 module in Game modules, see it listed under the module (and
 * a broken one refused with its JSON path), create a 5e campaign, and give a
 * player character the supplement's background and subclass from the sheet's
 * suggestions; the reference browser and settings name the supplement.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const file = fileURLToPath(new URL("../../../packages/module-dnd5e-srd/supplements/thornwick-homebrew.supplement.json", import.meta.url));
const text = readFileSync(file, "utf8");
const upload = (body: string, name = "thornwick-homebrew.supplement.json") => ({ name, mimeType: "application/json", buffer: Buffer.from(body) });

test("import a supplement, then pick its background and subclass on a 5e PC sheet", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 1000 });

  // 1. a supplement that adds to a list the module does not have is refused, with the path
  await page.goto("/");
  await page.getByTestId("open-modules").click();
  const modules = page.getByRole("dialog", { name: "Game modules" });
  const broken = JSON.parse(text) as Record<string, any>;
  broken.referenceItems["dnd5e-srd.species"] = [{ id: "thornwick-homebrew.x", name: "X" }];
  await modules.getByTestId("pack-file-input").setInputFiles(upload(JSON.stringify(broken)));
  await expect(modules.getByTestId("pack-errors")).toContainText('$.referenceItems["dnd5e-srd.species"]');
  await expect(modules.getByTestId("pack-errors")).toContainText('has no reference list "dnd5e-srd.species"');

  // 2. the real one imports and is listed under the module it extends
  await modules.getByTestId("pack-file-input").setInputFiles(upload(text));
  const row = modules.getByTestId("module-dnd5e-srd").getByTestId("supplement-thornwick-homebrew");
  await expect(row).toContainText("Thornwick Homebrew");
  await expect(row).toContainText("Imported");
  await expect(row).toContainText("Supplement");
  await expect(row).toContainText("extends dnd5e-srd ^0.1.0");
  await expect(row.getByTestId("supplement-notice-thornwick-homebrew")).toContainText("Original homebrew for the Thornwick Crossing demo");
  await modules.getByRole("button", { name: "Close" }).click();

  // 3. a 5e campaign and a rogue
  await page.getByRole("button", { name: "New campaign" }).click();
  const create = page.getByRole("dialog", { name: "New campaign" });
  await create.getByLabel("Name", { exact: true }).fill("Down the Brackwater");
  await create.getByRole("combobox", { name: "Game module" }).selectOption("dnd5e-srd");
  await create.getByRole("button", { name: "Create campaign" }).click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 30_000 });
  const base = page.url().replace(/\/home$/, "");
  await page.goto(`${base}/entities/new?type=dnd5e-srd.character`);
  await page.getByTestId("entity-name").fill("Pell");
  await page.getByTestId("create-entity").click();
  await expect(page.getByTestId("entity-page")).toBeVisible();
  await page.getByRole("combobox", { name: "Class", exact: true }).selectOption("rogue");

  // 4. background and subclass offer the supplement's options (subclasses follow the class); picking one stores its name
  const background = page.getByRole("combobox", { name: "Background", exact: true });
  await expect(page.locator('[data-testid="options-background"] option[value="Ferrywright"]')).toHaveAttribute("label", "Thornwick Homebrew");
  await expect(page.locator('[data-testid="options-background"] option[value="Acolyte"]')).toHaveCount(1);
  await background.fill("Ferrywright");
  const subclassOptions = page.locator('[data-testid="options-subclass"] option');
  await expect(subclassOptions).toHaveCount(2);
  await expect(subclassOptions.nth(0)).toHaveAttribute("value", "Thief");
  await expect(subclassOptions.nth(1)).toHaveAttribute("value", "Lantern Thief");
  await page.getByRole("combobox", { name: "Subclass", exact: true }).fill("Lantern Thief");
  await expect(page.locator('[data-testid="options-race"] option[value="Mossborn"]')).toHaveCount(1);
  await page.getByRole("combobox", { name: "Race", exact: true }).fill("Mossborn");
  // free text still works
  await page.getByRole("combobox", { name: "Subrace", exact: true }).fill("Deepmoss");
  await page.waitForTimeout(600);
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Background", exact: true })).toHaveValue("Ferrywright");
  await expect(page.getByRole("combobox", { name: "Subclass", exact: true })).toHaveValue("Lantern Thief");
  await expect(page.getByRole("combobox", { name: "Subrace", exact: true })).toHaveValue("Deepmoss");

  // 5. the reference browser marks the supplement's items, and settings list it as active
  await page.goto(`${base}/reference`);
  await page.getByRole("combobox", { name: "Reference list" }).selectOption("dnd5e-srd.backgrounds");
  const ferry = page.getByTestId("reference-items").getByRole("row").filter({ hasText: "Ferrywright" });
  await expect(ferry.getByTestId("source-badge")).toHaveText("Thornwick Homebrew");
  await page.goto(`${base}/settings`);
  await expect(page.getByTestId("active-supplement-thornwick-homebrew")).toContainText("Thornwick Homebrew");

  expect(errors).toEqual([]);
});
