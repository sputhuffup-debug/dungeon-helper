import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkTarget, formatCheckIssue } from "@campaign-forge/module-check";
import { afterAll, describe, expect, it } from "vitest";
import { camelCase, ENGINES, idProblems, scaffoldPack, scaffoldTsModule, slugify } from "../src";

const here = fileURLToPath(new URL(".", import.meta.url));
const pkgDir = resolve(here, "..");
// Inside the workspace, so a scaffolded TypeScript module resolves @campaign-forge/module-sdk through this package's node_modules.
const tmp = join(pkgDir, ".tmp");
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function write(dir: string, files: Record<string, string>): void {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
}

describe("create-module", () => {
  it("makes ids from names and refuses bad or built-in ids", () => {
    expect(slugify("Sky Pirates!")).toBe("sky-pirates");
    expect(slugify("  Ünïcode Quest 2 ")).toBe("unicode-quest-2");
    expect(slugify("3 Musketeers")).toBe("musketeers");
    expect(idProblems("sky-pirates")).toEqual([]);
    expect(idProblems("Sky")).toHaveLength(1);
    expect(idProblems("alien")).toEqual(['"alien" is the id of a module built into the app']);
    expect(() => scaffoldPack({ name: "Alien", engine: "d20" })).toThrow(/built into the app/);
  });

  for (const engine of ENGINES) {
    it(`writes a ${engine} data pack that passes module-check with no issues`, async () => {
      const dir = join(tmp, `pack-${engine}`);
      write(dir, { "pack.json": JSON.stringify(scaffoldPack({ name: `Test ${engine}`, engine, id: `test-${engine}`, author: "Tester" }), null, 2) });
      const report = await checkTarget(join(dir, "pack.json"), { seeds: 30, determinismSeeds: 5 });
      expect(report.issues.map(formatCheckIssue)).toEqual([]);
      expect(report.ok).toBe(true);
    });

    it(`writes a ${engine} TypeScript module that passes module-check`, async () => {
      const dir = join(tmp, `module-test-${engine}`);
      write(dir, scaffoldTsModule({ name: `Test ${engine}`, engine, id: `test-${engine}`, author: "Tester", tsconfigBase: "../../../../tsconfig.base.json" }));
      const report = await checkTarget(dir, { seeds: 30, determinismSeeds: 5 });
      expect(report.issues.filter((i) => i.severity === "error").map(formatCheckIssue)).toEqual([]);
      expect(report).toMatchObject({ ok: true, kind: "ts", moduleId: `test-${engine}` });
      expect(readFileSync(join(dir, "src/index.ts"), "utf8")).toContain(`export const ${camelCase(`test-${engine}`)}Module: GameModule`);
      // and it typechecks against the SDK contract
      const tsc = spawnSync(process.execPath, [join(pkgDir, "node_modules/typescript/bin/tsc"), "--noEmit", "-p", join(dir, "tsconfig.json")], { encoding: "utf8" });
      expect(tsc.status, tsc.stdout + tsc.stderr).toBe(0);
    });
  }

  it("is deterministic: the same options give the same files", () => {
    expect(scaffoldPack({ name: "A", id: "aa", engine: "pool", year: 2030 })).toEqual(scaffoldPack({ name: "A", id: "aa", engine: "pool", year: 2030 }));
  });

  it("runs from the command line, and does not overwrite without --force", () => {
    const cli = (...args: string[]) =>
      spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--import", "./register.mjs", "src/cli.ts", ...args], { cwd: pkgDir, encoding: "utf8", env: { ...process.env, INIT_CWD: tmp } });
    mkdirSync(tmp, { recursive: true });
    const made = cli("Moon Hunters", "--engine", "d100", "--author", "Sam");
    expect(made.status, made.stderr).toBe(0);
    const file = join(tmp, "moon-hunters-pack", "pack.json");
    expect(existsSync(file)).toBe(true);
    expect((JSON.parse(readFileSync(file, "utf8")) as { manifest: { id: string; publisher: string } }).manifest).toMatchObject({ id: "moon-hunters", publisher: "Sam" });
    expect(cli("Moon Hunters", "--engine", "d100").status).toBe(1);
    expect(cli("Moon Hunters", "--engine", "d100", "--force").status).toBe(0);
    const ts = cli("Moon Hunters", "--engine", "2d6", "--ts", "--out", "ts-moon");
    expect(ts.status, ts.stderr).toBe(0);
    expect(JSON.parse(readFileSync(join(tmp, "ts-moon", "package.json"), "utf8"))).toMatchObject({ name: "@campaign-forge/module-moon-hunters" });
    expect(JSON.parse(readFileSync(join(tmp, "ts-moon", "tsconfig.json"), "utf8")).extends).toBe("../../../../tsconfig.base.json");
    expect(cli("X", "--engine", "d12").status).toBe(2);
    expect(cli("--engine", "d20").status).toBe(2);
  });
});
