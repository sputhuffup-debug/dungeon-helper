/** Small builders for the pack's JSONLogic (data, never code). */
import type { JsonLogicRule } from "@campaign-forge/module-sdk";
import { ABILITIES, modName } from "../ids.ts";

export type Rule = JsonLogicRule;

export const v = (path: string, fallback?: unknown): Rule => (fallback === undefined ? { var: path } : { var: [path, fallback] });
export const add = (...xs: Rule[]): Rule => ({ "+": xs });
export const sub = (a: Rule, b: Rule): Rule => ({ "-": [a, b] });
export const mul = (a: Rule, b: Rule): Rule => ({ "*": [a, b] });
export const floor = (x: Rule): Rule => ({ floor: x });
export const ifs = (...xs: Rule[]): Rule => ({ if: xs });
export const eq = (a: Rule, b: Rule): Rule => ({ "==": [a, b] });
export const gt = (a: Rule, b: Rule): Rule => ({ ">": [a, b] });
export const inList = (a: Rule, list: string[]): Rule => ({ in: [a, list] });
export const cat = (...xs: Rule[]): Rule => ({ cat: xs });
export const max = (...xs: Rule[]): Rule => ({ max: xs });
export const min = (...xs: Rule[]): Rule => ({ min: xs });
export const lookup = (table: unknown, path: Rule, fallback: unknown = 0): Rule => ({ lookup: [table as Rule, path, fallback as Rule] });

/** floor((score - 10) / 2), with a default score of 10. */
export const abilityMod = (ability: string): Rule => floor({ "/": [sub(v(`fields.abilities.${ability}`, 10), 10), 2] });

/** The six ability modifiers as computed values (strengthMod, ...). */
export function abilityMods(): Record<string, Rule> {
  return Object.fromEntries(ABILITIES.map((a) => [modName(a.id), abilityMod(a.id)]));
}

/** A signed number as text ("+3", "-1"). */
export const signedText = (x: Rule): Rule => ifs({ ">=": [x, 0] }, cat("+", x), cat(x));
