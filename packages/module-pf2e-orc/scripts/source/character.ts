/**
 * Character options: ancestries, heritages, backgrounds, classes with their
 * proficiencies and feature levels, class features and ancestry features.
 */
import type { ReferenceList } from "@campaign-forge/module-sdk";
import { ATTRIBUTES, cite, id, LIST, RANKS, slug } from "../ids.ts";
import { ATTR_BY_SHORT, backgroundBoosts, boostData, compactData, namedIncrease, proficiencyIncreases, ruleData, statPath, type RankUp, type RuleData } from "./builderData.ts";
import { actionCost, firstSentence, line, md, traitsLine, uniqueIds, usable, type Ctx } from "./common.ts";
import { findReserved } from "./reserved.ts";
import { arr, num, obj, str, strs, type Entry } from "./read.ts";

const ATTR = new Map<string, string>(ATTRIBUTES.map((a) => [a.short, a.name]));
const rankName = (n: number) => RANKS.find((r) => r.value === n)?.label ?? "Untrained";
const SIZE: Record<string, string> = { tiny: "Tiny", sm: "Small", med: "Medium", lg: "Large", huge: "Huge", grg: "Gargantuan" };
const titleCase = (s: string) => s.replace(/(^|[\s-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());

/** Ancestry / background boosts: `{ "0": { value: ["con"] }, "2": { value: [all six] } }` → "Constitution, Wisdom, free". */
function boosts(v: unknown): string {
  return Object.values(obj(v))
    .map((b) => strs(obj(b).value))
    .filter((l) => l.length > 0)
    .map((l) => (l.length >= 6 ? "free" : l.map((a) => ATTR.get(a) ?? a).join(" or ")))
    .join(", ");
}

/** Description paragraphs that only link to a journal page (dropped). */
function withoutJournalLinks(markdown: string): string {
  return markdown
    .split("\n\n")
    .filter((p) => !/^\*?[A-Z][\w ’'-]*\*?$/.test(p.trim()) || p.length > 40)
    .join("\n\n");
}

export interface ClassInfo {
  id: string;
  hp: number;
}

export interface CharacterConversion {
  lists: ReferenceList[];
  ancestryHp: Record<string, number>;
  classHp: Record<string, number>;
}

/** How the builder data names items and lists of other conversions (the supplement's items get its id as a prefix). */
export interface CharacterOptions {
  /** The id a class feature of this conversion will have in the module (default: as converted). */
  localId?: (itemId: string) => string;
  /** A class feature of the module the classes of this conversion name but it does not have (the supplement's classes share the core books' features). */
  externalFeature?: (name: string) => ExternalFeature | undefined;
  /** The list of class feats of a class (default: the module's list for it). */
  featList?: (classSlug: string) => string;
}

/** A class feature as the class builder data reads it: its id in the module, its text and its own builder data. */
export interface ExternalFeature {
  id: string;
  description: string;
  builder?: RuleData & { tags?: string[] };
}

const ATTR_IDS = ATTRIBUTES.map((a) => a.id);
/**
 * Key attributes the source leaves empty because a class choice sets them:
 * the psychic's subconscious mind makes it Intelligence or Charisma (Dark
 * Archive, Psychic: Key Attribute).
 */
const KEY_FALLBACK: Record<string, string[]> = { psychic: ["intelligence", "charisma"] };
const RANK_KEYS = { saves: ["fortitude", "reflex", "will"], attacks: ["simple", "martial", "advanced", "unarmed"], defenses: ["unarmored", "light", "medium", "heavy"] } as const;
const levels20 = <T>(f: (level: number) => T): T[] => Array.from({ length: 20 }, (_, i) => f(i + 1));

/** Builder data shared by heritages, backgrounds and class features: what their rules train, grant and ask. */
function rulesBuilder(e: Entry): RuleData {
  return ruleData(e.system.rules, e.name);
}

export function convertCharacterOptions(src: { ancestries: Entry[]; heritages: Entry[]; backgrounds: Entry[]; classes: Entry[]; classFeatures: Entry[]; ancestryFeatures: Entry[] }, ctx: Ctx, opts: CharacterOptions = {}): CharacterConversion {
  const ancestryHp: Record<string, number> = {};
  const classHp: Record<string, number> = {};
  const desc = (e: Entry) => withoutJournalLinks(md(ctx, obj(e.system.description).value));
  const localId = opts.localId ?? ((x: string) => x);

  const aIds = uniqueIds();
  const ancestries = src.ancestries
    .filter((e) => usable(ctx, e))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => {
      const s = e.system;
      const itemId = aIds(e.name);
      ancestryHp[itemId] = num(s.hp, 8);
      const languages = strs(obj(s.languages).value).map(titleCase);
      const extra = strs(obj(s.additionalLanguages).value).map(titleCase).filter((l) => !findReserved(l));
      const features = Object.values(obj(s.items))
        .map((i) => str(obj(i).name))
        .filter((n) => n && !findReserved(n));
      const description = desc(e);
      const b = boostData(s.boosts, s.flaws);
      const extraCount = num(obj(s.additionalLanguages).count, 0);
      const rules = ruleData(s.rules, e.name);
      const builder = compactData({
        trait: slug(e.name),
        hp: num(s.hp, 8),
        size: SIZE[str(s.size)] ?? str(s.size),
        speed: num(s.speed, 25),
        vision: str(s.vision) === "normal" || !str(s.vision) ? undefined : str(s.vision).replace(/-vision$/, " vision"),
        boosts: b.fixed,
        freeBoosts: b.free,
        flaws: b.flaws,
        languages: languages.filter((l) => !findReserved(l)),
        additionalLanguages: extra,
        languageCount: extraCount || undefined,
        traits: strs(obj(s.traits).value),
        features: features,
        ...rules,
      });
      return {
        id: itemId,
        name: e.name,
        hp: num(s.hp, 8),
        size: SIZE[str(s.size)] ?? str(s.size),
        speed: `${num(s.speed, 25)} feet`,
        boosts: boosts(s.boosts),
        flaws: boosts(s.flaws) || "none",
        languages: languages.join(", "),
        additionalLanguages: extra.join(", "),
        vision: titleCase(str(s.vision).replace(/-/g, " ")) || "Normal",
        traits: traitsLine(s),
        ...(features.length ? { features: features.join(", ") } : {}),
        summary: firstSentence(description),
        description,
        cite: cite(e.book, "Ancestries", e.name),
        ...(builder ? { builder } : {}),
      };
    });

  const hIds = uniqueIds();
  const heritages = src.heritages
    .filter((e) => usable(ctx, e))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => {
      const description = desc(e);
      const ancestry = str(obj(e.system.ancestry).name) || "Versatile heritage";
      const rules = rulesBuilder(e);
      const own = strs(obj(e.system.traits).value);
      const builder = compactData({
        ancestry: str(obj(e.system.ancestry).slug) || undefined,
        versatile: obj(e.system.ancestry).name ? undefined : true,
        ...rules,
        traits: [...new Set([...own, ...(rules.traits ?? [])])],
      });
      return { id: hIds(e.name), name: e.name, ancestry, traits: traitsLine(e.system), summary: firstSentence(description), description, cite: cite(e.book, "Heritages", e.name), ...(builder ? { builder } : {}) };
    });

  const bIds = uniqueIds();
  const backgrounds = src.backgrounds
    .filter((e) => usable(ctx, e))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => {
      const s = e.system;
      const trained = obj(s.trainedSkills);
      const lores = strs(trained.lore)
        .map((l) => line(ctx, l))
        .filter(Boolean);
      const skills = [...strs(trained.value).map(titleCase), ...lores];
      const feat = Object.values(obj(s.items))
        .map((i) => str(obj(i).name))
        .filter((n) => n && !findReserved(n));
      const description = desc(e);
      const bb = backgroundBoosts(s.boosts);
      const rules = rulesBuilder(e);
      const builder = compactData({
        boosts: bb.choose,
        freeBoosts: bb.free,
        skills: strs(trained.value).map(statPath).filter(Boolean),
        lore: lores,
        ...rules,
        feats: [...new Set([...feat, ...(rules.feats ?? [])])],
      });
      return {
        id: bIds(e.name),
        name: e.name,
        boosts: boosts(s.boosts),
        skills: skills.join(", "),
        feat: feat.join(", "),
        traits: traitsLine(s),
        summary: firstSentence(description),
        description,
        cite: cite(e.book, "Backgrounds", e.name),
        ...(builder ? { builder } : {}),
      };
    });

  const featureItems = (entries: Entry[], section: string, withBuilder: boolean) => {
    const ids = uniqueIds();
    return entries
      .filter((e) => usable(ctx, e))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((e) => {
        const description = md(ctx, obj(e.system.description).value);
        const builder = withBuilder ? compactData({ tags: strs(obj(e.system.traits).otherTags), ...rulesBuilder(e) }) : undefined;
        return {
          id: ids(e.name),
          name: e.name,
          level: num(obj(e.system.level).value, 1),
          actions: actionCost(e.system),
          traits: traitsLine(e.system),
          summary: firstSentence(description),
          description,
          cite: cite(e.book, section, e.name),
          ...(builder ? { builder } : {}),
        };
      });
  };
  const classFeatures = featureItems(src.classFeatures, "Class Features", true);
  // an option's own features (a doctrine's "Third Doctrine (Warpriest)"): which option they belong to; the class lists them by level
  const ownFeatures = new Map<string, Array<{ option: string; id: string; level: number; ranks: RankUp[]; feats: string[] }>>();
  for (const f of classFeatures) {
    const names = (f.builder as RuleData | undefined)?.replaces ?? [];
    const of = src.classFeatures.find((e) => e.name === f.name);
    const className = titleCase(strs(obj(of?.system.traits).value)[0] ?? "");
    for (const n of names) {
      const r = classFeatures.find((x) => x.name === n);
      if (!r) continue;
      (r as { builder?: Record<string, unknown> }).builder = { ...(r.builder ?? {}), of: f.name };
      const list = ownFeatures.get(slug(className)) ?? [];
      list.push({ option: f.name, id: localId(r.id), level: r.level, ranks: proficiencyIncreases(r.description, className), feats: (r.builder as RuleData | undefined)?.feats ?? [] });
      ownFeatures.set(slug(className), list);
    }
  }
  // a class names its features; the first of a name is the one it means
  const featureByName = new Map<string, ExternalFeature>();
  for (const f of classFeatures) if (!featureByName.has(f.name)) featureByName.set(f.name, { id: localId(f.id), description: f.description, ...(f.builder ? { builder: f.builder } : {}) });

  const cIds = uniqueIds();
  const classes = src.classes
    .filter((e) => usable(ctx, e))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => {
      const s = e.system;
      const itemId = cIds(e.name);
      classHp[itemId] = num(s.hp, 8);
      const saves = obj(s.savingThrows);
      const attacks = obj(s.attacks);
      const defenses = obj(s.defenses);
      const trained = obj(s.trainedSkills);
      const byLevel = new Map<number, string[]>();
      for (const it of Object.values(obj(s.items))) {
        const f = obj(it);
        const name = str(f.name);
        if (!name || findReserved(name)) continue;
        const lvl = num(f.level, 1);
        byLevel.set(lvl, [...(byLevel.get(lvl) ?? []), name]);
      }
      const features = [...byLevel.entries()]
        .sort(([a], [b]) => a - b)
        .map(([lvl, names]) => `| ${lvl} | ${names.sort().join(", ")} |`);
      const featLevels = (k: string) => arr(obj(s[k]).value).map((n) => num(n)).join(", ");
      const description = desc(e);
      const skillList = strs(trained.value).map(titleCase);
      const table = ["| Level | Class features |", "| --- | --- |", ...features].join("\n");
      const builder = classBuilder(e, byLevel);
      return {
        id: itemId,
        name: e.name,
        hp: num(s.hp, 8),
        keyAttribute: strs(obj(s.keyAbility).value)
          .map((a) => ATTR.get(a) ?? a)
          .join(" or "),
        perception: rankName(num(s.perception)),
        saves: `Fortitude ${rankName(num(saves.fortitude))}, Reflex ${rankName(num(saves.reflex))}, Will ${rankName(num(saves.will))}`,
        skills: `trained in ${skillList.length ? `${skillList.join(", ")} and ` : ""}${num(trained.additional)} more skills of your choice, plus a number equal to your Intelligence modifier`,
        attacks: `simple ${rankName(num(attacks.simple))}, martial ${rankName(num(attacks.martial))}, advanced ${rankName(num(attacks.advanced))}, unarmed ${rankName(num(attacks.unarmed))}`,
        defenses: `unarmored ${rankName(num(defenses.unarmored))}, light ${rankName(num(defenses.light))}, medium ${rankName(num(defenses.medium))}, heavy ${rankName(num(defenses.heavy))}`,
        classDc: "Trained",
        spellcasting: num(s.spellcasting) > 0 ? rankName(num(s.spellcasting)) : "—",
        ancestryFeatLevels: featLevels("ancestryFeatLevels"),
        classFeatLevels: featLevels("classFeatLevels"),
        generalFeatLevels: featLevels("generalFeatLevels"),
        skillFeatLevels: featLevels("skillFeatLevels"),
        skillIncreaseLevels: featLevels("skillIncreaseLevels"),
        summary: firstSentence(description),
        description: [description, "### Class features by level", table].filter(Boolean).join("\n\n"),
        cite: cite(e.book, "Classes", e.name),
        builder,
      };
    });

  /**
   * A class's builder data: key attribute, initial proficiencies and trained
   * skills, feat and skill increase levels, its own feat list, spellcasting,
   * and per level the features it gains with the proficiency increases,
   * selections (instinct, doctrine...) and other choices they bring.
   */
  function classBuilder(e: Entry, byLevel: Map<number, string[]>): Record<string, unknown> {
    const s = e.system;
    const cls = slug(e.name);
    const ranks: RankUp[] = [{ path: "saves.perception", rank: num(s.perception) }];
    for (const k of RANK_KEYS.saves) ranks.push({ path: `saves.${k}`, rank: num(obj(s.savingThrows)[k]) });
    for (const k of RANK_KEYS.attacks) ranks.push({ path: `attacks.${k}`, rank: num(obj(s.attacks)[k]) });
    for (const k of RANK_KEYS.defenses) ranks.push({ path: `defenses.${k}`, rank: num(obj(s.defenses)[k]) });
    ranks.push({ path: "classDcRank", rank: 1 });
    if (num(s.spellcasting) > 0) ranks.push({ path: "spellcasting.rank", rank: num(s.spellcasting) });
    const trained = obj(s.trainedSkills);
    const other = obj(obj(s.attacks).other);
    const own = ruleData(s.rules, e.name);
    const featureOf = (name: string) => featureByName.get(name) ?? opts.externalFeature?.(name);
    let spell: { tradition?: string; kind?: string } | undefined;
    const lv = levels20((n) => {
      const out: Record<string, unknown> = {};
      const ids: string[] = [];
      const bare: string[] = [];
      const r: RankUp[] = [];
      const sel: Array<Record<string, unknown>> = [];
      const choices: Array<Record<string, unknown>> = [];
      const featChoices: Array<Record<string, unknown>> = [];
      const feats: string[] = [];
      const lore: string[] = [];
      const todo: string[] = [];
      for (const name of [...(byLevel.get(n) ?? [])].sort()) {
        const f = featureOf(name);
        if (!f) {
          bare.push(name);
          const named = namedIncrease(name);
          if (named && !r.some((y) => y.path === named.path && y.rank >= named.rank)) r.push(named);
          continue;
        }
        ids.push(f.id);
        for (const x of [...proficiencyIncreases(f.description, e.name), ...(f.builder?.ranks ?? [])]) if (!r.some((y) => y.path === x.path && y.rank >= x.rank)) r.push(x);
        for (const x of f.builder?.selections ?? []) sel.push({ name, ...x });
        for (const x of f.builder?.rankChoices ?? []) choices.push({ name, ...x });
        for (const x of f.builder?.featChoices ?? []) featChoices.push({ name, ...x });
        feats.push(...(f.builder?.feats ?? []));
        lore.push(...(f.builder?.lore ?? []));
        if (f.builder?.more) todo.push(name);
        if (n === 1 && /Spellcasting$/.test(name)) {
          const t = /spells of the (arcane|divine|occult|primal) tradition/i.exec(f.description)?.[1]?.toLowerCase();
          // prepared or spontaneous only when the text says one of them (an animist does both)
          const rep = /spell repertoire/i.test(f.description);
          const prep = /\bprepare\b/i.test(f.description);
          const kind = rep && !prep ? "spontaneous" : prep && !rep ? "prepared" : undefined;
          spell = compactData({ tradition: t, kind });
        }
      }
      if (ids.length) out.f = ids;
      if (bare.length) out.n = bare;
      if (r.length) out.r = r;
      if (sel.length) out.s = sel;
      if (choices.length) out.c = choices;
      if (featChoices.length) out.fc = featChoices;
      if (feats.length) out.ft = [...new Set(feats)];
      if (lore.length) out.lore = [...new Set(lore)];
      if (todo.length) out.todo = todo;
      // the features a doctrine or research field brings at this level, by the option's name
      const own: Record<string, { f: string[]; r?: RankUp[]; ft?: string[] }> = {};
      for (const x of ownFeatures.get(cls) ?? []) {
        if (x.level !== n) continue;
        const o = (own[x.option] ??= { f: [] });
        o.f.push(x.id);
        if (x.ranks.length) o.r = [...(o.r ?? []), ...x.ranks];
        if (x.feats.length) o.ft = [...(o.ft ?? []), ...x.feats];
      }
      if (Object.keys(own).length) out.o = own;
      return out;
    });
    const list = (k: string) => arr(obj(s[k]).value).map((x) => num(x));
    const listed = strs(obj(s.keyAbility).value).map((a) => ATTR_BY_SHORT.get(a) ?? a).filter((a) => ATTR_IDS.includes(a as (typeof ATTR_IDS)[number]));
    const key = listed.length ? listed : (KEY_FALLBACK[cls] ?? []);
    if (!listed.length) ctx.notes.push(`${e.name}: no key attribute in the source; the builder offers ${key.join(" or ") || "none"}`);
    const data = compactData({
      ...own,
      key,
      hp: num(s.hp, 8),
      ranks,
      skills: strs(trained.value).map(statPath).filter(Boolean),
      additionalSkills: num(trained.additional),
      lore: [...new Set([...(str(trained.custom) && !findReserved(str(trained.custom)) ? [str(trained.custom)] : []), ...(own.lore ?? [])])],
      otherAttacks: str(other.name) && num(other.rank) > 0 && !findReserved(str(other.name)) ? `${str(other.name)} (${rankName(num(other.rank)).toLowerCase()})` : undefined,
      featLevels: { ancestry: list("ancestryFeatLevels"), class: list("classFeatLevels"), general: list("generalFeatLevels"), skill: list("skillFeatLevels"), skillIncrease: list("skillIncreaseLevels") },
      featList: opts.featList ? opts.featList(cls) : id(`feats.class-${cls}`),
      spell: num(s.spellcasting) > 0 ? (spell ?? {}) : undefined,
      levels: lv,
    });
    return data ?? {};
  }

  const lists: ReferenceList[] = [
    { id: LIST.ancestries, name: "Ancestries", cite: cite("Player Core", "Ancestries"), columns: ["hp", "size", "speed", "boosts", "flaws"], items: ancestries },
    { id: LIST.heritages, name: "Heritages", cite: cite("Player Core", "Heritages"), columns: ["ancestry", "summary"], items: heritages },
    { id: LIST.backgrounds, name: "Backgrounds", cite: cite("Player Core", "Backgrounds"), columns: ["boosts", "skills", "feat"], items: backgrounds },
    { id: LIST.classes, name: "Classes", cite: cite("Player Core", "Classes"), columns: ["hp", "keyAttribute", "perception", "saves", "spellcasting"], items: classes },
    { id: LIST.classFeatures, name: "Class features", cite: cite("Player Core", "Class Features"), columns: ["level", "traits", "summary"], items: classFeatures },
    { id: LIST.ancestryFeatures, name: "Ancestry features", cite: cite("Player Core", "Ancestry Features"), columns: ["level", "traits", "summary"], items: featureItems(src.ancestryFeatures, "Ancestry Features", false) },
  ];
  return { lists, ancestryHp, classHp };
}
