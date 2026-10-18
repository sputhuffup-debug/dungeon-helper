/**
 * Encounter check (p. 252-257): picks the encounter table for where the
 * party is. For star systems `region` picks the printed reading or the
 * tens-digit -3 (Outer Rim, Frontier, Far Reach) or -5 (uncharted) table;
 * for general colony encounters `colonySize` "established" picks the +1
 * reading. Star system rows
 * for vessels nest a Ship Reactions roll. Produces one encounter entity,
 * or none when the roll is "no encounter".
 */
import type { Procedure, ProcedureContext } from "@campaign-forge/module-sdk";
import { REGION_IDS } from "../entities/common";
import { REMOTE_REGIONS } from "../tables/encounters";
import { input, isObj, obj, str } from "./helpers";

export const WHERE_TABLES: Record<string, string> = {
  "star-system": "alien.encounters.star-system",
  "ship-reaction": "alien.encounters.ship-reactions",
  "surface-uninhabited": "alien.encounters.surface",
  "surface-colonized": "alien.encounters.surface",
  "colony-general": "alien.encounters.colony.general",
  "colony-public": "alien.encounters.colony.public",
  "colony-habitation": "alien.encounters.colony.habitation",
  "colony-operations": "alien.encounters.colony.operations",
  "colony-spaceport": "alien.encounters.colony.spaceport",
  "colony-industrial": "alien.encounters.colony.industrial",
};

const SURFACE_NONE = "No encounter";

function where(ctx: ProcedureContext): string {
  const w = str(input(ctx, "where"), "star-system");
  return WHERE_TABLES[w] ? w : "star-system";
}

/** The table actually rolled: the star system and general colony tables have tens-digit readings (p. 252-255). */
export function encounterTable(ctx: ProcedureContext): string {
  const w = where(ctx);
  if (w === "star-system") {
    const region = str(input(ctx, "region"));
    if (region === "uncharted") return "alien.encounters.star-system-uncharted";
    if (REMOTE_REGIONS.includes(region)) return "alien.encounters.star-system-remote";
  }
  if (w === "colony-general" && str(input(ctx, "colonySize")) === "established") return "alien.encounters.colony.general-established";
  return WHERE_TABLES[w] ?? "alien.encounters.star-system";
}

/** True when the rolled row means nothing happens. */
function isNone(w: string, r: Record<string, unknown>): boolean {
  if (r.none === true) return true;
  if (w === "surface-uninhabited") return r.uninhabited === SURFACE_NONE;
  if (w === "surface-colonized") return r.colonized === SURFACE_NONE;
  return false;
}

function describe(w: string, r: Record<string, unknown>): string {
  if (w === "surface-uninhabited") return str(r.uninhabited, str(r.label));
  if (w === "surface-colonized") return str(r.colonized, str(r.label));
  if (w === "ship-reaction") return `Ship reaction: ${str(r.label)}`;
  const base = str(r.encounter, str(r.label));
  const reaction = isObj(r.reaction) ? str(r.reaction.label) : "";
  return reaction ? `${base} (${reaction})` : base;
}

/** Map a `where` choice onto the encounter entity's `setting` enum. */
function settingOf(w: string): string {
  if (w === "star-system") return "star-system";
  if (w === "ship-reaction") return "ship";
  if (w.startsWith("surface")) return "surface";
  if (w === "colony-general") return "colony";
  return "colony-area";
}

export const encounterCheck: Procedure = {
  id: "alien.encounter.check",
  name: "Encounter check",
  description: "Roll on the encounter table for where the party is: star system, ship reaction, planet surface, or a colony (general or one of five areas).",
  page: [252, 257],
  inputs: {
    type: "object",
    properties: {
      where: { type: "string", enum: Object.keys(WHERE_TABLES), default: "star-system" },
      region: {
        type: "string",
        enum: [...REGION_IDS, "uncharted"],
        default: "core",
        description: "Star system encounters only: Outer Rim, Frontier or Far Reach shift the tens digit by -3, uncharted space by -5 (p. 254).",
      },
      colonySize: {
        type: "string",
        enum: ["start-up", "young", "established"],
        default: "young",
        description: "General colony encounters only: an established colony adds 1 to the tens digit (p. 252).",
      },
    },
  },
  steps: [
    {
      id: "encounter",
      title: "Encounter",
      table: encounterTable,
      after: (ctx, result) => {
        const w = where(ctx);
        const r = isObj(result) ? result : { label: String(result) };
        const none = isNone(w, r);
        return { ...r, where: w, none, description: none ? "No encounter" : describe(w, r) };
      },
    },
  ],
  produce: (ctx) => {
    const w = where(ctx);
    const e = obj(ctx, "encounter");
    if (e.none === true) return { entities: [], relationships: [] };
    const description = str(e.description, str(e.label));
    const reaction = isObj(e.reaction) ? e.reaction : w === "ship-reaction" ? e : undefined;
    return {
      entities: [
        {
          tempId: "encounter",
          type: "alien.encounter",
          name: description,
          summary: `${w} encounter`,
          tags: ["encounter", w],
          fields: {
            setting: settingOf(w),
            tableId: encounterTable(ctx),
            summary: description,
            where: w,
            table: encounterTable(ctx),
            ...(w === "star-system" ? { region: str(input(ctx, "region"), "core") } : {}),
            ...(w === "colony-general" ? { colonySize: str(input(ctx, "colonySize"), "young") } : {}),
            label: str(e.label),
            description,
            ...(reaction ? { reaction: str(reaction.reaction), reactionLabel: str(reaction.label) } : {}),
            resolved: false,
          },
        },
      ],
      relationships: [],
    };
  },
};
