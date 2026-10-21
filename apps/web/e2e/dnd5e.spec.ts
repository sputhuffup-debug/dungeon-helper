/**
 * The built-in SRD 5.1 data pack end to end: its licence before download, a
 * campaign with it, a player character whose sheet derives its numbers, a
 * Goblin from the SRD presets, a skill roll at the table with a DC, the
 * rolled initiative and hit point trackers, reference lists, rule cards and
 * the encounter generator. `DND5E_SHOTS=<dir>` keeps screenshots for review.
 */
import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const SHOTS = process.env.DND5E_SHOTS;
async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "Campaign" }).getByRole("link", { name, exact: true });

test("SRD 5.1 pack: a campaign, a PC and a Goblin, a skill roll at the table, reference, rules and a generator", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 1000 });

  // 1. the module list shows the pack and the SRD attribution before it is downloaded
  await page.goto("/");
  await page.getByTestId("open-modules").click();
  const modules = page.getByRole("dialog", { name: "Game modules" });
  await expect(modules.getByTestId("module-dnd5e-srd")).toContainText("5th Edition SRD 5.1 (fantasy d20)");
  await expect(modules.getByTestId("module-licence-dnd5e-srd")).toContainText('This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC');
  await modules.getByRole("button", { name: "Close" }).click();

  // 2. a campaign with it
  await page.getByRole("button", { name: "New campaign" }).click();
  const create = page.getByRole("dialog", { name: "New campaign" });
  await create.getByLabel("Name", { exact: true }).fill("Into the Vale");
  await create.getByRole("combobox", { name: "Game module" }).selectOption("dnd5e-srd");
  await expect(create.getByRole("radio", { name: /Campaign/ })).toBeChecked();
  await create.getByRole("button", { name: "Create campaign" }).click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 30_000 });
  const base = page.url().replace(/\/home$/, "");

  // 3. a wizard: class, level and scores in, every bonus derived
  await page.goto(`${base}/entities/new?type=dnd5e-srd.character`);
  await page.getByTestId("entity-name").fill("Tamsin");
  await page.getByTestId("create-entity").click();
  await expect(page.getByTestId("entity-page")).toBeVisible();
  await page.getByRole("combobox", { name: "Class", exact: true }).selectOption("wizard");
  await page.getByRole("spinbutton", { name: "Level", exact: true }).fill("5");
  await page.getByRole("spinbutton", { name: "Intelligence", exact: true }).fill("16");
  await page.getByRole("spinbutton", { name: "Dexterity", exact: true }).fill("14");
  await page.locator('tr[data-skill="stealth"]').getByRole("combobox", { name: "Stealth" }).selectOption("2");
  await expect(page.getByTestId("computed-proficiencyBonus")).toHaveText("3");
  await expect(page.getByTestId("computed-spellSaveDc")).toHaveText("14");
  await expect(page.getByTestId("computed-spellAttack")).toHaveText("+6");
  await expect(page.getByTestId("computed-spellSlots")).toContainText("3rd: 2");
  // Dexterity 14 (+2) with expertise at proficiency +3
  await expect(page.getByTestId("pool-stealth")).toHaveText("1d20 + 8");
  await shot(page, "pc-sheet");

  // 4. a Goblin from the SRD presets, one click
  await page.goto(`${base}/home`);
  await page.getByTestId("quick-npc").click();
  await expect(page.getByTestId("entity-type")).toHaveValue("dnd5e-srd.monster");
  await page.getByRole("searchbox", { name: "Search presets" }).fill("goblin");
  await page.getByRole("radio", { name: /^Goblin Small humanoid/ }).check();
  await page.getByTestId("create-entity").click();
  await expect(page.getByTestId("entity-page")).toBeVisible();
  await expect(page.getByTestId("computed-crLabel")).toHaveText("1/4");
  await expect(page.getByTestId("computed-passivePerception")).toHaveText("9");
  await expect(page.getByTestId("pool-stealth")).toHaveText("1d20 + 6");
  await expect(page.locator('[data-entry="Nimble Escape"]')).toContainText("Disengage or Hide action as a bonus action");
  await shot(page, "goblin-sheet");

  // 5. table mode: a Stealth roll with a DC shows a total and an outcome
  await page.goto(`${base}/home`);
  await page.getByTestId("start-session").click();
  await expect(page).toHaveURL(/\/table\/[0-9A-Z]{26}$/);
  await page.getByRole("tab", { name: "Dice" }).click();
  await page.getByRole("combobox", { name: "Character", exact: true }).selectOption({ label: "Tamsin" });
  await page.getByRole("combobox", { name: "Skill", exact: true }).selectOption("stealth");
  const panel = page.getByTestId("dice-tab").getByTestId("dice-panel");
  await expect(panel.getByTestId("dicepool")).toContainText("1d20 + 8");
  await panel.getByTestId("roll-option-dc").fill("15");
  await panel.getByTestId("roll-option-advantage").selectOption("advantage");
  await panel.getByRole("button", { name: "Roll" }).click();
  await expect(panel.getByTestId("roll-total")).toHaveText(/^\d+$/);
  await expect(panel.getByTestId("roll-outcome")).toHaveText(/Success|Failure/);
  await expect(panel.locator('[data-dropped="true"]')).toHaveCount(1);
  const total = Number(await panel.getByTestId("roll-total").textContent());
  await expect(panel.getByTestId("roll-outcome")).toHaveAttribute("data-outcome", total >= 15 ? "success" : "failure");
  // saving throws are rollable too
  await page.getByRole("combobox", { name: "Skill", exact: true }).selectOption("intelligence-save");
  await expect(panel.getByTestId("dicepool")).toContainText("1d20 + 3");
  await shot(page, "table-dice");

  // 6. trackers: rolled initiative (highest first) and hit points on the sheet
  await page.getByRole("tab", { name: "Trackers" }).click();
  const init = page.locator('[data-tracker="dnd5e-srd.tracker.initiative"]');
  await init.getByRole("combobox", { name: "Add from entities" }).selectOption({ label: "Tamsin" });
  await init.getByRole("button", { name: "Add", exact: true }).click();
  await init.getByRole("textbox", { name: "Participant name" }).fill("Goblin boss");
  await init.getByRole("button", { name: "Add", exact: true }).click();
  await init.getByRole("button", { name: "Roll initiative" }).click();
  const scores = await init.locator("[data-testid^=card-]").evaluateAll((els) => els.map((e) => Number((e as HTMLInputElement).value)));
  expect(scores).toHaveLength(2);
  expect(scores).toEqual([...scores].sort((a, b) => b - a));
  const hp = page.locator('[data-tracker="dnd5e-srd.tracker.hp"]');
  await hp.getByRole("button", { name: "Decrease Tamsin HP" }).click();
  await expect(hp.getByRole("spinbutton", { name: "Tamsin HP" })).toHaveValue("7");
  await shot(page, "table-trackers");

  // 7. reference lists open an item with its full text
  await page.goto(`${base}/reference`);
  await page.getByRole("combobox", { name: "Reference list" }).selectOption({ label: "Spells (319)" });
  await page.getByRole("searchbox", { name: "Filter items" }).fill("fireball");
  await page.getByTestId("reference-items").getByRole("button", { name: "Fireball", exact: true }).click();
  const item = page.getByTestId("reference-item");
  await expect(item).toContainText("3rd-level evocation");
  await expect(item).toContainText("8d6 fire");
  await expect(item).toContainText("SRD 5.1 — Spells");
  await shot(page, "reference-spell");
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await expect(page.getByTestId("page-attribution")).toContainText("Licence and attribution");

  // 8. rule cards browse and cite the SRD by section
  await nav(page, "Rules").click();
  await page.getByRole("searchbox", { name: "Search rules" }).fill("three-quarters cover");
  await page.getByRole("button", { name: /^Cover/ }).first().click();
  await expect(page.getByRole("dialog")).toContainText("SRD 5.1 — Combat: Cover");
  await expect(page.getByRole("dialog")).toContainText("three-quarters cover");
  await shot(page, "rules-cover");

  // 9. the encounter generator picks SRD monsters with their stat blocks
  await page.goto(`${base}/generate`);
  await page.getByTestId("procedure-dnd5e-srd.proc.encounter").click();
  await expect(page.getByTestId("step-foe")).toContainText("dnd5e-srd.encounter.forest-1");
  await expect(page.getByTestId("step-foe")).toContainText(/CR (1\/8|1\/4|1\/2|1|2|3)/);
  // the steps read as lines for the GM, not as the result objects (no preset ids)
  await expect(page.getByTestId("step-result-foe")).toHaveText(/^[A-Z][\w ()'-]+ \(CR [\d/]+, \d+ XP each\)$/);
  await expect(page.getByTestId("step-result-group")).toHaveText(/^\d+ × [A-Z]/);
  await shot(page, "generator");
  await page.getByTestId("accept").click();
  await expect(page.getByTestId("entity-page")).toBeVisible();
  await expect(page.getByTestId("generated-panel")).toContainText("Random encounter");
  await expect(page.getByRole("textbox", { name: "Creatures" })).toHaveValue(/^\d+ × .+ \(CR /);
  // every creature came in with its SRD stat block and appears in the encounter
  await page.getByRole("tab", { name: "Relationships" }).click();
  const creature = page.getByTestId("entity-page").getByRole("link", { name: / 1$/ }).first();
  await creature.click();
  await expect(page.getByTestId("computed-proficiencyBonus")).toHaveText("2");
  await expect(page.getByTestId("computed-crLabel")).toHaveText(/^(1\/8|1\/4|1\/2|1|2|3)$/);
  await shot(page, "generated-creature");

  expect(errors).toEqual([]);
});
