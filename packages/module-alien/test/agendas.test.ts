import { describe, expect, it } from "vitest";
import { runProcedure, type AdventureSnapshot, type AgendaDraftSet, type CampaignSnapshot, type GeneratedGraph } from "@campaign-forge/module-sdk";
import { OPEN_CONFLICT_PATTERN } from "../src/builders/cinematic";
import { careerItems } from "../src/reference/careers";
import { AGENDA_ARCS, ALLEGIANCE_IDS, ARC_IDS, MOTIVE_IDS, arcById } from "../src/procedures/agenda-arcs";
import { analyseParty, type AnalysedMember } from "../src/procedures/agenda-conflicts";
import { buildCast, type Target } from "../src/procedures/agenda-targets";
import { agendaDraftsProcedure, minFrictionFor, STORY_POINT_PAGE, type DealResult, type SlotsMember } from "../src/procedures/agendas";
import { agendaTables, AGENDA_CATCH_EARLY_TABLE_ID, AGENDA_CATCH_LATE_TABLE_ID } from "../src/tables/agendas";
import { alienModule } from "../src/index";

// ---------------------------------------------------------------------------
// a sample campaign (original names) and an empty one
// ---------------------------------------------------------------------------

const pc = (id: string, name: string, career: string) => ({ id, name, type: "alien.character", kind: "character", pc: true, tags: [], fields: { career } });
const CAMPAIGN: CampaignSnapshot = {
  entities: [
    pc("pc-ada", "Ada Rook", "officer"),
    pc("pc-bo", "Bo Lantern", "medic"),
    pc("pc-cy", "Cy Varga", "roughneck"),
    pc("pc-dee", "Dee Morrow", "company-agent"),
    { id: "npc-vas", name: "Dr. Imre Vas", type: "alien.character", kind: "character", tags: [], fields: { role: "Lab director" } },
    { id: "npc-oka", name: "Tamsin Oka", type: "alien.character", kind: "character", tags: [], fields: { role: "Station chief" } },
    { id: "loc-hangar", name: "Hangar Four", type: "alien.location", kind: "location", subtype: "site", tags: [] },
    { id: "loc-comms", name: "Comms Array", type: "alien.location", kind: "location", subtype: "site", tags: [] },
    { id: "loc-lab", name: "Biolab", type: "alien.location", kind: "location", subtype: "site", tags: [] },
    { id: "clue-drive", name: "Black box drive", type: "alien.clue", kind: "clue", tags: [] },
    { id: "item-sample", name: "Prototype sample", type: "alien.item", kind: "item", subtype: "other", tags: [] },
    { id: "cr-stalker", name: "Stalker (vent)", type: "alien.creature", kind: "creature", tags: [] },
    { id: "fac-seeg", name: "Seegson", type: "alien.faction", kind: "faction", tags: [], fields: { factionType: "corporation" } },
  ],
  relationships: [
    { type: "buddy_of", from: "pc-ada", to: "pc-bo" },
    { type: "rival_of", from: "pc-cy", to: "pc-dee" },
  ],
};
const ADVENTURE: AdventureSnapshot = {
  id: "adv-1",
  title: "Long Night",
  premise: "A Seegson mining outpost reports a prototype sample missing.",
  situation: "Dr. Imre Vas smuggled the prototype sample out of the Biolab; the stalker hatched from it.",
  fields: { countdown: "The reactor vents in 20 minutes." },
  acts: [
    { number: 1, title: "Arrival", goal: "Land and find the staff.", fields: {} },
    { number: 2, title: "Tilt", goal: "The stalker hunts.", fields: {} },
    { number: 3, title: "Showdown", goal: "Escape through Hangar Four before the reactor vents.", fields: {} },
  ],
  cast: { pcs: ["pc-ada", "pc-bo", "pc-cy", "pc-dee"], npcs: ["npc-vas", "npc-oka"], locations: ["loc-hangar", "loc-comms", "loc-lab"] },
  rooms: ["Hangar Four", "Crew Quarters", "Reactor Hall"],
};
const PCS = CAMPAIGN.entities.filter((e) => e.pc).map((e) => ({ id: e.id, name: e.name, arc: "random" }));
const SAMPLE = { campaign: CAMPAIGN, adventure: ADVENTURE, pcs: PCS, betrayal: "frayed" };

function run(seed: string, inputs: Record<string, unknown>, extra: { partSeeds?: Record<string, string>; pinnedParts?: Record<string, unknown> } = {}): GeneratedGraph {
  return runProcedure(agendaDraftsProcedure, alienModule, { seed, inputs, ...extra });
}
const draftsOf = (g: GeneratedGraph) => g.results.agendaDrafts as AgendaDraftSet;
const withArc = (arc: string, base: Record<string, unknown> = SAMPLE) => ({
  ...base,
  pcs: (base.pcs as Array<Record<string, unknown>> | undefined)?.map((p, i) => (i === 0 ? { ...p, arc } : p)) ?? [{ id: "x", name: "Lone", arc }],
});

const SAMPLE_NAMES = CAMPAIGN.entities.map((e) => e.name.replace(/\s*\(.*\)$/, "")).concat(ADVENTURE.rooms);
const fallbackLabels = agendaTables.filter((t) => /fallback/.test(t.id)).flatMap((t) => t.rows.map((r) => r.label ?? ""));

// ---------------------------------------------------------------------------

describe("agenda arcs", () => {
  it("has 24 original arcs of three acts, every slot well formed", () => {
    expect(AGENDA_ARCS).toHaveLength(24);
    expect(new Set(ARC_IDS).size).toBe(24);
    for (const a of AGENDA_ARCS) {
      expect(a.acts, a.id).toHaveLength(3);
      expect(a.allegiances.length, a.id).toBeGreaterThan(0);
      for (const x of a.allegiances) expect(ALLEGIANCE_IDS).toContain(x);
      for (const m of a.motives) expect(MOTIVE_IDS).toContain(m);
      for (const o of a.opposes) expect(ARC_IDS, `${a.id} opposes ${o}`).toContain(o);
      for (const act of a.acts) {
        for (const text of act.objectives) expect(text, a.id).toContain("{target}");
        expect(act.risk.length, a.id).toBeGreaterThan(8);
      }
    }
  });

  it("is balanced across allegiances, motives and betrayal levels", () => {
    for (const al of ALLEGIANCE_IDS)
      expect(
        AGENDA_ARCS.some((a) => a.allegiances.includes(al)),
        al,
      ).toBe(true);
    for (const m of MOTIVE_IDS)
      expect(
        AGENDA_ARCS.some((a) => a.motives.includes(m)),
        m,
      ).toBe(true);
    for (const level of [0, 1, 2, 3]) expect(AGENDA_ARCS.filter((a) => a.betrayal === level).length, `level ${level}`).toBeGreaterThanOrEqual(2);
    expect(AGENDA_ARCS.filter((a) => a.cap === "synthetic").map((a) => a.id)).toEqual(["hidden-synthetic"]);
    expect(AGENDA_ARCS.filter((a) => a.cap === "plant").map((a) => a.id)).toEqual(["plant"]);
  });

  it("escalates: Act 1 never moves against anyone, Acts 1-2 stay quiet, every act says something new", () => {
    const pattern = new RegExp(OPEN_CONFLICT_PATTERN, "i");
    for (const a of AGENDA_ARCS) {
      expect(["harm", "destroy"], a.id).not.toContain(a.acts[0].stance);
      for (const act of a.acts.slice(0, 2)) for (const t of [...act.objectives, act.risk]) expect(t, a.id).not.toMatch(pattern);
      const firsts = a.acts.map((x) => x.objectives[0]);
      expect(new Set(firsts).size, a.id).toBe(3);
    }
    for (const id of [AGENDA_CATCH_EARLY_TABLE_ID]) for (const r of agendaTables.find((t) => t.id === id)!.rows) expect(r.label, id).not.toMatch(pattern);
  });

  it("is the module's own writing: no career agenda from the book's data", () => {
    const book = careerItems.flatMap((c) => c.agendas).map((s) => s.toLowerCase());
    const ours = AGENDA_ARCS.flatMap((a) => [a.summary, ...a.acts.flatMap((x) => [...x.objectives, x.risk])]).map((s) => s.toLowerCase());
    for (const b of book) for (const o of ours) expect(o.includes(b) || b.includes(o.replace("{target}", "").trim()), `"${o}" vs "${b}"`).toBe(false);
  });

  it("tables are original, cite no page and cover their dice", () => {
    for (const t of agendaTables) {
      expect(t.original, t.id).toBe(true);
      expect(t.page, t.id).toBeUndefined();
      for (const r of t.rows) expect(r.page, t.id).toBeUndefined();
    }
  });
});

describe("agenda drafts: filling the slots", () => {
  it.each(ARC_IDS)("%s fills every slot from the sample campaign", (arcId) => {
    const g = run(`fill-${arcId}`, withArc(arcId));
    const set = draftsOf(g);
    const ada = set.characters[0]!;
    expect(ada.title).toBe(arcById(arcId)!.name);
    expect(ada.acts).toHaveLength(3);
    const slots = (g.results.slots as SlotsMember[])[0]!;
    for (const [i, a] of ada.acts.entries()) {
      expect(a.text).not.toMatch(/\{|\}|undefined|NaN/);
      expect(a.text).toContain("Why: ");
      expect(a.text).toContain("Keep it from: ");
      expect(a.text).toContain("Story Point: earned if you ");
      expect(a.hint).toMatchObject({ label: "Story Point", page: STORY_POINT_PAGE });
      // targets come from the campaign, never the fallback tables, when it has them
      const target = slots.acts[i]!.target;
      expect(target.source, `${arcId} act ${i + 1}: ${target.name}`).not.toBe("fallback");
      expect(
        [...SAMPLE_NAMES, "Seegson"].some((n) => n.toLowerCase() === target.name.toLowerCase()),
        `${arcId} act ${i + 1}: ${target.name}`,
      ).toBe(true);
      expect(a.text).toContain(target.name);
    }
    // the arc lock points at its own input
    expect(ada.lock).toEqual({ path: ["pcs", 0, "arc"], value: arcId, locked: true });
  });

  it.each(ARC_IDS)("%s falls back to generic targets in an empty campaign", (arcId) => {
    const g = run(`empty-${arcId}`, {
      pcs: [
        { id: "pc-1", name: "PC 1", arc: arcId },
        { id: "pc-2", name: "PC 2", arc: "random" },
      ],
    });
    const set = draftsOf(g);
    const first = set.characters[0]!;
    expect(first.title).toBe(arcById(arcId)!.name);
    expect(first.inCampaign).toBe(false);
    const slots = (g.results.slots as SlotsMember[])[0]!;
    for (const [i, a] of first.acts.entries()) {
      expect(a.text).not.toMatch(/\{|\}|undefined|NaN/);
      const t = slots.acts[i]!.target;
      expect(["PC 2", "the Company", ...fallbackLabels], `${arcId} act ${i + 1}`).toContain(t.name);
    }
  });

  it("drafts placeholder PCs when there are none, and the default inputs run", () => {
    const g = run("defaults", {});
    const set = draftsOf(g);
    expect(set.characters.map((c) => c.name)).toEqual(["PC 1", "PC 2", "PC 3", "PC 4"]);
    expect(set.characters.every((c) => !c.inCampaign && !c.lock)).toBe(true);
  });

  it("takes the PCs of the adventure when none are listed, and reads the story", () => {
    const cast = buildCast({ campaign: CAMPAIGN, adventure: ADVENTURE });
    expect(cast.party.map((p) => p.name)).toEqual(["Ada Rook", "Bo Lantern", "Cy Varga", "Dee Morrow"]);
    expect(cast.party.find((p) => p.id === "pc-ada")!.buddies).toEqual(["pc-bo"]);
    expect(cast.party.find((p) => p.id === "pc-dee")!.rivals).toEqual(["pc-cy"]);
    expect(cast.pools.company).toBe("Seegson");
    expect(cast.pools.items[0]!.name).toBe("Prototype sample");
    expect(cast.pools.records[0]!.name).toBe("Black box drive");
    expect(cast.pools.exits[0]!.name).toBe("Hangar Four");
    expect(cast.pools.leader.name).toBe("Ada Rook");
    expect(cast.pools.hasCountdown).toBe(true);
    // without a campaign item, the premise picks the fallback
    const bare = buildCast({ adventure: { ...ADVENTURE, premise: "A survey probe dragged a specimen pod aboard.", situation: "" } });
    expect(bare.pools.items[0]!.name).toBe("the specimen");
    expect(bare.pools.company).toBe("the Company");
  });

  it("aims Act 3 at the climax: places the climax names are dealt more often", () => {
    let climax = 0;
    for (let i = 0; i < 60; i++) {
      const s = (run(`climax-${i}`, withArc("pilgrim")).results.slots as SlotsMember[])[0]!;
      if (s.acts[2]!.target.name === "Hangar Four") climax++;
    }
    expect(climax).toBeGreaterThan(30);
  });

  it("keeps a buddy and a rival in the arcs that need them", () => {
    const protector = (run("buddy", withArc("protector")).results.slots as SlotsMember[])[0]!;
    expect(protector.acts.map((a) => a.target.name)).toEqual(["Bo Lantern", "Bo Lantern", "Bo Lantern"]);
    const inputs = { ...SAMPLE, pcs: PCS.map((p) => (p.id === "pc-cy" ? { ...p, arc: "rival" } : p)) };
    const rival = (run("rival", inputs).results.slots as SlotsMember[]).find((s) => s.id === "pc-cy")!;
    expect(rival.acts.map((a) => a.target.name)).toEqual(["Dee Morrow", "Dee Morrow", "Dee Morrow"]);
  });
});

describe("agenda drafts: conflict check", () => {
  const t = (name: string): Target => ({ key: `name:${name}`, name, kind: "item", source: "fallback" });
  const member = (id: string, arcId: string, allegiance: AnalysedMember["allegiance"], targets: Target[]): AnalysedMember => {
    const arc = arcById(arcId)!;
    return { id, name: id, arc, allegiance, acts: arc.acts.map((a, i) => ({ target: targets[i]!, stance: a.stance })), buddies: [], rivals: [] };
  };

  it("detects opposed objectives on the same target", () => {
    const spec = t("the specimen");
    const plant = member("Ann", "plant", "company", [spec, spec, spec]);
    const saboteur = member("Ben", "saboteur", "union", [t("Lab"), t("Lab"), spec]);
    const a = analyseParty([plant, saboteur], 2);
    expect(a.pairs[0]!.reasons[0]).toMatch(/the specimen: Ann wants it .*Ben wants it destroyed/);
    expect(a.pairs[0]!.score).toBeGreaterThanOrEqual(3 + 1 + 1); // collision, competing masters, opposed arcs
    expect(a.ok).toBe(true);
    // the same targets with nothing between them: no clash
    const quiet = analyseParty([member("Ann", "pilgrim", "belief", [t("A"), t("B"), t("C")]), member("Ben", "martyr", "crew", [t("D"), t("E"), t("F")])], 2);
    expect(quiet.ok).toBe(false);
    expect(quiet.problems.map((p) => p.text)).toEqual(expect.arrayContaining(["Ann has no conflict with anyone", "Ben has no conflict with anyone", "Too little friction: 0 (minimum 2)"]));
  });

  it("enforces the caps: never deals two Hidden Synthetics or two Company plants", () => {
    const six = { pcs: Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, arc: "random" })), betrayal: "knives-out" };
    for (let i = 0; i < 150; i++) {
      const g = run(`caps-${i}`, six);
      const check = g.results.check as ReturnType<typeof analyseParty>;
      expect(check.caps.synthetic, `seed ${i}`).toBeLessThanOrEqual(1);
      expect(check.caps.plant, `seed ${i}`).toBeLessThanOrEqual(1);
    }
    // two locked synthetics break the cap and the report says so
    const locked = run("locked", {
      pcs: [
        { id: "a", name: "A", arc: "hidden-synthetic" },
        { id: "b", name: "B", arc: "hidden-synthetic" },
      ],
    });
    const report = draftsOf(locked).report!;
    expect(report.ok).toBe(false);
    expect(report.lines).toEqual(expect.arrayContaining([{ tone: "danger", text: "Hidden Synthetics: 2 (at most one)" }]));
  });

  it("re-deals a party that fails, deterministically, and reports it", () => {
    let redealt: GeneratedGraph | undefined;
    for (let i = 0; i < 40 && !redealt; i++) {
      const g = run(`redeal-${i}`, SAMPLE);
      if ((g.results.deal as DealResult).attempt > 1 && (g.results.deal as DealResult).passed) redealt = g;
    }
    expect(redealt).toBeDefined();
    const deal = redealt!.results.deal as DealResult;
    expect(deal.log.slice(0, -1).every((l) => !l.ok)).toBe(true);
    expect(draftsOf(redealt!).report!.lines.filter((l) => l.text.startsWith("Deal ") && l.text.includes("re-dealt"))).toHaveLength(deal.attempt - 1);
    expect(run(redealt!.seed, SAMPLE)).toEqual(redealt);
    // an impossible minimum: every re-deal fails, the best deal is kept and flagged
    const hard = run("hard", { ...SAMPLE, minFriction: 999, redeals: 5 });
    const hd = hard.results.deal as DealResult;
    expect(hd.passed).toBe(false);
    expect(hd.log).toHaveLength(5);
    const report = draftsOf(hard).report!;
    expect(report.ok).toBe(false);
    expect(report.lines.map((l) => l.text)).toEqual(
      expect.arrayContaining(["No deal in 5 passed; kept the one with the most friction.", expect.stringMatching(/^Too little friction: \d+ \(minimum 999\)$/)]),
    );
  });

  it("passes for most seeds, with every PC in at least one clash", () => {
    let passed = 0;
    for (let i = 0; i < 40; i++) {
      const g = run(`pass-${i}`, SAMPLE);
      const check = g.results.check as ReturnType<typeof analyseParty>;
      if (!check.ok) continue;
      passed++;
      expect(Object.values(check.clashing).every(Boolean)).toBe(true);
      expect(check.friction).toBeGreaterThanOrEqual(check.minFriction);
    }
    expect(passed).toBeGreaterThan(30);
  });

  it("scales the dial's minimum to the party, or takes the GM's", () => {
    expect(minFrictionFor("frayed", 4)).toBe(5);
    expect(minFrictionFor("knives-out", 2)).toBe(2);
    expect(minFrictionFor("frayed", 1)).toBe(0);
    expect(minFrictionFor("loyal-crew", 6, 1)).toBe(1);
  });

  it("weights arcs by the betrayal dial", () => {
    const betrayalOf = (dial: string) => {
      let total = 0;
      for (let i = 0; i < 40; i++) for (const m of (run(`dial-${i}`, { ...SAMPLE, betrayal: dial }).results.deal as DealResult).members) total += arcById(m.arc)!.betrayal;
      return total;
    };
    expect(betrayalOf("loyal-crew")).toBeLessThan(betrayalOf("frayed"));
    expect(betrayalOf("frayed")).toBeLessThan(betrayalOf("knives-out"));
  });
});

describe("agenda drafts: determinism and slots", () => {
  it("same seed and inputs give the same cards; seeds differ", () => {
    const a = run("same", SAMPLE);
    expect(run("same", SAMPLE)).toEqual(a);
    const texts = new Set(["one", "two", "three", "four"].map((s) => JSON.stringify(draftsOf(run(s, SAMPLE)).characters.map((c) => c.acts.map((x) => x.text)))));
    expect(texts.size).toBe(4);
  });

  it("re-rolls one slot without moving the others, and keeps a pinned slot through a new seed", () => {
    const base = run("slot", SAMPLE);
    const set = draftsOf(base);
    const key = set.characters[1]!.acts[1]!.slots.find((s) => s.label === "Catch")!.key;
    const rolled = run("slot", SAMPLE, { partSeeds: { [key]: "again" } });
    const after = draftsOf(rolled);
    expect(after.characters[1]!.acts[1]!.slots.find((s) => s.label === "Catch")!.text).not.toBe(set.characters[1]!.acts[1]!.slots.find((s) => s.label === "Catch")!.text);
    // everything else is the same
    const strip = (d: AgendaDraftSet) => d.characters.map((c, i) => c.acts.map((a, j) => (i === 1 && j === 1 ? "" : a.text)));
    expect(strip(after)).toEqual(strip(set));
    // a pinned target survives a new seed
    const targetKey = set.characters[0]!.acts[2]!.slots.find((s) => s.label === "Target")!.key;
    const pinned = run("other-seed", { ...SAMPLE, pcs: PCS.map((p, i) => (i === 0 ? { ...p, arc: set.characters[0]!.lock!.value } : p)) }, { pinnedParts: { [targetKey]: base.parts![targetKey] } });
    expect(draftsOf(pinned).characters[0]!.acts[2]!.slots.find((s) => s.label === "Target")!.text).toBe(set.characters[0]!.acts[2]!.slots.find((s) => s.label === "Target")!.text);
  });

  it("locking the arc dealt keeps the deal", () => {
    const base = run("lock", SAMPLE);
    const arc = draftsOf(base).characters[2]!.lock!.value;
    const locked = run("lock", { ...SAMPLE, pcs: PCS.map((p, i) => (i === 2 ? { ...p, arc } : p)) });
    expect((locked.results.deal as DealResult).members.map((m) => m.arc)).toEqual((base.results.deal as DealResult).members.map((m) => m.arc));
    expect(draftsOf(locked).characters[2]!.lock!.locked).toBe(true);
  });

  it("writes into the cinematic agendas field and marks the cards as drafts", () => {
    const set = draftsOf(run("field", SAMPLE));
    expect(set.field).toBe("agendas");
    expect(set.acts).toEqual([1, 2, 3]);
    expect(set.note).toMatch(/^DRAFT/);
    const lateCatches = agendaTables.find((x) => x.id === AGENDA_CATCH_LATE_TABLE_ID)!.rows.map((r) => r.label);
    for (const c of set.characters) expect(lateCatches).toContain(c.acts[2]!.slots.find((s) => s.label === "Catch")!.text);
  });
});
