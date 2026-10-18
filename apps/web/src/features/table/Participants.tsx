/** Quick-stat cards for the PCs and the scene's participants; a tap opens the full sheet in a drawer. */
import { getPath, type Entity, type Id } from "@campaign-forge/core";
import { validateEntityFields, type EntityTypeDef, type LoadedModule, type ReferenceList, type SheetField } from "@campaign-forge/module-sdk";
import { useMemo, useState } from "react";
import { EntityIcon } from "../../components/EntityIcon";
import { RuleDrawer } from "../../components/RulePanel";
import { Badge, Card, Drawer, SheetRenderer, humanize, labelFromPath } from "../../components/ui";
import { updateEntityFields } from "../../state/actions";
import { useCampaign, useMeta, useRecord } from "../../state/hooks";
import { computedOf } from "../../state/tableActions";
import { changedPaths } from "../entities/SheetTab";
import { SessionRollPanel, skillInput } from "./DicePanel";

function fieldOf(def: EntityTypeDef, path: string): SheetField | undefined {
  for (const s of def.sheet.sections) {
    const f = s.fields.find((x) => x.path === path);
    if (f) return f;
  }
  return undefined;
}

function labelOf(def: EntityTypeDef, path: string): string {
  return fieldOf(def, path)?.label ?? labelFromPath(path);
}

/** A select value shown by its reference item's name (e.g. a career id -> its name). */
function displayValue(module: LoadedModule, def: EntityTypeDef, path: string, v: string | number): string {
  const options = fieldOf(def, path)?.options;
  if (typeof v === "string" && options && !Array.isArray(options)) return module.referenceItem(options.ref, v)?.name ?? humanize(v);
  return String(v);
}

/** Summary paths of the type as label/value pairs (computed values included). */
export function quickStats(module: LoadedModule, def: EntityTypeDef | undefined, entity: Entity, computed: Record<string, unknown>): Array<{ path: string; label: string; value: string }> {
  if (!def) return [];
  const out: Array<{ path: string; label: string; value: string }> = [];
  for (const path of def.sheet.summary ?? []) {
    const v = path in computed ? computed[path] : getPath(entity.fields, path);
    if (v === undefined || v === null || v === "" || typeof v === "object") continue;
    if (typeof v === "boolean") {
      if (v) out.push({ path, label: labelOf(def, path), value: "" });
      continue;
    }
    out.push({ path, label: labelOf(def, path), value: displayValue(module, def, path, v as string | number) });
  }
  return out;
}

export function ParticipantCard({ entity, onOpen, role }: { entity: Entity; onOpen: (id: Id) => void; role?: string }) {
  const { module } = useCampaign();
  const def = module.entityType(entity.type);
  const computed = useMemo(() => computedOf(module, entity), [module, entity]);
  const stats = quickStats(module, def, entity, computed);
  return (
    <li className="app-participant" data-entity={entity.id}>
      <button type="button" className="app-participant__name" onClick={() => onOpen(entity.id)} aria-label={`Open ${entity.name}`}>
        <EntityIcon icon={def?.icon} kind={def?.kind} size={18} />
        <span>{entity.name}</span>
      </button>
      <span className="cf-muted app-participant__type">{role ?? def?.name}</span>
      <span className="app-participant__stats">
        {stats.map((s) => (
          <span key={s.path} className="app-stat" data-stat={s.path}>
            <span className="app-stat__label">{s.label}</span>
            {s.value && <span className="app-stat__value">{s.value}</span>}
          </span>
        ))}
      </span>
      {entity.conditions && entity.conditions.length > 0 && (
        <span className="app-participant__conditions">
          {entity.conditions.map((c) => (
            <Badge key={c.id} tone="warning" title={c.source}>
              {c.label}
            </Badge>
          ))}
        </span>
      )}
    </li>
  );
}

export function Participants({ pcs, others, onOpen }: { pcs: Entity[]; others: Entity[]; onOpen: (id: Id) => void }) {
  return (
    <Card title="Participants" className="app-table__participants">
      {pcs.length === 0 && others.length === 0 && <p className="cf-muted">No player characters or scene participants.</p>}
      {pcs.length > 0 && (
        <ul className="app-participants" aria-label="Player characters">
          {pcs.map((e) => (
            <ParticipantCard key={e.id} entity={e} onOpen={onOpen} role="PC" />
          ))}
        </ul>
      )}
      {others.length > 0 && (
        <ul className="app-participants" aria-label="Scene participants">
          {others.map((e) => (
            <ParticipantCard key={e.id} entity={e} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </Card>
  );
}

/** The full sheet of one entity in a drawer, in table mode (bigger targets), with skill rolls logged to the session. */
export function EntityDrawer({ entityId, sessionId, onClose }: { entityId: Id | undefined; sessionId: Id; onClose: () => void }) {
  const ctx = useCampaign();
  const meta = useMeta();
  const entity = useRecord("entities", entityId);
  const def = entity ? ctx.module.entityType(entity.type) : undefined;
  const [rule, setRule] = useState<string | undefined>();
  const [roll, setRoll] = useState<{ key: number; label: string; input: Record<string, unknown> } | undefined>();
  const referenceLists = useMemo<Record<string, ReferenceList>>(() => Object.fromEntries(ctx.module.module.referenceLists.map((l) => [l.id, l])), [ctx.module]);
  const computed = useMemo(() => (entity ? computedOf(ctx.module, entity) : {}), [ctx.module, entity]);
  const errors = useMemo(() => (def && entity ? validateEntityFields(def, entity.fields).errors : []), [def, entity]);

  return (
    <>
    <Drawer open={!!entity} onClose={onClose} title={entity?.name ?? ""} className="app-table__drawer cf-table-mode">
      {entity && def && (
        <>
          {entity.conditions && entity.conditions.length > 0 && (
            <div className="app-row">
              {entity.conditions.map((c) => (
                <Badge key={c.id} tone="warning">
                  {c.label}
                </Badge>
              ))}
            </div>
          )}
          <SheetRenderer
            def={def}
            subtype={entity.subtype}
            mode={meta.mode}
            fields={entity.fields}
            computed={computed}
            errors={errors}
            tableMode
            referenceLists={referenceLists}
            onChange={(next) => updateEntityFields(ctx, entity.id, next, changedPaths(entity.fields, next))}
            onOpenRule={setRule}
            resolveEntityName={(id) => ctx.store.get("entities", id)?.name}
            onRoll={(skillId) => setRoll({ key: Date.now(), label: skillId, input: skillInput(ctx.module, entity, skillId).input })}
          />
          {roll && (
            <Card title={`Roll: ${labelFromPath(roll.label)}`} elevated>
              <SessionRollPanel key={roll.key} sessionId={sessionId} entity={entity} label={labelFromPath(roll.label)} input={roll.input} />
            </Card>
          )}
        </>
      )}
    </Drawer>
    <RuleDrawer ruleId={rule} onClose={() => setRule(undefined)} onOpenRule={setRule} />
    </>
  );
}
