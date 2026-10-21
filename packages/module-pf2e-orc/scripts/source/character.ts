/**
 * Character options: ancestries, heritages, backgrounds, classes with their
 * proficiencies and feature levels, class features and ancestry features.
 */
import type { ReferenceList } from "@campaign-forge/module-sdk";
import { ATTRIBUTES, cite, LIST, RANKS } from "../ids.ts";
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

export function convertCharacterOptions(src: { ancestries: Entry[]; heritages: Entry[]; backgrounds: Entry[]; classes: Entry[]; classFeatures: Entry[]; ancestryFeatures: Entry[] }, ctx: Ctx): CharacterConversion {
  const ancestryHp: Record<string, number> = {};
  const classHp: Record<string, number> = {};
  const desc = (e: Entry) => withoutJournalLinks(md(ctx, obj(e.system.description).value));

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
      };
    });

  const hIds = uniqueIds();
  const heritages = src.heritages
    .filter((e) => usable(ctx, e))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => {
      const description = desc(e);
      const ancestry = str(obj(e.system.ancestry).name) || "Versatile heritage";
      return { id: hIds(e.name), name: e.name, ancestry, traits: traitsLine(e.system), summary: firstSentence(description), description, cite: cite(e.book, "Heritages", e.name) };
    });

  const bIds = uniqueIds();
  const backgrounds = src.backgrounds
    .filter((e) => usable(ctx, e))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => {
      const s = e.system;
      const trained = obj(s.trainedSkills);
      const skills = [...strs(trained.value).map(titleCase), ...strs(trained.lore).map((l) => line(ctx, l)).filter(Boolean)];
      const feat = Object.values(obj(s.items))
        .map((i) => str(obj(i).name))
        .filter((n) => n && !findReserved(n));
      const description = desc(e);
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
      };
    });

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
      };
    });

  const featureItems = (entries: Entry[], section: string) => {
    const ids = uniqueIds();
    return entries
      .filter((e) => usable(ctx, e))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((e) => {
        const description = md(ctx, obj(e.system.description).value);
        return {
          id: ids(e.name),
          name: e.name,
          level: num(obj(e.system.level).value, 1),
          actions: actionCost(e.system),
          traits: traitsLine(e.system),
          summary: firstSentence(description),
          description,
          cite: cite(e.book, section, e.name),
        };
      });
  };

  const lists: ReferenceList[] = [
    { id: LIST.ancestries, name: "Ancestries", cite: cite("Player Core", "Ancestries"), columns: ["hp", "size", "speed", "boosts", "flaws"], items: ancestries },
    { id: LIST.heritages, name: "Heritages", cite: cite("Player Core", "Heritages"), columns: ["ancestry", "summary"], items: heritages },
    { id: LIST.backgrounds, name: "Backgrounds", cite: cite("Player Core", "Backgrounds"), columns: ["boosts", "skills", "feat"], items: backgrounds },
    { id: LIST.classes, name: "Classes", cite: cite("Player Core", "Classes"), columns: ["hp", "keyAttribute", "perception", "saves", "spellcasting"], items: classes },
    { id: LIST.classFeatures, name: "Class features", cite: cite("Player Core", "Class Features"), columns: ["level", "traits", "summary"], items: featureItems(src.classFeatures, "Class Features") },
    { id: LIST.ancestryFeatures, name: "Ancestry features", cite: cite("Player Core", "Ancestry Features"), columns: ["level", "traits", "summary"], items: featureItems(src.ancestryFeatures, "Ancestry Features") },
  ];
  return { lists, ancestryHp, classHp };
}
