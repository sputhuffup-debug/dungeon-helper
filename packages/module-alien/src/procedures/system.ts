/**
 * Star System Generator (p. 243). The star type (from spectral and
 * brightness class, p. 236) modifies one roll per body type: gas giants
 * D6−1, terrestrial planets D6, ice planets D6+1, asteroid belts D6−3. Each
 * gas giant then gets a feature and D6+4 significant moons, each asteroid belt
 * a feature. Produces one star-system location plus a stub planet per
 * terrestrial or ice body (`within` the system); each stub chains into
 * `alien.world.create` as an uninhabited body (stop at colony size; ice
 * planets are frozen).
 *
 * Module decisions: body order (terrestrials, belts, gas giants, ice planets,
 * inner to outer) and names (system designation plus a roman numeral). The
 * book places bodies by temperature and leaves names to the GM.
 */
import { rollDice, type Procedure, type ProcedureContext, type ProducedEntity } from "@campaign-forge/module-sdk";
import { input, isObj, list, num, obj, str } from "./helpers";

interface Body {
  type: "gas-giant" | "terrestrial" | "ice" | "asteroid-belt";
  name: string;
  features?: string[];
  moons?: number;
  planetType?: "terrestrial" | "ice";
}

export type StarType = "giant" | "subgiant" | "main-sequence" | "red-dwarf" | "white-main-sequence" | "white-dwarf";

/** Star type from spectral and brightness class (p. 236). Classes I and II do not occur in charted space; treated as giants. */
export function starTypeOf(starClass: string, brightness: string): StarType {
  if (brightness === "D") return "white-dwarf";
  if (brightness === "IV") return "subgiant";
  if (brightness === "V") return starClass === "M" ? "red-dwarf" : starClass === "A" ? "white-main-sequence" : "main-sequence";
  return "giant";
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX", "XXI"];

function bodies(ctx: ProcedureContext): Body[] {
  const v = ctx.get("bodies");
  return Array.isArray(v) ? (v.filter(isObj) as unknown as Body[]) : [];
}

/** Bodies that can become full worlds, in order. */
export function worldBodies(ctx: ProcedureContext): Body[] {
  return bodies(ctx).filter((b) => b.type === "terrestrial" || b.type === "ice");
}

const count = (ctx: ProcedureContext, step: string): number => Math.max(0, num(obj(ctx, step).count));

/** Most terrestrial (D6) plus ice (D6+1) planets a system can have. */
const MAX_CHAINED_BODIES = 13;

export const systemCreate: Procedure = {
  id: "alien.system.create",
  name: "Star System Generator",
  description: "Roll the number of gas giants, terrestrial planets, ice planets and asteroid belts from the star type, add features and gas giant moons, then detail each terrestrial or ice planet with Main World Creation.",
  page: [236, 243],
  inputs: {
    type: "object",
    properties: {
      starClass: { type: "string", enum: ["O", "B", "A", "F", "G", "K", "M"], default: "G", description: "Spectral class (p. 236)." },
      brightness: { type: "string", enum: ["III", "IV", "V", "D"], default: "V", description: "Brightness class: III giant, IV subgiant, V main sequence, D white dwarf. No class I or II stars in charted space (p. 236)." },
      region: { type: "string", enum: ["core", "outer-veil", "outer-rim", "frontier", "far-reach"], default: "frontier" },
      allegiance: { type: "string", enum: ["uas", "3we", "upp", "icsc", "independent", "unknown"], default: "unknown" },
      name: { type: "string", description: "System designation; generated when absent." },
    },
  },
  steps: [
    {
      id: "designation",
      title: "Designation",
      compute: (ctx, rng) => {
        const given = input<string>(ctx, "name");
        if (typeof given === "string" && given.trim() !== "") return given.trim();
        const letters = "ABCDEFGHJKLMNPRSTUVWXYZ";
        const a = letters[rng.int(0, letters.length - 1)] ?? "A";
        return `${a}${rng.int(10, 99)}-${rng.int(100, 999)}`;
      },
    },
    {
      id: "starType",
      title: "Star type",
      page: 236,
      compute: (ctx) => starTypeOf(str(input(ctx, "starClass"), "G"), str(input(ctx, "brightness"), "V")),
    },
    { id: "gasGiants", title: "Gas giants (D6−1)", table: "alien.system.gas-giants", reads: ["starType"], page: 243 },
    { id: "terrestrialPlanets", title: "Terrestrial planets (D6)", table: "alien.system.terrestrial-planets", reads: ["starType"], page: 243 },
    { id: "icePlanets", title: "Ice planets (D6+1)", table: "alien.system.ice-planets", reads: ["starType"], page: 243 },
    { id: "asteroidBelts", title: "Asteroid belts (D6−3)", table: "alien.system.asteroid-belts", reads: ["starType"], page: 243 },
    {
      id: "gasGiantFeatures",
      title: "Gas giant features",
      table: "alien.system.gas-giant-features",
      reads: ["gasGiants"],
      repeat: (ctx) => count(ctx, "gasGiants"),
      skipIf: (ctx) => count(ctx, "gasGiants") === 0,
      page: 243,
    },
    {
      id: "gasGiantMoons",
      title: "Gas giant moons (D6+4 each)",
      reads: ["gasGiants"],
      repeat: (ctx) => count(ctx, "gasGiants"),
      skipIf: (ctx) => count(ctx, "gasGiants") === 0,
      page: 243,
      compute: (_ctx, rng) => rollDice("1d6+4", rng).total,
    },
    {
      id: "asteroidBeltFeatures",
      title: "Asteroid belt features",
      table: "alien.system.asteroid-belt-features",
      reads: ["asteroidBelts"],
      repeat: (ctx) => count(ctx, "asteroidBelts"),
      skipIf: (ctx) => count(ctx, "asteroidBelts") === 0,
      page: 243,
    },
    {
      id: "bodies",
      title: "Body list",
      reads: ["gasGiants", "terrestrialPlanets", "icePlanets", "asteroidBelts", "gasGiantFeatures", "gasGiantMoons", "asteroidBeltFeatures"],
      compute: (ctx): Body[] => {
        const system = str(ctx.get("designation"), "System");
        const out: Body[] = [];
        const gg = list(ctx, "gasGiantFeatures");
        const ab = list(ctx, "asteroidBeltFeatures");
        const moonsRaw = ctx.get("gasGiantMoons");
        const moons = Array.isArray(moonsRaw) ? moonsRaw : [];
        for (let i = 0; i < count(ctx, "terrestrialPlanets"); i++) out.push({ type: "terrestrial", name: "", planetType: "terrestrial" });
        for (let i = 0; i < count(ctx, "asteroidBelts"); i++) out.push({ type: "asteroid-belt", name: "", features: [str(ab[i]?.label)].filter(Boolean) });
        for (let i = 0; i < count(ctx, "gasGiants"); i++) {
          out.push({ type: "gas-giant", name: "", features: [str(gg[i]?.label)].filter(Boolean), moons: num(moons[i], 5) });
        }
        for (let i = 0; i < count(ctx, "icePlanets"); i++) out.push({ type: "ice", name: "", planetType: "ice" });
        return out.map((b, i) => ({ ...b, name: `${system} ${ROMAN[i] ?? String(i + 1)}` }));
      },
    },
  ],
  produce: (ctx) => {
    const name = str(ctx.get("designation"), "Unnamed system");
    const all = bodies(ctx);
    const region = str(input(ctx, "region"), "frontier");
    const starClass = str(input(ctx, "starClass"), "G");
    const brightness = str(input(ctx, "brightness"), "V");
    const system: ProducedEntity = {
      tempId: "system",
      type: "alien.location",
      name,
      summary: `${starClass}${brightness} star (${str(ctx.get("starType"), "main-sequence").replace(/-/g, " ")}) with ${all.length} bodies`,
      tags: ["star-system"],
      fields: {
        subtype: "star-system",
        starClass,
        brightness,
        region,
        allegiance: str(input(ctx, "allegiance"), "unknown"),
        bodies: all.map((b) => ({ type: b.type, name: b.name, features: b.features ?? [], ...(b.moons !== undefined ? { moons: b.moons } : {}) })),
      },
    };
    const planets: ProducedEntity[] = worldBodies(ctx).map((b, i) => ({
      tempId: `body-${i + 1}`,
      type: "alien.location",
      name: b.name,
      within: "system",
      summary: `${b.type === "ice" ? "Ice" : "Terrestrial"} planet; detail it with Main World Creation`,
      tags: ["planet", b.type, "stub"],
      fields: { subtype: "planet", planetType: b.planetType ?? b.type, inhabited: false, region, orbitalComponents: [] },
    }));
    return { entities: [system, ...planets], relationships: [] };
  },
  chains: Array.from({ length: MAX_CHAINED_BODIES }, (_, i) => ({
    procedure: "alien.world.create",
    label: `Generate body ${i + 1} as a full world`,
    inputs: (ctx: ProcedureContext) => {
      const b = worldBodies(ctx)[i];
      const allegiance = str(input(ctx, "allegiance"));
      return {
        name: b?.name,
        planetType: b?.planetType ?? "terrestrial",
        inhabited: false,
        region: str(input(ctx, "region"), "frontier"),
        allegianceBloc: allegiance === "icsc" ? "icsc" : allegiance === "upp" ? "upp" : allegiance === "3we" ? "anglo-japanese-arm" : "american-arm",
      };
    },
  })),
};
