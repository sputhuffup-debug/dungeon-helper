/**
 * Main World Creation (p. 236-242), in the book's order: size, atmosphere,
 * temperature, geosphere, one terrain feature, then (colonized worlds only)
 * colony size with population and number of missions, the missions, D3
 * factions, orbital components, allegiance and an optional campaign hook.
 * An uninhabited body skips the colony tables and rolls D3−1 moons instead of
 * orbital components (p. 240).
 *
 * Inputs used by the star system generator (p. 243): `planetType: "ice"`
 * (size −2, temperature set to frozen, ice planet terrain table) and
 * `gasGiantMoon: true` (size −4). Those bodies pass `inhabited: false`.
 *
 * Produces one planet, one colony when inhabited (within the planet) and one
 * faction per faction roll, each `stationed_at` the colony.
 */
import { rollDice, type Procedure, type ProcedureContext, type ProducedEntity, type ProducedRelationship } from "@campaign-forge/module-sdk";
import { PLANET_NAMES } from "../tables/world";
import { bool, input, isObj, list, num, obj, str } from "./helpers";

export type PlanetType = "terrestrial" | "ice";

/** World input `allegianceBloc` -> colony allegiance id and the allegiance table to roll. */
const BLOCS: Record<string, { allegiance: string; table?: string; government: string }> = {
  "american-arm": { allegiance: "uas", table: "alien.world.allegiance-arms", government: "United Americas" },
  "anglo-japanese-arm": { allegiance: "3we", table: "alien.world.allegiance-arms", government: "Three World Empire" },
  icsc: { allegiance: "icsc", table: "alien.world.allegiance-icsc", government: "ICSC" },
  upp: { allegiance: "upp", government: "Union of Progressive Peoples" },
};

function bloc(ctx: ProcedureContext): { allegiance: string; table?: string; government: string } {
  return BLOCS[str(input(ctx, "allegianceBloc"), "american-arm")] ?? BLOCS["american-arm"]!;
}

function planetType(ctx: ProcedureContext): PlanetType {
  return input<string>(ctx, "planetType") === "ice" ? "ice" : "terrestrial";
}

/** A main world is colonized unless the input says otherwise (bodies from the system generator are not). */
function inhabited(ctx: ProcedureContext): boolean {
  const v = input<unknown>(ctx, "inhabited");
  return typeof v === "boolean" ? v : true;
}

/** Orbital component labels; "D3 moons" becomes "N moons", "Roll D6 times" expands to its extra rolls. */
function orbitalList(ctx: ProcedureContext): string[] {
  if (!inhabited(ctx)) {
    const n = num(obj(ctx, "moons").moons);
    return n > 0 ? [n === 1 ? "1 moon" : `${n} moons`] : [];
  }
  const describe = (o: Record<string, unknown>): string[] => {
    const comp = str(o.component);
    if (comp === "" || comp === "none" || comp === "more") return [];
    if (comp === "multiple") return (Array.isArray(o.extra) ? o.extra : []).filter(isObj).flatMap(describe);
    if (comp === "moons") {
      const n = isObj(o.moons) ? num(o.moons.moons, 1) : 1;
      return [n === 1 ? "1 moon" : `${n} moons`];
    }
    return [str(o.label, comp)];
  };
  return describe(obj(ctx, "orbital"));
}

export const worldCreate: Procedure = {
  id: "alien.world.create",
  name: "Main World Creation",
  description: "Size, atmosphere, temperature, geosphere and terrain, then colony size, population, missions, factions, orbital components, allegiance and a campaign hook.",
  page: [236, 242],
  inputs: {
    type: "object",
    properties: {
      region: { type: "string", enum: ["core", "outer-veil", "outer-rim", "frontier", "far-reach"], default: "frontier" },
      allegianceBloc: {
        type: "string",
        enum: ["american-arm", "anglo-japanese-arm", "icsc", "upp"],
        default: "american-arm",
        description: "Where the colony lies: decides the allegiance table (p. 241). UPP colonies always owe allegiance to the UPP.",
      },
      inhabited: { type: "boolean", default: true, description: "A colonized main world. Off for unexplored bodies, which skip the colony tables (p. 240)." },
      planetType: { type: "string", enum: ["terrestrial", "ice"], default: "terrestrial", description: "Ice planets (star system generator, p. 243): size −2, always frozen, ice terrain table." },
      gasGiantMoon: { type: "boolean", description: "A moon of a gas giant: size −4 (p. 237)." },
      name: { type: "string", description: "Planet name; when absent, inhabited worlds take a suggested name (p. 236) and others an LV designation." },
    },
  },
  steps: [
    {
      id: "designation",
      title: "Name or designation",
      page: 236,
      compute: (ctx, rng) => {
        const given = input<string>(ctx, "name");
        if (typeof given === "string" && given.trim() !== "") return given.trim();
        if (inhabited(ctx)) return PLANET_NAMES[rng.int(0, PLANET_NAMES.length - 1)] ?? "Hannibal";
        return `LV-${rng.int(100, 999)}`;
      },
    },
    { id: "size", title: "Planet size", table: "alien.world.size", page: 237 },
    { id: "atmosphere", title: "Atmosphere", table: "alien.world.atmosphere", reads: ["size"], page: 238 },
    { id: "temperature", title: "Temperature", table: "alien.world.temperature", reads: ["atmosphere"], page: 238 },
    {
      id: "geosphere",
      title: "Geosphere",
      table: "alien.world.geosphere",
      reads: ["atmosphere", "temperature"],
      page: 239,
      // No atmosphere at all (a GM pin) means a desert world.
      after: (ctx, result) =>
        str(obj(ctx, "atmosphere").atmosphere) === "none" ? { label: "Desert World", geosphere: "desert", description: "No surface water." } : result,
    },
    {
      id: "terrain",
      title: "Terrain",
      page: 239,
      table: (ctx) => (planetType(ctx) === "ice" ? "alien.world.terrain-ice" : "alien.world.terrain"),
    },
    {
      id: "colonySize",
      title: "Colony size",
      table: "alien.world.colony-size",
      reads: ["size", "atmosphere"],
      skipIf: (ctx) => !inhabited(ctx),
      page: 240,
    },
    {
      id: "population",
      title: "Population",
      reads: ["colonySize"],
      skipIf: (ctx) => !inhabited(ctx),
      page: 240,
      compute: (ctx, rng) => {
        const c = obj(ctx, "colonySize");
        return rollDice(str(c.populationDice, "3d6"), rng).total * num(c.populationMultiplier, 10);
      },
    },
    {
      id: "missionCount",
      title: "Number of missions",
      reads: ["colonySize"],
      skipIf: (ctx) => !inhabited(ctx),
      page: 240,
      compute: (ctx, rng) => {
        const expr = str(obj(ctx, "colonySize").missionsDice, "1");
        return Math.max(0, /^\d+$/.test(expr) ? Number(expr) : rollDice(expr, rng).total);
      },
    },
    {
      id: "missions",
      title: "Colony missions",
      table: "alien.world.colony-mission",
      reads: ["atmosphere", "colonySize", "missionCount"],
      skipIf: (ctx) => !inhabited(ctx),
      repeat: (ctx) => num(ctx.get("missionCount")),
      page: 240,
    },
    {
      id: "factionCount",
      title: "Number of factions",
      table: "alien.world.faction-count",
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
    {
      id: "orbital",
      title: "Orbital components",
      table: "alien.world.orbital-components",
      reads: ["colonySize"],
      skipIf: (ctx) => !inhabited(ctx),
      page: 240,
    },
    {
      id: "moons",
      title: "Moons (D3−1)",
      table: "alien.world.moons-uninhabited",
      skipIf: (ctx) => inhabited(ctx),
      page: 240,
    },
    {
      id: "allegiance",
      title: "Colony allegiance",
      table: (ctx) => bloc(ctx).table ?? "alien.world.allegiance-arms",
      skipIf: (ctx) => !inhabited(ctx) || bloc(ctx).table === undefined,
      page: 241,
    },
    { id: "hook", title: "Campaign hook", table: "alien.world.campaign-hook", optional: true, skipIf: (ctx) => !inhabited(ctx), page: 242 },
  ],
  produce: (ctx) => {
    const name = str(ctx.get("designation"), "Unnamed world");
    const size = obj(ctx, "size");
    const type = planetType(ctx);
    const isInhabited = inhabited(ctx);
    const colonySize = obj(ctx, "colonySize");
    const b = bloc(ctx);
    const alleg = obj(ctx, "allegiance");
    const affType = str(alleg.affiliationType);
    const allegiance = affType === "independent" ? "independent" : b.allegiance;
    const affiliation = b.table === undefined ? b.government : affType === "government" ? b.government : str(alleg.affiliation, b.government);
    const missions = list(ctx, "missions").map((m) => str(m.label, str(m.mission)));
    const factionRows = list(ctx, "factions");
    const population = isInhabited ? num(ctx.get("population")) : 0;
    const colonyName = `${name} colony`;
    const atmo = str(obj(ctx, "atmosphere").atmosphere);
    const temp = str(obj(ctx, "temperature").temperature);

    const planet: ProducedEntity = {
      tempId: "planet",
      type: "alien.location",
      name,
      summary: `${type === "ice" ? "Ice" : "Terrestrial"} ${bool(input(ctx, "gasGiantMoon")) ? "moon" : "world"}, ${str(size.label)}, ${atmo || "unknown"} atmosphere, ${temp || "unknown"}`,
      tags: ["planet", type, ...(bool(input(ctx, "gasGiantMoon")) ? ["moon"] : [])],
      fields: {
        subtype: "planet",
        planetType: type,
        diameterKm: num(size.diameterKm),
        gravity: str(size.gravity),
        atmosphere: atmo,
        temperature: temp,
        geosphere: str(obj(ctx, "geosphere").geosphere),
        terrain: str(obj(ctx, "terrain").terrain),
        inhabited: isInhabited,
        population,
        orbitalComponents: orbitalList(ctx),
        ...(isInhabited ? { affiliation, allegiance } : {}),
        region: str(input(ctx, "region"), "frontier"),
        colonies: isInhabited ? [colonyName] : [],
      },
    };
    const entities: ProducedEntity[] = [planet];
    const relationships: ProducedRelationship[] = [];
    if (isInhabited) {
      const factions = factionRows.map((f) => ({ type: str(f.factionType, "other"), name: `${str(f.label, "Faction")} (${name})` }));
      const hook = str(obj(ctx, "hook").hook);
      entities.push({
        tempId: "colony",
        type: "alien.location",
        name: colonyName,
        within: "planet",
        summary: `${str(colonySize.label)} colony of ${population.toLocaleString("en-US")}${missions.length > 0 ? `; ${missions.join(", ")}` : ""}`,
        tags: ["colony"],
        fields: {
          subtype: "colony",
          colonySize: str(colonySize.colonySize),
          population,
          missions,
          factions,
          allegiance,
          affiliation,
          region: str(input(ctx, "region"), "frontier"),
          ...(hook ? { campaignHook: hook } : {}),
        },
      });
      factions.forEach((f, i) => {
        const tempId = `faction-${i + 1}`;
        entities.push({
          tempId,
          type: "alien.faction",
          name: f.name,
          summary: `${str(factionRows[i]?.label)} at ${colonyName}`,
          fields: { factionType: f.type, allegiance, minor: true, reputation: 0, locations: colonyName },
        });
        relationships.push({ type: "stationed_at", from: tempId, to: "colony" });
      });
    }
    return { entities, relationships };
  },
};
