/**
 * The builder's option details with SRD content: a level 3 Sorcerer (SRD 5.1)
 * gets the Draconic subclass as a sub-choice of the level step, and its
 * Details button opens the panel there (with its features by level), and
 * closes it again.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { builderChoices, emptyDraft, moduleFromPackSource, resolveCharacterBuilder, type ChoiceState, type GameModule } from "@campaign-forge/module-sdk";
import { dnd5eSrdSource } from "@campaign-forge/module-dnd5e-srd";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ChoiceView } from "./ChoiceView";
import type { StoredDraft } from "./drafts";

let module: GameModule;
beforeAll(async () => {
  module = await moduleFromPackSource(dnd5eSrdSource);
}, 60_000);
afterEach(cleanup);

function levelChoice(): { choice: ChoiceState; draft: StoredDraft } {
  const builder = module.characterBuilders![0]!;
  const draft: StoredDraft = {
    ...emptyDraft(builder),
    picks: { edition: ["2014"], class: ["sorcerer"], level: ["3"] },
    id: "d",
    created: "2026-10-29T00:00:00Z",
    updated: "2026-10-29T00:00:00Z",
    seed: "s",
  };
  const result = resolveCharacterBuilder(module, builder, draft);
  const choice = builderChoices(result).find((c) => c.path === "level")!;
  return { choice, draft };
}

describe("a pick that is no longer available", () => {
  it("can be unticked, and a new tick replaces it rather than a valid pick", () => {
    const builder = module.characterBuilders![0]!;
    // Insight picked for the class, then the Acolyte background (which gives Insight) chosen
    const draft: StoredDraft = { ...emptyDraft(builder), picks: { edition: ["2014"], class: ["paladin"], "class/skills": ["athletics", "insight"], background: ["acolyte"] }, id: "d", created: "2026-10-29T00:00:00Z", updated: "2026-10-29T00:00:00Z", seed: "s" };
    const result = resolveCharacterBuilder(module, builder, draft);
    const skills = builderChoices(result).find((c) => c.path === "class/skills")!;
    expect(skills.options.find((o) => o.id === "insight")!.available).toBe(false);
    expect(skills.issues.some((i) => i.level === "error" && /Insight cannot be picked/.test(i.message))).toBe(true);
    let next: StoredDraft | undefined;
    render(<ChoiceView choice={skills} draft={draft} onDraft={(d) => (next = d)} depth={1} />);
    const section = screen.getByTestId("choice:class/skills");
    fireEvent.click(within(section).getByRole("checkbox", { name: "Insight" }));
    expect(next?.picks["class/skills"]).toEqual(["athletics"]);
    // ticking another skill while full drops the unavailable pick, not Athletics
    fireEvent.click(within(section).getByRole("checkbox", { name: "Medicine" }));
    expect(next?.picks["class/skills"]).toEqual(["athletics", "medicine"]);
  });
});

describe("builder option details", () => {
  it("opens and closes a subclass's details from its Details button (a sub-choice)", () => {
    const { choice, draft } = levelChoice();
    const sub = choice.sub.find((s) => s.id === "subclass");
    expect(sub?.options.map((o) => o.name)).toContain("Draconic");
    render(<ChoiceView choice={choice} draft={draft} onDraft={() => {}} />);
    const section = screen.getByTestId("choice:level/subclass");
    // a sub-choice shows no panel until asked
    expect(within(section).queryByTestId("option-details")).toBeNull();
    const button = within(section).getByRole("button", { name: "Details: Draconic" });
    expect(button.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(button);
    const panel = within(section).getByTestId("option-details");
    expect(panel.getAttribute("aria-label")).toBe("About Draconic");
    expect(panel.textContent).toContain("Features");
    expect(panel.textContent).toContain("Dragon Ancestor");
    expect(panel.textContent).toContain("SRD 5.1");
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(button.textContent).toBe("Hide details");

    fireEvent.click(button);
    expect(within(section).queryByTestId("option-details")).toBeNull();
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("offers Details only on options that have more to show", () => {
    const { choice, draft } = levelChoice();
    const { container } = render(<ChoiceView choice={choice} draft={draft} onDraft={() => {}} />);
    // the level numbers are a range: no details buttons there
    expect(within(container.querySelector<HTMLElement>(".cb-range")!).queryAllByRole("button", { name: /^Details/ })).toHaveLength(0);
    // every Details button opens a panel
    for (const button of screen.getAllByRole("button", { name: /^Details: / })) {
      fireEvent.click(button);
      expect(button.getAttribute("aria-expanded")).toBe("true");
    }
  });
});
