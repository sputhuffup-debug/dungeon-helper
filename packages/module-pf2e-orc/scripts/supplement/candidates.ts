/**
 * Candidates for the Reserved Material list: capitalised words in the
 * supplement's converted text that never appear in lower case anywhere (so
 * they are names, not sentence-initial words) and that the module's own,
 * already reviewed, text never uses. Each comes with its count and an example,
 * for review by hand: a setting name goes into scripts/source/reserved.ts, a
 * rules term (an action, a class feature, a creature family) stays.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const WORD = /[\p{Lu}][\p{L}'’-]*[\p{L}]/gu;
const LOWER = /[\p{Ll}][\p{L}'’-]*/gu;

function strings(v: unknown, out: string[], key = ""): void {
  if (typeof v === "string") {
    if (key !== "id" && key !== "cite" && key !== "$schema" && key !== "supplement") out.push(v);
  } else if (Array.isArray(v)) for (const x of v) strings(x, out, key);
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) strings(x, out, k);
}

/** "Word (count): …example…" lines, most frequent first. */
export function candidates(packDir: string, parts: unknown[]): string[] {
  const base: string[] = [];
  for (const f of readdirSync(packDir).sort()) if (f.endsWith(".json")) strings(JSON.parse(readFileSync(join(packDir, f), "utf8")), base);
  const supp: string[] = [];
  strings(parts, supp);
  const baseWords = new Set(base.join("\n").match(WORD) ?? []);
  const lower = new Set([...(base.join("\n").match(LOWER) ?? []), ...(supp.join("\n").match(LOWER) ?? [])].map((w) => w.toLowerCase().replace(/['’]s$/, "")));
  const found = new Map<string, { n: number; example: string }>();
  for (const s of supp) {
    for (const m of s.matchAll(WORD)) {
      const w = m[0].replace(/['’]s$/, "");
      if (baseWords.has(w) || lower.has(w.toLowerCase())) continue;
      const f = found.get(w) ?? { n: 0, example: s.slice(Math.max(0, m.index - 60), m.index + 60).replace(/\s+/g, " ") };
      f.n++;
      found.set(w, f);
    }
  }
  return [...found.entries()].sort(([a, x], [b, y]) => y.n - x.n || a.localeCompare(b)).map(([w, f]) => `${w} (${f.n}): …${f.example}…`);
}
