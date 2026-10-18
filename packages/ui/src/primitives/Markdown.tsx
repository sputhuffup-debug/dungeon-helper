import type { ReactNode } from "react";
import { cx } from "../sheet/paths";

/**
 * A tiny Markdown renderer for rule summaries: paragraphs, bold, italic,
 * inline code, links, bullet and numbered lists. No HTML passthrough.
 */
export function Markdown({ text, className }: { text: string; className?: string }) {
  return <div className={cx("cf-md", className)}>{renderBlocks(text)}</div>;
}

function renderBlocks(text: string): ReactNode[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let key = 0;

  const flushPara = () => {
    if (para.length) {
      out.push(<p key={key++}>{renderInline(para.join(" "))}</p>);
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const items = list.items.map((it, i) => <li key={i}>{renderInline(it)}</li>);
      out.push(list.ordered ? <ol key={key++}>{items}</ol> : <ul key={key++}>{items}</ul>);
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flushPara();
      const ordered = !!numbered;
      const item = (bullet?.[1] ?? numbered?.[1] ?? "").trim();
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push(item);
      continue;
    }
    if (line.trim() === "") {
      flushPara();
      flushList();
      continue;
    }
    const heading = /^\s*#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      flushPara();
      flushList();
      out.push(<strong key={key++} style={{ display: "block" }}>{renderInline(heading[1] ?? "")}</strong>);
      continue;
    }
    if (list) flushList();
    para.push(line.trim());
  }
  flushPara();
  flushList();
  return out;
}

const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\[[^\]]+\]\([^)]+\)|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;

export function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(INLINE)) {
    const idx = m.index ?? 0;
    if (idx > last) parts.push(text.slice(last, idx));
    const tok = m[0];
    if (tok.startsWith("**") || tok.startsWith("__")) parts.push(<strong key={key++}>{renderInline(tok.slice(2, -2))}</strong>);
    else if (tok.startsWith("`")) parts.push(<code key={key++}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("[")) {
      const lm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok);
      const href = lm?.[2] ?? "#";
      const safe = /^(https?:|mailto:|#|\/)/i.test(href) ? href : "#";
      parts.push(
        <a key={key++} href={safe} target={safe.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
          {lm?.[1] ?? tok}
        </a>,
      );
    } else parts.push(<em key={key++}>{renderInline(tok.slice(1, -1))}</em>);
    last = idx + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
