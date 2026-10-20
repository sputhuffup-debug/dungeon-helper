/**
 * Apply module-declared effects to campaign data. Effects are data; the
 * core applies them and records what it did. Prompt effects are returned
 * for the UI to answer (their own effects come back through applyEffects).
 */
import type { ApplyPresetEffect, CreateFromPresetEffect, CurrencyDef, Effect, EntityPreset, LedgerLinks, Prompt } from "@campaign-forge/module-sdk";
import { postAward, type AdvancementModule } from "./advancement";
import { postLedgerEffect } from "./ledger";
import { presetToEntity, type PresetOverrides } from "./generation";
import { now } from "./ids";
import { clone, getPath, setPath } from "./paths";
import type { CampaignStore } from "./store";
import { appendTrackerLog } from "./trackers";
import type { AppliedEffect, Entity, Id } from "./types";

export interface EffectContext {
  sessionId?: Id;
  /** Resolves module presets for `createFromPreset` and `applyPreset` (e.g. `loadedModule.preset`). */
  preset?: (id: string) => EntityPreset | undefined;
  /** Links merged into every `ledger` effect's links (e.g. the travel leg or procedure run that posted it). */
  ledgerLinks?: LedgerLinks;
  /** Recorded as each ledger entry's source. */
  ledgerSource?: { kind: "procedure" | "travel" | "payout" | "effect"; id?: Id };
  /** Rounds ledger amounts to the module currency. */
  currency?: Pick<CurrencyDef, "decimals">;
  /** The module's progression (and lookups) for `award` effects; without it they are skipped. */
  advancement?: AdvancementModule;
}

export interface ApplyEffectsResult {
  applied: AppliedEffect[];
  prompts: Prompt[];
  /** Effects that could not be applied (for example an unknown entity). */
  skipped: Array<{ effect: Effect; reason: string }>;
  /** Entities created by `createFromPreset`, keyed by the effect's tempId (or its id). */
  created: Record<string, Id>;
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
    case "createFromPreset":
      return `${who || effect.name || effect.preset}: created from preset ${effect.preset}`;
    case "applyPreset":
      return `${who}: now preset ${effect.preset}`;
    case "ledger":
      return `Ledger: ${effect.amount >= 0 ? "+" : ""}${effect.amount} (${effect.category}) ${effect.note}`.trim();
    case "award":
      return `${who}: award ${effect.question ?? `${effect.amount ?? 1} ${effect.pool ?? "experience"}`}${effect.reason ? ` (${effect.reason})` : ""}`;
  }
}

function createFromPreset(store: CampaignStore, effect: CreateFromPresetEffect, preset: EntityPreset, resolve: (ref: string) => Id | undefined): Entity {
  const overrides: PresetOverrides = {};
  if (effect.name !== undefined) overrides.name = effect.name;
  if (effect.fields !== undefined) overrides.fields = effect.fields;
  if (effect.tags !== undefined) overrides.tags = [...new Set([...(preset.tags ?? []), ...effect.tags])];
  if (effect.id !== undefined) overrides.id = effect.id;
  const entity = presetToEntity(store, preset, overrides);
  const at = now();
  store.update("entities", entity.id, { provenance: { ...(entity.provenance ?? {}), presetHistory: [{ preset: preset.id, at }] } });
  if (effect.link) {
    const to = resolve(effect.link.to);
    if (to !== undefined) store.createRelationship(effect.link.type, entity.id, to, effect.link.note);
  }
  return store.get("entities", entity.id)!;
}

function applyPreset(store: CampaignStore, effect: ApplyPresetEffect, entity: Entity, preset: EntityPreset): void {
  const fields = clone(preset.fields);
  for (const path of effect.keep ?? []) {
    const v = getPath(entity.fields, path);
    if (v !== undefined) setPath(fields, path, clone(v));
  }
  const prov = entity.provenance ?? {};
  const history = prov.presetHistory ?? (prov.preset ? [{ preset: prov.preset, at: entity.created }] : []);
  const patch: Partial<Entity> = {
    fields,
    tags: [...new Set([...entity.tags, ...(preset.tags ?? [])])],
    provenance: { ...prov, preset: preset.id, presetHistory: [...history, { preset: preset.id, at: now() }] },
  };
  if (preset.summary !== undefined) patch.summary = preset.summary;
  if (preset.subtype !== undefined) patch.subtype = preset.subtype;
  store.update("entities", entity.id, patch);
}

export function applyEffects(store: CampaignStore, effects: Effect[], ctx: EffectContext = {}): ApplyEffectsResult {
  const applied: AppliedEffect[] = [];
  const prompts: Prompt[] = [];
  const skipped: ApplyEffectsResult["skipped"] = [];
  const created: Record<string, Id> = {};
  const session = ctx.sessionId !== undefined && store.has("sessions", ctx.sessionId) ? ctx.sessionId : undefined;
  /** An entity reference: a tempId created earlier in this batch, else an entity id. */
  const resolve = (ref: string): Id | undefined => created[ref] ?? (store.has("entities", ref) ? ref : undefined);

  store.transact(() => {
    for (const effect of effects) {
      if (effect.kind === "prompt") {
        prompts.push(effect.prompt);
        continue;
      }
      const at = now();
      let entity: Entity | undefined;
      if (effect.kind === "ledger") {
        const links = { ...(ctx.ledgerLinks ?? {}), ...(effect.links ?? {}) };
        if (session !== undefined && !links.session) links.session = session;
        const posted = postLedgerEffect(store, { ...effect, links }, { source: ctx.ledgerSource ?? { kind: "effect" }, ...(ctx.currency ? { currency: ctx.currency } : {}) });
        if (posted.duplicate) {
          skipped.push({ effect, reason: `already posted (${effect.key})` });
          continue;
        }
      } else if (effect.kind === "createFromPreset" || effect.kind === "applyPreset") {
        const preset = ctx.preset?.(effect.preset);
        if (!preset) {
          skipped.push({ effect, reason: ctx.preset ? `preset ${effect.preset} not found` : "no preset resolver" });
          continue;
        }
        if (effect.kind === "createFromPreset") {
          if (effect.id !== undefined && store.has("entities", effect.id)) {
            skipped.push({ effect, reason: `entities/${effect.id} already exists` });
            continue;
          }
          entity = createFromPreset(store, effect, preset, resolve);
          created[effect.tempId ?? entity.id] = entity.id;
        } else {
          const id = resolve(effect.entity);
          entity = id !== undefined ? store.get("entities", id) : undefined;
          if (!entity) {
            skipped.push({ effect, reason: `entities/${effect.entity} not found` });
            continue;
          }
          if (entity.type !== preset.entityType) {
            skipped.push({ effect, reason: `preset ${preset.id} is for ${preset.entityType}, not ${entity.type}` });
            continue;
          }
          applyPreset(store, effect, entity, preset);
        }
      } else if (effect.kind === "award") {
        const id = resolve(effect.entity);
        entity = id !== undefined ? store.get("entities", id) : undefined;
        if (!entity) {
          skipped.push({ effect, reason: `entities/${effect.entity} not found` });
          continue;
        }
        if (!ctx.advancement?.progression) {
          skipped.push({ effect, reason: "no progression rules to award with" });
          continue;
        }
        if (effect.key && store.list("advancement").some((e) => e.key?.startsWith(`${effect.key}:`))) {
          skipped.push({ effect, reason: `already awarded (${effect.key})` });
          continue;
        }
        postAward(store, ctx.advancement, {
          character: entity.id,
          ...(effect.question ? { questions: [effect.question] } : { amount: effect.amount ?? 1, pool: effect.pool ?? "experience" }),
          ...(effect.reason ? { reason: effect.reason } : {}),
          ...(effect.key ? { key: effect.key } : {}),
          ...(session !== undefined ? { session } : {}),
          source: { kind: "effect" },
        });
        entity = store.get("entities", entity.id);
      } else if (effect.kind !== "log") {
        const id = resolve(effect.entity);
        entity = id !== undefined ? store.get("entities", id) : undefined;
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
        case "ledger":
        case "award":
        case "createFromPreset":
        case "applyPreset":
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
  return { applied, prompts, skipped, created };
}
