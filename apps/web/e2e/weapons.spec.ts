import { expect, test, type Page } from "@playwright/test";

async function loadDemo(page: Page, button: string): Promise<string> {
  await page.goto("/");
  await page.getByTestId(button).click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 30_000 });
  return page.url().replace(/\/home$/, "");
}

test("Alien weapons: a new PC from the Atlas gets a preset rifle and a custom knife, then attacks at the table with entered dice", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const base = await loadDemo(page, "load-demo");

  // the Atlas's PCs tab: + New opens the form for a player character
  await page.goto(`${base}/atlas`);
  await page.getByRole("tab", { name: /^PCs/ }).click();
  await page.getByRole("link", { name: "+ New" }).click();
  await expect(page).toHaveURL(/\/entities\/new\?.*pc=1/);
  const create = page.getByTestId("create-fields");
  await expect(create.locator('[data-path="isPC"] input[type="checkbox"]')).toBeChecked();

  // Add weapon: the picker groups the gear tables' weapons and leaves out vehicle-mounted ones
  await create.getByRole("button", { name: "Add weapon" }).click();
  const picker = page.getByTestId("weapon-picker");
  await expect(picker.getByRole("heading")).toHaveText(["Ranged", "Melee", "Explosive"]);
  await expect(picker.getByText("20 mm Gatling Gun")).toHaveCount(0);
  await picker.getByRole("searchbox", { name: "Search weapons" }).fill("M41A");
  const rifleRow = picker.getByRole("row", { name: /Armat M41A Pulse Rifle/ });
  await expect(rifleRow).toContainText("+2");
  await expect(rifleRow).toContainText("S/L");
  await expect(rifleRow).toContainText("p. 84");
  await rifleRow.getByRole("button", { name: "Add Armat M41A Pulse Rifle" }).click();
  await expect(picker).toHaveCount(0);

  // a custom knife, edited inline
  await create.getByRole("button", { name: "Custom weapon" }).click();
  await create.getByRole("textbox", { name: "Weapon 2 name" }).fill("Knife");
  await create.getByRole("spinbutton", { name: "Knife damage" }).fill("2");
  await create.getByRole("spinbutton", { name: "Knife weight" }).fill("0.5");
  await create.getByRole("button", { name: "Edit Knife" }).click();
  await expect(create.getByTestId("weapons-total")).toContainText("Weapons weight 1.5");

  await page.getByTestId("entity-name").fill("Dana Reyes");
  await page.getByTestId("create-entity").click();
  await expect(page).toHaveURL(/\/entities\/[0-9A-Z]{26}$/);

  // the sheet: a Weapons section with both rows, and encumbrance counting them (Strength 3: limit 6)
  const weapons = page.locator('[data-section="weapons"]');
  const table = weapons.getByTestId("weapons-table");
  await expect(table.getByRole("rowheader")).toHaveText(["Armat M41A Pulse Rifle", "Knife"]);
  await expect(table.getByRole("row", { name: /Armat M41A Pulse Rifle/ })).toContainText("Armor piercing, Full auto, Grenade launcher");
  await expect(weapons.getByTestId("weapons-total")).toContainText("Encumbrance 1.5");
  await expect(weapons.getByTestId("weapons-total")).toContainText("/ 6");
  await expect(page.locator('[data-section="gear"]').getByTestId("gear-total")).toContainText(/Encumbrance 1.5\s*\/ 6/);

  // table mode: the Dice tab offers an attack with each weapon; the group rolls physical dice
  await page.getByRole("link", { name: "Sessions" }).click();
  await page.getByRole("button", { name: "Start session 1" }).click();
  await expect(page.getByTestId("table-mode")).toBeVisible();
  await page.getByRole("tab", { name: "Dice" }).click();
  await page.getByTestId("dice-mode-enter").first().click();
  const skill = page.locator(".app-table__skillroll");
  await skill.getByRole("combobox", { name: "Character" }).selectOption({ label: "Dana Reyes" });
  await skill.getByRole("combobox", { name: "Skill" }).selectOption({ label: "Attack with Armat M41A Pulse Rifle" });
  const attack = skill.getByTestId("weapon-attack");
  await expect(attack.getByRole("combobox", { name: "Range" })).toHaveValue("short");
  await expect(attack.getByText("Ranged Combat", { exact: true })).toBeVisible();
  // Agility 3 + Ranged Combat 0 + the rifle's +2: five base dice
  const form = attack.getByTestId("enter-dice");
  await expect(form.locator("[data-testid^=enter-die-]")).toHaveCount(5);
  for (const [i, f] of [6, 6, 2, 3, 4].entries()) await form.getByTestId(`enter-die-${i}`).fill(String(f));
  await form.getByTestId("enter-dice-submit").click();
  await expect(attack.getByTestId("successes")).toHaveText("2");
  await expect(attack.getByTestId("weapon-damage")).toContainText("Hit: 3 damage");
  await expect(attack.getByTestId("weapon-damage")).toContainText("2 base + 1 for extra success");
  await expect(page.getByRole("list", { name: "Roll log" })).toContainText("Dana Reyes: Armat M41A Pulse Rifle (Ranged Combat, Short)");

  // the PC's card has an Attack button for the same panel
  await page.locator(`.app-participant`).filter({ hasText: "Dana Reyes" }).getByRole("button", { name: "Attack with a weapon: Dana Reyes" }).click();
  const dialog = page.getByRole("dialog", { name: "Attack: Dana Reyes" });
  await dialog.getByRole("combobox", { name: "Weapon" }).selectOption({ label: "Attack with Knife" });
  await expect(dialog.getByRole("combobox", { name: "Range" }).locator("option")).toHaveText(["Adjacent"]);
  await expect(dialog.getByText("Close Combat", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();
  expect(errors).toEqual([]);
});
