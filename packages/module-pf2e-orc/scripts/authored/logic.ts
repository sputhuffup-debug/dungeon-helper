/** Small builders for the pack's JSONLogic (data, never code). */
import type { JsonLogicRule } from "@campaign-forge/module-sdk";

export type Rule = JsonLogicRule;

export const v = (path: string | Rule, fallback?: unknown): Rule => (fallback === undefined ? { var: path as string } : { var: [path as string, fallback as Rule] });
export const add = (...xs: Rule[]): Rule => ({ "+": xs });
export const sub = (a: Rule, b: Rule): Rule => ({ "-": [a, b] });
export const mul = (a: Rule, b: Rule): Rule => ({ "*": [a, b] });
export const floor = (x: Rule): Rule => ({ floor: x });
export const ifs = (...xs: Rule[]): Rule => ({ if: xs });
export const eq = (a: Rule, b: Rule): Rule => ({ "==": [a, b] });
export const gt = (a: Rule, b: Rule): Rule => ({ ">": [a, b] });
export const cat = (...xs: Rule[]): Rule => ({ cat: xs });
export const max = (...xs: Rule[]): Rule => ({ max: xs });
export const min = (...xs: Rule[]): Rule => ({ min: xs });
export const lookup = (table: unknown, path: Rule, fallback: unknown = 0): Rule => ({ lookup: [table as Rule, path, fallback as Rule] });

/**
 * Proficiency bonus of a rank (0 untrained, 1 trained ... 4 legendary):
 * untrained adds nothing; trained, expert, master and legendary add the
 * level plus 2, 4, 6 or 8.
 */
export const proficiency = (rank: Rule, level: Rule = v("fields.level", 1)): Rule => ifs(gt(rank, 0), add(level, mul(2, rank)), 0);

/** A signed number as text ("+3", "-1"). */
export const signedText = (x: Rule): Rule => ifs({ ">=": [x, 0] }, cat("+", x), cat(x));
