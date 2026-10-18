/**
 * The example module is not a declared dependency of ui (adding one would need
 * a `pnpm install`); import it by relative path. It resolves module-sdk to the
 * same workspace package ui uses.
 */
import { exampleDice, exampleModule } from "@campaign-forge/module-example";
import type { EntityTypeDef, ReferenceList } from "@campaign-forge/module-sdk";

export { exampleDice, exampleModule };

export const hero = exampleModule.entityTypes.find((t) => t.id === "example.hero") as EntityTypeDef;

export const referenceLists: Record<string, ReferenceList> = Object.fromEntries(exampleModule.referenceLists.map((l) => [l.id, l]));

export function heroFields(): Record<string, unknown> {
  return {
    attributes: { might: 3, wits: 2 },
    skills: { fight: 1, lore: 0, sneak: 2 },
    origin: "coast",
    wounds: 1,
    gear: [{ name: "Rope", weight: 1 }],
    notes: "Owes the miller.",
  };
}
