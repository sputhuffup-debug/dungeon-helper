/**
 * Guided builder for a cinematic Alien adventure (p. 157-158): basics, the
 * situation, pregenerated PCs with an agenda per act, crew NPCs, locations with
 * puzzles, three acts of events, the opening and the epilogue, then a review
 * checklist. Tips and messages are short paraphrases in our own words.
 */
import type { AdventureBuilderDef, BuilderPanel, BuilderStep, JsonLogicRule, ReviewRule } from "@campaign-forge/module-sdk";
import { CINEMATIC } from "../modes";
import { careerItems } from "../reference/careers";
import { skills } from "../reference/skills";
import { talentItems } from "../reference/talents";
import { ATTRIBUTE_IDS, SKILL_IDS } from "../entities/common";
import { cinematicBuilderTemplate } from "../templates/cinematicAdventure";

export const CINEMATIC_BUILDER_ID = "alien.builder.cinematic";

// ---------------------------------------------------------------------------
// Book numbers the creation check uses (p. 25-26)
// ---------------------------------------------------------------------------

/** Attribute points at creation (p. 25). */
export const CREATION_ATTRIBUTE_POINTS = 14;
/** Starting attribute range; the career's key attribute may reach 5 (p. 25). */
export const CREATION_ATTRIBUTE_MIN = 2;
export const CREATION_ATTRIBUTE_MAX = 4;
export const CREATION_KEY_ATTRIBUTE_MAX = 5;
/** Androids add +3 to two attributes after the 14 points, up to 8 in the key attribute and 7 in another (p. 25). */
export const ANDROID_BONUS_POINTS = 6;
export const ANDROID_KEY_ATTRIBUTE_MAX = 8;
export const ANDROID_OTHER_ATTRIBUTE_MAX = 7;
/** Skill points at creation; career skills up to 3, other skills up to 1 (p. 26). */
export const CREATION_SKILL_POINTS = 10;
export const CREATION_CAREER_SKILL_MAX = 3;
export const CREATION_OTHER_SKILL_MAX = 1;
/** Agendas shorter than this many words are flagged as too vague. */
export const AGENDA_MIN_WORDS = 8;
/** Acts 1-2 agendas that hint at open violence against others (p. 158 asks to keep that for Act 3). */
export const OPEN_CONFLICT_PATTERN = "\\b(kill|murder|betray|shoot|attack)";
/** Words in an NPC's arc or secret that suggest a betrayal or turn. */
export const BETRAYAL_PATTERN = "\\b(betray|turn|lie|lying|sabotag|frame|gun|kill|abandon)";
/** Words in Act 3's pressure that count as a timer. */
export const TIMER_PATTERN = "countdown|timer|minutes";

// ---------------------------------------------------------------------------
// Cast
// ---------------------------------------------------------------------------

const cast: AdventureBuilderDef["cast"] = [
  {
    id: "pcs",
    label: "Player characters",
    entityType: "alien.character",
    defaults: { isPC: true },
    fields: ["career", "talents", "attributes", "skills", "gear", "signatureItem", "background"],
    min: 1,
  },
  {
    id: "npcs",
    label: "Crew NPCs",
    entityType: "alien.character",
    defaults: { isPC: false },
    fields: [
      "role",
      "appearance",
      "voice",
      "goal",
      "fears",
      "secret",
      "tells",
      "sampleLines",
      "arc",
      "attributes",
      "skills",
      "talents",
      "gear",
      "android",
      "secretAndroid",
      "coverAttributes",
      "fairClues",
      "secretOrders",
    ],
    min: 0,
  },
  {
    id: "locations",
    label: "Locations",
    entityType: "alien.location",
    subtype: "site",
    fields: ["description", "secret", "puzzle", "puzzleClue", "puzzleSolution", "puzzleFallback", "threat"],
    min: 0,
  },
];

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

const ACT_FIELDS = ["core.title", "core.goal", "minutes", "fearStage", "pressure", "relief"];
const SCENE_FIELDS = ["core.title", "aimedAt", "trigger", "core.body", "core.mandatory"];

const actPanel = (act: number): BuilderPanel => ({
  kind: "act",
  act,
  fields: act < 3 ? [...ACT_FIELDS, "actEnd"] : ACT_FIELDS,
  scenes: true,
  sceneFields: SCENE_FIELDS,
});

export const STEP_IDS = ["basics", "situation", "pcs", "npcs", "locations", "act1", "act2", "act3", "finale", "review"] as const;

const steps: BuilderStep[] = [
  {
    id: "basics",
    title: "Basics",
    page: 158,
    guide: [
      "Choose one of the six themes from p. 158 and let every scene serve it.",
      "Cinematic play suits a single evening (p. 157). One-shots tend to overrun, so plan the acts a little tighter than the target.",
      "Agree content limits with the players before the session and note them here.",
    ],
    panels: [{ kind: "adventure", fields: ["core.title", "tagline", "year", "theme", "targetHours", "contentNote"] }],
  },
  {
    id: "situation",
    title: "The Situation",
    page: 157,
    guide: [
      "The public mission is the read-aloud introduction: only what the players need to get going (p. 157).",
      "Keep the hidden truth to one tight paragraph that tells you what is really going on (p. 157).",
      "Tie the truth to one PC's past so the stakes turn personal.",
      "Fewer, deadlier threats work best; keep the main one out of sight as long as you can (p. 152, 155).",
    ],
    panels: [{ kind: "adventure", fields: ["core.playerIntro", "core.gmSituation", "truthTie", "threats", "zoneOrder"] }],
  },
  {
    id: "pcs",
    title: "Player characters",
    page: [24, 27],
    guide: [
      "Write pregenerated PCs like parts in a script, with backgrounds and agendas that fit the plot (p. 157).",
      "Creation: 14 attribute points, each 2-4 or up to 5 in the career's key attribute; 10 skill points, up to 3 in career skills and 1 in the rest; one of the career's three talents (p. 25-26).",
      "Each agenda is a concrete thing to do in one act, handed out as the act begins (p. 27).",
      "Keep Act 1 and 2 agendas quiet, with no open moves against other PCs, and escalate them act by act (p. 158).",
    ],
    panels: [
      { kind: "cast", role: "pcs" },
      { kind: "agendas", role: "pcs" },
    ],
  },
  {
    id: "npcs",
    title: "Crew NPCs",
    page: [155, 156],
    guide: [
      "Every NPC needs a name, a look, a trait and a goal (p. 156); a fear, a secret and a voice make them come alive.",
      "Write a few sample lines and concrete tells; reading them before the session helps you find the voice at the table.",
      "A secret synthetic may roll its lower cover scores and fake stress and panic rolls (p. 25). It never really panics, and at zero Health it rolls on the android damage table (p. 77-78).",
      "Plan a betrayal or turn that still works if the players uncover it early.",
    ],
    panels: [{ kind: "cast", role: "npcs" }],
  },
  {
    id: "locations",
    title: "Locations and puzzles",
    page: 157,
    guide: [
      "Cinematic adventures are built around places: map the core area and describe its key locations (p. 157).",
      "Give every place a secret that a careful search turns up.",
      "Pair each puzzle with a clue and a fallback, a loud or slow way through, so play never stalls.",
      "Hand clues over in pieces across several scenes rather than all at once.",
    ],
    panels: [{ kind: "cast", role: "locations" }],
  },
  {
    id: "act1",
    title: "Act 1: the Setup",
    page: 157,
    guide: [
      "Introduce the PCs and NPCs and set up the conflicts (p. 157).",
      "Aim for dread: plant seeds and hint that something is wrong without showing it (p. 155).",
      "Most events should be optional and stand-alone, with only a few mandatory; aim some at one PC (p. 157).",
      "Close the act on a hook that pulls everyone into the Tilt.",
    ],
    panels: [actPanel(1)],
  },
  {
    id: "act2",
    title: "Act 2: the Tilt",
    page: [157, 158],
    guide: [
      "Something unexpected raises the stakes and the danger, and secrets come out (p. 157).",
      "Aim for terror, the moment before it strikes; use it selectively (p. 155).",
      "Let them catch their breath in a relief scene, then break it (p. 152, 155).",
      "At the end of each act, give a Story Point to every player who pushed their agenda at real risk, without saying why (p. 158).",
    ],
    panels: [actPanel(2)],
  },
  {
    id: "act3",
    title: "Act 3: the Showdown",
    page: [157, 158],
    guide: [
      "The climax, resolved by what the PCs do (p. 157).",
      "Horror: the threat shows itself and the dice take over (p. 155).",
      "A countdown turns time into a consumable and drives the finale (p. 28, 55).",
      "Keep fights short and deadly, plan one set piece, and if a PC turns on the group, call PvP and play the scene out (p. 158).",
    ],
    panels: [actPanel(3)],
  },
  {
    id: "finale",
    title: "Opening and epilogue",
    page: 157,
    guide: [
      "Open with the crew already in motion and finish the narration with \"What do you do?\".",
      "The epilogue is a sign-off message from a surviving PC (p. 157); write one per PC so whoever lives has theirs.",
      "A survivor may read the sign-off as written or adapt it to how the story went (p. 157).",
    ],
    panels: [{ kind: "adventure", fields: ["countdown", "openingNarration", "signOffs"] }],
  },
  {
    id: "review",
    title: "Review",
    page: 157,
    guide: [
      "Fix the red items first; warnings are advice and never block you.",
      "Prepare handouts, maps and character sheets before the session (p. 157).",
      "Agendas stay hidden: hand each PC theirs at the start of its act (p. 27).",
    ],
    panels: [{ kind: "review" }],
  },
];

// ---------------------------------------------------------------------------
// JSONLogic helpers
// ---------------------------------------------------------------------------

const v = (path: string, fallback: unknown = ""): JsonLogicRule => ({ var: [path, fallback] });
/** True when the text at `path` is empty or whitespace. */
const blank = (path: string): JsonLogicRule => ({ "!": [{ trim: [v(path)] }] });
const countOf = (list: JsonLogicRule): JsonLogicRule => ({ count: [list] });
const nonBlankCount = (listPath: string, itemPath: string): JsonLogicRule =>
  countOf({ filter: [v(listPath, []), { "!!": [{ trim: [v(itemPath)] }] }] });
const isAct = (n: number): JsonLogicRule => ({ "==": [{ var: "item.number" }, n] });

const totalMinutes: JsonLogicRule = {
  reduce: [v("acts", []), { "+": [{ var: "accumulator" }, { var: ["current.fields.minutes", 0] }] }, 0],
};
const targetMinutes: JsonLogicRule = { "*": [{ var: ["adventure.fields.targetHours", 4] }, 60] };
/** Act lengths may differ from the target by this many minutes. */
export const LENGTH_TOLERANCE_MINUTES = 30;

// ---------------------------------------------------------------------------
// Code checks (for what JSONLogic cannot say, or where the context shape varies)
// ---------------------------------------------------------------------------

type Rec = Record<string, unknown>;
const isRec = (x: unknown): x is Rec => typeof x === "object" && x !== null && !Array.isArray(x);
const str = (x: unknown): string => (typeof x === "string" ? x.trim() : "");
const fieldsOf = (item: Rec): Rec => (isRec(item.fields) ? item.fields : {});
const num = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) ? x : Number(x) || 0);
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const skillName = (id: string): string => skills.items.find((s) => s.id === id)?.name ?? id;
const talentName = (id: string): string => talentItems.find((t) => t.id === id)?.name ?? id;

/** "Name", or "PC {n}" when the name is blank (the review engine fills `{n}` in check messages too). */
function who(item: Rec, fallback: string): string {
  return str(item.name) || `${fallback} {n}`;
}

/**
 * Starting-character rules (p. 25-26): 14 attribute points, each 2-4 (5 in the
 * career's key attribute); androids add +3 to two attributes (total 20, up to 8 in
 * the key attribute and 7 elsewhere); 10 skill points, career skills up to 3 and
 * others up to 1; the starting talent comes from the career's three.
 */
export function pcCreationIssues(pc: Rec): string[] {
  const f = fieldsOf(pc);
  const name = who(pc, "PC");
  const out: string[] = [];
  const career = careerItems.find((c) => c.id === f.career);
  const android = f.android === true;
  if (!career) out.push(`${name}: pick a career so the stats can be checked`);

  const attrs = isRec(f.attributes) ? f.attributes : {};
  const attrTotal = ATTRIBUTE_IDS.reduce((n, a) => n + num(attrs[a]), 0);
  const wantAttrs = CREATION_ATTRIBUTE_POINTS + (android ? ANDROID_BONUS_POINTS : 0);
  if (attrTotal !== wantAttrs) out.push(`${name}: attributes total ${attrTotal} (should be ${wantAttrs})`);
  for (const a of ATTRIBUTE_IDS) {
    const value = num(attrs[a]);
    const key = career?.keyAttribute === a;
    const max = android ? (key ? ANDROID_KEY_ATTRIBUTE_MAX : ANDROID_OTHER_ATTRIBUTE_MAX) : key || !career ? CREATION_KEY_ATTRIBUTE_MAX : CREATION_ATTRIBUTE_MAX;
    if (value < CREATION_ATTRIBUTE_MIN || value > max) out.push(`${name}: ${cap(a)} ${value} (allowed ${CREATION_ATTRIBUTE_MIN}-${max})`);
  }

  const sk = isRec(f.skills) ? f.skills : {};
  const skillTotal = SKILL_IDS.reduce((n, s) => n + num(sk[s]), 0);
  if (skillTotal !== CREATION_SKILL_POINTS) out.push(`${name}: skill points ${skillTotal} (should be ${CREATION_SKILL_POINTS})`);
  if (career) {
    for (const s of SKILL_IDS) {
      const level = num(sk[s]);
      const max = career.keySkills.includes(s) ? CREATION_CAREER_SKILL_MAX : CREATION_OTHER_SKILL_MAX;
      if (level > max) out.push(`${name}: ${skillName(s)} ${level} (max ${max} for this career)`);
    }
    const talents = Array.isArray(f.talents) ? f.talents.filter(isRec).map((t) => String(t.id ?? "")) : [];
    if (talents.length > 0 && !talents.some((t) => career.talents.includes(t))) {
      out.push(`${name}: the starting talent should be one of the ${career.name}'s: ${career.talents.map(talentName).join(", ")}`);
    }
  }
  return out;
}

/** Act number of a handout's `act` (a number, or an act id looked up in the context). */
function actNumberOf(act: unknown, ctx: Rec): number | undefined {
  if (typeof act === "number") return act;
  if (typeof act === "string") {
    const found = (Array.isArray(ctx.acts) ? ctx.acts : []).filter(isRec).find((a) => a.id === act);
    if (found) return num(found.number);
    if (/^\d+$/.test(act)) return Number(act);
  }
  return undefined;
}

/**
 * A PC's agenda text for an act: from the agenda handouts the core gathers on the cast
 * member (`agendaByAct`), the character's own `agendas` field, or an agenda handout in
 * the context for that character and act, whichever has text.
 */
export function agendaText(pc: Rec, act: number, ctx: Rec): string {
  const byAct = isRec(pc.agendaByAct) ? str(pc.agendaByAct[String(act)]) : "";
  if (byAct) return byAct;
  const f = fieldsOf(pc);
  const fromField = (Array.isArray(f.agendas) ? f.agendas : []).filter(isRec).find((a) => num(a.act) === act && str(a.text));
  if (fromField) return str(fromField.text);
  const handouts = (Array.isArray(ctx.handouts) ? ctx.handouts : []).filter(isRec);
  const fromHandout = handouts.find((h) => h.kind === "agenda" && pc.id !== undefined && h.character === pc.id && actNumberOf(h.act, ctx) === act && str(h.body));
  return fromHandout ? str(fromHandout.body) : "";
}

const ACT_NUMBERS = [1, 2, 3] as const;
const wordCount = (s: string): number => s.split(/\s+/).filter(Boolean).length;

/** The scene records of an act: `act.scenes` when it holds records, else context scenes whose `act` is this act. */
export function scenesOfAct(act: Rec, ctx: Rec): Rec[] {
  const own = Array.isArray(act.scenes) ? act.scenes : [];
  if (own.length > 0 && own.every(isRec)) return own as Rec[];
  const ids = new Set(own.filter((x): x is string => typeof x === "string"));
  return (Array.isArray(ctx.scenes) ? ctx.scenes : [])
    .filter(isRec)
    .filter((s) => (typeof s.id === "string" && ids.has(s.id)) || (s.act !== undefined && (s.act === act.number || (act.id !== undefined && s.act === act.id))));
}

/** An event counts once it says what happens (body) or when (trigger). */
export const isFilledEvent = (scene: Rec): boolean => str(scene.body) !== "" || str(fieldsOf(scene).trigger) !== "";

/** Events per act that work well. */
export const EVENTS_MIN = 3;
export const EVENTS_MAX = 7;
export const MANDATORY_MAX = 2;

// ---------------------------------------------------------------------------
// Review rules
// ---------------------------------------------------------------------------

const actRules = (n: 1 | 2 | 3): ReviewRule[] => {
  const step = `act${n}`;
  const when = (cond: JsonLogicRule): JsonLogicRule => ({ and: [isAct(n), cond] });
  const onlyAct = (item: Rec): boolean => num(item.number) === n;
  const rules: ReviewRule[] = [
    {
      id: `act${n}.summary`,
      step,
      level: "bad",
      each: "acts",
      when: when(blank("item.goal")),
      message: `Act ${n}: write the one-line summary`,
      okMessage: `Act ${n}: summary written`,
      page: 157,
    },
    {
      id: `act${n}.pressure`,
      step,
      level: "warn",
      each: "acts",
      when: when(blank("item.fields.pressure")),
      message: `Act ${n}: add an ambient pressure`,
      page: 152,
    },
  ];
  if (n < 3) {
    rules.push({
      id: `act${n}.relief`,
      step,
      level: "warn",
      each: "acts",
      when: when(blank("item.fields.relief")),
      message: `Act ${n}: add a relief scene; horror needs a release before it can land`,
      page: 155,
    });
  }
  rules.push(
    {
      id: `act${n}.events`,
      step,
      level: "warn",
      each: "acts",
      check: (item, ctx) => {
        if (!onlyAct(item)) return [];
        const filled = scenesOfAct(item, ctx).filter(isFilledEvent).length;
        return filled < EVENTS_MIN || filled > EVENTS_MAX ? [`Act ${n}: ${filled} events (${EVENTS_MIN}-${EVENTS_MAX} per act works well)`] : [];
      },
      message: `Act ${n}: aim for ${EVENTS_MIN}-${EVENTS_MAX} events`,
      okMessage: `Act ${n}: the number of events works`,
      page: 157,
    },
    {
      id: `act${n}.mandatory`,
      step,
      level: "warn",
      each: "acts",
      check: (item, ctx) => {
        if (!onlyAct(item)) return [];
        const mandatory = scenesOfAct(item, ctx).filter((s) => s.mandatory === true).length;
        return mandatory > MANDATORY_MAX ? [`Act ${n}: ${mandatory} mandatory events; more than ${MANDATORY_MAX} starts to feel railroaded`] : [];
      },
      message: `Act ${n}: more than ${MANDATORY_MAX} mandatory events starts to feel railroaded`,
      page: 157,
    },
  );
  if (n < 3) {
    rules.push({
      id: `act${n}.end`,
      step,
      level: "warn",
      each: "acts",
      when: when(blank("item.fields.actEnd")),
      message: `Act ${n}: say what ends the act`,
    });
  } else {
    rules.push({
      id: "act3.timer",
      step,
      level: "warn",
      each: "acts",
      when: when({
        and: [blank("adventure.fields.countdown"), { "!": [{ matches: [v("item.fields.pressure"), TIMER_PATTERN, "i"] }] }],
      }),
      message: "Act 3 has no timer; a countdown speeds up the climax",
      page: [28, 55],
    });
  }
  return rules;
};

const review: ReviewRule[] = [
  // Basics
  {
    id: "basics.title",
    step: "basics",
    level: "bad",
    when: blank("adventure.title"),
    message: "Give the adventure a title",
    okMessage: "Title set",
  },
  {
    id: "basics.length",
    step: "basics",
    level: "warn",
    when: {
      or: [
        { ">": [totalMinutes, { "+": [targetMinutes, LENGTH_TOLERANCE_MINUTES] }] },
        { "<": [totalMinutes, { "-": [targetMinutes, LENGTH_TOLERANCE_MINUTES] }] },
      ],
    },
    value: { cat: [totalMinutes, " min against a ", targetMinutes, "-minute target"] },
    message: "Acts total {value}; bring them within 30 minutes of it",
    okMessage: "Act lengths fit the target length",
  },
  // The Situation
  {
    id: "situation.mission",
    step: "situation",
    level: "bad",
    when: blank("adventure.playerIntro"),
    message: "Write the public mission (the player introduction)",
    okMessage: "Public mission written",
    page: 157,
  },
  {
    id: "situation.truth",
    step: "situation",
    level: "bad",
    when: blank("adventure.gmSituation"),
    message: "Write the GM-only truth (the situation)",
    okMessage: "GM-only truth written",
    page: 157,
  },
  {
    id: "situation.tie",
    step: "situation",
    level: "warn",
    when: blank("adventure.fields.truthTie"),
    message: "Tie the truth to a PC's past for personal stakes",
    okMessage: "The truth ties into a PC's past",
  },
  // Player characters
  {
    id: "pcs.none",
    step: "pcs",
    level: "bad",
    when: { "==": [countOf(v("pcs", [])), 0] },
    message: "Add at least one player character",
    page: 157,
  },
  {
    id: "pcs.name",
    step: "pcs",
    level: "bad",
    each: "pcs",
    when: blank("item.name"),
    message: "PC {n}: needs a name",
  },
  {
    id: "pcs.creation",
    step: "pcs",
    level: "warn",
    each: "pcs",
    check: (item) => pcCreationIssues(item),
    message: "{name}: the stats break the creation rules",
    okMessage: "PC stats follow the creation rules",
    page: [25, 26],
  },
  {
    id: "pcs.talent",
    step: "pcs",
    level: "warn",
    each: "pcs",
    when: { "==": [countOf(v("item.fields.talents", [])), 0] },
    message: "{name}: pick a talent",
    page: 26,
  },
  {
    id: "pcs.agenda",
    step: "pcs",
    level: "bad",
    each: "pcs",
    check: (item, ctx) => ACT_NUMBERS.filter((a) => agendaText(item, a, ctx) === "").map((a) => `${who(item, "PC")}: write the Act ${a} agenda`),
    message: "{name}: write an agenda for every act",
    page: [27, 158],
  },
  {
    id: "pcs.agenda-short",
    step: "pcs",
    level: "warn",
    each: "pcs",
    check: (item, ctx) =>
      ACT_NUMBERS.filter((a) => {
        const t = agendaText(item, a, ctx);
        return t !== "" && wordCount(t) < AGENDA_MIN_WORDS;
      }).map((a) => `${who(item, "PC")}: the Act ${a} agenda is very short; make it a concrete action`),
    message: "{name}: an agenda is very short; make it a concrete action",
    page: 27,
  },
  {
    id: "pcs.agenda-conflict",
    step: "pcs",
    level: "warn",
    each: "pcs",
    check: (item, ctx) =>
      ([1, 2] as const)
        .filter((a) => new RegExp(OPEN_CONFLICT_PATTERN, "i").test(agendaText(item, a, ctx)))
        .map((a) => `${who(item, "PC")}: the Act ${a} agenda invites open conflict; save that for Act 3`),
    message: "{name}: an early agenda invites open conflict; save that for Act 3",
    page: 158,
  },
  // Crew NPCs
  {
    id: "npcs.none",
    step: "npcs",
    level: "warn",
    when: { "==": [countOf(v("npcs", [])), 0] },
    message: "No crew NPCs; a betrayal needs someone to betray",
  },
  {
    id: "npcs.name",
    step: "npcs",
    level: "bad",
    each: "npcs",
    when: blank("item.name"),
    message: "NPC {n}: needs a name",
  },
  {
    id: "npcs.want-secret",
    step: "npcs",
    level: "warn",
    each: "npcs",
    when: { or: [blank("item.fields.goal"), blank("item.fields.secret")] },
    message: "{name}: give them a want and a secret",
    page: 156,
  },
  {
    id: "npcs.lines",
    step: "npcs",
    level: "warn",
    each: "npcs",
    when: blank("item.fields.sampleLines"),
    message: "{name}: add sample lines; a few written in advance help you find the voice at the table",
  },
  {
    id: "npcs.synthetic-android",
    step: "npcs",
    level: "warn",
    each: "npcs",
    when: { and: [{ "==": [{ var: "item.fields.secretAndroid" }, true] }, { "!": [{ var: "item.fields.android" }] }] },
    message: "{name}: a secret synthetic is still an android; tick Android too so its sheet follows the android rules",
    page: [25, 77],
  },
  {
    id: "npcs.clues",
    step: "npcs",
    level: "warn",
    each: "npcs",
    when: { and: [{ "==": [{ var: "item.fields.secretAndroid" }, true] }, { "<": [nonBlankCount("item.fields.fairClues", ""), 2] }] },
    message: "{name}: give the synthetic at least two fair clues",
    okMessage: "Each secret synthetic has two or more fair clues",
  },
  {
    id: "npcs.orders",
    step: "npcs",
    level: "warn",
    each: "npcs",
    when: { and: [{ "==": [{ var: "item.fields.secretAndroid" }, true] }, blank("item.fields.secretOrders")] },
    message: "{name}: write the synthetic's secret orders",
  },
  {
    id: "npcs.betrayal",
    step: "npcs",
    level: "warn",
    when: {
      and: [
        { ">": [countOf(v("npcs", [])), 0] },
        { none: [v("npcs", []), { matches: [{ cat: [v("fields.arc"), " ", v("fields.secret")] }, BETRAYAL_PATTERN, "i"] }] },
      ],
    },
    message: "No NPC arc or secret mentions a betrayal or turn yet",
  },
  // Locations and puzzles
  {
    id: "locations.count",
    step: "locations",
    level: "warn",
    when: { "<": [countOf(v("locations", [])), 3] },
    message: "Three or more locations give the acts room to breathe",
    page: 157,
  },
  {
    id: "locations.puzzles",
    step: "locations",
    level: "warn",
    when: {
      or: [{ "<": [nonBlankCount("locations", "fields.puzzle"), 2] }, { ">": [nonBlankCount("locations", "fields.puzzle"), 4] }],
    },
    value: nonBlankCount("locations", "fields.puzzle"),
    message: "{value} puzzles; two to four suit a one-shot",
    okMessage: "The number of puzzles suits a one-shot",
  },
  {
    id: "locations.fallback",
    step: "locations",
    level: "warn",
    each: "locations",
    when: { and: [{ "!": [blank("item.fields.puzzle")] }, blank("item.fields.puzzleFallback")] },
    message: "{name}: the puzzle needs a loud or slow fallback",
  },
  {
    id: "locations.clue",
    step: "locations",
    level: "warn",
    each: "locations",
    when: {
      and: [{ "!": [blank("item.fields.puzzle")] }, { or: [blank("item.fields.puzzleClue"), blank("item.fields.puzzleSolution")] }],
    },
    message: "{name}: the puzzle needs a clue and a solution",
  },
  {
    id: "locations.name",
    step: "locations",
    level: "bad",
    each: "locations",
    when: blank("item.name"),
    message: "Location {n}: needs a name",
  },
  // Acts
  ...actRules(1),
  ...actRules(2),
  ...actRules(3),
  // Opening and epilogue
  {
    id: "finale.opening",
    step: "finale",
    level: "bad",
    when: blank("adventure.fields.openingNarration"),
    message: "Write the opening narration",
  },
  {
    id: "finale.question",
    step: "finale",
    level: "warn",
    when: { "!": [{ matches: [{ trim: [v("adventure.fields.openingNarration")] }, "what do you do\\?[\"'”’]?$", "i"] }] },
    message: "End the opening with \"What do you do?\"",
    okMessage: "The opening ends with \"What do you do?\"",
  },
  {
    id: "finale.signoff",
    step: "finale",
    level: "warn",
    each: "pcs",
    when: { "!": [{ trim: [{ var: [{ cat: ["adventure.fields.signOffs.", { var: "item.id" }] }, ""] }] }] },
    message: "Write a sign-off for {name}",
    page: 157,
  },
];

export const cinematicBuilder: AdventureBuilderDef = {
  id: CINEMATIC_BUILDER_ID,
  name: "Cinematic adventure",
  description:
    "Step by step from the basics to a three-act cinematic adventure: situation, pregenerated PCs with agendas, crew NPCs, locations with puzzles, acts of events, opening and epilogue, with a review checklist.",
  mode: [CINEMATIC],
  page: [157, 158],
  templateId: cinematicBuilderTemplate.id,
  cast,
  steps,
  review,
};
