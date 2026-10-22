/**
 * Declarative d20 combat on the campaign store, against the example data
 * pack's fixture (read as JSON: the core never imports a real game module).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadPack, type GameModule } from "@campaign-forge/module-sdk";
import { addD20Condition, applyD20Damage, d20Combatant, d20ConditionsOf, d20Records, healD20, presetToEntity, removeD20Condition, setD20ConditionValue, setD20TempHp, tickD20Turn } from "../src";
import { newStore } from "./fixtures";

const dir = new URL("../../module-example/packs/example-pack/", import.meta.url);
const read = (name: string) => JSON.parse(readFileSync(new URL(name, dir), "utf8")) as unknown;
const module: GameModule = loadPack(read("pack.json"), { parts: [{ name: "rules.part.json", data: read("rules.part.json") }], skipProcedureRuns: true }).module!;
const preset = (id: string) => module.presets.find((p) => p.id === `example-pack.preset.${id}`)!;

function setup() {
  const store = newStore();
  const keeper = presetToEntity(store, preset("keeper"), { name: "Keeper" });
  const gloom = presetToEntity(store, preset("gloomling"), { name: "Gloomling" });
  return { store, keeper, gloom };
}

describe("d20 combatants", () => {
  it("reads hit points, AC, saves and attacks", () => {
    const { keeper, gloom } = setup();
    const k = d20Combatant(module, keeper)!;
    // max HP 3 × 6 + might modifier 1 = 19
    expect(k.hp).toEqual({ current: 19, max: 19, temp: 0 });
    expect(k.ac).toBe(13);
    expect(k.saves).toEqual({ "might-save": 1, "grace-save": 0 });
    expect(k.attacks.map((a) => a.name)).toEqual(["Pick", "Torch"]);
    const g = d20Combatant(module, gloom)!;
    expect(g.conditionImmunities).toEqual(["sick"]);
    expect(g.damageModifiers.map((d) => `${d.kind} ${d.type}`)).toEqual(["resistance cold", "vulnerability fire", "resistance physical"]);
  });
});

describe("conditions on an entity", () => {
  it("keeps a bound condition's value in its sheet field and the rest on the entity", () => {
    const { store, keeper } = setup();
    addD20Condition(store, module, keeper.id, { id: "dazed", value: 2, source: "Gloom breath" });
    addD20Condition(store, module, keeper.id, { id: "sick", duration: { turns: 2, turnOf: keeper.id, at: "end" } });
    const e = store.get("entities", keeper.id)!;
    expect(e.fields.dazed).toBe(2);
    expect(e.conditions?.map((c) => c.id)).toEqual(["dazed", "sick"]);
    expect(d20Records(module, e).map((r) => [r.id, r.value])).toEqual([
      ["dazed", 2],
      ["sick", undefined],
    ]);
    // the sheet's own edit of the bound field wins
    store.update("entities", keeper.id, { fields: { ...e.fields, dazed: 0 } });
    expect(d20Records(module, store.get("entities", keeper.id)!).map((r) => r.id)).toEqual(["sick"]);
  });

  it("a valued condition keeps the higher value unless set exactly; values stay within max", () => {
    const { store, keeper } = setup();
    addD20Condition(store, module, keeper.id, { id: "dazed", value: 2 });
    addD20Condition(store, module, keeper.id, { id: "dazed", value: 1 });
    expect(store.get("entities", keeper.id)!.fields.dazed).toBe(2);
    addD20Condition(store, module, keeper.id, { id: "dazed", value: 9 });
    expect(store.get("entities", keeper.id)!.fields.dazed).toBe(3);
    setD20ConditionValue(store, module, keeper.id, "dazed", 1);
    expect(store.get("entities", keeper.id)!.fields.dazed).toBe(1);
    setD20ConditionValue(store, module, keeper.id, "dazed", 0);
    expect(store.get("entities", keeper.id)!.fields.dazed).toBe(0);
  });

  it("an immune creature is left alone; implied conditions show with what implies them", () => {
    const { store, gloom } = setup();
    expect(addD20Condition(store, module, gloom.id, { id: "sick" })).toEqual({ applied: false, immune: true });
    addD20Condition(store, module, gloom.id, { id: "stunned" });
    expect(d20ConditionsOf(module, store.get("entities", gloom.id)!).map((c) => c.id)).toEqual(["stunned", "helpless"]);
    expect(removeD20Condition(store, module, gloom.id, "stunned")).toBe(true);
    expect(d20ConditionsOf(module, store.get("entities", gloom.id)!)).toEqual([]);
  });
});

describe("damage and healing", () => {
  it("temporary hit points first; 0 hit points applies the module's rule; healing recovers", () => {
    const { store, keeper } = setup();
    setD20TempHp(store, module, keeper.id, 4);
    const hit = applyD20Damage(store, module, keeper.id, 10);
    expect(hit).toMatchObject({ fromTemp: 4, dropped: false, before: { current: 19, temp: 4 }, after: { current: 13, temp: 0 } });
    expect(store.get("entities", keeper.id)!.fields.damage).toBe(6);
    const down = applyD20Damage(store, module, keeper.id, 50);
    expect(down).toMatchObject({ dropped: true, defeated: false, conditionsAdded: ["Knocked out"], after: { current: 0 } });
    expect(d20ConditionsOf(module, store.get("entities", keeper.id)!).map((c) => c.id)).toEqual(["knocked-out", "helpless", "down"]);
    const heal = healD20(store, module, keeper.id, 5);
    expect(heal).toMatchObject({ recovered: true, removed: ["Knocked out"], after: { current: 5 } });
    expect(d20ConditionsOf(module, store.get("entities", keeper.id)!)).toEqual([]);
  });

  it("a monster at 0 hit points is defeated", () => {
    const { store, gloom } = setup();
    const out = applyD20Damage(store, module, gloom.id, 9);
    expect(out).toMatchObject({ dropped: true, defeated: true, after: { current: 0 } });
    expect(store.get("entities", gloom.id)!.fields.hpNow).toBe(0);
    expect(d20Combatant(module, store.get("entities", gloom.id)!)!.defeated).toBe(true);
  });
});

describe("turns", () => {
  it("rounds tick on the holder's turn end, decrements and save prompts at its own end of turn", () => {
    const { store, keeper, gloom } = setup();
    addD20Condition(store, module, keeper.id, { id: "dazed", value: 2 });
    addD20Condition(store, module, keeper.id, { id: "sick", duration: { turns: 1, turnOf: gloom.id, at: "end" } });
    addD20Condition(store, module, keeper.id, { id: "shaken", duration: { save: { save: "might-save", dc: 11 } } });
    const ids = [keeper.id, gloom.id];
    // the gloomling's turn ends: "sick until the end of its turn" ends
    const a = tickD20Turn(store, module, ids, { entity: gloom.id, at: "end" });
    expect(a.expired.map((x) => x.id)).toEqual(["sick"]);
    expect(a.savesDue).toEqual([]);
    // the keeper's turn ends: dazed drops to 1, a save against shaken is due
    const b = tickD20Turn(store, module, ids, { entity: keeper.id, at: "end" });
    expect(b.decremented).toEqual([{ entity: keeper.id, id: "dazed", label: "Dazed", from: 2, to: 1 }]);
    expect(b.savesDue).toEqual([{ entity: keeper.id, id: "shaken", label: "Shaken", save: "might-save", dc: 11 }]);
    expect(store.get("entities", keeper.id)!.fields.dazed).toBe(1);
    tickD20Turn(store, module, ids, { entity: keeper.id, at: "end" });
    expect(store.get("entities", keeper.id)!.fields.dazed).toBe(0);
    expect(d20Records(module, store.get("entities", keeper.id)!).map((r) => r.id)).toEqual(["shaken"]);
  });
});
