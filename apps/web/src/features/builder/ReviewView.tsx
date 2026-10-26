/**
 * The builder's last page: what is still missing (with a link to each step),
 * what the module leaves to do by hand, every grant beside its source, and
 * the sheet as it will be saved (computed values computed, not stored).
 */
import { describeGrant, type AppliedGrant, type CharacterBuilderDef, type CharacterBuilderResult, type CharacterBuilderStep, type EntityTypeDef, type GameModule, type ReferenceList } from "@campaign-forge/module-sdk";
import { useMemo } from "react";
import { Badge, Button, SheetRenderer } from "../../components/ui";

export interface ReviewViewProps {
  module: GameModule;
  builder: CharacterBuilderDef;
  def: EntityTypeDef | undefined;
  steps: CharacterBuilderStep[];
  result: CharacterBuilderResult;
  mode: string;
  onJump: (stepId: string) => void;
}

export function ReviewView({ module, def, steps, result, mode, onJump }: ReviewViewProps) {
  const referenceLists = useMemo<Record<string, ReferenceList>>(() => Object.fromEntries(module.referenceLists.map((l) => [l.id, l])), [module]);
  const open = result.issues.filter((i) => i.level !== "warning");
  const grouped = useMemo(() => {
    const out = new Map<string, AppliedGrant[]>();
    for (const g of result.grants) {
      if (g.hidden) continue;
      const k = g.step || "";
      out.set(k, [...(out.get(k) ?? []), g]);
    }
    return out;
  }, [result.grants]);
  const title = (id: string) => steps.find((s) => s.id === id)?.title ?? "At the end";

  return (
    <div className="cb-review" data-testid="builder-review">
      {open.length > 0 ? (
        <div className="cb-review__open" role="status" data-testid="review-open">
          <h3>Still to choose</h3>
          <ul>
            {open.map((i, n) => (
              <li key={n}>
                <Button size="sm" variant="ghost" onClick={() => onJump(i.step)}>
                  {title(i.step)}
                </Button>{" "}
                {i.message}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="cb-review__ready" role="status" data-testid="review-ready">
          <Badge tone="success">Ready</Badge> Every choice is made; check the sheet below.
        </p>
      )}

      {result.todo.length > 0 && (
        <div className="cb-review__todo" data-testid="review-todo">
          <h3>Still to do by hand</h3>
          <ul>
            {result.todo.map((t, n) => (
              <li key={n}>{t}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="cb-review__grants">
        <h3>Where it all came from</h3>
        {[...grouped.entries()].map(([stepId, grants]) => (
          <section key={stepId} className="cb-grants" data-testid={`grants:${stepId || "finally"}`}>
            <h4>{title(stepId)}</h4>
            <ul>
              {grants.map((g, n) => (
                <li key={n} className="cb-grant">
                  <span className="cb-grant__what">{describeGrant(module, def, g)}</span> <span className="cf-muted cb-grant__from">from {g.source}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {def && (
        <div className="cb-review__sheet" data-testid="review-sheet">
          <h3>The sheet</h3>
          <SheetRenderer def={def} mode={mode} fields={result.fields} computed={result.computed} onChange={() => undefined} readonly referenceLists={referenceLists} />
        </div>
      )}
    </div>
  );
}
