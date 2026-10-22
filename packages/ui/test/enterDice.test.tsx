import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createDiceEngine, createRng, createTableRegistry, recordDice, rollTable, type RollResult, type RollTable } from "@campaign-forge/module-sdk";
import { DiceRollerProvider, DiceRollPanel, EnterDice, InitiativeTracker, RollLog, setPhysicalDice, useDiceRoller } from "../src/index";
import { exampleDice } from "./fixtures";

const input = { attribute: 3, skill: 2 };

function type(i: number, value: string) {
  fireEvent.change(screen.getByTestId(`enter-die-${i}`), { target: { value } });
}

afterEach(() => setPhysicalDice(false));

describe("DiceRollPanel with dice rolled at the table", () => {
  it("asks for one input per die and gives the same result as an app roll with those faces", () => {
    const onRolled = vi.fn();
    render(<DiceRollPanel dice={exampleDice} input={input} rng={createRng("x")} onRolled={onRolled} physical />);
    expect(screen.queryByRole("button", { name: "Roll" })).toBeNull();
    // the app roll we want to reproduce
    const rec = recordDice(createRng("table"));
    const app = exampleDice.roll(exampleDice.buildPool(input), rec.rng);
    expect(rec.faces).toHaveLength(5);
    rec.faces.forEach((f, i) => type(i, String(f)));
    fireEvent.click(screen.getByTestId("enter-dice-submit"));
    expect(onRolled).toHaveBeenCalledWith(app, rec.faces);
    expect(screen.getByTestId("successes")).toHaveTextContent(String(app.successes));
    expect(screen.getByTestId("roll-entered")).toBeInTheDocument();
  });

  it("checks values inline and only submits when every die fits", () => {
    const onRolled = vi.fn();
    render(<DiceRollPanel dice={exampleDice} input={{ attribute: 1, skill: 1 }} rng={createRng("x")} onRolled={onRolled} physical />);
    type(0, "7");
    expect(screen.getByRole("alert")).toHaveTextContent("shows 1–6");
    expect(screen.getByTestId("enter-dice-submit")).toBeDisabled();
    type(0, "6");
    expect(screen.getByTestId("enter-dice-status")).toHaveTextContent("Needs 1 more die.");
    fireEvent.submit(screen.getByTestId("enter-dice"));
    expect(onRolled).not.toHaveBeenCalled();
    type(1, "2");
    fireEvent.submit(screen.getByTestId("enter-dice"));
    expect(onRolled).toHaveBeenCalledTimes(1);
  });

  it("a push asks only for the re-rolled dice", () => {
    const onRolled = vi.fn();
    render(<DiceRollPanel dice={exampleDice} input={{ attribute: 2, skill: 1 }} rng={createRng("x")} onRolled={onRolled} physical />);
    ["6", "2", "3"].forEach((v, i) => type(i, v));
    fireEvent.click(screen.getByTestId("enter-dice-submit"));
    const first = onRolled.mock.calls[0]![0] as RollResult;
    expect(first.successes).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Push" }));
    expect(screen.getAllByTestId(/^enter-die-/)).toHaveLength(2);
    type(0, "5");
    type(1, "6");
    fireEvent.click(screen.getByTestId("enter-dice-submit"));
    const pushed = onRolled.mock.calls[1]![0] as RollResult;
    expect(onRolled.mock.calls[1]![1]).toEqual([5, 6]);
    expect(pushed).toEqual(
      exampleDice.push!(first, {
        next: () => 0,
        int: (() => {
          const q = [5, 6];
          return () => q.shift()!;
        })(),
        fork() {
          return this;
        },
      }),
    );
    expect(pushed.pushes).toBe(1);
  });

  it("switches between rolling in the app and entering dice", () => {
    const onRolled = vi.fn();
    render(<DiceRollPanel dice={exampleDice} input={input} rng={createRng("ui-seed")} onRolled={onRolled} />);
    expect(screen.queryByTestId("enter-dice")).toBeNull();
    fireEvent.click(screen.getByTestId("dice-mode-enter"));
    expect(screen.getByTestId("enter-dice")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("dice-mode-app"));
    fireEvent.click(screen.getByRole("button", { name: "Roll" }));
    expect(onRolled).toHaveBeenCalledWith(exampleDice.roll(exampleDice.buildPool(input), createRng("ui-seed")));
  });

  it("the per-device preference makes entering dice the default", () => {
    setPhysicalDice(true);
    render(
      <DiceRollerProvider>
        <DiceRollPanel dice={exampleDice} input={input} rng={createRng("x")} onRolled={() => {}} />
      </DiceRollerProvider>,
    );
    expect(screen.getByTestId("enter-dice")).toBeInTheDocument();
    expect(screen.getByTestId("dice-mode-enter")).toHaveAttribute("aria-pressed", "true");
  });

  it("d20 with advantage asks for two d20 and keeps the higher", () => {
    const d20 = createDiceEngine({ engine: "d20" });
    const onRolled = vi.fn();
    render(<DiceRollPanel dice={d20} input={{ attribute: 12, dc: 15 }} rng={createRng("x")} onRolled={onRolled} physical />);
    fireEvent.change(screen.getByTestId("roll-option-advantage"), { target: { value: "advantage" } });
    expect(screen.getAllByTestId(/^enter-die-/)).toHaveLength(2);
    type(0, "3");
    type(1, "15");
    fireEvent.click(screen.getByTestId("enter-dice-submit"));
    expect(screen.getByTestId("roll-total")).toHaveTextContent("16");
    expect((onRolled.mock.calls[0]![0] as RollResult).dice.map((d) => !!d.dropped)).toEqual([true, false]);
  });
});

describe("EnterDice", () => {
  const tables: RollTable[] = [
    {
      id: "t.a",
      name: "A",
      dice: "2d6",
      original: true,
      rows: [
        { range: [2, 6], result: "low" },
        { range: [7, 12], result: "high", roll: [{ table: "t.b", as: "b" }] },
      ],
    },
    { id: "t.b", name: "B", dice: "d66", original: true, rows: [{ range: [11, 66], result: "x" }] },
  ];
  const registry = createTableRegistry(tables);
  const run = (rng: Parameters<typeof rollTable>[1]) => rollTable(tables[0]!, rng, registry);

  it("takes a 2d6 total, then the nested d66 once the row needs it; or each die", () => {
    const onSubmit = vi.fn();
    render(<EnterDice run={run} onSubmit={onSubmit} />);
    expect(screen.getByLabelText("Die 1: 2d6 total")).toBeInTheDocument();
    type(0, "9");
    expect(screen.getByLabelText("Die 2: d66")).toBeInTheDocument();
    type(1, "43");
    fireEvent.click(screen.getByTestId("enter-dice-submit"));
    expect(onSubmit).toHaveBeenCalledWith([6, 3, 4, 3]);
    fireEvent.click(screen.getByTestId("enter-each-die"));
    expect(screen.getByLabelText("Die 1: d6")).toBeInTheDocument();
    expect(screen.getByLabelText("Die 2: d6")).toBeInTheDocument();
  });
});

describe("DiceRollerProvider", () => {
  function Button({ perform }: { perform: (entered?: number[]) => void }) {
    const roller = useDiceRoller();
    return (
      <button type="button" onClick={() => roller.roll({ title: "Omen", run: (rng) => rng.int(1, 6, { label: "Omen die" }), perform })}>
        Omen
      </button>
    );
  }

  it("performs right away in app mode and asks for the dice in physical mode", () => {
    const perform = vi.fn();
    const { unmount } = render(
      <DiceRollerProvider>
        <Button perform={perform} />
      </DiceRollerProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Omen" }));
    expect(perform).toHaveBeenCalledWith();
    unmount();
    act(() => setPhysicalDice(true));
    render(
      <DiceRollerProvider>
        <Button perform={perform} />
      </DiceRollerProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Omen" }));
    expect(screen.getByLabelText("Die 1: Omen die")).toBeInTheDocument();
    type(0, "4");
    fireEvent.click(screen.getByTestId("enter-dice-submit"));
    expect(perform).toHaveBeenLastCalledWith([4]);
  });
});

describe("Roll log and initiative", () => {
  it("marks entries rolled at the table", () => {
    render(<RollLog entries={[{ id: "1", label: "Ripley: Mobility", entered: [6, 2, 3] }]} />);
    expect(screen.getByTestId("rolllog-entered")).toHaveTextContent("entered");
    expect(screen.getByText(/rolled at the table: 6 2 3/)).toBeInTheDocument();
  });

  it("rolled initiative asks each participant's die and adds the modifier", () => {
    setPhysicalDice(true);
    const onChange = vi.fn();
    const def = { id: "init", kind: "initiative", name: "Initiative", config: { method: "roll", modifier: 2 } } as never;
    const state = {
      round: 1,
      participants: [
        { id: "p1", name: "Ana", entityId: "e1", card: null, extraDraws: 0, acted: false },
        { id: "p2", name: "Bo", entityId: "e2", card: null, extraDraws: 0, acted: false },
      ],
    };
    const entities = [
      { id: "e1", name: "Ana", fields: {} },
      { id: "e2", name: "Bo", fields: {} },
    ];
    render(
      <DiceRollerProvider>
        <InitiativeTracker def={def} state={state} onChange={onChange} entities={entities} rng={createRng("i")} />
      </DiceRollerProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Roll initiative" }));
    expect(screen.getByLabelText("Die 1: Ana: d20")).toBeInTheDocument();
    type(0, "11");
    type(1, "18");
    fireEvent.click(screen.getByTestId("enter-dice-submit"));
    const next = onChange.mock.calls[0]![0] as { participants: Array<{ card: number; detail: string }> };
    expect(next.participants.map((p) => [p.card, p.detail])).toEqual([
      [13, "11 + 2 (entered)"],
      [20, "18 + 2 (entered)"],
    ]);
  });
});
