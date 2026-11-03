/**
 * The arc board in Skyfire Down (campaign mode): deal campaign threads and
 * put one on the board; deal a job board that seeds the new thread's first
 * clue into a posting; take that posting; mark the clue found from the job
 * page; and see it in the crew notes on the player screen, under the thread's
 * player-facing title, with neither an unseen clue nor the GM's title there.
 */
import { expect, test } from "@playwright/test";

test("arcs: deal a thread, seed its clue into a posting, take it, find the clue, read it in the crew notes", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByTestId("load-demo").click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 30_000 });
  const base = page.url().replace(/\/home$/, "");

  // 1. the Arcs page is in the nav; the demo's two threads are on the board
  await page.getByRole("navigation", { name: "Campaign" }).getByRole("link", { name: "Arcs", exact: true }).click();
  await expect(page.getByTestId("arcs-page")).toBeVisible();
  await expect(page.getByTestId("arc-thread")).toHaveCount(2);
  await expect(page.getByTestId("arcs-heat-row")).toHaveCount(1);

  // 2. deal threads, put the first on the board
  await page.getByTestId("arcs-generate").click();
  await page.getByTestId("seed").fill("e2e-threads-1");
  const threadCards = page.getByTestId("offer-board").getByTestId("offer-card");
  await expect(threadCards).toHaveCount(2);
  await threadCards.first().getByTestId("offer-accept").click();
  await expect(threadCards.first().getByTestId("offer-accepted")).toContainText("On the arc board:");
  await threadCards.first().getByTestId("offer-accepted").getByRole("link").click();
  await expect(page.getByTestId("arc-thread")).toHaveCount(3);
  const column = page.getByTestId("arc-thread").nth(2);
  const gmTitle = await column.getByTestId("arc-thread-title").inputValue();
  const playerTitle = await column.getByTestId("arc-thread-player-title").inputValue();
  const threadId = await column.getAttribute("data-thread");
  expect(gmTitle).not.toBe(playerTitle);

  // 3. deal a job board that seeds the new thread's first clue
  await page.getByTestId("arcs-board-link").click();
  await page.getByTestId("seed").fill("e2e-arc-board-1");
  const seedSelect = page.getByTestId("input-arcs-seed");
  const clueValue = await seedSelect.evaluate((el, id) => [...(el as HTMLSelectElement).options].find((o) => o.value.startsWith(`${id}/`))!.value, threadId);
  await seedSelect.selectOption(clueValue);
  const cards = page.getByTestId("offer-board").getByTestId("offer-card");
  await expect(cards).toHaveCount(3);
  const seeded = cards.filter({ has: page.getByTestId("offer-gm-text").filter({ hasText: `Clue for “${gmTitle}”` }) });
  await expect(seeded).toHaveCount(1);
  await expect(seeded.getByTestId("offer-influence")).toContainText(`Seeds a clue of “${gmTitle}”`);
  await expect(seeded.getByTestId("offer-player-text")).not.toContainText(gmTitle);

  // 4. take the job: the clue is seeded in it
  await seeded.getByTestId("offer-accept").click();
  await seeded.getByTestId("offer-next").click();
  await expect(page.getByTestId("entity-page")).toBeVisible();
  const panel = page.getByTestId("arc-entity-panel");
  const clue = panel.getByTestId("arc-entity-clue").filter({ hasText: gmTitle });
  await expect(clue).toHaveAttribute("data-state", "seeded");

  // 5. mark it found from the job page
  await clue.getByTestId("arc-entity-clue-found").click();
  await expect(clue).toHaveAttribute("data-state", "found");

  // the arc board shows it found, with the session it was found in; read the clue's crew-notes text and an unseen one
  await page.goto(`${base}/arcs`);
  const col = page.locator(`[data-testid=arc-stage]`).filter({ has: page.locator(`[data-clue]`) });
  await expect(col.first()).toBeVisible();
  // the demo's clue was found in session 1; this one in session 2, the session the demo has planned
  const foundCard = page.locator(`[data-testid=arc-clue][data-state=found]`).filter({ has: page.getByRole("link", { name: /found in Session [12]/ }) });
  await expect(foundCard).toHaveCount(2);
  const threadCol = page.locator(`[data-thread="${threadId}"]`);
  await expect(threadCol).toHaveCount(1);
  const newFound = page.locator(`[data-testid=arc-clue][data-state=found]`).filter({ hasNot: page.getByText("Two manifests") });
  const foundPlayerText = (await newFound.first().locator(".arc-clue__player").innerText()).replace(/^Crew notes:\s*/, "").trim();
  const unseenPlayer = (await page.locator(`[data-testid=arc-clue][data-state=unseen]`).first().locator(".arc-clue__player").innerText()).replace(/^Crew notes:\s*/, "").trim();
  const sessionHref = await foundCard.first().getByRole("link", { name: /found in Session [12]/ }).getAttribute("href");
  const sessionId = sessionHref!.split("/").pop()!;

  // 6. the player screen's crew notes: the found clue under the player title; no GM title, no unseen clue
  const players = await context.newPage();
  await players.goto(`${base}/table/${sessionId}?view=players`);
  const notes = players.getByTestId("crew-notes");
  await expect(notes).toBeVisible();
  await expect(notes).toContainText(playerTitle);
  await expect(notes).toContainText(foundPlayerText);
  await expect(notes).toContainText("Mara Quill");
  await expect(notes).not.toContainText(gmTitle);
  await expect(notes).not.toContainText(unseenPlayer);
  await expect(players.getByTestId("player-screen")).not.toContainText(gmTitle);

  expect(errors).toEqual([]);
});
