import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { createRng, type RollResult } from "@campaign-forge/module-sdk";
import { DiceRollPanel, RollLog } from "../src/index";
import { exampleDice } from "./fixtures";

const input = { attribute: 3, skill: 2 };

function faces(container: HTMLElement): number[] {
  return [...container.querySelectorAll<HTMLElement>(".cf-dice__faces .cf-die")].map((el) => Number(el.dataset.value));
}

describe("DiceRollPanel", () => {
  it("shows the pool breakdown and rolls deterministically with a seeded rng", () => {
    const onRolled = vi.fn();
    const { container } = render(<DiceRollPanel dice={exampleDice} input={input} rng={createRng("ui-seed")} onRolled={onRolled} />);
    expect(screen.getByTestId("dicepool")).toHaveTextContent("Attribute+3");
    expect(screen.getByTestId("dicepool")).toHaveTextContent("= 5");

    fireEvent.click(screen.getByRole("button", { name: "Roll" }));
    const expected = exampleDice.roll(exampleDice.buildPool(input), createRng("ui-seed"));
    expect(onRolled).toHaveBeenCalledWith(expected);
    expect(faces(container)).toEqual(expected.dice.map((d) => d.value));
    expect(screen.getByTestId("successes")).toHaveTextContent(String(expected.successes));
    expect(screen.getByTestId("describe")).toHaveTextContent(exampleDice.describe(expected));
    // Symbol badges come from DieSpec.symbols.
    const successFaces = expected.dice.filter((d) => d.value >= 5).length;
    expect(container.querySelectorAll('.cf-dice__faces [data-symbol="success"]')).toHaveLength(successFaces);
  });

  it("offers a push when the result allows it, and not after the single push", () => {
    const onRolled = vi.fn();
    render(<DiceRollPanel dice={exampleDice} input={input} rng={createRng("push-seed")} onRolled={onRolled} allowPush />);
    fireEvent.click(screen.getByRole("button", { name: "Roll" }));
    const push = screen.getByRole("button", { name: "Push" });
    expect(push).toBeEnabled();

    const rng = createRng("push-seed");
    const first = exampleDice.roll(exampleDice.buildPool(input), rng);
    const pushed = exampleDice.push!(first, rng);
    fireEvent.click(push);
    expect(onRolled).toHaveBeenLastCalledWith(pushed);
    expect((onRolled.mock.lastCall![0] as RollResult).pushes).toBe(1);
    expect(screen.getByRole("button", { name: "Push" })).toBeDisabled();
    expect(screen.getByTestId("describe")).toHaveTextContent("(pushed)");
  });

  it("disables push when allowPush is false", () => {
    render(<DiceRollPanel dice={exampleDice} input={input} rng={createRng("x")} onRolled={() => {}} allowPush={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Roll" }));
    expect(screen.getByRole("button", { name: "Push" })).toBeDisabled();
  });

  it("keeps the result when a parent re-renders with a new but equal input object", () => {
    function Parent() {
      const [log, setLog] = useState<RollResult[]>([]);
      return (
        <>
          <DiceRollPanel dice={exampleDice} input={{ attribute: 2, skill: 1 }} rng={createRng("p")} onRolled={(r) => setLog((l) => [...l, r])} />
          <span data-testid="count">{log.length}</span>
        </>
      );
    }
    render(<Parent />);
    fireEvent.click(screen.getByRole("button", { name: "Roll" }));
    expect(screen.getByTestId("count")).toHaveTextContent("1");
    expect(screen.getByTestId("successes")).toBeInTheDocument();
  });
});

describe("RollLog", () => {
  it("lists entries newest first", () => {
    const r = exampleDice.roll(exampleDice.buildPool({ attribute: 1 }), createRng("log"));
    render(
      <RollLog
        dice={exampleDice}
        entries={[
          { id: "1", label: "First", result: r },
          { id: "2", label: "Second", summary: "a note" },
        ]}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Second");
    expect(items[1]).toHaveTextContent("First");
  });
});
