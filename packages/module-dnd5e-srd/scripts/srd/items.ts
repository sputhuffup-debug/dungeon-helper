/** SRD equipment (5e-SRD-Equipment.json) and magic items (5e-SRD-Magic-Items.json) as reference lists. */
import type { ReferenceList } from "@campaign-forge/module-sdk";
import { cite, LIST } from "../ids.ts";
import { cost, diceText, num, obj, objs, refName, str, text, index, type Raw } from "./read.ts";

const category = (e: Raw) => str(obj(e.equipment_category).index);

function weight(e: Raw): string {
  const w = num(e.weight, NaN);
  return Number.isFinite(w) && w > 0 ? `${w} lb.` : "—";
}

function damage(d: unknown): string {
  const o = obj(d);
  const dice = str(o.damage_dice);
  return dice ? `${diceText(dice)} ${refName(o.damage_type).toLowerCase()}`.trim() : "";
}

export function convertEquipment(raw: Raw[]): ReferenceList[] {
  const weapons = raw.filter((e) => category(e) === "weapon");
  const armor = raw.filter((e) => category(e) === "armor");
  const gear = raw.filter((e) => category(e) === "adventuring-gear");
  const tools = raw.filter((e) => category(e) === "tools");
  const mounts = raw.filter((e) => category(e) === "mounts-and-vehicles");
  const known = new Set([...weapons, ...armor, ...gear, ...tools, ...mounts]);
  const left = raw.filter((e) => !known.has(e));
  if (left.length) throw new Error(`equipment in unexpected categories: ${left.map((e) => str(e.name)).join(", ")}`);

  const base = (e: Raw) => ({ id: index(e.index), name: str(e.name) });
  const describe = (e: Raw) => {
    const d = text(e.desc) || text(e.special);
    return d ? { description: d } : {};
  };
  return [
    {
      id: LIST.weapons,
      name: "Weapons",
      cite: cite("Equipment", "Weapons"),
      columns: ["category", "cost", "damage", "weight", "properties"],
      items: weapons.map((e) => {
        const range = obj(e.range);
        const thrown = obj(e.throw_range);
        const ranged = str(e.weapon_range) === "Ranged" && num(range.long, 0) > 0;
        const props = objs(e.properties).map((p) => {
          const n = refName(p);
          if (n === "Versatile") return `versatile (${diceText(str(obj(e.two_handed_damage).damage_dice))})`;
          if (n === "Thrown" && Object.keys(thrown).length) return `thrown (range ${num(thrown.normal)}/${num(thrown.long)})`;
          if (n === "Ammunition" && ranged) return `ammunition (range ${num(range.normal)}/${num(range.long)})`;
          return n.toLowerCase();
        });
        return {
          ...base(e),
          summary: `${str(e.category_range)} weapon`,
          category: str(e.category_range),
          cost: cost(e.cost),
          damage: damage(e.damage) || "—",
          weight: weight(e),
          properties: props.length ? props.join(", ") : "—",
          ...describe(e),
        };
      }),
    },
    {
      id: LIST.armor,
      name: "Armor",
      cite: cite("Equipment", "Armor"),
      columns: ["category", "cost", "armorClass", "strength", "stealth", "weight"],
      items: armor.map((e) => {
        const ac = obj(e.armor_class);
        const baseAc = num(ac.base);
        const dex = ac.dex_bonus === true;
        const max = num(ac.max_bonus, NaN);
        const armorClass = str(e.armor_category) === "Shield" ? `+${baseAc}` : dex ? `${baseAc} + Dex modifier${Number.isFinite(max) ? ` (max ${max})` : ""}` : String(baseAc);
        const strMin = num(e.str_minimum);
        return {
          ...base(e),
          summary: `${str(e.armor_category)} armor`,
          category: str(e.armor_category),
          cost: cost(e.cost),
          armorClass,
          strength: strMin > 0 ? `Str ${strMin}` : "—",
          stealth: e.stealth_disadvantage === true ? "Disadvantage" : "—",
          weight: weight(e),
        };
      }),
    },
    {
      id: LIST.gear,
      name: "Adventuring gear",
      cite: cite("Equipment", "Adventuring Gear"),
      columns: ["category", "cost", "weight"],
      items: gear.map((e) => {
        const contents = objs(e.contents).map((c) => `${num(c.quantity, 1) > 1 ? `${num(c.quantity)} × ` : ""}${refName(c.item)}`);
        return {
          ...base(e),
          category: refName(e.gear_category),
          cost: cost(e.cost),
          weight: weight(e),
          ...describe(e),
          ...(contents.length ? { contents: contents.join(", ") } : {}),
        };
      }),
    },
    {
      id: LIST.tools,
      name: "Tools",
      cite: cite("Equipment", "Tools"),
      columns: ["category", "cost", "weight"],
      items: tools.map((e) => ({ ...base(e), category: str(e.tool_category), cost: cost(e.cost), weight: weight(e), ...describe(e) })),
    },
    {
      id: LIST.mounts,
      name: "Mounts and vehicles",
      cite: cite("Equipment", "Mounts and Vehicles"),
      columns: ["category", "cost", "speed", "capacity"],
      items: mounts.map((e) => {
        const speed = obj(e.speed);
        return {
          ...base(e),
          category: str(e.vehicle_category),
          cost: cost(e.cost),
          speed: Object.keys(speed).length ? `${num(speed.quantity)} ${str(speed.unit)}` : "—",
          capacity: str(e.capacity) || "—",
          weight: weight(e),
          ...describe(e),
        };
      }),
    },
  ];
}

export function convertMagicItems(raw: Raw[]): ReferenceList {
  return {
    id: LIST.magicItems,
    name: "Magic items",
    cite: cite("Magic Items"),
    columns: ["category", "rarity", "attunement"],
    items: raw.map((m) => {
      const paragraphs = Array.isArray(m.desc) ? m.desc : [];
      // The first line is the item's type, rarity and attunement ("Wondrous item, rare (requires attunement)").
      const head = str(paragraphs[0]);
      const attune = /\(requires attunement([^)]*)\)/i.exec(head);
      return {
        id: index(m.index),
        name: str(m.name),
        summary: head,
        category: refName(m.equipment_category),
        rarity: str(obj(m.rarity).name),
        attunement: attune ? `Yes${attune[1] ? ` (${attune[1].trim()})` : ""}` : "No",
        description: text(paragraphs.slice(1)),
        ...(objs(m.variants).length ? { variants: objs(m.variants).map((v) => refName(v)).join(", ") } : {}),
      };
    }),
  };
}
