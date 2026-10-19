import "fake-indexeddb/auto";
import { liveOf, runMapGenerator, type SiteMap } from "@campaign-forge/core";
import { exampleModule, exampleSiteGenerator } from "@campaign-forge/module-example";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createCampaign } from "../../state/actions";
import { CampaignContext, openCampaign, type CampaignContextValue } from "../../state/CampaignProvider";
import { useRecord } from "../../state/hooks";
import { LiveSiteMap } from "./LiveSiteMap";
import { PlayerSiteMap } from "./PlayerSiteMap";
import { borderControls, clearPingsOnStretch, clockStamp, ensureLive, measureRange, unrevealed, zoneExits } from "./siteMapLive";

const opened: Array<() => void> = [];
afterEach(() => {
  cleanup();
  while (opened.length) opened.pop()?.();
});

let campaignId: string;
beforeAll(async () => {
  campaignId = await createCampaign({ name: "Keep", moduleId: "example" });
}, 30_000);

async function setup(): Promise<{ ctx: CampaignContextValue; map: SiteMap }> {
  const ctx = await openCampaign(campaignId);
  opened.push(ctx.close);
  const result = runMapGenerator(exampleModule, exampleSiteGenerator, { darkness: 40, lockedAct: 2 }, { seed: "web-live" });
  const created = ctx.store.createMap({ name: "Old keep" });
  const map = ctx.store.update("maps", created.id, { layout: result.layout, generator: { id: exampleSiteGenerator.id, seed: "web-live", inputs: {} } });
  return { ctx, map };
}

const get = (ctx: CampaignContextValue, id: string) => ctx.store.get("maps", id)!;

describe("live helpers", () => {
  it("starts live play once, at the scene's act, with the start zone revealed", async () => {
    const { ctx, map } = await setup();
    ensureLive(ctx.store, map, 2);
    expect(liveOf(get(ctx, map.id))).toMatchObject({ act: 2, revealed: ["R4"] });
    ensureLive(ctx.store, get(ctx, map.id), 1);
    expect(get(ctx, map.id).live!.act).toBe(2);
    expect(unrevealed(map.layout!, liveOf(get(ctx, map.id)))).not.toContain("X1");
  });

  it("reads range bands that follow the live border state", async () => {
    const { ctx, map } = await setup();
    ensureLive(ctx.store, map, 1);
    const at = () => measureRange(map.layout!, liveOf(get(ctx, map.id)), exampleSiteGenerator, "R4", "R6");
    // R4 - C1 - C2 - R6
    expect(at()).toMatchObject({ distance: 3, band: { id: "far" }, path: ["R4", "C1", "C2", "R6"] });
    // act 2 locks the vault door: through the hall instead (R4 C1 R5 R6)
    ctx.store.update("maps", map.id, { live: { ...liveOf(get(ctx, map.id)), act: 2 } });
    expect(at().path).toEqual(["R4", "C1", "R5", "R6"]);
    const exits = zoneExits(map.layout!, liveOf(get(ctx, map.id)), exampleSiteGenerator, "R6");
    expect(exits.find((e) => e.border.id === "B09")!.state.locked).toBe(true);
    expect(borderControls(exits.find((e) => e.border.id === "B09")!.border)).toMatchObject({ lock: true, destroy: true });
    expect(borderControls({ kind: "access" })).toMatchObject({ lock: false, seal: true });
  });

  it("clears pings when the clock passes a stretch, not a round", async () => {
    const { ctx, map } = await setup();
    ensureLive(ctx.store, map, 1);
    const units = { units: [{ id: "round", name: "Round" }, { id: "stretch", name: "Stretch" }, { id: "shift", name: "Shift" }] };
    const s0 = clockStamp(units, { counters: { round: 0, stretch: 0, shift: 0 } });
    const s1 = clockStamp(units, { counters: { round: 3, stretch: 0, shift: 0 } });
    const s2 = clockStamp(units, { counters: { round: 0, stretch: 1, shift: 0 } });
    expect(s0).toBe(s1);
    expect(s2).not.toBe(s1);
    ctx.store.update("maps", map.id, { live: { ...liveOf(get(ctx, map.id)), pings: [{ zone: "C2", at: "t" }] } });
    let last = clearPingsOnStretch(ctx.store, get(ctx, map.id), undefined, s0);
    last = clearPingsOnStretch(ctx.store, get(ctx, map.id), last, s1);
    expect(get(ctx, map.id).live!.pings).toHaveLength(1);
    clearPingsOnStretch(ctx.store, get(ctx, map.id), last, s2);
    expect(get(ctx, map.id).live!.pings).toEqual([]);
  });
});

function LiveHarness({ ctx, id }: { ctx: CampaignContextValue; id: string }) {
  return (
    <CampaignContext.Provider value={ctx}>
      <Live id={id} />
    </CampaignContext.Provider>
  );
}
function Live({ id }: { id: string }) {
  const map = useRecord("maps", id);
  return map ? <LiveSiteMap sessionId="none" map={map} scene={undefined} participants={[]} /> : null;
}
function PlayerHarness({ ctx, id }: { ctx: CampaignContextValue; id: string }) {
  return (
    <CampaignContext.Provider value={ctx}>
      <Player id={id} />
    </CampaignContext.Provider>
  );
}
function Player({ id }: { id: string }) {
  const map = useRecord("maps", id);
  return map ? <PlayerSiteMap map={map} /> : null;
}

describe("LiveSiteMap and PlayerSiteMap", () => {
  it("reveals zones, toggles a lock, marks a flag, places a token and measures range; the player map follows without GM data", async () => {
    const { ctx, map } = await setup();
    render(<LiveHarness ctx={ctx} id={map.id} />);
    // live play starts at act 1 with the start zone revealed
    await act(async () => undefined);
    expect(get(ctx, map.id).live).toMatchObject({ act: 1, revealed: ["R4"] });

    // reveal tool: click C1
    fireEvent.click(screen.getByRole("button", { name: "Reveal" }));
    const hit = (id: string) => document.querySelector(`[data-hit="zone"][data-zone="${id}"]`)!;
    fireEvent.keyDown(hit("C1"), { key: "Enter" });
    expect(get(ctx, map.id).live!.revealed).toEqual(["R4", "C1"]);

    // select R6, lock its door from the corridor, burn it, place a hidden token
    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    fireEvent.keyDown(hit("R6"), { key: "Enter" });
    const panel = screen.getByTestId("live-zone");
    fireEvent.click(within(panel).getByRole("button", { name: "Lock Door to 8 East passage" }));
    expect(get(ctx, map.id).live!.borders.B09).toEqual({ locked: true });
    fireEvent.click(within(panel).getByRole("checkbox", { name: /Burning/ }));
    expect(get(ctx, map.id).live!.zoneFlags.R6).toEqual({ burning: true });
    fireEvent.change(within(panel).getByRole("textbox", { name: "New token name" }), { target: { value: "Ghoul" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Place" }));
    expect(get(ctx, map.id).live!.tokens).toMatchObject([{ label: "Ghoul", zone: "R6", gmOnly: true }]);

    // range: from R4 to R6 now goes round through the hall
    fireEvent.change(screen.getByRole("combobox", { name: "Range from" }), { target: { value: "R4" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Range to" }), { target: { value: "R6" } });
    expect(screen.getByTestId("range-reading").textContent).toMatch(/^3 zones · Far · via 7 West passage, 5 /);

    // the player map shows only revealed zones, no GM markers, no hidden tokens
    render(<PlayerHarness ctx={ctx} id={map.id} />);
    const player = screen.getByTestId("player-map");
    expect(player.querySelectorAll("[data-fog]").length).toBe(map.layout!.zones.filter((z) => z.layer !== "duct" && z.kind !== "out-of-bounds").length - 2);
    expect(player.querySelector('[data-fog="C1"]')).toBeNull();
    expect(player.querySelector("[data-number]")).toBeNull();
    expect(player.querySelector("[data-marker-kind=spawn]")).toBeNull();
    expect(player.innerHTML).not.toContain("Ghoul");
    expect(player.innerHTML).not.toContain("Bell rope");
    expect(player.innerHTML).not.toContain("Old warden");
    expect(player.innerHTML).not.toContain("curse");
    expect(player.querySelector("[data-ping]")).toBeNull();
  }, 30_000);
});
