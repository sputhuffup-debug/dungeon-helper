/**
 * Mutations for the guided adventure builder: create an adventure from a
 * module builder (its template, then the builder id, empty cast roles and
 * narrative field defaults), scenes with defaults, the scene mandatory flag
 * and cast members. Game-agnostic: the builder comes from the module.
 */
import { addToCast, createCastMember, ensureAgendas, narrativeDefaults, newId, removeFromCast, type Adventure, type Entity, type Id, type Scene } from "@campaign-forge/core";
import type { AdventureBuilderDef, CastRoleDef } from "@campaign-forge/module-sdk";
import { addScene, instantiateAdventureTemplate, type InstantiateOptions, type PrepCtx } from "./prepActions";

type Ctx = Pick<PrepCtx, "store" | "module" | "registry" | "whenDocSynced">;

/** Fill a record's missing narrative fields with the schema defaults (stored fields win). */
function withDefaults(defaults: Record<string, unknown>, fields: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (Object.keys(defaults).length === 0) return fields;
  return { ...defaults, ...(fields ?? {}) };
}

/**
 * Create an adventure with a module builder: the builder's template is
 * instantiated as usual, then the adventure records the builder, gets one
 * empty list per cast role, and every adventure, act and scene gets its
 * narrative field defaults.
 */
export async function instantiateBuilder(ctx: Ctx, builder: AdventureBuilderDef, opts: InstantiateOptions = {}): Promise<Adventure> {
  const template = builder.templateId ? ctx.module.template(builder.templateId) : undefined;
  const created = await instantiateAdventureTemplate(ctx, template, opts);
  const mode = ctx.store.meta().mode;
  return ctx.store.transact(() => {
    const cast: Record<string, Id[]> = {};
    for (const role of builder.cast) cast[role.id] = [];
    const patch: Partial<Adventure> = { builderId: builder.id, cast };
    const fields = withDefaults(narrativeDefaults(ctx.module, "adventure", mode), created.fields);
    if (fields) patch.fields = fields;
    const actDefaults = narrativeDefaults(ctx.module, "act", mode);
    const sceneDefaults = narrativeDefaults(ctx.module, "scene", mode);
    for (const actId of created.acts) {
      const act = ctx.store.get("acts", actId);
      if (!act) continue;
      const af = withDefaults(actDefaults, act.fields);
      if (af) ctx.store.update("acts", actId, { fields: af });
      for (const sceneId of act.scenes) {
        const sf = withDefaults(sceneDefaults, ctx.store.get("scenes", sceneId)?.fields);
        if (sf) ctx.store.update("scenes", sceneId, { fields: sf });
      }
    }
    return ctx.store.update("adventures", created.id, patch);
  });
}

/** Add a scene to an act with the module's scene field defaults. */
export function addBuilderScene(ctx: Pick<Ctx, "store" | "module">, actId: Id, input: { title?: string } = {}): Scene {
  return ctx.store.transact(() => {
    const scene = addScene(ctx, actId, input);
    const defaults = narrativeDefaults(ctx.module, "scene", ctx.store.meta().mode);
    if (Object.keys(defaults).length === 0) return scene;
    return ctx.store.update("scenes", scene.id, { fields: defaults });
  });
}

/** Whether a scene counts as mandatory: a mandatory event or the "mandatory" tag. */
export function isMandatory(scene: Pick<Scene, "events" | "tags">): boolean {
  return scene.events.some((e) => e.mandatory) || scene.tags.includes("mandatory");
}

/**
 * Mark a scene mandatory or optional the way templates do: the
 * mandatory/optional tag plus the flag on its first event (one is created
 * from the purpose when the scene has none).
 */
export function setSceneMandatory(ctx: Pick<Ctx, "store">, sceneId: Id, mandatory: boolean): Scene {
  const scene = ctx.store.get("scenes", sceneId);
  if (!scene) throw new Error(`scenes/${sceneId} not found`);
  const tags = [...scene.tags.filter((t) => t !== "mandatory" && t !== "optional"), mandatory ? "mandatory" : "optional"];
  let events = scene.events.map((e, i) => ({ ...e, mandatory: mandatory ? i === 0 || e.mandatory : false }));
  if (mandatory && events.length === 0) events = [{ id: newId(), text: scene.purpose || scene.title, mandatory: true }];
  return ctx.store.update("scenes", sceneId, { tags, events });
}

/** Create a new member for a cast role (with the role's type, subtype and defaults) and add it. */
export function newCastMember(ctx: Pick<Ctx, "store" | "module">, adventureId: Id, role: CastRoleDef, name: string): Entity {
  return createCastMember(ctx.store, ctx.module, adventureId, role, name);
}

export function pickCastMember(ctx: Pick<Ctx, "store">, adventureId: Id, role: string, entityId: Id): Adventure {
  return addToCast(ctx.store, adventureId, role, entityId);
}

export function dropCastMember(ctx: Pick<Ctx, "store">, adventureId: Id, role: string, entityId: Id): Adventure {
  return removeFromCast(ctx.store, adventureId, role, entityId);
}

/** One agenda handout per act for each character (claims unassigned agenda slots first). */
export function ensureCastAgendas(ctx: Pick<Ctx, "store">, adventureId: Id, characterIds: Id[]): void {
  ctx.store.transact(() => {
    for (const id of characterIds) ensureAgendas(ctx.store, adventureId, id);
  });
}
