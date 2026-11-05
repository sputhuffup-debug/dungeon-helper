/**
 * The ORC module's guide, "Your first ORC campaign": opened from a new ORC
 * campaign's Home, its Look it up links open the Reference page (a list, a
 * roll table, a preset), a Take me there link opens the settlement
 * generator, and "Open the quest" waits for the quest the generator's local
 * trouble puts on the quest board. The campaign list offers the same guide
 * before any campaign exists, and a one-shot campaign says it is written for
 * campaign play.
 */
import { expect, test, type Page } from "@playwright/test";

const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "Campaign" }).getByRole("link", { name, exact: true });
const takeMeThere = (page: Page, title: string) => page.getByRole("group", { name: `Take me there: ${title}` });
const lookUp = (page: Page, title: string) => page.getByRole("group", { name: `Look it up: ${title}` });

async function newOrcCampaign(page: Page, name: string, mode: "Campaign" | "One-shot" = "Campaign") {
  await page.goto("/");
  await page.getByRole("button", { name: "New campaign" }).click();
  const dialog = page.getByRole("dialog", { name: "New campaign" });
  await dialog.getByLabel("Name", { exact: true }).fill(name);
  await dialog.getByRole("combobox", { name: "Game module" }).selectOption("pf2e-orc");
  await dialog.getByRole("radio", { name: new RegExp(`^${mode}`) }).check();
  await dialog.getByRole("button", { name: "Create campaign" }).click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 30_000 });
}

/** Home, then its Guide button. */
async function openGuide(page: Page) {
  await nav(page, "Home").click();
  await page.getByTestId("home-guide").click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/guide$/);
  await expect(page.getByRole("heading", { level: 1, name: "Your first ORC campaign" })).toBeVisible();
}

test("ORC guide: from a new campaign's Home, its Look it up and Take me there links lead into the campaign", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await newOrcCampaign(page, "The Wardens of Mossford");

  await openGuide(page);
  const guide = page.getByTestId("guide");
  await expect(guide.getByRole("navigation", { name: "Chapters" }).getByRole("link")).toHaveCount(7);
  await expect(guide.getByRole("article")).toHaveCount(28);
  await expect(page.getByTestId("guide-mode-note")).toHaveCount(0);
  // the first step's screenshot is built in and loads
  const img = page.getByRole("article", { name: /Start a campaign/ }).getByRole("img");
  await expect(img).toBeVisible();
  expect(await img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);

  // Look it up: the classes list, the settlement size table and a Monster Core stat block, on the Reference page
  await lookUp(page, "Build a character").getByRole("link", { name: "Classes" }).click();
  await expect(page).toHaveURL(/\/reference\?.*list=pf2e-orc\.classes/);
  await expect(page.getByRole("combobox", { name: "Reference list" })).toHaveValue("pf2e-orc.classes");
  await page.goBack();
  await expect(page).toHaveURL(/\/guide$/);
  await lookUp(page, "Or roll a settlement and its tavern").getByRole("link", { name: "Settlement size" }).click();
  await expect(page).toHaveURL(/\/reference\?.*table=pf2e-orc\.settlement\.size/);
  await expect(page.getByRole("dialog", { name: /Settlement size/ })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/guide$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await lookUp(page, "An NPC from a stat block").getByRole("link", { name: "Halfling Street Watcher" }).click();
  await expect(page).toHaveURL(/\/reference\?.*preset=pf2e-orc\.preset\.halfling-street-watcher/);
  // the Presets tab has drawn the stat block's row before going back
  await expect(page.locator("tr.is-target")).toContainText("Halfling Street Watcher");
  await page.goBack();
  await expect(page).toHaveURL(/\/guide$/);

  // "Open the quest" waits for a quest: none yet
  await expect(takeMeThere(page, "A quest from the quest board").getByRole("link", { name: "Open the quest" })).toHaveCount(0);

  // Take me there: the settlement generator; its local trouble lands on the quest board
  const rollLink = takeMeThere(page, "Or roll a settlement and its tavern").getByRole("link", { name: "Roll a settlement" });
  try {
    await expect(rollLink).toBeVisible({ timeout: 15_000 });
  } catch (e) {
    // DIAGNOSTIC (temporary): what the page shows when the link is missing
    console.log("URL", page.url());
    const t0 = Date.now();
    const text = await Promise.race([page.evaluate(() => `articles=${document.querySelectorAll("article").length} title=${document.title}\n${document.body.innerText.slice(0, 3000)}`), new Promise<string>((r) => setTimeout(() => r("EVALUATE HUNG"), 5000))]);
    console.log(`after ${Date.now() - t0} ms:`, text);
    console.log(await page.locator("main").ariaSnapshot({ timeout: 5000 }).catch((x) => `no main: ${x}`));
    throw e;
  }
  await rollLink.click();
  await expect(page).toHaveURL(/\/generate\/pf2e-orc\.proc\.settlement$/);
  await page.getByTestId("seed").fill("mossford-7");
  await expect(page.getByTestId("step-result-trouble")).toHaveText("Livestock vanish at night");
  await page.getByTestId("accept").click();
  await expect(page).toHaveURL(/\/entities\/[0-9A-Z]{26}$/, { timeout: 15_000 });
  await nav(page, "Home").click();
  await expect(page.getByRole("region", { name: "Quest board" })).toContainText("Livestock vanish at night");

  // now the quest link is there, and opens it
  await openGuide(page);
  await takeMeThere(page, "A quest from the quest board").getByRole("link", { name: "Open the quest" }).click();
  await expect(page).toHaveURL(/\/entities\/[0-9A-Z]{26}$/);
  await expect(page.getByTestId("entity-title")).toHaveValue("Livestock vanish at night");

  // and a new location, from the settlement step
  await openGuide(page);
  await takeMeThere(page, "Add a settlement").getByRole("link", { name: "New location" }).click();
  await expect(page).toHaveURL(/\/entities\/new\?type=pf2e-orc\.location$/);

  // and a new NPC: the button keeps the acronym ("Create NPC", as the guide says)
  await openGuide(page);
  await takeMeThere(page, "An NPC by hand, and the NPCs tab").getByRole("link", { name: "New NPC" }).click();
  await expect(page).toHaveURL(/\/entities\/new\?type=pf2e-orc\.npc$/);
  await expect(page.getByTestId("create-entity")).toHaveText("Create NPC");

  expect(errors).toEqual([]);
});

test("ORC guide: the campaign list opens it before any campaign; a one-shot campaign says it is written for campaign play", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.locator('[data-module="pf2e-orc"]').getByTestId("module-guide").click();
  await expect(page).toHaveURL(/\/guide\/pf2e-orc$/);
  await expect(page.getByRole("heading", { level: 1, name: "Your first ORC campaign" })).toBeVisible();
  await expect(page.getByTestId("guide-no-campaign")).toContainText("Start a campaign with Fantasy d20 Remaster (ORC)");
  await expect(page.getByRole("article")).toHaveCount(28);
  await expect(page.getByTestId("guide-link")).toHaveCount(0);

  await newOrcCampaign(page, "One night in Mossford", "One-shot");
  await openGuide(page);
  await expect(page.getByTestId("guide-mode-note")).toContainText("Written for Campaign play. This campaign is One-shot");
  expect(errors).toEqual([]);
});
