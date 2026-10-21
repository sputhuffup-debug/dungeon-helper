import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { BUNDLE_PACK_FILE, RichTextRegistry, deleteInstalledPack, exportBundle, getInstalledPack, importBundle, listInstalledPacks, putInstalledPack, type InstalledPackMeta } from "../src";
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
