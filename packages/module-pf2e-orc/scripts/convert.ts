/**
 * Converting the source: read every folder we use, keep only ORC remastered
 * core-book entries, convert each content type, scrub Reserved Material, and
 * pack the result into part files of bounded size.
 */
import type { EntityPreset, ReferenceList, RuleCard } from "@campaign-forge/module-sdk";
import { PACK } from "./ids.ts";
import { convertCharacterOptions } from "./source/character.ts";
import type { Ctx } from "./source/common.ts";
import { convertCreatures } from "./source/creatures.ts";
import { convertEquipment } from "./source/equipment.ts";
import { convertFeats } from "./source/feats.ts";
import { convertGlossaries } from "./source/glossary.ts";
import { convertHazards } from "./source/hazards.ts";
import { exclude, newLog, readFolder, readLocalization, type Entry, type ReadLog } from "./source/read.ts";
import { newScrubLog, RESERVED, termPattern } from "./source/reserved.ts";
import { convertActions, convertConditions } from "./source/rules.ts";
import { convertSpells, spellLists } from "./source/spells.ts";

/** Bytes of one part's JSON, minified (what the bundler ships). Parts stay under this. */
export const PART_BUDGET = 400_000;

export interface Part {
  name: string;
  referenceLists?: ReferenceList[];
  presets?: EntityPreset[];
  rules?: RuleCard[];
}

export interface Conversion {
  parts: Part[];
  /** Data the authored files need. */
  generated: { ancestryHp: Record<string, number>; classHp: Record<string, number>; bulk: Record<string, number> };
  notes: string[];
  counts: Record<string, number>;
}

/** Folders whose entries are adventure copies (setting-specific); never read. */
const SKIPPED_FOLDERS = ["deities", "journals", "rollable-tables", "iconics", "paizo-pregens", "criticaldeck"];

const minified = (x: unknown) => Buffer.byteLength(JSON.stringify(x));

/** Greedy, order-preserving packing of lists (or presets) into parts under the budget. */
export function pack<T>(prefix: string, items: T[], key: "referenceLists" | "presets" | "rules"): Part[] {
  const parts: Part[] = [];
  let cur: T[] = [];
  let size = 0;
  const flush = () => {
    if (cur.length) parts.push({ name: `${prefix}-${parts.length + 1}.json`, [key]: cur } as Part);
    cur = [];
    size = 0;
  };
  for (const it of items) {
    const n = minified(it);
    if (n > PART_BUDGET) throw new Error(`${prefix}: one item is ${n} bytes, over the part budget; split it`);
    if (size + n > PART_BUDGET) flush();
    cur.push(it);
    size += n;
  }
  flush();
  if (parts.length === 1) parts[0]!.name = `${prefix}.json`;
  return parts;
}

/** Drop empty strings, empty lists and empty objects from reference items and preset fields (smaller, cleaner JSON). */
export function compact<T>(v: T): T {
  if (Array.isArray(v)) return v.map(compact) as T;
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      if (x === "" || x === undefined) continue;
      out[k] = compact(x);
    }
    return out as T;
  }
  return v;
}

/** Nothing the scrubber should have caught, and no Foundry markup, may reach an output file: throws on the first one. */
export function assertClean(name: string, text: string): void {
  for (const x of RESERVED) {
    const m = termPattern(x.term).exec(text);
    if (m) throw new Error(`${name}: Reserved Material "${x.term}" left in: …${text.slice(Math.max(0, m.index - 80), m.index + 80)}…`);
  }
  const markup = /@(UUID|Check|Damage|Template|Localize|actor|item)\b|\[\[\/|<\/?(p|strong|em|span|table|li)\b|&nbsp;|systems\/pf2e|\.webp/.exec(text);
  if (markup) throw new Error(`${name}: Foundry markup left in: …${text.slice(Math.max(0, markup.index - 80), markup.index + 80)}…`);
}

export function convertSource(root: string): Conversion {
  const log: ReadLog = newLog();
  const loc = readLocalization(root, ["en.json", "re-en.json", "action-en.json"]);
  const ctx: Ctx = { text: { loc, notes: new Map() }, scrub: newScrubLog(), notes: [] };
  const read = (folder: string) => readFolder(root, folder, log);

  // Monster Core creatures live in their own folder; the Monster Core-tagged
  // copies in adventure bestiaries are adventure material and are not read.
  const creaturesRaw = read("pathfinder-monster-core");
  const setAside = (folder: string, reason: string) => {
    const n = read(folder).length;
    log.included[folder] = (log.included[folder] ?? 0) - n;
    for (let i = 0; i < n; i++) exclude(log, folder, reason);
  };
  setAside("pathfinder-bestiary", "a Player Core spell's summoned creature in an older bestiary folder (its statistics are in the spell)");
  for (const f of ["season-of-ghosts-bestiary", "the-dead-gods-hand-bestiary"]) setAside(f, "Monster Core-tagged copy inside an adventure bestiary (adventure material)");

  const conditions = convertConditions(read("conditions"), ctx);
  const actions = convertActions(read("actions"), ctx);
  const character = convertCharacterOptions(
    {
      ancestries: read("ancestries"),
      heritages: read("heritages"),
      backgrounds: read("backgrounds"),
      classes: read("classes"),
      classFeatures: read("class-features"),
      ancestryFeatures: read("ancestry-features"),
    },
    ctx,
  );
  const feats = convertFeats(read("feats"), ctx);
  const spells = spellLists(convertSpells(read("spells"), ctx));
  const equipment = convertEquipment(read("equipment"), ctx);
  const glossaries = convertGlossaries(
    {
      universal: read("bestiary-ability-glossary-srd"),
      family: read("bestiary-family-ability-glossary"),
      familiar: read("familiar-abilities"),
      relic: read("adventure-specific-actions"),
      vehicles: read("vehicles"),
    },
    ctx,
  );
  ctx.text.glossary = "pointer";
  const creatures = convertCreatures(creaturesRaw, ctx);
  ctx.text.glossary = undefined;
  const hazards = convertHazards(read("hazards"), ctx);

  const parts: Part[] = [
    ...pack("core-reference", compact([...conditions.lists, ...actions.lists, ...glossaries]), "referenceLists"),
    ...pack("core-rules", compact([...conditions.rules, ...actions.rules]), "rules"),
    ...pack("core-character", compact(character.lists), "referenceLists"),
    ...pack("core-feats", compact(feats), "referenceLists"),
    ...pack("core-spells", compact(spells), "referenceLists"),
    ...pack("core-equipment", compact(equipment.lists), "referenceLists"),
    ...pack("core-creatures", compact(creatures.presets), "presets"),
    { name: "core-hazards.json", presets: compact(hazards) },
  ];
  for (const p of parts) {
    const n = minified(p);
    if (n > PART_BUDGET * 1.25) throw new Error(`${p.name} is ${n} bytes; split it`);
    assertClean(p.name, JSON.stringify(p));
  }

  // Notes: exclusions, Reserved Material handling, text conversion.
  const notes: string[] = [];
  notes.push(`# Conversion notes for ${PACK}`, "", "## Entries kept (ORC licence, remastered, from Player Core, Player Core 2, GM Core or Monster Core)");
  for (const [f, n] of Object.entries(log.included).sort()) notes.push(`${f}: ${n}`);
  notes.push("", "## Entries excluded by publication", `Folders never read (setting or adventure material, or no licence data): ${SKIPPED_FOLDERS.join(", ")}.`);
  let excludedTotal = 0;
  for (const [f, reasons] of Object.entries(log.excluded).sort()) for (const [reason, n] of Object.entries(reasons).sort()) {
    notes.push(`${f}: ${n} × ${reason}`);
    excludedTotal += n;
  }
  notes.push(`total excluded: ${excludedTotal}`);
  notes.push("", `## Reserved Material (denylist of ${RESERVED.length} terms)`, "Entries dropped:");
  for (const d of [...ctx.scrub.dropped].sort()) notes.push(`- ${d}`);
  notes.push("Sentences, list items or table rows removed, by term:");
  for (const [term, n] of [...ctx.scrub.removed.entries()].sort()) notes.push(`- ${term}: ${n}`);
  notes.push("Rewritten to a generic phrase, by term:");
  for (const [term, n] of [...ctx.scrub.replaced.entries()].sort()) notes.push(`- ${term}: ${n}`);
  notes.push("", "## Text conversion");
  for (const [k, n] of [...ctx.text.notes.entries()].sort()) notes.push(`- ${k}: ${n}`);
  for (const n of [...new Set(ctx.notes)].sort()) notes.push(`- ${n}`);

  const lists = parts.flatMap((p) => p.referenceLists ?? []);
  const counts: Record<string, number> = {
    creatures: creatures.presets.length,
    hazards: hazards.length,
    ruleCards: conditions.rules.length + actions.rules.length,
    excluded: excludedTotal,
    droppedForReservedNames: ctx.scrub.dropped.length,
    ...Object.fromEntries(lists.map((l) => [l.id.slice(PACK.length + 1), l.items.length])),
  };
  return { parts, generated: { ancestryHp: character.ancestryHp, classHp: character.classHp, bulk: equipment.bulk }, notes, counts };
}

export type { Entry };
