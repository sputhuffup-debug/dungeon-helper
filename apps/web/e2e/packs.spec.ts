import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const dir = fileURLToPath(new URL("../../../packages/module-example/packs/example-pack/", import.meta.url));
const read = (name: string) => readFileSync(`${dir}${name}`, "utf8");
/** The example pack's files, optionally under another id (the fixture's own id is built into the app). */
function packFiles(id = "example-pack") {
  const swap = (s: string) => s.split("example-pack").join(id);
  return [
    { name: "pack.json", mimeType: "application/json", buffer: Buffer.from(swap(read("pack.json"))) },
    { name: "rules.part.json", mimeType: "application/json", buffer: Buffer.from(swap(read("rules.part.json"))) },
  ];
}

test("import a data pack, create a campaign with it, roll a d20 skill from a sheet", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // 1. the game modules dialog lists the built-ins
  await page.goto("/");
  await page.getByTestId("open-modules").click();
  const modules = page.getByRole("dialog", { name: "Game modules" });
  await expect(modules.getByTestId("module-alien")).toContainText("Built-in");

  // 2. a pack that takes a built-in id is refused with a reason
  await modules.getByTestId("pack-file-input").setInputFiles(packFiles());
  await expect(modules.getByText(/built into the app/)).toBeVisible();

  // 3. an invalid pack shows its errors with JSON paths
  const broken = packFiles("lantern");
  const bad = JSON.parse(broken[0]!.buffer.toString()) as Record<string, any>;
  bad.tables[0].id = "alien.world.size";
  broken[0]!.buffer = Buffer.from(JSON.stringify(bad));
  await modules.getByTestId("pack-file-input").setInputFiles(broken);
  await expect(modules.getByTestId("pack-errors")).toContainText('$.tables[0].id');
  await expect(modules.getByTestId("pack-errors")).toContainText('must start with "lantern."');

  // 4. the pack under its own id imports, with its licence and attribution
  await modules.getByTestId("pack-file-input").setInputFiles(packFiles("lantern"));
  const row = modules.getByTestId("module-lantern");
  await expect(row).toContainText("Imported");
  await expect(row).toContainText("Data pack");
  await expect(row.getByTestId("module-licence-lantern")).toContainText("Creative Commons Attribution 4.0");
  await expect(row.getByTestId("module-licence-lantern")).toContainText("Lanternlight Reference Document");
  await modules.getByRole("button", { name: "Close" }).click();

  // 5. create a campaign with it
  await page.getByRole("button", { name: "New campaign" }).click();
  const create = page.getByRole("dialog", { name: "New campaign" });
  await create.getByLabel("Name", { exact: true }).fill("Lantern Night");
  await create.getByRole("combobox", { name: "Game module" }).selectOption("lantern");
  await expect(create.getByRole("radio", { name: /Delve/ })).toBeChecked();
  await create.getByRole("button", { name: "Create campaign" }).click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/);
  await expect(page.getByTestId("campaign-name")).toHaveText("Lantern Night");

  // 6. an NPC from the pack's preset, rolled from its sheet with the d20 engine
  await page.getByTestId("quick-npc").click();
  await page.getByRole("searchbox", { name: "Search presets" }).fill("keeper");
  await page.getByRole("radio", { name: /^Lantern keeper/ }).first().check();
  await page.getByTestId("entity-name").fill("Old Wren");
  await page.getByTestId("create-entity").click();
  await expect(page.getByTestId("entity-page")).toBeVisible();
  // level 3: proficiency +2; lore is expertise (×2) on Wits 14 (+2): 1d20 + 6
  await expect(page.getByTestId("pool-lore")).toHaveText("1d20 + 6");
  await page.locator('tr[data-skill="lore"]').getByRole("button", { name: "Roll" }).click();
  const panel = page.getByTestId("dice-panel");
  await panel.getByTestId("roll-option-dc").fill("12");
  await panel.getByTestId("roll-option-advantage").selectOption("advantage");
  await expect(panel.getByTestId("dicepool")).toContainText("1d20 + 6 (advantage) vs DC 12");
  await panel.getByRole("button", { name: "Roll" }).click();
  await expect(panel.getByTestId("roll-total")).toHaveText(/^\d+$/);
  await expect(panel.getByTestId("roll-outcome")).toHaveText(/Success|Failure/);
  await expect(panel.locator('[data-dropped="true"]')).toHaveCount(1);

  // 7. settings name the module, its licence and attribution
  await page.goto(page.url().replace(/\/entities\/.*$/, "/settings"));
  const info = page.getByTestId("module-info");
  await expect(info).toContainText("Imported");
  await expect(page.getByTestId("module-attribution")).toContainText("Lanternlight Reference Document");

  // 8. removing the pack warns that the campaign uses it
  await page.goto("/");
  await page.getByTestId("open-modules").click();
  await page.getByTestId("remove-module-lantern").click();
  await expect(page.getByTestId("remove-module-warning")).toContainText("Lantern Night");
  await page.getByRole("button", { name: "Cancel" }).click();

  expect(errors).toEqual([]);
});
