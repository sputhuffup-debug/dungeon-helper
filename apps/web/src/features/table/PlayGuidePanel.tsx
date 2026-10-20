/**
 * The Hints tab of table mode: the module's GM play guide for the campaign's
 * play mode (what each stat and skill is for in moving the story), with a
 * "who's best" row on rollable entries. Each PC button rolls that entry for
 * that PC in place: seeded and logged like the Dice tab's skill roll, and a
 * push adds stress the same way (SessionRollPanel).
 */
import type { Entity, Id } from "@campaign-forge/core";
import type { LoadedModule, PlayGuideDef, PlayGuideEntry } from "@campaign-forge/module-sdk";
import { useMemo, useState } from "react";
import { Badge, Button, EmptyState, PlayGuideView, playGuidesForMode } from "../../components/ui";
import { useCampaign, useMeta } from "../../state/hooks";
import { SessionRollPanel, attributeIds, rollSessionPool, skillInput, skillOptions } from "./DicePanel";
import { SpecialAttackDialog, useSpecialAttacks } from "./SpecialAttacks";

/** The module's play guides that apply in the campaign's play mode. */
export function usePlayGuides(): PlayGuideDef[] {
  const { module } = useCampaign();
  const { mode } = useMeta();
  return useMemo(() => playGuidesForMode(module.module.playGuides, mode).filter((g) => g.entries.length > 0), [module, mode]);
}

export interface RankedRoller {
  entity: Entity;
  /** Dice from attribute + skill (the module's `buildPool` with no stress). */
  pool: number;
  /** Further dice the roll adds today (e.g. stress dice). */
  extra: number;
  /** "Attribute 3 · Skill 2 · …", from the full pool's breakdown. */
  breakdown: string;
  label: string;
  input: Record<string, unknown>;
}

const diceCount = (dice: Record<string, number>) => Object.values(dice).reduce((a, b) => a + (b > 0 ? b : 0), 0);

/** Can this PC roll `roll` (a skill id of its skills widget, or `attr:<attribute id>`)? */
function canRoll(module: LoadedModule, entity: Entity, roll: string): boolean {
  if (roll.startsWith("attr:")) return attributeIds(module, entity).includes(roll.slice(5));
  return skillOptions(module, module.entityType(entity.type)).some((s) => s.id === roll);
}

/** PCs that can roll `roll`, best pool first (ties by name). */
export function rankRollers(module: LoadedModule, pcs: Entity[], roll: string): RankedRoller[] {
  const dice = module.module.dice;
  return pcs
    .filter((pc) => canRoll(module, pc, roll))
    .map((entity) => {
      const { label, input } = skillInput(module, entity, roll);
      const full = dice.buildPool(input);
      const pool = diceCount(dice.buildPool({ ...input, stress: 0 }).dice);
      const breakdown = (full.breakdown ?? [])
        .filter((b) => b.count !== 0)
        .map((b) => `${b.label} ${b.count}`)
        .join(" · ");
      return { entity, pool, extra: Math.max(0, diceCount(full.dice) - pool), breakdown, label, input };
    })
    .sort((a, b) => b.pool - a.pool || a.entity.name.localeCompare(b.entity.name));
}

export function PlayGuidePanel({ sessionId, pcs, others = [] }: { sessionId: Id; pcs: Entity[]; others?: Entity[] }) {
  const { module } = useCampaign();
  const guides = usePlayGuides();
  const specials = useSpecialAttacks();
  const [special, setSpecial] = useState<string[] | undefined>();
  const [guideId, setGuideId] = useState("");
  const guide = guides.find((g) => g.id === guideId) ?? guides[0];
  const ranked = useMemo(() => {
    const out = new Map<string, RankedRoller[]>();
    for (const e of guide?.entries ?? []) if (e.roll) out.set(e.id, rankRollers(module, pcs, e.roll));
    return out;
  }, [guide, module, pcs]);

  if (!guide) return <EmptyState title="No hints" text="This game module has no play guide for this mode." />;
  return (
    <div className="app-stack" data-testid="hints-tab">
      {guides.length > 1 && (
        <select className="cf-select" aria-label="Play guide" value={guide.id} onChange={(e) => setGuideId(e.target.value)}>
          {guides.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title}
            </option>
          ))}
        </select>
      )}
      <PlayGuideView
        key={guide.id}
        guide={guide}
        entryMeta={(e) => {
          const best = ranked.get(e.id)?.[0];
          return best ? (
            <span className="cf-muted app-guide__bestline" title={`Best pool: ${best.entity.name}, ${best.pool} dice`}>
              {best.entity.name} {best.pool}
            </span>
          ) : null;
        }}
        entryExtra={(e) => {
          if (!e.roll) return null;
          const matching = specials.filter((s) => s.roll === e.roll);
          return (
            <>
              {matching.length > 0 && (
                <Button size="sm" variant="ghost" className="app-guide__specials" onClick={() => setSpecial(matching.map((s) => s.id))} data-testid="special-attacks-link">
                  Special attacks: {matching.map((s) => s.name).join(", ")}
                </Button>
              )}
              <WhoIsBest sessionId={sessionId} entry={e} ranked={ranked.get(e.id) ?? []} hasPcs={pcs.length > 0} />
            </>
          );
        }}
      />
      <SpecialAttackDialog open={!!special} onClose={() => setSpecial(undefined)} sessionId={sessionId} pcs={pcs} others={others} {...(special ? { attackIds: special } : {})} />
    </div>
  );
}

interface ActiveRoll {
  key: number;
  entityId: Id;
  label: string;
  input: Record<string, unknown>;
  result: ReturnType<typeof rollSessionPool>;
}

/** The session's PCs ranked by pool for this entry; a tap rolls it for that PC, shown below and logged. */
function WhoIsBest({ sessionId, entry, ranked, hasPcs }: { sessionId: Id; entry: PlayGuideEntry; ranked: RankedRoller[]; hasPcs: boolean }) {
  const ctx = useCampaign();
  const [active, setActive] = useState<ActiveRoll | undefined>();
  const entity = active ? ranked.find((r) => r.entity.id === active.entityId)?.entity : undefined;
  if (ranked.length === 0) return <p className="cf-muted">{hasPcs ? "No player character can roll this." : "No player characters yet."}</p>;
  const roll = (r: RankedRoller) => {
    // the input is captured now, so a push that adds stress does not reset the shown result
    const result = rollSessionPool(ctx, sessionId, r.entity, r.label, r.input);
    setActive({ key: Date.now(), entityId: r.entity.id, label: r.label, input: r.input, result });
  };
  return (
    <div className="app-guide__best" data-testid="who-is-best">
      <span className="cf-guide__heading">Who's best</span>
      <ul className="app-guide__rollers" aria-label={`Who's best at ${entry.label}`}>
        {ranked.map((r) => (
          <li key={r.entity.id}>
            <Button
              size="sm"
              variant={active?.entityId === r.entity.id ? "primary" : "default"}
              onClick={() => roll(r)}
              aria-label={`Roll ${entry.label} for ${r.entity.name} (${r.pool} dice)`}
              title={r.breakdown}
              data-roller={r.entity.id}
            >
              <span>{r.entity.name}</span>
              <Badge tone="accent">{r.pool}</Badge>
              {r.extra > 0 && <span className="cf-muted">+{r.extra}</span>}
            </Button>
          </li>
        ))}
      </ul>
      {active && entity && <SessionRollPanel key={active.key} sessionId={sessionId} entity={entity} label={active.label} input={active.input} initialResult={active.result} />}
    </div>
  );
}
