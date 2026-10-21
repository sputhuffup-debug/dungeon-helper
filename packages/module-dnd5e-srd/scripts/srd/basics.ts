/**
 * The small SRD lists the sheets and the reference browser use: ability
 * scores, skills, saving throws, alignments, conditions, damage types,
 * languages, schools of magic, weapon properties, sizes and creature types.
 */
import type { ReferenceList } from "@campaign-forge/module-sdk";
import { ABILITIES, abilityByShort, cite, LIST, SAVES, SKILLS } from "../ids.ts";
import { capitalize, refIndex, str, strs, text, index, type Raw } from "./read.ts";

export interface BasicsSource {
  abilityScores: Raw[];
  skills: Raw[];
  alignments: Raw[];
  conditions: Raw[];
  damageTypes: Raw[];
  languages: Raw[];
  magicSchools: Raw[];
  weaponProperties: Raw[];
  monsters: Raw[];
}

export function convertBasics(src: BasicsSource): ReferenceList[] {
  // The skill list the sheets use must match the source's skills and abilities exactly.
  const sourceSkills = new Map(src.skills.map((s) => [index(s.index), abilityByShort(refIndex(s.ability_score))]));
  for (const s of SKILLS) if (sourceSkills.get(s.id) !== s.ability) throw new Error(`skill ${s.id} does not match the source`);
  if (sourceSkills.size !== SKILLS.length) throw new Error("the source has a different number of skills");
  const skillDesc = new Map(src.skills.map((s) => [index(s.index), text(s.desc)]));
  const abilityDesc = new Map(src.abilityScores.map((a) => [abilityByShort(str(a.index)), text(a.desc)]));

  const sizes = ["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"];
  const types = [...new Set(src.monsters.map((m) => str(m.type)).filter((t) => t && !t.startsWith("swarm")))].sort();

  return [
    {
      id: LIST.abilities,
      name: "Ability scores",
      cite: cite("Using Ability Scores"),
      columns: ["abbreviation", "skills"],
      items: ABILITIES.map((a) => ({
        id: a.id,
        name: a.name,
        abbreviation: a.abbr,
        skills: SKILLS.filter((s) => s.ability === a.id)
          .map((s) => s.name)
          .join(", ") || "—",
        description: abilityDesc.get(a.id) ?? "",
      })),
    },
    {
      id: LIST.skills,
      name: "Skills",
      cite: cite("Using Ability Scores", "Skills"),
      columns: ["ability"],
      itemSchema: { type: "object", properties: { attribute: { type: "string", enum: ABILITIES.map((a) => a.id) } }, required: ["id", "name", "attribute"] },
      items: SKILLS.map((s) => ({
        id: s.id,
        name: s.name,
        attribute: s.ability,
        ability: capitalize(s.ability),
        description: skillDesc.get(s.id) ?? "",
      })),
    },
    {
      id: LIST.saves,
      name: "Saving throws",
      cite: cite("Using Ability Scores", "Saving Throws"),
      columns: ["ability"],
      itemSchema: { type: "object", properties: { attribute: { type: "string", enum: ABILITIES.map((a) => a.id) } }, required: ["id", "name", "attribute"] },
      items: SAVES.map((s) => ({ id: s.id, name: s.name, attribute: s.ability, ability: capitalize(s.ability) })),
    },
    {
      id: LIST.alignments,
      name: "Alignments",
      cite: cite("Alignment"),
      columns: ["abbreviation"],
      items: src.alignments.map((a) => ({ id: index(a.index), name: str(a.name), abbreviation: str(a.abbreviation), description: text(a.desc) })),
    },
    {
      id: LIST.conditions,
      name: "Conditions",
      cite: cite("Conditions"),
      items: src.conditions.map((c) => ({ id: index(c.index), name: str(c.name), description: text(c.desc) })),
    },
    {
      id: LIST.damageTypes,
      name: "Damage types",
      cite: cite("Combat", "Damage Types"),
      items: src.damageTypes.map((d) => ({ id: index(d.index), name: str(d.name), description: text(d.desc) })),
    },
    {
      id: LIST.languages,
      name: "Languages",
      cite: cite("Languages"),
      columns: ["type", "typicalSpeakers", "script"],
      items: src.languages.map((l) => ({
        id: index(l.index),
        name: str(l.name),
        type: str(l.type),
        typicalSpeakers: strs(l.typical_speakers).join(", ") || "—",
        script: str(l.script) || "—",
      })),
    },
    {
      id: LIST.magicSchools,
      name: "Schools of magic",
      cite: cite("Spellcasting", "The Schools of Magic"),
      items: src.magicSchools.map((s) => ({ id: index(s.index), name: str(s.name), description: text(s.desc) })),
    },
    {
      id: LIST.weaponProperties,
      name: "Weapon properties",
      cite: cite("Equipment", "Weapon Properties"),
      items: src.weaponProperties.map((p) => ({ id: index(p.index), name: str(p.name), description: text(p.desc) })),
    },
    {
      id: LIST.sizes,
      name: "Sizes",
      cite: cite("Combat", "Creature Size"),
      columns: ["space"],
      items: sizes.map((s, i) => ({ id: s.toLowerCase(), name: s, space: ["2½ by 2½ ft.", "5 by 5 ft.", "5 by 5 ft.", "10 by 10 ft.", "15 by 15 ft.", "20 by 20 ft. or larger"][i] })),
    },
    {
      id: LIST.creatureTypes,
      name: "Creature types",
      cite: cite("Monsters"),
      items: types.map((t) => ({ id: index(t), name: capitalize(t), creatures: src.monsters.filter((m) => str(m.type) === t).length })),
    },
  ];
}
