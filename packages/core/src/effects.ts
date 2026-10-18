/**
 * Apply module-declared effects to campaign data. Effects are data; the
 * core applies them and records what it did. Prompt effects are returned
 * for the UI to answer (their own effects come back through applyEffects).
 */
import type { Effect, Prompt } from "@campaign-forge/module-sdk";
import { now } from "./ids";
import { clone, getPath, setPath } from "./paths";
import type { CampaignStore } from "./store";
import { appendTrackerLog } from "./trackers";
import type { AppliedEffect, Entity, Id } from "./types";

export interface EffectContext {
  sessionId?: Id;
}

export interface ApplyEffectsResult {
  applied: AppliedEffect[];
  prompts: Prompt[];
  /** Effects that could not be applied (for example an unknown entity). */
  skipped: Array<{ effect: Effect; reason: string }>;
}

function describe(effect: Effect, entity?: Entity): string {
  const who = entity ? entity.name : "entity" in effect ? effect.entity : "";
  switch (effect.kind) {
    case "setField":
      return `${who}: ${effect.path} = ${JSON.stringify(effect.value)}`;
    case "incrementField":
      return `${who}: ${effect.path} ${effect.by >= 0 ? "+" : ""}${effect.by}`;
    case "addCondition":
      return `${who}: gained ${effect.condition.label}`;
    case "removeCondition":
      return `${who}: lost condition ${effect.conditionId}`;
    case "log":
      return effect.text;
    case "prompt":
      return effect.prompt.text;
  }
}

export function applyEffects(store: CampaignStore, effects: Effect[], ctx: EffectContext = {}): ApplyEffectsResult {
  const applied: AppliedEffect[] = [];
  const prompts: Prompt[] = [];
  const skipped: ApplyEffectsResult["skipped"] = [];
  const session = ctx.sessionId !== undefined && store.has("sessions", ctx.sessionId) ? ctx.sessionId : undefined;

  store.transact(() => {
    for (const effect of effects) {
      if (effect.kind === "prompt") {
        prompts.push(effect.prompt);
        continue;
      }
      const at = now();
      let entity: Entity | undefined;
      if (effect.kind !== "log") {
        entity = store.get("entities", effect.entity);
        if (!entity) {
          skipped.push({ effect, reason: `entities/${effect.entity} not found` });
          continue;
        }
      }
      switch (effect.kind) {
        case "setField": {
          const fields = setPath(clone(entity!.fields), effect.path, clone(effect.value));
          store.update("entities", entity!.id, { fields });
          break;
        }
        case "incrementField": {
          const current = getPath(entity!.fields, effect.path);
          const base = typeof current === "number" ? current : 0;
          let next = base + effect.by;
          if (effect.min !== undefined) next = Math.max(effect.min, next);
          if (effect.max !== undefined) next = Math.min(effect.max, next);
          const fields = setPath(clone(entity!.fields), effect.path, next);
          store.update("entities", entity!.id, { fields });
          break;
        }
        case "addCondition": {
          const conditions = [...(entity!.conditions ?? [])];
          if (!conditions.some((c) => c.id === effect.condition.id)) {
            conditions.push({ ...clone(effect.condition), since: at });
            store.update("entities", entity!.id, { conditions });
          }
          break;
        }
        case "removeCondition": {
          const conditions = (entity!.conditions ?? []).filter((c) => c.id !== effect.conditionId);
          store.update("entities", entity!.id, { conditions });
          break;
        }
        case "log":
          break;
      }
      const record: AppliedEffect = { at, effect };
      if (session !== undefined) {
        record.session = session;
        const logEntry: { tracker: string; text: string; entity?: Id; data?: unknown; at?: string } = {
          tracker: effect.kind === "log" ? "log" : "effects",
          text: describe(effect, entity),
          data: effect,
          at,
        };
        if (entity) logEntry.entity = entity.id;
        appendTrackerLog(store, session, logEntry);
      }
      applied.push(record);
    }
  });
  return { applied, prompts, skipped };
}
