import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { ownerVisiblePaths, type EntityTypeDef, type GameModule } from "@campaign-forge/module-sdk";
import {
  CampaignStore,
  RichTextRegistry,
  SHARE_VIEWER,
  addPlayer,
  canSeeHandout,
  charactersOfMember,
  exportBundle,
  fromMarkdown,
  handoutStaysWithGm,
  importBundle,
  memberViewer,
  ownerMemberOf,
  packetBaseline,
  packetChanges,
  packetMessage,
  packetTitle,
  planPacket,
  playerPacketSnapshot,
  playerShareSnapshot,
  projectCampaignForViewer,
  projectEntityForViewer,
  recordShare,
  removePlayer,
  setCharacterOwner,
  setPlayerCharacters,
  shareBaseline,
  shareRecordOf,
  sheetValueText,
  viewerSheetOf,
  DEFAULT_PACKET_OPTIONS,
  type Id,
  type PacketModule,
} from "../src";
import { PERSON, PLACE, fixtureModule, newStore } from "./fixtures";

/** A character type whose player always sees `drive` and `journal.goal`, never `secret` or `journal.shame`. */
const HERO: EntityTypeDef = {
  id: "example.hero",
  kind: "character",
  name: "Hero",
  plural: "Heroes",
  schema: {
    type: "object",
    properties: {
      isPC: { type: "boolean" },
      role: { type: "string" },
      drive: { type: "string", "x-visibility": "owner" },
      journal: { type: "object", properties: { goal: { type: "string", "x-visibility": "owner" }, shame: { type: "string" } } },
      secret: { type: "string" },
      grit: { type: "number", "x-visibility": "owner" },
    },
  },
  sheet: {
    sections: [
      { id: "main", title: "Main", fields: [{ path: "role", label: "Role" }, { path: "drive", label: "Drive" }, { path: "journal.goal", label: "Goal" }, { path: "grit", label: "Grit" }] },
      { id: "gm", title: "GM-SECTION-TITLE", fields: [{ path: "secret", label: "Secret" }, { path: "role", label: "Role again" }] },
    ],
    summary: ["role", "drive"],
  },
  defaultVisibility: { drive: "gm", journal: "gm", secret: "gm", grit: "gm" },
};

const module: PacketModule = { entityTypes: [PERSON, PLACE, HERO], ownerHandouts: [{ kind: "card", when: "always" }, { kind: "agenda", when: "given" }] };

function seed() {
  const store = newStore("Packets");
  const registry = new RichTextRegistry();
  const write = (id: Id | undefined, md: string) => {
    if (id) fromMarkdown(registry.open(id), md);
  };
  const npc = store.createEntity({ type: PERSON.id, name: "SECRET-GM-NPC", visibility: { level: "gm" }, fields: { role: "SECRET-NPC-ROLE" } });
  const npcPortrait = store.insert("assets", { kind: "image", name: "npc.png", mime: "image/png", size: 1, visibility: { level: "gm" } });
  store.update("entities", npc.id, { image: npcPortrait.id });
  const heroA = store.createEntity({
    type: HERO.id,
    name: "Ada Vance",
    visibility: { level: "players" },
    fields: { isPC: true, role: "Pilot", drive: "ANA-OWNER-DRIVE", journal: { goal: "ANA-GOAL", shame: "SECRET-ANA-SHAME" }, secret: "SECRET-ANA-SECRET", grit: 3 },
  });
  const heroB = store.createEntity({
    type: HERO.id,
    name: "BEN-HIDDEN-PC",
    visibility: { level: "gm" },
    summary: "SECRET-BEN-PC-SUMMARY",
    fields: { isPC: true, role: "BEN-ROLE", drive: "BEN-OWNER-DRIVE", journal: { goal: "BEN-GOAL", shame: "SECRET-BEN-SHAME" }, secret: "SECRET-BEN-SECRET" },
    conditions: [{ id: "shaken", label: "BEN-CONDITION" }],
  });
  const ana = addPlayer(store, { name: "Ana", contact: "CONTACT-ANA", characters: [heroA.id] });
  const ben = addPlayer(store, { name: "Ben", contact: "CONTACT-BEN", characters: [heroB.id] });
  // a field of Ana's PC shared with Ben alone
  store.update("entities", heroA.id, { fieldVisibility: { "journal.shame": { level: "some_players", players: [ben.id] } } });

  const session = store.createSession({ number: 2, title: "Before the drop" });
  const pub = store.createHandout({ title: "Public notice", kind: "text", visibility: { level: "players" } });
  write(pub.bodyDoc, "Everyone may read this.");
  const anaOnly = store.createHandout({ title: "ANA-ONLY-HANDOUT", kind: "text", visibility: { level: "some_players", players: [ana.id] } });
  write(anaOnly.bodyDoc, `ANA-ONLY-BODY from [[${npc.id}|the stranger]].`);
  const gmImage = store.insert("assets", { kind: "image", name: "photo.png", mime: "image/png", size: 1, visibility: { level: "gm" } });
  const anaPhoto = store.createHandout({ title: "ANA-PHOTO", kind: "image", visibility: { level: "some_players", players: [ana.id] }, asset: gmImage.id });
  const anaAgenda = store.createHandout({ title: "ANA-AGENDA", kind: "agenda", character: heroA.id, visibility: { level: "some_players", players: [] } });
  store.update("handouts", anaAgenda.id, { toOwner: true });
  write(anaAgenda.bodyDoc, "ANA-AGENDA-BODY");
  const benUngiven = store.createHandout({ title: "SECRET-BEN-AGENDA-UNGIVEN", kind: "agenda", character: heroB.id, visibility: { level: "some_players", players: [] } });
  write(benUngiven.bodyDoc, "SECRET-BEN-AGENDA-UNGIVEN-BODY");
  const benCard = store.createHandout({ title: "BEN-CARD", kind: "card", character: heroB.id, visibility: { level: "gm" } });
  write(benCard.bodyDoc, "BEN-CARD-BODY");
  const gmOnly = store.createHandout({ title: "SECRET-GM-HANDOUT", kind: "text" });
  write(gmOnly.bodyDoc, "SECRET-GM-HANDOUT-BODY");
  const note = store.createNote({ title: "SECRET-GM-NOTE" });
  write(note.bodyDoc, "SECRET-GM-NOTE-BODY");
  return { store, registry, npc, npcPortrait, heroA, heroB, ana, ben, session, anaOnly, anaPhoto, anaAgenda, benUngiven, benCard, gmImage };
}

type Seed = ReturnType<typeof seed>;

function packet(s: Seed, memberId: Id, maps = s.store.toJSON()) {
  return playerPacketSnapshot({ maps, module, memberId, sessionId: s.session.id, doc: (id) => s.registry.open(id), at: "2026-11-07T19:00:00.000Z" });
}

const GM_SECRETS = ["SECRET-GM-NPC", "SECRET-NPC-ROLE", "SECRET-GM-HANDOUT", "SECRET-GM-NOTE", "SECRET-ANA-SECRET", "SECRET-BEN-SECRET", "SECRET-BEN-PC-SUMMARY", "SECRET-ANA-SHAME", "SECRET-BEN-SHAME", "SECRET-BEN-AGENDA-UNGIVEN", "CONTACT-ANA", "CONTACT-BEN", "GM-SECTION-TITLE", "BEN-ROLE"];
const ANA_PRIVATE = ["ANA-OWNER-DRIVE", "ANA-GOAL", "ANA-ONLY-HANDOUT", "ANA-ONLY-BODY", "ANA-PHOTO", "ANA-AGENDA"];
const BEN_PRIVATE = ["BEN-HIDDEN-PC", "BEN-OWNER-DRIVE", "BEN-GOAL", "BEN-CARD", "BEN-CONDITION"];

describe("sheetValueText", () => {
  const cx = {
    referenceName: (list: string, id: string) => ({ "x.careers": { "company-agent": "Company Agent" }, "x.talents": { "personal-safety": "Personal Safety" } } as Record<string, Record<string, string>>)[list]?.[id],
    entityName: (id: string) => (id === "01JB0000000000000000000000" ? "Bo Lantern" : undefined),
    isEntity: (id: string) => id === "01JB0000000000000000000000" || id === "01JC0000000000000000000000",
  };
  it("names reference ids, list rows with their count, and entity references", () => {
    expect(sheetValueText({ path: "career", widget: "select", options: { ref: "x.careers" } }, "company-agent", cx)).toBe("Company Agent");
    expect(sheetValueText({ path: "talents", widget: "talents", options: { ref: "x.talents" } }, [{ id: "personal-safety", count: 1 }], cx)).toBe("Personal Safety");
    expect(sheetValueText({ path: "talents", widget: "talents", config: { ref: "x.talents" } }, [{ id: "personal-safety", count: 2 }], cx)).toBe("Personal Safety ×2");
    expect(sheetValueText({ path: "gear", widget: "gear" }, [{ name: "Comm unit", qty: 1 }, { name: "Naproleve", qty: 4 }], cx)).toBe("Comm unit, Naproleve ×4");
    // a bare id of the list (a preset's talents), and a name the list does not know, kept as written
    expect(sheetValueText({ path: "talents", widget: "talents", options: { ref: "x.talents" } }, ["personal-safety", "Knife work"], cx)).toBe("Personal Safety, Knife work");
    expect(sheetValueText({ path: "buddy", widget: "ref" }, "01JB0000000000000000000000", cx)).toBe("Bo Lantern");
  });
  it("shows an older typed name in a ref field as written, never a hidden or missing record's id", () => {
    expect(sheetValueText({ path: "buddy", widget: "ref" }, "Parker", cx)).toBe("Parker");
    expect(sheetValueText({ path: "buddy", widget: "ref" }, "01JC0000000000000000000000", cx)).toBe("");
    expect(sheetValueText({ path: "buddy", widget: "ref" }, "01JD0000000000000000000000", cx)).toBe("");
  });
});

describe("enum labels in sheet text", () => {
  const cx = { entityName: () => undefined };
  const schema = { type: "string", enum: ["outer-rim"], enumLabels: ["Outer Rim"] };
  it("names an enum value by the schema's labels; without labels a select is humanized", () => {
    expect(sheetValueText({ path: "region", widget: "select" }, "outer-rim", cx, schema)).toBe("Outer Rim");
    expect(sheetValueText({ path: "region", widget: "select" }, "outer-rim", cx)).toBe("Outer rim");
    expect(sheetValueText({ path: "regions", widget: "multiselect" }, ["outer-rim"], cx, { type: "array", items: schema })).toBe("Outer Rim");
  });
});

describe("viewerSheetOf (preview as player)", () => {
  const cx = { entityName: () => undefined };
  it("shows a player the sheet the projection leaves, GM sections dropped whole", () => {
    const s = seed();
    const maps = s.store.toJSON();
    const view = viewerSheetOf(s.heroA, module, maps, { role: "player" }, cx)!;
    expect(view.name).toBe("Ada Vance");
    const text = JSON.stringify(view);
    expect(text).toContain("Pilot");
    for (const secret of ["SECRET-ANA-SECRET", "SECRET-ANA-SHAME", "ANA-OWNER-DRIVE", "ANA-GOAL", "GM-SECTION-TITLE"]) expect(text).not.toContain(secret);
  });
  it("is undefined for an entity players cannot see, and hides a GM-only portrait", () => {
    const s = seed();
    const maps = s.store.toJSON();
    expect(viewerSheetOf(s.npc, module, maps, { role: "player" }, cx)).toBeUndefined();
    const visible = s.store.update("entities", s.npc.id, { visibility: { level: "players" } })!;
    const view = viewerSheetOf(visible, module, s.store.toJSON(), { role: "player" }, cx)!;
    // the portrait asset stays GM-only; the fields follow the entity's visibility
    expect(view.portrait).toBeUndefined();
    expect(JSON.stringify(view)).toContain("SECRET-NPC-ROLE");
  });
});

describe("owner-visible fields", () => {
  it("collects x-visibility owner paths from the schema", () => {
    expect(ownerVisiblePaths(HERO)).toEqual(["drive", "grit", "journal.goal"]);
    expect(ownerVisiblePaths(PERSON)).toEqual([]);
  });

  it("shows a PC's own player its owner fields, nobody else", () => {
    const s = seed();
    const maps = s.store.toJSON();
    const ana = projectEntityForViewer(maps.entities[s.heroA.id]!, HERO, memberViewer(maps, s.ana.id));
    expect(ana?.fields).toEqual({ isPC: true, role: "Pilot", drive: "ANA-OWNER-DRIVE", journal: { goal: "ANA-GOAL" }, grit: 3 });
    const benSeesAna = projectEntityForViewer(maps.entities[s.heroA.id]!, HERO, memberViewer(maps, s.ben.id));
    // Ben gets the field shared with him, not Ana's owner fields
    expect(benSeesAna?.fields).toEqual({ isPC: true, role: "Pilot", journal: { shame: "SECRET-ANA-SHAME" } });
    const group = projectEntityForViewer(maps.entities[s.heroA.id]!, HERO, SHARE_VIEWER);
    expect(group?.fields).toEqual({ isPC: true, role: "Pilot" });
  });

  it("gives the player a GM-only PC they play: name, conditions and owner fields only", () => {
    const s = seed();
    const maps = s.store.toJSON();
    const ben = projectEntityForViewer(maps.entities[s.heroB.id]!, HERO, memberViewer(maps, s.ben.id));
    expect(ben?.name).toBe("BEN-HIDDEN-PC");
    expect(ben?.summary).toBeUndefined();
    expect(ben?.fields).toEqual({ drive: "BEN-OWNER-DRIVE", journal: { goal: "BEN-GOAL" } });
    expect(ben?.conditions?.map((c) => c.label)).toEqual(["BEN-CONDITION"]);
    expect(projectEntityForViewer(maps.entities[s.heroB.id]!, HERO, memberViewer(maps, s.ana.id))).toBeUndefined();
  });

  it("lets a GM override on the entity win over the owner mark", () => {
    const s = seed();
    s.store.update("entities", s.heroA.id, { fieldVisibility: { drive: { level: "gm" } } });
    const maps = s.store.toJSON();
    const ana = projectEntityForViewer(maps.entities[s.heroA.id]!, HERO, memberViewer(maps, s.ana.id));
    expect(ana?.fields["drive"]).toBeUndefined();
    expect(ana?.fields["grit"]).toBe(3);
  });
});

describe("handouts for one player", () => {
  it("follows some_players, the give toggle and the module's always kinds", () => {
    const s = seed();
    const maps = s.store.toJSON();
    const ana = memberViewer(maps, s.ana.id);
    const ben = memberViewer(maps, s.ben.id);
    const sees = (h: { id: Id }, v: typeof ana) => canSeeHandout(maps.handouts[h.id]!, v, maps, module);
    expect(sees(s.anaOnly, ana)).toBe(true);
    expect(sees(s.anaOnly, ben)).toBe(false);
    expect(sees(s.anaAgenda, ana)).toBe(true);
    expect(sees(s.anaAgenda, ben)).toBe(false);
    expect(sees(s.benUngiven, ben)).toBe(false);
    expect(sees(s.benCard, ben)).toBe(true);
    expect(sees(s.benCard, ana)).toBe(false);
    for (const h of [s.anaOnly, s.anaAgenda, s.benCard]) expect(sees(h, SHARE_VIEWER)).toBe(false);
  });
});

describe("handouts a module keeps with the GM", () => {
  it("never gives a GM-only purpose to the player, even with the toggle set", () => {
    const s = seed();
    const gmCard = s.store.createHandout({ title: "SECRET-GM-CARD", kind: "agenda", character: s.heroA.id, purpose: "gm-card", visibility: { level: "gm" } });
    s.store.update("handouts", gmCard.id, { toOwner: true });
    const strict: PacketModule = { ...module, ownerHandouts: [{ kind: "agenda", when: "given", gmOnlyPurposes: ["gm-card"], gmOnlyNote: "Stays with you." }] };
    const maps = s.store.toJSON();
    const ana = memberViewer(maps, s.ana.id);
    expect(handoutStaysWithGm(maps.handouts[gmCard.id]!, strict)).toBe("Stays with you.");
    expect(handoutStaysWithGm(maps.handouts[s.anaAgenda.id]!, strict)).toBeUndefined();
    expect(canSeeHandout(maps.handouts[gmCard.id]!, ana, maps, strict)).toBe(false);
    expect(canSeeHandout(maps.handouts[s.anaAgenda.id]!, ana, maps, strict)).toBe(true);
    // without the mark the toggle would have given it
    expect(canSeeHandout(maps.handouts[gmCard.id]!, ana, maps, module)).toBe(true);
    const p = playerPacketSnapshot({ maps, module: strict, memberId: s.ana.id, sessionId: s.session.id, doc: (id) => s.registry.open(id), at: "t" });
    expect(JSON.stringify(p)).not.toContain("SECRET-GM-CARD");
  });

  it("never shows a handout the module keeps with the GM, even once revealed to everyone", () => {
    const s = seed();
    const gmCard = s.store.createHandout({ title: "SECRET-GM-CARD", kind: "agenda", character: s.heroA.id, purpose: "gm-card", visibility: { level: "gm" } });
    s.store.update("handouts", gmCard.id, { visibility: { level: "revealed", revealedIn: s.session.id } });
    const strict: PacketModule = { ...module, ownerHandouts: [{ kind: "agenda", when: "given", gmOnlyPurposes: ["gm-card"], gmOnlyNote: "Stays with you." }] };
    const maps = s.store.toJSON();
    const h = maps.handouts[gmCard.id]!;
    expect(canSeeHandout(h, { role: "gm" }, maps, strict)).toBe(true);
    expect(canSeeHandout(h, { role: "player" }, maps, strict)).toBe(false);
    expect(canSeeHandout(h, memberViewer(maps, s.ana.id), maps, strict)).toBe(false);
    expect(canSeeHandout(h, memberViewer(maps, s.ben.id), maps, strict)).toBe(false);
    for (const memberId of [s.ana.id, s.ben.id]) {
      const p = playerPacketSnapshot({ maps, module: strict, memberId, sessionId: s.session.id, doc: (id) => s.registry.open(id), at: "t" });
      expect(JSON.stringify(p)).not.toContain("SECRET-GM-CARD");
    }
  });
});

describe("playerPacketSnapshot", () => {
  it("holds the player's own material and the group's, and nothing GM-only or another player's", () => {
    const s = seed();
    const a = packet(s, s.ana.id);
    const b = packet(s, s.ben.id);
    const ja = JSON.stringify(a);
    const jb = JSON.stringify(b);
    for (const x of ANA_PRIVATE) expect(ja, x).toContain(x);
    for (const x of BEN_PRIVATE) expect(jb, x).toContain(x);
    for (const x of [...GM_SECRETS, ...BEN_PRIVATE]) expect(ja, x).not.toContain(x);
    for (const x of [...GM_SECRETS.filter((g) => g !== "SECRET-ANA-SHAME"), ...ANA_PRIVATE]) expect(jb, x).not.toContain(x);
    // no links to hidden entities and no ids of GM-only images, except a handout's own image
    expect(ja).not.toContain(s.npc.id);
    expect(ja).not.toContain(s.npcPortrait.id);
    expect(jb).not.toContain(s.gmImage.id);
    expect(ja).toContain(s.gmImage.id);
    expect(a.for).toBe("Ana");
    expect(packetTitle(a)).toBe("Packets for Ana");
    expect(a.handouts.find((h) => h.title === "Public notice")?.personal).toBeUndefined();
    expect(a.handouts.filter((h) => h.personal).map((h) => h.title)).toEqual(expect.arrayContaining(["ANA-ONLY-HANDOUT", "ANA-PHOTO", "ANA-AGENDA"]));
    expect(a.handouts[0]?.personal).toBe(true);
    expect(a.characters.map((c) => c.name)).toEqual(["Ada Vance"]);
    expect(a.characters[0]!.sections).toEqual([{ title: "Main", rows: [{ label: "Role", value: "Pilot" }, { label: "Drive", value: "ANA-OWNER-DRIVE" }, { label: "Goal", value: "ANA-GOAL" }, { label: "Grit", value: "3" }] }]);
    expect(b.characters[0]!.sections).toEqual([{ title: "Main", rows: [{ label: "Drive", value: "BEN-OWNER-DRIVE" }, { label: "Goal", value: "BEN-GOAL" }] }]);
    expect(b.characters[0]!.conditions).toEqual(["BEN-CONDITION"]);
  });

  it("matches the projection it is built from, and the group share stays without any of it", () => {
    const s = seed();
    const maps = s.store.toJSON();
    const proj = JSON.stringify(projectCampaignForViewer(maps, module, memberViewer(maps, s.ana.id)));
    for (const x of [...GM_SECRETS, ...BEN_PRIVATE]) expect(proj, x).not.toContain(x);
    expect(proj).not.toContain(s.npcPortrait.id);
    const group = JSON.stringify(playerShareSnapshot({ maps, module, sessionId: s.session.id, doc: (id) => s.registry.open(id), at: "t" }));
    for (const x of [...GM_SECRETS, ...ANA_PRIVATE, ...BEN_PRIVATE]) expect(group, x).not.toContain(x);
  });

  it("is deterministic and refuses a non-player", () => {
    const s = seed();
    expect(JSON.stringify(packet(s, s.ana.id))).toBe(JSON.stringify(packet(s, s.ana.id)));
    const gm = s.store.meta().members.find((m) => m.role === "gm")!;
    expect(() => packet(s, gm.id)).toThrow(/not a player/);
  });

  it("plans what is new per player and words the message", () => {
    const s = seed();
    const a = packet(s, s.ana.id);
    const first = planPacket(a, packetBaseline(s.store.list("sessions"), s.ana.id), DEFAULT_PACKET_OPTIONS);
    expect(packetMessage(first)).toBe("Packets for Ana, Session 2: your sheet and 4 handouts (3 just for you).");
    recordShare(s.store, s.session.id, shareRecordOf(first, { format: "page", member: s.ana.id }));
    // the group's baseline does not count a player's packet, and Ben's does not count Ana's
    expect(shareBaseline(s.store.list("sessions")).count).toBe(0);
    expect(packetBaseline(s.store.list("sessions"), s.ben.id).count).toBe(0);
    const base = packetBaseline(s.store.list("sessions"), s.ana.id);
    expect(base.count).toBe(1);
    const fresh = s.store.createHandout({ title: "Second note", kind: "text", visibility: { level: "some_players", players: [s.ana.id] } });
    const next = planPacket(packet(s, s.ana.id), base, { ...DEFAULT_PACKET_OPTIONS, onlyNew: true });
    expect(next.share.handouts.map((h) => h.id)).toEqual([fresh.id]);
    expect(next.share.characters).toHaveLength(1);
    expect(packetChanges(next, base)).toBe("1 new handout (1 just for them)");
  });
});

describe("members", () => {
  it("keeps ownership on the character, reads a member's earlier characterId, and moves a PC between players", () => {
    const s = seed();
    const heroC = s.store.createEntity({ type: HERO.id, name: "Cleo's PC", visibility: { level: "players" }, fields: { isPC: true } });
    s.store.updateMeta({ members: [...s.store.meta().members, { id: "legacy-cleo", name: "Cleo", role: "player", characterId: heroC.id }] });
    expect(ownerMemberOf(s.store.meta(), s.store.get("entities", heroC.id)!)?.name).toBe("Cleo");
    expect(charactersOfMember(s.store.toJSON(), "legacy-cleo")).toEqual([heroC.id]);
    setCharacterOwner(s.store, heroC.id, s.ana.id);
    expect(s.store.meta().members.find((m) => m.id === "legacy-cleo")?.characterId).toBeUndefined();
    expect(charactersOfMember(s.store.toJSON(), s.ana.id).sort()).toEqual([s.heroA.id, heroC.id].sort());
    setPlayerCharacters(s.store, s.ana.id, [heroC.id]);
    expect(s.store.get("entities", s.heroA.id)?.ownerMemberId).toBeUndefined();
  });

  it("removing a player unowns their PCs and never widens what they had alone", () => {
    const s = seed();
    removePlayer(s.store, s.ana.id);
    expect(s.store.meta().members.some((m) => m.id === s.ana.id)).toBe(false);
    expect(s.store.get("entities", s.heroA.id)?.ownerMemberId).toBeUndefined();
    expect(s.store.get("handouts", s.anaOnly.id)?.visibility).toEqual({ level: "some_players", players: [] });
    const maps = s.store.toJSON();
    expect(canSeeHandout(maps.handouts[s.anaOnly.id]!, memberViewer(maps, s.ben.id), maps, module)).toBe(false);
    expect(s.store.get("entities", s.heroA.id)?.fieldVisibility?.["journal.shame"]?.players).toEqual([s.ben.id]);
  });

  it("survives the export bundle with new ids: members, ownership and shares stay linked", async () => {
    const s = seed();
    const bytes = await exportBundle(s.store, s.registry, undefined, { id: fixtureModule.manifest.id, version: fixtureModule.manifest.version });
    const imported = await importBundle(bytes, { onConflict: "new-id" });
    const store: CampaignStore = imported.store;
    const ana = store.meta().members.find((m) => m.name === "Ana")!;
    expect(ana.id).not.toBe(s.ana.id);
    expect(ana.contact).toBe("CONTACT-ANA");
    const registry = new RichTextRegistry();
    for (const [id, md] of imported.docs) fromMarkdown(registry.open(id), md);
    const maps = store.toJSON();
    const session = Object.values(maps.sessions)[0]!;
    const p = playerPacketSnapshot({ maps, module, memberId: ana.id, sessionId: session.id, doc: (id) => registry.open(id), at: "t" });
    const json = JSON.stringify(p);
    for (const x of ANA_PRIVATE) expect(json, x).toContain(x);
    // the bundle stores a reference with the entity's name as its label, and a shared handout's text is the GM's to share: only the link (the id) never goes out
    for (const x of [...GM_SECRETS.filter((g) => g !== "SECRET-GM-NPC"), ...BEN_PRIVATE]) expect(json, x).not.toContain(x);
    const npc = Object.values(maps.entities).find((e) => e.name === "SECRET-GM-NPC")!;
    expect(json).not.toContain(npc.id);
  });
});

// the fixture module's own type stays usable as a PC without owner marks
describe("modules without owner marks", () => {
  it("still gives a PC's player their PC and shared handouts", () => {
    const store = newStore();
    const pc = store.createEntity({ type: PERSON.id, name: "Okafor", visibility: { level: "players" }, fields: { role: "marshal", secret: "SECRET-X" } });
    const p = addPlayer(store, { name: "Kim", characters: [pc.id] });
    const session = store.createSession({});
    const m: GameModule["entityTypes"] = fixtureModule.entityTypes;
    const out = playerPacketSnapshot({ maps: store.toJSON(), module: { entityTypes: m }, memberId: p.id, sessionId: session.id, doc: () => undefined, at: "t" });
    expect(out.characters[0]?.sections[0]?.rows).toEqual([{ label: "Role", value: "marshal" }]);
    expect(JSON.stringify(out)).not.toContain("SECRET-X");
  });
});
