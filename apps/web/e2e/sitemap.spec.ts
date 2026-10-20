import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { CampaignStore, RichTextRegistry, exportBundle, runMapGenerator } from "@campaign-forge/core";
import { exampleModule, exampleSiteGenerator } from "@campaign-forge/module-example";

/**
 * A campaign on the Example Quest fixture module with a generated site map,
 * built in Node with the module's generator and imported as a bundle:
 * a location holding the map, and a planned session whose scene uses it.
 */
async function keepBundle(): Promise<Buffer> {
  const store = CampaignStore.create({
    name: "Keep Watch",
    moduleId: exampleModule.manifest.id,
    moduleVersion: exampleModule.manifest.version,
    mode: "standard",
    calendarId: exampleModule.calendar.id,
  });
  const place = store.createEntity({ type: "example.place", name: "Old keep", fields: { terrain: "hills", danger: "uneasy" } });
  const inputs = { darkness: 40, lockedAct: 2 };
  const result = runMapGenerator(exampleModule, exampleSiteGenerator, inputs, { seed: "e2e-keep" });
  const map = store.createMap({ name: "Keep deck plan", location: place.id });
  store.update("maps", map.id, { layout: result.layout, generator: { id: exampleSiteGenerator.id, seed: "e2e-keep", inputs } });
  const adventure = store.createAdventure({ title: "The Lost Bell", status: "active" });
  const act = store.createAct(adventure.id, { number: 1 });
  store.createScene(act.id, { title: "Into the keep", map: map.id, location: place.id });
  store.createSession({ status: "planned", title: "Night one" });
  return Buffer.from(await exportBundle(store, new RichTextRegistry(), undefined, { id: exampleModule.manifest.id, version: exampleModule.manifest.version }));
}

test("a generated site map: views, zone key download, live reveal in table mode, fog on the player screen", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 1000 });

  // 1. import the campaign
  await page.goto("/?dev");
  await page.getByLabel("Import bundle file").setInputFiles({ name: "keep.zip", mimeType: "application/zip", buffer: await keepBundle() });
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 30_000 });

  // 2. open the map page through the location
  await page.getByRole("navigation", { name: "Campaign" }).getByRole("link", { name: "Atlas", exact: true }).click();
  await page.getByRole("tab", { name: /^Locations/ }).click();
  await page.getByRole("link", { name: "Old keep", exact: true }).click();
  await page.getByTestId("location-maps").getByRole("link", { name: "Keep deck plan" }).click();
  const mapPage = page.getByTestId("map-page");
  await expect(mapPage).toHaveAttribute("data-layout", "generated");

  // GM map: numbers, a clue, duct access squares and the checks
  const sitemap = mapPage.getByTestId("sitemap");
  await expect(sitemap).toHaveAttribute("data-view", "gm");
  await expect(sitemap.locator("[data-number]")).toHaveCount(8);
  await expect(sitemap.locator('[data-marker-kind="clue"]')).toHaveCount(1);
  await expect(sitemap.locator('[data-access-to="D01"]')).toHaveText("D01");
  await expect(page.getByTestId("map-checks")).toContainText("All checks pass");
  await expect(page.getByTestId("map-legend")).toContainText("Portcullis");

  // clicking a zone shows its key entry
  await sitemap.locator('[data-hit="zone"][data-zone="R6"]').click();
  await expect(page.getByTestId("zone-detail")).toContainText("Exits");

  // the duct sheets sit under the deck they serve; the crawlways show tubes, exits, the drop and the spawn
  const decks = sitemap.getByRole("group", { name: "Decks" });
  await expect(decks.getByRole("group", { name: "Duct sheets of Ground floor" }).getByRole("button")).toHaveText(["Undercroft crawl", "Crawlways"]);
  await decks.getByRole("button", { name: "Crawlways" }).click();
  await expect(sitemap).toHaveAttribute("data-deck", "crawl");
  await expect(sitemap.locator('[data-sheet="duct"]')).toHaveCount(1);
  await expect(sitemap.locator('[data-badge="exit"]')).toHaveCount(2);
  await expect(sitemap.locator('[data-badge="exit"] [data-badge-text]').first()).toHaveText(/^To .+ \(R2\)$/);
  await expect(sitemap.locator('[data-badge="shaft"][data-badge-glyph="drop"] [data-badge-text]')).toHaveText("Undercroft crawl, U01");
  await expect(sitemap.locator('[data-marker-kind="spawn"]')).toHaveCount(1);
  // following an exit badge goes back to the room on the floor deck
  await sitemap.locator('[data-hit="link"][data-link-zone="R2"]').click();
  await expect(sitemap).toHaveAttribute("data-deck", "main");
  await expect(page.getByTestId("zone-detail")).toContainText("Duct access to Crawlways, D01");

  // 3. switch views
  await page.getByRole("tab", { name: "Player map" }).click();
  await expect(mapPage.getByTestId("sitemap")).toHaveAttribute("data-view", "player");
  await expect(mapPage.getByTestId("sitemap").locator("[data-number]")).toHaveCount(0);
  await expect(mapPage.getByTestId("sitemap").locator('[data-marker-kind="spawn"]')).toHaveCount(0);
  await expect(page.getByTestId("map-legend")).not.toContainText("Spawn");
  await page.getByRole("tab", { name: "Tracking map" }).click();
  await expect(mapPage.getByTestId("sitemap")).toHaveAttribute("data-view", "tracking");
  await expect(mapPage.getByTestId("sitemap").locator("[data-area]")).toHaveCount(0);
  await page.getByRole("tab", { name: "GM map" }).click();

  // 4. download the zone key (Markdown) and the distance table (CSV)
  const keyDownload = page.waitForEvent("download");
  await page.getByTestId("zone-key-md").click();
  const key = await keyDownload;
  expect(key.suggestedFilename()).toBe("keep-deck-plan-zone-key.md");
  const md = readFileSync((await key.path())!, "utf8");
  expect(md).toContain("# Keep deck plan: zone key");
  expect(md).toContain("| 9 | West vent (D01) | open |");
  expect(md).toMatch(/\| 11 \| Junction \(D03\) \|[^\n]*Drop down to Undercroft crawl, U01 \(Drop shaft/);
  await expect(page.getByTestId("zone-key").locator("[data-zone-row]")).toHaveCount(15);
  const distDownload = page.waitForEvent("download");
  await page.getByTestId("distance-csv").click();
  const dist = await distDownload;
  expect(readFileSync((await dist.path())!, "utf8").split("\r\n")[0]).toBe("from_number,from_id,from_name,to_number,to_id,to_name,distance,range_band");
  const svgDownload = page.waitForEvent("download");
  await page.getByTestId("download-svg").click();
  expect((await svgDownload).suggestedFilename()).toBe("keep-deck-plan-gm-map-ground-floor.svg");

  // roll print: a 30 x 20 m keep at 1 in = 1 m fits a 36" roll as it is, and a 24" roll turned
  const roll = page.getByTestId("roll-print");
  await expect(roll.getByTestId("roll-scale")).toHaveValue("25.4");
  await expect(roll.getByTestId("roll-grid")).not.toBeChecked();
  await expect(roll.getByTestId("roll-summary")).toHaveText(/^GM map · 36" roll · 1 page · [\d.]+" of paper$/);
  const pdfDownload = page.waitForEvent("download");
  await roll.getByTestId("download-roll-pdf").click();
  const pdfFile = await pdfDownload;
  expect(pdfFile.suggestedFilename()).toBe("keep-deck-plan-gm-map-ground-floor-roll-36in-1in-per-m.pdf");
  const pdf = readFileSync((await pdfFile.path())!);
  expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  expect(pdf.toString("latin1").match(/\/Type \/Page /g)).toHaveLength(1);
  expect(pdf.toString("latin1")).toContain("/MediaBox [0 0 2592 ");
  await roll.getByTestId("roll-width").selectOption("24");
  await expect(roll.getByTestId("roll-summary")).toHaveText(/24" roll · 1 page · [\d.]+" of paper · turned 90°$/);
  // GM prints default to no grid squares; the player view at a miniature scale turns them on
  await page.getByRole("tab", { name: "Player map" }).click();
  await expect(page.getByTestId("roll-grid")).toBeChecked();
  await expect(page.getByTestId("roll-summary")).toContainText("Player map · 24\" roll");
  const playerPdf = page.waitForEvent("download");
  await page.getByTestId("download-roll-pdf").click();
  const playerFile = readFileSync((await (await playerPdf).path())!).toString("latin1");
  expect(playerFile.startsWith("%PDF-1.4")).toBe(true);
  expect(playerFile.match(/\/Type \/Page /g)).toHaveLength(1);
  expect(playerFile).not.toContain("Ghoul");
  await page.getByRole("tab", { name: "GM map" }).click();

  // 5. table mode: start the session; the live map starts with the start zone revealed
  await page.getByRole("navigation", { name: "Campaign" }).getByRole("link", { name: "Home", exact: true }).click();
  await page.getByRole("button", { name: "Start this session" }).click();
  await expect(page.getByTestId("table-mode")).toBeVisible();
  const live = page.getByTestId("live-map");
  await expect(live).toBeVisible();
  await expect(live.locator('[data-fog="R4"]')).toHaveCount(0);
  await expect(live.locator('[data-fog="C1"]')).toHaveCount(1);

  // the player screen shows the player projection with fog
  const popupPromise = context.waitForEvent("page");
  await page.getByRole("button", { name: "Player screen" }).click();
  const players = await popupPromise;
  const playerMap = players.getByTestId("player-map");
  await expect(playerMap).toBeVisible();
  await expect(playerMap.locator('[data-fog="C1"]')).toHaveCount(1);
  await expect(playerMap.locator('[data-fog="R4"]')).toHaveCount(0);
  await expect(playerMap.locator("[data-number]")).toHaveCount(0);
  await expect(playerMap.locator('[data-marker-kind="spawn"], [data-marker-kind="clue"], [data-marker-kind="npc"]')).toHaveCount(0);

  // 6. reveal the west passage with the reveal tool
  await live.getByRole("button", { name: "Reveal", exact: true }).click();
  await live.locator('[data-hit="zone"][data-zone="C1"]').click();
  await expect(live.locator('[data-fog="C1"]')).toHaveCount(0);
  await expect(playerMap.locator('[data-fog="C1"]')).toHaveCount(0);

  // range between two zones
  await live.getByRole("combobox", { name: "Range from" }).selectOption("R4");
  await live.getByRole("combobox", { name: "Range to" }).selectOption("R6");
  await expect(live.getByTestId("range-reading")).toHaveText(/^3 zones · Far/);

  // a hidden token stays off the player screen; a visible one in a revealed zone shows
  await live.getByRole("button", { name: "Select", exact: true }).click();
  await live.locator('[data-hit="zone"][data-zone="R4"]').click();
  const zone = live.getByTestId("live-zone");
  await expect(zone).toHaveAttribute("aria-label", /Zone 4 /);
  await zone.getByRole("textbox", { name: "New token name" }).fill("Ghoul");
  await zone.getByRole("button", { name: "Place" }).click();
  await expect(live.locator("[data-token]")).toHaveCount(1);
  await zone.getByRole("textbox", { name: "New token name" }).fill("Ada");
  await zone.getByRole("checkbox", { name: "hidden" }).uncheck();
  await zone.getByRole("button", { name: "Place" }).click();
  await expect(live.locator("[data-token]")).toHaveCount(2);
  await expect(playerMap.locator("[data-token]")).toHaveCount(1);
  await expect(playerMap).not.toContainText("Ghoul");

  // 7. ducts: follow the crawl hole from the room to the duct sheet, reveal the vent, roll a duct event
  await expect(playerMap.getByRole("button", { name: "Crawlways" })).toHaveCount(0);
  await live.locator('[data-hit="link"][data-link-zone="D01"]').click();
  await expect(live.getByTestId("sitemap")).toHaveAttribute("data-deck", "crawl");
  const vent = live.getByTestId("live-zone");
  await expect(vent).toHaveAttribute("aria-label", /West vent/);
  await vent.getByTestId("reveal-zone").click();
  await expect(live.locator('[data-fog="D01"]')).toHaveCount(0);
  const events = live.getByTestId("duct-events");
  await expect(events).toContainText("Duct event");
  await expect(events).toContainText("Roll when a token enters a crawlway zone.");
  await events.getByTestId("duct-event-roll").click();
  const rolled = live.getByTestId("duct-event-result");
  await expect(rolled).toContainText(/^Crawl event \(\d+ West vent\): (A dry nook|Rats|Loose panel|Followed)/);
  const eventText = ((await rolled.textContent()) ?? "").replace(/^[^:]*: /, "").split(" · ")[0]!;
  // the player screen: the duct sheet with the revealed vent and fog for the rest, never the event
  await playerMap.getByRole("button", { name: "Crawlways" }).click();
  await expect(playerMap.getByTestId("sitemap")).toHaveAttribute("data-deck", "crawl");
  await expect(playerMap.locator('[data-duct="D01"]')).toHaveCount(1);
  await expect(playerMap.locator('[data-duct="D02"]')).toHaveCount(0);
  await expect(playerMap.locator('[data-sheet-fog="crawl"]')).toHaveCount(1);
  await expect(playerMap.locator("[data-number]")).toHaveCount(0);
  await expect(players.getByTestId("player-screen")).not.toContainText("Crawl event");
  await expect(players.getByTestId("player-screen")).not.toContainText(eventText);

  expect(errors).toEqual([]);
});
