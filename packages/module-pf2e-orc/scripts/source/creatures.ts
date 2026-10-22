/**
 * Monster Core creatures as presets of the creature entity type: a full stat
 * block (level, traits, Perception and senses, languages, skills, attribute
 * modifiers, items, AC, saves, HP, immunities, weaknesses, resistances,
 * speeds, Strikes with the multiple attack penalty, abilities with their
 * action cost, spellcasting) and the description. Universal monster
 * abilities point to the Monster abilities list instead of repeating it.
 */
import type { EntityPreset } from "@campaign-forge/module-sdk";
import { ATTRIBUTES, cite, CREATURE, preset, SKILLS, slug as toSlug } from "../ids.ts";
import { actionCost, frequencyText, line, md, ordinal, signed, traitText, traitsLine, usable, type Ctx } from "./common.ts";
import { findReserved } from "./reserved.ts";
import { num, obj, objs, str, strs, type Entry, type Raw } from "./read.ts";

export const SIZES: Record<string, string> = { tiny: "Tiny", sm: "Small", med: "Medium", lg: "Large", huge: "Huge", grg: "Gargantuan" };
const titleCase = (s: string) => s.replace(/(^|[\s-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());
const words = (s: string) => s.replace(/-/g, " ");

function sensesText(ctx: Ctx, perception: Raw): string {
  const senses = objs(perception.senses).map((x) => {
    const type = words(str(x.type));
    const acuity = str(x.acuity);
    const range = num(x.range, 0);
    return `${type}${acuity && acuity !== "precise" ? ` (${acuity})` : ""}${range ? ` ${range} feet` : ""}`;
  });
  const details = line(ctx, perception.details);
  return [...senses, ...(details ? [details] : [])].join(", ");
}

function speedText(ctx: Ctx, speed: Raw): string {
  const parts = [`${num(speed.value)} feet`, ...objs(speed.otherSpeeds).map((x) => `${words(str(x.type))} ${num(x.value)} feet`)];
  const details = line(ctx, speed.details);
  return [...parts, ...(details ? [details] : [])].join(", ");
}

/** Immunities, weaknesses and resistances: "cold iron 5", "physical 10 (except adamantine)". */
function iwr(list: unknown, withValue: boolean): string[] {
  return objs(list).map((x) => {
    const type = words(str(x.type));
    const value = withValue && x.value !== undefined ? ` ${num(x.value)}` : "";
    const exceptions = strs(x.exceptions).map(words);
    const doubleVs = strs(x.doubleVs).map(words);
    const extra = [exceptions.length ? `except ${exceptions.join(", ")}` : "", doubleVs.length ? `double resistance vs. ${doubleVs.join(", ")}` : ""].filter(Boolean).join("; ");
    return `${type}${value}${extra ? ` (${extra})` : ""}`;
  });
}

/** The damage types the combat panel knows (the source's own type ids). */
export const DAMAGE_TYPES = ["acid", "bludgeoning", "cold", "electricity", "fire", "force", "mental", "piercing", "poison", "slashing", "sonic", "spirit", "vitality", "void", "bleed", "precision"];

/** Condition ids a creature can be immune to (the rest of its immunities are effects and damage). */
const CONDITION_IDS = new Set(["blinded", "clumsy", "confused", "controlled", "dazzled", "deafened", "doomed", "drained", "enfeebled", "fascinated", "fatigued", "fleeing", "frightened", "grabbed", "immobilized", "off-guard", "paralyzed", "persistent-damage", "petrified", "prone", "restrained", "sickened", "slowed", "stunned", "stupefied", "unconscious", "wounded", "dying"]);

/**
 * Immunities, weaknesses and resistances as the combat panel applies them:
 * one entry each, `all-damage` as "all", exceptions kept (materials, traits
 * or damage types that get past). Immunities to effects (sleep, death
 * effects) stay in the text lists; immunities to conditions go to
 * `conditionImmunities`.
 */
export function damageModifiers(attrs: Raw): { modifiers: Array<Record<string, unknown>>; conditionImmunities: string[] } {
  const modifiers: Array<Record<string, unknown>> = [];
  const conditionImmunities: string[] = [];
  const kinds: Array<[string, string]> = [
    ["immunities", "immunity"],
    ["weaknesses", "weakness"],
    ["resistances", "resistance"],
  ];
  for (const [key, kind] of kinds) {
    for (const x of objs(attrs[key])) {
      const raw = str(x.type);
      const type = raw === "all-damage" ? "all" : raw;
      if (kind === "immunity") {
        if (CONDITION_IDS.has(type)) conditionImmunities.push(type);
        if (!DAMAGE_TYPES.includes(type)) continue;
      }
      const except = strs(x.exceptions);
      const doubleVs = strs(x.doubleVs).map(words);
      modifiers.push({
        kind,
        type,
        ...(kind !== "immunity" && x.value !== undefined ? { value: num(x.value) } : {}),
        ...(except.length ? { except } : {}),
        ...(doubleVs.length ? { note: `double resistance vs. ${doubleVs.join(", ")}` } : {}),
      });
    }
  }
  return { modifiers, conditionImmunities };
}

/** One Strike: "+7 [+3/−1]" with the multiple attack penalty (agile −4/−8, otherwise −5/−10), and the structured numbers the combat panel rolls. */
function strike(ctx: Ctx, it: Raw): Record<string, unknown> {
  const s = obj(it.system);
  const bonus = num(obj(s.bonus).value);
  const traits = strs(obj(s.traits).value);
  const agile = traits.includes("agile");
  const map = agile ? [4, 8] : [5, 10];
  const range = obj(s.range);
  const ranged = Object.keys(range).length > 0 && (num(range.increment, 0) > 0 || num(range.max, 0) > 0);
  const traitList = traits.map(traitText);
  if (ranged && num(range.increment, 0) > 0) traitList.push(`range increment ${num(range.increment)} feet`);
  else if (ranged && num(range.max, 0) > 0) traitList.push(`range ${num(range.max)} feet`);
  const damage = Object.values(obj(s.damageRolls))
    .map((d) => {
      const r = obj(d);
      return [str(r.damage), str(r.category) === "persistent" ? "persistent" : "", words(str(r.damageType))].filter(Boolean).join(" ");
    })
    .join(" plus ");
  const effects = [...strs(obj(s.attackEffects).value).map((x) => titleCase(words(x))), line(ctx, obj(s.attackEffects).custom)].filter(Boolean);
  const damageParts = Object.values(obj(s.damageRolls)).flatMap((d) => {
    const r = obj(d);
    const dice = str(r.damage).replace(/\s+/g, "");
    if (!dice) return [];
    const type = str(r.damageType);
    return [{ dice, ...(DAMAGE_TYPES.includes(type) ? { type } : {}), ...(str(r.category) === "persistent" ? { persistent: true } : {}) }];
  });
  return {
    name: str(it.name),
    type: ranged ? "ranged" : "melee",
    bonus: `${signed(bonus)} [${signed(bonus - map[0]!)}/${signed(bonus - map[1]!)}]`,
    traits: traitList.join(", "),
    damage: [damage, ...effects].filter(Boolean).join(" plus "),
    attack: bonus,
    damageParts,
  };
}

/** An ability as a stat block entry: name with its action cost, traits, frequency, then the text. */
function ability(ctx: Ctx, it: Raw): { name: string; desc: string } {
  const s = obj(it.system);
  const cost = actionCost(s);
  const traits = traitsLine(s);
  const text = md(ctx, obj(s.description).value);
  const frequency = /\*\*Frequency\*\*/.test(text) ? "" : frequencyText(s.frequency);
  return {
    name: `${str(it.name)}${cost ? ` ${cost}` : ""}`,
    desc: [traits ? `(${traits})` : "", frequency ? `**Frequency** ${frequency}` : "", text].filter(Boolean).join(" "),
  };
}

/** Spellcasting entries with their spells by rank, the way a stat block lists them. */
function spellcasting(ctx: Ctx, items: Raw[], level: number): Array<{ name: string; desc: string }> {
  const entries = items.filter((i) => i.type === "spellcastingEntry");
  const spells = items.filter((i) => i.type === "spell");
  const byId = new Map(spells.map((sp) => [str(sp._id), sp]));
  const cantripRank = Math.max(1, Math.ceil(level / 2));
  return entries.map((entry) => {
    const s = obj(entry.system);
    const kind = str(obj(s.prepared).value);
    const dc = obj(s.spelldc);
    const head = [num(dc.dc, 0) ? `DC ${num(dc.dc)}` : "", num(dc.value, 0) ? `attack ${signed(num(dc.value))}` : ""].filter(Boolean).join(", ");
    const own = spells.filter((sp) => str(obj(obj(sp.system).location).value) === str(entry._id));
    const ranks = new Map<number, string[]>();
    const cantrips: string[] = [];
    const nameOf = (sp: Raw) => {
      const n = str(sp.name);
      if (findReserved(n)) return "";
      const uses = obj(obj(obj(sp.system).location).uses);
      const max = num(uses.max, 0);
      return max > 1 ? `${n} (×${max})` : n;
    };
    const put = (rank: number, n: string) => n && ranks.set(rank, [...(ranks.get(rank) ?? []), n]);
    if (kind === "prepared") {
      for (const [slotKey, slot] of Object.entries(obj(s.slots))) {
        const rank = Number(slotKey.replace("slot", ""));
        for (const p of objs(obj(slot).prepared)) {
          const sp = byId.get(str(p.id));
          if (!sp) continue;
          if (rank === 0) cantrips.push(nameOf(sp));
          else put(rank, nameOf(sp));
        }
      }
    }
    for (const sp of own) {
      if (kind === "prepared" && [...ranks.values(), cantrips].some((l) => l.includes(nameOf(sp)))) continue;
      const ss = obj(sp.system);
      const isCantrip = strs(obj(ss.traits).value).includes("cantrip");
      const rank = num(obj(ss.location).heightenedLevel, 0) || num(obj(ss.level).value, 1);
      if (isCantrip) cantrips.push(nameOf(sp));
      else put(rank, nameOf(sp));
    }
    const slots = obj(s.slots);
    const parts = [...ranks.entries()]
      .sort(([a], [b]) => b - a)
      .map(([rank, names]) => {
        const max = num(obj(slots[`slot${rank}`]).max, 0);
        return `**${ordinal(rank)}**${kind === "spontaneous" && max ? ` (${max} slots)` : ""} ${names.filter(Boolean).sort().join(", ")}`;
      });
    const auto = num(obj(s.autoHeightenLevel).value, 0) || cantripRank;
    if (cantrips.filter(Boolean).length) parts.push(`**Cantrips (${ordinal(auto)})** ${cantrips.filter(Boolean).sort().join(", ")}`);
    const name = line(ctx, entry.name) || "Spells";
    return { name, desc: [head, ...parts].filter(Boolean).join("; ") };
  });
}

export interface CreatureConversion {
  presets: EntityPreset[];
}

export interface CreatureOptions {
  /** Tags after the book's name (e.g. an NPC's role), before the creature's traits. */
  extraTags?: (e: Entry) => string[];
}

export function convertCreatures(entries: Entry[], ctx: Ctx, opts: CreatureOptions = {}): CreatureConversion {
  const seen = new Set<string>();
  const presets: EntityPreset[] = [];
  for (const e of entries.filter((x) => usable(ctx, x)).sort((a, b) => a.name.localeCompare(b.name))) {
    const s = e.system;
    const attrs = obj(s.attributes);
    const details = obj(s.details);
    const level = num(obj(details.level).value, 0);
    const traits = obj(s.traits);
    const items = e.items;
    const slug = toSlug(e.file.split("/").pop()!.replace(/\.json$/, ""));
    if (seen.has(slug)) throw new Error(`duplicate creature ${slug}`);
    seen.add(slug);
    const skills: Record<string, number> = {};
    const known = new Set(SKILLS.map((x) => x.id));
    for (const [k, v] of Object.entries(obj(s.skills))) {
      if (known.has(k)) skills[k] = num(obj(v).base, num(obj(v).value));
      else ctx.notes.push(`${e.name}: skill "${k}" is not a core skill; left out`);
    }
    const lores = items.filter((i) => i.type === "lore").map((i) => `${line(ctx, i.name)} ${signed(num(obj(obj(i.system).mod).value))}`).filter((x) => !x.startsWith(" "));
    const gear = items
      .filter((i) => ["weapon", "armor", "shield", "equipment", "consumable", "treasure", "backpack", "ammo"].includes(str(i.type)))
      .map((i) => {
        const q = num(obj(i.system).quantity, 1);
        const n = line(ctx, i.name);
        return n && q > 1 ? `${n} (${q})` : n;
      })
      .filter(Boolean);
    const acts = items.filter((i) => i.type === "action");
    const byCategory = (cat: string) => acts.filter((i) => str(obj(i.system).category) === cat).map((i) => ability(ctx, i)).filter((a) => a.name && !findReserved(a.name));
    const languages = strs(obj(details.languages).value).map(titleCase).filter((l) => !findReserved(l));
    const langDetails = line(ctx, obj(details.languages).details);
    const saveVal = (k: string) => num(obj(obj(s.saves)[k]).value);
    const saveNotes = [line(ctx, obj(attrs.allSaves).value), ...["fortitude", "reflex", "will"].map((k) => line(ctx, obj(obj(s.saves)[k]).saveDetail)).filter(Boolean)].filter(Boolean);
    const hp = obj(attrs.hp);
    const dm = damageModifiers(attrs);
    const description = [md(ctx, details.blurb), md(ctx, details.publicNotes)].filter(Boolean).join("\n\n");
    const fields: Record<string, unknown> = {
      level,
      rarity: str(traits.rarity) || "common",
      size: SIZES[str(obj(traits.size).value)] ?? "Medium",
      traits: strs(traits.value).map(traitText),
      saves: { perception: num(obj(s.perception).mod), fortitude: saveVal("fortitude"), reflex: saveVal("reflex"), will: saveVal("will") },
      senses: sensesText(ctx, obj(s.perception)),
      languages: [...languages, ...(langDetails ? [langDetails] : [])].join(", "),
      skills,
      ...(lores.length ? { lore: lores.join(", ") } : {}),
      attributes: Object.fromEntries(ATTRIBUTES.map((a) => [a.id, num(obj(obj(s.abilities)[a.short]).mod)])),
      ...(gear.length ? { items: gear.join(", ") } : {}),
      ac: num(obj(attrs.ac).value, 10),
      ...(line(ctx, obj(attrs.ac).details) ? { acNote: line(ctx, obj(attrs.ac).details) } : {}),
      ...(saveNotes.length ? { saveNote: saveNotes.join("; ") } : {}),
      hp: { max: num(hp.max, 1), current: num(hp.max, 1), temp: 0 },
      ...(line(ctx, hp.details) ? { hpNote: line(ctx, hp.details) } : {}),
      ...(num(attrs.hardness, 0) ? { hardness: num(attrs.hardness) } : {}),
      immunities: iwr(attrs.immunities, false),
      weaknesses: iwr(attrs.weaknesses, true),
      resistances: iwr(attrs.resistances, true),
      damageModifiers: dm.modifiers,
      conditionImmunities: dm.conditionImmunities,
      speed: speedText(ctx, obj(attrs.speed)),
      strikes: items.filter((i) => i.type === "melee").map((i) => strike(ctx, i)),
      abilities: byCategory("interaction"),
      defenses: byCategory("defensive"),
      actions: byCategory("offensive"),
      spells: spellcasting(ctx, items, level),
      ...(description ? { description } : {}),
    };
    const focus = obj(obj(s.resources).focus);
    if (num(focus.max, 0) > 0) fields.focusPoints = num(focus.max);
    const sizeName = String(fields.size);
    const traitWords = (fields.traits as string[]).join(", ");
    presets.push({
      id: preset(slug),
      entityType: CREATURE,
      name: e.name,
      summary: `Creature ${level}. ${fields.rarity !== "common" ? `${titleCase(String(fields.rarity))} ` : ""}${sizeName} ${traitWords}. AC ${fields.ac}, HP ${num(hp.max, 1)}.`,
      cite: cite(e.book, "Creatures", e.name),
      tags: [e.book.toLowerCase(), ...(opts.extraTags?.(e) ?? []), ...strs(traits.value).filter((x) => !["common"].includes(x) && !findReserved(x)).slice(0, 4)],
      fields,
    });
  }
  return { presets };
}
