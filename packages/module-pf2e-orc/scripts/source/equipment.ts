/**
 * Equipment from Player Core, Player Core 2, GM Core and Monster Core:
 * weapons, armor, shields, runes, consumables, held and worn items,
 * adventuring gear and treasure, with level, Price, Bulk, usage and traits.
 */
import type { ReferenceList } from "@campaign-forge/module-sdk";
import { cite, id } from "../ids.ts";
import { bulkText, bulkValue, firstSentence, md, priceText, traitsLine, uniqueIds, usable, type Ctx } from "./common.ts";
import { num, obj, str, strs, type Entry } from "./read.ts";

const words = (s: string) => s.replace(/-/g, " ");
const DAMAGE: Record<string, string> = { bludgeoning: "B", piercing: "P", slashing: "S" };

function usageText(v: unknown): string {
  const u = str(obj(v).value);
  return u ? words(u).replace(/^held in one plus hands$/, "held in 1+ hands").replace(/^held in one hand$/, "held in 1 hand").replace(/^held in two hands$/, "held in 2 hands") : "";
}

interface Item {
  id: string;
  name: string;
  [key: string]: unknown;
}

export interface EquipmentConversion {
  lists: ReferenceList[];
  /** name → bulk (light = 0.1), for the demo's inventories and tests. */
  bulk: Record<string, number>;
}

export function convertEquipment(entries: Entry[], ctx: Ctx): EquipmentConversion {
  const groups: Record<string, Item[]> = { weapons: [], armor: [], shields: [], runes: [], consumables: [], alchemical: [], items: [], gear: [], treasure: [] };
  const bulk: Record<string, number> = {};
  const usableEntries = entries.filter((e) => usable(ctx, e)).sort((a, b) => num(obj(a.system.level).value) - num(obj(b.system.level).value) || a.name.localeCompare(b.name));
  for (const e of usableEntries) {
    const s = e.system;
    const traits = strs(obj(s.traits).value);
    const description = md(ctx, obj(s.description).value);
    bulk[e.name] = bulkValue(s.bulk);
    const base: Item = {
      id: "",
      name: e.name,
      level: num(obj(s.level).value, 0),
      price: priceText(s.price),
      bulk: bulkText(s.bulk),
      traits: traitsLine(s),
    };
    const usage = usageText(s.usage);
    if (usage) base.usage = usage;
    let group = "items";
    if (e.type === "weapon") {
      group = "weapons";
      const dmg = obj(s.damage);
      Object.assign(base, {
        category: str(s.category),
        group: str(s.group),
        damage: num(dmg.dice) > 0 ? `${num(dmg.dice)}${str(dmg.die)} ${DAMAGE[str(dmg.damageType)] ?? str(dmg.damageType)}` : str(dmg.damageType),
        ...(s.range ? { range: `${num(s.range)} feet` } : {}),
        ...(obj(s.reload).value !== null && obj(s.reload).value !== undefined ? { reload: str(obj(s.reload).value) } : {}),
      });
    } else if (e.type === "armor") {
      group = "armor";
      Object.assign(base, {
        category: str(s.category),
        group: str(s.group),
        acBonus: `+${num(s.acBonus)}`,
        dexCap: s.dexCap === null || s.dexCap === undefined ? "—" : `+${num(s.dexCap)}`,
        strength: num(s.strength) ? `+${num(s.strength)}` : "—",
        checkPenalty: num(s.checkPenalty) ? `−${Math.abs(num(s.checkPenalty))}` : "—",
        speedPenalty: num(s.speedPenalty) ? `−${Math.abs(num(s.speedPenalty))} ft.` : "—",
      });
    } else if (e.type === "shield") {
      group = "shields";
      const hp = obj(s.hp);
      Object.assign(base, {
        acBonus: `+${num(s.acBonus)}`,
        hardness: num(s.hardness),
        hp: `${num(hp.max)} (BT ${Math.floor(num(hp.max) / 2)})`,
        ...(num(s.speedPenalty) ? { speedPenalty: `−${Math.abs(num(s.speedPenalty))} ft.` } : {}),
      });
    } else if (e.type === "treasure") {
      group = "treasure";
      Object.assign(base, { category: words(str(s.category)) || "—" });
    } else if (e.type === "consumable" || e.type === "ammo") {
      group = traits.includes("alchemical") ? "alchemical" : "consumables";
      Object.assign(base, { category: words(str(s.category)) || (e.type === "ammo" ? "ammunition" : "—") });
    } else if (str(obj(s.usage).value).startsWith("etched")) {
      group = "runes";
    } else if (traits.includes("alchemical")) {
      group = "alchemical";
    } else if (!traits.includes("magical") && !traits.includes("invested") && num(obj(s.level).value) === 0) {
      group = "gear";
    }
    base.summary = firstSentence(description);
    base.description = description;
    base.cite = cite(e.book, "Equipment", e.name);
    groups[group]!.push(base);
  }
  const defs: Array<[string, string, string, string[]]> = [
    ["weapons", "Weapons", "Weapons", ["level", "price", "damage", "category", "traits"]],
    ["armor", "Armor", "Armor", ["category", "acBonus", "dexCap", "strength", "price"]],
    ["shields", "Shields", "Shields", ["level", "price", "acBonus", "hardness", "hp"]],
    ["runes", "Runes", "Runes", ["level", "price", "usage", "summary"]],
    ["consumables", "Consumables (magical)", "Consumables", ["level", "price", "category", "summary"]],
    ["alchemical", "Alchemical items", "Alchemical Items", ["level", "price", "bulk", "summary"]],
    ["items", "Held and worn items", "Magic Items", ["level", "price", "usage", "summary"]],
    ["gear", "Adventuring gear", "Adventuring Gear", ["price", "bulk", "summary"]],
    ["treasure", "Treasure", "Treasure", ["level", "price", "category"]],
  ];
  const lists: ReferenceList[] = defs
    .filter(([key]) => groups[key]!.length > 0)
    .map(([key, name, section, columns]) => {
      const ids = uniqueIds();
      return { id: id(`equipment.${key}`), name, cite: cite(key === "gear" || key === "weapons" || key === "armor" || key === "shields" ? "Player Core" : "GM Core", section), columns, items: groups[key]!.map((it) => ({ ...it, id: ids(it.name) })) };
    });
  return { lists, bulk };
}
