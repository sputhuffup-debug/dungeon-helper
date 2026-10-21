/**
 * SRD monsters (5e-SRD-Monsters.json) as presets of the monster entity type.
 *
 * Stored per the stat block: size, type, alignment, AC (with its note), hit
 * points and hit dice, speed, the six scores, damage and condition
 * immunities, senses, languages, challenge rating, XP, traits, actions,
 * reactions and legendary actions. Skill and save proficiencies are stored as
 * the multiplier of the proficiency bonus (1 proficient, 2 expertise), with a
 * flat `bonuses` entry where the stat block's number is not ability modifier +
 * multiplier × proficiency; the sheet derives every bonus, the passive
 * Perception and the proficiency bonus (from CR) with JSONLogic (rule 4).
 */
import type { EntityPreset } from "@campaign-forge/module-sdk";
import { ABILITIES, abilityByShort, MONSTER, preset, SKILLS, type AbilityId, cite } from "../ids.ts";
import { arr, crLabel, diceText, num, obj, objs, refIndex, refName, str, strs, text, index, type Raw } from "./read.ts";

/** XP by challenge rating (SRD 5.1, Monsters: Challenge). CR 0 is 0 or 10 XP depending on the creature. */
export const XP_BY_CR: Record<string, number> = {
  "0.125": 25, "0.25": 50, "0.5": 100, "1": 200, "2": 450, "3": 700, "4": 1100, "5": 1800, "6": 2300, "7": 2900, "8": 3900, "9": 5000, "10": 5900,
  "11": 7200, "12": 8400, "13": 10000, "14": 11500, "15": 13000, "16": 15000, "17": 18000, "18": 20000, "19": 22000, "20": 25000,
  "21": 33000, "22": 41000, "23": 50000, "24": 62000, "25": 75000, "26": 90000, "27": 105000, "28": 120000, "29": 135000, "30": 155000,
};

/**
 * Known gaps in the source data: skill bonuses these stat blocks print (the
 * passive Perception the source gives already counts them) but the source's
 * proficiency list leaves out. Values are the stat block's bonus.
 */
const SKILL_FIXES: Record<string, Record<string, number>> = {
  "black-bear": { perception: 3 },
  "swarm-of-ravens": { perception: 5 },
  "half-red-dragon-veteran": { athletics: 5, perception: 2 },
};

export interface MonsterConversion {
  presets: EntityPreset[];
  notes: string[];
}

const mod = (score: number) => Math.floor((score - 10) / 2);

function usageText(u: Raw): string {
  const type = str(u.type);
  if (type === "recharge on roll") {
    const min = num(u.min_value, 6);
    return min >= 6 ? "Recharge 6" : `Recharge ${min}–6`;
  }
  if (type === "per day") return `${num(u.times, 1)}/Day`;
  if (type === "recharge after rest") {
    const rests = strs(u.rest_types);
    return rests.length > 1 ? "Recharges after a Short or Long Rest" : `Recharges after a ${rests[0] === "short" ? "Short" : "Long"} Rest`;
  }
  return "";
}

function entries(list: unknown): Array<{ name: string; desc: string }> {
  return objs(list).map((a) => {
    const usage = Object.keys(obj(a.usage)).length ? usageText(obj(a.usage)) : "";
    const name = str(a.name);
    return { name: usage && !name.includes("(") ? `${name} (${usage})` : name, desc: text(a.desc) };
  });
}

function speedText(speed: Raw): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(speed)) {
    if (k === "hover") continue;
    const value = str(v);
    if (!value) continue;
    parts.push(k === "walk" ? value : `${k} ${value}${k === "fly" && speed.hover === true ? " (hover)" : ""}`);
  }
  return parts.join(", ");
}

function sensesText(senses: Raw): string {
  return Object.entries(senses)
    .filter(([k]) => k !== "passive_perception")
    .map(([k, v]) => `${k} ${str(v) || String(num(v))}`)
    .join(", ");
}

function acOf(list: Raw[]): { ac: number; note: string } {
  const describe = (a: Raw): string => {
    switch (str(a.type)) {
      case "natural":
        return "natural armor";
      case "armor":
        return objs(a.armor)
          .map((x) => refName(x).toLowerCase())
          .join(", ");
      case "spell":
        return `with ${refName(a.spell).toLowerCase()}`;
      case "condition":
        return `while ${refName(a.condition).toLowerCase()}`;
      default:
        return str(a.desc);
    }
  };
  const first = list[0] ?? {};
  const notes = [describe(first), ...list.slice(1).map((a) => `${num(a.value)} ${describe(a)}`)].filter(Boolean);
  return { ac: num(first.value, 10), note: notes.join("; ") };
}

export function convertMonsters(raw: Raw[]): MonsterConversion {
  const notes: string[] = [];
  const skillAbility = new Map(SKILLS.map((s) => [s.id, s.ability]));
  const presets = raw.map((m): EntityPreset => {
    const idx = index(m.index);
    const name = str(m.name);
    const cr = num(m.challenge_rating);
    const pb = num(m.proficiency_bonus, 2);
    const expectedPb = 2 + Math.floor((Math.max(cr, 1) - 1) / 4);
    if (pb !== expectedPb) notes.push(`${name}: source proficiency bonus ${pb}, CR ${cr} gives ${expectedPb}`);
    const abilities = Object.fromEntries(ABILITIES.map((a) => [a.id, num(m[a.id], 10)])) as Record<AbilityId, number>;
    const skills: Record<string, number> = {};
    const saves: Record<string, number> = {};
    const bonuses: Record<string, number> = {};
    const listed = objs(m.proficiencies).map((p) => ({ pid: refIndex(p.proficiency), value: num(p.value) }));
    for (const [skill, value] of Object.entries(SKILL_FIXES[idx] ?? {})) {
      if (listed.some((p) => p.pid === `skill-${skill}`)) continue;
      listed.push({ pid: `skill-${skill}`, value });
      notes.push(`${name}: added ${skill} ${value >= 0 ? "+" : ""}${value} from the stat block (missing in the source's proficiency list)`);
    }
    for (const { pid, value } of listed) {
      let key: string;
      let ability: AbilityId;
      let target: Record<string, number>;
      if (pid.startsWith("skill-")) {
        key = pid.slice(6);
        const a = skillAbility.get(key);
        if (!a) throw new Error(`${name}: unknown skill ${pid}`);
        ability = a;
        target = skills;
      } else if (pid.startsWith("saving-throw-")) {
        ability = abilityByShort(pid.slice(13));
        key = `${ability}-save`;
        target = saves;
      } else throw new Error(`${name}: unknown proficiency ${pid}`);
      const base = mod(abilities[ability]);
      // Proficient (1) or expertise (2); anything the multiplier cannot reach goes into a flat bonus.
      const k = Math.min(2, Math.max(1, Math.round((value - base) / pb)));
      target[key] = k;
      const rest = value - base - k * pb;
      if (rest !== 0) bonuses[key] = rest;
    }
    // Passive Perception is derived: report where the source's own number differs.
    const perception = mod(abilities.wisdom) + (skills.perception ?? 0) * pb + (bonuses.perception ?? 0);
    const sourcePassive = num(obj(m.senses).passive_perception, NaN);
    if (Number.isFinite(sourcePassive) && sourcePassive !== 10 + perception) notes.push(`${name}: passive Perception derived as ${10 + perception}; the source lists ${sourcePassive}`);

    // XP follows the challenge rating; CR 0 creatures are worth 0 or 10.
    let xp = num(m.xp);
    if (cr > 0) {
      const byCr = XP_BY_CR[String(cr)];
      if (byCr === undefined) throw new Error(`${name}: no XP for CR ${cr}`);
      if (byCr !== xp) {
        notes.push(`${name}: source XP ${xp} corrected to ${byCr} for CR ${crLabel(cr)}`);
        xp = byCr;
      }
    }

    const { ac, note } = acOf(objs(m.armor_class));
    const hp = num(m.hit_points, 1);
    const type = str(m.type);
    const subtype = str(m.subtype);
    const fields: Record<string, unknown> = {
      size: str(m.size),
      creatureType: type,
      ...(subtype ? { creatureSubtype: subtype } : {}),
      alignment: str(m.alignment),
      ac,
      ...(note ? { acNote: note } : {}),
      hp: { max: hp, current: hp, temp: 0 },
      hitDice: diceText(str(m.hit_points_roll) || str(m.hit_dice)),
      speed: speedText(obj(m.speed)),
      abilities,
      saves,
      skills,
      ...(Object.keys(bonuses).length ? { bonuses } : {}),
      damageVulnerabilities: strs(m.damage_vulnerabilities),
      damageResistances: strs(m.damage_resistances),
      damageImmunities: strs(m.damage_immunities),
      conditionImmunities: objs(m.condition_immunities).map((c) => refName(c).toLowerCase()),
      senses: sensesText(obj(m.senses)),
      languages: str(m.languages) || "—",
      cr,
      xp,
      traits: entries(m.special_abilities),
      actions: entries(m.actions),
      reactions: entries(m.reactions),
      legendaryActions: entries(m.legendary_actions),
    };
    const desc = text(m.desc);
    if (desc) fields.description = desc;
    const typeLine = `${str(m.size)} ${type}${subtype ? ` (${subtype})` : ""}, ${str(m.alignment)}`;
    return {
      id: preset(idx),
      entityType: MONSTER,
      name,
      summary: `${typeLine}. CR ${crLabel(cr)} (${xp.toLocaleString("en-US")} XP), AC ${ac}, HP ${hp}.`,
      cite: cite("Monsters", name),
      tags: [type.startsWith("swarm") ? "swarm" : type, `cr ${crLabel(cr)}`],
      fields,
    };
  });
  // Every creature keeps its source order (alphabetical); ids must be unique.
  const seen = new Set<string>();
  for (const p of presets) {
    if (seen.has(p.id)) throw new Error(`duplicate monster ${p.id}`);
    seen.add(p.id);
  }
  return { presets, notes: [...notes, ...(arr(raw).length !== 334 ? [`expected 334 monsters, got ${raw.length}`] : [])] };
}
