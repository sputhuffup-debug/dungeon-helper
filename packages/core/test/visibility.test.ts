import { describe, expect, it } from "vitest";
import type { VisibilityLevel } from "@campaign-forge/module-sdk";
import { GM_VIEWER, canSee, fieldVisibilityOf, projectCampaignForViewer, projectEntityForViewer, reveal, visibilityRuleFor, type Entity, type Visibility, type Viewer } from "../src";
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

describe("conditional field visibility (a type's conditionalVisibility)", () => {
  // a person whose stats and role are a secret while `disguised` is set: players read the cover stats in their place
  const DISGUISED: typeof PERSON = {
    ...PERSON,
    schema: {
      type: "object",
      properties: { ...(PERSON.schema.properties as object), disguised: { type: "boolean" }, cover: { type: "object", properties: { grit: { type: "number" }, wit: { type: "number" } } } },
    },
    conditionalVisibility: [{ when: { "==": [{ var: "fields.disguised" }, true] }, fields: { role: "gm", stats: "gm", cover: "gm" }, standIns: { stats: "cover" }, reason: "Disguised." }],
  };
  const person = (fields: Record<string, unknown>, fieldVisibility?: Record<string, Visibility>): Entity => ({ ...entity({ level: "players" }, fieldVisibility), fields: { role: "marshal", stats: { grit: 4, wit: 2 }, ...fields } });
  const player: Viewer = { role: "player", memberId: "p1" };

  it("shows the fields while the condition is false", () => {
    const p = projectEntityForViewer(person({ disguised: false, cover: { grit: 2, wit: 2 } }), DISGUISED, player)!;
    expect(p.fields.role).toBe("marshal");
    expect(p.fields.stats).toEqual({ grit: 4, wit: 2 });
    // the cover is just another players field here
    expect(p.fields.cover).toEqual({ grit: 2, wit: 2 });
  });

  it("hides them while it holds, with the stand-in's value in place of the hidden field", () => {
    const e = person({ disguised: true, cover: { grit: 2, wit: 3 } });
    expect(fieldVisibilityOf(e, DISGUISED, "role")).toEqual({ level: "gm" });
    expect(fieldVisibilityOf(e, DISGUISED, "stats.grit")).toEqual({ level: "gm" });
    expect(visibilityRuleFor(e, DISGUISED, "stats.grit")?.rule.reason).toBe("Disguised.");
    const p = projectEntityForViewer(e, DISGUISED, player)!;
    expect(p.fields.role).toBeUndefined();
    expect(p.fields.cover).toBeUndefined();
    expect(p.fields.stats).toEqual({ grit: 2, wit: 3 });
    expect(JSON.stringify(p)).not.toContain('"grit":4');
    // the GM sees everything as it is
    expect(projectEntityForViewer(e, DISGUISED, GM_VIEWER)!.fields.stats).toEqual({ grit: 4, wit: 2 });
  });

  it("hides a field with no stand-in value outright", () => {
    expect(projectEntityForViewer(person({ disguised: true }), DISGUISED, player)!.fields.stats).toBeUndefined();
  });

  it("lets the GM's own setting on the entity win", () => {
    const e = person({ disguised: true, cover: { grit: 1, wit: 1 } }, { stats: { level: "players" } });
    expect(projectEntityForViewer(e, DISGUISED, player)!.fields.stats).toEqual({ grit: 4, wit: 2 });
  });

  it("counts a rule that cannot be evaluated as holding", () => {
    const broken: typeof PERSON = { ...DISGUISED, conditionalVisibility: [{ when: { nosuchop: [1] }, fields: { role: "gm" } }] };
    expect(projectEntityForViewer(person({}), broken, player)!.fields.role).toBeUndefined();
  });

  it("projects a whole campaign the same way", () => {
    const store = newStore();
    const e = store.createEntity({ type: PERSON.id, name: "Vesna", visibility: { level: "players" }, fields: { role: "marshal", stats: { grit: 5, wit: 1 }, disguised: true, cover: { grit: 2, wit: 2 } } });
    const types = [DISGUISED, ...fixtureModule.entityTypes.filter((t) => t.id !== PERSON.id)];
    const view = projectCampaignForViewer(store.toJSON(), { ...fixtureModule, entityTypes: types }, player);
    expect(view.entities[e.id]!.fields).toEqual({ stats: { grit: 2, wit: 2 }, disguised: true });
  });
});
