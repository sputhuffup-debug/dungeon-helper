/**
 * Same-browser sync between tabs of one campaign (the GM's table and the
 * player screen window). Each tab persists to the same IndexedDB, but
 * y-indexeddb does not push changes across tabs, so Yjs updates travel over
 * a BroadcastChannel: the campaign document and every open rich-text doc.
 */
import type { Id, RichTextRegistry } from "@campaign-forge/core";
import * as Y from "yjs";

type Message =
  | { kind: "hello"; sv: Uint8Array }
  | { kind: "main"; update: Uint8Array }
  | { kind: "doc"; id: Id; update: Uint8Array }
  | { kind: "doc-hello"; id: Id; sv: Uint8Array };

export function attachCrossTabSync(campaignId: Id, doc: Y.Doc, registry: RichTextRegistry): () => void {
  if (typeof BroadcastChannel === "undefined") return () => undefined;
  const channel = new BroadcastChannel(`cf-sync-${campaignId}`);
  const origin = { crossTab: true };
  const post = (m: Message) => {
    try {
      channel.postMessage(m);
    } catch {
      /* channel closed */
    }
  };

  const onMain = (update: Uint8Array, o: unknown) => {
    if (o !== origin) post({ kind: "main", update });
  };
  doc.on("update", onMain);

  const docs = new Map<Id, { doc: Y.Doc; handler: (u: Uint8Array, o: unknown) => void }>();
  const attach = (id: Id, d: Y.Doc) => {
    if (docs.has(id)) return;
    const handler = (update: Uint8Array, o: unknown) => {
      if (o !== origin) post({ kind: "doc", id, update });
    };
    d.on("update", handler);
    docs.set(id, { doc: d, handler });
    post({ kind: "doc-hello", id, sv: Y.encodeStateVector(d) });
  };
  for (const id of registry.ids()) {
    const d = registry.peek(id);
    if (d) attach(id, d);
  }
  const offOpen = registry.onOpen(attach);
  const offClose = registry.onClose((id) => {
    const a = docs.get(id);
    if (a) a.doc.off("update", a.handler);
    docs.delete(id);
  });

  channel.onmessage = (e: MessageEvent<Message>) => {
    const m = e.data;
    try {
      switch (m.kind) {
        case "hello":
          post({ kind: "main", update: Y.encodeStateAsUpdate(doc, m.sv) });
          break;
        case "main":
          Y.applyUpdate(doc, m.update, origin);
          break;
        case "doc-hello": {
          const d = registry.peek(m.id);
          if (d) post({ kind: "doc", id: m.id, update: Y.encodeStateAsUpdate(d, m.sv) });
          break;
        }
        case "doc": {
          const d = registry.peek(m.id);
          if (d) Y.applyUpdate(d, m.update, origin);
          break;
        }
      }
    } catch {
      /* a malformed update from another tab is ignored */
    }
  };
  post({ kind: "hello", sv: Y.encodeStateVector(doc) });

  return () => {
    doc.off("update", onMain);
    offOpen();
    offClose();
    for (const a of docs.values()) a.doc.off("update", a.handler);
    docs.clear();
    channel.close();
  };
}
