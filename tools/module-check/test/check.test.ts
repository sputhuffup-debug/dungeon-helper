import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { checkTarget, formatCheckIssue, formatReport } from "../src";

const here = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(here, "../../..");
const packDir = join(root, "packages/module-example/packs/example-pack");
const tmp = mkdtempSync(join(tmpdir(), "module-check-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

/** A copy of the example pack, edited. */
function badCopy(name: string, edit: (pack: Record<string, any>) => void, withParts = true): string {
  const dir = join(tmp, name);
  cpSync(packDir, dir, { recursive: true });
  if (!withParts) rmSync(join(dir, "rules.part.json"));
  const file = join(dir, "pack.json");
  const pack = JSON.parse(readFileSync(file, "utf8")) as Record<string, any>;
  edit(pack);
  writeFileSync(file, JSON.stringify(pack, null, 2));
  return file;
}

describe("module-check", () => {
  it("passes the example pack by id, by file and by folder with zero issues", async () => {
    for (const target of ["example-pack", join(packDir, "pack.json"), packDir]) {
      const r = await checkTarget(target, { seeds: 30, determinismSeeds: 5 });
      expect(r.issues.map(formatCheckIssue)).toEqual([]);
      expect(r).toMatchObject({ ok: true, kind: "pack", moduleId: "example-pack", stages: ["pack", "conformance", "lint", "determinism"] });
    }
  });

  it("checks TypeScript modules by id and by package folder", async () => {
    const byId = await checkTarget("example", { seeds: 20, determinismSeeds: 5 });
    expect(byId).toMatchObject({ ok: true, kind: "ts", moduleId: "example", stages: ["conformance", "lint", "determinism"] });
    const byPath = await checkTarget("packages/module-example", { cwd: root, seeds: 20, determinismSeeds: 5 });
    expect(byPath.ok).toBe(true);
    expect(byPath.moduleId).toBe("example");
  });

  it("checks the Alien module", async () => {
    const r = await checkTarget("alien", { seeds: 20, determinismSeeds: 3 });
    expect(r.issues.filter((i) => i.severity === "error")).toEqual([]);
  });

  it("checks the ORC core rules pack (pf2e-orc) by id, part files and all", async () => {
    const r = await checkTarget("pf2e-orc", { seeds: 10, determinismSeeds: 2 });
    expect(r.issues.map(formatCheckIssue)).toEqual([]);
    expect(r).toMatchObject({ ok: true, kind: "pack", moduleId: "pf2e-orc", stages: ["pack", "conformance", "lint", "determinism"] });
  }, 60_000);

  it("stops at pack errors with JSON paths", async () => {
    const file = badCopy("schema", (p) => {
      p.tables[1].rows[0].range = [1];
      p.tables[2].id = "nope";
    });
    const r = await checkTarget(file);
    expect(r.ok).toBe(false);
    expect(r.stages).toEqual(["pack"]);
    expect(r.issues.map(formatCheckIssue)).toEqual(["error   [pack] $.tables[1].rows[0].range (example-pack.site.danger): must NOT have fewer than 2 items"]);
    expect(formatReport(r)).toMatch(/not run: conformance, lint, determinism/);
  });

  it("names a missing part file", async () => {
    const r = await checkTarget(badCopy("noparts", () => {}, false));
    expect(r.issues.map((i) => i.message)).toEqual(['part "rules.part.json" is missing (no file rules.part.json next to pack.json)']);
  });

  it("maps conformance and lint issues back to the pack", async () => {
    const r = await checkTarget(
      badCopy("conformance", (p) => {
        p.tables[0].rows.pop();
        delete p.tables[4].cite;
      }),
      { seeds: 5, determinismSeeds: 2 },
    );
    const lines = r.issues.map(formatCheckIssue);
    expect(lines).toContain("error   [conformance] $.tables[0] (example-pack.site.kind): no row covers total 6 (dice 1d6)");
    expect(lines).toContain("error   [lint] $.tables[4] (example-pack.loot.common): table cites no source: give it a page, a cite, or mark it original");
  });

  it("refuses unknown targets and pack parts", async () => {
    await expect(checkTarget("no-such-module")).rejects.toThrow(/no such module id or file/);
    await expect(checkTarget(join(packDir, "rules.part.json"))).rejects.toThrow(/part of a split pack/);
  });

  it("exits 0, 1 or 2 from the command line", () => {
    const run = (...args: string[]) =>
      spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--import", "./register.mjs", "src/cli.ts", ...args], { cwd: resolve(here, ".."), encoding: "utf8", env: { ...process.env, INIT_CWD: root } });
    const ok = run("example-pack", "--seeds", "5", "--determinism-seeds", "2");
    expect(ok.status, ok.stderr).toBe(0);
    expect(ok.stdout).toMatch(/OK: no errors/);
    const bad = run(badCopy("cli", (p) => (p.tables[2].id = "nope")));
    expect(bad.status).toBe(1);
    expect(bad.stdout).toMatch(/\$\.tables\[2\]\.id \(nope\)/);
    expect(run().status).toBe(2);
    const json = run("example-pack", "--json", "--seeds", "2", "--determinism-seeds", "1");
    expect((JSON.parse(json.stdout) as Array<{ ok: boolean }>)[0]!.ok).toBe(true);
  });
});

describe("module-check on supplements", () => {
  const supplementFile = join(root, "packages/module-example/packs/example-supplement/supplement.json");
  function supplementCopy(name: string, edit: (s: Record<string, any>) => void): string {
    const s = JSON.parse(readFileSync(supplementFile, "utf8")) as Record<string, any>;
    edit(s);
    const file = join(tmp, `${name}.supplement.json`);
    writeFileSync(file, JSON.stringify(s, null, 2));
    return file;
  }

  it("checks a supplement against the module it extends, by file and by its repository id", async () => {
    for (const target of [supplementFile, "deep-roads"]) {
      const r = await checkTarget(target, { seeds: 10, determinismSeeds: 3 });
      expect(r.issues.map(formatCheckIssue)).toEqual([]);
      expect(r).toMatchObject({ ok: true, kind: "supplement", moduleId: "deep-roads", base: "example-pack 0.1.0", stages: ["pack", "conformance", "lint", "determinism"] });
    }
    expect(formatReport(await checkTarget(supplementFile, { seeds: 5, determinismSeeds: 2 }))).toMatch(/^module-check: Deep Roads \(example supplement\) \(deep-roads 0\.1\.0\), supplement for example-pack 0\.1\.0/);
  });

  it("joins a split supplement with the parts next to it, and names a missing part", async () => {
    const whole = JSON.parse(readFileSync(supplementFile, "utf8")) as Record<string, any>;
    const { rules, ...main } = whole;
    const dir = join(tmp, "split-supplement");
    cpSync(join(supplementFile, ".."), dir, { recursive: true });
    writeFileSync(join(dir, "supplement.json"), JSON.stringify({ ...main, parts: ["rules.json"] }));
    writeFileSync(join(dir, "rules.json"), JSON.stringify({ format: "campaign-forge-supplement-part", formatVersion: 1, supplement: "deep-roads", name: "rules.json", rules }));
    const r = await checkTarget(join(dir, "supplement.json"), { seeds: 5, determinismSeeds: 2 });
    expect(r.issues.map(formatCheckIssue)).toEqual([]);
    expect(r.ok).toBe(true);
    rmSync(join(dir, "rules.json"));
    const missing = await checkTarget(join(dir, "supplement.json"), { seeds: 5 });
    expect(missing.issues.map(formatCheckIssue)).toEqual(['error   [pack] $.parts: part "rules.json" is missing (no file rules.json next to supplement.json)']);
  });

  it("checks the built-in supplement for pf2e-orc by its id (split into parts)", async () => {
    const r = await checkTarget("pf2e-orc-books", { seeds: 5, determinismSeeds: 2 });
    expect(r.issues.filter((i) => i.severity === "error").map(formatCheckIssue)).toEqual([]);
    expect(r).toMatchObject({ ok: true, kind: "supplement", moduleId: "pf2e-orc-books", base: "pf2e-orc 0.1.0" });
  }, 120_000);

  it("reports a missing list, a lint problem and an unknown base module", async () => {
    const bad = await checkTarget(
      supplementCopy("bad", (s) => {
        s.referenceItems["example-pack.monsters"] = [{ id: "deep-roads.x", name: "X" }];
      }),
      { seeds: 5 },
    );
    expect(bad.ok).toBe(false);
    expect(bad.issues.map(formatCheckIssue)[0]).toMatch(/^error   \[pack\] \$\.referenceItems\["example-pack\.monsters"\]: "example-pack" has no reference list/);
    const lint = await checkTarget(supplementCopy("lint", (s) => (s.tables[0].family = "camp")), { seeds: 5 });
    expect(lint.issues.map(formatCheckIssue)).toEqual(['error   [lint] $.tables[0] (deep-roads.waystone.found): family "camp" does not match the id segment "waystone"']);
    const orphan = await checkTarget(supplementCopy("orphan", (s) => (s.manifest.extends.module = "sky-pirates")), { seeds: 5 });
    expect(orphan.issues.map((i) => i.message)).toEqual([expect.stringMatching(/the base module "sky-pirates" is not built in .* pass its pack or module with --base <target>/)]);
    // --base points at the module's pack
    const withBase = await checkTarget(
      supplementCopy("based", (s) => (s.manifest.extends.module = "example-pack")),
      { seeds: 5, determinismSeeds: 2, base: join(packDir, "pack.json") },
    );
    expect(withBase.ok).toBe(true);
  });
});
