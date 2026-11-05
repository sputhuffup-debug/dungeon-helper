import { describe, expect, it } from "vitest";
import { rankGroups } from "./GlobalSearch";

type Groups = Parameters<typeof rankGroups>[0];

const entity = (id: string, name: string) => ({ kind: "entity" as const, id, name, snippet: "" });
const reference = (id: string, name: string) => ({ kind: "reference" as const, id, name, entry: {} as never });
const rule = (id: string, name: string) => ({ kind: "rule" as const, id, name, card: {} as never });

describe("header search ranking", () => {
  it("puts the campaign's own records before reference items whose names match about as well", () => {
    const groups = [
      { kind: "entity", label: "Entities", hits: [entity("b", "Brackenhollow"), entity("t", "The Tipsy Lantern")] },
      { kind: "reference", label: "Reference", hits: [reference("r1", "Lantern Bearer"), reference("r2", "Lantern Archon")] },
    ] as unknown as Groups;
    const ranked = rankGroups(groups, "lantern");
    expect(ranked.map((g) => g.kind)).toEqual(["entity", "reference"]);
    // within the group, the record named for the query first (Brackenhollow only matched on its text)
    expect(ranked[0]!.hits.map((h) => h.name)).toEqual(["The Tipsy Lantern", "Brackenhollow"]);
  });

  it("still opens an exact rule before a record that only mentions the word", () => {
    const groups = [
      { kind: "entity", label: "Entities", hits: [entity("c", "Corporate security"), entity("p", "Panic room")] },
      { kind: "rule", label: "Rules", hits: [rule("panic", "Panic")] },
    ] as unknown as Groups;
    expect(rankGroups(groups, "panic")[0]!.kind).toBe("rule");
    // with nothing named for the query, the rule wins over text matches
    const textOnly = [
      { kind: "entity", label: "Entities", hits: [entity("c", "Corporate security")] },
      { kind: "rule", label: "Rules", hits: [rule("panic", "Panic roll")] },
    ] as unknown as Groups;
    expect(rankGroups(textOnly, "panic")[0]!.kind).toBe("rule");
  });
});
