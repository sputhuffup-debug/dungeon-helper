/**
 * The setup guide and campaign settings in the app: thin wrappers over
 * core's setup.ts and the sdk's campaign settings. Nothing here knows what
 * game it is: the steps, their links and the settings come from the module.
 */
import { campaignSetup, setupSnapshot, showsSetupGuide, withSetupGuide, type CampaignSetup, type CampaignStore, type Id, type MapName } from "@campaign-forge/core";
import type { SetupLinkState, SetupPage, SetupSnapshot } from "@campaign-forge/module-sdk";
import { useMemo } from "react";
import type { CampaignContextValue } from "./CampaignProvider";
import { useCampaign, useMapVersion, useMeta } from "./hooks";

type Ctx = Pick<CampaignContextValue, "store" | "module">;

const SNAPSHOT_MAPS = ["entities", "sessions", "adventures", "arcs", "maps", "notes", "handouts"] as const satisfies readonly MapName[];

/** The maps a setup snapshot reads, straight from the store. */
function setupMaps(store: CampaignStore) {
  const out = { meta: store.meta() } as Parameters<typeof campaignSetup>[0];
  for (const map of SNAPSHOT_MAPS) (out as unknown as Record<string, unknown>)[map] = Object.fromEntries(store.list(map).map((r) => [r.id, r]));
  return out;
}

/** The campaign's setup guide, ticked from its data. */
export function setupOf(ctx: Ctx): CampaignSetup {
  return campaignSetup(setupMaps(ctx.store), ctx.module.module);
}

/** The campaign as setup rules (and the Guide page's entity links) read it. */
export function setupSnapshotOf(ctx: Ctx): SetupSnapshot {
  return setupSnapshot(setupMaps(ctx.store), ctx.module.module);
}

/** The setup snapshot, kept up to date with the campaign. */
export function useSetupSnapshot(): SetupSnapshot {
  const ctx = useCampaign();
  const version = useMapVersion("*");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => setupSnapshotOf(ctx), [ctx, version]);
}

/** The setup guide, kept up to date with the campaign, and whether Home shows it. */
export function useCampaignSetup(): CampaignSetup & { shown: boolean } {
  const ctx = useCampaign();
  const meta = useMeta();
  const version = useMapVersion("*");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const setup = useMemo(() => setupOf(ctx), [ctx, version, meta]);
  return { ...setup, shown: showsSetupGuide(meta, setup) };
}

/** Show or hide the guide on Home. */
export function setSetupGuideShown(ctx: Pick<Ctx, "store">, show: boolean): void {
  ctx.store.updateMeta({ settings: withSetupGuide(ctx.store.meta(), show) });
}

/** Set (or clear, with undefined or "") one campaign setting. */
export function setCampaignSetting(ctx: Pick<Ctx, "store">, key: string, value: string | undefined): void {
  const settings = { ...(ctx.store.meta().settings ?? {}) };
  if (value === undefined || value === "") delete settings[key];
  else settings[key] = value;
  ctx.store.updateMeta({ settings });
}

const PAGE_PATHS: Record<SetupPage, string> = {
  home: "/c/$campaignId/home",
  atlas: "/c/$campaignId/atlas",
  settings: "/c/$campaignId/settings",
  ship: "/c/$campaignId/ship",
  arcs: "/c/$campaignId/arcs",
  sessions: "/c/$campaignId/sessions",
  adventures: "/c/$campaignId/adventures",
  generate: "/c/$campaignId/generate",
  primer: "/c/$campaignId/primer",
  rules: "/c/$campaignId/rules",
};

/** Router props for a step's link: where it goes and with what. */
export interface SetupLinkTarget {
  to: string;
  params: Record<string, string>;
  search: Record<string, string | number>;
}

export function setupLinkTarget(link: SetupLinkState, campaignId: Id): SetupLinkTarget | undefined {
  if (link.page) return { to: PAGE_PATHS[link.page], params: { campaignId }, search: { ...(link.params ?? {}) } };
  if (link.procedure) return { to: "/c/$campaignId/generate/$procedureId", params: { campaignId, procedureId: link.procedure }, search: {} };
  if (link.newEntity) {
    const search: Record<string, string | number> = { type: link.newEntity.type };
    if (link.newEntity.pc) search.pc = 1;
    if (link.newEntity.preset) search.preset = link.newEntity.preset;
    return { to: "/c/$campaignId/entities/new", params: { campaignId }, search };
  }
  if (link.entityId) return { to: "/c/$campaignId/entities/$entityId", params: { campaignId, entityId: link.entityId }, search: {} };
  if (link.reference) {
    // the Reference page's own address for the entry (see ReferenceSearch in the router)
    const r = link.reference;
    const search: Record<string, string> = r.table ? { tab: "tables", table: r.table } : r.preset ? { tab: "presets", preset: r.preset } : { tab: "lists", ...(r.list ? { list: r.list } : {}), ...(r.item ? { item: r.item } : {}) };
    return { to: "/c/$campaignId/reference", params: { campaignId }, search };
  }
  return undefined;
}
