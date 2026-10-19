import { expect, test } from "@playwright/test";

test("table mode hints: search the play guide, read the cues and roll for the best PC", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // load the demo campaign and start session 1
  await page.goto("/");
  await page.getByTestId("load-demo").click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 30_000 });
  await page.getByRole("link", { name: "Sessions" }).click();
  await page.getByRole("button", { name: "Start session 1" }).click();
  await expect(page.getByTestId("table-mode")).toBeVisible();

  // the Hints tab sits right after Dice
  const tabs = page.getByRole("tab");
  await expect(tabs.nth(1)).toHaveText("Dice");
  await expect(tabs.nth(2)).toHaveText("Hints");
  await tabs.nth(2).click();
  const hints = page.getByTestId("hints-tab");
  await expect(hints).toBeVisible();

  // search, open the entry and read its cues
  await hints.getByRole("searchbox", { name: "Search hints" }).fill("observation");
  const entry = hints.locator('[data-entry="observation"]');
  await expect(entry).toBeVisible();
  const row = entry.getByRole("button", { name: /^Observation/ }).first();
  if ((await row.getAttribute("aria-expanded")) === "false") await row.click();
  await expect(row).toHaveAttribute("aria-expanded", "true");
  const cues = entry.getByRole("list", { name: "Observation: call for it when" });
  await expect(cues.getByRole("listitem").first()).toBeVisible();

  // the best PC comes first; one tap rolls in place
  const best = entry.getByRole("list", { name: "Who's best at Observation" }).getByRole("button").first();
  const label = (await best.getAttribute("aria-label")) ?? "";
  const name = /^Roll Observation for (.+) \(\d+ dice\)$/.exec(label)?.[1];
  expect(name).toBeTruthy();
  await best.click();
  const panel = entry.getByTestId("dice-panel");
  await expect(panel).toContainText(`${name}: Observation`);
  await expect(panel.getByTestId("successes")).toHaveText(/^\d+$/);
  await expect(panel.getByTestId("describe")).not.toBeEmpty();

  // the roll is in the session's roll log
  await page.getByRole("tab", { name: "Dice" }).click();
  await expect(page.getByTestId("dice-tab")).toContainText(`${name}: Observation`);

  expect(errors).toEqual([]);
});
