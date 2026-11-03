/**
 * "Previously on…" in Skyfire Down: session 2 is planned with a recap built
 * from session 1. Open it, read the GM's version (with what the players
 * don't know), switch a read-aloud line off, show the read-aloud on the
 * player screen, and check there that neither the GM-only lines nor the
 * switched-off one appear.
 */
import { expect, test } from "@playwright/test";

test("recap: open session 2, toggle a line, show the read-aloud on the player screen, no GM-only text there", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByTestId("load-demo").click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 30_000 });
  const base = page.url().replace(/\/home$/, "");

  // 1. session 2 is the planned one; its page opens on the recap
  await page.getByRole("navigation", { name: "Campaign" }).getByRole("link", { name: "Sessions", exact: true }).click();
  const planned = page.locator('[data-session][data-status="planned"]');
  await expect(planned).toContainText("The ore run");
  await planned.getByRole("link").click();
  await expect(page.getByTestId("session-page")).toHaveAttribute("data-status", "planned");
  const sessionId = page.url().split("/").pop()!;
  const card = page.getByTestId("recap-card");
  await expect(card).toContainText("Previously on…");
  await expect(card).toContainText("Since last session · Session 1");

  // 2. the GM's version: the session summary, the job, the clue under the GM title, and what the players don't know
  const gm = card.getByTestId("recap-gm");
  await expect(gm.getByRole("region", { name: "Last time" })).toContainText("Session 1: The offer");
  await expect(gm.getByRole("region", { name: "Jobs" })).toContainText("Ore to the spaceport");
  const secrets = gm.getByRole("region", { name: "What the players don't know" });
  await expect(secrets).toBeVisible();
  const secretLine = (await secrets.getByTestId("recap-line-text").first().innerText()).trim();
  const clueLine = (await gm.getByRole("region", { name: "Clues found" }).getByTestId("recap-line-text").first().innerText()).trim();
  const gmTitle = clueLine.split(":")[0]!;
  expect(secretLine.length).toBeGreaterThan(10);

  // 3. the read-aloud: switch the crew funds line off
  await card.getByRole("tab", { name: /Read-aloud/ }).click();
  const read = card.getByTestId("recap-players");
  // dated in the world, not by the table's real date; the GM's summary is offered but starts off
  await expect(read).toContainText(/Session 1: The offer \(\d{4}-\d{2}-\d{2}\)\./);
  await expect(read).not.toContainText("7 Nov 2026");
  const summary = read.getByTestId("recap-line").filter({ has: page.getByTestId("recap-optin") });
  await expect(summary).toHaveAttribute("data-off", "true");
  const summaryText = (await summary.getByTestId("recap-line-text").innerText()).trim();
  await expect(read).toContainText("Mara Quill is one of your contacts.");
  await expect(read).not.toContainText(gmTitle);
  const funds = read.getByTestId("recap-line").filter({ hasText: "Crew funds now" });
  await funds.getByRole("checkbox").uncheck();
  await expect(funds).toHaveAttribute("data-off", "true");

  // 4. show it on the player screen
  await card.getByTestId("recap-show").click();
  await expect(card.getByTestId("recap-show")).toHaveText("Hide from player screen");
  const players = await context.newPage();
  await players.goto(`${base}/table/${sessionId}?view=players`);
  const shown = players.getByTestId("player-recap");
  await expect(shown).toBeVisible();
  await expect(shown).toContainText("Previously on Skyfire Down");
  await expect(shown).toContainText("Mara Quill");
  await expect(shown).not.toContainText("Crew funds now");
  await expect(shown).not.toContainText(summaryText);
  const screen = players.getByTestId("player-screen");
  await expect(screen).not.toContainText(secretLine);
  await expect(screen).not.toContainText(gmTitle);
  await expect(screen).not.toContainText("What the players don't know");

  // 5. hidden again from the GM's tab: the player screen follows
  await card.getByTestId("recap-show").click();
  await expect(shown).toHaveCount(0);

  expect(errors).toEqual([]);
});
