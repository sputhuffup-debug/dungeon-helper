/**
 * Builds the pack's JSON files.
 *
 *   pnpm --filter @campaign-forge/module-dnd5e-srd build-pack -- --srd <5e-database>/src/2014/en [--srd52 <5e-database>/src/2024/en]
 *       converts the SRD 5.1 data (5e-bits/5e-database, 2014 files) into the
 *       part files (srd-*.json), adds the SRD 5.2 character options (2024 files:
 *       backgrounds, species, lineages, traits, subclasses and their features,
 *       feats) to the character lists, and then writes the authored files.
 *       `--srd52` defaults to the 2024 directory next to the 2014 one;
 *   pnpm --filter @campaign-forge/module-dnd5e-srd build-pack
 *       rewrites only the authored files (pack.json, tables.json) from
 *       scripts/authored, reading the committed parts it depends on.
 *
 * The source directory is read as data only (JSON.parse); nothing in it is run.
 * Output is deterministic: the same source gives byte-identical files.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { EntityPreset, ReferenceList } from "@campaign-forge/module-sdk";
import { buildAuthored, PARTS, type GeneratedData } from "./authored/index.ts";
import { PACK } from "./ids.ts";
import { convertBasics } from "./srd/basics.ts";
import { convertCharacterOptions } from "./srd/character.ts";
import { convertEquipment, convertMagicItems } from "./srd/items.ts";
import { convertMonsters } from "./srd/monsters.ts";
import { readSource } from "./srd/read.ts";
import { convertRules } from "./srd/rules.ts";
import { convertSpells } from "./srd/spells.ts";
import { convertSrd52, mergeSrd52 } from "./srd/srd52.ts";

const here = dirname(fileURLToPath(import.meta.url));
export const PACK_DIR = resolve(here, "../pack");
const GENERATED = resolve(here, "generated");

const MAX_PART_BYTES = 2 * 1024 * 1024;

function write(file: string, data: unknown): number {
  const json = `${JSON.stringify(data, null, 1)}\n`;
  writeFileSync(file, json);
  return Buffer.byteLength(json);
}

function part(name: string, collections: Record<string, unknown>) {
  return { $schema: "../../module-sdk/schema/module-pack-part.schema.json", format: "campaign-forge-pack-part", formatVersion: 1, pack: PACK, name, ...collections };
}

function convertSrd(dir: string, dir52: string): { files: Record<string, unknown>; spellSlots: Record<string, number[][]>; notes: string[] } {
  const read = (n: string) => readSource(dir, `5e-SRD-${n}.json`);
  const read52 = (n: string) => readSource(dir52, `5e-SRD-${n}.json`);
  const monstersRaw = read("Monsters");
  const monsters = convertMonsters(monstersRaw);
  const spells = convertSpells(read("Spells"));
  const magicItems = convertMagicItems(read("Magic-Items"));
  const equipment = convertEquipment(read("Equipment"));
  const character = convertCharacterOptions({
    classes: read("Classes"),
    levels: read("Levels"),
    features: read("Features"),
    subclasses: read("Subclasses"),
    races: read("Races"),
    subraces: read("Subraces"),
    traits: read("Traits"),
    backgrounds: read("Backgrounds"),
    feats: read("Feats"),
  });
  const srd52 = convertSrd52(
    { backgrounds: read52("Backgrounds"), species: read52("Species"), subspecies: read52("Subspecies"), traits: read52("Traits"), subclasses: read52("Subclasses"), features: read52("Features"), feats: read52("Feats") },
    character.lists,
  );
  const characterLists = mergeSrd52(character.lists, srd52);
  const basics = convertBasics({
    abilityScores: read("Ability-Scores"),
    skills: read("Skills"),
    alignments: read("Alignments"),
    conditions: read("Conditions"),
    damageTypes: read("Damage-Types"),
    languages: read("Languages"),
    magicSchools: read("Magic-Schools"),
    weaponProperties: read("Weapon-Properties"),
    monsters: monstersRaw,
  });
  const rules = convertRules({ rules: read("Rules"), sections: read("Rule-Sections"), conditions: read("Conditions"), magicItems: read("Magic-Items"), spells: read("Spells") });
  const files: Record<string, unknown> = {
    "srd-basics.json": part("srd-basics.json", { referenceLists: basics }),
    "srd-rules.json": part("srd-rules.json", { rules: rules.rules, tables: rules.tables }),
    // Two monster files keep each lazily loaded chunk under the bundler's 500 kB warning.
    "srd-monsters-1.json": part("srd-monsters-1.json", { presets: monsters.presets.slice(0, Math.ceil(monsters.presets.length / 2)) }),
    "srd-monsters-2.json": part("srd-monsters-2.json", { presets: monsters.presets.slice(Math.ceil(monsters.presets.length / 2)) }),
    "srd-spells.json": part("srd-spells.json", { referenceLists: [spells] }),
    "srd-equipment.json": part("srd-equipment.json", { referenceLists: [...equipment, magicItems] }),
    "srd-character.json": part("srd-character.json", { referenceLists: characterLists }),
  };
  return { files, spellSlots: character.spellSlots, notes: [...monsters.notes, ...character.notes, ...rules.notes, ...srd52.notes] };
}

function readPart(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(PACK_DIR, name), "utf8")) as Record<string, unknown>;
}

/** What the authored files need from the converted data. */
export function generatedData(readJson: (name: string) => Record<string, unknown>, spellSlots: Record<string, number[][]>): GeneratedData {
  const monsters = [...(readJson("srd-monsters-1.json").presets as EntityPreset[]), ...(readJson("srd-monsters-2.json").presets as EntityPreset[])];
  const lists = [...(readJson("srd-basics.json").referenceLists as ReferenceList[]), ...(readJson("srd-character.json").referenceLists as ReferenceList[])];
  return { monsters, lists, spellSlots };
}

function main(argv: string[]): void {
  let srd: string | undefined;
  let srd52: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--") continue;
    if (argv[i] === "--srd") srd = argv[++i];
    else if (argv[i] === "--srd52") srd52 = argv[++i];
    else throw new Error(`unknown argument ${argv[i]}\nusage: build-pack [--srd <5e-database>/src/2014/en [--srd52 <5e-database>/src/2024/en]]`);
  }
  if (srd52 && !srd) throw new Error("--srd52 needs --srd (the SRD 5.2 options are added to the SRD 5.1 lists)");
  mkdirSync(PACK_DIR, { recursive: true });
  mkdirSync(GENERATED, { recursive: true });
  const sizes: Record<string, number> = {};
  let spellSlots: Record<string, number[][]>;
  if (srd) {
    // The 2024 files sit next to the 2014 ones in 5e-database (src/2014/en, src/2024/en).
    const dir52 = resolve(srd52 ?? join(resolve(srd), "../../2024/en"));
    if (!existsSync(dir52)) throw new Error(`no SRD 5.2 source at ${dir52}; pass --srd52 <5e-database>/src/2024/en`);
    const out = convertSrd(resolve(srd), dir52);
    for (const [name, data] of Object.entries(out.files)) sizes[name] = write(join(PACK_DIR, name), data);
    spellSlots = out.spellSlots;
    write(join(GENERATED, "spell-slots.json"), spellSlots);
    writeFileSync(join(GENERATED, "conversion-notes.txt"), `${out.notes.join("\n")}\n`);
    for (const n of out.notes) console.log(`note: ${n}`);
  } else {
    spellSlots = JSON.parse(readFileSync(join(GENERATED, "spell-slots.json"), "utf8")) as Record<string, number[][]>;
  }
  const authored = buildAuthored(generatedData(readPart, spellSlots));
  for (const [name, data] of Object.entries(authored)) sizes[name] = write(join(PACK_DIR, name), data);
  for (const p of PARTS) if (!(p in sizes)) sizes[p] = Buffer.byteLength(readFileSync(join(PACK_DIR, p)));
  for (const [name, bytes] of Object.entries(sizes).sort()) {
    console.log(`${name.padEnd(22)} ${(bytes / 1024).toFixed(0).padStart(6)} KiB`);
    if (bytes > MAX_PART_BYTES) throw new Error(`${name} is over 2 MiB; split it`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
