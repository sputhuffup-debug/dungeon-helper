import "fake-indexeddb/auto";
import { getInstalledSupplement, listInstalledSupplements, putInstalledSupplement } from "@campaign-forge/core";
import { afterEach, describe, expect, it } from "vitest";
import { campaignBundleBytes, createCampaign, importBundleIntoCampaign, importCampaignBundle } from "../state/actions";
import { openCampaign } from "../state/CampaignProvider";
import { importFiles, importSupplementFile, isSupplementResult, PackImportError, type PackFile } from "./importPack";
import { clearModuleCache, listSupplements, loadModuleById, refreshImportedModules, removeSupplement, supplementProblems, supplementsFor } from "./registry";

import supplementText from "../../../../packages/module-example/packs/example-supplement/supplement.json?raw";

/** The example pack's fixture supplement ("Deep Roads"), optionally changed. */
function deepRoads(change: (s: Record<string, any>) => void = () => {}): PackFile {
  const s = JSON.parse(supplementText) as Record<string, any>;
  change(s);
  return { name: "supplement.json", text: JSON.stringify(s) };
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

const backgrounds = async () => (await loadModuleById("example-pack")).referenceList("example-pack.backgrounds")!.items.map((i) => i.id);

afterEach(async () => {
  for (const s of await listInstalledSupplements()) await removeSupplement(s.id);
  clearModuleCache();
});

describe("imported supplements", () => {
  it("validates against the module it extends, stores it, and the module loads with it", async () => {
    const before = await backgrounds();
    expect(before).not.toContain("deep-roads.tunnel-cartographer");
    const result = await importFiles([deepRoads()]);
    expect(isSupplementResult(result)).toBe(true);
    if (!isSupplementResult(result)) return;
    expect(result.supplement).toMatchObject({ id: "deep-roads", version: "0.1.0", extends: { module: "example-pack", version: "^0.1.0" }, counts: { referenceItems: 2, procedures: 1 } });
    expect(result.base.id).toBe("example-pack");
    expect(listSupplements().map((s) => s.id)).toEqual(["deep-roads"]);
    expect(supplementsFor("example-pack").map((s) => s.id)).toEqual(["deep-roads"]);
    // the cached module was dropped: it reloads with the supplement merged in
    const mod = await loadModuleById("example-pack");
    expect(await backgrounds()).toEqual([...before, "deep-roads.tunnel-cartographer"]);
    expect(mod.referenceItem("example-pack.backgrounds", "deep-roads.tunnel-cartographer")?.source).toBe("Deep Roads (example supplement)");
    expect(mod.manifest.supplements?.map((s) => `${s.id} ${s.version}`)).toEqual(["deep-roads 0.1.0"]);
    expect(mod.procedure("deep-roads.proc.waystone")).toBeDefined();
    expect(mod.preset("deep-roads.preset.blind-eel")?.entityType).toBe("example-pack.monster");
    // read back on a fresh page load
    clearModuleCache();
    await refreshImportedModules();
    expect(listSupplements().map((s) => s.id)).toEqual(["deep-roads"]);
    expect(await backgrounds()).toContain("deep-roads.tunnel-cartographer");
  });

  it("refuses a supplement for a module this device does not have, or one that does not fit", async () => {
    const unknown = await expectImportError(importFiles([deepRoads((s) => (s.manifest.extends.module = "sky-pirates"))]));
    expect(unknown.message).toBe('This supplement extends "sky-pirates", which is not on this device. Import that module first, then the supplement.');
    const version = await expectImportError(importFiles([deepRoads((s) => (s.manifest.extends.version = "^2.0.0"))]));
    expect(version.message).toMatch(/does not fit Lanternlight \(example pack\) 0\.1\.0/);
    expect(version.issues.map((i) => i.message)).toEqual(["this supplement needs example-pack ^2.0.0, but the module is version 0.1.0"]);
    const list = await expectImportError(importFiles([deepRoads((s) => (s.referenceItems["example-pack.spells"] = [{ id: "deep-roads.x", name: "X" }]))]));
    expect(list.issues[0]?.path).toBe('$.referenceItems["example-pack.spells"]');
    const id = await expectImportError(importFiles([deepRoads((s) => (s.manifest.id = "alien"))]));
    expect(id.message).toMatch(/is the id of a game module/);
    const two = await expectImportError(importFiles([deepRoads(), deepRoads()]));
    expect(two.message).toMatch(/one supplement at a time/);
    expect(await listInstalledSupplements()).toEqual([]);
  });

  it("replaces an imported supplement with a new version, and removing it takes its content out", async () => {
    await importSupplementFile(deepRoads());
    const again = await importSupplementFile(deepRoads((s) => (s.manifest.version = "0.2.0")));
    expect(again.replaced).toBe("0.1.0");
    expect((await loadModuleById("example-pack")).manifest.supplements?.[0]?.version).toBe("0.2.0");
    await removeSupplement("deep-roads");
    expect(listSupplements()).toEqual([]);
    expect(await backgrounds()).not.toContain("deep-roads.tunnel-cartographer");
  });

  it("leaves out a stored supplement that no longer fits, and still loads the module", async () => {
    const bad = JSON.parse(deepRoads().text) as Record<string, any>;
    bad.referenceItems = { "example-pack.gone": [{ id: "deep-roads.x", name: "X" }] };
    await putInstalledSupplement(
      { id: "deep-roads", name: "Deep Roads", version: "0.1.0", extends: { module: "example-pack" }, licenseNotice: "x", counts: {}, importedAt: "2026-10-21T00:00:00Z", files: [], bytes: 1 },
      bad,
    );
    await refreshImportedModules();
    clearModuleCache();
    const mod = await loadModuleById("example-pack");
    expect(mod.manifest.supplements).toBeUndefined();
    expect(supplementProblems("example-pack").map((p) => [p.id, p.issues[0]?.path])).toEqual([["deep-roads", '$.referenceItems["example-pack.gone"]']]);
  });

  it("travels inside a campaign bundle: installed when missing, never overwriting one already here", async () => {
    await importSupplementFile(deepRoads());
    const id = await createCampaign({ name: "Under the hill", moduleId: "example-pack" });
    const ctx = await openCampaign(id);
    expect(ctx.module.manifest.supplements?.map((s) => s.id)).toEqual(["deep-roads"]);
    const bytes = await campaignBundleBytes(ctx);
    ctx.close();
    // another device, without the supplement
    await removeSupplement("deep-roads");
    const imported = await importCampaignBundle(bytes);
    expect(imported.installedSupplements).toEqual(["Deep Roads (example supplement) 0.1.0"]);
    expect(await getInstalledSupplement("deep-roads")).toBeDefined();
    const reopened = await openCampaign(imported.id);
    expect(reopened.module.referenceItem("example-pack.backgrounds", "deep-roads.tunnel-cartographer")).toBeDefined();
    // a newer version already here is kept
    await importSupplementFile(deepRoads((s) => (s.manifest.version = "0.3.0")));
    const into = await importBundleIntoCampaign(reopened, bytes);
    expect(into.installedSupplements).toBeUndefined();
    expect(into.skippedSupplements).toEqual(["Deep Roads (example supplement) 0.1.0: already installed (0.3.0 kept)"]);
    expect(listSupplements()[0]?.version).toBe("0.3.0");
    reopened.close();
  });
});
