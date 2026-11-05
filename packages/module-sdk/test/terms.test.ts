import { describe, expect, it } from "vitest";
import { createDiceEngine } from "../src/engines";
import { packToModule } from "../src/pack";
import { DEFAULT_TERMS, nounOf, resolveTerms, rollModeNames, upperFirst } from "../src/terms";
import type { EntityTypeDef } from "../src/types";

const quest: EntityTypeDef = { id: "x.quest", kind: "job", name: "Quest", plural: "Quests", schema: { type: "object", properties: {} }, sheet: { sections: [] } };

describe("module terms", () => {
  it("fall back to neutral words, and name jobs after the module's job type", () => {
    const t = resolveTerms({ entityTypes: [] });
    expect(t).toMatchObject({ party: "group", mapLevel: "level", mapLevels: "levels", agenda: "personal handout", agendas: "personal handouts", job: "job", jobs: "jobs" });
    expect(t.rewardExamples).toBe(DEFAULT_TERMS.rewardExamples);
    expect(resolveTerms({ entityTypes: [quest] })).toMatchObject({ job: "quest", jobs: "quests" });
    expect(resolveTerms(undefined).party).toBe("group");
  });

  it("use the module's own words, deriving plurals it leaves out", () => {
    const t = resolveTerms({ entityTypes: [], terms: { party: "crew", mapLevel: "deck", agenda: "agenda", epiloguePrompt: "What happens to the survivors…" } });
    expect(t).toMatchObject({ party: "crew", mapLevel: "deck", mapLevels: "decks", agenda: "agenda", agendas: "agendas", epiloguePrompt: "What happens to the survivors…" });
    expect(resolveTerms({ entityTypes: [], terms: { mapLevel: "storey", mapLevels: "storeys", party: "  " } })).toMatchObject({ mapLevels: "storeys", party: "group" });
  });

  it("reach a pack's module", () => {
    const m = packToModule({ format: "campaign-forge-pack", formatVersion: 1, manifest: { id: "tp", name: "T", version: "0.1.0", requiredCore: "^0.1.0", modes: [{ id: "m", name: "M" }], license: { name: "x", attribution: "x" } }, dice: { engine: "d20" }, terms: { party: "party" } } as never);
    expect(resolveTerms(m).party).toBe("party");
  });

  it("write names as running text", () => {
    expect(nounOf("Player character")).toBe("player character");
    expect(nounOf("NPC")).toBe("NPC");
    expect(upperFirst("party")).toBe("Party");
  });
});

describe("roll mode names", () => {
  it("come from the roll panel's option, so a system's own names reach every screen", () => {
    expect(rollModeNames(createDiceEngine({ engine: "d20" }))).toEqual({ normal: "normal", advantage: "advantage", disadvantage: "disadvantage" });
    expect(rollModeNames(createDiceEngine({ engine: "d20", advantageNames: { advantage: "fortune", disadvantage: "misfortune" } }))).toEqual({ normal: "normal", advantage: "fortune", disadvantage: "misfortune" });
    expect(rollModeNames(undefined)).toEqual({ normal: "normal", advantage: "advantage", disadvantage: "disadvantage" });
  });
});
