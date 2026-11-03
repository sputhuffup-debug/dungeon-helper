/** Skill rolls at the table: a modifier in base dice, the gear tables' skill modifiers as a pick, and a PC's cash as their ledger account. */
import { describe, expect, it } from "vitest";
import { addCatalogItem, gearCatalogFieldOf, gearSkillBonuses } from "@campaign-forge/module-sdk";
import { alienModule, diceSystem, ledger } from "../src";
import { characterType } from "../src/entities/character";
import { presets } from "../src/data";

const preset = (id: string) => presets.find((p) => p.id === id);

describe("the skill roll's modifier and gear", () => {
  it("offers a modifier in base dice as a stepper option (p. 43)", () => {
    const modifier = (diceSystem.rollOptions?.properties as Record<string, Record<string, unknown>>).modifier!;
    expect(modifier).toMatchObject({ type: "integer", minimum: -10, maximum: 10, default: 0 });
    expect(diceSystem.buildPool({ attribute: 3, skill: 1, modifier: 1, gear: 2 }).dice.base).toBe(7);
  });

  it("finds the carried gear whose modifier names the skill: binoculars for OBSERVATION, the suit's MOBILITY penalty", () => {
    const gearField = gearCatalogFieldOf(characterType)!;
    let fields: Record<string, unknown> = { gear: [], weapons: [] };
    for (const id of ["alien.item.binoculars", "alien.item.irc-mk50-compression-suit", "alien.item.personal-medkit"]) fields = addCatalogItem(characterType, gearField, fields, preset(id)!).fields;
    const read = (skill: string) => gearSkillBonuses(characterType, fields, skill, { preset }).bonuses.map((b) => [b.name, b.dice]);
    expect(read("observation")).toEqual([["Binoculars", 2]]);
    expect(read("mobility")).toEqual([["IRC Mk.50 Compression Suit", -1]]);
    expect(read("medicalAid")).toEqual([["Personal Medkit", 2]]);
    expect(read("comtech")).toEqual([]);
    expect(gearSkillBonuses(characterType, fields, "observation", { preset }).input).toBe("gear");
  });

  it("keeps a PC's money on the sheet: the personal account reads cash", () => {
    expect(ledger.accountField).toBe("cash");
    expect(alienModule.ledger?.accountEntityTypes).toContain(characterType.id);
  });
});
