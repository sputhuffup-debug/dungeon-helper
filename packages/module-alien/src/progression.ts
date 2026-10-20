/**
 * Character progression in the Evolved Edition, checked against the book:
 *
 * - Campaign play: XP after each session, one per question answered yes
 *   (nine questions, p. 30; the agenda question is the bonus XP of p. 27).
 *   XP is spent only between sessions: a skill step costs the new level × 5
 *   XP, one step at a time; a new skill (level 1) costs 5 XP and needs a
 *   success with it this session or a shift of teaching from someone with
 *   level 1+; any talent of your career or a general talent costs 5 XP
 *   (p. 30). Skill levels run 0-5 (p. 26). Hardened and Seen It All stack to
 *   three (p. 51). During shore leave, a week spent pursuing the agenda
 *   successfully earns 1 XP (p. 257).
 * - Cinematic play: the XP rules are written for campaign play (p. 30); in
 *   cinematic play advancement is Story Points. At the end of each act a PC who advanced their
 *   agenda despite risk or sacrifice earns 1 Story Point; at most 3 held;
 *   one turns a base die into a success, before or after a push; one may
 *   carry over to the next adventure (p. 27, 44, 158).
 * - Buddy and rival may change after any session (p. 30).
 *
 * The book's development rules are written for PCs; NPCs do not advance.
 * Texts are paraphrases; numbers are the book's.
 */
import type { AwardContext, AwardQuestionDef, ProgressionDef } from "@campaign-forge/module-sdk";
import { SKILL_MAX } from "./entities/character";
import { CAMPAIGN, CINEMATIC } from "./modes";
import { STRESS_TRACKER } from "./trackers";

/** XP for one skill step: the new level times this (p. 30). */
export const XP_PER_SKILL_LEVEL = 5;
/** XP for any new talent (p. 30). */
export const XP_PER_TALENT = 5;
/** Most Story Points a PC can hold (p. 44). */
export const STORY_POINT_MAX = 3;
/** Story Points that may carry over to the next cinematic adventure (p. 158). */
export const STORY_POINT_CARRY_OVER = 1;

export const SKILL_SPEND = "alien.spend.skill";
export const TALENT_SPEND = "alien.spend.talent";
export const STORY_POINT_SUCCESS = "alien.story.success";
export const ACT_AGENDA_AWARD = "alien.award.act-agenda";
export const SHORE_LEAVE_AGENDA_AWARD = "alien.award.shore-leave-agenda";

const hasText = (path: string) => ({ "!!": [{ var: path }] });
const hasRelation = (rel: string, field: string) => ({ or: [{ ">": [{ var: [`relationships.${rel}`, 0] }, 0] }, hasText(`fields.${field}`)] });

/** Did the session's stress tracker log a panic roll for this character? */
function panicked(ctx: AwardContext): boolean {
  const state = ctx.trackerState[STRESS_TRACKER];
  const log = state && typeof state === "object" ? (state as { panicLog?: unknown }).panicLog : undefined;
  if (!Array.isArray(log)) return false;
  return log.some((e) => e && typeof e === "object" && ((e as { entity?: unknown }).entity === ctx.character.id || (e as { character?: unknown }).character === ctx.character.id));
}

const q = (id: string, text: string, extra: Partial<AwardQuestionDef> = {}): AwardQuestionDef => ({ id: `alien.award.${id}`, text, page: 30, mode: [CAMPAIGN], ...extra });

/** The nine end-of-session questions of campaign play (p. 30), paraphrased. One XP per yes. */
export const XP_AWARDS: AwardQuestionDef[] = [
  q("participated", "Were you at the session?", { defaultYes: true, hint: "One XP just for being there." }),
  q("agenda", "Did you risk or give up something to advance your personal agenda?", {
    when: hasText("fields.personalAgenda"),
    whenText: "No personal agenda on the sheet",
    hint: "Concrete action on it despite risk or cost (p. 27).",
  }),
  q("buddy", "Did you put your life on the line for your buddy?", { when: hasRelation("buddy_of", "buddy"), whenText: "No buddy set" }),
  q("rival", "Did you confront or stand up to your rival?", { when: hasRelation("rival_of", "rival"), whenText: "No rival set" }),
  q("panic", "Did you make a panic roll?", { suggest: panicked, hint: "Ticked when the stress tracker logged one." }),
  q("danger", "Did you get through a dangerous event, by violence or otherwise?"),
  q("discovery", "Did you make a major discovery or uncover a revelation?"),
  q("extraordinary", "Did you pull off something extraordinary?"),
  q("money", "Did you earn any money?", { hint: "The crew ledger shows this session's income." }),
];

/** Cinematic play: one Story Point per act for following the act's agenda (p. 27, 158). */
export const STORY_POINT_AWARDS: AwardQuestionDef[] = [
  {
    id: ACT_AGENDA_AWARD,
    text: "Did they advance this act's agenda despite personal risk or a real sacrifice?",
    pool: "story",
    timing: "act",
    page: 158,
    mode: [CINEMATIC],
    hint: "Agendas are handed out hidden each act (p. 27). Announce the point without saying why.",
  },
];

/** Shore leave, campaign play: a week spent pursuing the agenda, if it succeeds, earns 1 XP (p. 257). */
export const DOWNTIME_AWARDS: AwardQuestionDef[] = [
  {
    id: SHORE_LEAVE_AGENDA_AWARD,
    text: "Did they successfully pursue their personal agenda during this week of shore leave?",
    timing: "downtime",
    page: 257,
    mode: [CAMPAIGN],
  },
];

export const progression: ProgressionDef = {
  entities: [{ type: "alien.character", when: { "==": [{ var: "fields.isPC" }, true] } }],
  experience: {
    path: "xp",
    label: "XP",
    name: "Experience points",
    min: 0,
    page: 30,
    rule: "alien.rule.xp",
    mode: [CAMPAIGN],
    spendWhen: "between-sessions",
    spendWhenText: "XP can only be spent between sessions.",
  },
  storyPoints: {
    path: "storyPoints",
    label: "Story Points",
    name: "Story Points",
    min: 0,
    max: STORY_POINT_MAX,
    page: 44,
    rule: "alien.rule.story-points",
    mode: [CINEMATIC],
    earn: [
      { text: "At the end of each act, a PC who advanced their agenda despite personal risk or a real sacrifice earns one; announce it without saying why.", page: 158 },
      { text: "Agendas are handed out hidden at the start of each act.", page: 27 },
    ],
    uses: [
      {
        id: STORY_POINT_SUCCESS,
        label: "Success on one base die",
        text: "In a skill roll, one base die counts as a success. Spend it before or after a push.",
        page: 44,
        cost: 1,
        operation: "storyPoint",
        push: "any",
      },
    ],
    carryOver: { max: STORY_POINT_CARRY_OVER, text: "At the end of the adventure, one leftover Story Point may come along to the group's next one (GM's call), even with a new PC.", page: 158 },
  },
  awards: [...XP_AWARDS, ...STORY_POINT_AWARDS, ...DOWNTIME_AWARDS],
  spends: [
    {
      id: SKILL_SPEND,
      label: "Raise a skill",
      text: `One step at a time, up to level ${SKILL_MAX} (p. 26); the step costs the new level × ${XP_PER_SKILL_LEVEL} XP.`,
      target: { kind: "level", path: "skills", ref: "alien.skills", max: SKILL_MAX },
      cost: { "*": [{ var: "to" }, XP_PER_SKILL_LEVEL] },
      checks: [
        {
          level: "confirm",
          ok: { ">": [{ var: "from" }, 0] },
          message: "A new skill: you used it and succeeded without a skill level this session, or a teacher with level 1 or more taught you for at least a shift.",
          page: 30,
        },
      ],
      page: 30,
      rule: "alien.rule.advancement",
      mode: [CAMPAIGN],
    },
    {
      id: TALENT_SPEND,
      label: "Learn a talent",
      text: `${XP_PER_TALENT} XP for a talent of your career or a general talent.`,
      target: { kind: "pick", path: "talents", ref: "alien.talents", countKey: "count", stackKey: "maxStack", groupKey: "career", groupEmpty: "General" },
      cost: XP_PER_TALENT,
      available: { or: [{ "!": [{ var: "item.career" }] }, { "==": [{ var: "item.career" }, { var: "fields.career" }] }] },
      availableText: "A career talent of another career",
      page: 30,
      rule: "alien.rule.talents",
      mode: [CAMPAIGN],
    },
  ],
  notes: [
    { text: "After a session, each player may change their buddy and rival.", page: 30, mode: [CAMPAIGN] },
    { text: "During shore leave, a week spent pursuing the agenda earns 1 XP if it succeeds.", page: 257, mode: [CAMPAIGN] },
    { text: "The XP rules are written for campaign play; cinematic one-shots use Story Points instead.", page: 30, mode: [CINEMATIC] },
  ],
  rules: ["alien.rule.xp", "alien.rule.advancement", "alien.rule.story-points", "alien.rule.story-point-award", "alien.rule.agendas", "alien.rule.buddies-rivals"],
};
