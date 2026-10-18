import { useId, useState } from "react";
import {
  dismissLifecycle,
  getPath,
  forceAdvance,
  formatLifecycleDuration,
  formatLifecycleMinutes,
  lifecycleConfig,
  lifecycleStage,
  lifecycleState,
  lifecycleVariant,
  paceFactor,
  removalBlocked,
  removeLifecycle,
  setLifecyclePace,
  setLifecyclePaused,
  startLifecycle,
  type LifecycleConfig,
  type LifecycleContext,
  type LifecycleInstance,
  type LifecycleResult,
  type LifecycleState,
} from "@campaign-forge/module-sdk";
import { Badge } from "../primitives/Badge";
import { Button, IconButton } from "../primitives/Button";
import { PageRef } from "../primitives/PageRef";
import { cx, newId } from "../sheet/paths";
import { TrackerFrame } from "./TrackerFrame";
import type { TrackerEntity, TrackerProps } from "./types";

/**
 * Timed stages driven entirely by the tracker's `config` (a module-sdk
 * `LifecycleConfig`): one card per running instance with its subject, the
 * variant's stages, time in the current stage against the expected time,
 * what comes next, and the GM's controls (advance now, pause, pace, the
 * stage's check and removal, stop tracking). Time itself moves when the app
 * advances the in-world clock; this component only reads `worldMinutes`.
 */
export function LifecycleTracker({ def, state, onChange, entities = [], onEffects, onRollOperation, readonly, worldMinutes = 0, witnesses, className }: TrackerProps) {
  const config = lifecycleConfig(def.config);
  const current = lifecycleState(state);
  const byId = new Map(entities.map((e) => [e.id, e]));
  const hasCondition = (id: string, condition: string) => !!byId.get(id)?.conditions?.includes(condition);
  const instanceLabel = config.labels?.instance ?? "Life cycle";

  const ctx = (): LifecycleContext => ({
    at: worldMinutes,
    hasCondition,
    witnesses: witnesses ?? entities.filter((e) => e.kind === undefined || e.kind === "character").map((e) => ({ id: e.id, name: e.name })),
    newId: () => newId("spawn"),
  });
  const commit = (result: LifecycleResult | LifecycleState) => {
    if (readonly) return;
    if ("effects" in result) {
      if (result.effects.length) onEffects?.(result.effects);
      onChange(withExtras(state, result.state));
    } else onChange(withExtras(state, result));
  };

  const active = current.instances.filter((i) => !i.ended);
  const ended = current.instances.filter((i) => i.ended);

  return (
    <TrackerFrame def={def} className={className}>
      {current.instances.length === 0 && <span className="cf-muted">No {instanceLabel.toLowerCase()}s tracked.</span>}
      {[...active, ...ended].map((inst) => (
        <InstanceCard
          key={inst.id}
          config={config}
          inst={inst}
          entity={byId.get(inst.host)}
          creature={inst.creature ? byId.get(inst.creature) : undefined}
          readonly={readonly}
          worldMinutes={worldMinutes}
          blocked={removalBlocked(config, inst, hasCondition)}
          onAdvance={(to) => commit(forceAdvance(config, current, inst.id, to, ctx()))}
          onPause={(paused) => commit(setLifecyclePaused(config, current, inst.id, paused))}
          onPace={(pace) => commit(setLifecyclePace(config, current, inst.id, pace))}
          onRemove={() => commit(removeLifecycle(config, current, inst.id, ctx()))}
          onDismiss={() => commit(dismissLifecycle(current, inst.id))}
          onCheck={onRollOperation ? (op) => onRollOperation(op, inst.host, { lifecycle: inst.id }) : undefined}
        />
      ))}
      {!readonly && (
        <StartForm
          config={config}
          entities={entities}
          onStart={(host, variant) => {
            const id = newId("lc");
            commit(startLifecycle(config, current, { id, variant, host: host.id, hostName: host.name, seed: `${def.id}:${host.id}:${worldMinutes}:${current.instances.length}` }, ctx()));
          }}
        />
      )}
    </TrackerFrame>
  );
}

/** Keep keys other than `instances` that the app may store next to them. */
function withExtras(prev: unknown, next: LifecycleState): Record<string, unknown> {
  const base = typeof prev === "object" && prev !== null && !Array.isArray(prev) ? (prev as Record<string, unknown>) : {};
  return { ...base, instances: next.instances };
}

interface InstanceCardProps {
  config: LifecycleConfig;
  inst: LifecycleInstance;
  entity?: TrackerEntity;
  creature?: TrackerEntity;
  readonly?: boolean;
  worldMinutes: number;
  blocked: boolean;
  onAdvance: (to: string) => void;
  onPause: (paused: boolean) => void;
  onPace: (pace: string) => void;
  onRemove: () => void;
  onDismiss: () => void;
  onCheck?: (operation: string) => void;
}

function InstanceCard({ config, inst, entity, creature, readonly, blocked, onAdvance, onPause, onPace, onRemove, onDismiss, onCheck }: InstanceCardProps) {
  const paceId = useId();
  const variant = lifecycleVariant(config, inst.variant);
  const stage = lifecycleStage(config, inst.variant, inst.stage);
  const hostName = entity?.name ?? inst.hostName;
  const subject = config.labels?.subject ?? "Subject";
  const next = stage?.next ?? [];
  const visited = new Set(inst.history.map((h) => h.stage));
  const factor = paceFactor(config, inst.pace);
  const timed = inst.duration !== undefined;
  const remaining = timed ? Math.max(0, (inst.duration! - inst.progress) / factor) : undefined;
  const pace = config.paces.find((p) => p.id === inst.pace);
  const title = `${hostName}: ${stage?.name ?? inst.stage}`;

  return (
    <article
      className={cx("cf-tracker__row", "cf-lifecycle", inst.ended && "cf-lifecycle--ended", !inst.ended && next.length > 0 && !timed && "cf-tracker__row--warn")}
      data-lifecycle={inst.id}
      data-stage={inst.stage}
      aria-label={title}
    >
      <header className="cf-lifecycle__head">
        <span className="cf-tracker__name">
          {subject}: {hostName}
        </span>
        <span className="cf-muted">{variant?.name ?? inst.variant}</span>
        {inst.paused && <Badge tone="warning">Paused</Badge>}
        {pace && pace.factor !== 1 && <Badge tone="accent">{pace.label}</Badge>}
        {inst.ended && <Badge tone="success">Ended: {inst.ended.reason}</Badge>}
      </header>

      <ol className="cf-lifecycle__stages" aria-label="Stages">
        {(variant?.stages ?? []).map((s) => (
          <li
            key={s.id}
            className={cx("cf-lifecycle__stage", s.id === inst.stage && "cf-lifecycle__stage--current", s.id !== inst.stage && visited.has(s.id) && "cf-lifecycle__stage--done")}
            aria-current={s.id === inst.stage ? "step" : undefined}
          >
            {s.name}
            {s.label && <span className="cf-lifecycle__stage-label"> {s.label}</span>}
          </li>
        ))}
      </ol>

      {stage && (
        <div className="cf-lifecycle__now">
          <strong data-testid={`lifecycle-stage-${inst.id}`}>{stage.label ? `${stage.name} (${stage.label})` : stage.name}</strong> <PageRef page={stage.page} />
          {creature && (
            <span className="cf-lifecycle__creature">
              {config.labels?.creature ?? "Spawn"}: {creature.name}
            </span>
          )}
          {stage.summary && <p className="cf-lifecycle__note">{stage.summary}</p>}
          {timed ? (
            <div className="cf-lifecycle__time">
              <progress max={inst.duration} value={Math.min(inst.progress, inst.duration!)} aria-label={`Time in ${stage.name}`} />
              <span>
                {formatLifecycleMinutes(config, inst.progress)} of {stage.duration ? formatLifecycleDuration(config, stage.duration) : formatLifecycleMinutes(config, inst.duration!)}
                {Array.isArray(stage.duration?.amount) && <span className="cf-muted"> (rolled: {formatLifecycleMinutes(config, inst.duration!)})</span>}
              </span>
            </div>
          ) : (
            <div className="cf-lifecycle__time">
              <span>{formatLifecycleMinutes(config, inst.progress)} in this stage</span>
            </div>
          )}
          {next.length > 0 && !inst.ended && (
            <p className="cf-lifecycle__next">
              Next: {next.map((n) => n.label ?? lifecycleStage(config, inst.variant, n.to)?.name ?? n.to).join(" or ")}
              {timed && remaining !== undefined && (inst.paused ? " (paused)" : ` in about ${formatLifecycleMinutes(config, remaining)}`)}
              {!timed && " when the GM decides"}
            </p>
          )}
          {!timed && stage.waitNote && <p className="cf-lifecycle__note">{stage.waitNote}</p>}
          {next.length === 0 && stage.finalNote && <p className="cf-lifecycle__note">{stage.finalNote}</p>}
          {stage.unverified && stage.note && (
            <p className="cf-lifecycle__note">
              <Badge tone="warning" title="Not a number from the book">
                Module decision
              </Badge>{" "}
              {stage.note}
            </p>
          )}
          {stage.check && !inst.ended && (
            <p className="cf-lifecycle__note">
              {stage.check.label}: every {formatLifecycleDuration(config, stage.check.every)}
              {stage.check.note ? `. ${stage.check.note}` : ""} <PageRef page={stage.check.page} />
            </p>
          )}
        </div>
      )}

      {!readonly && (
        <div className="cf-lifecycle__actions">
          {!inst.ended &&
            next.map((n) => {
              const name = n.label ?? lifecycleStage(config, inst.variant, n.to)?.name ?? n.to;
              return (
                <Button key={n.to} size="sm" variant="primary" onClick={() => onAdvance(n.to)} title={n.condition} aria-label={`Advance ${hostName} to ${name} now`}>
                  Advance to {name}
                </Button>
              );
            })}
          {!inst.ended && (
            <Button size="sm" active={inst.paused} onClick={() => onPause(!inst.paused)} title={config.pauseNote} aria-label={`${inst.paused ? "Resume" : "Pause"} ${hostName}`}>
              {inst.paused ? "Resume" : "Pause"}
            </Button>
          )}
          {!inst.ended && (
            <label className="cf-lifecycle__pace" htmlFor={paceId} title={config.paceNote}>
              Pace
              <select id={paceId} className="cf-select" value={inst.pace} onChange={(e) => onPace(e.target.value)}>
                {config.paces.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!inst.ended && stage?.check && onCheck && (
            <Button size="sm" onClick={() => onCheck(stage.check!.operation)} aria-label={`${stage.check.label} for ${hostName}`}>
              {stage.check.label}
            </Button>
          )}
          {!inst.ended && stage?.removal && (
            <Button size="sm" variant="danger" onClick={onRemove} disabled={blocked} title={blocked ? stage.removal.blockedNote : stage.removal.note} aria-label={`${stage.removal.label}: ${hostName}`}>
              {stage.removal.label}
            </Button>
          )}
          <IconButton size="sm" variant="ghost" label={`Stop tracking ${hostName}`} icon="×" onClick={onDismiss} />
        </div>
      )}
      {!readonly && !inst.ended && stage?.removal && (
        <p className="cf-lifecycle__note">{blocked ? stage.removal.blockedNote : stage.removal.note}</p>
      )}
    </article>
  );
}

function StartForm({ config, entities, onStart }: { config: LifecycleConfig; entities: TrackerEntity[]; onStart: (host: TrackerEntity, variant: string) => void }) {
  const kinds = config.start?.entityKinds;
  const exempt = config.start?.exemptField;
  const hosts = entities.filter((e) => (!kinds || e.kind === undefined || kinds.includes(e.kind)) && !(exempt && getPath(e.fields, exempt)));
  const [host, setHost] = useState("");
  const [variant, setVariant] = useState(config.defaultVariant);
  const hostId = useId();
  const variantId = useId();
  const chosen = hosts.find((h) => h.id === host) ?? hosts[0];
  if (config.variants.length === 0) return null;
  const label = config.start?.label ?? "Start";
  return (
    <div className="cf-tracker__add cf-lifecycle__start">
      <label htmlFor={hostId} className="cf-sr-only">
        {config.labels?.subject ?? "Subject"}
      </label>
      <select id={hostId} className="cf-select" value={chosen?.id ?? ""} onChange={(e) => setHost(e.target.value)} disabled={hosts.length === 0}>
        {hosts.length === 0 && <option value="">No one to choose</option>}
        {hosts.map((h) => (
          <option key={h.id} value={h.id}>
            {h.name}
          </option>
        ))}
      </select>
      <label htmlFor={variantId} className="cf-sr-only">
        Variant
      </label>
      <select id={variantId} className="cf-select" value={variant} onChange={(e) => setVariant(e.target.value)}>
        {config.variants.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </select>
      <Button size="sm" onClick={() => chosen && onStart(chosen, variant)} disabled={!chosen}>
        {label}
      </Button>
    </div>
  );
}
