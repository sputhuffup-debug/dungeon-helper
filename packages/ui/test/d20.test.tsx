/** Generic UI pieces a d20 system exposed: counters, rolled initiative, named skill levels, entries, Markdown tables. */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { createDiceEngine, createRng, type EntityTypeDef, type ReferenceList, type TrackerDef } from "@campaign-forge/module-sdk";
import { Markdown, SheetRenderer, TrackerHost, countersFor, initiativeState, rulePreview, type TrackerProps } from "../src/index";

function Stateful(props: Omit<TrackerProps, "state" | "onChange"> & { initial?: unknown; spy?: (s: unknown) => void }) {
  const { initial, spy, ...rest } = props;
  const [state, setState] = useState<unknown>(initial);
  return (
    <TrackerHost
      {...rest}
      state={state}
      onChange={(s) => {
        setState(s);
        spy?.(s);
      }}
    />
  );
}

const pc = { id: "e1", name: "Tamsin", type: "g.pc", fields: { hp: { current: 6, max: 9 }, slots: { l1: 1, l2: 0 }, inspired: false }, computed: { slotMax1: 4, slotMax2: 0, initiative: 3 } };
const goblin = { id: "e2", name: "Goblin", type: "g.monster", fields: { hp: { current: 7, max: 7 } }, computed: { initiative: 2 } };

describe("counter tracker", () => {
  it("binds fields per type or by path, takes JSONLogic maxes and hides counters without a max", () => {
    const def: TrackerDef = { id: "t.slots", name: "Slots", kind: "counter", scope: "character", binds: ["g.pc.slots.l1", "g.pc.slots.l2"], config: { maxes: { "g.pc.slots.l1": { var: "computed.slotMax1" }, "g.pc.slots.l2": { var: "computed.slotMax2" } }, hideWhenNoMax: true, labels: { "g.pc.slots.l1": "1st" } } };
    expect(countersFor(def, pc).map((c) => [c.label, c.value, c.max, c.style])).toEqual([["1st", 1, 4, "pips"]]);
    expect(countersFor(def, goblin)).toEqual([]);
    const hp: TrackerDef = { id: "t.hp", name: "HP", kind: "counter", scope: "encounter", binds: ["hp.current"], config: { label: "HP", max: { var: "fields.hp.max" }, style: "stepper" } };
    expect(countersFor(hp, goblin)).toMatchObject([{ path: "hp.current", value: 7, max: 7, style: "stepper" }]);
  });

  it("writes through effects, clamped to min and max, and logs", () => {
    const def: TrackerDef = { id: "t.hp", name: "Hit points", kind: "counter", scope: "encounter", binds: ["hp.current"], config: { label: "HP", min: 0, max: { var: "fields.hp.max" }, style: "stepper" } };
    const onEffects = vi.fn();
    const onLog = vi.fn();
    render(<TrackerHost def={def} state={undefined} onChange={() => {}} entities={[pc, goblin]} onEffects={onEffects} onLog={onLog} />);
    fireEvent.click(screen.getByRole("button", { name: "Decrease Goblin HP" }));
    expect(onEffects).toHaveBeenLastCalledWith([{ kind: "setField", entity: "e2", path: "hp.current", value: 6 }]);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Tamsin HP" }), { target: { value: "50" } });
    expect(onEffects).toHaveBeenLastCalledWith([{ kind: "setField", entity: "e1", path: "hp.current", value: 9 }]);
    expect(onLog).toHaveBeenLastCalledWith("Tamsin: Hit points (HP) 9/9");
  });

  it("shows a checkbox for a boolean field", () => {
    const def: TrackerDef = { id: "t.insp", name: "Inspiration", kind: "counter", scope: "character", binds: ["g.pc.inspired"] };
    const onEffects = vi.fn();
    render(<TrackerHost def={def} state={undefined} onChange={() => {}} entities={[pc]} onEffects={onEffects} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Tamsin Inspired" }));
    expect(onEffects).toHaveBeenCalledWith([{ kind: "setField", entity: "e1", path: "inspired", value: true }]);
  });
});

describe("rolled initiative", () => {
  const def: TrackerDef = { id: "t.init", name: "Initiative", kind: "initiative", scope: "encounter", config: { method: "roll", dice: "1d20", modifier: { var: "computed.initiative" } } };

  it("rolls d20 + modifier per participant, highest first, deterministically, and takes typed totals", () => {
    const run = () => {
      const spy = vi.fn();
      const view = render(<Stateful def={def} spy={spy} entities={[pc, goblin]} rng={createRng("init")} initial={{ round: 1, participants: [{ id: "a", name: "Tamsin", entityId: "e1", card: null, extraDraws: 0, acted: false }, { id: "b", name: "Goblin", entityId: "e2", card: null, extraDraws: 0, acted: false }] }} />);
      fireEvent.click(screen.getByRole("button", { name: "Roll initiative" }));
      const st = initiativeState(spy.mock.lastCall![0]);
      const shown = [...document.querySelectorAll<HTMLInputElement>("[data-testid^=card-]")].map((e) => Number(e.value));
      view.unmount();
      return { st, shown };
    };
    const { st, shown } = run();
    expect(run().st).toEqual(st);
    for (const p of st.participants) {
      const mod = p.entityId === "e1" ? 3 : 2;
      expect(p.mod).toBe(mod);
      expect(p.card! - mod).toBeGreaterThanOrEqual(1);
      expect(p.card! - mod).toBeLessThanOrEqual(20);
    }
    expect(shown).toEqual([...shown].sort((a, b) => b - a));
  });

  it("lets the GM type a total a player rolled", () => {
    const spy = vi.fn();
    render(<Stateful def={def} spy={spy} initial={{ round: 1, participants: [{ id: "a", name: "Tamsin", card: null, extraDraws: 0, acted: false }] }} />);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Tamsin initiative" }), { target: { value: "17" } });
    expect(initiativeState(spy.mock.lastCall![0]).participants[0]!.card).toBe(17);
  });
});

describe("skills widget for a d20 sheet", () => {
  const skills: ReferenceList = { id: "g.skills", name: "Skills", items: [{ id: "stealth", name: "Stealth", attribute: "dexterity" }, { id: "arcana", name: "Arcana", attribute: "intelligence" }] };
  const def: EntityTypeDef = {
    id: "g.pc",
    kind: "character",
    name: "PC",
    plural: "PCs",
    schema: { type: "object", properties: { abilities: { type: "object", properties: { dexterity: { type: "integer" }, intelligence: { type: "integer" } } }, skills: { type: "object", properties: { stealth: { type: "integer" }, arcana: { type: "integer" } } } } },
    computed: { proficiencyBonus: 2 },
    sheet: {
      sections: [
        {
          id: "s",
          title: "Skills",
          fields: [{ path: "skills.*", widget: "skills", config: { ref: "g.skills", attributesPath: "abilities", hideZero: true, levels: [{ value: 0, label: "—" }, { value: 1, label: "Proficient" }, { value: 2, label: "Expertise" }], labels: { attributeValue: "Score", value: "Proficiency" } } }],
        },
      ],
    },
  };
  const dice = createDiceEngine({ engine: "d20", proficiency: { var: "computed.proficiencyBonus" } });

  it("offers named levels, totals as rolls, and lists only rated skills until asked", () => {
    const onChange = vi.fn();
    render(<SheetRenderer def={def} mode="m" fields={{ abilities: { dexterity: 14, intelligence: 10 }, skills: { stealth: 2 } }} onChange={onChange} referenceLists={{ "g.skills": skills }} dice={dice} />);
    expect(screen.getByRole("columnheader", { name: "Score" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Roll" })).toBeInTheDocument();
    expect(screen.getByTestId("pool-stealth")).toHaveTextContent("1d20 + 6");
    expect(screen.queryByTestId("pool-arcana")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show all 2" }));
    const arcana = within(screen.getByText("Arcana").closest("tr")!).getByRole("combobox", { name: "Arcana" });
    fireEvent.change(arcana, { target: { value: "1" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ skills: { stealth: 2, arcana: 1 } }));
  });
});

describe("entries widget and Markdown", () => {
  it("reads like a stat block and edits as a list", () => {
    const def: EntityTypeDef = {
      id: "g.m",
      kind: "creature",
      name: "M",
      plural: "Ms",
      schema: { type: "object", properties: { actions: { type: "array", items: { type: "object", properties: { name: { type: "string" }, desc: { type: "string", maxLength: 2000 } } } } } },
      sheet: { sections: [{ id: "a", title: "Actions", fields: [{ path: "actions", widget: "entries" }] }] },
    };
    render(<SheetRenderer def={def} mode="m" fields={{ actions: [{ name: "Bite", desc: "Melee Weapon Attack: +4 to hit." }] }} onChange={() => {}} />);
    const entry = document.querySelector('[data-entry="Bite"]')!;
    expect(entry.querySelector("strong em")?.textContent).toBe("Bite.");
    expect(entry.textContent).toContain("Melee Weapon Attack: +4 to hit.");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("textbox", { name: "Desc 1" }).tagName).toBe("TEXTAREA");
  });

  it("renders pipe tables and bold italics", () => {
    const { container } = render(<Markdown text={"***Poison.*** Venom.\n\n| d4 | Result |\n|---|---|\n| 1 | Fog |\n| 2-4 | Rain |"} />);
    expect(container.querySelector("strong em")?.textContent).toBe("Poison.");
    const rows = [...container.querySelectorAll("table tr")].map((r) => [...r.children].map((c) => c.textContent));
    expect(rows).toEqual([["d4", "Result"], ["1", "Fog"], ["2-4", "Rain"]]);
  });

  it("previews long rule text in one short line", () => {
    const preview = rulePreview(`## Cover\n\n${"Walls and trees give cover. ".repeat(20)}\n\n| A | B |\n|---|---|\n| 1 | 2 |`);
    expect(preview.length).toBeLessThanOrEqual(221);
    expect(preview.endsWith("…")).toBe(true);
    expect(preview).not.toMatch(/[#|]/);
  });
});
