/** The dice UI with the built-in engines and an example data pack: totals, outcomes, roll options, citations. */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { createDiceEngine, createRng, moduleFromPackSource, type ReferenceList, type RollResult } from "@campaign-forge/module-sdk";
import { examplePackSource } from "@campaign-forge/module-example";
import { DiceRollPanel, PageRef, RollLog, RuleCardView, SheetRenderer, formatCitation, rollOptionFields } from "../src/index";
import { exampleDice } from "./fixtures";

describe("DiceRollPanel with total-style engines", () => {
  it("shows a d20 total, the DC and the outcome, with the roll options merged into the input", () => {
    const d20 = createDiceEngine({ engine: "d20", proficiency: 2 });
    const onRolled = vi.fn();
    const { container } = render(<DiceRollPanel dice={d20} input={{ attribute: 14, skill: 1, attributeId: "might" }} rng={createRng("d20-ui")} onRolled={onRolled} />);
    expect(screen.getByTestId("dicepool")).toHaveTextContent("= 1d20 + 4");
    fireEvent.change(screen.getByTestId("roll-option-dc"), { target: { value: "15" } });
    fireEvent.change(screen.getByTestId("roll-option-advantage"), { target: { value: "advantage" } });
    expect(screen.getByTestId("dicepool")).toHaveTextContent("= 1d20 + 4 (advantage) vs DC 15");
    fireEvent.click(screen.getByRole("button", { name: "Roll" }));
    const expected = d20.roll(d20.buildPool({ attribute: 14, skill: 1, attributeId: "might", advantage: "advantage", dc: 15, modifier: 0 }), createRng("d20-ui"));
    expect(onRolled).toHaveBeenCalledWith(expected);
    expect(screen.getByTestId("roll-total")).toHaveTextContent(String(expected.total));
    expect(screen.getByTestId("roll-outcome")).toHaveTextContent(expected.successes ? "Success" : "Failure");
    expect(screen.queryByTestId("successes")).toBeNull();
    // advantage rolls two dice and drops one; there is no push button
    expect(container.querySelectorAll(".cf-dice__faces .cf-die")).toHaveLength(2);
    expect(container.querySelectorAll('.cf-dice__faces [data-dropped="true"]')).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Push" })).toBeNull();
  });

  it("shows 2d6 bands and d100 degrees", () => {
    const pbta = createDiceEngine({ engine: "2d6" });
    render(<DiceRollPanel dice={pbta} input={{ attribute: 2 }} rng={createRng("band")} onRolled={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Roll" }));
    const r = pbta.roll(pbta.buildPool({ attribute: 2, modifier: 0 }), createRng("band"));
    expect(screen.getByTestId("roll-outcome")).toHaveAttribute("data-outcome", r.outcome!.id);

    const d100 = createDiceEngine({ engine: "d100", push: { max: 1 } });
    const { unmount } = render(<DiceRollPanel dice={d100} input={{ skill: 55 }} rng={createRng("pct")} onRolled={() => {}} title="Spot Hidden" />);
    const panel = screen.getAllByTestId("dice-panel")[1]!;
    fireEvent.click(within(panel).getByRole("button", { name: "Roll" }));
    expect(within(panel).getByTestId("roll-total")).toBeInTheDocument();
    expect(within(panel).getByText("vs 55")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Push" })).toBeEnabled();
    unmount();
  });

  it("keeps the success-count display for pool systems", () => {
    render(<DiceRollPanel dice={exampleDice} input={{ attribute: 2, skill: 1 }} rng={createRng("pool")} onRolled={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Roll" }));
    expect(screen.getByTestId("successes")).toBeInTheDocument();
    expect(screen.queryByTestId("roll-options")).toBeNull();
  });

  it("reads only the option kinds it can render", () => {
    expect(rollOptionFields({ type: "object", properties: { a: { type: "integer", minimum: 1 }, b: { type: "boolean" }, c: { enum: ["x", "y"] }, d: { type: "object" } } }).map((f) => `${f.key}:${f.kind}`)).toEqual(["a:number", "b:boolean", "c:enum"]);
  });
});

describe("RollLog with totals", () => {
  it("leads with the total and outcome", () => {
    const d20 = createDiceEngine({ engine: "d20" });
    const result: RollResult = d20.roll(d20.buildPool({ attribute: 10, dc: 10 }), createRng("log"));
    render(<RollLog entries={[{ id: "1", label: "Check", result }]} dice={d20} />);
    expect(screen.getByRole("list", { name: "Roll log" })).toHaveTextContent(`${result.total} · ${result.outcome!.label}`);
  });
});

describe("citations", () => {
  it("shows a page, a section cite or original", () => {
    expect(formatCitation({ page: [3, 4] })).toBe("p. 3–4");
    expect(formatCitation({ cite: "SRD 5.1, Conditions" })).toBe("SRD 5.1, Conditions");
    expect(formatCitation({ original: true })).toBe("Original");
    expect(formatCitation({})).toBe("");
    const { container } = render(<PageRef cite="<b>not html</b>" />);
    expect(container.querySelector("b")).toBeNull();
    expect(container).toHaveTextContent("<b>not html</b>");
  });

  it("rule cards show their section citation", () => {
    render(<RuleCardView card={{ id: "x.rule", title: "Cover", summary: "Half cover adds 2.", cite: "SRD 5.1, Combat: Cover" }} />);
    expect(screen.getByText("SRD 5.1, Combat: Cover")).toBeInTheDocument();
  });
});

describe("a data pack's sheet", () => {
  it("previews each skill roll through the pack's dice engine and passes the sheet to it", async () => {
    const module = await moduleFromPackSource(examplePackSource);
    const def = module.entityTypes.find((t) => t.id === "example-pack.adventurer")!;
    const lists: Record<string, ReferenceList> = Object.fromEntries(module.referenceLists.map((l) => [l.id, l]));
    const onRoll = vi.fn();
    const fields = { level: 5, abilities: { might: 16, grace: 12, wits: 9 }, skills: { climb: 1, sneak: 0, lore: 2 } };
    render(<SheetRenderer def={def} mode="delve" fields={fields} onChange={() => {}} referenceLists={lists} onRoll={onRoll} dice={module.dice} />);
    // proficiency bonus at level 5 is 3: climb = might +3 and proficient +3
    expect(screen.getByTestId("pool-climb")).toHaveTextContent("1d20 + 6");
    expect(screen.getByTestId("pool-lore")).toHaveTextContent("1d20 + 5"); // wits −1, expertise +6
    expect(screen.getByTestId("pool-sneak")).toHaveTextContent("1d20 + 1");
    fireEvent.click(within(screen.getByText("Climb").closest("tr")!).getByRole("button", { name: "Roll" }));
    expect(onRoll).toHaveBeenCalledWith("climb", expect.objectContaining({ attribute: 16, skill: 1, attributeId: "might", computed: expect.objectContaining({ proficiencyBonus: 3 }) }));
  });
});
