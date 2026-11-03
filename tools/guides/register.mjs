/**
 * Node loader hook so `node --experimental-strip-types --import ./register.mjs src/cli.ts`
 * can run the workspace's TypeScript sources directly: the packages import each
 * other with extensionless specifiers (`./types`, `./data`), which Node's ESM
 * resolver rejects. On ERR_MODULE_NOT_FOUND / ERR_UNSUPPORTED_DIR_IMPORT for a
 * relative specifier this hook retries with `.ts` and `/index.ts`.
 */
import { existsSync } from "node:fs";
import { register } from "node:module";
import { fileURLToPath } from "node:url";
import { isMainThread } from "node:worker_threads";

if (isMainThread) register(import.meta.url);

const RETRY = new Set(["ERR_MODULE_NOT_FOUND", "ERR_UNSUPPORTED_DIR_IMPORT"]);

export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (err) {
    const relative = specifier.startsWith("./") || specifier.startsWith("../");
    if (!relative || !RETRY.has(err?.code) || !context.parentURL) throw err;
    const base = new URL(specifier, context.parentURL).href;
    for (const candidate of [`${base}.ts`, `${base}/index.ts`]) {
      if (existsSync(fileURLToPath(candidate))) return next(candidate, context);
    }
    throw err;
  }
}
