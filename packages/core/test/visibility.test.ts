import { describe, expect, it } from "vitest";
import type { VisibilityLevel } from "@campaign-forge/module-sdk";
import { canSee, projectCampaignForViewer, projectEntityForViewer, reveal, type Entity, type Visibility, type Viewer } from "../src";
import { PERSON, fixtureModule, newStore, seededRandom } from "./fixtures";

const LEVELS: VisibilityLevel[] = ["gm", "players", "some_players", "revealed"];

function entity(vis: Visibility, fieldVisibility?: Record<string, Visibility>): Entity {
  const e: Entity = {
    id: "01E",
    created: "t",
    updated: "t",
    type: PERSON.id,
    name: "Okafor",
    tags: [],
    visibility: vis,
    fields: { role: "marshal", secret: "bought", plan: "retire", stats: { grit: 4, wit: 2 } },
    provenance: { preset: "x" },
  };
  if (fieldVisibility) e.fieldVisibility = fieldVisibility;
  return e;
}

describe("canSee", () => {
  it("follows the four levels", () => {
    const gm: Viewer = { role: "gm" };
    const p1: Viewer = { role: "player", memberId: "p1" };
    const p2: Viewer = { role: "player", memberId: "p2" };
    expect(canSee({ level: "gm" }, gm)).toBe(true);
    expect(canSee({ level: "gm" }, p1)).toBe(false);
    expect(canSee({ level: "players" }, p1)).toBe(true);
    expect(canSee({ level: "revealed", revealedIn: "s" }, p1)).toBe(true);
    expect(canSee({ level: "some_players", players: ["p1"] }, p1)).toBe(true);
    expect(canSee({ level: "some_players", players: ["p1"] }, p2)).toBe(false);
    expect(canSee({ level: "some_players" }, p1)).toBe(false);
    expect(canSee(undefined, p1)).toBe(false);
  });
});

describe("projectEntityForViewer", () => {
  it("returns a full copy for the GM and strips GM-only fields for players", () => {
    const e = entity({ level: "players" });
    const gmView = projectEntityForViewer(e, PERSON, { role: "gm" });
    expect(gmView).toEqual(e);
    expect(gmView).not.toBe(e);
    const playerView = projectEntityForViewer(e, PERSON, { role: "player", memberId: "p1" });
    expect(playerView?.fields).toEqual({ role: "marshal", stats: { grit: 4, wit: 2 } });
    expect(playerView?.provenance).toBeUndefined();
    expect(playerView?.fieldVisibility).toBeUndefined();
    expect(e.fields["secret"]).toBe("bought");
  });

  it("applies overrides before type defaults, including nested paths", () => {
    const e = entity({ level: "players" }, { secret: { level: "players" }, "stats.grit": { level: "gm" } });
    const view = projectEntityForViewer(e, PERSON, { role: "player", memberId: "p1" });
    expect(view?.fields).toEqual({ role: "marshal", secret: "bought", stats: { wit: 2 } });
    expect(projectEntityForViewer(entity({ level: "gm" }), PERSON, { role: "player" })).toBeUndefined();
  });

  it("property: every field a player sees is one canSee allows, and vice versa", () => {
    const rnd = seededRandom(42);
    const pick = <T>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)] as T;
    const randomVis = (): Visibility => {
      const level = pick(LEVELS);
      const v: Visibility = { level };
      if (level === "some_players") v.players = [pick([["p1"], ["p2"], ["p1", "p2"], []])].flat();
      return v;
    };
    const paths = ["role", "secret", "plan", "stats.grit", "stats.wit"];
    for (let i = 0; i < 300; i++) {
      const fieldVisibility: Record<string, Visibility> = {};
      for (const p of paths) if (rnd() < 0.5) fieldVisibility[p] = randomVis();
      const e = entity(randomVis(), fieldVisibility);
      const viewer: Viewer = { role: "player", memberId: pick(["p1", "p2"]) };
      const view = projectEntityForViewer(e, PERSON, viewer);
      if (!canSee(e.visibility, viewer)) {
        expect(view).toBeUndefined();
        continue;
      }
      expect(view).toBeDefined();
      for (const p of paths) {
        const effective = fieldVisibility[p] ?? (PERSON.defaultVisibility?.[p] ? { level: PERSON.defaultVisibility[p] as VisibilityLevel } : e.visibility);
        const visible = canSee(effective, viewer);
        const value = p.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], view!.fields);
        expect(value !== undefined, `${p} ${JSON.stringify(effective)} for ${viewer.memberId}`).toBe(visible);
      }
    }
  });
});

describe("projectCampaignForViewer and reveal", () => {
  it("projects the campaign for a player and reveals records into a session", () => {
    const store = newStore();
    const gmId = store.meta().members[0]!.id;
    store.updateMeta({ members: [...store.meta().members, { id: "p1", name: "Ann", role: "player" }, { id: "p2", name: "Bo", role: "player" }] });
    const pub = store.createEntity({ type: PERSON.id, name: "Public", visibility: { level: "players" }, fields: { secret: "s" } });
    const hidden = store.createEntity({ type: PERSON.id, name: "Hidden" });
    const mine = store.createEntity({ type: PERSON.id, name: "Mine", visibility: { level: "some_players", players: ["p1"] } });
    store.createRelationship("knows", pub.id, hidden.id);
    const visibleRel = store.createRelationship("knows", pub.id, mine.id, undefined, { level: "players" });
    store.createRelationship("knows", pub.id, mine.id); // gm-only
    const ev = store.createTimelineEvent({ inWorldDate: "d", text: "t", entities: [pub.id, hidden.id], visibility: { level: "players" } });
    const handout = store.createHandout({ title: "Agenda", kind: "agenda", character: mine.id, visibility: { level: "some_players", players: ["p2"] } });
    store.createAdventure({ title: "secret plan" });
    const session = store.createSession();

    const view = projectCampaignForViewer(store.toJSON(), fixtureModule, { role: "player", memberId: "p1" });
    expect(Object.keys(view.entities).sort()).toEqual([pub.id, mine.id].sort());
    expect(view.entities[pub.id]?.fields).toEqual({});
    expect(Object.keys(view.relationships)).toEqual([visibleRel.id]);
    expect(view.timeline[ev.id]?.entities).toEqual([pub.id]);
    expect(view.handouts).toEqual({});
    expect(view.adventures).toEqual({});
    expect(view.meta.members.map((m) => m.id)).toEqual([gmId, "p1"]);
    expect(projectCampaignForViewer(store.toJSON(), fixtureModule, { role: "gm" })).toEqual(store.toJSON());

    reveal(store, { kind: "handout", id: handout.id }, session.id);
    reveal(store, { kind: "entity", id: hidden.id }, session.id);
    reveal(store, { kind: "entity", id: pub.id, field: "secret" }, session.id);
    const after = projectCampaignForViewer(store.toJSON(), fixtureModule, { role: "player", memberId: "p1" });
    expect(after.handouts[handout.id]?.revealedIn).toBe(session.id);
    expect(after.entities[hidden.id]?.visibility).toEqual({ level: "revealed", revealedIn: session.id });
    expect(after.entities[pub.id]?.fields).toEqual({ secret: "s" });
    expect(store.get("sessions", session.id)?.reveals.map((r) => r.handout ?? r.entity)).toEqual([handout.id, hidden.id, pub.id]);
    expect(store.get("sessions", session.id)?.reveals[2]?.field).toBe("secret");
  });
});
