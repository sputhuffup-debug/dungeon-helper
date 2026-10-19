/**
 * Module fields on adventures, acts and scenes (cinematic play, p. 157-158).
 *
 * Core already holds the adventure title, the player introduction (the public
 * mission), the GM situation (the hidden truth) and the epilogue; acts hold a
 * title and a goal (the one-line summary); scenes hold a title, a body and the
 * mandatory flag. These fields add what a cinematic adventure needs on top.
 */
import type { NarrativeFieldsDef, ReferenceList } from "@campaign-forge/module-sdk";
import { CINEMATIC } from "./modes";
import { intField, number, objectSchema, select, stringField, text, textarea } from "./entities/common";

/** The six campaign themes, ids as in the campaign-theme table (p. 158). */
export const THEME_IDS = [
  "killing-greed",
  "corporate-intrigue",
  "tidings-of-war",
  "new-opportunities",
  "secret-research",
  "echoes-from-the-past",
] as const;
export type ThemeId = (typeof THEME_IDS)[number];
export const THEME_LABELS: Record<ThemeId, string> = {
  "killing-greed": "Killing Greed",
  "corporate-intrigue": "Corporate Intrigue",
  "tidings-of-war": "Tidings of War",
  "new-opportunities": "New Opportunities",
  "secret-research": "Secret Research",
  "echoes-from-the-past": "Echoes from the Past",
};

/** The three stages of fear (p. 155), one per act by default. */
export const FEAR_STAGE_IDS = ["dread", "terror", "horror"] as const;
export type FearStageId = (typeof FEAR_STAGE_IDS)[number];
export const FEAR_STAGE_LABELS: Record<FearStageId, string> = {
  dread: "Dread (something is wrong)",
  terror: "Terror (it is coming)",
  horror: "Horror (it is here)",
};

/** Default act lengths in minutes and fear stages for acts 1-3. */
export const ACT_DEFAULTS: ReadonlyArray<{ minutes: number; fearStage: FearStageId }> = [
  { minutes: 75, fearStage: "dread" },
  { minutes: 100, fearStage: "terror" },
  { minutes: 65, fearStage: "horror" },
];

/** Select options for the theme field, with the table's labels. */
export const campaignThemes: ReferenceList = {
  id: "alien.campaign-themes",
  name: "Campaign themes",
  page: 158,
  items: THEME_IDS.map((id) => ({ id, name: THEME_LABELS[id], page: 158 })),
};

/** Select options for an act's fear stage. */
export const fearStages: ReferenceList = {
  id: "alien.fear-stages",
  name: "Stages of fear",
  page: 155,
  items: FEAR_STAGE_IDS.map((id) => ({ id, name: FEAR_STAGE_LABELS[id], page: 155 })),
};

export const DEFAULT_YEAR = 2184;
export const DEFAULT_TARGET_HOURS = 4;
/** Value of a scene's `aimedAt` when an event concerns the whole group. */
export const AIMED_AT_EVERYONE = "everyone";

export const adventureFields: NarrativeFieldsDef = {
  kind: "adventure",
  mode: [CINEMATIC],
  schema: objectSchema({
    tagline: stringField("One line for the player handout."),
    year: intField(2000, 3000, DEFAULT_YEAR, "In-world year."),
    theme: { type: "string", enum: [...THEME_IDS], default: "killing-greed", description: "One theme every scene serves (p. 158)." },
    targetHours: { type: "number", minimum: 1, maximum: 12, default: DEFAULT_TARGET_HOURS, description: "Target session length; compared with the act minutes." },
    contentNote: stringField("Content limits agreed with the players."),
    truthTie: stringField("How the hidden truth ties to one PC's past."),
    threats: stringField("The threats in play (GM only)."),
    zoneOrder: stringField("Zones in the order the PCs meet them, e.g. Pad > Airlock > Hub."),
    countdown: stringField("The Act 3 timer: what starts it and how many minutes it runs (p. 28, 55)."),
    openingNarration: stringField("Read-aloud opening that drops the players into motion."),
    signOffs: {
      type: "object",
      default: {},
      additionalProperties: { type: "string" },
      description: "Epilogue sign-off message per PC, keyed by the PC's entity id (p. 157).",
    },
  }),
  sheet: {
    sections: [
      {
        id: "basics",
        title: "Basics",
        columns: 4,
        fields: [
          text("tagline", "Tagline", { span: 12 }),
          number("year", "Year"),
          select("theme", "Theme", { ref: campaignThemes.id }, { span: 6, rule: "alien.rule.campaign-theme" }),
          number("targetHours", "Target length (hours)"),
          textarea("contentNote", "Content note"),
        ],
      },
      {
        id: "situation",
        title: "Situation (GM)",
        columns: 1,
        fields: [
          textarea("truthTie", "How the truth ties to a PC's past"),
          textarea("threats", "Threats", { rule: "alien.rule.stages-of-fear" }),
          text("zoneOrder", "Zones in order", { span: 12, rule: "alien.rule.zones" }),
        ],
      },
      {
        id: "finale",
        title: "Opening & epilogue",
        columns: 1,
        fields: [
          textarea("countdown", "Act 3 countdown", { rule: "alien.rule.countdowns" }),
          textarea("openingNarration", "Opening narration"),
          {
            path: "signOffs",
            label: "Sign-offs (one per PC)",
            widget: "object",
            span: 12,
            rule: "alien.rule.act-showdown",
            config: { keyedByCast: "pcs", valueWidget: "textarea" },
          },
        ],
      },
    ],
    summary: ["theme", "year", "targetHours"],
  },
};

export const actFields: NarrativeFieldsDef = {
  kind: "act",
  mode: [CINEMATIC],
  schema: objectSchema({
    minutes: intField(15, 240, undefined, "Planned length of the act in minutes."),
    fearStage: { type: "string", enum: [...FEAR_STAGE_IDS], description: "The stage of fear the act aims for (p. 155)." },
    pressure: stringField("Ambient pressure that keeps building through the act."),
    relief: stringField("A calm moment to relieve stress, and how it breaks (p. 152, 155)."),
    actEnd: stringField("Acts 1-2: what triggers the act break."),
  }),
  sheet: {
    sections: [
      {
        id: "pacing",
        title: "Pacing",
        columns: 4,
        fields: [
          number("minutes", "Minutes"),
          select("fearStage", "Fear stage", { ref: fearStages.id }, { span: 6, rule: "alien.rule.stages-of-fear" }),
          textarea("pressure", "Ambient pressure"),
          textarea("relief", "Relief scene", { rule: "alien.rule.stress-recovery" }),
          textarea("actEnd", "How the act ends"),
        ],
      },
    ],
    summary: ["minutes", "fearStage"],
  },
};

export const sceneFields: NarrativeFieldsDef = {
  kind: "scene",
  mode: [CINEMATIC],
  schema: objectSchema({
    aimedAt: stringField("\"everyone\", or the entity id of the PC or NPC the event targets (p. 157).", { default: AIMED_AT_EVERYONE }),
    trigger: stringField("When or why the event happens."),
  }),
  sheet: {
    sections: [
      {
        id: "event",
        title: "Event",
        columns: 2,
        fields: [
          {
            path: "aimedAt",
            label: "Aimed at",
            widget: "ref",
            span: 6,
            rule: "alien.rule.three-acts",
            entityTypes: ["alien.character"],
            config: { castRoles: ["pcs", "npcs"], everyoneValue: AIMED_AT_EVERYONE, everyoneLabel: "Everyone" },
          },
          text("trigger", "Trigger", { span: 6 }),
        ],
      },
    ],
    summary: ["aimedAt"],
  },
};

export const narrativeFields: NarrativeFieldsDef[] = [adventureFields, actFields, sceneFields];
