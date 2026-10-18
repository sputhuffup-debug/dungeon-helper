import { bodyOf, docFromMarkdown, extractRefs, toMarkdown } from "@campaign-forge/core";
import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { editorExtensions } from "./extensions";
import { MentionController } from "./mention";

const editors: Editor[] = [];
afterEach(() => {
  while (editors.length) editors.pop()?.destroy();
});

function editorFor(doc: Y.Doc): Editor {
  const editor = new Editor({ element: document.createElement("div"), extensions: editorExtensions({ doc }) });
  editors.push(editor);
  return editor;
}

describe("entityRef node", () => {
  it("serializes into the Yjs body with an `id` attribute that extractRefs finds", () => {
    const doc = new Y.Doc();
    const editor = editorFor(doc);
    editor.commands.setContent("<p>Met </p>");
    editor.commands.focus("end");
    editor.commands.insertEntityRef({ id: "01HZXENTITY0000000000000001", label: "Ash" });
    expect(extractRefs(doc)).toEqual(["01HZXENTITY0000000000000001"]);
    const para = bodyOf(doc).get(0) as Y.XmlElement;
    const ref = para.toArray().find((n) => n instanceof Y.XmlElement) as Y.XmlElement | undefined;
    expect(ref?.nodeName).toBe("entityRef");
    expect(ref?.getAttribute("id")).toBe("01HZXENTITY0000000000000001");
    expect(ref?.getAttribute("label")).toBe("Ash");
    expect(toMarkdown(doc, () => "")).toContain("[[01HZXENTITY0000000000000001|Ash]]");
  });

  it("renders a body written by core (Markdown import) as entityRef nodes", () => {
    const doc = docFromMarkdown("See [[01HZXENTITY0000000000000002|Ripley]] **now**");
    const editor = editorFor(doc);
    const json = JSON.stringify(editor.getJSON());
    expect(json).toContain('"type":"entityRef"');
    expect(json).toContain('"id":"01HZXENTITY0000000000000002"');
    expect(editor.getText()).toContain("@Ripley");
    expect(editor.getHTML()).toContain('data-id="01HZXENTITY0000000000000002"');
  });

  it("parses pasted HTML chips back into refs", () => {
    const doc = new Y.Doc();
    const editor = editorFor(doc);
    editor.commands.setContent('<p>Hi <span data-entity-ref="" data-id="01HZXENTITY0000000000000003" data-label="Bishop">@Bishop</span></p>');
    expect(extractRefs(doc)).toEqual(["01HZXENTITY0000000000000003"]);
  });
});

describe("mention controller", () => {
  it("offers search hits, then a create row when no name matches", () => {
    const c = new MentionController({
      search: (q) => (q ? [{ id: "a", name: "Ash", type: "t" }] : []),
      types: () => [{ id: "t", name: "Character" }],
      create: () => ({ id: "new", label: "Ashley" }),
    });
    expect(c.items("Ash").map((i) => i.kind)).toEqual(["entity"]);
    expect(c.items("Ashley").map((i) => i.kind)).toEqual(["entity", "create"]);
    expect(c.items("")).toEqual([]);
  });

  it("creates the entity inline through the type picker", () => {
    const create = vi.fn(() => ({ id: "new", label: "Ashley" }));
    const command = vi.fn();
    const c = new MentionController({ search: () => [], types: () => [{ id: "t1", name: "Character" }, { id: "t2", name: "Location" }], create });
    const items = c.items("Ashley");
    c.start({ items, query: "Ashley", command, clientRect: null } as unknown as Parameters<MentionController["start"]>[0]);
    c.choose(0);
    expect(c.getSnapshot().mode).toBe("types");
    c.move(1);
    c.choose();
    expect(create).toHaveBeenCalledWith("Ashley", "t2");
    expect(command).toHaveBeenCalledWith({ id: "new", label: "Ashley" });
  });
});
