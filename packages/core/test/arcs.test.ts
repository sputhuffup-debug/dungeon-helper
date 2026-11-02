import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import type { ArcDraft, ArcsDef, EntityTypeDef, GameModule } from "@campaign-forge/module-sdk";
import {
  RichTextRegistry,
  addClue,
  addContact,
  addPlayer,
  advanceClock,
  applyArcTicks,
  applyOfferArcLinks,
  arcsSnapshot,
  arcsSnapshotEmpty,
  cluesFor,
  contactCandidates,
  createThread,
  crewNotes,
  crewNotesMarkdown,
  currentStageIndex,
  exportBundle,
  factionHeat,
  findClue,
  heatOf,
  heatSuggestions,
  importBundle,
  isThreadIgnored,
  markClueFound,
  memberViewer,
  moveClue,
  moveStage,
  moveThread,
  pendingPayoffs,
  planArcTicks,
  playerPacketSnapshot,
  playerShareSnapshot,
  projectCampaignForViewer,
  removePlayer,
  seedClue,
  setHeat,
  threadsInOrder,
  unmarkClueFound,
  updateClue,
  updateContact,
  updateThread,
  type ArcThread,
} from "../src";
import { PERSON, PLACE, fixtureModule, newStore } from "./fixtures";

const FACTION: EntityTypeDef = {
  id: "example.faction",
  kind: "faction",
  name: "Faction",
  plural: "Factions",
  schema: { type: "object", properties: { heat: { type: "integer", minimum: 0, maximum: 4 }, kind: { type: "string" } } },
  sheet: { sections: [{ id: "main", title: "Main", fields: [{ path: "heat", label: "Heat" }] }] },
  defaultVisibility: { heat: "gm" },
};
const JOB: EntityTypeDef = { id: "example.job", kind: "job", name: "Job", plural: "Jobs", schema: { type: "object", properties: { trouble: { type: "string" } } }, sheet: { sections: [] } };

const ARCS: ArcsDef = {
  generator: "example.threads",
  clueKinds: [
    { id: "fact", label: "Fact" },
    { id: "person", label: "Person" },
    { id: "place", label: "Place" },
  ],
  slots: [{ id: "intent", label: "Employer's real intent" }],
  heat: { entityTypes: [FACTION.id], path: "heat", labels: ["Unnoticed", "Noticed", "Watched", "Pursued", "Hunted"] },
  tick: { dice: "1d6", steps: [{ min: 1, ticks: 0 }, { min: 4, ticks: 1 }, { min: 6, ticks: 2 }], ignored: 1 },
  payoffs: [{ id: "posting", label: "A posting from the sponsor" }],
  contacts: { entityTypes: [PERSON.id] },
};
const MODULE: GameModule = { ...fixtureModule, entityTypes: [PERSON, PLACE, FACTION, JOB], arcs: ARCS };

/** Secret strings: none may ever reach the players. */
const SECRET = {
  title: "Operation Quiet Ledger",
  goal: "Corner the salt trade by starving the outer farms",
  method: "a shell buyer who signs for every shipment",
  weakness: "the buyer keeps paper copies",
  cost: "the farms fold one by one",
  unseen: "The buyer's ledger lists ships that never existed",
  unseenPlayer: "A ledger of ghost ships",
  seeded: "The harbourmaster takes a cut",
  seededPlayer: "Someone at the harbour is paid off",
  stage2: "The paper trail",
  milestone: "The outer farms stop answering",
  payoff: "Salt Barons need a quiet courier",
};

function draft(sponsor?: string): ArcDraft {
  return {
    title: SECRET.title,
    playerTitle: "The missing salt shipments",
    ...(sponsor ? { sponsor } : {}),
    goal: SECRET.goal,
    method: SECRET.method,
    weakness: SECRET.weakness,
    cost: SECRET.cost,
    stages: [
      {
        title: "First hints",
        clues: [
          { kind: "fact", text: "Two salt barges were signed for by the same buyer", playerText: "Two salt barges went missing on the same route", unlocks: "The buyer's name" },
          { kind: "person", text: SECRET.seeded, playerText: SECRET.seededPlayer },
        ],
      },
      { title: SECRET.stage2, clues: [{ kind: "fact", text: SECRET.unseen, playerText: SECRET.unseenPlayer }] },
      { title: "Endgame", clues: [{ kind: "place", text: "The salt vault under the exchange", playerText: "A vault under the exchange" }] },
    ],
    clock: {
      segments: 6,
      milestones: [
        { at: 3, text: SECRET.milestone, stage: 1, payoffs: [{ kind: "posting", text: SECRET.payoff }] },
        { at: 6, text: "The barons own the salt", stage: 2 },
      ],
    },
  };
}

function setup() {
  const store = newStore("Salt Roads");
  const barons = store.createEntity({ type: FACTION.id, name: "Salt Barons", fields: { heat: 0 }, visibility: { level: "gm" } });
  const guild = store.createEntity({ type: FACTION.id, name: "Carters Guild", fields: { heat: 0 }, visibility: { level: "players" } });
  const harbour = store.createEntity({ type: PLACE.id, name: "Low Harbour", fields: {}, visibility: { level: "players" } });
  const job = store.createEntity({ type: JOB.id, name: "Salt to the coast", fields: { trouble: "The Carters Guild blocks the road" }, visibility: { level: "players" } });
  const mara = store.createEntity({ type: PERSON.id, name: "Mara", fields: { role: "broker" }, visibility: { level: "players" } });
  const turncoat = store.createEntity({ type: PERSON.id, name: "Vosk", fields: { role: "guard" }, visibility: { level: "gm" } });
  store.createRelationship("employer_of", barons.id, job.id);
  store.createRelationship("involved_in", mara.id, job.id);
  store.createRelationship("involved_in", turncoat.id, job.id);
  const t = createThread(store, draft(barons.id), { source: { module: "example", procedure: "example.threads" } });
  const session = store.createSession({ title: "First night" });
  return { store, barons, guild, harbour, job, mara, turncoat, t, session };
}

const clueAt = (t: ArcThread, stage: number, k: number) => t.stages[stage]!.clues[k]!;

describe("threads", () => {
  it("are created from a draft: GM-only, every clue unseen, milestones on stages, the sponsor resolved", () => {
    const { store, t, barons } = setup();
    expect(t.visibility).toEqual({ level: "gm" });
    expect(t.sponsor).toBe(barons.id);
    expect(t.stages.map((s) => s.title)).toEqual(["First hints", SECRET.stage2, "Endgame"]);
    expect(t.stages.flatMap((s) => s.clues).every((c) => c.state === "unseen")).toBe(true);
    expect(t.clock).toMatchObject({ segments: 6, filled: 0, log: [] });
    expect(t.clock.milestones[0]!.stage).toBe(t.stages[1]!.id);
    // a sponsor the offer itself created resolves through the idMap
    const created = store.createEntity({ type: FACTION.id, name: "New money", fields: {} });
    const t2 = createThread(store, draft("sponsor"), { idMap: { sponsor: created.id } });
    expect(t2.sponsor).toBe(created.id);
    expect(t2.order).toBe(t.order + 1);
  });

  it("can be renamed, reordered and edited: stages, clues, columns", () => {
    const { store, t } = setup();
    const other = createThread(store, draft());
    updateThread(store, t.id, { title: "  The salt plot ", playerTitle: "Salt that never arrives" });
    expect(store.get("arcs", t.id)).toMatchObject({ title: "The salt plot", playerTitle: "Salt that never arrives" });
    moveStage(store, t.id, t.stages[2]!.id, 0);
    expect(store.get("arcs", t.id)!.stages.map((s) => s.title)).toEqual(["Endgame", "First hints", SECRET.stage2]);
    const c = addClue(store, t.id, t.stages[1]!.id, { kind: "place", text: "A warehouse with fresh locks", playerText: "A warehouse with new locks" });
    updateClue(store, t.id, c.id, { text: "A warehouse with fresh locks and no stock" });
    moveClue(store, t.id, c.id, t.stages[0]!.id, 0);
    const after = store.get("arcs", t.id)!;
    expect(findClue(after, c.id)!.stage.id).toBe(t.stages[0]!.id);
    expect(findClue(after, c.id)!.clue.text).toBe("A warehouse with fresh locks and no stock");
    moveThread(store, other.id, 0);
    expect(threadsInOrder(store.list("arcs")).map((x) => x.id)).toEqual([other.id, t.id]);
  });

  it("moves clues from unseen to seeded to found, and back", () => {
    const { store, t, job, session, mara } = setup();
    const c = clueAt(t, 0, 1);
    seedClue(store, t.id, c.id, { job: job.id, posting: "offers/posting-2", run: "run1", slot: "intent", slotLabel: "Employer's real intent", text: "They want the harbourmaster's cut" });
    let x = findClue(store.get("arcs", t.id)!, c.id)!.clue;
    expect(x.state).toBe("seeded");
    expect(x.seeded).toMatchObject({ job: job.id, posting: "offers/posting-2", run: "run1", slot: "intent", slotLabel: "Employer's real intent" });
    expect(cluesFor(store.toJSON(), job.id).map((y) => y.clue.id)).toEqual([c.id]);
    markClueFound(store, t.id, c.id, { session: session.id, job: job.id, entity: mara.id, via: "job" });
    x = findClue(store.get("arcs", t.id)!, c.id)!.clue;
    expect(x.state).toBe("found");
    expect(x.found).toMatchObject({ session: session.id, job: job.id, via: "job" });
    expect(x.links?.sessions).toEqual([session.id]);
    expect(cluesFor(store.toJSON(), session.id)).toHaveLength(1);
    unmarkClueFound(store, t.id, c.id);
    expect(findClue(store.get("arcs", t.id)!, c.id)!.clue.state).toBe("seeded");
    expect(currentStageIndex(store.get("arcs", t.id)!)).toBe(0);
  });
});

describe("clocks", () => {
  it("advance by hand, reach milestones with their payoffs, and wind back", () => {
    const { store, t } = setup();
    let move = advanceClock(store, t.id, 2, { how: "hand", note: "they ignored it" });
    expect(move).toMatchObject({ from: 0, to: 2, reached: [] });
    move = advanceClock(store, t.id, 2);
    expect(move.to).toBe(4);
    expect(move.reached.map((m) => m.text)).toEqual([SECRET.milestone]);
    expect(pendingPayoffs(move.thread)).toEqual([{ milestone: 3, kind: "posting", text: SECRET.payoff, milestoneText: SECRET.milestone }]);
    move = advanceClock(store, t.id, 10);
    expect(move.to).toBe(6);
    move = advanceClock(store, t.id, -4);
    expect(move.thread.clock.filled).toBe(2);
    expect(move.thread.clock.milestones.every((m) => !m.reached)).toBe(true);
    expect(move.thread.clock.log.map((l) => l.by)).toEqual([2, 2, 2, -4]);
  });

  it("tick between jobs from a seed: the same seed, the same plan; ignored threads get the module's extra", () => {
    const { store, t, session } = setup();
    const maps = store.toJSON();
    expect(isThreadIgnored(t)).toBe(true);
    const a = planArcTicks(maps, ARCS, "between-1");
    const b = planArcTicks(maps, ARCS, "between-1");
    expect(a).toEqual(b);
    expect(a).toHaveLength(1);
    expect(a[0]!.ignored).toBe(true);
    expect(a[0]!.roll.ignored).toBe(1);
    expect(a[0]!.by).toBe(Math.min(6, a[0]!.roll.ticks + 1));
    // a different seed rolls differently somewhere over a few seeds
    const totals = new Set(Array.from({ length: 12 }, (_, i) => planArcTicks(maps, ARCS, `s${i}`)[0]!.roll.total));
    expect(totals.size).toBeGreaterThan(1);
    const moves = applyArcTicks(store, a, { session: session.id, note: "Between jobs" });
    expect(moves[0]!.to).toBe(a[0]!.to);
    const log = store.get("arcs", t.id)!.clock.log;
    expect(log[0]).toMatchObject({ how: "roll", ignored: true, session: session.id, note: "Between jobs", roll: { dice: "1d6", seed: "between-1/1" } });
    // finding a clue after the tick: no longer ignored
    markClueFound(store, t.id, clueAt(t, 0, 0).id, { at: new Date(Date.parse(log[0]!.at) + 1000).toISOString() });
    expect(isThreadIgnored(store.get("arcs", t.id)!)).toBe(false);
    expect(planArcTicks(store.toJSON(), ARCS, "between-2")[0]!.roll.ignored).toBe(0);
    // resolved threads do not tick
    updateThread(store, t.id, { status: "resolved" });
    expect(planArcTicks(store.toJSON(), ARCS, "between-3")).toEqual([]);
  });
});

describe("heat and contacts", () => {
  it("keeps heat on the faction, clamped to the scale, hottest first, and suggests who noticed a job", () => {
    const { store, barons, guild, job } = setup();
    setHeat(store, ARCS, barons.id, 9);
    setHeat(store, ARCS, guild.id, 2);
    expect(heatOf(ARCS, store.get("entities", barons.id)!)).toBe(4);
    expect(factionHeat(store.toJSON(), ARCS).map((h) => [h.entity.name, h.heat, h.label])).toEqual([
      ["Salt Barons", 4, "Hunted"],
      ["Carters Guild", 2, "Watched"],
    ]);
    const why = heatSuggestions(store.toJSON(), ARCS, job.id).map((s) => s.entity.name);
    expect(why).toEqual(expect.arrayContaining(["Salt Barons", "Carters Guild"]));
  });

  it("keeps a contact on the NPC: the players see where to find them and the favours, nothing else", () => {
    const { store, mara, turncoat, job, t, harbour } = setup();
    expect(contactCandidates(store.toJSON(), MODULE, job.id).map((e) => e.name)).toEqual(["Mara", "Vosk"]);
    addContact(store, mara.id, { stance: "friendly", owedToCrew: 1, grudges: ["The crew left her at the dock"], knows: [{ thread: t.id, clue: clueAt(t, 1, 0).id }], foundAt: "The broker's stall, Low Harbour", place: harbour.id, note: "Sells to both sides" });
    addContact(store, turncoat.id, { stance: "hostile", betrayer: true, grudges: ["Left for dead"] }, { reveal: true });
    expect(store.get("entities", turncoat.id)!.visibility.level).toBe("players");
    updateContact(store, mara.id, { owedByCrew: 2 });
    const view = projectCampaignForViewer(store.toJSON(), MODULE, { role: "player" });
    expect(view.entities[mara.id]!.contact).toEqual({ since: expect.any(String), favours: { owedToCrew: 1, owedByCrew: 2 }, foundAt: "The broker's stall, Low Harbour" });
    const json = JSON.stringify(view.entities[turncoat.id]);
    expect(json).not.toMatch(/hostile|betrayer|Left for dead/);
  });
});

describe("what a board reads, and what an accepted offer records", () => {
  it("snapshots threads, heat and contacts, sorted and stable", () => {
    const { store, barons, mara } = setup();
    expect(arcsSnapshotEmpty(arcsSnapshot({ arcs: {}, entities: {} }, MODULE))).toBe(true);
    setHeat(store, ARCS, barons.id, 3);
    addContact(store, mara.id, { stance: "friendly", owedToCrew: 1 });
    const snap = arcsSnapshot(store.toJSON(), MODULE, { seedClue: "auto", influence: true });
    expect(snap.threads[0]).toMatchObject({ title: SECRET.title, sponsorName: "Salt Barons", segments: 6, filled: 0, ignored: true, payoffs: [] });
    expect(snap.threads[0]!.clues.map((c) => [c.stage, c.state])).toEqual([
      [0, "unseen"],
      [0, "unseen"],
      [1, "unseen"],
      [2, "unseen"],
    ]);
    expect(snap.heat).toEqual([{ id: barons.id, name: "Salt Barons", heat: 3, label: "Pursued", fields: { heat: 3 } }]);
    expect(snap.contacts).toEqual([{ id: mara.id, name: "Mara", stance: "friendly", owedToCrew: 1, owedByCrew: 0, grudges: [], knows: [], visible: true }]);
    expect(snap).toMatchObject({ seedClue: "auto", influence: true });
    expect(arcsSnapshot(store.toJSON(), MODULE, { seedClue: "auto", influence: true })).toEqual(snap);
  });

  it("records a seeded clue with its job, posting and slot; ties an agent; uses a payoff; brings a contact back", () => {
    const { store, t, job, turncoat, mara } = setup();
    advanceClock(store, t.id, 3);
    addContact(store, mara.id, { stance: "friendly" });
    const clue = clueAt(t, 0, 1);
    applyOfferArcLinks(
      store,
      [
        { kind: "clue", thread: t.id, clue: clue.id, slot: "intent", text: "Pays the harbourmaster", entity: "npc-2" },
        { kind: "agent", thread: t.id, entity: "npc-2" },
        { kind: "payoff", thread: t.id, milestone: 3, payoff: "posting" },
        { kind: "contact", entity: mara.id },
      ],
      { job: job.id, posting: "offers/posting-1", run: "run-9", idMap: { "npc-2": turncoat.id }, slotLabel: (s) => ARCS.slots!.find((x) => x.id === s)?.label },
    );
    const after = store.get("arcs", t.id)!;
    expect(findClue(after, clue.id)!.clue).toMatchObject({ state: "seeded", seeded: { job: job.id, posting: "offers/posting-1", run: "run-9", slot: "intent", slotLabel: "Employer's real intent", entity: turncoat.id, text: "Pays the harbourmaster" } });
    expect(after.agents).toEqual([turncoat.id]);
    expect(pendingPayoffs(after)).toEqual([]);
    expect(after.clock.milestones[0]!.payoffs![0]!.used?.job).toBe(job.id);
    expect(store.get("entities", mara.id)!.contact!.lastSeen?.job).toBe(job.id);
  });
});

describe("bundles", () => {
  it("round-trip threads and contacts, also when every id is remapped", async () => {
    const { store, t, mara, job } = setup();
    seedClue(store, t.id, clueAt(t, 0, 0).id, { job: job.id, slot: "intent" });
    addContact(store, mara.id, { stance: "wary", knows: [{ thread: t.id, clue: clueAt(t, 1, 0).id }] });
    const bytes = await exportBundle(store, new RichTextRegistry(), undefined, { id: "example", version: "0.1.0" });
    const same = await importBundle(bytes);
    expect(same.store.toJSON().arcs).toEqual(store.toJSON().arcs);
    expect(same.store.get("entities", mara.id)!.contact).toEqual(store.get("entities", mara.id)!.contact);
    const remapped = await importBundle(bytes, { onConflict: "new-id" });
    const threads = remapped.store.list("arcs");
    expect(threads).toHaveLength(1);
    const nt = threads[0]!;
    expect(nt.id).not.toBe(t.id);
    const newJob = remapped.idMap[job.id]!;
    expect(cluesFor(remapped.store.toJSON(), newJob)).toHaveLength(1);
    const newMara = remapped.store.get("entities", remapped.idMap[mara.id]!)!;
    expect(newMara.contact!.knows[0]!.thread).toBe(nt.id);
    expect(nt.sponsor).toBe(remapped.idMap[t.sponsor!]);
  });
});

describe("crew notes and projection safety", () => {
  function played() {
    const s = setup();
    const { store, t, job, session, mara, harbour, barons } = s;
    const sam = addPlayer(store, { name: "Sam" });
    const priya = addPlayer(store, { name: "Priya" });
    // found by the whole crew, found by Priya alone, seeded, unseen
    seedClue(store, t.id, clueAt(t, 0, 0).id, { job: job.id, slot: "intent" });
    markClueFound(store, t.id, clueAt(t, 0, 0).id, { session: session.id, job: job.id, via: "wrap-up" });
    updateClue(store, t.id, clueAt(t, 0, 0).id, { links: { entities: [harbour.id], jobs: [job.id], sessions: [session.id] } });
    markClueFound(store, t.id, clueAt(t, 2, 0).id, { session: session.id, players: [priya.id] });
    seedClue(store, t.id, clueAt(t, 0, 1).id, { job: job.id, slot: "intent", text: SECRET.seeded });
    advanceClock(store, t.id, 4);
    setHeat(store, ARCS, barons.id, 3);
    addContact(store, mara.id, { stance: "wary", owedToCrew: 1, grudges: ["Owes her for the dock"], foundAt: "The broker's stall", note: "GM: she sells to the barons" });
    // a second thread with nothing found: no title at all
    createThread(store, { ...draft(), title: "Second secret", playerTitle: "Nobody should read this" });
    return { ...s, sam, priya };
  }

  const scan = (out: string) => {
    for (const [k, v] of Object.entries(SECRET)) expect(out, k).not.toContain(v);
    for (const banned of ["Second secret", "Nobody should read this", "Salt Barons", "Pursued", "Owes her for the dock", "sells to the barons", "wary", '"clock"', '"heat"', "segments"]) expect(out, banned).not.toContain(banned);
  };

  it("hold only found clues under the player-facing title, met contacts, known places and factions", () => {
    const { store, t, mara, harbour, guild, priya, sam } = played();
    const maps = store.toJSON();
    const group = crewNotes(maps, MODULE, { role: "player" });
    expect(group.threads).toEqual([
      { id: t.id, title: "The missing salt shipments", clues: [{ id: clueAt(t, 0, 0).id, kind: "fact", kindLabel: "Fact", text: "Two salt barges went missing on the same route", foundIn: "Session 1", job: "Salt to the coast" }] },
    ]);
    expect(group.contacts).toEqual([{ id: mara.id, name: "Mara", foundAt: "The broker's stall", favours: { owedToCrew: 1, owedByCrew: 0 }, favourLine: "Owes the crew a favour." }]);
    expect(group.places.map((p) => p.id)).toEqual([harbour.id]);
    expect(group.factions.map((f) => f.id)).toEqual([guild.id]);
    // Priya's own notes add the clue she alone learnt; Sam's do not
    const mine = crewNotes(maps, MODULE, memberViewer(maps, priya.id));
    expect(mine.threads[0]!.clues.map((c) => [c.text, !!c.personal])).toEqual([
      ["Two salt barges went missing on the same route", false],
      ["A vault under the exchange", true],
    ]);
    expect(crewNotes(maps, MODULE, memberViewer(maps, sam.id)).threads[0]!.clues).toHaveLength(1);
    // the sponsor shows only once revealed, and only when the players may see the faction
    updateThread(store, t.id, { sponsorRevealed: true });
    expect(crewNotes(store.toJSON(), MODULE, { role: "player" }).threads[0]!.sponsor).toBeUndefined();
    store.update("entities", t.sponsor!, { visibility: { level: "players" } });
    expect(crewNotes(store.toJSON(), MODULE, { role: "player" }).threads[0]!.sponsor).toBe("Salt Barons");
  });

  it("never let a GM title, sponsor, goal, method, clock, heat or an unfound clue reach crew notes, the player view, shares or packets", () => {
    const { store, priya, sam, session } = played();
    const maps = store.toJSON();
    const registry = new RichTextRegistry();
    const doc = (id: string) => registry.open(id);
    const outputs: string[] = [];
    for (const viewer of [{ role: "player" as const }, memberViewer(maps, priya.id), memberViewer(maps, sam.id)]) {
      const notes = crewNotes(maps, MODULE, viewer);
      outputs.push(JSON.stringify(notes), crewNotesMarkdown(notes), JSON.stringify(projectCampaignForViewer(maps, MODULE, viewer)));
    }
    outputs.push(JSON.stringify(playerShareSnapshot({ maps, module: MODULE, sessionId: session.id, doc, at: "2026-11-07T20:00:00Z" })));
    for (const p of [priya, sam]) outputs.push(JSON.stringify(playerPacketSnapshot({ maps, module: MODULE, sessionId: session.id, doc, at: "2026-11-07T20:00:00Z", memberId: p.id })));
    for (const out of outputs) scan(out);
    // the player projection holds no thread at all
    expect(projectCampaignForViewer(maps, MODULE, { role: "player" }).arcs).toEqual({});
    // a GM viewer previews the group's notes, not the GM's board
    scan(JSON.stringify(crewNotes(maps, MODULE, { role: "gm" })));
  });

  it("removing a player keeps the clues they alone learnt away from everyone", () => {
    const { store, priya, t } = played();
    removePlayer(store, priya.id);
    const c = findClue(store.get("arcs", t.id)!, clueAt(t, 2, 0).id)!.clue;
    expect(c.players).toEqual([]);
    expect(crewNotes(store.toJSON(), MODULE, { role: "player" }).threads[0]!.clues).toHaveLength(1);
  });
});
