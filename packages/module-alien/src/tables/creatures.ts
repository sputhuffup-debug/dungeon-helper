/**
 * Creature tables (Evolved Edition chapter 10, p. 208-231): one signature
 * attack table per book table, plus the broken xenomorph table (p. 208).
 * Checked against the book: dice, damage, armor piercing and row ranges are
 * the book's; effects are short paraphrases.
 *
 * Several creatures share one book table (Drone, Scout & Stalker; Soldier &
 * Sentry; Praetorian, Charger & Queen; Neophyte & adult Neomorph). The
 * creature presets in ../data/creatures.ts copy their rows from here.
 *
 * Attack rows carry `{ roll, rollTo?, name, dice, damage, armorPiercing, effect }`:
 * `roll` is the lowest D6 result of the row, `rollTo` the highest when the row
 * spans several results. `dice` is the number of base dice (0 = no attack
 * roll), `damage` the base damage (0 = none).
 *
 * The book's facehugger swarm entry (p. 213) is a lookup of Speed by number
 * of facehuggers, not a roll; it lives on the facehugger preset as
 * `swarmSpeed`.
 */
import type { PageRef, RollTable, TableRow } from "@campaign-forge/module-sdk";

const FAMILY = "creatures";

export interface CreatureAttack {
  /** Lowest D6 result of the row. */
  roll: number;
  /** Highest D6 result when the row spans several results; 99 = "and above". */
  rollTo?: number;
  name: string;
  /** Base dice; 0 when the effect needs no attack roll. */
  dice: number;
  /** Base damage; 0 when none. A string when the book gives a conditional value. */
  damage: number | string;
  armorPiercing?: boolean;
  effect: string;
}

function attackTable(variant: string, name: string, page: PageRef, attacks: CreatureAttack[], notes?: string): RollTable {
  const rows: TableRow[] = attacks.map((a) => ({
    range: [a.roll, a.rollTo ?? a.roll],
    label: a.name,
    result: {
      roll: a.roll,
      ...(a.rollTo !== undefined ? { rollTo: a.rollTo } : {}),
      name: a.name,
      dice: a.dice,
      damage: a.damage,
      armorPiercing: a.armorPiercing === true,
      effect: a.effect,
    },
  }));
  return {
    id: `alien.creatures.attack.${variant}`,
    name,
    family: FAMILY,
    page,
    dice: "1d6",
    tags: ["attack", variant],
    ...(notes ? { notes } : {}),
    rows,
  };
}

// ---------------------------------------------------------------------------
// Xenomorph XX121
// ---------------------------------------------------------------------------

export const FACEHUGGER_ATTACKS: CreatureAttack[] = [
  { roll: 1, rollTo: 2, name: "Skittering Menace", dice: 0, damage: 0, effect: "Victim gains +1 stress and makes a panic roll; the facehugger's next attack goes for them with +1 to the D6." },
  { roll: 3, rollTo: 4, name: "Tail Grapple", dice: 0, damage: 0, effect: "Roll D6: 1-2 legs caught, falls and panics; 3-4 drops an item and panics; 5-6 choked, panics, STAMINA or 1 damage (no armor). Next attack +2." },
  { roll: 5, name: "Face Grapple", dice: 6, damage: 0, effect: "Can be defended. On a hit the target makes a panic roll and next turn suffers The Final Embrace." },
  { roll: 6, rollTo: 99, name: "The Final Embrace", dice: 8, damage: 0, effect: "Armor does not help (except an APEsuit); can be defended. On a hit the victim is facehugged and broken." },
];

export const CHESTBURSTER_ATTACKS: CreatureAttack[] = [
  { roll: 1, rollTo: 3, name: "Escape", dice: 0, damage: 0, effect: "Flees two zones, into a vent or duct if it can; once out of sight it has escaped and stealth mode begins." },
  { roll: 4, name: "Terrorizing Hiss", dice: 0, damage: 0, effect: "The target makes a panic roll. An Imp instead mimics the target, with the same effect." },
  { roll: 5, name: "Leg Slash", dice: 6, damage: 2, armorPiercing: true, effect: "If it damages a human, the victim suffers an Impaled Thigh critical injury even if not broken." },
  { roll: 6, name: "Throat Bite", dice: 8, damage: 1, armorPiercing: true, effect: "Any damage triggers a panic roll." },
];

export const DRONE_SCOUT_STALKER_ATTACKS: CreatureAttack[] = [
  { roll: 1, name: "Hypnotizing Gaze", dice: 0, damage: 0, effect: "A victim at Short range is transfixed: +1 stress and a panic roll." },
  { roll: 2, name: "Playing With Its Prey", dice: 0, damage: 0, effect: "Victim knocked down and drops an item of the GM's choice, but takes no damage; panic roll." },
  { roll: 3, name: "Deadly Grab", dice: 8, damage: 1, effect: "On a hit the victim is dragged one zone (free move), drops an item and makes a panic roll." },
  { roll: 4, name: "Ready To Kill", dice: 10, damage: 1, effect: "On a hit the victim is grappled (CLOSE COMBAT vs its MOBILITY to break free) and allies in the zone panic. Headbite next turn." },
  { roll: 5, name: "Tail Spike", dice: 10, damage: 2, armorPiercing: true, effect: "Impales the victim with its tail." },
  { roll: 6, name: "Headbite", dice: 9, damage: 2, armorPiercing: true, effect: "Any damage kills a human outright; the GM may keep the victim barely alive for ovomorphing." },
];

export const SOLDIER_SENTRY_ATTACKS: CreatureAttack[] = [
  { roll: 1, name: "Call For Reinforcements", dice: 0, damage: 0, effect: "Another xenomorph appears in an adjacent zone, acting next round. PCs who can see it gain +1 stress." },
  { roll: 2, name: "Frenzy", dice: 0, damage: 1, effect: "Everyone in the zone is knocked prone, takes 1 damage and panics; a MOBILITY roll dodges all of it." },
  { roll: 3, name: "Talon Attack", dice: 12, damage: 1, armorPiercing: true, effect: "A wild slash with its talons." },
  { roll: 4, name: "Capture For The Hive", dice: 12, damage: 1, armorPiercing: true, effect: "Damage is capped at 1 and venom paralyzes: STAMINA successes are rounds before unconscious for a shift. MEDICAL AID wakes them." },
  { roll: 5, name: "Tail Spike", dice: 11, damage: 2, armorPiercing: true, effect: "Impales the victim with its tail." },
  { roll: 6, name: "Headbite", dice: 10, damage: 2, armorPiercing: true, effect: "Any damage kills a human outright." },
];

export const PRAETORIAN_CHARGER_QUEEN_ATTACKS: CreatureAttack[] = [
  { roll: 1, name: "Call The Guard", dice: 0, damage: 0, effect: "Summons D3 Sentries (Queen) or Soldiers (Praetorian, Charger); they arrive next round and draw initiative." },
  { roll: 2, name: "Frenzy", dice: 0, damage: 1, effect: "Everyone in the zone is knocked prone, takes 1 damage and panics; a MOBILITY roll dodges all of it." },
  { roll: 3, name: "Beastly Bite", dice: 10, damage: 1, armorPiercing: true, effect: "Any damage breaks a human automatically." },
  { roll: 4, name: "Charge", dice: 8, damage: "4 (2 for a Queen)", armorPiercing: true, effect: "Charger and Queen only; re-roll for a Praetorian. Can be dodged but not defended against." },
  { roll: 5, name: "Tail Spike", dice: 12, damage: 2, armorPiercing: true, effect: "Impales the victim with its tail." },
  { roll: 6, name: "Headbite", dice: 11, damage: 2, armorPiercing: true, effect: "Any damage kills a human outright." },
];

// ---------------------------------------------------------------------------
// Neomorph
// ---------------------------------------------------------------------------

export const BLOODBURSTER_ATTACKS: CreatureAttack[] = [
  { roll: 1, rollTo: 3, name: "Escape", dice: 0, damage: 0, effect: "Flees two zones in one action, into a duct if it can. Out of sight, stealth mode begins; after D6 stretches it is a juvenile." },
  { roll: 4, name: "Terrifying Hiss", dice: 0, damage: 0, effect: "Leaps onto the victim, who makes a panic roll." },
  { roll: 5, name: "Leg Bite", dice: 6, damage: 2, effect: "Any damage inflicts an Impaled Thigh critical injury even if not broken." },
  { roll: 6, name: "Throat Bite", dice: 8, damage: 1, armorPiercing: true, effect: "Any damage to a human triggers a panic roll." },
];

export const NEOMORPH_ATTACKS: CreatureAttack[] = [
  { roll: 1, name: "Terrifying Hiss", dice: 0, damage: 0, effect: "Leans in at Adjacent range; the victim makes a panic roll." },
  { roll: 2, name: "Tail Slash", dice: 10, damage: 2, effect: "Pivots and slashes with its tail." },
  { roll: 3, name: "Deadly Grab", dice: 8, damage: 1, effect: "On a hit the victim is dragged one zone (free move), drops an item and makes a panic roll." },
  { roll: 4, name: "Leaping Attack", dice: 8, damage: 1, effect: "On a hit the victim is thrown down and panics, then the Neomorph gets a free extra attack: ten base dice, damage 2." },
  { roll: 5, name: "Tail Spike", dice: 10, damage: 2, armorPiercing: true, effect: "Impales the victim with its tail." },
  { roll: 6, name: "Throat Bite", dice: 8, damage: 1, armorPiercing: true, effect: "Any damage kills a human outright." },
];

// ---------------------------------------------------------------------------
// Other extrasolar species
// ---------------------------------------------------------------------------

export const HARVESTER_ATTACKS: CreatureAttack[] = [
  { roll: 1, name: "Sonar Sweep", dice: 0, damage: 0, effect: "+1 to its next roll on this table (max 6). PCs within Long range gain +1 stress." },
  { roll: 2, name: "Sonar Pulse", dice: 0, damage: 0, effect: "Everyone within Short range rolls STAMINA (no action) or is stunned and loses their next turn." },
  { roll: 3, name: "Charge", dice: 6, damage: 3, armorPiercing: true, effect: "Rushes the biggest threat and carries on into the next zone; can be dodged, not defended against." },
  { roll: 4, name: "Stampede", dice: 8, damage: 2, effect: "Thrashes wildly: a crushing attack against everyone in the zone." },
  { roll: 5, name: "Burrowing Claws", dice: 10, damage: 2, armorPiercing: true, effect: "Leaps on a victim with its claws." },
  { roll: 6, name: "Pulverize", dice: 8, damage: 2, armorPiercing: true, effect: "Drags the victim into its grinding maw; any damage kills them." },
];

export const LION_WORM_ATTACKS: CreatureAttack[] = [
  { roll: 1, name: "Intimidating Display", dice: 0, damage: 0, effect: "A bluff: PCs within Short range panic, then it tries to leave combat. Its next attack gets +1 on this table (max 6)." },
  { roll: 2, name: "Playing With Its Prey", dice: 8, damage: 0, effect: "On a hit the target drops an item of the GM's choice and makes a panic roll, otherwise unhurt." },
  { roll: 3, name: "Acrid Pheromones", dice: 0, damage: 0, effect: "PCs within Short range roll STAMINA (no action) or lose their next turn." },
  { roll: 4, name: "Feral Rage", dice: 10, damage: 2, effect: "If it deals damage it immediately attacks again, with the same effect." },
  { roll: 5, name: "Crippling Attack", dice: 8, damage: 1, armorPiercing: true, effect: "Any damage breaks the victim automatically." },
  { roll: 6, name: "Death Roll", dice: 10, damage: 1, armorPiercing: true, effect: "On a hit the victim is grappled (CLOSE COMBAT vs its MOBILITY) and squeezed each turn: ten base dice, damage 1." },
];

export const SCORPIONID_ATTACKS: CreatureAttack[] = [
  { roll: 1, name: "Retreat", dice: 0, damage: 0, effect: "Decides the fight is not worth it and flees as fast as it can." },
  { roll: 2, name: "Pinned Down", dice: 10, damage: 1, effect: "On a hit the target drops an item and makes a panic roll." },
  { roll: 3, name: "Pincer Grab", dice: 8, damage: 1, effect: "On a hit the victim is grappled; if still held, an automatic Tail Strike follows. Underwater it also drags them a zone away to drown." },
  { roll: 4, name: "Flailing Strike", dice: 8, damage: 1, effect: "On a hit the victim is flung into the next zone, taking 1 more damage." },
  { roll: 5, name: "Tail Strike", dice: 10, damage: 1, armorPiercing: true, effect: "Any damage also poisons the victim: a disease with virulence -2." },
  { roll: 6, name: "Immobilize", dice: 8, damage: 2, effect: "Goes for the legs; any damage inflicts an Impaled Thigh critical injury even if not broken." },
];

export const SWARM_ATTACKS: CreatureAttack[] = [
  { roll: 1, name: "Consume", dice: 0, damage: 0, effect: "The Swarm feeds and regains 2 Health." },
  { roll: 2, name: "Pheromones", dice: 0, damage: 0, effect: "The Swarm grows agitated: its next roll on this table gets +1." },
  { roll: 3, name: "Suffocating Swarm", dice: 0, damage: 0, effect: "Everyone inside rolls STAMINA or loses their next turn; next turn it strips one victim to the bone." },
  { roll: 4, name: "Desperate Hunger", dice: 8, damage: 1, effect: "Attacks everyone inside wearing armor; damage comes off the armor level. The unarmored only lose their clothes." },
  { roll: 5, name: "Feeding Frenzy", dice: 6, damage: 1, armorPiercing: true, effect: "Attacks every character inside the Swarm." },
  { roll: 6, name: "Stripped To The Bone", dice: 12, damage: 1, armorPiercing: true, effect: "One target; while it deals damage it attacks them again each turn until it fails, they die, are rescued or it is driven off." },
];

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export const facehuggerAttacks = attackTable("facehugger", "Facehugger Attacks", 213, FACEHUGGER_ATTACKS, "Facehugger, Praeto-Facehugger and Royal Facehugger. Modifiers from earlier rows can push the roll past 6.");
export const chestbursterAttacks = attackTable("chestburster", "Chestburster Attacks", 216, CHESTBURSTER_ATTACKS, "All Stage III forms: Chestburster, Bambi Burster, Imp and Queen Burster.");
export const droneAttacks = attackTable("drone", "Drone, Scout & Stalker Attacks", 217, DRONE_SCOUT_STALKER_ATTACKS);
export const soldierAttacks = attackTable("soldier", "Soldier & Sentry Attacks", 218, SOLDIER_SENTRY_ATTACKS);
export const queenAttacks = attackTable("queen", "Praetorian, Charger & Queen Attacks", 221, PRAETORIAN_CHARGER_QUEEN_ATTACKS);
export const bloodbursterAttacks = attackTable("neomorph-bloodburster", "Neomorphic Bloodburster Attacks", 224, BLOODBURSTER_ATTACKS);
export const neomorphAttacks = attackTable("neomorph-adult", "Neomorph Attacks", 225, NEOMORPH_ATTACKS, "Neophyte (juvenile) and adult Neomorph.");
export const harvesterAttacks = attackTable("harvester", "Harvester Attacks", 228, HARVESTER_ATTACKS);
export const lionWormAttacks = attackTable("lion-worm", "Lion Worm Attacks", 229, LION_WORM_ATTACKS);
export const scorpionidAttacks = attackTable("tanakan-scorpionid", "Tanakan Scorpionid Attacks", 230, SCORPIONID_ATTACKS);
export const swarmAttacks = attackTable("swarm", "Swarm Attacks", 231, SWARM_ATTACKS);

export const brokenXenomorph: RollTable = {
  id: "alien.creatures.broken-xenomorph",
  name: "Broken Xenomorph",
  family: FAMILY,
  page: 208,
  dice: "1d6",
  notes: "Roll when a xenomorph drops to zero Health. Not for Facehuggers or Chestbursters (they are destroyed), and skipped in Aliens mode, where it simply dies.",
  rows: [
    { range: [1, 1], label: "Rise Again", result: { outcome: "rise-again", dead: false, effect: "Drops as if dead, but it is a ruse: next turn it regains 1 Health and rises." } },
    { range: [2, 2], label: "Wounded", result: { outcome: "wounded", dead: false, effect: "Speed -1 (minimum 1), regains 1 Health. At the start of each of its turns, on D6 1-3 it tries to leave combat." } },
    { range: [3, 3], label: "Desperate Escape", result: { outcome: "desperate-escape", dead: false, effect: "Regains 1 Health and at once moves two zones to flee, outside turn order. If that fails it fights on." } },
    { range: [4, 4], label: "Last Breath", result: { outcome: "last-breath", dead: false, effect: "Makes one more signature attack on its next turn, then dies. Any further wound kills it instantly." } },
    { range: [5, 6], label: "Torn Apart", result: { outcome: "torn-apart", dead: true, effect: "Instant death." } },
  ],
};

export const creatureTables: RollTable[] = [
  facehuggerAttacks,
  chestbursterAttacks,
  droneAttacks,
  soldierAttacks,
  queenAttacks,
  bloodbursterAttacks,
  neomorphAttacks,
  harvesterAttacks,
  lionWormAttacks,
  scorpionidAttacks,
  swarmAttacks,
  brokenXenomorph,
];
