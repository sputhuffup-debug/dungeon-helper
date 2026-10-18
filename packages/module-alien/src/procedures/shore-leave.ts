/**
 * Shore leave week (p. 257-258). Each character picks heal, recover,
 * pursue-agenda or socialize. Socialising characters roll on the marine or
 * the general event table; the others get a computed outcome. Produces no
 * entities; `results.outcomes` holds one outcome per character and
 * `results.effects` holds Effect-shaped suggestions for the GM to accept.
 */
import type { Effect, Procedure, ProcedureContext } from "@campaign-forge/module-sdk";
import { isObj, list, num, str } from "./helpers";

export interface ShoreLeaveCharacter {
  id: string;
  name: string;
  choice: "heal" | "recover" | "pursue-agenda" | "socialize";
  isMarine: boolean;
}

export interface ShoreLeaveOutcome {
  id: string;
  name: string;
  choice: ShoreLeaveCharacter["choice"];
  summary: string;
  event?: Record<string, unknown>;
}

function characters(ctx: ProcedureContext): ShoreLeaveCharacter[] {
  const raw = ctx.inputs.characters;
  if (!Array.isArray(raw)) return [];
  return raw.filter(isObj).map((c, i) => ({
    id: str(c.id, `pc-${i + 1}`),
    name: str(c.name, `Character ${i + 1}`),
    choice: (["heal", "recover", "pursue-agenda", "socialize"].includes(str(c.choice)) ? str(c.choice) : "recover") as ShoreLeaveCharacter["choice"],
    isMarine: c.isMarine === true,
  }));
}

const socialising = (ctx: ProcedureContext, marine: boolean) => characters(ctx).filter((c) => c.choice === "socialize" && c.isMarine === marine);

export const shoreLeave: Procedure = {
  id: "alien.shore-leave",
  name: "Shore leave week",
  description: "Resolve a week of shore leave: heal, recover, pursue an agenda or socialise, per character.",
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
            choice: { type: "string", enum: ["heal", "recover", "pursue-agenda", "socialize"] },
            isMarine: { type: "boolean", default: false },
          },
          required: ["id", "name", "choice"],
        },
      },
    },
  },
  steps: [
    {
      id: "marineEvents",
      title: "Events for socialising marines",
      table: "alien.shore-leave.marines",
      repeat: (ctx) => socialising(ctx, true).length,
      skipIf: (ctx) => socialising(ctx, true).length === 0,
    },
    {
      id: "otherEvents",
      title: "Events for everyone else socialising",
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
        return characters(ctx).map((c) => {
          switch (c.choice) {
            case "heal":
              return { ...c, summary: "Spends the week in medical care: one critical injury heals and the character recovers fully." };
            case "recover":
              return { ...c, summary: "Rests and unwinds: stress drops to zero and one mental trauma may be treated." };
            case "pursue-agenda":
              return { ...c, summary: "Works toward the personal agenda: earns XP and may trade a favour." };
            default: {
              const event = c.isMarine ? marineEvents[m++] : otherEvents[o++];
              return { ...c, summary: str(event?.event, str(event?.label, "Nothing of note")), event: event ?? {} };
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
        const effects: Effect[] = [];
        for (const oc of outcomes) {
          switch (oc.choice) {
            case "heal":
              effects.push({ kind: "setField", entity: oc.id, path: "stress", value: 0 });
              effects.push({
                kind: "prompt",
                prompt: {
                  id: `shore-leave:heal:${oc.id}`,
                  kind: "yesno",
                  text: `${oc.name} spent the week healing. Remove one critical injury?`,
                  page: 257,
                  entity: oc.id,
                  onYes: [{ kind: "log", text: `${oc.name}: a critical injury healed during shore leave.` }],
                },
              });
              break;
            case "recover":
              effects.push({ kind: "setField", entity: oc.id, path: "stress", value: 0 });
              effects.push({
                kind: "prompt",
                prompt: {
                  id: `shore-leave:recover:${oc.id}`,
                  kind: "yesno",
                  text: `${oc.name} rested all week. Treat one mental trauma?`,
                  page: 257,
                  entity: oc.id,
                  onYes: [{ kind: "log", text: `${oc.name}: a mental trauma was treated during shore leave.` }],
                },
              });
              break;
            case "pursue-agenda":
              effects.push({ kind: "incrementField", entity: oc.id, path: "xp", by: 1, min: 0 });
              effects.push({ kind: "log", text: `${oc.name} pursued their personal agenda during shore leave.` });
              break;
            default: {
              const ev = oc.event ?? {};
              effects.push({ kind: "log", text: `${oc.name} socialised: ${oc.summary}.` });
              const stress = num(ev.stress);
              if (stress !== 0) effects.push({ kind: "incrementField", entity: oc.id, path: "stress", by: stress, min: 0 });
              const cash = num(ev.cash);
              if (cash !== 0) effects.push({ kind: "incrementField", entity: oc.id, path: "cash", by: cash });
              if (isObj(ev.trouble)) effects.push({ kind: "log", text: `${oc.name}: ${str(ev.trouble.label)}.` });
              if (isObj(ev.rumor)) effects.push({ kind: "log", text: `${oc.name} heard: ${str(ev.rumor.label)}.` });
            }
          }
        }
        return effects;
      },
    },
  ],
  produce: () => ({ entities: [], relationships: [] }),
};
