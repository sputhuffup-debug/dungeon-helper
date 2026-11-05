/**
 * "Set up your campaign": the guide a new campaign's Home page shows until
 * the campaign is ready to play. Game-agnostic.
 *
 * - The core's generic steps (`DEFAULT_SETUP_STEPS`: the player characters,
 *   the players and who plays whom, the first session) apply to every
 *   module; a module adds its own and may hide or reorder steps per play mode
 *   (`GameModule.setup`, see the sdk's setup.ts).
 * - Every step ticks itself from campaign data: its `done` rule is JSONLogic
 *   over `setupSnapshot`, a plain read of the campaign. Nothing is ticked by
 *   a click, so the guide is always true to the campaign.
 * - Whether the guide shows lives in `meta.settings.setupGuide`: a campaign
 *   created in the app starts with `{ show: true }`; "Hide this" sets it
 *   false and Settings can show it again. It also disappears once every step
 *   is done.
 */
import { composeSetupSteps, evaluateSetupSteps, setupProgress, type GameModule, type PlayModeId, type SetupSnapshot, type SetupSnapshotEntity, type SetupStepDef, type SetupStepState } from "@campaign-forge/module-sdk";
import { ownerMemberOf } from "./members";
import type { CampaignMaps, CampaignMeta, Entity, Handout } from "./types";
import { findEntityType, type ModuleTypes } from "./visibility";

/** The generic steps, for every module (ids are `CORE_SETUP_STEP_IDS`). */
export const DEFAULT_SETUP_STEPS: readonly SetupStepDef[] = [
  {
    id: "setup.pcs",
    label: "Add the player characters",
    hint: "One for each player at the table.",
    done: { ">": [{ var: "counts.pcs" }, 0] },
    progress: { count: { var: "counts.pcs" }, of: { max: [{ var: "counts.players" }, { var: "counts.pcs" }, 1] }, label: { if: [{ ">": [{ var: "counts.players" }, 0] }, "PCs, one per player", "PCs"] } },
    links: [{ label: "Open the PCs", page: "atlas", params: { tab: "pcs" }, primary: true }],
  },
  {
    id: "setup.players",
    label: "Add the players and who plays whom",
    hint: "A name for each player and the PC they play, so you can share material with one of them.",
    done: { and: [{ ">": [{ var: "counts.players" }, 0] }, { ">": [{ var: "counts.pcs" }, 0] }, { "==": [{ var: "counts.unownedPcs" }, 0] }] },
    links: [{ label: "Add players", page: "settings", params: { section: "players" }, primary: true }],
  },
  {
    id: "setup.session",
    label: "Plan the first session",
    hint: "Give it a date; its scenes and checklist follow.",
    done: { ">": [{ var: "counts.sessions" }, 0] },
    links: [{ label: "Plan a session", page: "sessions", primary: true }],
  },
];

type SetupModule = ModuleTypes & Partial<Pick<GameModule, "setup">>;

function isPc(e: Entity, module: ModuleTypes): boolean {
  return findEntityType(module, e.type)?.kind === "character" && (e.fields.isPC === true || !!e.ownerMemberId);
}

/** Scenes planned into a session (the app keeps them as `plannedScenes`). */
function plannedScenes(s: object): number {
  const ids = (s as { plannedScenes?: unknown }).plannedScenes;
  return Array.isArray(ids) ? ids.length : 0;
}

const byName = <T extends { name: string; id: string }>(a: T, b: T) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

/** The campaign as setup rules read it: plain JSON, sorted, no rich text. */
export function setupSnapshot(maps: Pick<CampaignMaps, "meta" | "entities" | "sessions" | "adventures" | "arcs" | "maps" | "notes" | "handouts">, module: ModuleTypes): SetupSnapshot {
  const meta = maps.meta;
  const handoutsByCharacter = new Map<string, Handout[]>();
  for (const h of Object.values(maps.handouts ?? {}).sort((a, b) => a.created.localeCompare(b.created) || a.id.localeCompare(b.id))) {
    if (h.character) handoutsByCharacter.set(h.character, [...(handoutsByCharacter.get(h.character) ?? []), h]);
  }
  const entities: SetupSnapshotEntity[] = Object.values(maps.entities)
    .map((e) => {
      const kind = findEntityType(module, e.type)?.kind;
      const owner = ownerMemberOf(meta, e)?.id;
      const pc = isPc(e, module) || (!!owner && kind === "character");
      return {
        id: e.id,
        name: e.name,
        type: e.type,
        ...(kind ? { kind } : {}),
        ...(e.subtype ? { subtype: e.subtype } : {}),
        tags: [...e.tags].sort(),
        pc,
        ...(owner ? { owner } : {}),
        visibility: e.visibility.level,
        fields: structuredClone(e.fields),
        handouts: (handoutsByCharacter.get(e.id) ?? []).map((h) => ({ kind: h.kind, ...(h.purpose ? { purpose: h.purpose } : {}) })),
      };
    })
    .sort(byName);
  const pcs = entities.filter((e) => e.pc);
  const players = meta.members
    .filter((m) => m.role === "player")
    .map((m) => ({ id: m.id, name: m.name, characters: pcs.filter((p) => p.owner === m.id).length }))
    .sort(byName);
  const sessions = Object.values(maps.sessions)
    .map((s) => ({ id: s.id, number: s.number, status: s.status, scenes: plannedScenes(s) }))
    .sort((a, b) => a.number - b.number || a.id.localeCompare(b.id));
  const adventures = Object.values(maps.adventures)
    .map((a) => ({ id: a.id, title: a.title, status: a.status, ...(a.source ? { source: a.source.def } : {}), ...(a.builderId ? { builder: a.builderId } : {}) }))
    .sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  const arcs = Object.values(maps.arcs ?? {})
    .map((t) => ({ id: t.id, status: String(t.status) }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return {
    mode: meta.mode,
    settings: structuredClone(meta.settings ?? {}),
    entityIds: entities.map((e) => e.id).sort(),
    entities,
    pcs,
    players,
    sessions,
    adventures,
    arcs,
    counts: {
      entities: entities.length,
      pcs: pcs.length,
      unownedPcs: pcs.filter((p) => !p.owner).length,
      players: players.length,
      sessions: sessions.length,
      plannedSessions: sessions.filter((s) => s.status === "planned").length,
      playedSessions: sessions.filter((s) => s.status === "done").length,
      adventures: adventures.length,
      arcs: arcs.length,
      maps: Object.keys(maps.maps ?? {}).length,
      notes: Object.keys(maps.notes ?? {}).length,
      handouts: Object.keys(maps.handouts ?? {}).length,
    },
  };
}

/** The guide's steps for a module in a play mode: core steps and the module's, in the module's order. */
export function campaignSetupSteps(module: Partial<Pick<GameModule, "setup">>, mode: PlayModeId): SetupStepDef[] {
  return composeSetupSteps(DEFAULT_SETUP_STEPS, module.setup, mode);
}

export interface CampaignSetup {
  steps: SetupStepState[];
  done: number;
  total: number;
  /** Every step is done. */
  complete: boolean;
}

/** Every step of the guide, ticked from the campaign's data. */
export function campaignSetup(maps: Parameters<typeof setupSnapshot>[0], module: SetupModule): CampaignSetup {
  const steps = evaluateSetupSteps(campaignSetupSteps(module, maps.meta.mode), setupSnapshot(maps, module));
  const { done, total } = setupProgress(steps);
  return { steps, done, total, complete: done === total };
}

// ---------------------------------------------------------------------------
// showing the guide
// ---------------------------------------------------------------------------

export const SETUP_GUIDE_SETTING = "setupGuide";

/** `meta.settings.setupGuide`. */
export interface SetupGuideSettings {
  /** Show the guide on Home while steps are left. Campaigns created in the app start with true. */
  show: boolean;
}

/** The campaign's guide setting; a campaign without one (made before the guide, a demo, an import) does not show it. */
export function setupGuideSettings(meta: Pick<CampaignMeta, "settings">): SetupGuideSettings {
  const raw = meta.settings?.[SETUP_GUIDE_SETTING];
  return { show: typeof raw === "object" && raw !== null && (raw as Record<string, unknown>).show === true };
}

/** `settings` with the guide shown or hidden (for `store.updateMeta`). */
export function withSetupGuide(meta: Pick<CampaignMeta, "settings">, show: boolean): Record<string, unknown> {
  return { ...(meta.settings ?? {}), [SETUP_GUIDE_SETTING]: { show } };
}

/** Whether Home shows the guide: switched on and not yet complete. */
export function showsSetupGuide(meta: Pick<CampaignMeta, "settings">, setup: Pick<CampaignSetup, "complete">): boolean {
  return setupGuideSettings(meta).show && !setup.complete;
}
