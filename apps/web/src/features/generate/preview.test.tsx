/**
 * The generated-entity preview reads like the sheet: a Life Path's career
 * and talents by name (from the module's reference lists), its gear with
 * quantities and its weapons, never the raw ids.
 */
import "fake-indexeddb/auto";
import { runProcedure } from "@campaign-forge/module-sdk";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createCampaign } from "../../state/actions";
import { CampaignContext, openCampaign } from "../../state/CampaignProvider";
import { PreviewPanel } from "./PreviewPanel";

const opened: Array<() => void> = [];
afterEach(() => {
  cleanup();
  while (opened.length) opened.pop()?.();
});

let campaignId: string;
beforeAll(async () => {
  campaignId = await createCampaign({ name: "Preview (Alien)", moduleId: "alien", mode: "campaign" });
}, 30_000);

describe("preview of a generated character", () => {
  it("names the career, talents, gear and weapons from the module's data", async () => {
    const ctx = await openCampaign(campaignId);
    opened.push(ctx.close);
    const graph = runProcedure(ctx.module.procedure("alien.lifepath")!, ctx.module.module, { seed: "crew-2", inputs: { terms: 1 } });
    const fields = graph.produced.entities[0]!.fields as { career: string; talents: Array<{ id: string }> };
    const career = ctx.module.referenceItem("alien.careers", fields.career)!.name;
    const talent = ctx.module.referenceItem("alien.talents", fields.talents[0]!.id)!.name;
    render(
      <CampaignContext.Provider value={ctx}>
        <PreviewPanel graph={graph} names={{}} onRename={() => undefined} />
      </CampaignContext.Provider>,
    );
    const preview = screen.getByTestId("preview");
    const row = (path: string) => preview.querySelector(`[data-field="${path}"]`)!.textContent;
    expect(row("career")).toBe(`Career${career}`);
    expect(row("talents")).toBe(`Talents${talent}`);
    expect(row("weapons")).toBe("WeaponsM4A3 Service Pistol");
    expect(row("gear")).toBe("GearIRC MK.50 Compression Suit");
    const text = preview.textContent ?? "";
    expect(row("career")).not.toContain(fields.career);
    expect(text).not.toContain("{id:");
    // the summary line under the name reads the career by name too
    expect(text).toContain(`Career ${career} · Stress 0`);
  });
});
