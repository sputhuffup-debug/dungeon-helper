import { describe, expect, it } from "vitest";
import { LONG_AGENDA_FRICTION_PURPOSE, LONG_AGENDA_PURPOSE, playerShareSnapshot, plainText, projectCampaignForViewer, type Entity } from "@campaign-forge/core";
import { CAMPAIGN_AGENDA_FIELD, CAMPAIGN_GOALS, alienModule, campaignAgendaRecord, followUpsOf, scanText, TENSION_LADDER, type CampaignAgendaRecord } from "@campaign-forge/module-alien";
import { buildDemoCampaign, DEMO_AGENDA_OUTCOMES } from "../src/build";

describe("Skyfire Down: campaign agendas", () => {
  const demo = buildDemoCampaign();
  const { registry, maps } = demo;
  // the crew in build order (the order the agendas were dealt in)
  const pcs = Object.values(maps.entities)
    .filter((e) => e.type === "alien.character" && e.fields["isPC"] === true)
    .sort((a, b) => a.id.localeCompare(b.id));
  const recordOf = (e: Entity) => campaignAgendaRecord(e.fields[CAMPAIGN_AGENDA_FIELD])!;

  it("gives each of the four PCs a long-term goal kept equal to the sheet's personal agenda", () => {
    expect(pcs).toHaveLength(4);
    for (const pc of pcs) {
      const r = recordOf(pc);
      expect(r, pc.name).toBeDefined();
      expect(pc.fields["personalAgenda"]).toBe(r.goal.text);
      expect(r.beat.job).toBe("Job 2");
      for (const t of [r.goal.text, r.beat.text, ...r.friction.map((f) => f.text)]) expect(scanText(t), t).toEqual([]);
    }
  });

  it("carries one job's worth of beats: advanced, a stall with its tension step, and a resolved goal's follow-up", () => {
    pcs.forEach((pc, i) => {
      const r = recordOf(pc);
      expect(r.history).toHaveLength(1);
      expect(r.history[0]!.job).toBe("Job 1");
      expect(r.history[0]!.outcome).toBe(DEMO_AGENDA_OUTCOMES[i]);
    });
    const stalled = recordOf(pcs[1]!);
    expect(stalled.status).toBe("stalled");
    expect(stalled.tension).toBe(1);
    expect(TENSION_LADDER[stalled.tension]!.label).toBe("Quiet disagreement");
    expect(recordOf(pcs[0]!).tension).toBe(0);
    const resolved = recordOf(pcs[3]!);
    expect(resolved.past).toHaveLength(1);
    expect(resolved.status).toBe("new");
    // the new goal follows from the old one
    const old = CAMPAIGN_GOALS.find((g) => g.id === resolved.past[0]!.id)!;
    expect(old.allegiances.some((a) => followUpsOf(old.id, a).includes(resolved.goal.id))).toBe(true);
  });

  it("every PC has open friction with another PC, from both sides", () => {
    for (const pc of pcs) {
      const r: CampaignAgendaRecord = recordOf(pc);
      expect(r.friction.length).toBeGreaterThan(0);
      for (const f of r.friction) {
        expect(f.with.length).toBe(1);
        const other = maps.entities[f.with[0]!]!;
        expect(other.fields["isPC"]).toBe(true);
        expect(f.text).toContain(other.name);
        // the other side has the same line
        expect(recordOf(other).friction.some((g) => g.key === f.key)).toBe(true);
      }
    }
  });

  it("keeps a GM-only agenda handout and a players' friction handout per PC, linked to the PC", () => {
    for (const pc of pcs) {
      const mine = Object.values(maps.handouts).filter((h) => h.character === pc.id && h.purpose);
      const agenda = mine.find((h) => h.purpose === LONG_AGENDA_PURPOSE)!;
      const friction = mine.find((h) => h.purpose === LONG_AGENDA_FRICTION_PURPOSE)!;
      expect(agenda).toMatchObject({ kind: "agenda", visibility: { level: "gm" } });
      expect(friction).toMatchObject({ kind: "text", visibility: { level: "players" } });
      const r = recordOf(pc);
      const agendaText = plainText(registry.open(agenda.bodyDoc!));
      expect(agendaText).toContain(r.goal.text);
      expect(agendaText).toContain(r.beat.text);
      expect(agendaText).toContain(TENSION_LADDER[r.tension]!.label);
      const frictionText = plainText(registry.open(friction.bodyDoc!));
      for (const f of r.friction) expect(frictionText).toContain(f.text);
      expect(frictionText).not.toContain(r.goal.text);
      expect(frictionText).not.toContain(r.secret.text);
    }
  });

  it("records both runs of the generator", () => {
    const runs = Object.values(maps.generatorRuns).filter((r) => r.procedure === "alien.campaign-agendas");
    expect(runs).toHaveLength(2);
  });

  it("the player view and a player share hold the friction handouts and nothing of the goals, beats or secrets", () => {
    const view = projectCampaignForViewer(maps, alienModule, { role: "player" });
    const handouts = Object.values(view.handouts);
    expect(handouts.filter((h) => h.purpose === LONG_AGENDA_FRICTION_PURPOSE)).toHaveLength(4);
    expect(handouts.some((h) => h.purpose === LONG_AGENDA_PURPOSE)).toBe(false);
    for (const pc of pcs) {
      expect(view.entities[pc.id]).toBeDefined();
      expect(view.entities[pc.id]!.fields[CAMPAIGN_AGENDA_FIELD]).toBeUndefined();
      expect(view.entities[pc.id]!.fields["personalAgenda"]).toBeUndefined();
    }
    // no name the players cannot see, in a friction handout or anywhere in the share
    const hiddenNames = Object.values(maps.entities)
      .filter((e) => e.fields["isPC"] !== true && e.visibility.level === "gm")
      .flatMap((e) => [e.name, e.name.split(",")[0]!.trim()])
      .filter((n) => n.length >= 3);
    expect(hiddenNames.length).toBeGreaterThan(5);
    for (const h of handouts.filter((x) => x.purpose === LONG_AGENDA_FRICTION_PURPOSE)) {
      const t = plainText(registry.open(h.bodyDoc!));
      for (const n of hiddenNames) expect(t, n).not.toContain(n);
    }
    const session = Object.values(maps.sessions)[0]!;
    const share = playerShareSnapshot({ maps, module: alienModule, sessionId: session.id, at: "2026-11-07T20:00:00Z", doc: (id) => registry.open(id), referenceName: () => undefined });
    const text = JSON.stringify(share);
    expect(share.handouts.filter((h) => /friction/.test(h.title))).toHaveLength(4);
    for (const n of hiddenNames) expect(text, n).not.toContain(n);
    for (const pc of pcs) {
      const r = recordOf(pc);
      expect(text).not.toContain(r.goal.text);
      expect(text).not.toContain(r.beat.text);
      expect(text).not.toContain(r.secret.text);
    }
  });
});
