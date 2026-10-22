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
  /** How many presets got structured attacks, and the actions left as text only. */
  coverage: { monsters: number; withAttacks: number; attacks: number; saveEffects: number; textOnly: number; multiattack: number };
}

/** The SRD's conditions, as the combat conditions name them (lower case ids). */
const CONDITION_WORDS = ["blinded", "charmed", "deafened", "frightened", "grappled", "incapacitated", "invisible", "paralyzed", "petrified", "poisoned", "prone", "restrained", "stunned", "unconscious"];

const ABILITY_SAVES: Record<string, string> = { str: "strength-save", dex: "dexterity-save", con: "constitution-save", int: "intelligence-save", wis: "wisdom-save", cha: "charisma-save" };

interface AttackItem {
  name: string;
  kind?: "melee" | "ranged" | "spell";
  bonus?: number;
  damage: Array<{ dice: string; type: string }>;
  reach?: string;
  range?: string;
  traits?: string[];
  save?: { dc: number; save: string; half?: boolean; damage?: Array<{ dice: string; type: string }>; conditions?: Array<{ id: string; duration?: Record<string, unknown> }> };
  onHit?: Array<{ id: string }>;
  effect?: string;
}

const compactDice = (d: string) => d.replace(/\s+/g, "");

function damageList(list: unknown): { parts: Array<{ dice: string; type: string }>; alternatives: string[] } {
  const parts: Array<{ dice: string; type: string }> = [];
  const alternatives: string[] = [];
  for (const d of objs(list)) {
    if (d.choose !== undefined) {
      // a choice (one-handed or two-handed): the first option, the others noted
      const options = objs(obj(d.from).options);
      const first = options[0];
      if (first) parts.push({ dice: compactDice(str(first.damage_dice)), type: refIndex(first.damage_type) });
      for (const o of options.slice(1)) alternatives.push(`${str(o.notes) || "or"}: ${compactDice(str(o.damage_dice))} ${refIndex(o.damage_type)}`);
      continue;
    }
    const dice = compactDice(str(d.damage_dice));
    if (dice) parts.push({ dice, type: refIndex(d.damage_type) });
  }
  return { parts, alternatives };
}

/** Conditions a save effect's text applies on a failure, with a duration when the text gives one. */
function conditionsIn(full: string): Array<{ id: string; duration?: Record<string, unknown> }> {
  const found: string[] = [];
  // what happens at 0 hit points is not what a failed save does
  const text = full
    .split(/(?<=\.)\s+/)
    .filter((sentence) => !/0 hit points/.test(sentence))
    .join(" ");
  const re = /\b(?:be|become|becomes|is|are|fall|falls|be knocked|is knocked)\s+(?:magically\s+)?(blinded|charmed|deafened|frightened|grappled|incapacitated|paralyzed|petrified|poisoned|prone|restrained|stunned|unconscious)\b/gi;
  for (const m of text.matchAll(re)) {
    const id = m[1]!.toLowerCase();
    if (!found.includes(id)) found.push(id);
  }
  if (/knocked prone/i.test(text) && !found.includes("prone")) found.push("prone");
  const duration: Record<string, unknown> = {};
  const minutes = /\bfor (1|\d+) minutes?\b/i.exec(text);
  if (minutes) duration.rounds = Number(minutes[1]) * 10;
  else if (/until the end of (?:its|the target's) next turn/i.test(text)) duration.rounds = 1;
  if (/repeat the saving throw at the end of each of its turns/i.test(text)) duration.save = true;
  return found.filter((id) => CONDITION_WORDS.includes(id)).map((id) => (Object.keys(duration).length && id !== "prone" && id !== "grappled" ? { id, duration: { ...duration } } : { id }));
}

/** One action (or one option of an action) as a structured attack, when the source gives the numbers. */
function attackOf(name: string, desc: string, a: Raw, magical: boolean): AttackItem | undefined {
  const hasAttack = a.attack_bonus !== undefined && /Weapon Attack|Spell Attack/.test(desc);
  let dc = obj(a.dc);
  // An attack whose hit asks for a save the source leaves in the text only ("must succeed on a DC 10 Constitution saving throw").
  const textDc = /DC (\d+) (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/.exec(desc);
  const textDamage = /taking \d+ \((\d+d\d+(?: [+-] \d+)?)\) (\w+) damage/.exec(desc);
  const inferred = Object.keys(dc).length === 0 && a.attack_bonus !== undefined && !!textDc;
  if (inferred) dc = { dc_type: { index: textDc![2]!.slice(0, 3).toLowerCase() }, dc_value: Number(textDc![1]), success_type: /half as much/.test(desc) ? "half" : "none" };
  const hasDc = Object.keys(dc).length > 0;
  if (!hasAttack && !hasDc) return undefined;
  const { parts, alternatives } = damageList(a.damage);
  const item: AttackItem = { name, damage: [] };
  const extra: string[] = [...alternatives];
  if (hasAttack) {
    const kind = /^(Melee or Ranged|Melee|Ranged) (Weapon|Spell) Attack/.exec(desc.trim());
    item.kind = kind?.[2] === "Spell" ? "spell" : kind?.[1] === "Ranged" ? "ranged" : "melee";
    item.bonus = num(a.attack_bonus);
    const reach = /reach (\d+ ft\.)/.exec(desc);
    if (reach) item.reach = reach[1];
    const range = /range (\d+(?:\/\d+)? ft\.)/.exec(desc);
    if (range) item.range = range[1];
    if (magical && /Weapon Attack/.test(desc)) item.traits = ["magical"];
    item.damage = hasDc && !inferred ? parts.slice(0, 1) : parts;
    const grab = /(?:the target|it) is (grappled|restrained)/i.exec(desc.split(/must (?:succeed|make)/)[0] ?? desc);
    if (grab) item.onHit = [{ id: grab[1]!.toLowerCase() }];
  }
  if (hasDc) {
    const save = ABILITY_SAVES[refIndex(dc.dc_type)];
    if (!save) return item.kind ? item : undefined;
    const saveDamage = inferred ? (textDamage ? [{ dice: compactDice(textDamage[1]!), type: textDamage[2]!.toLowerCase() }] : []) : hasAttack ? parts.slice(1) : parts;
    // the source marks a few half-damage saves "none"; the text says half
    const half = str(dc.success_type) === "half" || (saveDamage.length > 0 && /half as much damage on a successful one/.test(desc));
    const conditions = conditionsIn(desc).map((c) => (c.duration?.save ? { ...c, duration: { ...c.duration, save: { save } } } : c));
    const sentence = desc.split(/(?<=\.)\s+/).find((x) => /saving throw/.test(x))?.trim();
    item.save = {
      dc: num(dc.dc_value),
      save,
      ...(half ? { half: true } : {}),
      ...(saveDamage.length ? { damage: saveDamage } : {}),
      ...(conditions.length ? { conditions } : {}),
      ...(sentence ? { text: sentence.length > 400 ? `${sentence.slice(0, 397)}...` : sentence } : {}),
    };
  }
  if (extra.length) item.effect = extra.join("; ");
  return item;
}

/** The paragraph of a multi-option action that describes one option ("Fire Breath. The dragon exhales..."). */
function optionText(desc: string, name: string): string {
  return desc.split(/\n+/).find((l) => l.trim().startsWith(`${name}.`)) ?? desc;
}

function attacksOf(m: Raw, notes: string[]): { attacks: AttackItem[]; textOnly: number; multiattack: number } {
  const magical = objs(m.special_abilities).some((t) => /weapon attacks are magical/i.test(text(t.desc)));
  const attacks: AttackItem[] = [];
  let textOnly = 0;
  let multiattack = 0;
  for (const a of objs(m.actions)) {
    const name = str(a.name);
    const desc = text(a.desc);
    if (a.multiattack_type !== undefined || /^Multiattack/.test(name)) {
      multiattack++;
      continue;
    }
    const options = [...objs(obj(obj(a.options).from).options), ...objs(a.attacks)];
    if (options.length) {
      for (const o of options) {
        const item = attackOf(`${name}: ${str(o.name)}`, optionText(desc, str(o.name)), o, magical);
        if (item) attacks.push(item);
      }
      continue;
    }
    const item = attackOf(name, desc, a, magical);
    if (item) attacks.push(item);
    else {
      textOnly++;
      notes.push(`${str(m.name)}: action "${name}" kept as text only (no attack bonus or save DC in the source)`);
    }
  }
  return { attacks, textOnly, multiattack };
}

/**
 * The stat block's resistances, immunities and vulnerabilities as structured
 * entries: one per damage type, with the attack traits that get past it
 * ("from nonmagical weapons that aren't silvered": magical, silvered).
 */
function damageModifiersOf(m: Raw, notes: string[]): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const kinds: Array<[string, string]> = [
    ["damage_immunities", "immunity"],
    ["damage_resistances", "resistance"],
    ["damage_vulnerabilities", "vulnerability"],
  ];
  const types = ["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"];
  for (const [key, kind] of kinds) {
    for (const entry of strs(m[key])) {
      const low = entry.toLowerCase();
      const words = types.filter((t) => new RegExp(`\\b${t}\\b`).test(low));
      const qualified = low !== words.join(", ") && words.length > 0;
      const except: string[] = [];
      if (/nonmagical/.test(low)) except.push("magical");
      if (/silvered/.test(low)) except.push("silvered");
      if (/adamantine/.test(low)) except.push("adamantine");
      const understood = words.length > 0 && (!qualified || (/from nonmagical (weapons|attacks)/.test(low) && !/wielded|spells/.test(low)));
      if (!understood) {
        notes.push(`${str(m.name)}: ${kind} "${entry}" kept as text only`);
        continue;
      }
      for (const t of words) out.push({ kind, type: t, ...(except.length ? { except } : {}), ...(qualified ? { note: entry } : {}) });
    }
  }
  return out;
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
  const coverage = { monsters: raw.length, withAttacks: 0, attacks: 0, saveEffects: 0, textOnly: 0, multiattack: 0 };
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
      damageModifiers: damageModifiersOf(m, notes),
      senses: sensesText(obj(m.senses)),
      languages: str(m.languages) || "—",
      cr,
      xp,
      traits: entries(m.special_abilities),
      actions: entries(m.actions),
      reactions: entries(m.reactions),
      legendaryActions: entries(m.legendary_actions),
    };
    const { attacks, textOnly, multiattack } = attacksOf(m, notes);
    fields.attacks = attacks;
    coverage.attacks += attacks.length;
    coverage.saveEffects += attacks.filter((a) => a.save).length;
    coverage.textOnly += textOnly;
    coverage.multiattack += multiattack;
    if (attacks.length) coverage.withAttacks++;
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
  notes.push(
    `attacks: ${coverage.withAttacks} of ${coverage.monsters} monsters have structured attacks (${coverage.attacks} attacks, ${coverage.saveEffects} with a save effect); ${coverage.multiattack} Multiattack actions and ${coverage.textOnly} other actions stay text only`,
  );
  return { presets, coverage, notes: [...notes, ...(arr(raw).length !== 334 ? [`expected 334 monsters, got ${raw.length}`] : [])] };
}
