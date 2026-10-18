/**
 * Life Path (appendix, p. 282-289), following the book's nine steps in order:
 *
 * 1. Human or android (2D6, 11-12 android; androids add +3 to two attributes).
 * 2. Origin (2D6 super-nation, D6 sub-affiliation, D6 home) and 3 random general skills.
 * 3. Early life: D66 once per column (2 attribute points, 2 skill points, psych modifier).
 * 4. Life event (D66): 2 specified attribute points and 2 random general skills.
 * 5. 2 attribute points of choice, then apply for a career (an unpushed roll against one
 *    career skill; Kids need no application). Hired: 2 D3 career skills, a gear roll and a
 *    paycheck; two or more successes also give a favor.
 * 6-7. One to three terms (Kids one): posting (D6, +1 random career skill, 5-6 bonus gear
 *    roll), performance (unpushed career skill roll: fail = disaster and −1 psych, two or
 *    more = favor and +1 psych), a random career talent, a gear roll and a paycheck. Each
 *    term after the first costs 1 attribute point of choice.
 * 8. Psych evaluation: 2D6 plus all psych modifiers.
 * 9. Final touches (name from the inputs; the rest is left to the player).
 *
 * Module decisions where the book leaves a choice to the player: points of choice go to
 * the career's requirements first, then to the attribute behind most of its skills; a
 * reduction takes the highest attribute the career uses least; skill tests use the best
 * career skill; a failed application with no requested career tries the other careers the
 * PC qualifies for, then pulls a fast one; a sacking ends the career after the current
 * term. Every step result carries the deltas it applied, so the running totals are folded
 * from the results and every table sub-roll is in the roll log (plain dice rolls such as skill tests,
 * paychecks and gear picks are kept in the step result's `rolls` list).
 */
import { rollTable, type Procedure, type ProcedureContext, type Rng } from "@campaign-forge/module-sdk";
import { careerItems } from "../reference/careers";
import { careerTalents } from "../reference/talents";
import {
  LIFEPATH_CAREERS,
  careerSkillTableId,
  postingTableId,
  type Attr,
  type LifepathCareer,
  type Skill,
} from "../tables/lifepath";
import { clamp, isObj, num, obj, str, type Obj } from "./helpers";

const ATTRIBUTES: Attr[] = ["strength", "agility", "wits", "empathy"];
const SKILLS: Skill[] = [
  "heavyMachinery", "closeCombat", "stamina", "rangedCombat", "mobility", "piloting",
  "observation", "survival", "comtech", "manipulation", "command", "medicalAid",
];
const SKILL_ATTRIBUTE: Record<Skill, Attr> = {
  heavyMachinery: "strength", closeCombat: "strength", stamina: "strength",
  rangedCombat: "agility", mobility: "agility", piloting: "agility",
  observation: "wits", survival: "wits", comtech: "wits",
  manipulation: "empathy", command: "empathy", medicalAid: "empathy",
};
const SKILL_MAX = 5;
const MAX_TERMS = 3;
const REROLL_LIMIT = 20;

export const STEP_ORDER = [
  "humanOrAndroid",
  "origin",
  "originSkills",
  "earlyLife",
  "earlyLifeCompany",
  "earlyLifeExperience",
  "lifeEvent",
  "lifeEventSkills",
  "career",
  "term1",
  "term2",
  "term3",
  "psych",
] as const;

// ---------------------------------------------------------------------------
// Running state, folded from step results
// ---------------------------------------------------------------------------

export interface LifePathState {
  android: boolean;
  attributes: Record<Attr, number>;
  skills: Record<Skill, number>;
  psych: number;
  cash: number;
  gear: string[];
  talents: string[];
  favors: string[];
  notes: string[];
  career: string;
  careerEnded: boolean;
  terms: number;
}

/** The delta keys a step result may carry. */
interface Delta {
  attributes?: Record<string, number>;
  skills?: Record<string, number>;
  psych?: number;
  cash?: number;
  gear?: string[];
  loseGear?: string[];
  talents?: string[];
  favorsGained?: string[];
  notes?: string[];
  career?: string;
  careerEnded?: boolean;
  termServed?: boolean;
}

function initialState(): LifePathState {
  return {
    android: false,
    attributes: { strength: 2, agility: 2, wits: 2, empathy: 2 },
    skills: Object.fromEntries(SKILLS.map((s) => [s, 0])) as Record<Skill, number>,
    psych: 0,
    cash: 0,
    gear: [],
    talents: [],
    favors: [],
    notes: [],
    career: "",
    careerEnded: false,
    terms: 0,
  };
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** Apply one step result's deltas (unknown keys are ignored). */
function applyDelta(state: LifePathState, result: unknown): LifePathState {
  if (!isObj(result)) return state;
  const next: LifePathState = {
    ...state,
    attributes: { ...state.attributes },
    skills: { ...state.skills },
    gear: [...state.gear],
    talents: [...state.talents],
    favors: [...state.favors],
    notes: [...state.notes],
  };
  if (result.android === true) next.android = true;
  if (isObj(result.attributes)) for (const [k, v] of Object.entries(result.attributes)) if (k in next.attributes) next.attributes[k as Attr] += num(v);
  if (isObj(result.skills)) for (const [k, v] of Object.entries(result.skills)) if (k in next.skills) next.skills[k as Skill] += num(v);
  next.psych += num(result.psych);
  next.cash += num(result.cash);
  next.gear.push(...strings(result.gear));
  for (const g of strings(result.loseGear)) {
    const i = next.gear.indexOf(g);
    if (i >= 0) next.gear.splice(i, 1);
  }
  next.talents.push(...strings(result.talents));
  next.favors.push(...strings(result.favorsGained));
  next.notes.push(...strings(result.notes));
  if (typeof result.career === "string" && result.career) next.career = result.career;
  if (result.careerEnded === true) next.careerEnded = true;
  if (result.termServed === true) next.terms += 1;
  return next;
}

/** State after every step that ran before `stepId` (the whole path for an unknown id). */
export function stateBefore(ctx: ProcedureContext, stepId: string): LifePathState {
  let s = initialState();
  for (const id of STEP_ORDER) {
    if (id === stepId) break;
    s = applyDelta(s, ctx.get(id));
  }
  return s;
}

// ---------------------------------------------------------------------------
// A small builder for compute steps: applies sub-rolls to a working state and
// records the delta and the roll records.
// ---------------------------------------------------------------------------

class Step {
  readonly delta: Required<Pick<Delta, "attributes" | "skills" | "gear" | "loseGear" | "talents" | "favorsGained" | "notes">> & Delta = {
    attributes: {},
    skills: {},
    gear: [],
    loseGear: [],
    talents: [],
    favorsGained: [],
    notes: [],
  };
  readonly rolls: Obj[] = [];
  private n = 0;

  readonly ctx: ProcedureContext;
  readonly stepId: string;
  readonly rng: Rng;
  state: LifePathState;

  constructor(ctx: ProcedureContext, stepId: string, rng: Rng, state: LifePathState) {
    this.ctx = ctx;
    this.stepId = stepId;
    this.rng = rng;
    this.state = state;
  }

  private sub(): Rng {
    return this.rng.fork(`sub${this.n++}`);
  }

  private apply(d: Delta): void {
    this.state = applyDelta(this.state, d);
  }

  attrCap(): number {
    return this.state.android ? 8 : 5;
  }

  attrMin(): number {
    return this.state.android ? 1 : 2;
  }

  addAttribute(a: Attr, v: number): void {
    this.delta.attributes[a] = (this.delta.attributes[a] ?? 0) + v;
    this.apply({ attributes: { [a]: v } });
  }

  addSkill(s: Skill): void {
    this.delta.skills[s] = (this.delta.skills[s] ?? 0) + 1;
    this.apply({ skills: { [s]: 1 } });
  }

  addPsych(v: number): void {
    this.delta.psych = (this.delta.psych ?? 0) + v;
    this.apply({ psych: v });
  }

  addCash(v: number): void {
    this.delta.cash = (this.delta.cash ?? 0) + v;
    this.apply({ cash: v });
  }

  addGear(g: string): void {
    this.delta.gear.push(g);
    this.apply({ gear: [g] });
  }

  loseGear(g: string): void {
    this.delta.loseGear.push(g);
    this.apply({ loseGear: [g] });
  }

  addTalent(t: string): void {
    this.delta.talents.push(t);
    this.apply({ talents: [t] });
  }

  addFavor(f: string): void {
    this.delta.favorsGained.push(f);
    this.apply({ favorsGained: [f] });
  }

  note(text: string): void {
    this.delta.notes.push(text);
    this.apply({ notes: [text] });
  }

  setCareer(career: string): void {
    this.delta.career = career;
    this.apply({ career });
  }

  endCareer(): void {
    this.delta.careerEnded = true;
    this.apply({ careerEnded: true });
  }

  /** Roll on a module table, logging the record under this step. */
  table(tableId: string, label: string): Obj {
    const table = this.ctx.tables.get(tableId);
    if (!table) throw new Error(`alien.lifepath: unknown table "${tableId}"`);
    const record = rollTable(table, this.sub(), this.ctx.tables, { step: `${this.stepId}/${label}` });
    this.ctx.rolls.push(record);
    const result = isObj(record.result) ? record.result : { value: record.result };
    this.rolls.push({ roll: label, table: tableId, total: record.total, ...result });
    return result;
  }

  /** Unpushed skill roll: attribute + skill base dice; each 6 is a success. */
  skillTest(skill: Skill, label: string): number {
    const pool = Math.max(1, this.state.attributes[SKILL_ATTRIBUTE[skill]] + this.state.skills[skill]);
    const r = this.sub();
    const raw = Array.from({ length: pool }, () => r.int(1, 6));
    const successes = raw.filter((x) => x === 6).length;
    this.rolls.push({ roll: label, skill, dice: `${pool}d6`, raw, successes });
    return successes;
  }

  /** D6 × the career's paycheck. */
  paycheck(career: LifepathCareer, label: string): void {
    const r = this.sub();
    const die = r.int(1, 6);
    const amount = die * career.paycheck;
    this.rolls.push({ roll: label, dice: `1d6×${career.paycheck}`, raw: [die], cash: amount });
    this.addCash(amount);
  }

  /** One random general skill (+1), re-rolling skills already at 5. */
  generalSkill(label: string): void {
    for (let i = 0; i < REROLL_LIMIT; i++) {
      const res = this.table("alien.lifepath.general-skill", label);
      const s = res.skill as Skill;
      if (this.state.skills[s] < SKILL_MAX) {
        this.addSkill(s);
        return;
      }
    }
    this.note("A random general skill was lost: every roll hit a skill already at 5.");
  }

  /** One random career skill (+1, D3), re-rolling skills already at 5. */
  careerSkill(career: LifepathCareer, label: string): void {
    if (career.skills.every((s) => this.state.skills[s] >= SKILL_MAX)) {
      this.note(`No career skill gained (${label}): all three are already at 5.`);
      return;
    }
    for (let i = 0; i < REROLL_LIMIT; i++) {
      const res = this.table(careerSkillTableId(career.id), label);
      const s = res.skill as Skill;
      if (this.state.skills[s] < SKILL_MAX) {
        this.addSkill(s);
        return;
      }
    }
  }

  /** One roll on the career's D6 gear list (chapter 2), re-rolling items already held. */
  gearRoll(career: LifepathCareer, label: string): void {
    const list = careerGear(career.id);
    if (list.length === 0) return;
    if (list.every((g) => this.state.gear.includes(g))) {
      this.note(`No new gear (${label}): every item on the career list is already held.`);
      return;
    }
    const r = this.sub();
    for (let i = 0; i < REROLL_LIMIT * 3; i++) {
      const die = r.int(1, list.length);
      const item = list[die - 1]!;
      const held = this.state.gear.includes(item);
      this.rolls.push({ roll: label, dice: `1d${list.length}`, raw: [die], gear: item, ...(held ? { reroll: true } : {}) });
      if (!held) {
        this.addGear(item);
        return;
      }
    }
  }

  /** A favor (re-rolling favors already gained) and its effects. */
  favor(career: LifepathCareer, label: string): void {
    for (let i = 0; i < REROLL_LIMIT; i++) {
      const res = this.table("alien.lifepath.favors", label);
      const id = str(res.favor);
      if (this.state.favors.includes(id) && this.state.favors.length < 6) continue;
      this.addFavor(id);
      for (const n of strings(res.notes)) this.note(n);
      for (let k = 0; k < num(res.bonusGearRolls); k++) this.gearRoll(career, `${label}-gear`);
      for (let k = 0; k < num(res.generalSkills); k++) this.generalSkill(`${label}-general-skill`);
      for (let k = 0; k < num(res.careerSkills); k++) this.careerSkill(career, `${label}-career-skill`);
      for (let k = 0; k < num(res.bonusPaychecks); k++) this.paycheck(career, `${label}-paycheck`);
      return;
    }
  }

  /** A disaster and its effects. */
  disaster(label: string): void {
    for (let i = 0; i < REROLL_LIMIT; i++) {
      const res = this.table("alien.lifepath.disasters", label);
      const lose = strings(res.loseAttribute) as Attr[];
      if (lose.length > 0) {
        const choice = lowestUse(this, lose);
        // Re-roll a result that would take an attribute below the minimum (p. 282).
        if (!choice) continue;
        this.addAttribute(choice, -1);
      }
      if (res.loseRandomItem === true) {
        if (this.state.gear.length === 0) this.note("Lost something, but had nothing to lose yet.");
        else {
          const r = this.sub();
          this.loseGear(this.state.gear[r.int(0, this.state.gear.length - 1)]!);
        }
      }
      for (const n of strings(res.notes)) this.note(n);
      if (res.careerEnded === true) this.endCareer();
      return;
    }
  }

  result(extra: Obj): Obj {
    const out: Obj = { ...extra };
    const d = this.delta;
    if (Object.keys(d.attributes).length) out.attributes = d.attributes;
    if (Object.keys(d.skills).length) out.skills = d.skills;
    if (d.psych) out.psych = d.psych;
    if (d.cash) out.cash = d.cash;
    if (d.gear.length) out.gear = d.gear;
    if (d.loseGear.length) out.loseGear = d.loseGear;
    if (d.talents.length) out.talents = d.talents;
    if (d.favorsGained.length) out.favorsGained = d.favorsGained;
    if (d.notes.length) out.notes = d.notes;
    if (d.career) out.career = d.career;
    if (d.careerEnded) out.careerEnded = true;
    if (d.termServed) out.termServed = true;
    out.rolls = this.rolls;
    out.cumulative = summarize(this.state);
    return out;
  }
}

function summarize(s: LifePathState): Obj {
  return { attributes: { ...s.attributes }, skills: { ...s.skills }, psych: s.psych, cash: s.cash };
}

function careerGear(careerId: string): string[] {
  return careerItems.find((c) => c.id === careerId)?.gear ?? [];
}

function careerTalentIds(careerId: string): string[] {
  return careerTalents.filter((t) => t.career === careerId).map((t) => t.id);
}

function careerOf(id: string): LifepathCareer | undefined {
  return LIFEPATH_CAREERS.find((c) => c.id === id);
}

/** How many of the career's skills an attribute drives. */
function attributeUse(career: LifepathCareer | undefined, a: Attr): number {
  return career ? career.skills.filter((s) => SKILL_ATTRIBUTE[s] === a).length : 0;
}

/** Of the candidates above the minimum, the one the career uses least (highest score breaks ties). */
function lowestUse(step: Step, candidates: Attr[]): Attr | undefined {
  const career = careerOf(step.state.career);
  const ok = candidates.filter((a) => step.state.attributes[a] > step.attrMin());
  ok.sort((x, y) => attributeUse(career, x) - attributeUse(career, y) || step.state.attributes[y] - step.state.attributes[x]);
  return ok[0];
}

/** Attribute points still needed to meet a career's requirements. */
function shortfall(state: LifePathState, c: LifepathCareer): number {
  let need = 0;
  for (const [a, min] of Object.entries(c.requirements)) need += Math.max(0, num(min) - state.attributes[a as Attr]);
  return need;
}

function meetsRequirements(state: LifePathState, c: LifepathCareer): boolean {
  return shortfall(state, c) === 0;
}

function shuffled<T>(items: T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** The career skill with the biggest dice pool. */
function bestSkill(state: LifePathState, c: LifepathCareer): Skill {
  return [...c.skills].sort((x, y) => state.attributes[SKILL_ATTRIBUTE[y]] + state.skills[y] - (state.attributes[SKILL_ATTRIBUTE[x]] + state.skills[x]))[0]!;
}

// ---------------------------------------------------------------------------
// Step bodies
// ---------------------------------------------------------------------------

function careerStep(ctx: ProcedureContext, rng: Rng): Obj {
  const step = new Step(ctx, "career", rng, stateBefore(ctx, "career"));
  const requested = careerOf(str(ctx.inputs.career));
  const cap = step.attrCap();

  // Which career to aim for: the requested one when 2 points can meet its requirements.
  const reachable = LIFEPATH_CAREERS.filter((c) => shortfall(step.state, c) <= 2 && Object.entries(c.requirements).every(([, m]) => num(m) <= cap));
  let target = requested && reachable.includes(requested) ? requested : undefined;
  if (requested && !target) step.note(`Could not qualify for ${requested.name}; another career was chosen.`);
  if (!target) target = reachable[rng.fork("pick").int(0, reachable.length - 1)] ?? careerOf("kid")!;

  // 2 attribute points of choice: requirements first, then the attribute behind most career skills.
  for (let p = 0; p < 2; p++) {
    const need = (Object.entries(target.requirements) as Array<[Attr, number]>).find(([a, min]) => step.state.attributes[a] < min);
    let a: Attr | undefined = need?.[0];
    if (!a) {
      const open = ATTRIBUTES.filter((x) => step.state.attributes[x] < cap);
      open.sort((x, y) => attributeUse(target, y) - attributeUse(target, x) || step.state.attributes[x] - step.state.attributes[y]);
      a = open[0];
    }
    if (a) step.addAttribute(a, 1);
  }

  // Apply: Kids just choose the lifestyle; others roll one career skill, no push.
  let hired: LifepathCareer | undefined;
  let successes = 0;
  let fastOne = false;
  const applications: Obj[] = [];
  const order = [target, ...(requested ? [] : shuffled(LIFEPATH_CAREERS.filter((c) => c !== target), rng.fork("order")))];
  for (const c of order) {
    if (!meetsRequirements(step.state, c)) continue;
    if (c.noApplication) {
      hired = c;
      applications.push({ career: c.id, application: "none needed" });
      break;
    }
    const s = bestSkill(step.state, c);
    successes = step.skillTest(s, `apply-${c.id}`);
    applications.push({ career: c.id, skill: s, successes });
    if (successes > 0) {
      hired = c;
      break;
    }
  }
  if (!hired) {
    // Pull a fast one (p. 286): the failed roll counts as one success.
    hired = target;
    successes = 1;
    fastOne = true;
    step.note("Pulled a fast one to get hired: owes someone a big favor or hides a dangerous secret.");
  }
  step.setCareer(hired.id);

  // You're hired: 2 D3 career skills, a gear roll, the first paycheck.
  step.careerSkill(hired, "career-skill-1");
  step.careerSkill(hired, "career-skill-2");
  step.gearRoll(hired, "gear");
  step.paycheck(hired, "paycheck");
  // The charmed-life bonus gear roll uses this career's list (the book lets the player pick any).
  const bonus = num(obj(ctx, "lifeEvent").bonusGearRolls);
  for (let k = 0; k < bonus; k++) step.gearRoll(hired, "life-event-gear");
  if (!hired.noApplication && successes >= 2 && !fastOne) step.favor(hired, "favor");

  return step.result({ label: hired.name, applications, successes, pulledFastOne: fastOne });
}

function termStep(n: number) {
  const stepId = `term${n}`;
  return (ctx: ProcedureContext, rng: Rng): Obj => {
    const step = new Step(ctx, stepId, rng, stateBefore(ctx, stepId));
    const career = careerOf(step.state.career) ?? careerOf("kid")!;
    if (n > 1) {
      // Getting older: −1 to an attribute of choice for each extra term.
      const a = lowestUse(step, [...ATTRIBUTES]);
      if (a) step.addAttribute(a, -1);
    }
    // 1. Posting: D6 on the career table, +1 random career skill, maybe a bonus gear roll.
    const posting = step.table(postingTableId(career.id), "posting");
    step.careerSkill(career, "posting-career-skill");
    for (let k = 0; k < num(posting.bonusGearRolls); k++) step.gearRoll(career, "posting-gear");
    // 2. Performance: unpushed roll against the best career skill.
    const skill = bestSkill(step.state, career);
    const successes = step.skillTest(skill, "performance");
    let performance: string;
    if (successes === 0) {
      performance = "failed";
      step.disaster("disaster");
      step.addPsych(-1);
    } else if (successes === 1) {
      performance = "satisfactory";
    } else {
      performance = "excellent";
      step.favor(career, "favor");
      step.addPsych(1);
    }
    // 3. Talent: a random career talent not held yet.
    // Career talents are listed "choose or roll D3" (p. 31-39); re-roll talents already held.
    const talents = careerTalentIds(career.id);
    if (talents.some((t) => !step.state.talents.includes(t))) {
      const r = rng.fork("talent");
      for (let i = 0; i < REROLL_LIMIT * 3; i++) {
        const die = r.int(1, talents.length);
        const talent = talents[die - 1]!;
        const held = step.state.talents.includes(talent);
        step.rolls.push({ roll: "talent", dice: `1d${talents.length}`, raw: [die], talent, ...(held ? { reroll: true } : {}) });
        if (!held) {
          step.addTalent(talent);
          break;
        }
      }
    }
    // 4. Gear and paycheck.
    step.gearRoll(career, "gear");
    step.paycheck(career, "paycheck");
    step.delta.termServed = true;
    if (step.state.careerEnded) step.note(`Career as ${career.name} ended after term ${n}.`);
    return step.result({ label: `Term ${n}: ${str(posting.label)}`, posting: str(posting.label), performance, successes });
  };
}

function wantedTerms(ctx: ProcedureContext): number {
  const t = Math.floor(num(ctx.inputs.terms, 1));
  return clamp(Number.isFinite(t) ? t : 1, 1, MAX_TERMS);
}

function skipTerm(n: number) {
  return (ctx: ProcedureContext): boolean => {
    const s = stateBefore(ctx, `term${n}`);
    const career = careerOf(s.career);
    if (n === 1) return false;
    if (s.careerEnded) return true;
    if (n > Math.min(wantedTerms(ctx), career?.maxTerms ?? 1)) return true;
    // An extra term costs an attribute point; skip it if none can be spared.
    const min = s.android ? 1 : 2;
    return !ATTRIBUTES.some((a) => s.attributes[a] > min);
  };
}

function generalSkillsStep(stepId: string, count: (ctx: ProcedureContext) => number) {
  return (ctx: ProcedureContext, rng: Rng): Obj => {
    const step = new Step(ctx, stepId, rng, stateBefore(ctx, stepId));
    const n = count(ctx);
    for (let i = 0; i < n; i++) step.generalSkill(`general-skill-${i + 1}`);
    return step.result({ label: `${n} random general skill${n === 1 ? "" : "s"}` });
  };
}

/** Attach the running totals to a table step's result. */
function withCumulative(stepId: string) {
  return (ctx: ProcedureContext, result: unknown): unknown => {
    const base = isObj(result) ? result : { value: result };
    return { ...base, cumulative: summarize(applyDelta(stateBefore(ctx, stepId), base)) };
  };
}

const priorSteps = (id: (typeof STEP_ORDER)[number]): string[] => STEP_ORDER.slice(0, STEP_ORDER.indexOf(id));

export const lifepath: Procedure = {
  id: "alien.lifepath",
  name: "Life Path",
  description:
    "The appendix's life path generator: origin, early life, a life event, a career with one to three terms, and a psych evaluation, with every roll kept as provenance.",
  page: [282, 289],
  mode: ["campaign"],
  inputs: {
    type: "object",
    properties: {
      name: { type: "string", description: "Character name; a placeholder is used when absent." },
      career: {
        type: "string",
        enum: LIFEPATH_CAREERS.map((c) => c.id),
        description: "Career to apply for. When absent, one the PC can qualify for is picked at random.",
      },
      terms: { type: "integer", minimum: 1, maximum: MAX_TERMS, default: 1, description: "Terms to serve (1-3; Kids serve one)." },
    },
  },
  steps: [
    {
      id: "humanOrAndroid",
      title: "1. Human or android",
      page: 282,
      table: "alien.lifepath.human-or-android",
      after: (ctx, result, rng) => {
        const base: Obj = isObj(result) ? { ...result } : { value: result };
        if (base.android === true) {
          // Androids add +3 to two attributes of their choice before the life path.
          const picks = shuffled([...ATTRIBUTES], rng.fork("android")).slice(0, 2);
          base.attributes = Object.fromEntries(picks.map((a) => [a, 3]));
        }
        return withCumulative("humanOrAndroid")(ctx, base);
      },
    },
    { id: "origin", title: "2. Origin", page: 283, table: "alien.lifepath.origin", after: withCumulative("origin") },
    { id: "originSkills", title: "2. Origin: 3 random general skills", page: 286, reads: priorSteps("originSkills"), compute: generalSkillsStep("originSkills", () => 3) },
    { id: "earlyLife", title: "3. Early life: you were", page: 284, table: "alien.lifepath.early-life", after: withCumulative("earlyLife") },
    { id: "earlyLifeCompany", title: "3. Early life: in the company of", page: 284, table: "alien.lifepath.early-life.company", after: withCumulative("earlyLifeCompany") },
    { id: "earlyLifeExperience", title: "3. Early life: and experienced", page: 284, table: "alien.lifepath.early-life.experience", after: withCumulative("earlyLifeExperience") },
    {
      id: "lifeEvent",
      title: "4. Life event",
      page: 285,
      table: "alien.lifepath.life-event",
      after: (ctx, result, rng) => {
        const base: Obj = isObj(result) ? { ...result } : { value: result };
        const cashRoll = isObj(base.cashRoll) ? base.cashRoll : undefined;
        if (cashRoll) {
          const r = rng.fork("cash");
          const raw = [r.int(1, 6), r.int(1, 6)];
          const cash = (raw[0]! + raw[1]!) * num(cashRoll.multiplier, 50);
          base.cashRaw = raw;
          base.cash = cash;
        }
        return withCumulative("lifeEvent")(ctx, base);
      },
    },
    {
      id: "lifeEventSkills",
      title: "4. Life event: 2 random general skills",
      page: 286,
      reads: priorSteps("lifeEventSkills"),
      compute: generalSkillsStep("lifeEventSkills", (ctx) => 2 + num(obj(ctx, "lifeEvent").generalSkills)),
    },
    { id: "career", title: "5. Attribute points and career", page: 286, reads: priorSteps("career"), compute: careerStep },
    { id: "term1", title: "6. First term", page: 287, reads: priorSteps("term1"), compute: termStep(1) },
    { id: "term2", title: "7. Second term", page: 287, reads: priorSteps("term2"), skipIf: skipTerm(2), compute: termStep(2) },
    { id: "term3", title: "7. Third term", page: 287, reads: priorSteps("term3"), skipIf: skipTerm(3), compute: termStep(3) },
    {
      id: "psych",
      title: "8. Psych evaluation",
      page: [288, 289],
      table: "alien.lifepath.psych-evaluation",
      reads: priorSteps("psych"),
      modifier: (ctx) => stateBefore(ctx, "psych").psych,
      after: withCumulative("psych"),
    },
  ],
  produce: (ctx) => {
    const total = stateBefore(ctx, "__end__");
    const career = careerOf(total.career)?.id ?? "kid";
    const careerName = careerOf(career)?.name ?? career;
    const cap = total.android ? 8 : 5;
    const min = total.android ? 1 : 2;
    const attributes: Record<string, number> = {};
    for (const a of ATTRIBUTES) attributes[a] = clamp(total.attributes[a], min, cap);
    const skills: Record<string, number> = {};
    for (const s of SKILLS) skills[s] = clamp(total.skills[s], 0, SKILL_MAX);
    const lifePath: Record<string, unknown> = {};
    for (const id of STEP_ORDER) {
      const r = ctx.get(id);
      if (isObj(r)) {
        const { cumulative: _c, ...rest } = r;
        lifePath[id] = rest;
      }
    }
    lifePath.totals = { attributes: total.attributes, skills: total.skills, psych: total.psych, cash: total.cash, terms: total.terms };
    lifePath.notes = total.notes;
    const originRes = obj(ctx, "origin");
    const home = isObj(originRes.home) ? str(originRes.home.home) : "";
    const affiliation = isObj(originRes.subAffiliation) ? str(originRes.subAffiliation.subAffiliation) : "";
    const psych = str(obj(ctx, "psych").label);
    const givenName = ctx.inputs.name;
    const name = typeof givenName === "string" && givenName.trim() !== "" ? givenName.trim() : `New ${careerName.toLowerCase()}`;
    const from = [str(originRes.supernation), affiliation, home].filter(Boolean).join(", ");
    return {
      entities: [
        {
          tempId: "pc",
          type: "alien.character",
          name,
          summary: `${total.android ? "Android" : "Human"} ${careerName.toLowerCase()} (${from || "unknown origin"}). Psych evaluation: ${psych || "none"}.`,
          tags: ["pc", career],
          fields: {
            isPC: true,
            android: total.android,
            career,
            attributes,
            skills,
            talents: total.talents.map((id) => ({ id, count: 1 })),
            stress: 0,
            personalAgenda: "",
            agendas: [],
            gear: total.gear.map((g) => ({ name: g, weight: 1, qty: 1 })),
            signatureItem: "",
            cash: total.cash,
            storyPoints: 0,
            xp: 0,
            trait: "",
            goal: "",
            appearance: "",
            buddy: "",
            rival: "",
            criticalInjuries: [],
            mentalTraumas: [],
            lifePath,
          },
        },
      ],
      relationships: [],
    };
  },
};
