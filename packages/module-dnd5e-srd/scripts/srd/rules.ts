/**
 * Rule cards from the SRD's rule chapters (5e-SRD-Rules.json and
 * 5e-SRD-Rule-Sections.json) and conditions, with the text as written (the
 * SRD is CC-BY-4.0): one card per section, split at its `###` headings so a
 * card answers one question at the table. Dice tables found in the SRD text
 * (madness, magic items, spells) become roll tables.
 */
import type { RollTable, RuleCard } from "@campaign-forge/module-sdk";
import { CHARACTER, cite, id, MONSTER, rule } from "../ids.ts";
import { objs, refIndex, slug, str, text, index, type Raw } from "./read.ts";

/** Links from SRD rule cards to the sheet fields and trackers they explain. */
export const RULE_LINKS: Record<string, NonNullable<RuleCard["links"]>> = {
  [rule("ability-scores-and-modifiers")]: { fields: [`${CHARACTER}.abilities.strength`, `${CHARACTER}.strengthMod`] },
  [rule("proficiency-bonus")]: { fields: [`${CHARACTER}.proficiencyBonus`, `${MONSTER}.proficiencyBonus`] },
  [rule("advantage-and-disadvantage")]: { rules: [rule("ability-checks")] },
  [rule("ability-checks")]: { rules: [rule("advantage-and-disadvantage"), rule("ability-checks.skills")] },
  [rule("ability-checks.passive-checks")]: { fields: [`${CHARACTER}.passivePerception`, `${MONSTER}.passivePerception`] },
  [rule("saving-throws")]: { fields: [`${CHARACTER}.saves`] },
  [rule("the-order-of-combat.initiative")]: { trackers: [id("tracker.initiative")], fields: [`${CHARACTER}.initiative`] },
  [rule("damage-and-healing.hit-points")]: { trackers: [id("tracker.hp")], fields: [`${CHARACTER}.hp.max`, `${CHARACTER}.hp.current`] },
  [rule("damage-and-healing.temporary-hit-points")]: { trackers: [id("tracker.temp-hp")], fields: [`${CHARACTER}.hp.temp`] },
  [rule("damage-and-healing.dropping-to-0-hit-points")]: { trackers: [id("tracker.death-saves")], fields: [`${CHARACTER}.deathSaves.successes`, `${CHARACTER}.deathSaves.failures`] },
  [rule("resting.short-rest")]: { trackers: [id("tracker.hit-dice")], fields: [`${CHARACTER}.hitDiceSpent`] },
  [rule("resting.long-rest")]: { trackers: [id("tracker.hit-dice"), id("tracker.spell-slots")] },
  [rule("what-is-a-spell.spell-slots")]: { trackers: [id("tracker.spell-slots")] },
  [rule("casting-a-spell.spell-saving-throws")]: { fields: [`${CHARACTER}.spellSaveDc`] },
  [rule("casting-a-spell.spell-attack-rolls")]: { fields: [`${CHARACTER}.spellAttack`] },
  [rule("conditions.exhaustion")]: { trackers: [id("tracker.exhaustion")], fields: [`${CHARACTER}.exhaustion`] },
  [rule("using-each-ability.strength")]: { fields: [`${CHARACTER}.carryingCapacity`] },
};

interface Chunk {
  title: string;
  body: string;
}

/** Split a section's Markdown at `##`/`###` headings (the first heading is the section's own). */
function chunks(desc: string): { intro: string; parts: Chunk[] } {
  const lines = desc.replace(/\r\n?/g, "\n").split("\n");
  if (lines[0]?.startsWith("## ")) lines.shift();
  const parts: Chunk[] = [];
  const intro: string[] = [];
  let cur: Chunk | undefined;
  for (const line of lines) {
    const h = /^#{2,3} (.+)$/.exec(line);
    if (h) {
      if (cur) parts.push(cur);
      cur = { title: h[1]!.trim(), body: "" };
      continue;
    }
    if (cur) cur.body += `${line}\n`;
    else intro.push(line);
  }
  if (cur) parts.push(cur);
  return { intro: intro.join("\n").trim(), parts: parts.map((p) => ({ title: p.title, body: p.body.trim() })) };
}

export interface RulesConversion {
  rules: RuleCard[];
  tables: RollTable[];
  notes: string[];
}

/** Parse the Markdown dice tables (first column "d100", "d8"...) in a text. */
function diceTables(desc: string): Array<{ heading: string; dice: string; columns: string[]; rows: string[][] }> {
  const out: Array<{ heading: string; dice: string; columns: string[]; rows: string[][] }> = [];
  const lines = desc.replace(/\r\n?/g, "\n").split("\n");
  let heading = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const h = /^#{2,6} (.+)$/.exec(line);
    if (h) heading = h[1]!.trim();
    const cells = (l: string) =>
      l
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((c) => c.trim());
    if (!/^\|\s*\d*d\d+\s*\|/i.test(line)) continue;
    const header = cells(line);
    if (!/^-+:?$|^:?-+:?$/.test(cells(lines[i + 1] ?? "")[0] ?? "")) continue;
    const rows: string[][] = [];
    let j = i + 2;
    for (; j < lines.length && lines[j]!.trim().startsWith("|"); j++) rows.push(cells(lines[j]!));
    out.push({ heading, dice: header[0]!.toLowerCase().replace(/^d/, "1d"), columns: header.slice(1), rows });
    i = j;
  }
  return out;
}

function parseRange(cell: string, faces: number): [number, number] | undefined {
  const norm = (s: string) => {
    const n = Number(s);
    return s === "00" || (n === 0 && faces === 100) ? 100 : n;
  };
  const m = /^(\d+)\s*(?:[-–—]\s*(\d+))?$/.exec(cell.replace(/\*/g, "").trim());
  if (!m) return undefined;
  const a = norm(m[1]!);
  const b = m[2] !== undefined ? norm(m[2]) : a;
  return Number.isFinite(a) && Number.isFinite(b) && a <= b ? [a, b] : undefined;
}

function toTable(t: ReturnType<typeof diceTables>[number], tableId: string, name: string, family: string, citation: string, notes: string[]): RollTable | undefined {
  const faces = Number(/^1d(\d+)$/.exec(t.dice)?.[1]);
  if (!Number.isFinite(faces)) return undefined;
  const rows: RollTable["rows"] = [];
  for (const r of t.rows) {
    const range = parseRange(r[0] ?? "", faces);
    if (!range) {
      notes.push(`table ${tableId}: skipped (row "${r[0]}" is not a range)`);
      return undefined;
    }
    const values = r.slice(1);
    const first = (values[0] ?? "").replace(/\*\*/g, "").trim();
    const label = first.length > 90 ? `${first.slice(0, 87).trimEnd()}…` : first;
    const result: string | Record<string, unknown> =
      values.length <= 1 ? first : Object.fromEntries(t.columns.map((c, k) => [slug(c).replace(/-([a-z0-9])/g, (_, x: string) => x.toUpperCase()) || `column${k + 1}`, (values[k] ?? "").replace(/\*\*/g, "").trim()]));
    rows.push({ range, label, result });
  }
  // Every face must be covered exactly once.
  for (let n = 1; n <= faces; n++) {
    const hits = rows.filter((r) => n >= r.range[0] && n <= r.range[1]).length;
    if (hits !== 1) {
      notes.push(`table ${tableId}: skipped (${hits === 0 ? "no row" : "several rows"} for ${n})`);
      return undefined;
    }
  }
  return { id: tableId, name, family, cite: citation, dice: t.dice, rows };
}

export function convertRules(src: { rules: Raw[]; sections: Raw[]; conditions: Raw[]; magicItems: Raw[]; spells: Raw[] }): RulesConversion {
  const notes: string[] = [];
  const sections = new Map(src.sections.map((s) => [index(s.index), s]));
  const rules: RuleCard[] = [];
  const tables: RollTable[] = [];
  const seenTables = new Set<string>();
  const addTable = (t: RollTable | undefined) => {
    if (!t) return;
    const key = JSON.stringify(t.rows);
    if (seenTables.has(key) || tables.some((x) => x.id === t.id)) return;
    seenTables.add(key);
    tables.push(t);
  };
  const used = new Set<string>();

  for (const chapter of src.rules) {
    const chapterName = str(chapter.name);
    const tag = slug(chapterName);
    for (const ref of objs(chapter.subsections)) {
      const sid = index(refIndex(ref));
      const section = sections.get(sid);
      if (!section) throw new Error(`rule section ${sid} is missing`);
      used.add(sid);
      const sectionName = str(section.name);
      const desc = str(section.desc);
      const { intro, parts } = chunks(desc);
      const sectionId = rule(sid);
      const childIds = parts.map((p) => rule(`${sid}.${slug(p.title)}`));
      if (intro || parts.length === 0) {
        rules.push({ id: sectionId, title: sectionName, summary: intro || desc, cite: cite(chapterName, sectionName), tags: [tag], ...(childIds.length ? { links: { rules: childIds } } : {}) });
      }
      for (const [k, p] of parts.entries()) {
        if (!p.body) continue;
        const cardId = childIds[k]!;
        if (rules.some((r) => r.id === cardId)) throw new Error(`duplicate rule card ${cardId}`);
        rules.push({ id: cardId, title: `${sectionName}: ${p.title}`, summary: p.body, cite: cite(chapterName, `${sectionName}, ${p.title}`), tags: [tag], ...(intro ? { links: { rules: [sectionId] } } : {}) });
      }
      for (const t of diceTables(desc)) {
        const family = sid;
        const sub = t.heading && t.heading !== sectionName ? t.heading : (t.columns[0] ?? "Result");
        const name = sid === "madness" ? sub : `${sectionName}: ${sub}`;
        addTable(toTable(t, id(`${family}.${slug(sub)}`), name, family, cite(chapterName, `${sectionName}, ${t.heading || sectionName}`), notes));
      }
    }
  }
  for (const s of sections.keys()) if (!used.has(s)) notes.push(`rule section ${s} is not in any chapter; left out`);

  for (const c of src.conditions) {
    const cid = index(c.index);
    rules.push({ id: rule(`conditions.${cid}`), title: `Condition: ${str(c.name)}`, summary: text(c.desc), cite: cite("Conditions", str(c.name)), tags: ["conditions"] });
  }

  for (const m of src.magicItems) {
    const desc = Array.isArray(m.desc) ? (m.desc as unknown[]).map((x) => str(x)).join("\n") : str(m.desc);
    for (const t of diceTables(desc)) {
      const name = `${str(m.name)}: ${t.columns[0] ?? "Result"}`;
      addTable(toTable(t, id(`magic-item.${slug(name)}`), name, "magic-item", cite("Magic Items", str(m.name)), notes));
    }
  }
  for (const s of src.spells) {
    const desc = Array.isArray(s.desc) ? (s.desc as unknown[]).map((x) => str(x)).join("\n") : str(s.desc);
    for (const t of diceTables(desc)) {
      const name = `${str(s.name)}: ${t.columns[0] ?? "Result"}`;
      addTable(toTable(t, id(`spell.${slug(name)}`), name, "spell", cite("Spells", str(s.name)), notes));
    }
  }

  for (const r of rules) {
    const links = RULE_LINKS[r.id];
    if (links) r.links = { ...(r.links ?? {}), ...links, ...(links.rules || r.links?.rules ? { rules: [...new Set([...(r.links?.rules ?? []), ...(links.rules ?? [])])] } : {}) };
  }
  for (const key of Object.keys(RULE_LINKS)) if (!rules.some((r) => r.id === key)) notes.push(`RULE_LINKS: no rule card ${key}`);
  // Links to rule cards that were not made (an empty section) are dropped.
  const ids = new Set(rules.map((r) => r.id));
  for (const r of rules) if (r.links?.rules) r.links.rules = r.links.rules.filter((x) => ids.has(x) && x !== r.id);
  return { rules, tables, notes };
}
