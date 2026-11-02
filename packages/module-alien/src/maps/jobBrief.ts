/**
 * A job's site brief (module-original): what the site map generator needs to
 * build the place a job sends the crew to, read from the Job Generator's
 * rolls (p. 244-252). The mapping is the module's own decision, row by row:
 *
 * - site type from the destination row, with a few missions overriding it
 *   (salvage goes to a derelict, an anomaly to a ruin...);
 * - size and decks from the job's effective difficulty (the rolled D3 less
 *   one per betraying NPC, at least 1);
 * - a threat budget from effective difficulty: one threat slot per point,
 *   the first the Act 2 hunter (greater), the second the Act 3 threat
 *   (greater), the third an Act 1 lesser foe;
 * - which kinds fill the slots (aliens, other creatures, rogue humans) from
 *   scores the mission, destination, complications and plot twist add to;
 * - hazards and extra win paths from the complications and twist; key rooms
 *   from the mission; the job's NPCs as map NPCs.
 *
 * Every label of the mission (cargo), destination, complication and plot
 * twist tables has a row here (tested).
 */
import type { EntityMapBrief, EntitySnapshot, Rng } from "@campaign-forge/module-sdk";
import type { HazardId, NpcRole, SiteTypeId, WinPathId } from "./data";
import { HOSTILE_GROUPS, type HostilePosture } from "./hostiles";
import { PLACEABLE_CREATURES, type HostileInput, type KeyRoomInput, type NpcInput, type ThreatInput } from "./inputs";

export type ThreatKind = "aliens" | "monsters" | "humans";
export const THREAT_KINDS: readonly ThreatKind[] = ["aliens", "monsters", "humans"];
export const THREAT_KIND_LABELS: Record<ThreatKind, string> = { aliens: "Aliens (xenomorphs)", monsters: "Monsters (other creatures)", humans: "Rogue humans" };

type Score = Partial<Record<ThreatKind, number>>;

interface MissionRow {
  /** Key rooms the objective needs: [name, act, GM description]. */
  rooms: Array<[string, number, string]>;
  score?: Score;
  site?: SiteTypeId;
  wins?: WinPathId[];
  hazards?: HazardId[];
  /** Preferred hostile groups when rogue humans are dealt. */
  humans?: string[];
  posture?: HostilePosture;
}

const M = (rooms: MissionRow["rooms"], extra: Omit<MissionRow, "rooms"> = {}): MissionRow => ({ rooms, ...extra });

/** Space Truckers cargo (p. 245): the site is where it is delivered or picked up. */
const TRUCKERS_CARGO: Record<string, MissionRow> = {
  "Industrial Gases": M([["Receiving office", 1, "Where the consignment is signed for."], ["Storage tanks", 3, "The gas store the delivery tops up."]], { hazards: ["fire"] }),
  "Metal Ingots Or Pellets": M([["Receiving office", 1, "The clerk's desk."], ["Cargo hold", 3, "Where the ingots are stacked."]]),
  Colonists: M([["Cryo bay", 2, "Where the stasis pods are revived."], ["Command center", 3, "Who signs the colonists in."]], { score: { aliens: 1 } }),
  Timber: M([["Cargo hold", 2, "The timber store."], ["Office", 1, "The buyer's office."]], { score: { monsters: 1 } }),
  "Ice/Water": M([["Pump room", 2, "The water plant the ice feeds."], ["Storage", 3, "The cold store."]], { hazards: ["flooding"] }),
  "Industrial Chemicals": M([["Lab", 2, "Where the chemicals are tested on delivery."], ["Storage", 3, "The chemical store."]], { hazards: ["fire"] }),
  Fertilizer: M([["Hydroponics", 2, "The farm decks the fertilizer is for."], ["Storage", 3, "The silo."]]),
  Oil: M([["Pump room", 2, "The tank farm's pumps."], ["Storage", 3, "The tanks."]], { hazards: ["fire"] }),
  Foodstuff: M([["Galley", 1, "The kitchens waiting on supplies."], ["Cold storage", 3, "The food store."]]),
  Ore: M([["Ore processing", 2, "The refinery the ore feeds."], ["Office", 1, "The buyer's office."]]),
  "Medicinal Goods": M([["Medlab", 2, "The clinic short of supplies."], ["Cold storage", 3, "The drug store."]], { score: { aliens: 1 } }),
  "Technical Parts": M([["Workshop", 2, "The machine shop waiting on spares."], ["Storage", 3, "The parts store."]]),
  "Starship Technical Parts": M([["Hangar", 2, "The dock the parts are for."], ["Workshop", 3, "Where they are fitted."]]),
  "Pressure Suits": M([["Airlock", 2, "The suit store by the lock."], ["Storage", 3, "The locker room."]], { hazards: ["vacuum"] }),
  "Single Oversized Item": M([["Hangar", 2, "The only bay big enough."], ["Reactor", 3, "Where the item is installed."]]),
  Vehicles: M([["Vehicle bay", 2, "The garage the vehicles go to."], ["Workshop", 3, "The repair shop."]]),
  "Weapons & Armor": M([["Armory", 2, "Where the guns are locked up."], ["Security station", 3, "Who signs for them."]], { score: { humans: 2 }, humans: ["claim-jumpers", "corporate-security"] }),
  Radioactives: M([["Reactor", 3, "The plant that burns the fuel."], ["Containment", 2, "The shielded store."]], { hazards: ["radiation"] }),
  "Colony Construction": M([["Storage", 2, "The construction yard."], ["Command center", 3, "The site office."]]),
  "Animal Feed": M([["Storage", 2, "The feed store."], ["Hydroponics", 3, "The pens."]], { score: { monsters: 1 } }),
  "Livestock/Animals": M([["Cargo hold", 2, "The pens the cattle go to."], ["Cryo bay", 3, "Where the stasis pods are revived."]], { score: { monsters: 1 } }),
  "Wreckage/Salvage": M([["Hangar", 2, "Where the wreck is brought in."], ["Data center", 3, "What its logs say."]], { site: "derelict", score: { aliens: 2 } }),
};

/** Colonial Marines missions (p. 248). */
const MARINES_MISSIONS: Record<string, MissionRow> = {
  Recon: M([["Comms room", 1, "Where the intelligence is."], ["Command center", 3, "The objective to report on."]], { wins: ["signal"], score: { humans: 1 }, humans: ["upp-squad"] }),
  Assault: M([["Security station", 2, "The defenders' strongpoint."], ["Command center", 3, "The objective to take."]], { score: { humans: 3 }, humans: ["upp-squad", "mercenaries"], posture: "guard" }),
  Defense: M([["Command center", 1, "What must be held."], ["Armory", 2, "The ammunition."]], { wins: ["seal_section"], score: { humans: 3 }, humans: ["upp-squad", "mercenaries"], posture: "patrol" }),
  "Combat patrol": M([["Security station", 2, "The enemy's forward post."], ["Comms room", 3, "Where they call for support."]], { score: { humans: 3 }, humans: ["upp-squad"], posture: "patrol" }),
  Sabotage: M([["Comms room", 2, "The uplink to destroy."], ["Reactor", 3, "The power behind it."]], { wins: ["self_destruct"], score: { humans: 3 }, humans: ["upp-squad", "mercenaries"], posture: "guard" }),
  Raid: M([["Armory", 2, "The target of opportunity."], ["Data center", 3, "Their records."]], { wins: ["self_destruct"], score: { humans: 3 }, humans: ["upp-squad"] }),
  "Search And Rescue": M([["Medlab", 2, "Where survivors gathered."], ["Comms room", 3, "Where the last call came from."]], { wins: ["signal"], score: { aliens: 1, monsters: 1 } }),
  Peacekeeping: M([["Security station", 1, "The marshal's office."], ["Comms room", 3, "The services to protect."]], { wins: ["seal_section"], score: { humans: 3 }, humans: ["desperate-colonists", "cultists"], posture: "hold" }),
  "Bug Hunt": M([["Lab", 2, "Where the first one was found."], ["Hatchery", 3, "The nest."]], { wins: ["self_destruct"], score: { aliens: 4 } }),
  "Civil Evacuation": M([["Mess hall", 1, "Where the civilians are gathered."], ["Hangar", 3, "The way out."]], { score: { aliens: 1, monsters: 1, humans: 1 }, humans: ["desperate-colonists"] }),
  "Space Assault": M([["Airlock", 1, "The breach point."], ["Command center", 3, "The bridge to seize."]], { wins: ["airlock"], score: { humans: 3 }, humans: ["upp-squad", "mercenaries"], posture: "guard" }),
  "Space Traffic Security": M([["Cargo hold", 2, "The contraband."], ["Command center", 3, "The suspect ship's bridge."]], { site: "starship", score: { humans: 2 }, humans: ["claim-jumpers"] }),
  "Snatch And Grab": M([["Containment", 2, "Who or what is to be taken."], ["Hangar", 3, "The extraction point."]], { score: { humans: 3 }, humans: ["mercenaries", "corporate-security"], posture: "guard" }),
  Investigation: M([["Comms room", 1, "Why the site went silent."], ["Data center", 3, "What the logs show."]], { wins: ["signal"], score: { aliens: 2, humans: 1 } }),
};

/** Frontier Colonists expedition missions (p. 250). */
const COLONISTS_MISSIONS: Record<string, MissionRow> = {
  Salvage: M([["Cargo hold", 2, "The valuables."], ["Data center", 3, "Why it was abandoned."]], { site: "derelict", score: { aliens: 1, humans: 1 }, humans: ["claim-jumpers"] }),
  Survey: M([["Comms room", 1, "The survey uplink."], ["Data center", 3, "The sensor records to bring back."]], { score: { monsters: 2 } }),
  Mining: M([["Drill head", 2, "The test bore."], ["Ore processing", 3, "The assay."]], { site: "mine", score: { monsters: 1, humans: 1 }, humans: ["claim-jumpers"] }),
  "Colony Assistance": M([["Workshop", 1, "What needs fixing."], ["Life support", 3, "What keeps them alive."]], { score: { humans: 1 }, humans: ["desperate-colonists"] }),
  Prospecting: M([["Office", 1, "The claim office."], ["Drill head", 3, "The claim itself."]], { score: { humans: 2, monsters: 1 }, humans: ["claim-jumpers"] }),
  "Data Collection": M([["Data center", 2, "The information."], ["Lab", 3, "What it is about."]], { score: { humans: 1, aliens: 1 }, humans: ["corporate-security", "company-cleaner"] }),
  Courier: M([["Office", 1, "Who signs for it."], ["Security station", 3, "Where it is locked up."]], { score: { humans: 2 }, humans: ["company-cleaner", "claim-jumpers"] }),
  "Anomaly Exploration": M([["Glyph hall", 2, "The phenomenon."], ["Pilot chamber", 3, "Its source."]], { site: "alien_ruin", score: { monsters: 2, aliens: 1 } }),
  "Rescue Expedition": M([["Medlab", 2, "Where the survivors hold out."], ["Comms room", 3, "Their last signal."]], { wins: ["signal"], score: { aliens: 1, monsters: 1, humans: 1 }, humans: ["desperate-colonists"] }),
};

/** Destinations (p. 246, 248, 251): the generator's site type, and the kinds of threat the place suggests. */
const DESTINATIONS: Record<string, { site: SiteTypeId; score?: Score; humans?: string[] }> = {
  // Space Truckers
  "Only Coordinates": { site: "derelict", score: { aliens: 1 } },
  "Hostile Forest/Jungles/Desert": { site: "colony_block", score: { monsters: 2 } },
  Mine: { site: "mine", score: { monsters: 1 } },
  Spaceport: { site: "station_deck", score: { humans: 1 }, humans: ["claim-jumpers"] },
  "Asteroid/Moon": { site: "mine" },
  "Space Station": { site: "station_deck", score: { humans: 1 }, humans: ["corporate-security"] },
  "Earth, Gateway Station": { site: "station_deck", score: { humans: 1 }, humans: ["corporate-security"] },
  "Young Colony": { site: "colony_block", score: { monsters: 1 }, humans: ["desperate-colonists"] },
  "Established Colony": { site: "colony_block", score: { humans: 1 }, humans: ["desperate-colonists", "corporate-security"] },
  Starship: { site: "starship" },
  Outpost: { site: "research_lab", score: { aliens: 1 } },
  // Colonial Marines
  Colony: { site: "colony_block", humans: ["desperate-colonists"] },
  "Isolated Outpost": { site: "research_lab", score: { aliens: 1 } },
  "Starship In Orbit": { site: "starship", score: { humans: 1 } },
  "Orbital Space Station": { site: "station_deck", score: { humans: 1 } },
  "Wilderness Location": { site: "colony_block", score: { monsters: 2 } },
  "Planetary Warzone": { site: "colony_block", score: { humans: 2 }, humans: ["upp-squad", "mercenaries"] },
  "Isolated Spaceport": { site: "station_deck", score: { humans: 1 } },
  "Scattered Homesteads": { site: "colony_block", score: { monsters: 1 }, humans: ["desperate-colonists"] },
  "Mine And Refinery": { site: "mine", humans: ["desperate-colonists"] },
  "Prison Complex": { site: "colony_block", score: { humans: 2 }, humans: ["claim-jumpers", "cultists"] },
  "Radar/Sensor Site": { site: "research_lab" },
  "Impenetrable Area": { site: "mine", score: { monsters: 2 } },
  // Frontier Colonists
  "Abandoned Orbital Station": { site: "derelict", score: { aliens: 1 } },
  "Rogue Asteroid": { site: "mine", score: { monsters: 1 } },
  "Abandoned Mine": { site: "mine", score: { monsters: 1, aliens: 1 } },
  Moon: { site: "mine" },
  "Asteroid Belt": { site: "mine" },
  "Colonized World": { site: "colony_block", humans: ["desperate-colonists"] },
  "Terrestrial Planet": { site: "research_lab", score: { monsters: 2 } },
  "Abandoned Colony": { site: "colony_block", score: { aliens: 1, monsters: 1 } },
  "Ice Planet": { site: "research_lab", score: { monsters: 1 } },
  Wreckage: { site: "derelict", score: { aliens: 1 } },
  "Wreckage (roll again or choose)": { site: "derelict", score: { aliens: 1 } },
};

interface TwistRow {
  score?: Score;
  hazards?: HazardId[];
  wins?: WinPathId[];
  humans?: string[];
  /** One line for the brief summary. */
  note?: string;
}
const T = (x: TwistRow): TwistRow => x;

/** Complications (p. 246, 249, 251). */
const COMPLICATIONS: Record<string, TwistRow> = {
  // Space Truckers
  "Embargo/Quarantine": T({ score: { humans: 1 }, wins: ["seal_section"], humans: ["corporate-security"] }),
  Intermission: T({}),
  Military: T({ score: { humans: 2 }, humans: ["upp-squad", "mercenaries"] }),
  Delay: T({}),
  Maintenance: T({ hazards: ["fire"] }),
  "Waiting Game": T({ score: { humans: 1 }, humans: ["desperate-colonists"] }),
  "Cargo Mishap": T({ hazards: ["fire", "radiation"] }),
  Wreckage: T({ score: { aliens: 1 }, hazards: ["vacuum"] }),
  // Colonial Marines
  "Role Reversal": T({ score: { humans: 2 }, humans: ["desperate-colonists"] }),
  Passengers: T({ score: { humans: 1 } }),
  Observer: T({}),
  "Company Meddling": T({ score: { humans: 1 }, humans: ["corporate-security", "company-cleaner"] }),
  "Civilian Advisor": T({}),
  Captured: T({ score: { humans: 2 }, humans: ["mercenaries", "cultists"] }),
  "Gear Problems": T({}),
  "Tough Resistance": T({ score: { humans: 3 }, humans: ["mercenaries", "upp-squad"] }),
  Trapped: T({ wins: ["seal_section"] }),
  "Under Fire!": T({ hazards: ["fire", "vacuum"], score: { humans: 1 } }),
  "Glory Hound": T({}),
  Traps: T({ hazards: ["fire"], score: { monsters: 1 } }),
  Restrictions: T({}),
  "Green Commander": T({}),
  // Frontier Colonists
  "Natural Phenomenon": T({ hazards: ["fire", "flooding"], score: { monsters: 1 } }),
  "Survey Blues": T({ score: { monsters: 1 } }),
  "Presumed Missing": T({ score: { aliens: 1, monsters: 1 } }),
  "Rival Expedition": T({ score: { humans: 3 }, humans: ["claim-jumpers", "mercenaries"] }),
  Quarantine: T({ wins: ["seal_section"], score: { aliens: 1 } }),
  "Deadly Treasure": T({ score: { aliens: 3 }, hazards: ["radiation"] }),
  Surveillance: T({ score: { humans: 1 }, humans: ["company-cleaner"] }),
};

/** Plot twists (p. 252). */
const TWISTS: Record<string, TwistRow> = {
  Mayday: T({ wins: ["signal"], score: { aliens: 1, monsters: 1 } }),
  "Bad Intel": T({ score: { humans: 1 } }),
  Sabotage: T({ hazards: ["fire", "vacuum"], score: { humans: 1 }, humans: ["company-cleaner"] }),
  "Secret Plot": T({ score: { humans: 2 }, humans: ["company-cleaner", "corporate-security"] }),
  Murder: T({ score: { humans: 1 }, humans: ["company-cleaner"] }),
  "Flare Event": T({ hazards: ["radiation"] }),
  Malfunction: T({ hazards: ["zero_g"] }),
  "Time Limit": T({ wins: ["self_destruct"] }),
  "Xenomorph Outbreak": T({ score: { aliens: 5 } }),
};

/** Every row label the mapping covers, per table family (for the coverage test). */
export const JOB_BRIEF_ROWS = {
  missions: { truckers: Object.keys(TRUCKERS_CARGO), marines: Object.keys(MARINES_MISSIONS), colonists: Object.keys(COLONISTS_MISSIONS) },
  destinations: Object.keys(DESTINATIONS),
  complications: Object.keys(COMPLICATIONS),
  twists: Object.keys(TWISTS),
};

/** Creature presets per kind and tier the brief deals from (filtered to placeable presets). */
const CREATURE_POOLS: Record<"aliens" | "monsters", Record<"lesser" | "greater", string[]>> = {
  aliens: {
    lesser: ["alien.creature.xx121-facehugger", "alien.creature.xx121-chestburster"],
    greater: ["alien.creature.xx121-drone", "alien.creature.xx121-scout", "alien.creature.xx121-stalker", "alien.creature.xx121-soldier"],
  },
  monsters: {
    lesser: ["alien.creature.neomorph-neophyte", "alien.creature.tanakan-scorpionid", "alien.creature.harvester-juvenile", "alien.creature.neomorph-bloodburster"],
    greater: ["alien.creature.neomorph-adult", "alien.creature.lion-worm", "alien.creature.swarm"],
  },
};
const placeable = new Set(PLACEABLE_CREATURES.map((p) => p.id));
const pool = (kind: "aliens" | "monsters", tier: "lesser" | "greater") => CREATURE_POOLS[kind][tier].filter((id) => placeable.has(id));

/** Rogue humans by frame when nothing in the job names a group. */
const FRAME_HUMANS: Record<string, string[]> = {
  "space-truckers": ["claim-jumpers", "corporate-security", "desperate-colonists"],
  "colonial-marines": ["upp-squad", "mercenaries", "cultists"],
  "frontier-colonists": ["claim-jumpers", "desperate-colonists", "mercenaries", "cultists"],
};

/** The threat slots by effective difficulty (module decision): the Act 2 hunter, then the Act 3 threat, then an Act 1 lesser foe. */
export const THREAT_SLOTS: Array<{ act: number; tier: "lesser" | "greater"; humans: number }> = [
  { act: 2, tier: "greater", humans: 3 },
  { act: 3, tier: "greater", humans: 4 },
  { act: 1, tier: "lesser", humans: 1 },
];

/** Size and decks by effective difficulty (module decision). Ships and stations get a second deck at 2. */
export const SIZE_BY_DIFFICULTY: Record<number, { size: "small" | "medium" | "large"; decks: number }> = { 1: { size: "small", decks: 1 }, 2: { size: "medium", decks: 1 }, 3: { size: "large", decks: 2 } };
const TALL_SITES: readonly SiteTypeId[] = ["starship", "station_deck", "research_lab"];

export interface JobBriefNpc {
  name: string;
  /** The map role, or undefined when the NPC stays away from the site (e.g. the contact). */
  mapRole?: NpcRole;
  note?: string;
  turns?: boolean;
}

export interface JobBriefFacts {
  frame: string;
  /** Mission label (or the cargo, for Space Truckers). */
  mission: string;
  /** The destination row label (Wreckage for a wreck). */
  destination: string;
  complications: string[];
  plotTwist?: string;
  /** Effective difficulty (1-3). */
  difficulty: number;
  pcCount: number;
  npcs: JobBriefNpc[];
}

/** The site brief stored on a job (`fields.siteBrief`): generator inputs plus why. Data only. */
export interface JobSiteBrief {
  generator: string;
  inputs: {
    site_type: SiteTypeId;
    size: "small" | "medium" | "large";
    decks: number;
    crew: number;
    runtime_h: number;
    threats: ThreatInput[];
    hostiles: HostileInput[];
    duct_density: "normal";
    darkness: number;
    hazards: HazardId[];
    win_paths: WinPathId[];
    key_rooms: KeyRoomInput[];
    puzzles: never[];
    npcs: NpcInput[];
  };
  /** The difficulty the brief was built for. */
  difficulty: number;
  /** Which kinds of threat it holds, strongest first, with their scores. */
  mix: Array<{ kind: ThreatKind; score: number }>;
  /** GM-only lines on how the brief was read from the job. */
  summary: string[];
}

function missionRow(frame: string, mission: string): MissionRow | undefined {
  if (frame === "colonial-marines") return MARINES_MISSIONS[mission];
  if (frame === "frontier-colonists") return COLONISTS_MISSIONS[mission];
  return TRUCKERS_CARGO[mission];
}

const add = (into: Record<ThreatKind, number>, s: Score | undefined, why: string, reasons: Record<ThreatKind, string[]>) => {
  for (const k of THREAT_KINDS) {
    const v = s?.[k];
    if (v) {
      into[k] += v;
      reasons[k].push(why);
    }
  }
};

const pickOne = <T>(rng: Rng, list: readonly T[]): T | undefined => (list.length === 0 ? undefined : list[rng.int(0, list.length - 1)]);
const uniq = <T>(xs: T[]): T[] => [...new Set(xs)];

/** Build a job's site brief. Deterministic for (facts, rng). */
export function jobSiteBrief(facts: JobBriefFacts, rng: Rng): JobSiteBrief {
  const difficulty = Math.max(1, Math.min(3, Math.round(facts.difficulty)));
  const mission = missionRow(facts.frame, facts.mission);
  const dest = DESTINATIONS[facts.destination];
  const comps = facts.complications.map((c) => COMPLICATIONS[c]).filter((x): x is TwistRow => !!x);
  const twist = facts.plotTwist ? TWISTS[facts.plotTwist] : undefined;
  const summary: string[] = [];

  // Site type: the mission's own site wins, else the destination's.
  const site: SiteTypeId = mission?.site ?? dest?.site ?? "station_deck";
  summary.push(`Site: ${site.replace(/_/g, " ")} (${mission?.site ? `the ${facts.mission.toLowerCase()} mission` : `destination: ${facts.destination}`}).`);
  const { size, decks: baseDecks } = SIZE_BY_DIFFICULTY[difficulty]!;
  const decks = difficulty === 2 && TALL_SITES.includes(site) ? 2 : baseDecks;
  summary.push(`Built for difficulty ${difficulty}: ${size}, ${decks} deck${decks === 1 ? "" : "s"}, ${difficulty} threat${difficulty === 1 ? "" : "s"}.`);

  // Threat kinds: a base point each, then what the job adds.
  const scores: Record<ThreatKind, number> = { aliens: 1, monsters: 1, humans: 1 };
  const reasons: Record<ThreatKind, string[]> = { aliens: [], monsters: [], humans: [] };
  add(scores, mission?.score, facts.mission, reasons);
  add(scores, dest?.score, facts.destination, reasons);
  facts.complications.forEach((c, i) => add(scores, comps[i]?.score, c, reasons));
  if (facts.plotTwist) add(scores, twist?.score, facts.plotTwist, reasons);
  // ties go aliens, then monsters, then humans; a small jitter breaks ties between jobs that score the same
  const jitter = Object.fromEntries(THREAT_KINDS.map((k) => [k, rng.next() * 0.1])) as Record<ThreatKind, number>;
  const mix = THREAT_KINDS.map((kind) => ({ kind, score: scores[kind] })).sort((a, b) => b.score + jitter[b.kind] - (a.score + jitter[a.kind]));
  // which kinds fill the slots: the strongest always; the next ones when they score 3+ (or 2+ at difficulty 3)
  const kinds: ThreatKind[] = [mix[0]!.kind];
  for (const m of mix.slice(1)) if (m.score >= 3 || (difficulty === 3 && m.score >= 2)) kinds.push(m.kind);

  const humanPrefs = uniq([...(mission?.humans ?? []), ...comps.flatMap((c) => c.humans ?? []), ...(twist?.humans ?? []), ...(dest?.humans ?? []), ...(FRAME_HUMANS[facts.frame] ?? [])]).filter((id) => HOSTILE_GROUPS.some((g) => g.id === id && g.kind === "human"));
  const threats: ThreatInput[] = [];
  const hostiles: HostileInput[] = [];
  const usedGroups = new Set<string>();
  for (let i = 0; i < difficulty; i++) {
    const slot = THREAT_SLOTS[i]!;
    const kind = kinds[i % kinds.length]!;
    const r = rng.fork(`slot:${i}`);
    if (kind === "humans") {
      const fresh = humanPrefs.filter((id) => !usedGroups.has(id));
      // the job's own reasons first: the first named group, else one of the frame's
      const group = (fresh.length > 0 ? (r.next() < 0.7 ? fresh[0] : pickOne(r, fresh.slice(0, 3))) : pickOne(r, humanPrefs)) ?? "mercenaries";
      usedGroups.add(group);
      const g = HOSTILE_GROUPS.find((x) => x.id === group)!;
      const count = g.tier === "greater" ? 1 : slot.humans;
      const posture: HostilePosture = i === 0 && mission?.posture ? mission.posture : g.posture;
      hostiles.push({ group, act: slot.act, count, posture });
    } else {
      const creature = pickOne(r, pool(kind, slot.tier)) ?? "alien.creature.xx121-drone";
      threats.push({ creature, act: slot.act, count: 1 });
    }
  }
  summary.push(
    `Threats: ${kinds.map((k) => `${THREAT_KIND_LABELS[k].toLowerCase()}${reasons[k].length ? ` (${uniq(reasons[k]).join(", ")})` : ""}`).join("; ")}.`,
  );

  // Hazards: the hull's own, then what the complications and twist add.
  const space = site === "starship" || site === "station_deck" || site === "derelict";
  const hazards = uniq<HazardId>([...(space ? (["vacuum"] as HazardId[]) : []), "fire", ...(mission?.hazards ?? []), ...comps.flatMap((c) => c.hazards ?? []), ...(twist?.hazards ?? [])]);
  const win_paths = uniq<WinPathId>(["escape_craft", ...(mission?.wins ?? []), ...comps.flatMap((c) => c.wins ?? []), ...(twist?.wins ?? [])]).slice(0, 3);
  const key_rooms: KeyRoomInput[] = (mission?.rooms ?? [["Command center", 3, "The objective."]]).map(([name, act, description]) => ({ name, act, description }));

  // The job's NPCs who are at the site (or come along); betrayers always are.
  const npcs: NpcInput[] = facts.npcs.filter((n) => n.mapRole).map((n) => ({ name: n.name, role: n.mapRole!, ...(n.note ? { note: n.note } : {}), ...(n.turns ? { turns: true } : {}) }));
  const crew = Math.max(1, Math.min(5, facts.pcCount + npcs.filter((n) => n.role === "crew").length));
  if (npcs.some((n) => n.turns)) summary.push(`Turns on the crew: ${npcs.filter((n) => n.turns).map((n) => n.name).join(", ")}.`);

  return {
    generator: "alien.map.site",
    inputs: {
      site_type: site,
      size,
      decks,
      crew,
      runtime_h: difficulty === 1 ? 3 : 4,
      threats,
      hostiles,
      duct_density: "normal",
      darkness: 30 + 10 * difficulty,
      hazards,
      win_paths,
      key_rooms,
      puzzles: [],
      npcs,
    },
    difficulty,
    mix,
    summary,
  };
}

const isRec = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** The site map generator's brief from a job entity that carries one (`fields.siteBrief`). */
export function briefFromJob(entity: EntitySnapshot): EntityMapBrief | undefined {
  if (entity.type !== "alien.job") return undefined;
  const brief = entity.fields.siteBrief;
  if (!isRec(brief) || !isRec(brief.inputs)) return undefined;
  const destination = typeof entity.fields.destination === "string" && entity.fields.destination.trim() ? entity.fields.destination.trim() : entity.name;
  return {
    inputs: JSON.parse(JSON.stringify(brief.inputs)) as Record<string, unknown>,
    name: `${entity.name}: site map`,
    summary: Array.isArray(brief.summary) ? brief.summary.filter((x): x is string => typeof x === "string") : [],
    site: { name: `${destination} (job site)`, type: "alien.location", subtype: "site", summary: `Where the job ${entity.name} takes the crew.`, relationship: "site_of" },
  };
}
