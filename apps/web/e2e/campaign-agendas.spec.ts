/**
 * Campaign agendas in Skyfire Down (campaign mode): deal long-term agendas
 * for the crew, revise a beat, accept; then after a job mark one goal
 * stalled and deal the next beat from the character's agenda tab. The
 * player screen shows the crew's open friction and none of their goals.
 */
import { expect, test } from "@playwright/test";

test("campaign agendas: generate, accept, mark a job's outcome, see the next beat; players see the friction only", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByTestId("load-demo").click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 30_000 });
  const base = page.url().replace(/\/home$/, "");

  // the generator: four draft cards, open friction and the no-betrayal check
  await page.goto(`${base}/generate/alien.campaign-agendas`);
  const drafts = page.getByTestId("long-agenda-drafts");
  await expect(drafts).toContainText("DRAFT");
  const cards = drafts.getByTestId("long-agenda-character");
  await expect(cards).toHaveCount(4);
  await expect(page.getByTestId("agenda-report")).toContainText("No-betrayal check");
  await expect(page.getByTestId("agenda-report")).toContainText("Betrayal: none");
  await expect(page.getByTestId("long-agenda-friction").locator(".agenda-slot").first()).toBeVisible();

  // re-roll one beat's cost: only that card's beat changes
  const first = cards.first();
  const name = (await first.locator("h3").innerText()).trim();
  const beat = first.getByRole("textbox", { name: `${name}, beat` });
  const before = await beat.inputValue();
  const otherBeat = await cards.nth(1).getByRole("textbox", { name: /, beat$/ }).inputValue();
  await first.getByRole("button", { name: `Re-roll Cost for ${name}, beat` }).click();
  await expect(beat).not.toHaveValue(before);
  await expect(cards.nth(1).getByRole("textbox", { name: /, beat$/ })).toHaveValue(otherBeat);

  // revise the beat by hand, then accept
  await beat.fill("Win the dock office over with coffee, on your own time.");
  await page.getByTestId("long-agenda-accept").click();
  await expect(page.getByTestId("long-agenda-accepted")).toContainText("Wrote 4 long-term agendas");

  // the character's agenda tab: the goal, the beat as revised, calm tension
  await page.getByTestId("long-agenda-accepted").getByRole("link", { name, exact: true }).click();
  await expect(page).toHaveURL(/\/entities\/[0-9A-Z]{26}\?tab=agenda$/);
  const tab = page.getByTestId("long-agenda-tab");
  await expect(tab.getByTestId("long-agenda-beat")).toHaveText("Win the dock office over with coffee, on your own time.");
  await expect(tab.getByRole("list", { name: "Tension" }).locator('[aria-current="step"]')).toHaveText("Calm");
  await expect(tab.getByTestId("long-agenda-tab-friction").locator("li").first()).toBeVisible();

  // after the job: this goal stalled; deal the next beat and apply it
  await tab.getByTestId("open-next-beats").click();
  const flow = page.getByTestId("long-agenda-flow");
  await flow.getByRole("radio", { name: `${name}: Stalled` }).click();
  await flow.getByTestId("deal-next-beats").click();
  const next = flow.getByTestId("long-agenda-character");
  await expect(next).toHaveCount(1);
  await expect(next.getByTestId("long-agenda-change")).toContainText("Stalled: tension rises to quiet disagreement");
  await expect(next.locator(".long-agenda__reminders")).toContainText("Bonus XP");
  await expect(next.locator(".long-agenda__reminders")).toContainText("Pursue Agenda");
  const nextBeat = await next.getByRole("textbox", { name: `${name}, beat` }).inputValue();
  await flow.getByTestId("apply-next-beats").click();
  await expect(flow).toBeHidden();
  await expect(tab.getByTestId("long-agenda-beat")).toHaveText(nextBeat);
  await expect(tab.getByRole("list", { name: "Tension" }).locator('[aria-current="step"]')).toHaveText("Quiet disagreement");
  await expect(tab.getByRole("list", { name: "Beats so far" })).toContainText("Win the dock office over with coffee");

  // the player screen: the open friction, nothing of the goals or beats
  await page.goto(`${base}/home`);
  await page.getByRole("button", { name: "Start this session" }).click();
  await expect(page.getByTestId("table-mode")).toBeVisible();
  const popup = context.waitForEvent("page");
  await page.getByRole("button", { name: "Player screen" }).click();
  const players = await popup;
  await expect(players.getByTestId("player-screen")).toBeVisible();
  await expect(players.locator("[data-handout] h3").filter({ hasText: `${name}: friction` })).toHaveCount(1);
  // the four friction handouts and the job board posting the crew took
  await expect(players.locator("[data-handout]")).toHaveCount(5);
  await expect(players.locator("[data-handout] h3").filter({ hasText: /^Posting: / })).toHaveCount(1);
  await expect(players.getByText("personal agenda")).toHaveCount(0);
  await expect(players.getByText(nextBeat)).toHaveCount(0);

  expect(errors).toEqual([]);
});
