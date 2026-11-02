/**
 * Rogue humans on the site map (module-original): hostile groups built from
 * the book's typical NPCs (p. 258-259), with a tier and cost against the act
 * budget and a posture that says where they stand. Every figure here that
 * the book does not print (group tiers, postures, the minimum distance from
 * the start, who may use the ducts) is a module decision; the stat lines are
 * the presets' own, so no new numbers are invented.
 *
 * Placement rules (generator.ts):
 * - `hold`: a room of the act's region, security rooms first, never a key
 *   room, a win path or the start;
 * - `patrol`: a corridor, with up to three waypoints on a floor-only route
 *   to the act's focus;
 * - `guard`: the act's key room (the objective), else the room nearest it;
 * - people never hide in ducts; a hostile android may (it lurks at a duct
 *   junction or vent chamber when the site has one);
 * - nobody starts within `MIN_HOSTILE_DISTANCE` zones of the crew's start.
 */
import { npcPresets } from "../data/npc-presets";
import type { ThreatTier } from "./data";

export const HOSTILE_POSTURES = ["hold", "patrol", "guard"] as const;
export type HostilePosture = (typeof HOSTILE_POSTURES)[number];
export const HOSTILE_POSTURE_LABELS: Record<HostilePosture, string> = {
  hold: "Holds a room",
  patrol: "Patrols the corridors",
  guard: "Guards the objective",
};

export interface HostileGroup {
  id: string;
  /** Group name on the map and in the key. */
  name: string;
  /** NPC preset each member uses (p. 258-259). */
  preset: string;
  /** Preset of the one who gives the orders, when the group has one (counts as one of its members). */
  leader?: string;
  /** Tier of one member; groups follow `groupTier` (module decision). */
  tier: ThreatTier;
  posture: HostilePosture;
  /** May move and hide in ducts (androids only). */
  ducts?: boolean;
  /** One line for the GM: how they behave (module-original). */
  conduct: string;
  /** "rogue humans" or "android". */
  kind: "human" | "android";
}

const g = (x: HostileGroup): HostileGroup => x;

/** Module-original groups. Tiers: one armed person is a lesser foe; a trained killer or a combat android alone is a greater enemy (module decision, after p. 305). */
export const HOSTILE_GROUPS: HostileGroup[] = [
  g({
    id: "mercenaries",
    name: "Mercenary team",
    preset: "alien.npc.mercenary",
    leader: "alien.npc.squad-leader",
    tier: "lesser",
    posture: "guard",
    kind: "human",
    conduct: "Paid to keep everyone out of the objective. They negotiate once, then shoot.",
  }),
  g({
    id: "upp-squad",
    name: "UPP fire team",
    preset: "alien.npc.mercenary",
    leader: "alien.npc.squad-leader",
    tier: "lesser",
    posture: "patrol",
    kind: "human",
    conduct: "Soldiers on a deniable operation: they sweep the corridors in pairs and leave no witnesses.",
  }),
  g({
    id: "corporate-security",
    name: "Corporate security",
    preset: "alien.npc.security-guard",
    tier: "lesser",
    posture: "hold",
    kind: "human",
    conduct: "Company guards holding a checkpoint. They follow orders and call for backup before they fire.",
  }),
  g({
    id: "company-cleaner",
    name: "Company cleaner",
    preset: "alien.npc.corporate-killer",
    tier: "greater",
    posture: "patrol",
    kind: "human",
    conduct: "One professional sent to tidy up: picks off stragglers and avoids a fair fight.",
  }),
  g({
    id: "desperate-colonists",
    name: "Desperate colonists",
    preset: "alien.npc.homesteader",
    tier: "lesser",
    posture: "hold",
    kind: "human",
    conduct: "Barricaded, frightened and armed. They shoot at shadows; talking them down is possible.",
  }),
  g({
    id: "cultists",
    name: "Cultists",
    preset: "alien.npc.cultist",
    tier: "lesser",
    posture: "guard",
    kind: "human",
    conduct: "Zealots guarding what they believe is holy. They will not retreat and want converts or sacrifices.",
  }),
  g({
    id: "claim-jumpers",
    name: "Claim jumpers",
    preset: "alien.npc.thug",
    leader: "alien.npc.smuggler",
    tier: "lesser",
    posture: "hold",
    kind: "human",
    conduct: "A rival crew that got here first and means to keep the prize. They bargain, bluff and backstab.",
  }),
  g({
    id: "hostile-android",
    name: "Hostile android",
    preset: "alien.npc.android-covert",
    tier: "greater",
    posture: "patrol",
    ducts: true,
    kind: "android",
    conduct: "A synthetic running a directive. It uses the ducts, ignores the dark and does not tire.",
  }),
];

export const HOSTILE_GROUP_IDS = HOSTILE_GROUPS.map((x) => x.id);
export const hostileGroup = (id: string): HostileGroup | undefined => HOSTILE_GROUPS.find((x) => x.id === id);

/** Rogue humans keep this many zones between themselves and the crew's start (module decision): close enough to be met, not at the door. */
export const MIN_HOSTILE_DISTANCE = 3;
/** Most people in one hostile group. */
export const MAX_HOSTILE_COUNT = 8;

/** A preset's stat line for the zone key: "Mercenary/soldier: STR 5 AGI 4 WIT 3 EMP 2; Ranged Combat 3, ...; M41A Pulse Rifle". */
export function hostileStatLine(presetId: string): string {
  const p = npcPresets.find((x) => x.id === presetId);
  if (!p) return presetId;
  const a = p.fields.attributes as { strength: number; agility: number; wits: number; empathy: number };
  const skills = Object.entries((p.fields.skills ?? {}) as Record<string, number>)
    .filter(([, v]) => v > 0)
    .sort((x, y) => y[1] - x[1])
    .slice(0, 3)
    .map(([k, v]) => `${k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())} ${v}`);
  const weapon = ((p.fields.gear ?? []) as Array<{ name: string; itemId?: string }>).find((x) => /rifle|pistol|revolver|shotgun|gun|knife|baton/i.test(x.name))?.name;
  return `${p.name}: STR ${a.strength} AGI ${a.agility} WIT ${a.wits} EMP ${a.empathy}; ${skills.join(", ")}${weapon ? `; ${weapon}` : ""}`;
}
