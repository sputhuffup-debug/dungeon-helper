import { mkdirSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";

/** Where screenshots go when `COMBAT_SCREENSHOTS` names a directory (off by default). */
const SHOTS = process.env.COMBAT_SCREENSHOTS;
async function shot(target: Locator, name: string, tall?: number) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  const page = target.page();
  const size = page.viewportSize();
  // table mode scrolls inside a full-height surface: a tall viewport shows a whole card
  if (tall && size) await page.setViewportSize({ width: size.width, height: tall });
  await page.waitForTimeout(250);
  await target.screenshot({ path: `${SHOTS}/${name}.png` });
  if (tall && size) await page.setViewportSize(size);
}

const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "Campaign" }).getByRole("link", { name, exact: true });

test("combat at the table: a creature turn against a PC, damage to the creature with acid splash, a special attack", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 1100 });

  // 1. the cinematic demo, session 1 at the table, on the scene with the facehugger
  await page.goto("/");
  await page.getByTestId("load-demo-cinematic").click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 30_000 });
  await nav(page, "Sessions").click();
  await page.getByRole("button", { name: "Start session 1" }).click();
  await expect(page.getByTestId("table-mode")).toBeVisible();
  const sceneSelect = page.getByRole("combobox", { name: "Scene" });
  await sceneSelect.selectOption((await sceneSelect.locator("option", { hasText: "The Cold Lab" }).getAttribute("value"))!);
  const others = page.getByRole("list", { name: "Scene participants" });
  const hugger = others.locator("li", { hasText: "Facehugger" });
  await expect(hugger).toBeVisible();
  const huggerName = (await hugger.locator(".app-participant__name").innerText()).trim();
  await expect(hugger.getByRole("meter", { name: `${huggerName} health` })).toHaveAttribute("aria-valuenow", "2");

  // 2. the facehugger's turn: Speed, the signature attack table (seeded, GM-only), then the GM picks Tail Grapple
  await hugger.getByRole("button", { name: `Creature turn: ${huggerName}` }).click();
  const turn = page.getByTestId("creature-turn");
  await expect(turn).toBeVisible();
  await expect(turn.getByTestId("creature-speed")).toHaveText("Speed 2");
  await turn.getByRole("button", { name: "Roll signature attack" }).click();
  await expect(turn.getByTestId("attack-name")).not.toBeEmpty();
  await turn.getByRole("button", { name: "Choose attack" }).click();
  await turn.getByRole("button", { name: "Use Tail Grapple" }).click();
  await expect(turn.getByTestId("attack-name")).toHaveText("Tail Grapple");
  await expect(turn.getByText("No attack roll: the effect applies.")).toBeVisible();

  // target Rosa; the choke does 1 damage (the row's effect), applied through the armor rule
  await turn.getByRole("combobox", { name: "Target" }).selectOption({ label: "Rosa Ilunga" });
  await turn.getByRole("spinbutton", { name: "Attack damage" }).fill("1");
  const pcs = page.getByRole("list", { name: "Player characters" });
  const rosaMeter = pcs.getByRole("meter", { name: "Rosa Ilunga health" });
  const before = Number(await rosaMeter.getAttribute("aria-valuenow"));
  expect(before).toBeGreaterThan(1);
  await shot(turn, "creature-turn-card", 2400);
  await turn.getByRole("button", { name: "Apply to Rosa Ilunga" }).click();
  await expect(turn.getByTestId("hit-result")).toContainText("Rosa Ilunga takes 1 damage");
  await expect(rosaMeter).toHaveAttribute("aria-valuenow", String(before - 1));
  await shot(turn, "creature-turn-applied", 2400);

  // 3. the crew hits back: 3 damage against armor 1, the facehugger is at zero, and acid splash asks for its dice
  await hugger.getByRole("button", { name: `Take a hit: ${huggerName}` }).click();
  const hit = page.getByTestId("take-hit");
  await hit.getByRole("spinbutton", { name: "Damage", exact: true }).fill("3");
  await expect(hit.getByTestId("armor-resolution")).toContainText("Armor 1");
  await hit.getByRole("button", { name: `Apply to ${huggerName}` }).click();
  await expect(hit.getByTestId("hit-result")).toContainText(`${huggerName} takes 2 damage`);
  const splash = hit.getByTestId("reaction-panel");
  await expect(splash).toContainText("Acid splash");
  await expect(splash).toContainText("roll 6 dice (4 + 2 damage taken)");
  await splash.getByRole("button", { name: /^Roll Acid splash/ }).click();
  await expect(splash.getByTestId("reaction-damage")).toBeVisible();
  await shot(page.getByRole("dialog", { name: `Take a hit: ${huggerName}` }), "take-hit-armor-acid-splash");
  await page.getByRole("dialog", { name: `Take a hit: ${huggerName}` }).getByRole("button", { name: "Done" }).click();
  await expect(hugger.getByRole("meter", { name: `${huggerName} health` })).toHaveAttribute("aria-valuenow", "0");

  // 4. a special attack from Rosa's card, opposed by Teo
  await pcs.getByRole("button", { name: "Special attack for Rosa Ilunga" }).click();
  const special = page.getByTestId("special-attack");
  await expect(special.getByRole("combobox", { name: "Special attack character" })).toHaveValue(/.+/);
  await special.getByRole("combobox", { name: "Special attack", exact: true }).selectOption({ label: "Disarm" });
  await expect(special.getByTestId("special-requires")).toContainText("Adjacent");
  await expect(special.getByTestId("special-opposed")).not.toBeEmpty();
  await special.getByRole("button", { name: "Roll Disarm for Rosa Ilunga" }).click();
  await special.getByRole("combobox", { name: "Opposed by" }).selectOption({ label: "Teo Marsh" });
  await special.getByRole("button", { name: /^Roll .+ for Teo Marsh$/ }).click();
  await expect(special.getByTestId("opposed-result")).toHaveText(/wins|Tie/);
  await shot(page.getByRole("dialog", { name: "Special attack" }), "special-attack-picker");
  await page.getByRole("dialog", { name: "Special attack" }).getByRole("button", { name: "Done" }).click();

  // the roll log has the creature's rolls; the player screen shows none of them
  await page.getByRole("tab", { name: "Log" }).click();
  await expect(page.getByRole("list", { name: "Session events" })).toContainText(`${huggerName}: GM picks Tail Grapple`);
  const players = await context.newPage();
  await players.goto(`${page.url()}?view=players`);
  await expect(players.getByTestId("player-screen")).toBeVisible();
  await expect(players.getByTestId("player-screen")).not.toContainText("Tail Grapple");
  await expect(players.getByTestId("player-screen")).not.toContainText("Acid splash");
  await expect(players.getByTestId("player-screen")).not.toContainText(huggerName);

  expect(errors).toEqual([]);
});
