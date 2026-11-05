/**
 * Where a character's kit lands: the life path's career gear and the
 * typical NPCs' gear matched to the gear tables, weapons on the Weapons list
 * with their stats, the rest (armor, motion trackers) as gear rows linked to
 * their preset; the Gear field's "From the gear list…" catalog; Buddy and
 * Rival as references to other PCs, with older typed names still read.
 */
import { describe, expect, it } from "vitest";
import { addCatalogItem, catalogPresets, evaluateAwards, gearCatalogConfig, gearCatalogFieldOf, loadModule, runProcedure, schemaDefaults, type CampaignSnapshot } from "@campaign-forge/module-sdk";
import alienModule, { progression } from "../src";
import { npcPresets } from "../src/data/npc-presets";
import { ALIEN_HUNT } from "../src/maps/hunt";
import { CAREER_GEAR_ITEMS, kitItem, placeKit } from "../src/entities/kit";
import { careerItems } from "../src/reference/careers";
import { buildCast } from "../src/procedures/agenda-targets";
import { characterType } from "../src/entities/character";

const lifepath = alienModule.procedures.find((p) => p.id === "alien.lifepath")!;
const lifeRun = (seed: string, inputs: Record<string, unknown> = schemaDefaults(lifepath.inputs!)) => runProcedure(lifepath, alienModule, { seed, inputs }).produced.entities[0]!.fields;
type Row = Record<string, unknown>;

describe("career gear and the gear tables", () => {
  it("maps every career gear line with a stat line to an existing item preset", () => {
    const ids = new Set(alienModule.presets.map((p) => p.id));
    for (const [line, m] of Object.entries(CAREER_GEAR_ITEMS)) expect(ids.has(`alien.item.${m.item}`), line).toBe(true);
    // the lines left plain have no row in the gear tables (toys, a briefcase, a hand radio...)
    const unmatched = careerItems.flatMap((c) => c.gear).filter((g) => !kitItem({ name: g }));
    expect([...new Set(unmatched)].sort()).toEqual(
      ["Coloring pens", "Digital video camera", "Electronic handheld game", "Hand radio", "Laser pointer", "Leather briefcase", "Personal locator beacon", "Radio-controlled car", "Yo-yo"].sort(),
    );
  });

  it("puts weapons on the Weapons list with their stats, the rest in Gear linked to the preset", () => {
    const kit = placeKit([{ name: "M4A3 Service Pistol" }, { name: "M314 Motion Tracker" }, { name: "Two G2 Electroshock Grenades" }, { name: "M3 Personnel Armor" }, { name: "Leather briefcase", weight: 1 }]);
    expect(kit.weapons.map((w) => w.name)).toEqual(["M4A3 Service Pistol", "G2 Electroshock Grenade", "G2 Electroshock Grenade"]);
    expect(kit.weapons[0]).toMatchObject({ presetId: "alien.item.m4a3-service-pistol", bonus: 2, damage: 2, range: "medium", weight: 0.5 });
    expect(kit.gear).toEqual([
      { name: "M314 Motion Tracker", weight: 1, supply: 5, qty: 1, presetId: "alien.item.motion-tracker" },
      { name: "M3 Personnel Armor", weight: 1, qty: 1, presetId: "alien.item.m3-personnel-armor" },
      { name: "Leather briefcase", weight: 1, qty: 1 },
    ]);
  });

  it("a life path's weapons land under Weapons, never in Gear", () => {
    let sawWeapon = false;
    for (let i = 0; i < 60; i++) {
      const f = lifeRun(`kit-${i}`, { terms: 3 });
      const gear = f.gear as Row[];
      const weapons = f.weapons as Row[];
      for (const g of gear) if (typeof g.presetId === "string") expect(alienModule.presets.find((p) => p.id === g.presetId)?.subtype, String(g.name)).not.toBe("weapon");
      for (const w of weapons) expect(w.presetId, String(w.name)).toMatch(/^alien\.item\./);
      sawWeapon ||= weapons.length > 0;
    }
    expect(sawWeapon).toBe(true);
    // the e2e seed: an officer with the M4A3
    expect((lifeRun("crew-2").weapons as Row[]).map((w) => w.name)).toEqual(["M4A3 Service Pistol"]);
  });

  it("the life path is offered beside + Character on the PCs tab", () => {
    expect(lifepath.createsCharacter).toEqual({ entityType: "alien.character", label: "Roll a Life Path", pc: true });
    expect(loadModule(alienModule, { skipProcedureRuns: true }).report.issues.filter((i) => i.where === "procedure:alien.lifepath" || i.message.includes("catalog"))).toEqual([]);
  });

  it("typical NPCs carry their weapons on the Weapons list, keeping the book's wording", () => {
    const marshal = npcPresets.find((p) => p.id === "alien.npc.marshal")!;
    expect((marshal.fields.weapons as Row[]).map((w) => [w.name, w.presetId])).toEqual([["Pump-action shotgun", "alien.item.armat-37a2-pump-shotgun"]]);
    expect((marshal.fields.gear as Row[]).map((g) => g.name)).toEqual(["Handcuffs", "Flashlight"]);
    for (const p of npcPresets) for (const g of p.fields.gear as Row[]) if (typeof g.presetId === "string") expect(alienModule.presets.find((x) => x.id === g.presetId)?.subtype).not.toBe("weapon");
  });

  it("a tracker stays findable for the live hunt: in Gear, by the name or the preset its sensor lists", () => {
    const sensors = ALIEN_HUNT.sensors!;
    const manager = npcPresets.find((p) => p.id === "alien.npc.colony-manager")!;
    const row = (manager.fields.gear as Row[]).find((g) => g.name === "Motion tracker")!;
    expect(row.presetId).toBe("alien.item.motion-tracker");
    expect(sensors.find((s) => s.id === "motion-tracker")!.carried.names).toContain("Motion tracker");
    const picked = placeKit([{ name: "M314 Motion Tracker" }]).gear[0]!;
    expect(sensors.find((s) => s.id === "motion-tracker")!.carried.presets).toContain(picked.presetId);
    expect(ALIEN_HUNT.gearPaths).toEqual(["gear"]);
  });
});

describe("the Gear field's gear list", () => {
  const field = gearCatalogFieldOf(characterType)!;
  const cfg = gearCatalogConfig(field)!;
  const preset = (id: string) => alienModule.presets.find((p) => p.id === `alien.item.${id}`)!;

  it("offers the portable items of the gear tables, vehicle guns and fixed installations left out", () => {
    const offered = catalogPresets(cfg, alienModule.presets).map((p) => p.id);
    expect(offered).toContain("alien.item.motion-tracker");
    expect(offered).toContain("alien.item.m4a3-service-pistol");
    expect(offered).toContain("alien.item.m3-personnel-armor");
    expect(offered).not.toContain("alien.item.20mm-gatling-gun");
    expect(offered).not.toContain("alien.item.automed");
    expect(offered).not.toContain("alien.item.mu-th-ur-6000");
  });

  it("adds a weapon to Weapons and other gear to Gear, raising the quantity of an item already there", () => {
    let fields: Record<string, unknown> = { gear: [], weapons: [] };
    const pistol = addCatalogItem(characterType, field, fields, preset("m4a3-service-pistol"));
    expect(pistol.placement).toMatchObject({ path: "weapons", routed: true });
    fields = pistol.fields;
    fields = addCatalogItem(characterType, field, fields, preset("motion-tracker")).fields;
    fields = addCatalogItem(characterType, field, fields, preset("personal-medkit")).fields;
    fields = addCatalogItem(characterType, field, fields, preset("personal-medkit")).fields;
    expect((fields.weapons as Row[]).map((w) => w.name)).toEqual(["M4A3 Service Pistol"]);
    expect(fields.gear).toEqual([
      { name: "M314 Motion Tracker", weight: 1, supply: 5, qty: 1, presetId: "alien.item.motion-tracker" },
      { name: "Personal Medkit", weight: 0.25, qty: 2, presetId: "alien.item.personal-medkit" },
    ]);
  });
});

describe("buddy and rival", () => {
  const pc = (id: string, name: string, fields: Record<string, string> = {}): CampaignSnapshot["entities"][number] => ({ id, name, type: "alien.character", kind: "character", pc: true, tags: [], fields });
  const campaign = (entities: ReturnType<typeof pc>[], relationships: CampaignSnapshot["relationships"] = []): CampaignSnapshot => ({ entities, relationships });

  it("reads the sheet's references both ways, older typed names and the relationships", () => {
    const cast = buildCast({
      campaign: campaign([pc("a", "Ada Rook", { buddy: "b" }), pc("b", "Bo Lantern"), pc("c", "Cy Varga", { rival: "dee morrow " }), pc("d", "Dee Morrow"), pc("e", "Eli Quist", { rival: "Somebody else" })], [{ type: "buddy_of", from: "e", to: "d" }]),
    });
    const m = (id: string) => cast.party.find((p) => p.id === id)!;
    expect(m("a").buddies).toEqual(["b"]);
    expect(m("b").buddies).toEqual(["a"]);
    expect(m("c").rivals).toEqual(["d"]);
    expect(m("d").rivals).toEqual(["c"]);
    expect(m("d").buddies).toEqual(["e"]);
    // a name that is nobody in the crew links nobody
    expect(m("e").rivals).toEqual([]);
  });

  it("the agenda generators ask the campaign snapshot for the sheets' buddy and rival", () => {
    for (const id of ["alien.agendas", "alien.campaign-agendas"]) {
      const proc = alienModule.procedures.find((p) => p.id === id)!;
      const hint = (proc.inputs!.properties as Record<string, { "x-campaign"?: { fields?: string[] } }>).campaign!["x-campaign"]!;
      expect(hint.fields).toEqual(expect.arrayContaining(["buddy", "rival"]));
    }
  });

  it("the XP questions see a buddy or rival picked on the sheet, or typed in an older campaign", () => {
    const qs = progression.awards!.filter((q) => q.id === "alien.award.buddy" || q.id === "alien.award.rival");
    const ctx = (fields: Record<string, unknown>) => ({ mode: "campaign" as const, character: { id: "a", name: "Ada", type: "alien.character", fields }, computed: {}, relationships: {}, trackerState: {} });
    expect(evaluateAwards(qs, ctx({ buddy: "01JAXXXXXXXXXXXXXXXXXXXXXX" })).map((r) => r.applies)).toEqual([true, false]);
    expect(evaluateAwards(qs, ctx({ rival: "Parker" })).map((r) => [r.applies, r.reason])).toEqual([[false, "No buddy set"], [true, undefined]]);
    // a PC another PC named as buddy before the pairs (the link went one way)
    expect(evaluateAwards(qs, { ...ctx({}), referencedBy: { buddy: 1 } }).map((r) => r.applies)).toEqual([true, false]);
  });

  it("the sheet's Buddy and Rival pick another PC, as pairs, on PC sheets only", () => {
    const ties = characterType.sheet.sections.find((s) => s.id === "crew-ties")!;
    expect(ties.when).toEqual({ "!!": { var: "fields.isPC" } });
    for (const path of ["buddy", "rival"]) {
      expect(ties.fields.find((f) => f.path === path)).toMatchObject({ widget: "ref", entityTypes: ["alien.character"], config: { pick: "select", pc: true }, reciprocal: true });
    }
    expect(characterType.sheet.sections.find((s) => s.id === "identity")!.fields.some((f) => f.path === "buddy" || f.path === "rival")).toBe(false);
  });
});
