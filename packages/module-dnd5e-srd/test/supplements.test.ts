/**
 * Supplements for the SRD 5.1 module: the fixture "Thornwick Homebrew" fits,
 * every character-option list a supplement may add to exists, and the PC
 * sheet suggests list items (supplement items included) for race, subrace,
 * background, class and subclass.
 */
import { checkSupplement, computeFields, formatPackIssue, loadModule, moduleFromPackSource, validateEntityFields, type GameModule } from "@campaign-forge/module-sdk";
import { beforeAll, describe, expect, it } from "vitest";
import { dnd5eSrdSource, THORNWICK_SUPPLEMENT_ID, thornwickHomebrewSupplement } from "../src";

let base: GameModule;
beforeAll(async () => {
  base = await moduleFromPackSource(dnd5eSrdSource);
}, 60_000);

/** The lists a character-options supplement adds to. */
const OPTION_LISTS = ["races", "subraces", "racial-traits", "backgrounds", "classes", "subclasses", "class-features", "feats", "spells"].map((l) => `dnd5e-srd.${l}`);

describe("supplements for dnd5e-srd", () => {
  it("has the fixture supplement fit with no issues, its items marked with their source", async () => {
    const res = checkSupplement(await thornwickHomebrewSupplement(), base, { seeds: 20 });
    expect(res.issues.map(formatPackIssue)).toEqual([]);
    const mod = loadModule(res.module!, { skipProcedureRuns: true });
    expect(mod.manifest.supplements?.map((s) => s.id)).toEqual([THORNWICK_SUPPLEMENT_ID]);
    expect(mod.referenceItem("dnd5e-srd.backgrounds", "thornwick-homebrew.ferrywright")).toMatchObject({ name: "Ferrywright", source: "Thornwick Homebrew" });
    expect(mod.referenceItem("dnd5e-srd.subclasses", "thornwick-homebrew.lantern-thief")).toMatchObject({ class: "Rogue", source: "Thornwick Homebrew" });
    expect(mod.referenceItem("dnd5e-srd.races", "thornwick-homebrew.mossborn")?.source).toBe("Thornwick Homebrew");
    expect(mod.preset("thornwick-homebrew.ferry-warden")?.entityType).toBe("dnd5e-srd.npc");
  });

  it("lets a supplement add to every character-option list, edition-tagged, with a class of its own", () => {
    const item = (list: string, n: number) => {
      const id = `house-rules.${list.split(".")[1]}-${n}`;
      const extra: Record<string, unknown> =
        list === "dnd5e-srd.spells"
          ? { level: 1, school: "Evocation", castingTime: "1 action", range: "60 feet", components: "V, S", duration: "Instantaneous", description: "A house spell.", classes: ["Tinker"] }
          : list === "dnd5e-srd.subclasses"
            ? { class: "Tinker", description: "A house subclass." }
            : { description: "A house option." };
      return { id, name: `House ${list.split(".")[1]} ${n}`, edition: "2024", ...extra };
    };
    const supplement = {
      format: "campaign-forge-supplement",
      formatVersion: 1,
      manifest: { id: "house-rules", name: "House rules", version: "0.1.0", extends: { module: "dnd5e-srd", version: "^0.1.0" }, licenseNotice: "Private: personal use only." },
      referenceItems: Object.fromEntries(OPTION_LISTS.map((l) => [l, [item(l, 1)]])),
    };
    supplement.referenceItems["dnd5e-srd.classes"] = [{ id: "house-rules.tinker", name: "Tinker", hitDie: "d8", edition: "2024", description: "A house class." }] as never;
    const res = checkSupplement(supplement, base, { seeds: 5 });
    expect(res.issues.map(formatPackIssue)).toEqual([]);
    const mod = loadModule(res.module!, { skipProcedureRuns: true });
    for (const l of OPTION_LISTS) expect(mod.referenceList(l)!.items.at(-1)?.edition, l).toBe("2024");
    // a PC can take the supplement's class (its id); numbers the SRD classes drive are left to the GM
    const pc = mod.entityType("dnd5e-srd.character")!;
    const fields = { level: 3, class: "house-rules.tinker", subclass: "House subclasses 1", background: "House backgrounds 1", abilities: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 }, hp: { max: 20, current: 20, temp: 0 } };
    expect(validateEntityFields(pc, fields).errors).toEqual([]);
    expect(computeFields(pc, fields)["hitDie"]).toBe("—");
  });

  it("suggests list items on the PC sheet: race, subrace, background, class and subclass", () => {
    const pc = base.entityTypes.find((t) => t.id === "dnd5e-srd.character")!;
    const field = (path: string) => pc.sheet.sections.flatMap((s) => s.fields).find((f) => f.path === path)!;
    expect(field("race")).toMatchObject({ widget: "text", options: { ref: "dnd5e-srd.races" } });
    expect(field("subrace")).toMatchObject({ widget: "text", options: { ref: "dnd5e-srd.subraces" }, config: { optionsFilter: { field: "race", key: "race" } } });
    expect(field("background")).toMatchObject({ widget: "text", options: { ref: "dnd5e-srd.backgrounds" } });
    expect(field("class")).toMatchObject({ widget: "select", options: { ref: "dnd5e-srd.classes" } });
    expect(field("subclass")).toMatchObject({ widget: "text", options: { ref: "dnd5e-srd.subclasses" }, config: { optionsFilter: { field: "class", key: "class" } } });
    const npc = base.entityTypes.find((t) => t.id === "dnd5e-srd.npc")!;
    expect(npc.sheet.sections.flatMap((s) => s.fields).find((f) => f.path === "race")).toMatchObject({ options: { ref: "dnd5e-srd.races" } });
  });
});
