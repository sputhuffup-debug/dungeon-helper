import { expect, test, type Page } from "@playwright/test";

const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "Campaign" }).getByRole("link", { name, exact: true });

test("progression: XP awarded at wrap-up, spent on a skill on the Progression tab, then undone", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 1000 });

  // 1. Skyfire Down: start session 1 and wrap it up
  await page.goto("/");
  await page.getByTestId("load-demo").click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 30_000 });
  const base = page.url().replace(/\/home$/, "");
  await page.getByRole("button", { name: "Start this session" }).click();
  await expect(page.getByTestId("table-mode")).toBeVisible();
  await page.getByTestId("end-session").click();
  const wrap = page.getByTestId("wrapup");
  await wrap.getByRole("textbox", { name: "Session summary" }).fill("The crew took the job.");
  await wrap.getByRole("button", { name: /^Next: End-of-session questions/ }).click();
  const remaining = wrap.getByRole("button", { name: "Remaining: No" });
  while ((await remaining.count()) > 0) await remaining.first().click();
  await wrap.getByRole("button", { name: /^Next: Rewards/ }).click();

  // 2. the award checklist: nine questions, attendance ticked for all four PCs; everyone got
  //    through a dangerous event, made a discovery and earned money
  const grid = wrap.getByTestId("award-checklist");
  await expect(grid.locator("tbody tr")).toHaveCount(9);
  await expect(grid.locator('[data-question="alien.award.participated"] input:checked')).toHaveCount(4);
  for (const q of ["danger", "discovery", "money"]) {
    const boxes = grid.locator(`[data-question="alien.award.${q}"] input`);
    for (let i = 0; i < 4; i++) await boxes.nth(i).check();
  }
  await expect(grid.locator("[data-total]").first()).toContainText("+4 XP");
  await wrap.getByTestId("award-xp").click();
  await expect(wrap.getByTestId("awarded")).toHaveCount(4);
  await expect(wrap.getByTestId("award-xp")).toBeDisabled();
  await wrap.getByRole("button", { name: /^Next: Timeline/ }).click();
  await wrap.getByRole("button", { name: /^Next: Loose ends/ }).click();
  await wrap.getByTestId("finish-session").click();
  await expect(page).toHaveURL(/\/home$/);

  // 3. a PC's Progression tab: the pool, the history (the last run, this session) and Spend XP
  await page.goto(`${base}/atlas`);
  await page.getByRole("tab", { name: /^PCs/ }).click();
  await page.getByRole("tabpanel").getByRole("link").first().click();
  await expect(page).toHaveURL(/\/entities\/[0-9A-Z]{26}$/);
  await page.getByRole("tab", { name: "Progression" }).click();
  const tab = page.getByTestId("progression-tab");
  await expect(tab).toBeVisible();
  const history = tab.getByTestId("advancement-history");
  await expect(history).toContainText("The last run to");
  await expect(history).toContainText("Session 1");
  const pool = tab.getByTestId("pool-experience");
  const before = Number(await pool.innerText());
  expect(before).toBeGreaterThanOrEqual(5);

  await tab.getByTestId("spend-xp").click();
  const dialog = page.getByTestId("spend-dialog");
  await expect(dialog).toBeVisible();
  // the cheapest skill step the PC can afford
  const targets = dialog.locator(".prog-target:not(.is-blocked)");
  await expect(targets.first()).toBeVisible();
  const count = await targets.count();
  let pick = 0;
  let cost = Number.POSITIVE_INFINITY;
  for (let i = 0; i < count; i++) {
    const c = Number(/(\d+) XP/.exec(await targets.nth(i).locator(".prog-target__cost").innerText())?.[1] ?? "999");
    if (c < cost) {
      cost = c;
      pick = i;
    }
  }
  const target = targets.nth(pick);
  const skill = (await target.getAttribute("data-target"))!;
  const [from, to] = (await target.locator(".prog-target__step").innerText()).split("→").map((x) => Number(x.trim()));
  expect(cost).toBe(to! * 5);
  await target.click();
  await expect(page.getByTestId("spend-quote")).toContainText(`XP after: ${before - cost}`);
  const confirm = page.getByRole("checkbox", { name: "Confirm the condition" });
  if (await confirm.count()) await confirm.check();
  await page.getByTestId("apply-spend").click();
  await expect(dialog).toBeHidden();
  await expect(pool).toHaveText(String(before - cost));
  await expect(history.locator("tbody tr").first()).toContainText(`${from} → ${to}`);

  // 4. the sheet shows the new level: the skill's dice pool is one higher
  await page.getByRole("tab", { name: "Sheet" }).click();
  const sheetPool = page.getByTestId(`pool-${skill}`);
  const after = Number(await sheetPool.innerText());
  await page.getByRole("tab", { name: "Progression" }).click();

  // 5. undo the spend: skill and pool go back
  await tab.getByTestId("undo-spend").click();
  await expect(pool).toHaveText(String(before));
  await expect(history).not.toContainText(`${from} → ${to}`);
  await page.getByRole("tab", { name: "Sheet" }).click();
  await expect(page.getByTestId(`pool-${skill}`)).toHaveText(String(after - 1));

  expect(errors).toEqual([]);
});

test("progression: Story Points at the table in cinematic play, awarded for the act and spent with a reason and on a roll", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 1000 });

  await page.goto("/");
  await page.getByTestId("load-demo-cinematic").click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 30_000 });
  const base = page.url().replace(/\/home$/, "");
  await nav(page, "Sessions").click();
  await page.getByRole("button", { name: "Start session 1" }).click();
  await expect(page.getByTestId("table-mode")).toBeVisible();

  // 1. the first PC card: no Story Points yet; award one for act 1 (once per act)
  const card = page.getByRole("list", { name: "Player characters" }).locator("li").first();
  const name = (await card.locator(".app-participant__name").innerText()).trim();
  const id = (await card.getAttribute("data-entity"))!;
  const sp = card.getByTestId("story-points");
  await expect(sp).toHaveAttribute("data-value", "0");
  await card.getByRole("button", { name: `Award a Story Point to ${name} for act 1` }).click();
  await expect(sp).toHaveAttribute("data-value", "1");
  await expect(card.getByRole("button", { name: `Award a Story Point to ${name} for act 1` })).toBeDisabled();

  // 2. spend it on a roll: one base die becomes a success
  await page.getByRole("tab", { name: "Dice" }).click();
  await page.getByRole("combobox", { name: "Character", exact: true }).selectOption({ label: name });
  await page.getByRole("combobox", { name: "Skill", exact: true }).selectOption({ index: 1 });
  const panel = page.getByTestId("dice-panel").first();
  await panel.getByRole("button", { name: "Roll", exact: true }).click();
  const successes = Number(await panel.getByTestId("successes").innerText());
  await panel.getByTestId("spend-story-point").click();
  await expect(panel.getByTestId("successes")).toHaveText(String(successes + 1));
  await expect(sp).toHaveAttribute("data-value", "0");

  // 3. the Story Points tracker awards another (logged too); spend it from the card with a reason
  await page.getByRole("tab", { name: "Trackers" }).click();
  await page.getByRole("button", { name: `Award ${name} story point` }).click();
  await expect(sp).toHaveAttribute("data-value", "1");
  await card.getByRole("button", { name: `Spend a Story Point for ${name}` }).click();
  await card.getByRole("textbox", { name: "Note" }).fill("re-roll the airlock override");
  await card.getByRole("button", { name: "Spend", exact: true }).click();
  await expect(sp).toHaveAttribute("data-value", "0");

  // 4. the PC's Progression tab lists all four, newest first
  await page.goto(`${base}/entities/${id}?tab=progression`);
  const history = page.getByTestId("advancement-history");
  await expect(history.locator("tbody tr")).toHaveCount(4);
  await expect(history.locator("tbody tr").first()).toContainText("re-roll the airlock override");
  await expect(history).toContainText("Act 1");
  await expect(history).toContainText("Success on one base die");

  expect(errors).toEqual([]);
});
