import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { buildAuthored } from "../scripts/authored/index.ts";
import { generatedData } from "../scripts/build-pack.ts";

const dir = join(__dirname, "..");
const readPart = (name: string) => JSON.parse(readFileSync(join(dir, "pack", name), "utf8")) as Record<string, unknown>;

it("the committed pack.json and tables.json match scripts/authored (run `pnpm --filter @campaign-forge/module-dnd5e-srd build-pack`)", () => {
  const slots = JSON.parse(readFileSync(join(dir, "scripts/generated/spell-slots.json"), "utf8")) as Record<string, number[][]>;
  const built = buildAuthored(generatedData(readPart, slots));
  for (const [name, data] of Object.entries(built)) expect(readPart(name), name).toEqual(JSON.parse(JSON.stringify(data)));
});
