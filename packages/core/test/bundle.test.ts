import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import {
  AssetStore,
  RichTextRegistry,
  applyImportedDocs,
  docIdsOf,
  exportBundle,
  exportJSON,
  exportMarkdown,
  fromMarkdown,
  importBundle,
  toMarkdown,
} from "../src";
import { PERSON, fixtureModule, newStore } from "./fixtures";

function seed() {
  const store = newStore("Skyfire Down");
  const registry = new RichTextRegistry();
  const okafor = store.createEntity({
    type: PERSON.id,
    name: "Okafor",
    summary: "Tired marshal",
    tags: ["npc"],
    fields: { role: "marshal", secret: "on the take", stats: { grit: 4, wit: 2 }, extra: "unlisted" },
    conditions: [{ id: "tired", label: "Tired" }],
  });
  const bar = store.createEntity({ type: "example.place", name: "The Bar", subtype: "town", fields: { climate: "smoky" } });
  store.createRelationship("within", okafor.id, bar.id);
  const adv = store.createAdventure({ title: "Skyfire Down", premise: "A ship falls.", withDocs: true, hooksIn: ["The crash"] });
  const act = store.createAct(adv.id, { goal: "Reach the wreck", title: "Descent", withPacingDoc: true });
  const scene = store.createScene(act.id, { title: "At the bar", purpose: "Meet Okafor", location: bar.id, participants: [okafor.id], withReadAloudDoc: true, events: [{ id: "e1", text: "Okafor arrives", mandatory: true }] });
  const handout = store.createHandout({ title: "Agenda", kind: "agenda", character: okafor.id, attachedTo: { kind: "act", id: act.id } });
  const note = store.createNote({ title: "Plans", attachedTo: { kind: "entity", id: okafor.id } });
  const session = store.createSession({ title: "First night" });
  const asset = store.insert("assets", { kind: "image", name: "map.png", mime: "image/png", size: 3, visibility: { level: "gm" } });
  fromMarkdown(registry.open(adv.playerIntroDoc!), "You are **falling**.");
  fromMarkdown(registry.open(adv.gmSituationDoc!), `The marshal [[${okafor.id}|Okafor]] knows.`);
  fromMarkdown(registry.open(adv.epilogueDoc!), "Credits roll.");
  fromMarkdown(registry.open(act.pacingDoc!), "- fast\n- faster");
  fromMarkdown(registry.open(scene.bodyDoc), `# Setup\n\nTalk to [[${okafor.id}|Okafor]] at [[${bar.id}|The Bar]].\n\n> trigger: a shot`);
  fromMarkdown(registry.open(scene.readAloudDoc!), "The bar smells of *smoke*.");
  fromMarkdown(registry.open(handout.bodyDoc!), "Keep the colony out of the news.");
  fromMarkdown(registry.open(note.bodyDoc), `[[${okafor.id}|Okafor]] owes [[${bar.id}|The Bar]] money.`);
  fromMarkdown(registry.open(session.logDoc), "1. arrived\n2. drank");
  return { store, registry, okafor, bar, adv, act, scene, handout, note, session, asset };
}

describe("bundle", () => {
  it("exports a zip and imports it back with every map and note body", async () => {
    const s = seed();
    const assets = new AssetStore(s.store.id);
    await assets.put(s.asset.id, new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }));
    const bytes = await exportBundle(s.store, s.registry, assets, { id: "example", version: "0.1.0" });
    const files = unzipSync(bytes);
    const names = Object.keys(files).sort();
    expect(names).toContain("campaign.json");
    expect(names).toContain("README.md");
    expect(names).toContain(`assets/${s.asset.id}.png`);
    const docIds = docIdsOf(s.store.toJSON());
    expect(docIds).toHaveLength(9);
    for (const id of docIds) expect(names).toContain(`notes/${id}.md`);
    expect(strFromU8(files["README.md"]!)).toContain("example 0.1.0");
    expect(strFromU8(files[`notes/${s.note.bodyDoc}.md`]!)).toBe(`[[${s.okafor.id}|Okafor]] owes [[${s.bar.id}|The Bar]] money.`);

    const imported = await importBundle(bytes);
    expect(imported.manifest).toMatchObject({ format: "campaign-forge-bundle", formatVersion: 1, moduleId: "example", moduleVersion: "0.1.0", campaignId: s.store.id, campaignName: "Skyfire Down" });
    expect(imported.store.toJSON()).toEqual(s.store.toJSON());
    expect(imported.store.id).toBe(s.store.id);
    expect([...imported.docs.keys()].sort()).toEqual([...docIds].sort());
    expect(imported.assets.get(s.asset.id)?.meta).toEqual(s.asset);
    expect(new Uint8Array(await imported.assets.get(s.asset.id)!.blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));

    const registry2 = new RichTextRegistry();
    await applyImportedDocs(registry2, imported.docs);
    const resolve = (id: string) => s.store.get("entities", id)?.name ?? id;
    for (const id of docIds) {
      expect(toMarkdown(registry2.open(id), resolve)).toBe(toMarkdown(s.registry.open(id), resolve));
    }
    expect(JSON.parse(exportJSON(s.store))).toEqual(s.store.toJSON());
    await assets.close();
  });

  it("remaps every id with onConflict new-id", async () => {
    const s = seed();
    const bytes = await exportBundle(s.store, s.registry, undefined, { id: "example", version: "0.1.0" });
    const imported = await importBundle(bytes, { onConflict: "new-id" });
    expect(imported.store.id).not.toBe(s.store.id);
    const maps = imported.store.toJSON();
    const newOkafor = imported.idMap[s.okafor.id]!;
    const newBar = imported.idMap[s.bar.id]!;
    expect(maps.entities[newOkafor]?.name).toBe("Okafor");
    expect(Object.values(maps.relationships)[0]).toMatchObject({ from: newOkafor, to: newBar });
    const newScene = maps.scenes[imported.idMap[s.scene.id]!]!;
    expect(newScene.participants).toEqual([newOkafor]);
    expect(newScene.location).toBe(newBar);
    expect(newScene.act).toBe(imported.idMap[s.act.id]);
    expect(maps.acts[imported.idMap[s.act.id]!]?.scenes).toEqual([newScene.id]);
    expect(newScene.bodyDoc).toBe(imported.idMap[s.scene.bodyDoc]);
    expect(imported.docs.get(newScene.bodyDoc)).toContain(`[[${newOkafor}|Okafor]]`);
    expect(JSON.stringify(maps)).not.toContain(s.okafor.id);
    expect(maps.meta.members[0]?.id).not.toBe(s.store.meta().members[0]?.id);
    expect(() => importBundle(new Uint8Array([1, 2]))).rejects.toThrow();
  });

  it("renders an adventure booklet and an entity sheet as markdown", () => {
    const s = seed();
    const booklet = exportMarkdown(s.store, s.registry, { kind: "adventure", id: s.adv.id }, fixtureModule);
    expect(booklet).toContain("# Skyfire Down\n\nA ship falls.");
    expect(booklet).toContain("- The crash");
    expect(booklet).toContain("## Player introduction\n\nYou are **falling**.");
    expect(booklet).toContain("## The situation (GM)\n\nThe marshal [[" + s.okafor.id + "|Okafor]] knows.");
    expect(booklet).toContain("## Act 1: Descent\n\n**Goal:** Reach the wreck\n\n- fast\n- faster");
    expect(booklet).toContain("### Agenda\n\n*Handout (agenda, gm) for Okafor*\n\nKeep the colony out of the news.");
    expect(booklet).toContain("### At the bar\n\n- **Purpose:** Meet Okafor\n- **Location:** The Bar\n- **Participants:** Okafor");
    expect(booklet).toContain("> The bar smells of *smoke*.");
    expect(booklet).toContain("# Setup\n\nTalk to [[");
    expect(booklet).toContain("#### Events\n\n- [ ] Okafor arrives (mandatory)");
    expect(booklet).toContain("## Epilogue\n\nCredits roll.");
    expect(booklet.indexOf("Player introduction")).toBeLessThan(booklet.indexOf("Act 1"));
    expect(booklet.indexOf("Act 1")).toBeLessThan(booklet.indexOf("Epilogue"));

    const sheet = exportMarkdown(s.store, s.registry, { kind: "entity", id: s.okafor.id }, fixtureModule);
    expect(sheet).toBe(
      [
        "# Okafor",
        "",
        "*Person*",
        "",
        "Tired marshal",
        "",
        "Tags: npc",
        "",
        "## Main",
        "",
        "- **Role:** marshal",
        "- **Grit:** 4",
        "- **Wit:** 2",
        "",
        "## GM",
        "",
        "- **Secret:** on the take",
        "",
        "## Other fields",
        "",
        "- **extra:** unlisted",
        "",
        "Conditions: Tired",
        "",
      ].join("\n"),
    );
    expect(exportMarkdown(s.store, s.registry, { kind: "entity", id: s.bar.id }, fixtureModule)).toContain("*Place (Town)*");
    expect(exportMarkdown(s.store, s.registry, { kind: "scene", id: s.scene.id })).toMatch(/^# At the bar/);
    expect(exportMarkdown(s.store, s.registry, { kind: "handout", id: s.handout.id })).toContain("Keep the colony");
  });
});
