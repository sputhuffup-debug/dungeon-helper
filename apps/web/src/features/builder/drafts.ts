/**
 * Character builder drafts, kept in the campaign (`meta.settings.characterDrafts`)
 * until they are finished, so a player can stop half-way and come back on
 * any device the campaign travels to. A draft is the SDK's draft (picks,
 * rolled dice, ability scores, typed fields) plus bookkeeping: the target
 * entity for a level-up, a seed for app rolls and a counter so every roll
 * of a draft is reproducible.
 */
import { newId, now, type Entity } from "@campaign-forge/core";
import { builderBaseFields, emptyDraft, resolveCharacterBuilder, type CharacterBuilderDef, type CharacterBuilderDraft, type CharacterBuilderResult, type GameModule } from "@campaign-forge/module-sdk";
import type { CampaignContextValue } from "../../state/CampaignProvider";
import { createEntity, updateEntity, updateEntityFields, updateMeta } from "../../state/actions";

/** Where drafts live in `meta.settings`. */
export const DRAFTS_SETTING = "characterDrafts";

export interface StoredDraft extends CharacterBuilderDraft {
  id: string;
  created: string;
  updated: string;
  /** The character a level-up applies to. */
  entity?: string;
  /** Seed for dice the app rolls for this draft (with `rolls` counting them). */
  seed: string;
  rollCount?: number;
  /** Steps the player has opened (the stepper marks only these done). */
  visited?: string[];
}

type Ctx = Pick<CampaignContextValue, "store" | "module">;

function isDraft(v: unknown): v is StoredDraft {
  const d = v as StoredDraft;
  return !!d && typeof d === "object" && typeof d.id === "string" && typeof d.builder === "string" && (d.mode === "create" || d.mode === "levelUp") && !!d.picks && typeof d.picks === "object";
}

/** Every stored draft, newest first (malformed entries are skipped). */
export function readDrafts(settings: Record<string, unknown> | undefined): StoredDraft[] {
  const raw = settings?.[DRAFTS_SETTING];
  if (!raw || typeof raw !== "object") return [];
  return Object.values(raw as Record<string, unknown>)
    .filter(isDraft)
    .sort((a, b) => b.updated.localeCompare(a.updated) || b.id.localeCompare(a.id));
}

export function readDraft(settings: Record<string, unknown> | undefined, id: string | undefined): StoredDraft | undefined {
  return id ? readDrafts(settings).find((d) => d.id === id) : undefined;
}

function writeDrafts(ctx: Ctx, update: (drafts: Record<string, StoredDraft>) => void): void {
  const settings = ctx.store.meta().settings ?? {};
  const drafts = { ...((settings[DRAFTS_SETTING] as Record<string, StoredDraft> | undefined) ?? {}) };
  update(drafts);
  updateMeta(ctx, { settings: { ...settings, [DRAFTS_SETTING]: drafts } });
}

/** Start a draft: a new character, or a level-up of `entity`. */
export function startDraft(ctx: Ctx, builder: CharacterBuilderDef, mode: "create" | "levelUp", entity?: Entity): StoredDraft {
  const at = now();
  const draft: StoredDraft = { ...emptyDraft(builder, mode), id: newId(), created: at, updated: at, seed: newId(), ...(entity ? { entity: entity.id } : {}) };
  writeDrafts(ctx, (d) => (d[draft.id] = draft));
  return draft;
}

export function saveDraft(ctx: Ctx, draft: StoredDraft): StoredDraft {
  const next = { ...draft, updated: now() };
  writeDrafts(ctx, (d) => (d[next.id] = next));
  return next;
}

export function discardDraft(ctx: Ctx, id: string): void {
  writeDrafts(ctx, (d) => delete d[id]);
}

/** The level-up draft already open for a character, if any. */
export function draftFor(settings: Record<string, unknown> | undefined, entityId: string): StoredDraft | undefined {
  return readDrafts(settings).find((d) => d.mode === "levelUp" && d.entity === entityId);
}

/** The fields a draft starts from: the character being levelled up, or a new one's defaults. */
export function draftBase(module: GameModule, builder: CharacterBuilderDef, draft: StoredDraft, entity: Entity | undefined): Record<string, unknown> {
  return draft.mode === "levelUp" && entity ? entity.fields : builderBaseFields(module, builder);
}

export function resolveDraft(module: GameModule, builder: CharacterBuilderDef, draft: StoredDraft, entity: Entity | undefined): CharacterBuilderResult {
  return resolveCharacterBuilder(module, builder, draft, draft.mode === "levelUp" && entity ? { base: entity.fields } : {});
}

/**
 * Finish a draft: create the character (stored fields only; computed values
 * stay computed), or write the level-up into the existing one. The draft is
 * removed. Returns the entity id.
 */
export function finishDraft(ctx: Ctx, builder: CharacterBuilderDef, draft: StoredDraft, result: CharacterBuilderResult): string {
  return ctx.store.transact(() => {
    let id: string;
    if (draft.mode === "levelUp" && draft.entity) {
      updateEntityFields(ctx, draft.entity, result.fields);
      if (result.summary) updateEntity(ctx, draft.entity, { summary: result.summary });
      id = draft.entity;
    } else {
      const def = ctx.module.entityType(builder.entityType);
      const entity = createEntity(ctx, { type: builder.entityType, name: result.name?.trim() || `New ${def?.name.toLowerCase() ?? "character"}`, fields: result.fields, ...(result.summary ? { summary: result.summary } : {}) });
      id = entity.id;
    }
    discardDraft(ctx, draft.id);
    return id;
  });
}

/** A short label for a draft in lists: its typed name, else what it is so far. */
export function draftLabel(draft: StoredDraft, result?: CharacterBuilderResult): string {
  const typed = draft.values ? Object.values(draft.values).map((v) => v["core.name"]).find((n) => typeof n === "string" && n.trim()) : undefined;
  if (typeof typed === "string") return typed.trim();
  if (result?.summary?.trim()) return result.summary.trim();
  return draft.mode === "levelUp" ? "Level up" : "Unnamed character";
}
