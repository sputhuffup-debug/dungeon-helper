import { expect, test, type Page } from "@playwright/test";

/** A campaign on the Example Quest fixture module (offered with the `?dev` flag). */
async function newExampleCampaign(page: Page, name: string) {
  await page.goto("/?dev");
  await page.getByRole("button", { name: "New campaign" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill(name);
  await dialog.getByRole("combobox", { name: "Game module" }).selectOption("example");
  await dialog.getByRole("radio", { name: /^Standard/ }).check();
  await dialog.getByRole("button", { name: "Create campaign" }).click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/);
}

const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "Campaign" }).getByRole("link", { name, exact: true });

test("site map workbench: generate with a fixed seed, re-run a stage, see checks, save, re-open", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1280, height: 900 });

  await newExampleCampaign(page, "Keep Watch");
  await nav(page, "Generate").click();
  const section = page.getByRole("region", { name: "Site maps" });
  await section.getByTestId("map-generator-example.mapgen.keep").click();
  await expect(page).toHaveURL(/\/maps\/new\?generator=example\.mapgen\.keep$/);
  await expect(page.getByRole("heading", { name: /^Small keep/ })).toBeVisible();

  // The brief comes from the generator's inputs schema, with its defaults.
  const brief = page.getByTestId("map-brief");
  await expect(brief.getByRole("spinbutton", { name: "Dark rooms (%)" })).toHaveValue("30");
  await brief.getByRole("spinbutton", { name: "Act the vault door locks" }).fill("3");

  // Generate with a fixed seed.
  await page.getByTestId("map-seed").fill("keep-1");
  await page.getByTestId("map-generate").click();
  const preview = page.getByTestId("map-preview");
  await expect(preview).toBeVisible();
  await expect(preview.getByTestId("sitemap")).toHaveAttribute("data-view", "gm");
  await expect(preview.getByTestId("map-legend")).toBeVisible();
  await expect(page.getByTestId("map-attempts")).toHaveText("1 attempt");
  const firstNames = await preview.locator("svg text").allTextContents();

  // Checks, grouped block / warn.
  const checks = page.getByTestId("map-checks");
  await expect(checks.getByTestId("checks-block")).toContainText("The crawlway has two access points");
  await expect(checks.getByTestId("checks-warn")).toBeVisible();
  await expect(page.getByTestId("map-check-summary")).toHaveText(/checks pass|warning/);

  // Every stage starts on the main seed.
  await expect(page.getByTestId("stage-seed-layout")).toHaveText("keep-1");
  await expect(page.getByTestId("stage-seed-dressing")).toHaveText("keep-1");

  // Re-run the first stage: it gets its own seed, later stages follow on the main seed.
  await page.getByTestId("rerun-layout").click();
  await expect(page.getByTestId("stage-layout")).toHaveAttribute("data-custom-seed", "true");
  await expect(page.getByTestId("stage-seed-layout")).not.toHaveText("keep-1");
  await expect(page.getByTestId("stage-seed-dressing")).toHaveText("keep-1");
  await expect(page.getByTestId("stage-dressing")).toContainText("follows");
  await expect(page.getByTestId("map-diff")).toBeVisible();
  await expect(page.getByTestId("map-seed")).toHaveValue("keep-1");
  const layoutSeed = await page.getByTestId("stage-seed-layout").textContent();
  expect(await preview.locator("svg text").allTextContents()).not.toEqual(firstNames);

  // Save, and land on the map page.
  await page.getByTestId("map-name").fill("Keep site");
  await page.getByTestId("map-save").click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/maps\/[0-9A-Z]{26}$/);
  const mapUrl = page.url();

  // Re-open it from the Generate page: stored seed, brief and stage seeds.
  await nav(page, "Generate").click();
  const saved = page.getByRole("region", { name: "Site maps" });
  await expect(saved.getByRole("link", { name: "Keep site" })).toBeVisible();
  await saved.getByRole("link", { name: "Re-generate" }).first().click();
  await expect(page).toHaveURL(/\/maps\/new\?map=[0-9A-Z]{26}$/);
  await expect(page.getByTestId("regenerate-note")).toContainText("Keep site");
  await expect(page.getByTestId("map-seed")).toHaveValue("keep-1");
  await expect(page.getByTestId("stage-seed-layout")).toHaveText(layoutSeed ?? "");
  await expect(page.getByTestId("map-brief").getByRole("spinbutton", { name: "Act the vault door locks" })).toHaveValue("3");
  await expect(page.getByTestId("map-preview")).toBeVisible();
  await page.getByTestId("map-generate").click();
  await page.getByTestId("map-save").click();
  await expect(page).toHaveURL(mapUrl);

  expect(errors).toEqual([]);
});

test("Alien cinematic builder: the Locations step opens the site map workbench with the adventure", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.goto("/");
  await page.getByRole("button", { name: "New campaign" }).click();
  const create = page.getByRole("dialog");
  await create.getByLabel("Name", { exact: true }).fill("Hadley's Hope");
  await create.getByRole("radio", { name: /^Cinematic/ }).check();
  await create.getByRole("button", { name: "Create campaign" }).click();
  await nav(page, "Adventures").click();
  await page.getByTestId("new-adventure").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: /^Guided: / }).first().check();
  await dialog.getByTestId("create-adventure").click();
  await expect(page.getByTestId("guided-builder")).toBeVisible();
  await page.getByTestId("guided-title").fill("Cold Harbor");
  await page.getByTestId("guided-title").press("Enter");

  await page.getByTestId("step-locations").click();
  await page.getByLabel("New Locations name").fill("Operations");
  await page.getByTestId("cast-add-locations").click();
  await expect(page.getByTestId("cast-member")).toHaveCount(1);

  const builderUrl = page.url();
  const card = page.getByTestId("site-map-card");
  test.skip((await card.count()) === 0, "The Alien module has no map generator that reads adventures yet");
  await card.getByTestId("generate-site-map").click();
  await expect(page).toHaveURL(/\/maps\/new\?.*adventure=[0-9A-Z]{26}/);
  await expect(page.getByTestId("adventure-note")).toContainText("Cold Harbor");
  await expect(page.getByTestId("prefill-summary")).toBeVisible();
  await page.getByTestId("map-seed").fill("cold-harbor");
  await page.getByTestId("map-generate").click();
  await expect(page.getByTestId("map-preview")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("map-checks")).toBeVisible();
  await page.getByTestId("map-save").click();
  await expect(page).toHaveURL(/\/maps\/[0-9A-Z]{26}$/);

  // Back in the builder, the card links the map with its check summary.
  await page.goto(builderUrl);
  await expect(page.getByTestId("guided-builder")).toBeVisible();
  await expect(page.getByTestId("site-map-link")).toHaveText("Cold Harbor site map");
  await expect(page.getByTestId("site-map-checks")).toHaveText(/pass|fail|warning/);
  expect(errors).toEqual([]);
});
