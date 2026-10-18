import { expect, test } from "@playwright/test";

test("xenomorph life cycle: start an infection on a PC, advance the clock, the chestburster appears", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // demo campaign, first session at the table
  await page.goto("/");
  await page.getByTestId("load-demo").click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 30_000 });
  await page.getByRole("link", { name: "Sessions" }).click();
  await page.getByRole("button", { name: "Start session 1" }).click();
  await expect(page.getByTestId("table-mode")).toBeVisible();

  // start an infection from a player character's card
  const pcs = page.getByRole("list", { name: "Player characters" });
  const start = pcs.getByRole("button", { name: /^Start infection: / }).first();
  const host = ((await start.getAttribute("aria-label")) ?? "").replace("Start infection: ", "");
  expect(host).not.toBe("");
  await start.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("combobox", { name: "Variant" })).toHaveValue("standard");
  await dialog.getByTestId("lifecycle-start-confirm").click();
  await expect(dialog).toBeHidden();

  // the life-cycle tracker shows the facehug, and the PC card its stage
  const tracker = page.locator('[data-tracker="alien.gestation"]');
  const card = tracker.getByRole("article", { name: `${host}: Facehugged` });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Next: Embryo growing in about 1 Shift");
  await expect(pcs.getByTestId("lifecycle-badge").first()).toContainText("Infection: Facehugged (Stage II)");

  // two shifts on the table clock: the facehugger drops off, then the chestburster is born
  const clock = page.getByTestId("table-clock");
  await clock.getByRole("button", { name: "Advance one Shift" }).click();
  await expect(tracker.getByRole("article", { name: `${host}: Embryo growing` })).toBeVisible();
  await clock.getByRole("button", { name: "Advance one Shift" }).click();

  // witnesses are asked for panic rolls; dismiss them (nobody saw it)
  const prompt = page.locator("dialog.cf-prompt[open]");
  for (let i = 0; i < 10 && (await prompt.count()) > 0; i++) {
    await expect(prompt).toContainText("burst out of");
    await prompt.getByRole("button", { name: "Close" }).click();
  }

  const born = tracker.getByRole("article", { name: `${host}: Chestburster` });
  await expect(born).toBeVisible();
  await expect(born.locator('[data-testid^="lifecycle-stage-"]')).toHaveText("Chestburster (Stage III)");
  await expect(born).toContainText(`Xenomorph from ${host}`);
  await expect(born).toContainText("Next: Drone or Scout in about 1 Shift");
  await expect(pcs.getByTestId("lifecycle-badge").first()).toContainText("Chestburster (Stage III)");

  // the creature exists in the atlas, made from the Chestburster preset and linked to its host
  await page.goto(page.url().replace(/\/table\/.*$/, "/atlas"));
  await page.getByRole("tab", { name: "Creatures" }).click();
  await page.getByRole("searchbox", { name: "Filter by name" }).fill("Xenomorph from");
  await page.getByRole("link", { name: `Xenomorph from ${host}` }).first().click();
  await expect(page.getByTestId("entity-page")).toBeVisible();
  await expect(page.getByTestId("lifecycle-badge")).toContainText(`Creature from ${host}: Chestburster (Stage III)`);
  await page.getByRole("tab", { name: "Relationships" }).click();
  await expect(page.getByText("emerged from")).toBeVisible();
  await expect(page.getByRole("link", { name: host }).first()).toBeVisible();

  expect(errors).toEqual([]);
});
