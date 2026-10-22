import { describe, expect, it } from "vitest";
import { primerText, toMarkdown } from "@campaign-forge/core";
import { buildCinematicDemo, buildDnd5eDemo, buildPf2eDemo } from "../src";

/** Every primer section's text, by title. */
function primerOf(demo: { store: { meta(): { primer?: Parameters<typeof primerText>[0] } }; registry: { has(id: string): boolean; open(id: string): Parameters<typeof toMarkdown>[0] } }) {
  return primerText(demo.store.meta().primer, (id) => (demo.registry.has(id) ? demo.registry.open(id) : undefined));
}

describe("demo primers", () => {
  it("Cold Harbor: every section filled, nothing from the GM's side of the story", () => {
    const demo = buildCinematicDemo();
    const primer = primerOf(demo);
    expect(primer.map((s) => s.id)).toEqual(["welcome", "setting", "lore", "places", "tone", "house-rules", "characters", "opening"]);
    const text = primer.map((s) => s.markdown).join("\n");
    expect(text).toContain("Cold Harbor");
    expect(text).toContain("Docking Ring");
    // the GM's situation and the GM-only NPCs stay secret (the Cold Lab's player-visible summary does mention its pod)
    for (const secret of ["synthetic", "Brandt", "Lindqvist", "facehugger", "Okoro", "froze"]) expect(text.toLowerCase(), secret).not.toContain(secret.toLowerCase());
  });

  it("Thornwick Crossing and Hollowmere: the pack's prompts, drafted places and their own welcome, without GM secrets", async () => {
    const thornwick = await buildDnd5eDemo();
    const t = primerOf(thornwick).map((s) => s.markdown).join("\n");
    expect(t).toContain("Thornwick Crossing");
    expect(t).toContain("The Ashgrin Band");
    for (const secret of ["bell-repair fund", "Grisk plans", "Sunken Watchtower", "Half the band would desert"]) expect(t, secret).not.toContain(secret);
    const hollowmere = await buildPf2eDemo();
    const h = primerOf(hollowmere);
    expect(h[0]?.markdown).toContain("Hollowmere");
    expect(h.some((s) => s.id === "characters")).toBe(true);
  });
});
