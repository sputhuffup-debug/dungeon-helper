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
    expect(sectionIds(container)).toEqual(["core", "gear", "notes"]);
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
    expect(sectionIds(container)).toEqual(["core", "gear", "hardcore", "notes"]);
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
    expect(onRoll).toHaveBeenCalledWith("fight", expect.objectContaining({ attribute: 3, skill: 1 }));
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
