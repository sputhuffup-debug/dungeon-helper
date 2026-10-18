import type { AlienPreset } from "./types";
import { subtypeTag } from "./types";

/**
 * Item presets (Evolved Edition p. 82-99).
 *
 * Reference data only: stat lines, cost, weight and short descriptor tags.
 * Values come from general knowledge of the Alien RPG gear chapter and are
 * flagged `unverified`. Weight is in the game's abstract units (1 = normal,
 * 0.5 = light, 0 = tiny).
 */

type Range = "engaged" | "short" | "medium" | "long" | "extreme";
type DamageType = "normal" | "stun" | "fire" | "energy";

interface WeaponSpec {
  id: string;
  name: string;
  summary: string;
  bonus: number;
  damage: number;
  damageType?: DamageType;
  range: Range;
  rangeMin?: Range;
  ammo?: string;
  power?: number;
  weight: number;
  cost: number;
  special?: string[];
  page?: number;
  tags?: string[];
}

interface ArmorSpec {
  id: string;
  name: string;
  summary: string;
  armorRating: number;
  airSupply?: number;
  weight: number;
  cost: number;
  special?: string[];
  page?: number;
}

interface GearSpec {
  id: string;
  name: string;
  summary: string;
  effect?: string;
  weight: number;
  cost: number;
  supply?: number;
  page?: number;
  tags?: string[];
}

function item(subtype: string, id: string, name: string, summary: string, page: number | [number, number], fields: Record<string, unknown>, tags: string[] = []): AlienPreset {
  return {
    id: `alien.item.${id}`,
    entityType: "alien.item",
    subtype,
    name,
    summary,
    page,
    tags: ["item", subtypeTag(subtype), ...tags],
    fields,
    unverified: true,
  };
}

function weapon(spec: WeaponSpec, kind: "ranged" | "melee" | "explosive"): AlienPreset {
  const fields: Record<string, unknown> = {
    bonus: spec.bonus,
    damage: spec.damage,
    damageType: spec.damageType ?? "normal",
    range: spec.range,
    weight: spec.weight,
    cost: spec.cost,
    special: spec.special ?? [],
  };
  if (spec.rangeMin) fields.rangeMin = spec.rangeMin;
  if (spec.ammo) fields.ammo = spec.ammo;
  if (spec.power !== undefined) fields.power = spec.power;
  return item("weapon", spec.id, spec.name, spec.summary, spec.page ?? [84, 91], fields, [`weapon:${kind}`, ...(spec.tags ?? [])]);
}

function armor(spec: ArmorSpec): AlienPreset {
  const fields: Record<string, unknown> = {
    armorRating: spec.armorRating,
    weight: spec.weight,
    cost: spec.cost,
    special: spec.special ?? [],
  };
  if (spec.airSupply !== undefined) fields.airSupply = spec.airSupply;
  return item("armor", spec.id, spec.name, spec.summary, spec.page ?? [92, 93], fields);
}

function gear(subtype: "tool" | "medical" | "pharmaceutical" | "food" | "other", page: number | [number, number]) {
  return (spec: GearSpec): AlienPreset => {
    const fields: Record<string, unknown> = { weight: spec.weight, cost: spec.cost };
    if (spec.effect) fields.effect = spec.effect;
    if (spec.supply !== undefined) fields.supply = spec.supply;
    return item(subtype, spec.id, spec.name, spec.summary, spec.page ?? page, fields, spec.tags ?? []);
  };
}

// ---------------------------------------------------------------------------
// Weapons (~30)
// ---------------------------------------------------------------------------

const ranged = (s: WeaponSpec) => weapon(s, "ranged");
const melee = (s: WeaponSpec) => weapon(s, "melee");
const explosive = (s: WeaponSpec) => weapon(s, "explosive");

export const weaponPresets: AlienPreset[] = [
  ranged({ id: "m4a3-service-pistol", name: "M4A3 Service Pistol", summary: "Standard USCMC sidearm.", bonus: 1, damage: 1, range: "medium", weight: 0.5, cost: 200, special: [], page: 86 }),
  ranged({ id: "357-magnum-revolver", name: ".357 Magnum Revolver", summary: "Heavy civilian revolver.", bonus: 1, damage: 2, range: "medium", weight: 1, cost: 300, special: [], page: 86 }),
  ranged({ id: "rexim-rxf-m5-eva-pistol", name: "Rexim RXF-M5 EVA Pistol", summary: "Recoilless pistol rated for vacuum work.", bonus: 1, damage: 1, range: "medium", weight: 1, cost: 1200, special: ["vacuum-rated", "armor-piercing"], page: 86 }),
  ranged({ id: "watatsumi-dv-303-bolt-gun", name: "Watatsumi DV-303 Bolt Gun", summary: "Industrial bolt driver pressed into service as a weapon.", bonus: 0, damage: 3, range: "short", weight: 1, cost: 400, special: ["single-shot", "armor-piercing"], page: 86 }),
  ranged({ id: "armat-37a2-pump-shotgun", name: "Armat Model 37A2 12 Gauge Pump Action", summary: "Classic pump shotgun.", bonus: 2, damage: 2, range: "short", weight: 1, cost: 500, special: ["close-range-bonus"], page: 87 }),
  ranged({ id: "armat-p9-sharp-rifle", name: "Armat P-9 SHARP Rifle", summary: "Civilian and security combat rifle.", bonus: 1, damage: 2, range: "long", weight: 1, cost: 600, special: ["full-auto"], page: 87 }),
  ranged({ id: "ak-4047-pulse-rifle", name: "AK-4047 Pulse Rifle", summary: "UPP mass-produced pulse rifle, rugged and cheap.", bonus: 0, damage: 2, range: "long", weight: 1, cost: 500, special: ["full-auto", "armor-piercing", "reliable"], page: 87 }),
  ranged({ id: "armat-m41a-pulse-rifle", name: "Armat M41A Pulse Rifle", summary: "USCMC standard-issue pulse rifle with underslung grenade launcher.", bonus: 1, damage: 2, range: "long", weight: 1, cost: 1200, special: ["full-auto", "armor-piercing", "grenade-launcher"], page: 87 }),
  ranged({ id: "armat-m41ae2-heavy-pulse-rifle", name: "Armat M41AE2 Heavy Pulse Rifle", summary: "Squad support variant with longer barrel.", bonus: 1, damage: 3, range: "extreme", weight: 2, cost: 1500, special: ["full-auto", "armor-piercing"], page: 88 }),
  ranged({ id: "armat-m42a-scope-rifle", name: "Armat M42A Scope Rifle", summary: "Marksman rifle with integral scope.", bonus: 1, damage: 2, range: "extreme", weight: 1, cost: 1000, special: ["scope", "armor-piercing"], page: 88 }),
  ranged({ id: "armat-m56a2-smartgun", name: "Armat M56A2 Smartgun", summary: "Harness-mounted auto-tracking machine gun.", bonus: 3, damage: 3, range: "long", weight: 3, cost: 6000, special: ["full-auto", "armor-piercing", "harness", "heavy"], page: 88 }),
  ranged({ id: "armat-xm99a-phased-plasma-pulse-rifle", name: "Armat XM99A Phased Plasma Pulse Rifle", summary: "Experimental plasma rifle.", bonus: 0, damage: 4, damageType: "energy", range: "extreme", power: 5, weight: 2, cost: 20000, special: ["armor-piercing", "power-supply", "fire"], page: 88 }),
  ranged({ id: "m240-incinerator-unit", name: "M240 Incinerator Unit", summary: "USCMC flamethrower.", bonus: 0, damage: 2, damageType: "fire", range: "medium", weight: 1, cost: 500, special: ["fire", "ignores-cover", "fuel-supply"], page: 89 }),
  ranged({ id: "ua-571-c-sentry-gun", name: "UA 571-C Automated Sentry Gun", summary: "Tripod sentry with motion-triggered fire.", bonus: 2, damage: 4, range: "extreme", weight: 3, cost: 25000, special: ["full-auto", "armor-piercing", "automated", "heavy"], page: 89 }),
  ranged({ id: "armat-u1-grenade-launcher", name: "Armat U1 Grenade Launcher", summary: "Pump-action launcher for M40 grenades.", bonus: 0, damage: 0, range: "long", weight: 1, cost: 800, special: ["grenade-launcher", "damage-by-grenade"], page: 89 }),
  ranged({ id: "spacesub-asso-400-harpoon-gun", name: "Spacesub ASSO-400 Harpoon Grappling Gun", summary: "Vacuum-rated harpoon with winch line.", bonus: 0, damage: 1, range: "medium", weight: 1, cost: 300, special: ["single-shot", "grapple", "vacuum-rated"], page: 90 }),
  ranged({ id: "armat-sadar-m5-rocket-launcher", name: "Armat SADAR M-5 Rocket Launcher", summary: "Shoulder-fired anti-vehicle rocket.", bonus: 0, damage: 5, range: "extreme", rangeMin: "medium", weight: 2, cost: 3000, special: ["single-shot", "blast", "armor-piercing", "heavy"], page: 90 }),
  explosive({ id: "m40-hedp-grenade", name: "M40 HEDP Grenade", summary: "Thrown or launched high-explosive dual-purpose grenade.", bonus: 0, damage: 3, range: "medium", weight: 0.5, cost: 60, special: ["blast", "armor-piercing", "single-use"], page: 90 }),
  explosive({ id: "g2-electroshock-grenade", name: "G2 Electroshock Grenade", summary: "Non-lethal shock grenade.", bonus: 0, damage: 2, damageType: "stun", range: "medium", weight: 0.5, cost: 80, special: ["blast", "stun", "single-use"], page: 90 }),
  explosive({ id: "m72-starshell-flare", name: "M72 Starshell Flare", summary: "Launched illumination round.", bonus: 0, damage: 0, range: "long", weight: 0.5, cost: 30, special: ["illumination", "single-use"], page: 90 }),
  explosive({ id: "m20-claymore-mine", name: "M20 Claymore Mine", summary: "Directional anti-personnel mine.", bonus: 0, damage: 4, range: "short", weight: 0.5, cost: 250, special: ["blast", "placed", "single-use"], page: 90 }),
  melee({ id: "unarmed", name: "Unarmed", summary: "Fists, feet and teeth.", bonus: 0, damage: 1, range: "engaged", weight: 0, cost: 0, special: [], page: 85 }),
  melee({ id: "blunt-instrument", name: "Blunt Instrument", summary: "Pipe, wrench or club.", bonus: 1, damage: 1, range: "engaged", weight: 1, cost: 0, special: [], page: 85 }),
  melee({ id: "knife", name: "Knife", summary: "Combat or utility knife.", bonus: 1, damage: 2, range: "engaged", weight: 0.5, cost: 50, special: [], page: 85 }),
  melee({ id: "stun-baton", name: "Stun Baton", summary: "Security shock stick.", bonus: 1, damage: 1, damageType: "stun", range: "engaged", power: 5, weight: 1, cost: 80, special: ["stun", "power-supply"], page: 85 }),
  melee({ id: "machete", name: "Machete", summary: "Colony brush blade.", bonus: 1, damage: 2, range: "engaged", weight: 1, cost: 60, special: [], page: 85 }),
  melee({ id: "fire-axe", name: "Fire Axe", summary: "Emergency axe from a ship bulkhead.", bonus: 1, damage: 3, range: "engaged", weight: 1, cost: 40, special: ["two-handed"], page: 85 }),
  melee({ id: "cutting-torch-weapon", name: "Cutting Torch (as weapon)", summary: "Industrial torch used in anger.", bonus: 0, damage: 3, damageType: "fire", range: "engaged", power: 5, weight: 1, cost: 300, special: ["fire", "power-supply"], page: 85 }),
  melee({ id: "maintenance-jack", name: "Maintenance Jack", summary: "Heavy prying tool.", bonus: 1, damage: 2, range: "engaged", weight: 1, cost: 70, special: ["two-handed"], page: 85 }),
  melee({ id: "industrial-drill", name: "Industrial Drill", summary: "Powered drill from a rig or workshop.", bonus: 0, damage: 3, range: "engaged", power: 4, weight: 2, cost: 400, special: ["armor-piercing", "power-supply", "heavy"], page: 85 }),
  melee({ id: "shock-stick", name: "Cattle Prod / Shock Stick", summary: "Long electrified prod used by colony handlers.", bonus: 0, damage: 2, damageType: "stun", range: "engaged", power: 4, weight: 1, cost: 120, special: ["stun", "power-supply"], page: 85 }),
];

// ---------------------------------------------------------------------------
// Armor (~10)
// ---------------------------------------------------------------------------

export const armorPresets: AlienPreset[] = [
  armor({ id: "compression-suit", name: "Compression Suit", summary: "Light EVA suit worn by truckers and roughnecks.", armorRating: 2, airSupply: 5, weight: 1, cost: 2000, special: ["vacuum", "comm-unit"] }),
  armor({ id: "irc-mk35-pressure-suit", name: "IRC Mk.35 Pressure Suit", summary: "Older heavy pressure suit.", armorRating: 3, airSupply: 5, weight: 2, cost: 1500, special: ["vacuum", "heavy", "comm-unit"] }),
  armor({ id: "irc-mk50-compression-suit", name: "IRC Mk.50 Compression Suit", summary: "Modern lightweight compression suit.", armorRating: 2, airSupply: 4, weight: 1, cost: 15000, special: ["vacuum", "comm-unit", "flexible"] }),
  armor({ id: "eco-all-world-survival-suit", name: "Eco All-World Survival Suit", summary: "Hostile-environment suit with heating and filters.", armorRating: 3, airSupply: 4, weight: 1, cost: 20000, special: ["vacuum", "cold-protection", "comm-unit"] }),
  armor({ id: "eco-hazmat-suit", name: "Eco HAZMAT Suit", summary: "Sealed suit for contaminated environments.", armorRating: 1, airSupply: 3, weight: 1, cost: 1000, special: ["sealed", "hazard-protection"] }),
  armor({ id: "m3-personnel-armor", name: "M3 Personnel Armor", summary: "USCMC combat armor with helmet camera.", armorRating: 6, weight: 1, cost: 1200, special: ["comm-unit", "helmet-camera", "military"] }),
  armor({ id: "apesuit", name: "Armored Pressure Suit (APESuit)", summary: "USCMC armored vacuum suit.", armorRating: 7, airSupply: 5, weight: 2, cost: 25000, special: ["vacuum", "comm-unit", "heavy", "military"] }),
  armor({ id: "upp-combat-armor", name: "UPP Combat Armor", summary: "Union infantry plate.", armorRating: 5, weight: 1, cost: 900, special: ["comm-unit", "military"] }),
  armor({ id: "light-armor-vest", name: "Light Armor Vest", summary: "Security and civilian ballistic vest.", armorRating: 3, weight: 0.5, cost: 500, special: ["concealable"] }),
  armor({ id: "corporate-security-armor", name: "Corporate Security Armor", summary: "Company riot gear.", armorRating: 5, weight: 1, cost: 1500, special: ["comm-unit", "riot-shield-compatible"] }),
];

// ---------------------------------------------------------------------------
// Tools (~20)
// ---------------------------------------------------------------------------

const tool = gear("tool", [94, 96]);

export const toolPresets: AlienPreset[] = [
  tool({ id: "cutting-torch", name: "Cutting Torch", summary: "Cuts through hull plate and sealed doors.", effect: "Opens a sealed door in a stretch; see weapon entry when used in combat.", weight: 1, cost: 300, supply: 5 }),
  tool({ id: "motion-tracker", name: "Motion Tracker", summary: "Hand-held or rifle-mounted movement detector.", effect: "+2 Observation to detect moving targets within medium range; cannot tell what is moving.", weight: 1, cost: 1500, supply: 5 }),
  tool({ id: "pr-put-personal-data-transmitter", name: "Pr-Put Personal Data Transmitter", summary: "Wrist communicator and data link.", effect: "Short-range comms and data exchange; links to ship systems within long range.", weight: 0.5, cost: 100 }),
  tool({ id: "samani-e-series-headset", name: "Samani E-Series Headset", summary: "Hands-free comm headset.", effect: "Voice comms within long range; shares the squad channel.", weight: 0, cost: 300 }),
  tool({ id: "seegson-c-series-diagnostic", name: "Seegson C-Series System Diagnostic Device", summary: "Portable computer for ship and colony systems.", effect: "+2 Comtech when diagnosing or repairing systems.", weight: 1, cost: 1200 }),
  tool({ id: "electronic-tool-kit", name: "Electronic Tool Kit", summary: "Soldering, probes and spares.", effect: "Required for Comtech repairs; +1 to the roll.", weight: 1, cost: 250 }),
  tool({ id: "mechanical-tool-kit", name: "Mechanical Tool Kit", summary: "Wrenches, drivers and spares.", effect: "Required for Heavy Machinery repairs; +1 to the roll.", weight: 1, cost: 200 }),
  tool({ id: "flashlight", name: "Flashlight", summary: "Hand lamp.", effect: "Light in one zone; removes darkness penalties for the holder.", weight: 0.5, cost: 20, supply: 5 }),
  tool({ id: "head-lamp", name: "Head Lamp", summary: "Helmet or headband lamp.", effect: "Hands-free light in one zone.", weight: 0, cost: 40, supply: 5 }),
  tool({ id: "portable-floodlight", name: "Portable Floodlight", summary: "Tripod work light.", effect: "Lights a zone and its neighbours; takes a round to set up.", weight: 2, cost: 150, supply: 4 }),
  tool({ id: "binoculars", name: "Binoculars", summary: "Optical magnifier with rangefinder.", effect: "+2 Observation at long and extreme range.", weight: 0.5, cost: 100 }),
  tool({ id: "hand-held-scanner", name: "Hand-Held Scanner", summary: "Atmosphere, radiation and bio-sign scanner.", effect: "Reads atmosphere and hazards in the zone; +1 Survival to assess an environment.", weight: 0.5, cost: 800 }),
  tool({ id: "climbing-gear", name: "Climbing Gear", summary: "Harness, pitons and line.", effect: "+2 Mobility when climbing; a fall with a line deals no damage.", weight: 1, cost: 150 }),
  tool({ id: "rope-30m", name: "Rope (30 m)", summary: "Synthetic line.", effect: "Spans one zone vertically.", weight: 1, cost: 20 }),
  tool({ id: "welding-kit", name: "Welding Kit", summary: "Hand welder and consumables.", effect: "Seals a door or patches a hull breach in a stretch.", weight: 1, cost: 200, supply: 5 }),
  tool({ id: "portable-generator", name: "Portable Generator", summary: "Fuel-cell power pack.", effect: "Powers a zone's equipment for a shift per supply point.", weight: 3, cost: 1500, supply: 5 }),
  tool({ id: "respirator", name: "Respirator", summary: "Face mask with filter cartridges.", effect: "Protects against dust, spores and thin atmosphere; not vacuum.", weight: 0.5, cost: 100, supply: 4 }),
  tool({ id: "air-tank", name: "Spare Air Tank", summary: "Replacement tank for a suit.", effect: "Restores a suit's air supply to full.", weight: 1, cost: 50 }),
  tool({ id: "survival-kit", name: "Survival Kit", summary: "Thermal blanket, fire starter, water filter, signal mirror.", effect: "+2 Survival when making camp or finding water.", weight: 1, cost: 150 }),
  tool({ id: "personal-camera-recorder", name: "Personal Camera / Recorder", summary: "Helmet or hand-held recorder.", effect: "Records a shift of footage per supply point; evidence for the company or the court.", weight: 0, cost: 200, supply: 5 }),
];

// ---------------------------------------------------------------------------
// Medical (~8)
// ---------------------------------------------------------------------------

const medical = gear("medical", [96, 97]);

export const medicalPresets: AlienPreset[] = [
  medical({ id: "personal-medkit", name: "Personal Medkit", summary: "Bandages, clamps and a painkiller shot.", effect: "Required for Medical Aid in the field; +1 to the roll.", weight: 0.5, cost: 100, supply: 5 }),
  medical({ id: "surgical-kit", name: "Surgical Kit", summary: "Portable surgery set.", effect: "Allows treating critical injuries that require surgery; +2 Medical Aid in a medlab.", weight: 1, cost: 1000 }),
  medical({ id: "medical-scanner", name: "Medical Scanner", summary: "Hand-held diagnostic unit.", effect: "Diagnoses injuries, infections and implanted embryos.", weight: 0.5, cost: 2000 }),
  medical({ id: "field-stretcher", name: "Field Stretcher", summary: "Collapsible stretcher with restraints.", effect: "Two people can carry a broken character at normal speed.", weight: 1, cost: 150 }),
  medical({ id: "automed", name: "Automed Unit", summary: "Automated surgery pod.", effect: "Performs surgery without a surgeon; a Comtech roll operates it.", weight: 4, cost: 10000 }),
  medical({ id: "bio-scanner", name: "Bio-Scanner", summary: "Pathogen and organism detector.", effect: "+2 Observation to detect pathogens or hidden organisms in the zone.", weight: 1, cost: 5000 }),
  medical({ id: "trauma-pack", name: "Trauma Pack", summary: "Coagulant foam, tourniquet, chest seal.", effect: "Stabilizes a broken character without a roll; one use.", weight: 0.5, cost: 300, supply: 3 }),
  medical({ id: "cryotube-portable", name: "Portable Cryotube", summary: "Single-occupant hypersleep pod.", effect: "Halts the progress of injury, infection or implantation while sealed.", weight: 6, cost: 30000 }),
];

// ---------------------------------------------------------------------------
// Pharmaceuticals (~8)
// ---------------------------------------------------------------------------

const pharma = gear("pharmaceutical", [97, 98]);

export const pharmaceuticalPresets: AlienPreset[] = [
  pharma({ id: "naproleve", name: "Naproleve", summary: "Fast-acting painkiller injector.", effect: "Reduces stress by 1 and ignores one condition for a shift; habit-forming.", weight: 0, cost: 100, supply: 3 }),
  pharma({ id: "neversleep-pills", name: "Neversleep Pills", summary: "Stimulant tablets.", effect: "Ignore fatigue for a shift; afterwards +1 stress.", weight: 0, cost: 50, supply: 5 }),
  pharma({ id: "hydr8tion", name: "Hydr8tion", summary: "Electrolyte and rehydration pouch.", effect: "Removes the dehydrated condition.", weight: 0, cost: 20, supply: 5 }),
  pharma({ id: "recreational-drugs", name: "Recreational Drugs", summary: "Illicit chems popular on long hauls.", effect: "Reduces stress by 2 for a shift; -1 to all rolls while high.", weight: 0, cost: 200, supply: 3 }),
  pharma({ id: "x-stim", name: "X-Stim Combat Stimulant", summary: "Military injector.", effect: "+1 Speed and ignore the broken condition for a round; +2 stress afterwards.", weight: 0, cost: 400, supply: 2 }),
  pharma({ id: "antidote-kit", name: "Broad-Spectrum Antidote", summary: "Anti-venom and anti-toxin injectors.", effect: "Ends ongoing poison damage on a Medical Aid roll.", weight: 0, cost: 300, supply: 3 }),
  pharma({ id: "anti-rad", name: "Anti-Radiation Tablets", summary: "Radiation prophylaxis.", effect: "Halves radiation damage for a shift.", weight: 0, cost: 150, supply: 4 }),
  pharma({ id: "sedative", name: "Sedative Injector", summary: "Heavy tranquilizer.", effect: "Target rolls Stamina or is unconscious for a shift; works on animals.", weight: 0, cost: 120, supply: 3 }),
];

// ---------------------------------------------------------------------------
// Food (~6)
// ---------------------------------------------------------------------------

const food = gear("food", 98);

export const foodPresets: AlienPreset[] = [
  food({ id: "field-rations", name: "Field Rations", summary: "Vacuum-packed meal.", effect: "One meal per supply point; removes the starving condition.", weight: 0.5, cost: 10, supply: 5 }),
  food({ id: "emergency-rations", name: "Emergency Rations", summary: "Lifeboat biscuits and water.", effect: "Keeps one person alive for a week at -1 to Stamina.", weight: 1, cost: 50, supply: 6 }),
  food({ id: "fresh-food", name: "Fresh Food", summary: "Real food from a colony or station market.", effect: "A hot meal removes 1 stress once per day.", weight: 1, cost: 40, supply: 3 }),
  food({ id: "purified-water", name: "Purified Water", summary: "Canister of clean water.", effect: "Removes the dehydrated condition; one day per supply point.", weight: 1, cost: 5, supply: 5 }),
  food({ id: "alcohol", name: "Alcohol", summary: "Bottle of something strong.", effect: "Reduces stress by 1 per shared drink; -1 to Wits rolls for a shift.", weight: 1, cost: 30, supply: 4 }),
  food({ id: "coffee", name: "Coffee", summary: "Company-issue instant.", effect: "Removes the sleepless condition for a shift.", weight: 0.5, cost: 10, supply: 5 }),
];

// ---------------------------------------------------------------------------
// Other (~8)
// ---------------------------------------------------------------------------

const other = gear("other", 99);

export const otherItemPresets: AlienPreset[] = [
  other({ id: "cigarettes", name: "Cigarettes", summary: "Pack of smokes.", effect: "A smoke reduces stress by 1 once per shift.", weight: 0, cost: 10, supply: 5 }),
  other({ id: "ship-cat", name: "Ship's Cat", summary: "Mascot and rodent control.", effect: "Reduces stress by 1 for anyone who spends a stretch with it; hides when danger is near.", weight: 1, cost: 50 }),
  other({ id: "playing-cards", name: "Playing Cards", summary: "A worn deck.", effect: "A game during a shore-leave week counts as socializing.", weight: 0, cost: 5 }),
  other({ id: "data-chip", name: "Personal Data Chip", summary: "Encrypted storage.", effect: "Holds a ship's log, company orders or the evidence.", weight: 0, cost: 20 }),
  other({ id: "music-player", name: "Portable Music Player", summary: "Headphones and a long playlist.", effect: "Reduces stress by 1 during a shift of rest; -2 Observation while worn.", weight: 0, cost: 100 }),
  other({ id: "pressure-tent", name: "Pressure Tent", summary: "Two-person sealed shelter.", effect: "Breathable air for two for a shift per supply point.", weight: 2, cost: 2000, supply: 5 }),
  other({ id: "body-bag", name: "Body Bag", summary: "Sealed remains bag.", effect: "Contains a corpse and whatever is inside it; required for company recovery bonuses.", weight: 0.5, cost: 20 }),
  other({ id: "cargo-container", name: "Cargo Container", summary: "Standard sealed cargo pod.", effect: "Holds one cargo unit; a Heavy Machinery roll moves it with a loader.", weight: 10, cost: 500 }),
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
