/**
 * `entityRef`: an inline atom node pointing at a campaign entity. It is
 * stored in the Yjs body as `<entityRef id=".." label="..">`, the shape
 * core's `extractRefs` / Markdown export read.
 */
import { REF_NODE } from "@campaign-forge/core";
import { mergeAttributes, Node } from "@tiptap/core";
import { iconSvg } from "../components/EntityIcon";

export interface EntityRefInfo {
  name?: string;
  icon?: string;
  kind?: string;
  missing?: boolean;
}

export interface EntityRefOptions {
  HTMLAttributes: Record<string, unknown>;
  /** Live info for a referenced id (current name, icon). */
  resolve?: (id: string) => EntityRefInfo | undefined;
  /** Re-render the chip when the entity changes. Returns an unsubscribe. */
  subscribe?: (id: string, onChange: () => void) => () => void;
  /** Click on a chip. */
  onOpen?: (id: string) => void;
}

export interface EntityRefAttrs {
  id: string;
  label?: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    entityRef: {
      /** Insert an entity reference at the selection. */
      insertEntityRef: (attrs: EntityRefAttrs) => ReturnType;
    };
  }
}

export const EntityRef = Node.create<EntityRefOptions>({
  name: REF_NODE,
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return { HTMLAttributes: {} };
  },

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-id"),
        renderHTML: (attrs) => (attrs.id ? { "data-id": String(attrs.id) } : {}),
      },
      label: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-label") ?? el.textContent?.replace(/^@/, "") ?? null,
        renderHTML: (attrs) => (attrs.label ? { "data-label": String(attrs.label) } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-entity-ref]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ["span", mergeAttributes({ "data-entity-ref": "", class: "cf-entity-ref" }, this.options.HTMLAttributes, HTMLAttributes), `@${String(node.attrs.label ?? node.attrs.id ?? "")}`];
  },

  renderText({ node }) {
    return `@${String(node.attrs.label ?? node.attrs.id ?? "")}`;
  },

  addCommands() {
    return {
      insertEntityRef:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent([
            { type: this.name, attrs: { id: attrs.id, label: attrs.label ?? null } },
            { type: "text", text: " " },
          ]),
    };
  },

  addNodeView() {
    const options = this.options;
    return ({ node }) => {
      let current = node;
      const dom = document.createElement("span");
      dom.className = "cf-entity-ref";
      dom.setAttribute("data-entity-ref", "");
      dom.contentEditable = "false";
      dom.tabIndex = -1;
      const render = () => {
        const id = String(current.attrs.id ?? "");
        const info = id ? options.resolve?.(id) : undefined;
        const name = info?.name ?? (current.attrs.label as string | null) ?? id;
        dom.setAttribute("data-id", id);
        dom.setAttribute("title", info?.missing ? `${name} (deleted)` : `Open ${name}`);
        dom.classList.toggle("cf-entity-ref--missing", !!info?.missing);
        dom.innerHTML = `<span class="cf-entity-ref__icon">${iconSvg(info?.icon, info?.kind, 12)}</span>`;
        const label = document.createElement("span");
        label.className = "cf-entity-ref__label";
        label.textContent = name;
        dom.appendChild(label);
      };
      render();
      let unsubscribe = options.subscribe?.(String(current.attrs.id ?? ""), render);
      dom.addEventListener("click", (e) => {
        const id = String(current.attrs.id ?? "");
        if (!id || !options.onOpen) return;
        e.preventDefault();
        e.stopPropagation();
        options.onOpen(id);
      });
      return {
        dom,
        update(updated) {
          if (updated.type.name !== current.type.name) return false;
          const idChanged = updated.attrs.id !== current.attrs.id;
          current = updated;
          if (idChanged) {
            unsubscribe?.();
            unsubscribe = options.subscribe?.(String(current.attrs.id ?? ""), render);
          }
          render();
          return true;
        },
        ignoreMutation: () => true,
        destroy() {
          unsubscribe?.();
        },
      };
    };
  },
});
