/**
 * Converting the other remaster ORC books into the supplement "Remaster ORC
 * books": the same readers, converters and Reserved Material scrubbing as the
 * module (scripts/source), with a different book allow-list, then the result
 * mapped onto a supplement: items for the module's own lists go in
 * `referenceItems` (ids namespaced by the supplement id), lists the module
 * has no counterpart for (class feats of the new classes, mythic feats...)
 * become new lists, and creatures and hazards become presets.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { EntityPreset, ReferenceItem, ReferenceList, RuleCard } from "@campaign-forge/module-sdk";
import { assertClean, compact } from "../convert.ts";
import { ANCESTRIES, CLASSES, PACK } from "../ids.ts";
import { convertCharacterOptions } from "../source/character.ts";
import type { Ctx } from "../source/common.ts";
import { convertCreatures } from "../source/creatures.ts";
import { convertEquipment } from "../source/equipment.ts";
import { convertFeats } from "../source/feats.ts";
import { convertGlossaries } from "../source/glossary.ts";
import { convertHazards } from "../source/hazards.ts";
import { exclude, newLog, obj, publicationOf, readFolder, readLocalization, str, type BookFilter, type Entry, type ReadLog } from "../source/read.ts";
import { newScrubLog, RESERVED } from "../source/reserved.ts";
import { convertActions, convertConditions } from "../source/rules.ts";
import { convertSpells, spellLists } from "../source/spells.ts";
import { ALLOWED_TITLES, BOOKS, DATA_TITLES, NEAR_TITLES, SUPPLEMENT, type Book } from "./books.ts";

/** Folders never read (setting or adventure material, or no licence data), as for the module. */
export const NEVER_READ = ["deities", "journals", "rollable-tables", "iconics", "paizo-pregens", "criticaldeck"];

/** Folders whose allow-listed entries are not used, and why. */
const NOT_USED: Record<string, string> = {
  "bestiary-effects": "Foundry automation effects (not rules text)",
  "equipment-effects": "Foundry automation effects (not rules text)",
  "feat-effects": "Foundry automation effects (not rules text)",
  "spell-effects": "Foundry automation effects (not rules text)",
  "other-effects": "Foundry automation effects (not rules text)",
  "campaign-effects": "Foundry automation effects (not rules text)",
  "adventure-specific-actions": "adventure-specific actions (not relic gifts; one names setting characters)",
};

/** Creature folders: bestiaries of the allow-listed books (creatures and the hazards some of them hold). */
export const CREATURE_FOLDERS = ["pathfinder-monster-core-2", "pathfinder-npc-core", "battlecry-bestiary", "howl-of-the-wild-bestiary", "war-of-immortals-bestiary", "pathfinder-dark-archive", "rage-of-elements-bestiary"];

/** The classes these books add (each gets a list of class feats when it has any). */
export const NEW_CLASSES = ["animist", "commander", "exemplar", "guardian", "gunslinger", "inventor", "magus", "necromancer", "psychic", "runesmith", "summoner", "thaumaturge"] as const;
/** The ancestries these books add (a note when one has no ancestry feats). */
export const NEW_ANCESTRIES = ["athamaru", "automaton", "awakened-animal", "centaur", "jotunborn", "merfolk", "minotaur", "surki"] as const;

const FILTER: BookFilter = { books: DATA_TITLES, label: "an allow-listed book" };

/** One supplement entry with where it goes: an item for one of the module's lists, a new list, a preset or a rule card. */
export interface SupplementContent {
  /** Items for the module's own lists, by list id, in order. */
  referenceItems: Array<{ listId: string; items: ReferenceItem[] }>;
  referenceLists: ReferenceList[];
  creatures: EntityPreset[];
  hazards: EntityPreset[];
  rules: RuleCard[];
}

export interface SupplementConversion {
  content: SupplementContent;
  /** Books with at least one entry kept, in allow-list order. */
  included: Book[];
  /** Data the module's character sheet needs: Hit Points of the supplement's ancestries and classes, by supplement item id. */
  hp: { ancestryHp: Record<string, number>; classHp: Record<string, number> };
  notes: string[];
  counts: Record<string, unknown>;
}

const walk = (dir: string): string[] =>
  readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const p = join(dir, name);
      return statSync(p).isDirectory() ? walk(p) : name.endsWith(".json") && !name.startsWith("_") ? [p] : [];
    });

/** Every entry of an allow-listed (or near) title in every folder that may be read: book → folder → status → count. */
function census(root: string): Map<string, Map<string, Map<string, number>>> {
  const out = new Map<string, Map<string, Map<string, number>>>();
  const near = new Set(NEAR_TITLES);
  for (const folder of readdirSync(join(root, "packs", "pf2e")).sort()) {
    if (NEVER_READ.includes(folder)) continue;
    const dir = join(root, "packs", "pf2e", folder);
    if (!statSync(dir).isDirectory()) continue;
    for (const path of walk(dir)) {
      const pub = publicationOf(obj(obj(JSON.parse(readFileSync(path, "utf8")) as unknown).system));
      if (!pub) continue;
      const title = pub.title;
      const book = DATA_TITLES[title];
      if (!book && !near.has(title)) continue;
      const key = book ?? `${title} (not allow-listed)`;
      const status = pub.license !== "ORC" ? `licence ${pub.license || "unknown"}` : !pub.remaster ? "not remastered" : "ORC, remastered";
      const f = out.get(key) ?? new Map<string, Map<string, number>>();
      const s = f.get(folder) ?? new Map<string, number>();
      s.set(status, (s.get(status) ?? 0) + 1);
      f.set(folder, s);
      out.set(key, f);
    }
  }
  return out;
}

/** The module's list ids (from its committed pack files). */
export function baseListIds(packDir: string): Set<string> {
  const ids = new Set<string>();
  for (const f of readdirSync(packDir).sort()) {
    if (!f.endsWith(".json")) continue;
    const data = JSON.parse(readFileSync(join(packDir, f), "utf8")) as { referenceLists?: Array<{ id: string }> };
    for (const l of data.referenceLists ?? []) ids.add(l.id);
  }
  return ids;
}

const moduleId = (rest: string) => `${PACK}.${rest}`;
const supplementId = (moduleScoped: string) => `${SUPPLEMENT}.${moduleScoped.slice(PACK.length + 1)}`;
const bookOfCite = (cite: string | undefined) => (cite ?? "").split(" — ")[0] ?? "";

/**
 * Convert the allow-listed books. `baseLists` are the module's list ids:
 * converted lists with one of them become `referenceItems` for it, the others
 * new lists.
 */
export function convertSupplementSource(root: string, baseLists: Set<string>): SupplementConversion {
  const log: ReadLog = newLog();
  const loc = readLocalization(root, ["en.json", "re-en.json", "action-en.json"]);
  const ctx: Ctx = { text: { loc, notes: new Map() }, scrub: newScrubLog(), notes: [] };
  const read = (folder: string) => readFolder(root, folder, log, FILTER);
  const setAside = (folder: string, reason: string) => {
    const n = read(folder).length;
    log.included[folder] = (log.included[folder] ?? 0) - n;
    for (let i = 0; i < n; i++) exclude(log, folder, reason);
  };
  setAside("adventure-specific-actions", NOT_USED["adventure-specific-actions"]!);

  // Creatures and the hazards their bestiaries hold.
  const bestiaries = CREATURE_FOLDERS.flatMap((f) => read(f));
  const npcs = bestiaries.filter((e) => e.type === "npc");
  const role = (e: Entry) => {
    if (e.folder !== "pathfinder-npc-core") return [];
    const dirs = e.file.split("/").slice(1, -1);
    return dirs.length ? [dirs[dirs.length - 1]!.replace(/-/g, " ")] : [];
  };
  const conditions = convertConditions(read("conditions"), ctx);
  const actions = convertActions(read("actions"), ctx);
  const character = convertCharacterOptions(
    { ancestries: read("ancestries"), heritages: read("heritages"), backgrounds: read("backgrounds"), classes: read("classes"), classFeatures: read("class-features"), ancestryFeatures: read("ancestry-features") },
    ctx,
  );
  const feats = convertFeats(read("feats"), ctx, {
    classes: [...CLASSES, ...NEW_CLASSES],
    ancestries: NEW_ANCESTRIES,
    groups: [
      { listId: "feats.mythic", name: "Mythic feats", section: "Mythic Feats", traits: ["mythic"] },
      { listId: "feats.aftermath-deviant", name: "Aftermath and deviant feats", section: "Aftermath and Deviant Feats", traits: ["aftermath", "deviant"] },
    ],
  });
  const spells = spellLists(convertSpells(read("spells"), ctx));
  const equipment = convertEquipment(read("equipment"), ctx);
  const glossaries = convertGlossaries(
    { universal: read("bestiary-ability-glossary-srd"), family: read("bestiary-family-ability-glossary"), familiar: read("familiar-abilities"), relic: [], vehicles: read("vehicles") },
    ctx,
  );
  // One call per bestiary (slugs are unique within one); a slug two books share gets its folder in the id.
  ctx.text.glossary = "pointer";
  const creatures = { presets: [] as EntityPreset[] };
  const taken = new Set<string>();
  for (const folder of CREATURE_FOLDERS) {
    for (const p of convertCreatures(npcs.filter((e) => e.folder === folder), ctx, { extraTags: role }).presets) {
      let pid = p.id;
      if (taken.has(pid)) {
        pid = p.id.replace(".preset.", `.preset.${folder.replace(/^pathfinder-/, "")}.`);
        ctx.notes.push(`${p.name}: the same name in two books; the ${folder} one has the id ${pid.slice(PACK.length + 1)}`);
      }
      taken.add(pid);
      creatures.presets.push({ ...p, id: pid });
    }
  }
  creatures.presets.sort((a, b) => a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1));
  ctx.text.glossary = undefined;
  const hazards = convertHazards([...bestiaries.filter((e) => e.type === "hazard"), ...read("hazards")], ctx);
  const otherTypes = bestiaries.filter((e) => e.type !== "npc" && e.type !== "hazard");
  if (otherTypes.length) ctx.notes.push(`bestiary entries of other types left out: ${otherTypes.map((e) => `${e.name} [${e.type}]`).join(", ")}`);

  // Map the converted lists onto the module's lists, or onto new ones.
  const content: SupplementContent = { referenceItems: [], referenceLists: [], creatures: [], hazards: [], rules: [] };
  const lists = compact([...conditions.lists, ...actions.lists, ...glossaries, ...character.lists, ...feats, ...spells, ...equipment.lists]).filter((l) => l.items.length > 0);
  const idMap = new Map<string, Map<string, string>>();
  for (const l of lists) {
    if (baseLists.has(l.id)) {
      const ids = new Map<string, string>();
      const items = l.items.map((i) => {
        const nid = `${SUPPLEMENT}.${i.id}`;
        ids.set(i.id, nid);
        return { ...i, id: nid };
      });
      idMap.set(l.id, ids);
      content.referenceItems.push({ listId: l.id, items });
    } else {
      // A new list cites the book its items come from (the converters name a core book).
      const books = [...new Set(l.items.map((i) => bookOfCite(i.cite as string | undefined)))].filter(Boolean);
      const section = (l.cite ?? "").split(" — ")[1] ?? l.name;
      content.referenceLists.push({ ...l, id: supplementId(l.id), cite: `${books.join(", ")} — ${section}` });
    }
  }
  const ruleId = (r: RuleCard) => supplementId(r.id);
  content.rules = compact([...conditions.rules, ...actions.rules]).map((r) => ({ ...r, id: ruleId(r) }));
  const presetId = (p: EntityPreset) => supplementId(p.id);
  content.creatures = compact(creatures.presets).map((p) => ({ ...p, id: presetId(p) }));
  content.hazards = compact(hazards).map((p) => ({ ...p, id: presetId(p) }));

  // Hit Points of the supplement's ancestries and classes, by the ids the sheet stores.
  const hp = { ancestryHp: {} as Record<string, number>, classHp: {} as Record<string, number> };
  for (const [k, v] of Object.entries(character.ancestryHp)) hp.ancestryHp[idMap.get(moduleId("ancestries"))?.get(k) ?? k] = v;
  for (const [k, v] of Object.entries(character.classHp)) hp.classHp[idMap.get(moduleId("classes"))?.get(k) ?? k] = v;
  for (const k of [...Object.keys(hp.ancestryHp), ...Object.keys(hp.classHp)]) if ((ANCESTRIES as readonly string[]).includes(k) || (CLASSES as readonly string[]).includes(k)) throw new Error(`supplement id ${k} is not namespaced`);

  // Books kept, by the citation of what was kept.
  const kept = new Map<string, Map<string, number>>();
  const count = (book: string, kind: string, n = 1) => {
    const m = kept.get(book) ?? new Map<string, number>();
    m.set(kind, (m.get(kind) ?? 0) + n);
    kept.set(book, m);
  };
  const kindOf = (listId: string) =>
    listId.startsWith(`${PACK}.feats.`) || listId.startsWith(`${SUPPLEMENT}.feats.`)
      ? "feats"
      : listId.startsWith(`${PACK}.spells.`)
        ? "spells"
        : listId.startsWith(`${PACK}.equipment.`)
          ? "equipment"
          : listId.slice(listId.indexOf(".") + 1);
  for (const { listId, items } of content.referenceItems) for (const i of items) count(bookOfCite(i.cite as string), kindOf(listId));
  for (const l of content.referenceLists) for (const i of l.items) count(bookOfCite(i.cite as string), kindOf(l.id));
  for (const p of content.creatures) count(bookOfCite(p.cite), "creatures");
  for (const p of content.hazards) count(bookOfCite(p.cite), "hazards");
  for (const r of content.rules) count(bookOfCite(r.cite), "rule cards");
  const included = BOOKS.filter((b) => kept.has(b.cite));

  // Notes.
  const notes: string[] = [];
  notes.push(`# Conversion notes for the supplement ${SUPPLEMENT}`, "");
  notes.push("## Allow-list", `Kept only entries with system.publication.license "ORC", remaster true, and a title in: ${ALLOWED_TITLES.join("; ")}.`);
  notes.push('The source spells Guns & Gears (Remastered) as "Pathfinder Guns & Gears" (ORC, remastered; the original book is OGL); titles are compared trimmed.');
  notes.push(`Folders never read: ${NEVER_READ.join(", ")}.`, "");
  notes.push("## Every entry of an allow-listed (or near) title in the folders that may be read, by book, folder and licence");
  const seen = census(root);
  for (const [book, folders] of [...seen.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    let total = 0;
    const lines: string[] = [];
    for (const [folder, statuses] of [...folders.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      for (const [status, n] of [...statuses.entries()].sort()) {
        total += n;
        const why = status !== "ORC, remastered" ? "excluded" : NOT_USED[folder] ? `not used: ${NOT_USED[folder]}` : folder === "season-of-ghosts-bestiary" ? "not used: a copy inside an adventure bestiary" : book.endsWith("(not allow-listed)") ? "excluded: title not on the allow-list" : "read";
        lines.push(`  ${folder}: ${n} × ${status} (${why})`);
      }
    }
    notes.push(`${book}: ${total}`, ...lines);
  }
  notes.push("", "## Kept, by book and content type");
  for (const b of BOOKS) {
    const m = kept.get(b.cite);
    notes.push(m ? `${b.cite}: ${[...m.entries()].sort().map(([k, n]) => `${n} ${k}`).join(", ")}` : `${b.cite}: nothing kept${b.cite === "Rage of Elements" ? " (the source marks every entry of it OGL, so none is ORC)" : ""}`);
  }
  notes.push("", "## Entries read per folder (after the allow-list)");
  for (const [f, n] of Object.entries(log.included).sort()) notes.push(`${f}: ${n}`);
  notes.push("", "## Entries excluded by publication, per folder (all books)");
  let excludedTotal = 0;
  for (const [f, reasons] of Object.entries(log.excluded).sort()) for (const [reason, n] of Object.entries(reasons).sort()) {
    notes.push(`${f}: ${n} × ${reason}`);
    excludedTotal += n;
  }
  notes.push(`total excluded: ${excludedTotal}`);
  notes.push("", `## Reserved Material (denylist of ${RESERVED.length} terms, shared with the module)`, "Entries dropped:");
  for (const d of [...ctx.scrub.dropped].sort()) notes.push(`- ${d}`);
  notes.push("Sentences, list items or table rows removed, by term:");
  for (const [term, n] of [...ctx.scrub.removed.entries()].sort()) notes.push(`- ${term}: ${n}`);
  notes.push("Rewritten to a generic phrase, by term:");
  for (const [term, n] of [...ctx.scrub.replaced.entries()].sort()) notes.push(`- ${term}: ${n}`);
  notes.push("", "## Mapping onto the module", "Items added to the module's lists:");
  for (const { listId, items } of content.referenceItems) notes.push(`- ${listId}: ${items.length}`);
  notes.push("New lists:");
  for (const l of content.referenceLists) notes.push(`- ${l.id}: ${l.items.length}`);
  notes.push("", "## Text conversion");
  for (const [k, n] of [...ctx.text.notes.entries()].sort()) notes.push(`- ${k}: ${n}`);
  for (const n of [...new Set(ctx.notes)].sort()) notes.push(`- ${n}`);

  const counts: Record<string, unknown> = {
    books: Object.fromEntries(BOOKS.map((b) => [b.cite, Object.fromEntries([...(kept.get(b.cite)?.entries() ?? [])].sort())])),
    creatures: content.creatures.length,
    hazards: content.hazards.length,
    ruleCards: content.rules.length,
    referenceItems: content.referenceItems.reduce((n, l) => n + l.items.length, 0),
    newLists: content.referenceLists.length,
    newListItems: content.referenceLists.reduce((n, l) => n + l.items.length, 0),
    excluded: excludedTotal,
    droppedForReservedNames: ctx.scrub.dropped.length,
    sentencesRemoved: [...ctx.scrub.removed.values()].reduce((a, b) => a + b, 0),
    rewrites: [...ctx.scrub.replaced.values()].reduce((a, b) => a + b, 0),
    lists: Object.fromEntries([...content.referenceItems.map((l) => [l.listId, l.items.length] as const), ...content.referenceLists.map((l) => [l.id, l.items.length] as const)]),
  };
  return { content, included, hp, notes, counts };
}

/** The text a part file may hold, for the Reserved Material check: its own book citations ("Howl of the Wild — Feats: ...") cite the source as the licence asks and are allowed; everything else must be clean. */
export function scannableText(data: unknown): string {
  const prefixes = BOOKS.map((b) => `${b.cite} — `);
  return JSON.stringify(data, (key, value: unknown) => {
    if (key === "manifest") return undefined;
    if (key === "cite" && typeof value === "string") {
      for (const p of prefixes) if (value.startsWith(p)) return value.slice(p.length);
      // a new list cites several books: "Battlecry!, War of Immortals — Commander Feats"
      const [books, rest] = value.split(" — ");
      if (rest !== undefined && books!.split(", ").every((b) => BOOKS.some((x) => x.cite === b))) return rest;
    }
    return value;
  });
}

/** Throws on Reserved Material (outside the allowed citations) or Foundry markup in a part file. */
export function assertSupplementClean(name: string, data: unknown): void {
  assertClean(name, scannableText(data));
}

export { str };
