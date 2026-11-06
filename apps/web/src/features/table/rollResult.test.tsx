/**
 * A critical injury or panic roll says what it does: the rolled row's result
 * fields the module marks for display (effect, healing time, lethal, time
 * limit) in the main view, the step and table ids and the seed under "Raw
 * result"; the injury lands on the sheet's Critical injuries (an effect the
 * module declares), and the condition badge's tooltip reads the same.
 */
import "fake-indexeddb/auto";
import { tableResultLines } from "@campaign-forge/module-sdk";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createCampaign, createEntity } from "../../state/actions";
import { CampaignContext, openCampaign } from "../../state/CampaignProvider";
import { conditionTitle, planNextSession, rollOperation, startPlannedSession } from "../../state/tableActions";
import { RollResultDialog } from "./RollResultDialog";

const opened: Array<() => void> = [];
afterEach(() => {
  cleanup();
  while (opened.length) opened.pop()?.();
});

let campaignId: string;
beforeAll(async () => {
  campaignId = await createCampaign({ name: "Injuries", moduleId: "alien" });
}, 30_000);

async function setup() {
  const ctx = await openCampaign(campaignId);
  opened.push(ctx.close);
  const rosa = createEntity(ctx, { type: "alien.character", name: "Rosa", fields: { isPC: true, attributes: { strength: 4, agility: 3, wits: 3, empathy: 2 }, stress: 4 } });
  const session = startPlannedSession(ctx, planNextSession(ctx, { title: "Hive" }).id);
  return { ctx, rosa, sessionId: session.id };
}

describe("roll result: what the result does", () => {
  it("a critical injury shows its effect and healing time, lands on the sheet, and keeps the ids under Full result", async () => {
    const { ctx, rosa, sessionId } = await setup();
    const roll = rollOperation(ctx, sessionId, "criticalInjury", rosa.id);
    const table = ctx.module.tables.get("alien.character.critical-injury")!;
    const lines = tableResultLines(table, roll.result.rolls[0]!.result);
    expect(lines.some((l) => l.label === "Effect")).toBe(true);

    render(
      <CampaignContext.Provider value={ctx}>
        <RollResultDialog roll={roll} onClose={() => undefined} resolveName={(id) => ctx.store.get("entities", id)?.name ?? id} />
      </CampaignContext.Provider>,
    );
    const meaning = screen.getByTestId("roll-result-meaning");
    for (const l of lines) expect(meaning.textContent).toContain(l.value ?? l.label);
    // the raw step id, table id and seed are folded away, not in the main view
    const raw = screen.getByTestId("roll-result-raw");
    expect(raw.tagName).toBe("DETAILS");
    expect(raw.hasAttribute("open")).toBe(false);
    expect(within(raw).getByText(/alien\.character\.critical-injury|Critical injuries/)).toBeTruthy();
    expect(meaning.textContent).not.toContain("alien.character");
    // applied, in words: the sheet field by its label
    expect(screen.getByRole("list", { name: "Applied" }).textContent).toContain(`Rosa: Critical injuries now ${roll.result.label}`);

    // the sheet's Critical injuries has it; the badge tooltip says what it does
    const after = ctx.store.get("entities", rosa.id)!;
    expect(after.fields.criticalInjuries).toEqual([{ id: `critical-injury:${roll.result.total}`, label: roll.result.label, page: 70 }]);
    const cond = after.conditions!.find((c) => c.id === `critical-injury:${roll.result.total}`)!;
    expect(conditionTitle(ctx, cond)).toContain(`Critical injuries · ${lines[0]!.value ? `${lines[0]!.label}: ${lines[0]!.value}` : lines[0]!.label}`);
  });

  it("a panic roll shows its paraphrase", async () => {
    const { ctx, rosa, sessionId } = await setup();
    const roll = rollOperation(ctx, sessionId, "panicRoll", rosa.id);
    render(
      <CampaignContext.Provider value={ctx}>
        <RollResultDialog roll={roll} onClose={() => undefined} resolveName={(id) => ctx.store.get("entities", id)?.name ?? id} />
      </CampaignContext.Provider>,
    );
    const panic = ctx.module.tables.get("alien.character.panic")!;
    const row = panic.rows.find((r) => r.label === roll.result.label)!;
    expect(screen.getByTestId("roll-result-meaning").textContent).toContain((row.result as { effect: string }).effect);
  });
});
