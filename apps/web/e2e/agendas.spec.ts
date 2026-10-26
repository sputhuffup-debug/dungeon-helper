import { expect, test, type Page } from "@playwright/test";

async function loadCinematicDemo(page: Page): Promise<string> {
  await page.goto("/");
  await page.getByTestId("load-demo-cinematic").click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 30_000 });
  await expect(page.getByTestId("campaign-name")).toHaveText("Cold Harbor Relay");
  return page.url().replace(/\/home$/, "");
}

const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "Campaign" }).getByRole("link", { name, exact: true });

test("agenda drafts for Cold Harbor: generate for the four PCs, re-roll a slot, accept over the GM's text, see them on a sheet and the agenda cards", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  const base = await loadCinematicDemo(page);

  // the guided builder's PCs step offers the generator for this adventure
  await nav(page, "Adventures").click();
  await page.getByTestId("adventure-card").filter({ hasText: "Cold Harbor" }).click();
  await page.getByTestId("step-pcs").click();
  await page.getByTestId("guided-agenda-drafts").click();
  await expect(page).toHaveURL(/\/generate\/alien\.agendas\?pick=adventure/);

  // inputs: the adventure, its four PCs, the campaign snapshot
  await expect(page.getByTestId("input-adventure")).toHaveValue(/[0-9A-Z]{26}/);
  await expect(page.getByTestId("input-campaign")).toContainText(/\d+ entities and \d+ links/);
  const drafts = page.getByTestId("agenda-drafts");
  await expect(drafts).toContainText("DRAFT");
  const cards = drafts.getByTestId("agenda-character");
  await expect(cards).toHaveCount(4);
  await expect(cards.locator("h3")).toHaveText(["Rosa Ilunga", "Ana Kovac", "Teo Marsh", "Jun Akiyama"]);
  for (const card of await cards.all()) {
    await expect(card.getByRole("textbox")).toHaveCount(3);
    await expect(card.locator(".agenda-act__hint")).toHaveCount(3);
  }
  await expect(page.getByTestId("agenda-report")).toContainText("Friction");
  await expect(page.getByTestId("agenda-report")).toContainText("Hidden Synthetics");
  await expect(page.getByTestId("agenda-report").getByRole("table", { name: "Conflict by pair" }).locator("tbody tr")).toHaveCount(6);

  // re-roll one slot: only that slot (and its act's text) changes
  const rosa = page.getByRole("region", { name: "Rosa Ilunga agenda drafts" });
  const act1 = rosa.getByRole("textbox", { name: "Rosa Ilunga, Act 1 agenda draft" });
  const act2Before = await rosa.getByRole("textbox", { name: "Rosa Ilunga, Act 2 agenda draft" }).inputValue();
  const catchSlot = rosa.locator('.agenda-slot[data-slot$="/act1/catch"]');
  const catchBefore = await catchSlot.locator(".agenda-slot__text").innerText();
  const textBefore = await act1.inputValue();
  await rosa.getByRole("button", { name: "Re-roll Catch for Rosa Ilunga, Act 1" }).click();
  await expect(catchSlot.locator(".agenda-slot__text")).not.toHaveText(catchBefore);
  await expect(act1).not.toHaveValue(textBefore);
  await expect(rosa.getByRole("textbox", { name: "Rosa Ilunga, Act 2 agenda draft" })).toHaveValue(act2Before);
  await expect(page.getByText("1 slots re-rolled")).toBeVisible();

  // pin a slot, and lock an arc
  await rosa.getByRole("button", { name: "Pin Target for Rosa Ilunga, Act 2" }).click();
  await expect(rosa.getByRole("button", { name: "Unpin Target for Rosa Ilunga, Act 2" })).toBeVisible();
  await rosa.getByTestId("agenda-lock-arc").click();
  await expect(rosa.getByTestId("agenda-lock-arc")).toHaveText("Arc locked");

  // edit Teo's last act by hand
  const teo3 = page.getByRole("region", { name: "Teo Marsh agenda drafts" }).getByRole("textbox", { name: "Teo Marsh, Act 3 agenda draft" });
  await teo3.fill("Expose the synthetic in front of everyone, then get the crew to the shuttle.");
  const rosaText = await act1.inputValue();
  const rosaObjective = (await rosa.locator('.agenda-slot[data-slot$="/act1/objective"] .agenda-slot__text').innerText()).trim();

  // accept: the demo's own agenda cards have text, so it asks first
  await page.getByTestId("agenda-accept").click();
  const ask = page.getByTestId("agenda-overwrite");
  await expect(ask).toBeVisible();
  await expect(ask).toContainText("Rosa Ilunga, Act 1");
  await expect(ask).toContainText("agenda card");
  await page.getByTestId("agenda-replace").click();
  await expect(page.getByTestId("agenda-accepted")).toContainText("Wrote 24 agendas");

  // the agenda cards print the drafts
  await page.getByTestId("agenda-cards-open").click();
  await expect(page.getByTestId("agenda-cards")).toBeVisible();
  await expect(page.getByRole("region", { name: "Act 1 agenda: Rosa Ilunga" })).toContainText(rosaObjective);
  await expect(page.getByRole("region", { name: "Act 3 agenda: Teo Marsh" })).toContainText("Expose the synthetic in front of everyone");

  // and Rosa's sheet carries them in its agendas
  await page.goto(`${base}/atlas`);
  await page.getByRole("tab", { name: /^PCs/ }).click();
  await page.getByRole("link", { name: "Rosa Ilunga", exact: true }).first().click();
  await expect(page).toHaveURL(/\/entities\/[0-9A-Z]{26}$/);
  const agenda = page.locator('[data-section="agenda"]');
  await expect(agenda.getByRole("textbox", { name: "Text 1" })).toHaveValue(rosaText);
  await expect(agenda.getByRole("textbox", { name: "Text 3" })).not.toHaveValue("");

  expect(errors).toEqual([]);
});
