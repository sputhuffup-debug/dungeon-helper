import "fake-indexeddb/auto";
import { CampaignStore, RichTextRegistry, huntOf, liveOf, placeToken, playerLayout, playerLive, recordSweep, runMapGenerator, startLive, type SiteMap } from "@campaign-forge/core";
import { exampleModule, exampleSiteGenerator } from "@campaign-forge/module-example";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import * as Y from "yjs";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createCampaign } from "../../state/actions";
import { CampaignContext, openCampaign, type CampaignContextValue } from "../../state/CampaignProvider";
import { useRecord } from "../../state/hooks";
import { attachCrossTabSync } from "./crossTab";
import { LiveSiteMap } from "./LiveSiteMap";
import { PlayerSiteMap } from "./PlayerSiteMap";
import { huntSignal, huntStepPassed, pcTargets } from "./siteMapLive";

const opened: Array<() => void> = [];
afterEach(() => {
  cleanup();
  while (opened.length) opened.pop()?.();
});

let campaignId: string;
beforeAll(async () => {
  campaignId = await createCampaign({ name: "Keep", moduleId: "example" });
}, 30_000);

/** The example keep with its hunt, Ada (a PC carrying the ghost bell) in the start room. */
async function setup(): Promise<{ ctx: CampaignContextValue; map: SiteMap; ada: string }> {
  const ctx = await openCampaign(campaignId);
  opened.push(ctx.close);
  const result = runMapGenerator(exampleModule, exampleSiteGenerator, { darkness: 40, lockedAct: 2 }, { seed: "web-hunt" });
  const created = ctx.store.createMap({ name: "Old keep" });
  ctx.store.update("maps", created.id, { layout: result.layout, generator: { id: exampleSiteGenerator.id, seed: "web-hunt", inputs: {} } });
  const ada = ctx.store.createEntity({ type: "example.hero", name: "Ada", fields: { isPC: true, gear: [{ name: "Ghost bell", weight: 1 }] } });
  startLive(ctx.store, created.id, 1);
  placeToken(ctx.store, created.id, { label: "Ada", zone: "R4", gmOnly: false, entity: ada.id });
  return { ctx, map: ctx.store.get("maps", created.id)!, ada: ada.id };
}

const get = (ctx: CampaignContextValue, id: string) => ctx.store.get("maps", id)!;

function Harness({ ctx, id, player }: { ctx: CampaignContextValue; id: string; player?: boolean }) {
  return (
    <CampaignContext.Provider value={ctx}>
      <MapOf id={id} player={!!player} />
    </CampaignContext.Provider>
  );
}
function MapOf({ id, player }: { id: string; player: boolean }) {
  const map = useRecord("maps", id);
  if (!map) return null;
  return player ? <PlayerSiteMap map={map} /> : <LiveSiteMap sessionId="none" map={map} scene={undefined} participants={[]} />;
}

describe("hunt signals", () => {
  const units = { units: [{ id: "round", name: "Round" }, { id: "stretch", name: "Stretch" }, { id: "shift", name: "Shift" }] };
  const steps = [{ id: "stretch" }, { id: "round" }];

  it("tell a stretch from a round, on the clock or the initiative tracker", () => {
    const a = huntSignal(units, { counters: { round: 0, stretch: 1, shift: 0 } }, undefined);
    expect(huntStepPassed(undefined, a, steps)).toBeUndefined();
    expect(huntStepPassed(a, a, steps)).toBeUndefined();
    expect(huntStepPassed(a, huntSignal(units, { counters: { round: 0, stretch: 2, shift: 0 } }, undefined), steps)).toBe("stretch");
    expect(huntStepPassed(a, huntSignal(units, { counters: { round: 1, stretch: 1, shift: 0 } }, undefined), steps)).toBe("round");
    expect(huntStepPassed(a, huntSignal(units, { counters: { round: 0, stretch: 1, shift: 0 } }, 2), steps)).toBe("round");
    // a module with one kind of step advances that one
    expect(huntStepPassed(a, huntSignal(units, { counters: { round: 1, stretch: 1, shift: 0 } }, undefined), [{ id: "turn" }])).toBe("turn");
  });

  it("find the PCs on the map as stalk targets", async () => {
    const { map, ada } = await setup();
    expect(pcTargets(liveOf(map), [{ id: ada, name: "Ada" }, { id: "nobody", name: "Off the map" }])).toEqual([{ zone: "R4", label: "Ada", entity: ada }]);
  });
});

describe("the hunt in table mode", () => {
  it("places a hidden ghoul, suggests its move, sweeps and reveals it; the player map gets blips and never the ghoul's zone", async () => {
    const { ctx, map } = await setup();
    render(<Harness ctx={ctx} id={map.id} />);
    await act(async () => undefined);
    const panel = screen.getByTestId("hunt-panel");
    expect(panel.textContent).toContain("No hidden threats");

    // place the ghoul from its spawn mark (a crawlway junction)
    const from = within(panel).getByRole("combobox", { name: "Hidden threat from" });
    const option = within(from).getByRole("option", { name: /^Ghoul \(act 2\) \(Ghoul,/ }) as HTMLOptionElement;
    fireEvent.change(from, { target: { value: option.value } });
    fireEvent.click(within(panel).getByRole("button", { name: /^Place hidden/ }));
    const hunt = () => huntOf(liveOf(get(ctx, map.id)));
    expect(hunt().tokens).toMatchObject([{ label: "Ghoul (act 2)", zone: "D03", state: "hidden", mover: "ghoul" }]);
    // on the GM map's crawlways sheet: a dashed diamond
    const live = screen.getByTestId("live-map");
    expect(live.querySelector("[data-hunt-token]")).toBeNull();
    fireEvent.click(within(live).getByRole("button", { name: "Crawlways" }));
    expect(live.querySelector('[data-hunt-token][data-hunt-state="hidden"]')).not.toBeNull();

    // a turn passes: the GM is asked; the ghoul's suggestion drops it toward Ada
    fireEvent.click(within(panel).getByRole("button", { name: "Next turn" }));
    expect(screen.getByTestId("hunt-prompt").textContent).toMatch(/Turn 1 begins\. Move hidden threats\? Sweep\?/);
    const suggestion = screen.getByTestId("hunt-suggestion");
    expect(suggestion.getAttribute("data-to")).toBe("U02");
    expect(suggestion.textContent).toContain("2 zones closer to Ada");
    expect(live.querySelector('[data-hunt-suggestion][data-to="U02"]')).toBeNull(); // on the duct sheet, not this deck
    fireEvent.click(within(panel).getByTestId("hunt-accept"));
    expect(hunt().tokens[0]).toMatchObject({ zone: "U02", trail: ["D03", "U01"], movedAt: 1 });

    // Ada sweeps with the ghost bell: blip A, one border away
    fireEvent.click(within(panel).getByRole("button", { name: "Sweep: Ada" }));
    expect(hunt().sweeps[0]!.blips).toMatchObject([{ letter: "A", band: "close", distance: 1 }]);
    expect(hunt().tokens[0]!.state).toBe("detected");

    // the player map: the readout with blip A at Close range, nothing of the ghoul itself
    render(<Harness ctx={ctx} id={map.id} player />);
    const player = screen.getByTestId("player-map");
    const blips = within(player).getAllByTestId("tracker-blip");
    expect(blips.map((b) => b.textContent)).toEqual(["A: Close, here, below"]);
    expect(player.querySelector("[data-hunt-token], [data-hunt-trail], [data-hunt-suggestion]")).toBeNull();
    expect(player.textContent).not.toContain("Ghoul");
    expect(player.innerHTML).not.toContain("U02");

    // the GM reveals it, keeping the letter: the blip flips to its token on the player map
    fireEvent.click(within(panel).getByTestId("hunt-keep-letter"));
    fireEvent.click(within(panel).getByTestId("hunt-reveal"));
    expect(hunt().tokens[0]).toMatchObject({ state: "seen", letter: "A" });
    expect(liveOf(get(ctx, map.id)).revealed).toContain("U02");
    expect(within(player).getAllByTestId("tracker-blip").map((b) => b.textContent)).toEqual(["A: Close, here, below (seen)"]);
    // the token is on the undercroft sheet the reveal opened: switch to it
    fireEvent.click(within(player).getByRole("button", { name: "Undercroft crawl" }));
    expect(player.querySelector(`[data-token="${hunt().tokens[0]!.id}"]`)?.textContent).toContain("A");
  });
});

describe("the hunt across tabs", () => {
  it("round-trips the hunt over the cross-tab sync, and both tabs project the same blips", async () => {
    const a = CampaignStore.create({ name: "Keep", moduleId: exampleModule.manifest.id, moduleVersion: exampleModule.manifest.version, mode: "standard", calendarId: exampleModule.calendar.id });
    const docB = new Y.Doc();
    const id = `hunt-${Date.now()}`;
    const offA = attachCrossTabSync(id, a.doc, new RichTextRegistry());
    const offB = attachCrossTabSync(id, docB, new RichTextRegistry());
    try {
      const result = runMapGenerator(exampleModule, exampleSiteGenerator, { darkness: 40, lockedAct: 2 }, { seed: "tabs" });
      const m = a.createMap({ name: "Old keep" });
      a.update("maps", m.id, { layout: result.layout, generator: { id: exampleSiteGenerator.id, seed: "tabs", inputs: {} } });
      startLive(a, m.id, 1);
      const { placeHuntToken, advanceHunt, moveHuntToken } = await import("@campaign-forge/core");
      const t = placeHuntToken(a, m.id, { label: "Ghoul", zone: "D03", mover: "ghoul" });
      advanceHunt(a, m.id, "turn");
      moveHuntToken(a, m.id, t, "U02", { path: ["D03", "U01", "U02"] });
      recordSweep(a, m.id, { by: { name: "Ada" }, from: "R4", sensor: exampleSiteGenerator.hunt!.sensors![0]!, def: exampleSiteGenerator, at: "t" });
      const b = CampaignStore.fromDoc(docB);
      await expect.poll(() => b.get("maps", m.id)?.live?.hunt?.sweeps.length ?? 0, { timeout: 2000 }).toBe(1);
      const mapA = a.get("maps", m.id)!;
      const mapB = b.get("maps", m.id)!;
      expect(mapB.live).toEqual(mapA.live);
      const project = (x: SiteMap) => {
        const l = liveOf(x);
        return playerLive(l, playerLayout(x.layout!, { act: l.act, revealed: l.revealed, live: l }), exampleSiteGenerator.legend);
      };
      expect(project(mapB)).toEqual(project(mapA));
      expect(project(mapB).tracker!.sweeps[0]!.blips.map((x) => x.letter)).toEqual(["A"]);
    } finally {
      offA();
      offB();
    }
  });
});
