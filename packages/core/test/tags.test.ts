import { describe, expect, it } from "vitest";
import { isMachineTag, readableTags } from "../src";

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
});
