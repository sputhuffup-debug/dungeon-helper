/**
 * A secret synthetic (Alien: "Poses as human") keeps its true make from the
 * players by the module's own visibility rule, however it was made: ticked by
 * hand on a preset NPC, or the "Android, covert" preset. The players read the
 * cover scores as its attributes; android, skills, talents and the cover
 * itself stay GM-only; the GM's own field settings still win.
 */
import { alienModule } from "@campaign-forge/module-alien";
import { exampleModule } from "@campaign-forge/module-example";
import { loadModule } from "@campaign-forge/module-sdk";
import { fieldVisibilityOf, projectEntityForViewer, viewerSheetOf, visibilityRuleFor, type CampaignMeta, type Entity } from "@campaign-forge/core";
import { describe, expect, it } from "vitest";

const def = alienModule.entityTypes.find((t) => t.id === "alien.character")!;
const preset = (id: string) => alienModule.presets.find((p) => p.id === id)!;
const PLAYER = { role: "player" as const };

function npcFrom(presetId: string, extra: Record<string, unknown> = {}): Entity {
  const p = preset(presetId);
  return {
    id: "01LARK",
    created: "t",
    updated: "t",
    type: def.id,
    name: "Lark Venn",
    tags: [...(p.tags ?? [])],
    ...(p.summary ? { summary: p.summary } : {}),
    visibility: { level: "players" },
    fields: { ...structuredClone(p.fields), ...extra },
  };
}

const meta = { mode: "campaign", members: [] } as unknown as CampaignMeta;
const sheetText = (e: Entity) => JSON.stringify(viewerSheetOf(e, alienModule, { meta, assets: {} }, PLAYER, { entityName: () => undefined }));

describe("conditional visibility in the example module (no Alien knowledge in core)", () => {
  const hero = exampleModule.entityTypes.find((t) => t.id === "example.hero")!;
  const base: Entity = { id: "01HERO", created: "t", updated: "t", type: hero.id, name: "Wren", tags: [], visibility: { level: "players" }, fields: { attributes: { might: 5, wits: 4 }, construct: true, guise: { might: 2, wits: 2 } } };
  it("a disguised construct shows its guise as its attributes, and hides that it is a construct", () => {
    const shown = projectEntityForViewer(base, hero, PLAYER)!;
    expect(shown.fields.attributes).toEqual({ might: 5, wits: 4 });
    expect(shown.fields.construct).toBe(true);
    const disguised = projectEntityForViewer({ ...base, fields: { ...base.fields, disguised: true } }, hero, PLAYER)!;
    expect(disguised.fields.attributes).toEqual({ might: 2, wits: 2 });
    for (const f of ["construct", "guise", "disguised"]) expect(disguised.fields[f], f).toBeUndefined();
  });
  it("passes conformance with the rule", () => {
    expect(loadModule(exampleModule).report.issues).toEqual([]);
  });
});

describe("a secret synthetic, as the players see it", () => {
  it("a plain NPC shows its true scores, skills and talents", () => {
    const p = projectEntityForViewer(npcFrom("alien.npc.smuggler"), def, PLAYER)!;
    expect(p.fields.attributes).toEqual({ strength: 3, agility: 4, wits: 4, empathy: 3 });
    expect(p.fields.skills).toBeDefined();
    expect(p.fields.talents).toBeDefined();
  });

  it("ticked by hand: the cover as its attributes, nothing of the android", () => {
    const e = npcFrom("alien.npc.smuggler", { android: true, secretAndroid: true, attributes: { strength: 7, agility: 6, wits: 4, empathy: 3 }, coverAttributes: { strength: 3, agility: 4, wits: 4, empathy: 3 } });
    const p = projectEntityForViewer(e, def, PLAYER)!;
    expect(p.fields.attributes).toEqual({ strength: 3, agility: 4, wits: 4, empathy: 3 });
    for (const f of ["android", "secretAndroid", "coverAttributes", "skills", "talents"]) expect(p.fields[f], f).toBeUndefined();
    const sheet = sheetText(e);
    expect(sheet).not.toMatch(/android|synthetic|cover|Health shown/i);
    // the cover scores are on the sheet, under the plain Attributes heading
    expect(sheet).toContain("\"title\":\"Attributes\"");
    // the Field visibility list says why
    expect(fieldVisibilityOf(e, def, "android").level).toBe("gm");
    expect(visibilityRuleFor(e, def, "attributes")?.rule.reason).toMatch(/Poses as human/);
  });

  it("ticked without cover scores: the true attributes are hidden, not shown", () => {
    const p = projectEntityForViewer(npcFrom("alien.npc.smuggler", { android: true, secretAndroid: true }), def, PLAYER)!;
    expect(p.fields.attributes).toBeUndefined();
    expect(p.fields.android).toBeUndefined();
  });

  it("the Android, covert preset is a secret synthetic from the start, with human-looking cover scores", () => {
    const covert = preset("alien.npc.android-covert");
    expect(covert.fields.secretAndroid).toBe(true);
    expect(covert.tags).not.toContain("android");
    expect(covert.summary).not.toMatch(/android|synthetic/i);
    const e = npcFrom(covert.id);
    const p = projectEntityForViewer(e, def, PLAYER)!;
    expect(p.fields.attributes).toEqual({ strength: 5, agility: 5, wits: 3, empathy: 1 });
    for (const f of ["android", "secretAndroid", "coverAttributes", "skills", "talents"]) expect(p.fields[f], f).toBeUndefined();
    expect(JSON.stringify(p)).not.toMatch(/android|synthetic/i);
    // the GM still sees the true make
    expect(projectEntityForViewer(e, def, { role: "gm" })!.fields.attributes).toEqual({ strength: 7, agility: 6, wits: 3, empathy: 1 });
  });

  it("the GM can still show a field to the players by hand", () => {
    const e = { ...npcFrom("alien.npc.android-covert"), fieldVisibility: { android: { level: "players" as const } } };
    expect(projectEntityForViewer(e, def, PLAYER)!.fields.android).toBe(true);
  });
});
