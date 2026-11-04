/**
 * Making a PC quickly: from the Atlas's PCs tab, *Roll a Life Path* opens the
 * generator; its preview reads the career, talents, gear and weapons by name;
 * accepting opens the PC with the career pistol on the Weapons list. The Gear
 * field's *From the gear list…* adds a motion tracker to Gear and a knife to
 * Weapons. Buddy and Rival are picked from the other PCs, and the wrap-up's
 * XP questions see them.
 */
import { expect, test, type Page } from "@playwright/test";

const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "Campaign" }).getByRole("link", { name, exact: true });

/** A PC made by hand from the PCs tab. */
async function pcByHand(page: Page, name: string) {
  await nav(page, "Atlas").click();
  await page.getByRole("tab", { name: /^PCs/ }).click();
  await page.getByRole("link", { name: "+ New" }).click();
  await page.getByTestId("entity-name").fill(name);
  await page.getByTestId("create-entity").click();
  await expect(page.getByTestId("entity-title")).toHaveValue(name);
}

test("life path from the PCs tab, readable preview, weapons under Weapons, the gear list, buddy and rival from the crew", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });

  // a blank Alien campaign in campaign play
  await page.goto("/");
  await page.getByRole("button", { name: "New campaign" }).click();
  const dialog = page.getByRole("dialog", { name: "New campaign" });
  await dialog.getByLabel("Name", { exact: true }).fill("Outer Rim Haulers");
  await dialog.getByRole("radio", { name: /^Campaign/ }).check();
  await dialog.getByRole("button", { name: "Create campaign" }).click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/);

  // 1. the PCs tab offers the Life Path beside + New (and in its empty state)
  await nav(page, "Atlas").click();
  await page.getByRole("tab", { name: /^PCs/ }).click();
  const roll = page.getByRole("button", { name: "Roll a Life Path" });
  await expect(roll).toHaveCount(2);
  await expect(page.getByRole("link", { name: "+ New" })).toBeVisible();
  await roll.first().click();
  await expect(page).toHaveURL(/\/generate\/alien\.lifepath$/);

  // 2. a seed that makes an officer with the M4A3; the preview reads names, not ids
  await page.getByTestId("seed").fill("crew-2");
  const preview = page.getByTestId("preview");
  await expect(preview.locator('[data-field="career"] dd')).toHaveText("Officer");
  await expect(preview.locator('[data-field="weapons"] dd')).toHaveText("M4A3 Service Pistol");
  await expect(preview.locator('[data-field="talents"] dd')).not.toContainText("{");
  await expect(preview.locator('[data-field="gear"] dd')).toContainText("IRC MK.50 Compression Suit");
  await expect(preview).toContainText("Career Officer · Stress 0");
  await page.getByTestId("preview-name-pc").fill("Rook Calder");
  await page.getByTestId("accept").click();

  // 3. the PC's Weapons box has the pistol, with its stats; nothing of it in Gear
  await expect(page).toHaveURL(/\/entities\/[0-9A-Z]{26}$/, { timeout: 15_000 });
  await expect(page.getByTestId("entity-title")).toHaveValue("Rook Calder");
  const pcUrl = page.url();
  const weapons = page.locator('[data-section="weapons"]');
  await expect(weapons.getByTestId("weapons-table").getByRole("rowheader")).toHaveText(["M4A3 Service Pistol"]);
  await expect(weapons.getByTestId("weapons-table").getByRole("row", { name: /M4A3 Service Pistol/ })).toContainText("+2");
  const gear = page.locator('[data-section="gear"]');
  const gearNames = () => gear.getByRole("textbox", { name: /^Item \d+ name$/ }).evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value));
  expect(await gearNames()).toEqual(["IRC MK.50 Compression Suit"]);

  // 4. From the gear list: a motion tracker goes to Gear, a combat knife to Weapons
  await gear.getByTestId("gear-from-list").click();
  const picker = page.getByTestId("gear-picker");
  await picker.getByRole("searchbox", { name: "Search the gear list" }).fill("M314");
  const tracker = picker.getByRole("row", { name: /M314 Motion Tracker/ });
  await expect(tracker).toContainText("$1200");
  await expect(tracker).toContainText("p. 96");
  await tracker.getByRole("button", { name: "Add M314 Motion Tracker" }).click();
  await expect(picker.getByTestId("gear-picker-status")).toHaveText("Added M314 Motion Tracker to Gear.");
  await picker.getByRole("searchbox", { name: "Search the gear list" }).fill("combat knife");
  await picker.getByRole("button", { name: "Add Combat Knife" }).click();
  await expect(picker.getByTestId("gear-picker-status")).toHaveText("Added Combat Knife to Weapons.");
  await page.getByRole("button", { name: "Done" }).click();
  await expect(picker).toBeHidden();
  await expect(weapons.getByTestId("weapons-table").getByRole("rowheader")).toHaveText(["M4A3 Service Pistol", "Combat Knife"]);
  expect(await gearNames()).toEqual(["IRC MK.50 Compression Suit", "M314 Motion Tracker"]);

  // 5. two crewmates by hand, then Buddy and Rival picked from the other PCs
  await pcByHand(page, "Dana Okoye");
  await pcByHand(page, "Mo Reyes");
  await page.goto(pcUrl);
  await expect(page.getByTestId("entity-title")).toHaveValue("Rook Calder");
  const buddy = page.locator('[data-path="buddy"] select');
  const rival = page.locator('[data-path="rival"] select');
  await expect(buddy.locator("option")).toHaveText(["None", "Dana Okoye", "Mo Reyes"]);
  await buddy.selectOption({ label: "Dana Okoye" });
  await rival.selectOption({ label: "Mo Reyes" });
  await expect(buddy).toHaveValue(/^[0-9A-Z]{26}$/);
  await expect(rival.locator("option:checked")).toHaveText("Mo Reyes");
  // pairs: picking Dana as Rook's buddy makes Rook hers, and Mo's rival is Rook
  await expect(page.locator(".cf-toast").filter({ hasText: "Dana Okoye's buddy is now Rook Calder too." })).toBeVisible();
  await expect(page.locator(".cf-toast").filter({ hasText: "Mo Reyes's rival is now Rook Calder too." })).toBeVisible();

  // 6. the wrap-up's XP questions see each pair from both ends: Rook and Dana are buddies, Rook and Mo rivals
  await nav(page, "Home").click();
  await page.getByTestId("start-session").click();
  await expect(page.getByTestId("table-mode")).toBeVisible();
  await page.getByTestId("end-session").click();
  const wrap = page.getByTestId("wrapup");
  await wrap.getByRole("button", { name: /^Next: End-of-session questions/ }).click();
  const grid = wrap.getByTestId("award-checklist");
  const q = (name: string, text: string) => grid.getByRole("checkbox", { name: `${name}: ${text}` });
  const BUDDY = "Did you put your life on the line for your buddy?";
  const RIVAL = "Did you confront or stand up to your rival?";
  await expect(q("Rook Calder", BUDDY)).toBeEnabled();
  await expect(q("Rook Calder", RIVAL)).toBeEnabled();
  await expect(q("Dana Okoye", BUDDY)).toBeEnabled();
  await expect(q("Mo Reyes", RIVAL)).toBeEnabled();
  await expect(q("Mo Reyes", BUDDY)).toBeDisabled();
  await expect(q("Dana Okoye", RIVAL)).toBeDisabled();
  await expect(grid.locator('[data-question="alien.award.buddy"]')).toContainText("No buddy set");
  await q("Rook Calder", BUDDY).check();
  await expect(q("Rook Calder", BUDDY)).toBeChecked();
  expect(errors).toEqual([]);
});
