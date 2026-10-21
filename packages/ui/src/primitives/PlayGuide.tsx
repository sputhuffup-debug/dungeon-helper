/**
 * A module's GM play guide at the table: tips, a search box and groups of
 * stat and skill entries. Each entry is a one-line row that expands to the
 * cues for calling the roll and how success, failure and a push move the
 * story. Game-agnostic: the app adds per-entry extras (who rolls best, a
 * roller) through `entryMeta` and `entryExtra`.
 */
import { useId, useMemo, useState, type ReactNode } from "react";
import type { PlayGuideDef, PlayGuideEntry, PlayGuideGroup, PlayModeId } from "@campaign-forge/module-sdk";
import { cx } from "../sheet/paths";
import { PageRef } from "./PageRef";
import { EmptyState } from "./Toolbar";

const inMode = (item: { mode?: PlayModeId[] }, mode: PlayModeId | undefined) => !mode || !item.mode || item.mode.length === 0 || item.mode.includes(mode);

/** Guides that apply in `mode`, each with only the entries that apply in it. Without a mode, everything. */
export function playGuidesForMode(guides: readonly PlayGuideDef[] | undefined, mode?: PlayModeId): PlayGuideDef[] {
  return (guides ?? []).filter((g) => inMode(g, mode)).map((g) => ({ ...g, entries: g.entries.filter((e) => inMode(e, mode)) }));
}

/** Entries whose label, summary, cues or group name contain the query (case-insensitive). */
export function filterPlayGuideEntries(guide: PlayGuideDef, query: string): PlayGuideEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return guide.entries;
  const groups = new Map(guide.groups.map((g) => [g.id, g]));
  const has = (s: string | undefined) => !!s && s.toLowerCase().includes(q);
  return guide.entries.filter((e) => has(e.label) || has(e.summary) || e.callFor.some(has) || has(e.group ? groups.get(e.group)?.label : undefined));
}

const OTHER: PlayGuideGroup = { id: "", label: "Other" };

/** Entries bucketed by group in the guide's group order; entries without a known group go last under "Other". */
function grouped(guide: PlayGuideDef, entries: PlayGuideEntry[]): Array<{ group: PlayGuideGroup; entries: PlayGuideEntry[] }> {
  const known = new Set(guide.groups.map((g) => g.id));
  const out = guide.groups.map((group) => ({ group, entries: entries.filter((e) => e.group === group.id) }));
  const rest = entries.filter((e) => !e.group || !known.has(e.group));
  if (rest.length) out.push({ group: OTHER, entries: rest });
  return out.filter((g) => g.entries.length > 0);
}

export interface PlayGuideTipsProps {
  tips: NonNullable<PlayGuideDef["tips"]>;
  defaultOpen?: boolean;
}

/** The guide's general tips, collapsed by default. */
export function PlayGuideTips({ tips, defaultOpen = false }: PlayGuideTipsProps) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  if (tips.length === 0) return null;
  return (
    <div className="cf-guide__tips">
      <button type="button" className="cf-guide__toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <span className="cf-guide__chevron" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
        <span className="cf-guide__toggle-label">Tips</span>{" "}
        <span className="cf-muted">{tips.length}</span>
      </button>
      {open && (
        <ul id={id} className="cf-guide__tiplist">
          {tips.map((t, i) => (
            <li key={i}>
              {t.text} <PageRef page={t.page} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export interface PlayGuideEntryViewProps {
  entry: PlayGuideEntry;
  expanded: boolean;
  onToggle: () => void;
  /** Shown at the end of the collapsed line (e.g. who rolls best). */
  meta?: ReactNode;
  /** Shown at the end of the expanded body (e.g. a roller). */
  children?: ReactNode;
}

/** One stat or skill: a one-line toggle row, and the cues and outcomes when expanded. */
export function PlayGuideEntryView({ entry, expanded, onToggle, meta, children }: PlayGuideEntryViewProps) {
  const id = useId();
  const outcomes = [
    { key: "success", label: "Success", text: entry.success },
    { key: "failure", label: "Failure", text: entry.failure },
    { key: "push", label: "Push", text: entry.push },
  ].filter((o) => !!o.text);
  return (
    <li className={cx("cf-guide__entry", expanded && "cf-guide__entry--open")} data-entry={entry.id} data-kind={entry.kind}>
      <button type="button" className="cf-guide__row" aria-expanded={expanded} aria-controls={id} onClick={onToggle}>
        <span className="cf-guide__chevron" aria-hidden="true">
          {expanded ? "▾" : "▸"}
        </span>
        <span className="cf-guide__label">{entry.label}</span>{" "}
        {entry.summary && !expanded && <span className="cf-guide__line">{entry.summary}</span>}{" "}
        <span className="cf-guide__row-end">
          {meta}
          <PageRef page={entry.page} cite={entry.cite} />
        </span>
      </button>
      {expanded && (
        <div id={id} className="cf-guide__body">
          {entry.summary && <p className="cf-guide__summary">{entry.summary}</p>}
          {entry.callFor.length > 0 && (
            <div>
              <span className="cf-guide__heading">Call for it when</span>
              <ul className="cf-guide__cues" aria-label={`${entry.label}: call for it when`}>
                {entry.callFor.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          {outcomes.length > 0 && (
            <dl className="cf-guide__outcomes">
              {outcomes.map((o) => (
                <div key={o.key} className={`cf-guide__outcome cf-guide__outcome--${o.key}`}>
                  <dt>{o.label}</dt>
                  <dd>{o.text}</dd>
                </div>
              ))}
            </dl>
          )}
          {entry.examples && entry.examples.length > 0 && (
            <div>
              <span className="cf-guide__heading">Say</span>
              <ul className="cf-guide__examples">
                {entry.examples.map((x, i) => (
                  <li key={i}>“{x}”</li>
                ))}
              </ul>
            </div>
          )}
          {children}
        </div>
      )}
    </li>
  );
}

export interface PlayGuideViewProps {
  /** A guide already filtered to the play mode (see `playGuidesForMode`). */
  guide: PlayGuideDef;
  entryMeta?: (entry: PlayGuideEntry) => ReactNode;
  entryExtra?: (entry: PlayGuideEntry) => ReactNode;
  className?: string;
}

/** Search, tips and collapsible groups of entries. A search opens every group; a single match opens itself. */
export function PlayGuideView({ guide, entryMeta, entryExtra, className }: PlayGuideViewProps) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const matches = useMemo(() => filterPlayGuideEntries(guide, query), [guide, query]);
  const sections = useMemo(() => grouped(guide, matches), [guide, matches]);
  const searching = query.trim() !== "";
  const autoOpen = searching && matches.length === 1;

  const toggleGroup = (id: string) => {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCollapsed(next);
  };

  return (
    <div className={cx("cf-guide", className)} data-testid="play-guide">
      <div className="cf-guide__head">
        <h3 className="cf-guide__title">{guide.title}</h3>
        {guide.intro && <p className="cf-guide__intro">{guide.intro}</p>}
      </div>
      <input
        className="cf-input"
        type="search"
        placeholder="Search stats, skills and cues"
        aria-label="Search hints"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setCollapsed(new Set());
        }}
      />
      {guide.tips && <PlayGuideTips tips={guide.tips} />}
      {sections.length === 0 ? (
        <EmptyState title="No hints match" text="Try a stat, a skill or a word from a cue." />
      ) : (
        sections.map(({ group, entries }) => {
          const isOpen = !collapsed.has(group.id);
          const bodyId = `cf-guide-${guide.id}-${group.id || "other"}`;
          return (
            <section key={group.id} className="cf-guide__group" data-group={group.id || "other"} aria-label={group.label}>
              <button type="button" className="cf-guide__toggle cf-guide__group-head" aria-expanded={isOpen} aria-controls={bodyId} onClick={() => toggleGroup(group.id)}>
                <span className="cf-guide__chevron" aria-hidden="true">
                  {isOpen ? "▾" : "▸"}
                </span>
                <span className="cf-guide__toggle-label">{group.label}</span>{" "}
                <span className="cf-muted">{entries.length}</span>{" "}
                {group.summary && <span className="cf-guide__line">{group.summary}</span>}
                <span className="cf-guide__row-end">
                  <PageRef page={group.page} />
                </span>
              </button>
              {isOpen && (
                <ul id={bodyId} className="cf-guide__entries">
                  {entries.map((e) => {
                    const expanded = open[e.id] ?? autoOpen;
                    return (
                      <PlayGuideEntryView key={e.id} entry={e} expanded={expanded} onToggle={() => setOpen({ ...open, [e.id]: !expanded })} meta={entryMeta?.(e)}>
                        {entryExtra?.(e)}
                      </PlayGuideEntryView>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
