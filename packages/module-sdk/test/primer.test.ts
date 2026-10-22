import { describe, expect, it } from "vitest";
import { checkModule } from "../src/module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { packToModule, validatePack } from "../src/pack";
import { CONTRACT_VERSION, PRIMER_SECTION_IDS, type GameModule, type PrimerDef } from "../src/types";

function moduleWith(primer: PrimerDef | undefined): GameModule {
  const m: GameModule = {
    manifest: { id: "pr", version: "1.0.0", name: "PR", ruleset: "PR", licenseNotice: "none", requiredCore: CONTRACT_VERSION, modes: [{ id: "a", name: "A" }], defaultMode: "a", dataStatus: "verified" },
    dice: { dice: [{ id: "d6", name: "d6", faces: 6 }], buildPool: () => ({ dice: { d6: 1 } }), roll: (pool) => ({ pool, dice: [], successes: 0, symbols: {}, pushes: 0, canPush: false }), describe: () => "" },
    entityTypes: [],
    relationshipTypes: [],
    referenceLists: [],
    presets: [],
    tables: [],
    procedures: [],
    templates: [],
    rules: [],
    trackers: [],
    calendar: { id: "pr.cal", name: "Cal", defaultYear: 1, months: [{ name: "M", days: 30 }] },
  };
  if (primer) m.primer = primer;
  return m;
}

const issues = (m: GameModule) => checkModule(m, { skipProcedureRuns: true }).issues.map((i) => `${i.severity} ${i.where}: ${i.message}`);

describe("checkModule: campaign primer", () => {
  it("accepts a valid primer and modules without one", () => {
    expect(PRIMER_SECTION_IDS).toContain("house-rules");
    expect(issues(moduleWith(undefined))).toEqual([]);
    expect(issues(moduleWith({ sections: [{ id: "setting", title: "The world", prompt: "Describe it.", starter: "A world.", original: true }, { id: "oaths", title: "Oaths", prompt: "What was sworn." }] }))).toEqual([]);
  });

  it("reports duplicate or malformed ids, missing titles and prompts, and uncited starter text", () => {
    const found = issues(
      moduleWith({
        sections: [
          { id: "setting", title: "", prompt: "x" },
          { id: "setting", title: "Again", prompt: "" },
          { id: "Bad Id", title: "B", prompt: "p", page: 0 },
          { id: "tone", title: "Tone", prompt: "p", starter: "Copied from somewhere." },
        ],
      }),
    );
    expect(found).toEqual(
      expect.arrayContaining([
        'error primer:setting: duplicate primer section id "setting"',
        "error primer:setting: section has no title",
        "error primer:setting: section has no prompt for the GM",
        "error primer:Bad Id: section id must be lower case letters, digits and hyphens",
        "error primer:Bad Id: invalid page reference",
        "warning primer:tone: starter text is neither marked original nor cited",
      ]),
    );
  });
});

describe("pack primer", () => {
  it("is validated by the pack schema and carried into the module", () => {
    // the example pack (Lanternlight) carries a primer
    const pack = JSON.parse(readFileSync(fileURLToPath(new URL("../../module-example/packs/example-pack/pack.json", import.meta.url)), "utf8")) as Record<string, unknown>;
    const ok = validatePack(pack);
    expect(ok.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(packToModule(ok.value!).primer?.sections.map((s) => s.title)).toEqual(["Lanternlight", "House rules"]);
    const bad = validatePack({ ...pack, primer: { sections: [{ id: "setting", title: "T" }] } });
    expect(bad.ok).toBe(false);
    expect(bad.issues.some((i) => i.severity === "error" && i.path.startsWith("$.primer"))).toBe(true);
  });
});
