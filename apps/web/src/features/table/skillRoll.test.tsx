/**
 * Table mode's skill roll keeps the character link while the GM adjusts it:
 * a − / + modifier in dice and a pick of the gear on the sheet that helps the
 * skill, both in the pool and named on the roll's log line.
 */
import "fake-indexeddb/auto";
import type { Entity, Id } from "@campaign-forge/core";
import { addCatalogItem, gearCatalogFieldOf } from "@campaign-forge/module-sdk";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { DiceRollerProvider } from "../../components/ui";
import { createCampaign, createEntity } from "../../state/actions";
import { CampaignContext, openCampaign, type CampaignContextValue } from "../../state/CampaignProvider";
import { useRecord } from "../../state/hooks";
import { DICE_LOG, planNextSession, sessionTrackerState, startPlannedSession } from "../../state/tableActions";
import { SkillRoll } from "./DicePanel";

const opened: Array<() => void> = [];
afterEach(() => {
  cleanup();
  while (opened.length) opened.pop()?.();
});

let campaignId: string;
beforeAll(async () => {
  campaignId = await createCampaign({ name: "Skill rolls", moduleId: "alien", mode: "campaign" });
}, 30_000);

async function setup() {
  const ctx = await openCampaign(campaignId);
  opened.push(ctx.close);
  const def = ctx.module.entityType("alien.character")!;
  let fields: Record<string, unknown> = { isPC: true, attributes: { strength: 3, agility: 3, wits: 3, empathy: 2 }, skills: { observation: 1, mobility: 2 }, stress: 0, gear: [], weapons: [] };
  for (const id of ["alien.item.binoculars", "alien.item.irc-mk50-compression-suit"]) fields = addCatalogItem(def, gearCatalogFieldOf(def)!, fields, ctx.module.preset(id)!).fields;
  const dana = createEntity(ctx, { type: "alien.character", name: "Dana", fields });
  const session = startPlannedSession(ctx, planNextSession(ctx, { title: "Sweep" }).id);
  return { ctx, sessionId: session.id, dana };
}

function Rolls({ sessionId, pcId }: { sessionId: Id; pcId: Id }) {
  const pc = useRecord("entities", pcId) as Entity;
  return <SkillRoll sessionId={sessionId} pcs={[pc]} />;
}
const Harness = ({ ctx, sessionId, pcId }: { ctx: CampaignContextValue; sessionId: Id; pcId: Id }) => (
  <CampaignContext.Provider value={ctx}>
    <DiceRollerProvider>
      <Rolls sessionId={sessionId} pcId={pcId} />
    </DiceRollerProvider>
  </CampaignContext.Provider>
);
const lastRoll = (ctx: CampaignContextValue, sessionId: Id) => (sessionTrackerState(ctx.store, sessionId)?.log ?? []).filter((l) => l.tracker === DICE_LOG).at(-1);

describe("the skill roll at the table", () => {
  it("adds the binoculars and a +1 modifier to OBSERVATION, keeps the roll on Dana and logs both", async () => {
    const { ctx, sessionId, dana } = await setup();
    render(<Harness ctx={ctx} sessionId={sessionId} pcId={dana.id} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Character" }), { target: { value: dana.id } });
    fireEvent.change(screen.getByRole("combobox", { name: "Skill" }), { target: { value: "observation" } });
    const gear = screen.getByRole("combobox", { name: "Gear bonus" }) as HTMLSelectElement;
    // only the gear that changes this skill
    expect([...gear.options].map((o) => o.textContent)).toEqual(["No gear", "Binoculars (+2)"]);
    fireEvent.change(gear, { target: { value: gear.options[1]!.value } });
    const panel = screen.getByTestId("dice-panel");
    expect(within(panel).getByTestId("dicepool").textContent).toContain("Gear");
    fireEvent.click(within(within(panel).getByTestId("roll-option-modifier")).getByRole("button", { name: "Increase Modifier (dice)" }));
    fireEvent.click(within(panel).getByRole("button", { name: "Roll" }));
    const roll = lastRoll(ctx, sessionId)!;
    // Wits 3 + Observation 1 + binoculars 2 + modifier 1
    expect(roll.text).toMatch(/^Dana: Observation \(Binoculars \+2, Modifier \+1\): 7 base \+ 0 stress/);
    expect(roll.entity ?? (roll.data as { entityId?: string }).entityId).toBe(dana.id);
  });

  it("offers the suit's MOBILITY penalty, and no gear pick for a skill no gear helps", async () => {
    const { ctx, sessionId, dana } = await setup();
    render(<Harness ctx={ctx} sessionId={sessionId} pcId={dana.id} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Character" }), { target: { value: dana.id } });
    fireEvent.change(screen.getByRole("combobox", { name: "Skill" }), { target: { value: "mobility" } });
    expect([...(screen.getByRole("combobox", { name: "Gear bonus" }) as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(["No gear", "IRC Mk.50 Compression Suit (−1)"]);
    fireEvent.change(screen.getByRole("combobox", { name: "Skill" }), { target: { value: "comtech" } });
    expect(screen.queryByRole("combobox", { name: "Gear bonus" })).toBeNull();
    // a plain roll logs as before
    fireEvent.click(within(screen.getByTestId("dice-panel")).getByRole("button", { name: "Roll" }));
    expect(lastRoll(ctx, sessionId)!.text).toMatch(/^Dana: Comtech: /);
  });

  // Walkthrough 3 (A14): a broken PC rolled skills with no warning
  it("says what a broken character can still do, from the module's brokenNote", async () => {
    const { ctx, sessionId, dana } = await setup();
    render(<Harness ctx={ctx} sessionId={sessionId} pcId={dana.id} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Character" }), { target: { value: dana.id } });
    fireEvent.change(screen.getByRole("combobox", { name: "Skill" }), { target: { value: "mobility" } });
    expect(screen.queryByTestId("roll-broken-note")).toBeNull();
    cleanup();
    ctx.store.update("entities", dana.id, { fields: { ...ctx.store.get("entities", dana.id)!.fields, damage: 99 } });
    render(<Harness ctx={ctx} sessionId={sessionId} pcId={dana.id} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Character" }), { target: { value: dana.id } });
    fireEvent.change(screen.getByRole("combobox", { name: "Skill" }), { target: { value: "mobility" } });
    expect(screen.getByTestId("roll-broken-note").textContent).toContain("Dana is broken. Only one move action a round");
  });
});
