import "fake-indexeddb/auto";
import { healthState, presetToEntity, type Entity, type Id } from "@campaign-forge/core";
import { weaponRowFromPreset } from "@campaign-forge/module-alien";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { DiceRollerProvider, setPhysicalDice } from "../../components/ui";
import { createCampaign, createEntity } from "../../state/actions";
import { CampaignContext, openCampaign, type CampaignContextValue } from "../../state/CampaignProvider";
import { useRecord } from "../../state/hooks";
import { DICE_LOG, planNextSession, sessionTrackerState, startPlannedSession, type DiceLogData } from "../../state/tableActions";
import { SkillRoll } from "./DicePanel";
import { weaponChoices } from "./WeaponAttack";

const opened: Array<() => void> = [];
afterEach(() => {
  cleanup();
  setPhysicalDice(false);
  while (opened.length) opened.pop()?.();
});

let alienId: string;
beforeAll(async () => {
  alienId = await createCampaign({ name: "Weapons (Alien)", moduleId: "alien", mode: "campaign" });
}, 30_000);

async function setup() {
  const ctx = await openCampaign(alienId);
  opened.push(ctx.close);
  const rifle = weaponRowFromPreset(ctx.module.preset("alien.item.armat-m41a-pulse-rifle")!);
  const knife = { name: "Kitchen knife", bonus: 0, damage: 1, rangeMin: "adjacent", range: "adjacent", weight: 0.5 };
  const vera = createEntity(ctx, {
    type: "alien.character",
    name: "Vera",
    fields: { isPC: true, attributes: { strength: 3, agility: 4, wits: 3, empathy: 2 }, skills: { closeCombat: 1, rangedCombat: 2 }, stress: 0, weapons: [rifle, knife] },
  });
  const drone = presetToEntity(ctx.store, ctx.module.preset("alien.creature.xx121-drone")!, { name: "Drone" });
  const session = startPlannedSession(ctx, planNextSession(ctx, { title: "Hive" }).id);
  return { ctx, sessionId: session.id, vera, drone };
}

function Harness({ ctx, sessionId, pcId, otherId }: { ctx: CampaignContextValue; sessionId: Id; pcId: Id; otherId: Id }) {
  return (
    <CampaignContext.Provider value={ctx}>
      <DiceRollerProvider>
        <Rolls sessionId={sessionId} pcId={pcId} otherId={otherId} />
      </DiceRollerProvider>
    </CampaignContext.Provider>
  );
}
function Rolls({ sessionId, pcId, otherId }: { sessionId: Id; pcId: Id; otherId: Id }) {
  const pc = useRecord("entities", pcId) as Entity;
  const other = useRecord("entities", otherId) as Entity;
  return <SkillRoll sessionId={sessionId} pcs={[pc]} others={[other]} />;
}

const diceLog = (ctx: CampaignContextValue, sessionId: Id) => (sessionTrackerState(ctx.store, sessionId)?.log ?? []).filter((l) => l.tracker === DICE_LOG);

describe("attack with a weapon from the sheet (Dice tab)", () => {
  it("offers each weapon on the PC's sheet", async () => {
    const { ctx, vera } = await setup();
    expect(weaponChoices(ctx.module, vera).map((c) => c.label)).toEqual(["Attack with Armat M41A Pulse Rifle", "Attack with Kitchen knife"]);
  });

  it("rolls RANGED COMBAT with the rifle's modifier, takes entered dice, shows the damage and applies it to the drone through its armor", async () => {
    setPhysicalDice(true);
    const { ctx, sessionId, vera, drone } = await setup();
    render(<Harness ctx={ctx} sessionId={sessionId} pcId={vera.id} otherId={drone.id} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Character" }), { target: { value: vera.id } });
    fireEvent.change(screen.getByRole("combobox", { name: "Skill" }), { target: { value: "weapon:0" } });
    const panel = screen.getByTestId("weapon-attack");
    expect((within(panel).getByRole("combobox", { name: "Range" }) as HTMLSelectElement).value).toBe("short");
    expect(within(panel).getByTestId("weapon-stats").textContent).toContain("Damage2");
    // Agility 4 + Ranged Combat 2 + the rifle's +2: eight base dice, no stress
    const boxes = within(panel).getAllByTestId(/^enter-die-\d+$/);
    expect(boxes).toHaveLength(8);
    [6, 6, 6, 2, 3, 4, 1, 5].forEach((f, i) => fireEvent.change(boxes[i]!, { target: { value: String(f) } }));
    act(() => {
      fireEvent.click(within(panel).getByTestId("enter-dice-submit"));
    });
    // three successes: 2 base + 2 extra
    expect(within(panel).getByTestId("weapon-damage").textContent).toContain("Hit: 4 damage");
    expect(within(panel).getByTestId("weapon-damage").textContent).toContain("armor piercing");
    const rolled = diceLog(ctx, sessionId).at(-1)!;
    expect(rolled.text).toMatch(/^Vera: Armat M41A Pulse Rifle \(Ranged Combat, Short\): 8 base \+ 0 stress: 6 6 6 2 3 4 1 5; 3 successes/);
    expect((rolled.data as DiceLogData).entered).toEqual([6, 6, 6, 2, 3, 4, 1, 5]);

    fireEvent.change(within(panel).getByRole("combobox", { name: "Target" }), { target: { value: drone.id } });
    fireEvent.click(within(panel).getByRole("button", { name: "Apply to Drone" }));
    const armor = Number(drone.fields.armor);
    const through = Math.max(0, 4 - Math.max(0, armor - 1));
    expect(ctx.store.get("entities", drone.id)!.fields.damage).toBe(through);
    expect(healthState(ctx.module, ctx.store.get("entities", drone.id)!)!.damage).toBe(through);
    expect(within(panel).getByTestId("hit-result").textContent).toContain("armor piercing");
    expect(diceLog(ctx, sessionId).at(-1)!.text).toMatch(/^Drone takes a hit \(Vera: Armat M41A Pulse Rifle\)/);
  });

  it("at Adjacent the rifle rolls CLOSE COMBAT at −2; the knife cannot reach Short", async () => {
    const { ctx, sessionId, vera, drone } = await setup();
    render(<Harness ctx={ctx} sessionId={sessionId} pcId={vera.id} otherId={drone.id} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Character" }), { target: { value: vera.id } });
    fireEvent.change(screen.getByRole("combobox", { name: "Skill" }), { target: { value: "weapon:0" } });
    let panel = screen.getByTestId("weapon-attack");
    fireEvent.change(within(panel).getByRole("combobox", { name: "Range" }), { target: { value: "adjacent" } });
    panel = screen.getByTestId("weapon-attack");
    expect(within(panel).getByText("Close Combat")).toBeTruthy();
    expect(within(panel).getByTestId("weapon-notes").textContent).toContain("−2 dice per band");
    // Strength 3 + Close Combat 1 + the rifle's +2 − 2 for one band under its minimum range
    fireEvent.click(within(panel).getByRole("button", { name: "Roll" }));
    expect(diceLog(ctx, sessionId).at(-1)!.text).toMatch(/^Vera: Armat M41A Pulse Rifle \(Close Combat, Adjacent\): 4 base \+ 0 stress/);
    fireEvent.change(screen.getByRole("combobox", { name: "Skill" }), { target: { value: "weapon:1" } });
    panel = screen.getByTestId("weapon-attack");
    expect([...(within(panel).getByRole("combobox", { name: "Range" }) as HTMLSelectElement).options].map((o) => o.value)).toEqual(["adjacent"]);
    // a miss: no damage
    fireEvent.click(within(panel).getByRole("button", { name: "Roll" }));
    const text = within(panel).getByTestId("weapon-damage").textContent ?? "";
    expect(text).toMatch(/^(Hit: \d+ damage|Miss: no success\.)/);
  });
});
