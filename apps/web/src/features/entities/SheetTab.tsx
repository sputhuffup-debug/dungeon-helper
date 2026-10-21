/** The schema-driven sheet, with validation, rules drawer, entity picking, rolls and the player preview. */
import { projectEntityForViewer, type Entity } from "@campaign-forge/core";
import { createRng, validateEntityFields, type EntityTypeDef, type ReferenceList, type RollResult, type SheetField } from "@campaign-forge/module-sdk";
import { useCallback, useMemo, useState } from "react";
import { EntityPicker } from "../../components/EntityPicker";
import { RuleDrawer } from "../../components/RulePanel";
import { Badge, DiceRollPanel, Drawer, EmptyState, SheetRenderer, pushToast, valuePathOf } from "../../components/ui";
import { updateEntityFields } from "../../state/actions";
import { useCampaign, useComputed, useMeta } from "../../state/hooks";
import { isPlayerCharacter } from "../atlas/AtlasPage";

export function SheetTab({ entity, def }: { entity: Entity; def: EntityTypeDef | undefined }) {
  const ctx = useCampaign();
  const meta = useMeta();
  const computed = useComputed(entity);
  const [asPlayer, setAsPlayer] = useState(false);
  const [rule, setRule] = useState<string | undefined>();
  const [picking, setPicking] = useState<SheetField | undefined>();
  const [roll, setRoll] = useState<{ label: string; input: Record<string, unknown> } | undefined>();

  const referenceLists = useMemo<Record<string, ReferenceList>>(() => Object.fromEntries(ctx.module.module.referenceLists.map((l) => [l.id, l])), [ctx.module]);
  const validation = useMemo(() => (def ? validateEntityFields(def, entity.fields) : { valid: true, errors: [] }), [def, entity.fields]);
  const resolveEntityName = useCallback((id: string) => ctx.store.get("entities", id)?.name, [ctx.store]);
  const onOpenRule = useCallback((id: string) => setRule(id), []);
  const onPickEntity = useCallback((field: SheetField) => setPicking(field), []);
  const onRoll = useCallback((skillId: string, input: Record<string, unknown>, label?: string) => setRoll({ label: label ?? skillId, input }), []);

  const onChange = useCallback(
    (next: Record<string, unknown>) => {
      updateEntityFields(ctx, entity.id, next, changedPaths(entity.fields, next));
    },
    [ctx, entity.id, entity.fields],
  );

  if (!def) return <EmptyState title="Unknown entity type" text={`The module does not define “${entity.type}”. The data is kept as is.`} />;

  const canPreview = def.kind === "character";
  const projected = asPlayer ? projectEntityForViewer(entity, def, { role: "player" }) : undefined;

  return (
    <div className="app-sheet">
      <div className="app-row app-sheet__bar">
        {canPreview && (
          <label className="app-toggle">
            <input type="checkbox" checked={asPlayer} onChange={(e) => setAsPlayer(e.target.checked)} data-testid="player-sheet-toggle" />
            Player sheet
          </label>
        )}
        {canPreview && isPlayerCharacter(entity) && <Badge tone="accent">PC</Badge>}
        {!validation.valid && !asPlayer && (
          <Badge tone="danger" title={validation.errors.map((e) => `${e.path}: ${e.message}`).join("\n")}>
            {validation.errors.length} validation issue{validation.errors.length === 1 ? "" : "s"}
          </Badge>
        )}
        {entity.conditions && entity.conditions.length > 0 && (
          <span className="app-row">
            {entity.conditions.map((c) => (
              <Badge key={c.id} tone="warning">
                {c.label}
              </Badge>
            ))}
          </span>
        )}
      </div>
      {asPlayer ? (
        projected ? (
          <>
            <p className="app-note">What a player would see: GM-only fields are removed and the sheet is read-only.</p>
            <SheetRenderer
              def={def}
              subtype={projected.subtype}
              mode={meta.mode}
              fields={projected.fields}
              onChange={() => undefined}
              readonly
              referenceLists={referenceLists}
              resolveEntityName={resolveEntityName}
              onOpenRule={onOpenRule}
            />
          </>
        ) : (
          <EmptyState title="Hidden from players" text="With its current visibility a player cannot see this entity at all." />
        )
      ) : (
        <SheetRenderer
          def={def}
          subtype={entity.subtype}
          mode={meta.mode}
          fields={entity.fields}
          computed={computed}
          onChange={onChange}
          errors={validation.errors}
          referenceLists={referenceLists}
          onOpenRule={onOpenRule}
          onPickEntity={onPickEntity}
          resolveEntityName={resolveEntityName}
          onRoll={onRoll}
          dice={ctx.module.module.dice}
        />
      )}
      <RuleDrawer ruleId={rule} onClose={() => setRule(undefined)} onOpenRule={setRule} />
      <EntityPicker
        open={!!picking}
        title={picking?.label ? `Choose ${picking.label}` : "Choose an entity"}
        types={picking?.entityTypes}
        exclude={[entity.id]}
        onClose={() => setPicking(undefined)}
        onPick={(target) => {
          if (!picking) return;
          const path = valuePathOf(picking.path);
          const current = path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), entity.fields);
          const value = picking.widget === "reflist" ? [...new Set([...(Array.isArray(current) ? current.map(String) : []), target.id])] : target.id;
          const next = setIn(entity.fields, path, value);
          updateEntityFields(ctx, entity.id, next, [path]);
          setPicking(undefined);
        }}
      />
      <Drawer open={!!roll} onClose={() => setRoll(undefined)} title={roll ? `Roll: ${roll.label}` : "Roll"}>
        {roll && (
          <DiceRollPanel
            dice={ctx.module.module.dice}
            input={roll.input}
            rng={createRng(`${entity.id}:${Date.now()}:${Math.random()}`)}
            onRolled={(r: RollResult) => pushToast(`${entity.name}, ${roll.label}: ${ctx.module.module.dice.describe(r)}`)}
            title={`${entity.name}: ${roll.label}`}
          />
        )}
      </Drawer>
    </div>
  );
}

function setIn(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const segs = path.split(".");
  const walk = (cur: unknown, i: number): unknown => {
    const seg = segs[i];
    if (seg === undefined) return value;
    const base = cur && typeof cur === "object" && !Array.isArray(cur) ? { ...(cur as Record<string, unknown>) } : {};
    base[seg] = walk(base[seg], i + 1);
    return base;
  };
  return walk(obj, 0) as Record<string, unknown>;
}

/** Dotted paths whose value differs (objects are walked two levels deep). */
export function changedPaths(before: Record<string, unknown>, after: Record<string, unknown>, prefix = "", depth = 0): string[] {
  const out: string[] = [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    const a = before[k];
    const b = after[k];
    if (a === b) continue;
    const path = prefix ? `${prefix}.${k}` : k;
    const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
    if (depth < 2 && isObj(a) && isObj(b)) out.push(...changedPaths(a, b, path, depth + 1));
    else if (JSON.stringify(a) !== JSON.stringify(b)) out.push(path);
  }
  return out;
}
