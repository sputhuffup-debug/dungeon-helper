import { expect, test, type Page } from "@playwright/test";

async function newCampaign(page: Page, name: string, mode: RegExp) {
  await page.goto("/");
  await page.getByRole("button", { name: "New campaign" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill(name);
  await expect(dialog.getByRole("combobox", { name: "Game module" })).toHaveValue("alien");
  await dialog.getByRole("radio", { name: mode }).check();
  await dialog.getByRole("button", { name: "Create campaign" }).click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/);
}

const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "Campaign" }).getByRole("link", { name, exact: true });

test("generate a job, re-roll one step, accept it and find it on the job board", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await newCampaign(page, "Montero Haul", /^Campaign/);
  await nav(page, "Generate").click();
  await expect(page.getByRole("heading", { name: "Generate" })).toBeVisible();
  await page.getByTestId("procedure-alien.job.create").click();

  const bench = page.getByTestId("workbench");
  await expect(bench.getByRole("heading", { name: /Job Generator/ })).toBeVisible();
  await expect(bench.getByRole("combobox", { name: "Frame" })).toHaveValue("space-truckers");
  await expect(bench.getByTestId("step-employer").getByTestId("roll-dice").first()).toContainText("→ [");
  await expect(bench.getByTestId("step-plotTwist")).toContainText("Optional step, not included");

  // re-roll one step: only it gets a new seed; an unrelated step keeps its value
  const distance = await bench.getByTestId("step-result-distance").textContent();
  await bench.getByRole("button", { name: "Re-roll Employer or sponsor" }).click();
  await expect(bench.getByTestId("step-employer")).toContainText("re-rolled");
  await expect(bench.getByTestId("step-distance")).not.toContainText("re-rolled");
  await expect(bench.getByTestId("step-result-distance")).toHaveText(distance ?? "");
  await expect(bench.getByText("1 step re-rolled")).toBeVisible();

  // name the job before accepting
  const jobName = bench.getByTestId("preview-name-job");
  await jobName.fill("Haul for the Montero crew");
  await page.getByTestId("accept").click();

  await expect(page.getByTestId("entity-page")).toBeVisible();
  await expect(page.getByTestId("entity-title")).toHaveValue("Haul for the Montero crew");
  const panel = page.getByTestId("generated-panel");
  await expect(panel).toContainText("Job Generator");
  await expect(panel).toContainText("re-rolled employer");
  await expect(panel.getByTestId("chains").getByRole("link", { name: "Generate the destination system" })).toBeVisible();

  // re-open the run in the workbench: seed and step seeds restored
  await panel.getByTestId("reroll-in-workbench").click();
  await expect(page.getByText(/Restored run from/)).toBeVisible();
  await expect(page.getByTestId("step-employer")).toContainText("re-rolled");

  // the job is on the home job board
  await nav(page, "Home").click();
  const board = page.getByRole("region", { name: "Job board" });
  await expect(board).toContainText("Haul for the Montero crew");
  await expect(board).toContainText("Offered");

  expect(errors).toEqual([]);
});

test("build a cinematic adventure from the template, give a scene a map and draw a zone", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await newCampaign(page, "Hope's Last Day", /^Cinematic/);
  await nav(page, "Adventures").click();
  await expect(page.getByRole("heading", { name: "Adventures", exact: true })).toBeVisible();
  await page.getByTestId("new-adventure").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("radio", { name: "Cinematic adventure", exact: true })).toBeChecked();
  await dialog.getByLabel("Adventure title").fill("Cold Harbor");
  await dialog.getByTestId("create-adventure").click();

  const builder = page.getByTestId("adventure-builder");
  await expect(builder).toBeVisible();
  await expect(page.getByTestId("adventure-title")).toHaveValue("Cold Harbor");
  const outline = page.getByTestId("outline");
  await expect(outline.getByTestId("outline-act")).toHaveCount(3);
  await expect(outline.getByTestId("outline-scene")).toHaveCount(9);
  await expect(outline).toContainText("Act 1: Setup");
  await expect(outline).toContainText("Act 3: Showdown");
  await expect(page.getByTestId("overview-editor")).toContainText("What's the story, Mother?");

  // act pane: six agenda handouts
  await outline.getByRole("button", { name: "Act 2: Tilt" }).click();
  await expect(page.getByTestId("act-editor")).toBeVisible();
  await expect(page.getByTestId("handouts").locator("li")).toHaveCount(6);

  // scene pane: events from the template, then a map
  await outline.getByRole("button", { name: /^Arrival/ }).click();
  const scene = page.getByTestId("scene-editor");
  await expect(scene.getByTestId("scene-title")).toHaveValue("Arrival");
  await expect(scene.getByRole("button", { name: /^Mandatory:/ })).toHaveText("Mandatory");
  await scene.getByTestId("create-scene-map").click();

  await expect(page.getByTestId("map-page")).toBeVisible();
  await expect(page.getByTestId("map-name")).toHaveValue("Arrival map");
  const viewport = page.getByTestId("map-viewport");
  const box = await viewport.boundingBox();
  if (!box) throw new Error("no map viewport");
  await page.mouse.move(box.x + 60, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 160, box.y + 140, { steps: 5 });
  await page.mouse.move(box.x + 260, box.y + 220, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator("[data-zone]")).toHaveCount(1);
  await expect(page.getByRole("textbox", { name: "Zone name" })).toHaveValue("Zone 1");
  await expect(page.getByTestId("map-page").getByText("1 zone", { exact: true })).toBeVisible();

  // the zone is written to the campaign and survives a reload
  await page.waitForTimeout(600);
  await page.reload();
  await expect(page.locator("[data-zone]")).toHaveCount(1);

  // back to the scene through "Used in scenes"
  await page.getByRole("link", { name: "Arrival", exact: true }).click();
  await expect(page.getByTestId("scene-editor").getByTestId("open-scene-map")).toContainText("Arrival map");

  expect(errors).toEqual([]);
});
