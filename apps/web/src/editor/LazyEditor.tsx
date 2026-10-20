/**
 * The rich-text editor's public face. Tiptap and ProseMirror are the largest
 * code in the app, so the real editor (`RichTextEditor.tsx`) loads the first
 * time an editor or a read-only view renders, not with the page around it.
 * The PWA precaches the chunk, so this works offline too.
 */
import { lazyView } from "../components/lazyView";
import { Button } from "../components/ui";
import { errorMessage } from "../lib/format";
import type { RichTextEditorProps } from "./RichTextEditor";

export const RichTextEditor = lazyView<RichTextEditorProps>(() => import("./RichTextEditor").then((m) => m.RichTextEditor), {
  loading: (props) => (
    <div className={`cf-editor cf-editor--loading ${props.className ?? ""}`} aria-busy="true">
      <span className="cf-muted">Loading…</span>
    </div>
  ),
  failed: (error, retry, props) => (
    <div className={`cf-editor cf-editor--loading ${props.className ?? ""}`} role="alert">
      <span className="cf-field__error">Could not load the editor: {errorMessage(error)}</span>{" "}
      <Button size="sm" variant="ghost" onClick={retry}>
        Retry
      </Button>
    </div>
  ),
});

export function RichTextView({ docId, className, placeholder }: { docId: RichTextEditorProps["docId"]; className?: string; placeholder?: string }) {
  return <RichTextEditor docId={docId} readOnly className={className} placeholder={placeholder} />;
}
