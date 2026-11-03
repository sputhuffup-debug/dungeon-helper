/**
 * Where an Alien character's kit goes on the sheet. Career gear from a life
 * path (the career lists, p. 31-39) and the gear of the typical NPCs (p.
 * 258-259) are matched to the gear tables' item presets (p. 82-99) and placed
 * the way the Gear field's "From the gear list…" places a pick (module-sdk
 * `addCatalogItem`): weapons to the Weapons list with their stats (so the
 * weapons box and table-mode attacks work), everything else, suits, armor
 * and the M314/M316 motion trackers included, as gear rows with the preset's
 * weight and power supply and the preset id (the live hunt finds a tracker
 * by its row name or that preset). Rows keep the source's own wording ("Two
 * G2 Electroshock Grenades" become two G2 rows); a line no preset matches
 * stays a plain gear row.
 */
import { addCatalogItem, type EntityPreset } from "@campaign-forge/module-sdk";
import { itemPresets } from "../data/items";
import { characterType } from "./character";

/** One line of kit as a source prints it. */
export interface KitLine {
  name: string;
  qty?: number;
  /** Candidate item preset ids (without `alien.item.`), best first. */
  items?: string[];
  /** Weight of the row when no preset matches. */
  weight?: number;
}

/**
 * The career lists' gear (p. 31-39) by the item preset it is, where the
 * gear tables have one, and how many the line gives. Lines left out (a
 * leather briefcase, a yo-yo, a hand radio) have no stat line in the tables.
 */
export const CAREER_GEAR_ITEMS: Readonly<Record<string, { item: string; qty?: number; name?: string }>> = {
  "M41A Pulse Rifle": { item: "armat-m41a-pulse-rifle" },
  "M56A2 Smart Gun": { item: "armat-m56a2-smartgun" },
  "M314 Motion Tracker": { item: "motion-tracker" },
  "Two G2 Electroshock Grenades": { item: "g2-electroshock-grenade", qty: 2, name: "G2 Electroshock Grenade" },
  "IRC MK.35 Pressure Suit": { item: "irc-mk35-pressure-suit" },
  "M3 Personnel Armor": { item: "m3-personnel-armor" },
  ".357 Magnum Revolver": { item: "357-magnum-revolver" },
  "Armat Model 37A2 12-Gauge Pump-Action": { item: "armat-37a2-pump-shotgun" },
  "Hi-beam flashlight": { item: "flashlight" },
  "Personal medkit": { item: "personal-medkit" },
  "Stun baton": { item: "stun-baton" },
  "D6 doses Neversleep pills": { item: "neversleep-pills" },
  "D6 doses Neversleep": { item: "neversleep-pills" },
  "D6 doses Naproleve": { item: "naproleve" },
  "D6 doses Hydr8tion": { item: "hydr8tion" },
  "Comm unit": { item: "comm-unit" },
  "Samani E-Series Watch": { item: "samani-e-series-watch" },
  "Data transmitter card with corporate clearance level": { item: "data-transmitter-cards" },
  "VP-70MA6 Service Pistol": { item: "vp-70ma6-service-pistol" },
  "Surgical kit": { item: "surgical-kit" },
  "IRC MK.50 Compression Suit": { item: "irc-mk50-compression-suit" },
  "M4A3 Service Pistol": { item: "m4a3-service-pistol" },
  "Rexim RXF-M5 EVA Pistol": { item: "rexim-rxf-m5-eva-pistol" },
  "Seegson P-DAT": { item: "seegson-p-dat" },
  "PR-PUT Uplink Terminal": { item: "pr-put-uplink-terminal" },
  "Maintenance jack": { item: "maintenance-jack" },
  "Seegson System Diagnostic Device": { item: "seegson-system-diagnostic-device" },
  "Cutting torch": { item: "cutting-torch" },
  "Watatsumi DV-303 Bolt Gun": { item: "watatsumi-dv-303-bolt-gun" },
  "Personal Data Transmitter": { item: "personal-data-transmitter" },
};

const PREFIX = "alien.item.";
const itemsById = new Map(itemPresets.map((p) => [p.id, p]));
const normalize = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const itemsByName = new Map(itemPresets.map((p) => [normalize(p.name), p]));

/** The item preset a kit line is: its candidates, then the career gear table, then an exact name match. */
export function kitItem(line: KitLine): EntityPreset | undefined {
  for (const id of line.items ?? []) {
    const hit = itemsById.get(`${PREFIX}${id}`);
    if (hit) return hit;
  }
  const career = CAREER_GEAR_ITEMS[line.name];
  if (career) return itemsById.get(`${PREFIX}${career.item}`);
  return itemsByName.get(normalize(line.name));
}

/** How many a line gives: its own count, else the career table's ("Two G2 grenades"), else one. */
function kitQty(line: KitLine): number {
  return line.qty ?? CAREER_GEAR_ITEMS[line.name]?.qty ?? 1;
}

const GEAR_FIELD = (() => {
  for (const section of characterType.sheet.sections) for (const f of section.fields) if (f.path === "gear") return f;
  throw new Error("alien.character has no gear field");
})();

/** A character's gear and weapons rows for a list of kit lines, in order. */
export function placeKit(lines: readonly KitLine[]): { gear: Array<Record<string, unknown>>; weapons: Array<Record<string, unknown>> } {
  let fields: Record<string, unknown> = { gear: [], weapons: [] };
  for (const line of lines) {
    const preset = kitItem(line);
    const qty = kitQty(line);
    if (preset) {
      fields = addCatalogItem(characterType, GEAR_FIELD, fields, preset, { name: CAREER_GEAR_ITEMS[line.name]?.name ?? line.name, qty }).fields;
    } else {
      fields = { ...fields, gear: [...(fields.gear as unknown[]), { name: line.name, weight: line.weight ?? 1, qty }] };
    }
  }
  return { gear: fields.gear as Array<Record<string, unknown>>, weapons: fields.weapons as Array<Record<string, unknown>> };
}
