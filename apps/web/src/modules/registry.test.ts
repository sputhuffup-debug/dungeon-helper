import { describe, expect, it } from "vitest";
import { clearModuleCache, listModules, loadModuleById, moduleEntry } from "./registry";

describe("module registry", () => {
  it("hides dev-only modules unless the dev flag is on", () => {
    expect(listModules({ dev: false }).map((m) => m.id)).toEqual(["alien", "dnd5e-srd", "pf2e-orc"]);
    expect(listModules({ dev: true }).map((m) => m.id)).toEqual(["alien", "example", "example-pack", "dnd5e-srd", "pf2e-orc"]);
    expect(moduleEntry("example-pack")).toMatchObject({ source: "builtin", format: "pack", dev: true });
    expect(moduleEntry("example")?.dev).toBe(true);
  });

  it("loads, checks and caches a module", async () => {
    clearModuleCache();
    const a = loadModuleById("example");
    const b = loadModuleById("example");
    expect(a).toBe(b);
    const loaded = await a;
    expect(loaded.manifest.id).toBe("example");
    expect(loaded.report.ok).toBe(true);
    expect(loaded.entityType("example.hero")?.kind).toBe("character");
  });

  it("keeps each static manifest in step with the module's own manifest", async () => {
    for (const entry of listModules({ dev: true })) {
      const { manifest } = await loadModuleById(entry.id);
      const { id, name, version, modes, defaultMode, dataStatus } = manifest;
      expect({ id: entry.id, name: entry.name, version: entry.version, modes: entry.modes, defaultMode: entry.defaultMode, dataStatus: entry.dataStatus }).toEqual({ id, name, version, modes, defaultMode, dataStatus });
      // The licence shown before a pack is downloaded must be the one it ships with.
      if (entry.license) expect(entry.license).toEqual(manifest.license);
      if (entry.ruleset) expect(entry.ruleset).toBe(manifest.ruleset);
      if (entry.publisher) expect(entry.publisher).toBe(manifest.publisher);
    }
  }, 30_000);

  it("rejects an unknown module id", async () => {
    await expect(loadModuleById("nope")).rejects.toThrow(/Unknown module/);
  });

  it("loads the SRD 5.1 & 5.2 pack with both attributions", async () => {
    const srd = await loadModuleById("dnd5e-srd");
    expect(srd.report.ok).toBe(true);
    expect(srd.manifest.license?.spdx).toBe("CC-BY-4.0");
    expect(srd.manifest.license?.attribution).toContain('This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC');
    expect(srd.manifest.license?.attribution).toContain(
      "This work includes material from the System Reference Document 5.2 (“SRD 5.2”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.",
    );
    expect(moduleEntry("dnd5e-srd")).toMatchObject({ name: "5th Edition SRD 5.1 & 5.2 (fantasy d20)", ruleset: "SRD 5.1 / 5.2" });
    expect(srd.module.presets.length).toBe(334);
  }, 60_000);

  it("loads the ORC core rules pack with its ORC notice and attribution", async () => {
    const orc = await loadModuleById("pf2e-orc");
    expect(orc.report.ok).toBe(true);
    expect(orc.manifest.license).toMatchObject({ spdx: "LicenseRef-ORC", name: "ORC License" });
    expect(orc.manifest.license?.attribution).toContain("This product is licensed under the ORC License located at the Library of Congress at TX 9-307-067");
    expect(orc.manifest.license?.attribution).toContain("Not affiliated with or endorsed by Paizo Inc.");
    expect(orc.module.presets.filter((p) => p.entityType === "pf2e-orc.creature").length).toBe(490);
    expect(moduleEntry("pf2e-orc")).toMatchObject({ source: "builtin", format: "pack", name: "Fantasy d20 Remaster (ORC)" });
  }, 60_000);

  it("loads the Alien module through the conformance check", async () => {
    const alien = await loadModuleById("alien");
    expect(alien.manifest.id).toBe("alien");
    expect(alien.report.ok).toBe(true);
    expect(alien.module.entityTypes.some((t) => t.kind === "character")).toBe(true);
  }, 30_000);
});
