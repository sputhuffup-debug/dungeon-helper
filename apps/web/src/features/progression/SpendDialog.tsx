/**
 * Spend XP, in a side panel next to the Progression tab: the module's spend
 * options (raise a skill, learn a talent) with every target's cost, cap and
 * preconditions. A skill shows the dice pool it rolls before and after; a
 * talent shows its group (e.g. career or general). Applying changes the
 * sheet, pays from the pool and logs the spend.
 */
import type { Entity } from "@campaign-forge/core";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Drawer, PageRef, pushToast } from "../../components/ui";
import { errorMessage } from "../../lib/format";
import { poolValue, type SpendOptionDef, type SpendQuote } from "@campaign-forge/module-sdk";
import { useCampaign, useMeta, useRecord } from "../../state/hooks";
import { poolOf, sessionRunning, spendOnSheet, spendOptionsOf, spendQuotes } from "../../state/progressionActions";
import { skillInput } from "../table/DicePanel";

/** Dice a skill rolls (attribute plus level), from the module's own pool builder, without stress. */
function diceFor(ctx: ReturnType<typeof useCampaign>, entity: Entity, key: string, level: number): number | undefined {
  try {
    const { input } = skillInput(ctx.module, entity, key);
    const pool = ctx.module.module.dice.buildPool({ ...input, skill: level, stress: 0 });
    return Object.values(pool.dice).reduce((a, b) => a + b, 0);
  } catch {
    return undefined;
  }
}

/** The pick target's tag for an item (e.g. which group may learn it), as the option declares it. */
function groupOf(ctx: ReturnType<typeof useCampaign>, option: SpendOptionDef, q: SpendQuote): string | undefined {
  const t = option.target;
  if (t.kind !== "pick" || !t.groupKey || !q.item) return undefined;
  const v = (q.item as Record<string, unknown>)[t.groupKey];
  if (typeof v !== "string" || !v) return t.groupEmpty;
  return ctx.module.module.referenceLists.flatMap((l) => l.items).find((i) => i.id === v)?.name ?? v;
}

export function SpendDialog({ entityId, open, onClose }: { entityId: string; open: boolean; onClose: () => void }) {
  const ctx = useCampaign();
  const { mode } = useMeta();
  const entity = useRecord("entities", entityId);
  const options = useMemo(() => spendOptionsOf(ctx), [ctx, mode]);
  const [optionId, setOptionId] = useState(options[0]?.id ?? "");
  const [target, setTarget] = useState<string | undefined>();
  const [confirmed, setConfirmed] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const option: SpendOptionDef | undefined = options.find((o) => o.id === optionId) ?? options[0];
  const quotes = useMemo(() => (entity && option ? spendQuotes(ctx, entity, option) : []), [ctx, entity, option]);
  const visible = showAll ? quotes : quotes.filter((q) => q.available && !(option?.target.kind === "pick" && q.blocked.some((b) => b.startsWith("Already"))));
  const quote = quotes.find((q) => q.target === target);
  const pool = poolOf(ctx.module, mode, option?.pool ?? "experience");
  useEffect(() => {
    setConfirmed(false);
  }, [target, optionId]);
  useEffect(() => {
    if (!open) {
      setTarget(undefined);
      setShowAll(false);
    }
  }, [open]);
  if (!entity || !option) return null;
  const running = sessionRunning(ctx);
  const xp = pool ? poolValue(pool, entity.fields) : 0;

  const apply = () => {
    if (!quote) return;
    try {
      spendOnSheet(ctx, { character: entity.id, option: option.id, target: quote.target, confirmed });
      pushToast(`${entity.name}: ${option.label.toLowerCase()}, ${quote.label}${option.target.kind === "level" ? ` ${quote.from} → ${quote.to}` : ""} for ${quote.cost} ${pool?.label ?? ""}.`, { tone: "success" });
      onClose();
    } catch (e) {
      pushToast(errorMessage(e), { tone: "danger" });
    }
  };

  const canApply = !!quote && quote.blocked.length === 0 && (quote.confirm.length === 0 || confirmed);
  const kind = option.target.kind;
  return (
    <Drawer open={open} onClose={onClose} title={`Spend ${pool?.label ?? "points"}: ${entity.name}`} className="prog-spend">
      <div className="prog-spend__body" data-testid="spend-dialog">
        {pool && "spendWhen" in pool && pool.spendWhen === "between-sessions" && running && (
          <p className="prog-warn" role="note">
            A session is running. {(pool as { spendWhenText?: string }).spendWhenText ?? "The rules allow spending only between sessions."} <PageRef page={pool.page} />
          </p>
        )}
        <div className="app-row" role="tablist" aria-label="What to spend on">
          {options.map((o) => (
            <Button key={o.id} active={o.id === option.id} role="tab" aria-selected={o.id === option.id} onClick={() => (setOptionId(o.id), setTarget(undefined))}>
              {o.label}
            </Button>
          ))}
          <span className="app-grow" />
          <label className="prog-inline">
            <input type="checkbox" className="cf-checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show unavailable
          </label>
        </div>
        {option.text && (
          <p className="cf-muted prog-spend__rule">
            {option.text} <PageRef page={option.page} />
          </p>
        )}
        <ul className="prog-targets" aria-label={option.label} data-testid="spend-targets">
          {visible.map((q) => {
            const before = kind === "level" ? diceFor(ctx, entity, q.target, q.from) : undefined;
            const after = kind === "level" ? diceFor(ctx, entity, q.target, q.to) : undefined;
            const group = groupOf(ctx, option, q);
            const summary = kind === "pick" && q.item && typeof (q.item as { summary?: unknown }).summary === "string" ? (q.item as { summary: string }).summary : undefined;
            const blocked = q.blocked.length > 0;
            return (
              <li key={q.target}>
                <button type="button" className={`prog-target${q.target === target ? " is-selected" : ""}${blocked ? " is-blocked" : ""}`} aria-pressed={q.target === target} data-target={q.target} onClick={() => setTarget(q.target)}>
                  <span className="prog-target__name">
                    {q.label}
                    {group && (
                      <>
                        {" "}
                        <Badge tone={option.target.kind === "pick" && group === option.target.groupEmpty ? "muted" : "accent"}>{group}</Badge>
                      </>
                    )}
                  </span>
                  <span className="prog-target__step">{kind === "level" ? `${q.from} → ${q.to}` : q.from > 0 ? `×${q.from} → ×${q.to}` : "new"}</span>
                  <span className="prog-target__dice cf-muted">{before !== undefined && after !== undefined ? `${before} → ${after} dice` : ""}</span>
                  <span className="prog-target__cost">
                    {q.cost} {pool?.label}
                  </span>
                  {summary && <span className="cf-muted prog-target__summary">{summary}</span>}
                  {blocked && <span className="prog-target__blocked">{q.blocked.join("; ")}</span>}
                </button>
              </li>
            );
          })}
          {visible.length === 0 && <li className="cf-muted">Nothing to buy here right now.</li>}
        </ul>
        <div className="prog-quote" data-testid="spend-quote-area">
          {quote ? (
            <div className="app-stack" data-testid="spend-quote">
              <strong>
                {quote.label}
                {kind === "level" ? ` ${quote.from} → ${quote.to}` : quote.from > 0 ? ` ×${quote.to}` : ""}
              </strong>
              <span>
                Cost {quote.cost} {pool?.label}; {pool?.label} after: {quote.balanceAfter}
              </span>
              {quote.blocked.length > 0 && <span className="prog-target__blocked">{quote.blocked.join("; ")}</span>}
              {quote.confirm.map((c) => (
                <label key={c} className="prog-confirm">
                  <input type="checkbox" className="cf-checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} aria-label="Confirm the condition" />
                  <span>{c}</span>
                </label>
              ))}
            </div>
          ) : (
            <span className="cf-muted">Pick what to buy.</span>
          )}
          <div className="app-row">
            <span className="cf-muted app-grow" data-testid="spend-balance">
              {pool?.label} {xp}
              {quote && quote.blocked.length === 0 ? ` → ${quote.balanceAfter}` : ""}
            </span>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={apply} disabled={!canApply} data-testid="apply-spend">
              {quote ? `Spend ${quote.cost} ${pool?.label ?? ""}` : "Spend"}
            </Button>
          </div>
        </div>
      </div>
    </Drawer>
  );
}
