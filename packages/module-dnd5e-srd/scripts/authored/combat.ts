/**
 * The pack's declarative d20 combat (`d20Combat`): where a character's and a
 * monster's AC, hit points, saves, damage modifiers and attacks live; attack
 * rolls by the SRD rule (a natural 20 hits and doubles the damage dice, a
 * natural 1 misses); the SRD's conditions with helper text (the SRD's own
 * words, shortened; CC-BY-4.0) and the effects the app applies by itself;
 * and what happens at 0 hit points. Whatever the vocabulary cannot express
 * is listed in each condition's `manual`.
 */
import type { D20CombatDef, D20ConditionDef, ReferenceList } from "@campaign-forge/module-sdk";
import { ABILITIES, CHARACTER, cite, LIST, MONSTER, rule, saveBonusName, SAVES, SKILLS } from "../ids.ts";

const STR_DEX = ["strength-save", "dexterity-save"];
const condition = (c: Omit<D20ConditionDef, "cite" | "rule">): D20ConditionDef => ({ ...c, cite: cite("Conditions", c.name), rule: rule(`conditions.${c.id}`) });

export const CONDITIONS: D20ConditionDef[] = [
  condition({
    id: "blinded",
    name: "Blinded",
    summary: "Can't see, and automatically fails any ability check that needs sight. Attack rolls against it have advantage; its own attack rolls have disadvantage.",
    cannot: ["see"],
    effects: [
      { on: ["attack"], roll: "disadvantage" },
      { on: ["attack"], against: true, roll: "advantage" },
    ],
    manual: ["automatic failure of checks that need sight"],
  }),
  condition({
    id: "charmed",
    name: "Charmed",
    summary: "Can't attack the charmer or target it with harmful abilities or magic. The charmer has advantage on ability checks to interact socially with it.",
    manual: ["can't attack or harm the charmer", "the charmer's advantage on social checks"],
  }),
  condition({
    id: "deafened",
    name: "Deafened",
    summary: "Can't hear, and automatically fails any ability check that needs hearing.",
    cannot: ["hear"],
    manual: ["automatic failure of checks that need hearing"],
  }),
  condition({
    id: "exhaustion",
    name: "Exhaustion",
    summary: "Six levels, each adding to the ones below: 1 disadvantage on ability checks; 2 speed halved; 3 disadvantage on attack rolls and saving throws; 4 hit point maximum halved; 5 speed 0; 6 death. A long rest with food and drink lowers it by 1.",
    valued: true,
    max: 6,
    field: "exhaustion",
    effects: [
      { on: ["check"], roll: "disadvantage", minValue: 1 },
      { on: ["attack", "save"], roll: "disadvantage", minValue: 3 },
    ],
    speed: { multiply: 0.5, minValue: 2 },
    levels: [
      { value: 1, summary: "Disadvantage on ability checks" },
      { value: 2, summary: "Speed halved" },
      { value: 3, summary: "Disadvantage on attack rolls and saving throws" },
      { value: 4, summary: "Hit point maximum halved" },
      { value: 5, summary: "Speed reduced to 0" },
      { value: 6, summary: "Death" },
    ],
    manual: ["hit point maximum halved (level 4)", "speed 0 (level 5)", "death (level 6)", "lowering it after a long rest"],
  }),
  condition({
    id: "frightened",
    name: "Frightened",
    summary: "Disadvantage on ability checks and attack rolls while the source of its fear is in sight; can't willingly move closer to the source.",
    effects: [{ on: ["check", "attack"], roll: "disadvantage" }],
    manual: ["only while the source is in line of sight", "can't move closer to the source"],
  }),
  condition({
    id: "grappled",
    name: "Grappled",
    summary: "Speed 0, and it can't benefit from bonuses to speed. Ends if the grappler is incapacitated or it is moved out of the grappler's reach.",
    speed: { set: 0 },
    manual: ["ends when the grappler is incapacitated or out of reach"],
  }),
  condition({
    id: "incapacitated",
    name: "Incapacitated",
    summary: "Can't take actions or reactions.",
    cannot: ["act", "react"],
  }),
  condition({
    id: "invisible",
    name: "Invisible",
    summary: "Impossible to see without magic or a special sense (heavily obscured for hiding), though noise and tracks can give it away. Attack rolls against it have disadvantage; its attack rolls have advantage.",
    effects: [
      { on: ["attack"], roll: "advantage" },
      { on: ["attack"], against: true, roll: "disadvantage" },
    ],
    manual: ["hiding and being located by noise or tracks"],
  }),
  condition({
    id: "paralyzed",
    name: "Paralyzed",
    summary: "Incapacitated; can't move or speak. Automatically fails Strength and Dexterity saves. Attack rolls against it have advantage, and a hit from within 5 feet is a critical hit.",
    implies: ["incapacitated"],
    cannot: ["move", "speak"],
    effects: [
      { on: ["save"], saves: STR_DEX, autoFail: true },
      { on: ["attack"], against: true, roll: "advantage" },
      { on: ["attack"], against: true, range: "close", critOnHit: true },
    ],
  }),
  condition({
    id: "petrified",
    name: "Petrified",
    summary: "Turned to stone with what it wears and carries: incapacitated, can't move or speak, unaware of its surroundings. Attack rolls against it have advantage; it fails Strength and Dexterity saves, resists all damage and is immune to poison and disease.",
    implies: ["incapacitated"],
    cannot: ["move", "speak"],
    effects: [
      { on: ["save"], saves: STR_DEX, autoFail: true },
      { on: ["attack"], against: true, roll: "advantage" },
    ],
    manual: ["resistance to all damage", "immunity to poison and disease"],
  }),
  condition({
    id: "poisoned",
    name: "Poisoned",
    summary: "Disadvantage on attack rolls and ability checks.",
    effects: [{ on: ["attack", "check"], roll: "disadvantage" }],
  }),
  condition({
    id: "prone",
    name: "Prone",
    summary: "Can only crawl until it stands up, which ends the condition. Disadvantage on its attack rolls. Attack rolls against it have advantage from within 5 feet, disadvantage from farther away.",
    effects: [
      { on: ["attack"], roll: "disadvantage" },
      { on: ["attack"], against: true, range: "close", roll: "advantage" },
      { on: ["attack"], against: true, range: "far", roll: "disadvantage" },
    ],
    manual: ["crawling and standing up"],
  }),
  condition({
    id: "restrained",
    name: "Restrained",
    summary: "Speed 0. Attack rolls against it have advantage; its attack rolls have disadvantage; disadvantage on Dexterity saves.",
    speed: { set: 0 },
    effects: [
      { on: ["attack"], roll: "disadvantage" },
      { on: ["attack"], against: true, roll: "advantage" },
      { on: ["save"], saves: ["dexterity-save"], roll: "disadvantage" },
    ],
  }),
  condition({
    id: "stunned",
    name: "Stunned",
    summary: "Incapacitated, can't move, and can speak only falteringly. Automatically fails Strength and Dexterity saves. Attack rolls against it have advantage.",
    implies: ["incapacitated"],
    cannot: ["move"],
    effects: [
      { on: ["save"], saves: STR_DEX, autoFail: true },
      { on: ["attack"], against: true, roll: "advantage" },
    ],
  }),
  condition({
    id: "unconscious",
    name: "Unconscious",
    summary: "Incapacitated, can't move or speak, unaware of its surroundings; drops what it holds and falls prone. Automatically fails Strength and Dexterity saves. Attack rolls against it have advantage, and a hit from within 5 feet is a critical hit.",
    implies: ["incapacitated", "prone"],
    cannot: ["move", "speak"],
    effects: [
      { on: ["save"], saves: STR_DEX, autoFail: true },
      { on: ["attack"], against: true, roll: "advantage" },
      { on: ["attack"], against: true, range: "close", critOnHit: true },
    ],
    manual: ["dropping what it holds"],
  }),
];

export function d20Combat(lists: ReferenceList[]): D20CombatDef {
  const damageTypes = lists.find((l) => l.id === LIST.damageTypes);
  if (!damageTypes) throw new Error("the damage type list is missing from srd-basics.json");
  const conditionList = lists.find((l) => l.id === LIST.conditions);
  for (const c of CONDITIONS) if (!conditionList?.items.some((i) => i.id === c.id)) throw new Error(`condition ${c.id} is not in the SRD's condition list`);
  const saves = Object.fromEntries(ABILITIES.map((a) => [`${a.id}-save`, { var: [`computed.${saveBonusName(a.id)}`, 0] }]));
  const hp = { current: "hp.current", max: { var: ["fields.hp.max", 1] }, temp: "hp.temp" };
  return {
    cite: cite("Combat"),
    damageTypes: damageTypes.items.map((t) => ({ id: t.id, name: t.name })),
    saves: SAVES.map((s) => ({ id: s.id, name: s.name, ability: s.ability, roll: s.id })),
    attackAbilities: { melee: "strength", ranged: "dexterity" },
    skillAbilities: Object.fromEntries(SKILLS.map((s) => [s.id, s.ability])),
    combatants: [
      { entityTypes: [CHARACTER], ac: { var: ["fields.ac", 10] }, hp, saves, attacks: [{ path: "attacks", keys: { damageType: "type" } }], speed: { var: ["fields.speed", 30] } },
      { entityTypes: [MONSTER], ac: { var: ["fields.ac", 10] }, hp, saves, damageModifiers: "damageModifiers", conditionImmunities: "conditionImmunities", attacks: [{ path: "attacks" }], speed: { var: ["fields.speed", ""] } },
    ],
    rules: { crit: "natural20Doubles", critDamage: "dice", save: "total", halfSave: { success: 0.5, failure: 1 }, stacking: "typed", damageOrder: ["immunity", "resistance", "vulnerability"] },
    conditions: CONDITIONS,
    zeroHp: [
      {
        when: { "==": [{ var: "type" }, CHARACTER] },
        conditions: [{ id: "unconscious" }],
        recover: { remove: ["unconscious"], setFields: { "deathSaves.successes": 0, "deathSaves.failures": 0 } },
        text: "A character at 0 hit points falls unconscious and makes a death saving throw at the start of each of its turns (the death save tracker): 10 or higher is a success, three successes stabilize it, three failures kill it, a natural 20 brings it back with 1 hit point. Damage at 0 hit points is a failed death save (two on a critical hit), and damage that leaves the rest equal to its hit point maximum kills it outright. Any healing wakes it.",
        cite: cite("Combat", "Damage and Healing, Dropping to 0 Hit Points"),
      },
      {
        defeated: true,
        text: "Most monsters die at 0 hit points; an attacker who brings one down with a melee attack can knock it out instead.",
        cite: cite("Combat", "Damage and Healing, Dropping to 0 Hit Points"),
      },
    ],
    closeLabel: "within 5 feet",
    playerHealth: true,
    ruleCards: [rule("damage-and-healing.damage-rolls"), rule("damage-and-healing.damage-resistance-and-vulnerability"), rule("damage-and-healing.dropping-to-0-hit-points"), rule("damage-and-healing.temporary-hit-points")],
  };
}
