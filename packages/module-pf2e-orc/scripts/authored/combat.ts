/**
 * The pack's declarative d20 combat (`d20Combat`): where a character's, a
 * creature's and a hazard's AC, Hit Points, saves, immunities, weaknesses,
 * resistances and Strikes live; Strikes and saves read with four degrees of
 * success (a critical hit doubles the damage; a basic save takes none, half,
 * full or double); the 43 conditions with helper text (the ORC rules text,
 * shortened, cited by book and section) and the effects the app applies by
 * itself (status and circumstance penalties that do not stack with their
 * own type, off-guard, frightened dropping at the end of the turn); and
 * dying and wounded at 0 Hit Points. Whatever the vocabulary cannot express
 * is listed in each condition's `manual`.
 */
import type { D20CombatDef, D20ConditionDef, D20ConditionEffect, ReferenceList } from "@campaign-forge/module-sdk";
import { CHARACTER, cite, CREATURE, HAZARD, LIST, rule, SAVES, SKILLS, totalName } from "../ids.ts";

const minus = { "*": [-1, { var: "value" }] };
/** A status penalty equal to the condition's value. */
const status = (on: D20ConditionEffect["on"], extra: Partial<D20ConditionEffect> = {}): D20ConditionEffect => ({ on, modifier: minus, bonusType: "status", ...extra });
const ALL_CHECKS: D20ConditionEffect["on"] = ["check", "save", "attack", "dc", "ac"];

type Spec = Omit<D20ConditionDef, "cite" | "rule" | "name"> & { name?: string };

const SPECS: Spec[] = [
  {
    id: "blinded",
    summary: "Can't see: all normal terrain is difficult terrain, it detects nothing by vision and critically fails Perception checks that need sight; −4 status to Perception if vision is its only precise sense. Immune to visual effects; overrides dazzled.",
    cannot: ["see"],
    manual: ["difficult terrain", "−4 status to Perception when vision is its only precise sense", "flat checks to target creatures it can't see"],
  },
  { id: "broken", summary: "Objects only: a broken item can't be used for its normal function and grants no bonuses, except armor, which keeps its item bonus to AC but takes a −1 to −3 status penalty to AC by category.", manual: ["objects only"] },
  {
    id: "clumsy",
    summary: "A status penalty equal to the value to Dexterity-based rolls and DCs: AC, Reflex saves, ranged attack rolls, and Acrobatics, Stealth and Thievery checks.",
    valued: true,
    max: 4,
    field: "conditions.clumsy",
    effects: [status(["ac"]), status(["check", "save", "attack", "dc"], { abilities: ["dexterity"] })],
  },
  { id: "concealed", summary: "Hard to see (fog, dim light): anyone targeting it with an attack, spell or other effect must succeed at a DC 5 flat check or it fails to affect it. Area effects ignore this.", manual: ["the DC 5 flat check to target it"] },
  {
    id: "confused",
    summary: "Off-guard; treats no one as an ally; can't Delay, Ready or use reactions; spends its actions on Strikes or offensive cantrips against random targets. Each time it takes damage from an attack or spell, a DC 11 flat check ends it.",
    implies: ["off-guard"],
    cannot: ["react"],
    manual: ["random targets", "the DC 11 flat check when damaged"],
  },
  { id: "controlled", summary: "Its will is subverted: the controller decides what it does, including its reactions and whether it Delays.", manual: ["the controller decides its actions"] },
  { id: "cursebound", summary: "Oracles only: the oracular curse tightens, with effects that depend on the value. Only Refocusing removes it.", valued: true, max: 4, manual: ["the curse's effects at each value", "Refocusing to remove it"] },
  { id: "dazzled", summary: "Vision swimming: if vision is its only precise sense, every creature and object is concealed from it (DC 5 flat check to target).", manual: ["the DC 5 flat check to target"] },
  {
    id: "deafened",
    summary: "Can't hear: critically fails Perception checks that need hearing; −2 status to initiative and to Perception checks involving sound; auditory actions need a DC 5 flat check. Immune to auditory effects.",
    cannot: ["hear"],
    manual: ["−2 status to initiative and sound-based Perception", "the DC 5 flat check for auditory actions"],
  },
  {
    id: "doomed",
    summary: "Its soul is drawn toward death: it dies at dying 4 minus the doomed value (the sheet's dying maximum). Drops by 1 after each full night's rest.",
    valued: true,
    max: 3,
    field: "doomed",
    manual: ["death at the lower dying value", "lowering it after rest"],
  },
  {
    id: "drained",
    summary: "A status penalty equal to the value to Constitution-based rolls and DCs, such as Fortitude saves. It also loses Hit Points and maximum Hit Points equal to its level (at least 1) times the value. Drops by 1 after a full night's rest.",
    valued: true,
    max: 4,
    field: "conditions.drained",
    effects: [status(["check", "save", "attack", "dc"], { abilities: ["constitution"] })],
    manual: ["the lost Hit Points and maximum Hit Points", "lowering it after rest"],
  },
  {
    id: "dying",
    summary: "Bleeding out and unconscious. A recovery check at the start of each of its turns (DC 10 + dying) makes it better or worse; damage raises it by 1 (2 from a critical hit or a critical failure). Dying 4 is death (less when doomed). Healed to 1 Hit Point or more, it loses dying; losing dying gives wounded 1 (or 1 more).",
    valued: true,
    max: 4,
    field: "dying",
    implies: ["unconscious"],
    manual: ["recovery checks at the start of its turn", "dying rising when damaged", "death at its maximum", "wounded when it ends by a recovery check"],
  },
  {
    id: "encumbered",
    summary: "Carrying more than it can manage: clumsy 1 and a 10-foot penalty to all its Speeds (never below 5 feet).",
    implies: ["clumsy"],
    speed: { add: -10 },
  },
  {
    id: "enfeebled",
    summary: "A status penalty equal to the value to Strength-based rolls and DCs, including Strength-based melee attack and damage rolls and Athletics checks.",
    valued: true,
    max: 4,
    field: "conditions.enfeebled",
    effects: [status(["check", "save", "attack", "dc", "damage"], { abilities: ["strength"] })],
  },
  {
    id: "fascinated",
    summary: "Focused on something: −2 status to Perception and skill checks, and no concentrate actions unrelated to the subject. Ends if anyone acts with hostility against it or its allies.",
    effects: [{ on: ["check"], modifier: -2, bonusType: "status" }],
    manual: ["no unrelated concentrate actions", "ending on a hostile action"],
  },
  { id: "fatigued", summary: "Tired: −1 status to AC and saving throws, and no exploration activities while traveling. A full night's rest ends it.", effects: [{ on: ["ac", "save"], modifier: -1, bonusType: "status" }], manual: ["no exploration activities"] },
  { id: "fleeing", summary: "Must spend its actions getting away from the source as fast as it can; can't Delay or Ready.", manual: ["spending its actions to flee"] },
  { id: "friendly", summary: "Attitude: likes the character and agrees to simple, safe Requests. Hostile actions worsen it.", manual: ["an attitude the GM plays"] },
  {
    id: "frightened",
    summary: "A status penalty equal to the value to all its checks and DCs (AC included). Drops by 1 at the end of each of its turns.",
    valued: true,
    max: 4,
    field: "conditions.frightened",
    effects: [status(ALL_CHECKS)],
    endOfTurnDecrement: 1,
  },
  { id: "grabbed", summary: "Held in place by another creature: off-guard and immobilized. A manipulate action needs a DC 5 flat check or it is lost.", implies: ["off-guard", "immobilized"], manual: ["the DC 5 flat check for manipulate actions"] },
  { id: "helpful", summary: "Attitude: wants to help the character and accepts reasonable Requests. Hostile actions worsen it.", manual: ["an attitude the GM plays"] },
  {
    id: "hidden",
    summary: "Others know its space but not exactly where it is: they are off-guard to it, and must succeed at a DC 11 flat check to target it. Area effects ignore this.",
    manual: ["others off-guard to it", "the DC 11 flat check to target it"],
  },
  { id: "hostile", summary: "Attitude: seeks to harm the character and won't accept Requests.", manual: ["an attitude the GM plays"] },
  { id: "immobilized", summary: "Can't use actions with the move trait; forcing it out of its space takes a check against what holds it.", cannot: ["move"] },
  { id: "indifferent", summary: "Attitude: doesn't care either way about the character (the default).", manual: ["an attitude the GM plays"] },
  { id: "invisible", summary: "Can't be seen: undetected by everyone (hidden to anyone who already saw it, until it Sneaks). Others can Seek to find it.", manual: ["being undetected or hidden to each creature"] },
  { id: "observed", summary: "In plain view of a creature's precise sense: the normal state.", manual: ["the normal state; nothing to apply"] },
  { id: "off-guard", summary: "Distracted: −2 circumstance penalty to AC.", effects: [{ on: ["ac"], modifier: -2, bonusType: "circumstance" }] },
  {
    id: "paralyzed",
    summary: "Frozen in place: off-guard; can't act except to Recall Knowledge and use purely mental actions; its senses work only where it can perceive without moving.",
    implies: ["off-guard"],
    cannot: ["act", "move"],
    manual: ["purely mental actions are still allowed"],
  },
  {
    id: "persistent-damage",
    summary: "Takes the noted damage at the end of each of its turns, rolled anew, then a DC 15 flat check ends it.",
    manual: ["rolling the damage at the end of its turn", "the DC 15 flat check to end it"],
  },
  {
    id: "petrified",
    summary: "Turned to stone: can't act or sense anything. It is an object (AC 9, Hardness 8, Bulk doubled) with the Hit Points it had; if the statue is destroyed, it dies.",
    cannot: ["act", "move", "speak", "see", "hear"],
    manual: ["object statistics (AC 9, Hardness 8)"],
  },
  {
    id: "prone",
    summary: "Lying down: off-guard and −2 circumstance penalty to attack rolls; can only Crawl or Stand (standing ends it). Taking Cover while prone gives +4 circumstance AC against ranged attacks.",
    implies: ["off-guard"],
    effects: [{ on: ["attack"], modifier: -2, bonusType: "circumstance" }],
    manual: ["crawling and standing", "Taking Cover against ranged attacks"],
  },
  { id: "quickened", summary: "Gains 1 extra action at the start of each turn, often limited to certain actions by the effect.", manual: ["the extra action"] },
  {
    id: "restrained",
    summary: "Tied up or pinned: off-guard and immobilized; no attack or manipulate actions except to Escape or Force Open. Overrides grabbed.",
    implies: ["off-guard", "immobilized"],
    manual: ["only Escape or Force Open among attack and manipulate actions"],
  },
  {
    id: "sickened",
    summary: "A status penalty equal to the value to all its checks and DCs; it can't willingly ingest anything. Retching (an action) allows a Fortitude save to reduce it by 1 (2 on a critical success).",
    valued: true,
    max: 4,
    field: "conditions.sickened",
    effects: [status(ALL_CHECKS)],
    manual: ["no potions or elixirs", "retching to recover"],
  },
  { id: "slowed", summary: "Regains that many fewer actions at the start of each of its turns.", valued: true, max: 3, field: "conditions.slowed", manual: ["fewer actions each turn"] },
  {
    id: "stunned",
    summary: "Can't act. It loses that many actions as it regains them (the value drops by the actions lost), or all its actions for a duration. Overrides slowed.",
    valued: true,
    max: 4,
    field: "conditions.stunned",
    cannot: ["act"],
    manual: ["actions lost and the value going down"],
  },
  {
    id: "stupefied",
    summary: "A status penalty equal to the value to Intelligence-, Wisdom- and Charisma-based rolls and DCs: Will saves, spell attacks and spell DCs, and those skills. Casting a spell needs a flat check (DC 5 + value) or the spell is disrupted.",
    valued: true,
    max: 4,
    field: "conditions.stupefied",
    effects: [status(["check", "save", "attack", "dc"], { abilities: ["intelligence", "wisdom", "charisma"] })],
    manual: ["the flat check to cast a spell", "spell attack rolls and spell DCs"],
  },
  {
    id: "unconscious",
    summary: "Asleep or knocked out: can't act; −4 status to AC, Perception and Reflex saves; blinded and off-guard; falls prone and drops what it holds. Healed to 1 Hit Point or more, it wakes.",
    implies: ["blinded", "off-guard", "prone"],
    cannot: ["act"],
    effects: [
      { on: ["ac"], modifier: -4, bonusType: "status" },
      { on: ["save"], saves: ["reflex"], modifier: -4, bonusType: "status" },
      { on: ["check"], skills: ["perception"], modifier: -4, bonusType: "status" },
    ],
    manual: ["dropping what it holds", "waking up"],
  },
  { id: "undetected", summary: "Others can't see it or tell which space it is in: they are off-guard to it, and can only guess a square (a DC 11 flat check, rolled in secret) or Seek.", manual: ["others off-guard to it", "guessing its square"] },
  { id: "unfriendly", summary: "Attitude: dislikes and distrusts the character and won't accept Requests.", manual: ["an attitude the GM plays"] },
  { id: "unnoticed", summary: "Others have no idea it is there; it is also undetected.", implies: ["undetected"] },
  {
    id: "wounded",
    summary: "Seriously injured: when it gains dying, the dying value goes up by the wounded value. Ends after Treat Wounds restores Hit Points, or at full Hit Points after 10 minutes of rest.",
    valued: true,
    max: 3,
    field: "wounded",
    manual: ["ending with Treat Wounds or rest"],
  },
];

export function d20Combat(lists: ReferenceList[]): D20CombatDef {
  const conditionList = lists.find((l) => l.id === LIST.conditions);
  if (!conditionList) throw new Error("the conditions list is missing from the converted data");
  const conditions: D20ConditionDef[] = SPECS.map((s) => {
    const item = conditionList.items.find((i) => i.id === s.id);
    if (!item) throw new Error(`condition ${s.id} is not in the conditions list`);
    if ((item.valued === "yes") !== !!s.valued) throw new Error(`condition ${s.id}: valued does not match the source`);
    return { ...s, id: s.id, name: s.name ?? item.name, cite: String(item.cite), rule: rule(`condition.${s.id}`) };
  });
  const missing = conditionList.items.filter((i) => !SPECS.some((s) => s.id === i.id)).map((i) => i.id);
  if (missing.length) throw new Error(`conditions without helper text: ${missing.join(", ")}`);
  const saves = SAVES.filter((s) => s.id !== "perception");
  return {
    cite: cite("Player Core", "Encounter Mode"),
    damageTypes: ["acid", "bludgeoning", "cold", "electricity", "fire", "force", "mental", "piercing", "poison", "slashing", "sonic", "spirit", "vitality", "void", "bleed", "precision"].map((id) => ({ id, name: id.charAt(0).toUpperCase() + id.slice(1) })),
    damageGroups: { physical: ["bludgeoning", "piercing", "slashing"], energy: ["acid", "cold", "electricity", "fire", "force", "sonic", "vitality", "void"] },
    saves: saves.map((s) => ({ id: s.id, name: s.name, ability: s.attribute, roll: s.id })),
    attackAbilities: { melee: "strength", ranged: "dexterity" },
    skillAbilities: Object.fromEntries([...SKILLS.map((s) => [s.id, s.attribute]), ["perception", "wisdom"]]),
    combatants: [
      {
        entityTypes: [CHARACTER],
        ac: { var: ["computed.ac", 10] },
        hp: { current: "hp.current", max: { var: ["computed.hpMax", 1] }, temp: "hp.temp" },
        saves: Object.fromEntries(saves.map((s) => [s.id, { var: [`computed.${totalName(s.id)}`, 0] }])),
        attacks: [{ path: "strikes", keys: { kind: "type" } }],
        speed: { var: ["fields.speed", 25] },
      },
      {
        entityTypes: [CREATURE],
        ac: { var: ["fields.ac", 10] },
        hp: { current: "hp.current", max: { var: ["fields.hp.max", 1] }, temp: "hp.temp" },
        saves: Object.fromEntries(saves.map((s) => [s.id, { var: [`fields.saves.${s.id}`, 0] }])),
        damageModifiers: "damageModifiers",
        conditionImmunities: "conditionImmunities",
        attacks: [{ path: "strikes", keys: { kind: "type", bonus: "attack", damage: "damageParts", effect: "damage" } }],
        speed: { var: ["fields.speed", ""] },
      },
      {
        entityTypes: [HAZARD],
        ac: { var: ["fields.ac", 10] },
        hp: { current: "hp.current", max: { var: ["fields.hp.max", 0] }, temp: "hp.temp" },
        saves: Object.fromEntries(saves.map((s) => [s.id, { var: [`fields.saves.${s.id}`, 0] }])),
        damageModifiers: "damageModifiers",
        conditionImmunities: "conditionImmunities",
      },
    ],
    rules: {
      crit: "degrees",
      critDamage: "total",
      save: "degrees",
      halfSave: { criticalSuccess: 0, success: 0.5, failure: 1, criticalFailure: 2 },
      stacking: "typed",
      damageOrder: ["immunity", "weakness", "resistance"],
    },
    conditions,
    zeroHp: [
      {
        when: { "==": [{ var: "type" }, CHARACTER] },
        conditions: [{ id: "dying", value: { "+": [{ if: [{ var: "critical" }, 2, 1] }, { var: ["conditions.wounded", 0] }] } }],
        recover: {
          remove: ["dying", "unconscious"],
          conditions: [{ id: "wounded", value: { if: [{ var: ["conditions.dying", 0] }, { "+": [{ var: ["conditions.wounded", 0] }, 1] }, { var: ["conditions.wounded", 0] }] } }],
        },
        text: "At 0 Hit Points a character is dying 1 (dying 2 from a critical hit or a critical failure) plus its wounded value, and unconscious. It makes a recovery check at the start of each turn (DC 10 + dying); damage while dying raises it by 1 (2 on a critical); dying 4 (less when doomed) is death. Healed to 1 Hit Point or more, it loses dying and unconscious, and its wounded value goes up by 1.",
        cite: cite("Player Core", "Hit Points, Healing, and Dying"),
      },
      {
        defeated: true,
        text: "A creature or hazard at 0 Hit Points dies or is destroyed (an attacker can knock a creature out instead with a nonlethal attack).",
        cite: cite("Player Core", "Hit Points, Healing, and Dying"),
      },
    ],
    closeLabel: "in reach",
    persistentCondition: "persistent-damage",
    playerHealth: true,
    ruleCards: [rule("advice.hit-points"), rule("advice.degrees-of-success"), rule("condition.dying"), rule("condition.persistent-damage")],
  };
}
