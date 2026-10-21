/**
 * Spells, focus spells and rituals. Spells are split into lists by rank so
 * each part file stays small; every item carries its rank, traditions,
 * traits, cast time (action glyphs), range, area, targets, defense, duration
 * and the full text (heightened entries included).
 */
import type { ReferenceList } from "@campaign-forge/module-sdk";
import { cite, id } from "../ids.ts";
import { castTime, firstSentence, line, md, ordinal, traitsLine, uniqueIds, usable, type Ctx } from "./common.ts";
import { num, obj, str, strs, type Entry } from "./read.ts";

export interface SpellItem {
  id: string;
  name: string;
  rank: number;
  cantrip: boolean;
  kind: "spell" | "focus" | "ritual";
  [key: string]: unknown;
}

function defenseText(v: unknown): string {
  const d = obj(v);
  const save = obj(d.save);
  if (str(save.statistic)) return `${save.basic === true ? "basic " : ""}${str(save.statistic).replace(/^./, (c) => c.toUpperCase())}`;
  const passive = obj(d.passive);
  if (str(passive.statistic)) return str(passive.statistic) === "ac" ? "AC" : `${str(passive.statistic).replace(/-dc$/, "")} DC`;
  return "";
}

function areaText(v: unknown): string {
  const a = obj(v);
  if (!str(a.type)) return "";
  return `${num(a.value)}-foot ${str(a.type)}${str(a.details) ? ` (${str(a.details)})` : ""}`;
}

export function convertSpells(entries: Entry[], ctx: Ctx): SpellItem[] {
  const ids = uniqueIds();
  return entries
    .filter((e) => usable(ctx, e))
    .map((e) => {
      const s = e.system;
      const traits = strs(obj(s.traits).value);
      const cantrip = traits.includes("cantrip");
      const kind: SpellItem["kind"] = e.file.startsWith("spells/rituals/") || obj(s.ritual).primary ? "ritual" : e.file.startsWith("spells/focus/") || traits.includes("focus") ? "focus" : "spell";
      const rank = num(obj(s.level).value, 1);
      const duration = obj(s.duration);
      const ritual = obj(s.ritual);
      const description = md(ctx, obj(s.description).value);
      const item: SpellItem = {
        id: "",
        name: e.name,
        rank,
        cantrip,
        kind,
        rankText: cantrip ? `Cantrip ${rank}` : kind === "focus" ? `Focus ${rank}` : kind === "ritual" ? `Ritual ${rank}` : `${ordinal(rank)} rank`,
        traditions: strs(obj(s.traits).traditions).join(", "),
        traits: traitsLine(s),
        cast: castTime(str(obj(s.time).value)),
      };
      const optional: Record<string, string> = {
        cost: line(ctx, obj(s.cost).value),
        requirements: line(ctx, s.requirements),
        range: line(ctx, obj(s.range).value),
        area: areaText(s.area),
        targets: line(ctx, obj(s.target).value),
        defense: defenseText(s.defense),
        duration: [duration.sustained === true ? "sustained" : "", line(ctx, duration.value)].filter(Boolean).join(" up to ").replace(/^sustained up to $/, "sustained"),
        primaryCheck: line(ctx, obj(ritual.primary).check),
        secondaryCasters: obj(ritual.secondary).casters !== undefined ? String(num(obj(ritual.secondary).casters)) : "",
        secondaryChecks: line(ctx, obj(ritual.secondary).checks),
      };
      for (const [k, v] of Object.entries(optional)) if (v) item[k] = v;
      item.summary = firstSentence(description);
      item.description = description;
      item.cite = cite(e.book, kind === "ritual" ? "Rituals" : kind === "focus" ? "Focus Spells" : "Spells", e.name);
      return item;
    })
    .sort((a, b) => Number(b.cantrip) - Number(a.cantrip) || a.rank - b.rank || a.name.localeCompare(b.name))
    .map((it) => ({ ...it, id: ids(it.name) }));
}

/** Spell lists: cantrips and ranks split in bands, focus spells, rituals. */
export function spellLists(items: SpellItem[]): ReferenceList[] {
  const strip = ({ cantrip: _c, kind: _k, ...rest }: SpellItem) => rest;
  const columns = ["rankText", "traditions", "cast", "defense", "summary"];
  const make = (listId: string, name: string, section: string, picked: SpellItem[]): ReferenceList => ({ id: id(listId), name, cite: cite("Player Core", section), columns, items: picked.map(strip) });
  const spells = items.filter((s) => s.kind === "spell");
  return [
    make("spells.cantrips", "Spells: cantrips", "Spells", spells.filter((s) => s.cantrip)),
    make("spells.rank-1-2", "Spells: ranks 1–2", "Spells", spells.filter((s) => !s.cantrip && s.rank <= 2)),
    make("spells.rank-3-4", "Spells: ranks 3–4", "Spells", spells.filter((s) => !s.cantrip && s.rank >= 3 && s.rank <= 4)),
    make("spells.rank-5-6", "Spells: ranks 5–6", "Spells", spells.filter((s) => !s.cantrip && s.rank >= 5 && s.rank <= 6)),
    make("spells.rank-7-10", "Spells: ranks 7–10", "Spells", spells.filter((s) => !s.cantrip && s.rank >= 7)),
    make("spells.focus", "Focus spells", "Focus Spells", items.filter((s) => s.kind === "focus")),
    make("spells.rituals", "Rituals", "Rituals", items.filter((s) => s.kind === "ritual")),
  ].filter((l) => l.items.length > 0);
}
