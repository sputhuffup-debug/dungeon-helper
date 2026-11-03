/**
 * For procedures that produce no entities (shore leave, between jobs): the
 * outcomes the run recorded and its suggested effects. Before accepting,
 * `EffectsPicker` lists the effects with a checkbox each (effects the ledger
 * already holds are left out); accepting applies the ticked ones in the same
 * step, and the results then show what was applied. Prompt effects become
 * yes/no questions whose answers apply their effects.
 */
import type { Id } from "@campaign-forge/core";
import type { Effect, Prompt } from "@campaign-forge/module-sdk";
import { useMemo, useState } from "react";
import { Badge, Button, Card, PageRef, pushToast } from "../../components/ui";
import { humanize } from "../../lib/format";
import { applyGeneratorEffects } from "../../state/prepActions";
import { money } from "../../state/shipActions";
import { useCampaign } from "../../state/hooks";
import { alreadyPosted, effectsOf, plainEffectsOf } from "../../state/runEffects";

export { alreadyPosted, effectsOf, isEffect, plainEffectsOf } from "../../state/runEffects";

/** Arrays of `{ name, summary }` objects in the results (per-character outcomes). */
export function outcomesOf(results: Record<string, unknown>): Array<{ key: string; items: Array<{ name: string; summary: string; choice?: string }> }> {
  const out: Array<{ key: string; items: Array<{ name: string; summary: string; choice?: string }> }> = [];
  for (const [key, v] of Object.entries(results)) {
    if (!Array.isArray(v) || v.length === 0) continue;
    const items = v.filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null && typeof (x as Record<string, unknown>).summary === "string");
    if (items.length !== v.length) continue;
    out.push({ key, items: items.map((x) => ({ name: String(x.name ?? x.id ?? ""), summary: String(x.summary), ...(typeof x.choice === "string" ? { choice: x.choice } : {}) })) });
  }
  return out;
}

/** A field value in words: lists by their items ("none" when empty), objects as "Key value" pairs, never JSON. */
export function valueText(v: unknown): string {
  if (v === undefined || v === null || v === "") return "nothing";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return "none";
    const items = v.map((x) => (typeof x === "string" || typeof x === "number" ? String(x) : x && typeof x === "object" && typeof (x as { name?: unknown }).name === "string" ? (x as { name: string }).name : ""));
    return items.every(Boolean) ? items.join(", ") : `${v.length} entr${v.length === 1 ? "y" : "ies"}`;
  }
  if (typeof v === "object") {
    const parts = Object.entries(v as Record<string, unknown>)
      .filter(([, x]) => typeof x === "string" || typeof x === "number" || typeof x === "boolean")
      .map(([k, x]) => `${humanize(k).toLowerCase()} ${String(x)}`);
    return parts.length ? parts.join(", ") : "new values";
  }
  return String(v);
}

export function describeEffect(e: Effect, name: (id: Id) => string, presetName: (id: string) => string = (id) => id, money: (amount: number) => string = (n) => `${n >= 0 ? "+" : ""}${n}`): string {
  switch (e.kind) {
    case "setField":
      return `${name(e.entity)}: ${humanize(e.path).toLowerCase()} set to ${valueText(e.value)}`;
    case "incrementField":
      return `${name(e.entity)}: ${humanize(e.path).toLowerCase()} ${e.by >= 0 ? "+" : "−"}${Math.abs(e.by)}`;
    case "addCondition":
      return `${name(e.entity)}: gains ${e.condition.label}`;
    case "removeCondition":
      return `${name(e.entity)}: loses condition ${e.conditionId}`;
    case "log":
      return e.text;
    case "prompt":
      return e.prompt.text;
    case "createFromPreset":
      return e.name ? `New ${e.name} (${presetName(e.preset)})` : `New ${presetName(e.preset)}`;
    case "applyPreset":
      return `${name(e.entity)}: becomes ${presetName(e.preset)}`;
    case "ledger":
      return `Ledger ${money(e.amount)}: ${e.note}${e.account ? ` (${name(e.account)})` : ""}`;
    case "award":
      return `${name(e.entity)}: ${e.reason ?? (e.question ? "award" : `+${e.amount ?? 1} ${e.pool === "story" ? "story points" : "XP"}`)}`;
  }
}


/** Before accepting: the effects accepting will apply, each with a checkbox; those the ledger already holds are listed apart, unticked. */
export function EffectsPicker({ results, unticked, onToggle }: { results: Record<string, unknown>; unticked: ReadonlySet<number>; onToggle: (index: number, on: boolean) => void }) {
  const ctx = useCampaign();
  const name = (id: Id) => ctx.store.get("entities", id)?.name ?? id;
  const presetName = (id: string) => ctx.module.preset(id)?.name ?? id;
  const all = plainEffectsOf(results);
  const posted = all.filter((x) => alreadyPosted(ctx.store, x.e));
  const plain = all.filter((x) => !alreadyPosted(ctx.store, x.e));
  if (all.length === 0) return null;
  const count = plain.filter((x) => !unticked.has(x.i)).length;
  return (
    <Card title="Effects" subtitle={`Accepting applies the ${count} ticked effect${count === 1 ? "" : "s"}. Untick what you don't want.`} data-testid="effects-picker">
      <ul className="app-list" data-testid="effects">
        {plain.map(({ e, i }) => (
          <li key={i} className="app-list__row">
            <label className="app-toggle">
              <input type="checkbox" checked={!unticked.has(i)} onChange={(ev) => onToggle(i, ev.target.checked)} />
              {describeEffect(e, name, presetName, (n) => money(ctx, n, { sign: true }))}
            </label>
          </li>
        ))}
      </ul>
      {posted.length > 0 && (
        <p className="cf-muted app-small" data-testid="effects-posted">
          Already on the ledger, so not applied again: {posted.map(({ e }) => describeEffect(e, name, presetName, (n) => money(ctx, n, { sign: true }))).join("; ")}.
        </p>
      )}
    </Card>
  );
}

export function ResultsPanel({ results, runId, applied: appliedNow }: { results: Record<string, unknown>; runId?: Id; /** Indices of the effects accepting applied (the effects are then shown as done). */ applied?: number[] }) {
  const ctx = useCampaign();
  const name = (id: Id) => ctx.store.get("entities", id)?.name ?? id;
  const presetName = (id: string) => ctx.module.preset(id)?.name ?? id;
  const outcomes = useMemo(() => outcomesOf(results), [results]);
  const effects = useMemo(() => effectsOf(results), [results]);
  const plain = effects.map((e, i) => ({ e, i })).filter((x) => x.e.kind !== "prompt");
  const prompts = effects.filter((e): e is Extract<Effect, { kind: "prompt" }> => e.kind === "prompt").map((e) => e.prompt);
  const [selected, setSelected] = useState<Set<number>>(() => new Set(appliedNow ?? plain.filter((x) => !alreadyPosted(ctx.store, x.e)).map((x) => x.i)));
  const [applied, setApplied] = useState(appliedNow !== undefined);
  const [answered, setAnswered] = useState<Record<string, "yes" | "no">>({});

  const apply = () => {
    const chosen = plain.filter((x) => selected.has(x.i)).map((x) => x.e);
    const res = applyGeneratorEffects(ctx, chosen, undefined, runId);
    setApplied(true);
    const skipped = res.skipped.length ? `, ${res.skipped.length} skipped (${res.skipped.map((x) => x.reason).join("; ")})` : "";
    pushToast(`Applied ${res.applied.length} effect${res.applied.length === 1 ? "" : "s"}${skipped}.`, { tone: res.skipped.length ? "warning" : "success" });
  };

  const answer = (p: Prompt, yes: boolean) => {
    if (yes && p.onYes?.length) applyGeneratorEffects(ctx, p.onYes);
    setAnswered((a) => ({ ...a, [p.id]: yes ? "yes" : "no" }));
  };

  return (
    <Card title="Results" data-testid="run-results">
      {outcomes.map((o) => (
        <div key={o.key} className="app-stack">
          <h4 className="prep-h4">{humanize(o.key)}</h4>
          <ul className="app-list">
            {o.items.map((it, i) => (
              <li key={i} className="app-list__row">
                <strong>{it.name}</strong>
                {it.choice && <Badge>{humanize(it.choice)}</Badge>}
                <span>{it.summary}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {plain.length > 0 && (
        <div className="app-stack">
          <h4 className="prep-h4">Suggested effects</h4>
          <ul className="app-list" data-testid="effects">
            {plain.map(({ e, i }) => (
              <li key={i} className="app-list__row">
                <label className="app-toggle">
                  <input
                    type="checkbox"
                    disabled={applied}
                    checked={selected.has(i)}
                    onChange={(ev) =>
                      setSelected((s) => {
                        const n = new Set(s);
                        if (ev.target.checked) n.add(i);
                        else n.delete(i);
                        return n;
                      })
                    }
                  />
                  {describeEffect(e, name, presetName, (n) => money(ctx, n, { sign: true }))}
                </label>
              </li>
            ))}
          </ul>
          <div className="app-row">
            <Button variant="primary" disabled={applied || selected.size === 0} onClick={apply}>
              {applied ? "Applied" : `Apply ${selected.size} effect${selected.size === 1 ? "" : "s"}`}
            </Button>
          </div>
        </div>
      )}
      {prompts.length > 0 && (
        <div className="app-stack">
          <h4 className="prep-h4">Questions</h4>
          <ul className="app-list">
            {prompts.map((p) => (
              <li key={p.id} className="app-list__row">
                <span>
                  {p.text} <PageRef page={p.page} />
                </span>
                {answered[p.id] ? (
                  <Badge tone={answered[p.id] === "yes" ? "success" : "muted"}>{answered[p.id]}</Badge>
                ) : (
                  <span className="app-row app-list__end">
                    <Button size="sm" onClick={() => answer(p, true)}>
                      Yes
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => answer(p, false)}>
                      No
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {outcomes.length === 0 && effects.length === 0 && <p className="cf-muted">The run is recorded with its rolls.</p>}
    </Card>
  );
}
