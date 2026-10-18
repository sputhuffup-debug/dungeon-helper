/**
 * Dice expression parser and roller.
 *
 * Grammar (whitespace ignored, case-insensitive):
 *   expr   := term (("+" | "-") term)*
 *   term   := N "d" X | "d" X | "d66" | K
 * where N is a die count, X the face count (d2, d3, d6, d10, ...) and K a flat
 * constant. "d66" is the tens d6 * 10 + units d6 (values 11..66, digits 1..6).
 */
import type { Rng } from "./types";

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

/** Roll a dice expression. `raw` holds each die face in order (d66 contributes tens then units). */
export function rollDice(expr: string | DiceExpression, rng: Rng): { raw: number[]; total: number } {
  const parsed = typeof expr === "string" ? parseDiceExpression(expr) : expr;
  const raw: number[] = [];
  let total = 0;
  for (const term of parsed.terms) {
    if (term.kind === "const") {
      total += term.value;
    } else if (term.kind === "d66") {
      const tens = rng.int(1, 6);
      const units = rng.int(1, 6);
      raw.push(tens, units);
      total += term.sign * (tens * 10 + units);
    } else {
      for (let i = 0; i < term.count; i++) {
        const v = rng.int(1, term.faces);
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
