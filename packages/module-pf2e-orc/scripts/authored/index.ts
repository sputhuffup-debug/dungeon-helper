/**
 * The authored files of the pack: `pack.json` (manifest, dice, entity types,
 * the basic reference lists, trackers, play guide, templates, calendar) and
 * `tables.json` (original tables, the encounter builder and other
 * generators, rule summaries and GM advice cards). They read a little of the
 * converted data (creature presets for the encounter tables, Hit Points by
 * ancestry and class for the sheet), so they are built after the converted
 * parts; `test/authored.test.ts` checks the committed files are up to date.
 */
import type { EntityPreset, ReferenceList } from "@campaign-forge/module-sdk";
import { CREATURE, PACK } from "../ids.ts";
import { characterType, creatureType, encounterType, factionType, hazardType, itemType, locationType, npcType, questType } from "./entityTypes.ts";
import { playGuide } from "./guides.ts";
import { dice, manifest } from "./manifest.ts";
import { originalTables, procedures } from "./tables.ts";
import { adviceRules, basicLists, calendar, relationshipTypes, templates } from "./templates.ts";
import { trackers } from "./trackers.ts";

export interface GeneratedData {
  presets: EntityPreset[];
  lists: ReferenceList[];
  /** The converted part files, in join order. */
  parts: string[];
  ancestryHp: Record<string, number>;
  classHp: Record<string, number>;
}

export function buildAuthored(data: GeneratedData): Record<string, unknown> {
  const creatures = data.presets.filter((p) => p.entityType === CREATURE);
  const pack = {
    $schema: "../../module-sdk/schema/module-pack.schema.json",
    format: "campaign-forge-pack",
    formatVersion: 1,
    manifest,
    dice,
    parts: [...data.parts, "tables.json"],
    entityTypes: [characterType(data.ancestryHp, data.classHp), creatureType(), hazardType(), npcType(), locationType(), factionType(), itemType(), encounterType(), questType()],
    relationshipTypes,
    referenceLists: basicLists,
    trackers,
    playGuides: [playGuide],
    templates,
    calendar,
    styleNotes: [
      "Heroic fantasy with teeth: describe the world vividly, set DCs before the dice land, and give all four degrees of success a meaning.",
      "ORC core-rules text is used as written, without the publisher's setting names; GM advice, tables and generators marked Original are Campaign Forge's own.",
    ],
  };
  const tablesPart = {
    $schema: "../../module-sdk/schema/module-pack-part.schema.json",
    format: "campaign-forge-pack-part",
    formatVersion: 1,
    pack: PACK,
    name: "tables.json",
    rules: adviceRules,
    tables: originalTables(creatures),
    procedures: procedures(),
  };
  return { "pack.json": pack, "tables.json": tablesPart };
}
