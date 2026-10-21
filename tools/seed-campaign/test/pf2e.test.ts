import { describe, expect, it } from "vitest";
import { computeFields, CORE_RELATIONSHIP_TYPES, createRng, loadModule, moduleFromPackSource, validateEntityFields, type GameModule } from "@campaign-forge/module-sdk";
import { applyImportedDocs, exportBundle, extractRefs, importBundle, RichTextRegistry, type CampaignMaps, type Entity } from "@campaign-forge/core";
import { pf2eOrcSource } from "@campaign-forge/module-pf2e-orc";
import { RESERVED_TERMS, termPattern } from "@campaign-forge/module-pf2e-orc/reserved";
import { buildPf2eDemo, pf2eDemoJSON, PF2E_ADVENTURE_TITLE, PF2E_DEMO_NAME, PF2E_DEMO_SEED, PF2E_MODULE_ID } from "../src";

/** The seed-dependent shape of a build: everything except ids and timestamps. */
function signature(maps: CampaignMaps, docs: Record<string, string>) {
  const nameOf = (id: string | undefined) => (id ? (maps.entities[id]?.name ?? `?${id}`) : "-");
  const unId = (s: string) => s.replace(/\[\[([^\]|]+)\|([^\]]*)\]\]/g, "[[$2]]");
  const entities = Object.values(maps.entities)
    .map((e) => JSON.stringify({ type: e.type, subtype: e.subtype, name: e.name, summary: e.summary, tags: e.tags, visibility: e.visibility.level, fields: e.fields }))
    .sort();
  const relationships = Object.values(maps.relationships)
    .map((r) => `${nameOf(r.from)} -${r.type}-> ${nameOf(r.to)}`)
    .sort();
  const scenes = Object.values(maps.scenes)
    .map((s) => JSON.stringify({ title: s.title, location: nameOf(s.location), participants: s.participants.map(nameOf), encounter: nameOf(s.encounter), events: s.events.map((e) => [e.text, e.mandatory]) }))
    .sort();
  const sessions = Object.values(maps.sessions).map((s) => JSON.stringify({ number: s.number, title: s.title, status: s.status, nextPlan: s.nextPlan, checklist: s.checklist }));
  const text = Object.values(docs).map(unId).sort();
  return { entities, relationships, scenes, sessions, text, settingsKeys: Object.keys(maps.meta.settings).sort() };
}

const byType = (maps: CampaignMaps, type: string): Entity[] => Object.values(maps.entities).filter((e) => e.type === `${PF2E_MODULE_ID}.${type}`);
const XP: Record<string, number> = { "-4": 10, "-3": 15, "-2": 20, "-1": 30, "0": 40, "1": 60, "2": 80, "3": 120, "4": 160 };
const HAZARD_XP: Record<string, number> = { "-1": 6, "0": 8, "1": 12 };

describe("buildPf2eDemo", async () => {
  // load the pack once; every build below reuses it
  const game: GameModule = await moduleFromPackSource(pf2eOrcSource);
  const mod = loadModule(game, { skipProcedureRuns: true });
  const demo = await buildPf2eDemo({ module: game });
  const { store, maps, docs, ids } = demo;
  const entities = Object.values(maps.entities);
  const pcType = mod.entityType(`${PF2E_MODULE_ID}.character`)!;
  const pc = (name: string) => computeFields(pcType, byType(maps, "character").find((p) => p.name === name)!.fields);

  it("builds deterministically from the seed (modulo ids and timestamps)", async () => {
    const again = await buildPf2eDemo({ module: game });
    expect(signature(again.maps, again.docs)).toEqual(signature(maps, docs));
    const other = await buildPf2eDemo({ module: game, seed: "another-seed" });
    expect(signature(other.maps, other.docs).entities).not.toEqual(signature(maps, docs).entities);
  });

  it("loads the pack itself when no module is passed", async () => {
    const own = await buildPf2eDemo();
    expect(signature(own.maps, own.docs)).toEqual(signature(maps, docs));
  }, 60_000);

  it("is a one-shot campaign with the ORC core rules module and its calendar", () => {
    const meta = store.meta();
    expect(meta.name).toBe(PF2E_DEMO_NAME);
    expect(meta.moduleId).toBe("pf2e-orc");
    expect(meta.moduleVersion).toBe(game.manifest.version);
    expect(meta.mode).toBe("one-shot");
    expect(meta.calendarId).toBe(game.calendar?.id);
    expect(meta.settings["seed"]).toBe(PF2E_DEMO_SEED);
  });

  it("has four level 1 characters from Player Core options whose sheets derive their numbers", () => {
    const pcs = byType(maps, "character");
    expect(pcs).toHaveLength(4);
    const lists = game.referenceLists;
    const names = (prefix: string) => new Set(lists.filter((l) => l.id.startsWith(`pf2e-orc.${prefix}`)).flatMap((l) => l.items.map((i) => i.name)));
    const feats = names("feats.");
    const spells = names("spells.");
    const items = names("equipment.");
    const heritages = names("heritages");
    const backgrounds = names("backgrounds");
    for (const p of pcs) {
      expect(p.fields["isPC"]).toBe(true);
      expect(p.fields["level"]).toBe(1);
      expect(p.visibility.level).toBe("players");
      expect(heritages.has(String(p.fields["heritage"])), `${p.name} heritage`).toBe(true);
      expect(backgrounds.has(String(p.fields["background"])), `${p.name} background`).toBe(true);
      for (const f of p.fields["feats"] as Array<{ name: string }>) expect(feats.has(f.name), `${p.name}: feat ${f.name}`).toBe(true);
      for (const s of (p.fields["spells"] as string[] | undefined) ?? []) expect(spells.has(s), `${p.name}: spell ${s}`).toBe(true);
      for (const i of p.fields["inventory"] as Array<{ name: string }>) if (!i.name.startsWith("Trinket:")) expect(items.has(i.name), `${p.name}: item ${i.name}`).toBe(true);
      // stored current HP matches the derived maximum
      const c = computeFields(pcType, p.fields);
      expect((p.fields["hp"] as { current: number }).current, p.name).toBe(c["hpMax"]);
    }
    // untrained +0; trained = level + 2; expert = level + 4
    expect(pc("Garrick Thornley")).toMatchObject({ perceptionTotal: 6, fortitudeTotal: 7, athleticsTotal: 7, ac: 18, acShieldRaised: 20, hpMax: 20, classDc: 17, initiative: 6 });
    expect(pc("Brunhild Ashdelver")).toMatchObject({ willTotal: 9, religionTotal: 7, spellDc: 17, spellAttack: "+7", ac: 17, hpMax: 20 });
    expect(pc("Sylvarien Moss")).toMatchObject({ arcanaTotal: 7, spellDc: 17, ac: 15, hpMax: 12 });
    expect(pc("Pip Tallowgrass")).toMatchObject({ stealthTotal: 7, thieveryTotal: 7, reflexTotal: 9, perceptionTotal: 6, ac: 18, hpMax: 15 });
  });

  it("rolls a sheet's skill with its total, read as four degrees", () => {
    const pip = byType(maps, "character").find((p) => p.name === "Pip Tallowgrass")!;
    const computed = computeFields(pcType, pip.fields);
    const pool = game.dice.buildPool({ attribute: 4, skill: 1, skillId: "stealth", attributeId: "dexterity", fields: pip.fields, computed, dc: 12 });
    expect(pool.modifier).toBe(computed["stealthTotal"]);
    const outcomes = new Set(Array.from({ length: 200 }, (_, i) => game.dice.roll(pool, createRng(`pip-${i}`)).outcome!.id));
    // +7 vs DC 12: 22+ is a critical success; a natural 1 (total 8) drops a failure to a critical failure
    expect(outcomes).toEqual(new Set(["critical-success", "success", "failure", "critical-failure"]));
  });

  it("has Monster Core creatures and a GM Core hazard from the presets, in encounters budgeted by GM Core's XP", () => {
    const creatures = byType(maps, "creature");
    const presets = new Set(creatures.map((m) => m.provenance?.preset));
    expect([...presets].sort()).toEqual(["pf2e-orc.preset.giant-centipede", "pf2e-orc.preset.kobold-cavern-mage", "pf2e-orc.preset.kobold-warrior", "pf2e-orc.preset.xulgath-leader", "pf2e-orc.preset.xulgath-warrior"]);
    for (const m of [...creatures, ...byType(maps, "hazard")]) {
      const preset = mod.preset(String(m.provenance?.preset))!;
      expect(m.fields, m.name).toEqual(preset.fields);
      expect(m.visibility.level).toBe("gm");
    }
    expect(maps.entities[ids.hazard]?.provenance?.preset).toBe("pf2e-orc.preset.hazard.hidden-pit");
    const encounters = byType(maps, "encounter");
    expect(encounters.map((e) => e.fields["threat"]).sort()).toEqual(["low", "low", "severe"]);
    const encounterType = mod.entityType(`${PF2E_MODULE_ID}.encounter`)!;
    for (const e of encounters) {
      const inIt = Object.values(maps.relationships).filter((r) => r.type === "appears_in" && r.to === e.id).map((r) => maps.entities[r.from]!);
      expect(inIt.length).toBeGreaterThan(0);
      const xp = inIt.reduce((n, m) => n + (m.type.endsWith(".hazard") ? HAZARD_XP : XP)[String(Number(m.fields["level"]) - 1)]!, 0);
      expect(e.fields["xpTotal"], e.name).toBe(xp);
      expect(Number(e.fields["xpTotal"])).toBeLessThanOrEqual(Number(computeFields(encounterType, e.fields)["xpBudget"]));
    }
    const first = maps.scenes[ids.firstScene]!;
    expect(first.title).toBe("Oil thieves at the mill");
    expect(first.participants.map((id) => maps.entities[id]!.name)).toEqual(["Kobold Warrior 1", "Kobold Warrior 2", "Kobold Warrior 3"]);
    expect(maps.entities[first.encounter!]?.fields["creatures"]).toBe("3 × Kobold Warrior (level -1, 20 XP each)");
    expect(maps.entities[ids.boss]?.provenance?.preset).toBe("pf2e-orc.preset.xulgath-leader");
  });

  it("has an adventure from the one-shot template, factions, a quest and NPCs (one generated)", () => {
    const adventures = Object.values(maps.adventures);
    expect(adventures).toHaveLength(1);
    expect(adventures[0]!.title).toBe(PF2E_ADVENTURE_TITLE);
    expect(adventures[0]!.templateId).toBe("pf2e-orc.template.one-shot");
    expect(Object.values(maps.acts)).toHaveLength(3);
    expect(Object.values(maps.scenes)).toHaveLength(5);
    expect(byType(maps, "faction")).toHaveLength(2);
    expect(byType(maps, "quest").map((q) => q.fields["status"])).toEqual(["active"]);
    expect(byType(maps, "location").map((l) => l.subtype).sort()).toEqual(["building", "building", "dungeon", "dungeon", "settlement"]);
    const npcs = byType(maps, "npc");
    expect(npcs).toHaveLength(3);
    const generated = npcs.filter((n) => n.provenance?.generatorRun);
    expect(generated).toHaveLength(1);
    expect(maps.generatorRuns[generated[0]!.provenance!.generatorRun!]?.procedure).toBe("pf2e-orc.proc.npc");
  });

  it("has a planned session for table mode, opening on the fight, with part of its checklist done", () => {
    const sessions = Object.values(maps.sessions);
    expect(sessions).toHaveLength(1);
    const s = sessions[0]!;
    expect(s.status).toBe("planned");
    expect(s.nextPlan.length).toBeGreaterThan(0);
    expect((s as { plannedScenes?: string[] }).plannedScenes?.[0]).toBe(ids.firstScene);
    expect(Object.keys(s.checklist ?? {})).toContain("pf2e-orc.prep.encounters");
  });

  it("produces entities whose fields validate against their module schema", () => {
    const problems: string[] = [];
    for (const e of entities) {
      const def = mod.entityType(e.type);
      if (!def) {
        problems.push(`${e.name}: unknown type ${e.type}`);
        continue;
      }
      for (const err of validateEntityFields(def, e.fields).errors) problems.push(`${e.type} ${e.name}: ${err.path} ${err.message}`);
      if (e.subtype) expect(def.subtypes?.some((st) => st.id === e.subtype), `${e.name} subtype`).toBe(true);
    }
    expect(problems).toEqual([]);
  });

  it("uses only relationship types the module knows, with no dangling ends", () => {
    const known = new Set([...CORE_RELATIONSHIP_TYPES, ...game.relationshipTypes].map((t) => t.id));
    for (const r of Object.values(maps.relationships)) {
      expect(known.has(r.type), r.type).toBe(true);
      expect(maps.entities[r.from], `${r.type} from`).toBeDefined();
      expect(maps.entities[r.to], `${r.type} to`).toBeDefined();
    }
    for (const s of Object.values(maps.scenes)) for (const p of [s.location, s.encounter, ...s.participants]) if (p) expect(maps.entities[p]).toBeDefined();
  });

  it("resolves every [[id|name]] reference in the docs to an entity", () => {
    let n = 0;
    for (const md of Object.values(docs))
      for (const [, refId, label] of md.matchAll(/\[\[([^\]|]+)\|([^\]]*)\]\]/g)) {
        n++;
        expect(maps.entities[refId!], refId).toBeDefined();
        expect(label).toBe(maps.entities[refId!]!.name);
      }
    expect(n).toBeGreaterThan(10);
    for (const s of Object.values(maps.scenes)) for (const refId of extractRefs(demo.registry.open(s.bodyDoc))) expect(maps.entities[refId]).toBeDefined();
  });

  it("keeps the trademark and every Reserved Material name on the pack's denylist out of its text", () => {
    const text = JSON.stringify({ entities, docs, scenes: maps.scenes, adventures: maps.adventures, sessions: maps.sessions, timeline: maps.timeline, handouts: maps.handouts, meta: maps.meta });
    expect(text).not.toMatch(/Pathfinder|Paizo/);
    for (const term of RESERVED_TERMS) expect(termPattern(term, "").test(text), `demo text contains "${term}"`).toBe(false);
  });

  it("round-trips through exportBundle/importBundle", async () => {
    const bytes = await exportBundle(store, demo.registry, undefined, { id: game.manifest.id, version: game.manifest.version });
    const imported = await importBundle(bytes);
    expect(imported.store.count("entities")).toBe(store.count("entities"));
    expect(imported.manifest.moduleId).toBe("pf2e-orc");
    const registry = new RichTextRegistry();
    await applyImportedDocs(registry, imported.docs);
    const scene = maps.scenes[ids.firstScene]!;
    expect(extractRefs(registry.open(scene.bodyDoc))).toEqual(extractRefs(demo.registry.open(scene.bodyDoc)));
  });

  it("pf2eDemoJSON returns plain JSON for the web app", async () => {
    const json = await pf2eDemoJSON(PF2E_DEMO_SEED, game);
    expect(JSON.parse(JSON.stringify(json.maps))).toEqual(json.maps);
    expect(signature(json.maps, json.docs)).toEqual(signature(maps, docs));
  });
});
