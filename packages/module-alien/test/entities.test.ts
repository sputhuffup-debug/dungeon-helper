import { describe, expect, it } from "vitest";
import { computeFields, defaultFieldsFor, validateEntityFields } from "@campaign-forge/module-sdk";
import { characterType, entityTypes } from "../src/entities";
import { rules } from "../src/rules";
import { referenceLists } from "../src/reference";

const samplePC = {
  isPC: true,
  android: false,
  career: "roughneck",
  attributes: { strength: 4, agility: 3, wits: 2, empathy: 3 },
  skills: { heavyMachinery: 3, closeCombat: 2, stamina: 2, rangedCombat: 1, mobility: 0, piloting: 0, observation: 1, survival: 0, comtech: 0, manipulation: 0, command: 0, medicalAid: 0 },
  talents: [{ id: "true-grit", count: 1 }],
  stress: 2,
  personalAgenda: "Get paid.",
  agendas: [],
  gear: [
    { name: "Cutting torch", weight: 1, qty: 1 },
    { name: "Tool kit", weight: 1, qty: 2 },
    { name: "Air tank", weight: 0.5, qty: 1, supply: 5 },
  ],
  signatureItem: "Battered cap",
  cash: 300,
  storyPoints: 0,
  xp: 0,
  trait: "Grumbles",
  goal: "Keep the ship flying",
  appearance: "Oil-stained coveralls",
  buddy: "Parker",
  rival: "Ash",
  criticalInjuries: [],
  mentalTraumas: [],
};

describe("alien.character schema", () => {
  it("validates a sample PC", () => {
    const res = validateEntityFields(characterType, samplePC);
    expect(res.errors).toEqual([]);
    expect(res.valid).toBe(true);
  });
  it("rejects an attribute of 6 on a human", () => {
    const res = validateEntityFields(characterType, { ...samplePC, attributes: { ...samplePC.attributes, strength: 6 } });
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.path === "attributes.strength")).toBe(true);
  });
  it("allows an android up to 8", () => {
    const res = validateEntityFields(characterType, { ...samplePC, android: true, attributes: { ...samplePC.attributes, strength: 8 } });
    expect(res.valid).toBe(true);
    const tooHigh = validateEntityFields(characterType, { ...samplePC, android: true, attributes: { ...samplePC.attributes, strength: 9 } });
    expect(tooHigh.valid).toBe(false);
  });
  it("rejects an unknown career id and a skill above 5", () => {
    expect(validateEntityFields(characterType, { ...samplePC, career: "janitor" }).valid).toBe(false);
    expect(validateEntityFields(characterType, { ...samplePC, skills: { ...samplePC.skills, stamina: 6 } }).valid).toBe(false);
  });
  it("lets the GM add extra fields at the root", () => {
    expect(validateEntityFields(characterType, { ...samplePC, favouriteSong: "Jingle Bells" }).valid).toBe(true);
  });
  it("validates its own defaults", () => {
    expect(validateEntityFields(characterType, defaultFieldsFor(characterType)).valid).toBe(true);
  });
});

describe("alien.character computed", () => {
  it("derives health, resolve, encumbrance and the limit", () => {
    const c = computeFields(characterType, samplePC);
    expect(c.health).toBe(Math.ceil((4 + 3) / 2)); // 4
    expect(c.resolve).toBe(Math.ceil((2 + 3) / 2)); // 3
    expect(c.encumbranceLimit).toBe(8);
    expect(c.encumbrance).toBe(1 + 2 + 0.5);
    expect(c.hardened).toBe(0);
    expect(c.seenItAll).toBe(0);
  });
  it("adds Hardened and Seen It All stacks", () => {
    const c = computeFields(characterType, {
      ...samplePC,
      talents: [{ id: "hardened", count: 1 }, { id: "seen-it-all", count: 1 }, { id: "true-grit", count: 1 }],
    });
    expect(c.hardened).toBe(1);
    expect(c.seenItAll).toBe(1);
    expect(c.health).toBe(5);
    expect(c.resolve).toBe(4);
  });
  it("does not throw on default fields", () => {
    const c = computeFields(characterType, defaultFieldsFor(characterType));
    expect(c.health).toBe(3);
    expect(c.encumbrance).toBe(0);
  });
});

describe("entity types", () => {
  const ruleIds = new Set(rules.map((r) => r.id));
  const listIds = new Set(referenceLists.map((l) => l.id));
  const ownedLists = ["alien.skills", "alien.careers", "alien.talents"];

  it("declares the ten types from the field-name doc with unique ids", () => {
    const ids = entityTypes.map((t) => t.id);
    expect(new Set(ids).size).toBe(10);
    for (const id of ["alien.character", "alien.creature", "alien.location", "alien.faction", "alien.item", "alien.vehicle", "alien.spaceship", "alien.clue", "alien.job", "alien.encounter"]) {
      expect(ids).toContain(id);
    }
  });
  it("uses draft-07 schemas that allow extra root properties", () => {
    for (const t of entityTypes) {
      expect(t.schema.$schema).toBe("http://json-schema.org/draft-07/schema#");
      expect(t.schema.additionalProperties).toBe(true);
      expect(validateEntityFields(t, {}).valid).toBe(true);
    }
  });
  it("links sheet fields only to rule cards that exist and to reference lists this package owns", () => {
    for (const t of entityTypes) {
      const sheets = [t.sheet, ...(t.subtypes ?? []).map((s) => s.sheet).filter((s): s is NonNullable<typeof s> => Boolean(s))];
      for (const sheet of sheets) {
        for (const section of sheet.sections) {
          for (const f of section.fields) {
            if (f.rule) expect(ruleIds.has(f.rule), `${t.id}.${f.path} -> ${f.rule}`).toBe(true);
            if (f.options && !Array.isArray(f.options) && ownedLists.includes(f.options.ref)) expect(listIds.has(f.options.ref)).toBe(true);
          }
        }
      }
    }
  });
  it("has subtypes for location and item", () => {
    const loc = entityTypes.find((t) => t.id === "alien.location")!;
    expect(loc.subtypes?.map((s) => s.id)).toEqual(["region", "sector", "star-system", "planet", "colony", "site"]);
    const item = entityTypes.find((t) => t.id === "alien.item")!;
    expect(item.subtypes?.map((s) => s.id)).toEqual(["weapon", "armor", "tool", "medical", "pharmaceutical", "food", "other"]);
  });
});
