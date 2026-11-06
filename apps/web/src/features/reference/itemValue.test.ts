import type { ReferenceList } from "@campaign-forge/module-sdk";
import { describe, expect, it } from "vitest";
import { itemValueText } from "./ReferencePage";

const frames: ReferenceList = { id: "x.frames", name: "Campaign frames", items: [] };
const tables: Record<string, string> = { "x.jobs.truckers.employer": "Employer (Space Truckers)", "x.jobs.truckers.bonus": "Bonus (Space Truckers)" };
const tableName = (id: string) => tables[id];
const none = () => undefined;

describe("Reference values: names, not ids", () => {
  it("names a roll table's id by the table, alone or inside an object of tables", () => {
    expect(itemValueText(frames, "employer", "x.jobs.truckers.employer", none, tableName)).toBe("Employer (Space Truckers)");
    expect(itemValueText(frames, "tables", { employer: "x.jobs.truckers.employer", bonus: "x.jobs.truckers.bonus" }, none, tableName)).toBe("Employer: Employer (Space Truckers), Bonus: Bonus (Space Truckers)");
  });

  it("leaves other values as they were", () => {
    expect(itemValueText(frames, "note", "Haul ore", none, tableName)).toBe("Haul ore");
    expect(itemValueText(frames, "pay", { base: 3, bonus: 1 }, none, tableName)).toBe("Base 3, Bonus 1");
  });
});
