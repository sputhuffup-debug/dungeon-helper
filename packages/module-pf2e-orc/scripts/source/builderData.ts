/**
 * Data for the character builder, read from the source's structured fields
 * (never from Foundry code: rules are read as data, nothing is run): what a
 * heritage, background, class or class feature trains, grants, lets the
 * player choose or changes; the proficiency increases class features give by
 * level; and the prerequisites of feats in a shape the builder's rules can
 * check. Everything here ends up as an item's `builder` key (see
 * docs/modules/character-builder.md).
 *
 * Where the source only has rules text, two narrow readings are made and
 * kept honest by tests: a class feature's proficiency increase sentence
 * ("Your proficiency rank for Reflex saves increases to master."), per class
 * section, and a feat's prerequisite lines ("expert in Athletics",
 * "Strength +2", a feat's name). Anything else is left to the GM.
 */
import { ATTRIBUTES, SKILLS } from "../ids.ts";
import { findReserved } from "./reserved.ts";
import { arr, num, obj, str, strs, type Raw } from "./read.ts";

/** A proficiency rank written to a sheet path: "skills.athletics", "saves.reflex", "defenses.light", "attacks.martial", "classDcRank", "spellcasting.rank". */
export interface RankUp {
  path: string;
  rank: number;
}

/** A skill or save to pick (ids of the module's skills or saves list), raised to `rank`. */
export interface RankChoice {
  list: "skills" | "saves";
  from: string[];
  rank: number;
  feats?: Record<string, string>;
}

/** Paths ("skills.arcana") as a rank choice, when they are all skills or all saves. */
function rankChoice(paths: string[], rank: number, feats: Record<string, string> = {}): RankChoice | undefined {
  const lists = new Set(paths.map((p) => p.split(".")[0]));
  if (lists.size !== 1 || !paths.length) return undefined;
  const list = [...lists][0] as "skills" | "saves";
  const ids = paths.map((p) => p.split(".")[1]!);
  const byId = Object.fromEntries(Object.entries(feats).map(([p, f]) => [p.split(".")[1]!, f]));
  return { list, from: ids, rank, ...(Object.keys(byId).length ? { feats: byId } : {}) };
}

/** What a heritage, background, ancestry or class feature does, from its rules. */
export interface RuleData {
  /** Skill (and save) ranks it gives outright. */
  ranks?: RankUp[];
  /** Pick one of these skills (or saves: `list`), at this rank; `feats` maps a pick to a feat it brings. */
  rankChoices?: RankChoice[];
  /** Pick any skill, trained. */
  anySkill?: number;
  senses?: string[];
  /** Feats it grants, by name. */
  feats?: string[];
  /** Actions, features and spells it grants, by name. */
  grants?: string[];
  size?: string;
  speed?: number;
  languages?: string[];
  /** Extra languages to pick. */
  languageCount?: number;
  /** Traits it adds, and ancestries it counts as (for ancestry feats). */
  traits?: string[];
  /** Ancestry Hit Points it sets instead of the ancestry's. */
  ancestryHp?: number;
  /** A feat to pick: its level and traits (all of them), and category. */
  featChoices?: Array<{ level: number; traits: string[]; category?: string }>;
  /** Pick `count` features (or actions) tagged one of `tags`. */
  selections?: Array<{ tags: string[]; count: number; actions?: boolean }>;
  /** Extra Hit Points per level (Toughness). */
  hpPerLevel?: number;
  /** Lore skills it trains ("Warfare Lore"). */
  lore?: string[];
  /** Class features (by name) it stands in for at their own levels: a doctrine's or research field's own features. */
  replaces?: string[];
  /** Choices it makes the source cannot express as data (left to do by hand). */
  more?: number;
}

const SKILL_IDS = new Set(SKILLS.map((s) => s.id));
const SAVE_IDS = new Set(["fortitude", "reflex", "will"]);
const ATTR_BY_SHORT = new Map<string, string>(ATTRIBUTES.map((a) => [a.short, a.id]));

/** A Foundry skill or save slug as a sheet path ("" when the sheet has no such field, e.g. a Lore). */
export function statPath(slug: string): string {
  if (SKILL_IDS.has(slug)) return `skills.${slug}`;
  if (SAVE_IDS.has(slug) || slug === "perception") return `saves.${slug}`;
  return "";
}

/** The name in a compendium uuid: "Compendium.pf2e.feats-srd.Item.Animal Companion" → { pack, name }. */
function uuidName(uuid: string): { pack: string; name: string } | undefined {
  const m = /^Compendium\.pf2e\.([\w-]+)\.Item\.(.+)$/.exec(uuid);
  if (!m || m[2]!.includes("{")) return undefined;
  return { pack: m[1]!, name: m[2]! };
}

/** A predicate the builder can ignore: none, or only "not taken through another feat" kinds of exceptions. */
function plainPredicate(p: unknown): boolean {
  const list = arr(p);
  return list.every((x) => {
    const o = obj(x);
    if (typeof x === "string") return /^class:[\w-]+$/.test(x);
    if ("not" in o) return typeof o.not === "string" && /^(feat|feature|parent:granter):/.test(o.not);
    if ("or" in o) return arr(o.or).some((y) => typeof y === "string" && /^class:[\w-]+$/.test(y));
    return false;
  });
}

const SENSE: Record<string, string> = {
  darkvision: "darkvision",
  "low-light-vision": "low-light vision",
  "greater-darkvision": "greater darkvision",
  scent: "scent",
  tremorsense: "tremorsense",
  echolocation: "echolocation",
};
const SIZE: Record<string, string> = {
  tiny: "Tiny",
  sm: "Small",
  small: "Small",
  med: "Medium",
  medium: "Medium",
  lg: "Large",
  large: "Large",
  huge: "Huge",
  grg: "Gargantuan",
};

/** A choice set's tag filter: "item:tag:x" terms, alone or in an `or`, and the traits that only restate the kind. */
function tagFilter(filter: unknown[]): string[] | undefined {
  const tags: string[] = [];
  for (const t of filter) {
    if (typeof t === "string") {
      const m = /^item:tag:([\w-]+)$/.exec(t);
      if (m) tags.push(m[1]!);
      else if (!/^item:(trait:tactic|type:feature)$/.test(t)) return undefined;
    } else {
      const o = obj(t);
      if (!("or" in o)) return undefined;
      const inner = arr(o.or).map((x) => (typeof x === "string" ? /^item:tag:([\w-]+)$/.exec(x)?.[1] : undefined));
      // a cause's sanctification filter: keep the cause tag, ignore the holy/unholy split
      if (inner.every((x) => x)) tags.push(...(inner as string[]));
      else if (!arr(o.or).every((x) => typeof x === "object")) return undefined;
    }
  }
  return tags.length ? tags : undefined;
}

/** A choice set's feat filter: level, traits and category, or undefined when it says more than that. */
function featFilter(filter: unknown[]): { level: number; traits: string[]; category?: string } | undefined {
  let level = 0;
  const traits: string[] = [];
  let category: string | undefined;
  for (const t of filter) {
    if (typeof t === "string") {
      let m = /^item:level:(\d+)$/.exec(t);
      if (m) {
        level = Number(m[1]);
        continue;
      }
      m = /^item:trait:([\w-]+)$/.exec(t);
      if (m) {
        traits.push(m[1]!);
        continue;
      }
      // "a feat of your own class" (Natural Ambition): the class's own feat list
      if (t === "item:trait:{actor|system.details.class.trait}") {
        category = "class";
        traits.push("class");
        continue;
      }
      m = /^item:category:(\w+)$/.exec(t);
      if (m) {
        category = m[1]!;
        continue;
      }
      if (t === "item:type:feat") continue;
      return undefined;
    }
    const o = obj(t);
    const lte = arr(o.lte);
    if (lte[0] === "item:level" && typeof lte[1] === "number") {
      level = lte[1];
      continue;
    }
    // "not this one feat", "or a dragon instinct": exceptions the builder leaves to the GM
    if ("not" in o || "nor" in o || "or" in o) continue;
    return undefined;
  }
  return level > 0 && traits.length ? { level, traits, ...(category ? { category } : {}) } : undefined;
}

/**
 * What a list of Foundry rule elements does, as builder data. Rules are read
 * as data (their keys and literal values); anything conditional or computed
 * is counted in `more` for the GM.
 */
export function ruleData(rules: unknown, name: string): RuleData {
  const out: RuleData = {};
  const list = arr(rules).map(obj);
  const push = <K extends keyof RuleData>(k: K, v: NonNullable<RuleData[K]> extends Array<infer T> ? T : never) => {
    const cur = (out[k] as unknown[] | undefined) ?? [];
    if (!cur.some((x) => JSON.stringify(x) === JSON.stringify(v))) cur.push(v);
    (out as Record<string, unknown>)[k] = cur;
  };
  // flags a choice set fills, and the rule that reads it
  const flagUses = new Map<string, Raw>();
  for (const r of list) {
    if (str(r.key) !== "ActiveEffectLike" && str(r.key) !== "GrantItem") continue;
    const text = `${str(r.path)} ${str(r.uuid)} ${JSON.stringify(r.preselectChoices ?? "")}`;
    for (const m of text.matchAll(/rulesSelections\.([\w]+)/g)) if (!flagUses.has(m[1]!)) flagUses.set(m[1]!, r);
  }
  const handledFlags = new Set<string>();
  for (const r of list) {
    const key = str(r.key);
    const pred = r.predicate;
    if (key === "ActiveEffectLike") {
      const path = str(r.path);
      const mode = str(r.mode);
      const m = /^system\.(skills|saves|perception)\.?([\w-]*)\.rank$/.exec(path);
      if (m && mode === "upgrade" && typeof r.value === "number" && plainPredicate(pred)) {
        const p = m[1] === "perception" ? "saves.perception" : statPath(m[2]!);
        if (p) push("ranks", { path: p, rank: r.value });
        continue;
      }
      // { firstDoctrine: "Compendium...First Doctrine (Warpriest)", ... }: the option's own features
      const v = obj(r.value);
      if (mode === "override" && /^flags\.system\.[\w]+$/.test(path) && Object.keys(v).length && Object.values(v).every((x) => typeof x === "string" && uuidName(x))) {
        for (const x of Object.values(v)) push("replaces", uuidName(x as string)!.name);
        continue;
      }
      // a Lore skill: { attribute, label, rank } under system.skills.<x>-lore
      const lore = /^system\.skills\.([a-z-]+-lore)$/.exec(path);
      if (lore && mode === "override" && Object.keys(v).length) {
        const loreName = lore[1]!.replace(/(^|-)([a-z])/g, (_, a: string, b: string) => (a ? " " : "") + b.toUpperCase());
        if (!findReserved(loreName)) push("lore", loreName);
        continue;
      }
      if (path === "system.attributes.ancestryhp" && mode === "override" && typeof r.value === "number") {
        out.ancestryHp = r.value;
        continue;
      }
      if (path === "system.build.languages.granted" && mode === "add") {
        const slug = str(obj(r.value).slug);
        const lang = slug ? slug.replace(/(^|-)([a-z])/g, (_, a: string, b: string) => (a ? " " : "") + b.toUpperCase()) : "";
        if (lang && !findReserved(lang)) push("languages", lang);
        continue;
      }
      if (path === "system.build.languages.max" && mode === "add") {
        out.languageCount = (out.languageCount ?? 0) + (Number(r.value) || 0);
        continue;
      }
      if (path === "system.details.ancestry.countsAs" && mode === "add" && typeof r.value === "string") {
        push("traits", r.value);
        continue;
      }
      continue;
    }
    // Toughness: Hit Points equal to your level
    if (key === "FlatModifier" && str(r.selector) === "hp" && r.value === "@actor.level" && arr(pred).length === 0) {
      out.hpPerLevel = (out.hpPerLevel ?? 0) + 1;
      continue;
    }
    if (key === "Sense" && arr(pred).length === 0) {
      const sense = SENSE[str(r.selector)];
      if (sense) push("senses", `${str(r.acuity) === "imprecise" && sense === "scent" ? "imprecise " : ""}${sense}${num(r.range) ? ` ${num(r.range)} feet` : ""}`);
      continue;
    }
    if (key === "ActorTraits" && arr(pred).length === 0) {
      for (const t of strs(r.add)) push("traits", t);
      continue;
    }
    if (key === "CreatureSize" && typeof r.value === "string" && SIZE[r.value]) {
      out.size = SIZE[r.value];
      continue;
    }
    if (key === "BaseSpeed" && str(r.selector) === "land" && typeof r.value === "number" && arr(pred).length === 0) {
      out.speed = r.value;
      continue;
    }
    if (key === "GrantItem" && plainPredicate(pred)) {
      const u = uuidName(str(r.uuid));
      if (!u || findReserved(u.name)) continue;
      if (u.pack === "feats-srd") push("feats", u.name);
      else push("grants", u.name);
      continue;
    }
    if (key === "ChoiceSet") {
      const flag = str(r.flag);
      const choices = r.choices;
      // a skill (or save) to pick, read by a rank rule
      const use = flag ? flagUses.get(flag) : undefined;
      if (Array.isArray(choices) && use) {
        const usePath = str(use.path);
        const options = choices.map(obj).map((c) => c.value);
        const pm = /^system\.(skills|saves)\.\{item\|flags\.system\.rulesSelections\.[\w]+(\.skill)?\}\.rank$/.exec(usePath);
        const rank = rankValue(use.value);
        if (pm && str(use.key) === "ActiveEffectLike") {
          const from: string[] = [];
          const feats: Record<string, string> = {};
          let ok = true;
          for (const o of options) {
            const slug = typeof o === "string" ? o : str(obj(o).slug);
            const p = statPath(slug);
            if (!p) ok = false;
            else from.push(p);
            const feat = typeof o === "object" ? uuidName(str(obj(o).feat)) : undefined;
            if (feat && !findReserved(feat.name)) feats[p] = feat.name;
          }
          const rc = ok ? rankChoice(from, rank, feats) : undefined;
          if (rc) {
            push("rankChoices", rc);
            handledFlags.add(flag);
            continue;
          }
        }
        // "system.skills.arcana.rank" (or a save's, or Perception's) values, read by `{item|flags...}` as the whole path
        if (/^\{item\|flags\.system\.rulesSelections\.[\w]+\}$/.test(usePath) && options.every((o) => typeof o === "string" && /^system\.((skills|saves)\.[\w-]+|perception)\.rank$/.test(o))) {
          const from = options.map((o) => (String(o) === "system.perception.rank" ? "saves.perception" : statPath(String(o).split(".")[2]!))).filter(Boolean);
          const rc = from.length === options.length ? rankChoice(from, rank) : undefined;
          if (rc) {
            push("rankChoices", rc);
            handledFlags.add(flag);
            continue;
          }
        }
      }
      if (obj(choices).config === "skills" && use && str(use.key) === "ActiveEffectLike") {
        out.anySkill = (out.anySkill ?? 0) + 1;
        handledFlags.add(flag);
        continue;
      }
      const c = obj(choices);
      const filter = arr(c.filter);
      if (filter.length) {
        const tags = tagFilter(filter);
        const itemType = str(c.itemType);
        if (tags && (itemType === "" || itemType === "feat" || itemType === "action")) {
          const sel = out.selections?.find((s) => JSON.stringify(s.tags) === JSON.stringify(tags));
          if (sel) sel.count++;
          else
            push("selections", {
              tags,
              count: 1,
              ...(itemType === "action" ? { actions: true } : {}),
            });
          continue;
        }
        const feat = itemType === "feat" ? featFilter(filter) : undefined;
        if (feat && (!use || str(use.key) === "GrantItem")) {
          push("featChoices", feat);
          continue;
        }
      }
      // deities and pantheons are setting material: always by hand, never suggested
      out.more = (out.more ?? 0) + 1;
    }
  }
  void name;
  return out;
}

/** A rank a rule sets: a number, or the low end of "ternary(gte(@actor.level,17),3,2)" (the later step up is the GM's). */
function rankValue(v: unknown): number {
  if (typeof v === "number") return v;
  const m = /^ternary\(gte\(@actor\.level,\s*\d+\),\s*(\d),\s*(\d)\)$/.exec(str(v));
  return m ? Number(m[2]) : 1;
}

/** Drop empty keys, so items without builder data carry none. */
export function compactData<T extends object>(d: T): T | undefined {
  const entries = Object.entries(d).filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0) && !(v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0));
  return entries.length ? (Object.fromEntries(entries) as T) : undefined;
}

// ---------------------------------------------------------------------------
// Proficiency increases of class features (their rules text, per class)
// ---------------------------------------------------------------------------

const RANK_WORD: Record<string, number> = {
  trained: 1,
  expert: 2,
  master: 3,
  legendary: 4,
};

/** The section of a class feature's text that applies to a class: "**Champion, Commander** ..." sections, or all of it. */
export function classSection(md: string, className: string): string | undefined {
  const paras = md.split(/\n\n+/);
  const header = /^\*\*([^*]+)\*\*\s*/;
  if (!paras.some((p) => header.test(p.trim()))) return md;
  let current: string[] | undefined;
  const mine: string[] = [];
  const shared: string[] = [];
  for (const p of paras) {
    const m = header.exec(p.trim());
    if (m) {
      current = m[1]!.split(/,\s*|\s+and\s+/).map((s) => s.trim().toLowerCase());
      if (current.includes(className.toLowerCase())) mine.push(p.trim().slice(m[0].length));
      continue;
    }
    if (current === undefined) shared.push(p);
    else if (current.includes(className.toLowerCase())) mine.push(p);
  }
  if (!mine.length) return shared.length ? shared.join("\n\n") : undefined;
  return mine.join("\n\n");
}

function targetPaths(phrase: string): string[] | undefined {
  const t = phrase
    .toLowerCase()
    .replace(/^your\s+/, "")
    .replace(/^all\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (/^(fortitude|reflex|will)( saves?| saving throws?)?$/.test(t)) return [`saves.${t.split(" ")[0]}`];
  if (t === "perception") return ["saves.perception"];
  if (t === "unarmored defense") return ["defenses.unarmored"];
  if (/^(light|medium|heavy)( armor)?$/.test(t)) return [`defenses.${t.split(" ")[0]}`];
  if (/^(simple|martial|advanced)( weapons)?$/.test(t)) return [`attacks.${t.split(" ")[0]}`];
  if (/^unarmed attacks?$/.test(t)) return ["attacks.unarmed"];
  if (/^spell (attack modifiers?|attack rolls?|attacks|dcs?)$/.test(t)) return ["spellcasting.rank"];
  if (/^([\w-]+ )?(class )?dc$/.test(t)) return ["classDcRank"];
  return undefined;
}

/**
 * The proficiency increases a class feature's text gives a class:
 * "Your proficiency ranks for light, medium, and heavy armor, as well as for
 * unarmored defense, increase to expert." Sentences that start with "If"
 * (a condition the builder cannot know) and increases limited to a weapon
 * group are left out.
 */
export function proficiencyIncreases(md: string, className: string): RankUp[] {
  const text = classSection(md, className);
  if (!text) return [];
  const out: RankUp[] = [];
  const sentences = text.replace(/\n+/g, " ").split(/(?<=\.)\s+/);
  // "Your proficiency ranks for X increase to master", "You gain expert proficiency with X", "you have expert proficiency in X", "You're trained in X"
  const patterns: Array<{ re: RegExp; target: number; rank: number }> = [
    { re: /proficiency ranks? (?:for|in) (.+?),? increases? to (expert|master|legendary)\b/gi, target: 1, rank: 2 },
    { re: /\b(?:gain|have) (expert|master|legendary) proficiency (?:with|in) (.+?)(?=[.;]|, and you\b|$)/gi, target: 2, rank: 1 },
    { re: /\bYou're (trained) in (.+?)(?=[.;]|, and you\b|$)/gi, target: 2, rank: 1 },
  ];
  for (const s of sentences) {
    if (/^\s*(If|At \d+\w* level)\b/.test(s)) continue;
    for (const pat of patterns) {
      for (const m of s.matchAll(pat.re)) {
        const rank = RANK_WORD[m[pat.rank]!.toLowerCase()]!;
        const body = m[pat.target]!.replace(/\bas well as (?:for |in )?/gi, ", ").replace(/\bthe\s+/gi, "").replace(/\s+statistics?\b/gi, "");
        const parts = body
          .split(/,\s*(?:and\s+|or\s+)?|\s+and\s+/)
          .map((x) => x.trim())
          .filter(Boolean);
        // "simple and martial weapons", "light, medium, and heavy armor": a bare word takes the noun of the next part
        const nouns = parts.map((p) => (/weapons?$/.test(p) ? "weapons" : /armor$/.test(p) ? "armor" : ""));
        const paths: string[] = [];
        let ok = true;
        parts.forEach((p, i) => {
          let phrase = p;
          if (/^(simple|martial|advanced|light|medium|heavy)$/i.test(p)) phrase = `${p} ${nouns.slice(i + 1).find(Boolean) ?? ""}`;
          // "spell attack modifier and spell DC" both mean the one spellcasting rank
          const got = targetPaths(phrase);
          if (got) paths.push(...got);
          else if (!/alchemical bombs?|innovation|bombs?|firearms?|crossbows?|deity's favored weapon|favored weapon/i.test(phrase)) ok = false;
        });
        if (!ok) continue;
        for (const path of new Set(paths)) if (!out.some((x) => x.path === path && x.rank >= rank)) out.push({ path, rank });
      }
    }
  }
  return out;
}

/**
 * Shared class features the source keeps only under another book's licence
 * (so not in the module): their names say what they raise. "Perception
 * Expertise" makes Perception expert; "Will Mastery" makes Will master.
 */
export function namedIncrease(name: string): RankUp | undefined {
  const m = /^(Fortitude|Reflex|Will|Perception) (Expertise|Mastery|Legend)$/.exec(name);
  if (!m) return undefined;
  return { path: `saves.${m[1]!.toLowerCase()}`, rank: { Expertise: 2, Mastery: 3, Legend: 4 }[m[2] as "Expertise" | "Mastery" | "Legend"] };
}

// ---------------------------------------------------------------------------
// Feat prerequisites
// ---------------------------------------------------------------------------

export interface PrereqData {
  /** Each needs one of `any` (sheet paths) at `rank` or better. */
  ranks?: Array<{ any: string[]; rank: number }>;
  /** Feats it needs, by name. */
  feats?: string[];
  /** Attribute modifiers it needs. */
  attributes?: Record<string, number>;
  /** Something the builder cannot check: the GM confirms. */
  confirm?: boolean;
}

const SKILL_BY_NAME = new Map<string, string>([
  ...SKILLS.map((s) => [s.name.toLowerCase(), `skills.${s.id}`] as const),
  ["perception", "saves.perception"],
  ["fortitude saves", "saves.fortitude"],
  ["fortitude", "saves.fortitude"],
  ["reflex saves", "saves.reflex"],
  ["reflex", "saves.reflex"],
  ["will saves", "saves.will"],
  ["will", "saves.will"],
]);
const ATTR_BY_NAME = new Map<string, string>(ATTRIBUTES.flatMap((a) => [[a.name.toLowerCase(), a.id] as const, [a.abbr.toLowerCase(), a.id] as const]));

/**
 * A feat's prerequisite lines (the source's `system.prerequisites.value`) as
 * checks: a rank in a skill, Perception or a save ("expert in Athletics",
 * "trained in Arcana or Nature"), an attribute modifier ("Strength +2"), or
 * another feat by name (one of `featNames`). Anything else asks the GM.
 */
export function prereqData(lines: string[], featNames: ReadonlySet<string>): PrereqData | undefined {
  const out: PrereqData = {};
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const r = /^(trained|expert|master|legendary)(?: in)? (.+)$/i.exec(line);
    if (r) {
      const rank = RANK_WORD[r[1]!.toLowerCase()]!;
      const body = r[2]!.replace(/^either /i, "");
      const or = / or /i.test(body);
      const and = / and /i.test(body);
      const names = body.split(/,\s*(?:or\s+|and\s+)?|\s+or\s+|\s+and\s+/i).map((x) => x.trim().toLowerCase());
      const paths = names.map((n) => SKILL_BY_NAME.get(n));
      if ((or && and) || paths.some((p) => !p)) {
        out.confirm = true;
        continue;
      }
      if (or) (out.ranks ??= []).push({ any: paths as string[], rank });
      else for (const p of paths as string[]) (out.ranks ??= []).push({ any: [p], rank });
      continue;
    }
    const a = /^([A-Za-z]+) \+(\d)$/.exec(line);
    if (a && ATTR_BY_NAME.has(a[1]!.toLowerCase())) {
      (out.attributes ??= {})[ATTR_BY_NAME.get(a[1]!.toLowerCase())!] = Number(a[2]);
      continue;
    }
    if (featNames.has(line)) {
      (out.feats ??= []).push(line);
      continue;
    }
    out.confirm = true;
  }
  // the builder checks two of each; more asks the GM
  if ((out.ranks?.length ?? 0) > 2 || (out.feats?.length ?? 0) > 2 || out.ranks?.some((x) => x.any.length > 4)) out.confirm = true;
  if (out.ranks && out.ranks.length > 2) out.ranks = out.ranks.slice(0, 2);
  if (out.feats && out.feats.length > 2) out.feats = out.feats.slice(0, 2);
  return compactData(out);
}

/**
 * A prerequisite in the flat shape the builder's rules read without loops:
 * `r0`/`n0` and `r1`/`n1` (one of the paths at the rank), `f0` and `f1`
 * (feats by name), `a` (attribute modifiers), `confirm` (the GM checks the rest).
 */
export function flatReq(p: PrereqData | undefined): Record<string, unknown> | undefined {
  if (!p) return undefined;
  const out: Record<string, unknown> = {};
  p.ranks?.forEach((r, i) => {
    out[`r${i}`] = r.any;
    out[`n${i}`] = r.rank;
  });
  p.feats?.forEach((f, i) => (out[`f${i}`] = f));
  if (p.attributes) out.a = p.attributes;
  if (p.confirm) out.confirm = true;
  return Object.keys(out).length ? out : undefined;
}

/** Ancestry boosts as the builder reads them: fixed attributes and the number of free boosts; flaws. */
export function boostData(boosts: unknown, flaws: unknown): { fixed: string[]; free: number; flaws: string[] } {
  const fixed: string[] = [];
  let free = 0;
  for (const b of Object.values(obj(boosts))) {
    const v = strs(obj(b).value);
    if (v.length === 0) continue;
    if (v.length >= 6) free++;
    else if (v.length === 1) fixed.push(ATTR_BY_SHORT.get(v[0]!) ?? v[0]!);
    else free++; // "one of these two": the builder treats it as free within the list (backgrounds handle theirs apart)
  }
  const f = Object.values(obj(flaws))
    .flatMap((b) => strs(obj(b).value))
    .map((x) => ATTR_BY_SHORT.get(x) ?? x);
  return { fixed, free, flaws: f };
}

/** Background boosts: the two attributes of its first boost and the free one. */
export function backgroundBoosts(boosts: unknown): {
  choose: string[];
  free: number;
} {
  const choose: string[] = [];
  let free = 0;
  for (const b of Object.values(obj(boosts))) {
    const v = strs(obj(b).value);
    if (v.length === 0) continue;
    if (v.length >= 6) free++;
    else choose.push(...v.map((x) => ATTR_BY_SHORT.get(x) ?? x));
  }
  return { choose, free };
}

export { ATTR_BY_SHORT };
