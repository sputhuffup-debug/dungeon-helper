/**
 * Special attacks at the table (the module's `combat.specialAttacks`, e.g.
 * disarm or grapple): pick a character and an attack, read what it needs and
 * does, roll it on the table's skill roll path (seeded, logged, a push adds
 * stress), and for an opposed attack roll the target's resistance too, with
 * the opposed result: most successes wins, a tie as the module says (or the
 * GM's call when the module does not say).
 */
import type { Entity, Id } from "@campaign-forge/core";
import type { LoadedModule, RollResult, SpecialAttackDef } from "@campaign-forge/module-sdk";
import { useMemo, useState } from "react";
import { Badge, Button, Card, Dialog, PageRef, humanize, useDiceRoller } from "../../components/ui";
import { creaturePoolInput, logSpecialAttack, numberAt, opposedOutcome, specialAttacksFor, type OpposedOutcome } from "../../state/combatActions";
import { useCampaign, useMeta } from "../../state/hooks";
import { SessionRollPanel, attributeIds, rollSessionPool, sessionPoolRun, skillInput, skillOptions } from "./DicePanel";

/** The module's special attacks for the campaign's play mode. */
export function useSpecialAttacks(): SpecialAttackDef[] {
  const ctx = useCampaign();
  const { mode } = useMeta();
  return useMemo(() => specialAttacksFor(ctx, mode), [ctx, mode]);
}

/** "Fight" for a skill id, "Might" for `attr:might`: the name the skills widget gives it. */
export function rollLabel(module: LoadedModule, roll: string, entity?: Entity): string {
  if (roll.startsWith("attr:")) return humanize(roll.slice(5));
  const types = entity ? [module.entityType(entity.type)] : module.module.entityTypes;
  for (const def of types) {
    const s = skillOptions(module, def).find((o) => o.id === roll);
    if (s) return s.label;
  }
  return humanize(roll);
}

/**
 * Pool input for `roll` by an entity: its skill or attribute when it has one
 * (the table's skill roller), else a number field of that name (e.g. a
 * creature's skill level) as a non-player pool.
 */
export function rollInputFor(module: LoadedModule, entity: Entity, roll: string): { label: string; input: Record<string, unknown> } {
  const has = roll.startsWith("attr:") ? attributeIds(module, entity).includes(roll.slice(5)) : skillOptions(module, module.entityType(entity.type)).some((s) => s.id === roll);
  if (has) return skillInput(module, entity, roll);
  const id = roll.startsWith("attr:") ? roll.slice(5) : roll;
  const n = numberAt(entity, id);
  if (n !== undefined) return { label: humanize(id), input: creaturePoolInput(entity, n, humanize(id)) };
  return skillInput(module, entity, roll);
}

interface RollState {
  key: number;
  entity: Entity;
  label: string;
  input: Record<string, unknown>;
  result: RollResult;
  entered?: number[];
}

const ACTIONS: Record<NonNullable<SpecialAttackDef["action"]>, string> = { full: "Full action", quick: "Quick action" };

export function SpecialAttackPanel({
  sessionId,
  pcs,
  others = [],
  initialPc,
  attackIds,
  initialAttack,
}: {
  sessionId: Id;
  pcs: Entity[];
  others?: Entity[];
  initialPc?: Id;
  /** Limit the list (e.g. the attacks a play-guide entry rolls). */
  attackIds?: string[];
  initialAttack?: string;
}) {
  const ctx = useCampaign();
  const roller = useDiceRoller();
  const all = useSpecialAttacks();
  const attacks = attackIds ? all.filter((a) => attackIds.includes(a.id)) : all;
  const [pcId, setPcId] = useState<Id>(initialPc ?? "");
  const [attackId, setAttackId] = useState<string>(initialAttack ?? (attacks.length === 1 ? attacks[0]!.id : ""));
  const [targetId, setTargetId] = useState<Id>("");
  const [attacker, setAttacker] = useState<RollState | undefined>();
  const [defender, setDefender] = useState<RollState | undefined>();
  const [outcome, setOutcome] = useState<OpposedOutcome | undefined>();
  const pc = pcs.find((p) => p.id === pcId);
  const attack = attacks.find((a) => a.id === attackId);
  const targets = useMemo(() => [...pcs, ...others.filter((o) => !pcs.some((p) => p.id === o.id))].filter((e) => e.id !== pcId), [pcs, others, pcId]);
  const target = targets.find((t) => t.id === targetId);

  const reset = () => {
    setAttacker(undefined);
    setDefender(undefined);
    setOutcome(undefined);
  };

  const settle = (a: RollState | undefined, d: RollState | undefined) => {
    if (!a || !d || !attack) return setOutcome(undefined);
    const o = opposedOutcome(ctx, { name: a.entity.name, result: a.result }, { name: d.entity.name, result: d.result });
    setOutcome(o);
    logSpecialAttack(ctx, sessionId, { attacker: a.entity, attack, target: d.entity, outcome: o });
  };

  const rollAttacker = () => {
    if (!pc || !attack) return;
    const { label, input } = rollInputFor(ctx.module, pc, attack.roll);
    const full = `${attack.name} (${label})`;
    roller.roll({
      title: `${pc.name}: ${full}`,
      run: sessionPoolRun(ctx, input),
      perform: (entered) => {
        const result = rollSessionPool(ctx, sessionId, pc, full, input, entered);
        const next = { key: Date.now(), entity: pc, label: full, input, result, ...(entered ? { entered } : {}) };
        setAttacker(next);
        if (!attack.opposed) logSpecialAttack(ctx, sessionId, { attacker: pc, attack, ...(target ? { target } : {}), successes: result.successes });
        settle(next, defender);
      },
    });
  };

  const rollDefender = () => {
    if (!target || !attack?.opposed) return;
    const { label, input } = rollInputFor(ctx.module, target, attack.opposed);
    const full = `resists ${attack.name} (${label})`;
    roller.roll({
      title: `${target.name}: ${full}`,
      run: sessionPoolRun(ctx, input),
      perform: (entered) => {
        const result = rollSessionPool(ctx, sessionId, target, full, input, entered);
        const next = { key: Date.now(), entity: target, label: full, input, result, ...(entered ? { entered } : {}) };
        setDefender(next);
        settle(attacker, next);
      },
    });
  };

  const ties = ctx.module.module.combat?.opposedTies;

  return (
    <div className="app-stack" data-testid="special-attack">
      <div className="app-row">
        <select
          className="cf-select"
          aria-label="Special attack character"
          value={pcId}
          onChange={(e) => {
            setPcId(e.target.value);
            reset();
          }}
        >
          <option value="">Character…</option>
          {pcs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          className="cf-select"
          aria-label="Special attack"
          value={attackId}
          onChange={(e) => {
            setAttackId(e.target.value);
            reset();
          }}
        >
          <option value="">Attack…</option>
          {attacks.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      {attack && (
        <section className="app-combat__special" data-special={attack.id}>
          <header className="app-row">
            <strong className="app-grow">{attack.name}</strong>
            {attack.action && <Badge>{ACTIONS[attack.action]}</Badge>}
            {attack.page !== undefined && <PageRef page={attack.page} />}
          </header>
          <dl className="app-combat__stats">
            <dt>Roll</dt>
            <dd>{rollLabel(ctx.module, attack.roll, pc)}</dd>
            {attack.requires && (
              <>
                <dt>Requires</dt>
                <dd data-testid="special-requires">{attack.requires}</dd>
              </>
            )}
            {attack.opposed && (
              <>
                <dt>Opposed by</dt>
                <dd data-testid="special-opposed">{rollLabel(ctx.module, attack.opposed)}</dd>
              </>
            )}
          </dl>
          <p data-testid="special-effect">{attack.effect}</p>
        </section>
      )}

      {outcome && (
        <p className="app-combat__opposed-result" data-testid="opposed-result" data-winner={outcome.winner}>
          <strong>{outcome.text}</strong> {ties?.page !== undefined && outcome.text.startsWith("Tie") && <PageRef page={ties.page} />}
        </p>
      )}
      {attack && pc && !attacker && (
        <div className="app-row">
          <Button variant="primary" onClick={rollAttacker} aria-label={`Roll ${attack.name} for ${pc.name}`}>
            Roll
          </Button>
        </div>
      )}
      {attacker && (
        <SessionRollPanel
          key={attacker.key}
          sessionId={sessionId}
          entity={attacker.entity}
          label={attacker.label}
          input={attacker.input}
          initialResult={attacker.result}
          {...(attacker.entered ? { initialEntered: attacker.entered } : {})}
          onResult={(r) => {
            const next = { ...attacker, result: r };
            setAttacker(next);
            settle(next, defender);
          }}
        />
      )}

      {attack?.opposed && pc && (
        <div className="app-stack app-combat__opposed">
          <div className="app-row">
            <select
              className="cf-select"
              aria-label="Opposed by"
              value={targetId}
              onChange={(e) => {
                setTargetId(e.target.value);
                setDefender(undefined);
                setOutcome(undefined);
              }}
            >
              <option value="">Target…</option>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {target && !defender && (
              <Button onClick={rollDefender} aria-label={`Roll ${rollLabel(ctx.module, attack.opposed, target)} for ${target.name}`}>
                Roll {rollLabel(ctx.module, attack.opposed, target)} for {target.name}
              </Button>
            )}
          </div>
          {defender && (
            <SessionRollPanel
              key={defender.key}
              sessionId={sessionId}
              entity={defender.entity}
              label={defender.label}
              input={defender.input}
              initialResult={defender.result}
              {...(defender.entered ? { initialEntered: defender.entered } : {})}
              onResult={(r) => {
                const next = { ...defender, result: r };
                setDefender(next);
                settle(attacker, next);
              }}
            />
          )}
          {!ties && <p className="cf-muted">Most successes wins; on a tie, the GM decides.</p>}
        </div>
      )}
      {!pc && <p className="cf-muted">Pick a character and an attack.</p>}
    </div>
  );
}

/** The special attack picker as a card (the Dice tab). */
export function SpecialAttackCard(props: Parameters<typeof SpecialAttackPanel>[0]) {
  return (
    <Card title="Special attack" className="app-table__special">
      <SpecialAttackPanel {...props} />
    </Card>
  );
}

/** The picker in a dialog (a PC card's button, or a Hints link). */
export function SpecialAttackDialog({ open, onClose, ...props }: Parameters<typeof SpecialAttackPanel>[0] & { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Special attack" className="app-combat__dialog cf-table-mode" footer={<Button onClick={onClose}>Done</Button>}>
      {open && <SpecialAttackPanel {...props} />}
    </Dialog>
  );
}
