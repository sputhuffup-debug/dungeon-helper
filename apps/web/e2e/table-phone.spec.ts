/**
 * Table mode on a phone (390×844): a bottom tab bar with full-height panels
 * (Scene, Map, Crew, Dice, Log), the map one tap away and framed on what the
 * crew has seen, one round counter across the header clock, the hunt and
 * the initiative tracker, and a job clue marked found from the table.
 */
import { expect, test, type Page } from "@playwright/test";

const tab = (page: Page, id: string) => page.getByTestId(`table-tab-${id}`);
const panel = (page: Page, id: string) => page.getByTestId(`table-panel-${id}`);

test("a session at 390×844: tab bar to the map, the crew and the dice; one round; a job clue found at the table", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByTestId("load-demo").click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 30_000 });
  await page.goto(page.url().replace(/\/home$/, "/sessions"));
  await page.getByRole("button", { name: "Start session 2" }).click();
  const table = page.getByTestId("table-mode");
  await expect(table).toHaveAttribute("data-layout", "panels");

  // the tab bar sits at the bottom of the screen, every tab in reach
  const bar = page.getByRole("navigation", { name: "Table panels" });
  await expect(bar).toBeVisible();
  const barBox = (await bar.boundingBox())!;
  expect(barBox.y + barBox.height).toBeGreaterThan(844 - 2);
  for (const id of ["scene", "map", "crew", "dice", "log"]) {
    const box = (await tab(page, id).boundingBox())!;
    expect(box.x + box.width, id).toBeLessThanOrEqual(390 + 1);
    expect(box.height, id).toBeGreaterThanOrEqual(44);
  }
  // no sideways scrolling
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  // every clock control on screen, none in a sideways-scrolling row, none too small to tap
  const headerClock = page.getByTestId("table-clock");
  for (const name of ["Back one Round", "Advance one Round", "Back one Stretch", "Advance one Stretch", "Back one Shift", "Advance one Shift", "Reset the clock"]) {
    const box = (await headerClock.getByRole("button", { name }).boundingBox())!;
    expect(box.x, name).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, name).toBeLessThanOrEqual(390);
    expect(box.height, name).toBeGreaterThanOrEqual(40);
  }
  expect(await headerClock.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
  // a reset is one tap, and its toast takes it back
  await headerClock.getByRole("button", { name: "Advance one Stretch" }).click();
  await headerClock.getByRole("button", { name: "Reset the clock" }).click();
  await expect(headerClock.getByTestId("clock-stretch")).toHaveText("0");
  await page.getByTestId("toast").filter({ hasText: "Clock reset" }).getByRole("button", { name: "Undo" }).click();
  await expect(headerClock.getByTestId("clock-stretch")).toHaveText("1");
  await headerClock.getByRole("button", { name: "Back one Stretch" }).click();
  await expect(headerClock.getByTestId("clock-stretch")).toHaveText("0");

  // Scene: pick the job's site, "The ore run"
  await expect(panel(page, "scene")).toBeVisible();
  const scenes = panel(page, "scene").getByRole("combobox", { name: "Scene" });
  await scenes.selectOption((await scenes.locator("option", { hasText: "The ore run" }).getAttribute("value"))!);

  // Map: one tap, the deck plan on screen, framed on the revealed and occupied zones
  await tab(page, "map").click();
  await expect(tab(page, "map")).toHaveAttribute("aria-selected", "true");
  await expect(panel(page, "scene")).toBeHidden();
  const live = panel(page, "map").getByTestId("live-map");
  await expect(live).toBeVisible();
  const viewport = live.locator(".cf-map__viewport");
  const vp = (await viewport.boundingBox())!;
  // a big map on screen without scrolling: at least 300 px of it above the tab bar (font metrics move its top a little)
  const barTop = (await bar.boundingBox())!.y;
  expect(barTop - vp.y).toBeGreaterThanOrEqual(300);
  expect(vp.height).toBeGreaterThan(280);
  await expect(live.getByTestId("map-focus")).toBeVisible();
  // zones big enough to tap: the framed zoom is well above the whole-deck fit
  const zoom = Number((await live.locator(".cf-map__toolbar .cf-mono").innerText()).replace("%", ""));
  await live.getByRole("button", { name: "Fit", exact: true }).click();
  const whole = Number((await live.locator(".cf-map__toolbar .cf-mono").innerText()).replace("%", ""));
  expect(zoom).toBeGreaterThan(whole);

  // one round: the hunt's "Next round" moves the header clock
  const clockRound = page.getByTestId("table-clock").getByTestId("clock-round");
  await expect(clockRound).toHaveText("0");
  await live.getByTestId("hunt-next-round").click();
  await expect(clockRound).toHaveText("1");
  await expect(live.getByTestId("hunt-step")).toHaveText("· Round 1");
  await expect(live.getByTestId("hunt-prompt")).toContainText("Round 1 begins");

  // Crew (Alien's word for the group): the compact rows and the trackers; the initiative tracker's "Next round" moves the same clock
  await expect(tab(page, "crew")).toContainText("Crew");
  await tab(page, "crew").click();
  const crew = panel(page, "crew");
  await expect(crew.getByRole("list", { name: "Player characters" })).toBeVisible();
  await expect(crew.getByTestId("participant-health").first()).toBeVisible();
  await expect(crew.getByRole("region", { name: "Stress & panic" })).toBeVisible();
  const initiative = crew.getByRole("region", { name: "Initiative" });
  await expect(initiative.getByTestId("initiative-round")).toHaveText("Round 1");
  await initiative.getByRole("button", { name: "Next round" }).click();
  await expect(clockRound).toHaveText("2");
  await expect(initiative.getByTestId("initiative-round")).toHaveText("Round 2");
  await tab(page, "map").click();
  await expect(live.getByTestId("hunt-step")).toHaveText("· Round 2");

  // Dice: the dice panel, one tap away
  await tab(page, "dice").click();
  await expect(panel(page, "dice").getByTestId("dice-tab")).toBeVisible();
  await expect(panel(page, "dice").getByTestId("free-roll")).toBeVisible();

  // Scene: "This job", its clue marked found from the table
  await tab(page, "scene").click();
  const job = panel(page, "scene").getByTestId("this-job");
  await expect(job).toBeVisible();
  const clue = job.locator('[data-testid="this-job-clue"][data-state="seeded"]').first();
  const clueId = (await clue.getAttribute("data-clue"))!;
  await clue.getByTestId("this-job-found").click();
  await expect(job.locator(`[data-testid="this-job-clue"][data-clue="${clueId}"]`)).toHaveAttribute("data-state", "found");

  // Log: the events, the sweep and round lines among them
  await tab(page, "log").click();
  await expect(panel(page, "log").getByRole("list", { name: "Session events" })).toContainText("Round advanced");

  // the rarely used actions sit in the header's menu
  await page.getByTestId("table-menu").locator("summary").click();
  await expect(page.getByTestId("end-session")).toBeVisible();
  expect(errors).toEqual([]);
});
