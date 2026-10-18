/**
 * Encounter check (p. 252-257): picks the encounter table from where the
 * party is and passes `timeElapsed` to the table's tens-digit modifier.
 * Produces one encounter entity.
 */
import type { Procedure, ProcedureContext } from "@campaign-forge/module-sdk";
import { input, num, obj, str } from "./helpers";

export const WHERE_TABLES: Record<string, string> = {
  "star-system": "alien.encounters.star-system",
  "ship-reaction": "alien.encounters.ship-reactions",
  "surface-terrestrial": "alien.encounters.surface",
  "surface-ice": "alien.encounters.surface",
  "colony-general": "alien.encounters.colony.general",
  "colony-admin": "alien.encounters.colony.admin",
  "colony-residential": "alien.encounters.colony.residential",
  "colony-industrial": "alien.encounters.colony.industrial",
  "colony-medical": "alien.encounters.colony.medical",
  "colony-spaceport": "alien.encounters.colony.spaceport",
};

function where(ctx: ProcedureContext): string {
  const w = str(input(ctx, "where"), "star-system");
  return WHERE_TABLES[w] ? w : "star-system";
}

function describe(w: string, result: Record<string, unknown>): string {
  if (w === "surface-terrestrial") return str(result.terrestrial, str(result.label));
  if (w === "surface-ice") return str(result.ice, str(result.label));
  return str(result.encounter, str(result.reaction ? `Ship reaction: ${str(result.label)}` : str(result.label)));
}

export const encounterCheck: Procedure = {
  id: "alien.encounter.check",
  name: "Encounter check",
  description: "Roll on the encounter table for the party's current location, shifted by time elapsed.",
  page: [252, 257],
  inputs: {
    type: "object",
    properties: {
      where: { type: "string", enum: Object.keys(WHERE_TABLES), default: "star-system" },
      timeElapsed: { type: "integer", minimum: 0, default: 0, description: "Weeks in a system or days on a surface; each unit shifts the tens digit." },
    },
  },
  steps: [
    {
      id: "encounter",
      title: "Encounter",
      table: (ctx) => WHERE_TABLES[where(ctx)] ?? "alien.encounters.star-system",
      after: (ctx, result) => {
        const w = where(ctx);
        const r = result !== null && typeof result === "object" ? (result as Record<string, unknown>) : { label: String(result) };
        return { ...r, where: w, description: describe(w, r) };
      },
    },
  ],
  produce: (ctx) => {
    const w = where(ctx);
    const e = obj(ctx, "encounter");
    const description = str(e.description, str(e.label));
    return {
      entities: [
        {
          tempId: "encounter",
          type: "alien.encounter",
          name: description,
          summary: `${w} encounter`,
          tags: ["encounter", w],
          fields: {
            where: w,
            table: WHERE_TABLES[w],
            timeElapsed: num(input(ctx, "timeElapsed")),
            label: str(e.label),
            description,
            ...(e.reaction !== undefined ? { reaction: e.reaction } : {}),
            resolved: false,
          },
        },
      ],
      relationships: [],
    };
  },
};
