import type { AlienPreset } from "./types";
import { subtypeTag } from "./types";

/**
 * Item presets: chapter 5, Gear & Tech (Evolved Edition p. 82-99), plus the
 * two weapon rows that only appear in the equipment appendix (Unarmed Attack,
 * Blunt Instrument, p. 309) and the vehicle weapons table (p. 313).
 *
 * Stat lines, names, prices and feature names are copied from the book;
 * summaries and effects are paraphrased. Checked against the book, so the
 * presets carry no `unverified` flag, except where the chapter and the
 * appendix print different numbers (flagged and noted in the summary).
 *
 * Conventions:
 * - weight: inventory rows. 1, 0.5 (½), 0.25 (¼); "–" (tiny) is 0. A weight
 *   of N/A (too heavy to carry) is weight 0 with `portable: false`.
 * - bonus: the Modifier column; "–" is 0.
 * - damage "2E" is damage 2 with `explosive: true`; "(stun)" / "(fire)" set damageType.
 * - range "S/L" is rangeMin "short", range "long"; A is "adjacent".
 * - cost: the price in dollars; a range or "Varies" keeps the printed text in
 *   `costText` and the low end (or 0) in `cost`.
 * - `gear:<category>` tags follow the book's gear headings.
 */

type Range = "adjacent" | "short" | "medium" | "long" | "extreme";
type DamageType = "normal" | "stun" | "fire";
type SkillMap = Record<string, number>;

interface WeaponSpec {
  id: string;
  name: string;
  summary: string;
  page: number;
  bonus: number;
  damage: number;
  explosive?: boolean;
  damageType?: DamageType;
  rangeMin: Range;
  range: Range;
  ammo?: number | string;
  power?: number;
  weight: number;
  portable?: boolean;
  cost: number;
  costText?: string;
  munitionCost?: number;
  special?: string[];
  effect?: string;
  skillLevels?: SkillMap;
  tags?: string[];
  unverified?: boolean;
}

interface ArmorSpec {
  id: string;
  name: string;
  summary: string;
  page: number;
  armorRating: number;
  airSupply?: number;
  weight: number;
  cost: number;
  special?: string[];
  effect?: string;
  skillBonus?: SkillMap;
}

interface GearSpec {
  id: string;
  name: string;
  summary: string;
  page: number;
  effect?: string;
  weight: number;
  portable?: boolean;
  cost: number;
  costText?: string;
  power?: number;
  range?: Range;
  skillBonus?: SkillMap;
  skillLevels?: SkillMap;
  extra?: Record<string, unknown>;
  tags?: string[];
  unverified?: boolean;
}

function item(
  subtype: string,
  id: string,
  name: string,
  summary: string,
  page: number,
  fields: Record<string, unknown>,
  tags: string[] = [],
  unverified = false,
): AlienPreset {
  const preset: AlienPreset = {
    id: `alien.item.${id}`,
    entityType: "alien.item",
    subtype,
    name,
    summary,
    page,
    tags: ["item", subtypeTag(subtype), ...tags],
    fields,
  };
  if (unverified) preset.unverified = true;
  return preset;
}

/** Copy the optional keys that are set. */
function optional(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  for (const [k, v] of Object.entries(source)) if (v !== undefined) target[k] = v;
  return target;
}

function weapon(spec: WeaponSpec, kind: "ranged" | "melee" | "explosive" | "vehicle"): AlienPreset {
  const fields = optional(
    {
      bonus: spec.bonus,
      damage: spec.damage,
      damageType: spec.damageType ?? "normal",
      rangeMin: spec.rangeMin,
      range: spec.range,
      weight: spec.weight,
      cost: spec.cost,
      special: spec.special ?? [],
    },
    {
      explosive: spec.explosive,
      ammo: spec.ammo,
      power: spec.power,
      portable: spec.portable,
      costText: spec.costText,
      munitionCost: spec.munitionCost,
      effect: spec.effect,
      skillLevels: spec.skillLevels,
    },
  );
  return item("weapon", spec.id, spec.name, spec.summary, spec.page, fields, [`weapon:${kind}`, ...(spec.tags ?? [])], spec.unverified);
}

function armor(spec: ArmorSpec): AlienPreset {
  const fields = optional(
    { armorRating: spec.armorRating, weight: spec.weight, cost: spec.cost, special: spec.special ?? [] },
    { airSupply: spec.airSupply, effect: spec.effect, skillBonus: spec.skillBonus },
  );
  return item("armor", spec.id, spec.name, spec.summary, spec.page, fields, ["gear:suits-armor"]);
}

function gear(subtype: "tool" | "medical" | "pharmaceutical" | "food" | "other", category: string) {
  return (spec: GearSpec): AlienPreset => {
    const fields = optional(
      { weight: spec.weight, cost: spec.cost },
      {
        portable: spec.portable,
        costText: spec.costText,
        effect: spec.effect,
        power: spec.power,
        range: spec.range,
        skillBonus: spec.skillBonus,
        skillLevels: spec.skillLevels,
        ...(spec.extra ?? {}),
      },
    );
    return item(subtype, spec.id, spec.name, spec.summary, spec.page, fields, [`gear:${category}`, ...(spec.tags ?? [])], spec.unverified);
  };
}

// ---------------------------------------------------------------------------
// Weapons (p. 82-89, 309, 313)
// ---------------------------------------------------------------------------

const ranged = (s: WeaponSpec) => weapon(s, "ranged");
const melee = (s: WeaponSpec) => weapon(s, "melee");
const explosive = (s: WeaponSpec) => weapon(s, "explosive");
const vehicleWeapon = (s: Omit<WeaponSpec, "page" | "weight" | "portable">) => weapon({ ...s, page: 313, weight: 0, portable: false }, "vehicle");

const AP = "Armor piercing";
const FULL_AUTO = "Full auto";

export const weaponPresets: AlienPreset[] = [
  // Handguns (p. 82-83)
  ranged({ id: "m4a3-service-pistol", name: "M4A3 Service Pistol", summary: "Cheap 9 mm pistol, the long-serving USCMC sidearm.", page: 82, bonus: 2, damage: 2, rangeMin: "adjacent", range: "medium", ammo: 2, weight: 0.5, cost: 200, tags: ["handgun"] }),
  ranged({ id: "vp-70ma6-service-pistol", name: "VP-70MA6 Service Pistol", summary: "Officer-class pistol now replacing the M4A3 as the marines' standard sidearm.", page: 82, bonus: 2, damage: 2, rangeMin: "adjacent", range: "medium", ammo: 2, weight: 0.25, cost: 250, tags: ["handgun"] }),
  ranged({ id: "357-magnum-revolver", name: ".357 Magnum Revolver", summary: "Heavy-caliber revolver carried by marshals and outlaws alike.", page: 83, bonus: 1, damage: 3, rangeMin: "short", range: "medium", ammo: 1, weight: 1, cost: 300, tags: ["handgun"] }),
  ranged({
    id: "watatsumi-dv-303-bolt-gun",
    name: "Watatsumi DV-303 Bolt Gun",
    summary: "Hull-repair bolt driver; fires like a one-shot shotgun when used as a weapon. Also listed as a tool (p. 97).",
    page: 83,
    bonus: -1,
    damage: 3,
    rangeMin: "adjacent",
    range: "short",
    ammo: "Single-shot",
    weight: 1,
    cost: 400,
    special: [AP],
    effect: "As a tool: +2 to HEAVY MACHINERY for emergency ship repairs.",
    tags: ["tool"],
  }),
  ranged({ id: "weyland-es-4-electrostatic-pistol", name: "Weyland ES-4 Electrostatic Pistol", summary: "Century-old electrostatic sidearm with a blue muzzle flash; favored by top corporate security.", page: 83, bonus: 1, damage: 1, damageType: "stun", rangeMin: "short", range: "medium", ammo: 1, weight: 0.5, cost: 1000, special: [AP], tags: ["handgun"] }),
  ranged({ id: "rexim-rxf-m5-eva-pistol", name: "Rexim RXF-M5 EVA Pistol", summary: "Weaponized laser welder, standard self-defense arm on W-Y commercial ships. The chapter heading prints RXF-M55.", page: 83, bonus: 1, damage: 1, rangeMin: "short", range: "medium", ammo: 4, weight: 0.5, cost: 400, special: [AP], tags: ["handgun"] }),
  // Rifles (p. 84-85)
  ranged({ id: "armat-m41a-pulse-rifle", name: "Armat M41A Pulse Rifle", summary: "USCMC standard 10 mm pulse rifle with an underslung U1 grenade launcher.", page: 84, bonus: 2, damage: 2, rangeMin: "short", range: "long", ammo: 3, weight: 1, cost: 1200, special: [AP, FULL_AUTO, "Grenade launcher"], effect: "The built-in grenade launcher uses the Armat U1 stats (p. 88).", tags: ["rifle"] }),
  ranged({ id: "f44aa-pulse-rifle", name: "F44AA Pulse Rifle", summary: "Near-obsolete predecessor of the M41A with aim assist; still found with smugglers and colonists.", page: 84, bonus: 3, damage: 2, rangeMin: "short", range: "long", ammo: 3, weight: 1, cost: 1500, special: [AP, FULL_AUTO, "Unreliable"], effect: "Unreliable: a Mess Up (7+) on a stress response also jams the weapon; clearing it is a full action and a HEAVY MACHINERY roll.", tags: ["rifle"] }),
  ranged({ id: "ak-4047-pulse-rifle", name: "AK-4047 Pulse Assault Rifle", summary: "Cheap, sturdy UPP counterpart to the M41A; common among mercenaries and insurgents.", page: 84, bonus: 1, damage: 2, rangeMin: "short", range: "long", ammo: 2, weight: 1, cost: 600, special: [AP, FULL_AUTO], tags: ["rifle"] }),
  ranged({ id: "armat-m42a-scope-rifle", name: "M42A Scope Rifle", summary: "USCMC semi-automatic pulse sniper rifle with bipod and flash suppressor.", page: 85, bonus: 3, damage: 2, rangeMin: "medium", range: "extreme", ammo: 2, weight: 1, cost: 1000, special: [AP], tags: ["rifle"] }),
  ranged({ id: "armat-m41ae2-heavy-pulse-rifle", name: "Armat M41AE2 Heavy Pulse Rifle", summary: "Squad support version of the M41A with a longer barrel instead of the grenade launcher.", page: 85, bonus: 2, damage: 2, rangeMin: "medium", range: "extreme", ammo: 4, weight: 2, cost: 1500, special: [AP, FULL_AUTO], tags: ["rifle"] }),
  ranged({ id: "armat-m56a2-smartgun", name: "M56A2 Smartgun", summary: "Harness-mounted squad machine gun that picks targets through a head-mounted sight.", page: 85, bonus: 3, damage: 3, rangeMin: "short", range: "long", ammo: 3, weight: 3, cost: 6000, special: [AP, FULL_AUTO, "Smart sight"], effect: "Smart sight: on full auto after aiming, the second and third bursts keep the aim bonus too.", tags: ["heavy"] }),
  // Other weapons (p. 86-89)
  ranged({ id: "armat-37a2-pump-shotgun", name: "Armat Model 37A2 12 Gauge Pump Action", summary: "Classic pump-action combat shotgun, an optional USCMC weapon for close encounters.", page: 86, bonus: 2, damage: 3, rangeMin: "adjacent", range: "short", ammo: 1, weight: 1, cost: 500, tags: ["shotgun"] }),
  ranged({ id: "m240-incinerator-unit", name: "M240 Incinerator Unit", summary: "Carbine-style naphtha flamethrower used by USCMC squads; civilian models exist.", page: 86, bonus: 1, damage: 2, damageType: "fire", rangeMin: "short", range: "short", ammo: 2, weight: 1, cost: 500, special: ["Fire effect"], effect: "Fire effect: a hurt target keeps burning at intensity 9. Can instead set a whole zone alight at intensity 9; needs one success." }),
  ranged({ id: "spacesub-asso-400-harpoon-gun", name: "SpaceSub ASSO-400 Harpoon Gun", summary: "Tethered grappling harpoon for emergency manual docking and zero-G work.", page: 87, bonus: 0, damage: 1, rangeMin: "short", range: "medium", ammo: "Single-shot", weight: 1, cost: 300, special: ["Harpoon effect"], effect: "Harpoon effect: the hook sticks to the target. In zero-G, reel yourself to Adjacent range (full action) toward a heavier target, or pull a lighter one to you (STRENGTH roll if it resists)." }),
  ranged({ id: "armat-xm99a-phased-plasma-pulse-rifle", name: "Armat XM99A Phased Plasma Pulse Rifle", summary: "Experimental USCMC plasma rifle with a charge-up delay; kills most creatures in one shot.", page: 87, bonus: 0, damage: 4, rangeMin: "medium", range: "extreme", ammo: 1, weight: 2, cost: 20000, special: [AP, "Aim required"], effect: "Aim required: must be aimed (quick action) before firing; the aim still gives +2 dice.", tags: ["heavy", "prototype"] }),
  ranged({ id: "m5a3-rpg-launcher", name: "M5A3 RPG Launcher", summary: "Shoulder-fired rocket launcher with a telescopic sight.", page: 87, bonus: -1, damage: 7, rangeMin: "medium", range: "extreme", ammo: "Single-shot", weight: 2, cost: 1800, special: [AP, "Aim required"], effect: "Aim required: must be aimed (quick action) before firing.", tags: ["heavy"] }),
  ranged({ id: "ua-571-c-sentry-gun", name: "UA 571-C Sentry Gun", summary: "Tripod-mounted robot autocannon that fires at anything moving in range, per its friend-or-foe settings.", page: 88, bonus: 0, damage: 4, rangeMin: "short", range: "long", ammo: 5, weight: 0, portable: false, cost: 12000, special: [AP, FULL_AUTO, "Automation"], skillLevels: { rangedCombat: 8 }, effect: "Automation: once active it shoots the closest valid target with RANGED COMBAT 8 (no Agility); the roll cannot be pushed. Can be fired remotely through a head-mounted sight.", tags: ["heavy"] }),
  ranged({ id: "armat-u1-grenade-launcher", name: "Armat U1 Grenade Launcher", summary: "30 mm pump-action launcher, usually found under an M41A; fires M40, smoke and G2 rounds.", page: 88, bonus: 1, damage: 2, explosive: true, rangeMin: "medium", range: "long", ammo: 1, weight: 0.5, cost: 600, special: ["Depends on grenade type"], effect: "Smoke grenade: no damage, blocks line of sight in, into and out of the zone. G2 Electroshock round: stun damage instead of normal." }),
  explosive({ id: "m40-hedp-grenade", name: "M40 HEDP Grenade", summary: "High-explosive dual-purpose U1 round that also works as a hand grenade.", page: 88, bonus: 0, damage: 2, explosive: true, rangeMin: "short", range: "medium", ammo: "Single use", weight: 0.25, cost: 60 }),
  explosive({ id: "g2-electroshock-grenade", name: "G2 Electroshock Grenade", summary: "Hops into the air and releases a stunning electric pulse; crowd control. Stats are for throwing it.", page: 88, bonus: 0, damage: 2, explosive: true, damageType: "stun", rangeMin: "short", range: "medium", ammo: "Single use", weight: 0.25, cost: 400 }),
  melee({ id: "knife", name: "Combat Knife", summary: "Fighting knife.", page: 88, bonus: 1, damage: 2, rangeMin: "adjacent", range: "adjacent", weight: 0.5, cost: 50 }),
  melee({ id: "fire-axe", name: "Fire Axe", summary: "Emergency axe from a ship's bulkhead.", page: 88, bonus: 0, damage: 2, rangeMin: "adjacent", range: "adjacent", weight: 1, cost: 60, special: [AP] }),
  explosive({ id: "seismic-survey-charge", name: "Seismic Survey Charge", summary: "Explosive charge for seismic surveys on new colonies; a weapon in a pinch.", page: 89, bonus: 0, damage: 3, explosive: true, rangeMin: "short", range: "medium", ammo: "Single use", weight: 1, cost: 200 }),
  melee({ id: "stun-baton", name: "Stun Baton", summary: "Frontier cattle prod; incapacitates rather than kills.", page: 89, bonus: 1, damage: 1, damageType: "stun", rangeMin: "adjacent", range: "adjacent", power: 2, weight: 1, cost: 80 }),
  melee({ id: "cutting-torch-weapon", name: "Cutting Torch", summary: "Welding and cutting blowtorch swung as an improvised weapon. The tool entry is the Mechanical Cutting Torch.", page: 89, bonus: -1, damage: 3, rangeMin: "adjacent", range: "adjacent", power: 3, weight: 1, cost: 300, special: [AP] }),
  melee({ id: "unarmed", name: "Unarmed Attack", summary: "Fists, feet and elbows.", page: 309, bonus: 0, damage: 1, rangeMin: "adjacent", range: "adjacent", weight: 0, cost: 0, costText: "–" }),
  melee({ id: "blunt-instrument", name: "Blunt Instrument", summary: "Pipe, wrench, club or anything heavy at hand.", page: 309, bonus: 1, damage: 1, rangeMin: "adjacent", range: "adjacent", weight: 1, cost: 0, costText: "–" }),
  // Vehicle weapons (p. 313; mounted, not carried)
  vehicleWeapon({ id: "20mm-gatling-gun", name: "20 mm Gatling Gun", summary: "Turret gatling, the secondary weapon on the M577 APC.", bonus: 1, damage: 4, rangeMin: "medium", range: "long", ammo: 6, cost: 7500, special: [AP, FULL_AUTO] }),
  vehicleWeapon({ id: "25mm-gatling-gun", name: "25 mm Gatling Gun", summary: "Gatling gun mounted on the Cheyenne dropship.", bonus: 1, damage: 4, rangeMin: "medium", range: "extreme", ammo: 6, cost: 9000, special: [AP, FULL_AUTO] }),
  vehicleWeapon({ id: "phased-plasma-pulse-cannon-turret", name: "Phased Plasma Pulse Cannon Turret", summary: "Main gun of the M577 APC.", bonus: -1, damage: 6, rangeMin: "medium", range: "extreme", ammo: 5, cost: 54000, special: [AP] }),
  vehicleWeapon({ id: "multi-directional-flame-unit", name: "Multi-Directional Flame Unit", summary: "Vehicle-mounted flamethrower.", bonus: 0, damage: 3, rangeMin: "short", range: "medium", ammo: 4, cost: 4200, special: ["Fire effect"], effect: "Fire effect as for the M240 Incinerator Unit (p. 86)." }),
  vehicleWeapon({ id: "banshee-70-rocket-launcher", name: "Mk.16 150 mm Banshee 70 Unguided Rocket Launcher", summary: "Unguided rocket pod on the Cheyenne dropship.", bonus: 0, damage: 3, explosive: true, rangeMin: "medium", range: "long", ammo: 3, cost: 48000, special: [FULL_AUTO] }),
  vehicleWeapon({ id: "hellhound-ii-missile-launcher", name: "AGM-220C Hellhound II Tactical Missile Launcher", summary: "Tactical missile launcher on the Cheyenne dropship.", bonus: 1, damage: 8, rangeMin: "long", range: "extreme", ammo: "Single-shot", cost: 76000, munitionCost: 12000, special: [AP], effect: "Missiles are bought separately at $12,000 each." }),
  vehicleWeapon({ id: "headlock-missile-launcher", name: "AIM-90E Headlock Air-to-Air Missile Launcher", summary: "Air-to-air missile launcher on the Cheyenne dropship.", bonus: 2, damage: 6, rangeMin: "long", range: "extreme", ammo: "Single-shot", cost: 64000, munitionCost: 9000, special: [AP], effect: "Missiles are bought separately at $9,000 each." }),
];

// ---------------------------------------------------------------------------
// Suits & armor (p. 90-91)
// ---------------------------------------------------------------------------

export const armorPresets: AlienPreset[] = [
  armor({ id: "m3-personnel-armor", name: "M3 Personnel Armor", summary: "USCMC vest, abdomen pad and greaves with a comm unit, PDT and vitals monitoring.", page: 90, armorRating: 2, weight: 1, cost: 1200, special: ["Comm unit", "PDT"] }),
  armor({ id: "light-armor-vest", name: "Kevlar Riot Vest", summary: "Light woven-fiber vest worn by colonial police and security.", page: 90, armorRating: 1, weight: 0.5, cost: 600 }),
  armor({ id: "irc-mk50-compression-suit", name: "IRC Mk.50 Compression Suit", summary: "Decades-old but dependable vacuum suit with helmet cam and HUD; a Frontier staple.", page: 90, armorRating: 0, airSupply: 5, weight: 1, cost: 4000, special: ["Vacuum protection", "Comm unit", "Head light", "–1 to MOBILITY"], skillBonus: { mobility: -1 } }),
  armor({ id: "irc-mk35-pressure-suit", name: "IRC Mk.35 Pressure Suit", summary: "Cheap, bulky combat pressure suit; stiff joints and decompression time after use.", page: 90, armorRating: 1, airSupply: 4, weight: 2, cost: 2000, special: ["Vacuum protection", "–2 to MOBILITY"], skillBonus: { mobility: -2 } }),
  armor({ id: "eco-all-world-survival-suit", name: "Eco All-World Survival Suit", summary: "EVA hardsuit with HUD and its own thrusters; its comm array is unshielded.", page: 90, armorRating: 2, airSupply: 6, weight: 2, cost: 30000, special: ["Vacuum protection", "Comm unit", "Head light", "+2 to MOBILITY for movement in zero-G"] }),
  armor({ id: "apesuit", name: "Weyland-Yutani APEsuit", summary: "Armored environment suit of W-Y security and Dog Catcher teams; resists acid but is not vacuum-rated.", page: 90, armorRating: 1, airSupply: 4, weight: 1, cost: 5000, special: ["Armor level 3 against acid", "Facehug protection", "SURVIVAL +2"], effect: "Armor level 3 against acid; protects the wearer from facehuggers (p. 213).", skillBonus: { survival: 2 } }),
  armor({ id: "p-5000-power-loader", name: "P-5000 Powered Work Loader", summary: "Cargo-handling exoskeleton with hydraulic claws; needs a skilled operator.", page: 91, armorRating: 1, weight: 0, cost: 50000, special: ["Requires HEAVY MACHINERY 2+", "+3 dice to HEAVY MACHINERY and CLOSE COMBAT", "Close combat base damage 3"], effect: "Usable only with HEAVY MACHINERY 2 or more. Gives +3 dice to HEAVY MACHINERY and CLOSE COMBAT; close combat attacks have base damage 3.", skillBonus: { heavyMachinery: 3, closeCombat: 3 } }),
];

// ---------------------------------------------------------------------------
// Computer mainframes and data storage (p. 92-93)
// ---------------------------------------------------------------------------

const mainframe = gear("other", "computer-mainframes");
const storage = gear("other", "data-storage");

export const otherItemPresets: AlienPreset[] = [
  mainframe({ id: "mu-th-ur-6000", name: "MU/TH/UR 6000", summary: "W-Y ship and facility mainframe; the Nostromo's Mother.", page: 92, weight: 0, cost: 2500000, skillLevels: { comtech: 5, piloting: 5, observation: 5 } }),
  mainframe({ id: "mu-th-ur-6500", name: "MU/TH/UR 6500", summary: "W-Y mainframe. The chapter prints COMTECH 7, the appendix (p. 310) COMTECH 6; the appendix value is used.", page: 92, weight: 0, cost: 3500000, skillLevels: { comtech: 6, piloting: 5, observation: 6 }, unverified: true }),
  mainframe({ id: "mu-th-ur-7000", name: "MU/TH/UR 7000", summary: "W-Y mainframe for larger ships and stations.", page: 92, weight: 0, cost: 5000000, skillLevels: { comtech: 7, piloting: 6, observation: 7 } }),
  mainframe({ id: "mu-th-ur-9000", name: "MU/TH/UR 9000", summary: "Top-end W-Y mainframe that can develop a personality; runs Conestoga frigates.", page: 92, weight: 0, cost: 50000000, skillLevels: { comtech: 10, piloting: 8, observation: 10, rangedCombat: 9 } }),
  mainframe({ id: "apollo", name: "A.P.O.L.L.O.", summary: "Seegson's rival to MU/TH/UR, built to coordinate Working Joes; less capable.", page: 92, weight: 0, cost: 2000000, skillLevels: { comtech: 5, piloting: 4, observation: 5 } }),
  storage({ id: "long-data-discs", name: "Long-Data Discs", summary: "Nano-optical backup discs for colony and corporate records. The chapter prints $5,000, the appendix (p. 310) $30.", page: 92, weight: 0, cost: 5000, effect: "Stores up to 10 zettabytes.", unverified: true }),
  storage({ id: "magnetic-tape", name: "Magnetic Tape", summary: "Cheap, disposable tape cassettes that give off no easily detected signal.", page: 93, weight: 0, cost: 5, effect: "Stores up to 120 terabytes." }),
];

// ---------------------------------------------------------------------------
// Diagnostics & display, vision devices, tools (p. 93-97)
// ---------------------------------------------------------------------------

const display = gear("tool", "diagnostics-display");
const vision = gear("tool", "vision-devices");
const tool = gear("tool", "tools");

export const toolPresets: AlienPreset[] = [
  display({ id: "computer-terminal", name: "Computer Terminal", summary: "Any fixed keyboard, voice or holo terminal on a colony, ship or station.", page: 93, weight: 0, portable: false, cost: 0, costText: "Varies", effect: "Reach and process data with a COMTECH roll; the right codes open up what the mainframe knows." }),
  display({ id: "personal-data-transmitter", name: "Personal Data Transmitter", summary: "PDT: a locator beacon, often with vitals monitoring; worn, built into suits or implanted.", page: 93, weight: 0, cost: 100, effect: "Reports location and vital signs; +1 to MEDICAL AID.", skillBonus: { medicalAid: 1 } }),
  display({ id: "samani-e-series-watch", name: "Samani E-Series Watch", summary: "Dual-faced wristwatch keeping two colonial times; newer models sense oxygen and pressure.", page: 93, weight: 0, cost: 50, effect: "Tracks time, oxygen and pressure; +1 to SURVIVAL.", skillBonus: { survival: 1 } }),
  display({ id: "iff-transponder", name: "IFF Transponder", summary: "Friend-or-foe beacon, usually implanted, that sentry systems recognize.", page: 94, weight: 0, cost: 250, effect: "Sentry guns will not fire on the wearer." }),
  display({ id: "data-transmitter-cards", name: "Data Transmitter Cards", summary: "Plug-in cards that send recorder feeds wirelessly to a synced terminal.", page: 94, weight: 0, cost: 50, effect: "Transfers audio and video; +1 to COMTECH.", skillBonus: { comtech: 1 } }),
  display({ id: "holotab", name: "HoloTab", summary: "Holographic display table that builds 3D models from scans and feeds.", page: 94, weight: 0, portable: false, cost: 100000, effect: "Strategic analysis; +2 to OBSERVATION and COMMAND.", skillBonus: { observation: 2, command: 2 } }),
  display({ id: "seegson-p-dat", name: "Seegson P-DAT", summary: "Personal data tablet that syncs with mapping devices, PDTs and helmet cams.", page: 94, weight: 0.5, cost: 500, effect: "Coordinates a field team; +1 to COMMAND.", skillBonus: { command: 1 } }),
  display({ id: "seegson-system-diagnostic-device", name: "Seegson System Diagnostic Device", summary: "SSDD: troubleshoots computer and mechanical systems; engineers use it to hack doors and terminals.", page: 94, weight: 1, cost: 300, effect: "Troubleshoots computer systems; +2 to COMTECH.", skillBonus: { comtech: 2 } }),
  display({ id: "modular-computing-device", name: "Modular Computing Device", summary: "High-end projector filling a 6×6 m area with immersive holograms.", page: 94, weight: 0, portable: false, cost: 8000, effect: "Full audiovisual holographic projection; +2 to MANIPULATION.", skillBonus: { manipulation: 2 } }),
  display({ id: "pr-put-uplink-terminal", name: "PR-PUT Uplink Terminal", summary: "Armored military laptop with a flight stick for patching into uplink towers.", page: 94, weight: 1, cost: 9000, effect: "Remote-pilot an orbiting spacecraft with a COMTECH roll and access codes." }),
  display({ id: "comm-unit", name: "Comm Unit", summary: "Radio headset with about 1 km range; built into several suits and armors.", page: 94, weight: 0, cost: 50, effect: "Lets a team talk at a distance." }),
  display({ id: "seegson-c-series-magnetic-tape-recorder", name: "Seegson C-Series Magnetic Tape Recorder", summary: "Old-tech portable audio recorder and music player.", page: 94, weight: 1, cost: 80, effect: "Records and plays audio; +1 to MANIPULATION.", skillBonus: { manipulation: 1 } }),
  vision({ id: "flashlight", name: "Flashlight", summary: "Hand lamp; can be mounted on a ranged weapon.", page: 96, range: "short", weight: 0.5, cost: 40, effect: "Cancels darkness in a zone." }),
  vision({ id: "optical-scope", name: "Optical Scope", summary: "Weapon sight in many varieties.", page: 96, weight: 0, cost: 60, effect: "Range +1: a pistol or rifle reaches one range band further, for aimed shots only." }),
  vision({ id: "binoculars", name: "Binoculars", summary: "Field glasses; may have a rangefinder or night vision.", page: 96, range: "extreme", weight: 0.5, cost: 100, effect: "+2 to OBSERVATION at Long range or beyond.", skillBonus: { observation: 2 } }),
  vision({ id: "motion-tracker", name: "M314 Motion Tracker", summary: "Bulky ultrasonic movement scanner, from rescue teams to the military.", page: 96, range: "long", power: 5, weight: 1, cost: 1200, effect: "Detects movement while in stealth mode (p. 58)." }),
  vision({ id: "m316-motion-tracker", name: "M316 Motion Tracker", summary: "Compact rifle-mounted tracker under field testing; shorter reach than the M314.", page: 96, range: "medium", power: 3, weight: 0, cost: 3000, effect: "Detects movement while in stealth mode (p. 58)." }),
  vision({ id: "neuro-visor", name: "Neuro Visor", summary: "HUD helmet for watching, and even steering, the dreams of someone in stasis.", page: 96, range: "long", power: 5, weight: 1, cost: 10000, effect: "Monitor or talk to a hypersleeping patient with a COMTECH roll." }),
  vision({ id: "pups-mapping-device", name: "Parameter Uplink Spectrograph Mapping Device", summary: "\"Pups\": floating, howling scanner orbs that map terrain and detect life and toxins.", page: 96, range: "extreme", power: 5, weight: 1, cost: 50000, effect: "In stealth mode, scans one zone per stretch and spots enemies who are not hidden." }),
  vision({ id: "seegson-microview-2000se", name: "Seegson Microview-2000SE", summary: "Station navigation device showing where you are.", page: 96, range: "extreme", weight: 0.5, cost: 250, effect: "Shows your current location." }),
  tool({ id: "maintenance-jack", name: "Maintenance Jack", summary: "Opens unpowered airlocks and reroutes junction-box power.", page: 97, weight: 1, cost: 150, effect: "+1 to HEAVY MACHINERY where it helps. As a weapon: modifier +1, base damage 1.", skillBonus: { heavyMachinery: 1 }, extra: { bonus: 1, damage: 1, rangeMin: "adjacent", range: "adjacent" } }),
  tool({ id: "cutting-torch", name: "Mechanical Cutting Torch", summary: "Welding and cutting blowtorch; see Cutting Torch (p. 89) when used as a weapon.", page: 97, power: 3, weight: 1, cost: 300, effect: "Construction and repair; +2 to HEAVY MACHINERY.", skillBonus: { heavyMachinery: 2 } }),
  tool({ id: "power-cell", name: "Power Cell", summary: "Recharge for motion trackers and other electric gear.", page: 97, weight: 0.25, cost: 30, effect: "Refills one item's power supply." }),
  tool({ id: "electronic-tool-kit", name: "Electronic Tools", summary: "Kit for repairing and rewiring electronics.", page: 97, weight: 0.5, cost: 250, effect: "+1 to COMTECH where it helps.", skillBonus: { comtech: 1 } }),
];

// ---------------------------------------------------------------------------
// Medical supplies (p. 97)
// ---------------------------------------------------------------------------

const medical = gear("medical", "medical-supplies");

export const medicalPresets: AlienPreset[] = [
  medical({ id: "personal-medkit", name: "Personal Medkit", summary: "Bandages, disinfectant, cauterizer and a stim; a stopgap until an AutoDoc.", page: 97, weight: 0.25, cost: 50, effect: "+2 to MEDICAL AID for first aid; used up after one use.", skillBonus: { medicalAid: 2 } }),
  medical({ id: "surgical-kit", name: "Surgical Kit", summary: "Surgeon's instruments; nasty cutting weapons in a pinch.", page: 97, weight: 1, cost: 200, effect: "+2 to MEDICAL AID for first aid and for surgery on critical injuries. As a weapon: base damage 2.", skillBonus: { medicalAid: 2 }, extra: { damage: 2, rangeMin: "adjacent", range: "adjacent" } }),
  medical({ id: "automed", name: "AutoDoc", summary: "Automated treatment unit found on most ships and colonies; resets bones, no complex surgery.", page: 97, weight: 0, portable: false, cost: 500000, effect: "Gives first aid with MEDICAL AID 8 (cannot push); cannot treat critical injuries that need surgery.", skillLevels: { medicalAid: 8 } }),
  medical({ id: "pauling-medpod", name: "Pauling MedPod", summary: "Autonomous scanner and surgical pod with robotic arms and an airtight shield.", page: 97, weight: 0, portable: false, cost: 2000000, effect: "Gives first aid and performs surgery with MEDICAL AID 12 (cannot push).", skillLevels: { medicalAid: 12 } }),
];

// ---------------------------------------------------------------------------
// Pharmaceuticals (p. 98-99). Costs are per dose; every dose is a tiny item.
// ---------------------------------------------------------------------------

const pharma = gear("pharmaceutical", "pharmaceuticals");
const EXTRA_DOSE = "Each extra dose in the same shift gives -1 die to all skill rolls until the shift ends.";

export const pharmaceuticalPresets: AlienPreset[] = [
  pharma({ id: "neversleep-pills", name: "Neversleep Pills", summary: "Fast stimulant; overuse risks stroke or heart attack.", page: 98, weight: 0, cost: 2, effect: "+1 stress level; no sleep needed for a day, but no stress relief during it (p. 73)." }),
  pharma({ id: "hydr8tion", name: "Hydr8tion", summary: "Electrolyte drink against hypersleep dehydration; no side effects.", page: 98, weight: 0, cost: 5, effect: "Removes fatigue from hypersleep (p. 75)." }),
  pharma({ id: "naproleve", name: "Naproleve", summary: "Injectable instant painkiller; overdoses are intoxicating.", page: 98, weight: 0, cost: 20, effect: `Drops stress level to zero. ${EXTRA_DOSE}` }),
  pharma({ id: "recreational-drugs", name: "Recreational Drugs", summary: "Tobacco, cannabis and other legal prescription highs.", page: 99, weight: 0, cost: 5, costText: "Varies: $5 (pack of cigarettes) to $60,000 (a kilo)", effect: `Usually +1 or -1 stress level. ${EXTRA_DOSE}` }),
  pharma({ id: "x-stim", name: "X-Drugs", summary: "Hard performance drugs with severe side effects; the USCMC is rumored to test X-Stims.", page: 99, weight: 0, cost: 0, costText: "Varies", effect: "Varies; boosts strength, stamina and senses, with risks of psychosis, seizures and stroke." }),
];

// ---------------------------------------------------------------------------
// Food & drink (p. 99)
// ---------------------------------------------------------------------------

const food = gear("food", "food-drink");

export const foodPresets: AlienPreset[] = [
  food({ id: "field-rations", name: "Prefab Meals", summary: "Flash-frozen shipboard rations the company makes you pay for.", page: 99, weight: 0.25, cost: 10, effect: "Covers food for one day." }),
  food({ id: "candy-bar", name: "Candy Bar", summary: "A Frontier luxury and a sugar rush.", page: 99, weight: 0.25, cost: 15, effect: "Covers food for one day." }),
  food({ id: "purified-water", name: "Water Bottle", summary: "Recycled company water at $2, purified bottles at $10, up to $100 on a dry rock.", page: 99, weight: 0.25, cost: 2, costText: "$2–$100", effect: "Covers water for one day." }),
  food({ id: "coffee", name: "Coffee", summary: "Free on most company ships; W-Y coffee is a perk of the job.", page: 99, weight: 0, cost: 0, costText: "Free–$1.50", effect: "+1 stress level; keeps sleep-deprivation fatigue away for a shift. More cups in the shift do nothing." }),
  food({ id: "bug-juice-protein-drink", name: "“Bug Juice” Protein Drink", summary: "Cheap insect-protein drink from bug farms.", page: 99, weight: 0.25, cost: 5, effect: "Covers food and water for one day." }),
  food({ id: "fresh-food", name: "Colony Specialty Meals", summary: "Local colony cooking, from livestock to native critters.", page: 99, weight: 0.25, cost: 20, costText: "$20–$300", effect: "Covers food for one day and gives -1 stress level." }),
  food({ id: "alcohol", name: "Beer and Booze", summary: "Whiskey, vodka and watered-down Aspen beer.", page: 99, weight: 0.25, cost: 5, costText: "$5–$500", effect: `-1 stress level. ${EXTRA_DOSE}` }),
];

export const itemPresets: AlienPreset[] = [
  ...weaponPresets,
  ...armorPresets,
  ...toolPresets,
  ...medicalPresets,
  ...pharmaceuticalPresets,
  ...foodPresets,
  ...otherItemPresets,
];
