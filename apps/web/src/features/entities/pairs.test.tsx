/**
 * Paired sheet fields in the app (`SheetField.reciprocal`), on the example
 * module's heroes and their Companion: a save sets or clears the other end,
 * tells the GM, and offers to repoint a partner who names someone else.
 */
import "fake-indexeddb/auto";
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { clearToasts, useToasts } from "../../components/ui";
import { createCampaign, createEntity, saveEntityFields } from "../../state/actions";
import { openCampaign, type CampaignContextValue } from "../../state/CampaignProvider";
import { awardContextFor } from "../../state/progressionActions";
import { saveSheet } from "./pairs";

const opened: Array<() => void> = [];
afterEach(() => {
  while (opened.length) opened.pop()?.();
  clearToasts();
});

async function heroes(): Promise<{ ctx: CampaignContextValue; a: string; b: string; c: string }> {
  const ctx = await openCampaign(await createCampaign({ name: "Pairs", moduleId: "example" }));
  opened.push(ctx.close);
  const hero = (name: string) => createEntity(ctx, { type: "example.hero", name, fields: { attributes: { might: 2, wits: 2 } } }).id;
  return { ctx, a: hero("Ada"), b: hero("Bo"), c: hero("Cyd") };
}

const fieldsOf = (ctx: CampaignContextValue, id: string) => ctx.store.get("entities", id)!.fields;

/** The toasts on screen, read the way the Toaster reads them. */
function toastTexts(): Array<{ text: string; action?: string; run?: () => void }> {
  let out: Array<{ text: string; action?: string; run?: () => void }> = [];
  function Probe() {
    out = useToasts().toasts.map((t) => ({ text: t.text, ...(t.action ? { action: t.action.label, run: t.action.onClick } : {}) }));
    return null;
  }
  const view = render(<Probe />);
  view.unmount();
  return out;
}

describe("paired fields", () => {
  it("setting one end sets the other, and clearing clears both", async () => {
    const { ctx, a, b } = await heroes();
    saveSheet(ctx, a, { ...fieldsOf(ctx, a), companion: b }, ["companion"]);
    expect(fieldsOf(ctx, b).companion).toBe(a);
    expect(toastTexts().map((t) => t.text)).toEqual(["Bo's companion is now Ada too."]);
    const cleared = { ...fieldsOf(ctx, a) };
    delete cleared.companion;
    saveEntityFields(ctx, a, cleared, ["companion"]);
    expect(fieldsOf(ctx, b).companion).toBeUndefined();
  });

  it("leaves a partner who names someone else, and repoints it on request", async () => {
    const { ctx, a, b, c } = await heroes();
    saveEntityFields(ctx, b, { ...fieldsOf(ctx, b), companion: c }, ["companion"]);
    expect(fieldsOf(ctx, c).companion).toBe(b);
    clearToasts();
    const saved = saveSheet(ctx, a, { ...fieldsOf(ctx, a), companion: b }, ["companion"]);
    expect(saved.conflicts).toEqual([{ entityId: b, path: "companion", current: c, wanted: a }]);
    expect(fieldsOf(ctx, b).companion).toBe(c);
    const offer = toastTexts().find((t) => t.action);
    expect(offer).toMatchObject({ text: "Bo's companion is still Cyd.", action: "Make it Ada" });
    act(() => offer!.run!());
    // Bo now pairs with Ada; Cyd, whom Bo let go, has no companion
    expect(fieldsOf(ctx, b).companion).toBe(a);
    expect(fieldsOf(ctx, c).companion).toBeUndefined();
  });

  it("counts a link set one way for the other end (award questions read it)", async () => {
    const { ctx, a, b } = await heroes();
    // as an older campaign has it: only Ada names Bo
    ctx.store.update("entities", a, { fields: { ...fieldsOf(ctx, a), companion: b } });
    expect(awardContextFor(ctx, ctx.store.get("entities", b)!).referencedBy).toEqual({ companion: 1 });
    expect(awardContextFor(ctx, ctx.store.get("entities", a)!).referencedBy).toEqual({});
  });
});
