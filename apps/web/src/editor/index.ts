/**
 * Rich-text editor. The components load the Tiptap chunk on first render
 * (see LazyEditor.tsx); the extensions, mention controller and entity-ref
 * node are imported from their own files by the code that needs them.
 */
export { RichTextEditor, RichTextView } from "./LazyEditor";
export type { RichTextEditorProps } from "./RichTextEditor";
