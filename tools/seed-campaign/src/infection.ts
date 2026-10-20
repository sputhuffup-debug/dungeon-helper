/**
 * Start a xenomorph life cycle on a demo character the way the app's
 * "Start infection" does (apps/web `startLifecycleFor`): the module's
 * campaign-scoped `alien.gestation` tracker config, the sdk's
 * `startLifecycle`, core's `applyEffects` for the stage's host conditions,
 * and the new instance written to the campaign tracker state.
 *
 * Differences from the app: the duration seed comes from the demo seed (not
 * from record ids), so a rebuild rolls the same durations; there is no
 * session yet, so the log lines the start emits are not written anywhere.
 */
import { applyEffects, getCampaignTrackerState, getPath, getWorldMinutes, newId, updateCampaignTrackerState, type CampaignStore, type Entity, type Id } from "@campaign-forge/core";
import { lifecycleConfig, lifecycleState, startLifecycle, type LifecycleInstance, type LoadedModule } from "@campaign-forge/module-sdk";
import { GESTATION_TRACKER } from "@campaign-forge/module-alien";

export interface StartInfectionInput {
  host: Entity;
  /** Variant id (default: the config's default variant, the standard XX121). */
  variant?: string;
  /** Start at this stage instead of the variant's first. */
  stage?: string;
  /** Pace id (default: the config's default pace). */
  pace?: string;
  /** The creature that started it (e.g. the facehugger). */
  source?: Entity;
  /** Seed for rolled stage durations. */
  seed: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Player characters, as the app counts them: character-kind entities with `isPC`, or owned by a member. */
function playerCharacters(store: CampaignStore, mod: LoadedModule): Entity[] {
  return store.list("entities").filter((e) => mod.entityType(e.type)?.kind === "character" && (e.fields["isPC"] === true || !!e.ownerMemberId));
}

export function startInfection(store: CampaignStore, mod: LoadedModule, input: StartInfectionInput): LifecycleInstance {
  const def = mod.module.trackers.find((t) => t.id === GESTATION_TRACKER && t.kind === "lifecycle" && t.scope === "campaign");
  if (!def) throw new Error(`demo campaign: module has no campaign life-cycle tracker "${GESTATION_TRACKER}"`);
  const config = lifecycleConfig(def.config);
  const kind = mod.entityType(input.host.type)?.kind;
  if (!kind || !(config.start?.entityKinds ?? []).includes(kind)) throw new Error(`demo campaign: ${input.host.name} cannot host a life cycle`);
  const exempt = config.start?.exemptField;
  if (exempt && getPath(input.host.fields, exempt)) throw new Error(`demo campaign: ${input.host.name} is exempt (${exempt})`);

  return store.transact(() => {
    const raw = getCampaignTrackerState(store, def.id);
    const state = lifecycleState(raw);
    const at = getWorldMinutes(store);
    const id: Id = newId();
    const result = startLifecycle(
      config,
      state,
      {
        id,
        variant: input.variant ?? config.defaultVariant,
        host: input.host.id,
        hostName: input.host.name,
        seed: `${def.id}:${input.seed}`,
        ...(input.stage ? { stage: input.stage } : {}),
        ...(input.pace ? { pace: input.pace } : {}),
        ...(input.source ? { source: input.source.id } : {}),
      },
      { at, newId: () => newId(), witnesses: playerCharacters(store, mod).map((e) => ({ id: e.id, name: e.name })) },
    );
    applyEffects(store, result.effects, { preset: (p) => mod.preset(p) });
    updateCampaignTrackerState(store, def.id, { ...(isRecord(raw) ? raw : {}), instances: result.state.instances });
    return result.state.instances.find((i) => i.id === id)!;
  });
}
