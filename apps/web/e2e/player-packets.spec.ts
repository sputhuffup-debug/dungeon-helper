/**
 * Player packets end to end on the Cold Harbor demo: add two players in
 * Settings, give Avery her act 1 agenda, share a new handout with her alone,
 * export every player's packet as web pages in one zip, then open Avery's
 * page: her agenda, her sheet and the shared handout. Blake's page holds none
 * of Avery's private items. `SHARE_OUT=<dir>` keeps the downloads.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Download, type Page } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";

const OUT = process.env.SHARE_OUT;

async function bytesOf(d: Download): Promise<Buffer> {
  const buf = readFileSync(await d.path());
  if (OUT) {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, d.suggestedFilename()), buf);
  }
  return buf;
}

const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "Campaign" }).getByRole("link", { name, exact: true });

async function addPlayer(page: Page, name: string, contact: string, pcIndex: number): Promise<string> {
  const card = page.getByTestId("players-card");
  await card.getByTestId("player-new-name").fill(name);
  await card.getByTestId("player-new-contact").fill(contact);
  await card.getByTestId("player-add").click();
  const pcs = card.getByRole("group", { name: `Characters ${name} plays` });
  await expect(pcs).toBeVisible();
  const chip = pcs.getByRole("checkbox").nth(pcIndex);
  const label = (await chip.getAttribute("aria-label")) ?? "";
  await chip.check();
  await expect(chip).toBeChecked();
  return label.replace(`${name} plays `, "");
}

test("player packets: each player gets their own agenda, sheet and shared handout, and nothing of another's", async ({ page, context }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // this browser shares no files: the desktop download path
  await page.addInitScript(() => {
    delete (Navigator.prototype as { share?: unknown }).share;
    delete (Navigator.prototype as { canShare?: unknown }).canShare;
  });
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.goto("/");
  await page.getByTestId("load-demo-cinematic").click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 30_000 });

  // 1. players in Settings, each with a PC
  await nav(page, "Settings").click();
  await expect(page.getByTestId("players-card")).toBeVisible();
  const avPc = await addPlayer(page, "Avery", "@avery in the group chat", 0);
  const blPc = await addPlayer(page, "Blake", "@blake", 1);
  expect(avPc).not.toBe(blPc);
  await expect(page.getByTestId("player-row")).toHaveCount(2);

  // 2. the act's handouts: give Avery her act 1 agenda, and share a new handout with her alone
  await nav(page, "Adventures").click();
  await page.getByTestId("adventure-card").filter({ hasText: "Cold Harbor" }).click();
  await page.getByTestId("view-outline").click();
  const outline = page.getByTestId("outline");
  await outline.getByRole("button", { name: /^Act 1/ }).click();
  const act = page.getByTestId("act-editor");
  await expect(act).toBeVisible();
  const give = act.getByRole("checkbox", { name: /to Avery$/ });
  await expect(give).toHaveCount(1);
  await give.check();
  await expect(give).toBeChecked();
  const avAgendaRow = act.locator("li.prep-handout").filter({ has: page.getByRole("checkbox", { name: /to Avery$/ }) });
  await avAgendaRow.getByRole("button", { name: /^Expand / }).click();
  const avAgendaText = ((await avAgendaRow.locator(".ProseMirror").innerText()) ?? "").trim().split("\n")[0]!.trim();
  expect(avAgendaText.length).toBeGreaterThan(10);

  await act.getByRole("button", { name: "+ Handout" }).click();
  // the new handout is the last row (agendas list first)
  const row = act.locator("li.prep-handout").last();
  const title = row.getByLabel("Handout title");
  await expect(title).toHaveValue("New handout");
  await title.fill("Coded message for Avery");
  await title.press("Enter");
  await expect(title).toHaveValue("Coded message for Avery");
  await row.getByLabel("Visibility", { exact: true }).selectOption("some_players");
  await row.getByRole("checkbox", { name: "Share with Avery" }).check();
  await row.getByRole("button", { name: /^Expand / }).click();
  await row.locator(".ProseMirror").click();
  await page.keyboard.type("Meet me at the cargo airlock at 0300. Come alone.");
  await page.waitForTimeout(400);

  // 3. Share, Player packets: a preview per player, then all of them as a zip
  await nav(page, "Sessions").click();
  await page.getByRole("button", { name: "Start session 1" }).click();
  await expect(page.getByTestId("table-mode")).toBeVisible();
  await page.getByTestId("share-players").click();
  await page.getByRole("tab", { name: /Player packets/ }).click();
  const dialog = page.getByTestId("packets-dialog");
  await expect(dialog.getByTestId("packet-player")).toHaveCount(2);
  await expect(dialog.getByTestId("packet-title")).toHaveText(/^Cold Harbor Relay for Avery: Session 1/);
  const preview = dialog.frameLocator("[data-testid=share-preview-page]");
  await expect(preview.getByRole("heading", { name: "Cold Harbor Relay for Avery" })).toBeVisible();
  await expect(preview.getByRole("heading", { name: "Coded message for Avery" })).toBeVisible();
  await dialog.getByRole("button", { name: "Preview Blake's packet" }).click();
  await expect(dialog.getByTestId("packet-title")).toHaveText(/^Cold Harbor Relay for Blake: Session 1/);
  await expect(preview.getByRole("heading", { name: "Cold Harbor Relay for Blake" })).toBeVisible();
  await expect(preview.locator("body")).not.toContainText("Coded message for Avery");

  const download = page.waitForEvent("download");
  await dialog.getByTestId("packets-export-all").click();
  const zip = await download;
  expect(zip.suggestedFilename()).toBe("cold-harbor-relay-session-1-player-packets.zip");
  const files = unzipSync(new Uint8Array(await bytesOf(zip)));
  expect(Object.keys(files).sort()).toEqual(["cold-harbor-relay-session-1-for-avery.html", "cold-harbor-relay-session-1-for-blake.html"]);
  const avery = strFromU8(files["cold-harbor-relay-session-1-for-avery.html"]!);
  const blake = strFromU8(files["cold-harbor-relay-session-1-for-blake.html"]!);

  // 4. open Avery's packet: her agenda, her sheet and the handout shared with her
  const reader = await context.newPage();
  await reader.setContent(avery);
  await expect(reader).toHaveTitle(/^Cold Harbor Relay for Avery: Session 1/);
  await expect(reader.getByRole("heading", { name: avPc, exact: true })).toBeVisible();
  await expect(reader.locator("section[data-kind=character]")).toContainText("Stress");
  await expect(reader.getByText(avAgendaText, { exact: false })).toBeVisible();
  await expect(reader.locator("section", { hasText: "Coded message for Avery" })).toContainText("Meet me at the cargo airlock");
  await expect(reader.locator("section", { hasText: "Coded message for Avery" }).locator(".eyebrow")).toHaveText("Just for Avery");
  await expect(reader.locator("body")).not.toContainText("@avery");

  // Blake's packet: his own sheet, none of Avery's private items
  await reader.setContent(blake);
  await expect(reader.getByRole("heading", { name: blPc, exact: true })).toBeVisible();
  const body = reader.locator("body");
  await expect(body).not.toContainText("Coded message for Avery");
  await expect(body).not.toContainText("Meet me at the cargo airlock");
  await expect(body).not.toContainText(avAgendaText);
  await expect(reader.locator("section[data-kind=character]")).toHaveCount(1);
  await reader.close();

  // the packets were recorded per player: the dialog now says what changed since each one
  await expect(page.getByTestId("packet-changes").first()).toContainText("Since");
  expect(errors).toEqual([]);
});
