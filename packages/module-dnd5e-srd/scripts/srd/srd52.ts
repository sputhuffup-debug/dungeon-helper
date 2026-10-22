/**
 * SRD 5.2 character options (5e-bits/5e-database, src/2024/en): the four
 * backgrounds, the nine species with their lineages, ancestries and legacies
 * and their traits, the twelve subclasses with their features, and the feats.
 * They are added to the SRD 5.1 reference lists (races, subraces, racial
 * traits, backgrounds, subclasses, class features, feats), each item marked
 * `edition: "2024"`, `source: "SRD 5.2"` and cited by SRD 5.2 section, so the
 * app badges them and the PC sheet's suggestions tell the editions apart.
 *
 * Where a 2024 species, lineage, background or subclass has the name of an
 * SRD 5.1 item in the same list (Elf, Acolyte, Champion...), it is named
 * "<name> (2024)": the sheet stores the name a player picks, so the name must
 * say which one it is (and the subrace and subclass suggestions follow it).
 * Traits, features and feats keep the SRD's names; their badge and their
 * species or subclass column tell them apart.
 *
 * The source is read as data only, like the 5.1 files (see read.ts).
 */
import type { ReferenceItem, ReferenceList } from "@campaign-forge/module-sdk";
import { abilityByShort, ABILITIES, cite, cite52, EDITION_2024, LIST, SOURCE_52 } from "../ids.ts";
import { num, obj, objs, refIndex, refName, str, index, type Raw } from "./read.ts";

export interface Srd52Source {
  backgrounds: Raw[];
  species: Raw[];
  subspecies: Raw[];
  traits: Raw[];
  subclasses: Raw[];
  features: Raw[];
  feats: Raw[];
}

const abilityName = (short: string) => ABILITIES.find((a) => a.id === abilityByShort(short))!.name;
/** A 2024 item's id: the source index with "-2024", so it never meets the SRD 5.1 item of the same index. */
const id52 = (v: unknown) => `${index(v)}-2024`;
const mark = { edition: EDITION_2024, source: SOURCE_52 } as const;

/**
 * The 2024 source writes text with single line breaks between paragraphs,
 * indented continuation lines, and tables as "a | b" or "a / b" rows. As
 * Markdown: paragraphs apart, list items together, tables as pipe tables.
 */
export function text52(v: unknown): string {
  const raw = str(v)
    .split("\n")
    .map((l) => l.trim());
  // A table header run together with its title ("Draconic Spells Sorcerer Level | Spells") and
  // two rows run together ("5 | Fear, Fly 7 | Arcane Eye, Charm Monster") are split apart.
  const lines: string[] = [];
  for (const l of raw) {
    // a sentence broken over two lines ("... as the" / "measure of ...") is one line
    const prev = lines[lines.length - 1];
    if (prev && /[a-z,]$/.test(prev) && /^[a-z]/.test(l)) {
      lines[lines.length - 1] = `${prev} ${l}`;
      continue;
    }
    const head = /^(.*\S) (\w+ Level) \| (.+)$/.exec(l);
    if (head && !/^\d/.test(l)) lines.push(head[1]!, `${head[2]} | ${head[3]}`);
    else if (/^\d+ \| /.test(l)) lines.push(...l.split(/ (?=\d+ \| )/));
    else lines.push(l);
  }
  const sep = (l: string) => (l.includes(" | ") ? " | " : l.includes(" / ") ? " / " : "");
  const cells = (l: string, s: string) => l.split(s).map((c) => c.trim());
  const blocks: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (!l) continue;
    // a table: a header and at least two rows, each with the same separator and number of cells
    const s = sep(l);
    if (s) {
      const n = cells(l, s).length;
      let j = i + 1;
      while (j < lines.length && sep(lines[j]!) === s && cells(lines[j]!, s).length === n) j++;
      if (j - i >= 3) {
        const row = (x: string) => `| ${cells(x, s).join(" | ")} |`;
        blocks.push([row(l), `| ${Array.from({ length: n }, () => "---").join(" | ")} |`, ...lines.slice(i + 1, j).map(row)].join("\n"));
        i = j - 1;
        continue;
      }
    }
    // a list: consecutive "- " lines stay together; a lone one among paragraphs is a paragraph
    if (/^[-•]\s/.test(l)) {
      let j = i;
      while (j < lines.length && /^[-•]\s/.test(lines[j]!)) j++;
      if (j - i > 1) {
        blocks.push(lines.slice(i, j).map((x) => `- ${x.replace(/^[-•]\s+/, "")}`).join("\n"));
        i = j - 1;
        continue;
      }
      blocks.push(l.replace(/^[-•]\s+/, ""));
      continue;
    }
    blocks.push(l);
  }
  return blocks.join("\n\n");
}

/** Source corrections, each one listed in the conversion notes. */
function correct(where: string, textIn: string, notes: string[]): string {
  let out = textIn;
  const fixes: Array<[RegExp, string, string]> = [[/\bShielf of Faith\b/g, "Shield of Faith", 'spelling "Shielf of Faith" corrected to "Shield of Faith"']];
  for (const [re, to, note] of fixes) {
    if (re.test(out)) {
      out = out.replace(re, to);
      notes.push(`SRD 5.2 ${where}: ${note}`);
    }
  }
  return out;
}

/** "<name> (2024)" where an SRD 5.1 item in the same list has the name. */
function namer(list: ReferenceList | undefined): (name: string) => string {
  const taken = new Set((list?.items ?? []).map((i) => i.name.toLowerCase()));
  return (name) => (taken.has(name.toLowerCase()) ? `${name} (2024)` : name);
}

const FEAT_SECTION: Record<string, string> = { origin: "Origin Feats", general: "General Feats", "fighting-style": "Fighting Style Feats", "epic-boon": "Epic Boon Feats" };
const FEAT_CATEGORY: Record<string, string> = { origin: "Origin", general: "General", "fighting-style": "Fighting Style", "epic-boon": "Epic Boon" };

export interface Srd52Conversion {
  /** list id -> the 2024 items to add to it */
  items: Record<string, ReferenceItem[]>;
  notes: string[];
}

/** The SRD 5.2 items for each list. `lists51` are the SRD 5.1 lists (for names already taken). */
export function convertSrd52(src: Srd52Source, lists51: ReferenceList[]): Srd52Conversion {
  const notes: string[] = [];
  const list51 = (id: string) => lists51.find((l) => l.id === id);

  // --- species, lineages and traits (Character Origins) ---------------------------------
  const speciesName = namer(list51(LIST.races));
  const lineageName = namer(list51(LIST.subraces));
  const speciesDisplay = new Map(src.species.map((s) => [index(s.index), speciesName(str(s.name))]));
  const speciesCite = (speciesIndex: string) => cite52("Character Origins", `Species (${str(src.species.find((s) => index(s.index) === speciesIndex)?.name)})`);
  const traitByIndex = new Map(src.traits.map((t) => [index(t.index), t]));
  const lineageOrder = src.subspecies.map((s) => index(s.index));
  // which lineages a trait belongs to: the trait's own list and each lineage's (the source fills in one or the other)
  const lineagesOfTrait = new Map<string, string[]>();
  for (const sub of src.subspecies) {
    const lineageIdx = index(sub.index);
    for (const t of objs(sub.traits)) {
      const ti = refIndex(t);
      if (!traitByIndex.has(index(ti))) throw new Error(`SRD 5.2 subspecies ${lineageIdx}: unknown trait ${ti}`);
      lineagesOfTrait.set(index(ti), [...(lineagesOfTrait.get(index(ti)) ?? []), lineageIdx]);
    }
  }
  for (const t of src.traits) {
    for (const s of objs(t.subspecies)) {
      const k = index(t.index);
      const have = lineagesOfTrait.get(k) ?? [];
      const li = index(refIndex(s));
      if (!lineageOrder.includes(li)) throw new Error(`SRD 5.2 trait ${k}: unknown subspecies ${li}`);
      if (!have.includes(li)) lineagesOfTrait.set(k, [...have, li]);
    }
  }
  const lineageDisplay = new Map(src.subspecies.map((s) => [index(s.index), lineageName(str(s.name))]));
  const traitText = (t: Raw) => correct(`trait ${str(t.name)}`, text52(t.description), notes);

  const species: ReferenceItem[] = src.species.map((s) => {
    const sid = index(s.index);
    // the species' own traits: those it lists, then any the trait list gives it outside a lineage
    const own = objs(s.traits).map((t) => index(refIndex(t)));
    for (const t of src.traits) {
      const ti = index(t.index);
      if (objs(t.species).some((x) => refIndex(x) === sid) && !(lineagesOfTrait.get(ti)?.length) && !own.includes(ti)) own.push(ti);
    }
    const traits = own.map((ti) => {
      const t = traitByIndex.get(ti);
      if (!t) throw new Error(`SRD 5.2 species ${sid}: unknown trait ${ti}`);
      return t;
    });
    const sizes = objs(obj(obj(s.size_options).from).options).map((o) => str(o.size));
    const size = sizes.length ? `${sizes.join(" or ")} (chosen when you select this species)` : str(s.size);
    const lineages = objs(s.subspecies).map((x) => lineageDisplay.get(index(refIndex(x))) ?? refName(x));
    return {
      id: id52(s.index),
      name: speciesDisplay.get(sid)!,
      summary: `${str(s.type)}; ${sizes.length ? sizes.join(" or ") : str(s.size)}; speed ${num(s.speed)} ft.`,
      ...mark,
      cite: speciesCite(sid),
      abilityBonuses: "From background",
      creatureType: str(s.type),
      size,
      speed: `${num(s.speed)} ft.`,
      traits: traits.map((t) => str(t.name)).join(", ") || "—",
      subraces: lineages.join(", ") || "—",
      description: traits.map((t) => `**${str(t.name)}.** ${traitText(t)}`).join("\n\n"),
    };
  });

  const subraces: ReferenceItem[] = src.subspecies.map((sub) => {
    const sid = index(refIndex(sub.species));
    if (!speciesDisplay.has(sid)) throw new Error(`SRD 5.2 subspecies ${str(sub.index)}: unknown species ${sid}`);
    const traits = objs(sub.traits).map((t) => ({ trait: traitByIndex.get(index(refIndex(t)))!, level: num(t.level, 1) }));
    const byLevel = new Map<number, string[]>();
    for (const { trait, level } of traits) byLevel.set(level, [...(byLevel.get(level) ?? []), str(trait.name)]);
    const damage = refName(sub.damage_type);
    return {
      id: id52(sub.index),
      name: lineageDisplay.get(index(sub.index))!,
      summary: [...byLevel].map(([lvl, names]) => `Level ${lvl}: ${names.join(", ")}`).join("; "),
      ...mark,
      cite: speciesCite(sid),
      race: speciesDisplay.get(sid)!,
      ...(damage ? { damageType: damage } : {}),
      traits: traits.map(({ trait }) => str(trait.name)).join(", ") || "—",
      description: traits.map(({ trait, level }) => `**${str(trait.name)}** (level ${level}). ${traitText(trait)}`).join("\n\n"),
    };
  });

  const racialTraits: ReferenceItem[] = src.traits.map((t) => {
    const ti = index(t.index);
    const sp = objs(t.species).map((x) => index(refIndex(x)));
    if (!sp.length) throw new Error(`SRD 5.2 trait ${ti} belongs to no species`);
    const lineages = (lineagesOfTrait.get(ti) ?? []).slice().sort((a, b) => lineageOrder.indexOf(a) - lineageOrder.indexOf(b));
    return {
      id: id52(t.index),
      name: str(t.name),
      ...mark,
      cite: speciesCite(sp[0]!),
      races: [...sp.map((x) => speciesDisplay.get(x) ?? x), ...lineages.map((l) => lineageDisplay.get(l) ?? l)].join(", "),
      description: traitText(t),
    };
  });

  // --- backgrounds (Character Origins) --------------------------------------------------
  const backgroundName = namer(list51(LIST.backgrounds));
  const featNames = new Map(src.feats.map((f) => [index(f.index), str(f.name)]));
  const backgrounds: ReferenceItem[] = src.backgrounds.map((b) => {
    const bid = index(b.index);
    const abilities = objs(b.ability_scores).map((a) => abilityName(refIndex(a)));
    if (abilities.length !== 3) throw new Error(`SRD 5.2 background ${bid}: expected three ability scores`);
    const featRef = obj(b.feat);
    const featIdx = index(featRef.index);
    if (!featNames.has(featIdx)) throw new Error(`SRD 5.2 background ${bid}: unknown feat ${featIdx}`);
    let featNote = str(featRef.note);
    // The SRD 5.2 Sage takes Magic Initiate from the Wizard list; the source leaves the list out.
    if (bid === "sage" && featIdx === "magic-initiate" && !featNote) {
      featNote = "Wizard";
      notes.push("SRD 5.2 background Sage: origin feat Magic Initiate given its spell list (Wizard), missing in the source");
    }
    const feat = `${featNames.get(featIdx)}${featNote ? ` (${featNote})` : ""}`;
    const profs = objs(b.proficiencies).map((p) => refName(p));
    const skills = profs.filter((p) => p.startsWith("Skill: ")).map((p) => p.slice(7));
    const tools = profs.filter((p) => p.startsWith("Tool: ")).map((p) => p.slice(6));
    for (const c of objs(b.proficiency_choices)) {
      const kind = /kind of ([A-Z][\w' -]*?)(?:\s*\(|$)/.exec(str(c.desc))?.[1];
      const options = objs(obj(c.from).options).map((o) => refName(o.item).replace(/^Tool: /, ""));
      tools.push(`${kind ? `${kind}: ` : ""}choose ${num(c.choose, 1)} of ${options.join(", ")}`);
    }
    const others = profs.filter((p) => !p.startsWith("Skill: ") && !p.startsWith("Tool: "));
    if (others.length) throw new Error(`SRD 5.2 background ${bid}: unexpected proficiencies ${others.join(", ")}`);
    const short = abilities.map((a) => a.slice(0, 3)).join(", ");
    return {
      id: id52(b.index),
      name: backgroundName(str(b.name)),
      summary: `Ability scores ${short}; feat ${feat}; skills ${skills.join(", ")}`,
      ...mark,
      cite: cite52("Character Origins", `Backgrounds (${str(b.name)})`),
      abilityScores: abilities.join(", "),
      abilityScoreIncrease: "Increase one of these scores by 2 and a different one by 1, or all three by 1 (none above 20)",
      feat,
      skills: skills.join(", "),
      tools: tools.join(", ") || "—",
      equipment: objs(b.equipment_options)
        .map((e) => str(e.desc))
        .join("; "),
    };
  });

  // --- feats ----------------------------------------------------------------------------
  const feats: ReferenceItem[] = src.feats.map((f) => {
    const type = str(f.type);
    if (!FEAT_SECTION[type]) throw new Error(`SRD 5.2 feat ${str(f.index)}: unknown type ${type}`);
    const pre = obj(f.prerequisites);
    const prereq = [
      ...(num(pre.minimum_level, 0) > 0 ? [`Level ${num(pre.minimum_level)}+`] : []),
      ...(str(pre.feature_named) ? [`${str(pre.feature_named)} feature`] : []),
      ...(str(obj(f.prerequisite_options).desc) ? [str(obj(f.prerequisite_options).desc)] : []),
    ];
    const repeatable = str(f.repeatable);
    return {
      id: id52(f.index),
      name: str(f.name),
      ...mark,
      cite: cite52("Feats", `${FEAT_SECTION[type]} (${str(f.name)})`),
      category: FEAT_CATEGORY[type]!,
      prerequisite: prereq.join("; ") || "—",
      ...(repeatable ? { repeatable } : {}),
      description: text52(f.description),
    };
  });

  // --- subclasses and their features (Classes) -------------------------------------------
  const subclassName = namer(list51(LIST.subclasses));
  const subclassFeatures = src.features.filter((f) => Object.keys(obj(f.subclass)).length > 0);
  const subclasses: ReferenceItem[] = [];
  const classFeatures: ReferenceItem[] = [];
  for (const s of src.subclasses) {
    const sid = index(s.index);
    const className = refName(s.class);
    const name = subclassName(str(s.name));
    const subCite = cite52("Classes", `${className} (${str(s.name)})`);
    const own = subclassFeatures
      .filter((f) => refIndex(f.subclass) === sid)
      .map((f) => {
        const m = /(\d+)$/.exec(refIndex(f.level) || str(obj(f.level).name));
        const level = typeof f.level === "number" ? f.level : m ? Number(m[1]) : NaN;
        if (!Number.isInteger(level)) throw new Error(`SRD 5.2 feature ${str(f.index)}: no level`);
        if (refName(f.class) !== className) throw new Error(`SRD 5.2 feature ${str(f.index)}: class ${refName(f.class)}, subclass of ${className}`);
        return { f, level };
      });
    // cross-check: the subclass lists the same feature levels as the feature list
    const listed = objs(s.features).map((f) => num(f.level)).sort((a, b) => a - b);
    const found = own.map((x) => x.level).sort((a, b) => a - b);
    if (listed.join() !== found.join()) throw new Error(`SRD 5.2 subclass ${sid}: feature levels ${found.join()} do not match the subclass's ${listed.join()}`);
    own.sort((a, b) => a.level - b.level);
    subclasses.push({
      id: id52(s.index),
      name,
      summary: str(s.summary),
      ...mark,
      cite: subCite,
      class: className,
      description: text52(s.description),
      features: own.map(({ f, level }) => `${level}: ${str(f.name)}`).join("; "),
    });
    for (const { f, level } of own) {
      classFeatures.push({
        id: id52(f.index),
        name: str(f.name),
        ...mark,
        cite: subCite,
        class: className,
        subclass: name,
        level,
        description: correct(`feature ${str(f.name)}`, text52(f.description), notes),
      });
    }
  }
  if (classFeatures.length !== subclassFeatures.length) throw new Error(`SRD 5.2: ${subclassFeatures.length - classFeatures.length} subclass features belong to no subclass`);

  return {
    items: {
      [LIST.races]: species,
      [LIST.subraces]: subraces,
      [LIST.racialTraits]: racialTraits,
      [LIST.backgrounds]: backgrounds,
      [LIST.feats]: feats,
      [LIST.subclasses]: subclasses,
      [LIST.classFeatures]: classFeatures,
    },
    notes,
  };
}

/** What each list is called, and cited as, once it holds both editions; its SRD 5.1 items get their own cite. */
const MIXED: Record<string, { name: string; cite: string; section51: string; columns?: string[] }> = {
  [LIST.races]: { name: "Races and species", cite: `${cite("Races")}; ${cite52("Character Origins")}`, section51: "Races" },
  [LIST.subraces]: { name: "Subraces and lineages", cite: `${cite("Races")}; ${cite52("Character Origins")}`, section51: "Races" },
  [LIST.racialTraits]: { name: "Racial and species traits", cite: `${cite("Races")}; ${cite52("Character Origins")}`, section51: "Races" },
  [LIST.backgrounds]: { name: "Backgrounds", cite: `${cite("Backgrounds")}; ${cite52("Character Origins")}`, section51: "Backgrounds", columns: ["abilityScores", "feat", "skills", "feature"] },
  [LIST.feats]: { name: "Feats", cite: `${cite("Feats")}; ${cite52("Feats")}`, section51: "Feats", columns: ["category", "prerequisite"] },
  [LIST.subclasses]: { name: "Subclasses", cite: `${cite("Classes")}; ${cite52("Classes")}`, section51: "Classes" },
  [LIST.classFeatures]: { name: "Class features", cite: `${cite("Classes")}; ${cite52("Classes")}`, section51: "Classes" },
};

/** The SRD 5.1 character lists with the SRD 5.2 items added (5.1 items first, in their order). */
export function mergeSrd52(lists: ReferenceList[], conv: Srd52Conversion): ReferenceList[] {
  for (const id of Object.keys(conv.items)) if (!lists.some((l) => l.id === id)) throw new Error(`SRD 5.2 items for a list the pack does not have: ${id}`);
  return lists.map((l) => {
    const add = conv.items[l.id];
    const mixed = MIXED[l.id];
    if (!add || !mixed) return l;
    const items = [...l.items.map((i) => ({ ...i, cite: i.cite ?? cite(mixed.section51) })), ...add];
    const ids = new Set<string>();
    for (const i of items) {
      if (ids.has(i.id)) throw new Error(`${l.id}: duplicate item ${i.id}`);
      ids.add(i.id);
    }
    return { ...l, name: mixed.name, cite: mixed.cite, ...(mixed.columns ? { columns: mixed.columns } : {}), items };
  });
}

/** The 2024 source files the converter reads (all under src/2024/en). */
export const SRD52_FILES = ["Backgrounds", "Species", "Subspecies", "Traits", "Subclasses", "Features", "Feats"] as const;
