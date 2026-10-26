/**
 * The ability score step: the module's methods (an array to assign, a point
 * buy with its budget, dice rolled in the app or entered from the table, or
 * typed scores), and a table of base score, bonuses from the other steps,
 * final score and modifier.
 */
import { createEnteredRng, createRng, rollAbilityScores, signed, type AbilityState, type CharacterBuilderAbilityMethod, type CharacterBuilderAbilityStep, type Rng } from "@campaign-forge/module-sdk";
import { useMemo, useState } from "react";
import { Badge, Button, EnterDice, PageRef, Stepper } from "../../components/ui";
import type { StoredDraft } from "./drafts";

export interface AbilitiesViewProps {
  step: CharacterBuilderAbilityStep;
  state: AbilityState | undefined;
  draft: StoredDraft;
  onDraft: (next: StoredDraft) => void;
}

export function AbilitiesView({ step, state, draft, onDraft }: AbilitiesViewProps) {
  const current = draft.abilities?.[step.id];
  const method = step.methods.find((m) => m.id === current?.method);
  const ids = step.abilities.map((a) => a.id);
  const [entering, setEntering] = useState(false);

  const write = (patch: Partial<NonNullable<StoredDraft["abilities"]>[string]>, extra: Partial<StoredDraft> = {}) => {
    const base = current ?? { method: method?.id ?? step.methods[0]!.id, scores: {} };
    onDraft({ ...draft, ...extra, abilities: { ...draft.abilities, [step.id]: { ...base, ...patch } } });
  };
  const choose = (m: CharacterBuilderAbilityMethod) => {
    if (m.id === current?.method) return;
    const scores = m.kind === "pointBuy" ? Object.fromEntries(ids.map((a) => [a, m.min])) : {};
    onDraft({ ...draft, abilities: { ...draft.abilities, [step.id]: { method: m.id, scores } } });
    setEntering(false);
  };
  const setScore = (a: string, v: number | undefined) => {
    const scores = { ...(current?.scores ?? {}) };
    if (v === undefined || Number.isNaN(v)) delete scores[a];
    else {
      // array and rolled values are used once: a value another ability holds swaps with it
      if (method && (method.kind === "array" || method.kind === "roll")) {
        const pool = method.kind === "array" ? method.values : (current?.rolled ?? []).map((r) => r.total);
        const copies = pool.filter((x) => x === v).length;
        const holders = ids.filter((x) => x !== a && scores[x] === v);
        if (holders.length >= copies && holders[0]) {
          if (scores[a] !== undefined) scores[holders[0]] = scores[a]!;
          else delete scores[holders[0]];
        }
      }
      scores[a] = v;
    }
    write({ scores });
  };

  const rollMethod = method?.kind === "roll" ? method : undefined;
  const count = rollMethod?.count ?? ids.length;
  const run = useMemo(() => (rollMethod ? (rng: Rng) => rollAbilityScores(rollMethod, count, rng) : () => []), [rollMethod, count]);
  const rolled = current?.rolled ?? [];
  const pool = method && (method.kind === "array" || method.kind === "roll") ? (method.kind === "array" ? method.values : rolled.map((r) => r.total)) : [];
  const byId = new Map((state?.abilities ?? []).map((a) => [a.id, a]));

  return (
    <div className="cb-abilities" data-testid="ability-step">
      <div className="cb-methods" role="radiogroup" aria-label="Method">
        {step.methods.map((m) => (
          <label key={m.id} className={`cb-method${m.id === current?.method ? " is-on" : ""}`} data-testid={`method:${m.id}`}>
            <input type="radio" name={`${step.id}-method`} checked={m.id === current?.method} onChange={() => choose(m)} />
            <span>
              <strong>{m.name}</strong> <PageRef page={m.page} cite={m.cite} original={m.original} />
              {m.summary && <span className="cf-muted cb-method__summary">{m.summary}</span>}
            </span>
          </label>
        ))}
      </div>

      {method?.kind === "pointBuy" && state?.spent !== undefined && (
        <p className="cb-points" data-testid="points">
          <Badge tone={state.spent > method.budget ? "danger" : state.spent === method.budget ? "success" : "warning"}>
            {method.budget - state.spent} of {method.budget} points left
          </Badge>{" "}
          <span className="cf-muted">
            Costs: {Object.entries(method.costs)
              .map(([s, c]) => `${s}: ${c}`)
              .join(", ")}
          </span>
        </p>
      )}

      {rollMethod && (
        <div className="cb-rollset" data-testid="ability-rolls">
          {!entering && (
            <div className="app-row">
              <Button
                variant={rolled.length ? "default" : "primary"}
                onClick={() => {
                  const n = draft.rollCount ?? 0;
                  const sets = rollAbilityScores(rollMethod, count, createRng(`${draft.seed}/${step.id}/${n}`));
                  write({ rolled: sets, scores: {}, entered: false }, { rollCount: n + 1 });
                }}
                data-testid="roll-abilities"
              >
                {rolled.length ? "Roll again" : `Roll ${rollMethod.dice}${rollMethod.keep !== undefined ? `, keep ${rollMethod.keep}` : ""}`}
              </Button>
              <Button variant="ghost" onClick={() => setEntering(true)} data-testid="enter-abilities">
                Enter dice rolled at the table
              </Button>
            </div>
          )}
          {entering && (
            <EnterDice
              run={run}
              title={`${count} × ${rollMethod.dice}: type every die, in order`}
              onSubmit={(faces) => {
                setEntering(false);
                const sets = rollAbilityScores(rollMethod, count, createEnteredRng(faces));
                write({ rolled: sets, scores: {}, entered: true });
              }}
              onCancel={() => setEntering(false)}
            />
          )}
          {rolled.length > 0 && (
            <ol className="cb-rollset__sets" aria-label="Rolled scores">
              {rolled.map((r, i) => {
                const keep = rollMethod.keep ?? r.faces.length;
                const kept = [...r.faces].sort((a, b) => b - a).slice(0, keep);
                const left = [...kept];
                return (
                  <li key={i} className="cb-rollset__set">
                    <span className="cb-rollset__faces">
                      {r.faces.map((f, j) => {
                        const k = left.indexOf(f);
                        const dropped = k < 0;
                        if (!dropped) left.splice(k, 1);
                        return (
                          <span key={j} className={`cb-die${dropped ? " is-dropped" : ""}`} aria-label={dropped ? `${f}, dropped` : String(f)}>
                            {f}
                          </span>
                        );
                      })}
                    </span>
                    <strong>{r.total}</strong>
                  </li>
                );
              })}
              {current?.entered && <li className="cf-muted">entered</li>}
            </ol>
          )}
        </div>
      )}

      {method && (
        <table className="cf-table cb-scores" aria-label="Ability scores">
          <thead>
            <tr>
              <th>Ability</th>
              <th>Base</th>
              <th>Bonus</th>
              <th>Score</th>
              <th>Modifier</th>
            </tr>
          </thead>
          <tbody>
            {step.abilities.map((a) => {
              const st = byId.get(a.id);
              const base = current?.scores[a.id];
              return (
                <tr key={a.id} data-ability={a.id}>
                  <th scope="row">{a.name}</th>
                  <td>
                    {method.kind === "pointBuy" ? (
                      <Stepper value={base ?? method.min} min={method.min} max={method.max} onChange={(v) => setScore(a.id, v)} label={a.name} editable={false} />
                    ) : method.kind === "manual" ? (
                      <input className="cf-input cb-scores__input" type="number" inputMode="numeric" min={method.min} max={method.max} aria-label={a.name} value={base ?? ""} onChange={(e) => setScore(a.id, e.target.value === "" ? undefined : Number(e.target.value))} />
                    ) : (
                      <select className="cf-select" aria-label={a.name} value={base ?? ""} onChange={(e) => setScore(a.id, e.target.value === "" ? undefined : Number(e.target.value))} disabled={pool.length === 0} data-testid={`assign:${a.id}`}>
                        <option value="">—</option>
                        {[...new Set(pool)]
                          .sort((x, y) => y - x)
                          .map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                      </select>
                    )}
                  </td>
                  <td className="cb-scores__bonus">{st && st.bonus ? signed(st.bonus) : ""}</td>
                  <td className="cb-scores__score" data-testid={`score:${a.id}`}>
                    {st?.score ?? "—"}
                  </td>
                  <td className="cb-scores__mod" data-testid={`mod:${a.id}`}>
                    {st?.modifier !== undefined ? signed(st.modifier) : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {state?.pool && state.pool.length > 0 && (
        <p className="cf-muted" data-testid="values-left">
          Still to assign: {state.pool.join(", ")}
        </p>
      )}
    </div>
  );
}
