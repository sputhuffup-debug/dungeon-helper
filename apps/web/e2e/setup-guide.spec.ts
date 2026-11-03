/**
 * "Set up your campaign": a blank Alien campaign (campaign mode) made in the
 * New campaign dialog with a frame, then walked from Home's setup guide:
 * a PC by Life Path and one by hand, two players, "+ New ship…" on the Ship
 * page, a home base, campaign agendas, threads, a job board (which starts
 * from the frame) and "Run this job". Each step ticks itself; the guide
 * hides once everything is done, and Settings can show it again.
 */
import { expect, test, type Page } from "@playwright/test";

const guide = (page: Page) => page.getByTestId("setup-guide");
const step = (page: Page, id: string) => guide(page).locator(`[data-step="${id}"]`);

async function home(page: Page, base: string) {
  await page.goto(`${base}/home`);
  await expect(page.getByTestId("campaign-name")).toBeVisible();
}

async function expectDone(page: Page, id: string, done: number) {
  await expect(step(page, id)).toHaveAttribute("data-done", "true");
  await expect(page.getByTestId("setup-progress")).toHaveText(`${done} of 8 done`);
}

test("setup guide: a new campaign is walked from blank to its first session, each step ticking itself", async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });

  // 1. the New campaign dialog asks the frame once (campaign mode only)
  await page.goto("/");
  await page.getByRole("button", { name: "New campaign" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("Outer Rim Haulers");
  const frame = dialog.getByRole("group", { name: "Campaign frame" });
  await expect(frame.getByRole("radio", { name: /^Space Truckers/ })).toBeChecked();
  await dialog.getByRole("radio", { name: /^Cinematic/ }).check();
  await expect(frame).toBeHidden();
  await dialog.getByRole("radio", { name: /^Campaign/ }).check();
  await frame.getByRole("radio", { name: /^Colonial Marines/ }).check();
  await dialog.getByRole("button", { name: "Create campaign" }).click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/);
  const base = page.url().replace(/\/home$/, "");

  // 2. Home leads with the guide; the session button steps back meanwhile
  await expect(guide(page)).toBeVisible();
  await expect(page.getByTestId("setup-progress")).toHaveText("0 of 8 done");
  await expect(guide(page).getByRole("listitem")).toHaveCount(8);
  await expect(step(page, "alien.setup.crew")).toHaveAttribute("aria-current", "step");
  await expect(page.getByTestId("start-session")).not.toHaveClass(/cf-btn--primary/);

  // 3. the crew: one PC by Life Path, one by hand
  await step(page, "alien.setup.crew").getByRole("link", { name: "Roll a Life Path" }).click();
  await expect(page).toHaveURL(/\/generate\/alien\.lifepath$/);
  await page.getByTestId("accept").click();
  await expect(page.getByTestId("accepted-note")).toBeVisible();
  await home(page, base);
  await expect(step(page, "alien.setup.crew")).toContainText("1 of 4");
  await step(page, "alien.setup.crew").getByRole("link", { name: "+ Character" }).click();
  await expect(page).toHaveURL(/\/entities\/new\?/);
  await page.getByTestId("entity-name").fill("Dana Okoye");
  await page.getByTestId("create-entity").click();
  await expect(page).toHaveURL(/\/entities\/[0-9A-Z]{26}/);
  await home(page, base);
  await expect(step(page, "alien.setup.crew")).toContainText("2 of 4");
  await expect(step(page, "alien.setup.crew")).toHaveAttribute("data-done", "false");

  // 4. players and who plays whom: two players make the crew of two complete
  await step(page, "setup.players").getByRole("link", { name: "Add players" }).click();
  await expect(page).toHaveURL(/\/settings\?section=players$/);
  const players = page.getByTestId("players-card");
  for (const name of ["Sam", "Priya"]) {
    await players.getByTestId("player-new-name").fill(name);
    await players.getByTestId("player-add").click();
  }
  await players.getByRole("checkbox", { name: "Priya plays Dana Okoye" }).check();
  // Sam plays the Life Path character, whatever its name
  await players.getByRole("checkbox", { name: /^Sam plays (?!Dana Okoye)/ }).check();
  await home(page, base);
  await expectDone(page, "alien.setup.crew", 2);
  await expectDone(page, "setup.players", 2);
  await expect(step(page, "alien.setup.ship")).toHaveAttribute("aria-current", "step");

  // 5. the ship: "+ New spaceship…" in the crew's-ship picker makes one from a preset and chooses it
  await step(page, "alien.setup.ship").getByRole("link", { name: "Open the Ship page" }).click();
  await expect(page.getByTestId("ship-page")).toBeVisible();
  await page.getByTestId("ship-picker").selectOption({ label: "+ New spaceship…" });
  const create = page.getByRole("dialog", { name: "New spaceship" });
  await expect(create).toBeVisible();
  const preset = create.getByTestId("quick-create-preset");
  const firstPreset = await preset.locator("option").nth(1).getAttribute("value");
  await preset.selectOption(firstPreset!);
  await create.getByTestId("quick-create-name").fill("Montero");
  await create.getByTestId("quick-create-submit").click();
  await expect(page.getByTestId("ship-card").getByRole("link", { name: "Montero" })).toBeVisible();
  await expect(page.getByTestId("ship-picker").first()).toHaveValue(/^[0-9A-Z]{26}$/);
  await home(page, base);
  await expectDone(page, "alien.setup.ship", 3);

  // 6. a home base, made from a location preset in Settings
  await step(page, "alien.setup.home-base").getByRole("link", { name: "Choose it" }).click();
  await expect(page).toHaveURL(/\/settings\?section=campaign$/);
  await page.getByRole("combobox", { name: "Home base" }).selectOption({ label: "+ New location…" });
  const base2 = page.getByRole("dialog", { name: "New home base" });
  await base2.getByTestId("quick-create-name").fill("Anchorpoint Station");
  await base2.getByTestId("quick-create-submit").click();
  await expect(page.getByRole("combobox", { name: "Home base" })).toHaveValue(/^[0-9A-Z]{26}$/);
  await home(page, base);
  await expectDone(page, "alien.setup.home-base", 4);

  // 7. campaign agendas for the crew
  await step(page, "alien.setup.agendas").getByRole("link", { name: "Deal agendas" }).click();
  await expect(page).toHaveURL(/\/generate\/alien\.campaign-agendas$/);
  await expect(page.getByTestId("long-agenda-drafts").getByTestId("long-agenda-character")).toHaveCount(2);
  await page.getByTestId("long-agenda-accept").click();
  await expect(page.getByTestId("long-agenda-accepted")).toContainText("Wrote 2 long-term agendas");
  await home(page, base);
  await expectDone(page, "alien.setup.agendas", 5);

  // 8. a campaign thread on the arc board
  await step(page, "alien.setup.threads").getByRole("link", { name: "Deal threads" }).click();
  await expect(page).toHaveURL(/\/generate\/alien\.campaign-thread$/);
  const thread = page.getByTestId("offer-board").getByTestId("offer-card").first();
  await thread.getByTestId("offer-accept").click();
  await expect(thread.getByTestId("offer-accepted")).toBeVisible();
  await home(page, base);
  await expectDone(page, "alien.setup.threads", 6);

  // 9. a job board: it starts from the campaign's frame; take a posting
  await step(page, "alien.setup.job").getByRole("link", { name: "Deal a job board" }).click();
  await expect(page).toHaveURL(/\/generate\/alien\.job-board$/);
  await expect(page.getByRole("combobox", { name: "Frame" })).toHaveValue("colonial-marines");
  const posting = page.getByTestId("offer-board").getByTestId("offer-card").first();
  await posting.getByTestId("offer-accept").click();
  await expect(posting).toHaveAttribute("data-state", "accept");
  await home(page, base);
  await expectDone(page, "alien.setup.job", 7);

  // 10. Run this job: the adventure and session 1; the guide is done and hides itself
  await step(page, "alien.setup.run-job").getByRole("link", { name: "Open the job" }).click();
  await expect(page).toHaveURL(/\/entities\/[0-9A-Z]{26}$/);
  await page.getByTestId("run-from-entity").click();
  await expect(page).toHaveURL(/\/adventures\/[0-9A-Z]{26}/);
  await home(page, base);
  await expect(page.getByRole("heading", { name: "Next session" })).toBeVisible();
  await expect(guide(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start this session" })).toHaveClass(/cf-btn--primary/);

  // 11. Settings: every step done; nothing to show
  await page.goto(`${base}/settings?section=setup`);
  await expect(page.getByTestId("setup-guide-status")).toContainText("All 8 steps done.");
  await expect(page.getByTestId("setup-show")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("setup guide: 'Hide this' hides it, Settings shows it again; demos never show it", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "New campaign" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("Hidden guide");
  await dialog.getByRole("radio", { name: /^Cinematic/ }).check();
  await dialog.getByRole("button", { name: "Create campaign" }).click();
  await expect(page).toHaveURL(/\/home$/);
  const base = page.url().replace(/\/home$/, "");

  // cinematic play gets the shorter list
  await expect(guide(page).getByRole("listitem")).toHaveCount(5);
  await expect(page.getByTestId("setup-progress")).toHaveText("0 of 5 done");
  await page.getByTestId("setup-hide").click();
  await expect(guide(page)).toHaveCount(0);
  await expect(page.getByTestId("start-session")).toHaveClass(/cf-btn--primary/);

  await page.goto(`${base}/settings?section=setup`);
  await expect(page.getByTestId("setup-guide-status")).toHaveText("0 of 5 steps done.");
  await page.getByTestId("setup-show").click();
  await expect(page.getByTestId("setup-guide-status")).toContainText("Shown on Home.");
  await home(page, base);
  await expect(guide(page)).toBeVisible();

  // a demo is set up already: no guide
  await page.goto("/");
  await page.getByTestId("load-demo").click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Next session" })).toBeVisible();
  await expect(guide(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});
