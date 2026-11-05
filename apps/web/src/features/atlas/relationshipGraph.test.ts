/**
 * The relationship graph's column headings: a column of one type reads as
 * the module's word for that kind (its first type's plural, as before); a
 * column that mixes types, such as a module's player characters beside its
 * NPCs, reads as the kind ("Characters"), not as the first type's plural.
 */
import type { Entity } from "@campaign-forge/core";
import type { EntityTypeDef, GameModule } from "@campaign-forge/module-sdk";
import { describe, expect, it } from "vitest";
import { columnLabel } from "./RelationshipGraph";

const type = (id: string, kind: EntityTypeDef["kind"], plural: string) => ({ id, kind, name: plural, plural }) as unknown as EntityTypeDef;
const types = [type("pc", "character", "Player characters"), type("npc", "character", "NPCs"), type("loc", "location", "Locations")];
const module = { entityTypes: types } as unknown as GameModule;
const typeById = new Map(types.map((t) => [t.id, t]));
const entity = (t: string) => ({ id: t, type: t, name: t }) as unknown as Entity;

describe("columnLabel", () => {
  it("names a one-type column after the module's first type of that kind", () => {
    expect(columnLabel("location", [entity("loc")], typeById, module)).toBe("Locations");
    expect(columnLabel("character", [entity("pc"), entity("pc")], typeById, module)).toBe("Player characters");
  });

  it("names a column that mixes types after the kind", () => {
    expect(columnLabel("character", [entity("pc"), entity("npc")], typeById, module)).toBe("Characters");
  });
});
