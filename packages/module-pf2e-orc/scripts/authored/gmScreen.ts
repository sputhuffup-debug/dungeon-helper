/**
 * The pack's GM screen (`gmScreen`): references to the authored rule cards
 * (degrees of success, DCs, initiative, the multiple attack penalty,
 * encounter budgets, Hit Points and Hero Points), the conditions' helper
 * text from `d20Combat`, the actions list (ORC text as written, with action
 * costs), and one quick-rules note on cover in our own words. The GM side
 * carries checks, encounters, and dying and recovery; the player side
 * carries basic and skill actions, cover and detection, and the conditions.
 */
import type { GmScreenDef } from "@campaign-forge/module-sdk";
import { id, LIST } from "../ids.ts";

const advice = (rest: string) => id(`rule.advice.${rest}`);
const group = (name: string) => ({ "==": [{ var: "group" }, name] });

export const gmScreen: GmScreenDef = {
  title: "GM screen",
  panels: [
    {
      id: "checks",
      title: "Checks and DCs",
      blocks: [
        { kind: "rule", rule: advice("degrees-of-success") },
        { kind: "rule", rule: advice("dcs") },
        { kind: "rule", rule: advice("proficiency") },
        { kind: "guide", title: "Calling for checks", tips: [0, 1, 2] },
      ],
    },
    {
      id: "encounters",
      title: "Encounters",
      blocks: [
        { kind: "rule", rule: advice("initiative") },
        { kind: "rule", rule: advice("multiple-attack-penalty") },
        { kind: "rule", rule: advice("encounter-budget"), parts: [0, 1, 2, 3] },
        { kind: "rule", rule: advice("hero-points") },
      ],
    },
    {
      id: "dying",
      title: "Dying and recovery",
      blocks: [
        { kind: "rule", rule: advice("hit-points") },
        { kind: "conditions", title: "Dying, wounded, doomed", conditions: ["dying", "wounded", "doomed", "unconscious"] },
        { kind: "list", list: LIST.actions, title: "Healing", items: ["administer-first-aid", "treat-wounds", "long-term-rest"], columns: ["actions"] },
        { kind: "list", list: LIST.actions, title: "Exploration activities", where: group("Exploration Activities") },
      ],
    },
    {
      id: "actions",
      title: "Actions",
      side: "players",
      blocks: [
        {
          kind: "list",
          list: LIST.actions,
          title: "Basic actions",
          items: ["stride", "step", "strike", "interact", "raise-a-shield", "take-cover", "seek", "sense-motive", "point-out", "aid", "ready", "delay", "escape", "leap", "crawl", "stand", "drop-prone", "release", "sustain"],
          columns: ["actions"],
        },
        {
          kind: "list",
          list: LIST.actions,
          title: "Skill actions in a fight",
          items: ["demoralize", "feint", "grapple", "shove", "trip", "disarm", "reposition", "tumble-through", "hide", "sneak", "create-a-diversion", "recall-knowledge"],
          columns: ["actions"],
        },
      ],
    },
    {
      id: "position",
      title: "Cover and detection",
      side: "players",
      blocks: [
        {
          kind: "text",
          title: "Cover",
          text: "**Lesser cover** (a creature in the way): +1 circumstance bonus to AC. **Standard cover**: +2 circumstance bonus to AC, to Reflex saves against area effects and to Stealth checks to Hide or Sneak. **Greater cover**: +4 to the same.",
          original: true,
          cite: "Player Core — Cover",
        },
        { kind: "rule", rule: id("rule.action.take-cover"), title: "Take Cover", parts: [1] },
        { kind: "rule", rule: advice("multiple-attack-penalty") },
        { kind: "conditions", title: "Detection", conditions: ["observed", "concealed", "hidden", "undetected", "unnoticed", "invisible"] },
      ],
    },
    {
      id: "conditions",
      title: "Conditions",
      side: "players",
      blocks: [
        {
          kind: "conditions",
          conditions: ["blinded", "clumsy", "confused", "dazzled", "deafened", "drained", "enfeebled", "fatigued", "fleeing", "frightened", "grabbed", "immobilized", "off-guard", "paralyzed", "persistent-damage", "prone", "quickened", "restrained", "sickened", "slowed", "stunned", "stupefied"],
        },
      ],
    },
    {
      id: "attitudes",
      title: "Attitudes",
      optional: true,
      blocks: [{ kind: "conditions", conditions: ["helpful", "friendly", "indifferent", "unfriendly", "hostile"] }],
    },
    {
      id: "downtime",
      title: "Downtime",
      optional: true,
      blocks: [{ kind: "list", list: LIST.actions, title: "Downtime activities", where: group("Downtime Activities") }],
    },
  ],
};
