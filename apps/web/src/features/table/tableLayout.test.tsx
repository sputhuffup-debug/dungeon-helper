/**
 * Table layout and safety on the Skyfire Down demo (session 2 on "The ore
 * run", the job's site with the live hunt):
 * - one round counter: the hunt's and the initiative tracker's "Next round"
 *   advance the header clock and read from it;
 * - "This job": the job's clues (Mark found, Reveal) and its people's
 *   agendas and secrets, none of which reaches the player screen;
 * - the hunt's placement lists the map's NPCs once each, never as hostile;
 * - "Reveal all" can be undone, "Reset the map" asks first;
 * - repeated log lines fold into one with a count;
 * - "Take a hit" cannot be closed with a hit typed in but not applied.
 */
import "fake-indexeddb/auto";
import { adventureSourceInput, huntOf, liveOf, threadsInOrder, type Entity, type Id } from "@campaign-forge/core";
import { runJobPeople } from "@campaign-forge/module-alien";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastViewport, clearToasts } from "../../components/ui";
import { CampaignContext, openCampaign, type CampaignContextValue } from "../../state/CampaignProvider";
import { useRecord } from "../../state/hooks";
import { loadDemoCampaign, logTable, setCurrentScene, startPlannedSession } from "../../state/tableActions";
import { TakeHitDialog } from "./Combat";
import { JobPanel } from "../jobs/JobPanel";
import { EntityDrawer } from "./Participants";
import { usePlayerCharacters } from "./hooks";
import { PlayerScreen } from "./PlayerScreen";
import { SceneMap, useSceneMap } from "./SceneMap";
import { EventFeed, collapseRepeats } from "./SessionLog";
import { ThisJob } from "./ThisJob";
import { BoundTracker, useModeTrackers } from "./TrackersPanel";

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  Link: ({ children, className }: { children?: ReactNode; className?: string }) => <a className={className}>{children}</a>,
  useNavigate: () => () => undefined,
}));

const opened: Array<() => void> = [];
afterEach(() => {
  cleanup();
  act(() => clearToasts());
  vi.restoreAllMocks();
  while (opened.length) opened.pop()?.();
});

/** Skyfire Down, session 2 running, on "The ore run" (the job's site, its map and the hunt). */
async function oreRun(): Promise<{ ctx: CampaignContextValue; sessionId: Id; sceneId: Id }> {
  const id = await loadDemoCampaign();
  const ctx = await openCampaign(id);
  opened.push(ctx.close);
  const sessionId = ctx.store.list("sessions").find((s) => s.number === 2)!.id;
  startPlannedSession(ctx, sessionId);
  const sceneId = ctx.store.list("scenes").find((s) => s.title === "The ore run")!.id;
  setCurrentScene(ctx, sessionId, sceneId);
  return { ctx, sessionId, sceneId };
}

const noop = () => undefined;

/** The header clock, the initiative tracker and the scene's live map, as table mode lays them out. */
function Table({ sessionId, sceneId }: { sessionId: Id; sceneId: Id }) {
  const trackers = useModeTrackers();
  const scene = useRecord("scenes", sceneId);
  const map = useSceneMap(scene);
  const pcs = usePlayerCharacters();
  const clock = trackers.find((t) => t.kind === "clock")!;
  const initiative = trackers.find((t) => t.kind === "initiative")!;
  return (
    <>
      <div data-testid="header-clock">
        <BoundTracker sessionId={sessionId} def={clock} entities={[]} onEffects={noop} onLog={noop} onRollOperation={noop} />
      </div>
      <BoundTracker sessionId={sessionId} def={initiative} entities={pcs.map((p) => ({ id: p.id, name: p.name, fields: p.fields }))} onEffects={noop} onLog={noop} onRollOperation={noop} />
      {map && <SceneMap sessionId={sessionId} map={map} scene={scene} participants={pcs} />}
      <ToastViewport />
    </>
  );
}

const Harness = ({ ctx, children }: { ctx: CampaignContextValue; children: ReactNode }) => <CampaignContext.Provider value={ctx}>{children}</CampaignContext.Provider>;

describe("one round counter", () => {
  it("the hunt's and the initiative tracker's Next round advance the header clock, and both read it", async () => {
    const { ctx, sessionId, sceneId } = await oreRun();
    render(
      <Harness ctx={ctx}>
        <Table sessionId={sessionId} sceneId={sceneId} />
      </Harness>,
    );
    const clockRound = () => within(screen.getByTestId("header-clock")).getByTestId("clock-round").textContent;
    const initiativeRound = () => screen.getByTestId("initiative-round").textContent;
    const huntStep = () => screen.getByTestId("hunt-step").textContent;
    expect(clockRound()).toBe("0");
    expect(initiativeRound()).toBe("Round 0");

    // the hunt's "Next round": the clock moves, the hunt asks, everyone reads 1
    act(() => fireEvent.click(screen.getByTestId("hunt-next-round")));
    expect(clockRound()).toBe("1");
    expect(initiativeRound()).toBe("Round 1");
    await waitFor(() => expect(screen.getByTestId("hunt-prompt").textContent).toContain("Round 1 begins"));
    expect(huntStep()).toBe("· Round 1");

    // the initiative tracker's "Next round": everyone may act again, and the same clock moves
    const init = screen.getByRole("region", { name: "Initiative" });
    fireEvent.change(within(init).getByRole("combobox", { name: "Add from entities" }), { target: { value: usePcs(ctx)[0]!.id } });
    act(() => fireEvent.click(within(init).getByRole("button", { name: "Add" })));
    act(() => fireEvent.click(within(init).getAllByRole("checkbox", { name: /acted$/ })[0]!));
    expect((within(init).getAllByRole("checkbox", { name: /acted$/ })[0] as HTMLInputElement).checked).toBe(true);
    act(() => fireEvent.click(within(init).getByRole("button", { name: "Next round" })));
    expect(clockRound()).toBe("2");
    expect(initiativeRound()).toBe("Round 2");
    expect((within(init).getAllByRole("checkbox", { name: /acted$/ })[0] as HTMLInputElement).checked).toBe(false);
    await waitFor(() => expect(huntStep()).toBe("· Round 2"));
    expect(screen.getByTestId("hunt-prompt").textContent).toContain("Round 2 begins");

    // a stretch on the hunt: the clock's stretch, and its rounds start over
    act(() => fireEvent.click(screen.getByTestId("hunt-next-stretch")));
    expect(within(screen.getByTestId("header-clock")).getByTestId("clock-stretch").textContent).toBe("1");
    expect(clockRound()).toBe("0");
    await waitFor(() => expect(huntStep()).toBe("· Stretch 1"));
  });
});

function usePcs(ctx: CampaignContextValue): Entity[] {
  return ctx.store.list("entities").filter((e) => e.fields.isPC === true || !!e.ownerMemberId).sort((a, b) => a.name.localeCompare(b.name));
}

describe("This job at the table", () => {
  it("lists the job's clues and people with their agendas and secrets; none of it reaches the player screen, and Reveal shows only the crew-notes text", async () => {
    const { ctx, sessionId, sceneId } = await oreRun();
    const scene = ctx.store.get("scenes", sceneId)!;
    const map = ctx.store.list("maps").find((m) => m.id === scene.map);
    render(
      <Harness ctx={ctx}>
        <ThisJob sessionId={sessionId} scene={scene} map={map} onOpen={noop} />
        <ToastViewport />
      </Harness>,
    );
    const job = screen.getByTestId("this-job");
    expect(job.textContent).toContain("This job");
    const jobEntity = ctx.store.list("entities").find((e) => e.type === "alien.job" && e.tags.includes("job-board"))!;
    expect(job.textContent).toContain(jobEntity.name);

    // its people: the module's notes on each, the betrayer marked
    const people = runJobPeople(adventureSourceInput(ctx.store.toJSON(), ctx.module.module, jobEntity.id, "campaign"));
    expect(people.length).toBe(3);
    const secrets = people.flatMap((p) => p.notes.map((n) => n.text));
    for (const text of secrets) expect(job.textContent).toContain(text);
    expect(within(job).getAllByTestId("source-person-stance").map((b) => b.textContent)).toContain("Turns on the crew");

    // its clues: the one found last session, and the one Mara knows (seeded with her)
    const clues = within(job).getAllByTestId("this-job-clue");
    expect(clues.map((c) => c.getAttribute("data-state")).sort()).toEqual(["found", "seeded"]);
    const seeded = clues.find((c) => c.getAttribute("data-state") === "seeded")!;
    const thread = threadsInOrder(ctx.store.list("arcs")).find((t) => t.stages.some((s) => s.clues.some((c) => c.id === seeded.getAttribute("data-clue"))))!;
    const clue = thread.stages.flatMap((s) => s.clues).find((c) => c.id === seeded.getAttribute("data-clue"))!;

    // the player screen: nothing of it, not even after a reveal
    const players = render(
      <Harness ctx={ctx}>
        <PlayerScreen sessionId={sessionId} />
      </Harness>,
    );
    const scan = () => {
      const text = players.container.textContent ?? "";
      for (const s of secrets) expect(text, s).not.toContain(s);
      expect(text).not.toContain("Turns on the crew");
      expect(text).not.toContain("This job");
      expect(text).not.toContain(clue.seeded!.text!);
      expect(text).not.toContain(clue.text);
    };
    scan();
    expect(players.queryByTestId("player-spotlight")).toBeNull();

    // Reveal: found by the whole crew, on the player screen by its crew-notes text only
    act(() => fireEvent.click(within(seeded).getByTestId("this-job-reveal")));
    const after = ctx.store.get("arcs", thread.id)!.stages.flatMap((s) => s.clues).find((c) => c.id === clue.id)!;
    expect(after.state).toBe("found");
    expect(after.found).toMatchObject({ session: sessionId, job: jobEntity.id, via: "job" });
    await waitFor(() => expect(players.getByTestId("player-spotlight").textContent).toContain(clue.playerText));
    scan();
    // off the screen again; the clue stays found
    act(() => fireEvent.click(within(screen.getByTestId("this-job")).getByTestId("this-job-unreveal")));
    await waitFor(() => expect(players.queryByTestId("player-spotlight")).toBeNull());
    // Mark not found, then Mark found from the table
    const row = () => screen.getAllByTestId("this-job-clue").find((c) => c.getAttribute("data-clue") === clue.id)!;
    act(() => fireEvent.click(within(row()).getByRole("button", { name: "Mark not found" })));
    expect(row().getAttribute("data-state")).toBe("seeded");
    act(() => fireEvent.click(within(row()).getByTestId("this-job-found")));
    expect(row().getAttribute("data-state")).toBe("found");
  });
});

describe("the job's people and site, off the table", () => {
  it("the job page shows each NPC's agenda and secret under People in this job; the site's drawer finds its site map", async () => {
    const { ctx, sessionId, sceneId } = await oreRun();
    const jobEntity = ctx.store.list("entities").find((e) => e.type === "alien.job" && e.tags.includes("job-board"))!;
    const people = runJobPeople(adventureSourceInput(ctx.store.toJSON(), ctx.module.module, jobEntity.id, "campaign"));
    render(
      <Harness ctx={ctx}>
        <JobPanel entity={jobEntity} />
      </Harness>,
    );
    const npcs = screen.getByTestId("job-npcs");
    for (const p of people) {
      const notes = npcs.querySelector(`[data-testid="person-notes"][data-entity="${p.entity}"]`);
      expect(notes, p.entity).not.toBeNull();
      for (const n of p.notes) expect(notes!.textContent).toContain(n.text);
    }
    cleanup();
    // the scene's place: its zone map field names the saved site map, not "No map"
    const site = ctx.store.get("scenes", sceneId)!.location!;
    const map = ctx.store.list("maps").find((m) => m.location === site)!;
    render(
      <Harness ctx={ctx}>
        <EntityDrawer entityId={site} sessionId={sessionId} onClose={noop} />
      </Harness>,
    );
    const field = await screen.findByTestId("zone-map-field");
    expect(field.textContent).toContain(map.name);
    expect(field.textContent).not.toContain("No map");
    expect((within(field).getByRole("button", { name: "Open map" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("the hunt's placement", () => {
  it("lists the map's NPCs once each, under NPCs on this map, never as rogue humans", async () => {
    const { ctx, sessionId, sceneId } = await oreRun();
    render(
      <Harness ctx={ctx}>
        <Table sessionId={sessionId} sceneId={sceneId} />
      </Harness>,
    );
    const from = within(screen.getByTestId("hunt-panel")).getByRole("combobox", { name: "Hidden threat from" });
    const groups = [...from.querySelectorAll("optgroup")].map((g) => ({ label: g.label, options: [...g.querySelectorAll("option")].map((o) => o.textContent ?? "") }));
    const npcs = groups.find((g) => g.label === "NPCs on this map")!;
    expect(npcs).toBeTruthy();
    const jobNpcs = ctx.store.list("entities").filter((e) => e.type === "alien.character" && !e.fields.isPC && ctx.store.list("relationships").some((r) => r.from === e.id && r.type === "involved_in"));
    for (const npc of jobNpcs) {
      const all = groups.flatMap((g) => g.options).filter((o) => o.startsWith(`${npc.name} (`));
      expect(all, npc.name).toHaveLength(1);
      expect(all[0], npc.name).not.toMatch(/Rogue humans/);
    }
    expect(npcs.options.every((o) => !/Rogue humans/.test(o))).toBe(true);
  });
});

describe("map safety", () => {
  it("Reveal all can be undone; Reset the map sits under More map actions and asks first, with an undo", async () => {
    const { ctx, sessionId, sceneId } = await oreRun();
    render(
      <Harness ctx={ctx}>
        <Table sessionId={sessionId} sceneId={sceneId} />
      </Harness>,
    );
    const mapId = ctx.store.get("scenes", sceneId)!.map!;
    const live = () => liveOf(ctx.store.get("maps", mapId)!);
    const before = [...live().revealed];
    act(() => fireEvent.click(screen.getByTestId("map-reveal-all")));
    expect(live().revealed.length).toBeGreaterThan(before.length);
    act(() => fireEvent.click(screen.getByRole("button", { name: "Undo" })));
    expect([...live().revealed].sort()).toEqual([...before].sort());

    // reset: not next to Reveal all, asks first
    const more = screen.getByTestId("map-more");
    expect(within(screen.getByRole("group", { name: "Map tool" })).queryByRole("button", { name: /Reset/ })).toBeNull();
    const tokens = live().tokens.length;
    const threats = huntOf(live()).tokens.length;
    expect(tokens).toBeGreaterThan(0);
    act(() => fireEvent.click(within(more).getByTestId("map-reset")));
    const dialog = screen.getByRole("dialog", { name: "Reset the map?" });
    act(() => fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" })));
    expect(live().tokens.length).toBe(tokens);
    act(() => fireEvent.click(within(more).getByTestId("map-reset")));
    act(() => fireEvent.click(within(screen.getByRole("dialog", { name: "Reset the map?" })).getByRole("button", { name: "Reset the map" })));
    expect(live().tokens.length).toBe(0);
    act(() => fireEvent.click(screen.getByRole("button", { name: "Undo" })));
    expect(live().tokens.length).toBe(tokens);
    expect(huntOf(live()).tokens.length).toBe(threats);
  });
});

describe("the event log", () => {
  it("folds a run of the same line into one with a count, never two rolls", () => {
    const e = (text: string, at: string, data?: unknown) => ({ text, at, ...(data ? { data } : {}) });
    const out = collapseRepeats([e("Sweep: no movement", "5"), e("Sweep: no movement", "4"), e("Sweep: no movement", "3"), e("Round 2", "2"), e("Sweep: no movement", "1"), e("Free roll: 1", "0b", { seed: "s:2" }), e("Free roll: 1", "0a", { seed: "s:1" })]);
    expect(out.map((x) => [x.text, x.count])).toEqual([
      ["Sweep: no movement", 3],
      ["Round 2", 1],
      ["Sweep: no movement", 1],
      ["Free roll: 1", 1],
      ["Free roll: 1", 1],
    ]);
    expect(out[0]!.since).toBe("3");
  });

  it("shows repeated sweeps once with a count", async () => {
    const { ctx, sessionId } = await oreRun();
    for (let i = 0; i < 5; i++) logTable(ctx, sessionId, "Sweep by Lee-Ann Jenkins: no movement", { kind: "sweep" });
    render(
      <Harness ctx={ctx}>
        <EventFeed sessionId={sessionId} />
      </Harness>,
    );
    const feed = screen.getByRole("list", { name: "Session events" });
    const rows = within(feed).getAllByText("Sweep by Lee-Ann Jenkins: no movement");
    expect(rows).toHaveLength(1);
    expect(within(feed).getByTestId("event-count").textContent).toBe("×5");
  });
});

describe("Take a hit", () => {
  it("has one primary action; closing with a hit typed in but not applied asks first", async () => {
    const { ctx, sessionId } = await oreRun();
    const pc = usePcs(ctx).find((p) => !p.fields.android)!;
    const onClose = vi.fn();
    render(
      <Harness ctx={ctx}>
        <TakeHitDialog sessionId={sessionId} entityId={pc.id} participants={[pc]} map={undefined} onClose={onClose} />
      </Harness>,
    );
    const dialog = screen.getByRole("dialog", { name: `Take a hit: ${pc.name}` });
    // untouched: Cancel just closes
    expect(within(dialog).queryByRole("button", { name: "Done" })).toBeNull();
    fireEvent.change(within(dialog).getByRole("spinbutton", { name: "Damage" }), { target: { value: "2" } });
    act(() => fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" })));
    expect(onClose).not.toHaveBeenCalled();
    expect(within(dialog).getByTestId("take-hit-discard").textContent).toContain("was not applied");
    act(() => fireEvent.click(within(dialog).getByRole("button", { name: "Keep it open" })));
    // apply it: the footer becomes Done and closes without asking
    act(() => fireEvent.click(within(dialog).getByRole("button", { name: `Apply to ${pc.name}` })));
    expect(within(dialog).getByTestId("hit-result")).toBeTruthy();
    act(() => fireEvent.click(within(dialog).getByRole("button", { name: "Done" })));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
