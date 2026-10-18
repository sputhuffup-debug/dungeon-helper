import { describe, expect, it } from "vitest";
import { clearModuleCache, listModules, loadModuleById, moduleEntry } from "./registry";

describe("module registry", () => {
  it("hides dev-only modules unless the dev flag is on", () => {
    expect(listModules({ dev: false }).map((m) => m.id)).toEqual(["alien"]);
    expect(listModules({ dev: true }).map((m) => m.id)).toEqual(["alien", "example"]);
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

  it("rejects an unknown module id", async () => {
    await expect(loadModuleById("nope")).rejects.toThrow(/Unknown module/);
  });

  it("loads the Alien module through the conformance check", async () => {
    const alien = await loadModuleById("alien");
    expect(alien.manifest.id).toBe("alien");
    expect(alien.report.ok).toBe(true);
    expect(alien.module.entityTypes.some((t) => t.kind === "character")).toBe(true);
  }, 30_000);
});
