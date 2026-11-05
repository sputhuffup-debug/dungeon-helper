import { describe, expect, it } from "vitest";
import { checkModule, runProcedure, validateEntityFields, type CampaignSnapshot, type GeneratedGraph, type LongAgendaDraftSet } from "@campaign-forge/module-sdk";
import { ARC_IDS } from "../src/procedures/agenda-arcs";
import {
  ALLOWED_STANCES,
  BANNED_STANCES,
  CAMPAIGN_BETRAYAL_MAX,
  CAMPAIGN_GOALS,
  EMBARRASSING_SECRETS,
  FRICTION_KINDS,
  FRICTION_TEMPLATES,
  TENSION_CAP,
  TENSION_LADDER,
  followUpsOf,
  goalById,
} from "../src/procedures/campaign-agenda-data";
import { BANNED_PATTERNS, campaignMaterialTexts, checkCampaignDeal, scanText } from "../src/procedures/campaign-agenda-check";
import {
  CAMPAIGN_AGENDA_DEF,
  CAMPAIGN_AGENDA_FIELD,
  buildCampaignCast,
  campaignAgendasProcedure,
  type CampaignAgendaOutcome,
  type CampaignAgendaRecord,
} from "../src/procedures/campaign-agendas";
import { characterType } from "../src/entities/character";
import { alienModule } from "../src/index";

// ---------------------------------------------------------------------------
// a sample campaign (original names)
// ---------------------------------------------------------------------------

const NAMES = ["Ada Rook", "Bo Lantern", "Cy Varga", "Dee Morrow", "Eli Strand", "Fen Okoye", "Gus Partridge", "Hal Ivers"];
const CAREERS = ["officer", "medic", "roughneck", "company-agent", "pilot", "kid", "scientist", "colonial-marshal"];

/** A sample crew's campaign. Mira Tolland is the GM's secret; the rest the players can see (or, with `employerHidden`, not the employer). */
function campaignOf(n: number, links = true, opts: { employerHidden?: boolean } = {}): CampaignSnapshot {
  const open = "players" as const;
  const pcs = NAMES.slice(0, n).map((name, i) => ({ id: `pc-${i + 1}`, name, type: "alien.character", kind: "character", pc: true, tags: [], fields: { career: CAREERS[i]! }, visibility: open }));
  const relationships: CampaignSnapshot["relationships"] = [];
  if (links && n >= 2) relationships.push({ type: "buddy_of", from: "pc-1", to: "pc-2" });
  if (links && n >= 4) relationships.push({ type: "rival_of", from: "pc-3", to: "pc-4" });
  if (links && n >= 6) relationships.push({ type: "rival_of", from: "pc-5", to: "pc-1" });
  const employer = opts.employerHidden ? ("gm" as const) : open;
  return {
    entities: [
      ...pcs,
      { id: "npc-1", name: "Mira Tolland, Dockmaster", type: "alien.character", kind: "character", tags: [], fields: { role: "Dockmaster" }, visibility: "gm" },
      { id: "npc-2", name: "Oskar Vell", type: "alien.character", kind: "character", tags: [], fields: {}, visibility: open },
      { id: "loc-home", name: "Tamber Station", type: "alien.location", kind: "location", subtype: "colony", tags: ["home-base"], visibility: open },
      { id: "loc-bar", name: "The Lamp Room", type: "alien.location", kind: "location", subtype: "site", tags: [], visibility: open },
      { id: "ship-1", name: "MV Corran", type: "alien.spaceship", kind: "vehicle", tags: [], visibility: open },
      { id: "fac-1", name: "Halvard Freight", type: "alien.faction", kind: "faction", tags: [], fields: { factionType: "corporation" }, visibility: employer },
      { id: "job-1", name: "Haul water ice for Halvard Freight", type: "alien.job", kind: "job", tags: [], fields: { employer: "Halvard Freight" }, visibility: employer },
    ],
    relationships,
  };
}

/** Every text the players see from a set: each PC's friction lines. */
const playerTexts = (set: LongAgendaDraftSet) => set.friction.flatMap((l) => Object.values(l.text));

const inputsFor = (n: number, extra: Record<string, unknown> = {}) => ({ campaign: campaignOf(n), friction: "simmering", ...extra });
const run = (seed: string, inputs: Record<string, unknown>, extra: { partSeeds?: Record<string, string>; pinnedParts?: Record<string, unknown> } = {}): GeneratedGraph =>
  runProcedure(campaignAgendasProcedure, alienModule, { seed, inputs, ...extra });
const setOf = (g: GeneratedGraph) => g.results.longAgendaDrafts as LongAgendaDraftSet;
const recordsOf = (set: LongAgendaDraftSet) => Object.fromEntries(set.characters.map((c) => [c.id, c.record as unknown as CampaignAgendaRecord]));

/** The next stage: every PC's record with an outcome. */
function next(seed: string, set: LongAgendaDraftSet, outcomes: Record<string, CampaignAgendaOutcome | undefined>, base: Record<string, unknown>, jobLabel = "Job 2") {
  const progress = set.characters.map((c) => ({ id: c.id, name: c.name, record: c.record, ...(outcomes[c.id] ? { outcome: outcomes[c.id] } : {}) }));
  return setOf(run(seed, { ...base, progress, jobLabel }));
}

// ---------------------------------------------------------------------------
// the catalogue
// ---------------------------------------------------------------------------

describe("campaign agenda catalogue", () => {
  it("has 24 goals of four beats each, 22 friction lines across the four kinds, 12 secrets and a four-step ladder", () => {
    expect(CAMPAIGN_GOALS).toHaveLength(24);
    for (const g of CAMPAIGN_GOALS) expect(g.beats.length, g.id).toBeGreaterThanOrEqual(4);
    expect(FRICTION_TEMPLATES).toHaveLength(22);
    for (const k of FRICTION_KINDS) expect(FRICTION_TEMPLATES.filter((t) => t.kind === k).length, k).toBeGreaterThanOrEqual(4);
    expect(EMBARRASSING_SECRETS).toHaveLength(12);
    expect(TENSION_LADDER.map((t) => t.label)).toEqual(["Calm", "Quiet disagreement", "Open argument", "Hard words"]);
    expect(TENSION_CAP).toBe(3);
  });

  it("is all betrayal level 0-1, takes no banned stance, and no secret endangers anyone", () => {
    for (const g of CAMPAIGN_GOALS) {
      expect(g.betrayal, g.id).toBeLessThanOrEqual(CAMPAIGN_BETRAYAL_MAX);
      expect(ALLOWED_STANCES as readonly string[]).toContain(g.stance);
      expect(ARC_IDS as readonly string[]).not.toContain(g.id);
      for (const b of g.beats) {
        expect(b.betrayal).toBeLessThanOrEqual(CAMPAIGN_BETRAYAL_MAX);
        // a beat that names a crewmate says how it treats them, and it is friendly
        if (/\{(crewmate|buddy|rival)\}/.test(b.text)) expect(ALLOWED_STANCES as readonly string[], `${g.id}: ${b.text}`).toContain(b.stance);
        if (b.stance) expect(BANNED_STANCES as readonly string[]).not.toContain(b.stance);
      }
    }
    for (const t of FRICTION_TEMPLATES) {
      expect(t.betrayal, t.id).toBeLessThanOrEqual(CAMPAIGN_BETRAYAL_MAX);
      expect(ALLOWED_STANCES as readonly string[], t.id).toContain(t.stance);
    }
    for (const s of EMBARRASSING_SECRETS) {
      expect(s.endangers).toBe(false);
      expect(s.betrayal).toBeLessThanOrEqual(CAMPAIGN_BETRAYAL_MAX);
      // the topic, which players see, gives nothing of the secret away
      expect(s.text.toLowerCase()).not.toContain(s.topic.toLowerCase().replace(/^the /, ""));
    }
    for (const t of TENSION_LADDER) expect(t.betrayal).toBeLessThanOrEqual(CAMPAIGN_BETRAYAL_MAX);
    // the cinematic generator's stances against a target are all banned here
    expect(BANNED_STANCES).toEqual(expect.arrayContaining(["harm", "deny", "expose", "take", "keep-from"]));
  });

  it("text guard: no campaign material contains a word of betrayal", () => {
    const hits = campaignMaterialTexts()
      .map((m) => ({ ...m, hits: scanText(m.text) }))
      .filter((m) => m.hits.length);
    expect(hits).toEqual([]);
    expect(campaignMaterialTexts().length).toBeGreaterThan(200);
  });

  it("text guard: catches what it is meant to catch", () => {
    for (const bad of [
      "Betray the crew to the Company.",
      "Sabotage the reactor.",
      "Kill the captain.",
      "Sell them out to the marshals.",
      "Frame Reyes for it.",
      "Steal from the crew.",
      "Turn on your buddy.",
      "Keep it from Reyes.",
      "Leave the crew behind.",
      "Expose the synthetic.",
      "The hidden synthetic.",
      "Poison the coffee.",
    ]) {
      expect(scanText(bad), bad).not.toEqual([]);
    }
    expect(BANNED_PATTERNS.length).toBeGreaterThanOrEqual(20);
  });

  it("follow-ups: every goal has at least one, all real, never itself, for every allegiance it allows", () => {
    for (const g of CAMPAIGN_GOALS) {
      for (const a of g.allegiances) {
        const f = followUpsOf(g.id, a);
        expect(f.length, `${g.id}/${a}`).toBeGreaterThan(0);
        expect(f).not.toContain(g.id);
        for (const id of f) expect(goalById(id), id).toBeDefined();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// the deal
// ---------------------------------------------------------------------------

describe("campaign agendas: deal", () => {
  it("is in campaign mode only, and declares the long-agenda contract", () => {
    expect(campaignAgendasProcedure.mode).toEqual(["campaign"]);
    expect(campaignAgendasProcedure.longAgendas).toBe(CAMPAIGN_AGENDA_DEF);
    expect(CAMPAIGN_AGENDA_DEF.field).toBe(CAMPAIGN_AGENDA_FIELD);
    expect(CAMPAIGN_AGENDA_DEF.summaryField).toBe("personalAgenda");
    expect(CAMPAIGN_AGENDA_DEF.tension?.levels).toHaveLength(TENSION_CAP + 1);
    expect(characterType.defaultVisibility?.[CAMPAIGN_AGENDA_FIELD]).toBe("gm");
  });

  it("reads the crew, employer, home and ship from the campaign", () => {
    const cast = buildCampaignCast(inputsFor(4));
    expect(cast.party.map((p) => p.name)).toEqual(NAMES.slice(0, 4));
    expect(cast.employer).toBe("Halvard Freight");
    expect(cast.home).toBe("Tamber Station");
    expect(cast.ship).toBe("MV Corran");
    expect(cast.npcs).toEqual(["Mira Tolland", "Oskar Vell"]);
    expect(cast.places).toEqual(["Tamber Station", "The Lamp Room"]);
    // what the players may hear named: not the GM's secret NPC
    expect(cast.open).toEqual({ npcs: ["Oskar Vell"], employer: "Halvard Freight" });
    expect(cast.hidden).toEqual(["Mira Tolland, Dockmaster", "Mira Tolland"]);
    const secretEmployer = buildCampaignCast({ campaign: campaignOf(4, true, { employerHidden: true }) });
    expect(secretEmployer.employer).toBe("Halvard Freight");
    expect(secretEmployer.open.employer).toBe("the employer");
    // an older snapshot without visibility: nothing in it counts as seen
    const old = campaignOf(2);
    for (const e of old.entities) delete (e as { visibility?: unknown }).visibility;
    expect(buildCampaignCast({ campaign: old }).open).toEqual({ npcs: expect.arrayContaining(["the dockmaster"]), employer: "the employer" });
  });

  it("friction the players see never names a GM-only NPC or employer: one PC and a crew, over many seeds", () => {
    for (const n of [1, 2, 4]) {
      for (let i = 0; i < 60; i++) {
        for (const employerHidden of [false, true]) {
          const g = run(`hidden-${n}-${i}-${employerHidden}`, { campaign: campaignOf(n, true, { employerHidden }), friction: "prickly" });
          const set = setOf(g);
          expect((g.results.check as { ok: boolean }).ok).toBe(true);
          for (const t of playerTexts(set)) {
            expect(t).not.toContain("Mira Tolland");
            if (employerHidden) expect(t).not.toContain("Halvard Freight");
          }
        }
      }
    }
    // GM-only goals and beats may still name anyone
    const lone = Array.from({ length: 40 }, (_, i) => setOf(run(`gm-npc-${i}`, { campaign: campaignOf(1), friction: "prickly" })));
    expect(lone.some((s) => s.characters.some((c) => c.beat.text.includes("Mira Tolland")))).toBe(true);
  });

  it("carried friction is scrubbed of names the players can no longer see", () => {
    const set = setOf(run("carry-scrub", { campaign: campaignOf(1), friction: "prickly" }));
    const c = set.characters[0]!;
    const record = JSON.parse(JSON.stringify(c.record)) as CampaignAgendaRecord;
    record.friction[0]!.text = "You and Mira Tolland disagree about who you really work for.";
    record.friction[0]!.outsider = "Mira Tolland";
    const next = setOf(run("carry-scrub-2", { campaign: campaignOf(1), friction: "prickly", progress: [{ id: c.id, record, outcome: "advanced" }], jobLabel: "Job 2" }));
    const texts = playerTexts(next);
    expect(texts.join(" ")).not.toContain("Mira Tolland");
    expect(texts).toContain("You and someone disagree about who you really work for.");
  });

  it("is deterministic: same seed, same deal", () => {
    const a = run("det", inputsFor(4));
    const b = run("det", inputsFor(4));
    expect(b).toEqual(a);
    expect(run("det-2", inputsFor(4))).not.toEqual(a);
  });

  it("deals the same for a campaign rebuilt with new ids (streams follow the party, not the ids)", () => {
    const renamed = JSON.parse(JSON.stringify(inputsFor(4)).replace(/pc-(\d)/g, "crew-$1")) as Record<string, unknown>;
    const texts = (g: GeneratedGraph) => setOf(g).characters.map((c) => [c.summary, c.beat.text]);
    expect(texts(run("ids", renamed))).toEqual(texts(run("ids", inputsFor(4))));
  });

  it("gives every PC a goal whose summary is the personal agenda, a beat with a cost and an XP hint, and records that fit the schema", () => {
    const set = setOf(run("cards", inputsFor(4)));
    expect(set.stage).toBe("deal");
    expect(set.characters).toHaveLength(4);
    for (const c of set.characters) {
      const r = c.record as unknown as CampaignAgendaRecord;
      expect(r.goal.text).toBe(c.summary);
      expect(c.summary).not.toMatch(/\{\w+\}/);
      expect(c.beat.text).not.toMatch(/\{\w+\}/);
      expect(c.beat.hint?.page).toEqual([27, 30]);
      expect(r.tension).toBe(0);
      expect(r.friction.length).toBeGreaterThan(0);
      const fields = { isPC: true, personalAgenda: c.summary, [CAMPAIGN_AGENDA_FIELD]: r };
      const v = validateEntityFields(characterType, fields);
      expect(v.errors.filter((e) => e.path.startsWith(CAMPAIGN_AGENDA_FIELD))).toEqual([]);
    }
    expect(set.report?.ok).toBe(true);
  });

  it("re-rolls one slot without touching the others, and pins hold", () => {
    const base = run("parts", inputsFor(4));
    const s0 = setOf(base);
    const key = `slots/${s0.characters[1]!.id}/cost`;
    const rerolled = setOf(run("parts", inputsFor(4), { partSeeds: { [key]: "again" } }));
    expect(rerolled.characters[1]!.beat.text).not.toBe(s0.characters[1]!.beat.text);
    expect(rerolled.characters[0]!.beat.text).toBe(s0.characters[0]!.beat.text);
    expect(rerolled.characters[1]!.summary).toBe(s0.characters[1]!.summary);
    const line = s0.friction.find((l) => l.key)!;
    const reLine = setOf(run("parts", inputsFor(4), { partSeeds: { [line.key!]: "x" } }));
    expect(reLine.characters.map((c) => c.summary)).toEqual(s0.characters.map((c) => c.summary));
    const pinned = setOf(run("parts", inputsFor(4), { partSeeds: { [key]: "again" }, pinnedParts: { [key]: base.parts![key] } }));
    expect(pinned.characters[1]!.beat.text).toBe(s0.characters[1]!.beat.text);
  });

  it("the friction dial sets how many lines each PC is in, never betrayal", () => {
    for (const [dial, per] of [
      ["calm", 1],
      ["simmering", 2],
      ["prickly", 3],
    ] as const) {
      const set = setOf(run(`dial-${dial}`, inputsFor(4, { friction: dial })));
      for (const c of set.characters) expect(set.friction.filter((l) => l.between.includes(c.id)).length, `${dial}: ${c.name}`).toBeGreaterThanOrEqual(per);
      expect(set.report?.ok).toBe(true);
    }
  });

  it("friction handouts read 'You and <name>' from each side, and secret lines never show the secret", () => {
    const set = setOf(run("voice", inputsFor(4, { friction: "prickly" })));
    const names = new Map(set.characters.map((c) => [c.id, c.name]));
    for (const l of set.friction) {
      for (const [id, text] of Object.entries(l.text)) {
        expect(text).not.toMatch(/\{\w+\}/);
        const others = l.between.filter((x) => x !== id);
        for (const o of others) expect(text).toContain(names.get(o)!);
        if (l.kind === "secrets") for (const s of EMBARRASSING_SECRETS) expect(text).not.toContain(s.text);
      }
    }
  });

  it("buddy and rival lines only between PCs linked on the sheet", () => {
    for (let i = 0; i < 40; i++) {
      const set = setOf(run(`ties-${i}`, inputsFor(6, { friction: "prickly" })));
      for (const l of set.friction.filter((x) => x.kind === "ties" && x.between.length === 2)) {
        const pair = [...l.between].sort().join("|");
        expect(["pc-1|pc-2", "pc-3|pc-4", "pc-1|pc-5"]).toContain(pair);
      }
    }
  });

  it("puts all four kinds in the mix across a campaign's deals", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 30; i++) for (const l of setOf(run(`mix-${i}`, inputsFor(4))).friction) seen.add(l.kind);
    expect([...seen].sort()).toEqual([...FRICTION_KINDS].sort());
  });
});

// ---------------------------------------------------------------------------
// the no-betrayal guarantee, over many seeds and party sizes
// ---------------------------------------------------------------------------

describe("campaign agendas: the first beats", () => {
  it("spread across the NPCs: no two PCs' beats name the same NPC while another is free", () => {
    for (let i = 0; i < 60; i++) {
      for (const n of [2, 3]) {
        const slots = run(`spread-${n}-${i}`, inputsFor(n)).results.slots as Array<{ fill: { npc: string } }>;
        const npcs = slots.map((s) => s.fill.npc);
        // two NPCs in the campaign: the first two PCs never share one
        expect(new Set(npcs.slice(0, 2)).size, npcs.join(", ")).toBe(2);
      }
    }
  });
});

describe("campaign agendas: no betrayal, for any deal", () => {
  const SEEDS = 200;
  for (let n = 1; n <= 8; n++) {
    it(`${SEEDS} seeds × ${n} PC${n === 1 ? "" : "s"}: the check passes, nothing above level 1, everyone clashes with someone, nobody with everything`, () => {
      const dials = ["calm", "simmering", "prickly"];
      for (let i = 0; i < SEEDS; i++) {
        const g = run(`prop-${n}-${i}`, inputsFor(n, { friction: dials[i % 3] }));
        const set = setOf(g);
        const check = g.results.check as { ok: boolean; problems: Array<{ text: string }> };
        expect(check.problems.map((p) => p.text), `seed prop-${n}-${i}`).toEqual([]);
        expect(set.report?.ok).toBe(true);
        expect(set.characters).toHaveLength(n);
        for (const c of set.characters) {
          const r = c.record as unknown as CampaignAgendaRecord;
          expect(goalById(r.goal.id)).toBeDefined();
          expect(ARC_IDS as readonly string[]).not.toContain(r.goal.id);
          expect(r.tension).toBeLessThanOrEqual(TENSION_CAP);
          expect(r.friction.length).toBeGreaterThan(0);
          for (const t of [c.summary, c.beat.text, ...r.friction.map((f) => f.text)]) expect(scanText(t), t).toEqual([]);
        }
        if (n === 1) {
          // a lone PC's friction is with the employer and NPCs
          expect(set.friction.every((l) => l.between.length === 1)).toBe(true);
        } else {
          for (const c of set.characters) expect(set.friction.some((l) => l.between.length === 2 && l.between.includes(c.id))).toBe(true);
        }
        if (n >= 3 && set.friction.length >= 3) for (const c of set.characters) expect(set.friction.every((l) => l.between.includes(c.id))).toBe(false);
      }
    });
  }

  it("the checker rejects betrayal material, banned stances, endangering secrets, tension over the cap, loners and pile-ons", () => {
    const m = (id: string, extra: Partial<Parameters<typeof checkCampaignDeal>[0][number]> = {}) => ({ id, name: id, goal: "stake", beat: 0, beatNamesPc: false, secret: "cards", tension: 0, texts: [], ...extra });
    const ok = checkCampaignDeal([m("a"), m("b")], [{ key: "l1", tpl: "want-different", between: ["a", "b"] }]);
    expect(ok.ok).toBe(true);
    expect(checkCampaignDeal([m("a", { goal: "plant" }), m("b")], [{ key: "l1", tpl: "want-different", between: ["a", "b"] }]).ok).toBe(false);
    expect(checkCampaignDeal([m("a", { tension: TENSION_CAP + 1 }), m("b")], [{ key: "l1", tpl: "want-different", between: ["a", "b"] }]).ok).toBe(false);
    expect(checkCampaignDeal([m("a", { secret: "nope" }), m("b")], [{ key: "l1", tpl: "want-different", between: ["a", "b"] }]).ok).toBe(false);
    expect(checkCampaignDeal([m("a", { texts: ["Sabotage the drive."] }), m("b")], [{ key: "l1", tpl: "want-different", between: ["a", "b"] }]).ok).toBe(false);
    // a beat that names a crewmate without a friendly stance
    expect(checkCampaignDeal([m("a", { beatNamesPc: true }), m("b")], [{ key: "l1", tpl: "want-different", between: ["a", "b"] }]).ok).toBe(false);
    // nobody left out
    expect(checkCampaignDeal([m("a"), m("b"), m("c")], [{ key: "l1", tpl: "want-different", between: ["a", "b"] }]).problems.map((p) => p.text)).toEqual(["c has no friction line with another PC"]);
    // nobody in everything
    const pile = checkCampaignDeal(
      [m("a"), m("b"), m("c"), m("d")],
      [
        { key: "1", tpl: "want-different", between: ["a", "b"] },
        { key: "2", tpl: "who-first", between: ["a", "c"] },
        { key: "3", tpl: "tally", between: ["a", "d"] },
      ],
    );
    expect(pile.problems.map((p) => p.text)).toContain("a is in every friction line");
  });
});

// ---------------------------------------------------------------------------
// after a job: next beats, stalls, follow-ups
// ---------------------------------------------------------------------------

describe("campaign agendas: after a job", () => {
  const base = inputsFor(4);
  const first = setOf(run("job-1", base));
  const ids = first.characters.map((c) => c.id);

  it("advanced: same goal, a fresh beat, the old one in the history", () => {
    const set = next("job-2", first, { [ids[0]!]: "advanced" }, base);
    expect(set.stage).toBe("next");
    const before = first.characters[0]!.record as unknown as CampaignAgendaRecord;
    const after = set.characters[0]!.record as unknown as CampaignAgendaRecord;
    expect(after.goal).toEqual(before.goal);
    expect(after.beat.n).not.toBe(before.beat.n);
    expect(after.beat.job).toBe("Job 2");
    expect(after.history).toEqual([{ goal: before.goal.id, n: before.beat.n, job: before.beat.job, text: before.beat.text, outcome: "advanced" }]);
    expect(after.status).toBe("advanced");
    expect(after.tension).toBe(0);
    expect(set.characters[0]!.change).toMatch(/^Advanced/);
    expect(set.characters[0]!.reminders).toEqual([0, 1]);
  });

  it("no outcome marked: the PC is left as they are", () => {
    const set = next("job-2", first, { [ids[0]!]: "advanced" }, base);
    expect(set.characters[1]!.record).toEqual(first.characters[1]!.record);
    expect(set.characters[1]!.change).toMatch(/unchanged/);
  });

  it("stalled: tension rises one step per stall and stops at hard words", () => {
    let set = first;
    const seen: number[] = [];
    for (let job = 2; job <= 7; job++) {
      set = next(`stall-${job}`, set, { [ids[2]!]: "stalled" }, base, `Job ${job}`);
      const r = set.characters[2]!.record as unknown as CampaignAgendaRecord;
      seen.push(r.tension);
      expect(r.goal.id).toBe((first.characters[2]!.record as unknown as CampaignAgendaRecord).goal.id);
      expect(set.report?.ok).toBe(true);
    }
    expect(seen).toEqual([1, 2, 3, 3, 3, 3]);
    expect(set.characters[2]!.change).toMatch(/the cap/);
    expect(set.characters[2]!.status).toMatch(/Hard words/);
  });

  it("resolved: a follow-up keyed to the old goal and its allegiance, tension reset, the old goal kept in the past", () => {
    for (let i = 0; i < 60; i++) {
      const start = setOf(run(`chain-${i}`, base));
      let set = start;
      for (let job = 2; job <= 5; job++) {
        const before = set.characters.map((c) => c.record as unknown as CampaignAgendaRecord);
        set = next(`chain-${i}-${job}`, set, Object.fromEntries(ids.map((id) => [id, "resolved" as const])), base, `Job ${job}`);
        set.characters.forEach((c, k) => {
          const old = before[k]!;
          const r = c.record as unknown as CampaignAgendaRecord;
          expect(followUpsOf(old.goal.id, old.goal.allegiance), `${old.goal.id} -> ${r.goal.id}`).toContain(r.goal.id);
          expect(goalById(r.goal.id)!.allegiances).toContain(r.goal.allegiance);
          expect(r.tension).toBe(0);
          expect(r.status).toBe("new");
          expect(r.past.at(-1)).toMatchObject({ id: old.goal.id, title: old.goal.title });
          expect(r.secret).toEqual(old.secret);
          expect(c.summary).toBe(r.goal.text);
          // a follow-up that can keep the allegiance keeps it
          if (goalById(r.goal.id)!.allegiances.includes(old.goal.allegiance)) expect(r.goal.allegiance).toBe(old.goal.allegiance);
        });
        expect(set.report?.ok).toBe(true);
      }
    }
  });

  it("friction lines carry over from job to job", () => {
    const set = next("carry", first, Object.fromEntries(ids.map((id) => [id, "advanced" as const])), base);
    const keys = (s: LongAgendaDraftSet) => s.friction.map((l) => JSON.stringify([l.kind, [...l.between].sort(), Object.entries(l.text).sort()])).sort();
    expect(keys(set)).toEqual(keys(first));
  });

  it("is deterministic after a job too", () => {
    const o = { [ids[0]!]: "resolved" as const, [ids[1]!]: "stalled" as const, [ids[2]!]: "advanced" as const };
    expect(next("same", first, o, base)).toEqual(next("same", first, o, base));
  });
});

describe("campaign agendas: the module still passes its conformance check", () => {
  it("module check has no errors for the new procedure", () => {
    const res = checkModule(alienModule, { seeds: 20 });
    expect(res.issues.filter((i) => i.severity === "error" && i.where.includes("campaign-agendas"))).toEqual([]);
  });
});
