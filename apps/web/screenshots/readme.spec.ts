/**
 * The README screenshots, regenerated from the four deterministic demo
 * campaigns (Skyfire Down, Cold Harbor Relay, Thornwick Crossing, Hollowmere): `pnpm screenshots` at the repo root builds the app and runs
 * every shot; `pnpm --filter @campaign-forge/web screenshots -g <name>`
 * re-runs one (the app must be built). Images go to docs/screenshots/, or to
 * `SCREENSHOTS_DIR`.
 *
 * Every page starts from a fixed clock (Date only; timers run) and a seeded
 * `crypto.getRandomValues`/`Math.random`, so record ids, roll seeds and dice
 * come out the same on every run, the session timer reads 00:00 and relative
 * times read "just now". The roll print is drawn Node-side from the same
 * demo and the app's own roll print code, then rasterised by Chromium.
 */
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generatorFor, type SiteMap } from "@campaign-forge/core";
import { alienModule, createMapContext, generateSiteMap, MAP_LEGEND, SITE_TYPE_LABELS, SITE_TYPES, siteMapGenerator } from "@campaign-forge/module-alien";
import { buildCinematicDemo, buildDemoCampaign } from "@campaign-forge/seed-campaign";
import { LIGHT_PALETTE, drawSiteMap, nodeToString, planRollPrint, rollPrintPages } from "@campaign-forge/ui";
import { expect, test, type Locator, type Page } from "@playwright/test";

const OUT = process.env.SCREENSHOTS_DIR ? resolve(process.env.SCREENSHOTS_DIR) : fileURLToPath(new URL("../../../docs/screenshots/", import.meta.url));
mkdirSync(OUT, { recursive: true });
const file = (name: string) => resolve(OUT, `${name}.png`);

/** The instant every page's Date reads (the demo's own dates are fixed in its data). */
const FIXED_NOW = new Date("2026-10-20T19:00:00Z");

/** Runs in the page before any app code: a seeded PRNG behind crypto.getRandomValues and Math.random. */
function seedRandomness(seed: number) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Math.random = next;
  const fill = <T extends ArrayBufferView | null>(array: T): T => {
    if (array) {
      const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(next() * 256);
    }
    return array;
  };
  Object.defineProperty(crypto, "getRandomValues", { value: fill, configurable: true });
}

/** Screenshot-only CSS: no text caret, no scrollbars that come and go. */
const SHOT_CSS = `
  *, *::before, *::after { caret-color: transparent !important; }
  html { scrollbar-width: none; }
`;

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FIXED_NOW);
  await page.addInitScript(seedRandomness, 0x5eed);
  await page.addInitScript((css: string) => {
    const add = () => {
      const style = document.createElement("style");
      style.dataset.screenshots = "";
      style.textContent = css;
      document.head.append(style);
    };
    if (document.head) add();
    else document.addEventListener("DOMContentLoaded", add, { once: true });
  }, SHOT_CSS);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  pageErrors.set(page, errors);
});

test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page) ?? []).toEqual([]);
});

const pageErrors = new WeakMap<Page, string[]>();

/** The cinematic demo, built Node-side once per worker (the same data the app loads). */
let cinematic: ReturnType<typeof buildCinematicDemo>["maps"] | undefined;
let cinematicMapId: string | undefined;
function cinematicDemo() {
  if (!cinematic) {
    const demo = buildCinematicDemo();
    cinematic = demo.maps;
    cinematicMapId = demo.ids.map;
    demo.registry.closeAll();
    demo.store.destroy();
  }
  return { maps: cinematic, mapId: cinematicMapId! };
}
function cinematicSiteMap() {
  const { maps, mapId } = cinematicDemo();
  const map: SiteMap | undefined = maps.maps[mapId];
  if (!map?.layout) throw new Error("the cinematic demo has no generated site map");
  return { ...map, layout: map.layout };
}
function coldLabZone(): string {
  const zone = cinematicSiteMap().layout.zones.find((z) => z.name === "Cold Lab");
  if (!zone) throw new Error("no Cold Lab zone on the cinematic site map");
  return zone.id;
}

const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "Campaign" }).getByRole("link", { name, exact: true });

/** Settle: fonts loaded, two frames painted, no pending network. */
async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
}

async function shot(page: Page, name: string, opts: { clip?: { x: number; y: number; width: number; height: number } } = {}) {
  await calm(page);
  await settle(page);
  await page.screenshot({ path: file(name), animations: "disabled", caret: "hide", ...(opts.clip ? { clip: opts.clip } : {}) });
}

const DEMOS = {
  skyfire: { button: "load-demo", name: "Skyfire Down" },
  cinematic: { button: "load-demo-cinematic", name: "Cold Harbor Relay" },
  dnd5e: { button: "load-demo-5e", name: "Thornwick Crossing" },
  pf2e: { button: "load-demo-pf2e", name: "Hollowmere" },
} as const;

async function loadDemo(page: Page, which: keyof typeof DEMOS): Promise<string> {
  await page.goto("/");
  await page.getByTestId(DEMOS[which].button).click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 30_000 });
  await expect(page.getByTestId("campaign-name")).toHaveText(DEMOS[which].name);
  return page.url().replace(/\/home$/, "");
}

async function startSession1(page: Page) {
  await nav(page, "Sessions").click();
  await page.getByRole("button", { name: "Start session 1" }).click();
  await expect(page.getByTestId("table-mode")).toBeVisible();
  await expect(page.getByTestId("timer")).toHaveText("00:00");
}

/** The cinematic demo's saved site map page. */
async function openSiteMap(page: Page) {
  await nav(page, "Adventures").click();
  await page.getByTestId("adventure-card").filter({ hasText: "Cold Harbor" }).click();
  await page.getByTestId("step-review").click();
  await page.getByTestId("site-map-card").getByTestId("site-map-link").click();
  const mapPage = page.getByTestId("map-page");
  await expect(mapPage).toHaveAttribute("data-layout", "generated");
  await expect(mapPage.getByTestId("sitemap")).toHaveAttribute("data-view", "gm");
  return mapPage;
}

/** Fit the map again once the page has settled: the fit on mount can land a sub-pixel off while the layout still moves. */
async function refit(mapPage: Locator) {
  await settle(mapPage.page());
  await mapPage.getByTestId("sitemap").getByRole("button", { name: "Fit", exact: true }).click();
}

/** No hover or focus ring left on whatever was clicked last. */
async function calm(page: Page) {
  await page.mouse.move(0, 0);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  // let hover and focus transitions finish
  await page.waitForTimeout(400);
}

// ---------------------------------------------------------------------------
// Skyfire Down (campaign play)
// ---------------------------------------------------------------------------

test("campaign-list", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1040 });
  // a few demos loaded, then back to the front page: one section per game system.
  // Back in history, not a reload: the shot's seeded randomness restarts on every
  // page load, so a reload between demos would give them the same campaign id.
  await page.goto("/");
  for (const which of ["skyfire", "cinematic", "dnd5e", "pf2e"] as const) {
    await page.getByTestId(DEMOS[which].button).click();
    await expect(page.getByTestId("campaign-name")).toHaveText(DEMOS[which].name, { timeout: 30_000 });
    await page.goBack();
    await expect(page.getByTestId(DEMOS[which].button)).toBeEnabled();
  }
  await expect(page.getByTestId("module-group")).toHaveCount(3);
  await expect(page.locator('[data-module="alien"]').getByRole("link")).toHaveCount(2);
  await shot(page, "campaign-list");
});

test("home", async ({ page }) => {
  await loadDemo(page, "skyfire");
  await expect(page.getByRole("heading", { name: "Next session" })).toBeVisible();
  await shot(page, "home");
});

test("character-sheet", async ({ page }) => {
  const base = await loadDemo(page, "skyfire");
  await page.goto(`${base}/atlas`);
  await page.getByRole("tab", { name: /^PCs/ }).click();
  await page.getByRole("tabpanel").getByRole("link").first().click();
  await expect(page).toHaveURL(/\/entities\/[0-9A-Z]{26}$/);
  await expect(page.getByTestId("entity-title")).toHaveValue(/\S/);
  await shot(page, "character-sheet");
});

test("alien-weapons", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const base = await loadDemo(page, "skyfire");
  await page.goto(`${base}/atlas`);
  await page.getByRole("tab", { name: /^PCs/ }).click();
  // the colonial marshal: a revolver and a stun baton from the gear tables
  await page.getByRole("tabpanel").getByRole("link", { name: "Lee-Ann Jenkins" }).click();
  const weapons = page.locator('[data-section="weapons"]');
  await expect(weapons.getByTestId("weapons-table").getByRole("rowheader")).toHaveText([".357 Magnum Revolver", "Stun Baton"]);
  await weapons.evaluate((e) => e.scrollIntoView({ block: "start" }));
  await weapons.getByRole("button", { name: "Add weapon" }).click();
  const picker = page.getByTestId("weapon-picker");
  await expect(picker.getByRole("heading")).toHaveText(["Ranged", "Melee", "Explosive"]);
  // scroll the list to its end: the last rifles and launchers, then the melee and explosive groups, under the search
  await picker.locator('[data-group="weapon:explosive"]').evaluate((e) => e.scrollIntoView({ block: "end" }));
  await shot(page, "alien-weapons");
});

test("generator", async ({ page }) => {
  const base = await loadDemo(page, "skyfire");
  await page.goto(`${base}/generate`);
  await page.getByRole("link", { name: "Re-open" }).nth(1).click();
  await expect(page.getByRole("heading", { name: /Star System Generator/ })).toBeVisible();
  await expect(page.getByTestId("workbench")).toBeVisible();
  await shot(page, "generator");
});

test("table-mode", async ({ page }) => {
  await loadDemo(page, "skyfire");
  await startSession1(page);
  await shot(page, "table-mode");
});

test("table-hints", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loadDemo(page, "skyfire");
  await startSession1(page);
  await page.getByRole("tab", { name: "Hints" }).click();
  const entry = page.locator('[data-entry="observation"]');
  await entry.getByRole("button", { name: /^Observation/ }).first().click();
  await entry.evaluate((e) => e.scrollIntoView({ block: "start" }));
  await shot(page, "table-hints");
});

test("enter-dice", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1300 });
  await loadDemo(page, "skyfire");
  await startSession1(page);
  // the group rolls physical dice: table mode asks for the faces instead of rolling
  await page.getByRole("tab", { name: "Dice" }).click();
  await page.getByTestId("dice-mode-enter").first().click();
  const skill = page.locator(".app-table__skillroll");
  await skill.getByRole("combobox", { name: "Character" }).selectOption({ label: "Elena Sanchez" });
  await skill.getByRole("combobox", { name: "Skill" }).selectOption({ label: "Heavy Machinery (Strength)" });
  const panel = skill.getByTestId("dice-panel");
  // the four base dice as the table rolled them: one success, then a push asks only for the three re-rolled dice and the push's stress die
  for (const [i, f] of [6, 2, 3, 1].entries()) await panel.getByTestId(`enter-die-${i}`).fill(String(f));
  await panel.getByTestId("enter-dice-submit").click();
  await expect(panel.getByTestId("successes")).toHaveText("1");
  await panel.getByRole("button", { name: "Push" }).click();
  const push = panel.getByTestId("enter-dice");
  await push.getByTestId("enter-die-0").fill("6");
  await push.getByTestId("enter-die-1").fill("4");
  await expect(push.getByTestId("enter-dice-status")).toHaveText("Needs 2 more dice.");
  // frame the dice column from the tab row (the table's switch) to the end of the skill roll card
  const col = page.locator(".app-table__col").nth(1);
  await settle(page);
  const a = (await col.boundingBox())!;
  const b = (await skill.boundingBox())!;
  const pad = 8;
  const clip = { x: Math.floor(a.x - pad), y: Math.floor(a.y - pad), width: Math.ceil(a.width + 2 * pad), height: Math.ceil(b.y + b.height - a.y + 2 * pad) };
  expect(clip.y + clip.height, "the skill roll card fits").toBeLessThanOrEqual(page.viewportSize()!.height);
  await shot(page, "enter-dice", { clip });
});

test("ship", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1300 });
  const base = await loadDemo(page, "skyfire");
  await page.goto(`${base}/ship`);
  await expect(page.getByTestId("ship-page")).toBeVisible();
  await expect(page.getByTestId("funds-balance")).toHaveText("$18,330");
  // plan the run back to the job's system, with one PC awake for the trip
  await page.getByTestId("travel-destination").selectOption({ label: "Y87-544" });
  await expect(page.getByTestId("travel-days")).toHaveText("12 days");
  await page.getByTestId("travel-planner").getByRole("checkbox", { name: /Stays awake/ }).first().check();
  await expect(page.getByTestId("travel-checks")).toContainText("NDD roll");
  await shot(page, "ship");
});

/** The Skyfire Down PC who already spent XP (their history has awards and a spend), built Node-side like the app's demo. */
function skyfireSpender(): string {
  const demo = buildDemoCampaign();
  const spend = Object.values(demo.maps.advancement).find((e) => e.kind === "spend");
  const name = spend ? demo.maps.entities[spend.character]?.name : undefined;
  demo.registry.closeAll();
  demo.store.destroy();
  if (!name) throw new Error("the Skyfire Down demo has no XP spend");
  return name;
}

test("progression", async ({ page }) => {
  // wide enough for the history to stay readable beside the Spend XP panel
  await page.setViewportSize({ width: 1680, height: 1000 });
  const base = await loadDemo(page, "skyfire");
  await page.goto(`${base}/atlas`);
  await page.getByRole("tab", { name: /^PCs/ }).click();
  await page.getByRole("tabpanel").getByRole("link", { name: skyfireSpender(), exact: true }).click();
  await page.getByRole("tab", { name: "Progression" }).click();
  await expect(page.getByTestId("advancement-history")).toContainText("Learn a talent");
  await page.getByTestId("spend-xp").click();
  const dialog = page.getByTestId("spend-dialog");
  await dialog.locator(".prog-target:not(.is-blocked)").first().click();
  await expect(page.getByTestId("spend-quote")).toBeVisible();
  const confirm = page.getByRole("checkbox", { name: "Confirm the condition" });
  if (await confirm.count()) await confirm.check();
  await dialog.locator(".prog-targets").evaluate((el) => el.scrollTo(0, 0));
  await shot(page, "progression");
});

test("wrap-up-awards", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1250 });
  await loadDemo(page, "skyfire");
  await startSession1(page);
  await page.getByTestId("end-session").click();
  const wrap = page.getByTestId("wrapup");
  await wrap.getByRole("textbox", { name: "Session summary" }).fill("The crew took the Weyland-Yutani job and left the station.");
  await wrap.getByRole("button", { name: /^Next: End-of-session questions/ }).click();
  await wrap.getByRole("button", { name: /^Next: Rewards/ }).click();
  const grid = wrap.getByTestId("award-checklist");
  const tick = async (q: string, cols: number[]) => {
    for (const i of cols) await grid.locator(`[data-question="alien.award.${q}"] input`).nth(i).check();
  };
  await tick("danger", [0, 1, 2, 3]);
  await tick("discovery", [1]);
  await tick("money", [0, 1, 2, 3]);
  await tick("extraordinary", [2]);
  await shot(page, "wrap-up-awards");
});

test("rules", async ({ page }) => {
  const base = await loadDemo(page, "skyfire");
  await page.goto(`${base}/rules`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await shot(page, "rules");
});

// ---------------------------------------------------------------------------
// Cold Harbor Relay (cinematic)
// ---------------------------------------------------------------------------

test("creature-turn", async ({ page }) => {
  // wide enough for the four PCs in one row of participant cards, tall enough for that row under the turn card
  await page.setViewportSize({ width: 2100, height: 1800 });
  await loadDemo(page, "cinematic");
  await startSession1(page);
  const sceneSelect = page.getByRole("combobox", { name: "Scene" });
  await sceneSelect.selectOption((await sceneSelect.locator("option", { hasText: "The Cold Lab" }).getAttribute("value"))!);
  const hugger = page.getByRole("list", { name: "Scene participants" }).locator("li", { hasText: "Facehugger" });
  const huggerName = (await hugger.locator(".app-participant__name").innerText()).trim();

  // on the live map: the facehugger's token in the Cold Lab (hidden from the players), and two of the
  // crew in there with it, so the turn shows the range to each PC
  const live = page.getByTestId("live-map");
  await live.locator(`[data-hit="zone"][data-zone="${coldLabZone()}"]`).click();
  const zone = live.getByTestId("live-zone");
  const place = zone.getByRole("combobox", { name: "Place a participant here" });
  await place.selectOption((await place.locator("option", { hasText: huggerName }).getAttribute("value"))!);
  for (const pc of ["Rosa Ilunga", "Ana Kovac"]) {
    const move = zone.getByRole("combobox", { name: "Move a token here" });
    await move.selectOption((await move.locator("option", { hasText: pc }).getAttribute("value"))!);
    await expect(zone.getByRole("list", { name: "Tokens here" })).toContainText(pc);
  }
  const token = live.getByRole("list", { name: "Tokens" }).getByRole("listitem").filter({ hasText: huggerName });
  await token.getByRole("checkbox", { name: "hidden" }).check();
  await zone.getByRole("button", { name: "Close zone" }).click();

  await hugger.getByRole("button", { name: `Creature turn: ${huggerName}` }).click();
  const turn = page.getByTestId("creature-turn");
  await expect(turn).toBeVisible();
  // the GM picks the row with dice (every facehugger row deals 0 damage) and rolls it at Rosa until it lands
  await turn.getByRole("button", { name: "Choose attack" }).click();
  await turn.getByRole("button", { name: "Use Face Grapple" }).click();
  await expect(turn.getByTestId("attack-name")).toHaveText("Face Grapple");
  await expect(turn.getByTestId("target-ranges")).toBeVisible();
  const targetSelect = turn.getByRole("combobox", { name: "Target" });
  await targetSelect.selectOption((await targetSelect.locator("option", { hasText: "Rosa Ilunga" }).getAttribute("value"))!);
  for (let i = 0; i < 12; i++) {
    await turn.getByRole("button", { name: /^Roll attack/ }).click();
    if (!/^0 /.test(await turn.getByTestId("attack-successes").innerText())) break;
  }
  await expect(turn.getByTestId("attack-successes")).not.toHaveText(/^0 /);
  await expect(turn.getByTestId("target-ranges").locator("li", { hasText: "Rosa Ilunga" })).toContainText("same zone");

  // frame the left column from the turn card to the end of the PCs' participant cards (health bars and all)
  const participants = page.getByRole("list", { name: "Player characters" });
  await turn.evaluate((e) => e.scrollIntoView({ block: "start" }));
  await settle(page);
  const a = (await turn.boundingBox())!;
  const b = (await participants.boundingBox())!;
  const pad = 12;
  const x = Math.floor(Math.min(a.x, b.x) - pad);
  const y = Math.floor(a.y - pad);
  const clip = { x, y, width: Math.ceil(Math.max(a.x + a.width, b.x + b.width) + pad - x), height: Math.ceil(b.y + b.height + 4 - y) };
  expect(clip.y + clip.height, "the PCs fit under the turn card").toBeLessThanOrEqual(page.viewportSize()!.height);
  await shot(page, "creature-turn", { clip });
});

test("guided-builder", async ({ page }) => {
  await loadDemo(page, "cinematic");
  await nav(page, "Adventures").click();
  await page.getByTestId("adventure-card").filter({ hasText: "Cold Harbor" }).click();
  await expect(page.getByTestId("guided-builder")).toBeVisible();
  await page.getByTestId("step-basics").click();
  await expect(page.getByTestId("guided-title")).toHaveValue("Cold Harbor");
  await expect(page.getByRole("textbox", { name: "Tagline" })).not.toHaveValue("");
  await expect(page.getByRole("textbox", { name: "Content note" })).not.toHaveValue("");
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "guided-builder");
});

test("map-generator", async ({ page }) => {
  await loadDemo(page, "cinematic");
  const mapPage = await openSiteMap(page);
  await mapPage.getByTestId("regenerate-map").click();
  await expect(page).toHaveURL(/\/maps\/new/);
  const generate = page.getByTestId("map-generate");
  if (!(await page.getByTestId("map-preview").isVisible())) await generate.click();
  await expect(page.getByTestId("map-preview")).toBeVisible({ timeout: 20_000 });
  // the brief's key rooms (from the adventure) beside the checks list
  const keyRooms = page.getByRole("group", { name: /^Key rooms/ });
  await keyRooms.evaluate((e) => window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - 140));
  await shot(page, "map-generator");
});

test("site-map-gm", async ({ page }) => {
  await loadDemo(page, "cinematic");
  await refit(await openSiteMap(page));
  await shot(page, "site-map-gm");
});

test("site-map-player", async ({ page }) => {
  await loadDemo(page, "cinematic");
  const mapPage = await openSiteMap(page);
  await page.getByRole("tab", { name: "Player map" }).click();
  await expect(mapPage.getByTestId("sitemap")).toHaveAttribute("data-view", "player");
  await refit(mapPage);
  await shot(page, "site-map-player");
});

test("duct-map", async ({ page, browser }) => {
  await loadDemo(page, "cinematic");
  const mapPage = await openSiteMap(page);
  const decks = mapPage.getByTestId("sitemap").getByRole("group", { name: "Decks" });
  await decks.getByRole("button", { name: /^Ducts over Level 1/ }).click();
  const download = page.waitForEvent("download");
  await page.getByTestId("download-svg").click();
  const svg = await readDownload(await download);
  await rasterSvg(browser, svg, "duct-map", { width: 1400, background: "#1b2530" });
});

test("roll-print", async ({ browser }) => {
  // the cinematic demo's site map, GM view, on a 36" roll at 1 inch per metre, as the map page's "Download PDF" prints it
  const map = cinematicSiteMap();
  const def = generatorFor(map, alienModule);
  const options = {
    view: "gm" as const,
    deck: map.layout.decks[0]?.id,
    legend: def?.legend,
    passable: def?.passable,
    rollWidthIn: 36,
    mmPerMetre: 25.4,
    gridSquares: false,
    titleBlock: true,
    title: map.name,
    act: 1,
  };
  const plan = planRollPrint(map.layout, options);
  const [first] = rollPrintPages(map.layout, options, plan);
  if (!first) throw new Error("no roll print page");
  const DPI = 30;
  const k = DPI / 72; // pages are in points
  const width = Math.round(first.width * k);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${Math.round(first.height * k)}" viewBox="0 0 ${first.width} ${first.height}">${nodeToString(first.node)}</svg>`;
  await rasterSvg(browser, svg, "roll-print", { width, background: "#ffffff" });
});

/** Seeds for the site-types shot: one medium map per site type from the same brief (fixed, so the image is reproducible). */
const SITE_TYPE_SEEDS: Record<(typeof SITE_TYPES)[number], string> = {
  starship: "look-1",
  derelict: "look-1",
  station_deck: "look-3",
  colony_block: "look-1",
  mine: "look-3",
  research_lab: "look-3",
  alien_ruin: "look-4",
};

test("site-types", async ({ browser }) => {
  // one medium map per site type, GM view, generated Node-side and tiled 4 x 2 with each type's name
  const cols = 4;
  const cellW = 120;
  const cellH = 92;
  const head = 7;
  const tiles = SITE_TYPES.map((site, i) => {
    const r = generateSiteMap({ site_type: site, size: "medium" }, createMapContext(SITE_TYPE_SEEDS[site]));
    if (r.failedCheck) throw new Error(`${site}: ${r.failedCheck}`);
    const deck = r.layout.decks.find((d) => d.layer !== "duct")!.id;
    const d = drawSiteMap(r.layout, { view: "gm", deck, legend: MAP_LEGEND, passable: siteMapGenerator.passable, act: 1, idPrefix: `st${i}` });
    const k = Math.min((cellW - 4) / d.width, (cellH - head - 4) / d.height);
    const x = (i % cols) * cellW;
    const y = Math.floor(i / cols) * cellH;
    const w = d.width * k;
    const h = d.height * k;
    const label = `<text x="${x + cellW / 2}" y="${y + 5}" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="3.6" font-weight="600" fill="${LIGHT_PALETTE.text}">${SITE_TYPE_LABELS[site]}</text>`;
    return `${label}<svg x="${x + (cellW - w) / 2}" y="${y + head + (cellH - head - 2 - h) / 2}" width="${w}" height="${h}" viewBox="0 0 ${d.width} ${d.height}">${nodeToString(d.node)}</svg>`;
  });
  const last = SITE_TYPES.length;
  const note = `<text x="${(last % cols) * cellW + cellW / 2}" y="${Math.floor(last / cols) * cellH + cellH / 2}" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="3" fill="${LIGHT_PALETTE.muted}"><tspan x="${(last % cols) * cellW + cellW / 2}">One brief, seven site types:</tspan><tspan x="${(last % cols) * cellW + cellW / 2}" dy="4.5">medium maps, GM view, first deck</tspan></text>`;
  const width = cols * cellW;
  const height = Math.ceil((last + 1) / cols) * cellH;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${LIGHT_PALETTE.background}"/>${tiles.join("")}${note}</svg>`;
  await rasterSvg(browser, svg, "site-types", { width: 2000, background: LIGHT_PALETTE.background });
});

/** The cinematic demo's print views, shown as paper sheets on the desk: only the named sheets, each cut to one page. */
async function printSheets(page: Page, view: "booklet" | "agendas", show: string, zoom: number) {
  // `show`: the sheets to keep, as a selector list (e.g. ".bk-titlepage, #bk-act-1")
  await loadDemo(page, "cinematic");
  await nav(page, "Adventures").click();
  await page.getByTestId("adventure-card").filter({ hasText: "Cold Harbor" }).click();
  await page.getByTestId(view === "booklet" ? "guided-booklet" : "guided-agenda-cards").click();
  await page.getByTestId("paper-letter").click();
  await page.addStyleTag({
    content: `
      .prep-booklet, .prep-cards { flex-direction: row; align-items: flex-start; justify-content: center; gap: 32px; padding-top: 24px; zoom: ${zoom}; }
      .prep-booklet > .bk-sheet, .prep-cards > .bk-sheet { height: var(--bk-page-h); overflow: hidden; flex: none; }
      :is(.prep-booklet, .prep-cards) > .bk-sheet:not(${show}) { display: none; }
    `,
  });
}

test("booklet", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 860 });
  await printSheets(page, "booklet", ".bk-titlepage, #bk-act-1", 0.64);
  await expect(page.getByRole("heading", { level: 2, name: "Setup", exact: true })).toBeVisible();
  await shot(page, "booklet");
});

test("agenda-cards", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await printSheets(page, "agendas", ":first-child", 0.76);
  await expect(page.getByRole("region", { name: "Act 1 agenda: Rosa Ilunga" })).toBeVisible();
  await shot(page, "agenda-cards");
});

test("share-players", async ({ page }) => {
  // Cold Harbor session 1 at the table: "Share with players" previews the phone cards (briefing, fogged map, the revealed relay log, the party)
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loadDemo(page, "cinematic");
  await startSession1(page);
  await page.getByTestId("share-players").click();
  const dialog = page.getByTestId("share-dialog");
  await dialog.getByTestId("share-include-party").check();
  await expect(dialog.getByTestId("share-preview-item")).toHaveCount(4);
  await expect(dialog.getByTestId("share-send")).toBeEnabled();
  await shot(page, "share-players");
});

test("primer", async ({ page }) => {
  // Cold Harbor's campaign primer: the module's prompts in grey, the demo's own text, places drafted from player-visible locations
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loadDemo(page, "cinematic");
  await page.getByTestId("open-primer").click();
  const primer = page.getByTestId("primer-page");
  await expect(primer.locator('[data-section="tone"]')).toContainText("X-card");
  await expect(primer.locator(".cf-editor--loading")).toHaveCount(0);
  await shot(page, "primer");
});

// ---------------------------------------------------------------------------
// Game modules and Thornwick Crossing (fifth edition, SRD 5.1)
// ---------------------------------------------------------------------------

/** The example fixture pack's files under another id (its own id is built into the app), as a GM would import them. */
function examplePackAs(id: string) {
  const dir = fileURLToPath(new URL("../../../packages/module-example/packs/example-pack/", import.meta.url));
  return ["pack.json", "rules.part.json"].map((name) => ({ name, mimeType: "application/json", buffer: Buffer.from(readFileSync(`${dir}${name}`, "utf8").split("example-pack").join(id)) }));
}

test("game-modules", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByTestId("open-modules").click();
  const modules = page.getByRole("dialog", { name: "Game modules" });
  await modules.getByTestId("pack-file-input").setInputFiles(examplePackAs("lantern"));
  await expect(modules.getByTestId("module-lantern")).toContainText("Imported");
  await expect(modules.getByTestId("module-alien")).toContainText("Built-in");
  await expect(modules.getByTestId("module-licence-dnd5e-srd")).toContainText("System Reference Document 5.1");
  await expect(modules.getByTestId("module-licence-lantern")).toContainText("Creative Commons Attribution 4.0");
  await dismissToasts(page);
  await shot(page, "game-modules");
});

test("supplements", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByTestId("open-modules").click();
  const modules = page.getByRole("dialog", { name: "Game modules" });
  const supplement = fileURLToPath(new URL("../../../packages/module-dnd5e-srd/supplements/thornwick-homebrew.supplement.json", import.meta.url));
  await modules.getByTestId("pack-file-input").setInputFiles({ name: "thornwick-homebrew.supplement.json", mimeType: "application/json", buffer: readFileSync(supplement) });
  const row = modules.getByTestId("module-dnd5e-srd").getByTestId("supplement-thornwick-homebrew");
  await expect(row).toContainText("Supplement");
  await expect(row).toContainText("adds 10 list items, 1 preset, 1 table, 1 rule card");
  await dismissToasts(page);
  await shot(page, "supplements");
});

/** Toasts repeat what the page shows and time out on their own: dismiss them so a shot does not depend on the timing. */
async function dismissToasts(page: Page) {
  // (programmatic: under a modal dialog the toasts are inert to the pointer)
  // click every Dismiss in one go: a locator list goes stale as each toast leaves
  await page.evaluate(() => document.querySelectorAll<HTMLButtonElement>(".cf-toasts button[aria-label='Dismiss']").forEach((b) => b.click()));
  await expect(page.locator(".cf-toast")).toHaveCount(0);
}

/** A Thornwick Crossing PC's sheet. */
async function openPc(page: Page, name: string) {
  const base = await loadDemo(page, "dnd5e");
  await page.goto(`${base}/atlas`);
  await page.getByRole("tab", { name: /^PCs/ }).click();
  await page.getByRole("tabpanel").getByRole("link", { name, exact: true }).click();
  await expect(page.getByTestId("entity-page")).toBeVisible();
}

test("dnd5e-sheet", async ({ page }) => {
  // tall enough for the saving throws under the ability scores and combat numbers
  await page.setViewportSize({ width: 1440, height: 1720 });
  await openPc(page, "Isolde Fairweather");
  // scores and proficiencies are stored; every number marked "computed" is derived at render time
  await expect(page.getByTestId("computed-proficiencyBonus")).toHaveText("2");
  await expect(page.getByTestId("computed-intelligenceMod")).toHaveText("3");
  await expect(page.getByTestId("computed-initiative")).toHaveText("2");
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "dnd5e-sheet");
});

test("dnd5e-roll", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openPc(page, "Wren Talliver");
  // Stealth with expertise, rolled with advantage against the goblins' DC
  const stealth = page.locator('tr[data-skill="stealth"]');
  await expect(stealth.getByTestId("pool-stealth")).toHaveText("1d20 + 7");
  await stealth.evaluate((e) => e.scrollIntoView({ block: "center" }));
  await stealth.getByRole("button", { name: "Roll" }).click();
  const panel = page.getByTestId("dice-panel");
  await panel.getByTestId("roll-option-dc").fill("13");
  await panel.getByTestId("roll-option-advantage").selectOption("advantage");
  await expect(panel.getByTestId("dicepool")).toContainText("1d20 + 7 (advantage) vs DC 13");
  await panel.getByRole("button", { name: "Roll" }).click();
  await expect(panel.getByTestId("roll-total")).toHaveText(/^\d+$/);
  await expect(panel.getByTestId("roll-outcome")).toHaveText(/Success|Failure/);
  await expect(panel.locator('[data-dropped="true"]')).toHaveCount(1);
  await dismissToasts(page);
  await shot(page, "dnd5e-roll");
});

test("dnd5e-table", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1300 });
  await loadDemo(page, "dnd5e");
  await startSession1(page);
  await expect(page.getByRole("heading", { name: "Ambush at the toll-house" })).toBeVisible();
  // everyone in the opening fight on the initiative tracker, rolled d20 + initiative, highest first
  const init = page.locator('[data-tracker="dnd5e-srd.tracker.initiative"]');
  const pick = init.getByRole("combobox", { name: "Add from entities" });
  for (const name of ["Brannoc Ashby", "Isolde Fairweather", "Tobin Greaves", "Wren Talliver", "Goblin 1", "Goblin 2", "Wolf 1"]) {
    await pick.selectOption({ label: name });
    await init.getByRole("button", { name: "Add", exact: true }).click();
  }
  await init.getByRole("button", { name: "Roll initiative" }).click();
  const scores = await init.locator("[data-testid^=card-]").evaluateAll((els) => els.map((e) => Number((e as HTMLInputElement).value)));
  expect(scores).toHaveLength(7);
  expect(scores).toEqual([...scores].sort((a, b) => b - a));
  // a round in: a goblin arrow found Brannoc, and Brannoc found a goblin
  const hp = page.locator('[data-tracker="dnd5e-srd.tracker.hp"]');
  for (let i = 0; i < 5; i++) await hp.getByRole("button", { name: "Decrease Brannoc Ashby HP" }).click();
  for (let i = 0; i < 4; i++) await hp.getByRole("button", { name: "Decrease Goblin 1 HP" }).click();
  await expect(hp.getByRole("spinbutton", { name: "Goblin 1 HP" })).toHaveValue("3");
  await shot(page, "dnd5e-table");
});

test("dnd5e-origins", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 760 });
  const base = await loadDemo(page, "dnd5e");
  await page.goto(`${base}/reference`);
  // the SRD 5.1 Acolyte, the SRD 5.2 backgrounds (badged 2024 and SRD 5.2) and the demo supplement's Ferrywright in one list
  await page.getByRole("combobox", { name: "Reference list" }).selectOption("dnd5e-srd.backgrounds");
  const rows = page.getByTestId("reference-items").locator("tbody tr");
  await expect(rows).toHaveCount(6);
  const sage = rows.filter({ has: page.getByRole("button", { name: "Sage", exact: true }) });
  await expect(sage.getByTestId("edition-badge")).toHaveText("2024");
  await expect(sage).toContainText("Magic Initiate (Wizard)");
  await expect(rows.filter({ hasText: "Ferrywright" }).getByTestId("source-badge")).toHaveText("Thornwick Homebrew");
  await shot(page, "dnd5e-origins");
});

test("dnd5e-hints", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loadDemo(page, "dnd5e");
  await startSession1(page);
  await page.getByRole("tab", { name: "Hints" }).click();
  const entry = page.locator('[data-entry="stealth"]');
  await entry.getByRole("button", { name: /^Stealth/ }).first().click();
  // ranked by d20 bonus: Wren's expertise first, the heavy-armoured fighter last
  const rollers = entry.getByRole("list", { name: "Who's best at Stealth" });
  await expect(rollers.locator("[data-standing=best]").first()).toContainText("Wren Talliver");
  await expect(rollers.locator("[data-standing=worst]")).not.toHaveCount(0);
  await entry.evaluate((e) => e.scrollIntoView({ block: "start" }));
  await shot(page, "dnd5e-hints");
});

/** Type faces into the enter-dice dialog the page's "Enter dice" mode opens, and roll. */
async function enterDice(page: Page, faces: number[]) {
  const form = page.getByRole("dialog").getByTestId("enter-dice");
  await expect(form.locator("[data-testid^=enter-die-]")).toHaveCount(faces.length);
  for (const [i, f] of faces.entries()) await form.getByTestId(`enter-die-${i}`).fill(String(f));
  await form.getByTestId("enter-dice-submit").click();
  await expect(form).toBeHidden();
}

/** The combat panel's card for a combatant. */
const combatant = (page: Page, name: string) => page.getByTestId("d20-combat").locator("[data-combatant]").filter({ has: page.getByRole("button", { name: `Open ${name}`, exact: true }) });

/** Frame the combat panel (the left column), from its top to the bottom of `last`. */
async function combatClip(page: Page, last: Locator) {
  const panel = page.getByTestId("d20-combat");
  await panel.evaluate((e) => e.scrollIntoView({ block: "start" }));
  await settle(page);
  const a = (await panel.boundingBox())!;
  const b = (await last.boundingBox())!;
  const pad = 8;
  return { x: Math.floor(a.x - pad), y: Math.floor(a.y - pad), width: Math.ceil(a.width + 2 * pad), height: Math.ceil(b.y + b.height + pad - a.y + pad) };
}

test("dnd5e-combat", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 2600 });
  await loadDemo(page, "dnd5e");
  await startSession1(page);
  const combat = page.getByTestId("d20-combat");
  // the dice are rolled at the table and typed in: initiative puts the wolf first and Wren second
  await page.getByTestId("dice-mode-enter").first().click();
  await combat.getByTestId("roll-initiative-all").click();
  await enterDice(page, [6, 4, 3, 15, 2, 5, 18]);
  await expect(combat.getByTestId("current-turn")).toHaveText("Wolf 1's turn");
  // the wolf bites Wren: 13 + 4 = 17 against AC 14 hits, 2d4 + 2 piercing, then a DC 11 Strength save or prone
  await combatant(page, "Wolf 1").getByRole("button", { name: "Attack with Wolf 1" }).click();
  const attack = page.getByTestId("attack-dialog");
  await attack.getByRole("combobox", { name: "Target" }).selectOption({ label: "Wren Talliver" });
  await attack.getByTestId("roll-attack").click();
  await enterDice(page, [13]);
  await expect(attack.getByTestId("attack-outcome")).toHaveText("Hit");
  await attack.getByTestId("roll-damage").click();
  await enterDice(page, [6]);
  await attack.getByTestId("apply-damage").click();
  await expect(attack.getByTestId("damage-applied")).toContainText("Wren Talliver takes 6 damage: HP 15/21");
  await attack.getByRole("button", { name: "Roll Strength save for Wren Talliver" }).click();
  await enterDice(page, [6]);
  await expect(attack.getByTestId("save-outcome")).toHaveText("failure");
  await attack.getByTestId("save-effect").getByRole("button", { name: "Apply", exact: true }).click();
  // Wren is prone: the chip's helper text says what that does and what the app applies by itself
  const wren = combatant(page, "Wren Talliver");
  await wren.locator('[data-condition="prone"]').click();
  await expect(wren.getByTestId("condition-helper")).toContainText("Can only crawl until it stands up");
  await expect(wren.getByTestId("condition-automated")).toContainText("advantage on attack rolls against it (attacker within 5 feet)");
  await shot(page, "dnd5e-combat", { clip: await combatClip(page, wren) });
});

// ---------------------------------------------------------------------------
// Hollowmere (second edition remaster, ORC core rules)
// ---------------------------------------------------------------------------

/** A Hollowmere PC's sheet. */
async function openPf2ePc(page: Page, name: string) {
  const base = await loadDemo(page, "pf2e");
  await page.goto(`${base}/atlas`);
  await page.getByRole("tab", { name: /^PCs/ }).click();
  await page.getByRole("tabpanel").getByRole("link", { name, exact: true }).click();
  await expect(page.getByTestId("entity-page")).toBeVisible();
}

test("pf2e-sheet", async ({ page }) => {
  // tall enough for Perception, saves and skills under the defense numbers
  await page.setViewportSize({ width: 1440, height: 1900 });
  await openPf2ePc(page, "Brunhild Ashdelver");
  // attribute modifiers and proficiency ranks are stored; every number marked "computed" is derived at render time
  await expect(page.getByTestId("computed-ac")).toHaveText("17");
  await expect(page.getByTestId("computed-hpMax")).toHaveText("20");
  await expect(page.getByTestId("computed-classDc")).toHaveText("17");
  await expect(page.getByTestId("pool-will")).toHaveText("1d20 + 9");
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "pf2e-sheet");
});

test("pf2e-roll", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openPf2ePc(page, "Pip Tallowgrass");
  // Stealth (trained: level + 2) with fortune against DC 14: beat it by 10 for a critical success
  const stealth = page.locator('tr[data-skill="stealth"]');
  await expect(stealth.getByTestId("pool-stealth")).toHaveText("1d20 + 7");
  await stealth.evaluate((e) => e.scrollIntoView({ block: "center" }));
  await stealth.getByRole("button", { name: "Roll" }).click();
  const panel = page.getByTestId("dice-panel");
  await panel.getByTestId("roll-option-dc").fill("14");
  await panel.getByTestId("roll-option-advantage").selectOption("fortune");
  await expect(panel.getByTestId("dicepool")).toContainText("1d20 + 7 (fortune) vs DC 14");
  // the page's dice are seeded: roll until the shot shows a critical success (the same roll every run)
  await panel.getByRole("button", { name: "Roll" }).click();
  for (let i = 0; i < 30 && (await panel.getByTestId("roll-outcome").getAttribute("data-outcome")) !== "critical-success"; i++) await panel.getByRole("button", { name: "Roll again" }).click();
  await expect(panel.getByTestId("roll-outcome")).toHaveAttribute("data-outcome", "critical-success");
  await expect(panel.getByTestId("roll-outcome")).toHaveText(/^Critical success/);
  await expect(panel.locator('[data-dropped="true"]')).toHaveCount(1);
  await dismissToasts(page);
  await shot(page, "pf2e-roll");
});

test("pf2e-encounter", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1250 });
  const base = await loadDemo(page, "pf2e");
  // the encounter builder: a severe fight for four level 3 characters, spending GM Core's XP budget on Monster Core creatures
  await page.goto(`${base}/generate`);
  await page.getByTestId("procedure-pf2e-orc.proc.encounter").click();
  await page.getByRole("spinbutton", { name: "Party level" }).fill("3");
  await page.getByRole("combobox", { name: "Threat" }).selectOption("severe");
  await expect(page.getByTestId("step-budget")).toContainText("120");
  await expect(page.getByTestId("step-shape")).toContainText("pf2e-orc.encounter.budget-120");
  await expect(page.getByTestId("step-g1")).toContainText("pf2e-orc.creature.level-");
  await expect(page.getByTestId("step-result-budget")).toHaveText("120 XP");
  await expect(page.getByTestId("step-result-shape")).toHaveText(/^\d+ × party level/);
  await expect(page.getByTestId("step-result-g1list")).toHaveText(/^\d+ × .+$/);
  await dismissToasts(page);
  await shot(page, "pf2e-encounter");
});

test("orc-combat", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 2600 });
  await loadDemo(page, "pf2e");
  await startSession1(page);
  const combat = page.getByTestId("d20-combat");
  await page.getByTestId("dice-mode-enter").first().click();
  await combat.getByTestId("roll-initiative-all").click();
  const faces = await page.getByRole("dialog").getByTestId("enter-dice").locator("[data-testid^=enter-die-]").count();
  // Garrick acts first
  await enterDice(page, Array.from({ length: faces }, (_, i) => (i === 1 ? 19 : 2 + (i % 5))));
  const garrick = combatant(page, "Garrick Thornley");
  await expect(combat.getByTestId("current-turn")).toHaveText("Garrick Thornley's turn");
  // a kobold's taunt left Garrick frightened 2: −2 status to his checks, DCs and AC
  await garrick.getByRole("button", { name: "Add a condition to Garrick Thornley" }).click();
  const picker = page.getByTestId("condition-picker");
  await picker.getByRole("searchbox", { name: "Search conditions" }).fill("fright");
  await picker.getByRole("button", { name: /^Frightened/ }).click();
  await picker.getByRole("button", { name: "Increase Frightened value" }).click();
  await picker.getByRole("button", { name: "Add Frightened" }).click();
  // his longsword Strike: 19 + 9 − 2 = 26 against AC 16 is a critical hit (four degrees), damage doubled
  await garrick.getByRole("button", { name: "Attack with Garrick Thornley" }).click();
  const attack = page.getByTestId("attack-dialog");
  await attack.getByRole("combobox", { name: "Target" }).selectOption({ label: "Kobold Warrior 1" });
  await expect(attack.getByTestId("attack-pool")).toContainText("Frightened 2 (status) −2");
  await attack.getByTestId("roll-attack").click();
  await enterDice(page, [19]);
  await expect(attack.getByTestId("attack-outcome")).toHaveText("Critical hit");
  await attack.getByTestId("roll-damage").click();
  await enterDice(page, [5]);
  await attack.getByTestId("apply-damage").click();
  await expect(attack.getByTestId("damage-applied")).toContainText("defeated");
  await garrick.locator('[data-condition="frightened"]').click();
  await expect(garrick.getByTestId("condition-helper")).toContainText("status penalty equal to the value");
  await shot(page, "orc-combat", { clip: await combatClip(page, garrick) });
});

test("pf2e-supplement", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1150 });
  // the built-in supplement "Remaster ORC books", switched on for this device under Game modules
  await page.goto("/");
  await page.getByTestId("open-modules").click();
  const modules = page.getByRole("dialog", { name: "Game modules" });
  const toggle = modules.getByTestId("module-pf2e-orc").getByTestId("toggle-supplement-pf2e-orc-books");
  await toggle.check();
  await expect(toggle).toBeChecked();
  await modules.getByRole("button", { name: "Close" }).click();
  // Hollowmere's reference browser: the supplement's ancestries next to the core books', each with its source badge
  const base = await loadDemo(page, "pf2e");
  await page.goto(`${base}/reference`);
  await page.getByRole("combobox", { name: "Reference list" }).selectOption("pf2e-orc.ancestries");
  const centaur = page.getByTestId("reference-items").getByRole("row").filter({ hasText: "Centaur" });
  await expect(centaur.getByTestId("source-badge")).toHaveText("Remaster ORC books");
  await expect(page.getByTestId("reference-items").getByTestId("source-badge")).toHaveCount(8);
  // the end of the list: the last core ancestries, then the supplement's eight
  await page.getByTestId("reference-items").getByRole("row").last().evaluate((e) => e.scrollIntoView({ block: "end" }));
  await dismissToasts(page);
  await shot(page, "pf2e-supplement");
});

// ---------------------------------------------------------------------------
// helpers for SVG shots
// ---------------------------------------------------------------------------

async function readDownload(d: import("@playwright/test").Download): Promise<string> {
  const stream = await d.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

/** Draw an SVG `width` px wide (height from its viewBox) on a blank page and screenshot it. */
async function rasterSvg(browser: import("@playwright/test").Browser, svg: string, name: string, o: { width: number; background: string }) {
  const context = await browser.newContext({ viewport: { width: o.width, height: 900 }, deviceScaleFactor: 1 });
  try {
    const page = await context.newPage();
    await page.setContent(`<!doctype html><html><body style="margin:0;background:${o.background}">${svg.replace(/^<\?xml[^>]*>\s*/, "")}</body></html>`);
    const root: Locator = page.locator("body > svg");
    await root.evaluate((s, width) => {
      const svgEl = s as SVGSVGElement;
      const vb = svgEl.viewBox.baseVal;
      svgEl.setAttribute("width", String(width));
      svgEl.setAttribute("height", String(Math.round((width * vb.height) / vb.width)));
      svgEl.style.display = "block";
    }, o.width);
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await root.screenshot({ path: file(name), animations: "disabled", timeout: 120_000 });
  } finally {
    await context.close();
  }
}
