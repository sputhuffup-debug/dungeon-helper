/**
 * The words generic screens use for a module's game (`GameModule.terms`), with
 * neutral defaults, and the names of a d20 system's roll modes.
 */
import type { DiceSystem, EntityTypeDef, GameModule, ModuleTerms } from "./types";

/** Every term, filled in: the module's own words, else the neutral defaults. */
export interface ResolvedTerms {
  /** "crew", "party"; default "group". */
  party: string;
  /** "deck"; default "level". */
  mapLevel: string;
  mapLevels: string;
  /** "agenda"; default "personal handout". */
  agenda: string;
  agendas: string;
  rewardExamples: string;
  epiloguePrompt: string;
  /** The module's job type, as running text ("quest", "job"); "job" when it has none. */
  job: string;
  jobs: string;
}

export const DEFAULT_TERMS: Readonly<Required<ModuleTerms>> = {
  party: "group",
  mapLevel: "level",
  mapLevels: "levels",
  agenda: "personal handout",
  agendas: "personal handouts",
  rewardExamples: "money, gear, a favour owed, a new contact",
  epiloguePrompt: "What happens afterwards…",
};

/** A name in running text: "Player character" -> "player character"; an acronym such as "NPC" stays as written. */
export function nounOf(name: string): string {
  return name
    .split(" ")
    .map((w) => (w.length > 1 && /[A-Z]/.test(w) && w === w.toUpperCase() ? w : w.toLowerCase()))
    .join(" ");
}

/** "crew" -> "Crew": the first letter in upper case, for a label or the start of a sentence. */
export function upperFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const given = (v: string | undefined): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** The module's terms with the defaults filled in. The job nouns come from its first `job` entity type. */
export function resolveTerms(module: Pick<GameModule, "terms" | "entityTypes"> | undefined): ResolvedTerms {
  const t: ModuleTerms = module?.terms ?? {};
  const mapLevel = given(t.mapLevel);
  const agenda = given(t.agenda);
  const jobType: EntityTypeDef | undefined = module?.entityTypes.find((e) => e.kind === "job");
  return {
    party: given(t.party) ?? DEFAULT_TERMS.party,
    mapLevel: mapLevel ?? DEFAULT_TERMS.mapLevel,
    mapLevels: given(t.mapLevels) ?? (mapLevel ? `${mapLevel}s` : DEFAULT_TERMS.mapLevels),
    agenda: agenda ?? DEFAULT_TERMS.agenda,
    agendas: given(t.agendas) ?? (agenda ? `${agenda}s` : DEFAULT_TERMS.agendas),
    rewardExamples: given(t.rewardExamples) ?? DEFAULT_TERMS.rewardExamples,
    epiloguePrompt: given(t.epiloguePrompt) ?? DEFAULT_TERMS.epiloguePrompt,
    job: jobType ? nounOf(jobType.name) : "job",
    jobs: jobType ? nounOf(jobType.plural) : "jobs",
  };
}

/** A roll mode of a d20 system: roll once, or two d20 keeping the higher or the lower. */
export type RollMode = "normal" | "advantage" | "disadvantage";

/**
 * What a dice system calls its roll modes, in running text: "normal",
 * "advantage", "disadvantage", or a system's own names ("fortune",
 * "misfortune": the d20 engine's `advantageNames`). Read from the roll panel's
 * `advantage` option, so the roll panel and every other screen say the same.
 */
export function rollModeNames(dice: Pick<DiceSystem, "rollOptions"> | undefined): Record<RollMode, string> {
  const props = (dice?.rollOptions as { properties?: Record<string, { enum?: unknown }> } | undefined)?.properties;
  const names = props?.advantage?.enum;
  if (Array.isArray(names) && names.length === 3 && names.every((n) => typeof n === "string" && n.trim() !== "")) {
    const [normal, advantage, disadvantage] = names as [string, string, string];
    return { normal, advantage, disadvantage };
  }
  return { normal: "normal", advantage: "advantage", disadvantage: "disadvantage" };
}
