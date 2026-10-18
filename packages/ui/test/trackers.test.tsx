import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { createRng, type TrackerDef } from "@campaign-forge/module-sdk";
import { TrackerHost, getTracker, initiativeState, registerTracker, type TrackerProps } from "../src/index";

function Stateful(props: Omit<TrackerProps, "state" | "onChange"> & { initial?: unknown; spy?: (s: unknown) => void }) {
  const { initial, spy, ...rest } = props;
  const [state, setState] = useState<unknown>(initial);
  return (
    <>
      <TrackerHost
        {...rest}
        state={state}
        onChange={(s) => {
          setState(s);
          spy?.(s);
        }}
      />
      <pre data-testid="state">{JSON.stringify(state ?? null)}</pre>
    </>
  );
}

const clockDef: TrackerDef = {
  id: "t.clock",
  name: "Clock",
  kind: "clock",
  scope: "session",
  config: {
    units: [
      { id: "round", name: "Round", duration: "5–10 s", minutes: 0.1 },
      { id: "stretch", name: "Stretch", duration: "5–10 min", minutes: 10 },
      { id: "shift", name: "Shift", duration: "5–10 h", minutes: 360 },
    ],
  },
};

describe("clock tracker", () => {
  it("advances units, resets smaller units when a bigger one advances, and resets", () => {
    const spy = vi.fn();
    const onLog = vi.fn();
    render(<Stateful def={clockDef} spy={spy} onLog={onLog} />);
    fireEvent.click(screen.getByRole("button", { name: "Advance one Round" }));
    fireEvent.click(screen.getByRole("button", { name: "Advance one Round" }));
    expect(screen.getByTestId("clock-round")).toHaveTextContent("2");
    expect(spy).toHaveBeenLastCalledWith({ counters: { round: 2, stretch: 0, shift: 0 } });

    fireEvent.click(screen.getByRole("button", { name: "Advance one Stretch" }));
    expect(spy).toHaveBeenLastCalledWith({ counters: { round: 0, stretch: 1, shift: 0 } });
    expect(screen.getByText(/about 10 min elapsed/)).toBeInTheDocument();
    expect(onLog).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(spy).toHaveBeenLastCalledWith({ counters: { round: 0, stretch: 0, shift: 0 } });
  });
});

describe("initiative tracker", () => {
  const def: TrackerDef = { id: "t.init", name: "Initiative", kind: "initiative", scope: "encounter", config: { drawsField: "speed" } };
  const entities = [
    { id: "e1", name: "Ripley", fields: { speed: 1 } },
    { id: "e2", name: "Beast", fields: { speed: 2 } },
  ];

  it("adds participants, draws distinct cards with a seeded rng, marks acted and starts the next round", () => {
    const spy = vi.fn();
    render(<Stateful def={def} spy={spy} entities={entities} rng={createRng("init")} />);
    const add = (id: string) => {
      fireEvent.change(screen.getByRole("combobox", { name: "Add from entities" }), { target: { value: id } });
      fireEvent.click(screen.getByRole("button", { name: "Add" }));
    };
    add("e1");
    add("e2");
    fireEvent.change(screen.getByRole("textbox", { name: "Participant name" }), { target: { value: "Guard" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    let st = initiativeState(spy.mock.lastCall![0]);
    expect(st.participants.map((p) => p.name)).toEqual(["Ripley", "Beast", "Guard"]);
    expect(st.participants.find((p) => p.name === "Beast")!.extraDraws).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "Draw cards" }));
    st = initiativeState(spy.mock.lastCall![0]);
    const cards = st.participants.map((p) => p.card);
    expect(cards.every((c) => typeof c === "number" && c >= 1 && c <= 10)).toBe(true);
    expect(new Set(cards).size).toBe(3);

    // Rows are sorted by card.
    const rows = [...document.querySelectorAll<HTMLElement>("[data-participant]")];
    const shown = rows.map((r) => Number(within(r).getByTestId(/^card-/).textContent));
    expect(shown).toEqual([...shown].sort((a, b) => a - b));

    fireEvent.click(screen.getByRole("checkbox", { name: "Ripley acted" }));
    expect(initiativeState(spy.mock.lastCall![0]).participants.find((p) => p.name === "Ripley")!.acted).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Next round" }));
    st = initiativeState(spy.mock.lastCall![0]);
    expect(st.round).toBe(2);
    expect(st.participants.every((p) => !p.acted)).toBe(true);
    expect(screen.getByText("Round 2")).toBeInTheDocument();
  });

  it("is deterministic for the same seed", () => {
    const run = () => {
      const spy = vi.fn();
      const { unmount } = render(
        <Stateful
          def={def}
          spy={spy}
          rng={createRng("same")}
          initial={{ round: 1, participants: ["A", "B", "C", "D"].map((n) => ({ id: n, name: n, card: null, extraDraws: 0, acted: false })) }}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Draw cards" }));
      unmount();
      return initiativeState(spy.mock.lastCall![0]).participants.map((p) => p.card);
    };
    expect(run()).toEqual(run());
  });
});

describe("stress tracker", () => {
  it("writes stress through incrementField effects and asks the app to run panic rolls", () => {
    const def: TrackerDef = { id: "t.stress", name: "Stress", kind: "stress", scope: "character", binds: ["example.hero.wounds"] };
    const onEffects = vi.fn();
    const onRollOperation = vi.fn();
    render(
      <TrackerHost
        def={def}
        state={{ panicLog: [{ at: "2026-10-18T10:00:00Z", entity: "e1", total: 11, label: "Freeze" }] }}
        onChange={() => {}}
        entities={[{ id: "e1", name: "Hero", type: "example.hero", fields: { wounds: 4 }, computed: { resolve: 3 } }]}
        onEffects={onEffects}
        onRollOperation={onRollOperation}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Raise Hero stress" }));
    expect(onEffects).toHaveBeenCalledWith([{ kind: "incrementField", entity: "e1", path: "wounds", by: 1, min: 0, max: 10 }]);
    fireEvent.click(screen.getByRole("button", { name: "Panic roll" }));
    expect(onRollOperation).toHaveBeenCalledWith("panicRoll", "e1");
    expect(screen.getByText("Panic")).toBeInTheDocument();
    expect(screen.getByText("Resolve 3")).toBeInTheDocument();
  });
});

describe("tracker registry", () => {
  it("falls back to the generic tracker for unknown kinds", () => {
    const def: TrackerDef = { id: "t.x", name: "Mystery", kind: "mystery", scope: "session" };
    expect(getTracker("mystery")).toBeUndefined();
    const spy = vi.fn();
    render(<Stateful def={def} spy={spy} initial={{ a: 1 }} />);
    expect(screen.getByText(/Unknown tracker kind/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Tracker state" }), { target: { value: '{"a":2}' } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(spy).toHaveBeenLastCalledWith({ a: 2 });
  });

  it("uses a registered component for a new kind", () => {
    registerTracker("mystery2", ({ def }) => <div>custom {def.name}</div>);
    render(<TrackerHost def={{ id: "t.y", name: "Thing", kind: "mystery2", scope: "session" }} state={undefined} onChange={() => {}} />);
    expect(screen.getByText("custom Thing")).toBeInTheDocument();
  });
});

describe("story points tracker", () => {
  const def: TrackerDef = { id: "sp", name: "Story points", kind: "story-points", scope: "character", binds: ["x.hero.storyPoints"], config: { max: 3 } };
  it("reads and writes the bound entity field through effects", () => {
    const onEffects = vi.fn();
    const onChange = vi.fn();
    render(
      <TrackerHost def={def} state={{}} onChange={onChange} onEffects={onEffects} entities={[{ id: "h1", name: "Ripley", type: "x.hero", fields: { storyPoints: 2 } }]} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Award Ripley story point" }));
    expect(onEffects).toHaveBeenCalledWith([{ kind: "setField", entity: "h1", path: "storyPoints", value: 3 }]);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("stress tracker exemption", () => {
  it("hides roll buttons for characters flagged by exemptField", () => {
    const def: TrackerDef = { id: "st", name: "Stress", kind: "stress", scope: "character", binds: ["stress"], config: { exemptField: "synthetic", exemptLabel: "Synthetic" } };
    render(
      <TrackerHost
        def={def}
        state={{}}
        onChange={() => {}}
        onRollOperation={() => {}}
        entities={[
          { id: "a", name: "Ash", fields: { stress: 0, synthetic: true } },
          { id: "b", name: "Ripley", fields: { stress: 0 } },
        ]}
      />,
    );
    expect(screen.getAllByRole("button", { name: "Panic roll" })).toHaveLength(1);
    expect(screen.getByText("Synthetic")).toBeInTheDocument();
  });
});
