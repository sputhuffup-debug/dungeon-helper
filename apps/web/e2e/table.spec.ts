import { expect, test } from "@playwright/test";

test("run a session at the table: demo campaign, clock, panic roll, reveal, wrap-up, next session planned", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // 1. load the demo campaign from the campaign list
  await page.goto("/");
  await page.getByTestId("load-demo").click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 30_000 });
  await expect(page.getByTestId("campaign-name")).toHaveText("Skyfire Down");

  // 2. start the planned session from the sessions page
  await page.getByRole("link", { name: "Sessions" }).click();
  await expect(page.getByTestId("sessions-page")).toBeVisible();
  await page.getByRole("button", { name: "Start session 1" }).click();
  await expect(page).toHaveURL(/\/table\/[0-9A-Z]{26}$/);
  const table = page.getByTestId("table-mode");
  await expect(table).toBeVisible();
  await expect(page.getByTestId("table-session")).toContainText("Session 1");
  await expect(page.getByTestId("scene-title")).not.toBeEmpty();

  // 3. advance the clock one round
  const clock = page.getByTestId("table-clock");
  await expect(clock.getByTestId("clock-round")).toHaveText("0");
  await clock.getByRole("button", { name: "Advance one Round" }).click();
  await expect(clock.getByTestId("clock-round")).toHaveText("1");

  // 4. a panic roll for a PC from the stress tracker shows the result with a label
  const stress = page.locator('[data-tracker="alien.stress"]');
  await stress.getByRole("button", { name: "Panic roll" }).first().click();
  const result = page.getByTestId("roll-result");
  await expect(result).toBeVisible();
  await expect(page.getByTestId("roll-result-label")).not.toBeEmpty();
  await page.getByRole("dialog").getByRole("button", { name: "Done" }).click();
  await expect(result).toBeHidden();
  // the panic result is in the stress tracker's log
  await expect(stress.getByRole("list", { name: "Tracker log" })).toBeVisible();

  // a one-tap critical injury roll from a character card (androids use the system damage table, p. 78)
  await page.getByRole("button", { name: /^Critical injury for / }).first().click();
  await expect(page.getByTestId("roll-result")).toBeVisible();
  await expect(page.getByTestId("roll-result-label")).not.toBeEmpty();
  await page.getByRole("dialog").getByRole("button", { name: "Done" }).click();
  await expect(page.getByTestId("roll-result")).toBeHidden();

  // 5. reveal a handout
  const reveal = page.getByTestId("reveal-panel");
  const first = reveal.getByRole("button", { name: /^Reveal / }).first();
  const label = (await first.getAttribute("aria-label")) ?? "";
  await first.click();
  await expect(reveal.getByRole("button", { name: label })).toBeDisabled();
  await expect(reveal.getByRole("button", { name: label })).toHaveText("Revealed");

  // the running log takes a timestamped line
  await page.getByRole("tab", { name: "Log" }).click();
  await page.getByRole("textbox", { name: "Log line" }).fill("The crew takes the job.");
  await page.getByRole("button", { name: "Add timestamped line" }).click();
  await expect(page.getByRole("textbox", { name: "Session log" })).toContainText("The crew takes the job.");
  await page.waitForTimeout(300);

  // 6. end the session through the wrap-up
  await page.getByTestId("end-session").click();
  const wrap = page.getByTestId("wrapup");
  await expect(wrap).toBeVisible();
  await expect(wrap.getByRole("textbox", { name: "Session summary" })).toHaveValue(/The crew takes the job\./);
  await wrap.getByRole("button", { name: /^Next: End-of-session questions/ }).click();
  // campaign mode: nine XP questions per PC; answer one yes, the rest no
  await wrap.getByRole("button", { name: "Yes" }).first().click();
  await expect(wrap.getByTestId("prompt-answer").first()).toHaveText("Yes");
  const remaining = wrap.getByRole("button", { name: "Remaining: No" });
  while ((await remaining.count()) > 0) await remaining.first().click();
  await wrap.getByRole("button", { name: /^Next: Rewards/ }).click();
  await wrap.getByRole("button", { name: /^Next: Timeline/ }).click();
  await expect(wrap.getByRole("textbox", { name: "Timeline text" }).first()).toHaveValue(/The crew learns/);
  await wrap.getByRole("button", { name: /^Next: Loose ends/ }).click();
  await wrap.getByRole("textbox", { name: "Loose ends" }).fill("Who wants the crate?");
  await wrap.getByTestId("finish-session").click();

  // 7. back on the campaign home; the session is done and the next one is planned
  await expect(page).toHaveURL(/\/home$/);
  await page.getByRole("link", { name: "Sessions" }).click();
  await expect(page.locator('[data-session][data-status="done"]')).toHaveCount(1);
  const planned = page.locator('[data-session][data-status="planned"]');
  await expect(planned).toHaveCount(1);
  await expect(planned).toContainText("Session 2");
  await planned.getByRole("link").click();
  await expect(page.getByTestId("session-page")).toHaveAttribute("data-status", "planned");
  await expect(page.getByRole("textbox", { name: "Plan item 1" })).toHaveValue("Who wants the crate?");

  // the finished session shows its summary and timeline
  await page.getByRole("link", { name: "← Sessions" }).click();
  await page.locator('[data-session][data-status="done"]').getByRole("link").click();
  await expect(page.getByTestId("session-status")).toHaveText("done");
  await expect(page.getByTestId("session-summary")).toContainText("The crew takes the job.");
  await expect(page.getByTestId("session-timeline")).toContainText("The crew learns");

  expect(errors).toEqual([]);
});

test("table mode keeps working offline and the player screen shows revealed handouts", async ({ page, context }) => {
  await page.goto("/");
  await page.getByTestId("load-demo").click();
  await expect(page).toHaveURL(/\/home$/, { timeout: 30_000 });
  await page.getByRole("button", { name: "Start this session" }).click();
  await expect(page.getByTestId("table-mode")).toBeVisible();

  const popupPromise = context.waitForEvent("page");
  await page.getByRole("button", { name: "Player screen" }).click();
  const players = await popupPromise;
  await expect(players.getByTestId("player-screen")).toBeVisible();
  await expect(players.getByText("Nothing revealed yet.")).toBeVisible();

  await context.setOffline(true);
  const reveal = page.getByTestId("reveal-panel");
  const firstTitle = (await reveal.locator("[data-handout] .app-reveal__title").first().textContent()) ?? "";
  await reveal.getByRole("button", { name: /^Reveal / }).first().click();
  await expect(players.locator("[data-handout]").first()).toContainText(firstTitle.trim());
  const clock = page.getByTestId("table-clock");
  await clock.getByRole("button", { name: "Advance one Stretch" }).click();
  await expect(players.getByTestId("clock-stretch")).toHaveText("1");
  await context.setOffline(false);
});

test("after the first visit, a campaign and table mode open offline from the precache", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // every JS chunk the page fetches, and whether the service worker answered it
  const chunks = new Map<string, boolean>();
  page.on("response", (r) => {
    const path = new URL(r.url()).pathname;
    if (path.startsWith("/assets/") && path.endsWith(".js")) chunks.set(path.slice("/assets/".length), r.fromServiceWorker());
  });
  const fetched = (prefix: string) => [...chunks.keys()].filter((f) => f.startsWith(prefix));

  // 1. first visit: the campaign list only; the service worker installs and precaches every chunk
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Campaign Forge" })).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  expect(fetched("alien")).toEqual([]);
  expect(fetched("module-sdk")).toEqual([]);

  // 2. offline: loading the demo pulls the seed data, the SDK and the Alien module's lazy chunks from the precache
  await context.setOffline(true);
  await page.getByTestId("load-demo").click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 30_000 });
  await expect(page.getByTestId("campaign-name")).toHaveText("Skyfire Down");
  await expect(page.getByTestId("offline-badge")).toBeVisible();
  for (const prefix of ["alien-data", "alien-tables", "alien-maps", "alien-rules", "module-sdk"]) {
    const files = fetched(prefix);
    expect(files, `${prefix} chunk fetched offline`).toHaveLength(1);
    expect(chunks.get(files[0]!), `${prefix} came from the service worker`).toBe(true);
  }

  // 3. a cold reload while offline: the navigation fallback serves the shell and the campaign reopens
  await page.reload();
  await expect(page.getByTestId("campaign-name")).toHaveText("Skyfire Down", { timeout: 30_000 });

  // 4. table mode (its page chunk and the editor chunk) still opens offline
  await page.getByRole("button", { name: "Start this session" }).click();
  await expect(page.getByTestId("table-mode")).toBeVisible();
  await expect(page.getByTestId("scene-title")).not.toBeEmpty();
  // the real editor (not the loading placeholder) has mounted
  await expect(page.locator(".cf-editor[data-doc-id]").first()).toBeAttached();
  for (const prefix of ["TableModePage", "RichTextEditor"]) {
    const files = fetched(prefix);
    expect(files, `${prefix} chunk fetched offline`).toHaveLength(1);
    expect(chunks.get(files[0]!), `${prefix} came from the service worker`).toBe(true);
  }
  await context.setOffline(false);
  expect(errors).toEqual([]);
});
