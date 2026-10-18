import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { RichTextRegistry, bodyOf, docFromMarkdown, extractRefs, fromMarkdown, plainText, toMarkdown } from "../src";

function prosemirrorStyleDoc(): Y.Doc {
  // Mirrors what y-prosemirror writes: paragraph element with text runs and inline mention elements.
  const doc = new Y.Doc();
  const body = bodyOf(doc);
  const h = new Y.XmlElement("heading");
  h.setAttribute("level", "2");
  h.insert(0, [new Y.XmlText("Briefing")]);
  const p = new Y.XmlElement("paragraph");
  const t1 = new Y.XmlText("Meet ");
  const m = new Y.XmlElement("mention");
  m.setAttribute("id", "01ENTITYAAAAAAAAAAAAAAAAAA");
  m.setAttribute("label", "Okafor");
  const t2 = new Y.XmlText();
  t2.applyDelta([{ insert: " at the " }, { insert: "bar", attributes: { bold: {} } }]);
  const ref = new Y.XmlElement("entityRef");
  ref.setAttribute("data-id", "01ENTITYBBBBBBBBBBBBBBBBBB");
  p.insert(0, [t1, m, t2, ref]);
  body.insert(0, [h, p]);
  return doc;
}

describe("richtext", () => {
  it("extracts refs from mention/entityRef nodes with id or data-id", () => {
    const doc = prosemirrorStyleDoc();
    expect(extractRefs(doc)).toEqual(["01ENTITYAAAAAAAAAAAAAAAAAA", "01ENTITYBBBBBBBBBBBBBBBBBB"]);
    expect(plainText(doc)).toBe("Briefing\nMeet Okafor at the bar01ENTITYBBBBBBBBBBBBBBBBBB");
  });

  it("renders markdown with [[id|name]] refs and resolves names", () => {
    const doc = prosemirrorStyleDoc();
    const md = toMarkdown(doc, (id) => (id.startsWith("01ENTITYA") ? "Okafor" : "The Bar"));
    expect(md).toBe("## Briefing\n\nMeet [[01ENTITYAAAAAAAAAAAAAAAAAA|Okafor]] at the **bar**[[01ENTITYBBBBBBBBBBBBBBBBBB|The Bar]]");
  });

  it("round-trips markdown through fromMarkdown/toMarkdown", () => {
    const md = [
      "# Title",
      "",
      "A paragraph with **bold**, *italic*, ***both*** and `code` and a ref [[01ENTITYAAAAAAAAAAAAAAAAAA|Okafor]].",
      "",
      "Line one  ",
      "line two",
      "",
      "- first",
      "- second with [[01ENTITYBBBBBBBBBBBBBBBBBB|Bar]]",
      "  - nested",
      "",
      "1. one",
      "2. two",
      "",
      "> quoted",
      "> ",
      "> second quote paragraph",
    ].join("\n");
    const doc = docFromMarkdown(md);
    expect(extractRefs(doc)).toEqual(["01ENTITYAAAAAAAAAAAAAAAAAA", "01ENTITYBBBBBBBBBBBBBBBBBB"]);
    const names: Record<string, string> = { "01ENTITYAAAAAAAAAAAAAAAAAA": "Okafor", "01ENTITYBBBBBBBBBBBBBBBBBB": "Bar" };
    const out = toMarkdown(doc, (id) => names[id] ?? id);
    expect(out).toBe(
      [
        "# Title",
        "",
        "A paragraph with **bold**, *italic*, ***both*** and `code` and a ref [[01ENTITYAAAAAAAAAAAAAAAAAA|Okafor]].",
        "",
        "Line one  ",
        "line two",
        "",
        "- first",
        "- second with [[01ENTITYBBBBBBBBBBBBBBBBBB|Bar]]",
        "  - nested",
        "",
        "1. one",
        "2. two",
        "",
        "> quoted",
        ">",
        "> second quote paragraph",
      ].join("\n"),
    );
    // parsing the output again yields the same output: the format is stable
    const again = docFromMarkdown(out);
    expect(toMarkdown(again, (id) => names[id] ?? id)).toBe(out);
    // and the node shapes are Tiptap-compatible
    const body = bodyOf(doc);
    const names_ = body.toArray().map((n) => (n instanceof Y.XmlElement ? n.nodeName : "text"));
    expect(names_).toEqual(["heading", "paragraph", "paragraph", "bulletList", "orderedList", "blockquote"]);
    const heading = body.get(0) as Y.XmlElement;
    expect(heading.getAttribute("level") as unknown).toBe(1);
  });

  it("reads _underscore_ emphasis but leaves snake_case words literal", () => {
    const doc = docFromMarkdown("A _quiet_ hum near the snake_case_vent.");
    expect(toMarkdown(doc)).toBe("A *quiet* hum near the snake_case_vent.");
  });

  it("fromMarkdown replaces existing content and the registry caches docs", () => {
    const registry = new RichTextRegistry();
    const doc = registry.open("doc-1");
    expect(registry.open("doc-1")).toBe(doc);
    fromMarkdown(doc, "old");
    fromMarkdown(doc, "new text");
    expect(plainText(doc)).toBe("new text");
    expect(registry.ids()).toEqual(["doc-1"]);
    registry.close("doc-1");
    expect(registry.has("doc-1")).toBe(false);
    expect(registry.open("doc-1")).not.toBe(doc);
  });
});
