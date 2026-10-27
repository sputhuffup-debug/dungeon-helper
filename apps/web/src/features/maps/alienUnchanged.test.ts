/**
 * Guard: Alien's site maps stay byte-identical while the generic map code
 * (contract, core projection, renderer, prints) grows for other generators.
 *
 * The fixture holds SHA-256 hashes of Alien layouts generated from fixed
 * seeds, of their player projections and zone keys, and of the SVG the
 * renderer draws for the GM, player and tracking views. It was recorded
 * before the dungeon engine was added; regenerate it only on purpose:
 *
 *   UPDATE_ALIEN_HASHES=1 pnpm --filter @campaign-forge/web exec vitest run src/features/maps/alienUnchanged.test.ts
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { playerLayout, runMapGenerator, zoneKeyMarkdown } from "@campaign-forge/core";
import { alienModule, siteMapGenerator, SITE_TYPES } from "@campaign-forge/module-alien";
import { drawSiteMap, nodeToString, planRollPrint, printTiles, renderSiteMapSvg, rollPrintPages } from "@campaign-forge/ui";
import { describe, expect, it } from "vitest";

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "alienUnchanged.hashes.json");
const sha = (v: unknown) => createHash("sha256").update(typeof v === "string" ? v : JSON.stringify(v)).digest("hex").slice(0, 24);

function hashes(): Record<string, string> {
  const out: Record<string, string> = {};
  const legend = siteMapGenerator.legend;
  for (const site of SITE_TYPES) {
    for (const size of ["small", "medium"]) {
      for (const seed of ["alpha", "omega-7"]) {
        const key = `${site}/${size}/${seed}`;
        const layout = runMapGenerator(alienModule, siteMapGenerator, { site_type: site, size }, { seed }).layout;
        out[`${key}/layout`] = sha(layout);
        const revealed = layout.zones.filter((_, i) => i % 3 === 0).map((z) => z.id);
        const player = playerLayout(layout, { act: 1, revealed, legend });
        out[`${key}/player`] = sha(player);
        out[`${key}/player-print`] = sha(playerLayout(layout, { act: 1, print: true, legend }));
        out[`${key}/key`] = sha(zoneKeyMarkdown({ layout, generator: { id: siteMapGenerator.id, seed, inputs: {}, attempts: 1 }, name: key }, alienModule));
        const deck = layout.decks[0]!.id;
        out[`${key}/svg-gm`] = sha(nodeToString(drawSiteMap(layout, { view: "gm", deck, legend, passable: siteMapGenerator.passable }).node));
        out[`${key}/svg-player`] = sha(nodeToString(drawSiteMap(player, { view: "player", deck, legend, fogged: player.fogged, gridSquares: true }).node));
        out[`${key}/svg-tracking`] = sha(nodeToString(drawSiteMap(layout, { view: "tracking", deck, legend }).node));
        if (seed === "alpha" && size === "small") {
          const opts = { view: "player" as const, deck, legend, rollWidthIn: 24, title: key };
          const plan = planRollPrint(layout, opts);
          out[`${key}/roll`] = sha({ plan, pages: rollPrintPages(playerLayout(layout, { act: 1, print: true, legend }), opts).map((p) => nodeToString(p.node)) });
          out[`${key}/svg-export`] = sha(renderSiteMapSvg(layout, { view: "gm", deck, legend, physical: true, titleBlock: true, title: key }));
          out[`${key}/tiles`] = sha(printTiles(layout, { view: "player", deck, legend, paper: "letter", title: key }));
        }
      }
    }
  }
  return out;
}

describe("Alien site maps are unchanged", { timeout: 120_000 }, () => {
  it("layouts, projections, zone keys and drawings match the recorded hashes", () => {
    const now = hashes();
    if (process.env.UPDATE_ALIEN_HASHES || !existsSync(FIXTURE)) writeFileSync(FIXTURE, `${JSON.stringify(now, null, 1)}\n`);
    const recorded = JSON.parse(readFileSync(FIXTURE, "utf8")) as Record<string, string>;
    expect(now).toEqual(recorded);
  });
});
