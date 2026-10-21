/**
 * Feats from Player Core and Player Core 2: ancestry feats, general and skill
 * feats, class feats by class (a feat several core classes share is listed
 * under each), and archetype feats.
 */
import type { ReferenceList } from "@campaign-forge/module-sdk";
import { ANCESTRIES, CLASSES, cite, id } from "../ids.ts";
import { actionCost, firstSentence, frequencyText, md, prerequisites, traitsLine, uniqueIds, usable, type Ctx } from "./common.ts";
import { num, obj, str, strs, type Entry } from "./read.ts";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function convertFeats(entries: Entry[], ctx: Ctx): ReferenceList[] {
  const feats = entries
    .filter((e) => usable(ctx, e))
    .sort((a, b) => num(obj(a.system.level).value) - num(obj(b.system.level).value) || a.name.localeCompare(b.name))
    .map((e) => {
      const s = e.system;
      const description = md(ctx, obj(s.description).value);
      const traits = strs(obj(s.traits).value);
      const frequency = frequencyText(s.frequency);
      const prereq = prerequisites(ctx, s);
      return {
        e,
        category: str(s.category),
        traits,
        item: {
          name: e.name,
          level: num(obj(s.level).value, 1),
          actions: actionCost(s),
          traits: traitsLine(s),
          ...(prereq ? { prerequisites: prereq } : {}),
          ...(frequency ? { frequency } : {}),
          summary: firstSentence(description),
          description,
          cite: cite(e.book, "Feats", e.name),
        },
      };
    });

  const lists: ReferenceList[] = [];
  const add = (listId: string, name: string, section: string, picked: typeof feats) => {
    if (picked.length === 0) return;
    const ids = uniqueIds();
    lists.push({
      id: id(listId),
      name,
      cite: cite("Player Core", section),
      columns: ["level", "actions", "traits", "prerequisites", "summary"],
      items: picked.map((f) => ({ id: ids(f.item.name), ...f.item })),
    });
  };

  const placed = new Set<(typeof feats)[number]>();
  add("feats.ancestry", "Ancestry feats", "Ancestry Feats", feats.filter((f) => f.category === "ancestry" && placed.add(f)));
  add("feats.general", "General feats", "General Feats", feats.filter((f) => f.category === "general" && placed.add(f)));
  add("feats.skill", "Skill feats", "Skill Feats", feats.filter((f) => f.category === "skill" && placed.add(f)));
  for (const c of CLASSES) {
    add(`feats.class-${c}`, `Class feats: ${cap(c)}`, `${cap(c)} Feats`, feats.filter((f) => f.category === "class" && f.traits.includes(c)));
  }
  for (const f of feats) if (f.category === "class" && f.traits.some((t) => (CLASSES as readonly string[]).includes(t))) placed.add(f);
  add("feats.archetype", "Archetype feats", "Archetypes", feats.filter((f) => !placed.has(f) && f.category === "class" && placed.add(f)));
  const rest = feats.filter((f) => !placed.has(f));
  if (rest.length) {
    ctx.notes.push(`feats without a list (left out): ${rest.map((f) => `${f.item.name} [${f.category}]`).join(", ")}`);
  }
  // Ancestries without a list entry would be a sign of a source change.
  for (const a of ANCESTRIES) if (!feats.some((f) => f.category === "ancestry" && f.traits.includes(a))) ctx.notes.push(`no ancestry feats found for ${a}`);
  return lists;
}
