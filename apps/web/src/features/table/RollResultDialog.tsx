/**
 * The result of a module dice operation: what was rolled, what it means
 * (the rolled rows' result fields the module marks for display: an effect, a
 * healing time, a lethal flag), the effects applied, and under "Raw result"
 * the rolls behind it with their step and table ids and the seed.
 */
import { tableResultLines, type Effect, type RollRecord, type TableResultLine } from "@campaign-forge/module-sdk";
import { Badge, Button, Dialog, PageRef, RollRecordList } from "../../components/ui";
import { useCampaign } from "../../state/hooks";
import type { OperationRoll } from "../../state/tableActions";

type Ctx = ReturnType<typeof useCampaign>;

/** The sheet label of a field path on an entity's type ("Critical injuries"), else the path. */
function fieldLabel(ctx: Ctx, entityId: string, path: string): string {
  const e = ctx.store.get("entities", entityId);
  const def = e ? ctx.module.entityType(e.type) : undefined;
  for (const s of def?.sheet.sections ?? []) for (const f of s.fields) if (f.path === path && f.label) return f.label;
  return path;
}

/** A field value in words: a list of labelled things by their labels, a short scalar as it is. */
function valueText(v: unknown): string {
  if (Array.isArray(v)) {
    const labels = v.map((x) => (x && typeof x === "object" && typeof (x as { label?: unknown }).label === "string" ? (x as { label: string }).label : typeof x === "string" ? x : undefined));
    if (labels.every((l): l is string => !!l)) return labels.join(", ") || "none";
  }
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? String(v) : JSON.stringify(v);
}

function describeEffect(ctx: Ctx, e: Effect, name: (id: string) => string): string | undefined {
  switch (e.kind) {
    case "addCondition":
      return `${name(e.entity)} gains ${e.condition.label}`;
    case "removeCondition":
      return `${name(e.entity)} loses ${e.conditionId}`;
    case "incrementField":
      return `${name(e.entity)}: ${fieldLabel(ctx, e.entity, e.path)} ${e.by >= 0 ? "+" : ""}${e.by}`;
    case "setField":
      return `${name(e.entity)}: ${fieldLabel(ctx, e.entity, e.path)} now ${valueText(e.value)}`;
    case "log":
      return e.text;
    default:
      return undefined;
  }
}

/** Every rolled row (nested ones too) with what the module says it means. */
function meanings(ctx: Ctx, rolls: RollRecord[], depth = 0): Array<{ record: RollRecord; lines: TableResultLine[]; depth: number }> {
  return rolls.flatMap((r) => {
    const lines = tableResultLines(r.table ? ctx.module.tables.get(r.table) : undefined, r.result);
    return [...(lines.length ? [{ record: r, lines, depth }] : []), ...meanings(ctx, r.nested ?? [], depth + 1)];
  });
}

export function ResultLines({ lines }: { lines: TableResultLine[] }) {
  return (
    <dl className="app-roll-result__meaning">
      {lines.map((l, i) =>
        l.value === undefined ? (
          <div key={i} className="app-roll-result__flag">
            <dt>
              <Badge tone={l.tone ?? "muted"}>{l.label}</Badge>
            </dt>
          </div>
        ) : (
          <div key={i} className={l.tone ? `app-roll-result__line app-roll-result__line--${l.tone}` : "app-roll-result__line"}>
            <dt>{l.label}</dt>
            <dd>{l.value}</dd>
          </div>
        ),
      )}
    </dl>
  );
}

export function RollResultDialog({ roll, onClose, resolveName }: { roll: OperationRoll | undefined; onClose: () => void; resolveName: (id: string) => string }) {
  const ctx = useCampaign();
  const effects = (roll?.result.effects ?? []).map((e) => describeEffect(ctx, e, resolveName)).filter((t): t is string => !!t);
  const meant = roll ? meanings(ctx, roll.result.rolls) : [];
  const tableName = (id: string) => ctx.module.tables.get(id)?.name;
  return (
    <Dialog
      open={!!roll}
      onClose={onClose}
      title={roll ? `${roll.entity ? `${roll.entity.name}: ` : ""}${roll.operation.name}` : "Roll"}
      className="app-roll-result"
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      {roll && (
        <div className="app-stack" data-testid="roll-result">
          <div className="app-roll-result__head">
            <span className="app-roll-result__label" data-testid="roll-result-label">
              {roll.result.label}
            </span>
            {typeof roll.result.total === "number" && (
              <Badge tone="accent" data-testid="roll-result-total">
                Total {roll.result.total}
              </Badge>
            )}
            <PageRef page={roll.operation.page} />
          </div>
          {meant.length > 0 && (
            <div className="app-stack" data-testid="roll-result-meaning">
              {meant.map((m, i) => (
                <div key={i}>
                  {/* a nested roll (e.g. a trauma rolled by an injury) says which it is */}
                  {(m.depth > 0 || meant.length > 1) && (
                    <p className="app-roll-result__sub">
                      <strong>{m.record.rowLabel}</strong> <span className="cf-muted">{m.record.table ? tableName(m.record.table) : ""}</span>
                    </p>
                  )}
                  <ResultLines lines={m.lines} />
                </div>
              ))}
            </div>
          )}
          {effects.length > 0 && (
            <div>
              <p className="app-roll-result__sub cf-muted">Applied</p>
              <ul className="app-bullets" aria-label="Applied">
                {effects.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          )}
          {roll.entered && (
            <p className="cf-muted app-roll-result__seed" data-testid="roll-result-entered">
              <Badge tone="accent">entered</Badge> Rolled at the table: <span className="cf-mono">{roll.entered.join(" ") || "no dice"}</span>
            </p>
          )}
          <details className="app-roll-result__raw" data-testid="roll-result-raw">
            <summary>Raw result</summary>
            <RollRecordList rolls={roll.result.rolls} tableName={tableName} />
            <p className="cf-muted cf-mono app-roll-result__seed">Seed {roll.seed}</p>
          </details>
        </div>
      )}
    </Dialog>
  );
}
