import { expect, test, type Page } from "@playwright/test";

/** A campaign on the Example Quest fixture module (offered with the `?dev` flag). */
async function newExampleCampaign(page: Page, name: string) {
  await page.goto("/?dev");
  await page.getByRole("button", { name: "New campaign" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill(name);
  await dialog.getByRole("combobox", { name: "Game module" }).selectOption("example");
  await dialog.getByRole("radio", { name: /^Standard/ }).check();
  await dialog.getByRole("button", { name: "Create campaign" }).click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/);
}

const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "Campaign" }).getByRole("link", { name, exact: true });

test("build a guided adventure: red dots, fill a required field, the dot turns green, review", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1280, height: 900 });

  await newExampleCampaign(page, "Bell Quest");
  await nav(page, "Adventures").click();
  await page.getByTestId("new-adventure").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: "Guided: Guided quest" }).check();
  await dialog.getByLabel("Adventure title").fill("The Lost Bell");
  await dialog.getByTestId("create-adventure").click();

  const guided = page.getByTestId("guided-builder");
  await expect(guided).toBeVisible();
  await expect(page.getByTestId("guided-heading")).toHaveText("The Lost Bell");
  const rail = page.getByRole("navigation", { name: "Builder steps" });
  await expect(rail.getByRole("button")).toHaveCount(4);

  // The review runs at once: basics and cast are red, acts amber, review has no checks.
  await expect(page.getByTestId("step-basics")).toHaveAttribute("data-status", "bad");
  await expect(page.getByTestId("step-cast")).toHaveAttribute("data-status", "bad");
  await expect(page.getByTestId("step-acts")).toHaveAttribute("data-status", "warn");
  await expect(page.getByTestId("step-review")).toHaveAttribute("data-status", "none");
  await expect(page.getByTestId("guided-summary")).toHaveText("2 items to fix · 2 warnings");
  await expect(page.getByRole("complementary", { name: "Field guide" })).toContainText("One hook the heroes cannot ignore.");
  await expect(page.getByTestId("step-issues")).toContainText("Write the hook");

  // Fill the required field: the dot turns green.
  await page.getByLabel("Hook", { exact: true }).fill("The temple bell was stolen at midnight.");
  await expect(page.getByTestId("step-basics")).toHaveAttribute("data-status", "ok");
  await expect(page.getByTestId("guided-summary")).toHaveText("1 item to fix · 2 warnings");

  // Cast: add a hero; the agenda warning names them.
  await page.getByTestId("step-next").click();
  await expect(page.getByRole("heading", { name: /^2\. Cast/ })).toBeVisible();
  await page.getByLabel("New Heroes name").fill("Ada");
  await page.getByTestId("cast-add-heroes").click();
  const member = page.getByTestId("cast-member").first();
  await expect(member.getByLabel("Heroes 1 name")).toHaveValue("Ada");
  await expect(member.getByTestId("computed-health")).toHaveText(/4/);
  await expect(page.getByTestId("step-cast")).toHaveAttribute("data-status", "warn");
  await expect(page.getByRole("region", { name: "Ada agendas" }).getByRole("textbox")).toHaveCount(2);

  // Acts: scenes as event cards with a mandatory toggle.
  await rail.getByRole("button", { name: /Acts/ }).click();
  await expect(page.getByTestId("act-1-counts")).toHaveText("1 scene · 1 mandatory");
  await page.getByRole("button", { name: "Add a scene to act 1" }).click();
  await expect(page.getByTestId("act-1-counts")).toHaveText("2 scenes · 1 mandatory");

  // Review: the sorted checklist; clicking an item jumps to its step.
  await rail.getByRole("button", { name: /Review/ }).click();
  const panel = page.getByTestId("review-panel");
  await expect(page.getByTestId("review-summary")).toHaveText("Ready · 3 warnings");
  const levels = await panel.locator("[data-level]").evaluateAll((els) => els.map((e) => e.getAttribute("data-level")));
  expect(levels).toEqual(["warn", "warn", "warn", "ok", "ok"]);
  await panel.getByRole("button", { name: /Ada: give the act 1 agenda/ }).click();
  await expect(page).toHaveURL(/step=cast/);
  await expect(page.getByRole("heading", { name: /^2\. Cast/ })).toBeVisible();

  // The outline edits the same records, and the toggle comes back.
  await page.getByTestId("view-outline").click();
  await expect(page.getByTestId("adventure-builder")).toBeVisible();
  await expect(page.getByTestId("outline-scene")).toHaveCount(4);
  await page.getByTestId("view-guided").click();
  await expect(guided).toBeVisible();

  // Narrow screens: the rail becomes a horizontal strip.
  await page.setViewportSize({ width: 600, height: 900 });
  const first = await page.getByTestId("step-basics").boundingBox();
  const second = await page.getByTestId("step-cast").boundingBox();
  expect(first && second && Math.abs(first.y - second.y) < 2 && second.x > first.x).toBe(true);

  // Reload: everything persisted.
  await page.reload();
  await expect(page.getByTestId("step-basics")).toHaveAttribute("data-status", "ok");
  expect(errors).toEqual([]);
});
