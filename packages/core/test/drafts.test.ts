import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  CampaignStore,
  RichTextRegistry,
  addPlayer,
  clearGeneratorDraft,
  draftIsOpen,
  draftOfferRecords,
  exportBundle,
  generatorDraftOf,
  generatorDrafts,
  importBundle,
  markDraftAccepted,
  markDraftOffer,
  openDraftOffers,
  playerPacketSnapshot,
  playerShareSnapshot,
  projectCampaignForViewer,
  saveGeneratorDraft,
  type GeneratorDraftInput,
} from "../src";
import { PERSON, fixtureModule, newStore } from "./fixtures";

const module = { entityTypes: [PERSON] };

const draft = (procedure: string, extra: Partial<GeneratorDraftInput> = {}): GeneratorDraftInput => ({
  procedure,
  moduleId: "example",
  moduleVersion: "0.1.0",
  seed: "SECRET-DRAFT-SEED",
  inputs: { pcs: 4, note: "SECRET-DRAFT-INPUT" },
  pinned: { title: "SECRET-PINNED" },
  edits: { agenda: { "a/goal": "SECRET-GM-WORDING" } },
  ...extra,
});

describe("generator drafts", () => {
  it("keep one draft per procedure, replaced whole, and survive the campaign being reopened from its JSON", () => {
    const store = newStore();
    saveGeneratorDraft(store, draft("example.board", { stepSeeds: { a: "x" }, source: "pick:job:1" }));
    saveGeneratorDraft(store, draft("example.other", { seed: "other-seed" }));
    // writing again replaces: fields left out are gone
    const again = saveGeneratorDraft(store, draft("example.board", { seed: "second" }));
    expect(store.list("generatorDrafts")).toHaveLength(2);
    expect(again.seed).toBe("second");
    expect(again.stepSeeds).toBeUndefined();
    expect(again.source).toBeUndefined();

    const reopened = CampaignStore.fromJSON(JSON.parse(JSON.stringify(store.toJSON())));
    expect(generatorDraftOf(reopened, "example.board")).toMatchObject({ seed: "second", inputs: { pcs: 4 }, pinned: { title: "SECRET-PINNED" }, edits: { agenda: { "a/goal": "SECRET-GM-WORDING" } } });
    expect(generatorDraftOf(reopened, "example.other")?.seed).toBe("other-seed");
    expect(generatorDraftOf(reopened, "example.none")).toBeUndefined();

    // each campaign has its own
    const other = newStore("Another campaign");
    expect(generatorDraftOf(other, "example.board")).toBeUndefined();

    expect(clearGeneratorDraft(store, "example.board")).toBe(true);
    expect(generatorDraftOf(store, "example.board")).toBeUndefined();
    expect(generatorDrafts(store).map((d) => d.procedure)).toEqual(["example.other"]);
  });

  it("drops a duplicate draft for the same procedure (two devices merged)", () => {
    const store = newStore();
    store.insert("generatorDrafts", draft("example.board", { seed: "a" }));
    store.insert("generatorDrafts", draft("example.board", { seed: "b" }));
    saveGeneratorDraft(store, draft("example.board", { seed: "c" }));
    expect(store.list("generatorDrafts").map((d) => d.seed)).toEqual(["c"]);
  });

  it("marks offers one by one and the whole run accepted; open offers and records follow", () => {
    const store = newStore();
    saveGeneratorDraft(store, draft("example.board"));
    markDraftOffer(store, "example.board", "offer-1", { as: "accept", record: "JOB1", name: "The ore run", run: "RUN1" });
    markDraftOffer(store, "example.board", "offer-3", { as: "discard" });
    const d = generatorDraftOf(store, "example.board")!;
    expect(d.offers?.["offer-1"]).toMatchObject({ as: "accept", record: "JOB1", name: "The ore run", run: "RUN1" });
    expect(typeof d.offers?.["offer-1"]?.at).toBe("string");
    expect(openDraftOffers(d, ["offer-1", "offer-2", "offer-3"])).toEqual(["offer-2"]);
    expect(draftIsOpen(d, ["offer-1", "offer-2", "offer-3"])).toBe(true);
    expect(draftOfferRecords(d)).toEqual(["JOB1"]);
    markDraftOffer(store, "example.board", "offer-2", { as: "keep", record: "JOB2" });
    expect(draftIsOpen(generatorDraftOf(store, "example.board")!, ["offer-1", "offer-2", "offer-3"])).toBe(false);
    // putting a discarded offer back
    markDraftOffer(store, "example.board", "offer-3", undefined);
    expect(generatorDraftOf(store, "example.board")!.offers?.["offer-3"]).toBeUndefined();

    saveGeneratorDraft(store, draft("example.run"));
    expect(draftIsOpen(generatorDraftOf(store, "example.run")!)).toBe(true);
    markDraftAccepted(store, "example.run", { run: "RUN9", detail: { written: ["A"] } });
    expect(generatorDraftOf(store, "example.run")!.accepted).toMatchObject({ run: "RUN9", detail: { written: ["A"] } });
    expect(draftIsOpen(generatorDraftOf(store, "example.run")!)).toBe(false);
    expect(markDraftOffer(store, "example.none", "x", { as: "discard" })).toBeUndefined();

    // a board's own offer keys decide whether it is still open
    saveGeneratorDraft(store, draft("example.keys", { offerKeys: ["a", "b"] }));
    markDraftOffer(store, "example.keys", "a", { as: "accept" });
    expect(draftIsOpen(generatorDraftOf(store, "example.keys")!)).toBe(true);
    markDraftOffer(store, "example.keys", "b", { as: "discard" });
    expect(draftIsOpen(generatorDraftOf(store, "example.keys")!)).toBe(false);
  });

  it("never reach players: the player projection, shares and packets hold no draft", () => {
    const store = newStore();
    const registry = new RichTextRegistry();
    const ana = addPlayer(store, { name: "Ana" });
    const session = store.createSession({ number: 1, date: "2026-11-07" });
    saveGeneratorDraft(store, draft("example.board"));
    markDraftOffer(store, "example.board", "offer-1", { as: "accept", name: "SECRET-TAKEN-NAME" });
    const maps = store.toJSON();
    expect(Object.keys(maps.generatorDrafts)).toHaveLength(1);
    for (const viewer of [{ role: "player" as const }, { role: "player" as const, memberId: ana.id }]) {
      const projected = projectCampaignForViewer(maps, module, viewer);
      expect(projected.generatorDrafts).toEqual({});
      expect(JSON.stringify(projected)).not.toContain("SECRET");
    }
    const share = JSON.stringify(playerShareSnapshot({ maps, module: fixtureModule, sessionId: session.id, doc: (id) => registry.open(id), at: "t" }));
    const packet = JSON.stringify(playerPacketSnapshot({ maps, module: fixtureModule, memberId: ana.id, sessionId: session.id, doc: (id) => registry.open(id), at: "t" }));
    for (const out of [share, packet]) expect(out).not.toContain("SECRET");
  });

  it("round-trip in bundles (the GM's backup), ids remapped with the rest on a new-id import", async () => {
    const store = newStore();
    const person = store.createEntity({ type: PERSON.id, name: "Mara" });
    saveGeneratorDraft(store, draft("example.board", { within: person.id }));
    markDraftOffer(store, "example.board", "offer-1", { as: "accept", record: person.id });
    const bytes = await exportBundle(store, new RichTextRegistry(), undefined, { id: "example", version: "0.1.0" });
    const same = await importBundle(bytes);
    expect(generatorDraftOf(same.store, "example.board")).toMatchObject({ seed: "SECRET-DRAFT-SEED", within: person.id, offers: { "offer-1": { record: person.id } } });
    const remapped = await importBundle(bytes, { onConflict: "new-id" });
    const d = generatorDraftOf(remapped.store, "example.board")!;
    const newPerson = remapped.store.list("entities")[0]!.id;
    expect(newPerson).not.toBe(person.id);
    expect(d.within).toBe(newPerson);
    expect(d.offers?.["offer-1"]?.record).toBe(newPerson);
  });
});
