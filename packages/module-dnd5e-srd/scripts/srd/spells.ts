/** SRD spells (5e-SRD-Spells.json) as one reference list, with the text as written. */
import type { ReferenceList } from "@campaign-forge/module-sdk";
import { cite, LIST } from "../ids.ts";
import { bool, num, obj, objs, ordinal, refName, str, strs, text, index, type Raw } from "./read.ts";

function levelLine(level: number, school: string): string {
  return level === 0 ? `${school} cantrip` : `${ordinal(level)}-level ${school.toLowerCase()}`;
}

function damageText(spell: Raw, level: number): string {
  const out: string[] = [];
  for (const d of objs(Array.isArray(spell.damage) ? spell.damage : [spell.damage])) {
    const type = refName(d.damage_type).toLowerCase();
    const bySlot = obj(d.damage_at_slot_level);
    const byChar = obj(d.damage_at_character_level);
    const base = str(bySlot[String(level)]) || str(byChar["1"]) || str(Object.values(bySlot)[0]) || str(Object.values(byChar)[0]);
    if (base) out.push(type ? `${base} ${type}` : base);
  }
  return out.join(", ");
}

export function convertSpells(raw: Raw[]): ReferenceList {
  const items = raw.map((s) => {
    const level = num(s.level);
    const school = refName(s.school);
    const components = strs(s.components);
    const material = str(s.material);
    const dc = obj(s.dc);
    const area = obj(s.area_of_effect);
    const item: Record<string, unknown> & { id: string; name: string } = {
      id: index(s.index),
      name: str(s.name),
      summary: levelLine(level, school) + (bool(s.ritual) ? " (ritual)" : ""),
      level,
      school,
      castingTime: str(s.casting_time),
      range: str(s.range),
      components: components.join(", ") + (material && components.includes("M") ? ` (${material.replace(/\.$/, "").replace(/^./, (c) => c.toLowerCase())})` : ""),
      duration: bool(s.concentration) && !/^concentration/i.test(str(s.duration)) ? `Concentration, ${str(s.duration).replace(/^Up to/, "up to")}` : str(s.duration),
      concentration: bool(s.concentration),
      ritual: bool(s.ritual),
      classes: objs(s.classes).map((c) => refName(c)),
    };
    const save = refName(dc.dc_type);
    if (save) item.savingThrow = save === "STR" ? "Strength" : save === "DEX" ? "Dexterity" : save === "CON" ? "Constitution" : save === "INT" ? "Intelligence" : save === "WIS" ? "Wisdom" : save === "CHA" ? "Charisma" : save;
    const attack = str(s.attack_type);
    if (attack) item.attack = `${attack} spell attack`;
    const damage = damageText(s, level);
    if (damage) item.damage = damage;
    if (Object.keys(area).length) item.area = `${num(area.size)}-foot ${str(area.type)}`;
    item.description = text(s.desc);
    const higher = text(s.higher_level);
    if (higher) item.higherLevels = higher;
    return item;
  });
  return {
    id: LIST.spells,
    name: "Spells",
    cite: cite("Spells"),
    columns: ["level", "school", "castingTime", "range", "duration", "classes"],
    itemSchema: {
      type: "object",
      properties: {
        level: { type: "integer", minimum: 0, maximum: 9 },
        school: { type: "string" },
        concentration: { type: "boolean" },
        ritual: { type: "boolean" },
        classes: { type: "array", items: { type: "string" } },
      },
      required: ["id", "name", "level", "school", "castingTime", "range", "components", "duration", "description"],
    },
    items,
  };
}
