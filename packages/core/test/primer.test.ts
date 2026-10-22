import { describe, expect, it } from "vitest";
import type { EntityTypeDef, GameModule } from "@campaign-forge/module-sdk";
import * as Y from "yjs";
import { DEFAULT_PRIMER_SECTIONS, RichTextRegistry, docFromMarkdown, docIdsOf, draftPrimer, ensurePrimer, primerSectionDefs, primerText, toMarkdown, type Id } from "../src";
import { PERSON, PLACE, fixtureModule, newStore } from "./fixtures";

const FACTION: EntityTypeDef = {
  id: "example.faction",
  kind: "faction",
  name: "Faction",
  plural: "Factions",
  schema: { type: "object", properties: { aim: { type: "string" } } },
  sheet: { sections: [{ id: "main", title: "Main", fields: [{ path: "aim", label: "Aim" }] }] },
  defaultVisibility: { aim: "gm" },
};

const module = {
  ...fixtureModule,
  entityTypes: [...fixtureModule.entityTypes, FACTION],
  primer: {
    sections: [
      { id: "setting", title: "The valley", prompt: "Describe the valley.", starter: "A cold river valley.", original: true },
      { id: "travel", title: "Getting around", prompt: "Roads and rivers.", original: true },
    ],
  },
} as GameModule;

const SECRETS = ["SECRET-GM-FACTION", "SECRET-GM-PLACE", "SECRET-AIM", "SECRET-GM-SUMMARY", "SECRET-GM-SITUATION", "SECRET-GM-EVENT", "SECRET-GM-NPC", "SECRET-PREMISE"];

function seed() {
  const store = newStore();
  const docs = new Map<Id, Y.Doc>();
  const write = (id: Id | undefined, md: string) => id && docs.set(id, docFromMarkdown(md, id));
  store.createEntity({ type: PLACE.id, name: "Thornwick", summary: "A ford village with a stolen bell.", visibility: { level: "players" } });
  store.createEntity({ type: PLACE.id, name: "SECRET-GM-PLACE", summary: "SECRET-GM-SUMMARY" });
  store.createEntity({ type: FACTION.id, name: "The Ferrymen", summary: "Keep the crossings.", fields: { aim: "SECRET-AIM" }, visibility: { level: "players" } });
  store.createEntity({ type: FACTION.id, name: "SECRET-GM-FACTION", summary: "SECRET-GM-SUMMARY", visibility: { level: "some_players", players: ["m1"] } });
  const npc = store.createEntity({ type: PERSON.id, name: "SECRET-GM-NPC" });
  store.createEntity({ type: PERSON.id, name: "Aria", fields: { isPC: true, level: 3, secret: "SECRET-AIM" }, visibility: { level: "players" } });
  store.createEntity({ type: PERSON.id, name: "Bren", fields: { isPC: true, level: 3 }, visibility: { level: "players" } });
  const adventure = store.createAdventure({ title: "The Stolen Bell", premise: "SECRET-PREMISE", status: "active", withDocs: true });
  write(adventure.playerIntroDoc, `The bell of Thornwick is gone, and [[${npc.id}|a stranger]] was seen at the ford.`);
  write(adventure.gmSituationDoc, "SECRET-GM-SITUATION");
  store.createTimelineEvent({ inWorldDate: "1000-04-11", text: "The bell is stolen in the night.", visibility: { level: "players" } });
  store.createTimelineEvent({ inWorldDate: "1000-04-10", text: "SECRET-GM-EVENT" });
  return { store, docs };
}

describe("primer sections", () => {
  it("refine the standard sections by id and add the module's own after them", () => {
    const defs = primerSectionDefs(module);
    expect(defs.map((d) => d.id)).toEqual(["welcome", "setting", "lore", "places", "tone", "house-rules", "characters", "opening", "travel"]);
    expect(defs[1]).toMatchObject({ title: "The valley", starter: "A cold river valley." });
    expect(primerSectionDefs(undefined)).toEqual(DEFAULT_PRIMER_SECTIONS);
  });

  it("are created once in the campaign with their starter text, and travel in the bundle's doc list", () => {
    const { store } = seed();
    const registry = new RichTextRegistry();
    const { primer, created } = ensurePrimer(store, registry, module);
    expect(created).toHaveLength(9);
    expect(store.meta().primer?.sections.map((s) => s.id)).toEqual(primer.sections.map((s) => s.id));
    const setting = primer.sections.find((s) => s.id === "setting")!;
    expect(toMarkdown(registry.open(setting.doc))).toBe("A cold river valley.");
    expect(ensurePrimer(store, registry, module).created).toEqual([]);
    expect(docIdsOf(store.toJSON())).toEqual(expect.arrayContaining(primer.sections.map((s) => s.doc)));
    // empty sections are not shared; the rest come with their titles, in order
    expect(primerText(primer, (id) => registry.peek(id)).map((s) => s.id)).toEqual(["setting", "tone"]);
  });
});

describe("draftPrimer", () => {
  it("drafts from player-visible data only", () => {
    const { store, docs } = seed();
    const draft = draftPrimer({ maps: store.toJSON(), module, doc: (id) => docs.get(id), supplements: ["Thornwick Homebrew"] });
    const all = JSON.stringify(draft);
    for (const s of SECRETS) expect(all, s).not.toContain(s);
    expect(draft.welcome).toBe(`Welcome to **${store.meta().name}**, our Example campaign (default play).\n\nOur first story: **The Stolen Bell**.`);
    expect(draft.lore).toBe("- **1000-04-11**: The bell is stolen in the night.");
    expect(draft.places).toBe("### Places\n\n- **Thornwick**: A ford village with a stolen bell.\n\n### Factions\n\n- **The Ferrymen**: Keep the crossings.");
    expect(draft.characters).toContain("- **Starting level**: 3");
    expect(draft.characters).toContain("- **Supplements in use**: Thornwick Homebrew");
    expect(draft.characters).toContain("- **Characters so far**: Aria, Bren");
    expect(draft.opening).toBe("The bell of Thornwick is gone, and a stranger was seen at the ford.");
    // sections without campaign data are not drafted
    expect(draft.setting).toBeUndefined();
    expect(draft["house-rules"]).toBeUndefined();
  });

  it("is deterministic", () => {
    const { store, docs } = seed();
    const run = () => JSON.stringify(draftPrimer({ maps: store.toJSON(), module, doc: (id) => docs.get(id) }));
    expect(run()).toBe(run());
  });
});
