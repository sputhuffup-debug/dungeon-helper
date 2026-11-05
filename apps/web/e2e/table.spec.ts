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
  await page.getByRole("button", { name: "Start session 2" }).click();
  await expect(page).toHaveURL(/\/table\/[0-9A-Z]{26}$/);
  const table = page.getByTestId("table-mode");
  await expect(table).toBeVisible();
  await expect(page.getByTestId("table-session")).toContainText("Session 2");
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

  // a one-tap critical injury roll from a character row, under "More" (androids use the system damage table, p. 78)
  await page.getByRole("list", { name: "Player characters" }).getByTestId("participant-more").first().click();
  await page.getByRole("button", { name: /^Critical injury for / }).first().click();
  await expect(page.getByTestId("roll-result")).toBeVisible();
  await expect(page.getByTestId("roll-result-label")).not.toBeEmpty();
  await page.getByRole("dialog").getByRole("button", { name: "Done" }).click();
  await expect(page.getByTestId("roll-result")).toBeHidden();

  // 5. reveal a handout: the demo's are each PC's agenda, so there is no one-tap reveal; showing one to everyone asks first
  const reveal = page.getByTestId("reveal-panel");
  await expect(reveal.getByRole("button", { name: /^Reveal / })).toHaveCount(0);
  const first = reveal.getByRole("button", { name: /^Show .* to everyone$/ }).first();
  const label = (await first.getAttribute("aria-label")) ?? "";
  const title = label.replace(/^Show /, "").replace(/ to everyone$/, "");
  // asked in the app's confirm dialog: Cancel keeps it private, Show everyone reveals it
  await first.click();
  await page.getByRole("dialog", { name: "Show it to everyone?" }).getByRole("button", { name: "Cancel" }).click();
  await expect(reveal.getByRole("button", { name: label })).toBeVisible();
  await first.click();
  await page.getByRole("dialog", { name: "Show it to everyone?" }).getByRole("button", { name: "Show everyone" }).click();
  // revealed: the row now offers to hide it again
  const hide = reveal.getByRole("button", { name: `Hide ${title} from the players` });
  await expect(hide).toHaveText("Hide again");
  await expect(reveal.getByRole("button", { name: label })).toHaveCount(0);

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
  // campaign mode: the questions step holds the trauma checks (none without a panic of 9+)
  const remaining = wrap.getByRole("button", { name: "Remaining: No" });
  while ((await remaining.count()) > 0) await remaining.first().click();
  // XP comes from the award checklist, in the same step: attendance is ticked for every PC; tick one more, then award
  const awards = wrap.getByTestId("award-checklist");
  await awards.locator("input[type=checkbox]:not(:checked):not(:disabled)").first().check();
  await wrap.getByTestId("award-xp").click();
  await expect(wrap.getByTestId("awarded")).toHaveCount(4);
  await wrap.getByRole("button", { name: /^Next: Rewards/ }).click();
  await wrap.getByRole("button", { name: /^Next: Timeline/ }).click();
  await expect(wrap.getByRole("textbox", { name: "Timeline text" }).first()).toHaveValue(/The crew learns/);
  await wrap.getByRole("button", { name: /^Next: Loose ends/ }).click();
  await wrap.getByRole("textbox", { name: "Loose ends" }).fill("Who wants the crate?");
  // the demo's accepted job waits in the last step; finishing never needs it closed, and lands on the next session's page
  await wrap.getByRole("button", { name: /^Next: Close the job/ }).click();
  await expect(wrap.getByTestId("close-source")).toHaveCount(1);
  await wrap.getByTestId("finish-session").click();
  await expect(page).toHaveURL(/\/sessions\/[0-9A-Z]{26}$/);
  await expect(page.getByTestId("session-page")).toHaveAttribute("data-status", "planned");

  // 7. on the next session's page; the session is done and the next one is planned
  await page.getByRole("navigation", { name: "Campaign" }).getByRole("link", { name: "Sessions", exact: true }).click();
  await expect(page.locator('[data-session][data-status="done"]')).toHaveCount(2);
  const planned = page.locator('[data-session][data-status="planned"]');
  await expect(planned).toHaveCount(1);
  await expect(planned).toContainText("Session 3");
  await planned.getByRole("link").click();
  await expect(page.getByTestId("session-page")).toHaveAttribute("data-status", "planned");
  await expect(page.getByRole("textbox", { name: "Plan item 1" })).toHaveValue("Who wants the crate?");

  // the finished session shows its summary and timeline
  await page.getByRole("link", { name: "← Sessions" }).click();
  await page.locator('[data-session][data-status="done"]').filter({ hasText: "The ore run" }).getByRole("link").click();
  await expect(page.getByTestId("session-status")).toHaveText("done");
  await expect(page.getByTestId("session-summary")).toContainText("The crew takes the job.");
  await expect(page.getByTestId("session-timeline")).toContainText("The crew learns");

  expect(errors).toEqual([]);
});

test("table mode keeps working offline and the player screen shows what the GM revealed this session", async ({ page, context }) => {
  await page.goto("/");
  await page.getByTestId("load-demo").click();
  await expect(page).toHaveURL(/\/home$/, { timeout: 30_000 });
  await page.getByRole("button", { name: "Start this session" }).click();
  await expect(page.getByTestId("table-mode")).toBeVisible();

  const popupPromise = context.waitForEvent("page");
  await page.getByRole("button", { name: "Player screen" }).click();
  const players = await popupPromise;
  await expect(players.getByTestId("player-screen")).toBeVisible();
  // nothing piles up from earlier: the crew's friction and the job's posting are theirs to see, but off the screen until shown or pinned
  await expect(players.getByRole("region", { name: "Handouts" })).toContainText("Nothing on the screen yet.");
  await expect(players.locator("[data-handout]")).toHaveCount(0);
  await expect(players.getByText("personal agenda")).toHaveCount(0);

  await context.setOffline(true);
  const reveal = page.getByTestId("reveal-panel");
  const firstTitle = (await reveal.locator("[data-handout] .app-reveal__title").first().textContent()) ?? "";
  // the demo's handouts are each PC's agenda: showing one to everyone asks first
  await reveal.getByRole("button", { name: /^Show .* to everyone$/ }).first().click();
  await page.getByRole("dialog", { name: "Show it to everyone?" }).getByRole("button", { name: "Show everyone" }).click();
  await expect(players.locator("[data-handout]").first()).toContainText(firstTitle.trim());
  await expect(players.locator("[data-handout]")).toHaveCount(1);
  const clock = page.getByTestId("table-clock");
  await clock.getByRole("button", { name: "Advance one Stretch" }).click();
  await expect(players.getByTestId("clock-stretch")).toHaveText("1");
  await context.setOffline(false);
});

test("the player screen window holds the player view alone: no GM shell, its hotkeys and links go nowhere", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByTestId("load-demo").click();
  await expect(page).toHaveURL(/\/home$/, { timeout: 30_000 });
  await page.getByRole("button", { name: "Start this session" }).click();
  await expect(page.getByTestId("table-mode")).toBeVisible();

  const popupPromise = context.waitForEvent("page");
  await page.getByRole("button", { name: "Player screen" }).click();
  const players = await popupPromise;
  players.on("pageerror", (e) => errors.push(e.message));
  await expect(players.getByTestId("player-screen")).toBeVisible();
  const url = players.url();
  expect(url).toMatch(/\/table\/[0-9A-Z]{26}\?view=players$/);
  // nothing of the GM's shell is in the window: no campaign header, search or sidebar links
  await expect(players.getByTestId("player-window")).toBeAttached();
  await expect(players.getByTestId("campaign-name")).toHaveCount(0);
  await expect(players.getByRole("navigation", { name: "Campaign" })).toHaveCount(0);
  await expect(players.getByRole("combobox")).toHaveCount(0);
  await expect(players.locator("a[href]")).toHaveCount(0);

  // the GM's search hotkey does nothing: "/", a GM-only NPC's name, Enter
  const gmOnly = "Karima Yusef";
  await players.locator("body").click();
  await players.keyboard.press("/");
  await players.keyboard.type(gmOnly);
  await players.keyboard.press("Enter");
  await players.keyboard.press("Control+k");
  await players.keyboard.type(gmOnly);
  await players.keyboard.press("Enter");
  // tabbing round and pressing Enter on whatever has focus opens nothing either
  for (let i = 0; i < 8; i++) {
    await players.keyboard.press("Tab");
    await players.keyboard.press("Enter");
  }
  expect(players.url()).toBe(url);
  await expect(players.getByTestId("player-screen")).toBeVisible();
  await expect(players.getByText(gmOnly)).toHaveCount(0);
  await expect(players.locator("body")).not.toContainText("Karima");

  // the window stays the player screen even if it is sent to a GM page
  await players.goto(url.replace(/\/table\/.*$/, "/atlas"));
  await expect(players.getByTestId("player-screen")).toBeVisible();
  await expect(players.getByTestId("campaign-name")).toHaveCount(0);
  await expect(players.locator("body")).not.toContainText("Karima");
  // nor the campaign list
  await players.goto(new URL(url).origin + "/");
  await expect(players.getByText("This window is the player screen.")).toBeVisible();
  await expect(players.getByTestId("load-demo")).toHaveCount(0);
  expect(errors).toEqual([]);
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
