import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { lifecycleState, type Effect, type TrackerDef } from "@campaign-forge/module-sdk";
import { TrackerHost, getTracker, LifecycleTracker, type TrackerEntity, type TrackerProps } from "../src/index";
import { exampleModule } from "./fixtures";

const def = exampleModule.trackers.find((t) => t.id === "example.tracker.curse") as TrackerDef;

const ana: TrackerEntity = { id: "ana", name: "Ana", kind: "character", fields: {}, conditions: [] };
const bo: TrackerEntity = { id: "bo", name: "Bo", kind: "character", fields: {}, conditions: [] };

function instance(over: Record<string, unknown> = {}) {
  return { id: "c1", variant: "curse", host: "ana", hostName: "Ana", stage: "marked", progress: 120, duration: 1440, pace: "normal", paused: false, started: 0, stageStarted: 0, checksDone: 0, history: [{ stage: "marked", at: 0 }], seed: "s", ...over };
}

function Stateful(props: Omit<TrackerProps, "state" | "onChange" | "def"> & { initial?: unknown; spy?: (s: unknown) => void }) {
  const { initial, spy, ...rest } = props;
  const [state, setState] = useState<unknown>(initial);
  return (
    <TrackerHost
      {...rest}
      def={def}
      state={state}
      onChange={(s) => {
        setState(s);
        spy?.(s);
      }}
    />
  );
}

const last = (spy: ReturnType<typeof vi.fn>) => lifecycleState(spy.mock.calls.at(-1)?.[0]).instances;

describe("lifecycle tracker", () => {
  it("is registered for kind lifecycle", () => {
    expect(getTracker("lifecycle")).toBe(LifecycleTracker);
  });

  it("renders the variant's stages, time in stage against the expected time, and what comes next, from config", () => {
    render(<Stateful entities={[ana, bo]} initial={{ instances: [instance()] }} worldMinutes={120} />);
    const card = screen.getByRole("article", { name: "Ana: Marked" });
    const stages = within(card).getByRole("list", { name: "Stages" });
    expect(within(stages).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Marked Stage 1", "Fading Stage 2", "Risen Stage 3", "Lord Stage 4"]);
    expect(within(stages).getByText("Marked").closest("li")).toHaveAttribute("aria-current", "step");
    expect(within(card).getByTestId("lifecycle-stage-c1")).toHaveTextContent("Marked (Stage 1)");
    expect(card).toHaveTextContent("2 Hours of 1 Day");
    expect(card).toHaveTextContent("Next: Fading in about 22 Hours");
    expect(card).toHaveTextContent("Omen: every 6 Hours");
    expect(within(card).getByRole("progressbar", { name: "Time in Marked" })).toBeInTheDocument();
  });

  it("starts an instance for the chosen subject and variant", () => {
    const spy = vi.fn();
    const onEffects = vi.fn();
    render(<Stateful entities={[ana, bo]} spy={spy} onEffects={onEffects} worldMinutes={30} />);
    expect(screen.getByText("No curses tracked.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Victim"), { target: { value: "bo" } });
    fireEvent.click(screen.getByRole("button", { name: "Curse" }));
    const [inst] = last(spy);
    expect(inst).toMatchObject({ variant: "curse", host: "bo", hostName: "Bo", stage: "marked", started: 30, progress: 0, duration: 1440 });
    expect((onEffects.mock.calls[0]![0] as Effect[]).map((e) => e.kind)).toEqual(["log", "log"]);
    expect(screen.getByRole("article", { name: "Bo: Marked" })).toBeInTheDocument();
  });

  it("advance now, pause/resume and pace call onChange with the new state", () => {
    const spy = vi.fn();
    const onEffects = vi.fn();
    render(<Stateful entities={[ana, bo]} spy={spy} onEffects={onEffects} initial={{ instances: [instance({ stage: "fading", duration: 2880 })] }} worldMinutes={500} />);
    fireEvent.click(screen.getByRole("button", { name: "Pause Ana" }));
    expect(last(spy)[0]!.paused).toBe(true);
    expect(screen.getByText("Paused")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resume Ana" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Resume Ana" }));
    expect(last(spy)[0]!.paused).toBe(false);

    fireEvent.change(screen.getByLabelText("Pace"), { target: { value: "faster" } });
    expect(last(spy)[0]!.pace).toBe("faster");

    fireEvent.click(screen.getByRole("button", { name: "Advance Ana to Risen now" }));
    const inst = last(spy)[0]!;
    expect(inst).toMatchObject({ stage: "risen", progress: 0 });
    expect(inst.history.at(-1)).toEqual({ stage: "risen", at: 500, forced: true });
    const effects = onEffects.mock.calls.at(-1)![0] as Effect[];
    const spawn = effects.find((e) => e.kind === "createFromPreset");
    expect(spawn).toMatchObject({ preset: "example.preset.veteran", id: inst.creature, name: "Revenant of Ana", link: { type: "example.risen_from", to: "ana" } });
    // a stage that waits for the GM shows its note and the condition of the next step
    const card = screen.getByRole("article", { name: "Ana: Risen" });
    expect(card).toHaveTextContent("Waits for a dark moon.");
    expect(card).toHaveTextContent("Next: Lord when the GM decides");
    expect(within(card).getByRole("button", { name: "Advance Ana to Lord now" })).toHaveAttribute("title", "When the GM says.");
  });

  it("runs the stage check through the app and blocks removal once the stop condition is on the subject", () => {
    const onRoll = vi.fn();
    const spy = vi.fn();
    const onEffects = vi.fn();
    const { rerender } = render(<LifecycleTracker def={def} state={{ instances: [instance()] }} onChange={spy} onEffects={onEffects} entities={[ana]} onRollOperation={onRoll} />);
    fireEvent.click(screen.getByRole("button", { name: "Omen for Ana" }));
    expect(onRoll).toHaveBeenCalledWith("omen", "ana", { lifecycle: "c1" });
    fireEvent.click(screen.getByRole("button", { name: "Lift the curse: Ana" }));
    expect(last(spy)[0]!.ended).toEqual({ reason: "Lift the curse", at: 0 });
    expect(onEffects.mock.calls.at(-1)![0]).toContainEqual({ kind: "log", text: "Ana is free." });

    rerender(<LifecycleTracker def={def} state={{ instances: [instance()] }} onChange={spy} entities={[{ ...ana, conditions: ["example.marked"] }]} onRollOperation={onRoll} />);
    expect(screen.getByRole("button", { name: "Lift the curse: Ana" })).toBeDisabled();
    expect(screen.getByText("Too late to lift it.")).toBeInTheDocument();
  });

  it("stops tracking, and is read-only without controls", () => {
    const spy = vi.fn();
    const { rerender } = render(<LifecycleTracker def={def} state={{ instances: [instance()], note: "kept" }} onChange={spy} entities={[ana]} />);
    fireEvent.click(screen.getByRole("button", { name: "Stop tracking Ana" }));
    expect(spy).toHaveBeenLastCalledWith({ instances: [], note: "kept" });
    rerender(<LifecycleTracker def={def} state={{ instances: [instance()] }} onChange={spy} entities={[ana]} readonly />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("article", { name: "Ana: Marked" })).toBeInTheDocument();
  });
});
