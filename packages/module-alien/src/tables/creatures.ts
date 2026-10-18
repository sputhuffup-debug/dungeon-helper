/**
 * Creature tables (p. 208, 213): one signature-attack table per variant,
 * the broken xenomorph table and facehugger swarm size. Attack rows carry
 * `{ name, dice, damage, armorPiercing, effect }`. Values are unverified
 * approximations from general knowledge of the game.
 */
import type { RollTable } from "@campaign-forge/module-sdk";
import { d6, defineTable } from "./_helpers";

const FAMILY = "creatures";

interface Attack {
  name: string;
  dice: number;
  damage: number | string;
  armorPiercing?: boolean;
  effect: string;
}

function attackTable(variant: string, name: string, page: number, attacks: Attack[]): RollTable {
  return defineTable({
    id: `alien.creatures.attack.${variant}`,
    name: `${name}: signature attacks`,
    family: FAMILY,
    page,
    dice: "1d6",
    tags: ["attack", variant],
    rows: d6(
      attacks.map((a, i) => ({
        label: a.name,
        result: { roll: i + 1, name: a.name, dice: a.dice, damage: a.damage, armorPiercing: a.armorPiercing === true, effect: a.effect },
      })),
    ),
  });
}

export const facehuggerAttacks = attackTable("facehugger", "Facehugger", 213, [
  { name: "Hiss and scuttle", dice: 0, damage: 0, effect: "No attack; moves to a hiding place. Panic Roll for the nearest victim." },
  { name: "Leap, missed", dice: 0, damage: 0, effect: "Leaps at a victim but misses; victim makes a Panic Roll." },
  { name: "Tail grab", dice: 6, damage: 1, effect: "Wraps the tail around the throat; victim is grappled." },
  { name: "Leap and latch", dice: 8, damage: 0, effect: "Latches onto the face; victim starts suffocating." },
  { name: "Latch and implant", dice: 10, damage: 0, effect: "Latches on and implants an embryo unless removed within a shift." },
  { name: "Death grip", dice: 12, damage: 1, effect: "Latches on; any attempt to remove it harms the victim." },
]);

export const chestbursterAttacks = attackTable("chestburster", "Chestburster", 213, [
  { name: "Flee", dice: 0, damage: 0, effect: "Runs for the nearest vent and disappears." },
  { name: "Hide", dice: 0, damage: 0, effect: "Hides nearby; found on an Observation roll." },
  { name: "Nip", dice: 4, damage: 1, effect: "Bites and scurries away." },
  { name: "Lunge", dice: 5, damage: 1, effect: "Bites a limb; victim makes a Panic Roll." },
  { name: "Fast bite", dice: 6, damage: 2, effect: "Tears into flesh before escaping." },
  { name: "Burrow", dice: 8, damage: 2, armorPiercing: true, effect: "Burrows into the victim; horrifying. Everyone nearby makes a Panic Roll." },
]);

const DRONE_ATTACKS: Attack[] = [
  { name: "Lurking horror", dice: 0, damage: 0, effect: "Stays hidden; everyone who can see it makes a Panic Roll." },
  { name: "Tail hook", dice: 6, damage: 1, armorPiercing: true, effect: "Tail strike; victim is pulled toward the creature." },
  { name: "Claws", dice: 8, damage: 1, effect: "Slashes with both claws." },
  { name: "Grab and drag", dice: 9, damage: 1, effect: "Grabs the victim and drags them away toward the hive." },
  { name: "Headbite, glancing", dice: 10, damage: 2, armorPiercing: true, effect: "Inner jaw strike; armor is pierced." },
  { name: "Headbite", dice: 12, damage: 3, armorPiercing: true, effect: "The inner jaw punches through the skull; usually fatal." },
];

export const droneAttacks = attackTable("drone", "Xenomorph drone", 213, DRONE_ATTACKS);

export const workerAttacks = attackTable("worker", "Xenomorph worker", 213, [
  { name: "Hiss and retreat", dice: 0, damage: 0, effect: "Backs off toward the hive; nearest victim makes a Panic Roll." },
  { name: "Tail lash", dice: 5, damage: 1, effect: "Sweeps with the tail." },
  { name: "Claws", dice: 7, damage: 1, effect: "Slashes with both claws." },
  { name: "Grab", dice: 8, damage: 1, effect: "Grabs the victim for cocooning." },
  { name: "Drag away", dice: 9, damage: 1, effect: "Drags the victim toward the hive." },
  { name: "Headbite", dice: 10, damage: 2, armorPiercing: true, effect: "Inner jaw strike." },
]);

export const soldierAttacks = attackTable("soldier", "Xenomorph soldier", 213, [
  { name: "Lurking horror", dice: 0, damage: 0, effect: "Stays hidden; everyone who can see it makes a Panic Roll." },
  { name: "Tail impale", dice: 8, damage: 2, armorPiercing: true, effect: "Tail spike through the body." },
  { name: "Claws", dice: 10, damage: 2, effect: "Slashes with both claws." },
  { name: "Pounce", dice: 10, damage: 2, effect: "Leaps onto the victim, who is knocked down." },
  { name: "Acid spray", dice: 8, damage: 2, armorPiercing: true, effect: "Spits acid; also damages armor." },
  { name: "Headbite", dice: 14, damage: 3, armorPiercing: true, effect: "The inner jaw punches through the skull; usually fatal." },
]);

export const queenAttacks = attackTable("queen", "Xenomorph queen", 213, [
  { name: "Shriek", dice: 0, damage: 0, effect: "A deafening scream; everyone nearby makes a Panic Roll." },
  { name: "Tail sweep", dice: 10, damage: 2, effect: "Sweeps the tail across a zone; all in it are hit." },
  { name: "Crushing claws", dice: 12, damage: 3, effect: "Grabs and crushes a victim." },
  { name: "Trample", dice: 12, damage: 2, effect: "Charges through a zone; everyone in it is knocked down." },
  { name: "Impale", dice: 14, damage: 3, armorPiercing: true, effect: "Spears a victim on the tail and lifts them." },
  { name: "Headbite", dice: 16, damage: 4, armorPiercing: true, effect: "The inner jaw punches through the skull; usually fatal." },
]);

export const bloodbursterAttacks = attackTable("neomorph-bloodburster", "Neomorph bloodburster", 213, [
  { name: "Flee", dice: 0, damage: 0, effect: "Scurries away to hide and grow." },
  { name: "Hide", dice: 0, damage: 0, effect: "Hides nearby; found on an Observation roll." },
  { name: "Bite", dice: 5, damage: 1, effect: "A quick bite before retreating." },
  { name: "Slash", dice: 6, damage: 1, effect: "Lashes out with tiny claws." },
  { name: "Frenzy", dice: 7, damage: 2, effect: "Attacks wildly; victim makes a Panic Roll." },
  { name: "Burst out", dice: 8, damage: 2, armorPiercing: true, effect: "Erupts from a host; everyone nearby makes a Panic Roll." },
]);

export const sprinterAttacks = attackTable("neomorph-sprinter", "Neomorph sprinter", 213, [
  { name: "Circle", dice: 0, damage: 0, effect: "Circles the prey at speed; victim makes a Panic Roll." },
  { name: "Bite", dice: 7, damage: 1, effect: "A fast bite." },
  { name: "Slashing claws", dice: 8, damage: 1, effect: "Slashes while running past." },
  { name: "Pounce", dice: 9, damage: 2, effect: "Leaps onto the victim, who is knocked down." },
  { name: "Tear", dice: 10, damage: 2, armorPiercing: true, effect: "Tears at an exposed limb." },
  { name: "Throat bite", dice: 12, damage: 3, armorPiercing: true, effect: "Rips out the throat; usually fatal." },
]);

export const neomorphAdultAttacks = attackTable("neomorph-adult", "Neomorph adult", 213, [
  { name: "Stalk", dice: 0, damage: 0, effect: "Stays hidden; everyone who can see it makes a Panic Roll." },
  { name: "Tail lash", dice: 8, damage: 2, effect: "Sweeps with the tail." },
  { name: "Claws", dice: 10, damage: 2, effect: "Slashes with both claws." },
  { name: "Pounce", dice: 10, damage: 2, effect: "Leaps onto the victim, who is knocked down." },
  { name: "Rend", dice: 12, damage: 3, armorPiercing: true, effect: "Tears the victim apart." },
  { name: "Headbite", dice: 14, damage: 3, armorPiercing: true, effect: "The inner jaw punches through the skull; usually fatal." },
]);

export const brokenXenomorph: RollTable = defineTable({
  id: "alien.creatures.broken-xenomorph",
  name: "Broken xenomorph",
  family: FAMILY,
  page: 208,
  dice: "1d6",
  notes: "Roll when a xenomorph's Health reaches zero. Acid splash hits the attacker at engaged range.",
  rows: d6([
    { label: "Stunned", result: { outcome: "stunned", effect: "Down for one round, then back up with 1 Health.", dead: false } },
    { label: "Wounded", result: { outcome: "wounded", effect: "Back up next round at half speed.", dead: false } },
    { label: "Retreats", result: { outcome: "retreats", effect: "Flees to the hive to recover.", dead: false } },
    { label: "Plays dead", result: { outcome: "plays-dead", effect: "Lies still, attacks when approached.", dead: false } },
    { label: "Dying", result: { outcome: "dying", effect: "Thrashes for a round, spraying acid, then dies.", dead: true } },
    { label: "Dead", result: { outcome: "dead", effect: "Dead; acid splash on anyone engaged.", dead: true } },
  ]),
});

export const facehuggerSwarm: RollTable = defineTable({
  id: "alien.creatures.facehugger-swarm",
  name: "Facehugger swarm size",
  family: FAMILY,
  page: 213,
  dice: "1d6",
  notes: "How many facehuggers are in a disturbed egg chamber.",
  rows: d6([
    { label: "One", result: { swarmSize: 1 } },
    { label: "Two", result: { swarmSize: 2 } },
    { label: "Three", result: { swarmSize: 3 } },
    { label: "Four", result: { swarmSize: 4 } },
    { label: "Six", result: { swarmSize: 6 } },
    { label: "Eight", result: { swarmSize: 8 } },
  ]),
});

export const creatureTables: RollTable[] = [
  facehuggerAttacks,
  chestbursterAttacks,
  droneAttacks,
  workerAttacks,
  soldierAttacks,
  queenAttacks,
  bloodbursterAttacks,
  sprinterAttacks,
  neomorphAdultAttacks,
  brokenXenomorph,
  facehuggerSwarm,
];
