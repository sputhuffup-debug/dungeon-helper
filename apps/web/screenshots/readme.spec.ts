/**
 * The README screenshots, regenerated from the four deterministic demo
 * campaigns (Skyfire Down, Cold Harbor Relay, Thornwick Crossing, Hollowmere),
 * and the guides' step shots, taken by doing the steps on a blank campaign
 * (`guide-alien` and `guide-dnd5e-srd`; then `in-app-guide`, once the app is rebuilt with them): `pnpm screenshots` at the repo root builds the app and runs
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

/** Start the demo's planned session (session 2 in Skyfire Down, whose session 1 was played; session 1 in the others). */
async function startPlannedSession(page: Page) {
  await nav(page, "Sessions").click();
  await page.getByRole("button", { name: /^Start session \d+$/ }).click();
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
  // the two Alien demos' campaigns (the section's Guide button is a link too)
  await expect(page.locator('[data-module="alien"]').getByRole("list").getByRole("link")).toHaveCount(2);
  await shot(page, "campaign-list");
});

test("home", async ({ page }) => {
  await loadDemo(page, "skyfire");
  await expect(page.getByRole("heading", { name: "Next session" })).toBeVisible();
  await shot(page, "home");
});

/** A blank Alien campaign made in the New campaign dialog, with the Colonial Marines frame. */
async function newAlienCampaign(page: Page, name: string): Promise<string> {
  await page.goto("/");
  await page.getByRole("button", { name: "New campaign" }).click();
  const dialog = page.getByRole("dialog", { name: "New campaign" });
  await dialog.getByLabel("Name", { exact: true }).fill(name);
  await dialog.getByRole("group", { name: "Campaign frame" }).getByRole("radio", { name: /^Colonial Marines/ }).check();
  await dialog.getByRole("button", { name: "Create campaign" }).click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/);
  return page.url().replace(/\/home$/, "");
}

test("new-campaign-framework", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "New campaign" }).click();
  const dialog = page.getByRole("dialog", { name: "New campaign" });
  await dialog.getByLabel("Name", { exact: true }).fill("Outer Rim Haulers");
  const frame = dialog.getByRole("group", { name: "Campaign frame" });
  await frame.getByRole("radio", { name: /^Colonial Marines/ }).check();
  await expect(frame.getByRole("radio", { name: /^Colonial Marines/ })).toBeChecked();
  await shot(page, "new-campaign-framework");
});

test("setup-guide", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const base = await newAlienCampaign(page, "Outer Rim Haulers");
  // four PCs by hand and the four players who play them; the ship comes next.
  // In-app navigation only: a reload would restart the seeded randomness and repeat record ids.
  const guide = page.getByTestId("setup-guide");
  const crew = ["Ada Rook", "Bo Lantern", "Cy Varga", "Di Moss"];
  for (const pc of crew) {
    await guide.locator('[data-step="alien.setup.crew"]').getByRole("link", { name: "+ Character" }).click();
    await page.getByTestId("entity-name").fill(pc);
    await page.getByTestId("create-entity").click();
    await expect(page).toHaveURL(/\/entities\/[0-9A-Z]{26}/);
    await nav(page, "Home").click();
  }
  await guide.locator('[data-step="setup.players"]').getByRole("link", { name: "Add players" }).click();
  await expect(page).toHaveURL(new RegExp(`^${base.replace(/[/.]/g, "\\$&")}/settings`));
  const players = page.getByTestId("players-card");
  for (const [i, name] of ["Sam", "Priya", "Mateo", "Jun"].entries()) {
    await players.getByTestId("player-new-name").fill(name);
    await players.getByTestId("player-add").click();
    await players.getByRole("checkbox", { name: `${name} plays ${crew[i]}` }).check();
  }
  await nav(page, "Home").click();
  await expect(page.getByTestId("setup-progress")).toHaveText("2 of 8 done");
  await expect(page.getByTestId("setup-guide").locator('[data-step="alien.setup.ship"]')).toHaveAttribute("aria-current", "step");
  await dismissToasts(page);
  await shot(page, "setup-guide");
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

/** Skyfire Down's crew as the demo builds it: two buddies, a PC with no buddy, and the PC Sam plays. */
function skyfireCrew(): { buddy: string; buddysBuddy: string; loner: string; sams: string } {
  const demo = buildDemoCampaign();
  const pcs = Object.values(demo.maps.entities).filter((e) => e.type === "alien.character" && e.fields["isPC"] === true);
  const byId = new Map(pcs.map((p) => [p.id, p]));
  const buddy = pcs.find((p) => byId.has(String(p.fields["buddy"] ?? "")));
  const loner = pcs.find((p) => !p.fields["buddy"]);
  const sam = demo.store.meta().members.find((m) => m.name === "Sam");
  const sams = pcs.find((p) => p.ownerMemberId === sam?.id || sam?.characterId === p.id);
  const out = buddy && loner && sams ? { buddy: buddy.name, buddysBuddy: byId.get(String(buddy.fields["buddy"]))!.name, loner: loner.name, sams: sams.name } : undefined;
  demo.registry.closeAll();
  demo.store.destroy();
  if (!out) throw new Error("the Skyfire Down demo has no buddies, no PC without a buddy, or no PC for Sam");
  return out;
}

test("crew-pairs", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { buddy: first, buddysBuddy: second, loner: third } = skyfireCrew();
  const base = await loadDemo(page, "skyfire");
  await page.goto(`${base}/atlas?tab=pcs`);
  await page.getByRole("tabpanel").getByRole("link", { name: third, exact: true }).click();
  const ties = page.locator('[data-section="crew-ties"]');
  await expect(ties).toContainText("Buddy and rival");
  // the third PC picks the first as buddy: the first already has a buddy, so the app asks before repointing
  await ties.getByRole("combobox", { name: "Buddy" }).selectOption({ label: first });
  const offer = page.locator(".cf-toast").filter({ hasText: `${first}'s buddy is still ${second}.` });
  await expect(offer.getByRole("button", { name: `Make it ${third}` })).toBeVisible();
  await ties.evaluate((e) => e.scrollIntoView({ block: "center" }));
  await shot(page, "crew-pairs");
});

test("players-moved", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { sams: first } = skyfireCrew();
  const base = await loadDemo(page, "skyfire");
  await page.goto(`${base}/settings?section=players`);
  const players = page.getByTestId("players-card");
  // the first PC is Sam's; ticking it for Priya moves it, and the toast says so with an Undo
  await players.getByRole("checkbox", { name: `Priya plays ${first}` }).check();
  await expect(page.locator(".cf-toast").filter({ hasText: `${first} moved from Sam to Priya.` }).getByRole("button", { name: "Undo" })).toBeVisible();
  await players.evaluate((e) => e.scrollIntoView({ block: "start" }));
  await shot(page, "players-moved");
});

test("atlas-summaries", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const base = await loadDemo(page, "skyfire");
  await page.goto(`${base}/atlas?tab=npcs`);
  // the GM's own summary first, then the stat line with Health left
  await expect(page.locator(".app-entity-table__summary").first()).toBeVisible();
  await expect(page.getByRole("tabpanel").locator(".app-entity-table__stats").first()).toContainText("Health left");
  await shot(page, "atlas-summaries");
});

test("reference-careers", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const base = await loadDemo(page, "skyfire");
  await page.goto(`${base}/reference?tab=lists&list=alien.careers`);
  const items = page.getByTestId("reference-items");
  // key skills and talents by name, the key attribute by its label: no ids
  await expect(items.getByRole("row", { name: /Colonial Marine/ })).toContainText("Close Combat, Stamina, Ranged Combat");
  await expect(items).not.toContainText("closeCombat");
  await shot(page, "reference-careers");
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

test("lifepath-preview", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const base = await loadDemo(page, "skyfire");
  await page.goto(`${base}/atlas`);
  await page.getByRole("tab", { name: /^PCs/ }).click();
  // Roll a Life Path beside + New; the preview reads the career, talents, gear and weapons by name
  await page.getByRole("button", { name: "Roll a Life Path" }).first().click();
  await expect(page).toHaveURL(/\/generate\/alien\.lifepath$/);
  await page.getByTestId("seed").fill("crew-2");
  const preview = page.getByTestId("preview");
  await expect(preview.locator('[data-field="weapons"] dd')).toHaveText("M4A3 Service Pistol");
  await page.getByTestId("preview-name-pc").fill("Rook Calder");
  await shot(page, "lifepath-preview");
});

test("gear-picker", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const base = await loadDemo(page, "skyfire");
  await page.goto(`${base}/atlas`);
  await page.getByRole("tab", { name: /^PCs/ }).click();
  await page.getByRole("tabpanel").getByRole("link", { name: "Oliver Bryant" }).click();
  const gear = page.locator('[data-section="gear"]');
  await gear.evaluate((e) => e.scrollIntoView({ block: "start" }));
  await gear.getByTestId("gear-from-list").click();
  const picker = page.getByTestId("gear-picker");
  // a tracker goes to Gear, a knife to Weapons; the list stays open and says where each went
  await picker.getByRole("button", { name: "Add Combat Knife" }).click();
  await picker.getByRole("button", { name: "Add M314 Motion Tracker" }).click();
  await expect(picker.getByTestId("gear-picker-status")).toHaveText("Added M314 Motion Tracker to Gear.");
  await picker.locator('[data-group="gear:vision-devices"]').evaluate((e) => e.scrollIntoView({ block: "start" }));
  await shot(page, "gear-picker");
});

test("generator", async ({ page }) => {
  const base = await loadDemo(page, "skyfire");
  await page.goto(`${base}/generate`);
  await page.getByRole("region", { name: "Recent runs" }).getByRole("listitem").filter({ hasText: "Star System Generator" }).first().getByRole("link", { name: "Re-open" }).click();
  await expect(page.getByRole("heading", { name: /Star System Generator/ })).toBeVisible();
  await expect(page.getByTestId("workbench")).toBeVisible();
  await shot(page, "generator");
});

test("table-mode", async ({ page }) => {
  await loadDemo(page, "skyfire");
  await startPlannedSession(page);
  await shot(page, "table-mode");
});

test("table-hints", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loadDemo(page, "skyfire");
  await startPlannedSession(page);
  await page.getByRole("tab", { name: "Hints" }).click();
  const entry = page.locator('[data-entry="observation"]');
  await entry.getByRole("button", { name: /^Observation/ }).first().click();
  await entry.evaluate((e) => e.scrollIntoView({ block: "start" }));
  await shot(page, "table-hints");
});

test("table-phone", async ({ page }) => {
  // table mode on a phone: the Map tab of the bottom tab bar, the job's site framed on what the crew has seen
  await page.setViewportSize({ width: 390, height: 844 });
  await loadDemo(page, "skyfire");
  await page.goto(page.url().replace(/\/home$/, "/sessions"));
  await page.getByRole("button", { name: /^Start session \d+$/ }).click();
  await expect(page.getByTestId("table-mode")).toHaveAttribute("data-layout", "panels");
  await expect(page.getByTestId("timer")).toHaveText("00:00");
  const scenes = page.getByTestId("table-panel-scene").getByRole("combobox", { name: "Scene" });
  await scenes.selectOption((await scenes.locator("option", { hasText: "The ore run" }).getAttribute("value"))!);
  await page.getByTestId("table-tab-map").click();
  const live = page.getByTestId("table-panel-map").getByTestId("live-map");
  await expect(live.getByTestId("hunt-token")).toHaveCount(2);
  await settle(page);
  await live.getByTestId("map-focus").click();
  await shot(page, "table-phone");
});

test("table-this-job", async ({ page }) => {
  // "This job" at the table: the job's clues with Mark found and Reveal, and its people's agendas and secrets (GM only)
  await page.setViewportSize({ width: 1440, height: 1400 });
  await loadDemo(page, "skyfire");
  await startPlannedSession(page);
  const scenes = page.getByRole("combobox", { name: "Scene" });
  await scenes.selectOption((await scenes.locator("option", { hasText: "The ore run" }).getAttribute("value"))!);
  const job = page.getByTestId("this-job");
  await expect(job.getByTestId("this-job-clue")).toHaveCount(2);
  await job.evaluate((e) => e.scrollIntoView({ block: "start" }));
  await settle(page);
  const a = (await job.boundingBox())!;
  const pad = 8;
  const clip = { x: Math.floor(a.x - pad), y: Math.floor(a.y - pad), width: Math.ceil(a.width + pad * 2), height: Math.ceil(Math.min(a.height + pad * 2, 1400 - a.y)) };
  await shot(page, "table-this-job", { clip });
});

test("enter-dice", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1300 });
  await loadDemo(page, "skyfire");
  await startPlannedSession(page);
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

test("skill-roll-modifier", async ({ page }) => {
  // a skill roll with the gear that helps it and a modifier: Lee-Ann's MEDICAL AID with her personal medkit (+2, p. 97) and +1 die, still on her
  await page.setViewportSize({ width: 1440, height: 1100 });
  await loadDemo(page, "skyfire");
  await startPlannedSession(page);
  await page.getByRole("tab", { name: "Dice" }).click();
  const skill = page.locator(".app-table__skillroll");
  await skill.getByRole("combobox", { name: "Character" }).selectOption({ label: "Lee-Ann Jenkins" });
  await skill.getByRole("combobox", { name: "Skill" }).selectOption({ label: "Medical Aid (Empathy)" });
  await skill.getByRole("combobox", { name: "Gear bonus" }).selectOption({ label: "Personal medkit (+2)" });
  const panel = skill.getByTestId("dice-panel");
  await panel.getByTestId("roll-option-modifier").getByRole("button", { name: "Increase Modifier (dice)" }).click();
  await panel.getByRole("button", { name: "Roll", exact: true }).click();
  await expect(panel.getByTestId("describe")).toBeVisible();
  // the roll log names the gear and the modifier
  await expect(page.getByRole("list", { name: "Roll log" }).locator("li").first()).toContainText("Lee-Ann Jenkins: Medical Aid (Personal medkit +2, Modifier +1)");
  await settle(page);
  const b = (await skill.boundingBox())!;
  const pad = 8;
  await shot(page, "skill-roll-modifier", { clip: { x: Math.floor(b.x - pad), y: Math.floor(b.y - pad), width: Math.ceil(b.width + 2 * pad), height: Math.ceil(b.height + 2 * pad) } });
});

/** Skyfire Down's session 2 at "The ore run": the ore manifest revealed, the job's posting pinned to the player screen. */
async function putOnPlayerScreen(page: Page) {
  await loadDemo(page, "skyfire");
  await startPlannedSession(page);
  const scenes = page.getByRole("combobox", { name: "Scene" });
  await scenes.selectOption((await scenes.locator("option", { hasText: "The ore run" }).getAttribute("value"))!);
  const reveal = page.getByTestId("reveal-panel");
  await reveal.getByRole("button", { name: "Reveal Ore manifest" }).click();
  const off = reveal.getByTestId("off-screen");
  await off.locator("summary").click();
  await off.getByRole("button", { name: "Pin Posting: Ore to the spaceport to the player screen" }).click();
  await expect(reveal.getByTestId("on-screen").locator("[data-onscreen]")).toHaveCount(2);
  return reveal;
}

test("player-screen-control", async ({ page }) => {
  // the GM decides what the player screen shows: this session's reveal (the ore manifest) and a pinned posting; the frictions stay off it
  await page.setViewportSize({ width: 1440, height: 1500 });
  const reveal = await putOnPlayerScreen(page);
  await reveal.evaluate((e) => e.scrollIntoView({ block: "start" }));
  await settle(page);
  const b = (await reveal.boundingBox())!;
  const pad = 8;
  await shot(page, "player-screen-control", { clip: { x: Math.floor(b.x - pad), y: Math.floor(b.y - pad), width: Math.ceil(b.width + 2 * pad), height: Math.ceil(Math.min(b.height + 2 * pad, 1500 - b.y)) } });
});

test("player-screen-handouts", async ({ page, context }) => {
  // the player screen follows: the manifest and the pinned posting only, no frictions, no rulebook page refs
  await putOnPlayerScreen(page);
  const popup = context.waitForEvent("page");
  await page.getByRole("button", { name: "Player screen", exact: true }).click();
  const players = await popup;
  await players.setViewportSize({ width: 1440, height: 1600 });
  const handouts = players.getByRole("region", { name: "Handouts" });
  await expect(handouts.locator("[data-handout]")).toHaveCount(2);
  await expect(handouts).not.toContainText("friction");
  await expect(players.locator(".cf-page")).toHaveCount(0);
  await settle(players);
  // from the heading to the last handout (the column runs on to the grid row's height)
  const h = (await handouts.boundingBox())!;
  const last = (await handouts.locator("[data-handout]").last().boundingBox())!;
  const pad = 8;
  await shot(players, "player-screen-handouts", { clip: { x: Math.floor(h.x - pad), y: Math.floor(h.y - pad), width: Math.ceil(h.width + 2 * pad), height: Math.ceil(last.y + last.height - h.y + 2 * pad) } });
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

/** The Skyfire Down PC whose long-term goal stalled on the last job (its tension stepped up). */
function skyfireStalled(): string {
  const demo = buildDemoCampaign();
  const pc = Object.values(demo.maps.entities).find((e) => (e.fields["campaignAgenda"] as { status?: string } | undefined)?.status === "stalled");
  demo.registry.closeAll();
  demo.store.destroy();
  if (!pc) throw new Error("the Skyfire Down demo has no stalled agenda");
  return pc.name;
}

test("alien-campaign-agendas", async ({ page }) => {
  // a PC's agenda tab: the long-term goal, this job's beat, the tension after a stall, and the open friction
  await page.setViewportSize({ width: 1440, height: 1000 });
  const base = await loadDemo(page, "skyfire");
  await page.goto(`${base}/atlas`);
  await page.getByRole("tab", { name: /^PCs/ }).click();
  await page.getByRole("tabpanel").getByRole("link", { name: skyfireStalled(), exact: true }).click();
  await page.getByRole("tab", { name: "Agenda" }).click();
  const tab = page.getByTestId("long-agenda-tab");
  await expect(tab.getByRole("list", { name: "Tension" }).locator('[aria-current="step"]')).toHaveText("Quiet disagreement");
  await expect(tab.getByTestId("long-agenda-tab-friction").locator("li")).toHaveCount(2);
  await shot(page, "alien-campaign-agendas");
});

/** The Skyfire Down job taken from the job board (difficulty 3, one betrayer). */
function skyfireBoardJob(): string {
  const demo = buildDemoCampaign();
  const job = Object.values(demo.maps.entities).find((e) => e.type === "alien.job" && e.tags.includes("job-board"));
  demo.registry.closeAll();
  demo.store.destroy();
  if (!job) throw new Error("the Skyfire Down demo has no job from the job board");
  return job.name;
}

/** Session 1 in table mode on "The ore run": the job's site map with the live hunt. */
async function openHunt(page: Page) {
  await loadDemo(page, "skyfire");
  await startPlannedSession(page);
  const scenes = page.getByRole("combobox", { name: "Scene" });
  await scenes.selectOption((await scenes.locator("option", { hasText: "The ore run" }).getAttribute("value"))!);
  const live = page.getByTestId("live-map");
  await expect(live.getByTestId("hunt-token")).toHaveCount(2);
  return live;
}

test("alien-motion-tracker", async ({ page, context }) => {
  // the player screen mid-hunt: the crew on Deck B, the revealed way in, and Lee-Ann's sweep as blips A and B
  await openHunt(page);
  const popup = context.waitForEvent("page");
  await page.getByRole("button", { name: "Player screen" }).click();
  const players = await popup;
  // tall enough for the map and the tracker readout under it without scrolling
  await players.setViewportSize({ width: 1440, height: 2000 });
  const playerMap = players.getByTestId("player-map");
  await expect(playerMap.getByTestId("tracker-blip")).toHaveCount(2);
  await playerMap.getByRole("group", { name: "Decks" }).getByRole("button", { name: "Deck B" }).click();
  await refit(playerMap);
  // frame the scene column: the title, the map and the readout
  const scene = (await players.getByRole("region", { name: "Scene" }).boundingBox())!;
  const readout = (await playerMap.getByTestId("tracker-readout").boundingBox())!;
  const pad = 12;
  await shot(players, "alien-motion-tracker", { clip: { x: Math.floor(scene.x - pad), y: Math.floor(scene.y - pad), width: Math.ceil(scene.width + pad * 2), height: Math.ceil(readout.y + readout.height - scene.y + pad * 2) } });
});

test("alien-motion-tracker-gm", async ({ page }) => {
  // the GM's live map on the duct sheet over Deck B: the stalker hidden with its trail and suggested move, and the hunt panel
  await page.setViewportSize({ width: 2000, height: 2400 });
  const live = await openHunt(page);
  const sitemap = live.getByTestId("sitemap");
  await sitemap.getByRole("group", { name: "Decks" }).getByRole("button", { name: /^Ducts over Deck B/ }).click();
  await refit(live);
  // zoom in on the stalker: drag the map from an empty corner so the stalker sits mid-view
  for (let i = 0; i < 3; i++) await sitemap.getByRole("button", { name: "Zoom in" }).click();
  const view = (await sitemap.locator(".cf-map__viewport").boundingBox())!;
  const stalker = (await sitemap.locator("[data-hunt-token]").first().boundingBox())!;
  const from = { x: view.x + 12, y: view.y + 12 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + (view.x + view.width / 2 - (stalker.x + stalker.width / 2)), from.y + (view.y + view.height * 0.55 - (stalker.y + stalker.height / 2)), { steps: 8 });
  await page.mouse.up();
  const panel = live.getByTestId("hunt-panel");
  await live.evaluate((e) => e.scrollIntoView({ block: "start" }));
  await settle(page);
  const a = (await live.boundingBox())!;
  const b = (await panel.boundingBox())!;
  const pad = 8;
  await shot(page, "alien-motion-tracker-gm", { clip: { x: Math.floor(a.x - pad), y: Math.floor(a.y - pad), width: Math.ceil(a.width + pad * 2), height: Math.ceil(b.y + b.height - a.y + pad * 2) } });
});

test("alien-job-board", async ({ page }) => {
  // the job taken from the board: its posting, the GM's side (plays one difficulty lower: one betrayer), its NPCs and the site brief with its map
  await page.setViewportSize({ width: 1440, height: 1500 });
  const base = await loadDemo(page, "skyfire");
  await page.goto(`${base}/atlas`);
  await page.getByRole("tab", { name: /^Jobs/ }).click();
  await page.getByRole("tabpanel").getByRole("link", { name: skyfireBoardJob(), exact: true }).click();
  const panel = page.getByTestId("job-panel");
  await expect(panel.getByTestId("job-npc")).toHaveCount(3);
  await expect(panel.getByTestId("job-brief-summary")).toContainText("Difficulty 3 (plays as 2: one betrayer)");
  await expect(panel.getByTestId("job-site-maps").locator("li")).toHaveCount(1);
  // the posting, the GM's side and the panel: the page scrolled so the panel ends at the bottom
  await panel.evaluate((e) => window.scrollTo(0, e.getBoundingClientRect().bottom + window.scrollY - window.innerHeight + 24));
  await shot(page, "alien-job-board");
});

test("alien-arc-board", async ({ page }) => {
  // the arc board: faction heat and thread clocks on top, two threads as columns, stages as rows, a found and a seeded clue
  await page.setViewportSize({ width: 1440, height: 1400 });
  const base = await loadDemo(page, "skyfire");
  await page.goto(`${base}/arcs`);
  await expect(page.getByTestId("arc-thread")).toHaveCount(2);
  await expect(page.locator("[data-testid=arc-clue][data-state=found]")).toHaveCount(1);
  await expect(page.locator("[data-testid=arc-clue][data-state=seeded]")).toHaveCount(1);
  await shot(page, "alien-arc-board");
});

test("previously-on", async ({ page }) => {
  // Skyfire Down's session 2: the "Previously on…" card with the GM's recap of session 1 (the job, the clue under the GM title,
  // Mara Quill as a contact, the funds, the hunt, loose ends and what the players don't know), one loose end switched off
  await page.setViewportSize({ width: 1440, height: 2400 });
  await loadDemo(page, "skyfire");
  await nav(page, "Sessions").click();
  await page.locator('[data-session][data-status="planned"]').getByRole("link").click();
  const card = page.getByTestId("recap-card");
  const gm = card.getByTestId("recap-gm");
  await expect(gm.getByRole("region", { name: "What the players don't know" })).toBeVisible();
  await gm.getByRole("region", { name: "Loose ends" }).getByRole("checkbox").last().uncheck();
  await settle(page);
  const box = (await card.boundingBox())!;
  const pad = 16;
  await shot(page, "previously-on", { clip: { x: Math.floor(box.x - pad), y: Math.floor(box.y - pad), width: Math.ceil(box.width + pad * 2), height: Math.ceil(box.height + pad * 2) } });
});

test("previously-on-player", async ({ page, context }) => {
  // the read-aloud on the player screen, once the GM shows it: built from the player projection only
  const base = await loadDemo(page, "skyfire");
  await nav(page, "Sessions").click();
  await page.locator('[data-session][data-status="planned"]').getByRole("link").click();
  const sessionId = page.url().split("/").pop()!;
  await page.getByTestId("recap-show").click();
  await expect(page.getByTestId("recap-show")).toHaveText("Hide from player screen");
  const players = await context.newPage();
  await players.setViewportSize({ width: 1280, height: 900 });
  await players.goto(`${base}/table/${sessionId}?view=players`);
  await expect(players.getByTestId("player-recap")).toContainText("Mara Quill");
  await shot(players, "previously-on-player");
});

test("crew-notes", async ({ page, context }) => {
  // the player screen's crew notes: the clue found in session 1 under the thread's player title, Mara Quill and her favour
  await loadDemo(page, "skyfire");
  await startPlannedSession(page);
  const popup = context.waitForEvent("page");
  await page.getByRole("button", { name: "Player screen" }).click();
  const players = await popup;
  await players.setViewportSize({ width: 1100, height: 1400 });
  const notes = players.getByTestId("crew-notes");
  await expect(notes.getByTestId("crew-notes-clue")).toHaveCount(1);
  await expect(notes.getByTestId("crew-notes-contact")).toContainText("Mara Quill");
  await notes.evaluate((e) => e.scrollIntoView({ block: "start" }));
  await settle(players);
  const box = (await notes.boundingBox())!;
  const pad = 16;
  await shot(players, "crew-notes", { clip: { x: Math.floor(box.x - pad), y: Math.floor(box.y - pad), width: Math.ceil(box.width + pad * 2), height: Math.ceil(box.height + pad * 2) } });
});

test("wrap-up-awards", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1250 });
  await loadDemo(page, "skyfire");
  await startPlannedSession(page);
  await page.getByTestId("end-session").click();
  const wrap = page.getByTestId("wrapup");
  await wrap.getByRole("textbox", { name: "Session summary" }).fill("The crew took the Weyland-Yutani job and left the station.");
  await wrap.getByRole("button", { name: /^Next: End-of-session questions/ }).click();
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

/** Skyfire Down's job from the board, run as an adventure ("Run this job"): lands on the adventure page. */
async function runBoardJob(page: Page, base: string) {
  await page.goto(`${base}/atlas`);
  await page.getByRole("tab", { name: /^Jobs/ }).click();
  await page.getByRole("tabpanel").getByRole("link", { name: skyfireBoardJob(), exact: true }).click();
  await page.getByTestId("run-from-entity").click();
  await expect(page.getByTestId("adventure-source")).toContainText("Site map:");
}

test("run-this-job", async ({ page }) => {
  // the job board's job run as a Job card: the link back to the job and its site map, the scenes, and the arrival
  // set at the job's site, on its map, with the job's three NPCs (the GM's notes from the job below)
  await page.setViewportSize({ width: 1440, height: 1250 });
  const base = await loadDemo(page, "skyfire");
  await runBoardJob(page, base);
  await page.getByTestId("outline-scene").filter({ hasText: "Arrival" }).getByRole("button").first().click();
  await expect(page.getByTestId("scene-title")).toHaveValue(/^Arrival/);
  await dismissToasts(page);
  await shot(page, "run-this-job");
});

test("close-the-job", async ({ page }) => {
  // the wrap-up's last step: the job the session ran, closed as done, its pay collected (with an undo), its adventure done,
  // and the way to between jobs
  await page.setViewportSize({ width: 1440, height: 1100 });
  const base = await loadDemo(page, "skyfire");
  await runBoardJob(page, base);
  await startPlannedSession(page);
  await page.getByTestId("end-session").click();
  const wrap = page.getByTestId("wrapup");
  await wrap.getByRole("textbox", { name: "Session summary" }).fill("The crew landed at the site and got the ore out, short one crate.");
  await wrap.getByRole("list", { name: "Wrap-up steps" }).getByRole("button", { name: /Close the jobs?$/ }).click();
  const close = wrap.getByTestId("close-source").first();
  await close.getByTestId("close-outcome-done").click();
  await close.getByTestId("payout").click();
  await expect(close.getByTestId("payout-posted")).toBeVisible();
  await dismissToasts(page);
  await shot(page, "close-the-job");
});

test("job-board-taken", async ({ page }) => {
  // the job board kept as dealt: the first posting taken (marked, with its job and "Run this job" as the next steps), the
  // other two still open, "Keep the others as leads" below; the board survives leaving and coming back
  await page.setViewportSize({ width: 1440, height: 1250 });
  const base = await loadDemo(page, "skyfire");
  await page.goto(`${base}/generate/alien.job-board`);
  await page.getByTestId("seed").fill("readme-board");
  const cards = page.getByTestId("offer-board").getByTestId("offer-card");
  await expect(cards).toHaveCount(3);
  await cards.first().getByTestId("offer-accept").click();
  await expect(cards.first()).toHaveAttribute("data-state", "accept");
  await expect(page.getByTestId("draft-status")).toHaveAttribute("data-state", "saved");
  // left and opened again: the same board, said so
  await nav(page, "Home").click();
  await nav(page, "Generate").click();
  await page.getByTestId("procedure-alien.job-board").click();
  await expect(page.getByTestId("draft-note")).toContainText("1 of 3 postings");
  await dismissToasts(page);
  // the board itself: the taken posting on top, the next one below it
  await page.getByTestId("offer-board").evaluate((e) => window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - 24));
  await shot(page, "job-board-taken");
});

test("draft-stale", async ({ page }) => {
  // a job board kept as dealt, reopened after an NPC was added: the page says the campaign changed since the deal
  // and offers to read it again (same seed, re-rolls and pins) beside a new deal
  await page.setViewportSize({ width: 1440, height: 760 });
  const base = await loadDemo(page, "skyfire");
  await page.goto(`${base}/generate/alien.job-board`);
  await page.getByTestId("seed").fill("readme-stale");
  await expect(page.getByTestId("draft-status")).toHaveAttribute("data-state", "saved");
  await page.goto(`${base}/entities/new?type=alien.character`);
  await page.getByTestId("entity-name").fill("Vera Kole");
  await page.getByTestId("create-entity").click();
  await expect(page.getByTestId("entity-page")).toBeVisible();
  await nav(page, "Generate").click();
  await page.getByTestId("procedure-alien.job-board").click();
  await expect(page.getByTestId("draft-stale")).toContainText("The campaign changed since this was dealt (Campaign)");
  await dismissToasts(page);
  await shot(page, "draft-stale");
});

test("scene-new-clue", async ({ page }) => {
  // a scene's Clues picker with nothing to pick: "+ New clue" makes one named by the search and lists it on the scene
  await page.setViewportSize({ width: 1440, height: 900 });
  const base = await loadDemo(page, "skyfire");
  await runBoardJob(page, base);
  await page.getByTestId("outline-scene").filter({ hasText: "Arrival" }).getByRole("button").first().click();
  await expect(page.getByTestId("scene-title")).toHaveValue(/^Arrival/);
  await page.getByTestId("scene-editor").getByRole("button", { name: "Add clue" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("searchbox", { name: "Search entities" }).fill("Scorched hatch seal");
  await expect(dialog.getByTestId("picker-create")).toHaveText("+ New clue “Scorched hatch seal”");
  await dismissToasts(page);
  await shot(page, "scene-new-clue");
});

test("wrap-up-trip", async ({ page }) => {
  // closing the job in the wrap-up: the module counts the trip (the job's distance at the ship's FTL rating, out and
  // back) and the GM moves the in-world date by it, with an undo; the Back/Next bar no longer covers the checklist
  await page.setViewportSize({ width: 1440, height: 900 });
  const base = await loadDemo(page, "skyfire");
  await runBoardJob(page, base);
  await startPlannedSession(page);
  await page.getByTestId("end-session").click();
  const wrap = page.getByTestId("wrapup");
  await wrap.getByRole("textbox", { name: "Session summary" }).fill("The crew landed at the site and got the ore out, short one crate.");
  await wrap.getByRole("list", { name: "Wrap-up steps" }).getByRole("button", { name: /Close the jobs?$/ }).click();
  const close = wrap.getByTestId("close-source").first();
  await close.getByTestId("close-outcome-done").click();
  await close.getByTestId("close-trip-move").click();
  await expect(close.getByTestId("close-trip")).toContainText("In-world date moved");
  await dismissToasts(page);
  await shot(page, "wrap-up-trip");
});

test("between-jobs-date", async ({ page }) => {
  // between jobs accepted: the effects applied (the week in port moves the in-world date) and the thread clocks as the
  // run moved them, not a preview of the next roll
  await page.setViewportSize({ width: 1440, height: 1560 });
  const base = await loadDemo(page, "skyfire");
  await page.goto(`${base}/generate/alien.between-jobs`);
  await expect(page.getByTestId("effects-picker")).toContainText("The in-world date moves forward 7 days (1 week in port)");
  await page.getByTestId("accept").click();
  await expect(page.getByTestId("arc-tick-done")).toBeVisible();
  await dismissToasts(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "between-jobs-date");
});

test("lifepath-background", async ({ page }) => {
  // a Life Path accepted: the origin, early life, company, experience, life event, career and psych evaluation written
  // into the PC's Background, beside the full provenance
  await page.setViewportSize({ width: 1440, height: 900 });
  const base = await loadDemo(page, "skyfire");
  await page.goto(`${base}/generate/alien.lifepath`);
  await page.getByTestId("seed").fill("crew-2");
  await page.getByTestId("preview-name-pc").fill("Rook Calder");
  await page.getByTestId("accept").click();
  await expect(page.getByTestId("entity-page")).toBeVisible();
  const background = page.locator('[data-section="background"]');
  await expect(background.getByRole("textbox").first()).toHaveValue(/^Origin: /);
  await background.evaluate((e) => window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - 24));
  await dismissToasts(page);
  await shot(page, "lifepath-background");
});

test("wrap-up-draft", async ({ page }) => {
  // the wrap-up's summary drafted from what session 2 logged (the scene run, a panic roll, a critical injury), marked as a draft
  await page.setViewportSize({ width: 1440, height: 900 });
  await loadDemo(page, "skyfire");
  await startPlannedSession(page);
  const stress = page.locator('[data-tracker="alien.stress"]');
  await stress.getByRole("button", { name: "Panic roll" }).first().click();
  await expect(page.getByTestId("roll-result")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Done" }).click();
  // the second PC's rolls are under its row's "More"
  await page.getByRole("list", { name: "Player characters" }).getByTestId("participant-more").nth(1).click();
  await page.getByRole("button", { name: /^Critical injury for / }).first().click();
  await expect(page.getByTestId("roll-result")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Done" }).click();
  await page.getByTestId("mark-run").click();
  await page.getByTestId("end-session").click();
  const wrap = page.getByTestId("wrapup");
  await expect(wrap.getByRole("textbox", { name: "Session summary" })).toHaveValue(/^The crew played one scene/);
  await expect(wrap.getByTestId("summary-drafted")).toBeVisible();
  await dismissToasts(page);
  await shot(page, "wrap-up-draft");
});

test("table-recap", async ({ page }) => {
  // session 2 started from Home: "Previously on…" at the top of the table, shown on the player screen, until the first scene is run
  await page.setViewportSize({ width: 1440, height: 900 });
  await loadDemo(page, "skyfire");
  await page.getByRole("button", { name: "Start this session" }).click();
  await expect(page.getByTestId("table-mode")).toBeVisible();
  const recap = page.getByTestId("table-recap");
  await recap.getByTestId("table-recap-show").click();
  await expect(recap).toContainText("On the player screen");
  await shot(page, "table-recap");
});

test("rules", async ({ page }) => {
  const base = await loadDemo(page, "skyfire");
  await page.goto(`${base}/rules`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await shot(page, "rules");
});

test("search-rules", async ({ page }) => {
  await loadDemo(page, "skyfire");
  // the pointer out of the way first: a hover would move the highlighted hit
  await page.mouse.move(0, 0);
  await page.getByRole("searchbox", { name: "Search campaign" }).fill("panic");
  const results = page.getByRole("listbox", { name: "Search results" });
  await expect(results.getByText("Rules", { exact: true })).toBeVisible();
  await expect(results.getByRole("group", { name: "Rules" }).getByRole("option", { name: /Panic roll/ })).toContainText("p. 72");
  // not shot(): it blurs the search box, which closes the results
  await page.waitForTimeout(400);
  await settle(page);
  await page.screenshot({ path: file("search-rules"), animations: "disabled", caret: "hide", clip: { x: 0, y: 0, width: 1040, height: 560 } });
});

test("search-reference", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loadDemo(page, "dnd5e");
  await page.mouse.move(0, 0);
  await page.getByRole("searchbox", { name: "Search campaign" }).fill("fireball");
  const results = page.getByRole("listbox", { name: "Search results" });
  const reference = results.getByRole("group", { name: "Reference" });
  await expect(reference.getByRole("option", { name: /Fireball/ }).first()).toContainText("Spells");
  // not shot(): it blurs the search box, which closes the results
  await page.waitForTimeout(400);
  await settle(page);
  await page.screenshot({ path: file("search-reference"), animations: "disabled", caret: "hide", clip: { x: 0, y: 0, width: 1040, height: 560 } });
});

test("preview-as-player", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loadDemo(page, "skyfire");
  await nav(page, "Atlas").click();
  await page.getByTestId("preview-as-player").check();
  await page.getByRole("tab", { name: /^Jobs/ }).click();
  // the job taken from the board: its posting and its contact, as the players see them
  await page.getByRole("table").getByRole("link", { name: "Ore to the spaceport" }).click();
  await expect(page.getByTestId("player-preview-banner")).toBeVisible();
  await expect(page.getByTestId("player-preview-sheet")).toContainText("Posting");
  await expect(page.getByTestId("player-preview-sheet")).not.toContainText("Employer's real intent");
  await shot(page, "preview-as-player");
});

test("secret-synthetic", async ({ page }) => {
  // the demo's covert android shown to the players: Field visibility keeps its true make GM-only and says why
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loadDemo(page, "skyfire");
  await nav(page, "Atlas").click();
  await page.getByRole("tab", { name: /^NPCs/ }).click();
  await page.getByRole("table").getByRole("link", { name: "Constance Navona", exact: true }).click();
  await page.getByRole("combobox", { name: "Visibility", exact: true }).selectOption("players");
  await page.getByTestId("field-visibility-open").click();
  const fv = page.getByTestId("field-visibility");
  await expect(fv.locator('[data-field="attributes"]').getByTestId("field-visibility-reason")).toContainText("Poses as human");
  await fv.locator('[data-field="android"]').evaluate((e) => e.scrollIntoView({ block: "center" }));
  await shot(page, "secret-synthetic");
});

test("critical-injury-result", async ({ page }) => {
  // a PC broken by a hit rolls a critical injury: what it does, how long it takes to heal, and the ids kept under Raw result
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loadDemo(page, "skyfire");
  await startPlannedSession(page);
  const pcs = page.getByRole("list", { name: "Player characters" });
  await pcs.getByRole("button", { name: "Take a hit: Elena Sanchez" }).click();
  const hit = page.getByTestId("take-hit");
  await hit.getByRole("spinbutton", { name: "Damage" }).fill("12");
  await hit.getByRole("button", { name: "Apply to Elena Sanchez" }).click();
  await hit.getByRole("button", { name: "Roll Critical injury for Elena Sanchez" }).click();
  const result = page.getByTestId("roll-result");
  await expect(result.getByTestId("roll-result-meaning")).toBeVisible();
  const dialog = page.getByRole("dialog").filter({ has: result });
  await settle(page);
  const b = (await dialog.boundingBox())!;
  const pad = 12;
  await shot(page, "critical-injury-result", { clip: { x: Math.floor(b.x - pad), y: Math.floor(b.y - pad), width: Math.ceil(b.width + 2 * pad), height: Math.ceil(b.height + 2 * pad) } });
});

test("gm-screen-onscreen", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const base = await loadDemo(page, "skyfire");
  await page.getByTestId("home-gm-screen").click();
  await expect(page).toHaveURL(`${base}/gm-screen?view=screen`);
  await expect(page.getByTestId("gm-screen-onscreen").getByRole("heading", { name: "GM side" })).toBeVisible();
  await shot(page, "gm-screen-onscreen");
});

// ---------------------------------------------------------------------------
// Cold Harbor Relay (cinematic)
// ---------------------------------------------------------------------------

test("creature-turn", async ({ page }) => {
  // a wide left column, tall enough for the whole turn card
  await page.setViewportSize({ width: 2100, height: 1800 });
  await loadDemo(page, "cinematic");
  await startPlannedSession(page);
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

  // frame the turn card (the live map follows it in the left column)
  await turn.evaluate((e) => e.scrollIntoView({ block: "start" }));
  await settle(page);
  const a = (await turn.boundingBox())!;
  const pad = 12;
  const clip = { x: Math.floor(a.x - pad), y: Math.floor(a.y - pad), width: Math.ceil(a.width + pad * 2), height: Math.ceil(a.height + pad * 2) };
  expect(clip.y + clip.height, "the turn card fits").toBeLessThanOrEqual(page.viewportSize()!.height);
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

test("agenda-generator", async ({ page }) => {
  // Cold Harbor's guided builder, PCs step: "Generate agenda drafts" deals the four PCs their arcs (no reload, so the seed is the harness's)
  await page.setViewportSize({ width: 1440, height: 1080 });
  await loadDemo(page, "cinematic");
  await nav(page, "Adventures").click();
  await page.getByTestId("adventure-card").filter({ hasText: "Cold Harbor" }).click();
  await page.getByTestId("step-pcs").click();
  await page.getByTestId("guided-agenda-drafts").click();
  const drafts = page.getByTestId("agenda-drafts");
  await expect(drafts.getByTestId("agenda-character")).toHaveCount(4);
  await expect(page.getByTestId("agenda-report")).toContainText("Friction");
  // the conflict report, then the first drafts
  await page.getByTestId("agenda-report").evaluate((e) => window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - 72));
  await shot(page, "agenda-generator");
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
  await startPlannedSession(page);
  await page.getByTestId("share-players").click();
  const dialog = page.getByTestId("share-dialog");
  await dialog.getByTestId("share-include-party").check();
  await expect(dialog.getByTestId("share-preview-item")).toHaveCount(4);
  await expect(dialog.getByTestId("share-send")).toBeEnabled();
  await shot(page, "share-players");
});

test("player-packets", async ({ page }) => {
  // Skyfire Down session 1: Share, Player packets: the four players, and Priya's packet as the web page she gets (her sheet, her agenda, the note shared with her alone)
  await page.setViewportSize({ width: 1440, height: 1100 });
  await loadDemo(page, "skyfire");
  await startPlannedSession(page);
  await page.getByTestId("share-players").click();
  await page.getByRole("tab", { name: /Player packets/ }).click();
  const dialog = page.getByTestId("packets-dialog");
  await expect(dialog.getByTestId("packet-player")).toHaveCount(4);
  await dialog.getByRole("button", { name: "Preview Priya's packet" }).click();
  await expect(dialog.getByTestId("packet-title")).toHaveText(/^Skyfire Down for Priya/);
  const preview = dialog.frameLocator("[data-testid=share-preview-page]");
  await expect(preview.getByRole("heading", { name: "An unsigned note" })).toBeVisible();
  await expect(dialog.getByTestId("packet-send")).toBeEnabled();
  // the players at the top, Priya's page below them
  await dialog.locator(".app-packets").evaluate((el) => el.scrollIntoView({ block: "start" }));
  await shot(page, "player-packets");
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
  await startPlannedSession(page);
  await expect(page.getByRole("heading", { name: "Ambush at the toll-house" })).toBeVisible();
  // everyone in the opening fight in the Combat panel: initiative rolled d20 + initiative, highest first, round 1;
  // the Trackers tab beside it keeps what the panel does not (no second initiative or hit point tracker)
  const combat = page.getByTestId("d20-combat");
  await combat.getByTestId("roll-initiative-all").click();
  await expect(combat.getByTestId("combat-round")).toHaveText("Round 1");
  await expect(combat.locator("[data-combatant]")).toHaveCount(7);
  await expect(page.locator('[data-tracker="dnd5e-srd.tracker.initiative"]')).toHaveCount(0);
  // a round in: a goblin arrow found Brannoc, and Brannoc found a goblin
  const card = (name: string) => combat.locator("[data-combatant]").filter({ has: page.getByRole("button", { name: `Open ${name}`, exact: true }) });
  for (const [name, amount] of [["Brannoc Ashby", "5"], ["Goblin 1", "4"]] as const) {
    await card(name).getByRole("spinbutton", { name: `Amount for ${name}` }).fill(amount);
    await card(name).getByRole("button", { name: `Damage ${name}` }).click();
  }
  await expect(card("Goblin 1").getByTestId("health-value")).toHaveText("3/7");
  await dismissToasts(page);
  await shot(page, "dnd5e-table");
});

test("dnd5e-dungeon", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1150 });
  await loadDemo(page, "dnd5e");
  // the demo's generated tower: the GM map, and the barracks' entry from the room key beside it
  await nav(page, "Generate").click();
  await page.getByRole("region", { name: "Site maps" }).getByRole("link", { name: "The Sunken Watchtower" }).click();
  const mapPage = page.getByTestId("map-page");
  await expect(mapPage).toHaveAttribute("data-layout", "generated");
  await expect(mapPage.getByTestId("zone-key")).toContainText("Room key");
  await refit(mapPage);
  await mapPage.getByTestId("sitemap").locator('[data-hit="zone"][aria-label*="Barracks"]').click({ force: true });
  await expect(mapPage.getByTestId("zone-detail")).toContainText("Barracks");
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "dnd5e-dungeon");
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
  await startPlannedSession(page);
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
  await startPlannedSession(page);
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

test("gm-screen", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1240 });
  const base = await loadDemo(page, "dnd5e");
  // from the Rules page, as a GM would get there; no reload, so the campaign keeps its id
  await page.getByRole("navigation", { name: "Campaign" }).getByRole("link", { name: "Rules", exact: true }).click();
  await page.getByTestId("open-gm-screen").click();
  await expect(page).toHaveURL(`${base}/gm-screen`);
  const preview = page.getByTestId("gm-screen-preview");
  await expect(preview.getByTestId("gm-screen-page-preview")).toHaveCount(2);
  await expect(preview.getByRole("img").first()).toHaveAttribute("alt", /GM side: .*CHECKS AND DCS/);
  await expect(page.getByTestId("gm-screen-overflow")).toHaveCount(0);
  await page.evaluate(() => Promise.all([...document.querySelectorAll("img")].map((i) => i.decode().catch(() => undefined))));
  await shot(page, "gm-screen");
});

test("character-builder", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1180 });
  await loadDemo(page, "dnd5e");
  // the demo's half-built SRD 5.2 elf wizard, resumed from the PCs tab (no reload, so ids stay put)
  await page.getByRole("navigation", { name: "Campaign" }).getByRole("link", { name: "Atlas", exact: true }).click();
  await page.getByRole("tab", { name: /^PCs/ }).click();
  const draft = page.getByTestId("character-drafts").getByRole("listitem").filter({ hasText: "Elowen Brightwater" });
  await draft.getByTestId("draft-resume").click();
  await expect(page.locator(".cb__main")).toHaveAttribute("data-step", "background");
  await expect(page.getByTestId("opt:background:sage-2024")).toHaveClass(/is-on/);
  await expect(page.getByTestId("summary-intelligence")).toContainText("17");
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "character-builder");
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

test("orc-dungeon", async ({ page, context }) => {
  await loadDemo(page, "pf2e");
  await startPlannedSession(page);
  // the xulgath den scene: the generated cave, live, with the first rooms found
  const scenes = page.getByRole("combobox", { name: "Scene" });
  const value = await scenes.locator("option", { hasText: "The xulgath den" }).getAttribute("value");
  await scenes.selectOption(value!);
  await expect(page.getByTestId("live-map")).toBeVisible();
  const popup = context.waitForEvent("page");
  await page.getByRole("button", { name: "Player screen" }).click();
  const players = await popup;
  await players.setViewportSize({ width: 1440, height: 1100 });
  const playerMap = players.getByTestId("player-map");
  await expect(playerMap).toBeVisible();
  await expect(playerMap.locator("[data-number]")).toHaveCount(0);
  await refit(playerMap);
  await shot(players, "orc-dungeon");
});

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
  await expect(page.getByTestId("step-shape")).toContainText("Encounter shape (120 XP");
  await expect(page.getByTestId("step-g1")).toContainText("Creatures of level ");
  await expect(page.getByTestId("step-result-budget")).toHaveText("120 XP");
  await expect(page.getByTestId("step-result-shape")).toHaveText(/^\d+ × party level/);
  await expect(page.getByTestId("step-result-g1list")).toHaveText(/^\d+ × .+$/);
  await dismissToasts(page);
  await shot(page, "pf2e-encounter");
});

test("orc-combat", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 2600 });
  await loadDemo(page, "pf2e");
  await startPlannedSession(page);
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

test("orc-builder", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await loadDemo(page, "pf2e");
  // the demo's half-built dwarf cleric, resumed from the PCs tab at the attribute boosts (no reload, so ids stay put)
  await page.getByRole("navigation", { name: "Campaign" }).getByRole("link", { name: "Atlas", exact: true }).click();
  await page.getByRole("tab", { name: /^PCs/ }).click();
  const draft = page.getByTestId("character-drafts").getByRole("listitem").filter({ hasText: "Maren Ashdown" });
  await draft.getByTestId("draft-resume").click();
  await expect(page.locator(".cb__main")).toHaveAttribute("data-step", "boosts");
  await expect(page.getByTestId("opt:boosts:wisdom")).toHaveClass(/is-on/);
  await expect(page.getByTestId("preview-Attributes")).toContainText("Wis +4");
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "orc-builder");
});

// ---------------------------------------------------------------------------
// The Alien guide ("Your first Alien campaign", alienModule.guide): one shot
// per step, guide-alien-<step id>.png, taken by doing the steps in the app on
// a blank campaign with the guide's own example names. One test, because each
// step builds on the last (`-g guide-alien` re-runs them all); in-app
// navigation only (a reload restarts the seeded randomness and repeats ids),
// and fixed seeds wherever the app rolls. Each image is cropped to the panel
// the step is about.
// ---------------------------------------------------------------------------

/** A guide step's shot, guide-<module>-<step>.png (the Alien module's unless `module` says): the union of `parts` with a little padding, its top just under the sticky header, clipped to the viewport. */
async function guideShot(page: Page, step: string, parts: Locator | Locator[], opts: { pad?: number; maxHeight?: number; module?: string } = {}) {
  await dismissToasts(page);
  await calm(page);
  const list = Array.isArray(parts) ? parts : [parts];
  const pad = opts.pad ?? 12;
  // where the parts are: in a dialog, inside table mode (a fixed layer over the app with its own bars and scrolling columns), table mode itself, or on a page
  const where = await list[0]!.evaluate((e) => (e.closest("dialog") ? "dialog" : e.matches(".app-table") ? "table" : e.closest(".app-table") ? "in-table" : "page"));
  const tops = await Promise.all(list.map((l) => l.evaluate((e) => e.getBoundingClientRect().top + window.scrollY)));
  if (where === "in-table") {
    // scroll the topmost part to the top of its column, the padding above it
    const first = list[tops.indexOf(Math.min(...tops))]!;
    await first.evaluate((e, gap) => {
      e.scrollIntoView({ block: "start" });
      let p = e.parentElement;
      while (p && p.scrollHeight <= p.clientHeight) p = p.parentElement;
      p?.scrollBy(0, -gap);
    }, pad);
  } else {
    // the app header is sticky: scroll the frame's top to just below it
    await page.evaluate((y) => window.scrollTo(0, Math.max(0, y)), Math.min(...tops) - 64 - pad);
  }
  await settle(page);
  const boxes = await Promise.all(list.map(async (l) => (await l.boundingBox())!));
  const vp = page.viewportSize()!;
  // never take in the sticky header or the sidebar beside a page, or table mode's own bars above its columns
  const chrome = async (selector: string) => ((await page.locator(selector).count()) > 0 ? await page.locator(selector).first().boundingBox() : null);
  const bar = where === "page" ? await chrome(".app-header") : where === "in-table" ? ((await chrome(".app-table__clock")) ?? (await chrome(".app-table__header"))) : null;
  const side = where === "page" ? await chrome(".app-nav") : null;
  const x0 = Math.max(side ? Math.ceil(side.x + side.width) : 0, Math.floor(Math.min(...boxes.map((b) => b.x)) - pad));
  const y0 = Math.max(bar ? Math.ceil(bar.y + bar.height) : 0, Math.floor(Math.min(...boxes.map((b) => b.y)) - pad));
  const x1 = Math.min(vp.width, Math.ceil(Math.max(...boxes.map((b) => b.x + b.width)) + pad));
  let y1 = Math.min(vp.height, Math.ceil(Math.max(...boxes.map((b) => b.y + b.height)) + pad));
  if (opts.maxHeight) y1 = Math.min(y1, y0 + opts.maxHeight);
  await page.screenshot({ path: file(`guide-${opts.module ?? "alien"}-${step}`), animations: "disabled", caret: "hide", clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } });
}

test("guide-alien", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  const main = page.locator("main");
  const header = main.locator(".app-page__header").first();

  // Create the campaign: the New campaign dialog
  await page.goto("/");
  await page.getByRole("button", { name: "New campaign" }).click();
  const dialog = page.getByRole("dialog", { name: "New campaign" });
  await dialog.getByLabel("Name", { exact: true }).fill("Breakwater Freight");
  await expect(dialog.getByRole("combobox", { name: "Game module" })).toHaveValue("alien");
  await dialog.getByRole("radio", { name: /^Campaign/ }).check();
  await dialog.getByRole("group", { name: "Campaign frame" }).getByRole("radio", { name: /^Space Truckers/ }).check();
  await guideShot(page, "new-campaign", dialog, { pad: 0 });
  await dialog.getByRole("button", { name: "Create campaign" }).click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/);

  // Home and its checklist
  const guide = page.getByTestId("setup-guide");
  await expect(guide).toBeVisible();
  await guideShot(page, "home-checklist", [header, guide]);
  const step = (id: string) => guide.locator(`[data-step="${id}"]`);

  // The crew: a Life Path (a pilot, a fixed seed), named in the preview
  await step("alien.setup.crew").getByRole("link", { name: "Roll a Life Path" }).click();
  await expect(page).toHaveURL(/\/generate\/alien\.lifepath$/);
  await page.getByRole("combobox", { name: "Career" }).selectOption({ label: "Pilot" });
  await page.getByTestId("seed").fill("breakwater-crew-1");
  await page.getByTestId("preview-name-pc").fill("Juno Okafor");
  await expect(page.getByTestId("preview")).toContainText("Career Pilot");
  await guideShot(page, "life-path", main.locator(".app-page").first(), { maxHeight: 720 });
  await page.getByTestId("accept").click();
  await expect(page).toHaveURL(/\/entities\/[0-9A-Z]{26}$/, { timeout: 15_000 });

  // a PC by hand
  await nav(page, "Home").click();
  await step("alien.setup.crew").getByRole("link", { name: "+ Character" }).click();
  await page.getByTestId("entity-name").fill("Tobias Reyne");
  await guideShot(page, "pc-by-hand", [main.locator("label", { hasText: "Name" }).filter({ has: page.getByTestId("entity-name") }), page.getByTestId("create-fields"), page.getByTestId("create-entity")]);
  await page.getByTestId("create-entity").click();
  await expect(page).toHaveURL(/\/entities\/[0-9A-Z]{26}/);

  // the players and who plays whom
  await nav(page, "Home").click();
  await step("setup.players").getByRole("link", { name: "Add players" }).click();
  const players = page.getByTestId("players-card");
  for (const name of ["Alex", "Sam"]) {
    await players.getByTestId("player-new-name").fill(name);
    await players.getByTestId("player-add").click();
  }
  await players.getByRole("checkbox", { name: "Alex plays Juno Okafor" }).check();
  await players.getByRole("checkbox", { name: "Sam plays Tobias Reyne" }).check();
  await guideShot(page, "players", players);

  // buddy and rival
  await nav(page, "Atlas").click();
  await page.getByRole("tab", { name: /^PCs/ }).click();
  await page.getByRole("tabpanel").getByRole("link", { name: "Tobias Reyne" }).click();
  await page.getByRole("combobox", { name: "Buddy" }).selectOption({ label: "Juno Okafor" });
  // a pair: Juno's sheet now names Tobias as her buddy too
  await expect(page.locator(".cf-toast").filter({ hasText: "Juno Okafor's buddy is now Tobias Reyne too." })).toBeVisible();
  await guideShot(page, "buddy-rival", [page.locator(".app-entity__header"), page.locator('[data-section="crew-ties"]')]);

  // The crew's ship, from a preset
  await nav(page, "Ship").click();
  await page.getByTestId("ship-picker").selectOption({ label: "+ New spaceship…" });
  const create = page.getByRole("dialog", { name: "New spaceship" });
  await create.getByTestId("quick-create-preset").selectOption({ label: "Model CM-88G Bison" });
  await create.getByTestId("quick-create-name").fill("Marigold Dawn");
  await create.getByTestId("quick-create-submit").click();
  await expect(page.getByTestId("ship-card").getByRole("link", { name: "Marigold Dawn" })).toBeVisible();
  await guideShot(page, "ship", [header, page.getByTestId("ship-card")]);

  // Places: a station
  await nav(page, "Home").click();
  await page.getByRole("link", { name: "+ Location" }).click();
  await main.locator("label", { hasText: "Subtype" }).locator("select").selectOption({ label: "Colony" });
  await page.getByTestId("entity-name").fill("Halvorsen Relay");
  await guideShot(page, "location", [main.locator("h1"), main.locator("fieldset").first()], { maxHeight: 560 });
  await page.getByTestId("create-entity").click();
  await expect(page).toHaveURL(/\/entities\/[0-9A-Z]{26}/);
  await page.getByRole("textbox", { name: "Summary" }).fill("A refuelling station on the Outer Rim, and the crew's home port.");
  await page.getByRole("textbox", { name: "Summary" }).blur();

  // a place inside it: within
  await nav(page, "Home").click();
  await page.getByRole("link", { name: "+ Location" }).click();
  await main.locator("label", { hasText: "Subtype" }).locator("select").selectOption({ label: "Site" });
  await page.getByTestId("entity-name").fill("The Lantern Bar");
  await page.getByTestId("create-entity").click();
  await expect(page).toHaveURL(/\/entities\/[0-9A-Z]{26}/);
  await page.getByRole("tab", { name: "Relationships" }).click();
  await page.getByTestId("add-relationship").click();
  let link = page.getByRole("dialog", { name: "Link The Lantern Bar" });
  await link.getByRole("combobox", { name: "Relationship type" }).selectOption({ label: "within" });
  await link.getByRole("button", { name: "Choose…" }).click();
  await page.getByRole("searchbox", { name: "Search entities" }).fill("Halvorsen");
  await page.getByRole("dialog", { name: "Choose an entity" }).getByRole("option", { name: /Halvorsen Relay/ }).click();
  await expect(link).toContainText("Halvorsen Relay");
  await guideShot(page, "place-inside", link, { pad: 0 });
  await link.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("list", { name: "Relationships" })).toContainText("Halvorsen Relay");

  // the home base
  await nav(page, "Settings").click();
  await page.getByRole("combobox", { name: "Home base" }).selectOption({ label: "Halvorsen Relay (Location)" });
  await guideShot(page, "home-base", main.locator(".cf-card").first());

  // People: an NPC from a preset
  await nav(page, "Home").click();
  await page.getByTestId("quick-npc").click();
  await page.getByRole("searchbox", { name: "Search presets" }).fill("engineer");
  await page.getByRole("radio", { name: /^Ship’s engineer/ }).first().check();
  await page.getByTestId("entity-name").fill("Oskar Brandt");
  await guideShot(page, "npc-preset", [main.locator("fieldset").first(), page.getByTestId("entity-name")]);
  await page.getByTestId("create-entity").click();
  await expect(page).toHaveURL(/\/entities\/[0-9A-Z]{26}/);

  // an NPC by hand, from the NPCs tab
  await nav(page, "Atlas").click();
  await page.getByRole("tab", { name: /^NPCs/ }).click();
  await header.getByRole("link", { name: "+ New" }).click();
  await page.getByTestId("entity-name").fill("Wen Halloran");
  await page.getByTestId("create-entity").click();
  await expect(page).toHaveURL(/\/entities\/[0-9A-Z]{26}/);
  await page.getByRole("textbox", { name: "Summary" }).fill("Harbourmaster of Halvorsen Relay; knows every ship that docks.");
  await page.getByRole("textbox", { name: "Summary" }).blur();
  await nav(page, "Atlas").click();
  await page.getByRole("tab", { name: /^NPCs/ }).click();
  await expect(page.getByRole("tabpanel")).toContainText("Wen Halloran");
  await guideShot(page, "npcs", [header, page.getByRole("tabpanel")]);

  // Connect them: a relationship
  await page.getByRole("tabpanel").getByRole("link", { name: "Oskar Brandt" }).click();
  await page.getByRole("tab", { name: "Relationships" }).click();
  await page.getByTestId("add-relationship").click();
  link = page.getByRole("dialog", { name: "Link Oskar Brandt" });
  await link.getByRole("combobox", { name: "Relationship type" }).selectOption({ label: "knows" });
  await link.getByRole("button", { name: "Choose…" }).click();
  await page.getByRole("searchbox", { name: "Search entities" }).fill("Tobias");
  await page.getByRole("dialog", { name: "Choose an entity" }).getByRole("option", { name: /Tobias Reyne/ }).click();
  await link.getByRole("textbox", { name: "Note" }).fill("Owes him a favour from the Pell run");
  await guideShot(page, "relationship", link, { pad: 0 });
  await link.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("list", { name: "Relationships" })).toContainText("Tobias Reyne");

  // an @ link in a note (the popup stays open while the shot is taken; the pick is a click)
  await page.getByRole("tab", { name: /^Notes/ }).click();
  await page.getByTestId("add-entity-note").click();
  const editor = page.locator(".cf-editor__content").first();
  await editor.click();
  await page.keyboard.type("Drinks at @Lantern");
  const mention = page.getByTestId("mention-popup");
  await expect(mention.getByRole("option", { name: /The Lantern Bar/ })).toBeVisible();
  await guideShot(page, "mention", page.getByRole("tabpanel"), { maxHeight: 340 });
  await mention.getByRole("option", { name: /The Lantern Bar/ }).click();
  await expect(editor.locator(".cf-entity-ref")).toHaveText(/The Lantern Bar/);
  await editor.press("End");
  await page.keyboard.type(" every shift change, and hears everything.");
  await page.waitForTimeout(500);

  // backlinks on the bar
  await nav(page, "Atlas").click();
  await page.getByRole("tab", { name: "Locations" }).click();
  await page.getByRole("tree", { name: "Locations" }).getByRole("link", { name: "The Lantern Bar" }).click();
  await page.getByRole("tab", { name: "Backlinks" }).click();
  await expect(page.getByTestId("backlinks")).toContainText("via mention");
  await guideShot(page, "backlinks", [page.locator(".app-entity__header"), page.getByTestId("backlinks")]);

  // the graph
  await nav(page, "Atlas").click();
  await page.getByRole("tab", { name: "Graph" }).click();
  await guideShot(page, "graph", [header, page.getByRole("tabpanel")]);

  // who sees what: the station for the players, the Atlas previewed as a player
  await page.getByRole("tab", { name: "Locations" }).click();
  await page.getByRole("tree", { name: "Locations" }).getByRole("link", { name: "Halvorsen Relay" }).click();
  await page.locator(".app-entity__header select").filter({ hasText: "GM only" }).selectOption({ label: "Players" });
  await nav(page, "Atlas").click();
  await page.getByRole("tab", { name: "Locations" }).click();
  await page.getByTestId("preview-as-player").check();
  await expect(page.getByRole("tree", { name: "Locations" })).not.toContainText("The Lantern Bar");
  await guideShot(page, "player-view", [header, page.getByRole("tabpanel")]);
  await page.getByTestId("preview-as-player").uncheck();

  // An adventure: a job board (fixed seed)
  await nav(page, "Home").click();
  await step("alien.setup.job").getByRole("link", { name: "Deal a job board" }).click();
  await expect(page).toHaveURL(/\/generate\/alien\.job-board$/);
  await page.getByTestId("seed").fill("breakwater-board");
  const posting = page.getByTestId("offer-board").getByTestId("offer-card").first();
  await expect(posting).toContainText("Players read");
  await guideShot(page, "job-board", posting, { maxHeight: 800 });

  // take the job: it lands on Home's job board
  await posting.getByTestId("offer-accept").click();
  await expect(posting).toHaveAttribute("data-state", "accept");
  await nav(page, "Home").click();
  const jobBoard = page.getByRole("region", { name: "Job board" });
  await expect(jobBoard).toContainText("Accepted");
  await guideShot(page, "take-job", jobBoard);

  // the job's people (renamed with the guide's name)
  await jobBoard.locator(".app-board__card").first().click();
  await expect(page).toHaveURL(/\/entities\/[0-9A-Z]{26}$/);
  await page.getByTestId("entity-title").fill("The Brannock Deep run");
  await page.getByTestId("entity-title").press("Enter");
  await guideShot(page, "job-people", page.getByTestId("job-npcs"), { maxHeight: 720 });

  // its site map (fixed seed)
  await page.getByTestId("job-panel").getByTestId("job-generate-map").click();
  await expect(page).toHaveURL(/\/maps\/new\?generator=alien\.map\.site/);
  await page.getByTestId("map-seed").fill("breakwater-site");
  await page.getByTestId("map-generate").click();
  await expect(page.getByTestId("map-preview")).toBeVisible({ timeout: 30_000 });
  await guideShot(page, "site-map", page.getByTestId("map-preview"), { maxHeight: 540 });
  await page.getByTestId("map-save").click();
  await expect(page).toHaveURL(/\/maps\/[0-9A-Z]{26}$/);

  // Run this job
  await nav(page, "Home").click();
  await page.getByRole("region", { name: "Job board" }).getByRole("link", { name: /The Brannock Deep run/ }).click();
  await page.getByTestId("run-from-entity").click();
  await expect(page).toHaveURL(/\/adventures\/[0-9A-Z]{26}/);
  const outline = page.getByTestId("outline");
  await expect(page.getByTestId("adventure-title")).toHaveValue("The Brannock Deep run");
  await guideShot(page, "run-job", [main.locator("header").first(), outline], { maxHeight: 760 });

  // a scene: its location and participants
  await outline.getByTestId("outline-scene").first().click();
  const scene = page.getByTestId("scene-editor");
  await scene.getByRole("button", { name: "Pick location" }).click();
  await page.getByRole("dialog", { name: "Choose location" }).getByRole("option", { name: /Halvorsen Relay/ }).click();
  await scene.getByRole("button", { name: "Add participant" }).click();
  await page.getByRole("searchbox", { name: "Search entities" }).fill("Oskar");
  await page.getByRole("dialog", { name: "Add participant" }).getByRole("option", { name: /Oskar Brandt/ }).click();
  await expect(scene).toContainText("Oskar Brandt");
  await guideShot(page, "scene", scene.locator(".cf-card").first());

  // a handout on Act 1
  await outline.getByRole("button", { name: /^Act 1:/ }).click();
  const act = page.getByTestId("act-editor");
  await act.getByRole("button", { name: "+ Handout" }).click();
  await act.getByRole("textbox", { name: "Handout title" }).last().fill("Berth pass, Halvorsen Relay");
  await act.getByRole("textbox", { name: "Handout title" }).last().press("Enter");
  await guideShot(page, "handout", act.locator(".cf-card").filter({ hasText: "Handouts" }));

  // or a new adventure from a template
  await nav(page, "Adventures").click();
  await page.getByTestId("new-adventure").click();
  const newAdventure = page.getByRole("dialog", { name: "New adventure" });
  await guideShot(page, "new-adventure", newAdventure, { pad: 0 });
  await newAdventure.getByRole("button", { name: "Cancel" }).click();

  // A session: session 1's plan
  await nav(page, "Sessions").click();
  await page.locator('[data-session][data-status="planned"]').getByRole("link").first().click();
  await page.getByRole("textbox", { name: "New plan item" }).fill("Oskar wants his favour back");
  await page.getByRole("textbox", { name: "New plan item" }).press("Enter");
  await guideShot(page, "session-plan", main.locator(".cf-card").filter({ hasText: "Scenes planned" }));

  // start it: table mode
  await nav(page, "Home").click();
  await page.getByRole("button", { name: "Start this session" }).click();
  await expect(page.getByTestId("table-mode")).toBeVisible();
  await expect(page.getByTestId("timer")).toHaveText("00:00");
  await guideShot(page, "table", page.getByTestId("table-mode"), { maxHeight: 720 });

  // reveal the handout
  const reveal = page.getByTestId("reveal-panel");
  await reveal.getByRole("button", { name: "Reveal Berth pass, Halvorsen Relay" }).click();
  await expect(reveal.getByTestId("on-screen")).toContainText("Berth pass");
  await guideShot(page, "reveal", reveal);

  // wrap up
  await page.getByTestId("mark-run").click();
  await page.getByTestId("end-session").click();
  const wrap = page.getByTestId("wrapup");
  await wrap.getByRole("textbox", { name: "Session summary" }).fill("The crew signed for the Brannock Deep run at the Lantern Bar; Oskar Brandt asked for his favour.");
  await guideShot(page, "wrap-up", wrap, { maxHeight: 640 });
  await wrap.getByRole("button", { name: /^Next: End-of-session questions/ }).click();
  const remaining = wrap.getByRole("button", { name: "Remaining: No" });
  while ((await remaining.count()) > 0) await remaining.first().click();
  await wrap.getByRole("button", { name: /^Next: Rewards/ }).click();
  await wrap.getByRole("button", { name: /^Next: Timeline/ }).click();
  await wrap.getByRole("button", { name: /^Next: Loose ends/ }).click();
  await wrap.getByRole("textbox", { name: "Loose ends" }).fill("Who insured the cargo, and for how much?");
  await wrap.getByRole("button", { name: /^Next: Close the job/ }).click();
  await wrap.getByTestId("finish-session").click();

  // the next session, planned, with the loose end on its plan (its scenes still to add)
  await expect(page).toHaveURL(/\/sessions\/[0-9A-Z]{26}$/);
  await expect.poll(() => page.locator('[aria-label^="Plan item "]').evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value))).toContain("Who insured the cargo, and for how much?");
  await guideShot(page, "next-session", [main.locator(".cf-card").filter({ hasText: "Scenes planned" }), main.locator(".cf-card").filter({ hasText: "Loose ends carried" })]);
});

// ---------------------------------------------------------------------------
// The fifth edition guide ("Your first 5e campaign", the dnd5e-srd pack's
// guide): one shot per step, guide-dnd5e-srd-<step id>.png, taken the same
// way as the Alien guide's: one test, the steps done in order on a blank
// campaign with the guide's own example names, in-app navigation only and
// fixed seeds wherever the app rolls.
// ---------------------------------------------------------------------------

/** Pick an option of a character builder choice (its card's or row's radio or checkbox). */
async function builderPick(page: Page, path: string, id: string) {
  const option = page.getByTestId(`opt:${path}:${id}`);
  const input = option.locator("input");
  if ((await input.count()) > 0) await input.check();
  else await option.click();
  await expect(option).toHaveClass(/is-on/);
}

async function builderNext(page: Page, stepId: string) {
  await page.getByTestId("builder-next").click();
  await expect(page.locator(".cb__main")).toHaveAttribute("data-step", stepId);
}

test("guide-dnd5e-srd", async ({ page }) => {
  test.setTimeout(400_000);
  await page.setViewportSize({ width: 1280, height: 1000 });
  const main = page.locator("main");
  const header = main.locator(".app-page__header").first();
  const g = (step: string, parts: Locator | Locator[], opts: { pad?: number; maxHeight?: number } = {}) => guideShot(page, step, parts, { ...opts, module: "dnd5e-srd" });

  // Create the campaign: the New campaign dialog
  await page.goto("/");
  await page.getByRole("button", { name: "New campaign" }).click();
  const dialog = page.getByRole("dialog", { name: "New campaign" });
  await dialog.getByLabel("Name", { exact: true }).fill("The Wilby Watch");
  await dialog.getByRole("combobox", { name: "Game module" }).selectOption("dnd5e-srd");
  await dialog.getByRole("radio", { name: /^Campaign/ }).check();
  await g("new-campaign", dialog, { pad: 0 });
  await page.setViewportSize({ width: 1280, height: 900 });
  await dialog.getByRole("button", { name: "Create campaign" }).click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/);

  // Home and its checklist
  const checklist = page.getByTestId("setup-guide");
  await expect(checklist).toBeVisible();
  await g("home-checklist", [header, checklist]);

  // The party: a hill dwarf fighter from the character builder
  await checklist.locator('[data-step="setup.pcs"]').getByRole("link", { name: "Open the PCs" }).click();
  await page.getByTestId("build-character").click();
  await expect(page.getByTestId("character-builder")).toBeVisible();
  await builderPick(page, "edition", "2014");
  await builderNext(page, "species");
  await builderPick(page, "species", "dwarf");
  await builderPick(page, "species/lineage", "hill-dwarf");
  await builderPick(page, "species/tool", "smiths-tools");
  await builderNext(page, "class");
  await builderPick(page, "class", "fighter");
  await builderPick(page, "class/skills", "athletics");
  await builderPick(page, "class/skills", "perception");
  await g("build-character", main.locator(".app-page").first(), { maxHeight: 760 });
  await builderNext(page, "background");
  await builderPick(page, "background", "acolyte");
  await builderPick(page, "background/languages", "elvish");
  await builderPick(page, "background/languages", "giant");
  await builderNext(page, "abilities");
  await page.getByTestId("method:point-buy").locator("input").check();
  const raise = async (ability: string, times: number) => {
    for (let i = 0; i < times; i++) await page.getByRole("button", { name: `Increase ${ability}` }).click();
  };
  await raise("Strength", 7);
  await raise("Dexterity", 6);
  await raise("Constitution", 6);
  await raise("Wisdom", 2);
  await raise("Charisma", 2);
  await expect(page.getByTestId("points")).toContainText("0 of 27 points left");
  await builderNext(page, "level");
  await builderPick(page, "level", "1");
  await builderPick(page, "level/options.0", "fighter-fighting-style-defense");
  await builderNext(page, "equipment");
  await builderPick(page, "equipment/class.0", "fighter-0-a");
  await builderPick(page, "equipment/class.1", "fighter-1-a");
  await builderPick(page, "equipment/class.1/pick-weapons.0", "longsword");
  await builderPick(page, "equipment/class.2", "fighter-2-b");
  await builderPick(page, "equipment/class.3", "fighter-3-b");
  await builderNext(page, "details");
  await page.getByTestId("field:core.name").fill("Doran Kettleby");
  await page.getByTestId("field:alignment").selectOption("lawful-good");
  await builderNext(page, "review");
  await expect(page.getByTestId("review-ready")).toBeVisible();
  await page.getByTestId("builder-finish").click();

  // the finished sheet: its numbers computed
  await expect(page.getByTestId("entity-page")).toBeVisible();
  await expect(page.getByTestId("entity-title")).toHaveValue("Doran Kettleby");
  await expect(page.getByTestId("computed-proficiencyBonus")).toHaveText("2");
  await g("pc-sheet", [page.locator('[data-section="abilities"]'), page.locator('[data-section="combat"]')], { maxHeight: 760 });

  // a PC by hand
  await nav(page, "Atlas").click();
  await page.getByRole("tab", { name: /^PCs/ }).click();
  await header.getByRole("link", { name: "+ New" }).click();
  await page.getByTestId("entity-name").fill("Mira Fenwick");
  await g("pc-by-hand", [main.locator("h1"), page.getByTestId("create-entity")]);
  await page.getByTestId("create-entity").click();
  await expect(page).toHaveURL(/\/entities\/[0-9A-Z]{26}/);

  // the players and who plays whom
  await nav(page, "Home").click();
  await checklist.locator('[data-step="setup.players"]').getByRole("link", { name: "Add players" }).click();
  const players = page.getByTestId("players-card");
  for (const name of ["Alex", "Sam"]) {
    await players.getByTestId("player-new-name").fill(name);
    await players.getByTestId("player-add").click();
  }
  await players.getByRole("checkbox", { name: "Alex plays Doran Kettleby" }).check();
  await players.getByRole("checkbox", { name: "Sam plays Mira Fenwick" }).check();
  await g("players", players);

  // Places: a settlement and its tavern from the generator (a fixed seed)
  await nav(page, "Generate").click();
  await main.getByText("Settlement and tavern", { exact: true }).click();
  await page.getByTestId("seed").fill("barrow-14");
  await expect(page.getByTestId("preview-name-settlement")).toHaveValue("Wilby");
  await expect(page.getByTestId("step-result-trouble")).toContainText("Graves are found opened");
  await page.setViewportSize({ width: 1280, height: 1500 });
  await g("settlement", page.getByTestId("preview"));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByTestId("accept").click();
  await expect(page.getByTestId("entity-title")).toHaveValue("Wilby");
  // a place inside it: the chapel, within Wilby
  await nav(page, "Home").click();
  await page.getByRole("link", { name: "+ Location" }).click();
  await main.locator("label", { hasText: "Subtype" }).locator("select").selectOption({ label: "Building" });
  await page.getByTestId("entity-name").fill("Barrowfield Chapel");
  await page.getByTestId("create-entity").click();
  await expect(page).toHaveURL(/\/entities\/[0-9A-Z]{26}/);
  await page.getByRole("textbox", { name: "Summary" }).fill("The old chapel above Wilby's burial ground, kept by a sexton.");
  await page.getByRole("textbox", { name: "Summary" }).blur();
  await page.getByRole("tab", { name: "Relationships" }).click();
  await page.getByTestId("add-relationship").click();
  let link = page.getByRole("dialog", { name: "Link Barrowfield Chapel" });
  await link.getByRole("combobox", { name: "Relationship type" }).selectOption({ label: "within" });
  await link.getByRole("button", { name: "Choose…" }).click();
  await page.getByRole("searchbox", { name: "Search entities" }).fill("Wilby");
  await page.getByRole("dialog", { name: "Choose an entity" }).getByRole("option", { name: /Wilby/ }).click();
  await expect(link).toContainText("Wilby");
  await link.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("list", { name: "Relationships" })).toContainText("Wilby");
  await nav(page, "Atlas").click();
  await page.getByRole("tab", { name: "Locations" }).click();
  await expect(page.getByRole("tree", { name: "Locations" })).toContainText("Barrowfield Chapel");
  await g("place-inside", [header, page.getByRole("tabpanel")]);

  // People: an NPC from an SRD stat block
  await nav(page, "Home").click();
  await page.getByTestId("quick-npc").click();
  await page.getByRole("searchbox", { name: "Search presets" }).fill("veteran");
  await page.getByRole("radio", { name: /^Veteran/ }).first().check();
  await page.getByTestId("entity-name").fill("Captain Hollis Varrow");
  await g("npc-preset", [main.locator("h1"), main.locator("fieldset").first(), page.getByTestId("entity-name")]);
  await page.getByTestId("create-entity").click();
  await expect(page).toHaveURL(/\/entities\/[0-9A-Z]{26}/);
  await page.getByRole("textbox", { name: "Summary" }).fill("Captain of the Wilby watch; an old soldier who hates a mystery.");
  await page.getByRole("textbox", { name: "Summary" }).blur();

  // an NPC by hand, from the NPCs tab
  await nav(page, "Atlas").click();
  await page.getByRole("tab", { name: /^NPCs/ }).click();
  await header.getByRole("link", { name: "+ New" }).click();
  await main.getByRole("combobox", { name: "Type" }).selectOption({ label: "NPC" });
  await page.getByTestId("entity-name").fill("Brother Tobin Marsh");
  await expect(page.getByTestId("create-entity")).toHaveText("Create NPC");
  await page.getByTestId("create-entity").click();
  await expect(page).toHaveURL(/\/entities\/[0-9A-Z]{26}/);
  await page.getByRole("textbox", { name: "Summary" }).fill("Sexton of Barrowfield Chapel; nervous, and keeping something back.");
  await page.getByRole("textbox", { name: "Summary" }).blur();
  await page.getByRole("textbox", { name: "Occupation", exact: true }).fill("Sexton");
  await page.getByRole("combobox", { name: "Attitude toward the party", exact: true }).selectOption({ label: "Unfriendly" });
  await page.getByRole("textbox", { name: "Stat block", exact: true }).fill("Acolyte");
  await page.getByRole("textbox", { name: "What they want", exact: true }).fill("To be left alone with his graves");
  await page.getByRole("textbox", { name: "Secret", exact: true }).fill("He sold the key to the crypt for drinking money");
  await page.getByRole("textbox", { name: "Secret", exact: true }).blur();
  await g("npc-by-hand", [page.locator(".app-entity__header"), page.locator('[data-section="who"]')]);

  // Connect them: a relationship
  await page.getByRole("tab", { name: "Relationships" }).click();
  await page.getByTestId("add-relationship").click();
  link = page.getByRole("dialog", { name: "Link Brother Tobin Marsh" });
  await link.getByRole("combobox", { name: "Relationship type" }).selectOption({ label: "knows" });
  await link.getByRole("button", { name: "Choose…" }).click();
  await page.getByRole("searchbox", { name: "Search entities" }).fill("Varrow");
  await page.getByRole("dialog", { name: "Choose an entity" }).getByRole("option", { name: /Captain Hollis Varrow/ }).click();
  await link.getByRole("textbox", { name: "Note" }).fill("Asked him to keep the watch away from the graveyard");
  await g("relationship", link, { pad: 0 });
  await link.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("list", { name: "Relationships" })).toContainText("Captain Hollis Varrow");

  // an @ link in a note
  await page.getByRole("tab", { name: /^Notes/ }).click();
  await page.getByTestId("add-entity-note").click();
  const editor = page.locator(".cf-editor__content").first();
  await editor.click();
  await page.keyboard.type("Sleeps in the vestry at @Barrowfield");
  const mention = page.getByTestId("mention-popup");
  await expect(mention.getByRole("option", { name: /Barrowfield Chapel/ })).toBeVisible();
  await g("mention", [page.getByRole("tabpanel"), mention]);
  await mention.getByRole("option", { name: /Barrowfield Chapel/ }).click();
  await expect(editor.locator(".cf-entity-ref")).toHaveText(/Barrowfield Chapel/);
  await editor.press("End");
  await page.keyboard.type(" and has a new spade nobody paid for.");
  await page.waitForTimeout(500);

  // backlinks on the chapel
  await nav(page, "Atlas").click();
  await page.getByRole("tab", { name: "Locations" }).click();
  await page.getByRole("tree", { name: "Locations" }).getByRole("link", { name: "Barrowfield Chapel" }).click();
  await page.getByRole("tab", { name: "Backlinks" }).click();
  await expect(page.getByTestId("backlinks")).toContainText("via mention");
  await g("backlinks", [page.locator(".app-entity__header"), page.getByTestId("backlinks")]);

  // the graph
  await nav(page, "Atlas").click();
  await page.getByRole("tab", { name: "Graph" }).click();
  await g("graph", [header, page.getByRole("tabpanel")]);

  // who sees what: the town for the players, the Atlas previewed as a player
  await page.getByRole("tab", { name: "Locations" }).click();
  await page.getByRole("tree", { name: "Locations" }).getByRole("link", { name: "Wilby" }).click();
  await page.locator(".app-entity__header select").filter({ hasText: "GM only" }).selectOption({ label: "Players" });
  await nav(page, "Atlas").click();
  await page.getByRole("tab", { name: "Locations" }).click();
  await page.getByTestId("preview-as-player").check();
  await expect(page.getByRole("tree", { name: "Locations" })).not.toContainText("Barrowfield Chapel");
  await g("player-view", [header, page.getByRole("tabpanel")]);
  await page.getByTestId("preview-as-player").uncheck();

  // An adventure: the rumour on the quest board, made a quest the party takes
  await nav(page, "Home").click();
  const board = page.getByRole("region", { name: "Quest board" });
  await board.getByRole("link", { name: /Graves are found opened/ }).click();
  await expect(page).toHaveURL(/\/entities\/[0-9A-Z]{26}$/);
  await page.getByRole("textbox", { name: "Patron", exact: true }).fill("Captain Hollis Varrow");
  await page.getByRole("textbox", { name: "Objective", exact: true }).fill("Find out who is opening the graves of Barrowfield, and stop it.");
  await page.getByRole("textbox", { name: "Reward", exact: true }).fill("50 gp from the town purse");
  await page.getByRole("combobox", { name: "Status", exact: true }).selectOption({ label: "Active" });
  await page.getByRole("textbox", { name: "Reward", exact: true }).blur();
  await nav(page, "Home").click();
  await expect(board).toContainText("Active");
  await g("quest-board", board);

  // a random encounter on the road (a fixed seed): three bandits
  await nav(page, "Generate").click();
  await main.getByText("Random encounter", { exact: true }).click();
  await page.getByRole("spinbutton", { name: "Party level" }).fill("1");
  await page.getByRole("combobox", { name: "Terrain" }).selectOption({ label: "Grassland" });
  await page.getByTestId("seed").fill("wilby-road-6");
  await expect(page.getByTestId("preview")).toContainText("3 × Bandit");
  await g("encounter", [main.locator(".app-page__header").first(), page.getByTestId("preview")], { maxHeight: 760 });
  await page.getByTestId("accept").click();
  await expect(page.getByTestId("entity-title")).toHaveValue("3 × Bandit");

  // an adventure from a template
  await nav(page, "Adventures").click();
  await page.getByTestId("new-adventure").click();
  const newAdventure = page.getByRole("dialog", { name: "New adventure" });
  await newAdventure.getByRole("textbox", { name: "Title" }).fill("The Opened Graves");
  await newAdventure.getByRole("radio", { name: /^Into the lair/ }).check();
  await g("new-adventure", newAdventure, { pad: 0 });
  await newAdventure.getByRole("button", { name: "Create adventure" }).click();
  await expect(page).toHaveURL(/\/adventures\/[0-9A-Z]{26}/);
  const outline = page.getByTestId("outline");
  await g("adventure", [main.locator("header").first(), outline], { maxHeight: 760 });

  // a dungeon for the lair (a fixed seed)
  await nav(page, "Generate").click();
  await page.getByTestId("map-generator-dnd5e-srd.map.dungeon").click();
  await expect(page).toHaveURL(/\/maps\/new\?generator=dnd5e-srd\.map\.dungeon$/);
  await page.getByRole("combobox", { name: "Size" }).selectOption("small");
  await page.getByRole("spinbutton", { name: "Party level" }).fill("1");
  await page.getByRole("spinbutton", { name: "Party size" }).fill("2");
  await page.getByRole("combobox", { name: "Theme" }).selectOption("undead");
  await page.getByTestId("map-seed").fill("barrowfield-crypt");
  await page.getByTestId("map-generate").click();
  await expect(page.getByTestId("map-preview")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("map-name").fill("The Barrowfield Crypt");
  await g("dungeon", page.getByTestId("map-preview"), { maxHeight: 440 });
  await page.getByTestId("map-save").click();
  await expect(page).toHaveURL(/\/maps\/[0-9A-Z]{26}$/);

  // the scenes: where they happen and who is in them
  await nav(page, "Adventures").click();
  await page.getByTestId("adventure-card").filter({ hasText: "The Opened Graves" }).click();
  await outline.getByTestId("outline-scene").first().click();
  const scene = page.getByTestId("scene-editor");
  await scene.getByRole("button", { name: "Pick location" }).click();
  await page.getByRole("dialog", { name: "Choose location" }).getByRole("option", { name: /The Lucky Lantern/ }).click();
  for (const who of ["Quilla Greyhame", "Brother Tobin Marsh"]) {
    await scene.getByRole("button", { name: "Add participant" }).click();
    await page.getByRole("searchbox", { name: "Search entities" }).fill(who.split(" ")[0]!);
    await page.getByRole("dialog", { name: "Add participant" }).getByRole("option", { name: new RegExp(who) }).click();
  }
  await expect(scene).toContainText("Brother Tobin Marsh");
  await g("scene", scene.locator(".cf-card").first());
  // the road: the bandits' encounter and the bandits themselves
  await outline.getByTestId("outline-scene").nth(1).click();
  await scene.getByRole("button", { name: "Pick encounter" }).click();
  await page.getByRole("dialog", { name: "Choose encounter" }).getByRole("option", { name: /Bandit/ }).click();
  for (const n of [1, 2, 3]) {
    await scene.getByRole("button", { name: "Add participant" }).click();
    await page.getByRole("searchbox", { name: "Search entities" }).fill(`Bandit ${n}`);
    await page.getByRole("dialog", { name: "Add participant" }).getByRole("option", { name: new RegExp(`^.*Bandit ${n}`) }).first().click();
  }
  await expect(scene).toContainText("Bandit 3");
  // the lair's entrance: the crypt and its map
  await outline.getByTestId("outline-scene").nth(2).click();
  await scene.getByRole("button", { name: "Pick location" }).click();
  await page.getByRole("dialog", { name: "Choose location" }).getByRole("option", { name: /The Barrowfield Crypt/ }).first().click();
  await scene.getByRole("combobox", { name: "Scene map" }).selectOption({ label: "The Barrowfield Crypt" });

  // a handout on Act 1
  await outline.getByRole("button", { name: /^Act 1:/ }).click();
  const act = page.getByTestId("act-editor");
  await act.getByRole("button", { name: "+ Handout" }).click();
  await act.getByRole("textbox", { name: "Handout title" }).last().fill("A page torn from the burial register");
  await act.getByRole("textbox", { name: "Handout title" }).last().press("Enter");
  await g("handout", act.locator(".cf-card").filter({ hasText: "Handouts" }));

  // A session: plan session 1 with the adventure's first scenes
  await nav(page, "Home").click();
  await checklist.locator('[data-step="setup.session"]').getByRole("link", { name: "Plan a session" }).click();
  await main.getByRole("button", { name: "Plan a session" }).click();
  await expect(page).toHaveURL(/\/sessions\/[0-9A-Z]{26}$/);
  const planned = main.locator(".cf-card").filter({ hasText: "Scenes planned" });
  await planned.getByText("Add scenes", { exact: true }).click();
  for (const title of ["Witnesses disagree about what they saw", "The road there", "Entrance"]) await planned.getByRole("button", { name: `Plan ${title}` }).click();
  await planned.getByText("Add scenes", { exact: true }).click();
  await page.getByRole("textbox", { name: "New plan item" }).fill("Tobin lies about the crypt key");
  await page.getByRole("textbox", { name: "New plan item" }).press("Enter");
  await g("session-plan", planned);

  // start it: table mode
  await nav(page, "Home").click();
  await page.getByRole("button", { name: "Start this session" }).click();
  await expect(page.getByTestId("table-mode")).toBeVisible();
  await expect(page.getByTestId("timer")).toHaveText("00:00");
  await g("table", page.getByTestId("table-mode"), { maxHeight: 720 });

  // the road: initiative for everyone in the scene
  await page.getByTestId("mark-run").click();
  await page.getByRole("button", { name: "Next scene" }).click();
  await expect(page.getByRole("heading", { name: /^The road there/ })).toBeVisible();
  const combat = page.getByTestId("d20-combat");
  await combat.getByTestId("roll-initiative-all").click();
  await expect(combat.getByTestId("combat-round")).toHaveText("Round 1");
  await g("combat", combat, { maxHeight: 760 });

  // reveal the handout
  const reveal = page.getByTestId("reveal-panel");
  await reveal.getByRole("button", { name: "Reveal A page torn from the burial register" }).click();
  await expect(reveal.getByTestId("on-screen")).toContainText("burial register");
  await g("reveal", reveal);

  // wrap up
  await page.getByTestId("mark-run").click();
  await page.getByTestId("end-session").click();
  const wrap = page.getByTestId("wrapup");
  await wrap.getByRole("textbox", { name: "Session summary" }).fill("Quilla and Brother Tobin told two different stories at the Lucky Lantern; the party beat off three bandits on the Barrowfield road.");
  await g("wrap-up", wrap, { maxHeight: 640 });
  await wrap.getByRole("button", { name: /^Next: Rewards/ }).click();
  await wrap.getByRole("button", { name: /^Next: Timeline/ }).click();
  await wrap.getByRole("button", { name: /^Next: Loose ends/ }).click();
  await wrap.getByRole("textbox", { name: "Loose ends" }).fill("Who bought the crypt key from Tobin?");
  await wrap.getByTestId("finish-session").click();

  // the next session, planned, with the loose end on its plan
  await expect(page).toHaveURL(/\/sessions\/[0-9A-Z]{26}$/);
  await expect.poll(() => page.locator('[aria-label^="Plan item "]').evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value))).toContain("Who bought the crypt key from Tobin?");
  await g("next-session", [main.locator(".cf-card").filter({ hasText: "Scenes planned" }), main.locator(".cf-card").filter({ hasText: "Loose ends carried" })]);
});

test("in-app-guide", async ({ page }) => {
  // the Guide page of a new Alien campaign, opened from Home (its images are the guide-alien shots built into the app)
  await page.setViewportSize({ width: 1440, height: 1000 });
  await newAlienCampaign(page, "Breakwater Freight");
  await page.getByTestId("home-guide").click();
  await expect(page).toHaveURL(/\/guide$/);
  // the Make the crew chapter: a step's text, its Take me there buttons for this campaign and its screenshot
  await page.getByRole("navigation", { name: "Chapters" }).getByRole("link", { name: "Make the crew" }).click();
  const lifePath = page.getByRole("article", { name: /Roll a character with the Life Path/ });
  await expect(lifePath.getByRole("link", { name: "Roll a Life Path" })).toBeVisible();
  await lifePath.getByRole("img").evaluate((img: HTMLImageElement) => img.decode());
  await shot(page, "in-app-guide");
});
