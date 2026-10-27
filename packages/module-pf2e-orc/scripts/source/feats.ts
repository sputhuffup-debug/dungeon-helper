/**
 * Feats from Player Core and Player Core 2: ancestry feats, general and skill
 * feats, class feats by class (a feat several core classes share is listed
 * under each), and archetype feats.
 */
import type { ReferenceList } from "@campaign-forge/module-sdk";
import { ANCESTRIES, CLASSES, cite, id } from "../ids.ts";
import { compactData, flatReq, prereqData, ruleData } from "./builderData.ts";
import { actionCost, firstSentence, frequencyText, md, prerequisites, traitsLine, uniqueIds, usable, type Ctx } from "./common.ts";
import { arr, num, obj, str, strs, type Entry } from "./read.ts";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A feat list of its own for feats with a trait (mythic feats, say), placed after the class lists and before archetype feats. */
export interface FeatGroup {
  listId: string;
  name: string;
  section: string;
  traits: string[];
}

export interface FeatOptions {
  /** Classes that get a list of class feats each (default: the sixteen core classes). */
  classes?: readonly string[];
  /** Ancestries that should have ancestry feats (a note when one has none). */
  ancestries?: readonly string[];
  /** Extra lists by trait. */
  groups?: readonly FeatGroup[];
  /** The book list-level citations name (default Player Core). */
  book?: string;
  /** Feat names of the module a prerequisite may name besides this conversion's own (the supplement's feats name the core books' feats). */
  knownFeats?: ReadonlySet<string>;
}

export function convertFeats(entries: Entry[], ctx: Ctx, opts: FeatOptions = {}): ReferenceList[] {
  const classes = opts.classes ?? CLASSES;
  const ancestries = opts.ancestries ?? ANCESTRIES;
  const listBook = opts.book ?? "Player Core";
  const usableEntries = entries.filter((e) => usable(ctx, e));
  const featNames = new Set([...usableEntries.map((e) => e.name), ...(opts.knownFeats ?? [])]);
  const feats = usableEntries
    .sort((a, b) => num(obj(a.system.level).value) - num(obj(b.system.level).value) || a.name.localeCompare(b.name))
    .map((e) => {
      const s = e.system;
      const description = md(ctx, obj(s.description).value);
      const traits = strs(obj(s.traits).value);
      const frequency = frequencyText(s.frequency);
      const prereq = prerequisites(ctx, s);
      // what the builder checks: prerequisites it can read, and the traits an ancestry feat is filed under
      const req = flatReq(prereqData(
        arr(obj(s.prerequisites).value).map((p) => str(obj(p).value)),
        featNames,
      ));
      // and what a feat trains or grants outright (Skill Training, a heritage feat's extra skill)
      const rules = ruleData(s.rules, e.name);
      const builder = compactData({
        ...(str(s.category) === "ancestry" ? { traits } : {}),
        ...(req ? { req } : {}),
        ranks: rules.ranks,
        rankChoices: rules.rankChoices,
        anySkill: rules.anySkill,
        senses: rules.senses,
        feats: rules.feats,
        lore: rules.lore,
        featChoices: rules.featChoices,
        hpPerLevel: rules.hpPerLevel,
        // "You can select this feat more than once": the builder lets it be picked again
        repeat: /\b(select|take) this feat more than once\b/i.test(description) ? true : undefined,
      });
      return {
        e,
        category: str(s.category),
        traits,
        builder,
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
          ...(builder ? { builder } : {}),
        },
      };
    });

  const lists: ReferenceList[] = [];
  const add = (listId: string, name: string, section: string, picked: typeof feats, mark?: Record<string, unknown>) => {
    if (picked.length === 0) return;
    const ids = uniqueIds();
    lists.push({
      id: id(listId),
      name,
      cite: cite(listBook, section),
      columns: ["level", "actions", "traits", "prerequisites", "summary"],
      items: picked.map((f) => ({ id: ids(f.item.name), ...f.item, ...(mark ? { builder: { ...f.builder, ...mark } } : {}) })),
    });
  };

  const placed = new Set<(typeof feats)[number]>();
  add("feats.ancestry", "Ancestry feats", "Ancestry Feats", feats.filter((f) => f.category === "ancestry" && placed.add(f)));
  add("feats.general", "General feats", "General Feats", feats.filter((f) => f.category === "general" && placed.add(f)));
  add("feats.skill", "Skill feats", "Skill Feats", feats.filter((f) => f.category === "skill" && placed.add(f)));
  for (const c of classes) {
    add(`feats.class-${c}`, `Class feats: ${cap(c)}`, `${cap(c)} Feats`, feats.filter((f) => f.category === "class" && f.traits.includes(c)));
  }
  for (const f of feats) if (f.category === "class" && f.traits.some((t) => classes.includes(t))) placed.add(f);
  for (const g of opts.groups ?? []) add(g.listId, g.name, g.section, feats.filter((f) => !placed.has(f) && f.traits.some((t) => g.traits.includes(t)) && placed.add(f)));
  // archetype feats can fill class feat slots; the builder files them as archetype feats
  add("feats.archetype", "Archetype feats", "Archetypes", feats.filter((f) => !placed.has(f) && f.category === "class" && placed.add(f)), { archetype: true });
  const rest = feats.filter((f) => !placed.has(f));
  if (rest.length) {
    ctx.notes.push(`feats without a list (left out): ${rest.map((f) => `${f.item.name} [${f.category}]`).join(", ")}`);
  }
  // Ancestries without a list entry would be a sign of a source change.
  for (const a of ancestries) if (!feats.some((f) => f.category === "ancestry" && f.traits.includes(a))) ctx.notes.push(`no ancestry feats found for ${a}`);
  return lists;
}
