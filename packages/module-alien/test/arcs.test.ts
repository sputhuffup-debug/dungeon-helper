import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { checkModule, runProcedure, type ArcSnapshot, type ModuleManifest, type Offer, type OfferSet, type ProcedureRunOptions } from "@campaign-forge/module-sdk";
import { alienModule } from "../src/index";
import { arcs, HEAT_LABELS } from "../src/arcs";
import { campaignThread, milestonePositions, type ThreadData } from "../src/procedures/campaign-thread";
import { CLUES, METHODS, SCHEMES } from "../src/procedures/campaign-thread-data";
import { jobBoard } from "../src/procedures/job-board";
import { tables } from "../src/tables/index";
import type { JobSiteBrief } from "../src/maps/jobBrief";

const mod = { tables, manifest: { id: "alien", version: "0.0.0-test" } as ModuleManifest };
const FRAMES = ["space-truckers", "colonial-marines", "frontier-colonists"] as const;

const CAMPAIGN = {
  entities: [
    { id: "f-wy", name: "Weyland-Yutani", type: "alien.faction", kind: "faction", tags: ["faction"], fields: { factionType: "corporation" }, visibility: "players" },
    { id: "f-geo", name: "Geofund", type: "alien.faction", kind: "faction", tags: [], fields: { factionType: "corporation" }, visibility: "gm" },
    { id: "f-ca", name: "Colonial Administration", type: "alien.faction", kind: "faction", tags: [], fields: { factionType: "government" }, visibility: "players" },
    { id: "home", name: "Anchorpoint Station", type: "alien.location", kind: "location", subtype: "colony", tags: ["home-base"], visibility: "players" },
    { id: "n-mara", name: "Mara Quill", type: "alien.character", kind: "character", tags: ["npc"], visibility: "players" },
    { id: "n-juno", name: "Juno Blanchard", type: "alien.character", kind: "character", tags: ["npc"], visibility: "gm" },
  ],
  relationships: [],
};

function threads(seed: string, inputs: Record<string, unknown> = {}, opts: Omit<ProcedureRunOptions, "seed" | "inputs"> = {}) {
  const graph = runProcedure(campaignThread, mod, { seed, inputs: { threads: 3, campaign: CAMPAIGN, ...inputs }, ...opts });
  return { graph, offers: (graph.results.offers as OfferSet).offers };
}

/** A snapshot with one thread (its first clue unseen), heat and contacts as given. */
function snapshot(over: Partial<ArcSnapshot> & { filled?: number; payoffs?: ArcSnapshot["threads"][number]["payoffs"] } = {}): ArcSnapshot {
  const { filled = 0, payoffs = [], ...rest } = over;
  return {
    threads: [
      {
        id: "t1",
        title: "Project Cold Ember",
        sponsor: "f-geo",
        sponsorName: "Geofund",
        goal: "Corner the sector's ore market by making independent shipments vanish",
        method: "Through a shell freight company that buys out failing contracts",
        status: "active",
        segments: 8,
        filled,
        ignored: true,
        clues: [
          { id: "c1", stage: 0, kind: "fact", text: "Three ore shipments in a row were cleared by the same signature", playerText: "Three ore shipments in a row were cleared by the same person", state: "unseen" },
          { id: "c2", stage: 0, kind: "person", text: "A dockhand who saw the ore barge loaded at night", playerText: "A dockhand who saw something loaded at night", state: "unseen" },
          { id: "c3", stage: 1, kind: "object", text: "A key card for an orbital cold store", playerText: "A key card for a place not on any chart", state: "unseen" },
        ],
        payoffs,
      },
    ],
    heat: [],
    contacts: [],
    ...rest,
  };
}

function board(seed: string, inputs: Record<string, unknown> = {}, opts: Omit<ProcedureRunOptions, "seed" | "inputs"> = {}) {
  const graph = runProcedure(jobBoard, mod, { seed, inputs: { postings: 3, campaign: CAMPAIGN, ...inputs }, ...opts });
  return { graph, offers: (graph.results.offers as OfferSet).offers };
}
const jobOf = (o: Offer) => o.produced.entities[0]!;
const briefOf = (o: Offer) => jobOf(o).fields.siteBrief as JobSiteBrief;

describe("the module's arcs", () => {
  it("pass conformance: generator, board, between jobs, heat on factions, the tick dice", () => {
    const report = checkModule(alienModule, { skipProcedureRuns: true });
    expect(report.issues.filter((i) => i.where === "arcs")).toEqual([]);
    expect(arcs.heat?.labels).toEqual([...HEAT_LABELS]);
    expect(HEAT_LABELS[0]).toBe("Unnoticed");
    expect(HEAT_LABELS[6]).toBe("Hunted");
  });
});

describe("alien.campaign-thread", () => {
  it("is deterministic: same seed and inputs, same threads and parts", () => {
    for (let i = 0; i < 10; i++) {
      const a = threads(`det-${i}`);
      const b = threads(`det-${i}`);
      expect(a.graph.results).toEqual(b.graph.results);
      expect(a.graph.parts).toEqual(b.graph.parts);
    }
    // recorded: any change to the tables or the dealing shows here; re-recorded once when later mentions
    // of the agent became "the ..." ({theAgent}), a text-only change, and once when two GM title patterns
    // were reworded ("{Sponsor} and the {subject}", "The squeeze on the {subject}"), text only
    const out: string[] = [];
    for (let i = 0; i < 40; i++) out.push(JSON.stringify(threads(`thread-fixture-${i}`, { sponsors: i % 3 === 0 ? "new" : "mixed" }).graph.results.offers));
    expect(createHash("sha256").update(out.join("\n")).digest("hex")).toBe("51b2aed716d4ed84d0d506dc2abcc6a971c72d573cc56df8ed33ea3fbccc0c93");
  });

  it("deals 1-3 threads from different sponsors, each with a goal, method, weakness, cost and title", () => {
    for (let n = 1; n <= 3; n++)
      for (let i = 0; i < 20; i++) {
        const { offers } = threads(`n-${n}-${i}`, { threads: n });
        expect(offers).toHaveLength(n);
        const sponsors = offers.map((o) => o.arc!.sponsor === "sponsor" ? o.produced.entities[0]!.name : o.arc!.sponsor);
        expect(new Set(sponsors).size).toBe(n);
        for (const o of offers) {
          const arc = o.arc!;
          for (const k of ["title", "playerTitle", "goal", "method", "weakness", "cost"] as const) expect(arc[k], k).toBeTruthy();
          expect(SCHEMES.some((s) => s.goal === arc.goal)).toBe(true);
          expect(METHODS.some((m) => m.method === arc.method)).toBe(true);
          expect(o.title).toBe(arc.title);
        }
      }
  });

  it("has 3-5 stages from first hints to the endgame, 2-4 clues each, and a 6-8 segment clock with a milestone per stage", () => {
    const kinds = new Set(arcs.clueKinds.map((k) => k.id));
    const seen = { stages: new Set<number>(), clues: new Set<number>(), segments: new Set<number>() };
    for (let i = 0; i < 60; i++) {
      for (const o of threads(`shape-${i}`).offers) {
        const arc = o.arc!;
        seen.stages.add(arc.stages.length);
        expect(arc.stages.length).toBeGreaterThanOrEqual(3);
        expect(arc.stages.length).toBeLessThanOrEqual(5);
        for (const s of arc.stages) {
          seen.clues.add(s.clues.length);
          expect(s.clues.length).toBeGreaterThanOrEqual(2);
          expect(s.clues.length).toBeLessThanOrEqual(4);
          for (const c of s.clues) {
            expect(kinds.has(c.kind)).toBe(true);
            expect(c.text && c.playerText && c.unlocks).toBeTruthy();
            expect(c.text).not.toMatch(/\{\w+\}/);
            expect(c.playerText).not.toMatch(/\{\w+\}/);
          }
        }
        const { segments, milestones } = arc.clock;
        seen.segments.add(segments);
        expect(segments).toBeGreaterThanOrEqual(6);
        expect(segments).toBeLessThanOrEqual(8);
        expect(milestones.map((m) => m.at)).toEqual(milestonePositions(segments, arc.stages.length));
        expect(milestones.at(-1)!.at).toBe(segments);
        expect(milestones.map((m) => m.stage)).toEqual(arc.stages.slice(1).map((_, k) => k + 1));
        for (const m of milestones) expect(m.payoffs!.length).toBeGreaterThan(0);
      }
    }
    expect([...seen.stages].sort()).toEqual([3, 4, 5]);
    expect([...seen.clues].sort()).toEqual([2, 3, 4]);
    expect([...seen.segments].sort()).toEqual([6, 7, 8]);
  });

  it("keeps the sponsor, goal and method out of the players' words", () => {
    for (let i = 0; i < 40; i++) {
      for (const o of threads(`player-${i}`).offers) {
        const arc = o.arc!;
        const sponsorName = arc.sponsor === "sponsor" ? o.produced.entities[0]!.name : CAMPAIGN.entities.find((e) => e.id === arc.sponsor)!.name;
        const playerWords = [arc.playerTitle, ...arc.stages.flatMap((s) => s.clues.map((c) => c.playerText)), o.playerText];
        for (const w of playerWords) {
          expect(w).not.toContain(sponsorName);
          expect(w).not.toContain(arc.goal);
          expect(w).not.toContain(arc.method);
          expect(w).not.toContain(arc.title);
        }
      }
    }
    // player texts never name a sponsor placeholder in the tables either
    for (const byTier of Object.values(CLUES)) for (const list of Object.values(byTier)) for (const t of list) expect(t.player).not.toMatch(/\{sponsor\}|\{goal/i);
  });

  it("picks campaign factions or adds a minor corporation from the book's list (p. 162), GM-only", () => {
    const fromCampaign = threads("campaign-1", { sponsors: "campaign" }).offers;
    for (const o of fromCampaign) {
      expect(o.produced.entities).toEqual([]);
      expect(["f-wy", "f-geo", "f-ca"]).toContain(o.arc!.sponsor);
    }
    const fresh = threads("new-1", { sponsors: "new" }).offers;
    for (const o of fresh) {
      const e = o.produced.entities[0]!;
      expect(o.arc!.sponsor).toBe("sponsor");
      expect(e).toMatchObject({ tempId: "sponsor", type: "alien.faction", visibility: "gm" });
      expect(e.fields.minor).toBe(true);
      expect(o.arc!.page).toBe(162);
    }
    // a book faction's setting page is cited
    const wy = threads("cite", { sponsors: "campaign", threads: 3 }).offers.find((o) => o.arc!.sponsor === "f-wy");
    expect(wy?.arc!.page).toEqual([172, 174]);
    expect(wy?.gmText).toContain("Weyland-Yutani (p. 172-174)");
    // sponsors of threads already on the board are used last
    const used = threads("used", { sponsors: "campaign", threads: 1, arcs: { ...snapshot(), threads: [{ ...snapshot().threads[0]!, sponsor: "f-wy" }, { ...snapshot().threads[0]!, id: "t2", sponsor: "f-geo" }] } }).offers;
    expect(used[0]!.arc!.sponsor).toBe("f-ca");
  });

  it("re-rolls and pins part by part", () => {
    const base = threads("parts", { threads: 2 });
    const key = "offers/thread-1/weakness";
    const rerolled = threads("parts", { threads: 2 }, { partSeeds: { [key]: "fresh-1" } });
    const a = base.offers[0]!.arc!;
    let b = rerolled.offers[0]!.arc!;
    for (let k = 2; b.weakness === a.weakness && k < 20; k++) b = threads("parts", { threads: 2 }, { partSeeds: { [key]: `fresh-${k}` } }).offers[0]!.arc!;
    expect(b.weakness).not.toBe(a.weakness);
    expect({ ...b, weakness: a.weakness }).toEqual(a);
    expect(rerolled.offers[1]).toEqual(base.offers[1]);
    // the whole thread re-rolled keeps a pinned stage
    const stage = "offers/thread-1/stage-1";
    const pinned = threads("parts", { threads: 2 }, { partSeeds: { "offers/thread-1": "other" }, pinnedParts: { [stage]: base.graph.parts![stage], "offers/thread-1/shape": base.graph.parts!["offers/thread-1/shape"], "offers/thread-1/scheme": base.graph.parts!["offers/thread-1/scheme"], "offers/thread-1/method": base.graph.parts!["offers/thread-1/method"], "offers/thread-1/site": base.graph.parts!["offers/thread-1/site"], "offers/thread-1/sponsor": base.graph.parts!["offers/thread-1/sponsor"] } });
    expect(pinned.offers[0]!.arc!.stages[0]).toEqual(a.stages[0]);
  });
});

describe("the job board without arcs", () => {
  /** The same fixture as the hash recorded before arcs existed. */
  function baseline(extra: (i: number) => Record<string, unknown> = () => ({})) {
    const out: string[] = [];
    for (const frame of FRAMES)
      for (let i = 0; i < 20; i++) {
        const campaign = { entities: [{ id: "f1", name: "Weyland-Yutani", type: "alien.faction", kind: "faction", tags: [], visibility: "players" }, { id: "n1", name: "Mara Quill", type: "alien.character", kind: "character", tags: ["npc"], visibility: "players" }], relationships: [] };
        const g = runProcedure(jobBoard, mod, { seed: `arc-base-${frame}-${i}`, inputs: { postings: 3, frame, treachery: i % 3 === 0 ? "common" : "rare", ...(i % 2 ? { campaign } : {}), ...extra(i) } });
        out.push(JSON.stringify({ r: g.results, p: g.parts, d: g.display }));
      }
    return createHash("sha256").update(out.join("\n")).digest("hex");
  }
  // recorded before the arcs were added to the board; re-recorded once when the typical NPCs' kit moved
  // their weapons to the Weapons list (the NPCs' gear rows changed, nothing the board deals did), and once when a
  // trucker pitch's verb began to agree with plural cargo ("metal ingots or pellets go to"), a text-only change,
  // and once for: the job's complications no longer repeating in one job (`distinct`, a repeat takes the next row), "deliver them" for plural
  // cargo and an NPC who wants "someone who will listen" (text only), and once when the contact the crew meets kept its stat
  // block GM-only (the produced NPC's fieldVisibility, nothing the board deals)
  const BEFORE_ARCS = "a6851bc9c14efa89172a0910d41e84a507eab40ba5f80eec8aedaf5fe607ff31";

  it("is byte-identical to the board before arcs", () => {
    expect(baseline()).toBe(BEFORE_ARCS);
  });

  it("is byte-identical when no thread, heat or contact exists, or the influence is off and no clue is seeded", () => {
    expect(baseline(() => ({ arcs: { threads: [], heat: [], contacts: [], seedClue: "auto", influence: true } }))).toBe(BEFORE_ARCS);
    const busy = (filled: number): ArcSnapshot => ({
      ...snapshot({ filled, payoffs: [{ milestone: 3, kind: "posting", text: "A posting" }] }),
      heat: [{ id: "f1", name: "Weyland-Yutani", heat: 6, label: "Hunted" }],
      contacts: [{ id: "n1", name: "Mara Quill", stance: "friendly", owedToCrew: 2, owedByCrew: 1, grudges: [], knows: [], visible: true }],
    });
    expect(baseline((i) => ({ arcs: { ...busy(i % 8), seedClue: "none", influence: false } }))).toBe(BEFORE_ARCS);
    expect(baseline((i) => ({ arcs: { ...busy(i % 8), influence: false } }))).toBe(BEFORE_ARCS);
  });
});

describe("clues seeded into postings", () => {
  const SLOTS = ["intent", "npc-secret", "npc-agenda", "cargo", "complication", "key-room", "contact"] as const;

  /** Seeds a clue; finds a board where the pinned placement fits each slot. */
  function seededIn(slot: (typeof SLOTS)[number]) {
    const contact = { id: "n-mara", name: "Mara Quill", stance: "friendly" as const, owedToCrew: 3, owedByCrew: 3, grudges: [], knows: [{ thread: "t1", clue: "c1" }], visible: true };
    for (let i = 0; i < 400; i++) {
      const arcsIn: ArcSnapshot = { ...snapshot(), contacts: slot === "contact" ? [contact] : [], seedClue: "t1/c1", influence: slot === "contact" };
      const base = board(`slot-${slot}-${i}`, { arcs: arcsIn, treachery: "common" });
      for (const posting of [1, 2, 3])
        for (const at of [0, 1, 2]) {
          const pin = { posting, slot, at };
          const res = board(`slot-${slot}-${i}`, { arcs: arcsIn, treachery: "common" }, { pinnedParts: { "offers/clue": pin } });
          const o = res.offers[posting - 1]!;
          const link = o.arcLinks?.find((l) => l.kind === "clue");
          if (link?.slot === slot && JSON.stringify(res.graph.parts!["offers/clue"]) === JSON.stringify(pin)) return { offer: o, link, base, res, at };
        }
    }
    throw new Error(`no board fits slot ${slot}`);
  }

  it.each(SLOTS)("places the clue in the %s, records the link, and keeps it out of the players' posting", (slot) => {
    const { offer, link, at } = seededIn(slot);
    const clue = "Three ore shipments in a row were cleared by the same signature";
    expect(link).toMatchObject({ kind: "clue", thread: "t1", clue: "c1", slot, slotLabel: arcs.slots!.find((s) => s.id === slot)!.label });
    expect(link.text).toContain(clue);
    expect(offer.playerText).not.toContain(clue);
    expect(offer.handout!.body).not.toContain(clue);
    expect(offer.gmText).toContain("Clue for “Project Cold Ember”");
    const job = jobOf(offer);
    expect(job.fieldVisibility?.arc).toBe("gm");
    const npc = offer.produced.entities.find((e) => e.tempId === `npc-${at + 1}`);
    switch (slot) {
      case "intent":
        expect(job.fields.employerIntent).toContain(clue);
        break;
      case "npc-secret":
        expect(link.entity).toBe(`npc-${at + 1}`);
        expect(npc!.fields.secret).toContain(clue);
        break;
      case "npc-agenda":
        expect(link.entity).toBe(`npc-${at + 1}`);
        expect(String(npc!.fields.personalAgenda)).toContain(clue);
        break;
      case "cargo":
        expect((job.fields.arc as { cargo: string }).cargo).toContain(clue);
        break;
      case "complication":
        expect((job.fields.arc as { complications: string[] }).complications.join(" ")).toContain(clue);
        break;
      case "key-room":
        expect(briefOf(offer).inputs.key_rooms[at]!.description).toContain(clue);
        break;
      case "contact":
        expect(link.entity).toBe("n-mara");
        expect(offer.produced.entities.some((e) => e.name === "Mara Quill")).toBe(false);
        expect(offer.produced.relationships.some((r) => r.from === "n-mara" && r.type === "involved_in")).toBe(true);
        break;
    }
  });

  it("auto seeds the first unseen clue of the most advanced thread", () => {
    const two: ArcSnapshot = { ...snapshot({ filled: 2 }), seedClue: "auto", influence: false };
    two.threads.push({ ...two.threads[0]!, id: "t2", title: "Operation Glass Anvil", filled: 5, clues: two.threads[0]!.clues.map((c, i) => ({ ...c, state: i === 0 ? "found" : "unseen" })) });
    const { offers } = board("auto-1", { arcs: two });
    const links = offers.flatMap((o) => o.arcLinks ?? []).filter((l) => l.kind === "clue");
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ thread: "t2", clue: "c2" });
  });

  it("re-rolling a posting keeps a pinned clue and moves an unpinned one", () => {
    const arcsIn: ArcSnapshot = { ...snapshot(), seedClue: "t1/c1", influence: false };
    const base = board("move-1", { arcs: arcsIn });
    const place = base.graph.parts!["offers/clue"] as { posting: number; slot: string };
    const key = `offers/posting-${place.posting}`;
    const pinned = board("move-1", { arcs: arcsIn }, { partSeeds: { [key]: "rerolled" }, pinnedParts: { "offers/clue": place } });
    expect(pinned.graph.parts!["offers/clue"]).toEqual(place);
    expect(pinned.offers[place.posting - 1]!.arcLinks?.some((l) => l.kind === "clue")).toBe(true);
    let moved = false;
    for (let k = 0; k < 12 && !moved; k++) {
      const re = board("move-1", { arcs: arcsIn }, { partSeeds: { [key]: `rerolled-${k}` } });
      moved = JSON.stringify(re.graph.parts!["offers/clue"]) !== JSON.stringify(place);
    }
    expect(moved).toBe(true);
  });
});

describe("clocks, heat and contacts weight the board", () => {
  const count = (fn: (o: Offer) => boolean, arcsIn: ArcSnapshot, n = 60) => {
    let hits = 0;
    for (let i = 0; i < n; i++) for (const o of board(`w-${i}`, { arcs: arcsIn }).offers) if (fn(o)) hits++;
    return hits;
  };
  const sponsored = (o: Offer) => o.slots.some((s) => s.key.endsWith("/arc-sponsor") && s.text !== "No");

  it("is deterministic and says on each posting what influenced it", () => {
    const arcsIn: ArcSnapshot = { ...snapshot({ filled: 5 }), heat: [{ id: "f-wy", name: "Weyland-Yutani", heat: 5, label: "Targeted", fields: { factionType: "corporation" } }], seedClue: "none" };
    for (let i = 0; i < 8; i++) {
      const a = board(`inf-${i}`, { arcs: arcsIn });
      expect(board(`inf-${i}`, { arcs: arcsIn }).graph.results).toEqual(a.graph.results);
      // the first posting weighs the thread's sponsor; a sponsor posts at most once a board
      expect(a.offers[0]!.slots.some((s) => s.key === "offers/posting-1/arc-sponsor")).toBe(true);
      for (const o of a.offers) {
        expect(o.influences?.length).toBeGreaterThan(0);
        expect(o.gmText).toContain("**Influenced by:**");
        expect(o.slots.some((s) => s.key.endsWith("/arc-heat"))).toBe(true);
        expect(o.playerText).not.toMatch(/Influenced|heat|Cold Ember/i);
      }
    }
  });

  it("advanced threads make sponsor postings more likely, and a posting payoff more likely still", () => {
    const none = count(sponsored, { ...snapshot({ filled: 0 }), seedClue: "none" });
    const some = count(sponsored, { ...snapshot({ filled: 3 }), seedClue: "none" });
    const many = count(sponsored, { ...snapshot({ filled: 7 }), seedClue: "none" });
    const payoff = count(sponsored, { ...snapshot({ filled: 3, payoffs: [{ milestone: 3, kind: "posting", text: "Geofund posts a job through a shell freight company" }] }), seedClue: "none" });
    expect(none).toBe(0);
    expect(some).toBeGreaterThan(0);
    expect(many).toBeGreaterThan(some);
    expect(payoff).toBeGreaterThan(some);
    // the sponsor posts the job: the employer is the campaign's faction, linked not created
    const o = board("sp-1", { arcs: { ...snapshot({ filled: 3, payoffs: [{ milestone: 3, kind: "posting", text: "A posting" }] }), seedClue: "none" } }).offers.find(sponsored) ?? [...Array(40).keys()].flatMap((i) => board(`sp-${i}`, { arcs: { ...snapshot({ filled: 3, payoffs: [{ milestone: 3, kind: "posting", text: "A posting" }] }), seedClue: "none" } }).offers).find(sponsored)!;
    expect(jobOf(o).fields.employer).toBe("Geofund");
    expect(o.produced.entities.some((e) => e.type === "alien.faction")).toBe(false);
    expect(o.produced.relationships.some((r) => r.from === "f-geo")).toBe(true);
    expect(o.arcLinks).toContainEqual({ kind: "payoff", thread: "t1", milestone: 3, payoff: "posting" });
    expect(String(jobOf(o).fields.employerIntent)).toContain("Project Cold Ember");
  });

  it("high heat brings that faction's complications and people to the site", () => {
    const hot: ArcSnapshot = { threads: [], heat: [{ id: "f-wy", name: "Weyland-Yutani", heat: 6, label: "Hunted", fields: { factionType: "corporation" } }], contacts: [] };
    const cool: ArcSnapshot = { ...hot, heat: [{ ...hot.heat[0]!, heat: 2, label: "Watched" }] };
    const complicated = (o: Offer) => ((jobOf(o).fields.arc as { complications?: string[] } | undefined)?.complications ?? []).some((c) => c.includes("Weyland-Yutani"));
    expect(count(complicated, hot)).toBeGreaterThan(count(complicated, cool));
    const sent = (o: Offer) => (o.influences ?? []).some((x) => x.includes("their people are at the site"));
    expect(count(sent, hot)).toBeGreaterThan(0);
    expect(count(sent, cool)).toBe(0);
    const o = [...Array(30).keys()].flatMap((i) => board(`w-${i}`, { arcs: hot }).offers).find(sent)!;
    expect(briefOf(o).inputs.hostiles.some((h) => h.group === "company-cleaner")).toBe(true);
    expect(briefOf(o).summary.join(" ")).toContain("Weyland-Yutani is hunting the crew (heat 6)");
  });

  it("a threat payoff puts the sponsor's people on the site", () => {
    const threat: ArcSnapshot = { ...snapshot({ filled: 4, payoffs: [{ milestone: 4, kind: "threat", text: "Geofund sends a security team to the next job site" }] }), seedClue: "none" };
    const o = [...Array(10).keys()].flatMap((i) => board(`th-${i}`, { arcs: threat }).offers).find((x) => x.arcLinks?.some((l) => l.kind === "payoff" && l.payoff === "threat"))!;
    expect(briefOf(o).inputs.hostiles.some((h) => h.group === "corporate-security")).toBe(true);
    expect(o.influences!.join(" ")).toContain("Geofund sends a security team");
  });
});

describe("contacts on the board", () => {
  const friend = { id: "n-mara", name: "Mara Quill", stance: "friendly" as const, owedToCrew: 1, owedByCrew: 1, grudges: [], knows: [], visible: true };
  const betrayer = { id: "n-juno", name: "Juno Blanchard", stance: "hostile" as const, owedToCrew: 0, owedByCrew: 0, grudges: ["The crew left her in the airlock"], knows: [], betrayer: true };

  it("lets a contact post the job, weighted by stance and favours, linked rather than created", () => {
    const posts = (c: typeof friend) => {
      let n = 0;
      let example: Offer | undefined;
      for (let i = 0; i < 60; i++)
        for (const o of board(`c-${i}`, { arcs: { threads: [], heat: [], contacts: [c] } }).offers)
          if (o.arcLinks?.some((l) => l.kind === "contact" && l.entity === c.id) && JSON.parse(JSON.stringify(jobOf(o).fields.posting)).postedBy === c.name) {
            n++;
            example ??= o;
          }
      return { n, example };
    };
    const warm = posts({ ...friend, owedToCrew: 2, owedByCrew: 2 });
    const wary = posts({ ...friend, stance: "wary" as never, owedToCrew: 0, owedByCrew: 0 });
    expect(warm.n).toBeGreaterThan(wary.n);
    const o = warm.example!;
    expect(o.produced.entities.some((e) => e.name === "Mara Quill")).toBe(false);
    expect(o.produced.relationships).toContainEqual(expect.objectContaining({ type: "involved_in", from: "n-mara", to: "job", note: "Contact" }));
    expect(o.playerText).toContain("Mara Quill");
    // a friendly contact never betrays the crew on their own job
    const npc = JSON.stringify(o.produced.entities);
    expect(o.influences!.join(" ")).toContain("Contact Mara Quill");
    expect(npc).not.toContain("n-mara");
    // never a hostile contact or a betrayer as the poster
    expect(posts({ ...betrayer, stance: "hostile" as never } as never).n).toBe(0);
  });

  it("brings a betrayer who survived back with a grudge as a rival", () => {
    let o: Offer | undefined;
    for (let i = 0; i < 60 && !o; i++) o = board(`g-${i}`, { treachery: "common", arcs: { threads: [], heat: [], contacts: [betrayer] } }).offers.find((x) => x.arcLinks?.some((l) => l.kind === "contact" && l.entity === "n-juno"));
    expect(o).toBeDefined();
    expect(o!.produced.relationships.some((r) => r.from === "n-juno" && r.type === "involved_in")).toBe(true);
    expect(o!.influences!.join(" ")).toContain("Juno Blanchard returns with a grudge: The crew left her in the airlock");
    expect(o!.gmText).toContain("Juno Blanchard");
    expect(o!.playerText).not.toContain("Juno Blanchard");
  });

  it("ties betrayers and hidden synthetics to a thread: their agenda gets its sponsor and goal", () => {
    let tied: Offer | undefined;
    for (let i = 0; i < 80 && !tied; i++) tied = board(`agent-${i}`, { treachery: "common", arcs: { ...snapshot({ filled: 4 }), seedClue: "none" } }).offers.find((o) => o.arcLinks?.some((l) => l.kind === "agent"));
    const link = tied!.arcLinks!.find((l) => l.kind === "agent")!;
    const npc = tied!.produced.entities.find((e) => e.tempId === link.entity)!;
    expect(String(npc.fields.personalAgenda)).toMatch(/Why: Works for Geofund, who want to corner the sector's ore market/);
  });
});

/** The thread data type stays exported for the demo. */
export type _ThreadData = ThreadData;
