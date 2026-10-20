/**
 * Dice at the table: a quick skill roll for a PC (the module's `buildPool`,
 * push adds stress through an effect), a free roll of any dice, and the
 * session's roll log. Every roll uses a seeded rng `sessionId:counter` and
 * logs its seed, so the log can reproduce it.
 */
import { getPath, type Entity, type Id, type TrackerState } from "@campaign-forge/core";
import { createRng, type DicePool, type EntityTypeDef, type LoadedModule, type PlayModeId, type RollResult } from "@campaign-forge/module-sdk";
import { useMemo, useRef, useState } from "react";
import { Badge, Button, Card, DiceRollPanel, DieFace, RollLog, Stepper, humanize, resolveBindPath, specById, type RollLogEntry } from "../../components/ui";
import { useCampaign, useMeta } from "../../state/hooks";
import { DICE_LOG, applySessionEffects, diceCounter, recordPoolRoll, type DiceLogData } from "../../state/tableActions";
import { useSessionTrackerState } from "./hooks";
import { SpecialAttackCard, useSpecialAttacks } from "./SpecialAttacks";

const isRecordLike = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

interface SkillOption {
  id: string;
  label: string;
  attribute?: string;
}

/** The skills widget of a character type carries the skill list, attribute bindings and the stress path. */
function skillsField(def: EntityTypeDef | undefined) {
  for (const s of def?.sheet.sections ?? []) for (const f of s.fields) if (f.widget === "skills") return f;
  return undefined;
}

/** Where the skills widget stores skill ratings (`skills.*` means the object at `skills`). */
function skillsPathOf(def: EntityTypeDef | undefined): string {
  return (skillsField(def)?.path ?? "skills").replace(/\.\*$/, "");
}

/**
 * The skills a character type rolls: the skills widget's `config.skills`
 * bindings, else the items of its reference list (`options.ref` or
 * `config.ref`, as the sheet's skills widget reads them). With a mode, items
 * limited to other modes are left out.
 */
export function skillOptions(module: LoadedModule, def: EntityTypeDef | undefined, mode?: PlayModeId): SkillOption[] {
  const field = skillsField(def);
  const cfg = field?.config ?? {};
  const refId = typeof field?.options === "object" && field.options && "ref" in field.options ? field.options.ref : typeof cfg.ref === "string" ? cfg.ref : undefined;
  const refList = refId ? module.referenceList(refId) : undefined;
  const raw: unknown[] = Array.isArray(cfg.skills) ? cfg.skills : (refList?.items ?? []);
  const inMode = (s: Record<string, unknown>) => !mode || !Array.isArray(s.mode) || s.mode.length === 0 || s.mode.includes(mode);
  return raw
    .filter(isRecordLike)
    .filter(inMode)
    .map((s) => {
      const id = String(s.id);
      const ref = refList?.items.find((i) => i.id === id);
      return { id, label: ref?.name ?? humanize(id), ...(typeof s.attribute === "string" ? { attribute: s.attribute } : {}) };
    });
}

/** Where the entity's stress lives: the skills widget's `stressPath`, else the stress tracker's bind. */
export function stressPathFor(module: LoadedModule, entity: Entity): string | undefined {
  const def = module.entityType(entity.type);
  const cfg = skillsField(def)?.config ?? {};
  if (typeof cfg.stressPath === "string") return cfg.stressPath;
  const tracker = module.module.trackers.find((t) => t.kind === "stress" && t.binds?.length);
  return tracker?.binds?.[0] ? resolveBindPath(tracker.binds[0], { id: entity.id, name: entity.name, type: entity.type, fields: entity.fields }) : undefined;
}

function attributesPathFor(def: EntityTypeDef | undefined): string {
  const cfg = skillsField(def)?.config ?? {};
  return typeof cfg.attributesPath === "string" ? cfg.attributesPath : "attributes";
}

/** Attribute ids of an entity (keys of the skills widget's attributes object). */
export function attributeIds(module: LoadedModule, entity: Entity): string[] {
  const attrs = getPath(entity.fields, attributesPathFor(module.entityType(entity.type)));
  return isRecordLike(attrs) ? Object.keys(attrs) : [];
}

/** Pool input for a skill (or an attribute alone) of an entity, captured at the moment it is picked. */
export function skillInput(module: LoadedModule, entity: Entity, choice: string): { label: string; input: Record<string, unknown> } {
  const def = module.entityType(entity.type);
  const attrPath = attributesPathFor(def);
  const stressPath = stressPathFor(module, entity);
  const stress = stressPath ? Number(getPath(entity.fields, stressPath) ?? 0) : 0;
  const num = (v: unknown) => (typeof v === "number" ? v : 0);
  if (choice.startsWith("attr:")) {
    const attributeId = choice.slice(5);
    return { label: humanize(attributeId), input: { attribute: num(getPath(entity.fields, `${attrPath}.${attributeId}`)), skill: 0, attributeId, stress, entity: entity.id } };
  }
  const skill = skillOptions(module, def).find((s) => s.id === choice);
  const attributeId = skill?.attribute;
  return {
    label: skill?.label ?? humanize(choice),
    input: {
      attribute: attributeId ? num(getPath(entity.fields, `${attrPath}.${attributeId}`)) : 0,
      skill: num(getPath(entity.fields, `${skillsPathOf(def)}.${choice}`)),
      skillId: choice,
      ...(attributeId ? { attributeId } : {}),
      stress,
      entity: entity.id,
    },
  };
}

/**
 * Roll a pool for an entity right away, as SessionRollPanel's Roll button
 * does: seeded `sessionId:counter` and logged to the session. Pass the result
 * to SessionRollPanel's `initialResult` so it can be pushed.
 */
export function rollSessionPool(ctx: ReturnType<typeof useCampaign>, sessionId: Id, entity: Entity, label: string, input: Record<string, unknown>): RollResult {
  const dice = ctx.module.module.dice;
  const seed = `${sessionId}:${diceCounter(ctx.store, sessionId)}`;
  const result = dice.roll(dice.buildPool(input), createRng(seed));
  recordPoolRoll(ctx, sessionId, { label: `${entity.name}: ${label}`, seed, result, entityId: entity.id });
  return result;
}

/** A DiceRollPanel bound to the session: seeded, logged, and a push adds one stress to the roller. */
export function SessionRollPanel({ sessionId, entity, label, input, initialResult, onResult }: { sessionId: Id; entity?: Entity; label: string; input: Record<string, unknown>; initialResult?: RollResult; onResult?: (result: RollResult) => void }) {
  const ctx = useCampaign();
  const ts = useSessionTrackerState(sessionId);
  const counter = ts ? ts.log.filter((l) => l.tracker === DICE_LOG).length : 0;
  const seed = `${sessionId}:${counter}`;
  const rng = useMemo(() => createRng(seed), [seed]);
  const lastPushes = useRef(initialResult?.pushes ?? 0);
  return (
    <DiceRollPanel
      dice={ctx.module.module.dice}
      input={input}
      rng={rng}
      initialResult={initialResult}
      pushInput={entity ? { entity: entity.id } : undefined}
      title={entity ? `${entity.name}: ${label}` : label}
      onRolled={(r: RollResult) => {
        const pushed = r.pushes > lastPushes.current;
        lastPushes.current = r.pushes;
        recordPoolRoll(ctx, sessionId, { label: `${entity ? `${entity.name}: ` : ""}${label}${pushed ? " (pushed)" : ""}`, seed, result: r, ...(entity ? { entityId: entity.id } : {}) });
        if (pushed && entity) {
          const path = stressPathFor(ctx.module, entity);
          if (path) applySessionEffects(ctx, sessionId, [{ kind: "incrementField", entity: entity.id, path, by: 1, min: 0 }]);
        }
        onResult?.(r);
      }}
    />
  );
}

export function SkillRoll({ sessionId, pcs }: { sessionId: Id; pcs: Entity[] }) {
  const ctx = useCampaign();
  const { mode } = useMeta();
  const [pcId, setPcId] = useState("");
  const [choice, setChoice] = useState("");
  const [picked, setPicked] = useState<{ key: string; label: string; input: Record<string, unknown> } | undefined>();
  const pc = pcs.find((p) => p.id === pcId);
  const def = pc ? ctx.module.entityType(pc.type) : undefined;
  const skills = skillOptions(ctx.module, def, mode);
  const attrs = pc ? attributeIds(ctx.module, pc) : [];

  const pick = (nextPc: string, nextChoice: string) => {
    setPcId(nextPc);
    setChoice(nextChoice);
    const entity = pcs.find((p) => p.id === nextPc);
    if (!entity || !nextChoice) return setPicked(undefined);
    const built = skillInput(ctx.module, entity, nextChoice);
    setPicked({ key: `${nextPc}:${nextChoice}:${Date.now()}`, ...built });
  };

  return (
    <Card title="Skill roll" className="app-table__skillroll">
      <div className="app-row">
        <select className="cf-select" aria-label="Character" value={pcId} onChange={(e) => pick(e.target.value, choice)}>
          <option value="">Character…</option>
          {pcs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select className="cf-select" aria-label="Skill" value={choice} onChange={(e) => pick(pcId, e.target.value)} disabled={!pc}>
          <option value="">Skill…</option>
          {skills.length > 0 && (
            <optgroup label="Skills">
              {skills.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                  {s.attribute ? ` (${humanize(s.attribute)})` : ""}
                </option>
              ))}
            </optgroup>
          )}
          {attrs.length > 0 && (
            <optgroup label="Attribute only">
              {attrs.map((a) => (
                <option key={a} value={`attr:${a}`}>
                  {humanize(a)}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>
      {pc && picked ? <SessionRollPanel key={picked.key} sessionId={sessionId} entity={pc} label={picked.label} input={picked.input} /> : <p className="cf-muted">Pick a character and a skill.</p>}
    </Card>
  );
}

export function FreeRoll({ sessionId }: { sessionId: Id }) {
  const ctx = useCampaign();
  const dice = ctx.module.module.dice;
  const [counts, setCounts] = useState<Record<string, number>>(() => Object.fromEntries(dice.dice.map((d, i) => [d.id, i === 0 ? 1 : 0])));
  const [result, setResult] = useState<RollResult | undefined>();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const roll = () => {
    const seed = `${sessionId}:${diceCounter(ctx.store, sessionId)}`;
    const pool: DicePool = { dice: { ...counts }, breakdown: Object.entries(counts).filter(([, n]) => n > 0).map(([die, count]) => ({ label: "Free roll", die, count })) };
    const r = dice.roll(pool, createRng(seed));
    setResult(r);
    recordPoolRoll(ctx, sessionId, { label: "Free roll", seed, result: r, kind: "free" });
  };
  const baseId = dice.dice[0]?.id;
  return (
    <Card title="Free roll" className="app-table__freeroll">
      <div className="app-row">
        {dice.dice.map((d) => (
          <label key={d.id} className="app-label app-table__diecount">
            {d.name}
            <Stepper value={counts[d.id] ?? 0} min={0} max={20} onChange={(n) => setCounts({ ...counts, [d.id]: n })} label={`${d.name} count`} />
          </label>
        ))}
        <Button variant="primary" size="lg" onClick={roll} disabled={total === 0}>
          Roll {total}
        </Button>
      </div>
      {result && (
        <div className="app-stack">
          <div className="cf-dice__faces" aria-label="Rolled dice">
            {result.dice.map((d, i) => (
              <DieFace key={i} spec={specById(dice, d.die)} value={d.value} special={d.die !== baseId} />
            ))}
          </div>
          <div className="app-row">
            <Badge tone={result.successes > 0 ? "success" : "muted"}>
              {result.successes} success{result.successes === 1 ? "" : "es"}
            </Badge>
            <span className="cf-muted">{dice.describe(result)}</span>
          </div>
        </div>
      )}
    </Card>
  );
}

/** The session's dice log entries as RollLog entries. */
export function rollLogEntries(ts: TrackerState | undefined): RollLogEntry[] {
  if (!ts) return [];
  return ts.log
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => l.tracker === DICE_LOG)
    .map(({ l, i }) => {
      const data = (l.data ?? {}) as Partial<DiceLogData>;
      const entry: RollLogEntry = { id: `${i}`, at: l.at, label: l.text };
      if (data.seed) entry.summary = `seed ${data.seed}`;
      if (data.result) entry.result = data.result;
      if (data.rolls?.length) entry.records = data.rolls;
      return entry;
    });
}

export function SessionRollLog({ sessionId, max }: { sessionId: Id; max?: number }) {
  const ctx = useCampaign();
  const ts = useSessionTrackerState(sessionId);
  const entries = useMemo(() => rollLogEntries(ts), [ts]);
  return <RollLog entries={entries} dice={ctx.module.module.dice} max={max} />;
}

export function DicePanel({ sessionId, pcs, others = [] }: { sessionId: Id; pcs: Entity[]; others?: Entity[] }) {
  const specials = useSpecialAttacks();
  return (
    <div className="app-stack" data-testid="dice-tab">
      <SkillRoll sessionId={sessionId} pcs={pcs} />
      {specials.length > 0 && <SpecialAttackCard sessionId={sessionId} pcs={pcs} others={others} />}
      <FreeRoll sessionId={sessionId} />
      <Card title="Roll log">
        <SessionRollLog sessionId={sessionId} max={40} />
      </Card>
    </div>
  );
}
