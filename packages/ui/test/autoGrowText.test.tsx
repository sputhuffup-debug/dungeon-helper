import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import type { EntityTypeDef } from "@campaign-forge/module-sdk";
import { AutoGrowText, isShortText, SchemaValueEditor, SheetRenderer, singleLineText } from "../src/index";

function Controlled({ initial = "", onValue, multiline }: { initial?: string; onValue?: (v: string) => void; multiline?: boolean }) {
  const [v, setV] = useState(initial);
  return (
    <AutoGrowText
      aria-label="Notes"
      value={v}
      multiline={multiline}
      onChange={(e) => {
        setV(e.target.value);
        onValue?.(e.target.value);
      }}
    />
  );
}

describe("AutoGrowText", () => {
  it("is a one-row text box styled as an input, with its label", () => {
    render(<Controlled initial="A short note" />);
    const box = screen.getByRole("textbox", { name: "Notes" });
    expect(box.tagName).toBe("TEXTAREA");
    expect(box).toHaveAttribute("rows", "1");
    expect(box).toHaveClass("cf-input", "cf-autogrow");
    expect(box).toHaveAttribute("data-single-line", "true");
    expect(box).toHaveValue("A short note");
  });

  it("keeps a class it is given, and marks an invalid value", () => {
    render(<AutoGrowText aria-label="Event" className="cf-input app-grow" invalid value="" onChange={() => {}} />);
    const box = screen.getByRole("textbox", { name: "Event" });
    expect(box).toHaveClass("cf-input", "app-grow", "cf-autogrow", "cf-input--invalid");
  });

  it("sets the line cap as a CSS variable", () => {
    render(<AutoGrowText aria-label="Capped" maxRows={3} value="" onChange={() => {}} />);
    expect(screen.getByRole("textbox", { name: "Capped" }).style.getPropertyValue("--cf-autogrow-rows")).toBe("3");
  });

  it("turns pasted newlines into spaces in a single-line box", () => {
    const seen = vi.fn();
    render(<Controlled onValue={seen} />);
    const box = screen.getByRole("textbox", { name: "Notes" });
    fireEvent.change(box, { target: { value: "first line\nsecond line\r\nthird" } });
    expect(seen).toHaveBeenLastCalledWith("first line second line third");
    expect(box).toHaveValue("first line second line third");
    expect(singleLineText("a\nb\r\nc\rd")).toBe("a b c d");
  });

  it("keeps newlines when multiline", () => {
    const seen = vi.fn();
    render(<Controlled onValue={seen} multiline />);
    const box = screen.getByRole("textbox", { name: "Notes" });
    expect(box).not.toHaveAttribute("data-single-line");
    fireEvent.change(box, { target: { value: "one\ntwo" } });
    expect(seen).toHaveBeenLastCalledWith("one\ntwo");
    expect(fireEvent.keyDown(box, { key: "Enter" })).toBe(true);
  });

  it("never lets Enter insert a newline, and submits its form as an input would", () => {
    const submit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    render(
      <form onSubmit={submit}>
        <AutoGrowText aria-label="Log line" value="Ambushed at the ford" onChange={() => {}} />
        <button type="submit">Add</button>
      </form>,
    );
    const box = screen.getByRole("textbox", { name: "Log line" });
    // fireEvent returns false when the default action was prevented
    expect(fireEvent.keyDown(box, { key: "Enter" })).toBe(false);
    expect(submit).toHaveBeenCalledTimes(1);
    // other keys are left alone
    expect(fireEvent.keyDown(box, { key: "a" })).toBe(true);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("does not submit through a disabled submit button", () => {
    const submit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    render(
      <form onSubmit={submit}>
        <AutoGrowText aria-label="New item" value="" onChange={() => {}} />
        <button type="submit" disabled>
          Add
        </button>
      </form>,
    );
    expect(fireEvent.keyDown(screen.getByRole("textbox", { name: "New item" }), { key: "Enter" })).toBe(false);
    expect(submit).not.toHaveBeenCalled();
  });

  it("leaves Enter to a key handler that takes it", () => {
    const submit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    const onKeyDown = vi.fn((e: { key: string; preventDefault: () => void }) => {
      if (e.key === "Enter") e.preventDefault();
    });
    render(
      <form onSubmit={submit}>
        <AutoGrowText aria-label="Tag" value="x" onChange={() => {}} onKeyDown={onKeyDown} />
        <button type="submit">Add</button>
      </form>,
    );
    expect(fireEvent.keyDown(screen.getByRole("textbox", { name: "Tag" }), { key: "Enter" })).toBe(false);
    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(submit).not.toHaveBeenCalled();
  });

  it("forwards a ref to the textarea", () => {
    let el: HTMLTextAreaElement | null = null;
    render(<AutoGrowText aria-label="Ref" value="" onChange={() => {}} ref={(x) => {
          el = x;
        }}
      />);
    expect(el).toBe(screen.getByRole("textbox", { name: "Ref" }));
  });
});

describe("free-text fields use AutoGrowText", () => {
  it("in a schema value editor (a list's or table's text cell); formatted strings stay inputs", () => {
    const { rerender } = render(<SchemaValueEditor schema={{ type: "string" }} label="Text 1" value="Keep the crew alive" onChange={() => {}} />);
    expect(screen.getByRole("textbox", { name: "Text 1" }).tagName).toBe("TEXTAREA");
    rerender(<SchemaValueEditor schema={{ type: "string", format: "date" }} label="Text 1" value="2183-06-01" onChange={() => {}} />);
    expect(screen.getByRole("textbox", { name: "Text 1" }).tagName).toBe("INPUT");
    // dice and bonuses stay one-line inputs
    rerender(<SchemaValueEditor schema={{ type: "string", maxLength: 80 }} name="damage" label="Damage 1" value="1d6 + 3 piercing" onChange={() => {}} />);
    expect(screen.getByRole("textbox", { name: "Damage 1" }).tagName).toBe("INPUT");
  });

  it("tells short structured strings from free text", () => {
    expect(isShortText({ type: "string" }, "notes")).toBe(false);
    expect(isShortText({ type: "string", maxLength: 200 }, "text")).toBe(false);
    expect(isShortText({ type: "string", maxLength: 20 }, "text")).toBe(true);
    expect(isShortText({ type: "string", format: "uri" }, "link")).toBe(true);
    expect(isShortText({ type: "string" }, "itemId")).toBe(true);
    expect(isShortText({ type: "string" }, "damage")).toBe(true);
    expect(isShortText({ type: "string" }, "bonus")).toBe(true);
  });

  it("in a sheet's text field without suggestions; one with suggestions keeps its datalist input", () => {
    const def: EntityTypeDef = {
      id: "g.pc",
      kind: "character",
      name: "PC",
      plural: "PCs",
      schema: { type: "object", properties: { role: { type: "string" }, kin: { type: "string" } } },
      sheet: {
        sections: [
          {
            id: "a",
            title: "About",
            fields: [
              { path: "role", label: "Role", widget: "text" },
              { path: "kin", label: "Kin", widget: "text", options: ["Human", "Elf"] },
            ],
          },
        ],
      },
    };
    render(<SheetRenderer def={def} mode="m" fields={{ role: "Medic" }} onChange={() => {}} />);
    expect(screen.getByRole("textbox", { name: "Role" }).tagName).toBe("TEXTAREA");
    expect(screen.getByRole("combobox", { name: "Kin" }).tagName).toBe("INPUT");
  });
});
