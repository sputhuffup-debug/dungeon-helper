import type { Effect, ModuleHooks, Prompt, SessionEndContext } from "@campaign-forge/module-sdk";
import { CAMPAIGN, CINEMATIC } from "./modes";
import { STRESS_TRACKER } from "./trackers";

export const TRAUMA_THRESHOLD = 9;

/** Nine XP questions, paraphrased as short generic lines (p. 30). Each yes = 1 XP. */
export const XP_QUESTIONS: Array<{ id: string; text: string }> = [
  { id: "participated", text: "Did you take part in the session?" },
  { id: "agenda", text: "Did you act on your personal agenda?" },
  { id: "buddy", text: "Did you help your buddy?" },
  { id: "rival", text: "Did you get the better of your rival, or hold back when you could have hurt them?" },
  { id: "risk", text: "Did you put yourself at real risk for the crew?" },
  { id: "learned", text: "Did you learn something new about the world or the threat?" },
  { id: "pushed", text: "Did you push a roll when it mattered?" },
  { id: "stress", text: "Did you survive a panic roll or help someone through one?" },
  { id: "story", text: "Did you do something the whole table will remember?" },
];

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

export function xpPrompts(character: { id: string; name: string }): Prompt[] {
  return XP_QUESTIONS.map((q) => ({
    id: `alien.xp.${q.id}:${character.id}`,
    kind: "yesno",
    text: `${character.name}: ${q.text}`,
    page: 30,
    entity: character.id,
    onYes: [{ kind: "incrementField", entity: character.id, path: "xp", by: 1, min: 0 }],
  }));
}

export function traumaPrompts(ctx: SessionEndContext): Prompt[] {
  const log = panicLogFor(ctx);
  const flagged = new Set<string>();
  for (const entry of log) {
    const id = entry.entity ?? entry.character;
    if (id && typeof entry.total === "number" && entry.total >= TRAUMA_THRESHOLD) flagged.add(id);
  }
  const prompts: Prompt[] = [];
  for (const c of ctx.characters) {
    if (!flagged.has(c.id)) continue;
    if (c.fields.android === true) continue;
    prompts.push({
      id: `alien.trauma-check:${c.id}`,
      kind: "roll",
      text: `${c.name} had a panic result of ${TRAUMA_THRESHOLD}+ this session. Roll Empathy; on a failure, roll for mental trauma.`,
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

export function onSessionEnd(ctx: SessionEndContext): Prompt[] {
  if (ctx.mode === CINEMATIC) {
    // Story Points reset per act, not per session; nothing to ask here. Offer a reset for convenience.
    return [
      {
        id: "alien.cinematic.reset-story-points",
        kind: "yesno",
        text: "Reset every character's Story Points to 0 for the next act?",
        page: 44,
        onYes: ctx.characters.map<Effect>((c) => ({ kind: "setField", entity: c.id, path: "storyPoints", value: 0 })),
      },
    ];
  }
  if (ctx.mode !== CAMPAIGN) return [];
  const pcs = ctx.characters.filter((c) => c.fields.isPC !== false);
  return [...pcs.flatMap((c) => xpPrompts(c)), ...traumaPrompts(ctx)];
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

export const hooks: ModuleHooks = { onSessionEnd, onEntityChange };
