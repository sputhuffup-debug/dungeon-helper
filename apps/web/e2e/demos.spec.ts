import { mkdirSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";

/** Where screenshots go when `DEMO_SCREENSHOTS` names a directory (off by default). */
const SHOTS = process.env.DEMO_SCREENSHOTS;
async function shot(page: Page, name: string, opts: { tall?: number; element?: Locator; full?: boolean } = {}) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  const size = page.viewportSize();
  // table mode scrolls inside a full-height surface: a tall viewport shows all of it
  if (opts.tall && size) await page.setViewportSize({ width: size.width, height: opts.tall });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: opts.full ?? true });
  if (opts.element) await opts.element.screenshot({ path: `${SHOTS}/${name}-detail.png` });
  if (opts.tall && size) await page.setViewportSize(size);
}

const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "Campaign" }).getByRole("link", { name, exact: true });

test("cinematic demo: guided builder review, site map views, live map and infection at the table", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 1000 });

  // 1. load the cinematic demo from the campaign list
  await page.goto("/");
  await expect(page.getByTestId("load-demo")).toHaveText("▶ Skyfire Down demo");
  await page.getByTestId("load-demo-cinematic").click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 30_000 });
  await expect(page.getByTestId("campaign-name")).toHaveText("Cold Harbor Relay");

  // 2. the adventure opens in the guided builder; every step is green and the review has nothing to fix
  await nav(page, "Adventures").click();
  await page.getByTestId("adventure-card").filter({ hasText: "Cold Harbor" }).click();
  const guided = page.getByTestId("guided-builder");
  await expect(guided).toBeVisible();
  await expect(page.getByTestId("guided-heading")).toHaveText("Cold Harbor");
  for (const step of ["basics", "situation", "pcs", "npcs", "locations", "act1", "act2", "act3", "finale"]) {
    await expect(page.getByTestId(`step-${step}`), step).toHaveAttribute("data-status", "ok");
  }
  await page.getByTestId("step-review").click();
  const review = page.getByTestId("review-panel");
  await expect(page.getByTestId("review-summary")).toHaveText(/^Ready · 0 warnings$/);
  await expect(review.locator('[data-level="bad"]')).toHaveCount(0);
  await expect(review.locator('[data-level="warn"]')).toHaveCount(0);
  expect(await review.locator('[data-level="ok"]').count()).toBeGreaterThan(10);
  await shot(page, "cinematic-builder-review");

  // 3. the site map the builder made: GM, player and tracking views
  const card = page.getByTestId("site-map-card");
  await expect(card.getByTestId("site-map-link")).toHaveText("Cold Harbor site map");
  await expect(card.getByTestId("site-map-checks")).toBeVisible();
  await card.getByTestId("site-map-link").click();
  const mapPage = page.getByTestId("map-page");
  await expect(mapPage).toHaveAttribute("data-layout", "generated");
  await expect(mapPage.getByTestId("sitemap")).toHaveAttribute("data-view", "gm");
  await expect(page.getByRole("tab", { name: "GM map" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Player map" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Tracking map" })).toBeVisible();
  await expect(page.getByTestId("map-checks")).toContainText(/0 blocking|All checks pass/);
  await expect(page.getByTestId("roll-print")).toBeVisible();
  await shot(page, "cinematic-site-map", { full: false });
  await page.getByRole("tab", { name: "Player map" }).click();
  await expect(mapPage.getByTestId("sitemap")).toHaveAttribute("data-view", "player");
  await page.getByRole("tab", { name: "Tracking map" }).click();
  await expect(mapPage.getByTestId("sitemap")).toHaveAttribute("data-view", "tracking");

  // 4. sessions: session 0 done, session 1 planned with part of its checklist
  await nav(page, "Sessions").click();
  await expect(page.locator('[data-session][data-status="done"]')).toHaveCount(1);
  const planned = page.locator('[data-session][data-status="planned"]');
  await expect(planned).toHaveCount(1);
  await expect(planned.getByTestId("checklist-badge")).toHaveText(/^✓ [1-9]\d*\/\d+$/);

  // 5. start session 1: the live map with the tokens, the revealed zones, the lock and the ping
  await page.getByRole("button", { name: "Start session 1" }).click();
  await expect(page.getByTestId("table-mode")).toBeVisible();
  await expect(page.getByTestId("table-session")).toContainText("Session 1");
  const live = page.getByTestId("live-map");
  await expect(live).toBeVisible();
  await expect(page.getByTestId("live-act")).toHaveValue("1");
  await expect(live.locator("[data-token]")).toHaveCount(4);
  await expect(live.getByText("2 revealed", { exact: true })).toBeVisible();
  await expect(live.getByRole("button", { name: "Clear 1 ping" })).toBeVisible();
  const tokens = live.getByRole("list", { name: "Tokens" });
  for (const name of ["Rosa Ilunga", "Ana Kovac", "Teo Marsh", "Jun Akiyama"]) await expect(tokens).toContainText(name);

  // the Hints tab is there, and the life-cycle tracker shows the facehugged NPC
  await expect(page.getByRole("tab", { name: "Hints" })).toBeVisible();
  const tracker = page.locator('[data-tracker="alien.gestation"]');
  await expect(tracker.getByRole("article", { name: "Dr. Mara Lindqvist: Facehugged" })).toBeVisible();
  await shot(page, "cinematic-table-live-map", { tall: 2600, element: live });
  await page.getByRole("tab", { name: "Hints" }).click();
  await expect(page.getByTestId("hints-tab")).toBeVisible();

  expect(errors).toEqual([]);
});

test("Skyfire Down: the life-cycle tracker shows the NPC's running infection at the table", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 1000 });

  await page.goto("/");
  await page.getByTestId("load-demo").click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 30_000 });
  await expect(page.getByTestId("campaign-name")).toHaveText("Skyfire Down");
  await nav(page, "Sessions").click();
  await page.getByRole("button", { name: "Start session 1" }).click();
  await expect(page.getByTestId("table-mode")).toBeVisible();

  const tracker = page.locator('[data-tracker="alien.gestation"]');
  const card = tracker.getByRole("article", { name: /: Embryo growing$/ });
  await expect(card).toHaveCount(1);
  await expect(card).toBeVisible();
  // the host is an NPC, not one of the player characters
  const host = ((await card.getAttribute("aria-label")) ?? "").replace(/: Embryo growing$/, "");
  expect(host).not.toBe("");
  await expect(page.getByRole("list", { name: "Player characters" })).not.toContainText(host);
  await shot(page, "skyfire-table-lifecycle", { tall: 2600, element: tracker });

  expect(errors).toEqual([]);
});

test("Thornwick Crossing: the fifth edition demo loads with derived sheets, SRD monsters and a session ready for the table", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 1000 });

  await page.goto("/");
  await page.getByTestId("load-demo-5e").click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 30_000 });
  await expect(page.getByTestId("campaign-name")).toHaveText("Thornwick Crossing");
  const base = page.url().replace(/\/home$/, "");

  // a PC whose numbers are derived: Wren's Stealth is expertise on Dexterity 17 at level 3
  await page.goto(`${base}/atlas`);
  await page.getByRole("tab", { name: /^PCs/ }).click();
  await expect(page.getByRole("tabpanel").getByRole("link")).toHaveCount(4);
  await page.getByRole("tabpanel").getByRole("link", { name: "Wren Talliver", exact: true }).click();
  await expect(page.getByTestId("computed-proficiencyBonus")).toHaveText("2");
  await expect(page.getByTestId("computed-dexterityMod")).toHaveText("3");
  await expect(page.getByTestId("pool-stealth")).toHaveText("1d20 + 7");
  await expect(page.getByRole("spinbutton", { name: "Initiative bonus", exact: true })).toHaveValue("0");
  await shot(page, "dnd5e-pc");

  // the bugbear chief is an SRD preset with its stat block
  await page.goto(`${base}/atlas`);
  await page.getByRole("tab", { name: /^Creatures/ }).click();
  await page.getByRole("tabpanel").getByRole("link", { name: "Grisk Hollowjaw", exact: true }).click();
  await expect(page.getByTestId("computed-crLabel")).toHaveText("1");
  await expect(page.locator('[data-entry="Surprise Attack"]')).toBeVisible();

  // session 1 opens on the ambush, with the party and the scene's monsters on the hit point tracker
  await nav(page, "Sessions").click();
  await page.getByRole("button", { name: "Start session 1" }).click();
  await expect(page.getByTestId("table-mode")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ambush at the toll-house" })).toBeVisible();
  const hp = page.locator('[data-tracker="dnd5e-srd.tracker.hp"]');
  for (const [name, max] of [["Brannoc Ashby", "28"], ["Wren Talliver", "21"], ["Goblin 1", "7"], ["Wolf 1", "11"]] as const) {
    await expect(hp.getByRole("spinbutton", { name: `${name} HP` })).toHaveValue(max);
  }
  await shot(page, "dnd5e-table", { tall: 2000 });

  expect(errors).toEqual([]);
});
