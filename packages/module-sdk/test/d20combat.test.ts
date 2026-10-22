/**
 * Declarative d20 combat against the example pack's fixture (`d20Combat` in
 * packages/module-example/packs/example-pack/pack.json): attack and save
 * resolution (natural 1 and 20, four degrees), damage modifiers, condition
 * effects with stacking, implied conditions, durations, 0 hit points, and
 * determinism with seeds and entered dice.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyD20DamageModifiers,
  checkModule,
  createDiceEngine,
  createEnteredRng,
  createRng,
  d20ActiveConditions,
  d20AttackIssues,
  d20Attacks,
  d20CombatantFor,
  d20ConcreteDuration,
  d20ConditionAdjustment,
  d20ConditionAutomation,
  d20HitPoints,
  d20RollInput,
  d20RollMode,
  d20SaveDamageMultiplier,
  d20SaveConditions,
  d20Speed,
  d20TakeDamage,
  d20ZeroHpRule,
  doubleDiceExpression,
  formatPackIssue,
  loadPack,
  parseD20Bonus,
  parseD20Damage,
  recordDice,
  resolveD20Attack,
  resolveD20Save,
  rollD20Damage,
  rollEntered,
  tickD20Conditions,
  validatePack,
  type D20CombatDef,
  type DiceSystem,
  type GameModule,
  type Rng,
} from "../src";

const dir = new URL("../../module-example/packs/example-pack/", import.meta.url);
const read = (name: string) => JSON.parse(readFileSync(new URL(name, dir), "utf8")) as Record<string, unknown>;

function exampleModule(): GameModule {
  const res = loadPack(read("pack.json"), { parts: [{ name: "rules.part.json", data: read("rules.part.json") }], skipProcedureRuns: true });
  expect(res.issues.map(formatPackIssue)).toEqual([]);
  return res.module!;
}

const m = exampleModule();
const def = m.d20Combat!;
const gloomling = m.presets.find((p) => p.id === "example-pack.preset.gloomling")!;
const keeper = m.presets.find((p) => p.id === "example-pack.preset.keeper")!;

/** Roll a d20 pool with the faces given (as a GM typing physical dice). */
function rollWith(dice: DiceSystem, input: Record<string, unknown>, faces: number[]) {
  return rollEntered((rng) => dice.roll(dice.buildPool(input), rng), faces);
}

describe("reading combatants", () => {
  it("reads AC, hit points, saves, damage modifiers and attacks from the fields", () => {
    const monster = d20CombatantFor(def, "example-pack.monster")!;
    const data = { fields: gloomling.fields, computed: {} };
    expect(d20HitPoints(monster, data)).toEqual({ current: 5, max: 5, temp: 0 });
    const attacks = d20Attacks(def, monster, data);
    expect(attacks.map((a) => a.name)).toEqual(["Bite", "Gloom breath"]);
    expect(attacks[0]).toMatchObject({ kind: "melee", bonus: 3, damage: [{ dice: "1d4+1", type: "cut" }], reach: "close" });
    expect(attacks[1]!.bonus).toBeUndefined();
    expect(attacks[1]!.save).toMatchObject({ dc: 11, save: "grace-save", half: true, damage: [{ dice: "2d6", type: "cold" }] });
    for (const a of attacks) expect(d20AttackIssues(def, a)).toEqual([]);
  });

  it("reads sheet rows written as text: bonus \"+4\", damage \"1d6 + 1\" with the row's type", () => {
    const adv = d20CombatantFor(def, "example-pack.adventurer")!;
    const attacks = d20Attacks(def, adv, { fields: keeper.fields, computed: { maxHp: 19, mightMod: 1 } });
    expect(attacks.map((a) => [a.name, a.bonus, a.damage])).toEqual([
      ["Pick", 4, [{ dice: "1d6+1", type: "cut" }]],
      ["Torch", 2, [{ dice: "1d4", type: "fire" }]],
    ]);
    // hit points from damage taken: max − damage
    expect(d20HitPoints(adv, { fields: { damage: 4, tempHp: 2 }, computed: { maxHp: 19 } })).toEqual({ current: 15, max: 19, temp: 2 });
  });

  it("parses damage text with types, persistent parts and notes", () => {
    const types: D20CombatDef = { ...def, damageTypes: ["slashing", "piercing", "fire", "bleed", "cold"].map((id) => ({ id, name: id[0]!.toUpperCase() + id.slice(1) })) };
    expect(parseD20Damage(types, "1d8 + 3 slashing")).toEqual({ parts: [{ dice: "1d8+3", type: "slashing" }] });
    expect(parseD20Damage(types, "2d10+8 piercing plus 2d6 fire")).toEqual({ parts: [{ dice: "2d10+8", type: "piercing" }, { dice: "2d6", type: "fire" }] });
    expect(parseD20Damage(types, "1d10+7 piercing plus Grab")).toEqual({ parts: [{ dice: "1d10+7", type: "piercing" }], note: "Grab" });
    expect(parseD20Damage(types, "1d6 persistent bleed")).toEqual({ parts: [{ dice: "1d6", type: "bleed", persistent: true }] });
    expect(parseD20Damage(types, "1d4−1 cold")).toEqual({ parts: [{ dice: "1d4-1", type: "cold" }] });
    expect(parseD20Damage(types, "1d6", "fire")).toEqual({ parts: [{ dice: "1d6", type: "fire" }] });
    expect(parseD20Bonus("+7 [+3/−1]", {})).toBe(7);
    expect(parseD20Bonus("−2", {})).toBe(-2);
    expect(parseD20Bonus({ "+": [{ var: "computed.str" }, 2] }, { computed: { str: 3 } })).toBe(5);
  });
});

describe("attack rolls", () => {
  it("natural20Doubles: total at or above AC hits, a natural 20 always crits, a natural 1 always misses", () => {
    const input = d20RollInput({ base: [{ label: "Bite", value: 3 }] });
    const hit = resolveD20Attack(def, rollWith(m.dice, input, [9]), 12);
    expect(hit).toMatchObject({ hit: true, critical: false, total: 12, reason: "12 vs AC 12" });
    const miss = resolveD20Attack(def, rollWith(m.dice, input, [8]), 12);
    expect(miss).toMatchObject({ hit: false, critical: false });
    const nat20 = resolveD20Attack(def, rollWith(m.dice, input, [20]), 30);
    expect(nat20).toMatchObject({ hit: true, critical: true, degree: "critical-success" });
    expect(nat20.reason).toContain("natural 20");
    const nat1 = resolveD20Attack(def, rollWith(m.dice, d20RollInput({ base: [{ label: "Big", value: 20 }] }), [1]), 5);
    expect(nat1).toMatchObject({ hit: false, critical: false });
    expect(nat1.reason).toContain("natural 1");
  });

  it("degrees: four degrees from the dice engine; a natural 20 moves the result up a step", () => {
    const four: D20CombatDef = { ...def, rules: { ...def.rules, crit: "degrees", critDamage: "total", save: "degrees" } };
    const dice = createDiceEngine({ engine: "d20", abilityModifier: false, critMargin: 10, naturalShift: true });
    const roll = (bonus: number, face: number, ac: number) => resolveD20Attack(four, rollWith(dice, d20RollInput({ base: [{ label: "Strike", value: bonus }], dc: ac }), [face]), ac);
    expect(roll(10, 15, 15)).toMatchObject({ degree: "critical-success", hit: true, critical: true }); // 25 vs 15
    expect(roll(10, 6, 15)).toMatchObject({ degree: "success", hit: true, critical: false });
    expect(roll(10, 2, 15)).toMatchObject({ degree: "failure", hit: false });
    expect(roll(0, 4, 15)).toMatchObject({ degree: "critical-failure", hit: false });
    // natural 20 on a total that only meets the AC: success becomes critical success
    expect(roll(-5, 20, 15)).toMatchObject({ degree: "critical-success", critical: true });
  });

  it("the multiple attack penalty is the engine's own roll option", () => {
    const dice = createDiceEngine({ engine: "d20", abilityModifier: false, modifierChoices: [{ id: "map", title: "Attack", choices: [{ label: "1st attack", value: 0 }, { label: "2nd attack (−5)", value: -5 }] }] });
    const pool = dice.buildPool(d20RollInput({ base: [{ label: "Jaws", value: 9 }], choices: { map: "2nd attack (−5)" } }));
    expect(pool.modifier).toBe(4);
    expect(pool.breakdown?.map((b) => [b.label, b.count])).toEqual([["Jaws", 9], ["2nd attack (−5)", -5]]);
  });
});

describe("saves", () => {
  it("total: at or above the DC succeeds; half damage on a success rounds down", () => {
    const res = resolveD20Save(def, rollWith(m.dice, d20RollInput({ base: [{ label: "Grace save", value: 1 }], dc: 11 }), [10]), 11);
    expect(res).toMatchObject({ success: true, degree: "success" });
    expect(d20SaveDamageMultiplier(def, "success", true)).toBe(0.5);
    expect(d20SaveDamageMultiplier(def, "failure", true)).toBe(1);
    expect(d20SaveDamageMultiplier(def, "success", false)).toBe(0);
  });

  it("four degrees: a basic save takes none, half, full or double", () => {
    const four: D20CombatDef = { ...def, rules: { ...def.rules, save: "degrees", halfSave: { criticalSuccess: 0, success: 0.5, failure: 1, criticalFailure: 2 } } };
    expect(["critical-success", "success", "failure", "critical-failure"].map((d) => d20SaveDamageMultiplier(four, d as "success", true))).toEqual([0, 0.5, 1, 2]);
  });

  it("an automatic failure fails whatever the roll; the effect's conditions apply on a failure", () => {
    const active = d20ActiveConditions(def, [{ id: "stunned" }]);
    const adj = d20ConditionAdjustment(def, active, { roll: "save", save: "might-save", ability: "might" });
    expect(adj.autoFail).toEqual(["Stunned"]);
    const res = resolveD20Save(def, rollWith(m.dice, d20RollInput({ base: [{ label: "Might save", value: 9 }], dc: 5 }), [20]), 5, adj.autoFail);
    expect(res).toMatchObject({ success: false, degree: "failure" });
    const breath = d20Attacks(def, d20CombatantFor(def, "example-pack.monster")!, { fields: gloomling.fields })[1]!.save!;
    expect(d20SaveConditions(breath, "failure").map((c) => c.id)).toEqual(["dazed"]);
    expect(d20SaveConditions(breath, "success")).toEqual([]);
  });
});

describe("damage", () => {
  it("rolls the dice twice on a critical hit (critDamage dice) or doubles the total (total)", () => {
    expect(doubleDiceExpression("2d6+3")).toBe("4d6+3");
    expect(doubleDiceExpression("1d8-1")).toBe("2d8-1");
    const parts = [{ dice: "1d4+1", type: "cut" }];
    const dice = rollEntered((rng) => rollD20Damage(def, parts, rng, { critical: true }), [3, 4]);
    expect(dice).toMatchObject({ total: 8, critical: true, doubled: "dice", parts: [{ rolled: "2d4+1", raw: [3, 4], total: 8 }] });
    const total: D20CombatDef = { ...def, rules: { ...def.rules, critDamage: "total" } };
    expect(rollEntered((rng) => rollD20Damage(total, parts, rng, { critical: true }), [3]).total).toBe(8);
  });

  it("resistance halves rounding down, vulnerability doubles, immunity takes none; except traits get past", () => {
    const mods = [
      { kind: "resistance" as const, type: "cold" },
      { kind: "vulnerability" as const, type: "fire" },
      { kind: "immunity" as const, type: "cut", except: ["silver"] },
    ];
    const out = applyD20DamageModifiers(def, mods, [
      { type: "cold", amount: 7 },
      { type: "fire", amount: 5 },
      { type: "cut", amount: 6 },
    ]);
    expect(out.parts.map((p) => p.after)).toEqual([3, 10, 0]);
    expect(out.total).toBe(13);
    expect(out.lines).toEqual(["cold resistance: 7 → 3", "vulnerable to fire: 5 → 10", "immune to cut: 6 → 0"]);
    expect(applyD20DamageModifiers(def, mods, [{ type: "cut", amount: 6 }], ["silver"]).total).toBe(6);
  });

  it("weakness and resistance by amount, in the module's order, the highest of each", () => {
    const orc: D20CombatDef = { ...def, rules: { ...def.rules, damageOrder: ["immunity", "weakness", "resistance"] } };
    const mods = [
      { kind: "weakness" as const, type: "fire", value: 5 },
      { kind: "resistance" as const, type: "physical", value: 3 },
      { kind: "resistance" as const, type: "all", value: 1 },
      { kind: "weakness" as const, type: "fire", value: 2 },
    ];
    const out = applyD20DamageModifiers(orc, mods, [
      { type: "fire", amount: 4 },
      { type: "cut", amount: 10 },
    ]);
    // fire: +5 (highest weakness) then −1 (all); cut: −3 (physical beats all)
    expect(out.parts.map((p) => p.after)).toEqual([8, 7]);
    expect(out.lines).toEqual(["fire weakness 5: 4 → 9", "fire (all) resistance 1: 9 → 8", "cut (physical) resistance 3: 10 → 7"]);
  });

  it("temporary hit points go first", () => {
    expect(d20TakeDamage({ current: 10, max: 10, temp: 3 }, 5)).toEqual({ current: 8, max: 10, temp: 0, fromTemp: 3 });
    expect(d20TakeDamage({ current: 2, max: 10, temp: 0 }, 9)).toMatchObject({ current: 0 });
  });
});

describe("conditions", () => {
  it("disadvantage on attack rolls (sick), with the reason", () => {
    const active = d20ActiveConditions(def, [{ id: "sick" }]);
    const own = d20ConditionAdjustment(def, active, { roll: "attack", attackKind: "melee", ability: "might" });
    expect(own.disadvantage).toEqual(["Sick"]);
    expect(d20RollMode(own).mode).toBe("disadvantage");
    // advantage from the target cancels it out
    const target = d20ConditionAdjustment(def, d20ActiveConditions(def, [{ id: "helpless" }]), { roll: "attack", attackKind: "melee" }, { against: true, close: true });
    expect(target.advantage).toEqual(["Helpless"]);
    expect(target.critOnHit).toEqual(["Helpless"]);
    expect(d20RollMode(own, target).mode).toBe("normal");
  });

  it("a valued penalty uses its value; same-type penalties do not stack (the worst counts)", () => {
    const active = d20ActiveConditions(def, [
      { id: "dazed", value: 2 },
      { id: "shaken" },
    ]);
    const adj = d20ConditionAdjustment(def, active, { roll: "check", ability: "wits" });
    expect(adj.modifier).toBe(-2);
    expect(adj.parts.map((p) => [p.label, p.value, p.stacked])).toEqual([
      ["Dazed 2", -2, true],
      ["Shaken", -1, false],
    ]);
    const all: D20CombatDef = { ...def, rules: { ...def.rules, stacking: "all" } };
    expect(d20ConditionAdjustment(all, active, { roll: "check" }).modifier).toBe(-3);
    expect(d20RollInput({ base: [{ label: "Lore", value: 4 }], own: adj }).adjustments).toEqual([
      { label: "Lore", value: 4 },
      { label: "Dazed 2 (status)", value: -2 },
    ]);
  });

  it("range-limited effects need to know whether the attacker is close", () => {
    const down = d20ActiveConditions(def, [{ id: "down" }]);
    expect(d20ConditionAdjustment(def, down, { roll: "attack", attackKind: "melee" }, { against: true, close: true }).advantage).toEqual(["Down"]);
    expect(d20ConditionAdjustment(def, down, { roll: "attack", attackKind: "ranged" }, { against: true, close: false }).disadvantage).toEqual(["Down"]);
  });

  it("implied conditions come with the one that implies them, once each", () => {
    const active = d20ActiveConditions(def, [{ id: "knocked-out" }, { id: "stunned" }]);
    expect(active.map((a) => [a.id, a.impliedBy ?? []])).toEqual([
      ["knocked-out", []],
      ["stunned", []],
      ["helpless", ["Knocked out", "Stunned"]],
      ["down", ["Knocked out"]],
    ]);
  });

  it("helper text says what is automated and what is not", () => {
    const down = def.conditions.find((c) => c.id === "down")!;
    const auto = d20ConditionAutomation(def, down);
    expect(auto.automated).toContain("disadvantage on attack rolls");
    expect(auto.automated).toContain("advantage on attack rolls against it (attacker within reach)");
    expect(auto.manual).toEqual(["standing up costs half its movement"]);
  });

  it("speed changes: set wins, then multiply", () => {
    const grabbed = { ...def, conditions: [...def.conditions, { id: "held", name: "Held", summary: "Speed 0.", original: true, speed: { set: 0 } }, { id: "slow", name: "Slow", summary: "Half speed.", original: true, speed: { multiply: 0.5 } }] };
    expect(d20Speed(d20ActiveConditions(grabbed, [{ id: "slow" }]), 30)).toEqual({ value: 15, by: ["Slow"] });
    expect(d20Speed(d20ActiveConditions(grabbed, [{ id: "slow" }, { id: "held" }]), 30).value).toBe(0);
  });
});

describe("durations", () => {
  it("rounds count the affected creature's turn ends; its current turn does not count", () => {
    const d = d20ConcreteDuration({ rounds: 2 }, { target: "t", source: "s", currentTurn: "s" })!;
    expect(d).toEqual({ turns: 2, turnOf: "t", at: "end" });
    let records = [{ id: "sick", duration: d }];
    records = tickD20Conditions(def, "t", records, { entity: "s", at: "end" }).records as typeof records;
    expect(records[0]!.duration!.turns).toBe(2);
    const one = tickD20Conditions(def, "t", records, { entity: "t", at: "end" });
    expect(one.records[0]!.duration!.turns).toBe(1);
    const two = tickD20Conditions(def, "t", one.records, { entity: "t", at: "end" });
    expect(two.records).toEqual([]);
    expect(two.expired.map((r) => r.id)).toEqual(["sick"]);
  });

  it("until the end of the source's next turn", () => {
    const d = d20ConcreteDuration({ sourceNextTurn: true }, { target: "t", source: "s", currentTurn: "s" })!;
    expect(d).toEqual({ turns: 2, turnOf: "s", at: "end" });
    const first = tickD20Conditions(def, "t", [{ id: "down", duration: d }], { entity: "s", at: "end" });
    expect(first.records).toHaveLength(1);
    expect(tickD20Conditions(def, "t", first.records, { entity: "s", at: "end" }).expired).toHaveLength(1);
  });

  it("save ends: a save is due at the end of the affected creature's own turn", () => {
    const d = d20ConcreteDuration({ save: { save: "might-save" } }, { target: "t", dc: 11 })!;
    const res = tickD20Conditions(def, "t", [{ id: "sick", duration: d }], { entity: "t", at: "end" });
    expect(res.savesDue).toEqual([{ id: "sick", save: "might-save", dc: 11 }]);
    expect(tickD20Conditions(def, "t", [{ id: "sick", duration: d }], { entity: "other", at: "end" }).savesDue).toEqual([]);
  });

  it("a decrementing condition drops by one at the end of its own turn and ends at 0", () => {
    const a = tickD20Conditions(def, "t", [{ id: "dazed", value: 2 }], { entity: "t", at: "end" });
    expect(a.records).toEqual([{ id: "dazed", value: 1 }]);
    expect(a.decremented).toEqual([{ id: "dazed", from: 2, to: 1 }]);
    expect(tickD20Conditions(def, "t", a.records, { entity: "t", at: "end" }).expired.map((r) => r.id)).toEqual(["dazed"]);
    // someone else's turn leaves it alone
    expect(tickD20Conditions(def, "t", [{ id: "dazed", value: 2 }], { entity: "x", at: "end" }).records).toEqual([{ id: "dazed", value: 2 }]);
  });
});

describe("0 hit points", () => {
  it("picks the first rule that applies to the creature", () => {
    expect(d20ZeroHpRule(def, { kind: "character", type: "example-pack.adventurer", fields: {} })?.conditions?.map((c) => c.id)).toEqual(["knocked-out"]);
    expect(d20ZeroHpRule(def, { kind: "creature", type: "example-pack.monster", fields: {} })?.defeated).toBe(true);
  });
});

describe("determinism", () => {
  it("same seed, same attack and damage; typing back the faces gives the same result", () => {
    const run = (rng: Rng) => {
      const roll = m.dice.roll(m.dice.buildPool(d20RollInput({ base: [{ label: "Bite", value: 3 }], advantage: "advantage" })), rng);
      const res = resolveD20Attack(def, roll, 12);
      const dmg = rollD20Damage(def, [{ dice: "1d4+1", type: "cut" }, { dice: "1d6", type: "fire" }], rng, { critical: res.critical });
      return { total: roll.total, hit: res.hit, damage: dmg.total, raw: dmg.parts.map((p) => p.raw) };
    };
    for (const seed of ["a", "b", "c", "d"]) {
      expect(run(createRng(seed))).toEqual(run(createRng(seed)));
      const rec = recordDice(createRng(seed));
      const app = run(rec.rng);
      expect(rollEntered(run, rec.faces)).toEqual(app);
    }
    // entered dice are taken in order: two d20 (advantage), then the damage dice
    expect(run(createEnteredRng([4, 15, 2, 5]))).toEqual({ total: 18, hit: true, damage: 8, raw: [[2], [5]] });
  });
});

describe("conformance", () => {
  it("the example pack's d20 combat passes; broken references are errors", () => {
    expect(checkModule(m, { skipProcedureRuns: true }).issues).toEqual([]);
    const broken: GameModule = {
      ...m,
      d20Combat: {
        ...def,
        conditions: [...def.conditions, { id: "odd", name: "Odd", summary: "", implies: ["nope"], effects: [{ on: ["save"], saves: ["luck-save"], autoFail: true }] }],
        combatants: [...def.combatants, { entityTypes: ["example-pack.ghost"], ac: 10, hp: { max: 1 } }],
      },
    };
    const msgs = checkModule(broken, { skipProcedureRuns: true }).issues.filter((i) => i.severity === "error").map((i) => `${i.where}: ${i.message}`);
    expect(msgs).toEqual(
      expect.arrayContaining([
        "d20Combat:condition:odd: condition has no helper text (summary)",
        'd20Combat:condition:odd: effect 0 names unknown save "luck-save"',
        'd20Combat:condition:odd: implies unknown condition "nope"',
        "d20Combat:combatant:example-pack.ghost: hp needs a current or a damage field",
        'd20Combat:combatant:example-pack.ghost: unknown entity type "example-pack.ghost"',
      ]),
    );
  });

  it("the pack schema rejects a typo in d20Combat", () => {
    const pack = read("pack.json") as { d20Combat: Record<string, unknown> };
    pack.d20Combat.critRule = "natural20Doubles";
    const res = validatePack(pack);
    expect(res.ok).toBe(false);
    expect(res.issues.map(formatPackIssue)).toContain('$.d20Combat: unknown property "critRule"');
  });
});
