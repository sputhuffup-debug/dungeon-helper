import { describe, expect, it } from "vitest";
import { createRng, type EntityTypeDef, type GameModule, type HitInput, type RollTable } from "@campaign-forge/module-sdk";
import {
  applyDamage,
  armorFor,
  attackDamage,
  brokenEntryFor,
  combatHealthFor,
  creatureAttacks,
  creatureSpeed,
  creatureTurnFor,
  damageReaction,
  healDamage,
  healthState,
  resolveHitFor,
  rollCreatureAttack,
} from "../src";
import { fixtureModule, newStore } from "./fixtures";

const FIGHTER: EntityTypeDef = {
  id: "example.fighter",
  kind: "character",
  name: "Fighter",
  plural: "Fighters",
  schema: { type: "object", properties: { grit: { type: "integer" }, hurt: { type: "integer" }, plate: { type: "integer" }, golem: { type: "boolean" } } },
  computed: { toughness: { "*": [{ var: "fields.grit" }, 2] } },
  sheet: { sections: [{ id: "main", title: "Main", fields: [{ path: "grit" }, { path: "hurt" }] }] },
};

const BRUTE: EntityTypeDef = {
  id: "example.brute",
  kind: "creature",
  name: "Brute",
  plural: "Brutes",
  schema: { type: "object", properties: { speed: { type: "integer" }, hp: { type: "integer" }, harm: { type: "integer" }, hide: { type: "integer" }, hideVsFire: { type: "integer" }, spit: { type: "integer" }, attacks: { type: "string" } } },
  sheet: { sections: [{ id: "main", title: "Main", fields: [{ path: "hp" }] }] },
};

const ATTACKS: RollTable = {
  id: "example.brute.attacks",
  name: "Brute attacks",
  page: 9,
  dice: "1d6",
  rows: [
    { range: [1, 2], label: "Glare", result: { name: "Glare", dice: 0, damage: 0, effect: "It stares." } },
    { range: [3, 4], label: "Claw", result: { name: "Claw", dice: 4, damage: 1, effect: "Rakes the target." } },
    { range: [5, 6], label: "Bite", result: { name: "Bite", dice: 6, damage: "2 (3 if prone)", armorPiercing: true, effect: "Bites deep." } },
  ],
};

function withCombat(resolveHit?: (hit: HitInput) => { damage: number; explain: string }): GameModule {
  return {
    ...fixtureModule,
    entityTypes: [...fixtureModule.entityTypes, FIGHTER, BRUTE],
    tables: [ATTACKS],
    combat: {
      health: [
        {
          entityType: "example.fighter",
          damagePath: "hurt",
          maxPath: "toughness",
          armorPath: "plate",
          broken: [
            { when: { "!!": [{ var: "fields.golem" }] }, table: "example.table.cracks", label: "Cracks" },
            { table: "example.table.wounds", label: "Grave wound" },
          ],
        },
        { entityType: "example.brute", damagePath: "harm", maxPath: "hp", armorPath: "hide", armorBySource: { fire: "hideVsFire" }, broken: [{ table: "example.table.broken", label: "Broken" }] },
      ],
      ...(resolveHit ? { resolveHit } : {}),
      creatureTurns: [
        {
          entityType: "example.brute",
          speedPath: "speed",
          attackTablePath: "attacks",
          onDamaged: { label: "Spit", ratingPath: "spit", addDamageTaken: true, damage: 1, reach: "everything Adjacent", exceptSources: ["fire"] },
        },
      ],
    },
  };
}

function setup(module = withCombat()) {
  const store = newStore();
  const fighter = store.createEntity({ type: "example.fighter", name: "Ada", fields: { grit: 3, hurt: 0, plate: 1 } });
  const golem = store.createEntity({ type: "example.fighter", name: "Clay", fields: { grit: 2, hurt: 0, golem: true } });
  const brute = store.createEntity({ type: "example.brute", name: "Brute", fields: { speed: 2, hp: 5, harm: 0, hide: 2, hideVsFire: 0, spit: 3, attacks: "example.brute.attacks" } });
  return { store, module, fighter, golem, brute };
}

describe("health", () => {
  it("finds the health def and computes max from the type's computed rules", () => {
    const { module, fighter, brute, store } = setup();
    expect(combatHealthFor(module, fighter)?.damagePath).toBe("hurt");
    expect(combatHealthFor(module, { type: "example.person" })).toBeUndefined();
    expect(healthState(module, fighter)).toEqual({ max: 6, damage: 0, remaining: 6, broken: false });
    expect(healthState(module, brute)).toEqual({ max: 5, damage: 0, remaining: 5, broken: false });
    // works with a loaded-module shape too
    expect(healthState({ module }, brute)?.max).toBe(5);
    // computed max is never stored
    expect(store.get("entities", fighter.id)!.fields).not.toHaveProperty("toughness");
  });

  it("picks armor by source, falling back to the main armor", () => {
    const { module, brute, fighter } = setup();
    expect(armorFor(module, brute)).toBe(2);
    expect(armorFor(module, brute, "fire")).toBe(0);
    expect(armorFor(module, brute, "acid")).toBe(2);
    expect(armorFor(module, fighter, "fire")).toBe(1);
  });
});

describe("applyDamage without a module hit rule", () => {
  it("subtracts armor, never below zero, and writes the damage field", () => {
    const { store, module, brute } = setup();
    const out = applyDamage(store, module, brute.id, 3, { rng: createRng("a") });
    expect(out.result).toEqual({ damage: 1, explain: "3 damage − armor 2 = 1" });
    expect(out.armor).toBe(2);
    expect(store.get("entities", brute.id)!.fields.harm).toBe(1);
    const blocked = applyDamage(store, module, brute.id, 1, { rng: createRng("b") });
    expect(blocked.result.damage).toBe(0);
    expect(store.get("entities", brute.id)!.fields.harm).toBe(1);
  });

  it("armor piercing ignores armor; fire uses the fire armor; extra successes are not counted", () => {
    const { store, module, brute } = setup();
    expect(applyDamage(store, module, brute.id, 2, { rng: createRng("a"), armorPiercing: true }).result.damage).toBe(2);
    expect(applyDamage(store, module, brute.id, 1, { rng: createRng("a"), source: "fire" }).result.damage).toBe(1);
    expect(applyDamage(store, module, brute.id, 2, { rng: createRng("a"), extraSuccesses: 3 }).result.damage).toBe(0);
    expect(healthState(module, store.get("entities", brute.id)!)?.damage).toBe(3);
  });

  it("detects broken, caps damage at max and names the broken table by `when`", () => {
    const { store, module, fighter, golem } = setup();
    const first = applyDamage(store, module, fighter.id, 4, { rng: createRng("x") });
    expect(first.after).toEqual({ max: 6, damage: 3, remaining: 3, broken: false });
    expect(first.brokenTable).toBeUndefined();
    const second = applyDamage(store, module, fighter.id, 9, { rng: createRng("x") });
    expect(second.after.damage).toBe(6);
    expect(second.broken && second.newlyBroken).toBe(true);
    expect(second.brokenTable?.label).toBe("Grave wound");
    // a further hit on a broken fighter rolls again but is not newly broken
    const third = applyDamage(store, module, fighter.id, 3, { rng: createRng("x") });
    expect(third.newlyBroken).toBe(false);
    expect(third.brokenTable?.table).toBe("example.table.wounds");
    // a golem gets its own table
    expect(brokenEntryFor(module, golem)?.label).toBe("Cracks");
    expect(applyDamage(store, module, golem.id, 4, { rng: createRng("x") }).brokenTable?.table).toBe("example.table.cracks");
  });

  it("raw damage skips armor; heal never goes below zero", () => {
    const { store, module, brute } = setup();
    expect(applyDamage(store, module, brute.id, 1, { rng: createRng("r"), ignoreArmor: true }).after.damage).toBe(1);
    expect(healDamage(store, module, brute.id, 5)).toEqual({ max: 5, damage: 0, remaining: 5, broken: false });
  });

  it("refuses an entity without a health def", () => {
    const { store, module } = setup();
    const p = store.createEntity({ type: "example.person", name: "Nobody", fields: {} });
    expect(() => applyDamage(store, module, p.id, 1, { rng: createRng("n") })).toThrow(/no health def/);
  });
});

describe("applyDamage with the module's resolveHit", () => {
  const rule = (hit: HitInput) => {
    const armor = hit.armorPiercing ? 0 : hit.armor;
    const damage = Math.max(0, hit.damage + (hit.extraSuccesses ?? 0) - armor);
    return { damage, explain: `${hit.damage}+${hit.extraSuccesses ?? 0} vs armor ${armor}${hit.source ? ` (${hit.source})` : ""}` };
  };

  it("passes damage, armor, piercing, source and extra successes to the module", () => {
    const { store, module, brute } = setup(withCombat(rule));
    const out = applyDamage(store, module, brute.id, 2, { rng: createRng("h"), extraSuccesses: 2 });
    expect(out.result).toEqual({ damage: 2, explain: "2+2 vs armor 2" });
    const fire = resolveHitFor(module, store.get("entities", brute.id)!, 1, { rng: createRng("h"), source: "fire" });
    expect(fire).toEqual({ armor: 0, result: { damage: 1, explain: "1+0 vs armor 0 (fire)" } });
  });

  it("is deterministic for a seed when the rule rolls", () => {
    const rolling = withCombat();
    rolling.combat!.resolveHit = (hit, rng) => {
      const saved = Array.from({ length: hit.armor }, () => rng.int(1, 6)).filter((v) => v === 6).length;
      return { damage: Math.max(0, hit.damage - saved), explain: `armor saved ${saved}` };
    };
    const a = setup(rolling);
    const b = setup(rolling);
    const r1 = applyDamage(a.store, rolling, a.brute.id, 3, { rng: createRng("same") });
    const r2 = applyDamage(b.store, rolling, b.brute.id, 3, { rng: createRng("same") });
    expect(r1.result).toEqual(r2.result);
  });

  it("passes a weak spot to the module's rule", () => {
    const seen: HitInput[] = [];
    const m = withCombat((hit) => (seen.push(hit), { damage: hit.damage, explain: "" }));
    const { store, brute } = setup(m);
    applyDamage(store, m, brute.id, 2, { rng: createRng("w"), weakSpot: true });
    expect(seen[0]).toMatchObject({ damage: 2, armor: 2, weakSpot: true });
  });
});

describe("creature turns", () => {
  it("finds the turn, its speed and attacks", () => {
    const { module, brute, fighter } = setup();
    expect(creatureTurnFor(module, brute)?.attackTablePath).toBe("attacks");
    expect(creatureTurnFor(module, fighter)).toBeUndefined();
    expect(creatureSpeed(module, brute)).toBe(2);
    expect(creatureAttacks(module, brute).map((a) => [a.name, a.range])).toEqual([
      ["Glare", [1, 2]],
      ["Claw", [3, 4]],
      ["Bite", [5, 6]],
    ]);
    expect(attackDamage(creatureAttacks(module, brute)[2]!)).toBe(2);
  });

  it("rolls the attack table with a seeded rng: same seed, same attack", () => {
    const { module, brute } = setup();
    const a = rollCreatureAttack(module, brute, createRng("turn:1"));
    const b = rollCreatureAttack(module, brute, createRng("turn:1"));
    expect(a.attack).toEqual(b.attack);
    expect(a.record.table).toBe("example.brute.attacks");
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) seen.add(rollCreatureAttack(module, brute, createRng(`turn:${i}`)).attack.name);
    expect([...seen].sort()).toEqual(["Bite", "Claw", "Glare"]);
  });

  it("reaction dice: rating plus damage taken, none for an excepted source or no damage", () => {
    const { module, brute, fighter } = setup();
    expect(damageReaction(module, brute, 2)).toMatchObject({ rating: 3, dice: 5, reaction: { label: "Spit", damage: 1 } });
    expect(damageReaction(module, brute, 2, "Fire")).toBeUndefined();
    expect(damageReaction(module, brute, 0)).toBeUndefined();
    expect(damageReaction(module, fighter, 2)).toBeUndefined();
    const flat = withCombat();
    flat.combat!.creatureTurns![0]!.onDamaged!.addDamageTaken = false;
    expect(damageReaction(flat, brute, 4)?.dice).toBe(3);
    // damage taken counts no more than the cap (here the brute's maximum Health, 5)
    const capped = withCombat();
    capped.combat!.creatureTurns![0]!.onDamaged!.damageTakenCapPath = "hp";
    expect(damageReaction(capped, brute, 9)).toMatchObject({ counted: 5, dice: 8 });
  });
});
