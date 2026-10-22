import { alienModule } from "@campaign-forge/module-alien";
import { loadModule } from "@campaign-forge/module-sdk";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useMemo, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { runGenerator, stepRun, stepViews, type GeneratorRequest } from "./runner";
import { StepList } from "./StepList";

const alien = loadModule(alienModule, { skipProcedureRuns: true });
const procedure = alien.procedure("alien.job.create")!;
const base: GeneratorRequest = { procedureId: "alien.job.create", seed: "nostromo", inputs: { frame: "space-truckers", pcCount: 4 } };

/** The workbench's step list with just enough state to enter one step's dice. */
function Harness() {
  const [stepDice, setStepDice] = useState<Record<string, number[]>>({});
  const [entering, setEntering] = useState<string | undefined>();
  const req = { ...base, stepDice };
  const graph = useMemo(() => runGenerator(alien, req), [JSON.stringify(stepDice)]);
  const steps = stepViews(procedure, graph);
  return (
    <StepList
      steps={steps}
      changed={new Set()}
      pinnedRolls={{}}
      includeOptional={[]}
      onReroll={() => {}}
      onPin={() => {}}
      onUnpin={() => {}}
      onResetSeed={() => {}}
      onToggleOptional={() => {}}
      entering={entering ? { stepId: entering, run: stepRun(alien, req, entering), remaining: 1 } : undefined}
      onEnter={setEntering}
      onEntered={(id, faces) => {
        setStepDice((d) => ({ ...d, [id]: faces }));
        setEntering(undefined);
      }}
      onCancelEnter={() => setEntering(undefined)}
    />
  );
}

afterEach(cleanup);

describe("generator step entry", () => {
  it("types a step's dice and shows the step as entered with its new result", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Enter roll for Difficulty (D3)" }));
    const input = screen.getByLabelText("Die 1: d3");
    fireEvent.change(input, { target: { value: "4" } });
    expect(screen.getByRole("alert").textContent).toContain("shows 1–3");
    fireEvent.change(input, { target: { value: "2" } });
    fireEvent.click(screen.getByTestId("enter-dice-submit"));
    expect(screen.getByTestId("step-entered-difficulty")).toBeTruthy();
    expect(screen.getByTestId("step-result-difficulty").textContent).toBe("2");
  });

  it("a table step asks for its table's dice (a d66 as one number)", () => {
    render(<Harness />);
    const tableStep = stepViews(procedure, runGenerator(alien, base)).find((s) => s.rolls.some((r) => r.dice === "d66"));
    if (!tableStep) return;
    fireEvent.click(screen.getByTestId(`enter-roll-${tableStep.id}`));
    fireEvent.change(screen.getByLabelText("Die 1: d66"), { target: { value: "17" } });
    expect(screen.getByRole("alert").textContent).toContain("d66 can't make 17");
  });
});
