import type { PageRef } from "@campaign-forge/module-sdk";
import type { AlienPreset } from "./types";
import {
  BLOODBURSTER_ATTACKS,
  CHESTBURSTER_ATTACKS,
  DRONE_SCOUT_STALKER_ATTACKS,
  FACEHUGGER_ATTACKS,
  HARVESTER_ATTACKS,
  LION_WORM_ATTACKS,
  NEOMORPH_ATTACKS,
  PRAETORIAN_CHARGER_QUEEN_ATTACKS,
  SCORPIONID_ATTACKS,
  SOLDIER_SENTRY_ATTACKS,
  SWARM_ATTACKS,
  type CreatureAttack,
} from "../tables/creatures";

/**
 * Creature stat blocks (Evolved Edition chapter 10, p. 204-231).
 *
 * Checked against the book: names, stages, Speed, Health, MOBILITY,
 * OBSERVATION, Armor Level (with its conditional value in `armorNotes` and
 * `armorVsFire`), Acid Splash and the signature attack rows are the book's.
 * Abilities, lifecycle and containment notes are short paraphrases.
 *
 * Stat fields are only set where the book gives them: eggs have no skills,
 * the Harvester has no OBSERVATION, the Swarm has no skills and no numeric
 * armor. Creatures with no attack table in the book (eggs, Worker) carry an
 * empty `attacks` list.
 *
 * Still unverified (book gap, kept as a module decision): the Stage VII+
 * records. The book only mentions Empress, Queen Mother, Palantine and King
 * forms as rumor (p. 220-221) and gives no stats, so they stay lore-only.
 */

interface Ability {
  name: string;
  text: string;
  page?: PageRef;
}

interface CreatureSpec {
  id: string;
  name: string;
  summary: string;
  page: PageRef;
  species: string;
  stage: string;
  variant?: string;
  speed?: number;
  health?: number;
  mobility?: number;
  observation?: number;
  armor?: number;
  armorVsFire?: number;
  armorNotes?: string;
  acidSplash?: number;
  attackTable?: string;
  attacks?: CreatureAttack[];
  abilities?: Ability[];
  lifecycleTrigger?: string;
  containment?: string;
  loreOnly?: boolean;
  /** Book gap: keep `unverified: true` on this record. */
  unverified?: boolean;
  extraFields?: Record<string, unknown>;
  tags?: string[];
}

function creature(spec: CreatureSpec): AlienPreset {
  const { id, name, summary, page, loreOnly, unverified, tags = [], extraFields = {}, ...rest } = spec;
  const fields: Record<string, unknown> = {
    species: rest.species,
    stage: rest.stage,
  };
  if (rest.variant) fields.variant = rest.variant;
  if (loreOnly) {
    fields.loreOnly = true;
  } else {
    for (const key of ["speed", "health", "mobility", "observation", "armor", "armorVsFire"] as const) {
      if (rest[key] !== undefined) fields[key] = rest[key];
    }
    if (rest.attackTable) fields.attackTable = `alien.creatures.attack.${rest.attackTable}`;
    fields.attacks = (rest.attacks ?? []).map((a) => ({ ...a, armorPiercing: a.armorPiercing === true }));
  }
  if (rest.armorNotes) fields.armorNotes = rest.armorNotes;
  if (rest.acidSplash !== undefined) fields.acidSplash = rest.acidSplash;
  fields.abilities = rest.abilities ?? [];
  if (rest.lifecycleTrigger) fields.lifecycleTrigger = rest.lifecycleTrigger;
  if (rest.containment) fields.containment = rest.containment;
  Object.assign(fields, extraFields);
  return {
    id: `alien.creature.${id}`,
    entityType: "alien.creature",
    name,
    summary,
    page,
    tags: ["creature", `species:${rest.species}`, ...(loreOnly ? ["lore-only"] : []), ...tags],
    fields,
    ...(unverified ? { unverified: true } : {}),
  };
}

/** "2 (1 vs fire)" style armor: the rating, the fire rating and the book's note. */
function armor(level: number, vsFire?: number): Pick<CreatureSpec, "armor" | "armorVsFire" | "armorNotes"> {
  return vsFire === undefined ? { armor: level } : { armor: level, armorVsFire: vsFire, armorNotes: `${vsFire} vs fire` };
}

// ---------------------------------------------------------------------------
// Xenomorph XX121 (p. 208-221)
// ---------------------------------------------------------------------------

const XX121 = "xx121";

/** Special abilities common to every variety of Xenomorph XX121 (p. 210). */
const XX121_COMMON: Ability[] = [
  { name: "Acid Splash", text: "Non-fire damage sprays acid on everyone Adjacent and the floor: base dice = Acid Splash rating + damage taken (at most its maximum Health), damage 1, eating 1 armor per damage. Repeats each round at half the dice until it does no damage.", page: 210 },
  { name: "Immunity To Cold & Vacuum", text: "Unharmed by cold or vacuum, and does not seem to need to breathe.", page: 210 },
  { name: "Radiation", text: "Radiation counts as two levels weaker: extreme acts as weak, weak and strong do nothing.", page: 210 },
  { name: "Darkness", text: "Darkness does not hinder it in stealth mode.", page: 210 },
];

const OPENING_THE_EGG: Ability = {
  name: "Opening The Egg",
  text: "While any possible host other than an android is at Short range, roll a stress die each round: the facehugger result releases a facehugger. At Adjacent range, a MOBILITY roll (no action) each turn or it opens.",
  page: 212,
};

const FACEHUGGING: Ability = {
  name: "Facehugging",
  text: "Automatically facehugs an immobilized host within Adjacent range; in combat, attack #6 does it. The host is out cold until it drops off dead a shift later.",
  page: [213, 214],
};

const FACEHUGGER_REMOVAL: Ability = {
  name: "Removal",
  text: "Pulling it off kills the host unless it is first frozen: one stretch with the right gear and a HEAVY MACHINERY roll. Each stretch, a stress die facehugger result means insemination is done.",
  page: 214,
};

const BLIND_HUNTER: Ability = {
  name: "Blind Hunter",
  text: "Tracks by sound and heat. PCs who win an OBSERVATION roll in stealth mode can stay in its zone a turn unnoticed; near body temperature it gets -2 OBSERVATION dice.",
  page: 214,
};

const DESTROYED_AT_ZERO: Ability = {
  name: "Destroyed At Zero Health",
  text: "Facehuggers and Chestbursters do not roll on the broken xenomorph table: at zero Health they are destroyed.",
  page: 209,
};

const BIRTH: Ability = {
  name: "Birth",
  text: "Bursting out kills the host. It shrieks and sprays blood; first-time witnesses make a panic roll.",
  page: 216,
};

const SILENT_ASSASSIN: Ability = { name: "Silent Assassin", text: "OBSERVATION rolls to spot it in stealth mode get -2 dice.", page: 217 };

const OVOMORPHING: Ability = {
  name: "Ovomorphing",
  text: "Cut off from a hive, it cocoons captured hosts in resin and turns them into eggs over 24-36 hours (four to six shifts).",
  page: 212,
};

const STAGE_IV_CONTAINMENT = "Independent and hard to kill. Stalkers and Scouts can be lured into hazards; Drones keep a routine and sleep somewhere warm, such as near a reactor.";
const STAGE_V_CONTAINMENT = "Fire keeps them back. Workers barely resist; a Soldier's carapace stops ordinary rounds but not pulse fire, and Soldiers come in groups. Sentries stay in the inner hive.";
const STAGE_VI_CONTAINMENT = "A charging Charger's head shield is nearly impervious, its body only Soldier-grade: use explosives or heavy weapons. Killing a Praetorian briefly disorients its Soldiers. Avoid the Queen.";

const xx121Presets: AlienPreset[] = [
  creature({
    id: "xx121-ovomorph",
    name: "Ovomorph (Egg)",
    summary: "Stage I. A leathery egg holding a facehugger, laid by a Queen or made from a cocooned host.",
    page: 212,
    species: XX121,
    stage: "I",
    variant: "egg",
    speed: 0,
    health: 2,
    ...armor(0),
    acidSplash: 4,
    abilities: [OPENING_THE_EGG, ...XX121_COMMON],
    lifecycleTrigger: "Releases its facehugger when a potential host comes near.",
    containment: "Fire or explosives sterilize eggs, though they burst with acid. Extreme cold makes an egg dormant.",
  }),
  creature({
    id: "xx121-queens-egg",
    name: "The Queen's Egg",
    summary: "Stage I. An egg laid by a Queen: hardier than one made by ovomorphing.",
    page: 212,
    species: XX121,
    stage: "I",
    variant: "queens-egg",
    speed: 0,
    health: 3,
    ...armor(1, 0),
    acidSplash: 5,
    abilities: [OPENING_THE_EGG, ...XX121_COMMON],
    lifecycleTrigger: "Releases its facehugger when a potential host comes near.",
    containment: "Fire or explosives sterilize eggs, though they burst with acid. Extreme cold makes an egg dormant.",
  }),
  creature({
    id: "xx121-facehugger",
    name: "Facehugger",
    summary: "Stage II. The parasite that leaps onto a host's face and inseminates it.",
    page: [212, 214],
    species: XX121,
    stage: "II",
    variant: "facehugger",
    speed: 2,
    health: 2,
    mobility: 8,
    observation: 7,
    ...armor(1, 0),
    acidSplash: 4,
    attackTable: "facehugger",
    attacks: FACEHUGGER_ATTACKS,
    abilities: [
      FACEHUGGING,
      FACEHUGGER_REMOVAL,
      BLIND_HUNTER,
      { name: "Facehugger Swarms", text: "Several in one zone act as a Swarm with Speed by number: 1-2 Speed 2, 3-5 Speed 3, 6-10 Speed 4, 11-20 Speed 5, 21+ Speed 6. Each must be killed separately.", page: 213 },
      DESTROYED_AT_ZERO,
      ...XX121_COMMON,
    ],
    lifecycleTrigger: "Dies and falls off one shift after facehugging; a Chestburster is born one shift later.",
    containment: "Its skin shrugs off most melee attacks but not pulse rounds, laser tools or fire.",
    extraFields: {
      swarmSpeed: [
        { min: 1, max: 2, speed: 2 },
        { min: 3, max: 5, speed: 3 },
        { min: 6, max: 10, speed: 4 },
        { min: 11, max: 20, speed: 5 },
        { min: 21, speed: 6 },
      ],
    },
  }),
  creature({
    id: "xx121-praeto-facehugger",
    name: "Praeto-Facehugger",
    summary: "Stage II. A slightly larger, less dexterous facehugger carrying a Praetomorph seed.",
    page: [212, 213],
    species: XX121,
    stage: "II",
    variant: "praeto-facehugger",
    speed: 2,
    health: 2,
    mobility: 6,
    observation: 7,
    ...armor(1, 0),
    acidSplash: 4,
    attackTable: "facehugger",
    attacks: FACEHUGGER_ATTACKS,
    abilities: [FACEHUGGING, FACEHUGGER_REMOVAL, BLIND_HUNTER, DESTROYED_AT_ZERO, ...XX121_COMMON],
    lifecycleTrigger: "Its host gives birth to an Imp, the Praetomorph Stage III.",
    containment: "Its skin shrugs off most melee attacks but not pulse rounds, laser tools or fire.",
    tags: ["praetomorph"],
  }),
  creature({
    id: "xx121-royal-facehugger",
    name: "Royal Facehugger",
    summary: "Stage II. A larger, armored facehugger that seeds a Queen.",
    page: [212, 213],
    species: XX121,
    stage: "II",
    variant: "royal",
    speed: 2,
    health: 3,
    mobility: 8,
    observation: 8,
    ...armor(2, 1),
    acidSplash: 5,
    attackTable: "facehugger",
    attacks: FACEHUGGER_ATTACKS,
    abilities: [
      { name: "Two Spores", text: "Thought to carry two spores: one Queen and one protector for the newborn royal.", page: 213 },
      FACEHUGGING,
      FACEHUGGER_REMOVAL,
      BLIND_HUNTER,
      DESTROYED_AT_ZERO,
      ...XX121_COMMON,
    ],
    lifecycleTrigger: "Its host gives birth to a Queen Burster.",
    containment: "Its skin shrugs off most melee attacks but not pulse rounds, laser tools or fire.",
  }),
  creature({
    id: "xx121-chestburster",
    name: "Chestburster",
    summary: "Stage III. The snake-like newborn that erupts from its host's chest.",
    page: [215, 216],
    species: XX121,
    stage: "III",
    variant: "chestburster",
    speed: 2,
    health: 2,
    mobility: 8,
    observation: 4,
    ...armor(0),
    acidSplash: 4,
    attackTable: "chestburster",
    attacks: CHESTBURSTER_ATTACKS,
    abilities: [BIRTH, DESTROYED_AT_ZERO, ...XX121_COMMON],
    lifecycleTrigger: "Hides and eats metals and food; within one shift it molts into Stage IV.",
    containment: "Surgery has never removed an embryo without killing the patient. Once born it is easy to kill, if it can be caught.",
  }),
  creature({
    id: "xx121-bambi-burster",
    name: "Bambi Burster",
    summary: "Stage III. A fawn-like burster from a four-legged host, very fast on spindly legs.",
    page: [215, 216],
    species: XX121,
    stage: "III",
    variant: "bambi-burster",
    speed: 2,
    health: 2,
    mobility: 10,
    observation: 4,
    ...armor(0),
    acidSplash: 4,
    attackTable: "chestburster",
    attacks: CHESTBURSTER_ATTACKS,
    abilities: [BIRTH, DESTROYED_AT_ZERO, ...XX121_COMMON],
    lifecycleTrigger: "Hides and feeds; within one shift it molts into Stage IV.",
    containment: "Easy to kill once born, if it can be caught.",
  }),
  creature({
    id: "xx121-imp",
    name: "Imp",
    summary: "Stage III. The immature Praetomorph: a miniature of its adult form that mimics others.",
    page: 216,
    species: XX121,
    stage: "III",
    variant: "imp",
    speed: 2,
    health: 2,
    mobility: 8,
    observation: 6,
    ...armor(0),
    acidSplash: 4,
    attackTable: "chestburster",
    attacks: CHESTBURSTER_ATTACKS,
    abilities: [
      { name: "Mimicry", text: "If not threatened on emerging it may copy the actions of the nearest creature.", page: 216 },
      BIRTH,
      DESTROYED_AT_ZERO,
      ...XX121_COMMON,
    ],
    lifecycleTrigger: "Matures much faster than a Chestburster; grows into a Stalker.",
    containment: "Easy to kill once born, if it can be caught.",
    tags: ["praetomorph"],
  }),
  creature({
    id: "xx121-queen-burster",
    name: "Queen Burster",
    summary: "Stage III. An embryonic Queen, gestated over days and born with crest, arms and legs.",
    page: 216,
    species: XX121,
    stage: "III",
    variant: "queen-burster",
    speed: 2,
    health: 3,
    mobility: 8,
    observation: 8,
    ...armor(1, 0),
    acidSplash: 5,
    attackTable: "chestburster",
    attacks: CHESTBURSTER_ATTACKS,
    abilities: [BIRTH, DESTROYED_AT_ZERO, ...XX121_COMMON],
    lifecycleTrigger: "Gestates over days rather than hours before bursting out.",
    containment: "Easy to kill once born, if it can be caught.",
  }),
  creature({
    id: "xx121-drone",
    name: "Drone",
    summary: "Stage IV. The stealthy ambush hunter outside the hive mind; the Nostromo's creature.",
    page: 217,
    species: XX121,
    stage: "IV",
    variant: "drone",
    speed: 2,
    health: 7,
    mobility: 8,
    observation: 8,
    ...armor(2, 1),
    acidSplash: 8,
    attackTable: "drone",
    attacks: DRONE_SCOUT_STALKER_ATTACKS,
    abilities: [SILENT_ASSASSIN, OVOMORPHING, ...XX121_COMMON],
    lifecycleTrigger: "Stays at Stage IV until a Queen's pheromones make it molt into a Worker or Soldier.",
    containment: STAGE_IV_CONTAINMENT,
  }),
  creature({
    id: "xx121-scout",
    name: "Scout",
    summary: "Stage IV. A fast, four-legged runner that finds hosts for the hive; the Fiorina 161 creature.",
    page: [217, 218],
    species: XX121,
    stage: "IV",
    variant: "scout",
    speed: 2,
    health: 5,
    mobility: 10,
    observation: 10,
    ...armor(2, 1),
    acidSplash: 8,
    attackTable: "drone",
    attacks: DRONE_SCOUT_STALKER_ATTACKS,
    abilities: [OVOMORPHING, ...XX121_COMMON],
    lifecycleTrigger: "Once a Queen is born and the hive is secure, it matures into a Sentry.",
    containment: STAGE_IV_CONTAINMENT,
  }),
  creature({
    id: "xx121-stalker",
    name: "Stalker",
    summary: "Stage IV. The aggressive adult Praetomorph: bigger, tougher, more fire resistant, less clever.",
    page: [217, 218],
    species: XX121,
    stage: "IV",
    variant: "stalker",
    speed: 2,
    health: 9,
    mobility: 9,
    observation: 6,
    ...armor(2),
    acidSplash: 8,
    attackTable: "drone",
    attacks: DRONE_SCOUT_STALKER_ATTACKS,
    abilities: [
      { name: "Feral Hunger", text: "After any attack that deals damage, it attacks the same target again as a free action: eight base dice, damage 1.", page: 218 },
      ...XX121_COMMON,
    ],
    lifecycleTrigger: "An evolutionary dead end: no Stalker has been seen to molt further.",
    containment: STAGE_IV_CONTAINMENT,
    tags: ["praetomorph"],
  }),
  creature({
    id: "xx121-soldier",
    name: "Soldier",
    summary: "Stage V. The armored adult Drone that attacks in numbers and carries prey back to the hive.",
    page: [218, 219],
    species: XX121,
    stage: "V",
    variant: "soldier",
    speed: 2,
    health: 8,
    mobility: 8,
    observation: 8,
    ...armor(2, 1),
    acidSplash: 10,
    attackTable: "soldier",
    attacks: SOLDIER_SENTRY_ATTACKS,
    abilities: [...XX121_COMMON],
    lifecycleTrigger: "Fed royal jelly by the Queen's Workers, it becomes a Praetorian.",
    containment: STAGE_V_CONTAINMENT,
  }),
  creature({
    id: "xx121-worker",
    name: "Worker",
    summary: "Stage V. A small, pale builder that spins resin, places eggs and tends the Queen.",
    page: 219,
    species: XX121,
    stage: "V",
    variant: "worker",
    speed: 1,
    health: 4,
    mobility: 4,
    observation: 4,
    ...armor(1, 0),
    acidSplash: 6,
    abilities: [
      { name: "Non-Combatant", text: "Ignores threats inside the hive and runs if threatened, leaving defense to Soldiers and Sentries. The book gives it no attack table.", page: 219 },
      ...XX121_COMMON,
    ],
    lifecycleTrigger: "Molts from a Drone when the hive needs builders.",
    containment: STAGE_V_CONTAINMENT,
  }),
  creature({
    id: "xx121-sentry",
    name: "Sentry",
    summary: "Stage V. The matured Scout: an armored wall-climber that guards the Queen to the death.",
    page: 219,
    species: XX121,
    stage: "V",
    variant: "sentry",
    speed: 2,
    health: 8,
    mobility: 12,
    observation: 10,
    ...armor(2, 1),
    acidSplash: 10,
    attackTable: "soldier",
    attacks: SOLDIER_SENTRY_ATTACKS,
    abilities: [...XX121_COMMON],
    lifecycleTrigger: "Fed royal jelly and raw metals for weeks, it becomes a Charger.",
    containment: STAGE_V_CONTAINMENT,
  }),
  creature({
    id: "xx121-praetorian",
    name: "Praetorian",
    summary: "Stage VI. The Queen's royal guard, twice a Soldier's height with a crested head.",
    page: [219, 221],
    species: XX121,
    stage: "VI",
    variant: "praetorian",
    speed: 2,
    health: 12,
    mobility: 5,
    observation: 8,
    ...armor(3, 1),
    acidSplash: 10,
    attackTable: "queen",
    attacks: PRAETORIAN_CHARGER_QUEEN_ATTACKS,
    abilities: [...XX121_COMMON],
    lifecycleTrigger: "If the hive loses its Queen, a Praetorian may molt into a new one.",
    containment: STAGE_VI_CONTAINMENT,
  }),
  creature({
    id: "xx121-charger",
    name: "Charger (Crusher)",
    summary: "Stage VI. A four-legged living battering ram with a huge armored crest.",
    page: [219, 221],
    species: XX121,
    stage: "VI",
    variant: "charger",
    speed: 1,
    health: 20,
    mobility: 4,
    observation: 5,
    armor: 5,
    armorVsFire: 3,
    armorNotes: "5 (3 vs fire) against attacks to the front, 3 (1 vs fire) otherwise, at the GM's discretion",
    acidSplash: 10,
    attackTable: "queen",
    attacks: PRAETORIAN_CHARGER_QUEEN_ATTACKS,
    abilities: [
      { name: "Head Shield", text: "The higher armor applies to attacks from the front. It climbs and jumps poorly.", page: [219, 220] },
      ...XX121_COMMON,
    ],
    lifecycleTrigger: "Terminal form; only found in long-established hives.",
    containment: STAGE_VI_CONTAINMENT,
  }),
  creature({
    id: "xx121-queen",
    name: "Queen",
    summary: "Stage VI. The six-meter mother of the hive, laying eggs from a vast egg sac.",
    page: [220, 221],
    species: XX121,
    stage: "VI",
    variant: "queen",
    speed: 2,
    health: 18,
    mobility: 6,
    observation: 12,
    ...armor(4, 2),
    acidSplash: 10,
    attackTable: "queen",
    attacks: PRAETORIAN_CHARGER_QUEEN_ATTACKS,
    abilities: [
      { name: "Egg Sac", text: "MOBILITY is zero while she is attached to the egg cocoon.", page: 220 },
      ...XX121_COMMON,
    ],
    lifecycleTrigger: "Lays eggs en masse once fertile; may keep growing with her hive (Stage VII rumors).",
    containment: STAGE_VI_CONTAINMENT,
  }),
  creature({
    id: "xx121-empress",
    name: "Empress / Queen Mother (Stage VII)",
    summary: "Rumored giant Queens ruling several Queens and hives. No stats; lore only.",
    page: [220, 221],
    species: XX121,
    stage: "VII",
    loreOnly: true,
    unverified: true,
    abilities: [{ name: "Lore", text: "The book treats these stages as unconfirmed rumor. Use as a plot device, not a fight.", page: [220, 221] }],
  }),
  creature({
    id: "xx121-king",
    name: "Palantine / Alien King (Stage VII+)",
    summary: "Unconfirmed reports of Praetorians molting further, and of an Alien King. No stats; lore only.",
    page: 221,
    species: XX121,
    stage: "VII+",
    loreOnly: true,
    unverified: true,
    abilities: [{ name: "Lore", text: "Hypothetical forms with no stats in the book; the GM invents them if one must appear.", page: 221 }],
  }),
];

// ---------------------------------------------------------------------------
// Neomorph (p. 223-225)
// ---------------------------------------------------------------------------

const NEO = "neomorph";

const SPRINT: Ability = { name: "Sprint", text: "If it moves instead of making a signature attack, it moves one extra zone.", page: 225 };
const NO_ACID: Ability = { name: "No Acid", text: "Its yellow blood is not acidic.", page: 223 };

const neomorphPresets: AlienPreset[] = [
  creature({
    id: "neomorph-egg-sacs",
    name: "Neomorphic Egg Sacs",
    summary: "Stage I. Fungus-like pods in clutches of 2D6 that hold the infectious motes. No stats.",
    page: 223,
    species: NEO,
    stage: "I",
    loreOnly: true,
    abilities: [{ name: "Clutches", text: "Grow in clutches of 2D6, often several in one area; disturbing them releases Neomorphic Motes.", page: 223 }],
    lifecycleTrigger: "Release a cloud of motes when disturbed.",
    containment: "Fire destroys them; liquid nitrogen makes them inert until they thaw.",
  }),
  creature({
    id: "neomorph-motes",
    name: "Neomorphic Motes",
    summary: "Stage II. A pollen-like swarm of tiny parasites that enters a host through any opening. No stats.",
    page: 224,
    species: NEO,
    stage: "II",
    loreOnly: true,
    abilities: [{ name: "Infection", text: "Exposure acts as a virulence -2 disease; on a failed STAMINA roll the host advances to Stage III inside one shift.", page: 224 }],
    lifecycleTrigger: "A failed STAMINA roll means a Bloodburster within one shift.",
    containment: "They avoid smoke and die in fire.",
  }),
  creature({
    id: "neomorph-bloodburster",
    name: "Neomorphic Bloodburster",
    summary: "Stage III. A rabid four-legged newborn that tears its way out of the host.",
    page: [224, 225],
    species: NEO,
    stage: "III",
    variant: "bloodburster",
    speed: 3,
    health: 2,
    mobility: 9,
    observation: 5,
    ...armor(0),
    attackTable: "neomorph-bloodburster",
    attacks: BLOODBURSTER_ATTACKS,
    abilities: [
      { name: "Birth", text: "Its birth kills the host. It needs one round to free itself from its sac, then attacks in a rage.", page: 224 },
      SPRINT,
      NO_ACID,
    ],
    lifecycleTrigger: "After a few stretches it becomes a juvenile Neomorph (Stage IV).",
    containment: "Strike right after birth, while it is still in its sac; fire or heavy damage then drives it off to hide and grow.",
  }),
  creature({
    id: "neomorph-neophyte",
    name: "Neophyte (Juvenile Neomorph)",
    summary: "Stage IV. A four-legged hunter that singles out one prey and tracks it.",
    page: 225,
    species: NEO,
    stage: "IV",
    variant: "neophyte",
    speed: 3,
    health: 4,
    mobility: 10,
    observation: 6,
    ...armor(1, 0),
    attackTable: "neomorph-adult",
    attacks: NEOMORPH_ATTACKS,
    abilities: [SPRINT, NO_ACID],
    lifecycleTrigger: "After one shift it becomes an adult Neomorph.",
    containment: "It ignores its wounds until they are critical; only sustained, concentrated fire brings it down.",
  }),
  creature({
    id: "neomorph-adult",
    name: "Adult Neomorph",
    summary: "Stage V. A pale, eyeless biped that hunts by stealth and burns out within a day.",
    page: [224, 225],
    species: NEO,
    stage: "V",
    variant: "adult",
    speed: 2,
    health: 6,
    mobility: 9,
    observation: 8,
    ...armor(1, 0),
    attackTable: "neomorph-adult",
    attacks: NEOMORPH_ATTACKS,
    abilities: [
      { name: "Short Lifespan", text: "Usually dies of natural causes within 24 hours (four shifts); fungus on the corpse grows new egg sacs.", page: 225 },
      SPRINT,
      NO_ACID,
    ],
    lifecycleTrigger: "Dies within four shifts; its corpse seeds new egg sacs.",
    containment: "A full pulse rifle burst drops it, any automatic weapon eventually. Finish it with a head shot: they have risen after seeming dead.",
  }),
];

// ---------------------------------------------------------------------------
// Engineers and other extrasolar species (p. 204-207, 227-231)
// ---------------------------------------------------------------------------

const otherSpeciesPresets: AlienPreset[] = [
  creature({
    id: "engineer",
    name: "Engineer",
    summary: "The giant precursors who made humanity and later tried to undo it. None are known alive. No stats; lore only.",
    page: [204, 207],
    species: "engineer",
    stage: "adult",
    loreOnly: true,
    abilities: [
      { name: "Lore", text: "Known from ruins, derelicts, holographic records and biosuits. Their black accelerant breeds Neomorphs and worse.", page: [204, 207] },
    ],
  }),
  creature({
    id: "deacon",
    name: "Deacon",
    summary: "A rumored dark blue, goblin-jawed missing link between Neomorph and XX121. No stats; lore only.",
    page: 220,
    species: "deacon",
    stage: "adult",
    loreOnly: true,
    abilities: [{ name: "Lore", text: "Mentioned only among unconfirmed xenomorph types; no stats in the book.", page: 220 }],
  }),
  creature({
    id: "harvester",
    name: "Harvester",
    summary: "A six-legged, six-meter burrower with a meat-grinder mouth that wrecked the Tartarus colony.",
    page: [227, 228],
    species: "harvester",
    stage: "adult",
    speed: 1,
    health: 15,
    mobility: 4,
    armor: 5,
    armorNotes: "2 on the underbelly",
    attackTable: "harvester",
    attacks: HARVESTER_ATTACKS,
    abilities: [
      { name: "Hidden Behemoth", text: "Sleeps under a thin crust. Walkers get an OBSERVATION roll to spot it; otherwise the ground gives way and it gets a surprise attack.", page: 228 },
      { name: "Harvester Juveniles", text: "Carries up to 2D6 young under its armor; they join the fight if it is in real danger.", page: 228 },
    ],
    containment: "Go for the soft underbelly. Luring them to the surface for air strikes worked only until they learned.",
    extraFields: { classification: "Mammalian Omnivore", habitat: "Tartarus and several mining colonies", size: "6 meters or more" },
  }),
  creature({
    id: "harvester-juvenile",
    name: "Harvester Juvenile",
    summary: "A boar-sized Harvester young that leaps to its mother's defense.",
    page: 228,
    species: "harvester",
    stage: "juvenile",
    speed: 1,
    health: 4,
    mobility: 8,
    armor: 1,
    attacks: [{ roll: 1, rollTo: 6, name: "Attack", dice: 4, damage: 1, effect: "The book gives the young a single attack: four base dice, damage 1." }],
    abilities: [{ name: "Defend Mother", text: "Only detaches and fights when its mother is in genuine danger.", page: 228 }],
  }),
  creature({
    id: "lion-worm",
    name: "Lion Worm",
    summary: "A golden-ciliated burrowing ambush predator from the jungles of Zagreus.",
    page: [228, 229],
    species: "lion-worm",
    stage: "adult",
    speed: 2,
    health: 8,
    mobility: 10,
    observation: 8,
    armor: 1,
    attackTable: "lion-worm",
    attacks: LION_WORM_ATTACKS,
    abilities: [{ name: "Ambush Predator", text: "In its own territory, its prey gets -2 dice to OBSERVATION rolls in stealth mode.", page: 229 }],
    containment: "Pollen or pollutants disorient it; another Lion Worm's scent distracts it and draws it to attack the rival.",
    extraFields: { classification: "Invertebrate Carnivore", habitat: "Wilds of Zagreus", size: "1.8-3 meters" },
  }),
  creature({
    id: "tanakan-scorpionid",
    name: "Tanakan Scorpionid",
    summary: "A venomous desert sea-scorpion of Tanaka 5 that hunts at night and swims well.",
    page: [229, 230],
    species: "tanakan-scorpionid",
    stage: "adult",
    speed: 1,
    health: 5,
    mobility: 6,
    observation: 6,
    armor: 1,
    armorNotes: "0 vs firearms",
    attackTable: "tanakan-scorpionid",
    attacks: SCORPIONID_ATTACKS,
    abilities: [
      { name: "In Water", text: "In water: Speed 3, MOBILITY 10, OBSERVATION 10 (other stats unchanged).", page: 230 },
      { name: "Underwater Sprint", text: "Starting its turn in water, it moves one extra zone if it moves instead of attacking.", page: 230 },
    ],
    containment: "Its shell stops knives and melee weapons, not bullets. Its venom is valuable for medicine.",
    extraFields: { inWater: { speed: 3, health: 5, mobility: 10, observation: 10 }, classification: "Arthropod Carnivore", habitat: "Tanaka 5, deserts and cavernous springs", size: "1.5-2.4 meters" },
  }),
  creature({
    id: "swarm",
    name: "The Swarm",
    summary: "Space locusts from LV-KR 115 that blanket whole zones and eat everything but metal.",
    page: [230, 231],
    species: "swarm",
    stage: "adult",
    speed: 1,
    health: 5,
    armorNotes: "Impervious to all attacks except fire, explosions and electricity",
    attackTable: "swarm",
    attacks: SWARM_ATTACKS,
    abilities: [
      { name: "Swarm Rules", text: "Size is counted in zones covered: Speed 1 and Health 5 per zone. It cannot be killed; at zero Health it leaves for easier pickings.", page: 231 },
    ],
    containment: "Shooting is pointless. In space, burn dormant swarms with the engines; planetside only fire, electricity and pesticides work.",
    extraFields: { perZone: true, classification: "Insect Omnivores", habitat: "LV-KR 115, fertile grass and farmlands, or drifting through space", size: "Around 15 centimeters each; swarms span many kilometers" },
  }),
];

export const creaturePresets: AlienPreset[] = [...xx121Presets, ...neomorphPresets, ...otherSpeciesPresets];
