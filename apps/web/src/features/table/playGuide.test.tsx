import "fake-indexeddb/auto";
import type { Entity } from "@campaign-forge/core";
import { examplePlayGuide } from "@campaign-forge/module-example";
import { filterPlayGuideEntries, playGuidesForMode } from "@campaign-forge/ui";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createCampaign, createEntity } from "../../state/actions";
import { CampaignContext, openCampaign, type CampaignContextValue } from "../../state/CampaignProvider";
import { DICE_LOG, planNextSession, sessionTrackerState, startPlannedSession } from "../../state/tableActions";
import { PlayGuidePanel, rankRollers } from "./PlayGuidePanel";

const opened: Array<() => void> = [];
afterEach(() => {
  cleanup();
  while (opened.length) opened.pop()?.();
});

let standard: string;
let hardcore: string;
beforeAll(async () => {
  standard = await createCampaign({ name: "Guide", moduleId: "example" });
  hardcore = await createCampaign({ name: "Guide hardcore", moduleId: "example", mode: "hardcore" });
}, 30_000);

async function setup(id: string): Promise<{ ctx: CampaignContextValue; sessionId: string; pcs: Entity[] }> {
  const ctx = await openCampaign(id);
  opened.push(ctx.close);
  const hero = (name: string, attributes: Record<string, number>, skills: Record<string, number>) =>
    createEntity(ctx, { type: "example.hero", name, fields: { isPC: true, attributes, skills, wounds: 0 } });
  const pcs = [hero("Aria", { might: 4, wits: 1 }, { fight: 2, lore: 0, sneak: 0 }), hero("Bren", { might: 2, wits: 4 }, { fight: 0, lore: 3, sneak: 1 })];
  const session = startPlannedSession(ctx, planNextSession(ctx, { title: "Guide run" }).id);
  return { ctx, sessionId: session.id, pcs };
}

function Harness({ ctx, sessionId, pcs }: { ctx: CampaignContextValue; sessionId: string; pcs: Entity[] }) {
  return (
    <CampaignContext.Provider value={ctx}>
      <PlayGuidePanel sessionId={sessionId} pcs={pcs} />
    </CampaignContext.Provider>
  );
}

const entry = (id: string) => document.querySelector<HTMLElement>(`[data-entry="${id}"]`);
const search = () => screen.getByRole("searchbox", { name: "Search hints" });

describe("play guide helpers", () => {
  it("filters guides and entries by play mode", () => {
    const [std] = playGuidesForMode([examplePlayGuide], "standard");
    expect(std!.entries.map((e) => e.id)).toEqual(["might", "fight", "lore", "sneak"]);
    expect(playGuidesForMode([examplePlayGuide], "hardcore")[0]!.entries.map((e) => e.id)).toContain("endure");
    expect(playGuidesForMode([{ ...examplePlayGuide, mode: ["hardcore"] }], "standard")).toEqual([]);
    expect(playGuidesForMode(undefined, "standard")).toEqual([]);
  });

  it("matches label, summary, cue text and group name", () => {
    const ids = (q: string) => filterPlayGuideEntries(examplePlayGuide, q).map((e) => e.id);
    expect(ids("FIGHT")).toEqual(["fight"]);
    expect(ids("bridge")).toEqual(["fight"]);
    expect(ids("wits")).toEqual(["lore", "sneak"]);
    expect(ids("")).toHaveLength(examplePlayGuide.entries.length);
  });

  it("ranks PCs by the module's pool for the entry's roll", async () => {
    const { ctx, pcs } = await setup(standard);
    const rank = (roll: string) => rankRollers(ctx.module, pcs, roll).map((r) => [r.entity.name, r.pool]);
    expect(rank("fight")).toEqual([["Aria", 6], ["Bren", 2]]);
    expect(rank("lore")).toEqual([["Bren", 7], ["Aria", 1]]);
    expect(rank("attr:might")).toEqual([["Aria", 4], ["Bren", 2]]);
    expect(rank("attr:luck")).toEqual([]);
    expect(rankRollers(ctx.module, pcs, "fight")[0]!.breakdown).toBe("Attribute 4 · Skill 2");
  });
});

describe("PlayGuidePanel", () => {
  it("shows the mode's entries in collapsible groups, searches cues and expands an entry with its cues and outcomes", async () => {
    const { ctx, sessionId, pcs } = await setup(standard);
    render(<Harness ctx={ctx} sessionId={sessionId} pcs={pcs} />);
    expect(screen.getByText("Rolling at the table")).toBeTruthy();
    expect(entry("endure")).toBeNull();
    expect(entry("fight")).not.toBeNull();

    // tips are collapsed until opened
    const tips = screen.getByRole("button", { name: /^Tips/ });
    expect(tips.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(tips);
    expect(screen.getByText(/Only roll when both outcomes move the story/)).toBeTruthy();

    // a group collapses and opens again
    const might = screen.getByRole("button", { name: /^Might 2/ });
    fireEvent.click(might);
    expect(entry("fight")).toBeNull();
    fireEvent.click(might);
    expect(entry("fight")).not.toBeNull();

    // entries start collapsed: one line, the cues hidden; the collapsed line names who rolls best
    const row = within(entry("lore")!).getByRole("button", { expanded: false });
    expect(row.textContent).toContain("Bren 7");
    expect(screen.queryByRole("list", { name: "Lore: call for it when" })).toBeNull();
    fireEvent.click(row);
    const cues = screen.getByRole("list", { name: "Lore: call for it when" });
    expect(within(cues).getAllByRole("listitem")).toHaveLength(2);
    expect(within(entry("lore")!).getByText("Success")).toBeTruthy();
    expect(within(entry("lore")!).getByText("p. 16")).toBeTruthy();

    // a cue word finds its entry, and a single match opens itself
    fireEvent.change(search(), { target: { value: "bridge" } });
    expect(entry("lore")).toBeNull();
    expect(within(entry("fight")!).getByRole("button", { expanded: true })).toBeTruthy();
    expect(screen.getByText("a bandit blocks the bridge and will not talk")).toBeTruthy();

    // the hardcore-only entry does not match in standard play
    fireEvent.change(search(), { target: { value: "frozen" } });
    expect(screen.getByText("No hints match")).toBeTruthy();
  });

  it("shows hardcore entries in a hardcore campaign", async () => {
    const { ctx, sessionId, pcs } = await setup(hardcore);
    render(<Harness ctx={ctx} sessionId={sessionId} pcs={pcs} />);
    fireEvent.change(search(), { target: { value: "frozen" } });
    expect(entry("endure")).not.toBeNull();
  });

  it("rolls an entry for a PC from who's best, in place, logged to the session with its seed", async () => {
    const { ctx, sessionId, pcs } = await setup(standard);
    render(<Harness ctx={ctx} sessionId={sessionId} pcs={pcs} />);
    fireEvent.click(within(entry("lore")!).getByRole("button", { expanded: false }));
    const best = within(entry("lore")!).getByRole("list", { name: "Who's best at Lore" });
    const buttons = within(best).getAllByRole("button");
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual(["Roll Lore for Bren (7 dice)", "Roll Lore for Aria (1 dice)"]);

    await act(async () => {
      fireEvent.click(buttons[0]!);
    });
    const panel = within(entry("lore")!).getByTestId("dice-panel");
    expect(panel.textContent).toContain("Bren: Lore");
    expect(within(panel).getByTestId("describe").textContent).toMatch(/on 7d6$/);
    const log = () => sessionTrackerState(ctx.store, sessionId)!.log.filter((l) => l.tracker === DICE_LOG);
    expect(log()).toHaveLength(1);
    expect(log()[0]).toMatchObject({ entity: pcs[1]!.id, data: { seed: `${sessionId}:0`, kind: "pool" } });
    expect(log()[0]!.text).toMatch(/^Bren: Lore: \d+ success(es)? on 7d6$/);

    // the push goes through the same session roller and is logged as pushed
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Push" }));
    });
    expect(log()).toHaveLength(2);
    expect(log()[1]!.text).toMatch(/^Bren: Lore \(pushed\): .*\(pushed\)$/);
    expect(log()[1]).toMatchObject({ data: { seed: `${sessionId}:1` } });

    // rolling for another PC replaces the shown roll
    await act(async () => {
      fireEvent.click(buttons[1]!);
    });
    expect(within(entry("lore")!).getByTestId("dice-panel").textContent).toContain("Aria: Lore");
    expect(log()).toHaveLength(3);
  });
});

describe("the Alien module's play guide", () => {
  it("has a guide for each play mode whose every roll resolves for a PC", async () => {
    const id = await createCampaign({ name: "Alien guide", moduleId: "alien", mode: "campaign" });
    const ctx = await openCampaign(id);
    opened.push(ctx.close);
    const pc = createEntity(ctx, { type: "alien.character", name: "Ripley", fields: { isPC: true, attributes: { strength: 3, agility: 3, wits: 4, empathy: 2 }, skills: { observation: 2 }, stress: 1 } });
    for (const mode of ctx.module.manifest.modes.map((m) => m.id)) {
      const guides = playGuidesForMode(ctx.module.module.playGuides, mode);
      expect(guides.length, mode).toBeGreaterThan(0);
      for (const e of guides.flatMap((g) => g.entries)) {
        if (!e.roll) continue;
        expect(rankRollers(ctx.module, [pc], e.roll), `${mode} ${e.id} rolls ${e.roll}`).toHaveLength(1);
      }
    }
    // stress dice are not part of the ranked pool but are shown as extra
    const [obs] = rankRollers(ctx.module, [pc], "observation");
    expect(obs).toMatchObject({ pool: 6, extra: 1, label: "Observation" });
  });
});
