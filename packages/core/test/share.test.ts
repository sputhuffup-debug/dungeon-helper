import { describe, expect, it } from "vitest";
import type { MapGeneratorDef, MapZoneData, SiteLayout } from "@campaign-forge/module-sdk";
import * as Y from "yjs";
import {
  CampaignStore,
  defaultShareOptions,
  docFromMarkdown,
  planShare,
  playerShareSnapshot,
  recordShare,
  revealZones,
  shareBaseline,
  shareMessage,
  shareRecordOf,
  startLive,
  type Id,
  type ModuleTypes,
} from "../src";
import { PERSON, fixtureModule, newStore } from "./fixtures";

/** Strings planted in GM-only places; none may reach a share. */
const SECRETS = [
  "SECRET-GM-FIELD",
  "SECRET-GM-PLAN",
  "SECRET-SCENE-NOTES",
  "SECRET-GM-SITUATION",
  "SECRET-HIDDEN-HANDOUT",
  "SECRET-HIDDEN-HANDOUT-BODY",
  "SECRET-AGENDA",
  "SECRET-GM-NPC",
  "SECRET-ZONE-GMNOTE",
  "SECRET-ZONE-NAME",
  "SECRET-SPAWN",
  "SECRET-CLUE",
  "SECRET-GM-TOKEN",
  "SECRET-GM-LEGEND",
  "SECRET-SESSION-LOG",
  "SECRET-NOTE",
  "SECRET-OTHER-CAMPAIGN",
  "SECRET-GM-PORTRAIT",
];

const sq = (x: number, y: number, w = 4, h = 4): Array<[number, number]> => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];
const zone = (id: string, x: number, extra: Partial<MapZoneData> = {}): MapZoneData => ({ id, deck: "d1", kind: "room", layer: "floor", poly: sq(x, 0), cluttered: false, ...extra });

function layout(): SiteLayout {
  return {
    decks: [
      { id: "d1", name: "Main deck", width: 20, height: 6 },
      { id: "d2", name: "Lower deck", width: 10, height: 6 },
    ],
    zones: [
      zone("A", 0, { key: true, name: "Airlock", playerNote: "Cold air", gmNote: "SECRET-ZONE-GMNOTE" }),
      zone("B", 4, { gmNote: "SECRET-ZONE-GMNOTE", details: ["SECRET-ZONE-GMNOTE"] }),
      zone("C", 8, { key: true, name: "SECRET-ZONE-NAME" }),
      zone("L", 0, { deck: "d2", key: true, name: "SECRET-ZONE-NAME" }),
    ],
    borders: [
      { id: "ab", a: "A", b: "B", kind: "open", segment: [[4, 0], [4, 4]] },
      { id: "bc", a: "B", b: "C", kind: "door", segment: [[8, 0], [8, 4]], lock: "electronic", lockedInActs: [1] },
    ],
    markers: [
      { id: "m1", kind: "spawn", zone: "A", label: "SECRET-SPAWN", gmOnly: false },
      { id: "m2", kind: "clue", zone: "B", label: "SECRET-CLUE", gmOnly: false },
      { id: "m3", kind: "label", zone: "B", label: "SECRET-SPAWN", gmOnly: true },
      { id: "m4", kind: "hazard", zone: "A", label: "Sparking cable", gmOnly: false },
    ],
    start: "A",
    gridM: 1,
    checks: [{ id: "c", level: "warn", ok: false, message: "SECRET-GM-PLAN" }],
  };
}

const generator = {
  id: "example.site",
  name: "Site",
  legend: [
    { target: { marker: "hazard" }, label: "Hazard" },
    { target: { marker: "spawn" }, label: "SECRET-GM-LEGEND", gmOnly: true },
  ],
} as unknown as MapGeneratorDef;
const module: ModuleTypes = { entityTypes: fixtureModule.entityTypes, mapGenerators: [generator] };

interface Seeded {
  store: CampaignStore;
  docs: Map<Id, Y.Doc>;
  session: Id;
  scene: Id;
  map: Id;
  revealedHandout: Id;
  pc: Id;
}

function seed(): Seeded {
  const store = newStore();
  const docs = new Map<Id, Y.Doc>();
  const write = (id: Id | undefined, md: string) => {
    if (id) docs.set(id, docFromMarkdown(md, id));
  };
  // a GM-only NPC, referenced from a revealed handout
  const npc = store.createEntity({ type: PERSON.id, name: "SECRET-GM-NPC", visibility: { level: "gm" } });
  // a PC the players see, with GM-only fields
  const pc = store.createEntity({
    type: PERSON.id,
    name: "Okafor",
    visibility: { level: "players" },
    fields: { isPC: true, role: "Marshal", secret: "SECRET-GM-FIELD", plan: "SECRET-GM-PLAN", stats: { grit: 4, wit: 2 } },
  });
  // a portrait the players may not see
  const portrait = store.insert("assets", { kind: "image", name: "SECRET-GM-PORTRAIT.png", mime: "image/png", size: 1, visibility: { level: "gm" } });
  store.update("entities", pc.id, { image: portrait.id });

  const adventure = store.createAdventure({ title: "The Long Night", withDocs: true });
  write(adventure.playerIntroDoc, "You are hired to **find the signal**.");
  write(adventure.gmSituationDoc, "SECRET-GM-SITUATION: the client lies.");
  const act = store.createAct(adventure.id, { title: "Arrival" });
  const map = store.createMap({ name: "Relay map", visibility: { level: "gm" } });
  store.update("maps", map.id, { layout: layout(), generator: { id: "example.site", seed: "s", inputs: { brief: "SECRET-GM-PLAN" } } });
  startLive(store, map.id, 1);
  revealZones(store, map.id, ["B"]);
  const live = store.get("maps", map.id)!.live!;
  store.update("maps", map.id, {
    live: { ...live, tokens: [{ id: "t1", label: "SECRET-GM-TOKEN", zone: "A", gmOnly: true }, { id: "t2", label: "Okafor", zone: "A", gmOnly: false }], pings: [{ zone: "C", at: "t" }] },
  });
  const scene = store.createScene(act.id, { title: "Docking", map: map.id, withReadAloudDoc: true });
  write(scene.bodyDoc, "SECRET-SCENE-NOTES: the hatch is trapped.");
  write(scene.readAloudDoc, "The relay hangs in the dark.");

  const session = store.createSession({ number: 3, title: "Cold open" });
  write(session.logDoc, "SECRET-SESSION-LOG");
  const note = store.createNote({ title: "SECRET-NOTE" });
  write(note.bodyDoc, "SECRET-NOTE");

  const revealed = store.createHandout({ title: "Distress call", kind: "text", visibility: { level: "revealed", revealedIn: session.id } });
  write(revealed.bodyDoc, `Mayday from [[${npc.id}|the stranger]] and [[${pc.id}|Okafor]].`);
  const hidden = store.createHandout({ title: "SECRET-HIDDEN-HANDOUT", kind: "text" });
  write(hidden.bodyDoc, "SECRET-HIDDEN-HANDOUT-BODY");
  const agenda = store.createHandout({ title: "SECRET-AGENDA", kind: "agenda", character: pc.id, visibility: { level: "some_players", players: ["p1"] } });
  write(agenda.bodyDoc, "SECRET-AGENDA");
  return { store, docs, session: session.id, scene: scene.id, map: map.id, revealedHandout: revealed.id, pc: pc.id };
}

function snapshot(s: Seeded, at = "2026-10-22T20:00:00.000Z") {
  return playerShareSnapshot({ maps: s.store.toJSON(), module, sessionId: s.session, sceneId: s.scene, doc: (id) => s.docs.get(id), at });
}

describe("playerShareSnapshot", () => {
  it("contains only player-visible content", () => {
    const s = seed();
    // another campaign's data never enters: the snapshot reads one campaign's maps
    const other = CampaignStore.create({ name: "Other", moduleId: "example", moduleVersion: "0.1.0", mode: "default", calendarId: "c" });
    other.createHandout({ title: "SECRET-OTHER-CAMPAIGN", visibility: { level: "players" } });
    const snap = snapshot(s);
    const json = JSON.stringify(snap);
    for (const secret of SECRETS) expect(json, secret).not.toContain(secret);

    expect(snap.campaign).toBe(s.store.meta().name);
    expect(snap.session.label).toBe("Session 3: Cold open");
    expect(snap.briefing).toMatchObject({ scene: "Docking", readAloud: "The relay hangs in the dark.", adventure: "The Long Night", intro: "You are hired to **find the signal**." });
    expect(snap.handouts.map((h) => h.title)).toEqual(["Distress call"]);
    // a GM-only entity is named by the label in the text, a visible one by its name
    expect(snap.handouts[0]!.text).toBe("Mayday from the stranger and Okafor.");
    expect(snap.handouts[0]!.thisSession).toBe(true);
  });

  it("projects the map as the player screen does: fog, no GM markers, tokens or pings", () => {
    const s = seed();
    const [map] = snapshot(s).maps;
    expect(map).toBeDefined();
    expect(map!.visibleZones).toEqual(["A", "B"]);
    expect(map!.layout.fogged.sort()).toEqual(["C", "L"]);
    expect(map!.decks).toEqual(["d1"]);
    expect(map!.layout.markers.map((m) => m.kind)).toEqual(["hazard"]);
    expect(map!.live.tokens.map((t) => t.label)).toEqual(["Okafor"]);
    expect(map!.legend.map((l) => l.label)).toEqual(["Hazard"]);
    expect(map!.layout.zones.find((z) => z.id === "A")).toMatchObject({ name: "Airlock", playerNote: "Cold air" });
    expect(map!.layout.zones.find((z) => z.id === "C")?.name).toBeUndefined();
    expect(map!.layout.checks).toEqual([]);
  });

  it("builds party cards from player-visible stats only, without a GM portrait", () => {
    const s = seed();
    const [pc] = snapshot(s).party;
    expect(pc).toMatchObject({ id: s.pc, name: "Okafor", kind: "Person" });
    expect(pc!.stats).toEqual([{ label: "Role", value: "Marshal" }]);
    expect(pc!.portrait).toBeUndefined();
    // a hidden summary field is left out
    s.store.update("entities", s.pc, { fieldVisibility: { role: { level: "gm" } } });
    expect(snapshot(s).party[0]!.stats).toEqual([]);
  });

  it("is deterministic", () => {
    const s = seed();
    expect(JSON.stringify(snapshot(s))).toBe(JSON.stringify(snapshot(s)));
  });

  it("works without a scene or maps", () => {
    const s = seed();
    const snap = playerShareSnapshot({ maps: s.store.toJSON(), module, sessionId: s.session, doc: (id) => s.docs.get(id), at: "t" });
    expect(snap.briefing).toBeUndefined();
    expect(snap.maps).toEqual([]);
    expect(snap.handouts).toHaveLength(1);
  });
});

describe("what's new", () => {
  it("sends only new handouts and changed maps after the first share, and records the share in the session", () => {
    const s = seed();
    let baseline = shareBaseline(s.store.list("sessions"));
    expect(defaultShareOptions(baseline).onlyNew).toBe(false);
    const first = planShare(snapshot(s), baseline, { ...defaultShareOptions(baseline), party: true });
    expect(first.share.handouts).toHaveLength(1);
    expect(first.mapStatus[s.map]).toBe("new");
    expect(shareMessage(first)).toBe(`${s.store.meta().name}, Session 3 update: the briefing for “Docking”, 1 new handout, the map and the party roster.`);
    recordShare(s.store, s.session, shareRecordOf(first, { format: "images" }));

    // the record persists in the campaign document (and survives a JSON round trip)
    const reloaded = CampaignStore.fromJSON(s.store.toJSON());
    const rec = reloaded.get("sessions", s.session)!.shares!;
    expect(rec).toEqual([{ at: "2026-10-22T20:00:00.000Z", handouts: [s.revealedHandout], maps: { [s.map]: ["A", "B"] }, scene: s.scene, party: true, format: "images" }]);

    baseline = shareBaseline(s.store.list("sessions"));
    const opts = defaultShareOptions(baseline);
    expect(opts.onlyNew).toBe(true);
    const nothing = planShare(snapshot(s), baseline, { ...opts, party: true });
    expect(nothing.empty).toBe(true);
    expect(nothing.skipped).toEqual({ handouts: 1, maps: 1, briefing: true, party: true });

    // a new handout and a newly revealed zone
    const fresh = s.store.createHandout({ title: "Crew manifest", visibility: { level: "players" } });
    revealZones(s.store, s.map, ["C"]);
    const next = planShare(snapshot(s, "2026-10-22T21:00:00.000Z"), baseline, opts);
    expect(next.share.handouts.map((h) => h.id)).toEqual([fresh.id]);
    expect(next.mapStatus[s.map]).toBe("updated");
    expect(next.share.maps).toHaveLength(1);
    expect(shareMessage(next)).toContain("1 new handout and the updated map");
    recordShare(s.store, s.session, shareRecordOf(next));
    const after = shareBaseline(s.store.list("sessions"));
    expect(after.count).toBe(2);
    expect([...after.handouts].sort()).toEqual([s.revealedHandout, fresh.id].sort());
    expect([...after.maps.get(s.map)!].sort()).toEqual(["A", "B", "C"]);
  });

  it("include options leave out whole kinds", () => {
    const s = seed();
    const plan = planShare(snapshot(s), shareBaseline([]), { briefing: false, maps: false, handouts: true, party: false, onlyNew: false });
    expect(plan.share.briefing).toBeUndefined();
    expect(plan.share.maps).toEqual([]);
    expect(plan.share.party).toEqual([]);
    expect(plan.share.handouts).toHaveLength(1);
  });
});
