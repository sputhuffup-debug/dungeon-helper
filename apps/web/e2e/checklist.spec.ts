import { expect, test } from "@playwright/test";

test("session checklist: plan, tick and read guidance, run at the table, wrap up, see the summary", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // the demo campaign (campaign mode) has a planned first session
  await page.goto("/");
  await page.getByTestId("load-demo").click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 30_000 });
  await page.getByRole("link", { name: "Sessions" }).click();
  const plannedRow = page.locator('[data-session][data-status="planned"]').first();
  await expect(plannedRow.getByTestId("checklist-badge")).toHaveText("✓ 0/12");
  await plannedRow.getByRole("link").click();
  await expect(page.getByTestId("session-page")).toHaveAttribute("data-status", "planned");

  // 1. planned: "Before the session" is open, the other phases collapsed below
  const checklist = page.getByTestId("session-checklist");
  await expect(checklist).toHaveAttribute("data-focus", "prep");
  const prep = checklist.locator('[data-phase="prep"]');
  const play = checklist.locator('[data-phase="play"]');
  await expect(prep).toHaveAttribute("open", "");
  await expect(play).not.toHaveAttribute("open", "");
  await expect(prep.locator(".app-checklist__count")).toHaveText("0 of 12");
  // the Alien module adds its own items, badged and paged
  const job = prep.locator('[data-item="alien.prep.job"]');
  await expect(job).toContainText("Have a job on offer");
  await expect(job.locator(".cf-badge")).toHaveText("Alien RPG");
  await expect(job.locator(".cf-page")).toHaveText("p. 244");

  // tick a prep item with the keyboard and expand its guidance
  const goal = prep.getByRole("checkbox", { name: "Set a goal for this session" });
  await goal.focus();
  await page.keyboard.press("Space");
  await expect(goal).toBeChecked();
  const guidance = prep.getByRole("button", { name: "Show guidance: Set a goal for this session" });
  await expect(prep.getByText("One sentence on what this session is about")).toBeHidden();
  await guidance.click();
  await expect(prep.getByText("One sentence on what this session is about")).toBeVisible();
  await expect(prep.getByRole("button", { name: "Hide guidance: Set a goal for this session" })).toHaveAttribute("aria-expanded", "true");

  // planning a scene ticks "Sketch a few scenes, not a script"
  await page.getByText("Add scenes").click();
  await page.getByRole("button", { name: /^Plan / }).first().click();
  await expect(prep.getByRole("checkbox", { name: "Sketch a few scenes, not a script" })).toBeChecked();
  await expect(prep.locator(".app-checklist__count")).toHaveText("2 of 12");

  // the collapsed phases open on demand
  await play.locator("summary").click();
  await expect(play.getByRole("checkbox", { name: "Start with a recap" })).toBeVisible();

  // 2. start the session; table mode has a Checklist tab on "At the table"
  await page.getByTestId("start-planned").click();
  await expect(page.getByTestId("table-mode")).toBeVisible();
  const reveal = page.getByTestId("reveal-panel");
  await reveal.getByRole("button", { name: /^Reveal / }).first().click();
  await page.getByRole("tab", { name: "Checklist" }).click();
  const tableList = page.getByTestId("session-checklist");
  await expect(tableList).toHaveAttribute("data-focus", "play");
  const atTable = tableList.locator('[data-phase="play"]');
  await expect(atTable).toHaveAttribute("open", "");
  await expect(atTable.getByRole("checkbox", { name: "Track what the players learn" })).toBeChecked();
  await expect(atTable.locator('[data-item="alien.play.supply"]')).toContainText("Call for supply rolls");
  await atTable.getByRole("checkbox", { name: "Start with a recap" }).check();
  await expect(atTable.locator(".app-checklist__count")).toHaveText("2 of 8");

  // 3. wrap up: "After the session" sits beside the steps and shows what is left
  await page.getByTestId("end-session").click();
  const wrap = page.getByTestId("wrapup");
  const panel = wrap.getByTestId("wrap-checklist");
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("checkbox", { name: "Write a short summary" })).not.toBeChecked();
  await panel.getByRole("checkbox", { name: "End on a hook" }).click();
  await expect(panel.getByRole("checkbox", { name: "End on a hook" })).toBeHidden(); // done items drop out of "what's left"
  await wrap.getByRole("textbox", { name: "Session summary" }).fill("The crew took the job.");
  await wrap.getByRole("button", { name: /^Next: End-of-session questions/ }).click();
  const remaining = wrap.getByRole("button", { name: "Remaining: No" });
  while ((await remaining.count()) > 0) await remaining.first().click();
  await wrap.getByRole("button", { name: /^Next: Rewards/ }).click();
  // posting the XP award checklist ticks "Go through the XP questions"
  await wrap.getByTestId("award-xp").click();
  await wrap.getByRole("button", { name: /^Next: Timeline/ }).click();
  await wrap.getByRole("button", { name: /^Next: Loose ends/ }).click();
  await wrap.getByRole("textbox", { name: "Loose ends" }).fill("Who wants the crate?");
  // finishing is never blocked by unticked items
  await wrap.getByTestId("finish-session").click();
  await expect(page).toHaveURL(/\/home$/);

  // 4. the finished session shows a compact completion summary per phase
  await page.getByRole("link", { name: "Sessions" }).click();
  await page.locator('[data-session][data-status="done"]').getByRole("link").click();
  await expect(page.getByTestId("session-status")).toHaveText("done");
  const summary = page.getByTestId("checklist-summary");
  await expect(summary.locator('[data-phase="prep"] .app-checklist__count')).toHaveText("2 of 12");
  await expect(summary.locator('[data-phase="play"] .app-checklist__count')).toHaveText("2 of 8");
  // hook (by hand); rewards, XP and trauma (questions answered); summary, timeline, loose ends, schedule (finishing). Only "Ask what worked" is left.
  await expect(summary.locator('[data-phase="wrap"] .app-checklist__count')).toHaveText("8 of 9");
  await summary.locator('[data-phase="wrap"]').getByText("1 not ticked").click();
  await expect(summary.locator('[data-phase="wrap"]').getByRole("checkbox", { name: "Ask what worked" })).not.toBeChecked();

  expect(errors).toEqual([]);
});

test("campaign settings hide a default item and add the GM's own", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("load-demo").click();
  await expect(page).toHaveURL(/\/home$/, { timeout: 30_000 });
  await page.getByRole("link", { name: "Settings" }).click();
  const settings = page.getByTestId("checklist-settings");
  await settings.getByRole("checkbox", { name: "Show “Confirm the basics”" }).uncheck();
  await settings.getByRole("textbox", { name: "New item: Before the session" }).fill("Charge the tablet");
  await settings.locator('[data-phase="prep"]').getByRole("button", { name: "Add" }).click();
  await expect(settings.getByRole("textbox", { name: "Item text" })).toHaveValue("Charge the tablet");

  await page.getByRole("link", { name: "Sessions" }).click();
  await page.locator('[data-session][data-status="planned"]').first().getByRole("link").click();
  const prep = page.getByTestId("session-checklist").locator('[data-phase="prep"]');
  await expect(prep.getByRole("checkbox", { name: "Confirm the basics" })).toHaveCount(0);
  await expect(prep.getByRole("checkbox", { name: "Charge the tablet" })).toBeVisible();
  await expect(prep.locator(".app-checklist__count")).toHaveText("0 of 12");
});
