/**
 * The campaign's rich-text editor: Tiptap bound to a rich-text Y.Doc from
 * the registry. It waits for the doc's stored content before binding, so a
 * fresh editor never writes an empty paragraph ahead of the loaded body.
 */
import type { Id } from "@campaign-forge/core";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRecordLinks } from "../components/EntityLinkContext";
import { createEntity } from "../state/actions";
import { useCampaign } from "../state/hooks";
import { editorExtensions } from "./extensions";
import { MentionController } from "./mention";
import { MentionPopup } from "./MentionPopup";

export interface RichTextEditorProps {
  docId: Id;
  placeholder?: string;
  readOnly?: boolean;
  className?: string;
  /** Accessible name of the editing surface. */
  label?: string;
  autoFocus?: boolean;
}

export function RichTextEditor(props: RichTextEditorProps) {
  const { whenDocSynced } = useCampaign();
  const [readyFor, setReadyFor] = useState<Id | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    const done = () => {
      if (alive) setReadyFor(props.docId);
    };
    whenDocSynced(props.docId).then(done, done);
    return () => {
      alive = false;
    };
  }, [props.docId, whenDocSynced]);
  if (readyFor !== props.docId) {
    return (
      <div className={`cf-editor cf-editor--loading ${props.className ?? ""}`} aria-busy="true">
        <span className="cf-muted">Loading…</span>
      </div>
    );
  }
  return <BoundEditor key={props.docId} {...props} />;
}

/** Read-only rendering of a rich-text body (entity refs stay clickable). */
export function RichTextView({ docId, className, placeholder }: { docId: Id; className?: string; placeholder?: string }) {
  return <RichTextEditor docId={docId} readOnly className={className} placeholder={placeholder} />;
}

function BoundEditor({ docId, placeholder, readOnly = false, className, label, autoFocus }: RichTextEditorProps) {
  const ctx = useCampaign();
  const links = useRecordLinks();
  const linksRef = useRef(links);
  linksRef.current = links;

  const controller = useMemo(
    () =>
      new MentionController({
        search: (query) => {
          if (!query) {
            return ctx.store
              .list("entities")
              .sort((a, b) => (a.updated < b.updated ? 1 : -1))
              .slice(0, 8)
              .map((e) => ({ id: e.id, name: e.name, type: e.type }));
          }
          return ctx.search.search(query, { kinds: ["entity"], limit: 8 }).map((h) => ({ id: h.id, name: h.name, type: h.type }));
        },
        types: () =>
          ctx.module.forMode(ctx.store.meta().mode).entityTypes.map((t) => ({ id: t.id, name: t.name, icon: t.icon, kind: t.kind })),
        create: (name, typeId) => {
          const entity = createEntity(ctx, { type: typeId, name });
          return { id: entity.id, label: entity.name };
        },
      }),
    [ctx],
  );

  const doc = useMemo(() => ctx.registry.open(docId), [ctx.registry, docId]);

  const editor = useEditor(
    {
      extensions: editorExtensions({
        doc,
        controller: readOnly ? undefined : controller,
        ref: {
          resolve: (id) => {
            const e = ctx.store.get("entities", id);
            if (!e) return { missing: true };
            const def = ctx.module.entityType(e.type);
            return { name: e.name, icon: def?.icon, kind: def?.kind };
          },
          subscribe: (id, onChange) => ctx.store.subscribeRecord("entities", id, () => onChange()),
          onOpen: (id) => linksRef.current.openEntity(id),
        },
      }),
      editable: !readOnly,
      autofocus: autoFocus ? "end" : false,
      editorProps: {
        attributes: {
          class: "cf-editor__content",
          role: "textbox",
          "aria-multiline": "true",
          "aria-label": label ?? "Rich text",
          ...(readOnly ? { "aria-readonly": "true" } : {}),
        },
      },
    },
    [doc, readOnly],
  );

  const isEmpty = useEditorState({ editor, selector: ({ editor: e }) => e?.isEmpty ?? true });

  const typeInfo = (typeId: string | undefined) => {
    const def = typeId ? ctx.module.entityType(typeId) : undefined;
    return { name: def?.name, icon: def?.icon, kind: def?.kind };
  };

  return (
    <div className={`cf-editor${readOnly ? " cf-editor--readonly" : ""} ${className ?? ""}`} data-doc-id={docId}>
      {!readOnly && editor && <EditorToolbar editor={editor} />}
      <div className="cf-editor__surface">
        {isEmpty && placeholder && <div className="cf-editor__placeholder">{placeholder}</div>}
        <EditorContent editor={editor} />
      </div>
      {!readOnly && <MentionPopup controller={controller} typeInfo={typeInfo} />}
    </div>
  );
}

function EditorToolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
    }),
  });
  const btn = (label: string, text: string, active: boolean, run: () => void) => (
    <button
      type="button"
      className={`cf-editor__btn${active ? " is-active" : ""}`}
      aria-label={label}
      title={label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
    >
      {text}
    </button>
  );
  const chain = () => editor.chain().focus();
  return (
    <div className="cf-editor__toolbar" role="toolbar" aria-label="Formatting">
      {btn("Bold", "B", state.bold, () => chain().toggleBold().run())}
      {btn("Italic", "I", state.italic, () => chain().toggleItalic().run())}
      {btn("Heading 2", "H2", state.h2, () => chain().toggleHeading({ level: 2 }).run())}
      {btn("Heading 3", "H3", state.h3, () => chain().toggleHeading({ level: 3 }).run())}
      {btn("Bullet list", "•", state.bullet, () => chain().toggleBulletList().run())}
      {btn("Numbered list", "1.", state.ordered, () => chain().toggleOrderedList().run())}
      {btn("Quote", "❝", state.quote, () => chain().toggleBlockquote().run())}
      <span className="cf-editor__hint cf-muted">Type @ to link an entity</span>
    </div>
  );
}
