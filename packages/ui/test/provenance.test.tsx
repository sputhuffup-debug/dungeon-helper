import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { RollRecord } from "@campaign-forge/module-sdk";
import { DieFace, ProvenanceBadge, RollRecordList, rollStepLabel } from "../src/index";

const rolls: RollRecord[] = [
  {
    step: "criticalInjury",
    table: "alien.character.critical-injury",
    dice: "d66",
    raw: [3, 4],
    modifier: 0,
    total: 34,
    rowLabel: "Broken nose",
    result: {},
    nested: [{ step: "origin/subAffiliation", table: "x.origin.sub", dice: "1d6", raw: [2], modifier: 0, total: 2, rowLabel: "Weyland-Yutani", result: {} }],
  },
];

describe("provenance: names, not ids", () => {
  it("reads a step id as words; a nested roll by its own key, a qualified id by its last part", () => {
    expect(rollStepLabel("criticalInjury")).toBe("Critical injury");
    expect(rollStepLabel("origin/subAffiliation")).toBe("Sub affiliation");
    expect(rollStepLabel("alien.character.panic")).toBe("Panic");
    expect(rollStepLabel("stressResponse")).toBe("Stress response");
  });

  it("lists the rolls with step and table names, keeping the ids in the tooltip only", () => {
    const { container } = render(<RollRecordList rolls={rolls} tableName={(id) => (id === "alien.character.critical-injury" ? "Critical injuries" : undefined)} />);
    const text = container.textContent ?? "";
    expect(text).toContain("Critical injury");
    expect(text).toContain("Critical injuries");
    expect(text).toContain("Sub affiliation");
    expect(text).not.toContain("criticalInjury");
    expect(text).not.toContain("alien.character.critical-injury");
    // a table the resolver cannot name is left out rather than shown by id
    expect(text).not.toContain("x.origin.sub");
    expect(container.querySelector(".cf-prov__roll")?.getAttribute("title")).toBe("criticalInjury · alien.character.critical-injury");
  });

  it("the badge's popover names a step by the title it is given", () => {
    render(<ProvenanceBadge kind="rolled" rolls={rolls} detail="Human or android" stepName={(id) => (id === "criticalInjury" ? "Critical injury roll" : undefined)} />);
    fireEvent.click(screen.getByRole("button", { name: "rolled" }));
    const pop = screen.getByRole("dialog", { name: "Provenance" });
    expect(pop.textContent).toContain("Human or android");
    expect(pop.textContent).toContain("Critical injury roll");
    expect(pop.textContent).not.toContain("criticalInjury");
  });
});

describe("die symbol badges", () => {
  it("carry the whole symbol in a tooltip (the badge itself is never wider than its die)", () => {
    const { container } = render(<DieFace spec={{ id: "stress", name: "Stress die", faces: 6, symbols: { 1: "facehugger" } }} value={1} />);
    const badge = container.querySelector(".cf-die__symbol")!;
    expect(badge.textContent).toBe("facehugger");
    expect(badge.getAttribute("title")).toBe("facehugger");
  });
});
