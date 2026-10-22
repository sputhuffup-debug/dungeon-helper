import { expect, test } from "@playwright/test";

test("the campaign list groups starting, demos and campaigns by game module", async ({ page }) => {
  await page.goto("/");
  const groups = page.getByTestId("module-group");
  await expect(groups).toHaveCount(3);
  const alien = page.locator('[data-module="alien"]');
  const dnd5e = page.locator('[data-module="dnd5e-srd"]');
  const orc = page.locator('[data-module="pf2e-orc"]');
  // each system's demos sit in its own section
  await expect(alien.getByTestId("load-demo")).toBeVisible();
  await expect(alien.getByTestId("load-demo-cinematic")).toBeVisible();
  await expect(dnd5e.getByTestId("load-demo-5e")).toBeVisible();
  await expect(orc.getByTestId("load-demo-pf2e")).toBeVisible();

  // a demo's campaign is listed under its module, not the others
  await dnd5e.getByTestId("load-demo-5e").click();
  await expect(page.getByTestId("campaign-name")).toHaveText("Thornwick Crossing", { timeout: 30_000 });
  await page.goto("/");
  await expect(dnd5e.getByRole("link", { name: "Thornwick Crossing" })).toBeVisible();
  await expect(alien.getByRole("link")).toHaveCount(0);
  await expect(alien.getByText("No campaigns with this module yet.")).toBeVisible();

  // "Start a campaign" opens New campaign with that module already chosen
  await orc.getByRole("button", { name: /^Start a .* campaign$/ }).click();
  const dialog = page.getByRole("dialog", { name: "New campaign" });
  await expect(dialog.getByRole("combobox", { name: "Game module" })).toHaveValue("pf2e-orc");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  // another section's button switches the choice
  await dnd5e.getByRole("button", { name: /^Start a .* campaign$/ }).click();
  await expect(dialog.getByRole("combobox", { name: "Game module" })).toHaveValue("dnd5e-srd");
});
