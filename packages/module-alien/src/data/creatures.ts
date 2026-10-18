import type { AlienPreset } from "./types";

/**
 * Creature stat blocks (Evolved Edition p. 208-231).
 *
 * Reference data only. Stat lines, six-row signature-attack tables and
 * one-line ability notes come from general knowledge of the Alien RPG and the
 * setting; everything is flagged `unverified`. Stage numbering follows the
 * module spec (drone III, soldier IV, praetorian V, queen VI); the owner must
 * confirm it against the book.
 *
 * Creatures have no attributes, never push and never dodge.
 */

interface Attack {
  roll: number;
  name: string;
  dice: number;
  damage: number | string;
  armorPiercing?: boolean;
  effect: string;
}

interface Ability {
  name: string;
  text: string;
  page?: number;
}

interface CreatureSpec {
  id: string;
  name: string;
  summary: string;
  page: number | [number, number];
  species: string;
  stage: string;
  variant?: string;
  speed?: number;
  health?: number;
  mobility?: number;
  observation?: number;
  armor?: number;
  armorNotes?: string;
  acidSplash?: number;
  attacks?: Attack[];
  abilities?: Ability[];
  lifecycleTrigger?: string;
  containment?: string;
  loreOnly?: boolean;
  tags?: string[];
}

function creature(spec: CreatureSpec): AlienPreset {
  const { id, name, summary, page, loreOnly, tags = [], ...rest } = spec;
  const fields: Record<string, unknown> = {
    species: rest.species,
    stage: rest.stage,
  };
  if (rest.variant) fields.variant = rest.variant;
  if (loreOnly) {
    fields.loreOnly = true;
  } else {
    fields.speed = rest.speed ?? 1;
    fields.health = rest.health ?? 1;
    fields.mobility = rest.mobility ?? 0;
    fields.observation = rest.observation ?? 0;
    fields.armor = rest.armor ?? 0;
    fields.attacks = rest.attacks ?? [];
  }
  if (rest.armorNotes) fields.armorNotes = rest.armorNotes;
  if (rest.acidSplash !== undefined) fields.acidSplash = rest.acidSplash;
  fields.abilities = rest.abilities ?? [];
  if (rest.lifecycleTrigger) fields.lifecycleTrigger = rest.lifecycleTrigger;
  if (rest.containment) fields.containment = rest.containment;
  return {
    id: `alien.creature.${id}`,
    entityType: "alien.creature",
    name,
    summary,
    page,
    tags: ["creature", `species:${rest.species}`, ...(loreOnly ? ["lore-only"] : []), ...tags],
    fields,
    unverified: true,
  };
}

// ---------------------------------------------------------------------------
// XX121 (the xenomorph)
// ---------------------------------------------------------------------------

const XX121 = "xx121";

const facehuggerAttacks: Attack[] = [
  { roll: 1, name: "Scuttle", dice: 0, damage: 0, effect: "Moves to a hiding place in the zone; cannot be attacked this round unless spotted." },
  { roll: 2, name: "Clumsy leap", dice: 4, damage: 0, effect: "Lands on the target; on a success the victim must act next round or be hugged." },
  { roll: 3, name: "Tail whip", dice: 5, damage: 1, effect: "Lashes at a hand or weapon; on a success the victim drops the item." },
  { roll: 4, name: "Leap", dice: 6, damage: 0, effect: "Attaches to the face; grappled victim must win a Close Combat contest to pull it off." },
  { roll: 5, name: "Choke hold", dice: 7, damage: 1, effect: "Tail wraps the throat; victim takes damage each round until freed." },
  { roll: 6, name: "Implant", dice: 8, damage: 0, effect: "Victim is impregnated; the facehugger drops off dead within a shift. Start the chestburster countdown." },
];

const chestbursterAttacks: Attack[] = [
  { roll: 1, name: "Hide", dice: 0, damage: 0, effect: "Scurries into a vent or under equipment; stealth mode begins." },
  { roll: 2, name: "Shriek", dice: 0, damage: 0, effect: "Everyone in the zone makes an immediate Panic Roll." },
  { roll: 3, name: "Bite", dice: 4, damage: 1, effect: "Needle teeth; victim gains +1 stress." },
  { roll: 4, name: "Whip", dice: 5, damage: 1, effect: "Tail lash; victim knocked prone." },
  { roll: 5, name: "Frenzied bite", dice: 6, damage: 2, effect: "Tears at exposed flesh." },
  { roll: 6, name: "Eruption", dice: 8, damage: 3, armorPiercing: true, effect: "Only on emerging: the host dies and everyone in the zone makes a Panic Roll." },
];

const droneAttacks: Attack[] = [
  { roll: 1, name: "Stalk", dice: 0, damage: 0, effect: "Vanishes into the shadows; next round the drone acts first." },
  { roll: 2, name: "Shriek", dice: 0, damage: 0, effect: "Everyone in short range makes an immediate Panic Roll." },
  { roll: 3, name: "Tail lash", dice: 6, damage: 1, effect: "Victim knocked prone and pushed one zone." },
  { roll: 4, name: "Grab", dice: 7, damage: 0, effect: "Victim is grappled; dragged away next round unless freed." },
  { roll: 5, name: "Claws", dice: 8, damage: 2, effect: "Slashes with both hands." },
  { roll: 6, name: "Inner jaw", dice: 9, damage: 3, armorPiercing: true, effect: "Headbite; a critical injury here is almost always fatal." },
];

const soldierAttacks: Attack[] = [
  { roll: 1, name: "Playing dead", dice: 0, damage: 0, effect: "Feigns death; attacks with surprise next round." },
  { roll: 2, name: "Shriek", dice: 0, damage: 0, effect: "Everyone in short range makes an immediate Panic Roll." },
  { roll: 3, name: "Tail stab", dice: 8, damage: 2, armorPiercing: true, effect: "Impales through armor; victim is grappled on the tail." },
  { roll: 4, name: "Grab", dice: 8, damage: 1, effect: "Victim grappled and carried toward the hive next round." },
  { roll: 5, name: "Claws", dice: 9, damage: 2, effect: "Rakes with both sets of claws; may hit two engaged targets." },
  { roll: 6, name: "Inner jaw", dice: 10, damage: 3, armorPiercing: true, effect: "Headbite." },
];

const workerAttacks: Attack[] = [
  { roll: 1, name: "Retreat", dice: 0, damage: 0, effect: "Withdraws toward the hive carrying resin or a captive." },
  { roll: 2, name: "Shriek", dice: 0, damage: 0, effect: "Everyone in short range makes an immediate Panic Roll." },
  { roll: 3, name: "Shove", dice: 6, damage: 1, effect: "Victim knocked prone." },
  { roll: 4, name: "Grab", dice: 8, damage: 0, effect: "Victim grappled; cocooned if not freed within a stretch." },
  { roll: 5, name: "Claws", dice: 8, damage: 2, effect: "Slashes." },
  { roll: 6, name: "Inner jaw", dice: 9, damage: 3, armorPiercing: true, effect: "Headbite." },
];

const scoutAttacks: Attack[] = [
  { roll: 1, name: "Observe", dice: 0, damage: 0, effect: "Slips away unseen and reports to the hive; the next encounter brings more." },
  { roll: 2, name: "Hiss", dice: 0, damage: 0, effect: "Everyone in the zone makes an immediate Panic Roll." },
  { roll: 3, name: "Tail lash", dice: 6, damage: 1, effect: "Victim knocked prone." },
  { roll: 4, name: "Pounce", dice: 7, damage: 1, effect: "Victim grappled; the scout drags them one zone." },
  { roll: 5, name: "Claws", dice: 7, damage: 2, effect: "Slashes." },
  { roll: 6, name: "Inner jaw", dice: 8, damage: 3, armorPiercing: true, effect: "Headbite." },
];

const praetorianAttacks: Attack[] = [
  { roll: 1, name: "Guard", dice: 0, damage: 0, effect: "Takes position between attackers and the hive; blocks movement through its zone." },
  { roll: 2, name: "Roar", dice: 0, damage: 0, effect: "Everyone in medium range makes an immediate Panic Roll with +1." },
  { roll: 3, name: "Tail sweep", dice: 9, damage: 2, effect: "Hits every engaged enemy; victims knocked prone." },
  { roll: 4, name: "Trample", dice: 9, damage: 2, effect: "Charges through the zone; victims pushed aside and prone." },
  { roll: 5, name: "Crushing claws", dice: 10, damage: 3, effect: "Both claws; victim grappled." },
  { roll: 6, name: "Inner jaw", dice: 12, damage: 4, armorPiercing: true, effect: "Headbite." },
];

const crusherAttacks: Attack[] = [
  { roll: 1, name: "Stomp", dice: 8, damage: 1, effect: "Victim knocked prone." },
  { roll: 2, name: "Bellow", dice: 0, damage: 0, effect: "Everyone in medium range makes an immediate Panic Roll with +1." },
  { roll: 3, name: "Tail smash", dice: 10, damage: 2, effect: "Victim thrown one zone and knocked prone." },
  { roll: 4, name: "Charge", dice: 10, damage: 3, effect: "Moves one zone and rams; breaks through doors and light walls." },
  { roll: 5, name: "Head ram", dice: 12, damage: 3, effect: "Crushes anyone in its path; vehicles take hull damage." },
  { roll: 6, name: "Trample", dice: 14, damage: 4, armorPiercing: true, effect: "Runs down everything in the zone." },
];

const queenAttacks: Attack[] = [
  { roll: 1, name: "Command", dice: 0, damage: 0, effect: "All other xenomorphs within long range act immediately." },
  { roll: 2, name: "Hateful shriek", dice: 0, damage: 0, effect: "Everyone in long range makes an immediate Panic Roll with +2." },
  { roll: 3, name: "Tail stab", dice: 10, damage: 3, armorPiercing: true, effect: "Impales; victim grappled on the tail." },
  { roll: 4, name: "Grab and lift", dice: 11, damage: 2, effect: "Victim grappled and lifted; crushed next round unless freed." },
  { roll: 5, name: "Claws", dice: 12, damage: 3, effect: "May hit two engaged targets." },
  { roll: 6, name: "Inner jaw", dice: 14, damage: 4, armorPiercing: true, effect: "Headbite." },
];

const ovomorphRows: Attack[] = [
  { roll: 1, name: "Dormant", dice: 0, damage: 0, effect: "The egg does nothing this round." },
  { roll: 2, name: "Dormant", dice: 0, damage: 0, effect: "The egg does nothing this round." },
  { roll: 3, name: "Stirring", dice: 0, damage: 0, effect: "Movement inside; anyone watching gains +1 stress." },
  { roll: 4, name: "Petals open", dice: 0, damage: 0, effect: "Top opens with a wet sound; everyone engaged makes a Panic Roll." },
  { roll: 5, name: "Petals open", dice: 0, damage: 0, effect: "Top opens; a facehugger is visible inside and acts next round." },
  { roll: 6, name: "Release", dice: 6, damage: 0, effect: "A facehugger leaps at the nearest engaged victim; resolve a facehugger Leap." },
];

const brokenAttacks: Attack[] = [
  { roll: 1, name: "Collapse", dice: 0, damage: 0, effect: "Loses a round twitching; acid pools in the zone." },
  { roll: 2, name: "Wail", dice: 0, damage: 0, effect: "Everyone in the zone makes an immediate Panic Roll." },
  { roll: 3, name: "Weak lash", dice: 4, damage: 1, effect: "Tail flails." },
  { roll: 4, name: "Grab", dice: 5, damage: 0, effect: "Victim grappled; the creature's own weight pins them." },
  { roll: 5, name: "Claws", dice: 6, damage: 2, effect: "Slashes." },
  { roll: 6, name: "Inner jaw", dice: 7, damage: 3, armorPiercing: true, effect: "Headbite, then the creature may die of its wounds." },
];

const xx121Presets: AlienPreset[] = [
  creature({
    id: "xx121-ovomorph",
    name: "Ovomorph (Egg)",
    summary: "Stage I. Leathery egg that waits for a host.",
    page: 210,
    species: XX121,
    stage: "I",
    speed: 0,
    health: 4,
    mobility: 0,
    observation: 6,
    armor: 2,
    acidSplash: 4,
    attacks: ovomorphRows,
    abilities: [
      { name: "Sense prey", text: "Detects living creatures in the zone; opens when a host is engaged." },
      { name: "Dormancy", text: "Can remain viable for decades in a sealed environment." },
    ],
    lifecycleTrigger: "Opens when a potential host comes within engaged range; releases a facehugger.",
    containment: "Cryogenic stasis or vacuum sealing halts development. Flame destroys the egg and its occupant.",
  }),
  creature({
    id: "xx121-facehugger",
    name: "Facehugger",
    summary: "Stage II. Parasitoid that implants an embryo in a host.",
    page: 211,
    species: XX121,
    stage: "II",
    speed: 2,
    health: 2,
    mobility: 8,
    observation: 8,
    armor: 2,
    acidSplash: 4,
    attacks: facehuggerAttacks,
    abilities: [
      { name: "Grip", text: "Once attached, cannot be removed without a Close Combat test and a critical injury to the victim." },
      { name: "Acid blood", text: "Damaging it splashes acid on everyone engaged." },
    ],
    lifecycleTrigger: "Implants an embryo and dies within a shift; chestburster emerges within one to two days.",
    containment: "Sealed specimen jar or cryotube; sedation does not reliably stop it.",
  }),
  creature({
    id: "xx121-royal-facehugger",
    name: "Royal Facehugger",
    summary: "Stage II variant that implants a queen embryo.",
    page: 211,
    species: XX121,
    stage: "II",
    variant: "royal",
    speed: 2,
    health: 3,
    mobility: 8,
    observation: 8,
    armor: 3,
    acidSplash: 4,
    attacks: facehuggerAttacks,
    abilities: [
      { name: "Double implant", text: "Can implant two hosts: the first with a queen embryo, the second with a regular drone." },
      { name: "Acid blood", text: "Damaging it splashes acid on everyone engaged." },
    ],
    lifecycleTrigger: "Queen embryo gestates longer than a drone; emergence after two to four days.",
    containment: "As facehugger; company protocols flag it as a priority specimen.",
  }),
  creature({
    id: "xx121-facehugger-swarm",
    name: "Facehugger Swarm",
    summary: "Stage II in numbers; a hatchery disturbed at once.",
    page: 213,
    species: XX121,
    stage: "II",
    variant: "swarm",
    speed: 2,
    health: 6,
    mobility: 8,
    observation: 8,
    armor: 2,
    acidSplash: 6,
    attacks: facehuggerAttacks,
    abilities: [
      { name: "Swarm", text: "Roll on the swarm size table; the swarm attacks every engaged victim each round." },
      { name: "Disperse", text: "Area attacks hit the whole swarm; single-target attacks kill one hugger per success." },
    ],
    lifecycleTrigger: "Each attached hugger starts its own countdown.",
    containment: "Flame the hatchery; sealing the zone and venting atmosphere works on a ship.",
  }),
  creature({
    id: "xx121-chestburster",
    name: "Chestburster",
    summary: "Newly emerged larva; fast, frightened and fast-growing.",
    page: 212,
    species: XX121,
    stage: "II-III",
    speed: 2,
    health: 2,
    mobility: 7,
    observation: 6,
    armor: 1,
    acidSplash: 4,
    attacks: chestbursterAttacks,
    abilities: [
      { name: "Flee", text: "After emerging it tries to hide; hunting it is a stealth encounter." },
      { name: "Rapid growth", text: "Molts into a drone within hours if it feeds." },
    ],
    lifecycleTrigger: "Emerges from the host chest, killing them; molts to Stage III within a shift given food.",
    containment: "Catching one alive requires a sealed room and a net; cryo stops growth.",
  }),
  creature({
    id: "xx121-drone",
    name: "Drone",
    summary: "Stage III. The classic solitary hunter.",
    page: 214,
    species: XX121,
    stage: "III",
    speed: 2,
    health: 6,
    mobility: 8,
    observation: 8,
    armor: 6,
    armorNotes: "Armor doubles against fire damage.",
    acidSplash: 6,
    attacks: droneAttacks,
    abilities: [
      { name: "Hide in plain sight", text: "Gets +3 on Mobility rolls to stay hidden among machinery and pipes." },
      { name: "Acid blood", text: "Damaging it splashes acid on everyone engaged." },
      { name: "Adaptive", text: "Learns the crew's tactics; the GM may re-roll one attack per encounter." },
    ],
    lifecycleTrigger: "Can build a hive and lay eggs when no queen is present (egg-morphing).",
    containment: "Reinforced cell with no vents; the company prefers it in cryo.",
  }),
  creature({
    id: "xx121-scout",
    name: "Scout",
    summary: "Stage III variant: lighter, faster, and reports back to the hive.",
    page: 215,
    species: XX121,
    stage: "III",
    variant: "scout",
    speed: 3,
    health: 5,
    mobility: 9,
    observation: 9,
    armor: 4,
    acidSplash: 6,
    attacks: scoutAttacks,
    abilities: [
      { name: "Pathfinder", text: "Always knows the shortest route back to the hive." },
      { name: "Acid blood", text: "Damaging it splashes acid on everyone engaged." },
    ],
    lifecycleTrigger: "Molts into a soldier when the hive needs defenders.",
    containment: "As drone.",
  }),
  creature({
    id: "xx121-soldier",
    name: "Soldier",
    summary: "Stage IV. Heavier warrior caste that defends the hive.",
    page: 216,
    species: XX121,
    stage: "IV",
    speed: 2,
    health: 8,
    mobility: 7,
    observation: 6,
    armor: 7,
    armorNotes: "Armor doubles against fire damage.",
    acidSplash: 6,
    attacks: soldierAttacks,
    abilities: [
      { name: "Pack hunter", text: "Attacks together with other soldiers; +1 die per additional soldier engaged with the same victim, up to +3." },
      { name: "Acid blood", text: "Damaging it splashes acid on everyone engaged." },
    ],
    lifecycleTrigger: "Molts to praetorian when the queen allows it.",
    containment: "Rarely taken alive.",
  }),
  creature({
    id: "xx121-worker",
    name: "Worker",
    summary: "Stage IV variant that builds the hive and tends the eggs.",
    page: 216,
    species: XX121,
    stage: "IV",
    variant: "worker",
    speed: 1,
    health: 7,
    mobility: 6,
    observation: 6,
    armor: 6,
    acidSplash: 6,
    attacks: workerAttacks,
    abilities: [
      { name: "Resin", text: "Can seal a door or cocoon a victim in one stretch." },
      { name: "Acid blood", text: "Damaging it splashes acid on everyone engaged." },
    ],
    lifecycleTrigger: "Stays a worker while the hive needs builders.",
    containment: "As drone.",
  }),
  creature({
    id: "xx121-praetorian",
    name: "Praetorian",
    summary: "Stage V. Royal guard; a queen in waiting.",
    page: 217,
    species: XX121,
    stage: "V",
    speed: 2,
    health: 12,
    mobility: 6,
    observation: 6,
    armor: 8,
    armorNotes: "Armor doubles against fire damage.",
    acidSplash: 8,
    attacks: praetorianAttacks,
    abilities: [
      { name: "Royal guard", text: "Interposes itself; attacks against the queen in its zone hit the praetorian instead." },
      { name: "Acid blood", text: "Damaging it splashes acid on everyone in the zone." },
    ],
    lifecycleTrigger: "Becomes a queen if the hive loses its queen; otherwise may be driven out to found a new hive.",
    containment: "Not practical.",
  }),
  creature({
    id: "xx121-crusher",
    name: "Crusher",
    summary: "Stage V variant; armored battering ram.",
    page: 218,
    species: XX121,
    stage: "V",
    variant: "crusher",
    speed: 2,
    health: 16,
    mobility: 4,
    observation: 5,
    armor: 8,
    armorNotes: "Head carapace armor 12 against attacks from the front.",
    acidSplash: 8,
    attacks: crusherAttacks,
    abilities: [
      { name: "Siege beast", text: "Breaks through doors, walls and light vehicles on a charge." },
      { name: "Acid blood", text: "Damaging it splashes acid on everyone in the zone." },
    ],
    lifecycleTrigger: "Terminal form.",
    containment: "Not practical.",
  }),
  creature({
    id: "xx121-queen",
    name: "Queen",
    summary: "Stage VI. The egg-layer and ruler of the hive.",
    page: 219,
    species: XX121,
    stage: "VI",
    speed: 2,
    health: 20,
    mobility: 5,
    observation: 8,
    armor: 10,
    armorNotes: "Armor doubles against fire damage.",
    acidSplash: 10,
    attacks: queenAttacks,
    abilities: [
      { name: "Hive mind", text: "Directs every xenomorph within the hive; they act on her initiative." },
      { name: "Egg sac", text: "Immobile while attached to the ovipositor; tearing free takes a round and inflicts 2 damage on her." },
      { name: "Acid blood", text: "Damaging her splashes acid on everyone in the zone." },
    ],
    lifecycleTrigger: "Lays eggs continuously while fed; a hive grows by hundreds within weeks.",
    containment: "Company priority objective; no known successful containment.",
  }),
  creature({
    id: "xx121-empress",
    name: "Empress (Stage VII)",
    summary: "Rumored queen of queens. No stats; lore only.",
    page: [220, 221],
    species: XX121,
    stage: "VII",
    loreOnly: true,
    abilities: [{ name: "Lore", text: "Said to rule several hives at once. Treat as a plot device, not a combat encounter." }],
    lifecycleTrigger: "Unknown.",
  }),
  creature({
    id: "xx121-king",
    name: "King / Rogue (Stage VII+)",
    summary: "Engineered or aberrant apex forms. No stats; lore only.",
    page: [220, 221],
    species: XX121,
    stage: "VII+",
    loreOnly: true,
    abilities: [{ name: "Lore", text: "Products of corporate experimentation or unnatural lineages; the GM invents stats if one must appear." }],
  }),
];

// ---------------------------------------------------------------------------
// Neomorph
// ---------------------------------------------------------------------------

const NEO = "neomorph";

const sporeRows: Attack[] = [
  { roll: 1, name: "Dormant", dice: 0, damage: 0, effect: "Nothing happens this round." },
  { roll: 2, name: "Dormant", dice: 0, damage: 0, effect: "Nothing happens this round." },
  { roll: 3, name: "Twitch", dice: 0, damage: 0, effect: "The pod reacts to movement; onlookers gain +1 stress." },
  { roll: 4, name: "Burst", dice: 5, damage: 0, effect: "A cloud of motes seeks the nearest engaged victim; Stamina roll or infected." },
  { roll: 5, name: "Burst", dice: 6, damage: 0, effect: "As above; the cloud fills the zone." },
  { roll: 6, name: "Mass release", dice: 7, damage: 0, effect: "Every unprotected creature in the zone rolls Stamina or is infected." },
];

const bloodbursterAttacks: Attack[] = [
  { roll: 1, name: "Flee", dice: 0, damage: 0, effect: "Bolts for cover; stealth mode begins." },
  { roll: 2, name: "Screech", dice: 0, damage: 0, effect: "Everyone in the zone makes an immediate Panic Roll." },
  { roll: 3, name: "Bite", dice: 4, damage: 1, effect: "Victim gains +1 stress." },
  { roll: 4, name: "Lash", dice: 5, damage: 1, effect: "Victim knocked prone." },
  { roll: 5, name: "Savage bite", dice: 6, damage: 2, effect: "Tears at exposed flesh." },
  { roll: 6, name: "Eruption", dice: 8, damage: 3, armorPiercing: true, effect: "Only on emerging from the host's back or throat; the host dies." },
];

const sprinterAttacks: Attack[] = [
  { roll: 1, name: "Circle", dice: 0, damage: 0, effect: "Moves to another zone and attacks next round with +2 dice." },
  { roll: 2, name: "Screech", dice: 0, damage: 0, effect: "Everyone in short range makes an immediate Panic Roll." },
  { roll: 3, name: "Pounce", dice: 7, damage: 1, effect: "Victim knocked prone and grappled." },
  { roll: 4, name: "Claws", dice: 7, damage: 2, effect: "Slashes." },
  { roll: 5, name: "Bite", dice: 8, damage: 2, effect: "Latches on; victim takes 1 damage each round until freed." },
  { roll: 6, name: "Frenzy", dice: 9, damage: 3, effect: "Multiple bites and slashes in a single leap." },
];

const neomorphAttacks: Attack[] = [
  { roll: 1, name: "Stalk", dice: 0, damage: 0, effect: "Pale body vanishes against white or grey surfaces; next round it acts first." },
  { roll: 2, name: "Screech", dice: 0, damage: 0, effect: "Everyone in short range makes an immediate Panic Roll." },
  { roll: 3, name: "Tail stab", dice: 7, damage: 2, armorPiercing: true, effect: "Barbed tail impales the victim." },
  { roll: 4, name: "Grab", dice: 8, damage: 1, effect: "Victim grappled." },
  { roll: 5, name: "Claws", dice: 9, damage: 2, effect: "Slashes." },
  { roll: 6, name: "Bite", dice: 10, damage: 3, armorPiercing: true, effect: "Toothed jaws crush bone." },
];

const neomorphPresets: AlienPreset[] = [
  creature({
    id: "neomorph-spore-pod",
    name: "Neomorph Spore Pod",
    summary: "Stage I-II. Fungal pod releasing airborne motes.",
    page: 222,
    species: NEO,
    stage: "I-II",
    speed: 0,
    health: 2,
    mobility: 0,
    observation: 4,
    armor: 0,
    attacks: sporeRows,
    abilities: [
      { name: "Airborne infection", text: "Motes enter through nose, ears or wounds. A sealed suit or respirator protects." },
      { name: "Pathogen origin", text: "Grows wherever the black pathogen has seeded a biosphere." },
    ],
    lifecycleTrigger: "Infected host gestates a bloodburster within hours.",
    containment: "Isolate the area, decontaminate with heat; infected hosts cannot be saved by field surgery.",
  }),
  creature({
    id: "neomorph-bloodburster",
    name: "Bloodburster",
    summary: "Stage III. Pale larva that erupts from the host's back or throat.",
    page: 223,
    species: NEO,
    stage: "III",
    speed: 2,
    health: 3,
    mobility: 8,
    observation: 7,
    armor: 2,
    attacks: bloodbursterAttacks,
    abilities: [
      { name: "Rapid growth", text: "Grows to a sprinter in hours, faster still if it feeds." },
      { name: "Fast", text: "Moves two zones per action." },
    ],
    lifecycleTrigger: "Emerges violently from the host; molts within a shift.",
    containment: "Kill on sight; the company wants samples of its blood.",
  }),
  creature({
    id: "neomorph-sprinter",
    name: "Sprinter",
    summary: "Stage IV. Fast juvenile neomorph that hunts in the open.",
    page: 224,
    species: NEO,
    stage: "IV",
    speed: 3,
    health: 6,
    mobility: 9,
    observation: 7,
    armor: 4,
    attacks: sprinterAttacks,
    abilities: [
      { name: "Fast", text: "Moves two zones per action and may attack after moving." },
      { name: "No acid", text: "Neomorph blood is not corrosive." },
    ],
    lifecycleTrigger: "Molts into an adult neomorph after feeding.",
    containment: "Not practical in the field.",
  }),
  creature({
    id: "neomorph-adult",
    name: "Neomorph (adult)",
    summary: "Stage V. Pale, barbed, relentless.",
    page: 225,
    species: NEO,
    stage: "V",
    speed: 2,
    health: 8,
    mobility: 7,
    observation: 7,
    armor: 6,
    armorNotes: "No bonus against fire; neomorphs burn.",
    attacks: neomorphAttacks,
    abilities: [
      { name: "Camouflage", text: "+2 Mobility to hide in pale or sterile environments." },
      { name: "Relentless", text: "Ignores stress; never retreats while prey remains." },
      { name: "No acid", text: "Neomorph blood is not corrosive." },
    ],
    lifecycleTrigger: "Terminal form; does not build hives or lay eggs.",
    containment: "Company protocols treat it as a pathogen carrier: incinerate.",
  }),
];

// ---------------------------------------------------------------------------
// Other species
// ---------------------------------------------------------------------------

const scorpionidAttacks: Attack[] = [
  { roll: 1, name: "Burrow", dice: 0, damage: 0, effect: "Disappears into sand or rubble; surprise attack next round." },
  { roll: 2, name: "Threat display", dice: 0, damage: 0, effect: "Rattling carapace; everyone in the zone makes a Panic Roll." },
  { roll: 3, name: "Pincer", dice: 7, damage: 2, effect: "Victim grappled." },
  { roll: 4, name: "Double pincer", dice: 8, damage: 2, effect: "May hit two engaged victims." },
  { roll: 5, name: "Sting", dice: 8, damage: 1, armorPiercing: true, effect: "Venom: victim rolls Stamina each round or takes 1 further damage." },
  { roll: 6, name: "Crush and sting", dice: 10, damage: 3, armorPiercing: true, effect: "Grappled victim is crushed and stung." },
];

const harvesterAttacks: Attack[] = [
  { roll: 1, name: "Lurk", dice: 0, damage: 0, effect: "Hangs motionless in rafters or canopy; nearly invisible." },
  { roll: 2, name: "Spray", dice: 6, damage: 0, effect: "Blinding mucus; victim acts at -2 next round." },
  { roll: 3, name: "Tendril grab", dice: 7, damage: 1, effect: "Victim grappled and pulled one zone." },
  { roll: 4, name: "Drain", dice: 8, damage: 2, effect: "Feeds on a grappled victim; damage is Health drained." },
  { roll: 5, name: "Tendril storm", dice: 8, damage: 2, effect: "Hits every engaged enemy." },
  { roll: 6, name: "Devour", dice: 10, damage: 3, armorPiercing: true, effect: "Swallows a grappled victim whole." },
];

const bodybursterAttacks: Attack[] = [
  { roll: 1, name: "Convulse", dice: 0, damage: 0, effect: "The hybrid loses a round; something inside it moves." },
  { roll: 2, name: "Howl", dice: 0, damage: 0, effect: "Everyone in short range makes an immediate Panic Roll." },
  { roll: 3, name: "Claws", dice: 7, damage: 2, effect: "Slashes." },
  { roll: 4, name: "Grab", dice: 8, damage: 1, effect: "Victim grappled." },
  { roll: 5, name: "Bite", dice: 9, damage: 3, armorPiercing: true, effect: "Half-human jaws, fully xenomorph teeth." },
  { roll: 6, name: "Burst", dice: 10, damage: 3, effect: "Its ribcage splits and a new creature emerges; the hybrid dies." },
];

const otherSpeciesPresets: AlienPreset[] = [
  creature({
    id: "tanakan-scorpionid",
    name: "Tanakan Scorpionid",
    summary: "Native burrowing predator of a frontier desert world.",
    page: 228,
    species: "tanakan-scorpionid",
    stage: "adult",
    speed: 1,
    health: 7,
    mobility: 5,
    observation: 6,
    armor: 6,
    attacks: scorpionidAttacks,
    abilities: [
      { name: "Burrower", text: "Moves through loose ground; surprise on 1-3 when the party enters its zone." },
      { name: "Venom", text: "Victims stung must roll Stamina each round or take 1 damage." },
    ],
    containment: "Can be captured with a loader and a cargo pod; company bio-labs pay for live ones.",
  }),
  creature({
    id: "harvester",
    name: "Harvester",
    summary: "Arboreal ambush predator that drains its prey.",
    page: 229,
    species: "harvester",
    stage: "adult",
    speed: 1,
    health: 6,
    mobility: 7,
    observation: 7,
    armor: 3,
    attacks: harvesterAttacks,
    abilities: [
      { name: "Ambush", text: "Mobility 9 while motionless in cover." },
      { name: "Drain", text: "Feeds on grappled victims; recovers 1 Health per Health drained." },
    ],
    containment: "Sedatives work; it is an animal, not an engineered weapon.",
  }),
  creature({
    id: "engineer",
    name: "Engineer (Space Jockey)",
    summary: "The giant precursors found at Acheron. No stats; lore only.",
    page: 230,
    species: "engineer",
    stage: "adult",
    loreOnly: true,
    abilities: [
      { name: "Lore", text: "Creators or carriers of the black pathogen; their derelicts hold eggs and worse. A living one is a scenario, not a stat block." },
    ],
  }),
  creature({
    id: "bodyburster",
    name: "Bodyburster",
    summary: "Mutated host whose body is still becoming something else.",
    page: 231,
    species: "bodyburster",
    stage: "hybrid",
    speed: 1,
    health: 9,
    mobility: 4,
    observation: 5,
    armor: 3,
    acidSplash: 4,
    attacks: bodybursterAttacks,
    abilities: [
      { name: "Unstable", text: "When reduced to 0 Health it bursts: everyone engaged takes 2 damage and a new creature of the GM's choice emerges." },
      { name: "Still human", text: "Can be reasoned with for a round on a successful Manipulation roll; it then attacks anyway." },
    ],
    lifecycleTrigger: "Terminal; whatever is inside emerges when the host dies.",
    containment: "Quarantine the host before the change completes; after that, incinerate.",
  }),
  creature({
    id: "deacon",
    name: "Deacon",
    summary: "Pale proto-xenomorph born of a trilobite and an Engineer. No stats; lore only.",
    page: 231,
    species: "deacon",
    stage: "adult",
    loreOnly: true,
    abilities: [{ name: "Lore", text: "A single known specimen; use neomorph adult stats if it must fight." }],
  }),
];

// ---------------------------------------------------------------------------
// Broken xenomorph
// ---------------------------------------------------------------------------

const brokenPresets: AlienPreset[] = [
  creature({
    id: "xx121-broken",
    name: "Broken Xenomorph",
    summary: "A drone crippled by damage, cold or captivity; still deadly, now unpredictable.",
    page: 213,
    species: XX121,
    stage: "III",
    variant: "broken",
    speed: 1,
    health: 4,
    mobility: 5,
    observation: 6,
    armor: 4,
    acidSplash: 6,
    attacks: brokenAttacks,
    abilities: [
      { name: "Damaged", text: "Roll on the broken xenomorph table when it is first encountered to find what is wrong with it." },
      { name: "Acid blood", text: "Damaging it splashes acid on everyone engaged." },
    ],
    lifecycleTrigger: "Does not recover; dies within days unless it reaches a hive.",
    containment: "Already partly contained; this is what escapes.",
    tags: ["broken"],
  }),
];

export const creaturePresets: AlienPreset[] = [
  ...xx121Presets,
  ...neomorphPresets,
  ...otherSpeciesPresets,
  ...brokenPresets,
];
