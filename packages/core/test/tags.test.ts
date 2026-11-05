import { describe, expect, it } from "vitest";
import { importedCampaignName, isMachineTag, readableTags } from "../src";

describe("machine tags", () => {
  it("tells key:value machine tags from the GM's own", () => {
    expect(isMachineTag("within:alien.location.gj2066")).toBe(true);
    expect(isMachineTag("subtype:colony")).toBe(true);
    expect(isMachineTag("frame:space-truckers")).toBe(true);
    expect(isMachineTag("job-board")).toBe(false);
    expect(isMachineTag("note: ask Ana")).toBe(false);
    expect(isMachineTag("Act 2:")).toBe(false);
  });
  it("leaves machine tags out of readable lists", () => {
    expect(readableTags(["npc", "within:x.y", "job"])).toEqual(["npc", "job"]);
  });
  it("treats a module's bookkeeping tags as machine tags", () => {
    const bookkeeping = ["job-board", "job"];
    expect(isMachineTag("job-board", bookkeeping)).toBe(true);
    expect(isMachineTag("npc", bookkeeping)).toBe(false);
    expect(readableTags(["npc", "job-board", "within:x.y", "job", "smugglers"], bookkeeping)).toEqual(["npc", "smugglers"]);
  });
});

describe("importedCampaignName", () => {
  const day = new Date(2026, 10, 4);
  it("keeps a free name, and marks one this device already has", () => {
    expect(importedCampaignName("Ironwake Haulage", ["Skyfire Down"], day)).toBe("Ironwake Haulage");
    expect(importedCampaignName("Ironwake Haulage", ["ironwake haulage"], day)).toBe("Ironwake Haulage (imported 4 Nov 2026)");
    expect(importedCampaignName("Ironwake Haulage", ["Ironwake Haulage", "Ironwake Haulage (imported 4 Nov 2026)"], day)).toBe("Ironwake Haulage (imported 4 Nov 2026, 2)");
  });
});
