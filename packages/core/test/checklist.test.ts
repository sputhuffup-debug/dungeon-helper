import "fake-indexeddb/auto";
import type { Template } from "@campaign-forge/module-sdk";
import { describe, expect, it } from "vitest";
import {
  CHECKLIST_PHASES,
  DEFAULT_SESSION_CHECKLIST,
  RichTextRegistry,
  autoTickChecklist,
  checklistItemsFor,
  checklistProgress,
  checklistSettings,
  checklistStateOf,
  checklistTotals,
  exportBundle,
  importBundle,
  moduleChecklistItems,
  sessionChecklist,
  setChecklistItem,
  withChecklistSettings,
  type ChecklistItem,
} from "../src";
import { newStore } from "./fixtures";

const TEMPLATES: Template[] = [
  {
    id: "fx.session",
    kind: "checklist",
    appliesTo: "session",
    name: "Fixture session checklist",
    scaffold: {
      title: "Fixture",
      items: [
        { id: "fx.prep.omens", phase: "prep", text: "Pick an omen", guidance: "One sign.", page: 12 },
        { id: "fx.wrap.doom", phase: "wrap", text: "Tally doom", mode: ["hard"], autoWhen: "prompts-answered" },
      ],
    },
  },
  { id: "fx.zero", kind: "checklist", name: "Session zero", scaffold: { title: "Zero", items: [{ id: "frame", text: "Frame?" }] } },
  { id: "fx.hard-only", kind: "checklist", appliesTo: "session", mode: ["hard"], name: "Hard", scaffold: { title: "Hard", items: [{ id: "fx.play.grim", phase: "play", text: "Be grim" }] } },
];

describe("default session checklist", () => {
  it("has stable, unique ids grouped by phase, all from core", () => {
    const ids = DEFAULT_SESSION_CHECKLIST.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(DEFAULT_SESSION_CHECKLIST.filter((i) => i.phase === "prep")).toHaveLength(10);
    expect(DEFAULT_SESSION_CHECKLIST.filter((i) => i.phase === "play")).toHaveLength(7);
    expect(DEFAULT_SESSION_CHECKLIST.filter((i) => i.phase === "wrap")).toHaveLength(7);
    for (const i of DEFAULT_SESSION_CHECKLIST) {
      expect(i.id.startsWith(`${i.phase}.`)).toBe(true);
      expect(i.source).toBe("core");
      expect(i.guidance).toBeTruthy();
    }
    expect(DEFAULT_SESSION_CHECKLIST.find((i) => i.id === "prep.scenes")?.text).toBe("Sketch a few scenes, not a script");
  });
});

describe("moduleChecklistItems", () => {
  it("takes session checklist templates only, with item or template modes, page, event and module id", () => {
    const items = moduleChecklistItems(TEMPLATES, "fx");
    expect(items).toEqual<ChecklistItem[]>([
      { id: "fx.prep.omens", phase: "prep", text: "Pick an omen", guidance: "One sign.", source: "module", moduleId: "fx", page: 12 },
      { id: "fx.wrap.doom", phase: "wrap", text: "Tally doom", source: "module", mode: ["hard"], moduleId: "fx", autoWhen: "prompts-answered" },
      { id: "fx.play.grim", phase: "play", text: "Be grim", source: "module", mode: ["hard"], moduleId: "fx" },
    ]);
  });

  it("maps events to the items they tick, core and module alike", () => {
    const list = sessionChecklist({ mode: "hard", settings: {} }, moduleChecklistItems(TEMPLATES, "fx"));
    expect(checklistItemsFor(list, "prompts-answered")).toEqual(["wrap.rewards", "fx.wrap.doom"]);
    expect(checklistItemsFor(list, "scenes-planned")).toEqual(["prep.scenes"]);
    expect(checklistItemsFor(list, "revealed")).toEqual(["play.reveals"]);
    const auto = DEFAULT_SESSION_CHECKLIST.filter((i) => i.autoWhen).map((i) => `${i.id}:${i.autoWhen}`);
    expect(auto).toEqual([
      "prep.scenes:scenes-planned",
      "play.notes:log-written",
      "play.reveals:revealed",
      "wrap.rewards:prompts-answered",
      "wrap.summary:summary-saved",
      "wrap.loose-ends:loose-ends-carried",
      "wrap.timeline:timeline-confirmed",
      "wrap.schedule:next-session-planned",
    ]);
  });
});

describe("sessionChecklist", () => {
  const moduleItems = moduleChecklistItems(TEMPLATES, "fx");

  it("orders by phase: defaults, then module items, then the GM's items", () => {
    const meta = {
      mode: "hard",
      settings: {
        sessionChecklist: {
          custom: [
            { id: "custom.snacks", phase: "prep", text: "Buy snacks" },
            { id: "custom.thanks", phase: "wrap", text: "Thank the host", guidance: "Be nice." },
          ],
        },
      },
    };
    const list = sessionChecklist(meta, moduleItems);
    const phases = list.map((i) => i.phase);
    expect(phases).toEqual([...phases].sort((a, b) => CHECKLIST_PHASES.indexOf(a) - CHECKLIST_PHASES.indexOf(b)));
    const prep = list.filter((i) => i.phase === "prep").map((i) => i.id);
    expect(prep.slice(-2)).toEqual(["fx.prep.omens", "custom.snacks"]);
    expect(prep.slice(0, 10)).toEqual(DEFAULT_SESSION_CHECKLIST.filter((i) => i.phase === "prep").map((i) => i.id));
    expect(list.filter((i) => i.phase === "play").map((i) => i.id).at(-1)).toBe("fx.play.grim");
    expect(list.filter((i) => i.phase === "wrap").map((i) => i.id).slice(-2)).toEqual(["fx.wrap.doom", "custom.thanks"]);
    expect(list.find((i) => i.id === "custom.thanks")).toEqual({ id: "custom.thanks", phase: "wrap", text: "Thank the host", guidance: "Be nice.", source: "campaign" });
    expect(list).toHaveLength(DEFAULT_SESSION_CHECKLIST.length + 3 + 2);
  });

  it("drops hidden items and module items outside the campaign's mode", () => {
    const meta = { mode: "easy", settings: { sessionChecklist: { hidden: ["prep.logistics", "play.recap", "fx.prep.omens"] } } };
    const ids = sessionChecklist(meta, moduleItems).map((i) => i.id);
    expect(ids).not.toContain("prep.logistics");
    expect(ids).not.toContain("play.recap");
    expect(ids).not.toContain("fx.prep.omens");
    expect(ids).not.toContain("fx.wrap.doom");
    expect(ids).not.toContain("fx.play.grim");
    expect(ids).toHaveLength(DEFAULT_SESSION_CHECKLIST.length - 2);
  });

  it("ignores malformed settings", () => {
    const meta = { mode: "easy", settings: { sessionChecklist: { hidden: "nope", custom: [{ id: 3 }, { id: "x", text: "X", phase: "later" }] } } };
    expect(sessionChecklist(meta).map((i) => i.id)).toEqual(DEFAULT_SESSION_CHECKLIST.map((i) => i.id));
    expect(checklistSettings({ settings: {} })).toEqual({ hidden: [], custom: [] });
  });

  it("withChecklistSettings keeps other settings and the half not given", () => {
    const meta = { settings: { frame: "truckers", sessionChecklist: { hidden: ["prep.goal"] } } };
    const next = withChecklistSettings(meta, { custom: [{ id: "c1", phase: "play", text: "Music" }] });
    expect(next).toEqual({ frame: "truckers", sessionChecklist: { hidden: ["prep.goal"], custom: [{ id: "c1", phase: "play", text: "Music" }] } });
  });
});

describe("per-session state", () => {
  it("setChecklistItem ticks and unticks; progress counts per phase over the visible items", () => {
    const store = newStore();
    const session = store.createSession({ title: "One" });
    const items = sessionChecklist(store.meta());
    expect(checklistProgress(items, session)).toEqual({ prep: { done: 0, total: 10 }, play: { done: 0, total: 7 }, wrap: { done: 0, total: 7 } });

    setChecklistItem(store, session.id, "prep.goal", true);
    setChecklistItem(store, session.id, "prep.scenes", true);
    setChecklistItem(store, session.id, "wrap.hook", true);
    setChecklistItem(store, session.id, "gone.item", true); // not in the list: not counted
    setChecklistItem(store, session.id, "prep.scenes", false);
    const s = store.get("sessions", session.id)!;
    expect(checklistStateOf(s)).toEqual({ "prep.goal": true, "prep.scenes": false, "wrap.hook": true, "gone.item": true });
    const progress = checklistProgress(items, s);
    expect(progress).toEqual({ prep: { done: 1, total: 10 }, play: { done: 0, total: 7 }, wrap: { done: 1, total: 7 } });
    expect(checklistTotals(progress)).toEqual({ done: 2, total: 24 });
    expect(() => setChecklistItem(store, "missing", "prep.goal", true)).toThrow();
  });

  it("autoTickChecklist only ticks unset items and never overrides an untick", () => {
    const store = newStore();
    const session = store.createSession();
    setChecklistItem(store, session.id, "play.reveals", false);
    setChecklistItem(store, session.id, "play.notes", true);
    expect(autoTickChecklist(store, session.id, ["play.reveals", "play.notes", "prep.scenes"])).toEqual(["prep.scenes"]);
    expect(checklistStateOf(store.get("sessions", session.id))).toEqual({ "play.reveals": false, "play.notes": true, "prep.scenes": true });
    expect(autoTickChecklist(store, "missing", ["prep.scenes"])).toEqual([]);
  });

  it("export and import keep the ticks and the campaign's checklist settings", async () => {
    const store = newStore();
    const session = store.createSession({ title: "Ticked" });
    setChecklistItem(store, session.id, "prep.goal", true);
    setChecklistItem(store, session.id, "play.recap", false);
    store.updateMeta({ settings: withChecklistSettings(store.meta(), { hidden: ["prep.logistics"], custom: [{ id: "custom.a", phase: "wrap", text: "Tidy up" }] }) });
    const bytes = await exportBundle(store, new RichTextRegistry(), undefined, { id: "example", version: "0.1.0" });
    const imported = await importBundle(bytes);
    const back = imported.store.get("sessions", session.id)!;
    expect(back.checklist).toEqual({ "prep.goal": true, "play.recap": false });
    expect(checklistSettings(imported.store.meta())).toEqual({ hidden: ["prep.logistics"], custom: [{ id: "custom.a", phase: "wrap", text: "Tidy up" }] });
    const list = sessionChecklist(imported.store.meta());
    expect(list.some((i) => i.id === "prep.logistics")).toBe(false);
    expect(list.at(-1)).toMatchObject({ id: "custom.a", source: "campaign" });
    expect(checklistProgress(list, back).prep).toEqual({ done: 1, total: 9 });

    // a copy with new ids keeps the ticks too (keys are item ids, not record ids)
    const copy = await importBundle(bytes, { onConflict: "new-id" });
    const copied = copy.store.list("sessions")[0]!;
    expect(copied.id).not.toBe(session.id);
    expect(copied.checklist).toEqual({ "prep.goal": true, "play.recap": false });
  });
});
