import { expect, test, type Page } from "@playwright/test";

const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "Campaign" }).getByRole("link", { name, exact: true });

test("ship page: funds and ledger, travel to another system, then between jobs posts the job's pay", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 1000 });

  // 1. the Skyfire Down demo, on its Ship page
  await page.goto("/");
  await page.getByTestId("load-demo").click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 30_000 });
  await nav(page, "Ship").click();
  const shipPage = page.getByTestId("ship-page");
  await expect(shipPage).toBeVisible();
  await expect(page.getByTestId("ship-card")).toContainText("MV Skyfire");
  await expect(page.getByTestId("ship-card")).toContainText("Coffee Maker Malfunction");
  await expect(page.getByTestId("campaign-date")).toHaveText("2183-06-01");

  // 2. the balance is summed from the demo's ledger: 6,500 + 12,000 − 450 − 720 + 1,000
  const balance = page.getByTestId("funds-balance");
  await expect(balance).toHaveText("$18,330");
  await expect(page.getByTestId("ledger-row")).toHaveCount(5);

  // 3. add an entry: the sign follows the category, the balance follows the entry
  const add = page.getByTestId("ledger-add");
  await add.getByRole("combobox", { name: "Entry category" }).selectOption({ label: "Docking fees" });
  await add.getByRole("textbox", { name: "Amount" }).fill("200");
  await add.getByRole("textbox", { name: "Note" }).fill("Second week at the berth");
  await page.getByTestId("ledger-add-submit").click();
  await expect(page.getByTestId("ledger-row")).toHaveCount(6);
  await expect(balance).toHaveText("$18,130");
  await expect(page.getByTestId("ledger-table")).toContainText("Second week at the berth");

  // the category filter narrows the table
  await page.getByTestId("ledger-filter").selectOption({ label: "Docking fees" });
  await expect(page.getByTestId("ledger-row")).toHaveCount(2);
  await page.getByTestId("ledger-filter").selectOption({ label: "All categories" });

  // 4. plan the trip back to the job's system: the last leg's distance comes back, FTL 12 × 1 parsec
  const planner = page.getByTestId("travel-planner");
  const destination = page.getByTestId("travel-destination");
  await destination.selectOption({ label: "Y87-544" });
  await expect(page.getByTestId("travel-distance")).toHaveValue("1");
  await expect(page.getByTestId("travel-days")).toHaveText("12 days");
  // one PC stays awake: an NDD roll every 12 days, and food and water for the trip
  await planner.getByRole("checkbox", { name: /Stays awake/ }).first().check();
  const checks = page.getByTestId("travel-checks");
  await expect(checks).toContainText("NDD roll");
  await expect(checks).toContainText("Food and water");

  // 5. depart: the date moves on 12 days and the arrival rolls are logged
  await page.getByTestId("depart").click();
  await expect(page.getByTestId("campaign-date")).toHaveText("2183-06-13");
  const arrival = planner.getByTestId("arrival-log");
  await expect(arrival).toContainText("for NDD");
  await expect(arrival).toContainText("fatigued");
  await expect(arrival).toContainText("person-days used");
  await expect(page.getByTestId("ship-card")).toContainText("at Y87-544");
  await expect(page.getByTestId("travel-log").getByTestId("travel-leg")).toHaveCount(2);

  // 6. between jobs, for the demo's job: the payment is posted once, with the bills
  await page.getByTestId("between-jobs-link").click();
  await expect(page.getByTestId("workbench")).toBeVisible();
  await expect(page.getByTestId("input-job")).not.toHaveValue("");
  await expect(page.getByTestId("input-ship")).not.toHaveValue("");
  await page.getByTestId("accept").click();
  const effects = page.getByTestId("effects");
  await expect(effects).toContainText("Ledger +$4,000: Payment: Haul");
  await page.getByRole("button", { name: /^Apply \d+ effects?$/ }).click();
  await expect(page.getByRole("button", { name: "Applied" })).toBeVisible();

  await nav(page, "Ship").click();
  const paid = page.getByTestId("ledger-row").filter({ hasText: "Payment: Haul" });
  await expect(paid).toHaveCount(1);
  await expect(paid).toContainText("+$4,000");
  await expect(paid).toContainText("2183-06-13");
  // the coffee maker was repaired with the spare part aboard
  await expect(page.getByTestId("ship-card")).toContainText("All systems working");

  expect(errors).toEqual([]);
});
