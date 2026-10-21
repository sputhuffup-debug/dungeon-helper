/**
 * Foundry description HTML to the Markdown subset the app renders safely
 * (paragraphs, headings, bold, italic, lists, pipe tables), with Foundry's
 * inline enrichers turned into the plain text a printed book shows:
 *
 *   @UUID[Compendium.pf2e.actionspf2e.Item.Step]{Steps}   → Steps
 *   @UUID[Compendium.pf2e.conditionitems.Item.Prone]      → prone
 *   @Check[reflex|dc:20|basic]                            → DC 20 basic Reflex
 *   @Damage[(2d6+4)[fire]]                                → 2d6+4 fire
 *   @Template[cone|distance:30]                           → 30-foot cone
 *   [[/r 1d6]]{1d6 damage}, [[/gmr 1d4 #Recharge]]        → 1d6 damage, 1d4
 *   [[/act demoralize]]                                   → Demoralize
 *   @Localize[PF2E.SpecificRule....]                      → the localized rules text
 *
 * Nothing is evaluated: formulas are only rewritten as text. Anything the
 * converter cannot read is dropped and counted in the notes.
 */
import { obj, str, type Raw } from "./read.ts";

export interface TextContext {
  /** Localization strings (static/lang), for @Localize. */
  loc: Raw;
  /** Counters for the conversion notes. */
  notes: Map<string, number>;
  /**
   * Universal monster ability glossary text (`PF2E.NPC.Abilities.Glossary.*`)
   * in a creature: "pointer" writes a reference to the Monster abilities list
   * instead of repeating the text in every stat block.
   */
  glossary?: "inline" | "pointer";
}

export function note(ctx: TextContext, key: string): void {
  ctx.notes.set(key, (ctx.notes.get(key) ?? 0) + 1);
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", times: "×", minus: "−", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const title = (s: string): string => s.replace(/(^|[\s-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());
const words = (slug: string): string => slug.replace(/-/g, " ");

/** Find the `]` that closes the `[` at `open`, counting nested brackets. */
function closeBracket(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "[") depth++;
    else if (s[i] === "]") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** An optional `{label}` right after position `i`. */
function labelAt(s: string, i: number): { label?: string; end: number } {
  if (s[i] !== "{") return { end: i };
  const close = s.indexOf("}", i);
  if (close < 0) return { end: i };
  return { label: s.slice(i + 1, close), end: close + 1 };
}

const ID_LIKE = /^[A-Za-z0-9]{16}$/;

function uuidText(target: string, label: string | undefined, ctx: TextContext): string {
  if (label !== undefined) return label;
  const parts = target.split(".");
  const last = parts[parts.length - 1] ?? "";
  if (!last || ID_LIKE.test(last)) {
    note(ctx, "link without a label to an entry by id: dropped");
    return "";
  }
  return parts.includes("conditionitems") ? last.toLowerCase() : last;
}

function checkText(params: string, label: string | undefined): string {
  if (label !== undefined && label.trim()) return label;
  const fields = params.split("|").map((p) => p.trim());
  const types = (fields[0] ?? "").replace(/^type:/, "");
  let dc = "";
  let basic = false;
  for (const f of fields.slice(1)) {
    const m = /^dc:(-?\d+)$/.exec(f);
    if (m) dc = m[1]!;
    if (f === "basic") basic = true;
  }
  const typeText = types
    .split(",")
    .map((t) => (t === "flat" ? "flat" : t.startsWith("lore:") ? `${title(words(t.slice(5)))} Lore` : title(words(t))))
    .join(" or ");
  return `${dc ? `DC ${dc} ` : ""}${basic ? "basic " : ""}${typeText}`;
}

/** "(floor(@actor.level/2))d6" and friends, as words. Undefined when it cannot be read. */
function scalingFormula(f: string): string | undefined {
  const s = f.replace(/\s+/g, "");
  let m = /^\(?(?:floor|ceil)\(@(?:actor|item)\.(?:level|rank)\/(\d)\)\)?d(\d+)$/.exec(s);
  if (m) return `(1d${m[2]} per ${m[1]} levels)`;
  m = /^\(?@(?:actor|item)\.(?:level|rank)\)?d(\d+)$/.exec(s);
  if (m) return `(1d${m[1]} per level)`;
  m = /^\(?(?:floor|ceil)\(@(?:actor|item)\.(?:level|rank)\/(\d)\)\)?$/.exec(s);
  if (m) return `(1 per ${m[1]} levels)`;
  if (/^@(?:actor|item)\.(?:level|rank)$/.test(s)) return "(your level)";
  return undefined;
}

/** One damage formula ("(2d6+4)[fire]", "1d6[persistent,fire]", "(2[splash])[fire]") as text. */
function damagePart(part: string, ctx: TextContext): string {
  let p = part.trim();
  let types = "";
  const m = /\[([a-z,-]+)\]$/.exec(p);
  if (m) {
    // Healing is written as the amount only ("regain 2d8 Hit Points").
    const list = m[1]!.split(",");
    types = list.includes("healing") ? "" : list.map(words).join(" ");
    p = p.slice(0, m.index);
  }
  let splash = false;
  p = p.replace(/\[(splash|precision)\]/g, (_, k: string) => {
    if (k === "splash") splash = true;
    return "";
  });
  while (/^\(.*\)$/.test(p) && closeParen(p, 0) === p.length - 1) p = p.slice(1, -1);
  let formula = p;
  if (/[@a-z]{3,}\(|@/.test(p)) {
    const scaled = scalingFormula(p);
    if (scaled) formula = scaled;
    else {
      note(ctx, "damage formula scaling with level, written as text");
      formula = "level-based";
    }
  }
  return [formula, types, splash ? "splash" : ""].filter(Boolean).join(" ");
}

function closeParen(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Split at top-level commas (outside brackets and parentheses). */
function topLevelSplit(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "[" || ch === "(") depth++;
    if (ch === "]" || ch === ")") depth--;
    if (ch === sep && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function damageText(params: string, label: string | undefined, ctx: TextContext): string {
  if (label !== undefined && label.trim()) return label;
  const formula = topLevelSplit(params, "|")[0] ?? "";
  return topLevelSplit(formula, ",")
    .map((part) => damagePart(part, ctx))
    .join(" plus ");
}

function templateText(params: string, label: string | undefined): string {
  if (label !== undefined && label.trim()) return label;
  let type = "";
  let distance = "";
  for (const f of params.split("|")) {
    const [k, v] = f.includes(":") ? [f.slice(0, f.indexOf(":")), f.slice(f.indexOf(":") + 1)] : ["type", f];
    if (k === "type") type = v ?? "";
    if (k === "distance") distance = v ?? "";
  }
  return distance ? `${distance}-foot ${type}` : type;
}

function rollText(body: string, label: string | undefined): string {
  if (label !== undefined && label.trim()) return label;
  const m = /^\/(\w+)\s+(.*)$/s.exec(body.trim());
  if (!m) return "";
  const [, cmd, rest] = m;
  if (cmd === "act") return title(words(rest!.split(/\s/)[0] ?? ""));
  // "/r 1d4 #Recharge Dragon Breath", "/r {2d6}[fire]" → the formula
  const formula = rest!.replace(/#.*$/, "").trim().replace(/[{}]/g, "");
  return formula.replace(/\[([a-z,-]+)\]/g, (_, t: string) => ` ${t.split(",").map(words).join(" ")}`).trim();
}

function localize(key: string, ctx: TextContext): string | undefined {
  let cur: unknown = ctx.loc;
  for (const k of key.split(".")) cur = obj(cur)[k];
  return typeof cur === "string" ? cur : undefined;
}

/** Replace every enricher in `s` with plain text. */
export function resolveEnrichers(s: string, ctx: TextContext, depth = 0): string {
  let out = "";
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "@") {
      const m = /^@(UUID|Compendium|Check|Damage|Template|Localize|Embed)\[/.exec(s.slice(i, i + 20));
      if (m) {
        const open = i + m[0].length - 1;
        const close = closeBracket(s, open);
        if (close > 0) {
          const params = s.slice(open + 1, close);
          const { label, end } = labelAt(s, close + 1);
          const kind = m[1]!;
          if (kind === "UUID" || kind === "Compendium") out += uuidText(params, label, ctx);
          else if (kind === "Check") out += checkText(params, label);
          else if (kind === "Damage") out += damageText(params, label, ctx);
          else if (kind === "Template") out += templateText(params, label);
          else if (kind === "Localize") {
            const pointer = ctx.glossary === "pointer" && /^PF2E\.NPC\.Abilities\.Glossary\.(\w+)$/.exec(params);
            const text = pointer ? undefined : localize(params, ctx);
            if (pointer) out += `(See the universal monster ability ${title(pointer[1]!.replace(/([a-z])([A-Z])/g, "$1 $2"))}.)`;
            else if (text !== undefined && depth < 3) out += resolveEnrichers(text, ctx, depth + 1);
            else note(ctx, `@Localize key not found: ${params}`);
          } else note(ctx, `@${kind} enricher dropped`);
          i = end;
          continue;
        }
      }
    }
    if (ch === "[" && s.startsWith("[[/", i)) {
      let depth2 = 0;
      let j = i + 2;
      for (; j < s.length; j++) {
        if (s[j] === "[") depth2++;
        else if (s[j] === "]") {
          if (depth2 > 0) depth2--;
          else if (s[j + 1] === "]") break;
        }
      }
      if (j < s.length) {
        const { label, end } = labelAt(s, j + 2);
        out += rollText(s.slice(i + 2, j), label);
        i = end;
        continue;
      }
    }
    out += ch;
    i++;
  }
  return out;
}

// ---------------------------------------------------------------------------
// HTML → Markdown
// ---------------------------------------------------------------------------

/** Placeholders of nested lists inside a list item, written inline. */
function expand(html: string, blocks: string[]): string {
  return html.replace(/\s*\u0000(\d+)\u0000\s*/g, (_, n: string) => {
    const items = (blocks[Number(n)] ?? "").split("\n").map((l) => l.replace(/^(-|\d+\.) /, ""));
    return items.length ? `: ${items.join("; ")}` : "";
  });
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, "");
}

/** Inline HTML (bold, italic, line breaks, anything else stripped) to Markdown inline text. */
function inline(html: string): string {
  let s = html.replace(/<br\s*\/?>/gi, " ");
  s = s.replace(/<(strong|b)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi, (_, _t, _a, inner: string) => {
    const t = stripTags(inner).trim();
    return t ? `**${t}**` : "";
  });
  s = s.replace(/<(em|i)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi, (_, _t, _a, inner: string) => {
    const t = stripTags(inner).trim();
    return t ? `*${t}*` : "";
  });
  s = stripTags(s);
  return decodeEntities(s).replace(/\s+/g, " ").trim();
}

function tableToMarkdown(html: string): string {
  const rows: string[][] = [];
  const rowSpans: Array<{ col: number; left: number; text: string }> = [];
  for (const rm of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells: string[] = [];
    let col = 0;
    const take = () => {
      for (const sp of rowSpans) if (sp.col === col && sp.left > 0) {
        cells.push(sp.text);
        sp.left--;
        col++;
        return true;
      }
      return false;
    };
    for (const cm of rm[1]!.matchAll(/<(td|th)([^>]*)>([\s\S]*?)<\/\1>/gi)) {
      while (take());
      const text = inline(cm[3]!).replace(/\|/g, "/");
      const span = /rowspan="?(\d+)/i.exec(cm[2]!);
      if (span && Number(span[1]) > 1) rowSpans.push({ col, left: Number(span[1]) - 1, text });
      cells.push(text);
      col++;
    }
    while (take());
    if (cells.length) rows.push(cells);
  }
  if (rows.length === 0) return "";
  const width = Math.max(...rows.map((r) => r.length));
  const line = (r: string[]) => `| ${Array.from({ length: width }, (_, k) => r[k] ?? "").join(" | ")} |`;
  return [line(rows[0]!), `|${Array.from({ length: width }, () => " --- ").join("|")}|`, ...rows.slice(1).map(line)].join("\n");
}

/** Block-level HTML (paragraphs, headings, lists, tables, rules) to Markdown. */
const GLYPHS: Record<string, string> = { a: "◆", "1": "◆", d: "◆◆", "2": "◆◆", t: "◆◆◆", "3": "◆◆◆", r: "↺", f: "◇" };

export function htmlToMarkdown(html: string): string {
  let s = html.replace(/\r\n?/g, "\n");
  // Foundry's action glyph font: A/D/T one to three actions, R reaction, F free action.
  s = s.replace(/<span[^>]*class="[^"]*action-glyph[^"]*"[^>]*>([^<]*)<\/span>/gi, (_, g: string) =>
    g
      .trim()
      .toLowerCase()
      .split(/\s+|(?=[adtrf123])/)
      .map((c) => GLYPHS[c] ?? c)
      .join(" "),
  );
  const blocks: string[] = [];
  // Tables first: each becomes one placeholder block.
  s = s.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_, inner: string) => {
    blocks.push(tableToMarkdown(inner));
    return `\n\n\u0000${blocks.length - 1}\u0000\n\n`;
  });
  // Lists, innermost first; a list inside a list item is written inline ("item: a; b; c").
  const innermost = /<(ul|ol)[^>]*>((?:(?!<(?:ul|ol)[\s>])[\s\S])*?)<\/\1>/i;
  for (let guard = 0; innermost.test(s) && guard < 500; guard++) {
    s = s.replace(innermost, (_, kind: string, inner: string) => {
      const items = [...inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m, n) => `${kind.toLowerCase() === "ol" ? `${n + 1}.` : "-"} ${inline(expand(m[1]!, blocks))}`);
      blocks.push(items.join("\n"));
      return `\n\n\u0000${blocks.length - 1}\u0000\n\n`;
    });
  }
  s = s.replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, (_, inner: string) => `\n\n### ${inline(inner)}\n\n`);
  s = s.replace(/<hr\s*\/?>/gi, "\n\n");
  s = s.replace(/<\/?(p|div|section|blockquote)[^>]*>/gi, "\n\n");
  const paras = s
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const ph = /^\u0000(\d+)\u0000$/.exec(p);
      if (ph) return blocks[Number(ph[1])] ?? "";
      if (p.startsWith("### ")) return p;
      return inline(p);
    })
    .filter((p) => p.length > 0 && p !== "**" && p !== "*");
  return paras.join("\n\n");
}

/** Description HTML with enrichers to Markdown. */
export function toMarkdown(html: unknown, ctx: TextContext): string {
  const raw = str(html);
  if (!raw) return "";
  const out = htmlToMarkdown(resolveEnrichers(raw, ctx))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\*\*(\s*)\*\*/g, "$1")
    // A parenthesized formula left in the text, e.g. "(10+(5*@actor.abilities.str.mod) feet)".
    .replace(/\s*\((?:[^()]|\([^()]*\))*@(?:actor|item)(?:[^()]|\([^()]*\))*\)/g, () => {
      note(ctx, "parenthesized formula with @actor/@item removed");
      return "";
    })
    .split("\n\n")
    // Foundry usage notes ("drag the spell from the compendium...") are not rules text.
    .filter((p) => {
      const foundry = /compendium browser|Foundry|drag (?:the|a|an) [\w ]+ (?:from|onto|into) /i.test(p);
      if (foundry) note(ctx, "Foundry usage note removed");
      return !foundry;
    })
    .join("\n\n")
    .trim();
  return out;
}

/** A short plain-text summary: the first sentence of the first paragraph, without Markdown. */
export function firstSentence(md: string, max = 200): string {
  const para = (md.split(/\n\n/).find((p) => !p.startsWith("**") && !p.startsWith("|") && !p.startsWith("###")) ?? md.split(/\n\n/)[0] ?? "").replace(/\*+/g, "");
  const m = /^(.+?[.!?])(\s|$)/.exec(para);
  let s = (m ? m[1]! : para).trim();
  if (s.length > max) s = `${s.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
  return s;
}
