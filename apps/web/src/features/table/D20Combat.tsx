/**
 * Combat for d20 game modules (the module's declarative `d20Combat`), in
 * table mode: the initiative order with the current turn (Next turn ticks
 * condition durations, end-of-turn decrements and save-ends saves), one card
 * per combatant (hit points with damage, healing and temporary hit points,
 * AC with its conditions, condition chips whose helper text says what the
 * condition does, what the app applies by itself and how long it lasts), an
 * attack dialog (attacker, attack, target, the roll with advantage or
 * disadvantage from conditions, hit or miss with the reason, damage with
 * critical hits and the target's resistances, the module's rule at 0 hit
 * points) and save effects (DC, each target's save, full or half damage and
 * conditions by outcome). Rolls are in the app or typed from the table
 * (the page's dice mode); everything is logged GM-only.
 */
import { d20ConditionsOf, type Entity, type Id } from "@campaign-forge/core";
import {
  d20Condition,
  d20ConditionAdjustment,
  d20ConditionAutomation,
  d20ConditionLabel,
  d20DamageText,
  d20DamageTypeName,
  d20DurationText,
  d20IsTraitModifier,
  d20LevelNotes,
  d20ModifierText,
  d20Number,
  d20Restrictions,
  d20SaveConditions,
  d20Speed,
  d20ZeroHpRule,
  type ActiveCondition,
  type D20Attack,
  type D20CombatDef,
  type D20ConditionApply,
  type D20ConditionDef,
  type D20DamageApplied,
  type D20DurationSpec,
  type D20SaveEffect,
  type RollResult,
} from "@campaign-forge/module-sdk";
import { useMemo, useState } from "react";
import { Badge, Button, Card, Dialog, DieFace, HealthBar, Stepper, cx, pushToast, rollOptionFields, specById, useDiceRoller } from "../../components/ui";
import { errorMessage } from "../../lib/format";
import {
  applyCondition,
  applyD20Hit,
  attackRun,
  combatOrder,
  combatantOf,
  damageAgainst,
  damageModifierFor,
  damageRun,
  degreeLabel,
  effectDc,
  healCombatant,
  initiativeRun,
  nextTurn,
  planAttack,
  planSave,
  removeCondition,
  rollAttack,
  rollDamage,
  rollSave,
  saveMultiplier,
  saveRun,
  setConditionValue,
  setTempHp,
  startCombat,
  type AttackRoll,
  type DamageRollDone,
  type HitApplied,
  type SaveRoll,
  type TurnChange,
} from "../../state/d20Actions";
import { useCampaign } from "../../state/hooks";
import { RollSource } from "./RollSource";
import { useSessionTrackerState } from "./hooks";

type Mode = "normal" | "advantage" | "disadvantage";
const signed = (n: number) => (n < 0 ? `−${Math.abs(n)}` : `+${n}`);

/** The module's d20 combat, if it has one. */
export function useD20Combat(): D20CombatDef | undefined {
  return useCampaign().module.module.d20Combat;
}

function useNameOf(): (id: string) => string {
  const ctx = useCampaign();
  return (id) => ctx.store.get("entities", id)?.name ?? id;
}

function attempt<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch (e) {
    pushToast(errorMessage(e), { tone: "danger" });
    return undefined;
  }
}

function RollFaces({ result }: { result: RollResult }) {
  const { module } = useCampaign();
  const dice = module.module.dice;
  return (
    <span className="cf-dice__faces app-combat__faces" aria-label="Rolled dice">
      {result.dice.map((d, i) => (
        <DieFace key={i} spec={specById(dice, d.die)} value={d.value} {...(d.dropped ? { dropped: true } : {})} />
      ))}
    </span>
  );
}

const MODE_LABEL: Record<Mode, string> = { normal: "Normal", advantage: "Advantage", disadvantage: "Disadvantage" };

/** "Disadvantage: Poisoned" lines for a roll mode the conditions give. */
function ModeReasons({ advantage, disadvantage }: { advantage: string[]; disadvantage: string[] }) {
  if (!advantage.length && !disadvantage.length) return null;
  return (
    <span className="app-d20__reasons" data-testid="roll-reasons">
      {advantage.length > 0 && <span>Advantage: {advantage.join(", ")}</span>}
      {disadvantage.length > 0 && <span>Disadvantage: {disadvantage.join(", ")}</span>}
      {advantage.length > 0 && disadvantage.length > 0 && <span className="cf-muted">(they cancel out)</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// the panel
// ---------------------------------------------------------------------------

export function D20CombatPanel({ sessionId, pcs, others, onOpen }: { sessionId: Id; pcs: Entity[]; others: Entity[]; onOpen: (id: Id) => void }) {
  const ctx = useCampaign();
  const def = useD20Combat()!;
  const roller = useDiceRoller();
  const ts = useSessionTrackerState(sessionId);
  const order = useMemo(() => combatOrder(ctx, sessionId), [ctx, sessionId, ts]);
  const [attacker, setAttacker] = useState<Id | undefined>();
  const [attacking, setAttacking] = useState(false);
  const [picker, setPicker] = useState<Id | undefined>();
  const [turn, setTurn] = useState<TurnChange | undefined>();

  const all = useMemo(() => [...pcs, ...others].filter((e, i, list) => list.findIndex((x) => x.id === e.id) === i), [pcs, others]);
  const byId = useMemo(() => new Map(all.map((e) => [e.id, e])), [all]);
  const entityFor = (id: Id | undefined) => (id ? (byId.get(id) ?? ctx.store.get("entities", id)) : undefined);
  const inOrder = order.order.filter((p) => p.entityId && entityFor(p.entityId) && combatantOf(ctx, entityFor(p.entityId)!));
  const outside = all.filter((e) => combatantOf(ctx, e) && !order.order.some((p) => p.entityId === e.id));
  const combatants = [...inOrder.map((p) => entityFor(p.entityId)!), ...outside];

  const roll = (ids: Id[]) => {
    if (!order.tracker) return;
    attempt(() =>
      roller.roll({
        title: "Roll initiative",
        run: initiativeRun(ctx, sessionId, ids),
        perform: (entered) => attempt(() => startCombat(ctx, sessionId, ids, entered)),
      }),
    );
  };
  const advance = () => {
    const change = attempt(() => nextTurn(ctx, sessionId));
    if (change) setTurn(change);
  };
  const [attackKey, setAttackKey] = useState(0);
  const openAttack = (id?: Id) => {
    setAttacker(id ?? order.current?.entityId);
    setAttackKey((k) => k + 1);
    setAttacking(true);
  };

  return (
    <Card
      title="Combat"
      className="app-d20"
      data-testid="d20-combat"
      actions={
        <span className="app-row">
          {order.order.length > 0 && (
            <Badge tone="accent" data-testid="combat-round">
              Round {order.round}
            </Badge>
          )}
          <Badge title="Rolls and changes are logged for the GM only.">GM only</Badge>
          <Button size="sm" onClick={() => openAttack()} disabled={combatants.length === 0}>
            Attack
          </Button>
          <Button size="sm" variant="primary" onClick={advance} disabled={order.order.length === 0} data-testid="next-turn">
            Next turn
          </Button>
        </span>
      }
    >
      <div className="app-stack">
        {order.current && (
          <p className="app-d20__turn" data-testid="current-turn">
            <strong>{order.current.name}</strong>'s turn
          </p>
        )}
        {turn && <TurnSummary sessionId={sessionId} change={turn} onClose={() => setTurn(undefined)} />}
        {attacking && <AttackPanel key={`${attacker ?? "none"}:${attackKey}`} sessionId={sessionId} combatants={combatants} {...(attacker ? { attackerId: attacker } : {})} onClose={() => setAttacking(false)} />}
        {order.order.length === 0 && (
          <p className="app-row">
            <span className="cf-muted">Nobody is in the initiative order yet.</span>
            {order.tracker && outside.length > 0 && (
              <Button size="sm" onClick={() => roll(outside.map((e) => e.id))} data-testid="roll-initiative-all">
                Roll initiative for everyone
              </Button>
            )}
          </p>
        )}
        <ol className="app-d20__list" aria-label="Combatants">
          {inOrder.map((p) => (
            <CombatantCard
              key={p.id}
              sessionId={sessionId}
              entity={entityFor(p.entityId)!}
              initiative={p.card}
              current={order.current?.id === p.id}
              acted={p.acted}
              onOpen={onOpen}
              onAttack={() => openAttack(p.entityId)}
              onAddCondition={() => setPicker(p.entityId)}
            />
          ))}
        </ol>
        {outside.length > 0 && order.order.length > 0 && (
          <details className="app-d20__outside">
            <summary>
              Not in the initiative order ({outside.length}){" "}
              {order.tracker && (
                <Button size="sm" variant="ghost" onClick={() => roll(outside.map((e) => e.id))}>
                  Add and roll
                </Button>
              )}
            </summary>
            <ol className="app-d20__list">
              {outside.map((e) => (
                <CombatantCard key={e.id} sessionId={sessionId} entity={e} onOpen={onOpen} onAttack={() => openAttack(e.id)} onAddCondition={() => setPicker(e.id)} />
              ))}
            </ol>
          </details>
        )}
        {order.order.length === 0 && outside.length > 0 && (
          <ol className="app-d20__list">
            {outside.map((e) => (
              <CombatantCard key={e.id} sessionId={sessionId} entity={e} onOpen={onOpen} onAttack={() => openAttack(e.id)} onAddCondition={() => setPicker(e.id)} />
            ))}
          </ol>
        )}
      </div>
      {picker && <ConditionPicker sessionId={sessionId} entityId={picker} combatants={combatants} def={def} onClose={() => setPicker(undefined)} />}
    </Card>
  );
}

/** What Next turn did: whose turn ended and started, conditions that dropped or ended, saves due (with a roll button each). */
function TurnSummary({ sessionId, change, onClose }: { sessionId: Id; change: TurnChange; onClose: () => void }) {
  const nameOf = useNameOf();
  const { tick } = change;
  return (
    <section className="app-d20__summary" aria-label="Turn change" data-testid="turn-summary">
      <header className="app-row">
        <strong className="app-grow">
          {change.newRound ? `Round ${change.round}. ` : ""}
          {change.ended ? `${change.ended.name}'s turn ended.` : ""} {change.started ? `${change.started.name}'s turn.` : ""}
        </strong>
        <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close turn summary">
          ×
        </Button>
      </header>
      {(tick.decremented.length > 0 || tick.expired.length > 0) && (
        <ul className="app-bullets" data-testid="turn-ticks">
          {tick.decremented.map((d) => (
            <li key={`d-${d.entity}-${d.id}`}>
              {nameOf(d.entity)}: {d.label} {d.from} → {d.to}
            </li>
          ))}
          {tick.expired.map((x) => (
            <li key={`x-${x.entity}-${x.id}`}>
              {nameOf(x.entity)}: {x.label} ends
            </li>
          ))}
        </ul>
      )}
      {tick.savesDue.map((s) => (
        <SaveDueRow key={`${s.entity}-${s.id}`} sessionId={sessionId} due={s} />
      ))}
    </section>
  );
}

function SaveDueRow({ sessionId, due }: { sessionId: Id; due: TurnChange["tick"]["savesDue"][number] }) {
  const ctx = useCampaign();
  const roller = useDiceRoller();
  const nameOf = useNameOf();
  const [done, setDone] = useState<SaveRoll | undefined>();
  const rollIt = () => {
    const plan = attempt(() => planSave(ctx, due.entity, due.save, due.dc));
    if (!plan) return;
    roller.roll({
      title: `${nameOf(due.entity)}: save against ${due.label}`,
      run: saveRun(ctx, plan),
      perform: (entered) => {
        const r = attempt(() => rollSave(ctx, sessionId, plan, due.label, entered));
        if (!r) return;
        setDone(r);
        if (r.resolution.success) removeCondition(ctx, sessionId, due.entity, due.id, "saved");
      },
    });
  };
  return (
    <p className="app-row app-d20__due" data-testid="save-due">
      <span className="app-grow">
        {nameOf(due.entity)}: save DC {due.dc} to end {due.label}
      </span>
      {done ? (
        <Badge tone={done.resolution.success ? "success" : "danger"}>
          {done.resolution.reason}: {done.resolution.success ? `${due.label} ends` : "still " + due.label.toLowerCase()}
        </Badge>
      ) : (
        <Button size="sm" onClick={rollIt}>
          Roll save
        </Button>
      )}
    </p>
  );
}

// ---------------------------------------------------------------------------
// one combatant
// ---------------------------------------------------------------------------

export function CombatantCard({
  sessionId,
  entity,
  initiative,
  current,
  acted,
  onOpen,
  onAttack,
  onAddCondition,
}: {
  sessionId: Id;
  entity: Entity;
  initiative?: number | null;
  current?: boolean;
  acted?: boolean;
  onOpen: (id: Id) => void;
  onAttack: () => void;
  onAddCondition: () => void;
}) {
  const ctx = useCampaign();
  const def = useD20Combat()!;
  const view = combatantOf(ctx, entity);
  const [amount, setAmount] = useState(1);
  const [open, setOpen] = useState<string | undefined>();
  if (!view) return null;
  const { hp } = view;
  const acAdj = view.conditions.length ? acModifier(ctx, entity) : { total: 0, parts: [] as string[] };
  const ac = view.ac + acAdj.total;
  const restrictions = d20Restrictions(view.conditions);
  const speedRaw = view.def.speed !== undefined ? speedOf(view.def.speed, entity, view.computed) : undefined;
  const speed = typeof speedRaw === "number" ? d20Speed(view.conditions, speedRaw) : undefined;
  const down = hp.max > 0 && hp.current <= 0;
  const openCondition = open ? view.conditions.find((c) => c.id === open) : undefined;
  return (
    <li className={cx("app-d20__combatant", current && "app-d20__combatant--current", acted && "app-d20__combatant--acted", view.defeated && "app-d20__combatant--defeated")} data-combatant={entity.id} aria-current={current ? "step" : undefined}>
      <header className="app-d20__head">
        {initiative !== undefined && (
          <span className="app-d20__init" title="Initiative">
            {initiative ?? "–"}
          </span>
        )}
        <button type="button" className="app-participant__name" onClick={() => onOpen(entity.id)} aria-label={`Open ${entity.name}`}>
          {entity.name}
        </button>
        {current && <Badge tone="accent">Turn</Badge>}
        <span className="app-grow" />
        <Badge title={acAdj.parts.length ? `AC ${view.ac}: ${acAdj.parts.join(", ")}` : "Armor Class"} data-testid="combatant-ac">
          AC {ac}
          {ac !== view.ac ? ` (${view.ac})` : ""}
        </Badge>
        {speed && (
          <Badge title={speed.by.length ? `Speed ${speedRaw}: ${speed.by.join(", ")}` : "Speed"}>
            Speed {speed.value}
            {speed.value !== speedRaw ? ` (${speedRaw})` : ""}
          </Badge>
        )}
        {view.defeated && <Badge tone="danger">Defeated</Badge>}
      </header>
      <div className="app-d20__hp">
        <HealthBar max={hp.max} damage={hp.max - hp.current} broken={down} brokenLabel="0 HP" label={`${entity.name} hit points`} />
        {hp.temp > 0 && <Badge tone="accent">+{hp.temp} temp</Badge>}
        <input
          className="cf-input app-d20__amount"
          type="number"
          min={0}
          inputMode="numeric"
          aria-label={`Amount for ${entity.name}`}
          value={amount}
          onChange={(e) => setAmount(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
        />
        <Button size="sm" variant="danger" onClick={() => attempt(() => applyD20Hit(ctx, sessionId, entity.id, amount, { by: "GM" }))} aria-label={`Damage ${entity.name}`}>
          Damage
        </Button>
        <Button size="sm" onClick={() => attempt(() => healCombatant(ctx, sessionId, entity.id, amount))} aria-label={`Heal ${entity.name}`}>
          Heal
        </Button>
        {view.def.hp.temp && (
          <Button size="sm" variant="ghost" onClick={() => attempt(() => setTempHp(ctx, sessionId, entity.id, amount))} aria-label={`Set temporary hit points of ${entity.name}`}>
            Temp HP
          </Button>
        )}
      </div>
      <div className="app-d20__conditions" aria-label={`${entity.name} conditions`}>
        {view.conditions.map((c) => (
          <ConditionChip key={c.id} condition={c} open={open === c.id} onToggle={() => setOpen((o) => (o === c.id ? undefined : c.id))} />
        ))}
        <Button size="sm" variant="ghost" onClick={onAddCondition} aria-label={`Add a condition to ${entity.name}`}>
          + Condition
        </Button>
        {view.attacks.length > 0 && (
          <Button size="sm" onClick={onAttack} aria-label={`Attack with ${entity.name}`}>
            Attack
          </Button>
        )}
      </div>
      {restrictions.length > 0 && (
        <p className="app-d20__restrictions" data-testid="restrictions">
          {restrictions.map((r) => `can't ${r.restriction}`).join(", ")} <span className="cf-muted">({[...new Set(restrictions.map((r) => r.by))].join(", ")})</span>
        </p>
      )}
      {openCondition && <ConditionHelp sessionId={sessionId} entity={entity} condition={openCondition} def={def} onClose={() => setOpen(undefined)} />}
      {down && <ZeroHpNote entity={entity} />}
    </li>
  );
}

function speedOf(rule: unknown, entity: Entity, computed: Record<string, unknown>): number | undefined {
  return d20Number(rule as never, { fields: entity.fields, computed });
}

function acModifier(ctx: ReturnType<typeof useCampaign>, entity: Entity): { total: number; parts: string[] } {
  // the same adjustment the attack roll uses
  const adj = d20ConditionAdjustment(ctx.module.module.d20Combat!, d20ConditionsOf(ctx.module, entity), { roll: "ac" });
  return { total: adj.modifier, parts: adj.parts.map(d20ModifierText) };
}

function ZeroHpNote({ entity }: { entity: Entity }) {
  const ctx = useCampaign();
  const def = useD20Combat()!;
  const kind = ctx.module.entityType(entity.type)?.kind;
  const rule = d20ZeroHpRule(def, { type: entity.type, fields: entity.fields, ...(kind ? { kind } : {}) });
  if (!rule) return null;
  return (
    <details className="app-d20__zero" data-testid="zero-hp-rule">
      <summary>At 0 hit points</summary>
      <p>{rule.text}</p>
      {rule.cite && <p className="cf-muted">{rule.cite}</p>}
    </details>
  );
}

// ---------------------------------------------------------------------------
// condition chips and their helper text
// ---------------------------------------------------------------------------

function ConditionChip({ condition, open, onToggle }: { condition: ActiveCondition; open: boolean; onToggle: () => void }) {
  const implied = !condition.record;
  const label = d20ConditionLabel(condition);
  return (
    <button
      type="button"
      className={cx("app-d20__chip", implied && "app-d20__chip--implied", open && "app-d20__chip--open")}
      aria-expanded={open}
      onClick={onToggle}
      title={condition.def?.summary ?? label}
      data-condition={condition.id}
    >
      {label}
      {implied && condition.impliedBy && <span className="app-d20__chip-from"> ({condition.impliedBy.join(", ")})</span>}
    </button>
  );
}

/** What a condition does (helper text), what the app applies by itself, what it leaves to the GM, how long it lasts, where it came from. */
export function ConditionInfo({ def, cd, value }: { def: D20CombatDef; cd: D20ConditionDef; value?: number }) {
  const auto = d20ConditionAutomation(def, cd);
  const levels = d20LevelNotes(cd, value);
  return (
    <>
      <p className="app-d20__summary-text" data-testid="condition-helper">
        {cd.summary}
      </p>
      {levels.length > 0 && (
        <p className="cf-muted">
          In effect: {levels.map((l) => `${l.value}. ${l.summary}`).join("; ")}
        </p>
      )}
      {auto.automated.length > 0 && (
        <div>
          <span className="app-d20__label">Applied automatically</span>
          <ul className="app-bullets" data-testid="condition-automated">
            {auto.automated.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}
      {auto.manual.length > 0 && (
        <div>
          <span className="app-d20__label">Not automated</span>
          <ul className="app-bullets" data-testid="condition-manual">
            {auto.manual.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}
      {cd.cite && <p className="cf-muted app-d20__cite">{cd.cite}</p>}
    </>
  );
}

function ConditionHelp({ sessionId, entity, condition, def, onClose }: { sessionId: Id; entity: Entity; condition: ActiveCondition; def: D20CombatDef; onClose: () => void }) {
  const ctx = useCampaign();
  const nameOf = useNameOf();
  const cd = condition.def;
  const record = condition.record;
  return (
    <section className="app-d20__help" aria-label={`${d20ConditionLabel(condition)}: what it does`} data-testid="condition-help">
      <header className="app-row">
        <strong className="app-grow">{d20ConditionLabel(condition)}</strong>
        {cd?.valued && record && (
          <Stepper value={condition.value ?? 1} min={0} max={cd.max ?? 10} onChange={(v) => attempt(() => setConditionValue(ctx, sessionId, entity.id, condition.id, v))} label={`${cd.name} value`} />
        )}
        <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close condition help">
          ×
        </Button>
      </header>
      {cd ? <ConditionInfo def={def} cd={cd} {...(condition.value !== undefined ? { value: condition.value } : {})} /> : <p className="cf-muted">This module does not describe it.</p>}
      {record ? (
        <p className="app-d20__duration" data-testid="condition-duration">
          <span className="app-d20__label">Duration</span> {d20DurationText(def, record.duration, nameOf)}
          {record.source ? ` · from ${record.source}` : ""}
          {record.note ? ` · ${record.note}` : ""}
        </p>
      ) : (
        <p className="cf-muted">Comes with {condition.impliedBy?.join(", ")}; it ends with it.</p>
      )}
      {record && (
        <div className="app-row">
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              attempt(() => removeCondition(ctx, sessionId, entity.id, condition.id));
              onClose();
            }}
          >
            Remove {cd?.name ?? condition.name}
          </Button>
        </div>
      )}
    </section>
  );
}

type DurationChoice = "none" | "rounds" | "sourceNextTurn" | "save";

/** Add a condition: search the module's conditions, read what one does before adding it, pick its value and duration. */
export function ConditionPicker({ sessionId, entityId, combatants, def, onClose }: { sessionId: Id; entityId: Id; combatants: Entity[]; def: D20CombatDef; onClose: () => void }) {
  const ctx = useCampaign();
  const entity = ctx.store.get("entities", entityId);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | undefined>();
  const [value, setValue] = useState(1);
  const [duration, setDuration] = useState<DurationChoice>("none");
  const [rounds, setRounds] = useState(1);
  const [source, setSource] = useState<Id | "">("");
  const [save, setSave] = useState(def.saves[0]?.id ?? "");
  const [dc, setDc] = useState(10);
  const list = def.conditions.filter((c) => !query.trim() || `${c.name} ${c.summary}`.toLowerCase().includes(query.trim().toLowerCase()));
  const cd = picked ? d20Condition(def, picked) : undefined;
  const add = () => {
    if (!cd || !entity) return;
    const spec: D20DurationSpec | undefined = duration === "rounds" ? { rounds } : duration === "sourceNextTurn" ? { sourceNextTurn: true } : duration === "save" ? { save: { save, dc } } : undefined;
    const apply: D20ConditionApply = { id: cd.id, ...(cd.valued ? { value } : {}), ...(spec ? { duration: spec } : {}) };
    const srcName = source ? ctx.store.get("entities", source)?.name : undefined;
    const out = attempt(() => applyCondition(ctx, sessionId, entityId, apply, { ...(source ? { sourceId: source } : {}), ...(srcName ? { source: srcName } : {}), ...(duration === "save" ? { dc } : {}), replace: true }));
    if (out?.immune) {
      pushToast(`${entity.name} is immune to ${cd.name}.`, { tone: "warning" });
      return;
    }
    if (out) onClose();
  };
  return (
    <Dialog open onClose={onClose} title={`Add a condition: ${entity?.name ?? ""}`} className="app-combat__dialog cf-table-mode" footer={<Button onClick={onClose}>Cancel</Button>}>
      <div className="app-stack" data-testid="condition-picker">
        <input className="cf-input" type="search" placeholder="Search conditions" aria-label="Search conditions" value={query} onChange={(e) => setQuery(e.target.value)} />
        <ul className="app-d20__picklist" aria-label="Conditions">
          {list.map((c) => (
            <li key={c.id}>
              <button type="button" className={cx("app-d20__pick", picked === c.id && "app-d20__pick--on")} aria-pressed={picked === c.id} onClick={() => setPicked(c.id)}>
                <strong>{c.name}</strong> <span className="cf-muted">{c.summary.length > 90 ? `${c.summary.slice(0, 88)}…` : c.summary}</span>
              </button>
            </li>
          ))}
        </ul>
        {cd && (
          <section className="app-d20__help" aria-label={`${cd.name}: what it does`}>
            <strong>{cd.name}</strong>
            <ConditionInfo def={def} cd={cd} {...(cd.valued ? { value } : {})} />
            <div className="app-row app-combat__fields">
              {cd.valued && (
                <label className="app-label">
                  Value
                  <Stepper value={value} min={1} max={cd.max ?? 10} onChange={setValue} label={`${cd.name} value`} />
                </label>
              )}
              <label className="app-label">
                Lasts
                <select className="cf-select" aria-label="Duration" value={duration} onChange={(e) => setDuration(e.target.value as DurationChoice)}>
                  <option value="none">Until removed</option>
                  <option value="rounds">A number of rounds</option>
                  <option value="sourceNextTurn">Until the end of the source's next turn</option>
                  <option value="save">Until a save ends it</option>
                </select>
              </label>
              {duration === "rounds" && (
                <label className="app-label">
                  Rounds
                  <Stepper value={rounds} min={1} max={100} onChange={setRounds} label="Rounds" />
                </label>
              )}
              {duration === "save" && (
                <>
                  <label className="app-label">
                    Save
                    <select className="cf-select" aria-label="Save" value={save} onChange={(e) => setSave(e.target.value)}>
                      {def.saves.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="app-label">
                    DC
                    <Stepper value={dc} min={1} max={60} onChange={setDc} label="DC" />
                  </label>
                </>
              )}
              <label className="app-label">
                Source
                <select className="cf-select" aria-label="Source" value={source} onChange={(e) => setSource(e.target.value)}>
                  <option value="">—</option>
                  {combatants
                    .filter((c) => c.id !== entityId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <div className="app-row">
              <Button variant="primary" onClick={add} disabled={duration === "sourceNextTurn" && !source}>
                Add {cd.name}
              </Button>
            </div>
          </section>
        )}
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// attacks
// ---------------------------------------------------------------------------

function attackLabel(def: D20CombatDef, a: D20Attack): string {
  const bits: string[] = [];
  if (a.bonus !== undefined) bits.push(`${signed(a.bonus)} to hit`);
  if (a.damage.length) bits.push(d20DamageText(def, a.damage));
  if (a.save) bits.push(`${typeof a.save.dc === "number" ? `DC ${a.save.dc} ` : ""}${def.saves.find((s) => s.id === a.save!.save)?.name ?? a.save.save}`);
  return `${a.name} (${bits.join(", ")})`;
}

/** The dice engine's situational choices (e.g. the multiple attack penalty) as selects. */
function useChoiceFields() {
  const { module } = useCampaign();
  return useMemo(() => rollOptionFields(module.module.dice.rollOptions).filter((f) => f.kind === "enum" && !["advantage"].includes(f.key)), [module]);
}

/** Attack inline in the combat panel (the table stays in view): attacker, attack, target, roll, damage, effects. */
export function AttackPanel({ sessionId, combatants, attackerId, onClose }: { sessionId: Id; combatants: Entity[]; attackerId?: Id; onClose: () => void }) {
  const ctx = useCampaign();
  const def = useD20Combat()!;
  const roller = useDiceRoller();
  const withAttacks = combatants.filter((c) => (combatantOf(ctx, c)?.attacks.length ?? 0) > 0);
  const [attacker, setAttacker] = useState<Id>(attackerId && withAttacks.some((c) => c.id === attackerId) ? attackerId : (withAttacks[0]?.id ?? ""));
  const attackerEntity = combatants.find((c) => c.id === attacker);
  const attacks = attackerEntity ? (combatantOf(ctx, attackerEntity)?.attacks ?? []) : [];
  const [index, setIndex] = useState(0);
  const attack = attacks[Math.min(index, attacks.length - 1)];
  const targets = combatants.filter((c) => c.id !== attacker);
  const isPc = (e?: Entity) => !!e && ctx.module.entityType(e.type)?.kind === "character";
  const [target, setTarget] = useState<Id>(() => (targets.find((t) => isPc(attackerEntity) !== isPc(t)) ?? targets[0])?.id ?? "");
  const targetEntity = combatants.find((c) => c.id === target);
  const [close, setClose] = useState<boolean | undefined>();
  const [mode, setMode] = useState<"" | Mode>("");
  const [modifier, setModifier] = useState(0);
  const choiceFields = useChoiceFields();
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [tags, setTags] = useState<string[]>([]);
  const [roll, setRoll] = useState<AttackRoll | undefined>();
  const reset = () => setRoll(undefined);

  const isClose = close ?? attack?.kind === "melee";
  const plan = useMemo(() => {
    if (!attack || !attacker || !target || attack.bonus === undefined) return undefined;
    try {
      return planAttack(ctx, attacker, attack, target, { close: isClose, ...(mode ? { mode } : {}), ...(modifier ? { modifier } : {}), choices });
    } catch {
      return undefined;
    }
    // re-plan when the store changes (conditions, hit points)
  }, [ctx, attacker, attack, target, isClose, mode, modifier, choices, roll]);

  const tagOptions = useMemo(() => {
    const t = targetEntity ? combatantOf(ctx, targetEntity) : undefined;
    const out = new Set<string>();
    for (const m of t?.damageModifiers ?? []) {
      for (const e of m.except ?? []) if (!def.damageTypes.some((x) => x.id === e)) out.add(e);
      if (d20IsTraitModifier(def, m)) out.add(m.type);
    }
    return [...out].sort();
  }, [ctx, targetEntity, def]);

  // after a roll, show what it was rolled with (its conditions may have changed since, e.g. the target fell prone)
  const shown = roll?.plan ?? plan;
  const doRoll = () => {
    if (!plan) return;
    roller.roll({
      title: `${plan.attacker.name}: ${plan.attack.name} at ${plan.target.name}`,
      run: attackRun(ctx, plan),
      perform: (entered) => {
        const r = attempt(() => rollAttack(ctx, sessionId, plan, entered));
        if (r) setRoll(r);
      },
    });
  };

  return (
    <Card
      title="Attack"
      className="app-d20__attack"
      elevated
      data-testid="attack-dialog"
      actions={
        <span className="app-row">
          <Badge title="Rolled and logged for the GM only.">GM only</Badge>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close attack">
            ×
          </Button>
        </span>
      }
    >
      <div className="app-stack">
        <div className="app-row app-combat__fields">
          <label className="app-label">
            Attacker
            <select
              className="cf-select"
              aria-label="Attacker"
              value={attacker}
              onChange={(e) => {
                setAttacker(e.target.value);
                setIndex(0);
                reset();
              }}
            >
              {withAttacks.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="app-label app-grow">
            Attack
            <select
              className="cf-select"
              aria-label="Attack"
              value={String(Math.min(index, attacks.length - 1))}
              onChange={(e) => {
                setIndex(Number(e.target.value));
                setClose(undefined);
                reset();
              }}
            >
              {attacks.map((a, i) => (
                <option key={`${a.name}-${i}`} value={i}>
                  {attackLabel(def, a)}
                </option>
              ))}
            </select>
          </label>
          <label className="app-label">
            Target
            <select
              className="cf-select"
              aria-label="Target"
              value={target}
              onChange={(e) => {
                setTarget(e.target.value);
                reset();
              }}
            >
              {targets.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {attack && <AttackFacts def={def} attack={attack} />}
        {attack && attack.bonus === undefined && attack.save && (
          <SaveEffectSection sessionId={sessionId} effect={attack.save} label={attack.name} sourceId={attacker} combatants={combatants} defaultTargets={target ? [target] : []} traits={attack.traits} />
        )}
        {attack && attack.bonus !== undefined && shown && (
          <>
            <div className="app-row app-combat__fields">
              <label className="app-row" title={`Effects such as prone care whether the attacker is ${def.closeLabel ?? "within 5 feet"}.`}>
                <input
                  type="checkbox"
                  className="cf-checkbox"
                  checked={isClose}
                  onChange={(e) => {
                    setClose(e.target.checked);
                    reset();
                  }}
                  aria-label={`Attacker ${def.closeLabel ?? "within 5 feet"}`}
                />
                Attacker {def.closeLabel ?? "within 5 feet"}
              </label>
              <label className="app-label">
                Roll
                <select
                  className="cf-select"
                  aria-label="Roll mode"
                  data-testid="attack-mode"
                  value={mode}
                  onChange={(e) => {
                    setMode(e.target.value as "" | Mode);
                    reset();
                  }}
                >
                  <option value="">From conditions: {MODE_LABEL[shown.conditionMode.mode].toLowerCase()}</option>
                  {(["normal", "advantage", "disadvantage"] as Mode[]).map((m) => (
                    <option key={m} value={m}>
                      {MODE_LABEL[m]}
                    </option>
                  ))}
                </select>
              </label>
              {choiceFields.map((f) => (
                <label key={f.key} className="app-label">
                  {f.label}
                  <select
                    className="cf-select"
                    aria-label={f.label}
                    value={choices[f.key] ?? String(f.defaultValue ?? "")}
                    onChange={(e) => {
                      setChoices((c) => ({ ...c, [f.key]: e.target.value }));
                      reset();
                    }}
                  >
                    {(f.values ?? []).map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <label className="app-label">
                Modifier
                <Stepper
                  value={modifier}
                  min={-20}
                  max={20}
                  onChange={(v) => {
                    setModifier(v);
                    reset();
                  }}
                  label="Attack modifier"
                />
              </label>
            </div>
            {tagOptions.length > 0 && (
              <div className="app-row" aria-label="The attack counts as">
                <span className="cf-muted">Counts as</span>
                {tagOptions.map((t) => (
                  <label key={t} className="app-row">
                    <input type="checkbox" className="cf-checkbox" checked={tags.includes(t)} onChange={(e) => setTags((x) => (e.target.checked ? [...x, t] : x.filter((y) => y !== t)))} aria-label={`Counts as ${t}`} />
                    {t.replace(/-/g, " ")}
                  </label>
                ))}
              </div>
            )}
            <p className="app-d20__poolline" data-testid="attack-pool">
              <strong>{shown.pool.label?.replace(/ vs DC \d+$/, "")}</strong> vs AC {shown.ac}
              {shown.ac !== shown.acBase && <span className="cf-muted"> ({shown.acBase}; {shown.acParts.filter((p) => p.stacked).map(d20ModifierText).join(", ")})</span>}
              {shown.pool.breakdown && shown.pool.breakdown.length > 1 && <span className="cf-muted"> · {shown.pool.breakdown.map((b) => `${b.label} ${signed(b.count)}`).join(", ")}</span>}
            </p>
            {shown.mode === shown.conditionMode.mode ? <ModeReasons advantage={shown.conditionMode.advantage} disadvantage={shown.conditionMode.disadvantage} /> : <span className="app-d20__reasons">GM's choice: {MODE_LABEL[shown.mode].toLowerCase()}</span>}
            {shown.against.critOnHit.length > 0 && <span className="app-d20__reasons">A hit is a critical hit: {shown.against.critOnHit.join(", ")}</span>}
            <div className="app-row">
              <Button variant="primary" onClick={doRoll} data-testid="roll-attack">
                {roll ? "Roll the attack again" : "Roll attack"}
              </Button>
            </div>
            {roll && <AttackResult key={roll.seed} sessionId={sessionId} roll={roll} traits={[...attack.traits, ...tags]} combatants={combatants} />}
          </>
        )}
      </div>
    </Card>
  );
}

function AttackFacts({ def, attack }: { def: D20CombatDef; attack: D20Attack }) {
  const save = attack.save;
  return (
    <dl className="app-combat__stats app-d20__facts" data-testid="attack-facts">
      {attack.bonus !== undefined && (
        <>
          <dt>To hit</dt>
          <dd>{signed(attack.bonus)}</dd>
        </>
      )}
      {attack.damage.length > 0 && (
        <>
          <dt>Damage</dt>
          <dd>{d20DamageText(def, attack.damage)}</dd>
        </>
      )}
      {(attack.reach || attack.range) && (
        <>
          <dt>{attack.range ? "Range" : "Reach"}</dt>
          <dd>{attack.range ?? attack.reach}</dd>
        </>
      )}
      {attack.traits.length > 0 && (
        <>
          <dt>Traits</dt>
          <dd>{attack.traits.join(", ")}</dd>
        </>
      )}
      {save && (
        <>
          <dt>Save</dt>
          <dd>
            {typeof save.dc === "number" ? `DC ${save.dc} ` : ""}
            {def.saves.find((s) => s.id === save.save)?.name ?? save.save}
            {save.damage?.length ? `, ${d20DamageText(def, save.damage as never)}${save.half ? " (half on a success)" : ""}` : ""}
            {save.conditions?.length ? `; on a failure: ${save.conditions.map((c) => d20Condition(def, c.id)?.name ?? c.id).join(", ")}` : ""}
          </dd>
        </>
      )}
      {(attack.effect || attack.damageNote || save?.text) && (
        <>
          <dt>Effect</dt>
          <dd className="app-d20__effect">{[attack.damageNote, attack.effect, save?.text].filter(Boolean).join(" · ")}</dd>
        </>
      )}
    </dl>
  );
}

function AttackResult({ sessionId, roll, traits, combatants }: { sessionId: Id; roll: AttackRoll; traits: string[]; combatants: Entity[] }) {
  const ctx = useCampaign();
  const def = useD20Combat()!;
  const roller = useDiceRoller();
  const { plan, resolution } = roll;
  const [damage, setDamage] = useState<DamageRollDone | undefined>();
  const [applied, setApplied] = useState<HitApplied | undefined>();
  const [onHit, setOnHit] = useState<string[]>(() => (plan.attack.onHit ?? []).map((c) => c.id));
  const [conditionsDone, setConditionsDone] = useState(false);
  const mod = useMemo(() => damageModifierFor(ctx, plan.attacker.id, plan.attack), [ctx, plan]);
  const label = `${plan.attacker.name}: ${plan.attack.name} damage`;
  const rollDmg = () =>
    roller.roll({
      title: label,
      run: damageRun(ctx, plan.attack.damage, { critical: resolution.critical, ...(mod ? { modifier: mod } : {}) }),
      perform: (entered) => {
        const d = attempt(() => rollDamage(ctx, sessionId, label, plan.attacker.id, plan.attack.damage, { critical: resolution.critical, ...(mod ? { modifier: mod } : {}) }, entered));
        if (d) {
          setDamage(d);
          setApplied(undefined);
        }
      },
    });
  const outcome = resolution.critical ? "Critical hit" : resolution.hit ? "Hit" : "Miss";
  return (
    <section className="app-combat__outcome app-d20__result" data-testid="attack-result">
      <p className="app-row">
        <RollFaces result={roll.result} />
        <strong className="app-d20__total" data-testid="attack-total">
          {roll.result.total}
        </strong>
        <Badge tone={resolution.critical ? "success" : resolution.hit ? "accent" : "danger"} data-testid="attack-outcome" data-outcome={resolution.critical ? "critical" : resolution.hit ? "hit" : "miss"}>
          {outcome}
        </Badge>
        <span className="cf-muted" data-testid="attack-reason">
          {resolution.reason}
        </span>
        <RollSource seed={roll.seed} entered={roll.entered} />
      </p>
      {resolution.hit && plan.attack.damage.length > 0 && (
        <div className="app-row">
          <Button variant="primary" onClick={rollDmg} data-testid="roll-damage">
            {damage ? "Roll damage again" : `Roll damage${resolution.critical ? (def.rules.critDamage === "dice" ? " (dice doubled)" : " (doubled)") : ""}`}
          </Button>
        </div>
      )}
      {damage && <DamageApply key={damage.seed} sessionId={sessionId} damage={damage} targetId={plan.target.id} traits={traits} critical={resolution.critical} by={`${plan.attacker.name}: ${plan.attack.name}`} onApplied={setApplied} applied={applied} sourceId={plan.attacker.id} />}
      {resolution.hit && (plan.attack.onHit?.length ?? 0) > 0 && (
        <div className="app-row">
          <span className="cf-muted">On a hit:</span>
          {(plan.attack.onHit ?? []).map((c) => (
            <label key={c.id} className="app-row">
              <input type="checkbox" className="cf-checkbox" checked={onHit.includes(c.id)} onChange={(e) => setOnHit((x) => (e.target.checked ? [...x, c.id] : x.filter((y) => y !== c.id)))} />
              {d20Condition(def, c.id)?.name ?? c.id}
            </label>
          ))}
          <Button
            size="sm"
            disabled={conditionsDone || onHit.length === 0}
            onClick={() => {
              for (const c of (plan.attack.onHit ?? []).filter((x) => onHit.includes(x.id))) applyCondition(ctx, sessionId, plan.target.id, c, { sourceId: plan.attacker.id, source: `${plan.attacker.name}: ${plan.attack.name}` });
              setConditionsDone(true);
            }}
          >
            {conditionsDone ? "Applied" : `Apply to ${plan.target.name}`}
          </Button>
        </div>
      )}
      {resolution.hit && plan.attack.save && (
        <SaveEffectSection sessionId={sessionId} effect={plan.attack.save} label={plan.attack.name} sourceId={plan.attacker.id} combatants={combatants} defaultTargets={[plan.target.id]} traits={traits} />
      )}
    </section>
  );
}

/** Rolled damage against one target: each part, the target's damage modifiers with before and after, an editable total, Apply. */
function DamageApply({
  sessionId,
  damage,
  targetId,
  traits,
  critical,
  by,
  multiplier = 1,
  onApplied,
  applied,
  sourceId,
}: {
  sessionId: Id;
  damage: DamageRollDone;
  targetId: Id;
  traits: string[];
  critical: boolean;
  by: string;
  multiplier?: number;
  onApplied: (h: HitApplied) => void;
  applied: HitApplied | undefined;
  sourceId?: Id;
}) {
  const ctx = useCampaign();
  const def = useD20Combat()!;
  const target = ctx.store.get("entities", targetId);
  const after: D20DamageApplied = useMemo(() => damageAgainst(ctx, targetId, damage.roll, traits, multiplier), [ctx, targetId, damage, traits, multiplier]);
  const [amount, setAmount] = useState(after.total);
  const [persistentDone, setPersistentDone] = useState(false);
  const r = damage.roll;
  return (
    <div className="app-stack app-d20__damage" data-testid="damage-result">
      <p className="app-row">
        {r.parts.map((p, i) => (
          <span key={i} className="app-d20__part">
            <span className="cf-dice__faces">
              {p.raw.map((v, j) => (
                <DieFace key={j} spec={undefined} value={v} />
              ))}
            </span>
            <span className="cf-mono">
              {p.rolled}
              {p.type ? ` ${d20DamageTypeName(def, p.type)}` : ""} = {p.total}
            </span>
          </span>
        ))}
        {r.critical && <Badge tone="success">{r.doubled === "dice" ? "critical: dice doubled" : "critical: doubled"}</Badge>}
        {r.modifier && <span className="cf-muted">{r.modifier.labels.join(", ")}</span>}
        <RollSource seed={damage.seed} entered={damage.entered} />
      </p>
      {multiplier !== 1 && <p className="cf-muted">× {multiplier} for the save</p>}
      {after.lines.length > 0 && (
        <ul className="app-bullets" data-testid="damage-modifiers">
          {after.lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
      {applied ? (
        <p className="app-combat__hitline" data-testid="damage-applied">
          <strong>{applied.entity.name}</strong> takes {applied.amount} damage: HP {applied.after.current}/{applied.after.max}
          {applied.fromTemp ? ` (${applied.fromTemp} from temporary hit points)` : ""}
          {applied.dropped ? `. Down to 0${applied.conditionsAdded.length ? `: ${applied.conditionsAdded.join(", ")}` : ""}${applied.defeated ? ", defeated" : ""}.` : "."}
          {applied.alreadyDown && applied.rule ? ` ${applied.rule.text}` : ""}
        </p>
      ) : (
        <div className="app-row">
          <label className="app-label">
            Damage
            <Stepper value={amount} min={0} max={999} onChange={setAmount} label="Damage to apply" />
          </label>
          <Button
            variant="danger"
            onClick={() => {
              const h = attempt(() => applyD20Hit(ctx, sessionId, targetId, amount, { critical, by }));
              if (h) onApplied(h);
            }}
            data-testid="apply-damage"
          >
            Apply {amount} damage to {target?.name ?? "the target"}
          </Button>
        </div>
      )}
      {r.persistent.length > 0 && def.persistentCondition && (
        <div className="app-row">
          <span className="cf-muted">Persistent: {d20DamageText(def, r.persistent)}</span>
          <Button
            size="sm"
            disabled={persistentDone}
            onClick={() => {
              applyCondition(ctx, sessionId, targetId, { id: def.persistentCondition! }, { note: d20DamageText(def, r.persistent), source: by, ...(sourceId ? { sourceId } : {}) });
              setPersistentDone(true);
            }}
          >
            {persistentDone ? "Applied" : "Apply persistent damage"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// save effects
// ---------------------------------------------------------------------------

/** An effect that asks for saves: its DC, the damage rolled once, each target's save, damage and conditions by outcome. */
function SaveEffectSection({ sessionId, effect, label, sourceId, combatants, defaultTargets, traits }: { sessionId: Id; effect: D20SaveEffect; label: string; sourceId?: Id; combatants: Entity[]; defaultTargets: Id[]; traits: string[] }) {
  const ctx = useCampaign();
  const def = useD20Combat()!;
  const roller = useDiceRoller();
  const base = useMemo(() => effectDc(ctx, sourceId, effect), [ctx, sourceId, effect]);
  const [dc, setDc] = useState(base.dc);
  const [targets, setTargets] = useState<Id[]>(defaultTargets);
  const [damage, setDamage] = useState<DamageRollDone | undefined>();
  const parts = (effect.damage as D20Attack["damage"] | undefined) ?? [];
  const save = def.saves.find((s) => s.id === effect.save);
  const rollDmg = () =>
    roller.roll({
      title: `${label}: damage`,
      run: damageRun(ctx, parts, {}),
      perform: (entered) => {
        const d = attempt(() => rollDamage(ctx, sessionId, `${label} damage`, sourceId, parts, {}, entered));
        if (d) setDamage(d);
      },
    });
  return (
    <section className="app-d20__save" aria-label={`${label}: saves`} data-testid="save-effect">
      <p className="app-row app-combat__fields">
        <strong className="app-grow">
          {label}: {save?.name ?? effect.save}
        </strong>
        <label className="app-label">
          DC
          <Stepper value={dc} min={1} max={60} onChange={setDc} label="Save DC" />
        </label>
        {base.parts.length > 0 && <span className="cf-muted">({base.base}; {base.parts.filter((p) => p.stacked).map(d20ModifierText).join(", ")})</span>}
      </p>
      {effect.text && <p className="cf-muted">{effect.text}</p>}
      <div className="app-row" aria-label="Targets">
        {combatants
          .filter((c) => c.id !== sourceId)
          .map((c) => (
            <label key={c.id} className="app-row">
              <input type="checkbox" className="cf-checkbox" checked={targets.includes(c.id)} onChange={(e) => setTargets((t) => (e.target.checked ? [...t, c.id] : t.filter((x) => x !== c.id)))} aria-label={`Target ${c.name}`} />
              {c.name}
            </label>
          ))}
      </div>
      {parts.length > 0 && (
        <div className="app-row">
          <Button onClick={rollDmg} data-testid="roll-effect-damage">
            {damage ? "Roll the damage again" : `Roll damage (${d20DamageText(def, parts)})`}
          </Button>
          {damage && (
            <span className="cf-mono" data-testid="effect-damage">
              {damage.roll.total} damage <RollSource seed={damage.seed} entered={damage.entered} />
            </span>
          )}
        </div>
      )}
      <ul className="app-list">
        {targets.map((id) => (
          <SaveTargetRow key={`${id}-${dc}-${damage?.seed ?? ""}`} sessionId={sessionId} targetId={id} effect={effect} dc={dc} label={label} damage={damage} traits={traits} {...(sourceId ? { sourceId } : {})} needsDamage={parts.length > 0} />
        ))}
      </ul>
    </section>
  );
}

function SaveTargetRow({ sessionId, targetId, effect, dc, label, damage, traits, sourceId, needsDamage }: { sessionId: Id; targetId: Id; effect: D20SaveEffect; dc: number; label: string; damage: DamageRollDone | undefined; traits: string[]; sourceId?: Id; needsDamage: boolean }) {
  const ctx = useCampaign();
  const def = useD20Combat()!;
  const roller = useDiceRoller();
  const target = ctx.store.get("entities", targetId);
  const plan = useMemo(() => attempt(() => planSave(ctx, targetId, effect.save, dc)), [ctx, targetId, effect.save, dc]);
  const [roll, setRoll] = useState<SaveRoll | undefined>();
  const [applied, setApplied] = useState<HitApplied | undefined>();
  const [conditionsDone, setConditionsDone] = useState(false);
  if (!target || !plan) return null;
  const doRoll = () =>
    roller.roll({
      title: `${target.name}: ${plan.save.name} against ${label}`,
      run: saveRun(ctx, plan),
      perform: (entered) => {
        const r = attempt(() => rollSave(ctx, sessionId, plan, label, entered));
        if (r) setRoll(r);
      },
    });
  const degree = roll?.resolution.degree;
  const mult = degree ? saveMultiplier(ctx, degree, effect.half) : 1;
  const conditions = degree ? d20SaveConditions(effect, degree) : [];
  return (
    <li className="app-list__row app-d20__savetarget" data-save-target={targetId}>
      <div className="app-stack app-grow">
        <p className="app-row">
          <strong>{target.name}</strong>
          <span className="cf-muted">
            {plan.save.name} {signed(plan.bonus)}
            {plan.own.parts.length ? `, ${plan.own.parts.map(d20ModifierText).join(", ")}` : ""}
          </span>
          <ModeReasons advantage={plan.conditionMode.advantage} disadvantage={plan.conditionMode.disadvantage} />
          {plan.own.autoFail.length > 0 && <Badge tone="danger">fails automatically: {plan.own.autoFail.join(", ")}</Badge>}
          {roll ? (
            <>
              <RollFaces result={roll.result} />
              <Badge tone={roll.resolution.success ? "success" : "danger"} data-testid="save-outcome">
                {degreeLabel(roll.resolution.degree)}
              </Badge>
              <span className="cf-muted">{roll.resolution.reason}</span>
            </>
          ) : (
            <Button size="sm" onClick={doRoll} aria-label={`Roll ${plan.save.name} for ${target.name}`}>
              Roll save
            </Button>
          )}
        </p>
        {roll && needsDamage && damage && (
          <DamageApply sessionId={sessionId} damage={damage} targetId={targetId} traits={traits} critical={false} by={label} multiplier={mult} onApplied={setApplied} applied={applied} {...(sourceId ? { sourceId } : {})} />
        )}
        {roll && conditions.length > 0 && (
          <p className="app-row">
            <span className="cf-muted">{degree === "critical-failure" ? "Critical failure" : "Failure"}:</span>
            {conditions.map((c) => d20ConditionLabel({ name: d20Condition(def, c.id)?.name ?? c.id, ...(c.value !== undefined ? { value: c.value } : {}) })).join(", ")}
            <Button
              size="sm"
              disabled={conditionsDone}
              onClick={() => {
                for (const c of conditions) applyCondition(ctx, sessionId, targetId, c, { ...(sourceId ? { sourceId, source: `${ctx.store.get("entities", sourceId)?.name ?? ""}: ${label}` } : { source: label }), dc });
                setConditionsDone(true);
              }}
            >
              {conditionsDone ? "Applied" : "Apply"}
            </Button>
          </p>
        )}
        {roll && degree && !needsDamage && conditions.length === 0 && <p className="cf-muted">{roll.resolution.success ? "No effect." : effect.text ?? "The effect applies."}</p>}
      </div>
    </li>
  );
}

/** The current d20 combat state for one entity, for other table views (e.g. the player screen). */
export function hpState(current: number, max: number): "unhurt" | "hurt" | "bloodied" | "down" {
  if (max <= 0) return "unhurt";
  if (current <= 0) return "down";
  if (current >= max) return "unhurt";
  return current * 2 <= max ? "bloodied" : "hurt";
}
