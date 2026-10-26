/**
 * The character builder end to end in the Thornwick Crossing demo (fifth
 * edition): Build a character from the Atlas PCs tab, SRD 5.1 rules, a Hill
 * Dwarf Fighter with a point buy, two class skills, the Acolyte's languages,
 * a fighting style and the class's equipment packages; leave it half-way and
 * resume it; create it and read its computed numbers on the sheet and in the
 * Atlas; then level it up once. `BUILDER_SHOTS=<dir>` keeps a screenshot of
 * every step for review.
 */
import { mkdirSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";

const SHOTS = process.env.BUILDER_SHOTS;
async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

/** Pick an option of a choice (its card's or row's radio or checkbox). */
async function pick(page: Page, path: string, id: string) {
  const option = page.getByTestId(`opt:${path}:${id}`);
  const input = option.locator("input");
  if ((await input.count()) > 0) await input.check();
  else await option.click();
  await expect(option).toHaveClass(/is-on/);
}

async function next(page: Page, stepId: string) {
  await page.getByTestId("builder-next").click();
  await expect(page.locator(".cb__main")).toHaveAttribute("data-step", stepId);
}

const step = (page: Page, id: string): Locator => page.getByTestId(`step-${id}`);

test("build a fifth edition character in the Thornwick Crossing demo, resume it, create it and level it up", async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto("/");
  await page.getByTestId("load-demo-5e").click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 30_000 });
  const base = page.url().replace(/\/home$/, "");

  // 1. from the Atlas PCs tab
  await page.getByRole("navigation", { name: "Campaign" }).getByRole("link", { name: "Atlas", exact: true }).click();
  await page.getByRole("tab", { name: /^PCs/ }).click();
  await page.getByTestId("build-character").click();
  await expect(page.getByTestId("character-builder")).toBeVisible();
  await expect(page.getByTestId("builder-title")).toHaveText("Build a character");

  // 2. edition, then a Hill Dwarf (the supplement's Mossborn is offered with its badge)
  await pick(page, "edition", "2014");
  await expect(step(page, "edition")).toHaveAttribute("data-status", "ok");
  await next(page, "species");
  await expect(page.getByTestId("opt:species:thornwick-homebrew.mossborn").getByTestId("source-badge")).toHaveText("Thornwick Homebrew");
  await pick(page, "species", "dwarf");
  await pick(page, "species/lineage", "hill-dwarf");
  await pick(page, "species/tool", "smiths-tools");
  await expect(step(page, "species")).toHaveAttribute("data-status", "ok");
  await shot(page, "1-species");

  // 3. a fighter with two class skills
  await next(page, "class");
  await pick(page, "class", "fighter");
  await pick(page, "class/skills", "athletics");
  await pick(page, "class/skills", "perception");
  await expect(page.getByTestId("choice:class/skills").getByTestId("choice-count")).toHaveText("2 of 2");
  await shot(page, "2-class");

  // 4. the Acolyte and its two languages
  await next(page, "background");
  await pick(page, "background", "acolyte");
  await pick(page, "background/languages", "elvish");
  await pick(page, "background/languages", "giant");

  // 5. point buy: 15, 14, 14, 8, 10, 10 is 27 points
  await next(page, "abilities");
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
  // the dwarf's +2 Constitution and the hill dwarf's +1 Wisdom on top
  await expect(page.getByTestId("score:constitution")).toHaveText("16");
  await expect(page.getByTestId("score:wisdom")).toHaveText("11");
  await expect(page.getByTestId("summary-strength")).toContainText("15");
  await shot(page, "3-abilities");

  // leave half-way and come back: the draft is kept in the campaign
  await page.getByTestId("builder-keep").click();
  await expect(page).toHaveURL(/\/atlas\?tab=pcs$/);
  // the demo has an unfinished character of its own; this one is listed by what it is so far
  const mine = page.getByTestId("character-drafts").getByRole("listitem").filter({ hasText: "Hill Dwarf Fighter 1" });
  await expect(mine).toHaveCount(1);
  await expect(page.getByTestId("character-drafts")).toContainText("Elowen Brightwater");
  await mine.getByTestId("draft-resume").click();
  await expect(page.locator(".cb__main")).toHaveAttribute("data-step", "abilities");
  await expect(page.getByTestId("score:constitution")).toHaveText("16");

  // 6. level 1 and a fighting style
  await next(page, "level");
  await pick(page, "level", "1");
  await pick(page, "level/options.0", "fighter-fighting-style-defense");

  // 7. (no spells for a fighter) the class's equipment packages
  await next(page, "equipment");
  await pick(page, "equipment/class.0", "fighter-0-a");
  await pick(page, "equipment/class.1", "fighter-1-a");
  await pick(page, "equipment/class.1/pick-weapons.0", "longsword");
  await pick(page, "equipment/class.2", "fighter-2-b");
  await pick(page, "equipment/class.3", "fighter-3-b");
  await expect(page.getByTestId("preview-Armor Class")).toContainText("19");
  await shot(page, "4-equipment");

  // 8. a name, then the review
  await next(page, "details");
  await page.getByTestId("field:core.name").fill("Hilda Stonebrook");
  await page.getByTestId("field:alignment").selectOption("lawful-good");
  await next(page, "review");
  await expect(page.getByTestId("review-ready")).toBeVisible();
  await expect(page.getByTestId("grants:species")).toContainText("+2 Constitution from race Dwarf");
  await expect(page.getByTestId("grants:abilities")).toContainText("from base scores (point buy)");
  await shot(page, "5-review");
  await page.getByTestId("builder-finish").click();

  // 9. the sheet: stored fields written, numbers computed
  await expect(page.getByTestId("entity-page")).toBeVisible();
  await expect(page.getByTestId("entity-title")).toHaveValue("Hilda Stonebrook");
  await expect(page.getByTestId("computed-proficiencyBonus")).toHaveText("2");
  await expect(page.getByTestId("computed-constitutionMod")).toHaveText("3");
  await expect(page.getByTestId("pool-strength-save")).toHaveText("1d20 + 4");
  await expect(page.getByTestId("pool-athletics")).toHaveText("1d20 + 4");
  await expect(page.getByTestId("pool-perception")).toHaveText("1d20 + 2");
  await expect(page.getByTestId("computed-hitDie")).toHaveText("d10");
  // d10 + 3 at 1st level, +1 Dwarven Toughness
  await expect(page.getByRole("spinbutton", { name: "Hit point maximum", exact: true })).toHaveValue("14");
  await expect(page.getByRole("spinbutton", { name: "Armor Class", exact: true })).toHaveValue("19");
  await shot(page, "6-sheet");

  // 10. in the Atlas, a PC
  await page.goto(`${base}/atlas?tab=pcs`);
  const row = page.getByRole("tabpanel").getByRole("row").filter({ hasText: "Hilda Stonebrook" });
  await expect(row).toContainText("fighter");
  await expect(page.getByTestId("character-drafts")).not.toContainText("Hill Dwarf Fighter");

  // 11. level up once: a second fighter level, average hit points
  await row.getByRole("link", { name: "Hilda Stonebrook" }).click();
  await page.getByTestId("level-up").click();
  await expect(page.getByTestId("builder-title")).toHaveText("Level up: Hilda Stonebrook");
  await pick(page, "class", "fighter");
  await next(page, "hp");
  await pick(page, "hp", "average");
  await next(page, "features");
  await next(page, "review");
  await expect(page.getByTestId("grants:class")).toContainText("Action Surge");
  await shot(page, "7-level-up");
  await page.getByTestId("builder-finish").click();
  await expect(page.getByTestId("entity-page")).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: "Level", exact: true })).toHaveValue("2");
  // 14 + 6 (average d10) + 3 (Con) + 1 (Dwarven Toughness)
  await expect(page.getByRole("spinbutton", { name: "Hit point maximum", exact: true })).toHaveValue("24");

  expect(errors).toEqual([]);
});

test("ability scores from 4d6 drop lowest: dice entered from the table, or rolled in the app", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.getByTestId("load-demo-5e").click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 30_000 });
  await page.getByRole("navigation", { name: "Campaign" }).getByRole("link", { name: "Atlas", exact: true }).click();
  await page.getByRole("tab", { name: /^PCs/ }).click();
  await page.getByTestId("build-character").click();
  await page.getByTestId("step-abilities").click();
  await page.getByTestId("method:roll").locator("input").check();

  // 24 dice typed in, one per input, in order: score n is its four d6
  await page.getByTestId("enter-abilities").click();
  const faces = [6, 1, 5, 4, 3, 3, 3, 3, 1, 1, 1, 2, 6, 6, 6, 6, 2, 5, 2, 5, 1, 4, 6, 3];
  for (let i = 0; i < faces.length; i++) await page.getByTestId(`enter-die-${i}`).fill(String(faces[i]));
  await page.getByTestId("enter-dice-submit").click();
  const sets = page.getByRole("list", { name: "Rolled scores" });
  await expect(sets).toContainText("entered");
  await expect(sets.locator("strong")).toHaveText(["15", "9", "4", "18", "12", "13"]);
  // assign them: a value taken from another ability swaps with it
  await page.getByTestId("assign:strength").selectOption("18");
  await page.getByTestId("assign:dexterity").selectOption("15");
  await page.getByTestId("assign:constitution").selectOption("13");
  await page.getByTestId("assign:intelligence").selectOption("12");
  await page.getByTestId("assign:wisdom").selectOption("9");
  await page.getByTestId("assign:charisma").selectOption("4");
  await expect(page.getByTestId("score:strength")).toHaveText("18");
  await expect(page.getByTestId("mod:charisma")).toHaveText("−3");
  await expect(page.getByTestId("step-abilities")).toHaveAttribute("data-status", "ok");

  // or rolled by the app, from the draft's seed: six new totals between 3 and 18, to assign again
  await page.getByTestId("roll-abilities").click();
  await expect(sets.locator("strong")).toHaveCount(6);
  for (const t of await sets.locator("strong").allInnerTexts()) expect(Number(t)).toBeGreaterThanOrEqual(3);
  await expect(page.getByTestId("values-left")).toBeVisible();
  expect(errors).toEqual([]);
});
