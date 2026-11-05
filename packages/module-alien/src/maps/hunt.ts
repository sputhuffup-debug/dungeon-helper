/**
 * The live hunt on Alien site maps: hidden threats moving through the site
 * while the crew reads them on a motion tracker (stealth mode, p. 55-58;
 * creature moves, p. 208).
 *
 * Book rules (cited): stealth mode runs in stretches, Xenomorphs move one
 * zone per point of Speed (p. 55), passive enemies wait until alerted
 * (p. 55-56), a creature moving instead of attacking goes two zones a turn
 * (p. 208), facehugger swarms move at their swarm Speed (p. 213, carried on
 * the spawn mark), sealed access points stop even a Xenomorph (p. 56). A
 * motion tracker is used once per stretch after a power supply roll, reads
 * everyone within its range even out of sight but only those that moved,
 * and a ping is not seeing them (p. 58); the M314 reaches Long (four zones)
 * and the M316 Medium (p. 96).
 *
 * Module decisions (original, marked as such): how a hidden threat picks its
 * zone (the weights below), people keeping out of the ducts, rogue humans
 * and NPCs moving one zone a stretch, the job's NPCs never labelled hostile, a tracker counting range across walls and
 * locked doors, the bearing of a blip, and blips going stale when the next
 * stretch or round begins. The A-J letters follow the Starter Set's signal
 * tokens.
 */
import type { MapHuntDef, MapHuntNote, MapMoverDef, MapSensorDef } from "@campaign-forge/module-sdk";
import { toolPresets } from "../data/items";

/** The Starter Set's motion tracker signal tokens. */
export const SIGNAL_TOKEN_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"] as const;

const isAndroid = { "==": [{ var: "fields.android" }, true] };

/** Xenomorphs and other creatures: spawn marks and creature records. */
export const creatureMover: MapMoverDef = {
  id: "creature",
  label: "Creature",
  // one zone per point of Speed each stretch (p. 55); two zones a turn when it moves instead of attacking (p. 208)
  zones: { stretch: { var: ["speed", 1] }, round: 2 },
  ducts: true,
  from: { markers: [{ kind: "spawn" }], entities: [{ type: "alien.creature", when: { "!": { var: "fields.loreOnly" } } }] },
  postureKey: "state",
  // module decision: stalk the nearest crewmember by zone distance, through ducts and dark, cluttered rooms, out of sight
  prefer: { approach: 2, duct: 1, cluttered: 0.5, flags: { dark: 0.75 }, revealed: -0.5, trail: -0.4 },
  postures: {
    // passive enemies wait until something wakes them (p. 55-56)
    passive: { approach: 0, stay: 6 },
  },
  // module decision: hurt, it backs off into the ducts and the dark to heal (a stretch immobile restores a Xenomorph, p. 209)
  hurt: { approach: -2, duct: 2, flags: { dark: 1 }, stay: -0.5 },
  notes: [
    { text: "Stealth mode: Xenomorphs move one zone per point of Speed each stretch, after the PCs have moved.", page: 55 },
    { text: "Passive enemies wait until something alerts them; active ones hunt or hide.", page: [55, 56] },
    { text: "In a fight, moving instead of attacking takes it two zones.", page: 208 },
    { text: "A facehugger swarm moves at the swarm's Speed for its numbers (the spawn mark carries it).", page: 213 },
    { text: "A sealed access point stops even a Xenomorph.", page: 56 },
    { text: "Where it goes: closer to the nearest crewmember by zone distance, preferring ducts and dark, cluttered rooms out of sight; hurt, it falls back into the ducts.", original: true },
  ],
};

/** A hostile android group on the site, or a job's android that turns on the crew. */
export const androidMover: MapMoverDef = {
  id: "android",
  label: "Android",
  zones: { stretch: 1, round: 1 },
  ducts: true,
  from: {
    markers: [
      { kind: "hostile", when: { "==": [{ var: "kind" }, "android"] } },
      // a job's android that turns on the crew (the job says so)
      { kind: "npc", when: { and: [{ "==": [{ var: "turns" }, true] }, { "==": [{ var: "role" }, "android"] }] } },
    ],
  },
  prefer: { approach: 1, duct: 0.5, revealed: -0.5, trail: -0.4 },
  postures: {
    hold: { approach: 0, home: -3, stay: 1.5 },
    guard: { approach: 0.5, home: -2, stay: 0.5 },
    patrol: { approach: 0.75, route: 1.5 },
  },
  hurt: { approach: -1.5, duct: 1.5, stay: -0.5 },
  notes: [
    { text: "Androids may use the ducts; people keep out of them.", original: true },
    { text: "One zone a stretch, like the crew; in a fight one zone a round, keeping its full action.", original: true },
  ],
};

/** Rogue humans: the site's hostile groups. */
export const humanMover: MapMoverDef = {
  id: "humans",
  label: "Rogue humans",
  zones: { stretch: 1, round: 1 },
  ducts: false,
  from: {
    markers: [{ kind: "hostile" }],
  },
  prefer: { approach: 0.5, stay: 0.5, revealed: -0.25, trail: -0.4 },
  postures: {
    // module decisions, after the hostile postures of the generator (hostiles.ts)
    hold: { approach: 0, home: -3, stay: 1.5 },
    guard: { approach: 0.5, home: -2, stay: 0.5 },
    patrol: { approach: 0.75, route: 1.5, stay: 0 },
  },
  hurt: { approach: -2, home: 0, stay: -0.5, cluttered: 1 },
  notes: [
    { text: "In stealth mode the crew moves one zone a stretch, then the GM moves the NPCs on the hidden map.", page: 55 },
    { text: "People keep out of the ducts.", original: true },
    { text: "Holding a room or guarding the objective, they stay near it; patrolling, they walk their waypoints and turn toward the crew; hurt, they fall back into cover.", original: true },
  ],
};

/**
 * The NPCs on the map (the job's people: a contact, a survivor, an android
 * crewmember) and the campaign's characters: named "NPC", never a hostile
 * label, whatever they turn out to be. Module decision: they move like the
 * crew, one zone a stretch, and keep to where the GM put them unless the GM
 * moves them.
 */
const npcPrefer = { approach: 0, stay: 1, revealed: -0.25, trail: -0.4 };
export const npcMover: MapMoverDef = {
  id: "npc",
  label: "NPC",
  zones: { stretch: 1, round: 1 },
  ducts: false,
  from: {
    markers: [{ kind: "npc", when: { "!=": [{ var: "role" }, "android"] } }],
    entities: [{ type: "alien.character", when: { "!": isAndroid } }],
  },
  prefer: npcPrefer,
  hurt: { approach: -1, stay: -0.5, cluttered: 1 },
  notes: [
    { text: "In stealth mode the crew moves one zone a stretch, then the GM moves the NPCs on the hidden map.", page: 55 },
    { text: "The job's people stay where the GM put them unless the GM moves them; none of them is marked hostile here.", original: true },
  ],
};

/** An android NPC (a synthetic crewmember or a job's android): like an NPC, but it may use the ducts. */
export const androidNpcMover: MapMoverDef = {
  id: "android-npc",
  label: "NPC (android)",
  zones: { stretch: 1, round: 1 },
  ducts: true,
  from: {
    markers: [{ kind: "npc", when: { "==": [{ var: "role" }, "android"] } }],
    entities: [{ type: "alien.character", when: isAndroid }],
  },
  prefer: npcPrefer,
  hurt: { approach: -1, duct: 1.5, stay: -0.5 },
  notes: [{ text: "Androids may use the ducts; people keep out of them.", original: true }],
};

const RANGE_TO_BAND: Record<string, string> = { short: "short", medium: "medium", long: "long", extreme: "extreme" };

const TRACKER_NOTES: MapHuntNote[] = [
  { text: "Once per stretch, after a power supply roll.", page: 58 },
  { text: "Picks up everyone within range, even out of sight, but only those that moved: a still target shows nothing.", page: 58 },
  { text: "A blip is not seeing them: no Observation roll, no target.", page: 58 },
  { text: "Range counts every border, walls and locked doors included: the tracker reads through them.", original: true },
  { text: "The bearing is the compass direction between zones on the deck plan; a duct reads from the room it opens into.", original: true },
  { text: "In a fight, a sweep reads movement in the current round; blips go stale when the next stretch or round begins.", original: true },
];

/** Motion trackers from the gear tables (p. 96): the item's range and page; "Motion tracker" on an NPC's gear is the M314. */
export const MOTION_TRACKER_IDS = ["alien.item.motion-tracker", "alien.item.m316-motion-tracker"] as const;

export const motionTrackers: MapSensorDef[] = MOTION_TRACKER_IDS.map((id) => {
  const p = toolPresets.find((x) => x.id === id);
  if (!p) throw new Error(`no item preset ${id}`);
  const range = String(p.fields.range ?? "long");
  const names = id === "alien.item.motion-tracker" ? [p.name, "Motion tracker"] : [p.name];
  return {
    id: id.replace(/^alien\.item\./, ""),
    label: p.name,
    carried: { names, presets: [id] },
    range: RANGE_TO_BAND[range] ?? "long",
    detects: "moved",
    through: "any",
    page: { pages: [58, 96] },
    notes: TRACKER_NOTES,
  };
});

export const ALIEN_HUNT: MapHuntDef = {
  steps: [
    { id: "stretch", label: "Stretch", page: 55 },
    { id: "round", label: "Round", page: 59 },
  ],
  movers: [creatureMover, androidMover, humanMover, npcMover, androidNpcMover],
  sensors: motionTrackers,
  gearPaths: ["gear"],
  blipLetters: [...SIGNAL_TOKEN_LETTERS],
  trail: 4,
  notes: [
    { text: "The GM moves hidden NPCs on a hidden copy of the map each stretch.", page: 56 },
    { text: "Suggested moves are the module's own heuristic: the GM accepts one, picks another zone or moves the token by hand.", original: true },
    { text: "Blip letters A-J match the Starter Set's signal tokens; the GM may name a blip by hand.", original: true },
  ],
  page: [55, 58],
};
