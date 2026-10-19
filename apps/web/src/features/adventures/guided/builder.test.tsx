import "fake-indexeddb/auto";
import { adventureReviewContext, agendaFor, fromMarkdown, setNarrativeField, type Adventure } from "@campaign-forge/core";
import { runAdventureReview, type AdventureBuilderDef, type ReviewResult } from "@campaign-forge/module-sdk";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCampaign } from "../../../state/actions";
import { addBuilderScene, ensureCastAgendas, instantiateBuilder, isMandatory, newCastMember, setSceneMandatory } from "../../../state/builderActions";
import { CampaignContext, openCampaign, type CampaignContextValue } from "../../../state/CampaignProvider";
import { ReviewPanel } from "./panels";
import { useAdventureReview } from "./useAdventureReview";

const opened: Array<() => void> = [];
afterEach(() => {
  while (opened.length) opened.pop()?.();
});

async function open(): Promise<CampaignContextValue> {
  const id = await createCampaign({ name: "Guided", moduleId: "example" });
  const ctx = await openCampaign(id);
  opened.push(ctx.close);
  return ctx;
}

async function review(ctx: CampaignContextValue, adventure: Adventure, builder: AdventureBuilderDef): Promise<ReviewResult> {
  const context = await adventureReviewContext(ctx.store, ctx.registry, ctx.module, adventure.id, { roles: builder.cast.map((r) => r.id), whenDocSynced: ctx.whenDocSynced });
  return runAdventureReview(builder, context);
}

describe("guided builder (example module)", () => {
  it("instantiates the builder, and the review follows the GM's edits", async () => {
    const ctx = await open();
    const builder = ctx.module.buildersFor("standard")[0]!;
    expect(builder.id).toBe("example.builder.quest");
    const adventure = await instantiateBuilder(ctx, builder, { title: "The Lost Bell" });
    expect(adventure).toMatchObject({ title: "The Lost Bell", builderId: builder.id, templateId: "example.template.quest", cast: { heroes: [], places: [] }, fields: { theme: "greed", hours: 3 } });
    const acts = adventure.acts.map((id) => ctx.store.get("acts", id)!);
    expect(acts.map((a) => [a.number, a.fields])).toEqual([
      [1, { mood: "calm" }],
      [2, { mood: "calm" }],
    ]);

    let result = await review(ctx, adventure, builder);
    expect(result.byStep).toEqual({ basics: "bad", cast: "bad", acts: "warn", review: "none" });
    expect(result.items.map((i) => [i.level, i.message])).toEqual([
      ["bad", "Write the hook"],
      ["bad", "Add at least one hero"],
      ["warn", "Act 1: add a twist"],
      ["warn", "Act 2: add a twist"],
    ]);

    // Fill the required field: the basics step turns green.
    setNarrativeField(ctx.store, "adventure", adventure.id, "hook", "The temple bell was stolen");
    result = await review(ctx, adventure, builder);
    expect(result.byStep.basics).toBe("ok");
    expect(result.items).toContainEqual(expect.objectContaining({ level: "ok", message: "Hook written" }));

    // A hero without an act 1 agenda: one warning naming the hero.
    const ada = newCastMember(ctx, adventure.id, builder.cast[0]!, "Ada");
    expect(ada.fields.origin).toBe("hill");
    result = await review(ctx, adventure, builder);
    expect(result.byStep.cast).toBe("warn");
    expect(result.items.map((i) => i.message)).toEqual(expect.arrayContaining(["Ada: give the act 1 agenda a concrete goal", "1 hero(es) in the cast"]));

    // Agendas: one per act, then the act 1 text clears the warning.
    ensureCastAgendas(ctx, adventure.id, [ada.id]);
    const act1 = ctx.store.get("acts", acts[0]!.id)!;
    const agenda = agendaFor(ctx.store, act1, ada.id)!;
    expect(agendaFor(ctx.store, ctx.store.get("acts", acts[1]!.id)!, ada.id)).toBeDefined();
    fromMarkdown(ctx.registry.open(agenda.bodyDoc!), "Ring the bell at the shrine before dawn");
    setNarrativeField(ctx.store, "act", acts[0]!.id, "twist", "The priest stole it");
    setNarrativeField(ctx.store, "act", acts[1]!.id, "twist", "The bell is cursed");
    result = await review(ctx, adventure, builder);
    expect(result.summary).toEqual({ bad: 0, warn: 0, ok: 3 });
    expect(result.byStep).toEqual({ basics: "ok", cast: "ok", acts: "ok", review: "none" });
  });

  it("adds scenes with defaults and toggles the mandatory flag", async () => {
    const ctx = await open();
    const builder = ctx.module.builder("example.builder.quest")!;
    const adventure = await instantiateBuilder(ctx, builder);
    const actId = adventure.acts[0]!;
    const scene = addBuilderScene(ctx, actId, { title: "Ambush" });
    expect(ctx.store.get("acts", actId)?.scenes).toContain(scene.id);
    expect(isMandatory(scene)).toBe(false);
    const on = setSceneMandatory(ctx, scene.id, true);
    expect(isMandatory(on)).toBe(true);
    expect(on.events).toEqual([expect.objectContaining({ mandatory: true, text: "Ambush" })]);
    const off = setSceneMandatory(ctx, scene.id, false);
    expect(isMandatory(off)).toBe(false);
    expect(off.tags).toEqual(["optional"]);
  });

  it("recomputes the review (debounced) as records change, and the checklist jumps to steps", async () => {
    const ctx = await open();
    const builder = ctx.module.builder("example.builder.quest")!;
    const adventure = await instantiateBuilder(ctx, builder, { title: "Hook test" });
    const seen: Array<ReviewResult | undefined> = [];
    const onJump = vi.fn();
    function Probe() {
      const result = useAdventureReview(adventure.id, builder);
      seen.push(result);
      return <ReviewPanel result={result} builder={builder} onJump={onJump} />;
    }
    render(
      <CampaignContext.Provider value={ctx}>
        <Probe />
      </CampaignContext.Provider>,
    );
    await waitFor(() => expect(screen.getByTestId("review-summary").textContent).toBe("2 items to fix · 2 warnings"));
    const items = screen.getAllByRole("listitem");
    expect(items.map((li) => li.getAttribute("data-level"))).toEqual(["bad", "bad", "warn", "warn"]);
    fireEvent.click(screen.getByRole("button", { name: /Write the hook/ }));
    expect(onJump).toHaveBeenCalledWith("basics");

    setNarrativeField(ctx.store, "adventure", adventure.id, "hook", "A dragon ate the mayor");
    await waitFor(() => expect(screen.getByTestId("review-summary").textContent).toBe("1 item to fix · 2 warnings"));
    expect(screen.getByText("Hook written")).toBeTruthy();
    expect(seen.at(-1)?.byStep.basics).toBe("ok");
  });
});
