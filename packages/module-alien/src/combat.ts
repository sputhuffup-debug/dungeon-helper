/**
 * Combat at the table (Evolved Edition chapter 4, p. 59-79, and the
 * Xenomorph combat rules, p. 208-210): where characters and creatures keep
 * their damage, the armor rule, what zero Health means, how a creature takes
 * its turn, acid splash, and the close combat special attacks.
 *
 * Checked against the book (October 2026); see docs/verification/combat.md.
 * Numbers and names are the book's; notes and effects are short paraphrases.
 */
import type {
  CombatDef,
  CombatHealthDef,
  CreatureTurnDef,
  DamageReactionDef,
  HitInput,
  HitResult,
  JsonLogicRule,
  SpecialAttackDef,
} from "@campaign-forge/module-sdk";
import { ANDROID_CRITICAL_DAMAGE_TABLE, CRITICAL_INJURY_TABLE } from "./dice/tableIds";
import { brokenXenomorph } from "./tables/creatures";

export const BROKEN_XENOMORPH_TABLE = brokenXenomorph.id;

/**
 * Hit sources the armor rule treats differently. Any other source (or none)
 * is an ordinary external attack: armor applies in full (p. 67).
 */
export const HIT_SOURCES = {
  /** Body armor works as normal against fire (p. 76); creatures use their armor vs fire where the stat line gives one. */
  fire: "fire",
  /** Falling ignores body armor (p. 75). */
  fall: "fall",
  /** Stun damage takes no Health: armor applies, then a STAMINA roll at minus the damage (p. 71). */
  stun: "stun",
  /** Acid splash: armor applies, but the acid eats a point of armor per point of damage (p. 210). */
  acid: "acid",
} as const;

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

const isAndroid: JsonLogicRule = { "==": [{ var: "fields.android" }, true] };

/**
 * The broken xenomorph table covers the Xenomorphs of chapter 10, which the
 * book's combat rules treat as one family (XX121 and the Neomorph strain,
 * p. 208). Facehuggers and Chestbursters (XX121 Stages II and III) are
 * destroyed at zero Health instead (p. 209). Other species get no table.
 */
const rollsBrokenXenomorph: JsonLogicRule = {
  or: [
    { and: [{ "==": [{ var: "fields.species" }, "xx121"] }, { "!": { in: [{ var: "fields.stage" }, ["II", "III"]] } }] },
    { "==": [{ var: "fields.species" }, "neomorph"] },
  ],
};

/** Characters, PCs and NPCs alike: NPCs are broken the same way (p. 69). */
export const characterHealth: CombatHealthDef = {
  entityType: "alien.character",
  damagePath: "damage",
  maxPath: "health",
  broken: [
    { when: isAndroid, table: ANDROID_CRITICAL_DAMAGE_TABLE, operation: "androidCriticalDamage", label: "Android critical system damage" },
    { table: CRITICAL_INJURY_TABLE, operation: "criticalInjury", label: "Critical injury" },
  ],
  page: [67, 70],
};

export const creatureHealth: CombatHealthDef = {
  entityType: "alien.creature",
  damagePath: "damage",
  maxPath: "health",
  armorPath: "armor",
  armorBySource: { [HIT_SOURCES.fire]: "armorVsFire" },
  broken: [{ when: rollsBrokenXenomorph, table: BROKEN_XENOMORPH_TABLE, label: "Broken xenomorph" }],
  page: [208, 209],
};

// ---------------------------------------------------------------------------
// The armor rule (p. 62, 64, 67, 71, 75, 76, 210)
// ---------------------------------------------------------------------------

const int = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);

/**
 * Damage = base damage + 1 per extra success (p. 62, 64). Armor level is
 * subtracted (p. 67); armor piercing counts it one step lower, to a minimum
 * of zero, and a weak spot one step lower again (p. 67). No dice are rolled.
 */
export function resolveHit(hit: HitInput): HitResult {
  const base = int(hit.damage);
  const extra = int(hit.extraSuccesses);
  const total = base + extra;
  const dmgText = extra > 0 ? `${total} damage (${base} base + ${extra} for extra successes, p. 62)` : `${total} damage`;

  if (hit.source === HIT_SOURCES.fall) {
    return { damage: total, explain: `${dmgText}; body armor does not help against a fall (p. 75): ${total} gets through.` };
  }

  const listed = int(hit.armor);
  let armor = listed;
  const steps: string[] = [];
  if (hit.armorPiercing && armor > 0) {
    armor -= 1;
    steps.push("armor piercing −1");
  } else if (hit.armorPiercing) steps.push("armor piercing (already 0)");
  if (hit.weakSpot && armor > 0) {
    armor -= 1;
    steps.push("weak spot −1");
  } else if (hit.weakSpot) steps.push("weak spot (already 0)");
  const through = Math.max(0, total - armor);
  const fire = hit.source === HIT_SOURCES.fire ? " vs fire" : "";
  const armorText =
    listed === 0 && steps.length === 0
      ? `no armor${fire}`
      : steps.length > 0
        ? `armor${fire} ${listed} (${steps.join(", ")}) = ${armor} (p. 67)`
        : `armor${fire} ${armor} (p. 67)`;
  let explain = `${dmgText} − ${armorText}: ${through} gets through.`;
  if (hit.source === HIT_SOURCES.fire) explain += " Body armor works as normal against fire (p. 76).";
  if (hit.source === HIT_SOURCES.acid) explain += " The acid eats away a point of armor level per point of damage (p. 210).";
  if (hit.source === HIT_SOURCES.stun) {
    return {
      damage: 0,
      explain: `${explain.replace(/ gets through\.$/, ".")} Stun: no Health lost; roll STAMINA at −${through} or lose the next turn (p. 71). Xenomorphs are immune unless their entry says otherwise, and then resist with MOBILITY (p. 209).`,
    };
  }
  return { damage: through, explain };
}

// ---------------------------------------------------------------------------
// Creature turns (p. 208-210)
// ---------------------------------------------------------------------------

export const acidSplash: DamageReactionDef = {
  label: "Acid splash",
  ratingPath: "acidSplash",
  addDamageTaken: true,
  damageTakenCapPath: "health",
  damage: 1,
  reach: "everyone at Adjacent range, and the floor",
  exceptSources: [HIT_SOURCES.fire],
  text:
    "XX121 only (creatures with an Acid Splash rating). Dice = rating + the damage it just took, counting no more than its maximum Health. Armor reduces the damage but loses a point per point of damage. Anyone damaged by the first splash, even if armor took it all, is attacked again at the start of each round with half the dice, rounded up; once a roll does no damage the acid is spent. The floor works the same way and can be eaten through.",
  page: 210,
};

export const creatureTurn: CreatureTurnDef = {
  entityType: "alien.creature",
  speedPath: "speed",
  attackTablePath: "attackTable",
  notes: [
    { text: "Speed is the number of full turns it gets each round, with one initiative card per point. Each turn is one signature attack or a move; there is no split into full and quick actions.", page: 208 },
    { text: "Roll a D6 on its signature attack table. If the result is the same attack it made last time, roll again.", page: 208 },
    { text: "The roll is only a guide: the GM may pick the attack that suits the scene.", page: 208 },
    { text: "Some rows add to its next roll on the table; the row gives the bonus and any cap.", page: [213, 231] },
    { text: "A Praetorian cannot Charge: re-roll that result.", page: 221 },
    { text: "Attacks reach Adjacent range unless the row says otherwise, and closing in from Short to Adjacent comes free with the attack unless the row changes that.", page: 208 },
    { text: "Moving instead of attacking takes it two zones, or one zone and then in to Adjacent range of a target. Neomorphs, and Scorpionids starting in water, go one zone further.", page: [208, 230] },
    { text: "It never defends or dodges, rolls base dice equal to its skill level and never pushes. Its attacks can be defended against unless the row says not.", page: 208 },
    { text: "Grappled, it spends every turn trying to break free: MOBILITY against the grappler's CLOSE COMBAT.", page: 208 },
    { text: "Ambushing, it takes card #1 for its first turn only; its other cards that round are drawn at random.", page: 208 },
    { text: "At zero Health a Xenomorph is not broken like a human: roll on the Broken Xenomorph table. Facehuggers and Chestbursters are destroyed instead.", page: 209 },
    { text: "Aliens mode: when the PCs face several Xenomorphs with heavy weapons to hand, the GM may rule that one at zero Health simply dies.", page: 209 },
    { text: "A stretch spent immobile restores all of a Xenomorph's lost Health.", page: 209 },
    { text: "The Swarm cannot be killed: at zero Health it leaves to feed elsewhere.", page: 231 },
    { text: "The book gives Harvesters, Lion Worms and Tanakan Scorpionids no zero-Health table; the GM decides.", page: [227, 230] },
  ],
  onDamaged: acidSplash,
  page: 208,
};

// ---------------------------------------------------------------------------
// Special attacks (p. 62)
// ---------------------------------------------------------------------------

const DECLARE = "Adjacent; declared before rolling; no weapon bonus dice";

/**
 * Close combat special attacks (p. 62): a full action rolled with CLOSE
 * COMBAT, declared before the roll and without weapon bonus dice. A hit does
 * no damage but achieves the effect. The target may defend with CLOSE COMBAT
 * as usual (`opposed`); Xenomorphs never defend (p. 208).
 */
export const specialAttacks: SpecialAttackDef[] = [
  {
    id: "disarm",
    name: "Disarm",
    roll: "closeCombat",
    action: "full",
    opposed: "closeCombat",
    effect: "No damage: you pull an item out of the target's hands, then keep it or toss it into the next zone.",
    requires: `${DECLARE}; the target holds an item`,
    page: 62,
  },
  {
    id: "pass",
    name: "Pass",
    roll: "closeCombat",
    action: "full",
    opposed: "closeCombat",
    effect: "No damage: you get past the enemy barring your way and end up on their far side.",
    requires: `${DECLARE}; an enemy is blocking your movement (p. 61)`,
    page: 62,
  },
  {
    id: "shove",
    name: "Shove",
    roll: "closeCombat",
    action: "full",
    opposed: "closeCombat",
    effect: "No damage: the target is pushed out to Short range from you, through a door or hatch if you like.",
    requires: DECLARE,
    page: 62,
  },
  {
    id: "grapple",
    name: "Grapple",
    roll: "closeCombat",
    action: "full",
    opposed: "closeCombat",
    effect:
      "No damage: the target is pinned and can only try to break free (full action, opposed CLOSE COMBAT; Xenomorphs use MOBILITY). Until you let go, your only action is a grapple attack: unarmed, and it cannot be defended against.",
    requires: DECLARE,
    page: 62,
  },
];

// ---------------------------------------------------------------------------
// The combat definition
// ---------------------------------------------------------------------------

/** Rule cards shown with the combat panel. */
export const COMBAT_RULE_IDS = [
  "alien.rule.initiative",
  "alien.rule.actions",
  "alien.rule.attack-close",
  "alien.rule.special-attacks",
  "alien.rule.grappling",
  "alien.rule.block-dodge",
  "alien.rule.attack-ranged",
  "alien.rule.damage-armor",
  "alien.rule.armor",
  "alien.rule.broken",
  "alien.rule.critical-injuries",
  "alien.rule.death",
  "alien.rule.android-damage",
  "alien.rule.creature-attacks",
  "alien.rule.creature-speed",
  "alien.rule.creature-armor",
  "alien.rule.acid-splash",
  "alien.rule.broken-xenomorph",
];

export const combat: CombatDef = {
  health: [characterHealth, creatureHealth],
  resolveHit: (hit) => resolveHit(hit),
  creatureTurns: [creatureTurn],
  specialAttacks,
  opposedTies: {
    winner: "defender",
    text: "The active side needs more successes than its opponent, so a tie fails; defending or dodging cancels one attacking success per success. In open rolls with no clear active side a tie has no winner, broken at random if needed.",
    page: [44, 65],
  },
  rules: COMBAT_RULE_IDS,
};
