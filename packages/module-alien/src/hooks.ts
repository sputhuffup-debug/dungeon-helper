import type { ClockAdvanceContext, Effect, ModuleHooks, Prompt, SessionEndContext } from "@campaign-forge/module-sdk";
import { CRITICAL_INJURY_CONDITION, PANIC_TRAUMA_THRESHOLD } from "./dice/operations";
import { criticalInjuryItems } from "./reference/criticalInjuries";
import { CAMPAIGN, CINEMATIC } from "./modes";
import { PANIC_ATTACKS_TRAUMA } from "./reference/mentalTraumas";
import { STRESS_TRACKER } from "./trackers";
import { XP_AWARDS } from "./progression";

/** A panic result of 9+ in a session calls for a trauma check afterwards (p. 74). */
export const TRAUMA_THRESHOLD = PANIC_TRAUMA_THRESHOLD;
/** With the Panic Attacks trauma, any panic result of 1+ calls for the check (p. 74). */
export const PANIC_ATTACKS_THRESHOLD = 1;

/**
 * The nine XP questions of campaign play (p. 30), paraphrased; each yes is one
 * XP. They live in the module's `progression` award checklist (the wrap-up's
 * Rewards step), not in the end-of-session prompts. Ids without the prefix.
 */
export const XP_QUESTIONS: Array<{ id: string; text: string }> = XP_AWARDS.map((q) => ({ id: q.id.replace(/^alien\.award\./, ""), text: q.text }));

interface PanicLogEntry {
  entity?: string;
  character?: string;
  total?: number;
  label?: string;
}

function panicLogFor(ctx: SessionEndContext): PanicLogEntry[] {
  const state = ctx.trackerState[STRESS_TRACKER];
  if (!state || typeof state !== "object") return [];
  const log = (state as { panicLog?: unknown }).panicLog;
  return Array.isArray(log) ? (log.filter((e) => e && typeof e === "object") as PanicLogEntry[]) : [];
}

/** True when the character carries the Panic Attacks trauma (by id, or as a mental-trauma condition id). */
function hasPanicAttacks(fields: Record<string, unknown>): boolean {
  const list = fields.mentalTraumas;
  if (!Array.isArray(list)) return false;
  return list.some((t) => {
    const id = t && typeof t === "object" ? (t as { id?: unknown }).id : t;
    return id === PANIC_ATTACKS_TRAUMA || id === `mental-trauma:${PANIC_ATTACKS_TRAUMA}`;
  });
}

/** Highest panic total logged this session per character id. */
function highestPanic(ctx: SessionEndContext): Map<string, number> {
  const best = new Map<string, number>();
  for (const entry of panicLogFor(ctx)) {
    const id = entry.entity ?? entry.character;
    if (!id || typeof entry.total !== "number") continue;
    best.set(id, Math.max(best.get(id) ?? Number.NEGATIVE_INFINITY, entry.total));
  }
  return best;
}

/**
 * Mental trauma check (p. 74): after a session with a panic result of 9+ (1+ with
 * Panic Attacks), roll Empathy alone, no push; a failure means a D66 mental trauma.
 * Androids never panic, so they are skipped.
 */
export function traumaPrompts(ctx: SessionEndContext): Prompt[] {
  const best = highestPanic(ctx);
  const prompts: Prompt[] = [];
  for (const c of ctx.characters) {
    if (c.fields.android === true) continue;
    const total = best.get(c.id);
    if (total === undefined) continue;
    const threshold = hasPanicAttacks(c.fields) ? PANIC_ATTACKS_THRESHOLD : TRAUMA_THRESHOLD;
    if (total < threshold) continue;
    prompts.push({
      id: `alien.trauma-check:${c.id}`,
      kind: "roll",
      text: `${c.name} had a panic result of ${threshold}+ this session. Roll Empathy (attribute only, no push); on a failure, roll for mental trauma.`,
      page: 74,
      entity: c.id,
      roll: { operation: "mentalTrauma", table: "alien.character.mental-trauma" },
      options: [
        { id: "passed", label: "Empathy roll succeeded: no trauma", effects: [{ kind: "log", text: `${c.name} shook it off (p. 74).` }] },
        {
          id: "failed",
          label: "Empathy roll failed: roll mental trauma",
          effects: [
            {
              kind: "prompt",
              prompt: {
                id: `alien.trauma-roll:${c.id}`,
                kind: "roll",
                text: `Roll on the mental trauma table for ${c.name}.`,
                page: 74,
                entity: c.id,
                roll: { operation: "mentalTrauma", table: "alien.character.mental-trauma" },
              },
            },
          ],
        },
      ],
    });
  }
  return prompts;
}

/**
 * End-of-session prompts: the mental trauma checks (p. 74). XP (campaign,
 * p. 30) and Story Points (cinematic, per act, p. 158) are awarded from the
 * progression award checklist instead, so they land in the advancement log.
 */
export function onSessionEnd(ctx: SessionEndContext): Prompt[] {
  if (ctx.mode !== CINEMATIC && ctx.mode !== CAMPAIGN) return [];
  return traumaPrompts(ctx);
}

export function onEntityChange(_ctx: { mode: string }, entity: { id: string; type: string; fields: Record<string, unknown> }): Effect[] {
  if (entity.type !== "alien.character") return [];
  const effects: Effect[] = [];
  const stress = entity.fields.stress;
  if (typeof stress === "number" && stress < 0) {
    effects.push({ kind: "setField", entity: entity.id, path: "stress", value: 0 });
  }
  const sp = entity.fields.storyPoints;
  if (typeof sp === "number" && sp > 3) effects.push({ kind: "setField", entity: entity.id, path: "storyPoints", value: 3 });
  if (typeof sp === "number" && sp < 0) effects.push({ kind: "setField", entity: entity.id, path: "storyPoints", value: 0 });
  return effects;
}

/** Condition marking a lethal critical injury stabilised by first aid: no more death rolls for it (p. 71). */
export const STABILISED_CONDITION = "critical-injury-stabilised:";
/** Condition set when a death roll fails (p. 71). */
export const DEAD_CONDITION = "alien.dead";

/**
 * Death rolls (p. 68, 71): a lethal critical injury calls for a death roll
 * (Stamina, no push, no stress dice) after each of its time limits, unless
 * first aid stabilised it. Each time the table clock passes that unit (a
 * round, a stretch, a shift), every character carrying such an injury gets
 * a prompt: survived, stabilised, or dead.
 */
export function deathRollPrompts(ctx: ClockAdvanceContext): Prompt[] {
  const out: Prompt[] = [];
  for (const e of ctx.entities) {
    if (e.conditions.includes(DEAD_CONDITION)) continue;
    for (const id of e.conditions) {
      if (!id.startsWith(CRITICAL_INJURY_CONDITION)) continue;
      const roll = Number(id.slice(CRITICAL_INJURY_CONDITION.length));
      const injury = criticalInjuryItems.find((c) => c.roll === roll);
      if (!injury?.fatal || injury.instantDeath || !injury.timeLimit || !ctx.units.includes(injury.timeLimit)) continue;
      if (e.conditions.includes(`${STABILISED_CONDITION}${roll}`)) continue;
      const count = ctx.counters[injury.timeLimit] ?? 0;
      out.push({
        id: `alien.death-roll:${e.id}:${roll}:${injury.timeLimit}:${count}`,
        kind: "choice",
        text: `${e.name}: ${injury.name} is lethal. Make a death roll now: Stamina, no push, no stress dice; a failure kills. First aid stabilises (a failed attempt shortens the time limit a step).`,
        page: [68, 71],
        entity: e.id,
        options: [
          { id: "survived", label: "Death roll made: still alive", effects: [{ kind: "log", text: `${e.name} made a death roll (${injury.name}).` }] },
          {
            id: "stabilised",
            label: "Stabilised by first aid",
            effects: [
              { kind: "addCondition", entity: e.id, condition: { id: `${STABILISED_CONDITION}${roll}`, label: `Stabilised: ${injury.name}`, page: 71 } },
              { kind: "log", text: `${e.name}'s ${injury.name} is stabilised: no more death rolls for it.` },
            ],
          },
          {
            id: "dead",
            label: "Death roll failed: dead",
            effects: [
              { kind: "addCondition", entity: e.id, condition: { id: DEAD_CONDITION, label: "Dead", page: 71 } },
              { kind: "log", text: `${e.name} died of ${injury.name}.` },
            ],
          },
        ],
      });
    }
  }
  return out;
}

export function onClockAdvance(ctx: ClockAdvanceContext): Prompt[] {
  return deathRollPrompts(ctx);
}

export const hooks: ModuleHooks = { onSessionEnd, onEntityChange, onClockAdvance };
