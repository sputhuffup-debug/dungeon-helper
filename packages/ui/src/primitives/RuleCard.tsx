import { useMemo, useState } from "react";
import type { PlayMode, PlayModeId, RuleCard } from "@campaign-forge/module-sdk";
import { cx } from "../sheet/paths";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Markdown } from "./Markdown";
import { PageRef } from "./PageRef";
import { EmptyState } from "./Toolbar";

export interface RuleCardViewProps {
  card: RuleCard;
  onOpenRule?: (ruleId: string) => void;
  onOpenTable?: (tableId: string) => void;
  onOpenField?: (fieldRef: string) => void;
  onOpenTracker?: (trackerId: string) => void;
  /** Resolve a linked id to a display name; falls back to the id. */
  resolveName?: (kind: "rule" | "table" | "field" | "tracker", id: string) => string | undefined;
  className?: string;
}

export function RuleCardView({ card, onOpenRule, onOpenTable, onOpenField, onOpenTracker, resolveName, className }: RuleCardViewProps) {
  const links = card.links ?? {};
  const allGroups: Array<{ kind: "rule" | "table" | "field" | "tracker"; ids: string[]; handler?: (id: string) => void }> = [
    { kind: "rule", ids: links.rules ?? [], handler: onOpenRule },
    { kind: "table", ids: links.tables ?? [], handler: onOpenTable },
    { kind: "field", ids: links.fields ?? [], handler: onOpenField },
    { kind: "tracker", ids: links.trackers ?? [], handler: onOpenTracker },
  ];
  const groups = allGroups.filter((g) => g.ids.length > 0);
  return (
    <article className={cx("cf-rule", className)} aria-label={card.title}>
      <header className="cf-rule__header">
        <h3 className="cf-rule__title">{card.title}</h3>
        <div className="cf-rule__meta">
          <PageRef page={card.page} cite={card.cite} original={card.original} />
          {card.mode?.map((m) => (
            <Badge key={m} tone="accent">
              {m}
            </Badge>
          ))}
          {card.tags?.map((t) => <Badge key={t}>{t}</Badge>)}
        </div>
      </header>
      <Markdown text={card.summary} className="cf-rule__summary" />
      {groups.length > 0 && (
        <div className="cf-rule__links">
          {groups.map((g) => (
            <span key={g.kind} style={{ display: "contents" }}>
              <span className="cf-rule__links-label">{g.kind}s</span>
              {g.ids.map((id) => (
                <Button key={id} size="sm" variant="ghost" onClick={() => g.handler?.(id)} disabled={!g.handler}>
                  {resolveName?.(g.kind, id) ?? id}
                </Button>
              ))}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

export interface RuleCardListProps {
  cards: RuleCard[];
  /** Play modes offered in the filter. */
  modes?: PlayMode[];
  /** Initial mode filter. */
  mode?: PlayModeId;
  onOpen?: (card: RuleCard) => void;
  className?: string;
}

export function filterRuleCards(cards: RuleCard[], query: string, mode?: PlayModeId): RuleCard[] {
  const q = query.trim().toLowerCase();
  return cards.filter((c) => {
    if (mode && c.mode && c.mode.length > 0 && !c.mode.includes(mode)) return false;
    if (!q) return true;
    return c.title.toLowerCase().includes(q) || c.summary.toLowerCase().includes(q) || (c.tags ?? []).some((t) => t.toLowerCase().includes(q));
  });
}

/** A one-paragraph plain-text preview of a card's Markdown summary (long rule text is cut, the card shows it all). */
export function rulePreview(summary: string, max = 220): string {
  const plain = summary
    .replace(/^\s*\|.*\|\s*$/gm, " ")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/[*_`]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > max ? `${plain.slice(0, max).replace(/\s+\S*$/, "")}…` : plain;
}

export function RuleCardList({ cards, modes, mode, onOpen, className }: RuleCardListProps) {
  const [query, setQuery] = useState("");
  const [modeFilter, setModeFilter] = useState<string>(mode ?? "");
  const shown = useMemo(() => filterRuleCards(cards, query, modeFilter || undefined), [cards, query, modeFilter]);
  return (
    <div className={cx("cf-rulelist", className)}>
      <div className="cf-rulelist__filters">
        <input className="cf-input" type="search" placeholder="Search rules" aria-label="Search rules" value={query} onChange={(e) => setQuery(e.target.value)} />
        {modes && modes.length > 0 && (
          <select className="cf-select" aria-label="Filter by mode" value={modeFilter} onChange={(e) => setModeFilter(e.target.value)}>
            <option value="">All modes</option>
            {modes.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        )}
      </div>
      {shown.length === 0 ? (
        <EmptyState title="No rules match" text="Try another word or clear the mode filter." />
      ) : (
        <ul className="cf-rulelist__items">
          {shown.map((c) => (
            <li key={c.id}>
              <button type="button" className="cf-rulelist__item" onClick={() => onOpen?.(c)}>
                <span className="cf-rulelist__item-text">
                  <span className="cf-rulelist__item-title">{c.title}</span>
                  <span className="cf-rulelist__item-summary">{rulePreview(c.summary)}</span>
                </span>
                <PageRef page={c.page} cite={c.cite} original={c.original} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
