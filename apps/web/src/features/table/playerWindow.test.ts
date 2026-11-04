/** Which window is the player screen: the table route with `?view=players`, or any URL in a window opened as one. */
import { describe, expect, it } from "vitest";
import { playerWindowName, playerWindowSession } from "./playerWindowName";

describe("playerWindowSession", () => {
  it("reads the session from the player view URL", () => {
    expect(playerWindowSession("/c/01CAMP/table/01SESS", { view: "players" }, "")).toBe("01SESS");
    expect(playerWindowSession("/c/01CAMP/table/01SESS/", { view: "players" }, "")).toBe("01SESS");
  });

  it("is a GM window anywhere else", () => {
    expect(playerWindowSession("/c/01CAMP/table/01SESS", {}, "")).toBeUndefined();
    expect(playerWindowSession("/c/01CAMP/home", { view: "players" }, "")).toBeUndefined();
    expect(playerWindowSession("/c/01CAMP/entities/01NPC", {}, "some-other-window")).toBeUndefined();
  });

  it("keeps a window opened as the player screen on it, wherever it is sent", () => {
    const name = playerWindowName("01SESS");
    expect(playerWindowSession("/c/01CAMP/entities/01NPC", {}, name)).toBe("01SESS");
    expect(playerWindowSession("/c/01CAMP/home", {}, name)).toBe("01SESS");
    expect(playerWindowSession("/c/01CAMP/table/01SESS", {}, name)).toBe("01SESS");
  });
});
