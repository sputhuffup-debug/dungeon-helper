/**
 * Print-styled views of an adventure: the booklet (core Markdown export,
 * rendered) and the agenda cards (one card per agenda handout). They stand in
 * for PDF in v1: the GM prints them, or saves them as PDF from the browser.
 */
import type { Adventure } from "@campaign-forge/core";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, renderInline } from "../../components/ui";
import { errorMessage } from "../../lib/format";
import { useCampaign } from "../../state/hooks";
import { agendaCards, bookletMarkdown, type AgendaCard } from "./booklet";

/** Renders the Markdown the core exporter writes: headings, quotes, task and plain lists, paragraphs. */
export function BookletMarkdown({ text }: { text: string }) {
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
        <blockquote key={key++} className="prep-booklet__readaloud">
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
        <li key={i} className={it.check !== undefined ? "prep-booklet__task" : undefined}>
          {it.check !== undefined && <span aria-hidden="true">{it.check ? "☑ " : "☐ "}</span>}
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
      const level = Math.min(4, (h[1] ?? "#").length);
      const content = renderInline(h[2] ?? "");
      out.push(level === 1 ? <h1 key={key++}>{content}</h1> : level === 2 ? <h2 key={key++}>{content}</h2> : level === 3 ? <h3 key={key++}>{content}</h3> : <h4 key={key++}>{content}</h4>);
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
  return <div className="prep-booklet__md">{out}</div>;
}

function PrintToolbar({ adventure, label, ready, auto }: { adventure: Adventure; label: string; ready: boolean; auto: boolean }) {
  const ctx = useCampaign();
  const printed = useRef(false);
  useEffect(() => {
    if (ready && auto && !printed.current) {
      printed.current = true;
      // let the browser lay the page out first
      const t = setTimeout(() => window.print(), 150);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [ready, auto]);
  return (
    <div className="app-row prep-print__toolbar">
      <Link to="/c/$campaignId/adventures/$adventureId" params={{ campaignId: ctx.campaignId, adventureId: adventure.id }} search={{}} className="cf-btn">
        ← Back to the builder
      </Link>
      <Button variant="primary" onClick={() => window.print()} disabled={!ready}>
        Print {label}
      </Button>
      <span className="cf-muted">Use the browser's “Save as PDF” to keep a PDF.</span>
    </div>
  );
}

export function BookletView({ adventure, autoPrint = false }: { adventure: Adventure; autoPrint?: boolean }) {
  const ctx = useCampaign();
  const [md, setMd] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  useEffect(() => {
    let alive = true;
    bookletMarkdown(ctx, adventure.id).then(
      (m) => alive && setMd(m),
      (e: unknown) => alive && setError(errorMessage(e)),
    );
    return () => {
      alive = false;
    };
  }, [ctx, adventure.id, adventure.updated]);
  return (
    <div className="prep-print" data-testid="booklet-view">
      <PrintToolbar adventure={adventure} label="booklet" ready={md !== undefined} auto={autoPrint} />
      {error && <p className="app-note app-note--warning">{error}</p>}
      {md === undefined ? <p className="cf-muted">Preparing the booklet…</p> : <article className="prep-booklet">{<BookletMarkdown text={md} />}</article>}
    </div>
  );
}

export function AgendaCardsView({ adventure, autoPrint = false }: { adventure: Adventure; autoPrint?: boolean }) {
  const ctx = useCampaign();
  const [cards, setCards] = useState<AgendaCard[] | undefined>();
  useEffect(() => {
    let alive = true;
    void agendaCards(ctx, adventure.id).then((c) => alive && setCards(c));
    return () => {
      alive = false;
    };
  }, [ctx, adventure.id, adventure.updated]);
  return (
    <div className="prep-print" data-testid="agenda-cards">
      <PrintToolbar adventure={adventure} label="agenda cards" ready={cards !== undefined} auto={autoPrint} />
      {cards === undefined ? (
        <p className="cf-muted">Preparing the cards…</p>
      ) : cards.length === 0 ? (
        <p className="cf-muted">This adventure has no agenda handouts. Add them in an act.</p>
      ) : (
        <div className="prep-cards">
          {cards.map((c) => (
            <section key={c.handout.id} className="prep-agenda-card">
              <header>
                <span className="prep-agenda-card__act">
                  Act {c.actNumber}
                  {c.actTitle ? ` · ${c.actTitle}` : ""}
                </span>
                <h2>{c.character ?? c.handout.title}</h2>
                {c.character && <span className="prep-agenda-card__title">{c.handout.title}</span>}
              </header>
              <BookletMarkdown text={c.body || "_No agenda written yet._"} />
              <footer>{adventure.title} · secret, for this player only</footer>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
