/**
 * The authored files of the pack: `pack.json` (manifest, dice, entity types,
 * trackers, play guide, templates, calendar) and `tables.json` (original
 * tables, generators and GM advice cards). They read a little of the converted
 * SRD data (the class list, spell slot tables, monster presets), so they are
 * built after the SRD parts; `test/authored.test.ts` checks the committed
 * files are up to date.
 */
import type { EntityPreset, ReferenceList } from "@campaign-forge/module-sdk";
import { LIST, PACK } from "../ids.ts";
import { d20Combat } from "./combat.ts";
import { gmScreen } from "./gmScreen.ts";
import { characterType, encounterType, factionType, itemType, locationType, monsterType, npcType, questType } from "./entityTypes.ts";
import { playGuide } from "./guides.ts";
import { primer } from "./primer.ts";
import { dice, manifest } from "./manifest.ts";
import { originalTables } from "./tables.ts";
import { adviceRules, calendar, relationshipTypes, templates } from "./templates.ts";
import { trackers } from "./trackers.ts";

/** Every part file, in the order the pack joins them. */
export const PARTS = ["srd-basics.json", "srd-rules.json", "srd-character.json", "srd-spells.json", "srd-equipment.json", "srd-monsters-1.json", "srd-monsters-2.json", "tables.json"] as const;

export interface GeneratedData {
  monsters: EntityPreset[];
  /** The basic and character-option reference lists. */
  lists: ReferenceList[];
  spellSlots: Record<string, number[][]>;
}

export function buildAuthored(data: GeneratedData): Record<string, unknown> {
  const classes = data.lists.find((l) => l.id === LIST.classes);
  if (!classes) throw new Error("the class list is missing from srd-character.json");
  const { tables, procedures } = originalTables(data.monsters);
  const pack = {
    $schema: "../../module-sdk/schema/module-pack.schema.json",
    format: "campaign-forge-pack",
    formatVersion: 1,
    manifest,
    dice,
    parts: [...PARTS],
    entityTypes: [characterType(classes, data.spellSlots), monsterType(), npcType(), locationType(), factionType(), itemType(), encounterType(), questType()],
    relationshipTypes,
    trackers,
    playGuides: [playGuide],
    primer,
    d20Combat: d20Combat(data.lists),
    gmScreen,
    templates,
    calendar,
    styleNotes: [
      "Heroic fantasy: describe the world vividly, let the dice decide what is uncertain, and keep the spotlight moving between players.",
      "SRD rules text is quoted as written; GM advice, tables and generators marked Original are Campaign Forge's own.",
    ],
  };
  const tablesPart = {
    $schema: "../../module-sdk/schema/module-pack-part.schema.json",
    format: "campaign-forge-pack-part",
    formatVersion: 1,
    pack: PACK,
    name: "tables.json",
    rules: adviceRules,
    tables,
    procedures,
  };
  return { "pack.json": pack, "tables.json": tablesPart };
}
