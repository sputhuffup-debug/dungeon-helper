/**
 * Start a module life cycle (a tracker of kind "lifecycle") from an entity:
 * on a character it starts with that character as the subject; on a source
 * creature (its preset is a variant's `sourcePresets`) the GM picks the
 * subject. Shows the stage of any running life cycle the entity is part of.
 * Game-agnostic: labels, variants and kinds come from the tracker config.
 */
import type { Entity, Id } from "@campaign-forge/core";
import { lifecycleStage, type Prompt } from "@campaign-forge/module-sdk";
import { useId, useMemo, useState } from "react";
import { Badge, Button, Dialog, pushToast } from "../../components/ui";
import { errorMessage } from "../../lib/format";
import { useCampaign, useList, useMeta } from "../../state/hooks";
import { activeLifecycles, isExempt, lifecycleStartOptions, startLifecycleFor, type LifecycleStartOption } from "../../state/tableActions";

export function LifecycleStart({ entity, sessionId, onPrompts }: { entity: Entity; sessionId?: Id; onPrompts?: (prompts: Prompt[]) => void }) {
  const ctx = useCampaign();
  useMeta(); // campaign-scoped tracker state lives on the campaign record
  const options = useMemo(() => lifecycleStartOptions(ctx, entity), [ctx, entity]);
  const running = activeLifecycles(ctx, entity.id);
  const [open, setOpen] = useState<LifecycleStartOption | undefined>();
  if (options.length === 0 && running.length === 0) return null;
  return (
    <span className="app-lifecycle-start">
      {running.map(({ def, config, instance }) => {
        const stage = lifecycleStage(config, instance.variant, instance.stage);
        const label = config.labels?.instance ?? def.name;
        const role = instance.host === entity.id ? label : `${config.labels?.creature ?? "Spawn"} from ${instance.hostName}`;
        return (
          <Badge key={instance.id} tone="danger" title={def.name} data-testid="lifecycle-badge">
            {role}: {stage ? `${stage.name}${stage.label ? ` (${stage.label})` : ""}` : instance.stage}
            {instance.paused ? ", paused" : ""}
          </Badge>
        );
      })}
      {options
        .filter((o) => o.role === "source" || !running.some((r) => r.def.id === o.def.id && r.instance.host === entity.id))
        .map((o) => {
          const label = o.config.start?.label ?? "Start";
          return (
            <Button key={o.def.id} size="sm" variant="danger" onClick={() => setOpen(o)} aria-label={`${label}: ${entity.name}`}>
              {label}
            </Button>
          );
        })}
      {open && <StartDialog option={open} entity={entity} sessionId={sessionId} onClose={() => setOpen(undefined)} onPrompts={onPrompts} />}
    </span>
  );
}

function StartDialog({ option, entity, sessionId, onClose, onPrompts }: { option: LifecycleStartOption; entity: Entity; sessionId?: Id; onClose: () => void; onPrompts?: (prompts: Prompt[]) => void }) {
  const ctx = useCampaign();
  const { config, def } = option;
  const kinds = config.start?.entityKinds ?? [];
  const filter = useMemo(() => (e: Entity) => kinds.includes(ctx.module.entityType(e.type)?.kind ?? "") && !isExempt(config, e), [ctx.module, kinds, config]);
  const candidates = useList("entities", filter);
  const hosts = useMemo(() => [...candidates].sort((a, b) => a.name.localeCompare(b.name)), [candidates]);
  const [variant, setVariant] = useState(option.variant);
  const [host, setHost] = useState<Id | undefined>(option.role === "host" ? entity.id : hosts[0]?.id);
  const variantId = useId();
  const hostId = useId();
  const label = config.start?.label ?? "Start";
  const subject = config.labels?.subject ?? "Subject";
  const chosen = config.variants.find((v) => v.id === variant);
  const hostEntity = option.role === "host" ? entity : hosts.find((h) => h.id === host) ?? hosts[0];

  const start = () => {
    if (!hostEntity) return;
    try {
      const out = startLifecycleFor(ctx, sessionId, def.id, { host: hostEntity.id, variant, ...(option.role === "source" ? { source: entity.id } : {}) });
      pushToast(`${config.labels?.instance ?? def.name} started: ${hostEntity.name}`, { tone: "success" });
      if (out.prompts.length) onPrompts?.(out.prompts);
      onClose();
    } catch (e) {
      pushToast(errorMessage(e), { tone: "danger" });
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={`${label}: ${option.role === "host" ? entity.name : `from ${entity.name}`}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={start} disabled={!hostEntity} data-testid="lifecycle-start-confirm">
            {label}
          </Button>
        </>
      }
    >
      <div className="app-stack">
        {option.role === "source" && (
          <label className="app-label" htmlFor={hostId}>
            {subject}
            <select id={hostId} className="cf-select" value={hostEntity?.id ?? ""} onChange={(e) => setHost(e.target.value)}>
              {hosts.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="app-label" htmlFor={variantId}>
          Variant
          <select id={variantId} className="cf-select" value={variant} onChange={(e) => setVariant(e.target.value)}>
            {config.variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        {chosen?.summary && <p className="cf-muted">{chosen.summary}</p>}
        <p className="cf-muted">It runs on in-world time: advancing the table clock moves it on. Manage it in the {def.name} tracker in table mode.</p>
      </div>
    </Dialog>
  );
}
