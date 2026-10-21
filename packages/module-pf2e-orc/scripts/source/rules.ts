/**
 * Conditions and actions (basic, skill, exploration, downtime and the other
 * action groups of the core books) as reference lists and as rule cards cited
 * by section. ORC text is used as written (with its Reserved Material removed).
 */
import type { ReferenceList, RuleCard } from "@campaign-forge/module-sdk";
import { cite, id, LIST, rule } from "../ids.ts";
import { actionCost, firstSentence, frequencyText, md, traitsLine, uniqueIds, usable, type Ctx } from "./common.ts";
import { obj, type Entry } from "./read.ts";

/** Action folders under packs/pf2e/actions, as section names. */
const ACTION_GROUPS: Record<string, string> = {
  basic: "Basic Actions",
  skill: "Skill Actions",
  exploration: "Exploration Activities",
  downtime: "Downtime Activities",
  subsystems: "Subsystem Actions",
  ancestry: "Ancestry Actions",
  class: "Class Actions",
  archetype: "Archetype Actions",
  heritage: "Heritage Actions",
  background: "Background Actions",
  equipment: "Item Actions",
  familiar: "Familiar Actions",
  vehicles: "Vehicle Actions",
  spells: "Spell Actions",
};

export function actionGroup(e: Entry): string {
  const dir = e.file.split("/")[1] ?? "";
  return ACTION_GROUPS[dir] ?? "Other Actions";
}

export interface RulesConversion {
  lists: ReferenceList[];
  rules: RuleCard[];
}

export function convertConditions(entries: Entry[], ctx: Ctx): RulesConversion {
  const ids = uniqueIds();
  const items = entries
    .filter((e) => usable(ctx, e))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => {
      const valued = obj(e.system.value).isValued === true;
      const description = md(ctx, obj(e.system.description).value);
      return { id: ids(e.name), name: e.name, valued: valued ? "yes" : "no", summary: firstSentence(description), description, cite: cite(e.book, "Conditions", e.name) };
    });
  const list: ReferenceList = {
    id: LIST.conditions,
    name: "Conditions",
    cite: cite("Player Core", "Conditions"),
    columns: ["valued", "summary"],
    items,
  };
  const rules: RuleCard[] = items.map((c) => ({
    id: rule(`condition.${c.id}`),
    title: c.name,
    summary: c.description,
    cite: c.cite,
    tags: ["condition"],
  }));
  return { lists: [list], rules };
}

export function convertActions(entries: Entry[], ctx: Ctx): RulesConversion {
  const ids = uniqueIds();
  const items = entries
    .filter((e) => usable(ctx, e))
    .sort((a, b) => actionGroup(a).localeCompare(actionGroup(b)) || a.name.localeCompare(b.name))
    .map((e) => {
      const description = md(ctx, obj(e.system.description).value);
      const group = actionGroup(e);
      const frequency = frequencyText(e.system.frequency);
      return {
        id: ids(e.name),
        name: e.name,
        actions: actionCost(e.system),
        group,
        traits: traitsLine(e.system),
        ...(frequency ? { frequency } : {}),
        summary: firstSentence(description),
        description,
        cite: cite(e.book, group, e.name),
      };
    });
  const list: ReferenceList = {
    id: LIST.actions,
    name: "Actions and activities",
    cite: cite("Player Core", "Actions"),
    columns: ["actions", "group", "traits", "summary"],
    items,
  };
  const rules: RuleCard[] = items.map((a) => ({
    id: rule(`action.${a.id}`),
    title: a.actions ? `${a.name} ${a.actions}` : a.name,
    summary: [a.traits ? `*${a.traits}*` : "", a.frequency && !/\*\*Frequency\*\*/.test(a.description) ? `**Frequency** ${a.frequency}` : "", a.description].filter(Boolean).join("\n\n"),
    cite: a.cite,
    tags: ["action", a.group.toLowerCase()],
  }));
  return { lists: [list], rules };
}

export const actionRuleId = (name: string): string => id(`rule.action.${name}`);
