/**
 * Main World Creation (p. 237-242). Step ids match the `var` paths the world
 * tables read (`size.diameterKm`, `atmosphere.atmosphere`, ...). Colony steps
 * are skipped for uninhabited worlds. Produces one planet, one colony when
 * inhabited (within the planet) and one faction per faction roll, each
 * `stationed_at` the colony.
 */
import type { Procedure, ProcedureContext, ProducedEntity, ProducedRelationship } from "@campaign-forge/module-sdk";
import { bool, input, isObj, list, num, obj, str } from "./helpers";

export type PlanetType = "terrestrial" | "ice" | "gas-giant";

function planetType(ctx: ProcedureContext): PlanetType {
  const forced = input<string>(ctx, "planetType");
  if (forced === "terrestrial" || forced === "ice" || forced === "gas-giant") return forced;
  if (bool(obj(ctx, "size").gasGiant)) return "gas-giant";
  return str(obj(ctx, "temperature").temperature) === "frozen" ? "ice" : "terrestrial";
}

function inhabited(ctx: ProcedureContext): boolean {
  return bool(ctx.get("inhabited"), false);
}

const FACTION_NAMES: Record<string, string> = {
  government: "Colonial Administration",
  corporation: "Corporate office",
  military: "Garrison",
  colonial: "Workers' union",
  other: "Local group",
};

function orbitalList(ctx: ProcedureContext): string[] {
  const o = obj(ctx, "orbital");
  const comp = str(o.component);
  if (comp === "multiple") {
    const extra = Array.isArray(o.extra) ? o.extra : [];
    return extra.filter(isObj).map((e) => str(e.component)).filter((c) => c !== "" && c !== "none");
  }
  return comp === "" || comp === "none" ? [] : [comp];
}

export const worldCreate: Procedure = {
  id: "alien.world.create",
  name: "Main World Creation",
  description: "Size, atmosphere, temperature, geosphere and terrain, then colony size, missions, factions, orbital components, allegiance and a campaign hook.",
  page: [237, 242],
  inputs: {
    type: "object",
    properties: {
      region: { type: "string", enum: ["core", "outer-veil", "outer-rim", "frontier", "far-reach"], default: "frontier" },
      allegianceBloc: { type: "string", enum: ["arms", "icsc", "upp"], default: "arms" },
      inhabited: { type: "boolean", description: "Override; when absent the `inhabited` step decides from size and atmosphere." },
      planetType: { type: "string", enum: ["terrestrial", "ice", "gas-giant"], description: "Override; when absent decided by size and temperature." },
      name: { type: "string", description: "Planet designation; generated when absent." },
    },
  },
  steps: [
    { id: "size", title: "Planet size", table: "alien.world.size", page: 237 },
    { id: "atmosphere", title: "Atmosphere", table: "alien.world.atmosphere", reads: ["size"], page: 238 },
    { id: "temperature", title: "Temperature", table: "alien.world.temperature", reads: ["atmosphere"], page: 238 },
    { id: "geosphere", title: "Geosphere", table: "alien.world.geosphere", reads: ["atmosphere", "temperature"], page: 238 },
    {
      id: "inhabited",
      title: "Inhabited?",
      reads: ["size", "atmosphere"],
      compute: (ctx) => {
        const forced = input<unknown>(ctx, "inhabited");
        if (typeof forced === "boolean") return forced;
        if (planetType(ctx) === "gas-giant") return false;
        const atmo = str(obj(ctx, "atmosphere").atmosphere);
        return !bool(obj(ctx, "size").uninhabitable) && atmo !== "corrosive" && atmo !== "infiltrating";
      },
    },
    {
      id: "designation",
      title: "Designation",
      compute: (ctx, rng) => {
        const given = input<string>(ctx, "name");
        if (typeof given === "string" && given.trim() !== "") return given.trim();
        return `LV-${rng.int(100, 999)}`;
      },
    },
    {
      id: "terrain",
      title: "Terrain",
      page: 239,
      table: (ctx) => (planetType(ctx) === "ice" ? "alien.world.terrain-ice" : "alien.world.terrain"),
      reads: ["temperature"],
      skipIf: (ctx) => planetType(ctx) === "gas-giant",
    },
    {
      id: "colonySize",
      title: "Colony size",
      table: "alien.world.colony-size",
      reads: ["atmosphere", "size", "inhabited"],
      skipIf: (ctx) => !inhabited(ctx),
      page: 240,
    },
    {
      id: "missions",
      title: "Colony missions",
      table: "alien.world.colony-mission",
      reads: ["atmosphere", "colonySize"],
      skipIf: (ctx) => !inhabited(ctx),
      repeat: (ctx) => Math.max(1, num(obj(ctx, "colonySize").missionCount, 1)),
      page: 240,
    },
    {
      id: "factionCount",
      title: "Number of factions",
      table: "alien.world.faction-count",
      reads: ["inhabited"],
      skipIf: (ctx) => !inhabited(ctx),
      page: 241,
    },
    {
      id: "factions",
      title: "Factions",
      table: "alien.world.faction-type",
      reads: ["factionCount"],
      skipIf: (ctx) => !inhabited(ctx),
      repeat: (ctx) => num(obj(ctx, "factionCount").count, 1),
      page: 241,
    },
    { id: "orbital", title: "Orbital components", table: "alien.world.orbital-components", reads: ["colonySize"], page: 241 },
    {
      id: "allegiance",
      title: "Allegiance",
      table: (ctx) => (input<string>(ctx, "allegianceBloc") === "icsc" ? "alien.world.allegiance-icsc" : "alien.world.allegiance-arms"),
      reads: ["inhabited"],
      skipIf: (ctx) => !inhabited(ctx) || input<string>(ctx, "allegianceBloc") === "upp",
      page: 242,
    },
    { id: "hook", title: "Campaign hook", table: "alien.world.campaign-hook", optional: true, reads: ["inhabited"], skipIf: (ctx) => !inhabited(ctx), page: 242 },
  ],
  produce: (ctx) => {
    const name = str(ctx.get("designation"), "Unnamed world");
    const size = obj(ctx, "size");
    const type = planetType(ctx);
    const isInhabited = inhabited(ctx);
    const colonySize = obj(ctx, "colonySize");
    const allegiance = input<string>(ctx, "allegianceBloc") === "upp" ? "upp" : str(obj(ctx, "allegiance").allegiance, "unknown");
    const missions = list(ctx, "missions").map((m) => str(m.mission, str(m.label)));
    const factionRows = list(ctx, "factions");
    const colonyName = `${name} colony`;

    const planet: ProducedEntity = {
      tempId: "planet",
      type: "alien.location",
      name,
      summary: `${type} world, ${str(obj(ctx, "atmosphere").atmosphere, "unknown")} atmosphere, ${str(obj(ctx, "temperature").temperature, "unknown")}`,
      tags: ["planet", type],
      fields: {
        subtype: "planet",
        planetType: type,
        diameterKm: num(size.diameterKm),
        gravity: str(size.gravity),
        atmosphere: str(obj(ctx, "atmosphere").atmosphere),
        temperature: str(obj(ctx, "temperature").temperature),
        geosphere: str(obj(ctx, "geosphere").geosphere),
        terrain: str(obj(ctx, "terrain").terrain),
        inhabited: isInhabited,
        population: isInhabited ? str(colonySize.population) : 0,
        orbitalComponents: orbitalList(ctx),
        affiliation: isInhabited ? allegiance : "unknown",
        region: str(input(ctx, "region"), "frontier"),
        colonies: isInhabited ? [colonyName] : [],
      },
    };
    const entities: ProducedEntity[] = [planet];
    const relationships: ProducedRelationship[] = [];
    if (isInhabited) {
      const factions = factionRows.map((f, i) => ({ type: str(f.factionType, "other"), name: `${FACTION_NAMES[str(f.factionType)] ?? str(f.label)} (${name})`, index: i }));
      entities.push({
        tempId: "colony",
        type: "alien.location",
        name: colonyName,
        within: "planet",
        summary: `${str(colonySize.colonySize)} colony; ${missions.join(", ")}`,
        tags: ["colony"],
        fields: {
          subtype: "colony",
          colonySize: str(colonySize.colonySize),
          population: str(colonySize.population),
          missions,
          factions: factions.map(({ type: t, name: n }) => ({ type: t, name: n })),
          allegiance,
          campaignHook: str(obj(ctx, "hook").hook) || undefined,
        },
      });
      factions.forEach((f, i) => {
        const tempId = `faction-${i + 1}`;
        entities.push({
          tempId,
          type: "alien.faction",
          name: f.name,
          summary: str(factionRows[i]?.label),
          fields: { factionType: f.type, allegiance, minor: true, reputation: 0, locations: colonyName },
        });
        relationships.push({ type: "stationed_at", from: tempId, to: "colony" });
      });
    }
    return { entities, relationships };
  },
};
