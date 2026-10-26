/**
 * Attacks with a weapon from a character's sheet (the `weapons` field's
 * `attack` config): pick a range band, roll the skill the config names with
 * the weapon's pool numbers on the table's skill roll path (seeded, logged,
 * a push adds stress, entered dice work), read the damage of a hit and,
 * when the module has combat health for the target, apply the hit through
 * the module's armor rule. Nothing here knows a game.
 */
import { combatHealthFor, getPath, type Entity, type Id } from "@campaign-forge/core";
import {
  attackRanges,
  defaultAttackRange,
  planWeaponAttack,
  weaponColumnText,
  weaponHitDamage,
  weaponListConfig,
  weaponRows,
  weaponsFieldOf,
  type LoadedModule,
  type RollResult,
  type WeaponAttackConfig,
  type WeaponListConfig,
} from "@campaign-forge/module-sdk";
import { useMemo, useState } from "react";
import { Badge, Button, Dialog, pushToast, valuePathOf } from "../../components/ui";
import { errorMessage } from "../../lib/format";
import { takeHit, type HitApplied } from "../../state/combatActions";
import { useCampaign, useRecord } from "../../state/hooks";
import { HitOutcomeView } from "./Combat";
import { SessionRollPanel, skillInput } from "./DicePanel";

export interface EntityWeapons {
  cfg: WeaponListConfig;
  attack: WeaponAttackConfig;
  rows: Array<Record<string, unknown>>;
}

/** An entity's weapon rows and its sheet's attack config (undefined when its type has no weapons field that attacks). */
export function weaponsOf(module: LoadedModule, entity: Entity | undefined): EntityWeapons | undefined {
  if (!entity) return undefined;
  const field = weaponsFieldOf(module.entityType(entity.type));
  const cfg = weaponListConfig(field);
  if (!field || !cfg?.attack) return undefined;
  return { cfg, attack: cfg.attack, rows: weaponRows(getPath(entity.fields, valuePathOf(field.path))) };
}

const weaponName = (row: Record<string, unknown> | undefined, i: number) => (typeof row?.name === "string" && row.name ? row.name : `Weapon ${i + 1}`);

/** "Attack with …" options for an entity's weapons (value `weapon:<index>`). */
export function weaponChoices(module: LoadedModule, entity: Entity | undefined): Array<{ value: string; label: string }> {
  return (weaponsOf(module, entity)?.rows ?? []).map((r, i) => ({ value: `weapon:${i}`, label: `Attack with ${weaponName(r, i)}` }));
}

export function WeaponAttackPanel({ sessionId, attackerId, index, targets }: { sessionId: Id; attackerId: Id; index: number; targets: Entity[] }) {
  const ctx = useCampaign();
  const attacker = useRecord("entities", attackerId);
  const weapons = weaponsOf(ctx.module, attacker);
  const weapon = weapons?.rows[index];
  const [rangeId, setRangeId] = useState(() => (weapons && weapon ? defaultAttackRange(weapons.attack, weapon) : ""));
  const [result, setResult] = useState<RollResult | undefined>();
  const [targetId, setTargetId] = useState<Id>("");
  const [applied, setApplied] = useState<HitApplied | undefined>();
  const [rollKey, setRollKey] = useState(0);
  const hittable = useMemo(() => targets.filter((t) => t.id !== attackerId && combatHealthFor(ctx.module, t)), [targets, attackerId, ctx.module]);

  if (!attacker || !weapons || !weapon) return <p className="cf-muted">That weapon is no longer on the sheet.</p>;
  const { cfg, attack } = weapons;
  const plan = planWeaponAttack(attack, weapon, rangeId);
  const skill = skillInput(ctx.module, attacker, plan.skillId);
  const input = { ...skill.input, ...plan.pool };
  const name = weaponName(weapon, index);
  const label = `${name} (${skill.label}, ${plan.range.label})`;
  const successes = result?.successes ?? 0;
  const damage = weaponHitDamage(plan, successes);
  const extra = plan.extraSuccessesAddDamage ? Math.max(0, successes - 1) : 0;
  const target = hittable.find((t) => t.id === targetId);

  const reset = () => {
    setResult(undefined);
    setApplied(undefined);
    setRollKey((k) => k + 1);
  };
  const apply = () => {
    if (!target) return;
    try {
      setApplied(takeHit(ctx, sessionId, target.id, { amount: plan.damage, extraSuccesses: extra, armorPiercing: plan.armorPiercing, ...(plan.source ? { source: plan.source } : {}), by: `${attacker.name}: ${name}` }));
    } catch (e) {
      pushToast(errorMessage(e), { tone: "danger" });
    }
  };

  return (
    <section className="app-stack app-weapon-attack" data-testid="weapon-attack" data-weapon={name}>
      <header className="app-row">
        <strong className="app-grow">{name}</strong>
        <Badge>{skill.label}</Badge>
      </header>
      <dl className="app-weapon-attack__stats" data-testid="weapon-stats">
        {cfg.columns
          .map((c) => ({ c, text: weaponColumnText(c, weapon) }))
          .filter((x) => x.text)
          .map(({ c, text }) => (
            <div key={c.label} className="app-weapon-attack__stat">
              <dt>{c.label}</dt>
              <dd>{text}</dd>
            </div>
          ))}
      </dl>
      <div className="app-row">
        <label className="app-label">
          Range
          <select
            className="cf-select"
            aria-label="Range"
            value={plan.range.id}
            onChange={(e) => {
              setRangeId(e.target.value);
              reset();
            }}
          >
            {attackRanges(attack, weapon).map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        {hittable.length > 0 && (
          <label className="app-label">
            Target
            <select className="cf-select" aria-label="Target" value={targetId} onChange={(e) => (setTargetId(e.target.value), setApplied(undefined))}>
              <option value="">No target</option>
              {hittable.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {plan.notes.length > 0 && (
        <ul className="app-weapon-attack__notes" data-testid="weapon-notes">
          {plan.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      <SessionRollPanel key={`${index}:${plan.range.id}:${rollKey}`} sessionId={sessionId} entity={attacker} label={label} input={input} onResult={setResult} />
      {result && (
        <p className="app-weapon-attack__result" data-testid="weapon-damage" data-damage={damage}>
          {successes > 0 ? (
            <>
              <strong>Hit: {damage} damage</strong>
              {extra > 0 && (
                <span className="cf-muted">
                  {" "}
                  ({plan.damage} base + {extra} for extra success{extra === 1 ? "" : "es"})
                </span>
              )}
              {plan.source && <Badge tone="warning">{plan.source}</Badge>}
              {plan.armorPiercing && <Badge>armor piercing</Badge>}
            </>
          ) : (
            <strong>Miss: no success.</strong>
          )}
        </p>
      )}
      {result && successes > 0 && target && !applied && (
        <div className="app-row">
          <Button variant="primary" onClick={apply}>
            Apply to {target.name}
          </Button>
        </div>
      )}
      {applied && <HitOutcomeView sessionId={sessionId} outcome={applied} participants={targets} map={undefined} />}
    </section>
  );
}

/** Pick one of a character's weapons, then attack with it (a PC card's Attack button). */
export function WeaponAttackDialog({ sessionId, attackerId, targets, onClose }: { sessionId: Id; attackerId: Id | undefined; targets: Entity[]; onClose: () => void }) {
  const ctx = useCampaign();
  const attacker = useRecord("entities", attackerId);
  const choices = weaponChoices(ctx.module, attacker);
  const [choice, setChoice] = useState("");
  const index = choice ? Number(choice.slice("weapon:".length)) : choices.length === 1 ? 0 : undefined;
  return (
    <Dialog open={!!attacker} onClose={onClose} title={attacker ? `Attack: ${attacker.name}` : "Attack"} className="app-combat__dialog cf-table-mode" footer={<Button onClick={onClose}>Done</Button>}>
      {attacker && (
        <div className="app-stack">
          {choices.length > 1 && (
            <select className="cf-select" aria-label="Weapon" value={choice} onChange={(e) => setChoice(e.target.value)}>
              <option value="">Weapon…</option>
              {choices.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          )}
          {index !== undefined && <WeaponAttackPanel key={index} sessionId={sessionId} attackerId={attacker.id} index={index} targets={targets} />}
        </div>
      )}
    </Dialog>
  );
}
