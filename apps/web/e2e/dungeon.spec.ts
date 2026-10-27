import { expect, test, type Page } from "@playwright/test";

const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "Campaign" }).getByRole("link", { name, exact: true });

async function loadDemo(page: Page, button: string, name: string) {
  await page.goto("/");
  await page.getByTestId(button).click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 30_000 });
  await expect(page.getByTestId("campaign-name")).toHaveText(name);
}

test("5e dungeon: generate, accept its rooms and monsters, GM and player maps, reveal a room at the table and see it on the player screen", async ({ page, context }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 1000 });
  await loadDemo(page, "load-demo-5e", "Thornwick Crossing");

  // 1. generate a crypt from the Generate page with a fixed seed
  await nav(page, "Generate").click();
  const section = page.getByRole("region", { name: "Site maps" });
  await expect(section.getByRole("link", { name: "The Sunken Watchtower" })).toBeVisible();
  await section.getByTestId("map-generator-dnd5e-srd.map.dungeon").click();
  await expect(page).toHaveURL(/\/maps\/new\?generator=dnd5e-srd\.map\.dungeon$/);
  await page.getByTestId("map-seed").fill("e2e-crypt");
  await page.getByTestId("map-generate").click();
  const preview = page.getByTestId("map-preview");
  await expect(preview).toBeVisible({ timeout: 20_000 });
  await expect(preview.getByTestId("sitemap")).toHaveAttribute("data-view", "gm");
  await expect(page.getByTestId("map-checks").getByTestId("checks-block")).toContainText("Every room and passage can be reached from the way in");
  for (const stage of ["layout", "doors", "dressing", "stocking"]) await expect(page.getByTestId(`stage-${stage}`)).toBeVisible();

  // 2. save it with its rooms, encounters and monsters added to the campaign
  await page.getByTestId("map-name").fill("Barrow of the Ford");
  await expect(page.getByTestId("map-accept-entities").getByRole("checkbox")).toBeChecked();
  await page.getByTestId("map-save").click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/maps\/[0-9A-Z]{26}$/);
  await expect(page.getByText(/^Saved, with \d+ rooms, \d+ encounters? and \d+ creatures? added to the campaign/)).toBeVisible();

  // 3. the GM map: numbered rooms, the room key with links to the new room entities
  const mapPage = page.getByTestId("map-page");
  await expect(mapPage.getByTestId("sitemap")).toHaveAttribute("data-view", "gm");
  expect(await mapPage.getByTestId("sitemap").locator("[data-number]").count()).toBeGreaterThan(3);
  const key = mapPage.getByTestId("zone-key");
  await expect(key).toContainText("Room key");
  expect(await key.locator("[data-room-entity]").count()).toBeGreaterThan(3);

  // 4. the printable player map: no numbers, no GM marks
  await page.getByRole("tab", { name: "Player map" }).click();
  const playerView = mapPage.getByTestId("sitemap");
  await expect(playerView).toHaveAttribute("data-view", "player");
  await expect(playerView.locator("[data-number]")).toHaveCount(0);
  await expect(playerView.locator('[data-marker-kind="spawn"], [data-marker-kind="trap"], [data-marker-kind="treasure"]')).toHaveCount(0);

  // 5. table mode on the demo's own dungeon: the tower scene shows its live map
  await nav(page, "Sessions").click();
  await page.getByRole("button", { name: "Start session 1" }).click();
  await expect(page.getByTestId("table-mode")).toBeVisible();
  await page.getByRole("combobox", { name: "Scene" }).selectOption({ label: "5. The sunken watchtower" });
  const live = page.getByTestId("live-map");
  await expect(live).toBeVisible();

  const popupPromise = context.waitForEvent("page");
  await page.getByRole("button", { name: "Player screen" }).click();
  const players = await popupPromise;
  const playerMap = players.getByTestId("player-map");
  await expect(playerMap).toBeVisible();
  await expect(playerMap.locator("[data-number]")).toHaveCount(0);
  await expect(playerMap.locator('[data-marker-kind="spawn"], [data-marker-kind="trap"], [data-marker-kind="treasure"]')).toHaveCount(0);

  // 6. pick a room the party has not seen, reveal it, and see it appear on the player screen
  const fogged = live.locator('[data-fog^="R"]').first();
  const zoneId = (await fogged.getAttribute("data-fog"))!;
  await live.getByRole("button", { name: "Select", exact: true }).click();
  await live.locator(`[data-hit="zone"][data-zone="${zoneId}"]`).click({ force: true });
  const zone = live.getByTestId("live-zone");
  await expect(zone).toBeVisible();
  const name = ((await zone.getAttribute("aria-label")) ?? "").replace(/^Zone \d+ /, "");
  await expect(playerMap).not.toContainText(name);
  await zone.getByTestId("reveal-zone").click();
  await expect(live.locator(`[data-fog="${zoneId}"]`)).toHaveCount(0);
  await expect(playerMap).toContainText(name);
  // still no GM-only marks or room numbers on the players' screen
  await expect(playerMap.locator('[data-marker-kind="spawn"], [data-marker-kind="trap"], [data-marker-kind="treasure"]')).toHaveCount(0);
  const screen = players.getByTestId("player-screen");
  await expect(screen).not.toContainText("GM");
  await expect(screen).not.toContainText(/secret/i);
  // the tower's second storey stays off the players' screen until they reach it
  await expect(screen).not.toContainText("Floor 2");

  expect(errors).toEqual([]);
});

test("ORC dungeon: the Hollowmere demo's xulgath den renders as GM and player maps", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 1000 });
  await loadDemo(page, "load-demo-pf2e", "Hollowmere");
  await nav(page, "Generate").click();
  const section = page.getByRole("region", { name: "Site maps" });
  await expect(section.getByTestId("map-generator-pf2e-orc.map.dungeon")).toBeVisible();
  await section.getByRole("link", { name: "The Glimmer Caves" }).click();
  const mapPage = page.getByTestId("map-page");
  await expect(mapPage).toHaveAttribute("data-layout", "generated");
  await expect(mapPage.getByTestId("sitemap")).toHaveAttribute("data-view", "gm");
  await expect(mapPage.getByTestId("sitemap")).toContainText("The xulgath den");
  await expect(mapPage.getByTestId("zone-key")).toContainText("Room key");
  await page.getByRole("tab", { name: "Player map" }).click();
  await expect(mapPage.getByTestId("sitemap")).toHaveAttribute("data-view", "player");
  // the printable player plan: no room numbers, encounters, traps or treasure
  await expect(mapPage.getByTestId("sitemap").locator("[data-number]")).toHaveCount(0);
  await expect(mapPage.getByTestId("sitemap").locator('[data-marker-kind="spawn"], [data-marker-kind="trap"], [data-marker-kind="treasure"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});
