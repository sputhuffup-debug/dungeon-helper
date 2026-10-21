import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { buildAuthored } from "../scripts/authored/index.ts";
import { convertedParts, generatedData, sourceIndex, sourceManifest } from "../scripts/build-pack.ts";

const dir = join(__dirname, "..");
const readPart = (name: string) => JSON.parse(readFileSync(join(dir, "pack", name), "utf8")) as Record<string, unknown>;

it("the committed pack.json, tables.json, src/index.ts and src/manifest.ts match scripts/ (run `pnpm --filter @campaign-forge/module-pf2e-orc build-pack`)", () => {
  const hp = JSON.parse(readFileSync(join(dir, "scripts/generated/hp.json"), "utf8")) as Record<string, unknown>;
  const parts = convertedParts();
  const built = buildAuthored(generatedData(readPart, hp, parts));
  for (const [name, data] of Object.entries(built)) expect(readPart(name), name).toEqual(JSON.parse(JSON.stringify(data)));
  expect(readFileSync(join(dir, "src/index.ts"), "utf8")).toBe(sourceIndex(parts));
  expect(readFileSync(join(dir, "src/manifest.ts"), "utf8")).toBe(sourceManifest(built["pack.json"] as Record<string, unknown>));
});
