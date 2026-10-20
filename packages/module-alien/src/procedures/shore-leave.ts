/**
 * Shore leave week (p. 257-258). For each week of shore leave every PC picks
 * one activity:
 *  - Heal: time passes for critical injuries to heal (p. 71).
 *  - Recover: an Empathy roll (attribute only, cannot be pushed); success
 *    removes one mental trauma (p. 74).
 *  - Pursue Agenda: work on the personal agenda (p. 27); success gives 1 XP.
 *  - Socialize: roll once on the Colonial Marines or the "others" event table.
 * The PCs also pay weekly living expenses (p. 116), and a week resting in a
 * safe place clears stress (p. 73).
 *
 * Produces no entities; `results.outcomes` holds one outcome per character
 * and `results.effects` holds Effect-shaped suggestions for the GM to accept.
 * Rolls the procedure cannot make (Empathy, agenda success) become prompts.
 */
import type { Effect, Procedure, ProcedureContext } from "@campaign-forge/module-sdk";
import { input, isObj, list, str } from "./helpers";
import { SHORE_LEAVE_AGENDA_AWARD } from "../progression";

export const SHORE_LEAVE_CHOICES = ["heal", "recover", "pursue-agenda", "socialize"] as const;
export type ShoreLeaveChoice = (typeof SHORE_LEAVE_CHOICES)[number];

/** Weekly living expenses by standard (p. 116). */
export const LIVING_EXPENSES: Record<string, number> = { minimum: 25, basic: 100, normal: 300, luxurious: 2000 };

export interface ShoreLeaveCharacter {
  id: string;
  name: string;
  choice: ShoreLeaveChoice;
  isMarine: boolean;
}

export interface ShoreLeaveOutcome {
  id: string;
  name: string;
  choice: ShoreLeaveChoice;
  summary: string;
  event?: Record<string, unknown>;
}

function characters(ctx: ProcedureContext): ShoreLeaveCharacter[] {
  const raw = ctx.inputs.characters;
  if (!Array.isArray(raw)) return [];
  return raw.filter(isObj).map((c, i) => ({
    id: str(c.id, `pc-${i + 1}`),
    name: str(c.name, `Character ${i + 1}`),
    choice: ((SHORE_LEAVE_CHOICES as readonly string[]).includes(str(c.choice)) ? str(c.choice) : "recover") as ShoreLeaveChoice,
    isMarine: c.isMarine === true,
  }));
}

const socialising = (ctx: ProcedureContext, marine: boolean) => characters(ctx).filter((c) => c.choice === "socialize" && c.isMarine === marine);

function livingStandard(ctx: ProcedureContext): string {
  const s = str(input(ctx, "livingStandard"), "normal");
  return LIVING_EXPENSES[s] !== undefined ? s : "normal";
}

/** "Label: sub-roll label" for events with a D6 sub-roll. */
function eventSummary(event: Record<string, unknown> | undefined): string {
  if (!event) return "Nothing of note";
  const base = str(event.event, str(event.label, "Nothing of note"));
  return isObj(event.detail) ? `${base}: ${str(event.detail.label)}` : base;
}

export const shoreLeave: Procedure = {
  id: "alien.shore-leave",
  name: "Shore leave week",
  description: "Resolve a week of shore leave: each PC heals, recovers, pursues their agenda or socializes, and pays living expenses.",
  page: [257, 258],
  mode: ["campaign"],
  inputs: {
    type: "object",
    properties: {
      characters: {
        type: "array",
        default: [],
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            choice: { type: "string", enum: [...SHORE_LEAVE_CHOICES] },
            isMarine: { type: "boolean", default: false, description: "Colonial Marines roll on their own event table." },
          },
          required: ["id", "name", "choice"],
        },
      },
      livingStandard: {
        type: "string",
        enum: Object.keys(LIVING_EXPENSES),
        default: "normal",
        description: "Weekly living expenses: minimum $25, basic $100, normal $300, luxurious $2,000 (p. 116).",
      },
    },
  },
  steps: [
    {
      id: "marineEvents",
      title: "Shore leave events, Colonial Marines",
      page: 257,
      table: "alien.shore-leave.marines",
      repeat: (ctx) => socialising(ctx, true).length,
      skipIf: (ctx) => socialising(ctx, true).length === 0,
    },
    {
      id: "otherEvents",
      title: "Shore leave events, others",
      page: 258,
      table: "alien.shore-leave.others",
      repeat: (ctx) => socialising(ctx, false).length,
      skipIf: (ctx) => socialising(ctx, false).length === 0,
    },
    {
      id: "outcomes",
      title: "Per-character outcomes",
      reads: ["marineEvents", "otherEvents"],
      compute: (ctx): ShoreLeaveOutcome[] => {
        const marineEvents = list(ctx, "marineEvents");
        const otherEvents = list(ctx, "otherEvents");
        let m = 0;
        let o = 0;
        return characters(ctx).map((c): ShoreLeaveOutcome => {
          switch (c.choice) {
            case "heal":
              return { ...c, summary: "Rests so critical injuries can heal: a week of healing time passes (p. 71)." };
            case "recover":
              return { ...c, summary: "Tries to work through a mental trauma: Empathy roll, no pushing; success removes one trauma (p. 74)." };
            case "pursue-agenda":
              return { ...c, summary: "Pursues the personal agenda; success earns 1 XP (p. 27)." };
            default: {
              const event = c.isMarine ? marineEvents[m++] : otherEvents[o++];
              return { ...c, summary: eventSummary(event), event: event ?? {} };
            }
          }
        });
      },
    },
    {
      id: "effects",
      title: "Suggested effects",
      reads: ["outcomes"],
      compute: (ctx): Effect[] => {
        const outcomes = ctx.get<ShoreLeaveOutcome[]>("outcomes") ?? [];
        const standard = livingStandard(ctx);
        const cost = LIVING_EXPENSES[standard]!;
        const effects: Effect[] = [];
        for (const oc of outcomes) {
          effects.push({ kind: "setField", entity: oc.id, path: "stress", value: 0 });
          effects.push({ kind: "incrementField", entity: oc.id, path: "cash", by: -cost });
          switch (oc.choice) {
            case "heal":
              effects.push({
                kind: "prompt",
                prompt: {
                  id: `shore-leave:heal:${oc.id}`,
                  kind: "yesno",
                  text: `${oc.name} spent the week healing. Count seven days of healing time on each critical injury (days tended by a Nurse count double)?`,
                  page: 71,
                  entity: oc.id,
                  onYes: [{ kind: "log", text: `${oc.name}: a week of healing time passed for critical injuries.` }],
                },
              });
              break;
            case "recover":
              effects.push({
                kind: "prompt",
                prompt: {
                  id: `shore-leave:recover:${oc.id}`,
                  kind: "yesno",
                  text: `${oc.name} tried to recover. Roll Empathy (attribute only, cannot be pushed). Did it succeed? If so, remove one mental trauma.`,
                  page: 257,
                  entity: oc.id,
                  onYes: [{ kind: "log", text: `${oc.name}: one mental trauma removed during shore leave.` }],
                },
              });
              break;
            case "pursue-agenda":
              effects.push({
                kind: "prompt",
                prompt: {
                  id: `shore-leave:agenda:${oc.id}`,
                  kind: "yesno",
                  text: `${oc.name} pursued their personal agenda. Was it successfully pursued?`,
                  page: 257,
                  entity: oc.id,
                  onYes: [
                    // logged in the advancement log through the progression's downtime award (p. 257)
                    { kind: "award", entity: oc.id, question: SHORE_LEAVE_AGENDA_AWARD, reason: "Pursued their personal agenda during shore leave" },
                    { kind: "log", text: `${oc.name} pursued their personal agenda during shore leave and gains 1 XP.` },
                  ],
                },
              });
              break;
            default:
              effects.push({ kind: "log", text: `${oc.name} socialized: ${oc.summary}.` });
          }
        }
        if (outcomes.length > 0) effects.push({ kind: "log", text: `Shore leave week at ${standard} living standard: $${cost} per PC (p. 116).` });
        return effects;
      },
    },
  ],
  produce: () => ({ entities: [], relationships: [] }),
};
