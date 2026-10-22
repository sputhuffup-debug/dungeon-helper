/**
 * d20 combat in table mode, from the modules' declarative `d20Combat`:
 * Thornwick Crossing (SRD 5.1): initiative with typed dice, a goblin's
 * scimitar hits a PC and the damage is applied, a poisoned PC's next attack
 * roll shows disadvantage with the reason, and Next turn ends the poison
 * when its round is up. Hollowmere (ORC): frightened 2 lowers a check and
 * drops to 1 at the end of the frightened character's turn.
 * `D20_SHOTS=<dir>` keeps screenshots for review.
 */
import { mkdirSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";

const SHOTS = process.env.D20_SHOTS;
async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

async function loadDemo(page: Page, button: string): Promise<string> {
  await page.goto("/");
  await page.getByTestId(button).click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 30_000 });
  return page.url().replace(/\/home$/, "");
}

/** Type the faces into the enter-dice dialog and roll. */
async function enter(page: Page, faces: number[]) {
  const dialog = page.getByRole("dialog").filter({ has: page.getByTestId("enter-dice") }).last();
  const form = dialog.getByTestId("enter-dice");
  await expect(form.locator("[data-testid^=enter-die-]")).toHaveCount(faces.length);
  for (const [i, f] of faces.entries()) await form.getByTestId(`enter-die-${i}`).fill(String(f));
  await form.getByTestId("enter-dice-submit").click();
  await expect(form).toBeHidden();
}

const card = (combat: Locator, name: string) => combat.locator("[data-combatant]").filter({ has: combat.page().getByRole("button", { name: `Open ${name}`, exact: true }) });

test("Thornwick Crossing: a goblin hits, a poisoned PC attacks with disadvantage, Next turn ends the poison", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 1000 });
  await loadDemo(page, "load-demo-5e");
  await page.getByRole("link", { name: "Sessions" }).click();
  await page.getByRole("button", { name: "Start session 1" }).click();
  await expect(page.getByTestId("table-mode")).toBeVisible();
  const combat = page.getByTestId("d20-combat");
  await expect(combat).toBeVisible();

  // initiative with the dice rolled at the table: the goblin goes first, Brannoc second
  await page.getByTestId("dice-mode-enter").first().click();
  await combat.getByTestId("roll-initiative-all").click();
  // participants in order: the four PCs (by name), then the scene's goblins and wolf
  const dialog = page.getByRole("dialog").filter({ has: page.getByTestId("enter-dice") });
  await expect(dialog).toContainText("Brannoc Ashby");
  await enter(page, [19, 2, 3, 4, 20, 1, 1]);
  await expect(combat.getByTestId("current-turn")).toHaveText("Goblin 1's turn");
  await expect(combat.getByTestId("combat-round")).toHaveText("Round 1");

  // Goblin 1 attacks Brannoc with its scimitar: 18 + 4 = 22 against AC 19 hits; 1d6 + 2 = 6 damage
  await card(combat, "Goblin 1").getByRole("button", { name: "Attack with Goblin 1" }).click();
  const attack = page.getByTestId("attack-dialog");
  await expect(attack.getByRole("combobox", { name: "Attack", exact: true })).toHaveValue("0");
  await expect(attack.getByTestId("attack-facts")).toContainText("1d6+2 slashing");
  await attack.getByRole("combobox", { name: "Target" }).selectOption({ label: "Brannoc Ashby" });
  await expect(attack.getByTestId("attack-pool")).toContainText("vs AC 19");
  await attack.getByTestId("roll-attack").click();
  await enter(page, [18]);
  await expect(attack.getByTestId("attack-outcome")).toHaveText("Hit");
  await expect(attack.getByTestId("attack-reason")).toHaveText("22 vs AC 19");
  await attack.getByTestId("roll-damage").click();
  await enter(page, [4]);
  await expect(attack.getByTestId("damage-result")).toContainText("1d6+2 slashing = 6");
  await attack.getByTestId("apply-damage").click();
  await expect(attack.getByTestId("damage-applied")).toContainText("Brannoc Ashby takes 6 damage: HP 22/28");
  await attack.getByRole("button", { name: "Close attack" }).click();
  await expect(card(combat, "Brannoc Ashby").getByTestId("health-value")).toHaveText("22/28");

  // Brannoc is poisoned for 1 round: the helper text shows before it is added
  await card(combat, "Brannoc Ashby").getByRole("button", { name: "Add a condition to Brannoc Ashby" }).click();
  const picker = page.getByTestId("condition-picker");
  await picker.getByRole("searchbox", { name: "Search conditions" }).fill("poison");
  await picker.getByRole("button", { name: /^Poisoned/ }).click();
  await expect(picker.getByTestId("condition-helper")).toHaveText("Disadvantage on attack rolls and ability checks.");
  await expect(picker.getByTestId("condition-automated")).toContainText("disadvantage on attack rolls, checks");
  await picker.getByRole("combobox", { name: "Duration" }).selectOption("rounds");
  await picker.getByRole("combobox", { name: "Source" }).selectOption({ label: "Goblin 1" });
  await picker.getByRole("button", { name: "Add Poisoned" }).click();
  const chip = card(combat, "Brannoc Ashby").locator('[data-condition="poisoned"]');
  await expect(chip).toHaveText("Poisoned");
  await chip.click();
  const help = card(combat, "Brannoc Ashby").getByTestId("condition-help");
  await expect(help.getByTestId("condition-helper")).toHaveText("Disadvantage on attack rolls and ability checks.");
  await expect(help.getByTestId("condition-duration")).toContainText("ends at the end of Brannoc Ashby's turn");

  // Next turn: Brannoc's turn; his longsword attack rolls with disadvantage, and says why
  await combat.getByTestId("next-turn").click();
  await expect(combat.getByTestId("current-turn")).toHaveText("Brannoc Ashby's turn");
  await card(combat, "Brannoc Ashby").getByRole("button", { name: "Attack with Brannoc Ashby" }).click();
  await attack.getByRole("combobox", { name: "Target" }).selectOption({ label: "Goblin 1" });
  await expect(attack.getByTestId("attack-mode").locator("option").first()).toHaveText("From conditions: disadvantage");
  await expect(attack.getByTestId("roll-reasons")).toHaveText("Disadvantage: Poisoned");
  await expect(attack.getByTestId("attack-pool")).toContainText("1d20 + 5 (disadvantage) vs AC 15");
  await attack.getByTestId("roll-attack").click();
  await enter(page, [17, 6]);
  await expect(attack.getByTestId("attack-outcome")).toHaveText("Miss");
  await expect(attack.getByTestId("attack-reason")).toHaveText("11 vs AC 15");
  await shot(page, "dnd5e-attack-disadvantage");
  await attack.getByRole("button", { name: "Close attack" }).click();

  // Brannoc's turn ends: the poison's round is up
  await combat.getByTestId("next-turn").click();
  await expect(combat.getByTestId("turn-ticks")).toContainText("Brannoc Ashby: Poisoned ends");
  await expect(card(combat, "Brannoc Ashby").locator('[data-condition="poisoned"]')).toHaveCount(0);

  // everything went to the session log
  await page.getByRole("tab", { name: "Log" }).click();
  await expect(page.getByRole("list", { name: "Session events" })).toContainText("Goblin 1: Scimitar at Brannoc Ashby: 22 vs AC 19, hit");
  expect(errors).toEqual([]);
});

test("Hollowmere: frightened 2 lowers a check and drops to 1 at the end of the character's turn", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 1000 });
  await loadDemo(page, "load-demo-pf2e");
  await page.getByRole("link", { name: "Sessions" }).click();
  await page.getByRole("button", { name: /^Start session/ }).first().click();
  await expect(page.getByTestId("table-mode")).toBeVisible();
  const combat = page.getByTestId("d20-combat");
  await expect(combat).toBeVisible();
  const first = combat.locator("[data-combatant]").first();
  const name = (await first.getByRole("button", { name: /^Open / }).textContent())!.trim();

  // frightened 2 from the list, with its helper text
  await first.getByRole("button", { name: `Add a condition to ${name}` }).click();
  const picker = page.getByTestId("condition-picker");
  await picker.getByRole("searchbox", { name: "Search conditions" }).fill("fright");
  await picker.getByRole("button", { name: /^Frightened/ }).click();
  await expect(picker.getByTestId("condition-helper")).toContainText("status penalty equal to the value to all its checks and DCs");
  await picker.getByRole("button", { name: "Increase Frightened value" }).click();
  await picker.getByRole("button", { name: "Add Frightened" }).click();
  await expect(first.locator('[data-condition="frightened"]')).toHaveText("Frightened 2");

  // a check from the Dice tab: −2 status, and the roll says why
  await page.getByRole("tab", { name: "Dice" }).click();
  await page.getByRole("combobox", { name: "Character", exact: true }).selectOption({ label: name });
  await page.getByRole("combobox", { name: "Skill", exact: true }).selectOption("perception");
  const panel = page.getByTestId("dice-tab").getByTestId("dice-panel");
  await expect(page.getByTestId("dice-tab").getByTestId("condition-notes")).toContainText("Frightened 2 −2 status");
  await expect(panel.getByTestId("dicepool")).toContainText("Frightened 2 (status)");

  // initiative, then Next turn until the character's turn ends: frightened drops to 1
  await combat.getByTestId("roll-initiative-all").click();
  await expect(combat.getByTestId("current-turn")).toBeVisible();
  for (let i = 0; i < 12; i++) {
    const ticks = combat.getByTestId("turn-ticks");
    if ((await ticks.count()) > 0 && (await ticks.textContent())?.includes(`${name}: Frightened 2 → 1`)) break;
    await combat.getByTestId("next-turn").click();
  }
  await expect(combat.getByTestId("turn-ticks")).toContainText(`${name}: Frightened 2 → 1`);
  await expect(card(combat, name).locator('[data-condition="frightened"]')).toHaveText("Frightened 1");
  await shot(page, "orc-frightened");
  expect(errors).toEqual([]);
});
