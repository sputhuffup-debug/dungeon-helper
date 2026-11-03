import { expect, test, type Page } from "@playwright/test";

const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "Campaign" }).getByRole("link", { name, exact: true });

async function startSessionTwo(page: Page) {
  await page.goto("/");
  await page.getByTestId("load-demo").click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 30_000 });
  await nav(page, "Sessions").click();
  await page.getByRole("button", { name: "Start session 2" }).click();
  await expect(page.getByTestId("table-mode")).toBeVisible();
}

test("a skill roll with a gear pick and a modifier stays on the PC and is logged with both", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await startSessionTwo(page);
  await page.getByRole("tab", { name: "Dice" }).click();
  const skill = page.locator(".app-table__skillroll");
  await skill.getByRole("combobox", { name: "Character" }).selectOption({ label: "Lee-Ann Jenkins" });
  await skill.getByRole("combobox", { name: "Skill" }).selectOption({ label: "Medical Aid (Empathy)" });
  // her personal medkit helps MEDICAL AID; nothing on her helps COMTECH
  const gear = skill.getByRole("combobox", { name: "Gear bonus" });
  await expect(gear.locator("option")).toHaveText(["No gear", "Personal medkit (+2)"]);
  await gear.selectOption({ label: "Personal medkit (+2)" });
  const panel = skill.getByTestId("dice-panel");
  const stepper = panel.getByTestId("roll-option-modifier");
  await stepper.getByRole("button", { name: "Increase Modifier (dice)" }).click();
  await stepper.getByRole("button", { name: "Increase Modifier (dice)" }).click();
  await stepper.getByRole("button", { name: "Decrease Modifier (dice)" }).click();
  await expect(panel.getByTestId("dicepool")).toContainText("Gear");
  await expect(panel.getByTestId("dicepool")).toContainText("Modifier");
  await panel.getByRole("button", { name: "Roll", exact: true }).click();
  await expect(panel.getByTestId("describe")).toContainText(/^9 base \+ 0 stress/);
  await expect(page.getByRole("list", { name: "Roll log" }).locator("li").first()).toContainText("Lee-Ann Jenkins: Medical Aid (Personal medkit +2, Modifier +1)");
  await skill.getByRole("combobox", { name: "Skill" }).selectOption({ label: "Comtech (Wits)" });
  await expect(skill.getByRole("combobox", { name: "Gear bonus" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the GM clears the player screen: earlier reveals leave, pins stay, a new reveal shows, Undo puts it back", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1200 });
  await startSessionTwo(page);
  const scenes = page.getByRole("combobox", { name: "Scene" });
  await scenes.selectOption((await scenes.locator("option", { hasText: "The ore run" }).getAttribute("value"))!);
  const popup = context.waitForEvent("page");
  await page.getByRole("button", { name: "Player screen", exact: true }).click();
  const players = await popup;
  const shown = players.getByRole("region", { name: "Handouts" }).locator("[data-handout] h3");
  await expect(players.getByTestId("player-screen")).toBeVisible();
  await expect(shown).toHaveCount(0);
  // no rulebook page refs on the players' side (the clock's)
  await expect(players.locator(".cf-page")).toHaveCount(0);

  const reveal = page.getByTestId("reveal-panel");
  await reveal.getByRole("button", { name: "Reveal Ore manifest" }).click();
  await expect(shown).toHaveText(["Ore manifest"]);
  // pin the job's posting (the players may see it; it was off the screen)
  const off = reveal.getByTestId("off-screen");
  await off.locator("summary").click();
  await off.getByRole("button", { name: "Pin Posting: Ore to the spaceport to the player screen" }).click();
  await expect(shown).toHaveText(["Ore manifest", "Posting: Ore to the spaceport"]);

  // clear the screen: the manifest leaves, the pinned posting stays
  await reveal.getByTestId("clear-screen").click();
  await expect(shown).toHaveText(["Posting: Ore to the spaceport"]);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(shown).toHaveText(["Ore manifest", "Posting: Ore to the spaceport"]);
  // the header's control clears it too; showing the manifest again puts only it back up
  await page.getByTestId("header-clear-screen").click();
  await expect(shown).toHaveText(["Posting: Ore to the spaceport"]);
  await reveal.getByRole("button", { name: "Show Ore manifest on the player screen again" }).click();
  await expect(shown).toHaveText(["Ore manifest", "Posting: Ore to the spaceport"]);
  // unpinned, the posting leaves at the next clear
  await reveal.getByTestId("on-screen").getByRole("button", { name: "Unpin Posting: Ore to the spaceport from the player screen" }).click();
  await reveal.getByTestId("clear-screen").click();
  await expect(shown).toHaveCount(0);
  await expect(players.getByText("personal agenda")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a PC's sheet cash is their ledger account: it shows, starts their ledger, and an entry to them moves the sheet", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.goto("/");
  await page.getByTestId("load-demo").click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 30_000 });
  await nav(page, "Ship").click();
  const accounts = page.getByRole("list", { name: "Personal accounts" });
  await expect(accounts.locator("li", { hasText: "Lee-Ann Jenkins" })).toContainText("$600");
  await expect(accounts.locator("li", { hasText: "Sheridan Lamara" })).toContainText("$2,000");
  await expect(page.getByTestId("funds-balance")).toHaveText("$18,330");

  await page.getByRole("combobox", { name: "Filter by account" }).selectOption({ label: "Lee-Ann Jenkins" });
  await expect(page.getByTestId("ledger-opening")).toContainText("$600");
  const add = page.getByTestId("ledger-add");
  await add.getByRole("combobox", { name: "Entry category" }).selectOption({ label: "Salary" });
  await add.getByRole("textbox", { name: "Amount" }).fill("250");
  await add.getByRole("combobox", { name: "Account" }).selectOption({ label: "Lee-Ann Jenkins" });
  await page.getByTestId("ledger-add-submit").click();
  await expect(accounts.locator("li", { hasText: "Lee-Ann Jenkins" })).toContainText("$850");
  // the crew funds are untouched, and her ledger ends at her sheet
  await expect(page.getByTestId("funds-balance")).toHaveText("$18,330");
  await expect(page.getByTestId("ledger-row").last()).toContainText("$850");

  // her sheet holds it (in-app navigation: the write is saved asynchronously)
  await nav(page, "Atlas").click();
  await page.getByRole("tab", { name: /^PCs/ }).click();
  await page.getByRole("link", { name: "Lee-Ann Jenkins", exact: true }).first().click();
  await expect(page.getByRole("spinbutton", { name: "Cash ($)" })).toHaveValue("850");
  expect(errors).toEqual([]);
});
