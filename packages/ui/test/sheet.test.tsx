import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { computeFields, type ReferenceList, type SheetField } from "@campaign-forge/module-sdk";
import { SheetRenderer, TalentsField, getWidget, registerWidget, type WidgetProps } from "../src/index";
import { hero, heroFields, referenceLists } from "./fixtures";

function sectionIds(container: HTMLElement): string[] {
  return [...container.querySelectorAll<HTMLElement>("[data-section]")].map((el) => el.dataset.section ?? "");
}

describe("SheetRenderer", () => {
  it("renders every standard-mode section of example.hero and hides the hardcore one", () => {
    const { container } = render(<SheetRenderer def={hero} mode="standard" fields={heroFields()} onChange={() => {}} referenceLists={referenceLists} />);
    expect(sectionIds(container)).toEqual(["core", "gear", "advancement", "notes"]);
    expect(screen.getByText("Core")).toBeInTheDocument();
    expect(screen.queryByText("Hardcore")).not.toBeInTheDocument();
    expect(container.querySelector('[data-path="doom"]')).toBeNull();
    // Collapsed sections start closed but keep their fields mounted.
    const notes = container.querySelector<HTMLDetailsElement>('[data-section="notes"]');
    expect(notes?.open).toBe(false);
    expect(container.querySelector('[data-path="notes"] textarea')).toHaveValue("Owes the miller.");
  });

  it("renders only the given paths, in order, as one plain grid", () => {
    const onChange = vi.fn();
    const fields = heroFields();
    const { container } = render(<SheetRenderer def={hero} mode="standard" fields={fields} onChange={onChange} referenceLists={referenceLists} paths={["wounds", "health", "attributes.might", "favoredSkill"]} />);
    expect(sectionIds(container)).toEqual(["_paths"]);
    expect(container.querySelector("summary")).toBeNull();
    expect([...container.querySelectorAll<HTMLElement>("[data-path]")].map((el) => el.dataset.path)).toEqual(["wounds", "health", "attributes.might", "favoredSkill"]);
    expect(screen.getByTestId("computed-health")).toHaveTextContent("6");
    fireEvent.change(screen.getByRole("spinbutton", { name: "Might" }), { target: { value: "4" } });
    expect(onChange).toHaveBeenCalledWith({ ...fields, attributes: { might: 4, wits: 2 } });
  });

  it("shows the hardcore section in hardcore mode", () => {
    const { container } = render(<SheetRenderer def={hero} mode="hardcore" fields={heroFields()} onChange={() => {}} referenceLists={referenceLists} />);
    expect(sectionIds(container)).toEqual(["core", "gear", "hardcore", "advancement", "notes"]);
  });

  it("typing in a number field calls onChange with the full fields object updated at the nested path", () => {
    const onChange = vi.fn();
    const fields = heroFields();
    render(<SheetRenderer def={hero} mode="standard" fields={fields} onChange={onChange} referenceLists={referenceLists} />);
    const might = screen.getByRole("spinbutton", { name: "Might" });
    fireEvent.change(might, { target: { value: "4" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0]![0] as Record<string, unknown>;
    expect(next).toEqual({ ...fields, attributes: { might: 4, wits: 2 } });
    // Updated immutably.
    expect(next).not.toBe(fields);
    expect(fields.attributes).toEqual({ might: 3, wits: 2 });
    // Steppers clamp to the schema maximum (5).
    fireEvent.click(screen.getByRole("button", { name: "Increase Wounds" }));
    expect((onChange.mock.calls[1]![0] as Record<string, unknown>).wounds).toBe(2);
  });

  it("computed widgets show the value derived by computeFields, read-only with a provenance badge", () => {
    const fields = heroFields();
    const { container } = render(<SheetRenderer def={hero} mode="standard" fields={fields} onChange={() => {}} referenceLists={referenceLists} />);
    const expected = computeFields(hero, fields);
    expect(expected.health).toBe(6);
    expect(screen.getByTestId("computed-health")).toHaveTextContent("6");
    expect(screen.getByTestId("computed-carry")).toHaveTextContent(String(expected.carry));
    const healthField = container.querySelector<HTMLElement>('[data-path="health"]')!;
    expect(within(healthField).getByRole("button", { name: "computed" })).toBeInTheDocument();
    expect(healthField.querySelector("input")).toBeNull();
  });

  it("select with {ref} options lists the reference list items by name", () => {
    render(<SheetRenderer def={hero} mode="standard" fields={heroFields()} onChange={() => {}} referenceLists={referenceLists} />);
    const origin = screen.getByRole("combobox", { name: "Origin" });
    const labels = within(origin)
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(labels).toEqual(["—", "Hill folk", "Coast folk", "City folk"]);
    expect(origin).toHaveValue("coast");
  });

  it("skills widget filters reference items by mode and shows attribute + skill pools", () => {
    const onRoll = vi.fn();
    render(<SheetRenderer def={hero} mode="standard" fields={heroFields()} onChange={() => {}} referenceLists={referenceLists} onRoll={onRoll} />);
    expect(screen.getByTestId("pool-fight")).toHaveTextContent("4"); // might 3 + fight 1
    expect(screen.getByTestId("pool-sneak")).toHaveTextContent("4"); // wits 2 + sneak 2
    expect(screen.queryByTestId("pool-endure")).toBeNull(); // hardcore-only skill
    fireEvent.click(within(screen.getByText("Fight").closest("tr")!).getByRole("button", { name: "Roll" }));
    expect(onRoll).toHaveBeenCalledWith("fight", expect.objectContaining({ attribute: 3, skill: 1 }), "Fight");
  });

  it("rule buttons call onOpenRule and errors render under fields", () => {
    const onOpenRule = vi.fn();
    render(
      <SheetRenderer
        def={hero}
        mode="standard"
        fields={heroFields()}
        onChange={() => {}}
        referenceLists={referenceLists}
        onOpenRule={onOpenRule}
        errors={[{ path: "wounds", message: "must be >= 0" }]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Rule for Might" }));
    expect(onOpenRule).toHaveBeenCalledWith("example.rule.push");
    expect(screen.getByRole("alert")).toHaveTextContent("must be >= 0");
  });

  it("readonly sheets do not emit changes", () => {
    const onChange = vi.fn();
    render(<SheetRenderer def={hero} mode="standard" fields={heroFields()} onChange={onChange} referenceLists={referenceLists} readonly />);
    expect(screen.queryByRole("spinbutton", { name: "Might" })).toBeNull();
    expect(screen.getAllByTestId("attribute-value")[0]).toHaveTextContent("3");
  });
});

describe("TalentsField", () => {
  const talents: ReferenceList = {
    id: "test.talents",
    name: "Talents",
    items: [
      { id: "tough", name: "Tough", maxStack: 3 },
      { id: "quick", name: "Quick" },
    ],
  };
  const field: SheetField = { path: "talents", widget: "talents", config: { ref: "test.talents", maxStack: 2 } };

  function Harness({ initial, onChange }: { initial: unknown; onChange?: (v: unknown) => void }) {
    const [value, setValue] = useState<unknown>(initial);
    const props: WidgetProps = {
      field,
      path: "talents",
      value,
      onChange: (v) => {
        setValue(v);
        onChange?.(v);
      },
      fields: { talents: value },
      computed: {},
      readonly: false,
      referenceLists: { [talents.id]: talents },
      id: "talents",
    };
    return <TalentsField {...props} />;
  }

  it("respects the per-item stack limit and the configured default", () => {
    const onChange = vi.fn();
    render(<Harness initial={[{ id: "quick", count: 2 }, { id: "tough", count: 2 }]} onChange={onChange} />);
    // Quick uses config.maxStack 2: already at the limit.
    expect(screen.getByRole("button", { name: "Increase Quick stacks" })).toBeDisabled();
    expect(screen.getByRole("option", { name: /Quick/ })).toBeDisabled();
    // Tough has its own maxStack 3.
    fireEvent.click(screen.getByRole("button", { name: "Increase Tough stacks" }));
    expect(onChange).toHaveBeenLastCalledWith([
      { id: "quick", count: 2 },
      { id: "tough", count: 3 },
    ]);
    expect(screen.getByRole("button", { name: "Increase Tough stacks" })).toBeDisabled();
    // Adding via the picker also stops at the limit.
    expect(screen.getByRole("option", { name: /Tough/ })).toBeDisabled();
  });

  it("adds a new talent and removes one when stepped to zero", () => {
    const onChange = vi.fn();
    render(<Harness initial={[]} onChange={onChange} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Add talent" }), { target: { value: "tough" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(onChange).toHaveBeenLastCalledWith([{ id: "tough", count: 1 }]);
    fireEvent.click(screen.getByRole("button", { name: "Decrease Tough stacks" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});

describe("widget registry", () => {
  it("falls back to the schema default for an unregistered widget kind, and uses a registered one", () => {
    const def = {
      ...hero,
      sheet: { sections: [{ id: "x", title: "X", fields: [{ path: "wounds", label: "Wounds", widget: "sparkle" as never }] }] },
    };
    const { unmount } = render(<SheetRenderer def={def} mode="standard" fields={heroFields()} onChange={() => {}} />);
    expect(getWidget("sparkle")).toBeUndefined();
    expect(screen.getByRole("spinbutton", { name: "Wounds" })).toHaveValue(1);
    unmount();

    registerWidget("sparkle", ({ value }) => <span data-testid="sparkle">✦{String(value)}</span>);
    render(<SheetRenderer def={def} mode="standard" fields={heroFields()} onChange={() => {}} />);
    expect(screen.getByTestId("sparkle")).toHaveTextContent("✦1");
  });
});

describe("number widgets with no stored value", () => {
  const field = (path: string): SheetField => ({ path, label: path, widget: "number" });
  const props = (path: string, schema: Record<string, unknown>): WidgetProps => ({
    id: `w-${path}`,
    field: field(path),
    path,
    value: undefined,
    onChange: () => {},
    schema: schema as WidgetProps["schema"],
    fields: {},
    computed: {},
    readonly: false,
    referenceLists: {},
  });
  it("show the schema default, else 0 inside the bounds, never just the minimum", () => {
    const NumberWidget = getWidget("number")!;
    render(
      <>
        <NumberWidget {...props("bonus", { type: "integer", minimum: -10, maximum: 20 })} />
        <NumberWidget {...props("speed", { type: "integer", minimum: 0, maximum: 200, default: 30 })} />
        <NumberWidget {...props("size", { type: "integer", minimum: 2, maximum: 6 })} />
        <NumberWidget {...props("debt", { type: "integer", minimum: -9, maximum: -1 })} />
      </>,
    );
    expect(screen.getByRole("spinbutton", { name: "bonus" })).toHaveValue(0);
    expect(screen.getByRole("spinbutton", { name: "speed" })).toHaveValue(30);
    expect(screen.getByRole("spinbutton", { name: "size" })).toHaveValue(2);
    expect(screen.getByRole("spinbutton", { name: "debt" })).toHaveValue(-1);
  });
});

describe("cast-aware widgets", () => {
  const def = {
    id: "narrative.adventure",
    kind: "item" as const,
    name: "Adventure",
    plural: "Adventures",
    schema: { type: "object", properties: { signOffs: { type: "object", additionalProperties: { type: "string" } }, aimedAt: { type: "string" } } },
    sheet: {
      sections: [
        {
          id: "s",
          title: "S",
          fields: [
            { path: "signOffs", label: "Sign-offs", widget: "object" as const, config: { keyedByCast: "pcs", valueWidget: "textarea" } },
            { path: "aimedAt", label: "Aimed at", widget: "ref" as const, config: { castRoles: ["pcs", "npcs"], everyoneValue: "everyone", everyoneLabel: "Everyone" } },
          ],
        },
      ],
    },
  };
  const members: Record<string, Array<{ id: string; name: string }>> = { pcs: [{ id: "p1", name: "Ada" }, { id: "p2", name: "Bo" }], npcs: [{ id: "n1", name: "Ash" }, { id: "p1", name: "Ada" }] };
  const castMembers = (role: string) => members[role] ?? [];

  it("object keyed by cast: one text area per member, keyed by entity id", () => {
    const onChange = vi.fn();
    render(<SheetRenderer def={def} mode="m" fields={{ signOffs: { p1: "Rest now", gone: "kept" } }} onChange={onChange} castMembers={castMembers} />);
    expect((screen.getByRole("textbox", { name: "Sign-offs: Ada" }) as HTMLTextAreaElement).value).toBe("Rest now");
    fireEvent.change(screen.getByRole("textbox", { name: "Sign-offs: Bo" }), { target: { value: "Go home" } });
    expect(onChange).toHaveBeenCalledWith({ signOffs: { p1: "Rest now", gone: "kept", p2: "Go home" } });
  });

  it("ref with cast roles: a select of everyone plus the members", () => {
    const onChange = vi.fn();
    render(<SheetRenderer def={def} mode="m" fields={{ aimedAt: "everyone" }} onChange={onChange} castMembers={castMembers} />);
    const select = screen.getByRole("combobox", { name: "Aimed at" }) as HTMLSelectElement;
    expect([...select.options].map((o) => o.text)).toEqual(["Everyone", "Ada", "Bo", "Ash"]);
    expect(select.value).toBe("everyone");
    fireEvent.change(select, { target: { value: "n1" } });
    expect(onChange).toHaveBeenCalledWith({ aimedAt: "n1" });
  });

  it("falls back without a cast provider", () => {
    render(<SheetRenderer def={def} mode="m" fields={{ aimedAt: "everyone", signOffs: { p1: "x" } }} onChange={() => {}} resolveEntityName={(id) => (id === "p1" ? "Ada" : undefined)} />);
    expect(screen.queryByRole("combobox", { name: "Aimed at" })).toBeNull();
    expect(screen.getByText("Everyone")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Sign-offs: Ada" })).toBeInTheDocument();
  });
});

describe("text fields with suggestions", () => {
  // a supplement-style list: some items carry a source and an edition
  const lists: Record<string, ReferenceList> = {
    "x.classes": { id: "x.classes", name: "Classes", items: [{ id: "rogue", name: "Rogue" }, { id: "house.tinker", name: "Tinker", source: "House rules" }] },
    "x.paths": {
      id: "x.paths",
      name: "Paths",
      items: [
        { id: "thief", name: "Thief", class: "Rogue" },
        { id: "house.lamplighter", name: "Lamplighter", class: "Rogue", source: "House rules", edition: "2024", summary: "Ability scores Dex, Int, Wis; feat Alert" },
        { id: "house.gearwright", name: "Gearwright", class: "Tinker", source: "House rules" },
        { id: "spy", name: "Spy", class: "Rogue", mode: ["intrigue"] },
      ],
    },
  };
  const def = {
    id: "x.hero",
    kind: "character" as const,
    name: "Hero",
    plural: "Heroes",
    schema: { type: "object", properties: { class: { type: "string" }, path: { type: "string" }, nickname: { type: "string" } } },
    sheet: {
      sections: [
        {
          id: "s",
          title: "S",
          fields: [
            { path: "class", label: "Class", widget: "select" as const, options: { ref: "x.classes" } },
            { path: "path", label: "Path", widget: "text" as const, options: { ref: "x.paths" }, config: { optionsFilter: { field: "class", key: "class" } } },
            { path: "nickname", label: "Nickname", widget: "text" as const },
          ],
        },
      ],
    },
  };
  const options = (container: HTMLElement, path: string) => [...container.querySelectorAll<HTMLOptionElement>(`[data-testid="options-${path}"] option`)].map((o) => [o.value, o.getAttribute("label") ?? ""]);

  it("offers the list's item names (filtered by mode and by the sibling field) and still takes free text", () => {
    const onChange = vi.fn();
    const { container, rerender } = render(<SheetRenderer def={def} mode="standard" fields={{ class: "rogue" }} onChange={onChange} referenceLists={lists} />);
    const input = screen.getByRole("combobox", { name: "Path" });
    expect(input).toHaveAttribute("list", expect.stringMatching(/-options$/));
    // the class id "rogue" matches the items' "Rogue"; the intrigue-only item is left out in standard mode
    expect(options(container, "path")).toEqual([
      ["Thief", ""],
      ["Lamplighter", "2024 · House rules"],
    ]);
    fireEvent.change(input, { target: { value: "Something of my own" } });
    expect(onChange).toHaveBeenCalledWith({ class: "rogue", path: "Something of my own" });
    // a supplement's class id ("house.tinker") matches its items' "Tinker"
    rerender(<SheetRenderer def={def} mode="standard" fields={{ class: "house.tinker" }} onChange={onChange} referenceLists={lists} />);
    expect(options(container, "path").map(([v]) => v)).toEqual(["Gearwright"]);
    // no class yet, or one nothing matches: every option
    rerender(<SheetRenderer def={def} mode="intrigue" fields={{ class: "bard" }} onChange={onChange} referenceLists={lists} />);
    expect(options(container, "path").map(([v]) => v)).toEqual(["Thief", "Lamplighter", "Gearwright", "Spy"]);
    // the select names the supplement an option comes from; a plain text field has no list
    expect(within(screen.getByRole("combobox", { name: "Class" })).getAllByRole("option").map((o) => o.textContent)).toEqual(["—", "bard", "Rogue", "Tinker (House rules)"]);
    expect(screen.getByRole("textbox", { name: "Nickname" })).not.toHaveAttribute("list");
    expect(container.querySelector('[data-testid="options-nickname"]')).toBeNull();
  });

  it("shows the summary of the item the value names as a hint, without changing anything else", () => {
    const onChange = vi.fn();
    const { container, rerender } = render(<SheetRenderer def={def} mode="standard" fields={{ class: "rogue", path: "lamplighter " }} onChange={onChange} referenceLists={lists} />);
    // the name matches loosely on case and outer spaces; only the summary shows
    expect(screen.getByTestId("hint-path")).toHaveTextContent("Ability scores Dex, Int, Wis; feat Alert");
    // free text, or an item with no summary: no hint
    rerender(<SheetRenderer def={def} mode="standard" fields={{ class: "rogue", path: "Thief" }} onChange={onChange} referenceLists={lists} />);
    expect(screen.queryByTestId("hint-path")).toBeNull();
    rerender(<SheetRenderer def={def} mode="standard" fields={{ class: "rogue", path: "Lamplighters" }} onChange={onChange} referenceLists={lists} />);
    expect(screen.queryByTestId("hint-path")).toBeNull();
    expect(container.querySelector('[data-testid="hint-nickname"]')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});
