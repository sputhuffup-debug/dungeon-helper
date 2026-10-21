import "fake-indexeddb/auto";
import { getInstalledPack, listCampaigns, listInstalledPacks } from "@campaign-forge/core";
import { afterEach, describe, expect, it } from "vitest";
import { runGenerator } from "../features/generate/runner";
import { createCampaign, importCampaignBundle } from "../state/actions";
import { acceptGenerated } from "../state/prepActions";
import { openCampaign } from "../state/CampaignProvider";
import { importPackFiles, installPack, PackImportError, type PackFile } from "./importPack";
import { clearModuleCache, listModules, loadModuleById, moduleEntry, refreshImportedModules, removeImportedModule } from "./registry";

import packText from "../../../../packages/module-example/packs/example-pack/pack.json?raw";
import partText from "../../../../packages/module-example/packs/example-pack/rules.part.json?raw";

const text = (name: string) => (name === "pack.json" ? packText : partText);

/** The example pack under another id, as a GM-made pack would be (the fixture's own id is built in). */
function lanternFiles(id = "lantern", version = "1.0.0"): PackFile[] {
  const swap = (s: string) => s.split("example-pack").join(id);
  const main = JSON.parse(swap(text("pack.json"))) as { manifest: { version: string } };
  main.manifest.version = version;
  return [
    { name: "pack.json", text: JSON.stringify(main) },
    { name: "rules.part.json", text: swap(text("rules.part.json")) },
  ];
}

async function expectImportError(p: Promise<unknown>): Promise<PackImportError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(PackImportError);
    return e as PackImportError;
  }
  throw new Error("expected the import to fail");
}

afterEach(async () => {
  for (const p of await listInstalledPacks()) await removeImportedModule(p.id);
  clearModuleCache();
});

describe("imported data packs", () => {
  it("validates, stores and lists a pack next to the built-ins, then loads it like any module", async () => {
    const result = await importPackFiles(lanternFiles());
    expect(result.entry).toMatchObject({ id: "lantern", source: "imported", format: "pack", version: "1.0.0" });
    expect(result.entry.license?.spdx).toBe("CC-BY-4.0");
    expect(listModules({ dev: false }).map((m) => m.id)).toEqual(["alien", "lantern"]);
    const stored = (await getInstalledPack("lantern")) as { parts?: unknown; rules: unknown[] };
    expect(stored.parts).toBeUndefined(); // stored merged
    const loaded = await loadModuleById("lantern");
    expect(loaded.report.ok).toBe(true);
    expect(loaded.rule("lantern.rule.lantern")?.page).toBe(12);
  });

  it("is read back from IndexedDB on a fresh page load", async () => {
    await importPackFiles(lanternFiles());
    clearModuleCache();
    await refreshImportedModules();
    expect(moduleEntry("lantern")?.source).toBe("imported");
    expect((await loadModuleById("lantern")).manifest.id).toBe("lantern");
  });

  it("refuses invalid packs with readable issues and stores nothing", async () => {
    const [main, part] = lanternFiles();
    const bad = JSON.parse(main!.text) as Record<string, any>;
    bad.tables[0].id = "alien.world.size";
    bad.entityTypes[0].computed.x = { method: ["a", "b"] };
    const err = await expectImportError(importPackFiles([{ name: "pack.json", text: JSON.stringify(bad) }, part!]));
    expect(err.issues.map((i) => `${i.path}: ${i.message}`)).toEqual(
      expect.arrayContaining(['$.tables[0].id: table id "alien.world.size" must start with "lantern." (ids are namespaced by the pack id)', '$.entityTypes[0].computed.x: JSONLogic: unknown operator "method"']),
    );
    expect(await listInstalledPacks()).toEqual([]);
    expect((await expectImportError(importPackFiles([main!]))).issues.map((i) => i.message)).toEqual(['part "rules.part.json" is missing']);
    expect((await expectImportError(importPackFiles([part!]))).message).toMatch(/parts of a split pack/);
    expect((await expectImportError(importPackFiles([{ name: "x.json", text: "{oops" }]))).message).toMatch(/not valid JSON/);
  });

  it("never lets a pack take a built-in module's id", async () => {
    const err = await expectImportError(importPackFiles(lanternFiles("alien")));
    expect(err.message).toMatch(/built into the app/);
    expect(moduleEntry("alien")?.source).toBe("builtin");
  });

  it("replaces an imported pack with a new version", async () => {
    await importPackFiles(lanternFiles("lantern", "1.0.0"));
    await loadModuleById("lantern");
    const again = await importPackFiles(lanternFiles("lantern", "1.1.0"));
    expect(again.replaced).toBe("1.0.0");
    expect((await loadModuleById("lantern")).manifest.version).toBe("1.1.0");
  });

  it("creates and opens a campaign with an imported pack, and removes the pack", async () => {
    await importPackFiles(lanternFiles());
    const id = await createCampaign({ name: "Lantern night", moduleId: "lantern" });
    const ctx = await openCampaign(id);
    expect(ctx.module.manifest.id).toBe("lantern");
    expect(ctx.store.meta().mode).toBe("delve");
    // the pack's declarative generator runs and its output is accepted like any module's
    const graph = runGenerator(ctx.module, { procedureId: "lantern.proc.delve", seed: "night-1", inputs: { depth: 2, lucky: false } });
    expect(graph.produced.entities[0]).toMatchObject({ tempId: "site", type: "lantern.site" });
    const accepted = acceptGenerated(ctx, { graph, stepSeeds: {}, pinned: {}, names: {} });
    expect(accepted.entities.length).toBe(graph.produced.entities.length);
    expect(ctx.store.get("entities", accepted.entities[0]!.id)?.fields.kind).toBe((graph.results.kind as { kind: string }).kind);
    ctx.close();
    expect((await listCampaigns()).filter((c) => c.moduleId === "lantern")).toHaveLength(1);
    await removeImportedModule("lantern");
    clearModuleCache();
    await expect(loadModuleById("lantern")).rejects.toThrow(/Unknown module "lantern"/);
    await expect(removeImportedModule("alien")).rejects.toThrow(/built in/);
  });

  it("carries the pack inside a campaign bundle and installs it on import", async () => {
    await importPackFiles(lanternFiles());
    const id = await createCampaign({ name: "Travelling", moduleId: "lantern" });
    const ctx = await openCampaign(id);
    const { exportBundle } = await import("@campaign-forge/core");
    const pack = await getInstalledPack("lantern");
    const bytes = await exportBundle(ctx.store, ctx.registry, undefined, { id: "lantern", version: "1.0.0", pack });
    ctx.close();
    // another device: the pack is not there
    await removeImportedModule("lantern");
    clearModuleCache();
    const imported = await importCampaignBundle(bytes);
    expect(imported.installedPack).toBe("Lanternlight (example pack) 1.0.0");
    expect(moduleEntry("lantern")?.source).toBe("imported");
    const reopened = await openCampaign(imported.id);
    expect(reopened.module.manifest.id).toBe("lantern");
    reopened.close();
  });

  it("installs only packs, never a bundle's mismatched module", async () => {
    const err = await expectImportError(installPack([{ name: "x.json", data: { format: "something-else" } }]));
    expect(err.message).toMatch(/Not a Campaign Forge data pack/);
  });
});
