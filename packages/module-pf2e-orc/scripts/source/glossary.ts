/**
 * Smaller reference lists: universal and family monster abilities (Monster
 * Core), familiar abilities (Player Core), relic gifts (GM Core) and vehicles
 * (GM Core).
 */
import type { ReferenceList } from "@campaign-forge/module-sdk";
import { cite, LIST } from "../ids.ts";
import { actionCost, firstSentence, frequencyText, line, md, traitsLine, uniqueIds, usable, type Ctx } from "./common.ts";
import { num, obj, objs, str, type Entry } from "./read.ts";

const SIZE: Record<string, string> = { tiny: "Tiny", sm: "Small", med: "Medium", lg: "Large", huge: "Huge", grg: "Gargantuan" };
const words = (s: string) => s.replace(/-/g, " ");

function abilityItems(entries: Entry[], ctx: Ctx, section: string, extra?: (e: Entry) => Record<string, string>) {
  const ids = uniqueIds();
  return entries
    .filter((e) => usable(ctx, e))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => {
      const description = md(ctx, obj(e.system.description).value);
      const frequency = frequencyText(e.system.frequency);
      return {
        id: ids(e.name),
        name: e.name,
        ...(extra ? extra(e) : {}),
        actions: actionCost(e.system),
        traits: traitsLine(e.system),
        ...(frequency ? { frequency } : {}),
        summary: firstSentence(description),
        description,
        cite: cite(e.book, section, e.name),
      };
    });
}

export function convertGlossaries(src: { universal: Entry[]; family: Entry[]; familiar: Entry[]; relic: Entry[]; vehicles: Entry[] }, ctx: Ctx): ReferenceList[] {
  const monster = [
    ...abilityItems(src.universal, ctx, "Universal Monster Abilities", () => ({ group: "Universal" })),
    ...abilityItems(src.family, ctx, "Creature Family Abilities", (e) => ({ group: /^\(([^)]+)\)/.exec(e.name)?.[1] ?? "Family" })),
  ];
  const ids = uniqueIds();
  const vehicles = src.vehicles
    .filter((e) => usable(ctx, e))
    .sort((a, b) => num(obj(obj(a.system.details).level).value) - num(obj(obj(b.system.details).level).value) || a.name.localeCompare(b.name))
    .map((e) => {
      const d = obj(e.system.details);
      const a = obj(e.system.attributes);
      const space = obj(d.space);
      const hp = obj(a.hp);
      const description = md(ctx, d.description);
      return {
        id: ids(e.name),
        name: e.name,
        level: num(obj(d.level).value),
        price: num(d.price) ? `${num(d.price)} gp` : "—",
        size: SIZE[str(obj(obj(e.system.traits).size).value)] ?? "",
        space: `${num(space.long)} feet long, ${num(space.wide)} feet wide, ${num(space.high)} feet high`,
        crew: line(ctx, d.crew),
        passengers: line(ctx, d.passengers),
        pilotingCheck: line(ctx, d.pilotingCheck),
        ac: num(obj(a.ac).value),
        fortitude: num(obj(obj(e.system.saves).fortitude).value),
        hardness: num(a.hardness),
        hp: `${num(hp.max)} (BT ${Math.floor(num(hp.max) / 2)})`,
        immunities: objs(a.immunities)
          .map((x) => words(str(x.type)))
          .join(", "),
        speed: line(ctx, d.speed),
        collision: `${str(obj(a.collisionDamage).value)} (DC ${num(obj(a.collisionDC).value)})`,
        traits: traitsLine(e.system),
        ...(description ? { description } : {}),
        cite: cite(e.book, "Vehicles", e.name),
      };
    });
  return [
    { id: LIST.monsterAbilities, name: "Monster abilities", cite: cite("Monster Core", "Monster Abilities"), columns: ["group", "actions", "traits", "summary"], items: monster },
    { id: LIST.familiarAbilities, name: "Familiar abilities", cite: cite("Player Core", "Familiars"), columns: ["traits", "summary"], items: abilityItems(src.familiar, ctx, "Familiar Abilities") },
    { id: LIST.relicGifts, name: "Relic gifts", cite: cite("GM Core", "Relics"), columns: ["actions", "traits", "summary"], items: abilityItems(src.relic, ctx, "Relic Gifts") },
    { id: LIST.vehicles, name: "Vehicles", cite: cite("GM Core", "Vehicles"), columns: ["level", "price", "size", "speed", "hp"], items: vehicles },
  ];
}
