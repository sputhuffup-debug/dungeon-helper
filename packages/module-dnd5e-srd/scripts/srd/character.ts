/**
 * Character options from the SRD: classes (with their level tables from
 * 5e-SRD-Levels.json), class features, subclasses, races, subraces, racial
 * traits, backgrounds and feats, as reference lists. The spell slot table of
 * each spellcasting class is also returned for the sheet's computed slots.
 */
import type { ReferenceList } from "@campaign-forge/module-sdk";
import { abilityByShort, ABILITIES, cite, LIST } from "../ids.ts";
import { capitalize, num, obj, objs, refIndex, refName, str, text, index, type Raw } from "./read.ts";

export interface CharacterConversion {
  lists: ReferenceList[];
  /** class id -> 20 rows (levels 1-20) of 9 slot counts (spell levels 1-9); spellcasting classes only. */
  spellSlots: Record<string, number[][]>;
  notes: string[];
}

const abilityName = (short: string) => ABILITIES.find((a) => a.id === abilityByShort(short))!.name;

function optionNames(choice: Raw): string[] {
  const from = obj(choice.from);
  return objs(from.options).map((o) => {
    if (o.item) return refName(o.item).replace(/^Skill: /, "");
    if (o.of) return `${num(o.count, 1) > 1 ? `${num(o.count)} × ` : ""}${refName(o.of)}`;
    if (o.choice) return str(obj(o.choice).desc);
    if (o.string) return str(o.string);
    return str(o.desc);
  });
}

function profBonusOf(level: number): number {
  return 2 + Math.floor((level - 1) / 4);
}

const HIDDEN_SPECIFIC = new Set(["subclass", "class"]);

function progressionTable(levels: Raw[], cls: string): { table: string; slots?: number[][] } {
  const rows = levels.filter((l) => refIndex(l.class) === cls && !l.subclass).sort((a, b) => num(a.level) - num(b.level));
  // De-duplicate repeated level rows (the source has one per level).
  const byLevel = new Map<number, Raw>();
  for (const r of rows) if (!byLevel.has(num(r.level))) byLevel.set(num(r.level), r);
  const ordered = [...byLevel.values()];
  const specificKeys = [...new Set(ordered.flatMap((r) => Object.keys(obj(r.class_specific))))].filter((k) => {
    // Nested objects (e.g. sneak attack dice, martial arts) become "1d6" style text below; skip unknown shapes.
    return !HIDDEN_SPECIFIC.has(k);
  });
  const spellKeys = [...new Set(ordered.flatMap((r) => Object.keys(obj(r.spellcasting))))];
  const slotKeys = spellKeys.filter((k) => k.startsWith("spell_slots_level_"));
  const otherSpellKeys = spellKeys.filter((k) => !k.startsWith("spell_slots_level_"));
  const human = (k: string) => capitalize(k.replace(/_/g, " "));
  const cell = (v: unknown): string => {
    if (typeof v === "number") return String(v);
    if (typeof v === "boolean") return v ? "Yes" : "—";
    const o = obj(v);
    if ("dice_count" in o && "dice_value" in o) return `${num(o.dice_count)}d${num(o.dice_value)}`;
    if (Array.isArray(v)) return v.map((x) => (typeof x === "object" ? str(obj(x).name) || JSON.stringify(x) : String(x))).join(", ");
    if (Object.keys(o).length) return Object.entries(o).map(([k2, v2]) => `${human(k2)} ${cell(v2)}`).join(", ");
    return str(v) || "—";
  };
  const header = ["Level", "Proficiency bonus", "Features", ...specificKeys.map(human), ...otherSpellKeys.map(human), ...slotKeys.map((k) => `Slots ${k.slice(-1)}`)];
  const lines = [`| ${header.join(" | ")} |`, `| ${header.map(() => "---").join(" | ")} |`];
  for (const r of ordered) {
    const lvl = num(r.level);
    const pb = num(r.prof_bonus, profBonusOf(lvl));
    const feats = objs(r.features).map((f) => refName(f)).join(", ") || "—";
    const sc = obj(r.spellcasting);
    const cs = obj(r.class_specific);
    lines.push(`| ${[lvl, `+${pb}`, feats, ...specificKeys.map((k) => cell(cs[k])), ...otherSpellKeys.map((k) => cell(sc[k])), ...slotKeys.map((k) => cell(sc[k]))].join(" | ")} |`);
  }
  let slots: number[][] | undefined;
  if (slotKeys.length) {
    slots = ordered.map((r) => {
      const sc = obj(r.spellcasting);
      return Array.from({ length: 9 }, (_, i) => num(sc[`spell_slots_level_${i + 1}`]));
    });
  }
  return { table: lines.join("\n"), ...(slots ? { slots } : {}) };
}

export function convertCharacterOptions(src: {
  classes: Raw[];
  levels: Raw[];
  features: Raw[];
  subclasses: Raw[];
  races: Raw[];
  subraces: Raw[];
  traits: Raw[];
  backgrounds: Raw[];
  feats: Raw[];
}): CharacterConversion {
  const notes: string[] = [];
  const spellSlots: Record<string, number[][]> = {};

  const classes: ReferenceList = {
    id: LIST.classes,
    name: "Classes",
    cite: cite("Classes"),
    columns: ["hitDie", "savingThrows", "spellcasting", "subclasses"],
    items: src.classes.map((c) => {
      const cid = index(c.index);
      const { table, slots } = progressionTable(src.levels, cid);
      if (slots) {
        if (slots.length !== 20) throw new Error(`${cid}: expected 20 levels of spell slots, got ${slots.length}`);
        spellSlots[cid] = slots;
      }
      const profs = objs(c.proficiencies)
        .map((p) => refName(p))
        .filter((n) => !n.startsWith("Saving Throw"));
      const spell = obj(c.spellcasting);
      const spellInfo = objs(spell.info)
        .map((i) => `**${str(i.name)}.** ${text(i.desc)}`)
        .join("\n\n");
      const multi = obj(c.multi_classing);
      const prereq = objs(multi.prerequisites).map((p) => `${abilityName(refIndex(p.ability_score))} ${num(p.minimum_score)}`);
      const prereqOptions = objs(obj(multi.prerequisite_options).from ? obj(obj(multi.prerequisite_options).from).options : []).map((p) => `${abilityName(refIndex(p.ability_score))} ${num(p.minimum_score)}`);
      return {
        id: cid,
        name: str(c.name),
        summary: `Hit die d${num(c.hit_die)}; saves ${objs(c.saving_throws).map((s) => abilityName(refIndex(s))).join(" and ")}`,
        hitDie: `d${num(c.hit_die)}`,
        savingThrows: objs(c.saving_throws).map((s) => abilityName(refIndex(s))).join(", "),
        spellcasting: Object.keys(spell).length ? abilityName(refIndex(spell.spellcasting_ability)) : "—",
        subclasses: objs(c.subclasses).map((s) => refName(s)).join(", "),
        proficiencies: profs.join(", "),
        skillChoices: objs(c.proficiency_choices)
          .map((p) => str(p.desc) || `Choose ${num(p.choose)} from ${optionNames(p).join(", ")}`)
          .join("; "),
        startingEquipment: [
          ...objs(c.starting_equipment).map((e) => `${num(e.quantity, 1) > 1 ? `${num(e.quantity)} × ` : ""}${refName(e.equipment)}`),
          ...objs(c.starting_equipment_options).map((o) => str(o.desc)).filter(Boolean),
        ].join("; "),
        ...(prereq.length || prereqOptions.length ? { multiclassing: [...prereq, ...(prereqOptions.length ? [`one of ${prereqOptions.join(" or ")}`] : [])].join(", ") } : {}),
        progression: table,
        ...(spellInfo ? { spellcastingRules: spellInfo } : {}),
      };
    }),
  };

  const classFeatures: ReferenceList = {
    id: LIST.classFeatures,
    name: "Class features",
    cite: cite("Classes"),
    columns: ["class", "subclass", "level"],
    items: src.features
      .map((f) => ({
        id: index(f.index),
        name: str(f.name),
        class: refName(f.class),
        ...(f.subclass ? { subclass: refName(f.subclass) } : {}),
        level: num(f.level),
        description: text(f.desc),
      }))
      .sort((a, b) => a.class.localeCompare(b.class) || a.level - b.level || a.name.localeCompare(b.name)),
  };

  const subclasses: ReferenceList = {
    id: LIST.subclasses,
    name: "Subclasses",
    cite: cite("Classes"),
    columns: ["class", "flavor"],
    items: src.subclasses.map((s) => {
      const sid = index(s.index);
      const features = src.features
        .filter((f) => refIndex(f.subclass) === sid)
        .sort((a, b) => num(a.level) - num(b.level))
        .map((f) => `${num(f.level)}: ${str(f.name)}`);
      return {
        id: sid,
        name: str(s.name),
        class: refName(s.class),
        flavor: str(s.subclass_flavor),
        description: text(s.desc),
        features: features.join("; "),
      };
    }),
  };

  const bonuses = (list: unknown) =>
    objs(list)
      .map((b) => `${abilityName(refIndex(b.ability_score))} +${num(b.bonus)}`)
      .join(", ");

  const races: ReferenceList = {
    id: LIST.races,
    name: "Races",
    cite: cite("Races"),
    columns: ["abilityBonuses", "size", "speed", "traits"],
    items: src.races.map((r) => ({
      id: index(r.index),
      name: str(r.name),
      abilityBonuses: bonuses(r.ability_bonuses) + (Object.keys(obj(r.ability_bonus_options)).length ? `; plus ${num(obj(r.ability_bonus_options).choose)} other abilities +1` : ""),
      size: str(r.size),
      speed: `${num(r.speed)} ft.`,
      traits: objs(r.traits).map((t) => refName(t)).join(", ") || "—",
      languages: objs(r.languages).map((l) => refName(l)).join(", "),
      subraces: objs(r.subraces).map((s) => refName(s)).join(", ") || "—",
      description: [
        `**Age.** ${str(r.age)}`,
        `**Alignment.** ${str(r.alignment)}`,
        `**Size.** ${str(r.size_description)}`,
        `**Languages.** ${str(r.language_desc)}`,
      ].join("\n\n"),
    })),
  };

  const subraces: ReferenceList = {
    id: LIST.subraces,
    name: "Subraces",
    cite: cite("Races"),
    columns: ["race", "abilityBonuses", "traits"],
    items: src.subraces.map((s) => ({
      id: index(s.index),
      name: str(s.name),
      race: refName(s.race),
      abilityBonuses: bonuses(s.ability_bonuses),
      traits: objs(s.racial_traits).map((t) => refName(t)).join(", ") || "—",
      description: text(s.desc),
    })),
  };

  const racialTraits: ReferenceList = {
    id: LIST.racialTraits,
    name: "Racial traits",
    cite: cite("Races"),
    columns: ["races"],
    items: src.traits.map((t) => ({
      id: index(t.index),
      name: str(t.name),
      races: [...objs(t.races).map((r) => refName(r)), ...objs(t.subraces).map((r) => refName(r))].join(", "),
      description: text(t.desc),
    })),
  };

  const backgrounds: ReferenceList = {
    id: LIST.backgrounds,
    name: "Backgrounds",
    cite: cite("Backgrounds"),
    columns: ["skills", "feature"],
    items: src.backgrounds.map((b) => {
      const feature = obj(b.feature);
      const lines = (key: string) => optionNames(obj(b[key])).filter(Boolean);
      const ideals = objs(obj(obj(b.ideals).from).options).map((o) => str(o.desc));
      return {
        id: index(b.index),
        name: str(b.name),
        skills: objs(b.starting_proficiencies)
          .map((p) => refName(p).replace(/^Skill: /, ""))
          .join(", "),
        languages: Object.keys(obj(b.language_options)).length ? `${num(obj(b.language_options).choose)} of your choice` : "—",
        equipment: [...objs(b.starting_equipment).map((e) => `${num(e.quantity, 1) > 1 ? `${num(e.quantity)} × ` : ""}${refName(e.equipment)}`), ...objs(b.starting_equipment_options).map((o) => `one ${refName(obj(obj(o.from).equipment_category)).toLowerCase().replace(/s$/, "")}`)].join(", ") + (Object.keys(obj(b.starting_gold)).length ? `, ${num(obj(b.starting_gold).quantity)} ${str(obj(b.starting_gold).unit)}` : ""),
        feature: str(feature.name),
        description: text(feature.desc),
        personalityTraits: lines("personality_traits").map((l, i) => `${i + 1}. ${l}`).join("\n"),
        ideals: ideals.map((l, i) => `${i + 1}. ${l}`).join("\n"),
        bonds: lines("bonds").map((l, i) => `${i + 1}. ${l}`).join("\n"),
        flaws: lines("flaws").map((l, i) => `${i + 1}. ${l}`).join("\n"),
      };
    }),
  };

  const feats: ReferenceList = {
    id: LIST.feats,
    name: "Feats",
    cite: cite("Feats"),
    columns: ["prerequisite"],
    items: src.feats.map((f) => ({
      id: index(f.index),
      name: str(f.name),
      prerequisite: objs(f.prerequisites).map((p) => `${abilityName(refIndex(p.ability_score))} ${num(p.minimum_score)} or higher`).join(", ") || "—",
      description: text(f.desc),
    })),
  };

  for (const l of [classes, classFeatures, subclasses, races, subraces, racialTraits, backgrounds, feats]) {
    const ids = new Set<string>();
    for (const i of l.items) {
      if (ids.has(i.id)) throw new Error(`${l.id}: duplicate item ${i.id}`);
      ids.add(i.id);
    }
  }
  return { lists: [classes, classFeatures, subclasses, races, subraces, racialTraits, backgrounds, feats], spellSlots, notes };
}
