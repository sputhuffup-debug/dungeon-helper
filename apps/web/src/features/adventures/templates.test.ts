import "fake-indexeddb/auto";
import { plainText } from "@campaign-forge/core";
import type { TemplateAdventure } from "@campaign-forge/module-sdk";
import { afterEach, describe, expect, it } from "vitest";
import { createCampaign } from "../../state/actions";
import { openCampaign, type CampaignContextValue } from "../../state/CampaignProvider";
import {
  actHandouts,
  addAct,
  addHandout,
  addScene,
  createMapForScene,
  deleteAct,
  deleteAdventure,
  instantiateAdventureTemplate,
  moveAct,
  moveScene,
  normalizeEmphasis,
  plainTemplateText,
  sceneTitleFromPurpose,
} from "../../state/prepActions";
import { adventureDocIds, agendaCards, bookletMarkdown } from "./booklet";

const opened: Array<() => void> = [];
afterEach(() => {
  while (opened.length) opened.pop()?.();
});

async function open(moduleId: string, mode?: string): Promise<CampaignContextValue> {
  const id = await createCampaign({ name: "Prep", moduleId, ...(mode ? { mode } : {}) });
  const ctx = await openCampaign(id);
  opened.push(ctx.close);
  return ctx;
}

const text = (ctx: CampaignContextValue, docId: string | undefined) => (docId ? plainText(ctx.registry.open(docId)) : "");

describe("adventure templates", () => {
  it("derives scene titles from template purposes", () => {
    expect(sceneTitleFromPurpose("Arrival: the crew reaches the location.")).toBe("Arrival");
    expect(sceneTitleFromPurpose("The last stand or the escape.")).toBe("The last stand or the escape");
    expect(sceneTitleFromPurpose("A side errand that reveals an NPC's secret to everyone at the table.")).toBe("A side errand that reveals…");
    expect(sceneTitleFromPurpose("")).toBe("Scene");
    expect(normalizeEmphasis("_Write the goal._ Keep snake_case and \\_x_ as is")).toBe("*Write the goal.* Keep snake_case and \\_x_ as is");
    expect(plainTemplateText("_One paragraph: who the crew are._")).toBe("One paragraph: who the crew are.");
  });

  it("instantiates the Alien cinematic template: acts, scenes, agenda handouts and filled bodies", async () => {
    const ctx = await open("alien", "cinematic");
    const templates = ctx.module.templatesFor("adventure", "cinematic");
    const template = templates.find((t) => t.id === "alien.template.cinematic-adventure");
    expect(template).toBeDefined();

    const adventure = await instantiateAdventureTemplate(ctx, template, { title: "Hope's Last Day" });
    expect(adventure.title).toBe("Hope's Last Day");
    expect(adventure.templateId).toBe("alien.template.cinematic-adventure");
    expect(adventure.acts).toHaveLength(3);
    expect(text(ctx, adventure.playerIntroDoc)).toContain("What's the story, Mother?");
    expect(text(ctx, adventure.gmSituationDoc)).toContain("GM-only");
    expect(text(ctx, adventure.epilogueDoc)).toContain("sign-off message");

    const acts = adventure.acts.map((id) => ctx.store.get("acts", id)!);
    expect(acts.map((a) => [a.number, a.title])).toEqual([
      [1, "Setup"],
      [2, "Tilt"],
      [3, "Showdown"],
    ]);
    // Expectations come from the module's scaffold, so template wording can change freely.
    const scaffold = template!.scaffold as TemplateAdventure;
    const firstAct = scaffold.acts[0]!;
    const firstScene = firstAct.scenes![0]!;
    expect(acts[0]?.goal).toBe(firstAct.goal);
    expect(text(ctx, acts[0]?.pacingDoc)).toContain(plainTemplateText(firstAct.pacing!).slice(0, 30));

    const scenes = acts.flatMap((a) => a.scenes.map((id) => ctx.store.get("scenes", id)!));
    expect(scenes).toHaveLength(scaffold.acts.reduce((n, a) => n + (a.scenes?.length ?? 0), 0));
    expect(scenes[0]?.title).toBe(sceneTitleFromPurpose(firstScene.purpose));
    expect(scenes[0]?.purpose).toBe(firstScene.purpose);
    expect(scenes[0]?.events).toEqual([expect.objectContaining({ mandatory: true, text: scenes[0]?.purpose })]);
    expect(scenes[0]?.tags).toContain("mandatory");
    const optionalIndex = scaffold.acts.flatMap((a) => a.scenes ?? []).findIndex((sc) => !sc.mandatory);
    expect(scenes[optionalIndex]?.events[0]?.mandatory).toBe(false);
    expect(scenes[optionalIndex]?.tags).toContain("optional");
    expect(text(ctx, scenes[0]?.bodyDoc)).toContain(plainTemplateText(firstScene.body!));

    for (const [i, act] of acts.entries()) {
      const handouts = actHandouts(ctx.store, act);
      const planned = scaffold.acts[i]!.handouts ?? [];
      expect(handouts).toHaveLength(planned.length);
      for (const h of handouts) {
        expect(h.kind).toBe("agenda");
        expect(h.visibility.level).toBe("some_players");
        expect(h.attachedTo).toEqual({ kind: "act", id: act.id });
        expect(text(ctx, h.bodyDoc)).toContain(plainTemplateText(planned[0]!.body!));
      }
    }
    expect(ctx.store.count("handouts")).toBe(scaffold.acts.reduce((n, a) => n + (a.handouts?.length ?? 0), 0));
  });

  it("instantiates a blank adventure and a fixture-module template the same way", async () => {
    const ctx = await open("example");
    const blank = await instantiateAdventureTemplate(ctx, undefined, { title: "" });
    expect(blank.title).toBe("New adventure");
    expect(blank.acts).toEqual([]);
    expect(blank.playerIntroDoc && blank.gmSituationDoc && blank.epilogueDoc).toBeTruthy();

    const quest = await instantiateAdventureTemplate(ctx, ctx.module.template("example.template.quest"));
    expect(quest.title).toBe("A Simple Quest");
    expect(quest.premise).toMatch(/fetched/);
    expect(quest.acts).toHaveLength(2);
    const act2 = ctx.store.get("acts", quest.acts[1]!)!;
    expect(act2.scenes.map((id) => ctx.store.get("scenes", id)?.title)).toEqual(["The climax", "The reward"]);
  });

  it("adds, reorders and deletes acts and scenes; exports a booklet and agenda cards", async () => {
    const ctx = await open("alien", "cinematic");
    const adventure = await instantiateAdventureTemplate(ctx, ctx.module.template("alien.template.cinematic-adventure"));
    const [a1, a2, a3] = adventure.acts;
    moveAct(ctx, a3!, -2);
    expect(ctx.store.get("adventures", adventure.id)?.acts).toEqual([a3, a1, a2]);
    expect(ctx.store.get("acts", a3!)?.number).toBe(1);
    expect(ctx.store.get("acts", a1!)?.number).toBe(2);

    const act = ctx.store.get("acts", a1!)!;
    const [s1, s2] = act.scenes;
    moveScene(ctx, s2!, -1);
    expect(ctx.store.get("acts", a1!)?.scenes.slice(0, 2)).toEqual([s2, s1]);

    const extra = addScene(ctx, a1!, { title: "Vent crawl" });
    expect(ctx.store.get("acts", a1!)?.scenes.at(-1)).toBe(extra.id);
    const map = createMapForScene(ctx, extra.id);
    expect(ctx.store.get("scenes", extra.id)?.map).toBe(map.id);
    expect(map.name).toBe("Vent crawl map");

    const act4 = addAct(ctx, adventure.id);
    expect(act4.number).toBe(4);
    const pc = ctx.store.createEntity({ type: "alien.character", name: "Ripley", fields: { isPC: true } });
    const agenda = addHandout(ctx, act4.id, { kind: "agenda", character: pc.id });
    expect(agenda.visibility.level).toBe("some_players");
    expect(ctx.store.get("acts", act4.id)?.handouts).toEqual([agenda.id]);

    const md = await bookletMarkdown(ctx, adventure.id);
    expect(md).toMatch(/^# <Scenario title>/);
    expect(md).toContain("## Player introduction");
    expect(md).toContain("What's the story, Mother?");
    expect(md).toContain("(mandatory)");
    expect(md).not.toMatch(/\[\[/);
    expect(md).not.toContain("\\_");
    expect(md).toContain("*Who is present, what the crew is here to do.*"); // first scene body of the Alien cinematic scaffold
    expect(adventureDocIds(ctx.store, adventure.id).length).toBeGreaterThan(30);

    const cards = await agendaCards(ctx, adventure.id);
    expect(cards).toHaveLength(19);
    expect(cards.at(-1)?.character).toBe("Ripley");
    expect(cards[0]?.body).toMatch(/secret agenda/);

    deleteAct(ctx, a2!);
    expect(ctx.store.get("adventures", adventure.id)?.acts).not.toContain(a2);
    expect(ctx.store.list("handouts").some((h) => h.attachedTo?.id === a2)).toBe(false);
    deleteAdventure(ctx, adventure.id);
    expect(ctx.store.count("acts")).toBe(0);
    expect(ctx.store.count("scenes")).toBe(0);
    expect(ctx.store.count("handouts")).toBe(0);
  });
});
