import { BODY_FRAGMENT } from "@campaign-forge/core";
import type { Extensions } from "@tiptap/core";
import Collaboration from "@tiptap/extension-collaboration";
import StarterKit from "@tiptap/starter-kit";
import type * as Y from "yjs";
import { EntityRef, type EntityRefOptions } from "./EntityRef";
import { EntityMention, type MentionController } from "./mention";

export interface EditorExtensionOptions {
  /** The rich-text Y.Doc; the editor binds to its "body" fragment. */
  doc: Y.Doc;
  controller?: MentionController;
  ref?: Partial<EntityRefOptions>;
}

/** StarterKit (history replaced by the Yjs undo manager) + Collaboration + entity refs + `@` mentions. */
export function editorExtensions({ doc, controller, ref }: EditorExtensionOptions): Extensions {
  return [
    StarterKit.configure({ undoRedo: false, link: false, underline: false, codeBlock: false, horizontalRule: false, strike: false }),
    Collaboration.configure({ document: doc, field: BODY_FRAGMENT }),
    EntityRef.configure(ref ?? {}),
    EntityMention.configure({ controller: controller ?? null }),
  ];
}
