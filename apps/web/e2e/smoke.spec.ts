import { expect, test } from "@playwright/test";

test("create an Alien campaign, add an NPC from a preset, mention it in a note, see the backlink", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // 1. campaign list -> create campaign with the Alien module
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Campaign Forge" })).toBeVisible();
  await page.getByRole("button", { name: "New campaign" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("Nostromo Run");
  await expect(dialog.getByRole("combobox", { name: "Game module" })).toHaveValue("alien");
  await expect(dialog.getByRole("radio", { name: /Campaign/ })).toBeChecked();
  await dialog.getByLabel("GM name").fill("Dallas");
  await dialog.getByRole("button", { name: "Create campaign" }).click();

  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/);
  await expect(page.getByTestId("campaign-name")).toHaveText("Nostromo Run");
  await expect(page.getByTestId("mode-badge")).toHaveText("Campaign");

  // 2. NPC from a preset
  await page.getByTestId("quick-npc").click();
  await expect(page).toHaveURL(/entities\/new/);
  await page.getByRole("searchbox", { name: "Search presets" }).fill("Colonial Marine");
  await page.getByRole("radio", { name: /^Colonial Marine/ }).first().check();
  await page.getByTestId("entity-name").fill("Corporal Hicks");
  await page.getByTestId("create-entity").click();

  // 3. the sheet renders, with a computed field
  await expect(page.getByTestId("entity-page")).toBeVisible();
  await expect(page.getByTestId("entity-title")).toHaveValue("Corporal Hicks");
  const health = page.getByTestId("computed-health");
  await expect(health).toBeVisible();
  await expect(health).toHaveText(/^\d+$/);
  const entityUrl = page.url();

  // player-sheet preview works for characters
  await page.getByTestId("player-sheet-toggle").check();
  await expect(page.getByText(/Hidden from players|What a player would see/)).toBeVisible();
  await page.getByTestId("player-sheet-toggle").uncheck();

  // 4. a note with an @ mention
  await page.getByRole("link", { name: "Home" }).click();
  await page.getByTestId("quick-note").click();
  await expect(page.getByTestId("note-page")).toBeVisible();
  const editor = page.locator(".cf-editor__content");
  await editor.click();
  await page.keyboard.type("Briefing with @Hick");
  const popup = page.getByTestId("mention-popup");
  await expect(popup.getByRole("option", { name: /Corporal Hicks/ })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(editor.locator(".cf-entity-ref")).toHaveText(/Corporal Hicks/);
  await page.keyboard.type("about the derelict.");
  // let IndexedDB persist the note body
  await page.waitForTimeout(400);

  // 5. the backlink shows on the NPC's page (reached through global search)
  await page.getByRole("searchbox", { name: "Search campaign" }).fill("Hicks");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(entityUrl.split("?")[0] ?? entityUrl);
  await page.getByRole("tab", { name: "Backlinks" }).click();
  const backlinks = page.getByTestId("backlinks");
  await expect(backlinks).toContainText("New note");
  await expect(backlinks).toContainText("via mention");

  // 6. it survives a reload (persisted locally)
  await page.reload();
  await page.getByRole("tab", { name: "Backlinks" }).click();
  await expect(page.getByTestId("backlinks")).toContainText("via mention");

  expect(errors).toEqual([]);
});

test("placeholder routes render", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New campaign" }).click();
  await page.getByRole("dialog").getByLabel("Name", { exact: true }).fill("Placeholder check");
  await expect(page.getByRole("dialog").getByRole("radio", { name: /Campaign/ })).toBeChecked();
  await page.getByRole("dialog").getByRole("button", { name: "Create campaign" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.getByRole("link", { name: "Adventures" }).first().click();
  await expect(page.getByTestId("placeholder")).toContainText("Coming in the next build step");
  await page.getByRole("link", { name: "Rules" }).click();
  await expect(page.getByRole("heading", { name: "Rules" })).toBeVisible();
});
