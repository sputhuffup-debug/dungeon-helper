import { loadModule, moduleFromPackSource, packFromSource } from "@campaign-forge/module-sdk";
import { describe, expect, it } from "vitest";
import { examplePackSource } from "../src";

describe("example data pack source", () => {
  it("loads its files lazily into a module that passes conformance", async () => {
    const pack = await packFromSource(examplePackSource);
    expect(pack.parts).toBeUndefined();
    const loaded = loadModule(await moduleFromPackSource(examplePackSource), { seeds: 30 });
    expect(loaded.report.issues).toEqual([]);
    expect(loaded.rule("example-pack.rule.lantern")?.page).toBe(12);
    expect(loaded.entityType("example-pack.adventurer")?.kind).toBe("character");
  });
});
