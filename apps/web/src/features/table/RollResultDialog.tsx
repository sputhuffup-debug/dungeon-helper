/** The result of a module dice operation: label, total, the rolls behind it, the effects applied. */
import type { Effect } from "@campaign-forge/module-sdk";
import { Badge, Button, Dialog, PageRef, RollRecordList } from "../../components/ui";
import type { OperationRoll } from "../../state/tableActions";

function describeEffect(e: Effect, name: (id: string) => string): string | undefined {
  switch (e.kind) {
    case "addCondition":
      return `${name(e.entity)} gains ${e.condition.label}`;
    case "removeCondition":
      return `${name(e.entity)} loses ${e.conditionId}`;
    case "incrementField":
      return `${name(e.entity)}: ${e.path} ${e.by >= 0 ? "+" : ""}${e.by}`;
    case "setField":
      return `${name(e.entity)}: ${e.path} = ${JSON.stringify(e.value)}`;
    case "log":
      return e.text;
    case "prompt":
      return undefined;
  }
}

export function RollResultDialog({ roll, onClose, resolveName }: { roll: OperationRoll | undefined; onClose: () => void; resolveName: (id: string) => string }) {
  const effects = (roll?.result.effects ?? []).map((e) => describeEffect(e, resolveName)).filter((t): t is string => !!t);
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
          <RollRecordList rolls={roll.result.rolls} />
          {effects.length > 0 && (
            <ul className="app-bullets" aria-label="Applied">
              {effects.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          )}
          <p className="cf-muted cf-mono app-roll-result__seed">Seed {roll.seed}</p>
        </div>
      )}
    </Dialog>
  );
}
