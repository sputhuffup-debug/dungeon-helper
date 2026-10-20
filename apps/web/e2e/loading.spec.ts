import { expect, test } from "@playwright/test";

/** JS chunks a page load fetches, by file name. */
function recordChunks(page: import("@playwright/test").Page): string[] {
  const files: string[] = [];
  page.on("request", (r) => {
    const path = new URL(r.url()).pathname;
    if (path.startsWith("/assets/") && path.endsWith(".js")) files.push(path.slice("/assets/".length));
  });
  return files;
}

test("the campaign list loads a small shell; a campaign loads its game module on open", async ({ page }) => {
  const files = recordChunks(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Campaign Forge" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  // the first page: no game module, no SDK checker, no Yjs store actions, no editor
  for (const heavy of ["alien", "module-sdk", "RichTextEditor", "tableActions", "actions-"]) {
    expect(files.filter((f) => f.startsWith(heavy)), `${heavy} on the first page`).toEqual([]);
  }

  // the "New campaign" dialog lists modes from the static manifest
  await page.getByRole("button", { name: "New campaign" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("radio", { name: /Cinematic/ })).toBeVisible();
  await expect(dialog.getByRole("radio", { name: /Campaign/ })).toBeChecked();
  await dialog.getByLabel("Name", { exact: true }).fill("Lazy Run");
  await dialog.getByRole("button", { name: "Create campaign" }).click();
  await expect(page.getByTestId("campaign-name")).toHaveText("Lazy Run");
  expect(files.some((f) => f.startsWith("alien-data")), "the Alien module loaded for the new campaign").toBe(true);
  // the home page does not need the editor
  expect(files.filter((f) => f.startsWith("RichTextEditor"))).toEqual([]);
});
