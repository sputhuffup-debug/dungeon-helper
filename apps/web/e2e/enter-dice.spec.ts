import { expect, test, type Locator, type Page } from "@playwright/test";

/** Type faces into the enter-dice form, in order. */
async function typeDice(form: Locator, faces: number[]) {
  for (const [i, f] of faces.entries()) await form.getByTestId(`enter-die-${i}`).fill(String(f));
}

async function loadDemo(page: Page, button: string): Promise<string> {
  await page.goto("/");
  await page.getByTestId(button).click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 30_000 });
  return page.url().replace(/\/home$/, "");
}

test("dice rolled at the table (Alien): a skill roll, its push and a panic roll take the typed faces and are logged as entered", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await loadDemo(page, "load-demo");
  await page.getByRole("link", { name: "Sessions" }).click();
  await page.getByRole("button", { name: "Start session 1" }).click();
  await expect(page.getByTestId("table-mode")).toBeVisible();

  // the table's switch: every roll on the page asks for the dice
  await page.getByRole("tab", { name: "Dice" }).click();
  await page.getByTestId("dice-mode-enter").first().click();
  const skill = page.locator(".app-table__skillroll");
  await skill.getByRole("combobox", { name: "Character" }).selectOption({ label: "Elena Sanchez" });
  await skill.getByRole("combobox", { name: "Skill" }).selectOption({ label: "Heavy Machinery (Strength)" });
  const panel = skill.getByTestId("dice-panel");
  const form = panel.getByTestId("enter-dice");
  await expect(form.locator("[data-testid^=enter-die-]")).toHaveCount(4);
  // a wrong face is explained next to its box
  await form.getByTestId("enter-die-0").fill("7");
  await expect(form.getByRole("alert")).toContainText("shows 1–6");
  await expect(form.getByTestId("enter-dice-submit")).toBeDisabled();
  await typeDice(form, [6, 2, 3, 1]);
  await form.getByTestId("enter-dice-submit").click();
  await expect(panel.getByTestId("successes")).toHaveText("1");
  await expect(panel.getByTestId("roll-entered")).toBeVisible();
  await expect(panel.locator(".cf-dice__faces .cf-die")).toHaveCount(4);

  // the push asks only for the three dice it re-rolls, plus the push's stress die
  await panel.getByRole("button", { name: "Push" }).click();
  const push = panel.getByTestId("enter-dice");
  await expect(push.locator("[data-testid^=enter-die-]")).toHaveCount(4);
  await expect(push.getByLabel("Die 4: New stress die (push)")).toBeVisible();
  await typeDice(push, [6, 6, 2, 3]);
  await push.getByTestId("enter-dice-submit").click();
  await expect(panel.getByTestId("successes")).toHaveText("3");
  await expect(panel.getByText("pushed ×1")).toBeVisible();

  // the roll log shows both as rolled at the table, with the faces
  const log = page.getByRole("list", { name: "Roll log" });
  await expect(log.getByTestId("rolllog-entered")).toHaveCount(2);
  await expect(log).toContainText("rolled at the table: 6 2 3 1");

  // a one-tap panic roll opens the dialog, then shows the result with the faces
  await page.getByRole("tab", { name: "Trackers" }).click();
  await page.locator('[data-tracker="alien.stress"]').getByRole("button", { name: "Panic roll" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Enter dice:");
  await dialog.getByTestId("enter-die-0").fill("4");
  await dialog.getByTestId("enter-dice-submit").click();
  await expect(page.getByTestId("roll-result")).toBeVisible();
  await expect(page.getByTestId("roll-result-entered")).toContainText("Rolled at the table: 4");
  await page.getByRole("dialog").getByRole("button", { name: "Done" }).click();

  // the session's event log marks them too
  await page.getByRole("tab", { name: "Log" }).click();
  await expect(page.getByRole("list", { name: "Session events" }).getByTestId("event-entered")).toHaveCount(3);
  expect(errors).toEqual([]);
});

test("dice rolled at the table (5e): a d20 check with advantage keeps the higher typed die", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await loadDemo(page, "load-demo-5e");
  await page.getByRole("link", { name: "Sessions" }).click();
  await page.getByRole("button", { name: "Start session 1" }).click();
  await expect(page.getByTestId("table-mode")).toBeVisible();
  await page.getByRole("tab", { name: "Dice" }).click();
  await page.getByRole("combobox", { name: "Character", exact: true }).selectOption({ label: "Wren Talliver" });
  await page.getByRole("combobox", { name: "Skill", exact: true }).selectOption("stealth");
  const panel = page.getByTestId("dice-tab").getByTestId("dice-panel");
  await expect(panel.getByTestId("dicepool")).toContainText("1d20 + 7");
  await panel.getByTestId("roll-option-dc").fill("15");
  await panel.getByTestId("roll-option-advantage").selectOption("advantage");
  // the table's switch: rolls ask for the dice
  await page.getByTestId("dice-mode-enter").click();
  const form = panel.getByTestId("enter-dice");
  await expect(form.locator("[data-testid^=enter-die-]")).toHaveCount(2);
  await expect(form.getByLabel("Die 2: d20")).toBeVisible();
  await typeDice(form, [4, 12]);
  await form.getByTestId("enter-die-1").press("Enter");
  await expect(panel.getByTestId("roll-total")).toHaveText("19");
  await expect(panel.getByTestId("roll-outcome")).toHaveAttribute("data-outcome", "success");
  await expect(panel.locator('[data-dropped="true"]')).toHaveAttribute("data-value", "4");
  await expect(page.getByRole("list", { name: "Roll log" }).getByTestId("rolllog-entered")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("dice rolled at the table in a generator: one step takes the typed roll, and the accepted run keeps it", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const base = await loadDemo(page, "load-demo");
  await page.goto(`${base}/generate/alien.job.create`);
  await expect(page.getByTestId("workbench")).toBeVisible();
  const step = page.getByTestId("step-difficulty");
  await step.getByRole("button", { name: /^Enter roll for / }).click();
  const form = step.getByTestId("enter-dice");
  await form.getByTestId("enter-die-0").fill("4");
  await expect(form.getByRole("alert")).toContainText("shows 1–3");
  await form.getByTestId("enter-die-0").fill("2");
  await form.getByTestId("enter-dice-submit").click();
  await expect(step.getByTestId("step-entered-difficulty")).toBeVisible();
  await expect(page.getByTestId("step-result-difficulty")).toHaveText("2");
  await expect(page.getByTestId("entered-steps")).toHaveText("1 entered");
  await page.getByTestId("accept").click();
  await expect(page).toHaveURL(/\/entities\/[0-9A-Z]{26}$/);
  await expect(page.getByTestId("generated-panel")).toContainText("entered difficulty");
  expect(errors).toEqual([]);
});
