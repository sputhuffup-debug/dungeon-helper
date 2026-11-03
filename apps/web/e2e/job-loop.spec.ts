/**
 * The campaign loop in Skyfire Down, job to table to the next job: take a
 * posting from the job board, generate its site map, "Run this job" (the
 * Job card filled from the job, its first scenes planned into session 2),
 * start the session from Home (the "Previously on…" card at the top of the
 * table), play the arrival on the site map with the job's NPCs, end the
 * session and close the job (done, paid), land on Between jobs with the job
 * picked, accept it in one step and deal the next job board.
 */
import { expect, test, type Page } from "@playwright/test";

const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "Campaign" }).getByRole("link", { name, exact: true });

test("job loop: take a job, run it, play it with its site map and NPCs, close it, between jobs, deal the next board", async ({ page, context }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByTestId("load-demo").click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 30_000 });
  const base = page.url().replace(/\/home$/, "");

  // 1. take a posting from the job board; the job page offers "Run this job"
  await page.goto(`${base}/generate`);
  await page.getByTestId("procedure-alien.job-board").click();
  await page.getByTestId("seed").fill("e2e-loop");
  const card = page.getByTestId("offer-board").getByTestId("offer-card").first();
  const taken = (await card.locator("h3").innerText()).replace(/^Posting 1:\s*/, "").trim();
  await card.getByTestId("offer-accept").click();
  await expect(card).toHaveAttribute("data-state", "accept");
  await card.getByTestId("offer-next").click();
  await expect(page).toHaveURL(/\/entities\/[0-9A-Z]{26}$/);
  const jobUrl = page.url();
  const jobId = jobUrl.split("/").pop()!;
  const contact = (await page.getByTestId("job-npc").first().getByRole("link").innerText()).trim();

  // its site map, from the job's brief
  await page.getByTestId("job-generate-map").click();
  await page.getByTestId("map-seed").fill("e2e-loop-site");
  await page.getByTestId("map-generate").click();
  await expect(page.getByTestId("map-preview")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("map-save").click();
  await expect(page).toHaveURL(/\/maps\/[0-9A-Z]{26}$/);

  // 2. Run this job: the Job card, filled; the button then opens the same adventure
  await page.goto(jobUrl);
  const run = page.getByTestId("run-from-entity");
  await expect(run).toHaveText("Run this job");
  await run.click();
  await expect(page).toHaveURL(/\/adventures\/[0-9A-Z]{26}/);
  const adventureUrl = page.url().split("?")[0]!;
  await expect(page.getByTestId("adventure-title")).toHaveValue(taken);
  const source = page.getByTestId("adventure-source");
  await expect(source).toContainText(taken);
  await expect(source).toContainText("Site map:");
  await expect(page.locator("body")).not.toContainText("alien.job");
  await page.goto(jobUrl);
  await expect(page.getByTestId("run-from-entity")).toHaveText("Open the adventure");
  await page.getByTestId("run-from-entity").click();
  await expect(page).toHaveURL(new RegExp(`${adventureUrl.replace(/[/.]/g, "\\$&")}`));

  // 3. Home: "Start this session" opens session 2 with "Previously on…" on top
  await nav(page, "Home").click();
  await page.getByRole("button", { name: "Start this session" }).click();
  await expect(page.getByTestId("table-mode")).toBeVisible();
  const recap = page.getByTestId("table-recap");
  await expect(recap).toContainText("Previously on…");
  await expect(recap.getByTestId("table-recap-lines")).toContainText("Mara Quill");
  await recap.getByTestId("table-recap-show").click();
  await expect(recap.getByTestId("table-recap-show")).toHaveText("Hide from the players");
  const sessionId = page.url().split("/").pop()!.split("?")[0]!;
  const players = await context.newPage();
  await players.goto(`${base}/table/${sessionId}?view=players`);
  await expect(players.getByTestId("player-recap")).toContainText("Mara Quill");
  await players.close();

  // the session plays the job's scenes: the briefing first, then the arrival on the site map with the job's NPCs
  await expect(page.getByTestId("scene-title")).toHaveText(`Briefing with ${contact}`);
  const sceneSelect = page.getByRole("combobox", { name: "Scene" });
  await sceneSelect.selectOption((await sceneSelect.locator("option", { hasText: "Arrival" }).getAttribute("value"))!);
  await expect(page.getByTestId("scene-title")).toContainText("Arrival");
  await expect(page.getByTestId("live-map")).toBeVisible();
  await expect(page.getByRole("list", { name: "Scene participants" })).toContainText(contact);
  await page.getByTestId("mark-run").click();
  // the first scene run puts the recap card away
  await expect(recap).toHaveCount(0);

  // 4. end the session: the last step closes the job
  await page.getByTestId("end-session").click();
  const wrap = page.getByTestId("wrapup");
  await wrap.getByRole("button", { name: /^Next: End-of-session questions/ }).click();
  const remaining = wrap.getByRole("button", { name: "Remaining: No" });
  while ((await remaining.count()) > 0) await remaining.first().click();
  await wrap.getByRole("button", { name: /^Next: Rewards/ }).click();
  await wrap.getByRole("button", { name: /^Next: Timeline/ }).click();
  await wrap.getByRole("button", { name: /^Next: Loose ends/ }).click();
  await wrap.getByRole("button", { name: /^Next: Close the jobs?$/ }).click();
  const close = wrap.locator(`[data-testid="close-source"][data-entity="${jobId}"]`);
  await expect(close).toContainText(taken);
  await close.getByTestId("close-outcome-done").click();
  await expect(close).toContainText("Done");
  await expect(close.getByTestId("close-adventure").getByRole("checkbox")).toBeChecked();
  await close.getByTestId("payout").click();
  await expect(close.getByTestId("payout-posted")).toBeVisible();
  // the payment can be taken back, and posted again
  await close.getByTestId("payout-undo").click();
  await expect(close.getByTestId("payout")).toBeVisible();
  await close.getByTestId("payout").click();
  await expect(close.getByTestId("payout-posted")).toBeVisible();
  await wrap.getByTestId("finish-session").click();

  // 5. Finish lands on Between jobs with the job picked; accepting applies the effects and moves the clocks in one go
  await expect(page).toHaveURL(new RegExp(`/generate/alien\\.between-jobs\\?pick=job(%3A|:)${jobId}`));
  await expect(page.getByTestId("input-job")).not.toHaveValue("");
  const picker = page.getByTestId("effects-picker");
  // the job's pay is already on the ledger: not listed again
  await expect(picker.getByTestId("effects-posted")).toContainText(`Payment: ${taken}`);
  await expect(picker.getByTestId("effects")).not.toContainText(`Payment: ${taken}`);
  await expect(page.getByTestId("arc-tick-include")).toBeChecked();
  const accept = page.getByTestId("accept");
  await expect(accept).toHaveText(/^Accept and apply \d+ effects? and move the clocks$/);
  await accept.click();
  // accepted: said so, "Accept again" demoted (it asks first), the next step below
  await expect(page.getByTestId("accepted-note")).toContainText("Accepted");
  await expect(page.getByTestId("accept-again")).toBeVisible();
  await expect(page.getByTestId("arc-tick-done")).toContainText("Moved with the run");
  await expect(page.getByRole("button", { name: "Applied" })).toBeVisible();

  // 6. what comes next: the next job board (and the next session)
  const next = page.getByTestId("between-jobs-next");
  await expect(next.getByTestId("plan-next-session")).toContainText("Plan the next session");
  await next.getByTestId("deal-next-board").click();
  await expect(page).toHaveURL(/\/generate\/alien\.job-board$/);
  await expect(page.getByTestId("offer-board").getByTestId("offer-card").first()).toBeVisible();

  // the finished job is done, its adventure too, and the ledger holds its pay once
  await page.goto(jobUrl);
  await expect(page.getByTestId("payout-posted")).toBeVisible();
  await page.goto(adventureUrl);
  await expect(page.getByRole("combobox", { name: "Adventure status" })).toHaveValue("done");
  await nav(page, "Ship").click();
  await expect(page.getByTestId("ledger-row").filter({ hasText: `Collect payment: ${taken}` })).toHaveCount(1);

  expect(errors).toEqual([]);
});

test("table mode: the recap card on a session with a recap, dismissed for good", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByTestId("load-demo").click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 30_000 });
  await nav(page, "Sessions").click();
  await page.getByRole("button", { name: "Start session 2" }).click();
  const recap = page.getByTestId("table-recap");
  await expect(recap).toBeVisible();
  await expect(recap).toContainText("Read it aloud before the first scene");
  await recap.getByTestId("table-recap-show").click();
  await expect(recap).toContainText("On the player screen");
  await recap.getByTestId("table-recap-show").click();
  await expect(recap.getByTestId("table-recap-show")).toHaveText("Show to the players");
  await recap.getByTestId("table-recap-dismiss").click();
  await expect(recap).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("table-mode")).toBeVisible();
  await expect(page.getByTestId("table-recap")).toHaveCount(0);
  expect(errors).toEqual([]);
});
