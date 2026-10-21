/**
 * The built-in ORC core rules data pack (second edition remaster) end to end:
 * its ORC licence before download, the Hollowmere demo, a character whose
 * sheet derives its totals from ranks, a four-degree skill roll with a DC and
 * the multiple attack penalty, a Monster Core creature from the presets,
 * table-mode trackers, reference lists, rule cards and the encounter
 * builder. `PF2E_SHOTS=<dir>` keeps screenshots for review.
 */
import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const SHOTS = process.env.PF2E_SHOTS;
async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "Campaign" }).getByRole("link", { name, exact: true });

test("ORC core rules pack: the Hollowmere demo, derived sheets, four degrees, creatures, trackers, reference, rules and the encounter builder", async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 1000 });

  // 1. the module list shows the pack, the ORC notice and the trademark disclaimer before it is downloaded
  await page.goto("/");
  await page.getByTestId("open-modules").click();
  const modules = page.getByRole("dialog", { name: "Game modules" });
  await expect(modules.getByTestId("module-pf2e-orc")).toContainText("Fantasy d20 Remaster (ORC)");
  const licence = modules.getByTestId("module-licence-pf2e-orc");
  await expect(licence).toContainText("This product is licensed under the ORC License located at the Library of Congress at TX 9-307-067");
  await expect(licence).toContainText("Pathfinder Player Core © 2023, Paizo Inc.");
  await expect(licence).toContainText("Not affiliated with or endorsed by Paizo Inc. Pathfinder is a trademark of Paizo Inc.");
  await modules.getByRole("button", { name: "Close" }).click();

  // 2. the demo campaign
  await page.getByTestId("load-demo-pf2e").click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 60_000 });
  await expect(page.getByTestId("campaign-name")).toHaveText("Hollowmere");
  const base = page.url().replace(/\/home$/, "");

  // 3. a level 1 rogue: attribute modifiers and ranks written down, totals derived (trained = level + 2)
  await page.goto(`${base}/atlas`);
  await page.getByRole("tab", { name: /^PCs/ }).click();
  await page.getByRole("tabpanel").getByRole("link", { name: "Pip Tallowgrass", exact: true }).click();
  await expect(page.getByTestId("entity-page")).toBeVisible();
  await expect(page.getByTestId("computed-ac")).toHaveText("18");
  await expect(page.getByTestId("computed-hpMax")).toHaveText("15");
  await expect(page.getByTestId("computed-initiative")).toHaveText("6");
  await expect(page.getByTestId("pool-stealth")).toHaveText("1d20 + 7");
  // raising a rank to expert adds 2 more
  await page.locator('tr[data-skill="stealth"]').getByRole("combobox", { name: "Stealth" }).selectOption("2");
  await expect(page.getByTestId("pool-stealth")).toHaveText("1d20 + 9");
  await page.locator('tr[data-skill="stealth"]').getByRole("combobox", { name: "Stealth" }).selectOption("1");
  await expect(page.getByTestId("pool-stealth")).toHaveText("1d20 + 7");

  // 4. a Stealth roll against a DC reads four degrees; fortune rolls two dice and keeps the higher
  const stealth = page.locator('tr[data-skill="stealth"]');
  await stealth.getByRole("button", { name: "Roll" }).click();
  const panel = page.getByTestId("dice-panel");
  await panel.getByTestId("roll-option-dc").fill("15");
  await panel.getByTestId("roll-option-advantage").selectOption("fortune");
  await expect(panel.getByTestId("dicepool")).toContainText("1d20 + 7 (fortune) vs DC 15");
  await panel.getByRole("button", { name: "Roll" }).click();
  await expect(panel.locator('[data-dropped="true"]')).toHaveCount(1);
  const total = Number(await panel.getByTestId("roll-total").textContent());
  const natural = Math.max(...(await panel.locator(".cf-die:not([data-dropped='true'])").allTextContents()).map(Number).filter((n) => Number.isFinite(n)));
  let step = total >= 25 ? 3 : total >= 15 ? 2 : total <= 5 ? 0 : 1;
  if (natural === 20) step = Math.min(3, step + 1);
  if (natural === 1) step = Math.max(0, step - 1);
  await expect(panel.getByTestId("roll-outcome")).toHaveAttribute("data-outcome", ["critical-failure", "failure", "success", "critical-success"][step]!);
  // the multiple attack penalty is a roll option
  await panel.getByTestId("roll-option-map").selectOption("2nd attack (−5)");
  await expect(panel.getByTestId("dicepool")).toContainText("1d20 + 2");
  await shot(page, "pc-roll");
  await page.keyboard.press("Escape");

  // 5. a Monster Core creature from the presets
  await page.goto(`${base}/entities/new?type=pf2e-orc.creature`);
  await page.getByRole("searchbox", { name: "Search presets" }).fill("goblin warrior");
  await page.getByRole("radio", { name: /^Goblin Warrior/ }).check();
  await page.getByTestId("create-entity").click();
  await expect(page.getByTestId("entity-page")).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: "AC", exact: true })).toHaveValue("16");
  await expect(page.getByTestId("pool-reflex")).toHaveText("1d20 + 7");
  await expect(page.locator('[data-entry="Goblin Scuttle ↺"]')).toContainText("A goblin ally ends a move action adjacent to the goblin");
  await shot(page, "creature-sheet");

  // 6. table mode: the opening fight's kobolds on the initiative tracker (Perception), HP from the stat blocks
  await page.goto(`${base}/home`);
  await nav(page, "Sessions").click();
  await page.getByRole("button", { name: "Start session 1" }).click();
  await expect(page.getByTestId("table-mode")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Oil thieves at the mill" })).toBeVisible();
  await page.getByRole("tab", { name: "Trackers" }).click();
  const init = page.locator('[data-tracker="pf2e-orc.tracker.initiative"]');
  const pick = init.getByRole("combobox", { name: "Add from entities" });
  for (const name of ["Pip Tallowgrass", "Garrick Thornley", "Kobold Warrior 1"]) {
    await pick.selectOption({ label: name });
    await init.getByRole("button", { name: "Add", exact: true }).click();
  }
  await init.getByRole("button", { name: "Roll initiative" }).click();
  const scores = await init.locator("[data-testid^=card-]").evaluateAll((els) => els.map((e) => Number((e as HTMLInputElement).value)));
  expect(scores).toHaveLength(3);
  expect(scores).toEqual([...scores].sort((a, b) => b - a));
  const hp = page.locator('[data-tracker="pf2e-orc.tracker.hp"]');
  await hp.getByRole("button", { name: "Decrease Kobold Warrior 1 HP" }).click();
  await expect(hp.getByRole("spinbutton", { name: "Kobold Warrior 1 HP" })).toHaveValue("6");
  const heroPoints = page.locator('[data-tracker="pf2e-orc.tracker.hero-points"]');
  await expect(heroPoints).toContainText("Pip Tallowgrass");
  await shot(page, "table-trackers");

  // 7. reference lists open an item with its full text, cited by book and section
  await page.goto(`${base}/reference`);
  await page.getByRole("combobox", { name: "Reference list" }).selectOption({ label: "Spells: ranks 3–4 (89)" });
  await page.getByRole("searchbox", { name: "Filter items" }).fill("fireball");
  await page.getByTestId("reference-items").getByRole("button", { name: "Fireball", exact: true }).click();
  const item = page.getByTestId("reference-item");
  await expect(item).toContainText("basic Reflex");
  await expect(item).toContainText("6d6 fire damage");
  await expect(item).toContainText("Player Core — Spells: Fireball");
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await expect(page.getByTestId("page-attribution")).toContainText("Licence and attribution");

  // 8. conditions are rule cards cited by section
  await nav(page, "Rules").click();
  await page.getByRole("searchbox", { name: "Search rules" }).fill("frightened");
  await page.getByRole("button", { name: /^Frightened/ }).first().click();
  await expect(page.getByRole("dialog")).toContainText("Player Core — Conditions: Frightened");
  await expect(page.getByRole("dialog")).toContainText("status penalty equal to this value");

  // 9. the encounter builder spends GM Core's XP budget on Monster Core creatures
  await page.goto(`${base}/generate`);
  await page.getByTestId("procedure-pf2e-orc.proc.encounter").click();
  await expect(page.getByTestId("step-budget")).toContainText("80");
  await expect(page.getByTestId("step-shape")).toContainText("pf2e-orc.encounter.budget-80");
  await shot(page, "encounter-builder");
  await page.getByTestId("accept").click();
  await expect(page.getByTestId("entity-page")).toBeVisible();
  await expect(page.getByTestId("generated-panel")).toContainText("Encounter builder");
  await expect(page.getByTestId("computed-xpBudget")).toHaveText("80");
  await expect(page.getByRole("spinbutton", { name: "XP spent" })).toHaveValue("80");
  await expect(page.getByRole("textbox", { name: "Creatures" })).toHaveValue(/^\d+ × .+ \(level -?\d+, \d+ XP each\)/);

  expect(errors).toEqual([]);
});
