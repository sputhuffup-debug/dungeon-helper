/**
 * Print views of an adventure: the GM booklet (built from `bookletDocument`,
 * laid out like a printed game book) and the agenda cards (cut-out handouts,
 * four to a page). They stand in for PDF in v1: the GM prints them, or saves
 * them as PDF from the browser. Black and white, greys only for tints and
 * rules; fonts are bundled (Alegreya family, SIL OFL) so they work offline.
 */
import "@fontsource/alegreya/latin-400.css";
import "@fontsource/alegreya/latin-400-italic.css";
import "@fontsource/alegreya/latin-700.css";
import "@fontsource/alegreya/latin-700-italic.css";
import "@fontsource/alegreya-sc/latin-500.css";
import "@fontsource/alegreya-sc/latin-700.css";
import "@fontsource/alegreya-sans/latin-400.css";
import "@fontsource/alegreya-sans/latin-500.css";
import "@fontsource/alegreya-sans/latin-700.css";
import "../../styles/print.css";
import type { Adventure } from "@campaign-forge/core";
import { Link } from "@tanstack/react-router";
import { Fragment, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Button, renderInline } from "../../components/ui";
import { errorMessage } from "../../lib/format";
import { useCampaign } from "../../state/hooks";
import { usePaper, type Paper } from "../../lib/paper";
import { agendaCards, type AgendaCard } from "./booklet";
import { bookletDocument, type BookletBlock, type BookletDocument, type BookletSection, type CastCard, type FieldRow, type HandoutEntry, type LocationEntry, type MapDeckFigure, type SceneEntry, type StatBlock } from "./bookletDocument";

// ---------------------------------------------------------------------------
// Markdown bodies
// ---------------------------------------------------------------------------

/** Renders the Markdown rich-text bodies write: headings, quotes, task and plain lists, paragraphs. */
export function BookletMarkdown({ text, className }: { text: string; className?: string }) {
  const out: ReactNode[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let para: string[] = [];
  let quote: string[] = [];
  let list: { ordered: boolean; items: Array<{ text: string; check?: boolean }> } | null = null;
  let key = 0;
  const flushPara = () => {
    if (para.length) out.push(<p key={key++}>{renderInline(para.join(" "))}</p>);
    para = [];
  };
  const flushQuote = () => {
    if (quote.length) {
      const paras = quote.join("\n").split(/\n\s*\n/);
      out.push(
        <blockquote key={key++} className="bk-quote">
          {paras.map((p, i) => (
            <p key={i}>{renderInline(p.replace(/\n/g, " "))}</p>
          ))}
        </blockquote>,
      );
    }
    quote = [];
  };
  const flushList = () => {
    if (list) {
      const items = list.items.map((it, i) => (
        <li key={i} className={it.check !== undefined ? "bk-task" : undefined}>
          {it.check !== undefined && <span className="bk-box" aria-hidden="true" data-checked={it.check ? "" : undefined} />}
          {renderInline(it.text)}
        </li>
      ));
      out.push(list.ordered ? <ol key={key++}>{items}</ol> : <ul key={key++}>{items}</ul>);
    }
    list = null;
  };
  const flushAll = () => {
    flushPara();
    flushQuote();
    flushList();
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const q = /^>\s?(.*)$/.exec(line);
    if (q) {
      flushPara();
      flushList();
      quote.push(q[1] ?? "");
      continue;
    }
    if (quote.length) flushQuote();
    if (line.trim() === "") {
      flushPara();
      flushList();
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flushAll();
      out.push(
        <p key={key++} className="bk-md-head">
          <strong>{renderInline(h[2] ?? "")}</strong>
        </p>,
      );
      continue;
    }
    const task = /^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (task || bullet || numbered) {
      flushPara();
      const ordered = !!numbered && !bullet;
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      if (task) list.items.push({ text: task[2] ?? "", check: task[1] !== " " });
      else list.items.push({ text: (bullet?.[1] ?? numbered?.[1] ?? "").trim() });
      continue;
    }
    if (list) flushList();
    para.push(line.trim());
  }
  flushAll();
  return <div className={className ?? "bk-md"}>{out}</div>;
}

// ---------------------------------------------------------------------------
// paper
// ---------------------------------------------------------------------------

export type { Paper };

/** Page box and margins per paper, as CSS lengths. */
export const PAPER_SIZES: Record<Paper, { label: string; size: string; width: string; height: string; margin: { top: string; side: string; bottom: string }; cardMargin: string }> = {
  letter: { label: "Letter", size: "letter", width: "8.5in", height: "11in", margin: { top: "0.85in", side: "0.75in", bottom: "0.8in" }, cardMargin: "0.4in" },
  a4: { label: "A4", size: "A4", width: "210mm", height: "297mm", margin: { top: "22mm", side: "19mm", bottom: "20mm" }, cardMargin: "10mm" },
};

/** A CSS string literal. */
const cssString = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]+/g, " ")}"`;

function paperVars(paper: Paper, margin: "booklet" | "cards"): CSSProperties {
  const p = PAPER_SIZES[paper];
  const m = margin === "cards" ? { top: p.cardMargin, side: p.cardMargin, bottom: p.cardMargin } : p.margin;
  return { "--bk-page-w": p.width, "--bk-page-h": p.height, "--bk-m-top": m.top, "--bk-m-side": m.side, "--bk-m-bottom": m.bottom } as CSSProperties;
}

/** The @page rules: paper, margins, page numbers and a running header per section (CSS margin boxes, Chrome 131+). */
function bookletPageCss(paper: Paper, title: string, sections: Array<{ name: string; header: string }>): string {
  const p = PAPER_SIZES[paper];
  const box = `font-family: "Alegreya Sans", "Helvetica Neue", Arial, sans-serif; font-size: 7.5pt; letter-spacing: 0.12em; text-transform: uppercase; color: #333;`;
  const rules = [
    `@page { size: ${p.size}; margin: ${p.margin.top} ${p.margin.side} ${p.margin.bottom}; @bottom-center { content: counter(page); ${box} font-size: 9pt; letter-spacing: 0; } }`,
    `@page bk-title { @bottom-center { content: none; } @top-left { content: none; } @top-right { content: none; } }`,
    ...sections.map(
      (s) =>
        `@page ${s.name} { @top-left { content: ${cssString(title)}; ${box} vertical-align: bottom; padding-bottom: 5pt; margin-bottom: 14pt; border-bottom: 0.5pt solid #000; } @top-right { content: ${cssString(s.header)}; ${box} vertical-align: bottom; padding-bottom: 5pt; margin-bottom: 14pt; border-bottom: 0.5pt solid #000; } }
        .bk-sheet.${s.name} { page: ${s.name}; }`,
    ),
  ];
  return rules.join("\n");
}

function cardsPageCss(paper: Paper): string {
  const p = PAPER_SIZES[paper];
  return `@page { size: ${p.size}; margin: ${p.cardMargin}; }`;
}

// ---------------------------------------------------------------------------
// toolbar
// ---------------------------------------------------------------------------

function PrintToolbar({ adventure, label, ready, auto, paper, onPaper }: { adventure: Adventure; label: string; ready: boolean; auto: boolean; paper: Paper; onPaper: (p: Paper) => void }) {
  const ctx = useCampaign();
  const printed = useRef(false);
  useEffect(() => {
    if (ready && auto && !printed.current) {
      printed.current = true;
      // let the browser lay the page out and load the fonts first
      let cancelled = false;
      const t = setTimeout(() => {
        void document.fonts.ready.then(() => !cancelled && window.print());
      }, 150);
      return () => {
        cancelled = true;
        clearTimeout(t);
      };
    }
    return undefined;
  }, [ready, auto]);
  return (
    <div className="app-row prep-print__toolbar">
      <Link to="/c/$campaignId/adventures/$adventureId" params={{ campaignId: ctx.campaignId, adventureId: adventure.id }} search={{}} className="cf-btn">
        ← Back to the builder
      </Link>
      <Button variant="primary" onClick={() => window.print()} disabled={!ready} data-testid="print-now">
        Print {label}
      </Button>
      <div className="guided-toggle" role="group" aria-label="Paper size">
        {(Object.keys(PAPER_SIZES) as Paper[]).map((p) => (
          <button key={p} type="button" className={`cf-btn cf-btn--sm${paper === p ? " is-active" : ""}`} aria-pressed={paper === p} onClick={() => onPaper(p)} data-testid={`paper-${p}`}>
            {PAPER_SIZES[p].label}
          </button>
        ))}
      </div>
      <span className="cf-muted">Use the browser's “Save as PDF” to keep a PDF. Turn on “Background graphics” for the black bars.</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// booklet pieces
// ---------------------------------------------------------------------------

function Value({ text }: { text: string }) {
  return text ? <>{text}</> : <span className="bk-writein" aria-label="blank, to fill in" />;
}

function FieldGrid({ rows, title, className }: { rows: FieldRow[]; title?: string | undefined; className?: string }) {
  if (!rows.length) return null;
  return (
    <div className={`bk-fields${className ? ` ${className}` : ""}`}>
      {title && <h3 className="bk-label-head">{title}</h3>}
      <dl>
        {rows.map((r, i) => (
          <div key={i} className={`bk-field${r.long ? " bk-field--long" : ""}${r.value ? "" : " bk-field--empty"}`}>
            <dt>{r.label}</dt>
            <dd>
              <Value text={r.value} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function SpeechIcon() {
  return (
    <svg className="bk-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg className="bk-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M1.5 8s2.4-4.2 6.5-4.2S14.5 8 14.5 8s-2.4 4.2-6.5 4.2S1.5 8 1.5 8z" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="8" cy="8" r="1.9" fill="currentColor" />
      <path d="M2.5 13.5l11-11" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function ReadAloud({ title, text }: { title?: string | undefined; text: string }) {
  return (
    <aside className="bk-readaloud" aria-label={title ? `Read aloud: ${title}` : "Read aloud"}>
      <span className="bk-boxlabel">
        <SpeechIcon /> Read aloud
      </span>
      {title && <h3 className="bk-box-title">{title}</h3>}
      <BookletMarkdown text={text} />
    </aside>
  );
}

function Secret({ title, markdown, rows }: { title: string; markdown?: string | undefined; rows?: FieldRow[] | undefined }) {
  return (
    <aside className="bk-secret" aria-label={`GM only: ${title}`}>
      <span className="bk-boxlabel">
        <EyeOffIcon /> GM only
      </span>
      <h3 className="bk-box-title">{title}</h3>
      {markdown && <BookletMarkdown text={markdown} />}
      {rows && <FieldGrid rows={rows} className="bk-fields--stack" />}
    </aside>
  );
}

function Note({ title, markdown, tips }: { title: string; markdown?: string | undefined; tips?: string[] | undefined }) {
  return (
    <aside className="bk-note" aria-label={`Note: ${title}`}>
      <h3 className="bk-note__title">
        <span>Note:</span> {title}
      </h3>
      {markdown && <BookletMarkdown text={markdown} />}
      {tips && tips.length > 0 && (
        <ul className="bk-note__tips">
          {tips.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      )}
    </aside>
  );
}

function StatLine({ stats }: { stats: Array<{ label: string; value: string }> }) {
  if (!stats.length) return null;
  return (
    <ul className="bk-statline" aria-label="Stats">
      {stats.map((s, i) => (
        <li key={i}>
          <span className="bk-statline__label">{s.label}</span>
          {s.value && <span className="bk-statline__value">{s.value}</span>}
        </li>
      ))}
    </ul>
  );
}

function CastCardView({ card }: { card: CastCard }) {
  return (
    <article className={`bk-card${card.fields.length > 6 ? " bk-card--wide" : ""}`} aria-label={`${card.role}: ${card.name}`}>
      <header className="bk-card__bar">
        <h4>{card.name}</h4>
        <span className="bk-card__role">{card.role}</span>
      </header>
      {card.kind && <p className="bk-card__kind">{card.kind}</p>}
      <StatLine stats={card.stats} />
      {card.fields.length > 0 && (
        <dl className="bk-card__fields">
          {card.fields.map((f, i) => (
            <div key={i}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {card.agendas.length > 0 && (
        <div className="bk-card__agendas">
          <h5>Agendas</h5>
          <ol>
            {card.agendas.map((a) => (
              <li key={a.act}>
                <span className="bk-actnum" aria-label={`Act ${a.act}`}>
                  {a.act}
                </span>
                {a.text}
              </li>
            ))}
          </ol>
        </div>
      )}
    </article>
  );
}

function LocationView({ loc }: { loc: LocationEntry }) {
  return (
    <article className="bk-location" aria-label={`Location: ${loc.name}`}>
      <h3 className="bk-h3">{loc.name}</h3>
      {loc.description && <p className="bk-location__desc">{loc.description}</p>}
      {loc.tables.map((t, i) => (
        <div key={i} className="bk-tablewrap">
          <h4 className="bk-table-title">{t.title}</h4>
          <table className="bk-table bk-table--fields">
            <tbody>
              {t.rows.map((r, j) => (
                <tr key={j}>
                  <th scope="row">{r.label}</th>
                  <td>
                    <Value text={r.value} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </article>
  );
}

function HandoutBox({ h }: { h: HandoutEntry }) {
  return (
    <aside className="bk-handout" aria-label={`Handout: ${h.title}`}>
      <span className="bk-boxlabel">Handout</span>
      <h5>{h.title}</h5>
      {h.body && <BookletMarkdown text={h.body} />}
    </aside>
  );
}

function SceneView({ scene }: { scene: SceneEntry }) {
  const headId = useId();
  return (
    <article className="bk-scene" aria-labelledby={headId}>
      <div className="bk-scene__top">
        <h4 className="bk-scene__head" id={headId}>
          <span className="bk-scene__num">{scene.number}</span>
          <span className="bk-scene__title">{scene.title}</span>
        </h4>
        <span className={`bk-tag${scene.mandatory ? " bk-tag--solid" : ""}`}>{scene.mandatory ? "Mandatory" : "Optional"}</span>
        {scene.facts.length > 0 && (
          <dl className="bk-facts">
            {scene.facts.map((f, i) => (
              <div key={i}>
                <dt>{f.label}</dt>
                <dd>
                  <Value text={f.value} />
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      {scene.readAloud && <ReadAloud text={scene.readAloud} />}
      {scene.body && <BookletMarkdown text={scene.body} className="bk-md bk-scene__body" />}
      {scene.events.length > 0 && (
        <ul className="bk-checklist bk-checklist--events" aria-label={`${scene.title} events`}>
          {scene.events.map((e, i) => (
            <li key={i}>
              <span className="bk-box" aria-hidden="true" />
              {e.text}
              {e.mandatory && <span className="bk-tag bk-tag--solid bk-tag--inline">Mandatory</span>}
            </li>
          ))}
        </ul>
      )}
      {scene.handouts.map((h) => (
        <HandoutBox key={h.id} h={h} />
      ))}
    </article>
  );
}

function MapFigure({ name, deck, n }: { name: string; deck: MapDeckFigure; n: number }) {
  const tall = deck.height > deck.width * 0.9;
  return (
    <figure className={`bk-map${tall ? " bk-map--tall" : ""}`} aria-label={`${name}, ${deck.name}, GM view`}>
      <div className="bk-map__frame" role="img" aria-label={`Site map of ${deck.name} with numbered zones`} dangerouslySetInnerHTML={{ __html: deck.svg }} />
      <figcaption>
        <span className="bk-map__fig">Map {n}</span> {name} · {deck.name} · GM view
      </figcaption>
      {deck.key.length > 0 && (
        <div className="bk-map__key">
          <h3 className="bk-label-head">Zone key</h3>
          <ol>
            {deck.key.map((k) => (
              <li key={k.number} className={k.key ? "is-key" : undefined}>
                <span className="bk-map__n">{k.number}</span> {k.name}
              </li>
            ))}
          </ol>
        </div>
      )}
      {deck.callouts.length > 0 && (
        <div className="bk-map__key bk-map__callouts">
          <h3 className="bk-label-head">Callouts</h3>
          <ul>
            {deck.callouts.map((c) => (
              <li key={c.ref}>
                <span className="bk-map__n">{c.ref}</span> {c.number !== undefined ? `Zone ${c.number}: ` : ""}
                {c.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </figure>
  );
}

function StatBlockView({ b }: { b: StatBlock }) {
  return (
    <article className={`bk-statblock${b.tables.length ? " bk-statblock--wide" : ""}`} aria-label={`Stat block: ${b.name}`}>
      <header>
        <h4>{b.name}</h4>
        <span>{b.kind}</span>
      </header>
      <StatLine stats={b.stats} />
      {b.lines.length > 0 && (
        <dl className="bk-statblock__lines">
          {b.lines.map((l, i) => (
            <div key={i}>
              <dt>{l.label}</dt>
              <dd>{l.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {b.tables.map((t, i) => (
        <div key={i} className="bk-tablewrap">
          <h5 className="bk-table-title">{t.title}</h5>
          <table className="bk-table">
            <thead>
              <tr>
                {t.columns.map((c, j) => (
                  <th key={j} scope="col">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.rows.map((r, j) => (
                <tr key={j}>
                  {r.map((c, k) => (
                    <td key={k}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </article>
  );
}

let mapCounter = 0;

function Block({ block }: { block: BookletBlock }) {
  switch (block.kind) {
    case "lead":
      return <p className="bk-lead">{block.text}</p>;
    case "text":
      return (
        <div className="bk-text">
          {block.title && <h3 className="bk-h3">{block.title}</h3>}
          <BookletMarkdown text={block.markdown} />
        </div>
      );
    case "fields":
      return <FieldGrid rows={block.rows} title={block.title} />;
    case "readAloud":
      return <ReadAloud title={block.title} text={block.text} />;
    case "secret":
      return <Secret title={block.title} markdown={block.markdown} rows={block.rows} />;
    case "note":
      return <Note title={block.title} markdown={block.markdown} tips={block.tips} />;
    case "list":
      return (
        <div className="bk-text">
          <h3 className="bk-h3">{block.title}</h3>
          <ul className="bk-bullets">
            {block.items.map((it, i) => (
              <li key={i}>{it}</li>
            ))}
          </ul>
        </div>
      );
    case "cast":
      return (
        <section className="bk-cast" aria-label={block.title}>
          <h3 className="bk-h3 bk-h3--rule">{block.title}</h3>
          <div className="bk-cards">
            {block.cards.map((c) => (
              <CastCardView key={c.id} card={c} />
            ))}
          </div>
        </section>
      );
    case "locations":
      return (
        <div className="bk-cols bk-locations">
          {block.items.map((l) => (
            <LocationView key={l.id} loc={l} />
          ))}
        </div>
      );
    case "scenes":
      return (
        <section className="bk-scenes" aria-label="Scenes">
          <h3 className="bk-h3 bk-h3--rule">Scenes</h3>
          <div className="bk-cols">
            {block.scenes.map((s) => (
              <SceneView key={s.id} scene={s} />
            ))}
          </div>
        </section>
      );
    case "agendas":
      return (
        <div className="bk-tablewrap">
          <h3 className="bk-table-title">{block.title}</h3>
          <table className="bk-table bk-table--agendas">
            <thead>
              <tr>
                <th scope="col">Character</th>
                <th scope="col">Agenda (hand out as the act begins)</th>
              </tr>
            </thead>
            <tbody>
              {block.rows.map((r, i) => (
                <tr key={i}>
                  <th scope="row">{r.character}</th>
                  <td>{r.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "checklist":
      return (
        <div className="bk-cols bk-checklists">
          {block.groups.map((g, i) => (
            <section key={i} className="bk-checkgroup" aria-label={g.title}>
              <h3 className="bk-h3 bk-h3--rule">{g.title}</h3>
              <ul className="bk-checklist">
                {g.items.map((it, j) => (
                  <li key={j}>
                    <span className="bk-box" aria-hidden="true" />
                    <span>
                      {it.text}
                      {it.note && <span className="bk-checklist__note">{it.note}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      );
    case "map":
      return (
        <>
          {block.decks.map((d) => (
            <MapFigure key={d.deckId} name={block.name} deck={d} n={++mapCounter} />
          ))}
          {block.note && <p className="bk-small">{block.note}</p>}
        </>
      );
    case "statBlocks":
      return (
        <section aria-label={block.title}>
          <h3 className="bk-h3 bk-h3--rule">{block.title}</h3>
          <div className="bk-statblocks">
            {block.items
              .filter((b) => !b.tables.length)
              .map((b) => (
                <StatBlockView key={b.id} b={b} />
              ))}
          </div>
          {block.items
            .filter((b) => b.tables.length)
            .map((b) => (
              <StatBlockView key={b.id} b={b} />
            ))}
        </section>
      );
    case "handouts":
      return (
        <div className="bk-tablewrap">
          <h3 className="bk-table-title">{block.title}</h3>
          <table className="bk-table bk-table--handouts">
            <thead>
              <tr>
                <th scope="col">Handout</th>
                <th scope="col">Kind</th>
                <th scope="col">For</th>
                <th scope="col">Where</th>
              </tr>
            </thead>
            <tbody>
              {block.items.map((h) => (
                <tr key={h.id}>
                  <td>{h.title}</td>
                  <td>{h.kind}</td>
                  <td>{h.character ?? "Everyone"}</td>
                  <td>{h.where}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

/** Blocks laid out per section kind: the act's pacing note and agendas side by side, the rest in order. */
function SectionBody({ section }: { section: BookletSection }) {
  const blocks = section.blocks;
  if (section.kind === "overview" || section.kind === "epilogue") {
    return (
      <div className="bk-cols">
        {blocks.map((b, i) => (
          <Block key={i} block={b} />
        ))}
      </div>
    );
  }
  return (
    <>
      {blocks.map((b, i) => (
        <Block key={i} block={b} />
      ))}
    </>
  );
}

const sectionHeader = (s: BookletSection) => (s.eyebrow ? `${s.eyebrow} · ${s.title}` : s.title);

function TitlePage({ doc }: { doc: BookletDocument }) {
  const t = doc.title;
  return (
    <section className="bk-sheet bk-titlepage bk-title" aria-labelledby="bk-title-heading">
      <p className="bk-titlepage__for">{t.forLine}</p>
      <h1 id="bk-title-heading" className="bk-titlepage__title">
        {t.title}
      </h1>
      <div className="bk-titlepage__rule" aria-hidden="true" />
      {t.tagline && <p className="bk-titlepage__tagline">{t.tagline}</p>}
      {t.premise && <p className="bk-titlepage__premise">{t.premise}</p>}
      {t.facts.length > 0 && (
        <section className="bk-keyfacts" aria-label="Key facts">
          <h2 className="bk-label-head">At a glance</h2>
          <dl>
            {t.facts.map((f, i) => (
              <div key={i} className={f.long ? "bk-keyfacts__long" : undefined}>
                <dt>{f.label}</dt>
                <dd>
                  <Value text={f.value} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      <nav className="bk-contents" aria-label="Contents">
        <h2 className="bk-label-head">Contents</h2>
        <ol>
          {doc.sections.map((s) => (
            <li key={s.id}>
              <a href={`#bk-${s.id}`}>
                {s.eyebrow && <span className="bk-contents__eyebrow">{s.eyebrow}</span>}
                <span className="bk-contents__title">{s.title}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>
      <p className="bk-titlepage__foot">
        For the Game Master only. Keep the agendas and secrets from the players. · {t.system}
      </p>
    </section>
  );
}

function SheetHead({ title, header }: { title: string; header: string }) {
  return (
    <div className="bk-sheet__head" aria-hidden="true">
      <span>{title}</span>
      <span>{header}</span>
    </div>
  );
}

export function BookletPages({ doc }: { doc: BookletDocument }) {
  mapCounter = 0;
  return (
    <article className="prep-booklet" aria-label={`${doc.title.title}: GM booklet`}>
      <TitlePage doc={doc} />
      {doc.sections.map((s, i) => (
        <section key={s.id} id={`bk-${s.id}`} className={`bk-sheet bk-section bk-section--${s.kind} bk-s${i}`} aria-labelledby={`bk-h-${s.id}`} data-section={s.kind}>
          <SheetHead title={doc.title.title} header={sectionHeader(s)} />
          <header className="bk-section__head">
            {s.eyebrow && <p className="bk-eyebrow">{s.eyebrow}</p>}
            <h2 id={`bk-h-${s.id}`} className="bk-h2">
              {s.title}
            </h2>
            {s.summary && <p className="bk-section__summary">{s.summary}</p>}
          </header>
          <SectionBody section={s} />
        </section>
      ))}
    </article>
  );
}

export function BookletView({ adventure, autoPrint = false }: { adventure: Adventure; autoPrint?: boolean }) {
  const ctx = useCampaign();
  const [doc, setDoc] = useState<BookletDocument | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [paper, setPaper] = usePaper();
  useEffect(() => {
    let alive = true;
    bookletDocument(ctx, adventure.id).then(
      (d) => alive && setDoc(d),
      (e: unknown) => alive && setError(errorMessage(e)),
    );
    return () => {
      alive = false;
    };
  }, [ctx, adventure.id, adventure.updated]);
  const pageCss = doc ? bookletPageCss(paper, doc.title.title, doc.sections.map((s, i) => ({ name: `bk-s${i}`, header: sectionHeader(s) }))) : "";
  return (
    <div className="prep-print" data-testid="booklet-view" data-paper={paper} style={paperVars(paper, "booklet")}>
      {doc && <style data-testid="booklet-page-css">{pageCss}</style>}
      <PrintToolbar adventure={adventure} label="booklet" ready={doc !== undefined} auto={autoPrint} paper={paper} onPaper={setPaper} />
      {error && <p className="app-note app-note--warning">{error}</p>}
      {doc === undefined ? <p className="cf-muted">Preparing the booklet…</p> : <BookletPages doc={doc} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// agenda cards
// ---------------------------------------------------------------------------

/** Cards in sheets of four, each act starting a new sheet. */
export function agendaSheets(cards: AgendaCard[], perSheet = 4): AgendaCard[][] {
  const sheets: AgendaCard[][] = [];
  let current: AgendaCard[] = [];
  let act: number | undefined;
  for (const c of cards) {
    if (current.length === perSheet || (act !== undefined && c.actNumber !== act && current.length > 0)) {
      sheets.push(current);
      current = [];
    }
    act = c.actNumber;
    current.push(c);
  }
  if (current.length) sheets.push(current);
  return sheets;
}

function CropMarks() {
  return (
    <>
      <span className="bk-crop bk-crop--tl" aria-hidden="true" />
      <span className="bk-crop bk-crop--tr" aria-hidden="true" />
      <span className="bk-crop bk-crop--bl" aria-hidden="true" />
      <span className="bk-crop bk-crop--br" aria-hidden="true" />
    </>
  );
}

function AgendaCardView({ card, adventureTitle }: { card: AgendaCard; adventureTitle: string }) {
  const name = card.character ?? card.handout.title;
  return (
    <div className="prep-agenda-cell">
      <CropMarks />
      <section className="prep-agenda-card" aria-label={`Act ${card.actNumber} agenda: ${name}`}>
        <header className="prep-agenda-card__bar">
          <span className="prep-agenda-card__act" aria-label={`Act ${card.actNumber}`}>
            <small aria-hidden="true">Act</small>
            <span aria-hidden="true">{card.actNumber}</span>
          </span>
          <h2>{name}</h2>
        </header>
        <p className="prep-agenda-card__title">
          {adventureTitle}
          {card.actTitle ? ` · Act ${card.actNumber}: ${card.actTitle}` : ` · Act ${card.actNumber}`}
        </p>
        <h3 className="prep-agenda-card__label">Your agenda</h3>
        <div className="prep-agenda-card__body">{card.body.trim() ? <BookletMarkdown text={card.body} /> : <span className="bk-writein bk-writein--lines" aria-label="blank, to fill in" />}</div>
        <div className="prep-agenda-card__notes">
          <span>Notes</span>
        </div>
        <footer>
          <EyeOffIcon />
          <span>Secret: for this player only</span>
        </footer>
      </section>
    </div>
  );
}

export function AgendaCardsView({ adventure, autoPrint = false }: { adventure: Adventure; autoPrint?: boolean }) {
  const ctx = useCampaign();
  const [cards, setCards] = useState<AgendaCard[] | undefined>();
  const [paper, setPaper] = usePaper();
  useEffect(() => {
    let alive = true;
    void agendaCards(ctx, adventure.id).then((c) => alive && setCards(c));
    return () => {
      alive = false;
    };
  }, [ctx, adventure.id, adventure.updated]);
  const sheets = cards ? agendaSheets(cards) : [];
  return (
    <div className="prep-print prep-print--cards" data-testid="agenda-cards" data-paper={paper} style={paperVars(paper, "cards")}>
      <style>{cardsPageCss(paper)}</style>
      <PrintToolbar adventure={adventure} label="agenda cards" ready={cards !== undefined} auto={autoPrint} paper={paper} onPaper={setPaper} />
      <h1 className="bk-sr-only">{adventure.title}: agenda cards</h1>
      {cards === undefined ? (
        <p className="cf-muted">Preparing the cards…</p>
      ) : cards.length === 0 ? (
        <p className="cf-muted">This adventure has no agenda handouts. Add them in an act.</p>
      ) : (
        <div className="prep-cards">
          {sheets.map((sheet, i) => (
            <Fragment key={i}>
              <section className="bk-sheet prep-cards__sheet" aria-label={`Card sheet ${i + 1} of ${sheets.length}`}>
                {sheet.map((c) => (
                  <AgendaCardView key={c.handout.id} card={c} adventureTitle={adventure.title} />
                ))}
              </section>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
