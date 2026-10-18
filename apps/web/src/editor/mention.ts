/**
 * `@` mentions: a Suggestion plugin whose popup state lives in a small
 * controller the React popup subscribes to. Picking an entity inserts an
 * `entityRef`; an unknown name offers "Create '<text>' as…" with a type
 * picker that creates the entity inline.
 */
import { Extension, type Editor, type Range } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion, { exitSuggestion, type SuggestionKeyDownProps, type SuggestionProps } from "@tiptap/suggestion";
import type { EntityRefAttrs } from "./EntityRef";

export type MentionItem = { kind: "entity"; id: string; name: string; type?: string } | { kind: "create"; name: string };

export interface MentionTypeOption {
  id: string;
  name: string;
  icon?: string;
  kind?: string;
}

export interface MentionDeps {
  /** Entity hits for a query (empty query: recent entities). */
  search: (query: string) => Array<{ id: string; name: string; type?: string }>;
  /** Entity types offered for inline creation. */
  types: () => MentionTypeOption[];
  /** Create an entity named `name` of `typeId`; returns the ref to insert. */
  create: (name: string, typeId: string) => EntityRefAttrs | undefined;
}

export interface MentionState {
  active: boolean;
  query: string;
  items: MentionItem[];
  types: MentionTypeOption[];
  mode: "items" | "types";
  index: number;
  rect: { left: number; top: number; bottom: number } | null;
}

const IDLE: MentionState = { active: false, query: "", items: [], types: [], mode: "items", index: 0, rect: null };

export const mentionPluginKey = new PluginKey("entityMention");

export class MentionController {
  #state: MentionState = IDLE;
  readonly #listeners = new Set<() => void>();
  #command: ((attrs: EntityRefAttrs) => void) | undefined;
  #editor: Editor | undefined;
  deps: MentionDeps;

  constructor(deps: MentionDeps) {
    this.deps = deps;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  getSnapshot = (): MentionState => this.#state;

  #set(patch: Partial<MentionState>): void {
    this.#state = { ...this.#state, ...patch };
    for (const l of [...this.#listeners]) l();
  }

  /** Items for a query: entity hits, then the create row when no name matches exactly. */
  items(query: string): MentionItem[] {
    const q = query.trim();
    const hits = this.deps.search(q).slice(0, 8);
    const items: MentionItem[] = hits.map((h) => ({ kind: "entity", id: h.id, name: h.name, type: h.type }));
    if (q && !hits.some((h) => h.name.toLowerCase() === q.toLowerCase())) items.push({ kind: "create", name: q });
    return items;
  }

  start(props: SuggestionProps<MentionItem, EntityRefAttrs>): void {
    this.#command = props.command;
    this.#editor = props.editor;
    this.#set({ active: true, query: props.query, items: props.items, mode: "items", index: 0, types: [], rect: rectOf(props) });
  }

  update(props: SuggestionProps<MentionItem, EntityRefAttrs>): void {
    this.#command = props.command;
    const queryChanged = props.query !== this.#state.query;
    this.#set({
      query: props.query,
      items: props.items,
      rect: rectOf(props) ?? this.#state.rect,
      mode: queryChanged ? "items" : this.#state.mode,
      index: queryChanged ? 0 : Math.min(this.#state.index, Math.max(0, props.items.length - 1)),
    });
  }

  exit(): void {
    this.#command = undefined;
    this.#set(IDLE);
  }

  /** Move the highlight. */
  move(delta: number): void {
    const n = this.#state.mode === "types" ? this.#state.types.length : this.#state.items.length;
    if (n === 0) return;
    this.#set({ index: (this.#state.index + delta + n) % n });
  }

  choose(index = this.#state.index): void {
    const s = this.#state;
    if (s.mode === "types") {
      const type = s.types[index];
      if (!type) return;
      const ref = this.deps.create(s.query.trim(), type.id);
      if (ref) this.#command?.(ref);
      return;
    }
    const item = s.items[index];
    if (!item) return;
    if (item.kind === "entity") this.#command?.({ id: item.id, label: item.name });
    else this.#set({ mode: "types", types: this.deps.types(), index: 0 });
  }

  back(): void {
    this.#set({ mode: "items", index: Math.max(0, this.#state.items.findIndex((i) => i.kind === "create")) });
  }

  keyDown({ event, view }: SuggestionKeyDownProps): boolean {
    if (!this.#state.active) return false;
    switch (event.key) {
      case "ArrowDown":
        this.move(1);
        return true;
      case "ArrowUp":
        this.move(-1);
        return true;
      case "Enter":
      case "Tab":
        if (this.#state.items.length === 0 && this.#state.mode === "items") return false;
        this.choose();
        return true;
      case "Escape":
        if (this.#state.mode === "types") {
          this.back();
          return true;
        }
        exitSuggestion(view, mentionPluginKey);
        this.exit();
        return true;
      default:
        return false;
    }
  }

  get editor(): Editor | undefined {
    return this.#editor;
  }
}

function rectOf(props: SuggestionProps<MentionItem, EntityRefAttrs>): MentionState["rect"] {
  const r = props.clientRect?.();
  return r ? { left: r.left, top: r.top, bottom: r.bottom } : null;
}

export interface EntityMentionOptions {
  controller: MentionController | null;
}

export const EntityMention = Extension.create<EntityMentionOptions>({
  name: "entityMention",

  addOptions() {
    return { controller: null };
  },

  addProseMirrorPlugins() {
    const controller = this.options.controller;
    if (!controller) return [];
    return [
      Suggestion<MentionItem, EntityRefAttrs>({
        editor: this.editor,
        pluginKey: mentionPluginKey,
        char: "@",
        allowSpaces: true,
        items: ({ query }) => controller.items(query),
        command: ({ editor, range, props }: { editor: Editor; range: Range; props: EntityRefAttrs }) => {
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              { type: "entityRef", attrs: { id: props.id, label: props.label ?? null } },
              { type: "text", text: " " },
            ])
            .run();
        },
        render: () => ({
          onStart: (props) => controller.start(props),
          onUpdate: (props) => controller.update(props),
          onExit: () => controller.exit(),
          onKeyDown: (props) => controller.keyDown(props),
        }),
      }),
    ];
  },
});
