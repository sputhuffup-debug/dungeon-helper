/**
 * `pnpm guides`: write docs/guides/<guide id>.md for every built-in module
 * that has a guide, from the module's own guide data. `--check` writes
 * nothing and exits 1 when a page is missing or stale (the test does the
 * same).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { builtinGuidePages } from "./index";

const ROOT = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const check = process.argv.includes("--check");

const pages = await builtinGuidePages(ROOT);
let stale = 0;
for (const page of pages) {
  const path = resolve(ROOT, page.file);
  const current = existsSync(path) ? readFileSync(path, "utf8") : undefined;
  if (current === page.markdown) {
    console.log(`${page.file}: up to date`);
    continue;
  }
  if (check) {
    console.log(`${page.file}: ${current === undefined ? "missing" : "stale"} (run pnpm guides)`);
    stale++;
    continue;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, page.markdown);
  console.log(`${page.file}: written`);
}
if (stale) process.exit(1);
