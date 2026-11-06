import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import type { ArcDraft, ArcsDef, EntityTypeDef, GameModule, RecapContributor } from "@campaign-forge/module-sdk";
import { checkModule } from "@campaign-forge/module-sdk";
import {
  RichTextRegistry,
  addContact,
  addPlayer,
  addRecapLine,
  advanceClock,
  buildSessionRecap,
  createThread,
  exportBundle,
  fromMarkdown,
  generateSessionRecap,
  importBundle,
  markClueFound,
  playerRecap,
  projectCampaignForViewer,
  recapMarkdown,
  recapReadAloud,
  recapSessions,
  recapSnapshot,
  recapTexts,
  removeRecapLine,
  reveal,
  seedClue,
  setHeat,
  showSessionRecap,
  updateRecapLine,
  type SessionRecap,
} from "../src";
import { PERSON, PLACE, fixtureModule, newStore } from "./fixtures";

const FACTION: EntityTypeDef = {
  id: "example.faction",
  kind: "faction",
  name: "Faction",
  plural: "Factions",
  schema: { type: "object", properties: { heat: { type: "integer", minimum: 0, maximum: 4 } } },
  sheet: { sections: [{ id: "main", title: "Main", fields: [{ path: "heat", label: "Heat" }] }] },
  defaultVisibility: { heat: "gm" },
};

const ARCS: ArcsDef = {
  generator: "example.threads",
  clueKinds: [{ id: "fact", label: "Fact" }],
  heat: { entityTypes: [FACTION.id], path: "heat", labels: ["Unnoticed", "Noticed", "Watched", "Pursued", "Hunted"] },
  contacts: { entityTypes: [PERSON.id] },
};

/** A module contributor that writes every clue, contact, heat and clock it is given, for the audience it is given (to prove the players snapshot holds no secrets). */
const TELL_ALL: RecapContributor = {
  id: "example.recap",
  build: (s) => [
    {
      id: "example.everything",
      title: "Everything I was given",
      audience: s.audience,
      lines: [
        ...s.clues.map((c) => ({ key: "clue", ref: c.clue, text: `${c.threadTitle}: ${c.text} [${c.state}]` })),
        ...s.entities.map((e) => ({ key: "entity", ref: e.id, text: `${e.name} ${JSON.stringify(e.fields)} ${JSON.stringify(e.contact ?? {})}` })),
        ...s.heat.map((h) => ({ key: "heat", ref: h.id, text: `${h.name} ${h.label}` })),
        ...s.ticks.map((t) => ({ key: "tick", ref: t.thread, text: `${t.threadTitle} moved ${t.by}` })),
        ...s.payoffs.map((p) => ({ key: "payoff", ref: p.thread, text: p.text })),
        { key: "settings", text: `settings ${JSON.stringify(s.settings)}` },
      ],
    },
    // a careless contributor: a GM section whatever the audience (core keeps it out of the players' recap)
    { id: "secrets", title: "Secrets", audience: "gm", lines: [{ key: "leak", text: `GM only from the module (${s.audience})` }] },
  ],
};

const MODULE: GameModule = { ...fixtureModule, entityTypes: [PERSON, PLACE, FACTION], arcs: ARCS, recap: { contributors: [TELL_ALL] } };

/** Strings that must never reach the players. */
const SECRET = {
  gmTitle: "Operation Quiet Ledger",
  sponsor: "Salt Barons",
  unseen: "The buyer's ledger lists ships that never existed",
  unseenPlayer: "A ledger of ghost ships",
  seeded: "The harbourmaster takes a cut",
  seededPlayer: "Someone at the harbour is paid off",
  milestone: "The outer farms stop answering",
  payoff: "Salt Barons need a quiet courier",
  gmNpc: "Vosk the Turncoat",
  gmField: "skims from the harbour fund",
  summary: "The crew never noticed the forged seal on the crate",
  looseEnd: "Vosk plans to sell the crew out at the docks",
  log: "GM log: the barons paid Vosk in advance",
  answer: "Secret trauma check failed",
  heatLabel: "Watched",
  stance: "hostile",
  contactNote: "Mara secretly reports to the barons",
  grudge: "the crew left her at the docks",
};

function draft(sponsor: string): ArcDraft {
  return {
    title: SECRET.gmTitle,
    playerTitle: "The missing salt shipments",
    sponsor,
    goal: "Corner the salt trade",
    method: "a shell buyer",
    weakness: "paper copies",
    cost: "the farms fold",
    stages: [
      {
        title: "First hints",
        clues: [
          { kind: "fact", text: "Two salt barges were signed for by one buyer", playerText: "Two salt barges went missing on one route" },
          { kind: "fact", text: SECRET.seeded, playerText: SECRET.seededPlayer },
        ],
      },
      { title: "Later", clues: [{ kind: "fact", text: SECRET.unseen, playerText: SECRET.unseenPlayer }] },
    ],
    clock: { segments: 6, milestones: [{ at: 1, text: SECRET.milestone, payoffs: [{ kind: "posting", text: SECRET.payoff }] }] },
  };
}

function setup() {
  const store = newStore("Salt Roads");
  const registry = new RichTextRegistry();
  const barons = store.createEntity({ type: FACTION.id, name: SECRET.sponsor, fields: { heat: 0 }, visibility: { level: "gm" } });
  const harbour = store.createEntity({ type: PLACE.id, name: "Low Harbour", fields: {}, visibility: { level: "players" } });
  const mara = store.createEntity({ type: PERSON.id, name: "Mara", summary: "A broker", fields: { role: "broker", secret: SECRET.gmField }, visibility: { level: "players" } });
  const vosk = store.createEntity({ type: PERSON.id, name: SECRET.gmNpc, fields: { role: "guard" }, visibility: { level: "gm" } });
  const pc = store.createEntity({ type: PERSON.id, name: "Ash", fields: { isPC: true, role: "pilot" }, visibility: { level: "players" } });
  addPlayer(store, { name: "Sam", characters: [pc.id] });
  const handout = store.createHandout({ title: "A torn manifest", kind: "text", visibility: { level: "gm" } });
  const t = createThread(store, draft(barons.id));
  const s1 = store.createSession({ number: 1, date: "2026-03-01", title: "Night one", status: "done" });
  const s2 = store.createSession({ number: 2, date: "2026-03-08", title: "The docks", status: "done" });
  const s3 = store.createSession({ number: 3, date: "2026-03-15", title: "Salt and steel", status: "planned" });
  // session 2: a summary, a reveal of a handout and of one field, a clue found, a clue seeded, a contact, heat, a clock tick, loose ends
  const scene = store.createScene(undefined, { title: "At the docks", location: harbour.id, participants: [vosk.id, pc.id] });
  store.update("sessions", s2.id, { summary: SECRET.summary, scenesRun: [scene.id], attendees: store.meta().members.map((m) => m.id), wrapUp: { looseEnds: [SECRET.looseEnd], answers: { "x.trauma": { value: "failed", label: SECRET.answer, at: "2026-03-08T22:00:00Z" } } } });
  fromMarkdown(registry.open(s2.logDoc), SECRET.log);
  reveal(store, { kind: "handout", id: handout.id }, s2.id);
  reveal(store, { kind: "entity", id: mara.id, field: "role" }, s2.id);
  const [found, seeded] = t.stages[0]!.clues;
  markClueFound(store, t.id, found!.id, { session: s2.id, entity: mara.id, via: "wrap-up" });
  seedClue(store, t.id, seeded!.id, { entity: mara.id, text: "Mara knows" });
  addContact(store, mara.id, { stance: SECRET.stance as "hostile", owedToCrew: 1, foundAt: "the fish market", note: SECRET.contactNote, grudges: [SECRET.grudge], lastSeen: { session: s2.id } });
  setHeat(store, ARCS, barons.id, 2);
  advanceClock(store, t.id, 1, { session: s2.id, note: "between jobs" });
  return { store, registry, barons, harbour, mara, vosk, pc, handout, t, s1, s2, s3 };
}

const build = (x: ReturnType<typeof setup>, extra: Partial<Parameters<typeof buildSessionRecap>[0]> = {}) =>
  buildSessionRecap({ maps: x.store.toJSON(), module: MODULE, sessionId: x.s3.id, at: "2026-03-14T18:00:00.000Z", doc: (id) => x.registry.open(id), ...extra });

describe("recap span", () => {
  it("covers the last played session, the last n, or the story so far (planned sessions never)", () => {
    const x = setup();
    const maps = x.store.toJSON();
    expect(recapSessions(maps, x.s3.id).map((s) => s.number)).toEqual([2]);
    expect(recapSessions(maps, x.s3.id, { kind: "last-n", n: 2 }).map((s) => s.number)).toEqual([1, 2]);
    expect(recapSessions(maps, x.s3.id, { kind: "last-n", n: 9 }).map((s) => s.number)).toEqual([1, 2]);
    expect(recapSessions(maps, x.s3.id, { kind: "all" }).map((s) => s.number)).toEqual([1, 2]);
    expect(recapSessions(maps, x.s1.id)).toEqual([]);
    expect(build(x, { span: { kind: "all" } }).sessions).toEqual([x.s1.id, x.s2.id]);
  });
});

describe("building a recap", () => {
  it("gathers the covered session for the GM: summary, log, reveals, loose ends, wrap-up, new faces, secrets, module lines", () => {
    const x = setup();
    const r = build(x);
    expect(r.sessions).toEqual([x.s2.id]);
    const gm = recapTexts(r, "gm").join("\n");
    expect(gm).toContain(`Session 2: The docks (8 Mar 2026): ${SECRET.summary}`);
    expect(gm).toContain(`From the log: ${SECRET.log}`);
    expect(gm).toContain("Handout shown to the players: “A torn manifest”.");
    expect(gm).toContain("Revealed: Mara's role.");
    expect(gm).toContain(SECRET.looseEnd);
    expect(gm).toContain(SECRET.answer);
    expect(gm).toContain(`Waiting to be found, ${SECRET.gmTitle}: ${SECRET.seeded}, with Mara.`);
    expect(gm).toContain("Sam played.");
    // the scene run, and who and where it put in front of the crew (the GM-only NPC and the PC left out)
    expect(r.gm.find((s) => s.id === "scenes")!.lines.map((l) => l.text)).toEqual(["At the docks"]);
    expect(r.gm.find((s) => s.id === "met")!.lines.map((l) => l.text)).toEqual(["Low Harbour."]);
    expect(r.players.find((s) => s.id === "met")!.lines.map((l) => l.text)).toEqual(["Low Harbour."]);
    // the module's GM section merges into the core "secrets" section
    const secrets = r.gm.find((s) => s.id === "secrets")!;
    expect(secrets.title).toBe("What the players don't know");
    expect(secrets.lines.map((l) => l.text)).toContain("GM only from the module (gm)");
    expect(r.baseline).toEqual({ heat: { [x.barons.id]: 2 } });
    // sections are sorted and every line links what it names
    expect(r.gm.map((s) => s.order)).toEqual([...r.gm.map((s) => s.order)].sort((a, b) => a - b));
    expect(r.gm.find((s) => s.id === "story")!.lines[0]!.links).toEqual([{ kind: "session", id: x.s2.id, label: "Session 2: The docks" }]);
  });

  it("is deterministic: same campaign, same recap", () => {
    const x = setup();
    expect(JSON.stringify(build(x))).toBe(JSON.stringify(build(x)));
    const snap = (a: "gm" | "players") => JSON.stringify(recapSnapshot({ maps: x.store.toJSON(), module: MODULE, sessionId: x.s3.id, audience: a }));
    expect(snap("gm")).toBe(snap("gm"));
    expect(snap("players")).toBe(snap("players"));
  });

  it("reads heat changes against the previous recap's baseline", () => {
    const x = setup();
    generateSessionRecap(x.store, MODULE, x.s3.id, { at: "2026-03-14T18:00:00.000Z" });
    setHeat(x.store, ARCS, x.barons.id, 3);
    x.store.update("sessions", x.s3.id, { status: "done" });
    const s4 = x.store.createSession({ number: 4, date: "2026-03-22", status: "planned" });
    const snap = recapSnapshot({ maps: x.store.toJSON(), module: MODULE, sessionId: s4.id, audience: "gm" });
    expect(snap.heat).toEqual([{ id: x.barons.id, name: SECRET.sponsor, heat: 3, label: "Pursued", before: 2, beforeLabel: "Watched" }]);
  });
});

describe("the players' recap is built from the player projection only", () => {
  it("never holds GM titles, sponsors, unfound clues, clocks, heat, GM-only records or fields, the summary, loose ends or answers", () => {
    const x = setup();
    const r = build(x);
    const snapshot = recapSnapshot({ maps: x.store.toJSON(), module: MODULE, sessionId: x.s3.id, audience: "players" });
    expect(snapshot.settings).toEqual({});
    expect(snapshot.ticks).toEqual([]);
    expect(snapshot.heat).toEqual([]);
    expect(snapshot.payoffs).toEqual([]);
    expect(snapshot.clues.map((c) => c.state)).toEqual(["found"]);
    x.store.update("sessions", x.s3.id, { recap: r });
    showSessionRecap(x.store, x.s3.id, true);
    const outputs = [JSON.stringify(r.players), JSON.stringify(snapshot), JSON.stringify(playerRecap(x.store.toJSON(), MODULE, x.s3.id)), recapMarkdown(r.players), recapReadAloud(r.players)];
    // the stored players' side offers the GM's summary as a line switched off (the GM reads it first); nothing else of the GM's
    const offered = r.players.flatMap((s) => s.lines).filter((l) => l.text.includes(SECRET.summary));
    expect(offered).toEqual([expect.objectContaining({ key: "summary", ref: x.s2.id, off: true, optIn: true })]);
    const withoutOffered = { ...r, players: r.players.map((s) => ({ ...s, lines: s.lines.filter((l) => !l.optIn) })) };
    outputs[0] = JSON.stringify(withoutOffered.players);
    for (const out of outputs) for (const [k, v] of Object.entries(SECRET)) expect(out, k).not.toContain(v);
    // what the players do get: the opening, the handout and field they were shown, the clue under the player title, the contact and their favour
    const text = recapTexts(r, "players").join("\n");
    // the table's real-world date is not story: a session without an in-world date has none
    expect(text).toContain("Session 2: The docks.");
    expect(text).not.toContain("8 Mar 2026");
    expect(text).toContain("“A torn manifest”.");
    expect(text).toContain("You learnt Mara's role.");
    expect(text).toContain("The missing salt shipments: Two salt barges went missing on one route [found]");
    expect(text).toContain('"favours":{"owedToCrew":1,"owedByCrew":0}');
    expect(r.players.some((s) => s.id === "secrets")).toBe(false);
  });

  it("dates the opening line in the world, and offers the GM's summary to read aloud, off until the GM switches it on", () => {
    const x = setup();
    x.store.update("sessions", x.s2.id, { inWorldDate: "2183-06-12" });
    generateSessionRecap(x.store, MODULE, x.s3.id, { at: "2026-03-14T18:00:00.000Z" });
    const lines = () => x.store.get("sessions", x.s3.id)!.recap!.players.find((s) => s.id === "story")!.lines;
    expect(lines().map((l) => l.text)).toEqual(["Session 2: The docks (2183-06-12).", SECRET.summary]);
    expect(lines()[1]).toMatchObject({ key: "summary", off: true, optIn: true });
    const read = () => JSON.stringify(playerRecap(x.store.toJSON(), MODULE, x.s3.id));
    expect(read()).toContain("Session 2: The docks (2183-06-12).");
    expect(read()).not.toContain(SECRET.summary);
    // the GM switches it on: the players get it, and regenerating keeps the switch
    updateRecapLine(x.store, x.s3.id, { audience: "players", section: "story", key: "summary", ref: x.s2.id }, { off: false });
    expect(read()).toContain(SECRET.summary);
    generateSessionRecap(x.store, MODULE, x.s3.id, { at: "2026-03-14T19:00:00.000Z" });
    expect(lines()[1]!.off).toBeUndefined();
    expect(read()).toContain(SECRET.summary);
    // and off again stays off
    updateRecapLine(x.store, x.s3.id, { audience: "players", section: "story", key: "summary", ref: x.s2.id }, { off: true });
    generateSessionRecap(x.store, MODULE, x.s3.id, { at: "2026-03-14T20:00:00.000Z" });
    expect(lines()[1]!.off).toBe(true);
    expect(read()).not.toContain(SECRET.summary);
  });

  it("writes in-world dates the way the module's calendar shows them, not as stored", () => {
    const x = setup();
    const named: GameModule = { ...MODULE, calendar: { id: "example.hearth", name: "Hearth", defaultYear: 812, months: [{ name: "Frostwane", days: 30 }, { name: "Thawmonth", days: 30 }], format: "{year}-{month:02}-{day:02}" } };
    x.store.update("sessions", x.s2.id, { inWorldDate: "812-02-12" });
    generateSessionRecap(x.store, named, x.s3.id, { at: "2026-03-14T18:00:00.000Z" });
    const story = x.store.get("sessions", x.s3.id)!.recap!.players.find((s) => s.id === "story")!;
    expect(story.lines[0]!.text).toBe("Session 2: The docks (12 Thawmonth 812).");
  });

  it("a session started now takes the campaign's in-world date", () => {
    const x = setup();
    x.store.updateMeta({ currentDate: "2183-07-01" });
    expect(x.store.createSession({ status: "running" }).inWorldDate).toBe("2183-07-01");
    expect(x.store.createSession({ status: "planned" }).inWorldDate).toBeUndefined();
  });

  it("is reached only through playerRecap: once shown, lines switched on, links to what players see", () => {
    const x = setup();
    generateSessionRecap(x.store, MODULE, x.s3.id, { at: "2026-03-14T18:00:00.000Z" });
    expect(playerRecap(x.store.toJSON(), MODULE, x.s3.id, { requireShown: true })).toBeUndefined();
    expect(playerRecap(x.store.toJSON(), MODULE, x.s3.id)).toBeDefined();
    showSessionRecap(x.store, x.s3.id, true, "2026-03-15T19:00:00.000Z");
    const shown = playerRecap(x.store.toJSON(), MODULE, x.s3.id, { requireShown: true })!;
    expect(shown.title).toBe("Previously on Salt Roads");
    expect(shown.shown).toBe("2026-03-15T19:00:00.000Z");
    // the session record (and its recap) never reaches a player projection
    const projected = projectCampaignForViewer(x.store.toJSON(), MODULE, { role: "player" });
    expect(projected.sessions).toEqual({});
    expect(JSON.stringify(projected)).not.toContain(SECRET.summary);
    // a line switched off is left out; an entity the players can no longer see takes its generated lines with it
    const met = x.store.get("sessions", x.s3.id)!.recap!.players.find((s) => s.id === "revealed")!;
    updateRecapLine(x.store, x.s3.id, { audience: "players", section: "revealed", key: met.lines[0]!.key, ref: met.lines[0]!.ref }, { off: true });
    expect(JSON.stringify(playerRecap(x.store.toJSON(), MODULE, x.s3.id))).not.toContain("A torn manifest");
    x.store.update("entities", x.mara.id, { visibility: { level: "gm" } });
    expect(JSON.stringify(playerRecap(x.store.toJSON(), MODULE, x.s3.id))).not.toContain("Mara's role");
    showSessionRecap(x.store, x.s3.id, false);
    expect(playerRecap(x.store.toJSON(), MODULE, x.s3.id, { requireShown: true })).toBeUndefined();
  });
});

describe("the stored draft", () => {
  it("keeps switches, rewrites and the GM's own lines when it is regenerated", () => {
    const x = setup();
    let r = generateSessionRecap(x.store, MODULE, x.s3.id, { at: "2026-03-14T18:00:00.000Z" });
    const loose = r.gm.find((s) => s.id === "loose-ends")!.lines[0]!;
    const story = r.gm.find((s) => s.id === "story")!.lines[0]!;
    updateRecapLine(x.store, x.s3.id, { audience: "gm", section: "loose-ends", key: loose.key, ref: loose.ref }, { off: true });
    updateRecapLine(x.store, x.s3.id, { audience: "gm", section: "story", key: story.key, ref: story.ref }, { text: "Last time: salt, steel and a bad deal." });
    addRecapLine(x.store, x.s3.id, "players", "Ash still has the key to the warehouse.");
    showSessionRecap(x.store, x.s3.id, true, "2026-03-15T19:00:00.000Z");
    // a regenerate after the data changed (the summary is rewritten) keeps all of it
    x.store.update("sessions", x.s2.id, { summary: "Rewritten summary" });
    r = generateSessionRecap(x.store, MODULE, x.s3.id, { at: "2026-03-15T18:00:00.000Z" });
    expect(r.gm.find((s) => s.id === "loose-ends")!.lines[0]).toMatchObject({ off: true });
    expect(r.gm.find((s) => s.id === "story")!.lines[0]).toMatchObject({ text: "Last time: salt, steel and a bad deal.", edited: true });
    expect(r.players.find((s) => s.id === "notes")!.lines).toEqual([expect.objectContaining({ text: "Ash still has the key to the warehouse.", custom: true })]);
    expect(r.shown).toBe("2026-03-15T19:00:00.000Z");
    expect(r.generated).toBe("2026-03-15T18:00:00.000Z");
    // the span changes; the rewritten line still has a source (session 2 is covered) and stays rewritten
    r = generateSessionRecap(x.store, MODULE, x.s3.id, { span: { kind: "all" }, at: "2026-03-15T18:05:00.000Z" });
    expect(r.span).toEqual({ kind: "all" });
    expect(r.gm.find((s) => s.id === "story")!.lines.map((l) => l.text)).toContain("Last time: salt, steel and a bad deal.");
    // a rewritten line whose source is gone stays, as the GM's own line
    x.store.update("sessions", x.s2.id, { wrapUp: {} });
    x.store.update("sessions", x.s3.id, { nextPlan: [] });
    const lost = generateSessionRecap(x.store, MODULE, x.s3.id, { at: "2026-03-15T18:10:00.000Z", span: { kind: "last" } });
    expect(lost.gm.find((s) => s.id === "loose-ends")?.lines ?? []).toEqual([]);
    // the GM's own line can be removed; previous: null starts fresh
    const custom = lost.players.find((s) => s.id === "notes")!.lines[0]!;
    const after = removeRecapLine(x.store, x.s3.id, { audience: "players", section: "notes", key: custom.key });
    expect(after.players.some((s) => s.id === "notes")).toBe(false);
    expect(build(x, { previous: null }).gm.find((s) => s.id === "story")!.lines[0]!.text).toContain("Rewritten summary");
  });

  it("round-trips through a bundle, ids remapped with the campaign's", async () => {
    const x = setup();
    const r = generateSessionRecap(x.store, MODULE, x.s3.id, { at: "2026-03-14T18:00:00.000Z" });
    updateRecapLine(x.store, x.s3.id, { audience: "gm", section: "story", key: r.gm[0]!.lines[0]!.key, ref: r.gm[0]!.lines[0]!.ref }, { off: true });
    const stored = x.store.get("sessions", x.s3.id)!.recap as SessionRecap;
    const same = await importBundle(await exportBundle(x.store, x.registry, undefined, { id: "example", version: "0.1.0" }));
    expect(same.store.get("sessions", x.s3.id)!.recap).toEqual(stored);
    const moved = await importBundle(await exportBundle(x.store, x.registry, undefined, { id: "example", version: "0.1.0" }), { onConflict: "new-id" });
    const s3 = moved.idMap[x.s3.id]!;
    const s2 = moved.idMap[x.s2.id]!;
    const recap = moved.store.get("sessions", s3)!.recap!;
    expect(recap.sessions).toEqual([s2]);
    expect(recap.gm[0]!.lines[0]).toMatchObject({ ref: s2, off: true, links: [{ kind: "session", id: s2 }] });
    expect(recapTexts(recap)).toEqual(recapTexts(stored));
  });
});

describe("the module hook", () => {
  it("passes the conformance check, and a contributor that throws or misbehaves is caught", () => {
    expect(checkModule({ ...MODULE, procedures: [] }, { skipProcedureRuns: true }).issues.filter((i) => i.where.startsWith("recap"))).toEqual([
      expect.objectContaining({ severity: "error", message: "given a players snapshot, build must return players sections only" }),
    ]);
    const bad: RecapContributor = { id: "bad", build: () => { throw new Error("boom"); } };
    const dup: RecapContributor = { id: "bad", build: () => [] };
    const issues = checkModule({ ...MODULE, procedures: [], recap: { contributors: [bad, dup] } }, { skipProcedureRuns: true }).issues.filter((i) => i.where.startsWith("recap"));
    expect(issues.map((i) => i.message)).toEqual(expect.arrayContaining(['duplicate recap contributor "bad"', expect.stringContaining("build threw on an empty gm snapshot: boom")]));
    const x = setup();
    const r = buildSessionRecap({ maps: x.store.toJSON(), module: { ...MODULE, recap: { contributors: [bad] } }, sessionId: x.s3.id, at: "2026-03-14T18:00:00.000Z" });
    expect(r.gm.length).toBeGreaterThan(0);
  });
});
