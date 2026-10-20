import "fake-indexeddb/auto";
import { advancementLog } from "@campaign-forge/core";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createCampaign, createEntity, startSession } from "../../state/actions";
import { CampaignContext, openCampaign, type CampaignContextValue } from "../../state/CampaignProvider";
import { routeStoryPointEffects } from "../../state/progressionActions";
import { AwardsStep } from "./AwardsStep";
import { ProgressionTab } from "./ProgressionTab";
import { StoryPointCard } from "./StoryPointControl";

const opened: Array<() => void> = [];
afterEach(() => {
  cleanup();
  while (opened.length) opened.pop()?.();
});

let campaignId: string;
beforeAll(async () => {
  campaignId = await createCampaign({ name: "Heroes rise", moduleId: "example" });
}, 30_000);

async function setup() {
  const ctx = await openCampaign(campaignId);
  opened.push(ctx.close);
  ctx.store.transact(() => {
    for (const e of ctx.store.list("entities")) ctx.store.remove("entities", e.id);
    for (const e of ctx.store.list("advancement")) ctx.store.remove("advancement", e.id);
    for (const s of ctx.store.list("sessions")) ctx.store.remove("sessions", s.id);
  });
  const aud = createEntity(ctx, { type: "example.hero", name: "Aud", fields: { isPC: true, attributes: { might: 3, wits: 2 }, skills: { fight: 1, lore: 0, sneak: 0 }, wounds: 2, xp: 10, luck: 1, origin: "hill", feats: [] } });
  const bo = createEntity(ctx, { type: "example.hero", name: "Bo", fields: { isPC: true, attributes: { might: 2, wits: 1 }, skills: { fight: 0, lore: 0, sneak: 0 }, wounds: 0, xp: 0, luck: 0 } });
  const golem = createEntity(ctx, { type: "example.hero", name: "Clay", fields: { isPC: true, construct: true, attributes: { might: 4, wits: 1 } } });
  return { ctx, aud, bo, golem };
}

const Harness = ({ ctx, children }: { ctx: CampaignContextValue; children: ReactNode }) => <CampaignContext.Provider value={ctx}>{children}</CampaignContext.Provider>;
const xpOf = (ctx: CampaignContextValue, id: string) => ctx.store.get("entities", id)?.fields.xp;

describe("wrap-up awards", () => {
  it("shows the module's questions per advancing PC, ticks defaults and suggestions, totals them and posts once", async () => {
    const { ctx, aud, bo } = await setup();
    const session = startSession(ctx, { title: "Night one" });
    render(
      <Harness ctx={ctx}>
        <AwardsStep sessionId={session.id} />
      </Harness>,
    );
    const grid = screen.getByTestId("award-checklist");
    // the construct does not advance, so only two columns
    expect(within(grid).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Question", "Aud", "Bo"]);
    expect((within(grid).getByRole("checkbox", { name: "Aud: Did you come to the game?" }) as HTMLInputElement).checked).toBe(true);
    // Aud has two wounds: suggested; Bo has none: does not apply
    expect((within(grid).getByRole("checkbox", { name: "Aud: Did you take a wound?" }) as HTMLInputElement).checked).toBe(true);
    expect((within(grid).getByRole("checkbox", { name: "Bo: Did you take a wound?" }) as HTMLInputElement).disabled).toBe(true);
    act(() => {
      fireEvent.click(within(grid).getByRole("checkbox", { name: "Bo: Did you finish a quest?" }));
    });
    expect(grid.querySelector(`[data-total="${aud.id}"]`)?.textContent).toContain("+2 XP");
    expect(grid.querySelector(`[data-total="${bo.id}"]`)?.textContent).toContain("+3 XP");
    act(() => {
      fireEvent.click(screen.getByTestId("award-xp"));
    });
    expect(xpOf(ctx, aud.id)).toBe(12);
    expect(xpOf(ctx, bo.id)).toBe(3);
    expect(advancementLog(ctx.store).map((e) => [e.amount, e.session, e.questions])).toEqual([
      [2, session.id, ["example.award.came", "example.award.wounded"]],
      [3, session.id, ["example.award.came", "example.award.quest"]],
    ]);
    expect(screen.getAllByTestId("awarded")).toHaveLength(2);
    expect((screen.getByTestId("award-xp") as HTMLButtonElement).disabled).toBe(true);
  });

  it("awards the end-of-act question once per act", async () => {
    const { ctx, aud } = await setup();
    const session = startSession(ctx, { title: "Night two" });
    render(
      <Harness ctx={ctx}>
        <AwardsStep sessionId={session.id} />
      </Harness>,
    );
    const acts = screen.getByTestId("act-awards");
    act(() => {
      fireEvent.click(within(acts).getByRole("checkbox", { name: "Aud, act 1: Did you do something daring this act?" }));
    });
    act(() => {
      fireEvent.click(screen.getByTestId("award-acts"));
    });
    expect(ctx.store.get("entities", aud.id)?.fields.luck).toBe(2);
    const box = within(screen.getByTestId("act-awards")).getByRole("checkbox", { name: "Aud, act 1: Did you do something daring this act?" }) as HTMLInputElement;
    expect(box.checked && box.disabled).toBe(true);
    expect(advancementLog(ctx.store, aud.id)[0]).toMatchObject({ pool: "story", act: 1, session: session.id });
  });
});

describe("Progression tab and Spend XP", () => {
  it("lists costs and caps, applies a skill step to the sheet and the pool, and undoes it", async () => {
    const { ctx, aud } = await setup();
    render(
      <Harness ctx={ctx}>
        <ProgressionTab entity={aud} />
      </Harness>,
    );
    expect(screen.getByTestId("pool-experience").textContent).toBe("10");
    act(() => {
      fireEvent.click(screen.getByTestId("spend-xp"));
    });
    const dialog = screen.getByTestId("spend-dialog");
    const fight = dialog.querySelector('[data-target="fight"]') as HTMLButtonElement;
    expect(fight.textContent).toContain("1 → 2");
    expect(fight.textContent).toContain("6 XP");
    // the dice pool the skill rolls, before and after
    expect(fight.textContent).toContain("4 → 5 dice");
    act(() => {
      fireEvent.click(fight);
    });
    expect(screen.getByTestId("spend-quote").textContent).toContain("XP after: 4");
    act(() => {
      fireEvent.click(screen.getByTestId("apply-spend"));
    });
    let fields = ctx.store.get("entities", aud.id)!.fields;
    expect(fields.xp).toBe(4);
    expect((fields.skills as Record<string, number>).fight).toBe(2);
    expect(advancementLog(ctx.store, aud.id).at(-1)?.spend).toMatchObject({ option: "example.spend.skill", target: "fight", from: 1, to: 2, cost: 6 });
    expect(screen.getByTestId("advancement-history").textContent).toContain("Train a skill: Fight 1 → 2");
    act(() => {
      fireEvent.click(screen.getByTestId("undo-spend"));
    });
    fields = ctx.store.get("entities", aud.id)!.fields;
    expect(fields.xp).toBe(10);
    expect((fields.skills as Record<string, number>).fight).toBe(1);
    expect((screen.getByTestId("undo-spend") as HTMLButtonElement).disabled).toBe(true);
  });

  it("asks for confirmation where the rules need it and hides what the character cannot learn", async () => {
    const { ctx, aud } = await setup();
    render(
      <Harness ctx={ctx}>
        <ProgressionTab entity={aud} />
      </Harness>,
    );
    act(() => {
      fireEvent.click(screen.getByTestId("spend-xp"));
    });
    act(() => {
      fireEvent.click(screen.getByRole("tab", { name: "Learn a feat" }));
    });
    const targets = screen.getByTestId("spend-targets");
    // "Sly" belongs to city folk; Aud is from the hills
    expect(targets.querySelector('[data-target="sly"]')).toBeNull();
    act(() => {
      fireEvent.click(targets.querySelector('[data-target="tough"]')!);
    });
    const apply = screen.getByTestId("apply-spend") as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    act(() => {
      fireEvent.click(screen.getByRole("checkbox", { name: "Confirm the condition" }));
    });
    expect(apply.disabled).toBe(false);
    act(() => {
      fireEvent.click(apply);
    });
    expect(ctx.store.get("entities", aud.id)!.fields.feats).toEqual([{ id: "tough" }]);
    expect(xpOf(ctx, aud.id)).toBe(6);
  });
});

describe("story points at the table", () => {
  it("spends one with a reason, logged with the session; tracker changes go through the log too", async () => {
    const { ctx, aud } = await setup();
    const session = startSession(ctx, { title: "Night three" });
    render(
      <Harness ctx={ctx}>
        <StoryPointCard entity={aud} sessionId={session.id} />
      </Harness>,
    );
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Spend a Luck for Aud" }));
    });
    act(() => {
      fireEvent.change(screen.getByRole("textbox", { name: "Note" }), { target: { value: "Dodged the troll" } });
    });
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Spend" }));
    });
    expect(ctx.store.get("entities", aud.id)!.fields.luck).toBe(0);
    expect(advancementLog(ctx.store, aud.id).at(-1)).toMatchObject({ kind: "spend", amount: -1, reason: "Dodged the troll", use: "example.luck.reroll", session: session.id, source: { kind: "table" } });

    const rest = routeStoryPointEffects(ctx, [{ kind: "setField", entity: aud.id, path: "luck", value: 2 }, { kind: "setField", entity: aud.id, path: "wounds", value: 0 }], session.id);
    expect(rest).toEqual([{ kind: "setField", entity: aud.id, path: "wounds", value: 0 }]);
    expect(ctx.store.get("entities", aud.id)!.fields.luck).toBe(2);
    expect(advancementLog(ctx.store, aud.id).at(-1)).toMatchObject({ kind: "award", amount: 2, pool: "story" });
  });
});
