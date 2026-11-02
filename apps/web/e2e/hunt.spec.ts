import { expect, test } from "@playwright/test";

const nav = (page: import("@playwright/test").Page, name: string) => page.getByRole("navigation", { name: "Campaign" }).getByRole("link", { name, exact: true });

/**
 * Skyfire Down's live hunt: the job's site map on "The ore run", with the
 * XX121 stalker and the UPP fire team hidden and one sweep's blips A and B.
 * The GM accepts the stalker's suggested move after the next stretch, the
 * marshal sweeps, and the player screen shows the blip, never the stalker's
 * zone; revealed, the blip flips to the stalker's token on the player map.
 */
test("the live hunt: a suggested move, a sweep, blips on the player screen, and the reveal", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1500, height: 1100 });

  await page.goto("/");
  await page.getByTestId("load-demo").click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 30_000 });
  await nav(page, "Sessions").click();
  await page.getByRole("button", { name: "Start session 1" }).click();
  await expect(page.getByTestId("table-mode")).toBeVisible();
  const sceneSelect = page.getByRole("combobox", { name: "Scene" });
  await sceneSelect.selectOption((await sceneSelect.locator("option", { hasText: "The ore run" }).getAttribute("value"))!);

  // the GM's live map: two hidden threats, the last sweep's blips
  const live = page.getByTestId("live-map");
  await expect(live).toBeVisible();
  const panel = live.getByTestId("hunt-panel");
  const rows = panel.getByTestId("hunt-token");
  await expect(rows).toHaveCount(2);
  const stalker = rows.filter({ hasText: "Stalker" });
  await expect(stalker).toHaveAttribute("data-state", "detected");
  await expect(panel.getByTestId("tracker-blip")).toHaveText(["A: Medium, NE", "B: Long, N, above"]);
  const stalkerId = (await stalker.getAttribute("data-hunt-row"))!;

  // the player screen: the tracker readout with A and B, no hidden token
  const popup = context.waitForEvent("page");
  await page.getByRole("button", { name: "Player screen" }).click();
  const players = await popup;
  const playerMap = players.getByTestId("player-map");
  await expect(playerMap).toBeVisible();
  await expect(playerMap.getByTestId("tracker-blip")).toHaveText(["A: Medium, NE", "B: Long, N, above"]);
  await expect(playerMap.locator("[data-hunt-token], [data-hunt-trail], [data-hunt-suggestion]")).toHaveCount(0);
  await expect(playerMap).not.toContainText("Stalker");

  // the next stretch: the GM is asked, and accepts the stalker's suggested move
  await panel.getByTestId("hunt-next-stretch").click();
  await expect(panel.getByTestId("hunt-prompt")).toContainText("Stretch 3 begins. Move hidden threats? Sweep?");
  const before = (await stalker.getAttribute("data-zone"))!;
  const to = (await stalker.getByTestId("hunt-suggestion").getAttribute("data-to"))!;
  expect(to).not.toBe(before);
  await stalker.getByTestId("hunt-accept").click();
  await expect(stalker).toHaveAttribute("data-zone", to);
  // the blips went stale with the stretch: the players see the last sweep, dimmed
  await expect(playerMap.locator(".app-tracker__sweep--stale")).toHaveCount(1);

  // the marshal sweeps: only the stalker moved, so only its blip, B, shows
  await panel.getByRole("button", { name: "Sweep: Lee-Ann Jenkins" }).click();
  await expect(stalker).toHaveAttribute("data-state", "detected");
  await expect(playerMap.getByTestId("tracker-blip")).toHaveCount(1);
  await expect(playerMap.getByTestId("tracker-blip")).toHaveText(/^B: (Short|Medium|Long)/);
  await expect(playerMap.locator(".app-tracker__sweep--stale")).toHaveCount(0);
  // the player screen never learns the zone
  expect(await playerMap.innerHTML()).not.toContain(`"${to}"`);
  await expect(playerMap.locator(`[data-token="${stalkerId}"]`)).toHaveCount(0);
  // the sweep is in the session log
  await page.getByRole("tab", { name: "Log" }).click();
  await expect(page.getByRole("list", { name: "Session events" })).toContainText(/Sweep by Lee-Ann Jenkins: blip B \(/);

  // the GM reveals the stalker, keeping its letter: the blip flips to its token on the player map
  await panel.getByTestId("hunt-keep-letter").check();
  await stalker.getByTestId("hunt-reveal").click();
  await expect(stalker).toHaveAttribute("data-state", "seen");
  await expect(playerMap.getByTestId("tracker-blip")).toHaveText([/^B: .* \(seen\)$/]);
  // the token is on the deck (or duct sheet) of its zone: find it there
  const decks = playerMap.getByRole("group", { name: "Decks" }).getByRole("button");
  let found = false;
  for (let i = 0; i < (await decks.count()) && !found; i++) {
    await decks.nth(i).click();
    found = (await playerMap.locator(`[data-token="${stalkerId}"]`).count()) > 0;
  }
  expect(found, "the stalker's token on the player map").toBe(true);
  await expect(playerMap.locator(`[data-token="${stalkerId}"] text`)).toHaveText("B");

  expect(errors).toEqual([]);
});
