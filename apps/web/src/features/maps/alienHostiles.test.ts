/**
 * Rogue humans on Alien site maps: fixed-seed hashes of layouts built from
 * briefs with hostile groups (the Alien hash guard, alienUnchanged.test.ts,
 * covers briefs without them and must not change), and the projections,
 * prints and drawings that must never show a GM-only mark to the players.
 *
 * Regenerate the fixture only on purpose:
 *
 *   UPDATE_ALIEN_HOSTILE_HASHES=1 pnpm --filter @campaign-forge/web exec vitest run src/features/maps/alienHostiles.test.ts
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { playerLayout, runMapGenerator, zoneKeyRows } from "@campaign-forge/core";
import { alienModule, siteMapGenerator, SITE_TYPES } from "@campaign-forge/module-alien";
import { drawSiteMap, nodeToString, printTiles, rollPrintPages } from "@campaign-forge/ui";
import { describe, expect, it } from "vitest";

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "alienHostiles.hashes.json");
const sha = (v: unknown) => createHash("sha256").update(typeof v === "string" ? v : JSON.stringify(v)).digest("hex").slice(0, 24);
const legend = siteMapGenerator.legend;

const brief = (site: string) => ({
  site_type: site,
  size: "medium",
  threats: [{ creature: "alien.creature.xx121-drone", act: 3, count: 1 }],
  hostiles: [
    { group: "mercenaries", act: 2, count: 3, posture: "guard" },
    { group: "corporate-security", act: 1, count: 1, posture: "hold" },
    { group: "hostile-android", act: 2, count: 1, posture: "patrol" },
  ],
  npcs: [{ name: "Juno Blanchard", role: "android", turns: true, note: "Betrayer (GM only). Sabotages the escape craft." }],
});

describe("Alien site maps with rogue humans", { timeout: 120_000 }, () => {
  it("layouts and drawings match the recorded hashes", () => {
    const now: Record<string, string> = {};
    for (const site of SITE_TYPES) {
      const layout = runMapGenerator(alienModule, siteMapGenerator, brief(site), { seed: "hostiles" }).layout;
      const deck = layout.decks[0]!.id;
      now[`${site}/layout`] = sha(layout);
      now[`${site}/player`] = sha(playerLayout(layout, { act: 2, legend }));
      now[`${site}/svg-gm`] = sha(nodeToString(drawSiteMap(layout, { view: "gm", deck, legend, passable: siteMapGenerator.passable }).node));
    }
    if (process.env.UPDATE_ALIEN_HOSTILE_HASHES || !existsSync(FIXTURE)) writeFileSync(FIXTURE, `${JSON.stringify(now, null, 1)}\n`);
    expect(now).toEqual(JSON.parse(readFileSync(FIXTURE, "utf8")));
  });

  it("shows rogue humans on the GM map and in the zone key, never on the player map, its prints or the tracking view", () => {
    for (const site of SITE_TYPES) {
      const layout = runMapGenerator(alienModule, siteMapGenerator, brief(site), { seed: `leak-${site}` }).layout;
      const hostiles = layout.markers.filter((m) => m.kind === "hostile");
      expect(hostiles.length).toBe(3);
      const decks = layout.decks.map((d) => d.id);
      const gm = decks.map((deck) => nodeToString(drawSiteMap(layout, { view: "gm", deck, legend }).node)).join("");
      expect(gm).toContain('data-marker-kind="hostile"');
      const rows = zoneKeyRows({ layout, generator: { id: siteMapGenerator.id, seed: "x", inputs: {} } }, alienModule);
      const keyMarks = rows.flatMap((r) => r.marks).filter((m) => m.kind === "hostile");
      expect(keyMarks).toHaveLength(3);
      for (const m of keyMarks) expect(m.detail).toMatch(/STR \d/);
      for (const act of [1, 2, 3]) {
        const player = playerLayout(layout, { act, legend, revealed: layout.zones.map((z) => z.id) });
        expect(player.markers.some((m) => m.gmOnly || m.kind === "hostile" || m.kind === "waypoint" || m.kind === "npc")).toBe(false);
        const svg = decks.map((deck) => nodeToString(drawSiteMap(player, { view: "player", deck, legend, fogged: player.fogged }).node)).join("");
        expect(svg).not.toContain('data-marker-kind="hostile"');
        for (const h of hostiles) expect(svg).not.toContain(h.label);
        expect(svg).not.toContain("Juno Blanchard");
      }
      const print = playerLayout(layout, { act: 1, print: true, legend });
      const deck = decks[0]!;
      const pages = rollPrintPages(print, { view: "player", deck, legend, rollWidthIn: 24, title: site }).map((p) => nodeToString(p.node)).join("");
      expect(pages).not.toContain('data-marker-kind="hostile"');
      const tiles = JSON.stringify(printTiles(print, { view: "player", deck, legend, paper: "letter", title: site }));
      expect(tiles).not.toContain("hostile");
      const tracking = nodeToString(drawSiteMap(layout, { view: "tracking", deck, legend }).node);
      expect(tracking).not.toContain('data-marker-kind="hostile"');
    }
  });
});
