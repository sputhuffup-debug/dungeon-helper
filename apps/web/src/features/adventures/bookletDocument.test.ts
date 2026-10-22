import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { openCampaign, type CampaignContextValue } from "../../state/CampaignProvider";
import { loadDemoCampaign } from "../../state/tableActions";
import { bookletDocument, bookletStrings, greyscaleSvg, isPlaceholderText, type BookletBlock, type BookletDocument } from "./bookletDocument";

const opened: Array<() => void> = [];
afterEach(() => {
  while (opened.length) opened.pop()?.();
});

async function coldHarbor(): Promise<{ ctx: CampaignContextValue; doc: BookletDocument }> {
  const id = await loadDemoCampaign(undefined, "cinematic");
  const ctx = await openCampaign(id);
  opened.push(ctx.close);
  const adventure = ctx.store.list("adventures").find((a) => a.title === "Cold Harbor");
  if (!adventure) throw new Error("no Cold Harbor adventure");
  return { ctx, doc: await bookletDocument(ctx, adventure.id) };
}

const blocksOf = <K extends BookletBlock["kind"]>(doc: BookletDocument, kind: K): Array<Extract<BookletBlock, { kind: K }>> =>
  doc.sections.flatMap((s) => s.blocks).filter((b): b is Extract<BookletBlock, { kind: K }> => b.kind === kind);

describe("bookletDocument", () => {
  it("builds the Cold Harbor booklet from structured data", async () => {
    const { doc } = await coldHarbor();
    // title page
    expect(doc.title.title).toBe("Cold Harbor");
    expect(doc.title.tagline).toBe("The relay stopped talking nine days ago. Your shift starts now.");
    expect(doc.title.forLine).toContain("Game Master's booklet");
    const facts = Object.fromEntries(doc.title.facts.map((f) => [f.label, f.value]));
    expect(facts["Player characters"]).toMatch(/^4: Rosa Ilunga/);
    expect(facts["Theme"]).toBe("Secret Research");
    expect(facts["Content note"]).toContain("X-card");
    expect(doc.sections.map((s) => s.id)).toEqual(["overview", "cast", "locations", "map", "act-1", "act-2", "act-3", "epilogue", "checklist", "appendix"]);

    // overview: the mission and opening read aloud, the truth GM-only
    expect(blocksOf(doc, "readAloud").map((b) => b.title)).toEqual(expect.arrayContaining(["The mission (read to the players)", "Opening narration"]));
    const truth = blocksOf(doc, "secret")[0];
    expect(truth?.markdown).toContain("Brandt");
    expect(truth?.rows?.map((r) => r.label)).toContain("Threats");

    // the cast: PCs and crew NPCs with stat lines and agendas
    const cast = blocksOf(doc, "cast");
    expect(cast.map((c) => [c.title, c.cards.length])).toEqual([
      ["Player characters", 4],
      ["Crew NPCs", 3],
    ]);
    const rosa = cast[0]!.cards[0]!;
    expect(rosa.name).toBe("Rosa Ilunga");
    expect(rosa.role).toBe("Player character");
    expect(rosa.stats).toEqual(expect.arrayContaining([{ label: "Career", value: "Officer" }]));
    expect(rosa.stats.map((s) => s.label)).toEqual(expect.arrayContaining(["Health", "Resolve"]));
    expect(rosa.agendas.map((a) => a.act)).toEqual([1, 2, 3]);
    const ana = cast[0]!.cards.find((c) => c.name === "Ana Kovac")!;
    expect(ana.agendas[0]!.text).toBe("Keep Dr. Lindqvist alive and stop anyone from pulling the thing off her face.");
    const brandt = cast[1]!.cards.find((c) => c.name === "Elias Brandt")!;
    expect(brandt.fields.map((f) => f.label)).toEqual(expect.arrayContaining(["Public role", "Secret (GM)", "Sample lines"]));

    // locations with their puzzles as a small table
    const locations = blocksOf(doc, "locations")[0]!.items;
    expect(locations.map((l) => l.name)).toEqual(["Docking Ring", "Cold Lab", "Relay Control", "Shuttle Bay"]);
    for (const l of locations) {
      expect(l.description, l.name).toBeTruthy();
      const rows = Object.fromEntries(l.tables.flatMap((t) => t.rows).map((r) => [r.label, r.value]));
      for (const label of ["Puzzle", "Clue", "Solution", "Fallback (the loud or slow way)"]) expect(rows[label], `${l.name} ${label}`).toBeTruthy();
    }
    expect(locations[1]!.tables[0]!.rows.find((r) => r.label === "Solution")?.value).toContain("Tethra blue");

    // three acts with numbered scenes, fields, pacing and agendas
    const acts = doc.sections.filter((s) => s.kind === "act");
    expect(acts.map((a) => [a.eyebrow, a.title])).toEqual([
      ["Act 1", "Setup"],
      ["Act 2", "Tilt"],
      ["Act 3", "Showdown"],
    ]);
    const scenes = acts.map((a) => a.blocks.flatMap((b) => (b.kind === "scenes" ? b.scenes : [])));
    expect(scenes.map((s) => s.length)).toEqual([4, 4, 3]);
    const docking = scenes[0]![0]!;
    expect(docking).toMatchObject({ number: "1.1", title: "Docking", mandatory: true });
    expect(docking.readAloud).toContain("The clamps bite.");
    expect(Object.fromEntries(docking.facts.map((f) => [f.label, f.value]))).toMatchObject({ Where: "Docking Ring", "Aimed at": "Everyone", Trigger: "Start of play" });
    const act1Fields = Object.fromEntries((acts[0]!.blocks.find((b) => b.kind === "fields") as Extract<BookletBlock, { kind: "fields" }>).rows.map((r) => [r.label, r.value]));
    expect(act1Fields).toMatchObject({ Minutes: "75", "Fear stage": "Dread (something is wrong)" });
    expect(act1Fields["Ambient pressure"]).toContain("heat is failing");
    expect(act1Fields["Relief scene"]).toContain("coffee");
    expect(acts[0]!.blocks.some((b) => b.kind === "note" && b.markdown?.startsWith("Slow and cold"))).toBe(true);
    expect(blocksOf(doc, "agendas").map((b) => b.rows.length)).toEqual([4, 4, 4]);
    // Act 3 has no relief scene: an empty value prints as a write-in line, not placeholder text
    const act3Fields = (acts[2]!.blocks.find((b) => b.kind === "fields") as Extract<BookletBlock, { kind: "fields" }>).rows;
    expect(act3Fields.find((r) => r.label === "Relief scene")?.value).toBe("");

    // the site map figure: GM view, greyscale, with a zone key
    const map = blocksOf(doc, "map")[0]!;
    expect(map.name).toBe("Cold Harbor site map");
    expect(map.decks.length).toBeGreaterThan(0);
    const deck = map.decks[0]!;
    expect(deck.svg).toMatch(/^<svg [^>]*viewBox="0 0 /);
    const colours = deck.svg.match(/#[0-9a-f]{6}\b/gi) ?? [];
    expect(colours.length).toBeGreaterThan(0);
    expect(colours.filter((c) => !(c.slice(1, 3) === c.slice(3, 5) && c.slice(3, 5) === c.slice(5, 7)))).toEqual([]);
    expect(deck.key.filter((k) => k.key).map((k) => k.name)).toEqual(expect.arrayContaining(["Cold Lab", "Relay Control", "Docking Ring", "Shuttle Bay"]));

    // checklist and appendix
    const checklist = blocksOf(doc, "checklist")[0]!;
    expect(checklist.groups.map((g) => g.title)).toEqual(["For this adventure", "Mandatory events", "Before the session"]);
    expect(checklist.groups[0]!.items[0]!.text).toBe("Print and cut the 12 agenda cards");
    const stats = blocksOf(doc, "statBlocks")[0]!.items;
    expect(stats.map((b) => b.name)).toEqual(["Dr. Mara Lindqvist", "Elias Brandt", "Nell Okoro", "Facehugger (Cold Lab specimen)"]);
    expect(stats[3]!.tables.map((t) => t.title)).toContain("Signature attacks (D6)");
    expect(blocksOf(doc, "handouts")[0]!.items).toHaveLength(13); // 12 agendas and the relay log

    // no placeholder or broken text anywhere
    const strings = bookletStrings(doc);
    expect(strings.filter((s) => /undefined|\[object Object\]|NaN|^_.*_$|^\*.*\*$/.test(s.trim()))).toEqual([]);
    expect(strings.filter((s) => s.trim() && isPlaceholderText(s) && s.trim().length > 2)).toEqual([]);  }, 60_000);
});

describe("helpers", () => {
  it("treats all-italic template instructions as empty", () => {
    expect(isPlaceholderText("_Write the goal._")).toBe(true);
    expect(isPlaceholderText("*One paragraph.*\n\n_Another._")).toBe(true);
    expect(isPlaceholderText("The relay went quiet. _Nine days_ ago.")).toBe(false);
    expect(isPlaceholderText("")).toBe(true);
  });
  it("turns every colour of a map grey", () => {
    expect(greyscaleSvg('<rect fill="#ff0000" stroke="#fff"/>')).toBe('<rect fill="#4c4c4c" stroke="#ffffff"/>');
  });
});

