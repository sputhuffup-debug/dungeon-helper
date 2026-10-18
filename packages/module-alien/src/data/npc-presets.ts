import type { AlienPreset } from "./types";
import { itemPresets } from "./items";

/**
 * Typical NPCs (Evolved Edition p. 258-259; NPC guidance p. 155-157).
 *
 * Checked against the book: the 25 rows of the typical NPC list with their
 * attributes, skills, talent and gear. Health is printed in the book but is
 * never stored: the character entity computes it (Strength + Agility halved,
 * rounded up, plus Hardened), and every printed value matches that formula.
 *
 * The book gives these NPCs no career, trait, goal or appearance; the GM
 * supplies those when using one (p. 157), so the presets leave them empty.
 * Gear keeps the book's wording; `itemId` links the item preset where one
 * exists, and the weight is read from that preset (otherwise the book's gear
 * weight, or 0 for tiny items).
 */

type Skills = Partial<Record<
  "heavyMachinery" | "closeCombat" | "stamina" | "rangedCombat" | "mobility" | "piloting" | "observation" | "survival" | "comtech" | "manipulation" | "command" | "medicalAid",
  number
>>;

interface GearSpec {
  /** Name as printed in the NPC list. */
  name: string;
  qty?: number;
  /** Candidate item preset ids (without the `alien.item.` prefix), best first. */
  items?: string[];
  /** Weight when no item preset matches: the book's gear weight, or 0 for tiny items. */
  weight?: number;
}

interface NpcSpec {
  id: string;
  name: string;
  summary: string;
  android?: boolean;
  attributes: { strength: number; agility: number; wits: number; empathy: number };
  skills: Skills;
  talent?: string;
  gear?: GearSpec[];
  cash?: number;
}

const PAGE: [number, number] = [258, 259];

const itemsById = new Map(itemPresets.map((p) => [p.id, p]));
const normalize = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const itemsByName = new Map(itemPresets.map((p) => [normalize(p.name), p]));

/** Find the item preset for a gear line: candidate ids first, then an exact name match. */
function resolveItem(g: GearSpec) {
  for (const id of g.items ?? []) {
    const hit = itemsById.get(`alien.item.${id}`);
    if (hit) return hit;
  }
  return itemsByName.get(normalize(g.name));
}

function gearLine(g: GearSpec): Record<string, unknown> {
  const item = resolveItem(g);
  const w = item?.fields["weight"];
  const line: Record<string, unknown> = { name: g.name, weight: typeof w === "number" ? w : (g.weight ?? 0), qty: g.qty ?? 1 };
  if (item) line.itemId = item.id;
  return line;
}

function npc(spec: NpcSpec): AlienPreset {
  const { id, name, summary, android = false, attributes, skills, talent, gear = [], cash = 0 } = spec;
  return {
    id: `alien.npc.${id}`,
    entityType: "alien.character",
    name,
    summary,
    page: PAGE,
    tags: ["npc", ...(android ? ["android"] : [])],
    fields: {
      isPC: false,
      android,
      attributes,
      skills,
      talents: talent ? [{ id: talent, count: 1 }] : [],
      stress: 0,
      gear: gear.map(gearLine),
      cash,
    },
  };
}

export const npcPresets: AlienPreset[] = [
  npc({
    id: "android-covert",
    name: "Android, covert",
    summary: "A synthetic passing as human, built for physical work and violence.",
    android: true,
    attributes: { strength: 7, agility: 6, wits: 3, empathy: 1 },
    skills: { closeCombat: 3, heavyMachinery: 2, rangedCombat: 2, comtech: 2, survival: 1 },
    talent: "cunning",
  }),
  npc({
    id: "android-curious",
    name: "Android, curious",
    summary: "A synthetic with a sharp, inquisitive mind and an eye for detail.",
    android: true,
    attributes: { strength: 4, agility: 3, wits: 7, empathy: 3 },
    skills: { stamina: 2, mobility: 2, comtech: 3, observation: 3 },
  }),
  npc({
    id: "android-refurbished",
    name: "Android, refurbished",
    summary: "A second-hand synthetic kept running as a pilot and ship's mechanic.",
    android: true,
    attributes: { strength: 6, agility: 6, wits: 3, empathy: 2 },
    skills: { heavyMachinery: 2, piloting: 4, comtech: 2, observation: 2 },
    talent: "spaceship-mechanic",
  }),
  npc({
    id: "asteroid-miner",
    name: "Asteroid miner",
    summary: "A rock-hopper at home in vacuum and heavy machinery.",
    attributes: { strength: 4, agility: 4, wits: 3, empathy: 3 },
    skills: { heavyMachinery: 3, stamina: 2, piloting: 1, observation: 3, survival: 1 },
    talent: "eva-specialist",
    gear: [{ name: "Survival suit", items: ["eco-all-world-survival-suit"] }, { name: "Cutting torch", items: ["cutting-torch"] }, { name: "Bolt gun", items: ["watatsumi-dv-303-bolt-gun"] }],
  }),
  npc({
    id: "marshal",
    name: "Colonial Marshal",
    summary: "A frontier lawman with a shotgun and a nose for trouble.",
    attributes: { strength: 4, agility: 4, wits: 4, empathy: 2 },
    skills: { closeCombat: 2, mobility: 1, rangedCombat: 3, observation: 2, manipulation: 1, medicalAid: 1 },
    talent: "investigator",
    gear: [{ name: "Pump-action shotgun", items: ["armat-37a2-pump-shotgun"] }, { name: "Handcuffs" }, { name: "Flashlight", items: ["flashlight"] }],
  }),
  npc({
    id: "kid",
    name: "Colonist child",
    summary: "A colony kid: quick, observant and hard to catch.",
    attributes: { strength: 1, agility: 5, wits: 4, empathy: 4 },
    skills: { mobility: 4, observation: 3, survival: 2, manipulation: 1 },
    talent: "hard-to-catch",
    gear: [{ name: "Toy or doll" }],
  }),
  npc({
    id: "colony-manager",
    name: "Colony manager",
    summary: "The administrator who keeps a colony running and gives the orders.",
    attributes: { strength: 2, agility: 4, wits: 3, empathy: 5 },
    skills: { heavyMachinery: 1, stamina: 2, comtech: 1, survival: 1, command: 3, manipulation: 2 },
    gear: [{ name: "Penlight" }, { name: "Motion tracker", items: ["motion-tracker"] }, { name: "Seegson P-DAT", items: ["seegson-p-dat"], weight: 0.5 }],
  }),
  npc({
    id: "company-bureaucrat",
    name: "Company bureaucrat",
    summary: "A corporate functionary who knows the systems and the paperwork.",
    attributes: { strength: 2, agility: 3, wits: 4, empathy: 5 },
    skills: { observation: 3, comtech: 3, manipulation: 2, medicalAid: 2 },
    talent: "personal-safety",
    gear: [{ name: "PDT", items: ["pr-put-personal-data-transmitter"] }, { name: "Seegson P-DAT", items: ["seegson-p-dat"], weight: 0.5 }],
  }),
  npc({
    id: "comtech",
    name: "Comtech",
    summary: "A computer and communications specialist who can also fly.",
    attributes: { strength: 2, agility: 3, wits: 5, empathy: 4 },
    skills: { piloting: 2, comtech: 4, observation: 2 },
    talent: "stoic",
    gear: [{ name: "Systems diagnostic device", items: ["seegson-system-diagnostic-device", "seegson-c-series-diagnostic"] }, { name: "Electronic tools", items: ["electronic-tools", "electronic-tool-kit"] }],
  }),
  npc({
    id: "corporate-exec",
    name: "Corporate executive",
    summary: "A senior company officer who commands, persuades and pays.",
    attributes: { strength: 2, agility: 3, wits: 5, empathy: 4 },
    skills: { observation: 3, command: 3, manipulation: 4 },
    talent: "cunning",
    gear: [{ name: "Penlight" }, { name: "PDT", items: ["pr-put-personal-data-transmitter"] }, { name: "Voice recorder" }],
    cash: 2000,
  }),
  npc({
    id: "corporate-killer",
    name: "Corporate killer",
    summary: "A company assassin and marksman.",
    attributes: { strength: 4, agility: 5, wits: 4, empathy: 1 },
    skills: { closeCombat: 3, mobility: 1, rangedCombat: 4, observation: 2 },
    talent: "stealthy",
    gear: [{ name: "M42A Scope Rifle", items: ["armat-m42a-scope-rifle"] }, { name: "Combat knife", items: ["knife"] }, { name: "Medkit", items: ["personal-medkit", "medkit"] }],
  }),
  npc({
    id: "cultist",
    name: "Cultist",
    summary: "A zealot who fights and preaches with equal conviction.",
    attributes: { strength: 4, agility: 3, wits: 2, empathy: 5 },
    skills: { closeCombat: 3, rangedCombat: 2, observation: 2, manipulation: 3 },
    gear: [{ name: "Knife", items: ["knife"] }, { name: "Recreational drugs", items: ["recreational-drugs"] }, { name: ".357 revolver", items: ["357-magnum-revolver"] }],
  }),
  npc({
    id: "homesteader",
    name: "Homesteader",
    summary: "A self-reliant settler who fixes, drives and defends the homestead.",
    attributes: { strength: 5, agility: 3, wits: 3, empathy: 3 },
    skills: { heavyMachinery: 4, stamina: 2, piloting: 1, comtech: 2, medicalAid: 1 },
    gear: [{ name: "Armat Model 37A2 12 gauge pump action shotgun", items: ["armat-37a2-pump-shotgun"] }, { name: "Flashlight", items: ["flashlight"] }],
  }),
  npc({
    id: "icc-inspector",
    name: "ICC Inspector",
    summary: "An Interstellar Commerce Commission official checking cargo, crews and licenses.",
    attributes: { strength: 3, agility: 3, wits: 5, empathy: 3 },
    skills: { comtech: 2, observation: 4, command: 2, manipulation: 2 },
    talent: "investigator",
    gear: [{ name: "Seegson P-DAT", items: ["seegson-p-dat"], weight: 0.5 }, { name: "Voice recorder" }],
  }),
  npc({
    id: "medic",
    name: "Medical doctor",
    summary: "A physician and surgeon with a steady bedside manner.",
    attributes: { strength: 2, agility: 3, wits: 5, empathy: 4 },
    skills: { stamina: 3, mobility: 2, observation: 3, manipulation: 3, medicalAid: 4 },
    talent: "surgeon",
    gear: [{ name: "Medkit", items: ["personal-medkit", "medkit"] }, { name: "Surgical kit", items: ["surgical-kit"] }, { name: "Naproleve", qty: 4, items: ["naproleve"] }],
  }),
  npc({
    id: "mercenary",
    name: "Mercenary/soldier",
    summary: "A hired gun or regular soldier with combat experience.",
    attributes: { strength: 5, agility: 4, wits: 3, empathy: 2 },
    skills: { closeCombat: 2, stamina: 2, mobility: 2, rangedCombat: 3, survival: 1 },
    talent: "combat-veteran",
    gear: [{ name: "Medkit", items: ["personal-medkit", "medkit"] }, { name: "M41A Pulse Rifle", items: ["armat-m41a-pulse-rifle"] }, { name: "Grenade", qty: 4, items: ["m40-hedp-grenade"] }],
  }),
  npc({
    id: "mining-wildcatter",
    name: "Mining wildcatter",
    summary: "An independent prospector who blasts first and files the claim later.",
    attributes: { strength: 5, agility: 3, wits: 3, empathy: 3 },
    skills: { closeCombat: 1, heavyMachinery: 3, stamina: 2, comtech: 1, survival: 3 },
    talent: "hardened",
    gear: [{ name: "Seismic survey charge", items: ["seismic-survey-charge"], weight: 1 }, { name: "Seegson P-DAT", items: ["seegson-p-dat"], weight: 0.5 }],
  }),
  npc({
    id: "pilot",
    name: "Pilot",
    summary: "A ship or shuttle pilot who can shoot as well as fly.",
    attributes: { strength: 3, agility: 5, wits: 3, empathy: 3 },
    skills: { piloting: 3, rangedCombat: 3, comtech: 2, observation: 1, survival: 1 },
    talent: "full-throttle",
    gear: [{ name: "Service pistol", items: ["m4a3-service-pistol"] }, { name: "Compression suit", items: ["compression-suit"] }],
  }),
  npc({
    id: "scientist",
    name: "Rogue scientist",
    summary: "A researcher working outside the rules, and usually outside the law.",
    attributes: { strength: 3, agility: 4, wits: 5, empathy: 2 },
    skills: { mobility: 1, comtech: 3, observation: 4, survival: 2 },
    talent: "analysis",
    gear: [
      { name: "Electrostatic Pistol", items: ["weyland-es-4-electrostatic-pistol", "es-4-electrostatic-pistol", "electrostatic-pistol"], weight: 0.5 },
      { name: "System diagnostic device", items: ["seegson-system-diagnostic-device", "seegson-c-series-diagnostic"] },
      { name: "Electronic tools", items: ["electronic-tools", "electronic-tool-kit"] },
    ],
  }),
  npc({
    id: "salvage-expert",
    name: "Salvage expert",
    summary: "A wreck-diver who strips derelicts for parts and profit.",
    attributes: { strength: 5, agility: 4, wits: 2, empathy: 5 },
    skills: { heavyMachinery: 3, stamina: 2, mobility: 3, survival: 2 },
    talent: "spaceship-mechanic",
    gear: [{ name: "Cutting torch", items: ["cutting-torch"] }, { name: "Maintenance jack", items: ["maintenance-jack"] }],
  }),
  npc({
    id: "security-guard",
    name: "Security guard",
    summary: "A station or colony guard with a revolver and a baton.",
    attributes: { strength: 4, agility: 4, wits: 3, empathy: 3 },
    skills: { closeCombat: 2, rangedCombat: 2, observation: 3, medicalAid: 1 },
    gear: [{ name: ".357 revolver", items: ["357-magnum-revolver"] }, { name: "Stun baton", items: ["stun-baton"] }, { name: "Medkit", items: ["personal-medkit", "medkit"] }],
  }),
  npc({
    id: "ships-engineer",
    name: "Ship’s engineer",
    summary: "The crew member who keeps the reactor and the drives working.",
    attributes: { strength: 4, agility: 2, wits: 5, empathy: 3 },
    skills: { closeCombat: 1, heavyMachinery: 4, stamina: 3, comtech: 1, observation: 1 },
    talent: "spaceship-mechanic",
    gear: [{ name: "Bolt gun", items: ["watatsumi-dv-303-bolt-gun"] }, { name: "System diagnostic device", items: ["seegson-system-diagnostic-device", "seegson-c-series-diagnostic"] }],
  }),
  npc({
    id: "smuggler",
    name: "Smuggler",
    summary: "A hauler of undeclared cargo who talks fast and fights dirty.",
    attributes: { strength: 3, agility: 4, wits: 4, empathy: 3 },
    skills: { closeCombat: 3, mobility: 2, piloting: 1, rangedCombat: 2, manipulation: 2 },
    talent: "stealthy",
    gear: [{ name: "Rexim EVA Pistol", items: ["rexim-rxf-m55-eva-pistol", "rexim-rxf-m5-eva-pistol"] }],
  }),
  npc({
    id: "squad-leader",
    name: "Squad leader",
    summary: "A sergeant or corporal leading a fire team.",
    attributes: { strength: 5, agility: 3, wits: 3, empathy: 3 },
    skills: { closeCombat: 2, stamina: 2, rangedCombat: 3, survival: 1, command: 2 },
    talent: "field-commander",
    gear: [{ name: "Medkit", items: ["personal-medkit", "medkit"] }, { name: "M41A Pulse Rifle", items: ["armat-m41a-pulse-rifle"] }, { name: "Seegson P-DAT", items: ["seegson-p-dat"], weight: 0.5 }],
  }),
  npc({
    id: "thug",
    name: "Thug",
    summary: "Hired muscle with a knife.",
    attributes: { strength: 4, agility: 5, wits: 3, empathy: 2 },
    skills: { closeCombat: 2, stamina: 2, mobility: 2, rangedCombat: 2, survival: 2 },
    gear: [{ name: "Knife", items: ["knife"] }],
  }),
];
