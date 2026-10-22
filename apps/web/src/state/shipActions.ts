/**
 * The crew's vehicle, the money ledger and travel: thin wrappers over core's
 * ledger.ts and travel.ts that read the module's `ledger`, `crewShip` and
 * `travel` definitions. Nothing here knows what game it is.
 */
import {
  applyEffects,
  crewShip,
  currentLocation,
  departTravel,
  formatMoney,
  ledgerToCsv,
  nameResolver,
  postLedgerEntry,
  removeLedgerEntry,
  setCrewShip,
  type CampaignStore,
  type DepartResult,
  type Entity,
  type Id,
  type LedgerEntry,
  type PostLedgerInput,
} from "@campaign-forge/core";
import { computeFields, getPath, type CrewShipDef, type LedgerDef, type LedgerPayoutDef, type LoadedModule, type PlayModeId, type TravelDef } from "@campaign-forge/module-sdk";
import { downloadFile, slug } from "../lib/download";
import type { CampaignContextValue } from "./CampaignProvider";
import { effectContext } from "./tableActions";

type Ctx = Pick<CampaignContextValue, "store" | "module">;

function inMode<T extends { mode?: PlayModeId[] }>(def: T | undefined, mode: PlayModeId): T | undefined {
  if (!def) return undefined;
  return !def.mode || def.mode.length === 0 || def.mode.includes(mode) ? def : undefined;
}

/** The module's ledger, when it applies in the campaign's play mode. */
export function ledgerDefOf(module: Pick<LoadedModule, "module">, mode: PlayModeId): LedgerDef | undefined {
  return inMode(module.module.ledger, mode);
}

export function crewShipDefOf(module: Pick<LoadedModule, "module">, mode: PlayModeId): CrewShipDef | undefined {
  return inMode(module.module.crewShip, mode);
}

export function travelDefOf(module: Pick<LoadedModule, "module">, mode: PlayModeId): TravelDef | undefined {
  return inMode(module.module.travel, mode);
}

/** Whether the campaign shows the Ship page: the module has a crew ship or a ledger for this mode. */
export function hasShipPage(module: Pick<LoadedModule, "module">, mode: PlayModeId): boolean {
  return !!(crewShipDefOf(module, mode) || ledgerDefOf(module, mode));
}

export function money(ctx: Pick<Ctx, "module">, amount: number, opts: { sign?: boolean } = {}): string {
  return formatMoney(ctx.module.module.ledger, amount, opts);
}

export function theCrewShip(ctx: Ctx): Entity | undefined {
  return crewShip(ctx.store, ctx.module.module.crewShip);
}

export function chooseCrewShip(ctx: Ctx, shipId: Id | undefined): void {
  const def = ctx.module.module.crewShip;
  if (def) setCrewShip(ctx.store, def, shipId);
}

export function whereIsShip(ctx: Ctx): Entity | undefined {
  const ship = theCrewShip(ctx);
  const locationSetting = ctx.module.module.crewShip?.locationSetting;
  return currentLocation(ctx.store, { ...(ship ? { ship: ship.id } : {}), ...(locationSetting ? { locationSetting } : {}) });
}

/** The session being played right now, if any (so effects land in its log). */
export function runningSession(store: CampaignStore): Id | undefined {
  return store.list("sessions").find((s) => s.status === "running")?.id;
}

// ---------------------------------------------------------------------------
// ledger
// ---------------------------------------------------------------------------

export function addLedgerEntry(ctx: Ctx, input: Omit<PostLedgerInput, "currency" | "source">): LedgerEntry {
  const currency = ctx.module.module.ledger?.currency;
  return postLedgerEntry(ctx.store, { ...input, source: { kind: "manual" }, ...(currency ? { currency } : {}) }).entry;
}

export function deleteLedgerEntry(ctx: Ctx, id: Id): void {
  removeLedgerEntry(ctx.store, id);
}

export function exportLedgerCsv(ctx: Ctx): void {
  const csv = ledgerToCsv(ctx.store, {
    calendar: ctx.module.module.calendar,
    ...(ctx.module.module.ledger ? { ledger: ctx.module.module.ledger } : {}),
    resolve: nameResolver(ctx.store),
  });
  downloadFile(csv, `${slug(ctx.store.meta().name)}-ledger.csv`, "text/csv");
}

/** The payout the module offers for this entity (e.g. a job's payment), if any. */
export function payoutFor(ctx: Pick<Ctx, "module">, entity: Pick<Entity, "type">): LedgerPayoutDef | undefined {
  return ctx.module.module.ledger?.payouts?.find((p) => p.entityType === entity.type);
}

export function payoutKey(payout: Pick<LedgerPayoutDef, "category">, entityId: Id): string {
  return `${payout.category}:${entityId}`;
}

/** The amount a payout would post: a field, else a computed value. */
export function payoutAmount(ctx: Pick<Ctx, "module">, entity: Entity, payout: LedgerPayoutDef): number {
  const field = getPath(entity.fields, payout.amountPath);
  if (typeof field === "number" && Number.isFinite(field)) return field;
  const def = ctx.module.entityType?.(entity.type);
  if (!def) return 0;
  try {
    const v = computeFields(def, entity.fields)[payout.amountPath];
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

export interface PayoutResult {
  entry: LedgerEntry;
  duplicate: boolean;
}

/** Post an entity's payout once (keyed by category and entity) and mark the entity done. */
export function postPayout(ctx: Ctx, entity: Entity, payout: LedgerPayoutDef): PayoutResult {
  return ctx.store.transact(() => {
    const ship = theCrewShip(ctx);
    const res = postLedgerEntry(ctx.store, {
      amount: payoutAmount(ctx, entity, payout),
      category: payout.category,
      note: `${payout.label}: ${entity.name}`,
      key: payoutKey(payout, entity.id),
      links: { job: entity.id, ...(ship ? { ship: ship.id } : {}) },
      source: { kind: "payout", id: entity.id },
      ...(ctx.module.module.ledger ? { currency: ctx.module.module.ledger.currency } : {}),
    });
    if (!res.duplicate && payout.setOnPost) {
      const fields = { ...entity.fields };
      const path = payout.setOnPost.path.split(".");
      let cur: Record<string, unknown> = fields;
      path.slice(0, -1).forEach((k) => {
        const next = { ...((cur[k] as Record<string, unknown> | undefined) ?? {}) };
        cur[k] = next;
        cur = next;
      });
      cur[path.at(-1)!] = payout.setOnPost.value;
      ctx.store.update("entities", entity.id, { fields });
    }
    return res;
  });
}

// ---------------------------------------------------------------------------
// travel
// ---------------------------------------------------------------------------

export interface DepartInput {
  to: Id;
  from?: Id;
  distance: number;
  options: Record<string, unknown>;
  days?: number;
  seed: string;
  /** Faces of arrival dice rolled at the table. */
  entered?: number[];
}

/** Depart now: log the leg, roll arrival checks from the seed, apply them and move the date. */
export function departShip(ctx: Ctx, input: DepartInput): DepartResult {
  const ship = theCrewShip(ctx);
  const session = runningSession(ctx.store);
  return departTravel(ctx.store, ctx.module.module, {
    to: input.to,
    distance: input.distance,
    options: input.options,
    seed: input.seed,
    ...(input.entered ? { entered: input.entered } : {}),
    ...(input.from ? { from: input.from } : {}),
    ...(ship ? { ship: ship.id } : {}),
    ...(input.days !== undefined ? { days: input.days } : {}),
    ...(session ? { session } : {}),
  });
}

/** Re-apply effects through the app's context (for prompts raised later). */
export function applyShipEffects(ctx: Ctx, effects: Parameters<typeof applyEffects>[1]) {
  return applyEffects(ctx.store, effects, effectContext(ctx, runningSession(ctx.store)));
}
