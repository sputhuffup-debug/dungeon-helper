import "fake-indexeddb/auto";
import { getInstalledSupplement, importBundle, listInstalledSupplements } from "@campaign-forge/core";
import { afterEach, describe, expect, it } from "vitest";
import { campaignBundleBytes, createCampaign, importCampaignBundle } from "../state/actions";
import { openCampaign } from "../state/CampaignProvider";
import { importFiles, isSupplementResult, PackImportError } from "./importPack";
import {
  builtinSupplement,
  builtinSupplementsFor,
  clearModuleCache,
  describeSupplement,
  isBuiltinSupplementEnabled,
  isBuiltinSupplementId,
  listBuiltinSupplements,
  loadModuleById,
  removeSupplement,
  setBuiltinSupplementEnabled,
  subscribeModules,
} from "./registry";

import supplementText from "../../../../packages/module-example/packs/example-supplement/supplement.json?raw";

const ID = "pf2e-orc-books";
const SLOW = 180_000;

afterEach(async () => {
  try {
    localStorage.clear();
  } catch {
    /* no storage */
  }
  for (const s of await listInstalledSupplements()) await removeSupplement(s.id);
  clearModuleCache();
});

describe("built-in supplements", () => {
  it("are listed under their module, off by default, with metadata that matches the supplement", async () => {
    expect(listBuiltinSupplements().map((s) => s.id)).toEqual([ID]);
    expect(builtinSupplementsFor("pf2e-orc").map((s) => s.id)).toEqual([ID]);
    expect(builtinSupplementsFor("dnd5e-srd")).toEqual([]);
    const entry = builtinSupplement(ID)!;
    expect(entry).toMatchObject({ source: "builtin", name: "Remaster ORC books", extends: { module: "pf2e-orc" }, defaultEnabled: false });
    expect(entry.bytes).toBeGreaterThan(1_000_000);
    expect(isBuiltinSupplementId(ID)).toBe(true);
    expect(isBuiltinSupplementEnabled(ID)).toBe(false);
    expect(describeSupplement(ID)).toMatchObject({ name: "Remaster ORC books", source: "builtin" });
    // the static metadata is the supplement's own
    const sdk = await import("@campaign-forge/module-sdk");
    const s = await sdk.supplementFromSource(await entry.load());
    expect({ id: entry.id, name: entry.name, version: entry.version, extends: entry.extends, licenseNotice: entry.licenseNotice, license: entry.license }).toEqual({
      id: s.manifest.id,
      name: s.manifest.name,
      version: s.manifest.version,
      extends: s.manifest.extends,
      licenseNotice: s.manifest.licenseNotice,
      license: s.manifest.license,
    });
    expect(entry.counts).toEqual(sdk.supplementCounts(s));
  }, SLOW);

  it("switches on and off per device: the module loads with it only while it is on", async () => {
    const off = await loadModuleById("pf2e-orc");
    expect(off.manifest.supplements).toBeUndefined();
    expect(off.referenceList("pf2e-orc.ancestries")!.items.some((i) => i.name === "Centaur")).toBe(false);
    let notified = 0;
    const unsubscribe = subscribeModules(() => notified++);
    setBuiltinSupplementEnabled(ID, true);
    unsubscribe();
    expect(notified).toBe(1);
    expect(isBuiltinSupplementEnabled(ID)).toBe(true);
    expect(JSON.parse(localStorage.getItem("cf-builtin-supplements")!)).toEqual({ [ID]: true });
    const on = await loadModuleById("pf2e-orc");
    expect(on).not.toBe(off);
    expect(on.manifest.supplements?.map((s) => s.id)).toEqual([ID]);
    const centaur = on.referenceItem("pf2e-orc.ancestries", `${ID}.centaur`);
    expect(centaur).toMatchObject({ name: "Centaur", source: "Remaster ORC books", hp: 8 });
    expect(on.preset(`${ID}.preset.adlet`)?.entityType).toBe("pf2e-orc.creature");
    expect(on.report.issues.filter((i) => i.severity === "error")).toEqual([]);
    // other modules are not touched
    expect((await loadModuleById("dnd5e-srd")).manifest.supplements).toBeUndefined();
    setBuiltinSupplementEnabled(ID, false);
    expect((await loadModuleById("pf2e-orc")).manifest.supplements).toBeUndefined();
    expect(() => setBuiltinSupplementEnabled("nope", true)).toThrow(/not a built-in supplement/);
  }, SLOW);

  it("is never embedded in a bundle: the bundle names it, and importing it switches it on", async () => {
    setBuiltinSupplementEnabled(ID, true);
    const id = await createCampaign({ name: "Hollow road", moduleId: "pf2e-orc" });
    const ctx = await openCampaign(id);
    expect(ctx.module.manifest.supplements?.map((s) => s.id)).toEqual([ID]);
    const bytes = await campaignBundleBytes(ctx);
    ctx.close();
    const read = await importBundle(bytes, { onConflict: "new-id" });
    expect(read.supplements).toEqual([]);
    expect(read.pack).toBeUndefined();
    expect(read.manifest.supplements).toBeUndefined();
    expect(read.manifest.builtinSupplements).toEqual([{ id: ID, name: "Remaster ORC books", version: "0.1.0" }]);
    read.store.destroy();
    // another device, where it is off
    localStorage.clear();
    clearModuleCache();
    expect(isBuiltinSupplementEnabled(ID)).toBe(false);
    const imported = await importCampaignBundle(bytes);
    expect(imported.enabledSupplements).toEqual(["Remaster ORC books 0.1.0"]);
    expect(imported.installedSupplements).toBeUndefined();
    expect(isBuiltinSupplementEnabled(ID)).toBe(true);
    expect(await getInstalledSupplement(ID)).toBeUndefined();
    const reopened = await openCampaign(imported.id);
    expect(reopened.module.manifest.supplements?.map((s) => s.id)).toEqual([ID]);
    reopened.close();
    // importing it again changes nothing
    expect((await importCampaignBundle(bytes)).enabledSupplements).toBeUndefined();
  }, SLOW);

  it("keeps its id to itself: an imported supplement may not use it", async () => {
    const s = JSON.parse(supplementText) as Record<string, any>;
    s.manifest.id = ID;
    const text = JSON.stringify(s).replaceAll('"deep-roads.', `"${ID}.`);
    try {
      await importFiles([{ name: "supplement.json", text }]);
      throw new Error("expected the import to fail");
    } catch (e) {
      expect(e).toBeInstanceOf(PackImportError);
      expect((e as Error).message).toMatch(/is the id of a supplement built into the app/);
    }
  });
});

describe("split supplements (imported)", () => {
  it("imports a supplement's main file with its parts, joined into one", async () => {
    const whole = JSON.parse(supplementText) as Record<string, any>;
    const { presets, rules, ...main } = whole;
    const part = (name: string, body: Record<string, unknown>) => ({ name, text: JSON.stringify({ format: "campaign-forge-supplement-part", formatVersion: 1, supplement: "deep-roads", name, ...body }) });
    const files = [{ name: "supplement.json", text: JSON.stringify({ ...main, parts: ["presets.json", "rules.json"] }) }, part("rules.json", { rules }), part("presets.json", { presets })];
    const result = await importFiles(files);
    expect(isSupplementResult(result)).toBe(true);
    if (!isSupplementResult(result)) return;
    expect(result.supplement.files).toEqual(["supplement.json", "rules.json", "presets.json"]);
    expect(result.supplement.counts).toMatchObject({ presets: presets.length, rules: rules.length });
    const stored = (await getInstalledSupplement("deep-roads")) as Record<string, unknown>;
    expect(stored.parts).toBeUndefined();
    const mod = await loadModuleById("example-pack");
    expect(mod.preset("deep-roads.preset.blind-eel")).toBeDefined();
    // parts alone, or a missing part, are refused with the reason
    await expect(importFiles([files[1]!])).rejects.toThrow(/parts of a split supplement/);
    await expect(importFiles([files[0]!, files[1]!])).rejects.toThrow(/do not fit together/);
  });
});
