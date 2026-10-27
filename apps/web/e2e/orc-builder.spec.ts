/**
 * The remaster (ORC) character builder end to end in the Hollowmere demo: the
 * demo's half-built dwarf cleric is listed; a new human fighter is built from
 * the Atlas PCs tab (heritage, ancestry boosts, background, key attribute,
 * four free boosts, skills and languages, 1st-level feats, a shopping list,
 * a name), created, read on the sheet (every number computed), then levelled
 * up once (a class feat and a skill feat; Hit Points follow).
 * `BUILDER_SHOTS=<dir>` keeps a screenshot of every step for review.
 */
import { mkdirSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";

const SHOTS = process.env.BUILDER_SHOTS;
async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/orc-${name}.png`, fullPage: true });
}

/** Pick an option of a choice (its card's or row's radio or checkbox). */
async function pick(page: Page, path: string, id: string) {
  const option = page.getByTestId(`opt:${path}:${id}`);
  const input = option.locator("input");
  if ((await input.count()) > 0) await input.check();
  else await option.click();
  await expect(option).toHaveClass(/is-on/);
}

/** Pick an option of a choice, filtering it by name first when it is a long list. */
async function pickListed(page: Page, path: string, id: string, filter: string) {
  const search = page.getByTestId(`choice:${path}`).locator("> .cb-list input[type=search]");
  if ((await search.count()) > 0) await search.fill(filter);
  await pick(page, path, id);
}

async function next(page: Page, stepId: string) {
  await page.getByTestId("builder-next").click();
  await expect(page.locator(".cb__main")).toHaveAttribute("data-step", stepId);
}

const step = (page: Page, id: string): Locator => page.getByTestId(`step-${id}`);

test("build a remaster character in the Hollowmere demo, create it and level it up", async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto("/");
  await page.getByTestId("load-demo-pf2e").click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 60_000 });
  const base = page.url().replace(/\/home$/, "");

  // 1. the PCs tab lists the demo's unfinished dwarf cleric; build a new character
  await page.getByRole("navigation", { name: "Campaign" }).getByRole("link", { name: "Atlas", exact: true }).click();
  await page.getByRole("tab", { name: /^PCs/ }).click();
  await expect(page.getByTestId("character-drafts")).toContainText("Maren Ashdown");
  await page.getByTestId("build-character").click();
  await expect(page.getByTestId("character-builder")).toBeVisible();
  await expect(page.getByTestId("builder-title")).toHaveText("Build a character");

  // 2. a Skilled Human (Medicine), the ancestry's free boosts to Strength and Constitution
  await pick(page, "ancestry", "human");
  await pick(page, "ancestry/heritage", "skilled-human");
  await pick(page, "ancestry/heritage/any-skill", "medicine");
  await pick(page, "ancestry/boosts", "standard");
  await pick(page, "ancestry/boosts/free", "strength");
  await pick(page, "ancestry/boosts/free", "constitution");
  await expect(step(page, "ancestry")).toHaveAttribute("data-status", "ok");
  await shot(page, "1-ancestry");

  // 3. the Warrior: Strength (of Constitution or Strength) and a free Dexterity
  await next(page, "background");
  await pick(page, "background", "warrior");
  await pick(page, "background/boost", "strength");
  // the background cannot boost Strength twice
  await expect(page.getByTestId("opt:background/free:strength")).toHaveClass(/is-off/);
  await pick(page, "background/free", "dexterity");

  // 4. a fighter: Strength key, Athletics
  await next(page, "class");
  await pick(page, "class", "fighter");
  await pick(page, "class/key", "strength");
  await pick(page, "class/skill-skills.0", "athletics");
  await expect(page.getByTestId("preview-Perception")).toContainText("+5");
  await shot(page, "2-class");

  // 5. four free boosts; the side summary shows the modifiers
  await next(page, "boosts");
  for (const a of ["strength", "dexterity", "constitution", "wisdom"]) await pick(page, "boosts", a);
  await expect(page.getByTestId("preview-Attributes")).toHaveText(/Str \+4 · Dex \+2 · Con \+2 · Int \+0 · Wis \+1 · Cha \+0/);
  await expect(step(page, "boosts")).toHaveAttribute("data-status", "ok");
  await shot(page, "3-boosts");

  // 6. three class skills (3 + Int 0) and one language (the human's extra)
  await next(page, "skills");
  await expect(page.getByTestId("choice:skills/class").getByTestId("choice-count")).toHaveText("0 of 3");
  for (const s of ["acrobatics", "crafting", "society"]) await pick(page, "skills/class", s);
  await pickListed(page, "skills/languages", "Dwarven", "Dwarven");

  // 7. level 1: a class feat and an ancestry feat (Natural Ambition brings another class feat)
  await next(page, "level");
  await pick(page, "level", "1");
  await next(page, "levels");
  await pick(page, "levels/lv.0/feat.0", "sudden-charge");
  await pickListed(page, "levels/lv.0/feat.1", "natural-ambition", "Natural Ambition");
  await pick(page, "levels/lv.0/feat.1/bonus-feat.0", "double-slice");
  await expect(step(page, "levels")).toHaveAttribute("data-status", "ok");
  await shot(page, "4-levels");

  // 8. 15 gp: scale mail, a steel shield and a longsword
  await next(page, "equipment");
  await pick(page, "equipment", "currency");
  await pickListed(page, "equipment/shop", "scale-mail", "Scale Mail");
  await pickListed(page, "equipment/shop", "steel-shield", "Steel Shield");
  await pickListed(page, "equipment/shop", "longsword", "Longsword");
  await expect(page.getByTestId("preview-Armor Class")).toContainText("18");
  await shot(page, "5-equipment");

  // 9. a name (the deity is free text), then the review
  await next(page, "details");
  await page.getByTestId("field:core.name").fill("Odile Marchbank");
  await page.getByTestId("field:deity").fill("The Lantern Keeper");
  await next(page, "review");
  await expect(page.getByTestId("review-ready")).toBeVisible();
  await expect(page.getByTestId("grants:class")).toContainText("Fortitude expert from class Fighter");
  await expect(page.getByTestId("grants:ancestry")).toContainText("+1 Strength from ancestry Human");
  await shot(page, "6-review");
  await page.getByTestId("builder-finish").click();

  // 10. the sheet: modifiers and ranks stored, every total computed
  await expect(page.getByTestId("entity-page")).toBeVisible();
  await expect(page.getByTestId("entity-title")).toHaveValue("Odile Marchbank");
  await expect(page.getByTestId("computed-hpMax")).toHaveText("20");
  await expect(page.getByTestId("computed-ac")).toHaveText("18");
  await expect(page.getByTestId("computed-classDc")).toHaveText("17");
  await expect(page.getByTestId("pool-athletics")).toHaveText("1d20 + 7");
  await expect(page.getByTestId("pool-perception")).toHaveText("1d20 + 6");
  await shot(page, "7-sheet");

  // 11. in the Atlas, a PC
  await page.goto(`${base}/atlas?tab=pcs`);
  const row = page.getByRole("tabpanel").getByRole("row").filter({ hasText: "Odile Marchbank" });
  await expect(row).toContainText("fighter");

  // 12. level up once: a class feat and a skill feat at 2nd level; 12 more Hit Points
  await row.getByRole("link", { name: "Odile Marchbank" }).click();
  await page.getByTestId("level-up").click();
  await expect(page.getByTestId("builder-title")).toHaveText("Level up: Odile Marchbank");
  await expect(page.getByTestId("opt:class:fighter")).toHaveClass(/is-on/);
  await next(page, "new-level");
  await pick(page, "new-level/lv.0/feat.0", "exacting-strike");
  await pickListed(page, "new-level/lv.0/feat.1", "battle-medicine", "Battle Medicine");
  await next(page, "review");
  await expect(page.getByTestId("grants:new-level")).toContainText("Battle Medicine");
  await shot(page, "8-level-up");
  await page.getByTestId("builder-finish").click();
  await expect(page.getByTestId("entity-page")).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: "Level", exact: true })).toHaveValue("2");
  await expect(page.getByTestId("computed-hpMax")).toHaveText("32");
  await expect(page.getByTestId("pool-athletics")).toHaveText("1d20 + 8");

  expect(errors).toEqual([]);
});
