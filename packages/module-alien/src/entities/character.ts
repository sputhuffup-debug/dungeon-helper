import type { EntityTypeDef, JsonLogicRule, SheetSection } from "@campaign-forge/module-sdk";
import { CAMPAIGN, CINEMATIC } from "../modes";
import {
  ATTRIBUTE_IDS,
  CAREER_IDS,
  SKILL_BINDINGS,
  SKILL_IDS,
  checkbox,
  intField,
  number,
  objectSchema,
  select,
  stringField,
  text,
  textarea,
} from "./common";

/** Talent ids the computed rules look for (reference/talents.ts). */
export const HARDENED_TALENT = "hardened";
export const SEEN_IT_ALL_TALENT = "seen-it-all";

const attributeProps = (max: number) =>
  Object.fromEntries(ATTRIBUTE_IDS.map((a) => [a, { type: "integer", minimum: 1, maximum: max }]));

const conditionList = (description: string) => ({
  type: "array",
  default: [],
  description,
  items: {
    type: "object",
    required: ["id", "label"],
    properties: {
      id: { type: "string" },
      label: { type: "string" },
      page: { type: ["integer", "array"] },
    },
  },
});

export const characterSchema = objectSchema(
  {
    isPC: { type: "boolean", default: false, description: "Player character (true) or NPC (false)." },
    android: { type: "boolean", default: false, description: "Androids never push and never panic (p. 25)." },
    career: { type: "string", enum: [...CAREER_IDS, ""], default: "", description: "Career id (alien.careers)." },
    attributes: {
      type: "object",
      additionalProperties: false,
      required: [...ATTRIBUTE_IDS],
      properties: attributeProps(8),
      default: { strength: 3, agility: 3, wits: 3, empathy: 3 },
    },
    skills: {
      type: "object",
      additionalProperties: false,
      properties: Object.fromEntries(SKILL_IDS.map((s) => [s, intField(0, 5, 0)])),
      default: Object.fromEntries(SKILL_IDS.map((s) => [s, 0])),
    },
    talents: {
      type: "array",
      default: [],
      items: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" }, count: intField(1, undefined, 1, "Stack count for talents that stack.") },
      },
    },
    stress: intField(0, undefined, 0, "Current stress level; one stress die per point (p. 44)."),
    personalAgenda: stringField("Campaign mode: chosen, persistent, rewards XP (p. 27)."),
    agendas: {
      type: "array",
      default: [],
      description: "Cinematic mode: one hidden agenda per act (p. 27).",
      items: {
        type: "object",
        required: ["act", "text"],
        properties: { act: intField(1, 3), text: { type: "string" } },
      },
    },
    gear: {
      type: "array",
      default: [],
      items: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
          weight: { type: "number", minimum: 0, default: 1, description: "Encumbrance units; 0 for tiny items (p. 28)." },
          qty: { type: "integer", minimum: 0, default: 1 },
          supply: intField(0, undefined, undefined, "Supply rating for consumables (p. 28-29)."),
          itemId: { type: "string", description: "Linked alien.item entity id." },
        },
      },
    },
    signatureItem: stringField("A small personal item that helps relieve stress (p. 27)."),
    cash: { type: "number", minimum: 0, default: 0 },
    storyPoints: intField(0, 3, 0, "Cinematic mode only, max 3 (p. 44)."),
    xp: intField(0, undefined, 0, "Campaign mode experience points (p. 30)."),
    trait: stringField("One-line personality trait (NPCs)."),
    goal: stringField("What this character wants; GM-only by default."),
    appearance: stringField(),
    buddy: stringField("Free text; the real link is the buddy_of relationship (p. 158)."),
    rival: stringField("Free text; the real link is the rival_of relationship (p. 158)."),
    criticalInjuries: conditionList("Critical injuries currently suffered (p. 69-70)."),
    mentalTraumas: conditionList("Mental traumas acquired (p. 74)."),
    lifePath: { type: "object", additionalProperties: true, description: "Provenance of Life Path rolls (p. 282-289)." },
  },
  {
    // Humans cap attributes at 5; androids may go to 8 in the key attribute and 7 in others (p. 25).
    if: { properties: { android: { const: true } }, required: ["android"] },
    then: { properties: { attributes: { properties: attributeProps(8) } } },
    else: { properties: { attributes: { properties: attributeProps(5) } } },
  },
);

const talentCount = (talentId: string): JsonLogicRule => ({
  sum: [
    {
      map: [
        { filter: [{ var: "fields.talents" }, { "==": [{ var: "id" }, talentId] }] },
        { "+": [{ var: "count" }, 0] },
      ],
    },
  ],
});

const half = (a: string, b: string): JsonLogicRule => ({
  ceil: [{ "/": [{ "+": [{ var: `fields.attributes.${a}` }, { var: `fields.attributes.${b}` }] }, 2] }],
});

export const characterComputed: Record<string, JsonLogicRule> = {
  hardened: talentCount(HARDENED_TALENT),
  seenItAll: talentCount(SEEN_IT_ALL_TALENT),
  health: { "+": [half("strength", "agility"), talentCount(HARDENED_TALENT)] },
  resolve: { "+": [half("wits", "empathy"), talentCount(SEEN_IT_ALL_TALENT)] },
  encumbranceLimit: { "*": [{ var: "fields.attributes.strength" }, 2] },
  encumbrance: {
    sum: [{ map: [{ var: "fields.gear" }, { "*": [{ var: "weight" }, { var: "qty" }] }] }],
  },
};

const sections: SheetSection[] = [
  {
    id: "identity",
    title: "Identity",
    columns: 4,
    fields: [
      checkbox("isPC", "Player character"),
      checkbox("android", "Android", { rule: "alien.rule.androids" }),
      select("career", "Career", { ref: "alien.careers" }, { span: 6, rule: "alien.rule.careers" }),
      text("buddy", "Buddy", { span: 6, mode: [CAMPAIGN], rule: "alien.rule.buddies-rivals" }),
      text("rival", "Rival", { span: 6, mode: [CAMPAIGN], rule: "alien.rule.buddies-rivals" }),
      text("signatureItem", "Signature item", { span: 6, rule: "alien.rule.signature-item" }),
      number("cash", "Cash ($)", { rule: "alien.rule.cash" }),
    ],
  },
  {
    id: "attributes",
    title: "Attributes",
    columns: 4,
    fields: ATTRIBUTE_IDS.map((a) => ({
      path: `attributes.${a}`,
      label: a.charAt(0).toUpperCase() + a.slice(1),
      widget: "attribute" as const,
      span: 3,
      rule: "alien.rule.attributes",
      config: { skills: SKILL_BINDINGS.filter((s) => s.attribute === a).map((s) => s.id) },
    })),
  },
  {
    id: "skills",
    title: "Skills",
    fields: [
      {
        path: "skills",
        label: "Skills",
        widget: "skills",
        span: 12,
        rule: "alien.rule.skill-rolls",
        options: { ref: "alien.skills" },
        config: { skills: SKILL_BINDINGS, max: 5, attributesPath: "attributes", stressPath: "stress" },
      },
    ],
  },
  {
    id: "talents",
    title: "Talents",
    fields: [
      {
        path: "talents",
        label: "Talents",
        widget: "talents",
        span: 12,
        rule: "alien.rule.talents",
        options: { ref: "alien.talents" },
        config: { careerPath: "career", stackable: true },
      },
    ],
  },
  {
    id: "stress",
    title: "Stress & Conditions",
    columns: 4,
    fields: [
      {
        path: "stress",
        label: "Stress",
        widget: "stress",
        span: 6,
        rule: "alien.rule.stress",
        config: { resolve: "computed.resolve", panicOperation: "panicRoll", stressResponseOperation: "stressResponse" },
      },
      { path: "health", label: "Health", widget: "computed", span: 3, readonly: true, rule: "alien.rule.health" },
      { path: "resolve", label: "Resolve", widget: "computed", span: 3, readonly: true, rule: "alien.rule.resolve" },
      { path: "criticalInjuries", label: "Critical injuries", widget: "conditions", span: 6, rule: "alien.rule.critical-injuries" },
      { path: "mentalTraumas", label: "Mental traumas", widget: "conditions", span: 6, rule: "alien.rule.mental-trauma" },
    ],
  },
  {
    id: "gear",
    title: "Gear",
    fields: [
      {
        path: "gear",
        label: "Gear",
        widget: "gear",
        span: 12,
        rule: "alien.rule.encumbrance",
        config: {
          encumbrance: "computed.encumbrance",
          encumbranceLimit: "computed.encumbranceLimit",
          supplyOperation: "supplyRoll",
          itemEntityType: "alien.item",
        },
      },
    ],
  },
  {
    id: "agenda",
    title: "Agenda",
    columns: 2,
    fields: [
      textarea("personalAgenda", "Personal agenda", { mode: [CAMPAIGN], rule: "alien.rule.agendas" }),
      {
        path: "agendas",
        label: "Agendas (one per act)",
        widget: "list",
        span: 12,
        mode: [CINEMATIC],
        rule: "alien.rule.agendas",
        config: { columns: [{ path: "act", label: "Act" }, { path: "text", label: "Agenda" }] },
      },
      number("storyPoints", "Story Points", { mode: [CINEMATIC], rule: "alien.rule.story-points", config: { max: 3 } }),
      number("xp", "XP", { mode: [CAMPAIGN], rule: "alien.rule.xp" }),
    ],
  },
  {
    id: "npc",
    title: "NPC notes",
    columns: 1,
    fields: [
      textarea("appearance", "Appearance"),
      textarea("trait", "Trait"),
      textarea("goal", "Goal (GM)", { rule: "alien.rule.npcs" }),
    ],
  },
  {
    id: "lifePath",
    title: "Life Path provenance",
    mode: [CAMPAIGN],
    collapsed: true,
    fields: [{ path: "lifePath", label: "Life Path rolls", widget: "object", span: 12, readonly: true, rule: "alien.rule.life-paths" }],
  },
];

export const characterType: EntityTypeDef = {
  id: "alien.character",
  kind: "character",
  name: "Character",
  plural: "Characters",
  icon: "user",
  schema: characterSchema,
  sheet: {
    sections,
    summary: ["career", "stress", "health", "resolve", "android"],
  },
  computed: characterComputed,
  defaultVisibility: {
    appearance: "players",
    career: "players",
    goal: "gm",
    trait: "gm",
    personalAgenda: "gm",
    agendas: "gm",
    lifePath: "gm",
  },
  playerEditable: ["stress", "gear", "cash", "talents", "skills", "personalAgenda", "agendas", "storyPoints", "xp", "signatureItem", "buddy", "rival"],
};
