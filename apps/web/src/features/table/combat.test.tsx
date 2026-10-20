import "fake-indexeddb/auto";
import { creatureAttacks, getTrackerState, healthState, placeToken, presetToEntity, rollCreatureAttack, runMapGenerator, startLive, updateTrackerState, type Entity, type Id, type SiteMap } from "@campaign-forge/core";
import { exampleModule, exampleSiteGenerator } from "@campaign-forge/module-example";
import { createRng, type RollResult } from "@campaign-forge/module-sdk";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createCampaign, createEntity } from "../../state/actions";
import { CampaignContext, openCampaign, type CampaignContextValue } from "../../state/CampaignProvider";
import { opposedOutcome, previewHit, takeHit } from "../../state/combatActions";
import { useRecord } from "../../state/hooks";
import { DICE_LOG, TABLE_LOG, planNextSession, sessionTrackerState, startPlannedSession, type DiceLogData } from "../../state/tableActions";
import { CreatureTurnCard, TakeHitDialog, useInitiativeCurrent, type CombatHandlers } from "./Combat";
import { Participants } from "./Participants";
import { PlayerScreen } from "./PlayerScreen";
import { PlayGuidePanel } from "./PlayGuidePanel";
import { SpecialAttackPanel } from "./SpecialAttacks";

const opened: Array<() => void> = [];
afterEach(() => {
  cleanup();
  while (opened.length) opened.pop()?.();
});

let campaignId: string;
let alienId: string;
beforeAll(async () => {
  campaignId = await createCampaign({ name: "Combat", moduleId: "example" });
  alienId = await createCampaign({ name: "Combat (Alien)", moduleId: "alien", mode: "cinematic" });
}, 30_000);

interface Setup {
  ctx: CampaignContextValue;
  sessionId: Id;
  aria: Entity;
  bren: Entity;
  grub: Entity;
}

async function setup(): Promise<Setup> {
  const ctx = await openCampaign(campaignId);
  opened.push(ctx.close);
  const aria = createEntity(ctx, { type: "example.hero", name: "Aria", fields: { isPC: true, attributes: { might: 3, wits: 2 }, skills: { fight: 2, lore: 0, sneak: 0 }, wounds: 0, armor: 1 } });
  const bren = createEntity(ctx, { type: "example.hero", name: "Bren", fields: { isPC: true, attributes: { might: 2, wits: 3 }, skills: { fight: 1, lore: 2, sneak: 1 }, wounds: 0 } });
  const grub = createEntity(ctx, { type: "example.beast", name: "Grub", fields: { speed: 2, health: 4, damage: 0, armor: 1, armorVsFire: 0, venom: 1, attackTable: "example.table.beast-attacks" } });
  const session = startPlannedSession(ctx, planNextSession(ctx, { title: "Fight" }).id);
  return { ctx, sessionId: session.id, aria, bren, grub };
}

const log = (ctx: CampaignContextValue, sessionId: Id) => sessionTrackerState(ctx.store, sessionId)?.log ?? [];
const entity = (ctx: CampaignContextValue, id: Id) => ctx.store.get("entities", id)!;
const meter = (name: string) => screen.getByRole("meter", { name });

/** Participant cards plus the take-a-hit dialog, as table mode wires them. */
function TableHarness({ ctx, sessionId, pcIds, otherIds, map }: { ctx: CampaignContextValue; sessionId: Id; pcIds: Id[]; otherIds: Id[]; map?: SiteMap }) {
  return (
    <CampaignContext.Provider value={ctx}>
      <Table sessionId={sessionId} pcIds={pcIds} otherIds={otherIds} map={map} />
    </CampaignContext.Provider>
  );
}
function Table({ sessionId, pcIds, otherIds, map }: { sessionId: Id; pcIds: Id[]; otherIds: Id[]; map?: SiteMap | undefined }) {
  const ids = [...pcIds, ...otherIds];
  const all = ids.map((id) => useRecord("entities", id)).filter((e): e is Entity => !!e);
  const pcs = all.filter((e) => pcIds.includes(e.id));
  const others = all.filter((e) => otherIds.includes(e.id));
  const [hit, setHit] = useState<Id | undefined>();
  const [turn, setTurn] = useState<Id | undefined>();
  const turnCreature = useRecord("entities", turn);
  const liveMap = useRecord("maps", map?.id);
  const combat: CombatHandlers = { sessionId, onTakeHit: setHit, onCreatureTurn: setTurn, onSpecialAttack: () => undefined, hasSpecialAttacks: true };
  return (
    <>
      {turnCreature && <CreatureTurnCard sessionId={sessionId} creature={turnCreature} targets={pcs} participants={all} map={liveMap} onClose={() => setTurn(undefined)} />}
      <Participants pcs={pcs} others={others} onOpen={() => undefined} combat={combat} />
      <TakeHitDialog sessionId={sessionId} entityId={hit} participants={all} map={liveMap} onClose={() => setHit(undefined)} />
    </>
  );
}

function liveMap(ctx: CampaignContextValue): SiteMap {
  const result = runMapGenerator(exampleModule, exampleSiteGenerator, { darkness: 40, lockedAct: 2 }, { seed: "web-live" });
  const created = ctx.store.createMap({ name: "Old keep" });
  ctx.store.update("maps", created.id, { layout: result.layout, generator: { id: exampleSiteGenerator.id, seed: "web-live", inputs: {} } });
  startLive(ctx.store, created.id, 1);
  return ctx.store.get("maps", created.id)!;
}

describe("participant health and take a hit", () => {
  it("shows health from the computed max, adjusts damage, applies a hit through the module's armor rule, and rolls the broken table", async () => {
    const { ctx, sessionId, aria, grub } = await setup();
    render(<TableHarness ctx={ctx} sessionId={sessionId} pcIds={[aria.id]} otherIds={[grub.id]} />);
    // Aria: Health = might x 2 = 6 (computed, never stored); Grub: Health 4 (a field)
    expect(meter("Aria health").getAttribute("aria-valuenow")).toBe("6");
    expect(meter("Grub health").getAttribute("aria-valuetext")).toBe("4 of 4");
    expect(entity(ctx, aria.id).fields).not.toHaveProperty("health");

    fireEvent.click(screen.getByRole("button", { name: "1 damage to Aria" }));
    expect(entity(ctx, aria.id).fields.wounds).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Heal 1 damage on Aria" }));
    expect(entity(ctx, aria.id).fields.wounds).toBe(0);

    // take a hit: 3 damage + 1 extra success, armor 1
    fireEvent.click(screen.getByRole("button", { name: "Take a hit: Aria" }));
    const dialog = screen.getByTestId("take-hit");
    fireEvent.change(within(dialog).getByRole("spinbutton", { name: "Damage" }), { target: { value: "3" } });
    fireEvent.change(within(dialog).getByRole("spinbutton", { name: "Extra successes" }), { target: { value: "1" } });
    expect(within(dialog).getByTestId("armor-resolution").textContent).toContain("Armor 1");
    expect(within(dialog).getByTestId("armor-resolution").textContent).toContain("3 damage +1 extra − armor 1 = 3 (p. 20)");
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply to Aria" }));
    expect(within(dialog).getByTestId("hit-result").textContent).toContain("Aria takes 3 damage");
    expect(entity(ctx, aria.id).fields.wounds).toBe(3);
    expect(meter("Aria health").getAttribute("aria-valuenow")).toBe("3");

    // armor piercing ignores armor and breaks her: the grave-wound table is offered, rolled and logged
    fireEvent.change(within(dialog).getByRole("spinbutton", { name: "Extra successes" }), { target: { value: "0" } });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Armor piercing" }));
    expect(within(dialog).getByTestId("armor-resolution").textContent).toContain("armor piercing (armor 1 ignored)");
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply another hit" }));
    expect(healthState(ctx.module, entity(ctx, aria.id))).toEqual({ max: 6, damage: 6, remaining: 0, broken: true });
    fireEvent.click(within(dialog).getByRole("button", { name: "Roll Grave wound for Aria" }));
    const result = within(dialog).getByTestId("broken-result").textContent ?? "";
    expect(result).toMatch(/^Grave wound: (Winded|Broken arm|Bleeding|Mortal wound)/);
    const rolled = log(ctx, sessionId).filter((l) => l.tracker === DICE_LOG);
    expect(rolled.at(-1)!.text).toMatch(/^Aria: Grave wound: /);
    expect((rolled.at(-1)!.data as DiceLogData).table).toBe("example.table.grave-wound");
    // the two hits are in the dice log with their seeds, GM-only
    const hits = rolled.filter((l) => (l.data as DiceLogData).kind === "damage");
    expect(hits.map((h) => h.text)).toEqual([expect.stringMatching(/^Aria takes a hit: 3 damage\. .*Health 3\/6$/), expect.stringMatching(/^Aria takes a hit: 3 damage\. .*Health 0\/6, broken$/)]);
    expect(hits.every((h) => (h.data as DiceLogData).gmOnly === true && /:\d+$/.test((h.data as DiceLogData).seed))).toBe(true);
    // the card offers the broken roll while she is at zero
    expect(within(screen.getByRole("list", { name: "Player characters" })).getByRole("button", { name: "Roll Grave wound for Aria" })).toBeTruthy();
  });

  it("damaging a creature uses its armor (fire armor for fire) and prompts its reaction with who is in its zone", async () => {
    const { ctx, sessionId, aria, bren, grub } = await setup();
    const map = liveMap(ctx);
    placeToken(ctx.store, map.id, { label: "Grub", zone: "R4", entity: grub.id, gmOnly: true });
    placeToken(ctx.store, map.id, { label: "Aria", zone: "R4", entity: aria.id });
    placeToken(ctx.store, map.id, { label: "Bren", zone: "C1", entity: bren.id });
    render(<TableHarness ctx={ctx} sessionId={sessionId} pcIds={[aria.id, bren.id]} otherIds={[grub.id]} map={map} />);

    fireEvent.click(screen.getByRole("button", { name: "Take a hit: Grub" }));
    const dialog = screen.getByTestId("take-hit");
    fireEvent.change(within(dialog).getByRole("spinbutton", { name: "Damage" }), { target: { value: "3" } });
    expect(within(dialog).getByTestId("armor-resolution").textContent).toContain("3 damage − armor 1 = 2");
    // fire: armor vs fire 0, and the venom spray does not trigger
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Source" }), { target: { value: "fire" } });
    expect(within(dialog).getByTestId("armor-resolution").textContent).toContain("Armor 0");
    expect(within(dialog).getByTestId("armor-resolution").textContent).toContain("3 damage − armor 0 = 3");
    fireEvent.change(within(dialog).getByRole("spinbutton", { name: "Damage" }), { target: { value: "1" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply to Grub" }));
    expect(entity(ctx, grub.id).fields.damage).toBe(1);
    expect(within(dialog).queryByTestId("reaction-panel")).toBeNull();

    // a plain hit: 2 damage gets through and the venom spray asks for venom 1 + 2 = 3 dice
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Source" }), { target: { value: "" } });
    fireEvent.change(within(dialog).getByRole("spinbutton", { name: "Damage" }), { target: { value: "3" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply another hit" }));
    expect(entity(ctx, grub.id).fields.damage).toBe(3);
    const reaction = within(dialog).getByTestId("reaction-panel");
    expect(reaction.textContent).toContain("roll 3 dice (1 + 2 damage taken)");
    expect(reaction.textContent).toContain("1 damage per success; it reaches everything in the same zone");
    // roll until the spray does damage (each roll seeded and logged GM-only)
    let damage = 0;
    for (let i = 0; i < 30 && damage === 0; i++) {
      fireEvent.click(within(reaction).getByRole("button", { name: /^Roll Venom spray/ }));
      damage = Number(/: (\d+) damage/.exec(within(reaction).getByTestId("reaction-damage").textContent ?? "")?.[1] ?? 0);
    }
    expect(damage).toBeGreaterThan(0);
    expect(within(reaction).getByTestId("reaction-near").textContent).toBe("In Grub's zone: Aria");
    const targets = within(reaction).getByRole("list", { name: "Venom spray targets" });
    // nearest first: Aria (same zone), then Bren (one zone away)
    expect(within(targets).getAllByRole("listitem").map((li) => li.getAttribute("data-target"))).toEqual([aria.id, bren.id]);
    const before = healthState(ctx.module, entity(ctx, aria.id))!.damage;
    fireEvent.click(within(targets).getByRole("button", { name: `Apply ${damage} to Aria` }));
    const expected = Math.max(0, damage - 1); // Aria's armor 1
    expect(healthState(ctx.module, entity(ctx, aria.id))!.damage).toBe(Math.min(6, before + expected));
    const sprays = log(ctx, sessionId).filter((l) => l.tracker === DICE_LOG && l.text.startsWith("Grub: Venom spray"));
    expect(sprays.length).toBeGreaterThan(0);
    expect(sprays.every((l) => (l.data as DiceLogData).gmOnly)).toBe(true);
  });
});

describe("creature turn", () => {
  it("rolls the signature attack table seeded and logged GM-only, picks an attack, rolls its dice and applies the hit to a target", async () => {
    const { ctx, sessionId, aria, bren, grub } = await setup();
    render(<TableHarness ctx={ctx} sessionId={sessionId} pcIds={[aria.id, bren.id]} otherIds={[grub.id]} />);
    fireEvent.click(screen.getByRole("button", { name: "Creature turn: Grub" }));
    const card = screen.getByTestId("creature-turn");
    expect(within(card).getByTestId("creature-speed").textContent).toBe("Speed 2");
    expect(within(card).getByText(/2 actions \(or initiative cards\) this round/)).toBeTruthy();
    expect(within(card).getByRole("list", { name: "Turn notes" }).textContent).toContain("p. 33");

    // roll the table: the shown attack is what the logged seed gives
    fireEvent.click(within(card).getByRole("button", { name: "Roll signature attack" }));
    const tableRoll = log(ctx, sessionId).filter((l) => l.tracker === DICE_LOG).at(-1)!;
    const data = tableRoll.data as DiceLogData;
    expect(data).toMatchObject({ kind: "table", table: "example.table.beast-attacks", gmOnly: true });
    const replay = rollCreatureAttack(ctx.module, entity(ctx, grub.id), createRng(data.seed));
    expect(within(card).getByTestId("attack-name").textContent).toBe(replay.attack.name);
    expect(tableRoll.text).toBe(`Grub: Beast attacks: ${replay.attack.name} (${replay.record.total})`);

    // choose an attack instead (the notes allow it)
    fireEvent.click(within(card).getByRole("button", { name: "Choose attack" }));
    expect(within(within(card).getByRole("list", { name: "Attacks" })).getAllByRole("listitem")).toHaveLength(creatureAttacks(ctx.module, grub).length);
    fireEvent.click(within(card).getByRole("button", { name: "Use Lunge" }));
    expect(within(card).getByTestId("attack-name").textContent).toBe("Lunge");
    expect(within(card).getByTestId("attack-dice").textContent).toBe("4");
    expect(within(card).getByTestId("attack-damage").textContent).toBe("2");
    expect(within(card).getByTestId("attack-effect").textContent).toBe("The target is knocked prone.");
    expect(log(ctx, sessionId).filter((l) => l.tracker === TABLE_LOG).at(-1)!.text).toBe("Grub: GM picks Lunge");

    // target Bren; roll 4 dice until it hits
    fireEvent.change(within(card).getByRole("combobox", { name: "Target" }), { target: { value: bren.id } });
    let successes = 0;
    for (let i = 0; i < 30 && successes === 0; i++) {
      fireEvent.click(within(card).getByRole("button", { name: "Roll attack: 4 dice" }));
      successes = Number(/^(\d+) success/.exec(within(card).getByTestId("attack-successes").textContent ?? "")?.[1] ?? 0);
    }
    expect(successes).toBeGreaterThan(0);
    const pool = log(ctx, sessionId).filter((l) => l.tracker === DICE_LOG).at(-1)!;
    expect(pool.text).toMatch(/^Grub: Lunge at Bren: /);
    expect((pool.data as DiceLogData).gmOnly).toBe(true);
    expect((pool.data as { result: RollResult }).result.dice).toHaveLength(4);

    // apply: damage 2 + (successes - 1) extra, Bren has no armor (capped at his Health 4)
    fireEvent.click(within(card).getByRole("button", { name: "Apply to Bren" }));
    expect(within(card).getByTestId("hit-result").textContent).toContain("Bren takes");
    expect(entity(ctx, bren.id).fields.wounds).toBe(Math.min(4, 2 + successes - 1));
    expect(meter("Bren health").getAttribute("aria-valuenow")).toBe(String(Math.max(0, 4 - (2 + successes - 1))));
    const hit = log(ctx, sessionId).filter((l) => l.tracker === DICE_LOG).at(-1)!;
    expect(hit.text).toMatch(/^Bren takes a hit \(Grub: Lunge\)/);

    // every entry naming the creature is GM-only, and the player screen shows none of it
    const named = log(ctx, sessionId).filter((l) => l.text.includes("Grub"));
    expect(named.length).toBeGreaterThanOrEqual(4);
    expect(named.every((l) => (l.data as { gmOnly?: boolean }).gmOnly === true)).toBe(true);
    cleanup();
    render(
      <CampaignContext.Provider value={ctx}>
        <PlayerScreen sessionId={sessionId} />
      </CampaignContext.Provider>,
    );
    await act(async () => undefined);
    const player = screen.getByTestId("player-screen");
    expect(player.textContent).not.toContain("Grub");
    expect(player.textContent).not.toContain("Lunge");
    expect(player.textContent).not.toContain(replay.attack.name);
  });

  it("lists targets nearest first with zone distance and range band from the live map", async () => {
    const { ctx, sessionId, aria, bren, grub } = await setup();
    const map = liveMap(ctx);
    // R4 - C1 - C2 - R6
    placeToken(ctx.store, map.id, { label: "Grub", zone: "R4", entity: grub.id, gmOnly: true });
    placeToken(ctx.store, map.id, { label: "Aria", zone: "R6", entity: aria.id });
    placeToken(ctx.store, map.id, { label: "Bren", zone: "C1", entity: bren.id });
    render(<TableHarness ctx={ctx} sessionId={sessionId} pcIds={[aria.id, bren.id]} otherIds={[grub.id]} map={map} />);
    fireEvent.click(screen.getByRole("button", { name: "Creature turn: Grub" }));
    const card = screen.getByTestId("creature-turn");
    fireEvent.click(within(card).getByRole("button", { name: "Roll signature attack" }));
    const ranges = within(card).getByTestId("target-ranges");
    expect(within(ranges).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Bren1 zone · Close", "Aria3 zones · Far"]);
    const options = within(within(card).getByRole("combobox", { name: "Target" })).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Bren (1 zone · Close)", "Aria (3 zones · Far)"]);
  });

  it("knows whose initiative card is up", async () => {
    const { ctx, sessionId, aria, grub } = await setup();
    updateTrackerState(ctx.store, sessionId, "example.tracker.initiative", {
      round: 2,
      participants: [
        { id: "p1", name: "Aria", entityId: aria.id, card: 5, extraDraws: 0, acted: false },
        { id: "p2", name: "Grub", entityId: grub.id, card: 2, extraDraws: 1, acted: false },
      ],
    });
    function Current() {
      const c = useInitiativeCurrent(sessionId);
      return <output data-testid="current">{c ? `${c.name} ${c.card} r${c.round}` : "none"}</output>;
    }
    render(
      <CampaignContext.Provider value={ctx}>
        <Current />
      </CampaignContext.Provider>,
    );
    expect(screen.getByTestId("current").textContent).toBe("Grub 2 r2");
    const state = getTrackerState(ctx.store, sessionId).state["example.tracker.initiative"] as { participants: Array<{ acted: boolean }> };
    act(() => {
      updateTrackerState(ctx.store, sessionId, "example.tracker.initiative", { round: 2, participants: state.participants.map((p, i) => ({ ...p, acted: i === 1 })) });
    });
    expect(screen.getByTestId("current").textContent).toBe("Aria 5 r2");
  });
});

describe("special attacks", () => {
  const result = (successes: number): RollResult => ({ pool: { dice: {} }, dice: [], successes, symbols: {}, pushes: 0, canPush: false });

  it("settles an opposed roll: most successes wins, a tie as the module says, else the GM", async () => {
    const { ctx } = await setup();
    const a = { name: "Aria" };
    const d = { name: "Bren" };
    expect(opposedOutcome(ctx, { ...a, result: result(2) }, { ...d, result: result(1) })).toEqual({ winner: "attacker", text: "Aria wins (2 vs 1)" });
    expect(opposedOutcome(ctx, { ...a, result: result(0) }, { ...d, result: result(1) }).winner).toBe("defender");
    expect(opposedOutcome(ctx, { ...a, result: result(1) }, { ...d, result: result(1) })).toEqual({ winner: "defender", text: "Tie (1 vs 1): Bren wins. A tie goes to the defender." });
    const noRule = { module: { ...ctx.module, module: { ...ctx.module.module, combat: { ...ctx.module.module.combat!, opposedTies: undefined } } } } as unknown as Pick<CampaignContextValue, "module">;
    expect(opposedOutcome(noRule, { ...a, result: result(1) }, { ...d, result: result(1) })).toEqual({ winner: "tie", text: "Tie (1 vs 1): the GM decides" });
  });

  it("picks a character and an attack, shows what it needs, rolls it and the opposed roll, and logs the result", async () => {
    const { ctx, sessionId, aria, bren, grub } = await setup();
    render(
      <CampaignContext.Provider value={ctx}>
        <SpecialAttackPanel sessionId={sessionId} pcs={[entity(ctx, aria.id), entity(ctx, bren.id)]} others={[entity(ctx, grub.id)]} />
      </CampaignContext.Provider>,
    );
    const panel = screen.getByTestId("special-attack");
    expect(within(within(panel).getByRole("combobox", { name: "Special attack" })).getAllByRole("option").map((o) => o.textContent)).toEqual(["Attack…", "Shove", "Disarm", "Feint"]);
    fireEvent.change(within(panel).getByRole("combobox", { name: "Special attack character" }), { target: { value: aria.id } });
    fireEvent.change(within(panel).getByRole("combobox", { name: "Special attack" }), { target: { value: "example.special.shove" } });
    expect(within(panel).getByTestId("special-requires").textContent).toBe("Adjacent");
    expect(within(panel).getByTestId("special-opposed").textContent).toBe("Might");
    expect(within(panel).getByTestId("special-effect").textContent).toBe("Push the target into the next zone or knock it prone.");
    expect(within(panel).getByText("Quick action")).toBeTruthy();
    expect(within(panel).getByText("p. 19")).toBeTruthy();

    // the attacker's roll: Fight 2 + Might 3 = 5 dice on the skill roll path (seeded, logged, pushable)
    fireEvent.click(within(panel).getByRole("button", { name: "Roll Shove for Aria" }));
    const first = log(ctx, sessionId).filter((l) => l.tracker === DICE_LOG).at(-1)!;
    expect(first.text).toMatch(/^Aria: Shove \(Fight\): /);
    expect((first.data as { result: RollResult }).result.dice).toHaveLength(5);

    // the opposed roll for the target (Bren's Might 2), and the opposed result line
    fireEvent.change(within(panel).getByRole("combobox", { name: "Opposed by" }), { target: { value: bren.id } });
    fireEvent.click(within(panel).getByRole("button", { name: "Roll Might for Bren" }));
    const second = log(ctx, sessionId).filter((l) => l.tracker === DICE_LOG).at(-1)!;
    expect(second.text).toMatch(/^Bren: resists Shove \(Might\): /);
    const aS = (first.data as { result: RollResult }).result.successes;
    const dS = (second.data as { result: RollResult }).result.successes;
    const expected = opposedOutcome(ctx, { name: "Aria", result: result(aS) }, { name: "Bren", result: result(dS) });
    expect(within(panel).getByTestId("opposed-result").textContent).toContain(expected.text);
    expect(log(ctx, sessionId).filter((l) => l.tracker === TABLE_LOG).at(-1)!.text).toBe(`Aria: Shove on Bren: ${expected.text}`);

    // a creature target resists with its own number when it has no skills (none here: one die minimum)
    fireEvent.change(within(panel).getByRole("combobox", { name: "Opposed by" }), { target: { value: grub.id } });
    fireEvent.click(within(panel).getByRole("button", { name: "Roll Might for Grub" }));
    expect(within(panel).getByTestId("opposed-result")).toBeTruthy();
  });

  it("links play-guide entries to the special attacks that roll the same skill", async () => {
    const { ctx, sessionId, aria, bren } = await setup();
    render(
      <CampaignContext.Provider value={ctx}>
        <PlayGuidePanel sessionId={sessionId} pcs={[entity(ctx, aria.id), entity(ctx, bren.id)]} />
      </CampaignContext.Provider>,
    );
    const fight = document.querySelector<HTMLElement>('[data-entry="fight"]')!;
    fireEvent.click(within(fight).getByRole("button", { expanded: false }));
    const link = within(fight).getByTestId("special-attacks-link");
    expect(link.textContent).toBe("Special attacks: Shove, Disarm");
    expect(document.querySelector('[data-entry="lore"] [data-testid="special-attacks-link"]')).toBeNull();
    fireEvent.click(link);
    const panel = screen.getByTestId("special-attack");
    expect(within(within(panel).getByRole("combobox", { name: "Special attack" })).getAllByRole("option").map((o) => o.textContent)).toEqual(["Attack…", "Shove", "Disarm"]);
  });
});

describe("combat actions", () => {
  it("previews a hit with the seed it is applied with", async () => {
    const { ctx, sessionId, grub } = await setup();
    const p = previewHit(ctx, sessionId, grub.id, { amount: 3 });
    const out = takeHit(ctx, sessionId, grub.id, { amount: 3 });
    expect(out.seed).toBe(p.seed);
    expect(out.result).toEqual(p.result);
    expect(out.reaction?.dice).toBe(1 + 2);
  });
});

describe("against the Alien module's combat data", () => {
  async function alien() {
    const ctx = await openCampaign(alienId);
    opened.push(ctx.close);
    const rosa = createEntity(ctx, { type: "alien.character", name: "Rosa", fields: { isPC: true, attributes: { strength: 4, agility: 3, wits: 3, empathy: 2 }, skills: { closeCombat: 2 }, stress: 0 } });
    const teo = createEntity(ctx, { type: "alien.character", name: "Teo", fields: { isPC: true, attributes: { strength: 3, agility: 3, wits: 3, empathy: 3 }, skills: { closeCombat: 1 }, stress: 0 } });
    const preset = ctx.module.preset("alien.creature.xx121-drone");
    if (!preset) throw new Error("no drone preset");
    const drone = presetToEntity(ctx.store, preset, { name: "Drone" });
    const session = startPlannedSession(ctx, planNextSession(ctx, { title: "Hive" }).id);
    return { ctx, sessionId: session.id, rosa, teo, drone };
  }

  it("has health, a creature turn and special attacks for the table to use", async () => {
    const { ctx, rosa, drone } = await alien();
    const combat = ctx.module.module.combat!;
    expect(combat.health.map((h) => h.entityType).sort()).toEqual(["alien.character", "alien.creature"]);
    const rosaHealth = healthState(ctx.module, entity(ctx, rosa.id))!;
    expect(rosaHealth.max).toBeGreaterThan(0);
    expect(rosaHealth).toMatchObject({ damage: 0, broken: false });
    expect(healthState(ctx.module, entity(ctx, drone.id))).toMatchObject({ max: drone.fields.health, damage: 0 });
    expect(creatureAttacks(ctx.module, drone).length).toBeGreaterThan(0);
    expect((combat.specialAttacks ?? []).length).toBeGreaterThan(0);
  });

  it("runs a drone's turn against a PC, and damaging the drone prompts acid splash", async () => {
    const { ctx, sessionId, rosa, teo, drone } = await alien();
    render(<TableHarness ctx={ctx} sessionId={sessionId} pcIds={[rosa.id, teo.id]} otherIds={[drone.id]} />);
    fireEvent.click(screen.getByRole("button", { name: "Creature turn: Drone" }));
    const card = screen.getByTestId("creature-turn");
    expect(within(card).getByTestId("creature-speed").textContent).toBe(`Speed ${drone.fields.speed}`);
    fireEvent.click(within(card).getByRole("button", { name: "Roll signature attack" }));
    const data = log(ctx, sessionId).filter((l) => l.tracker === DICE_LOG).at(-1)!.data as DiceLogData;
    expect(data.gmOnly).toBe(true);
    expect(within(card).getByTestId("attack-name").textContent).toBe(rollCreatureAttack(ctx.module, entity(ctx, drone.id), createRng(data.seed)).attack.name);
    // pick an attack that rolls dice and does damage, roll until it hits, apply to Rosa
    const attack = creatureAttacks(ctx.module, drone).find((a) => a.dice > 0 && typeof a.damage === "number" && a.damage > 0)!;
    fireEvent.click(within(card).getByRole("button", { name: "Choose attack" }));
    fireEvent.click(within(card).getByRole("button", { name: `Use ${attack.name}` }));
    fireEvent.change(within(card).getByRole("combobox", { name: "Target" }), { target: { value: rosa.id } });
    let successes = 0;
    for (let i = 0; i < 30 && successes === 0; i++) {
      fireEvent.click(within(card).getByRole("button", { name: `Roll attack: ${attack.dice} dice` }));
      successes = Number(/^(\d+) success/.exec(within(card).getByTestId("attack-successes").textContent ?? "")?.[1] ?? 0);
    }
    expect(successes).toBeGreaterThan(0);
    const max = healthState(ctx.module, entity(ctx, rosa.id))!.max;
    fireEvent.click(within(card).getByRole("button", { name: "Apply to Rosa" }));
    const after = healthState(ctx.module, entity(ctx, rosa.id))!;
    expect(after.damage).toBe(Math.min(max, (attack.damage as number) + successes - 1));
    expect(meter("Rosa health").getAttribute("aria-valuenow")).toBe(String(after.remaining));
    if (after.broken) expect(within(card).getByRole("button", { name: "Roll Critical injury for Rosa" })).toBeTruthy();

    // damage the drone: its armor applies and acid splash asks for rating + damage taken dice
    fireEvent.click(screen.getByRole("button", { name: "Take a hit: Drone" }));
    const dialog = screen.getByTestId("take-hit");
    fireEvent.change(within(dialog).getByRole("spinbutton", { name: "Damage" }), { target: { value: "4" } });
    expect(within(dialog).getByTestId("armor-resolution").textContent).toContain(`Armor ${drone.fields.armor}`);
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply to Drone" }));
    const through = 4 - Number(drone.fields.armor);
    expect(entity(ctx, drone.id).fields.damage).toBe(through);
    const splash = within(dialog).getByTestId("reaction-panel");
    expect(splash.textContent).toContain("Acid splash");
    expect(splash.textContent).toContain(`roll ${Number(drone.fields.acidSplash) + through} dice`);
  });
});
