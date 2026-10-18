/**
 * Rich-text bodies: one Y.Doc per body id, holding a Y.XmlFragment named
 * "body" in the shape y-prosemirror produces (Tiptap compatible):
 *
 *   paragraph, heading(level), bulletList, orderedList(start), listItem,
 *   blockquote, hardBreak, text runs (Y.XmlText with `bold`/`italic`/`code`
 *   formatting), and inline reference nodes `entityRef` / `mention` / `ref`
 *   with an `id` (or `data-id`) attribute and an optional `label`.
 *
 * Markdown round trip renders references as `[[id|name]]`.
 */
import * as Y from "yjs";
import type { Id } from "./types";

export const BODY_FRAGMENT = "body";
export const REF_NODE = "entityRef";
const REF_NODE_NAMES = new Set(["entityRef", "mention", "ref"]);

export type RegistryListener = (id: Id, doc: Y.Doc) => void;
export type DocLoader = (id: Id, doc: Y.Doc) => Promise<void>;

/** Open rich-text documents, cached by id. */
export class RichTextRegistry {
  readonly #docs = new Map<Id, Y.Doc>();
  readonly #onOpen = new Set<RegistryListener>();
  readonly #onClose = new Set<RegistryListener>();
  readonly #ready = new Map<Id, Promise<void>>();
  #loader: DocLoader | undefined;

  open(id: Id): Y.Doc {
    const existing = this.#docs.get(id);
    if (existing) return existing;
    const doc = new Y.Doc({ guid: id });
    this.#docs.set(id, doc);
    for (const l of [...this.#onOpen]) l(id, doc);
    if (this.#loader) this.#ready.set(id, this.#loader(id, doc));
    return doc;
  }

  peek(id: Id): Y.Doc | undefined {
    return this.#docs.get(id);
  }

  has(id: Id): boolean {
    return this.#docs.has(id);
  }

  ids(): Id[] {
    return [...this.#docs.keys()];
  }

  close(id: Id): void {
    const doc = this.#docs.get(id);
    if (!doc) return;
    this.#docs.delete(id);
    this.#ready.delete(id);
    for (const l of [...this.#onClose]) l(id, doc);
    doc.destroy();
  }

  closeAll(): void {
    for (const id of this.ids()) this.close(id);
  }

  /** Called with every newly opened doc (persistence attaches here). */
  onOpen(listener: RegistryListener): () => void {
    this.#onOpen.add(listener);
    return () => {
      this.#onOpen.delete(listener);
    };
  }

  onClose(listener: RegistryListener): () => void {
    this.#onClose.add(listener);
    return () => {
      this.#onClose.delete(listener);
    };
  }

  /**
   * Install a loader that resolves once a doc's stored content is present.
   * `whenReady(id)` then waits for it; without a loader docs are ready at once.
   */
  setLoader(loader: DocLoader | undefined): void {
    this.#loader = loader;
  }

  whenReady(id: Id): Promise<void> {
    this.open(id);
    return this.#ready.get(id) ?? Promise.resolve();
  }
}

export function bodyOf(doc: Y.Doc): Y.XmlFragment {
  return doc.getXmlFragment(BODY_FRAGMENT);
}

// ---------------------------------------------------------------------------
// walking
// ---------------------------------------------------------------------------

type XmlNode = Y.XmlElement | Y.XmlText | Y.XmlHook;

function attr(el: Y.XmlElement, name: string): string | undefined {
  const v = el.getAttribute(name) as unknown;
  if (v === undefined || v === null) return undefined;
  return String(v);
}

function refId(el: Y.XmlElement): string | undefined {
  if (!REF_NODE_NAMES.has(el.nodeName)) return undefined;
  return attr(el, "id") ?? attr(el, "data-id");
}

function refLabel(el: Y.XmlElement): string | undefined {
  return attr(el, "label") ?? attr(el, "data-label") ?? attr(el, "name");
}

/** Ids referenced by entityRef/mention nodes, unique, in document order. */
export function extractRefs(doc: Y.Doc): Id[] {
  const out: Id[] = [];
  const seen = new Set<string>();
  const visit = (node: XmlNode) => {
    if (node instanceof Y.XmlElement) {
      const id = refId(node);
      if (id !== undefined && !seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
      for (const child of node.toArray()) visit(child);
    } else if (node instanceof Y.XmlText) {
      for (const op of node.toDelta() as Array<{ insert: unknown }>) {
        if (op.insert instanceof Y.XmlElement) visit(op.insert);
      }
    }
  };
  for (const child of bodyOf(doc).toArray()) visit(child);
  return out;
}

interface Inline {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  ref?: { id: string; label?: string };
  hardBreak?: boolean;
}

function inlinesOf(el: Y.XmlElement): Inline[] {
  const out: Inline[] = [];
  const pushElement = (child: Y.XmlElement) => {
    const id = refId(child);
    if (id !== undefined) {
      const label = refLabel(child);
      out.push({ text: label ?? id, ref: label !== undefined ? { id, label } : { id } });
    } else if (child.nodeName === "hardBreak" || child.nodeName === "hard_break" || child.nodeName === "br") {
      out.push({ text: "\n", hardBreak: true });
    } else {
      out.push(...inlinesOf(child));
    }
  };
  for (const child of el.toArray()) {
    if (child instanceof Y.XmlText) {
      for (const op of child.toDelta() as Array<{ insert: unknown; attributes?: Record<string, unknown> }>) {
        if (typeof op.insert === "string") {
          const a = op.attributes ?? {};
          const run: Inline = { text: op.insert };
          if (a["bold"] || a["strong"]) run.bold = true;
          if (a["italic"] || a["em"]) run.italic = true;
          if (a["code"]) run.code = true;
          out.push(run);
        } else if (op.insert instanceof Y.XmlElement) {
          pushElement(op.insert);
        }
      }
    } else if (child instanceof Y.XmlElement) {
      pushElement(child);
    }
  }
  return out;
}

function isBlockContainer(el: Y.XmlElement): boolean {
  return el.toArray().some((c) => c instanceof Y.XmlElement && BLOCK_NAMES.has(c.nodeName));
}

const BLOCK_NAMES = new Set(["paragraph", "heading", "bulletList", "orderedList", "listItem", "blockquote", "bullet_list", "ordered_list", "list_item"]);

/** Plain text, blocks separated by newlines; references render as their label or id. */
export function plainText(doc: Y.Doc): string {
  const lines: string[] = [];
  const visit = (node: XmlNode) => {
    if (!(node instanceof Y.XmlElement)) {
      if (node instanceof Y.XmlText) lines.push(node.toString());
      return;
    }
    if (isBlockContainer(node)) {
      for (const child of node.toArray()) visit(child);
    } else {
      lines.push(
        inlinesOf(node)
          .map((i) => i.text)
          .join(""),
      );
    }
  };
  for (const child of bodyOf(doc).toArray()) visit(child);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// to Markdown
// ---------------------------------------------------------------------------

export type ResolveName = (id: Id) => string;

function escapeMd(text: string): string {
  // Underscores inside a word (snake_case) are literal in Markdown; only escape
  // the ones the parser would read as emphasis.
  return text
    .replace(/([*`\\[\]])/g, "\\$1")
    .replace(/(?<![A-Za-z0-9_])_(?=[^\s_])|(?<=[^\s_])_(?![A-Za-z0-9_])/g, "\\_");
}

function inlineMarkdown(inlines: Inline[], resolveName: ResolveName): string {
  let out = "";
  for (const run of inlines) {
    if (run.ref) {
      const name = resolveName(run.ref.id) || run.ref.label || run.ref.id;
      out += `[[${run.ref.id}|${name}]]`;
      continue;
    }
    if (run.hardBreak) {
      out += "  \n";
      continue;
    }
    let text = run.code ? `\`${run.text}\`` : escapeMd(run.text);
    if (run.bold && run.italic) text = `***${text}***`;
    else if (run.bold) text = `**${text}**`;
    else if (run.italic) text = `*${text}*`;
    out += text;
  }
  return out;
}

function blockMarkdown(el: Y.XmlElement, resolveName: ResolveName): string {
  switch (el.nodeName) {
    case "heading": {
      const level = Math.min(6, Math.max(1, Number(attr(el, "level") ?? 1) || 1));
      return `${"#".repeat(level)} ${inlineMarkdown(inlinesOf(el), resolveName)}`;
    }
    case "paragraph":
      return inlineMarkdown(inlinesOf(el), resolveName);
    case "bulletList":
    case "bullet_list":
      return listMarkdown(el, resolveName, () => "- ");
    case "orderedList":
    case "ordered_list": {
      const start = Number(attr(el, "start") ?? 1) || 1;
      return listMarkdown(el, resolveName, (i) => `${start + i}. `);
    }
    case "blockquote": {
      const inner = blocksMarkdown(el.toArray(), resolveName);
      return inner
        .split("\n")
        .map((l) => (l.length ? `> ${l}` : ">"))
        .join("\n");
    }
    case "listItem":
    case "list_item":
      return blocksMarkdown(el.toArray(), resolveName);
    case "horizontalRule":
    case "horizontal_rule":
      return "---";
    default:
      if (isBlockContainer(el)) return blocksMarkdown(el.toArray(), resolveName);
      return inlineMarkdown(inlinesOf(el), resolveName);
  }
}

function listMarkdown(list: Y.XmlElement, resolveName: ResolveName, marker: (i: number) => string): string {
  const items: string[] = [];
  let i = 0;
  for (const item of list.toArray()) {
    if (!(item instanceof Y.XmlElement)) continue;
    const m = marker(i++);
    const pad = " ".repeat(m.length);
    const body = blockMarkdown(item, resolveName);
    // Inside a list item blocks are separated by a single newline so the
    // nested list stays attached to its item.
    const lines = body.split("\n").filter((l, idx, arr) => !(l === "" && idx > 0 && arr[idx - 1] === ""));
    const compact = lines.filter((l) => l !== "");
    items.push(compact.map((l, idx) => (idx === 0 ? m + l : pad + l)).join("\n"));
  }
  return items.join("\n");
}

function blocksMarkdown(nodes: XmlNode[], resolveName: ResolveName): string {
  const parts: string[] = [];
  for (const node of nodes) {
    if (node instanceof Y.XmlElement) parts.push(blockMarkdown(node, resolveName));
    else if (node instanceof Y.XmlText) parts.push(node.toString());
  }
  return parts.join("\n\n");
}

export function toMarkdown(doc: Y.Doc, resolveName: ResolveName = (id) => id): string {
  return blocksMarkdown(bodyOf(doc).toArray(), resolveName);
}

// ---------------------------------------------------------------------------
// from Markdown
// ---------------------------------------------------------------------------

// `_` toggles italics only at a word edge, so snake_case text stays literal.
const INLINE_TOKEN = /(\[\[[^\]]+\]\]|\*\*\*|\*\*|\*|(?<![A-Za-z0-9_])_(?=[^\s_])|(?<=[^\s_])_(?![A-Za-z0-9_])|`[^`]*`|\\[*_`\\[\]]|\n)/;

function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let bold = false;
  let italic = false;
  const push = (t: string) => {
    if (!t) return;
    const run: Inline = { text: t };
    if (bold) run.bold = true;
    if (italic) run.italic = true;
    out.push(run);
  };
  for (const tok of text.split(INLINE_TOKEN)) {
    if (tok === undefined || tok === "") continue;
    if (tok === "***") {
      bold = !bold;
      italic = !italic;
    } else if (tok === "**") bold = !bold;
    else if (tok === "*" || tok === "_") italic = !italic;
    else if (tok === "\n") out.push({ text: "\n", hardBreak: true });
    else if (tok.startsWith("[[") && tok.endsWith("]]")) {
      const inner = tok.slice(2, -2);
      const bar = inner.indexOf("|");
      const id = bar >= 0 ? inner.slice(0, bar) : inner;
      const label = bar >= 0 ? inner.slice(bar + 1) : undefined;
      out.push({ text: label ?? id, ref: label !== undefined ? { id, label } : { id } });
    } else if (tok.startsWith("`") && tok.endsWith("`") && tok.length >= 2) {
      out.push({ text: tok.slice(1, -1), code: true });
    } else if (tok.startsWith("\\") && tok.length === 2) push(tok.slice(1));
    else push(tok);
  }
  return out;
}

type InsertableNode = Y.XmlElement | Y.XmlText;

function inlineNodes(inlines: Inline[]): InsertableNode[] {
  const nodes: InsertableNode[] = [];
  // Consecutive text runs become one Y.XmlText. The delta is applied in one
  // go because an unintegrated Y.Text has length 0 until it joins a doc.
  let delta: Array<{ insert: string; attributes?: Record<string, unknown> }> = [];
  const flush = () => {
    if (!delta.length) return;
    const text = new Y.XmlText();
    text.applyDelta(delta);
    nodes.push(text);
    delta = [];
  };
  for (const run of inlines) {
    if (run.ref) {
      flush();
      const el = new Y.XmlElement(REF_NODE);
      el.setAttribute("id", run.ref.id);
      if (run.ref.label !== undefined) el.setAttribute("label", run.ref.label);
      nodes.push(el);
    } else if (run.hardBreak) {
      flush();
      nodes.push(new Y.XmlElement("hardBreak"));
    } else {
      const attrs: Record<string, unknown> = {};
      if (run.bold) attrs["bold"] = {};
      if (run.italic) attrs["italic"] = {};
      if (run.code) attrs["code"] = {};
      delta.push(Object.keys(attrs).length ? { insert: run.text, attributes: attrs } : { insert: run.text });
    }
  }
  flush();
  return nodes;
}

function element(name: string, children: InsertableNode[], attrs?: Record<string, string | number>): Y.XmlElement {
  const el = new Y.XmlElement(name);
  if (attrs) for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v as string);
  if (children.length) el.insert(0, children);
  return el;
}

const LIST_LINE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

function parseBlocks(lines: string[]): Y.XmlElement[] {
  const blocks: Y.XmlElement[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] as string;
    if (line.trim() === "") {
      i++;
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push(element("heading", inlineNodes(parseInline(heading[2] ?? "")), { level: heading[1]?.length ?? 1 }));
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push(element("horizontalRule", []));
      i++;
      continue;
    }
    if (line.startsWith(">")) {
      const inner: string[] = [];
      while (i < lines.length && (lines[i] as string).startsWith(">")) {
        inner.push((lines[i] as string).replace(/^>\s?/, ""));
        i++;
      }
      blocks.push(element("blockquote", parseBlocks(inner)));
      continue;
    }
    if (LIST_LINE.test(line)) {
      const listLines: string[] = [];
      while (i < lines.length && (lines[i] as string).trim() !== "") {
        listLines.push(lines[i] as string);
        i++;
      }
      blocks.push(...parseList(listLines));
      continue;
    }
    // paragraph: consecutive non-blank, non-block lines
    const para: string[] = [];
    while (i < lines.length) {
      const l = lines[i] as string;
      if (l.trim() === "" || /^#{1,6}\s/.test(l) || l.startsWith(">") || LIST_LINE.test(l)) break;
      para.push(l);
      i++;
    }
    const joined = para
      .map((l, idx) => {
        if (idx === para.length - 1) return l.replace(/\s+$/, "");
        return l.endsWith("  ") ? l.replace(/\s+$/, "") + "\n" : l.replace(/\s+$/, "") + " ";
      })
      .join("");
    blocks.push(element("paragraph", inlineNodes(parseInline(joined))));
  }
  return blocks;
}

function parseList(lines: string[]): Y.XmlElement[] {
  // Group lines into items at the indentation of the first line; deeper
  // lines belong to the current item (nested lists or continuation).
  const first = LIST_LINE.exec(lines[0] as string);
  const baseIndent = first ? (first[1] ?? "").length : 0;
  const ordered = first ? /^\d/.test(first[2] ?? "") : false;
  const start = first && ordered ? parseInt(first[2] ?? "1", 10) : 1;
  const items: Array<{ head: string; rest: string[] }> = [];
  for (const line of lines) {
    const m = LIST_LINE.exec(line);
    if (m && (m[1] ?? "").length <= baseIndent) {
      items.push({ head: m[3] ?? "", rest: [] });
    } else {
      const item = items[items.length - 1];
      if (item) item.rest.push(line.slice(Math.min(line.length, baseIndent + 2)));
      else items.push({ head: line.trim(), rest: [] });
    }
  }
  const listItems = items.map((item) => {
    const children: Y.XmlElement[] = [];
    // continuation lines that are not nested lists join the head paragraph
    const nested: string[] = [];
    const cont: string[] = [];
    for (const l of item.rest) {
      if (LIST_LINE.test(l) || nested.length) nested.push(l);
      else cont.push(l);
    }
    const headText = [item.head, ...cont].map((l) => l.replace(/\s+$/, "")).join(" ");
    children.push(element("paragraph", inlineNodes(parseInline(headText))));
    if (nested.length) children.push(...parseList(nested.map((l) => l.replace(/^\s{0,2}/, ""))));
    return element("listItem", children);
  });
  const attrs: Record<string, number> = {};
  if (ordered && start !== 1) attrs["start"] = start;
  return [element(ordered ? "orderedList" : "bulletList", listItems, attrs)];
}

/** Replace the body of `doc` with the parsed Markdown. Refs `[[id|name]]` become entityRef nodes. */
export function fromMarkdown(doc: Y.Doc, markdown: string): void {
  const body = bodyOf(doc);
  const blocks = parseBlocks(markdown.replace(/\r\n?/g, "\n").split("\n"));
  doc.transact(() => {
    if (body.length > 0) body.delete(0, body.length);
    if (blocks.length) body.insert(0, blocks);
  });
}

/** Convenience: build a fresh body from Markdown and return it. */
export function docFromMarkdown(markdown: string, id?: Id): Y.Doc {
  const doc = id ? new Y.Doc({ guid: id }) : new Y.Doc();
  fromMarkdown(doc, markdown);
  return doc;
}
