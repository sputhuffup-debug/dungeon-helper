/**
 * What the players get, end to end: a GM-only fifth edition PC reaches its
 * own player whole (the player sheet with the real numbers, never schema
 * defaults; the GM's notes left out), a monster set to Players shows its
 * name and kind but not its stat block, the Atlas player preview offers
 * neither GM-only tags nor the GM's creation buttons, the NPCs tab makes an
 * NPC; and the player screen heads a scene with its player-facing title,
 * never the GM's.
 */
import { expect, test, type Page } from "@playwright/test";

const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "Campaign" }).getByRole("link", { name, exact: true });

async function newEntity(page: Page, base: string, query: string, name: string): Promise<string> {
  await page.goto(`${base}/entities/new?${query}`);
  await page.getByTestId("entity-name").fill(name);
  await page.getByTestId("create-entity").click();
  await expect(page.getByTestId("entity-page")).toBeVisible();
  return page.url().split("?")[0]!;
}

test("5e: a player's own GM-only PC, a monster's stat block, the Atlas preview and the NPCs tab", async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "New campaign" }).click();
  const create = page.getByRole("dialog", { name: "New campaign" });
  await create.getByLabel("Name", { exact: true }).fill("The Ember Vale");
  await create.getByRole("combobox", { name: "Game module" }).selectOption("dnd5e-srd");
  await create.getByRole("button", { name: "Create campaign" }).click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 30_000 });
  const base = page.url().replace(/\/home$/, "");

  // the NPCs tab, empty, makes an NPC (not a player character), and so does its + New
  await page.goto(`${base}/atlas?tab=npcs`);
  const npcs = page.getByRole("tabpanel");
  await expect(npcs.getByRole("link", { name: "+ NPC", exact: true })).toBeVisible();
  await expect(npcs.getByRole("link", { name: "+ Player character" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "+ New", exact: true })).toHaveAttribute("href", /type=dnd5e-srd\.npc/);

  // a PC, GM only as every new character is, with its numbers and a GM note
  const tamsin = await newEntity(page, base, "type=dnd5e-srd.character&pc=1", "Tamsin Reedle");
  await page.getByRole("spinbutton", { name: "Level", exact: true }).fill("5");
  await page.getByRole("spinbutton", { name: "Armor Class", exact: true }).fill("17");
  await page.getByRole("spinbutton", { name: "Dexterity", exact: true }).fill("14");
  await page.getByRole("spinbutton", { name: "Level", exact: true }).press("Tab");
  await expect(page.getByRole("combobox", { name: "Visibility", exact: true })).toHaveValue("gm");

  // Jo plays her
  await nav(page, "Settings").click();
  const card = page.getByTestId("players-card");
  await card.getByTestId("player-new-name").fill("Jo");
  await card.getByTestId("player-add").click();
  await card.getByRole("group", { name: "Characters Jo plays" }).getByRole("checkbox").first().check();

  // her player sheet is the sheet Jo plays from: the real level, AC and Dexterity modifier, no GM notes
  await page.goto(tamsin);
  await page.getByTestId("player-sheet-toggle").check();
  await expect(page.locator(".app-note").filter({ hasText: "What Jo sees of their own character" })).toBeVisible();
  // read-only: the values as text (a stripped field used to read as its default, Level 1 and AC 10)
  await expect(page.locator('[data-path="level"]')).toContainText("5");
  await expect(page.locator('[data-path="ac"]')).toContainText("17");
  await expect(page.getByTestId("computed-dexterityMod")).toHaveText("+2");
  await expect(page.locator('[data-section="notes"]')).toHaveCount(0);
  await page.getByTestId("player-sheet-toggle").uncheck();

  // a goblin the party meets (Players) and a knight they have not (GM only)
  const goblin = await newEntity(page, base, "type=dnd5e-srd.monster&preset=dnd5e-srd.preset.goblin", "Goblin lookout");
  await page.getByRole("combobox", { name: "Visibility", exact: true }).selectOption("players");
  await newEntity(page, base, "type=dnd5e-srd.monster&preset=dnd5e-srd.preset.knight", "Warden-Captain Edda");
  // the players see the goblin's name, size and kind, not its stat block
  await page.goto(`${goblin}?as=player`);
  const sheet = page.getByTestId("player-preview-sheet");
  await expect(sheet).toContainText("Small");
  for (const stat of ["Armor Class", "Hit points", "Challenge", "Actions", "Strength"]) await expect(sheet, stat).not.toContainText(stat);

  // the Atlas preview: no GM-only tags in the filter, no creation buttons
  await page.goto(`${base}/atlas?tab=creatures`);
  const tags = page.getByRole("combobox", { name: "Filter by tag" });
  await expect(tags.locator("option", { hasText: "cr 3" })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "+ New", exact: true })).toBeVisible();
  await page.getByTestId("preview-as-player").check();
  await expect(tags.locator("option", { hasText: "cr 3" })).toHaveCount(0);
  await expect(tags.locator("option", { hasText: "cr 1/4" })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "+ New", exact: true })).toHaveCount(0);
  await page.getByRole("tab", { name: /^NPCs/ }).click();
  await expect(page.getByRole("tabpanel").getByRole("link", { name: /^\+ / })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the player screen's fight lists the player characters by name, whatever their visibility", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.goto("/");
  await page.getByTestId("load-demo-5e").click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 30_000 });
  // the four PCs GM only, as a new campaign's are
  const base = page.url().replace(/\/home$/, "");
  await page.goto(`${base}/atlas?tab=pcs`);
  const pcs = page.getByRole("tabpanel").getByRole("link");
  await expect(pcs).toHaveCount(4);
  const names = (await pcs.allTextContents()).map((n) => n.trim());
  for (const name of names) {
    await page.getByRole("tabpanel").getByRole("link", { name, exact: true }).click();
    await page.getByRole("combobox", { name: "Visibility", exact: true }).selectOption("gm");
    await page.goBack();
  }
  await page.getByRole("link", { name: "Sessions" }).click();
  await page.getByRole("button", { name: "Start session 1" }).click();
  const combat = page.getByTestId("d20-combat");
  await combat.getByTestId("roll-initiative-all").click();
  await expect(combat.getByTestId("combat-round")).toHaveText("Round 1");
  const popup = context.waitForEvent("page");
  await page.getByRole("button", { name: "Player screen", exact: true }).click();
  const players = await popup;
  const fight = players.getByTestId("player-combat");
  await expect(fight).toBeVisible();
  for (const name of names) await expect(fight.locator("[data-combatant]").filter({ hasText: name })).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("the player screen heads a scene with its player-facing title, never the GM's", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByTestId("load-demo").click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 30_000 });
  await nav(page, "Sessions").click();
  await page.getByRole("button", { name: "Start session 2" }).click();
  await expect(page.getByTestId("table-mode")).toBeVisible();
  const scenes = page.getByRole("combobox", { name: "Scene" });
  // a scene of the job's acts, with a GM title and no player title
  const option = scenes.locator("option").filter({ hasNotText: "The ore run" }).nth(1);
  const gmTitle = (await option.textContent())!.trim();
  await scenes.selectOption((await option.getAttribute("value"))!);
  const popup = context.waitForEvent("page");
  await page.getByRole("button", { name: "Player screen", exact: true }).click();
  const players = await popup;
  const heading = players.getByTestId("player-scene-title");
  await expect(heading).toBeVisible();
  await expect(heading).not.toHaveText(gmTitle);
  await expect(heading).not.toHaveText("");
  // a scene with a player title reads as it
  await scenes.selectOption((await scenes.locator("option", { hasText: "The ore run" }).getAttribute("value"))!);
  await expect(heading).toHaveText("The ore run");
  expect(errors).toEqual([]);
});
