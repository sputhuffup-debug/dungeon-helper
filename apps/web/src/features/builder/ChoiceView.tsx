/**
 * One choice of the character builder, with the sub-choices its picks bring:
 * option cards (or a compact searchable list for long lists, a number row for
 * a range), each with its summary, source and edition badges and the item
 * keys the module names; a details panel with the focused option's full
 * text; inline counts and problems; and a roll (in the app or entered from
 * the table) for options that roll.
 */
import { createEnteredRng, createRng, rollOptionDice, togglePick, type ChoiceState, type OptionState } from "@campaign-forge/module-sdk";
import { useId, useMemo, useState } from "react";
import { Badge, Button, EnterDice, Markdown, PageRef, SourceBadge } from "../../components/ui";
import { humanize } from "../../lib/format";
import type { StoredDraft } from "./drafts";

export interface ChoiceViewProps {
  choice: ChoiceState;
  draft: StoredDraft;
  onDraft: (next: StoredDraft) => void;
  /** 0 for a step's own choice, deeper for sub-choices. */
  depth?: number;
}

/** Item keys never shown as columns or details. */
const HIDDEN_KEYS = new Set(["id", "name", "summary", "description", "builder", "edition", "source", "cite", "page", "original", "value", "rolled", "roll", "rows", "picks", "armor", "shield", "gp"]);

function valueText(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (Array.isArray(v)) return v.map(valueText).filter(Boolean).join(", ");
  if (typeof v === "object") return "";
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}

/** How many to pick, as a short line. */
function countLine(c: ChoiceState): string {
  if (c.max <= 0) return "";
  const n = c.picked.length;
  if (c.min === c.max) return `${n} of ${c.max}`;
  return c.min > 0 ? `${n} (${c.min} to ${c.max})` : `${n} of up to ${c.max}`;
}

export function ChoiceView({ choice, draft, onDraft, depth = 0 }: ChoiceViewProps) {
  const headingId = useId();
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState<string | undefined>();
  const multi = choice.max > 1;
  const long = !choice.range && choice.options.length > (depth === 0 ? 16 : 10);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return choice.options;
    return choice.options.filter((o) => o.name.toLowerCase().includes(q) || (o.summary ?? "").toLowerCase().includes(q) || choice.picked.includes(o.id));
  }, [choice.options, choice.picked, query]);
  const focused = choice.options.find((o) => o.id === (focus ?? choice.picked[0]));
  const errors = choice.issues.filter((i) => i.level === "error" || i.level === "warning");
  const complete = choice.picked.length >= choice.min && !choice.issues.some((i) => i.level === "error" || i.level === "incomplete");

  const pick = (o: OptionState) => {
    if (!o.available) return;
    setFocus(o.id);
    onDraft(togglePick(draft, choice, o.id));
  };

  const Heading = depth === 0 ? "h3" : "h4";
  const hasOptions = choice.options.length > 0 || choice.max > 0;
  return (
    <section className={`cb-choice cb-choice--d${Math.min(depth, 3)}`} aria-labelledby={headingId} data-testid={`choice:${choice.path}`} data-complete={complete ? "true" : "false"}>
      {hasOptions && (
        <header className="cb-choice__head">
          <Heading id={headingId} className="cb-choice__label">
            {choice.label}
            {choice.parentName && depth > 0 ? <span className="cf-muted cb-choice__for"> · {choice.parentName}</span> : null}
          </Heading>
          {countLine(choice) && (
            <Badge tone={complete ? "success" : "warning"} data-testid="choice-count">
              {countLine(choice)}
            </Badge>
          )}
        </header>
      )}
      {choice.help && <p className="cf-muted cb-choice__help">{choice.help}</p>}
      {errors.length > 0 && (
        <ul className="cb-issues" role="alert">
          {errors.map((i, n) => (
            <li key={n} className={`cb-issue is-${i.level}`}>
              {i.message}
            </li>
          ))}
        </ul>
      )}

      {choice.range ? (
        <div className="cb-range" role="radiogroup" aria-labelledby={headingId}>
          {choice.options.map((o) => {
            const on = choice.picked.includes(o.id);
            return (
              <button key={o.id} type="button" role="radio" aria-checked={on} className={`cb-range__n${on ? " is-on" : ""}`} onClick={() => pick(o)} data-testid={`opt:${choice.path}:${o.id}`} aria-label={o.name}>
                {String(o.value)}
              </button>
            );
          })}
        </div>
      ) : long ? (
        <div className="cb-list">
          <input className="cf-input cb-list__filter" type="search" placeholder={`Filter ${choice.options.length} options`} aria-label={`Filter ${choice.label}`} value={query} onChange={(e) => setQuery(e.target.value)} />
          <ul className="cb-list__items" role={multi ? "group" : "radiogroup"} aria-labelledby={headingId}>
            {shown.map((o) => (
              <OptionRow key={o.id} option={o} choice={choice} multi={multi} onPick={pick} onDetails={() => setFocus(o.id)} />
            ))}
            {shown.length === 0 && <li className="cf-muted">No option matches.</li>}
          </ul>
        </div>
      ) : (
        choice.options.length > 0 && (
          <div className={`cb-cards${depth > 0 ? " cb-cards--small" : ""}`} role={multi ? "group" : "radiogroup"} aria-labelledby={headingId}>
            {choice.options.map((o) => (
              <OptionCard key={o.id} option={o} choice={choice} multi={multi} onPick={pick} onDetails={() => setFocus(o.id)} />
            ))}
          </div>
        )
      )}

      {focused && (focused.description || Object.keys(focused.item).some((k) => !HIDDEN_KEYS.has(k) && valueText(focused.item[k]))) && (depth === 0 || long) && <Details option={focused} />}

      {choice.picked.map((id) => {
        const o = choice.options.find((x) => x.id === id);
        return o?.roll ? <RollControl key={id} choice={choice} option={o} draft={draft} onDraft={onDraft} /> : null;
      })}

      {choice.sub.length > 0 && (
        <div className="cb-sub">
          {choice.sub.map((s) => (
            <ChoiceView key={s.path} choice={s} draft={draft} onDraft={onDraft} depth={depth + 1} />
          ))}
        </div>
      )}
    </section>
  );
}

function Columns({ option, choice }: { option: OptionState; choice: ChoiceState }) {
  const cols = choice.columns.map((k) => [k, valueText(option.item[k])] as const).filter(([, v]) => v);
  if (!cols.length) return null;
  return (
    <dl className="cb-card__cols">
      {cols.map(([k, v]) => (
        <div key={k}>
          <dt>{humanize(k)}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function OptionCard({ option: o, choice, multi, onPick, onDetails }: { option: OptionState; choice: ChoiceState; multi: boolean; onPick: (o: OptionState) => void; onDetails: () => void }) {
  const on = choice.picked.includes(o.id);
  return (
    <div className={`cb-card${on ? " is-on" : ""}${o.available ? "" : " is-off"}`} data-testid={`opt:${choice.path}:${o.id}`}>
      <label className="cb-card__pick">
        <input type={multi ? "checkbox" : "radio"} name={choice.path} checked={on} disabled={!o.available && !on} onChange={() => onPick(o)} />
        <span className="cb-card__name">{o.name}</span>
      </label>
      <span className="cb-card__badges">
        <SourceBadge source={o.source} edition={o.edition} />
      </span>
      {o.summary && <p className="cb-card__summary">{o.summary}</p>}
      <Columns option={o} choice={choice} />
      {!o.available && o.reason && <p className="cb-card__reason">{o.reason}</p>}
      {(o.description || o.cite || o.page !== undefined) && (
        <button type="button" className="cb-card__more" onClick={onDetails} aria-label={`Details: ${o.name}`}>
          Details
        </button>
      )}
    </div>
  );
}

function OptionRow({ option: o, choice, multi, onPick, onDetails }: { option: OptionState; choice: ChoiceState; multi: boolean; onPick: (o: OptionState) => void; onDetails: () => void }) {
  const on = choice.picked.includes(o.id);
  return (
    <li className={`cb-row${on ? " is-on" : ""}${o.available ? "" : " is-off"}`} data-testid={`opt:${choice.path}:${o.id}`}>
      <label className="cb-row__pick">
        <input type={multi ? "checkbox" : "radio"} name={choice.path} checked={on} disabled={!o.available && !on} onChange={() => onPick(o)} />
        <span className="cb-row__name">{o.name}</span>
        <SourceBadge source={o.source} edition={o.edition} />
        {o.summary && <span className="cf-muted cb-row__summary">{o.summary}</span>}
        {!o.available && o.reason && <span className="cb-row__reason">{o.reason}</span>}
      </label>
      {(o.description || o.cite) && (
        <button type="button" className="cb-row__more" onClick={onDetails} aria-label={`Details: ${o.name}`}>
          ⓘ
        </button>
      )}
    </li>
  );
}

function Details({ option: o }: { option: OptionState }) {
  const rows = Object.entries(o.item)
    .filter(([k, v]) => !HIDDEN_KEYS.has(k) && valueText(v))
    .slice(0, 14);
  return (
    <aside className="cb-details" aria-label={`About ${o.name}`} data-testid="option-details">
      <header className="cb-details__head">
        <strong>{o.name}</strong> <SourceBadge source={o.source} edition={o.edition} /> <PageRef page={o.page} cite={o.cite} original={o.original} />
      </header>
      {rows.length > 0 && (
        <dl className="cb-details__fields">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt>{humanize(k)}</dt>
              <dd>{valueText(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      {o.description && <Markdown text={o.description} className="cb-details__text" />}
    </aside>
  );
}

/** Roll an option's dice (rolled hit points): in the app with the draft's seed, or typed in from the table. */
function RollControl({ choice, option, draft, onDraft }: { choice: ChoiceState; option: OptionState; draft: StoredDraft; onDraft: (d: StoredDraft) => void }) {
  const [entering, setEntering] = useState(false);
  const key = `${choice.path}#${option.id}`;
  const done = draft.rolls?.[key];
  const expr = option.roll!;
  const save = (faces: number[], total: number, entered: boolean) => onDraft({ ...draft, rolls: { ...draft.rolls, [key]: { faces, total, ...(entered ? { entered: true } : {}) } }, rollCount: (draft.rollCount ?? 0) + 1 });
  const run = useMemo(() => (rng: Parameters<typeof rollOptionDice>[1]) => rollOptionDice(expr, rng), [expr]);
  return (
    <div className="cb-roll" data-testid="option-roll">
      <span>
        {option.name}: <strong>{expr}</strong>
        {done && (
          <>
            {" "}
            = <strong data-testid="option-roll-total">{done.total}</strong> <span className="cf-muted">({done.faces.join(", ")}{done.entered ? ", entered" : ""})</span>
          </>
        )}
      </span>
      {!entering && (
        <span className="app-row">
          <Button
            size="sm"
            onClick={() => {
              const r = rollOptionDice(expr, createRng(`${draft.seed}/${key}/${draft.rollCount ?? 0}`));
              save(r.faces, r.total, false);
            }}
            data-testid="option-roll-app"
          >
            {done ? "Roll again" : `Roll ${expr}`}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEntering(true)} data-testid="option-roll-enter">
            Enter dice
          </Button>
        </span>
      )}
      {entering && (
        <EnterDice
          run={run}
          title={`Dice for ${expr}`}
          onSubmit={(faces) => {
            setEntering(false);
            const r = rollOptionDice(expr, createEnteredRng(faces));
            save(r.faces, r.total, true);
          }}
          onCancel={() => setEntering(false)}
        />
      )}
    </div>
  );
}
