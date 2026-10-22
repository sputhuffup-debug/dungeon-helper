/**
 * The built-in supplement "Remaster ORC books": it loads from its split files,
 * fits the module, keeps only allow-listed ORC books, carries no Reserved
 * Material or Foundry markup, and its values match the source.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applySupplements,
  checkDeterminism,
  checkSupplementAgainst,
  computeFields,
  loadModule,
  moduleFromPackSource,
  supplementCounts,
  supplementFromSource,
  validateSupplement,
  type GameModule,
  type LoadedModule,
  type ModuleSupplement,
  type ReferenceItem,
} from "@campaign-forge/module-sdk";
import { beforeAll, describe, expect, it } from "vitest";
import { ORC_NOTICE, TRADEMARK_NOTICE } from "../scripts/authored/manifest.ts";
import { BOOKS, SUPPLEMENT } from "../scripts/supplement/books.ts";
import { scannableText } from "../scripts/supplement/convert.ts";
import { anyReservedPattern, RESERVED } from "../scripts/source/reserved.ts";
import { pf2eOrcSource } from "../src";
import { pf2eOrcBooksSource } from "../src/supplement";
import { pf2eOrcBooksManifest } from "../src/supplementManifest";

const DIR = join(__dirname, "../supplements/remaster-orc-books");
const files_ = () => readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();

let base: GameModule;
let supplement: ModuleSupplement;
let merged: GameModule;
let loaded: LoadedModule;

beforeAll(async () => {
  base = await moduleFromPackSource(pf2eOrcSource);
  supplement = await supplementFromSource(pf2eOrcBooksSource);
  merged = applySupplements(base, [supplement]);
  loaded = loadModule(merged, { seeds: 10 });
}, 180_000);

const items = (listId: string): ReferenceItem[] => merged.referenceLists.find((l) => l.id === listId)?.items.filter((i) => i.id.startsWith(`${SUPPLEMENT}.`)) ?? [];
const item = (listId: string, name: string) => {
  const i = items(listId).find((x) => x.name === name);
  if (!i) throw new Error(`no ${name} in ${listId}`);
  return i;
};
const preset = (name: string) => {
  const p = supplement.presets!.find((x) => x.name === name);
  if (!p) throw new Error(`no preset ${name}`);
  return p;
};

describe("Remaster ORC books (built-in supplement)", () => {
  it("joins its parts, validates, fits the module and passes conformance merged into it", () => {
    expect(validateSupplement(supplement).issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(checkSupplementAgainst(supplement, base).filter((i) => i.severity === "error")).toEqual([]);
    expect(loaded.report.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(merged.manifest.supplements?.map((s) => s.id)).toEqual([SUPPLEMENT]);
    expect(supplement.manifest.extends).toEqual({ module: "pf2e-orc", version: "^0.1.0" });
  });

  it("matches the static manifest the app lists before loading it", () => {
    const m = supplement.manifest;
    expect(pf2eOrcBooksManifest).toMatchObject({ id: m.id, name: m.name, version: m.version, extends: m.extends, licenseNotice: m.licenseNotice, license: m.license, description: m.description });
    expect(pf2eOrcBooksManifest.counts).toEqual(supplementCounts(supplement));
    const bytes = files_().reduce((n, f) => n + Buffer.byteLength(readFileSync(join(DIR, f))), 0);
    expect(pf2eOrcBooksManifest.bytes).toBe(bytes);
    expect(Object.keys(pf2eOrcBooksSource.parts ?? {}).sort()).toEqual(files_().filter((f) => f !== "supplement.json"));
  });

  it("ships the ORC notice, the attribution lines of the books it uses and the trademark disclaimer; never says Pathfinder in its name", () => {
    const license = supplement.manifest.license!;
    expect(license).toMatchObject({ spdx: "LicenseRef-ORC", name: "ORC License", url: "https://paizo.com/orclicense" });
    expect(license.attribution).toContain(ORC_NOTICE);
    expect(license.attribution).toContain(TRADEMARK_NOTICE);
    const used = BOOKS.filter((b) => b.cite !== "Rage of Elements");
    for (const b of used) expect(license.attribution).toContain(b.attribution);
    // Rage of Elements is OGL in the source: nothing of it is used, and it is not credited.
    expect(license.attribution).not.toContain("Rage of Elements");
    expect(supplement.manifest.name).toBe("Remaster ORC books");
    expect(supplement.manifest.name).not.toMatch(/Pathfinder/);
    const notice = readFileSync(join(__dirname, "../supplements/NOTICE"), "utf8");
    expect(notice).toContain(ORC_NOTICE);
    for (const b of used) expect(notice).toContain(b.attribution);
    for (const b of used.filter((x) => x.todo)) expect(notice).toContain(`TODO(owner): ${b.cite}`);
    expect(notice).toContain("Apache License");
    expect(notice).toContain("Not affiliated with or endorsed by Paizo Inc. Pathfinder is a trademark of Paizo Inc.");
  });

  it("has the books' content: creatures and NPCs, hazards, classes, ancestries, feats, spells and items", () => {
    const creatures = supplement.presets!.filter((p) => p.entityType === "pf2e-orc.creature");
    expect(creatures).toHaveLength(820);
    expect(supplement.presets!.filter((p) => p.entityType === "pf2e-orc.hazard")).toHaveLength(27);
    expect(items("pf2e-orc.classes").map((i) => i.name)).toEqual(["Animist", "Commander", "Exemplar", "Guardian", "Gunslinger", "Inventor", "Magus", "Necromancer", "Psychic", "Runesmith", "Summoner", "Thaumaturge"]);
    expect(items("pf2e-orc.ancestries").map((i) => i.name)).toEqual(["Athamaru", "Automaton", "Awakened Animal", "Centaur", "Jotunborn", "Merfolk", "Minotaur", "Surki"]);
    expect(supplementCounts(supplement)).toEqual(pf2eOrcBooksManifest.counts);
    const newLists = (supplement.referenceLists ?? []).map((l) => l.id);
    expect(newLists).toContain(`${SUPPLEMENT}.feats.class-commander`);
    expect(newLists).toContain(`${SUPPLEMENT}.feats.mythic`);
    // core classes gain feats in the module's own lists
    expect(items("pf2e-orc.feats.class-fighter").length).toBeGreaterThan(0);
    const spells = merged.referenceLists.filter((l) => l.id.startsWith("pf2e-orc.spells.")).reduce((n, l) => n + l.items.filter((i) => i.id.startsWith(`${SUPPLEMENT}.`)).length, 0);
    expect(spells).toBeGreaterThan(450);
    const equipment = merged.referenceLists.filter((l) => l.id.startsWith("pf2e-orc.equipment.")).reduce((n, l) => n + l.items.filter((i) => i.id.startsWith(`${SUPPLEMENT}.`)).length, 0);
    expect(equipment).toBeGreaterThan(2000);
    // every added item carries the supplement's name as its source
    expect(items("pf2e-orc.ancestries").every((i) => i.source === "Remaster ORC books")).toBe(true);
  });

  it("keeps only the allow-listed ORC books: every entry cites one of them", () => {
    const allowed = new Set(BOOKS.map((b) => b.cite));
    const cites: string[] = [];
    const walk = (v: unknown, key = ""): void => {
      if (key === "cite" && typeof v === "string") cites.push(v);
      else if (Array.isArray(v)) v.forEach((x) => walk(x));
      else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) if (k !== "manifest") walk(x, k);
    };
    walk(supplement);
    expect(cites.length).toBeGreaterThan(5000);
    for (const c of cites) {
      const books = c.split(" — ")[0]!.split(", ");
      for (const b of books) expect(allowed.has(b), c).toBe(true);
    }
    // nothing from the excluded books and series
    const text = JSON.stringify(supplement);
    for (const t of ["Lost Omens", "Player's Guide", "Beginner Box", "Adventure Path", "Pathfinder Society", "Rage of Elements —"]) expect(text, t).not.toContain(t);
    const notes = readFileSync(join(__dirname, "../scripts/generated/supplement-notes.txt"), "utf8");
    expect(notes).toMatch(/Rage of Elements: nothing kept \(the source marks every entry of it OGL/);
    expect(notes).toMatch(/Guns & Gears \(Remastered\): \d+ actions/);
  });

  it("keeps every file small, and free of images, Foundry markup and Reserved Material (its books' own citations aside)", () => {
    expect(RESERVED.length).toBeGreaterThan(400);
    expect(files_().length).toBeLessThanOrEqual(64);
    for (const f of files_()) {
      const raw = readFileSync(join(DIR, f), "utf8");
      expect(Buffer.byteLength(raw), f).toBeLessThan(2 * 1024 * 1024);
      expect(Buffer.byteLength(JSON.stringify(JSON.parse(raw))), `${f} (minified)`).toBeLessThan(500_000);
      expect(raw, f).not.toMatch(/"img":|\.webp|\.svg"|systems\/pf2e|@UUID|@Check|@Damage|@Template|@Localize|\[\[\/|<\/?(p|strong|span)\b|&nbsp;/);
      const text = scannableText(JSON.parse(raw));
      expect(text.match(anyReservedPattern("g")) ?? [], `${f} contains Reserved Material`).toEqual([]);
    }
    // the citations are the only place a book's title appears, and they say nothing else reserved
    expect(scannableText({ cite: "Howl of the Wild — Ancestries: Centaur" })).toBe('{"cite":"Ancestries: Centaur"}');
    expect(scannableText({ cite: "Howl of the Wild — Ancestries: Golarion" }).match(anyReservedPattern("g"))).toEqual(["Golarion"]);
    expect(scannableText({ summary: "See Howl of the Wild." }).match(anyReservedPattern("g"))).toEqual(["Howl of the Wild"]);
    // named setting creatures and artifacts are gone
    const names = new Set([...supplement.presets!.map((p) => p.name), ...Object.values(supplement.referenceItems ?? {}).flat().map((i) => i.name)]);
    for (const n of ["Hound of Tindalos", "Priest of Sarenrae", "Aldori Dueling Sword", "Agyra", "Verex-That-Was"]) expect(names.has(n), n).toBe(false);
  });

  it("spot-checks values against the source", () => {
    const adlet = preset("Adlet");
    expect(adlet.cite).toBe("Monster Core 2 — Creatures: Adlet");
    expect(adlet.fields).toMatchObject({ level: 10, ac: 29, hp: { max: 180, current: 180 } });
    expect(adlet.tags![0]).toBe("monster core 2");
    expect(item("pf2e-orc.ancestries", "Centaur")).toMatchObject({ hp: 8, size: "Large", speed: "30 feet", cite: "Howl of the Wild — Ancestries: Centaur" });
    expect(item("pf2e-orc.ancestries", "Minotaur")).toMatchObject({ hp: 10, size: "Large", speed: "25 feet" });
    const breath = merged.referenceLists.flatMap((l) => l.items).find((i) => i.name === "Gorgon's Breath" && i.id.startsWith(`${SUPPLEMENT}.`))!;
    expect(breath).toMatchObject({ level: 13, price: "475 gp", cite: "Treasure Vault (Remastered) — Equipment: Gorgon's Breath" });
    const eye = merged.referenceLists.flatMap((l) => l.items).find((i) => i.name === "Gossip's Eye" && i.id.startsWith(`${SUPPLEMENT}.`))!;
    expect(eye).toMatchObject({ level: 8, price: "30 gp" });
    // the same name in two books keeps both stat blocks apart
    const scouts = supplement.presets!.filter((p) => p.name === "Tripkee Scout");
    expect(scouts.map((p) => [p.id, p.cite, p.fields.ac])).toEqual([
      [`${SUPPLEMENT}.preset.npc-core.tripkee-scout`, "NPC Core — Creatures: Tripkee Scout", 17],
      [`${SUPPLEMENT}.preset.tripkee-scout`, "Monster Core 2 — Creatures: Tripkee Scout", 16],
    ]);
  });

  it("gives a character with one of its ancestries and classes the right Hit Points", () => {
    const pc = merged.entityTypes.find((t) => t.id === "pf2e-orc.character")!;
    const attributes = { strength: 0, dexterity: 0, constitution: 2, intelligence: 0, wisdom: 0, charisma: 0 };
    const hp = (ancestry: string, cls: string) => computeFields(pc, { level: 3, ancestry, class: cls, attributes, hp: { current: 1, temp: 0 } }).hpMax;
    // Minotaur 10 + (Guardian 12 + Con 2) × 3
    expect(hp(`${SUPPLEMENT}.minotaur`, `${SUPPLEMENT}.guardian`)).toBe(52);
    expect(hp("human", "fighter")).toBe(8 + (10 + 2) * 3);
  });

  it("merges deterministically", () => {
    expect(JSON.stringify(applySupplements(base, [supplement]))).toBe(JSON.stringify(merged));
    expect(checkDeterminism(merged, { seeds: 3 })).toEqual([]);
  });

  const source = process.env.PF2E_SOURCE ?? "/home/user/pf2e-src/pf2e";
  it.skipIf(!existsSync(join(source, "packs", "pf2e")))(
    "rebuilds byte for byte from the source (needs the foundryvtt/pf2e checkout; PF2E_SOURCE)",
    async () => {
      const { buildSupplementFiles } = await import("../scripts/build-supplement.ts");
      const { files } = buildSupplementFiles(source);
      const pkg = join(__dirname, "..");
      expect(Object.keys(files).filter((f) => f.startsWith("supplements/")).sort()).toEqual(files_().map((f) => `supplements/remaster-orc-books/${f}`));
      for (const [name, text] of Object.entries(files)) expect(text === readFileSync(join(pkg, name), "utf8"), `${name} differs from the committed file`).toBe(true);
    },
    300_000,
  );
});
