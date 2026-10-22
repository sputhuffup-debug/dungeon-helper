/**
 * Dice expression parser and roller.
 *
 * Grammar (whitespace ignored, case-insensitive):
 *   expr   := term (("+" | "-") term)*
 *   term   := N "d" X | "d" X | "d66" | K
 * where N is a die count, X the face count (d2, d3, d6, d10, ...) and K a flat
 * constant. "d66" is the tens d6 * 10 + units d6 (values 11..66, digits 1..6).
 */
import type { DiceGroup, Rng } from "./types";

export type DiceTerm =
  | { kind: "dice"; count: number; faces: number; sign: 1 | -1 }
  | { kind: "d66"; sign: 1 | -1 }
  | { kind: "const"; value: number };

export interface DiceExpression {
  source: string;
  terms: DiceTerm[];
}

const cache = new Map<string, DiceExpression>();

/** Parse a dice expression. Throws on invalid input. */
export function parseDiceExpression(expr: string): DiceExpression {
  const cached = cache.get(expr);
  if (cached) return cached;
  if (typeof expr !== "string") throw new Error(`Invalid dice expression: ${String(expr)}`);
  const compact = expr.replace(/\s+/g, "").toLowerCase();
  if (compact.length === 0) throw new Error("Invalid dice expression: empty");
  const terms: DiceTerm[] = [];
  const re = /([+-]?)([^+-]+)/g;
  let consumed = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(compact)) !== null) {
    consumed += m[0].length;
    const sign: 1 | -1 = m[1] === "-" ? -1 : 1;
    const body = m[2] ?? "";
    if (body === "d66") {
      terms.push({ kind: "d66", sign });
      continue;
    }
    const dm = /^(\d*)d(\d+)$/.exec(body);
    if (dm) {
      const count = dm[1] === "" || dm[1] === undefined ? 1 : Number(dm[1]);
      const faces = Number(dm[2]);
      if (!Number.isInteger(count) || count < 1) throw new Error(`Invalid die count in "${expr}"`);
      if (!Number.isInteger(faces) || faces < 1) throw new Error(`Invalid die faces in "${expr}"`);
      if (count > 1000) throw new Error(`Too many dice in "${expr}"`);
      terms.push({ kind: "dice", count, faces, sign });
      continue;
    }
    if (/^\d+$/.test(body)) {
      terms.push({ kind: "const", value: sign * Number(body) });
      continue;
    }
    throw new Error(`Invalid dice expression: "${expr}" (bad term "${body}")`);
  }
  if (consumed !== compact.length) throw new Error(`Invalid dice expression: "${expr}"`);
  if (!terms.some((t) => t.kind !== "const")) throw new Error(`Dice expression has no dice: "${expr}"`);
  const parsed: DiceExpression = { source: expr, terms };
  cache.set(expr, parsed);
  return parsed;
}

/** How many dice an expression rolls (a d66 is two). */
export function diceCount(expr: string | DiceExpression): number {
  const parsed = typeof expr === "string" ? parseDiceExpression(expr) : expr;
  return parsed.terms.reduce((n, t) => n + (t.kind === "d66" ? 2 : t.kind === "dice" ? t.count : 0), 0);
}

/** Faces for one term that make `value` (the term's signed contribution), in the order the term rolls them, or undefined. */
function termFaces(term: DiceTerm, value: number): number[] | undefined {
  if (term.kind === "const") return value === term.value ? [] : undefined;
  const v = value * term.sign;
  if (term.kind === "d66") {
    const tens = Math.floor(v / 10);
    const units = v % 10;
    return tens >= 1 && tens <= 6 && units >= 1 && units <= 6 ? [tens, units] : undefined;
  }
  if (v < term.count || v > term.count * term.faces) return undefined;
  // Fill the dice in order: each takes as much as it can while leaving one per die still to come.
  const out: number[] = [];
  let left = v;
  for (let i = 0; i < term.count; i++) {
    const face = Math.min(term.faces, left - (term.count - i - 1));
    out.push(face);
    left -= face;
  }
  return out;
}

/**
 * The faces, in roll order, that make `total` for the expression (constants
 * included), or undefined when the dice cannot make it. Used when a GM types
 * the total of a physical roll ("7" on 2d6, "35" on a d66): the faces are one
 * way to make it, which is all a total-based table needs.
 */
export function facesForTotal(expr: string | DiceExpression, total: number): number[] | undefined {
  if (!Number.isInteger(total)) return undefined;
  const parsed = typeof expr === "string" ? parseDiceExpression(expr) : expr;
  const terms = parsed.terms;
  // reach[i]: the totals terms i.. can make.
  const reach: Array<Set<number>> = new Array(terms.length + 1);
  reach[terms.length] = new Set([0]);
  for (let i = terms.length - 1; i >= 0; i--) {
    const next = new Set<number>();
    for (const s of reach[i + 1]!) for (const o of termOutcomes(terms[i]!)) next.add(s + o);
    reach[i] = next;
  }
  if (!reach[0]!.has(total)) return undefined;
  const faces: number[] = [];
  let left = total;
  for (let i = 0; i < terms.length; i++) {
    const term = terms[i]!;
    const pick = termOutcomes(term).find((o) => reach[i + 1]!.has(left - o));
    const f = pick === undefined ? undefined : termFaces(term, pick);
    if (pick === undefined || !f) return undefined;
    faces.push(...f);
    left -= pick;
  }
  return faces;
}

/** A fresh group for an expression's dice (its total typed in one go); one per roll, as groups are told apart by identity. */
export function facesGroup(expr: string | DiceExpression): DiceGroup {
  const parsed = typeof expr === "string" ? parseDiceExpression(expr) : expr;
  const [min, max] = diceRange(parsed);
  return { label: parsed.source.replace(/\s+/g, "").toLowerCase(), min, max, faces: (value) => facesForTotal(parsed, value) };
}

/**
 * Roll a dice expression. `raw` holds each die face in order (d66 contributes
 * tens then units). An expression of two or more dice passes a group in each
 * die's hint, so a GM rolling at the table can type its total.
 */
export function rollDice(expr: string | DiceExpression, rng: Rng): { raw: number[]; total: number } {
  const parsed = typeof expr === "string" ? parseDiceExpression(expr) : expr;
  const group = diceCount(parsed) > 1 ? facesGroup(parsed) : undefined;
  const raw: number[] = [];
  let total = 0;
  for (const term of parsed.terms) {
    if (term.kind === "const") {
      total += term.value;
    } else if (term.kind === "d66") {
      const tens = rng.int(1, 6, { label: "d66 tens d6", ...(group ? { group } : {}) });
      const units = rng.int(1, 6, { label: "d66 ones d6", ...(group ? { group } : {}) });
      raw.push(tens, units);
      total += term.sign * (tens * 10 + units);
    } else {
      for (let i = 0; i < term.count; i++) {
        const v = rng.int(1, term.faces, { label: `d${term.faces}`, ...(group ? { group } : {}) });
        raw.push(v);
        total += term.sign * v;
      }
    }
  }
  return { raw, total };
}

function termOutcomes(term: DiceTerm): number[] {
  if (term.kind === "const") return [term.value];
  if (term.kind === "d66") {
    const out: number[] = [];
    for (let t = 1; t <= 6; t++) for (let u = 1; u <= 6; u++) out.push(term.sign * (t * 10 + u));
    return out;
  }
  const out: number[] = [];
  for (let v = term.count; v <= term.count * term.faces; v++) out.push(term.sign * v);
  return out;
}

/** Sorted unique list of every achievable total. */
export function diceOutcomes(expr: string | DiceExpression): number[] {
  const parsed = typeof expr === "string" ? parseDiceExpression(expr) : expr;
  let sums = new Set<number>([0]);
  for (const term of parsed.terms) {
    const next = new Set<number>();
    for (const s of sums) for (const o of termOutcomes(term)) next.add(s + o);
    sums = next;
  }
  return [...sums].sort((a, b) => a - b);
}

/** Inclusive [min, max] of the expression's totals. */
export function diceRange(expr: string | DiceExpression): [number, number] {
  const parsed = typeof expr === "string" ? parseDiceExpression(expr) : expr;
  let min = 0;
  let max = 0;
  for (const term of parsed.terms) {
    if (term.kind === "const") {
      min += term.value;
      max += term.value;
    } else {
      const lo = term.kind === "d66" ? 11 : term.count;
      const hi = term.kind === "d66" ? 66 : term.count * term.faces;
      if (term.sign === 1) {
        min += lo;
        max += hi;
      } else {
        min -= hi;
        max -= lo;
      }
    }
  }
  return [min, max];
}

/** True when the expression contains a d66 term. */
export function isD66(expr: string | DiceExpression): boolean {
  const parsed = typeof expr === "string" ? parseDiceExpression(expr) : expr;
  return parsed.terms.some((t) => t.kind === "d66");
}

/** Returns true when the string parses as a dice expression. */
export function isDiceExpression(expr: string): boolean {
  try {
    parseDiceExpression(expr);
    return true;
  } catch {
    return false;
  }
}
