import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import {
  BUNDLE_PACK_FILE,
  BUNDLE_SUPPLEMENTS_DIR,
  RichTextRegistry,
  deleteInstalledPack,
  deleteInstalledSupplement,
  exportBundle,
  getInstalledPack,
  getInstalledSupplement,
  importBundle,
  listInstalledPacks,
  listInstalledSupplements,
  putInstalledPack,
  putInstalledSupplement,
  type InstalledPackMeta,
  type InstalledSupplementMeta,
} from "../src";
import { newStore } from "./fixtures";

const meta = (id: string, name: string): InstalledPackMeta => ({
  id,
  name,
  version: "1.0.0",
  ruleset: name,
  modes: [{ id: "std", name: "Standard" }],
  defaultMode: "std",
  dataStatus: "verified",
  license: { name: "CC BY 4.0", attribution: "Includes material from a reference document." },
  importedAt: "2026-10-21T10:00:00.000Z",
  files: ["pack.json"],
  bytes: 10,
});

describe("installed data packs", () => {
  it("stores metadata apart from the pack JSON, replaces and deletes", async () => {
    await putInstalledPack(meta("zeta", "Zeta"), { format: "campaign-forge-pack", n: 1 });
    await putInstalledPack(meta("alpha", "Alpha"), { format: "campaign-forge-pack", n: 2 });
    expect((await listInstalledPacks()).map((p) => p.id)).toEqual(["alpha", "zeta"]);
    expect(await getInstalledPack("zeta")).toEqual({ format: "campaign-forge-pack", n: 1 });
    await putInstalledPack({ ...meta("zeta", "Zeta"), version: "1.1.0" }, { n: 3 });
    expect((await listInstalledPacks()).find((p) => p.id === "zeta")?.version).toBe("1.1.0");
    expect(await getInstalledPack("zeta")).toEqual({ n: 3 });
    await deleteInstalledPack("zeta");
    expect((await listInstalledPacks()).map((p) => p.id)).toEqual(["alpha"]);
    expect(await getInstalledPack("zeta")).toBeUndefined();
    await deleteInstalledPack("alpha");
  });
});

describe("bundles with an embedded pack", () => {
  it("carries the module's pack so the campaign opens elsewhere", async () => {
    const store = newStore("Packed");
    const pack = { format: "campaign-forge-pack", manifest: { id: "zeta" } };
    const bytes = await exportBundle(store, new RichTextRegistry(), undefined, { id: "zeta", version: "1.0.0", pack });
    expect(JSON.parse(strFromU8(unzipSync(bytes)[BUNDLE_PACK_FILE]!))).toEqual(pack);
    const imported = await importBundle(bytes);
    expect(imported.pack).toEqual(pack);
    const plain = await importBundle(await exportBundle(store, new RichTextRegistry(), undefined, { id: "zeta", version: "1.0.0" }));
    expect(plain.pack).toBeUndefined();
  });
});

const supplementMeta = (id: string, name: string, module = "zeta"): InstalledSupplementMeta => ({
  id,
  name,
  version: "0.1.0",
  extends: { module, version: "^1.0.0" },
  licenseNotice: "Private: personal use only.",
  counts: { referenceItems: 2 },
  importedAt: "2026-10-21T10:00:00.000Z",
  files: ["supplement.json"],
  bytes: 10,
});

describe("installed supplements", () => {
  it("are stored in their own database, apart from packs (an id may be both)", async () => {
    await putInstalledPack(meta("zeta", "Zeta"), { format: "campaign-forge-pack" });
    await putInstalledSupplement(supplementMeta("zeta", "Zeta extras"), { format: "campaign-forge-supplement", n: 1 });
    await putInstalledSupplement(supplementMeta("aaa", "Zeta extras"), { n: 2 });
    // by name, then id
    expect((await listInstalledSupplements()).map((s) => s.id)).toEqual(["aaa", "zeta"]);
    expect(await getInstalledSupplement("zeta")).toEqual({ format: "campaign-forge-supplement", n: 1 });
    expect(await getInstalledPack("zeta")).toEqual({ format: "campaign-forge-pack" });
    await deleteInstalledSupplement("zeta");
    await deleteInstalledSupplement("aaa");
    expect(await listInstalledSupplements()).toEqual([]);
    expect((await listInstalledPacks()).map((p) => p.id)).toEqual(["zeta"]);
    await deleteInstalledPack("zeta");
  });
});

describe("bundles with embedded supplements", () => {
  it("carries each active supplement, lists it in the manifest and reads it back in file order", async () => {
    const store = newStore("Supplemented");
    const a = { format: "campaign-forge-supplement", manifest: { id: "zz-extras" } };
    const b = { format: "campaign-forge-supplement", manifest: { id: "aa-extras" } };
    const bytes = await exportBundle(store, new RichTextRegistry(), undefined, {
      id: "zeta",
      version: "1.0.0",
      supplements: [
        { id: "zz-extras", name: "ZZ extras", version: "0.2.0", data: a },
        { id: "aa-extras", name: "AA extras", version: "0.1.0", data: b },
      ],
    });
    const files = unzipSync(bytes);
    expect(Object.keys(files).filter((f) => f.startsWith(BUNDLE_SUPPLEMENTS_DIR)).sort()).toEqual(["module/supplements/aa-extras.json", "module/supplements/zz-extras.json"]);
    expect(strFromU8(files["README.md"]!)).toContain("- Supplement: ZZ extras (zz-extras 0.2.0)");
    const imported = await importBundle(bytes);
    expect(imported.manifest.supplements).toEqual([
      { id: "zz-extras", name: "ZZ extras", version: "0.2.0" },
      { id: "aa-extras", name: "AA extras", version: "0.1.0" },
    ]);
    expect(imported.supplements).toEqual([
      { file: "module/supplements/aa-extras.json", data: b },
      { file: "module/supplements/zz-extras.json", data: a },
    ]);
    const plain = await importBundle(await exportBundle(store, new RichTextRegistry(), undefined, { id: "zeta", version: "1.0.0" }));
    expect(plain.supplements).toEqual([]);
    expect(plain.manifest.supplements).toBeUndefined();
    await expect(exportBundle(store, new RichTextRegistry(), undefined, { id: "zeta", version: "1.0.0", supplements: [{ id: "../evil", name: "x", version: "1", data: {} }] })).rejects.toThrow(/cannot be a file name/);
  });
});
