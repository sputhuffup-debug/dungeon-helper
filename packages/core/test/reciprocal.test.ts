/**
 * Paired entity references (`SheetField.reciprocal`), on an inline fixture
 * type shaped like the example module's hero and its Companion field.
 */
import { describe, expect, it } from "vitest";
import type { EntityTypeDef } from "@campaign-forge/module-sdk";
import { reciprocalChanges, reciprocalFields, reciprocalReferences, type Entity } from "../src";

const HERO: EntityTypeDef = {
  id: "example.hero",
  kind: "character",
  name: "Hero",
  plural: "Heroes",
  schema: { type: "object", properties: { companion: { type: "string" }, foe: { type: "string" }, mentor: { type: "string" } } },
  sheet: {
    sections: [
      {
        id: "core",
        title: "Core",
        fields: [
          { path: "companion", label: "Companion", widget: "ref", entityTypes: ["example.hero"], reciprocal: true },
          { path: "foe", label: "Foe", widget: "ref", entityTypes: ["example.hero"], reciprocal: true },
          // one-way: not paired
          { path: "mentor", label: "Mentor", widget: "ref", entityTypes: ["example.hero"] },
        ],
      },
    ],
  },
};

const hero = (id: string, fields: Record<string, unknown> = {}): Entity => ({ id, type: "example.hero", fields }) as Entity;

function world(...heroes: Entity[]) {
  const byId = new Map(heroes.map((h) => [h.id, h]));
  return (id: string) => byId.get(id);
}

describe("reciprocal fields", () => {
  it("finds the paired fields of a type", () => {
    expect(reciprocalFields(HERO).map((f) => f.path)).toEqual(["companion", "foe"]);
    expect(reciprocalFields(undefined)).toEqual([]);
  });

  it("sets the other end when it is free, and clears it with the link", () => {
    const get = world(hero("A"), hero("B"));
    expect(reciprocalChanges(HERO, "A", {}, { companion: "B" }, get)).toEqual({ edits: [{ entityId: "B", path: "companion", value: "A" }], conflicts: [] });
    const paired = world(hero("A", { companion: "B" }), hero("B", { companion: "A" }));
    expect(reciprocalChanges(HERO, "A", { companion: "B" }, {}, paired)).toEqual({ edits: [{ entityId: "B", path: "companion", value: undefined }], conflicts: [] });
    // a one-way field is left alone
    expect(reciprocalChanges(HERO, "A", {}, { mentor: "B" }, get)).toEqual({ edits: [], conflicts: [] });
  });

  it("moving the link clears the old partner and sets the new one", () => {
    const get = world(hero("A", { companion: "B" }), hero("B", { companion: "A" }), hero("C"));
    expect(reciprocalChanges(HERO, "A", { companion: "B" }, { companion: "C" }, get).edits).toEqual([
      { entityId: "B", path: "companion", value: undefined },
      { entityId: "C", path: "companion", value: "A" },
    ]);
  });

  it("replaces text typed by hand, but reports a partner who names someone else", () => {
    expect(reciprocalChanges(HERO, "A", {}, { companion: "B" }, world(hero("A"), hero("B", { companion: "Old Tom" }))).edits).toEqual([{ entityId: "B", path: "companion", value: "A" }]);
    const taken = world(hero("A"), hero("B", { companion: "C" }), hero("C", { companion: "B" }));
    expect(reciprocalChanges(HERO, "A", {}, { companion: "B" }, taken)).toEqual({ edits: [], conflicts: [{ entityId: "B", path: "companion", current: "C", wanted: "A" }] });
    // an old partner who had moved on is not cleared
    expect(reciprocalChanges(HERO, "A", { companion: "B" }, {}, taken).edits).toEqual([]);
  });

  it("never makes the other end name this one in two paired fields", () => {
    const get = world(hero("A"), hero("B", { foe: "A" }));
    expect(reciprocalChanges(HERO, "A", {}, { companion: "B" }, get)).toEqual({ edits: [], conflicts: [] });
  });

  it("ignores self links, missing entities and entities of other types", () => {
    const other = { id: "X", type: "example.place", fields: {} } as unknown as Entity;
    const get = world(hero("A"), other);
    expect(reciprocalChanges(HERO, "A", {}, { companion: "A" }, get).edits).toEqual([]);
    expect(reciprocalChanges(HERO, "A", {}, { companion: "Z" }, get).edits).toEqual([]);
    expect(reciprocalChanges(HERO, "A", {}, { companion: "X" }, get).edits).toEqual([]);
  });

  it("counts who names a hero, for links set one way", () => {
    const heroes = [hero("A", { companion: "C" }), hero("B", { companion: "C", foe: "C" }), hero("C"), hero("D", { mentor: "C" })];
    expect(reciprocalReferences(HERO, "C", heroes)).toEqual({ companion: 2, foe: 1 });
    expect(reciprocalReferences(HERO, "A", heroes)).toEqual({});
  });
});
