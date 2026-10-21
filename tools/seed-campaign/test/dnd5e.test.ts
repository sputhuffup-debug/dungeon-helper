import { describe, expect, it } from "vitest";
import { computeFields, CORE_RELATIONSHIP_TYPES, loadModule, moduleFromPackSource, validateEntityFields, type GameModule } from "@campaign-forge/module-sdk";
import { applyImportedDocs, exportBundle, extractRefs, importBundle, RichTextRegistry, type CampaignMaps, type Entity } from "@campaign-forge/core";
import { dnd5eSrdSource } from "@campaign-forge/module-dnd5e-srd";
import { buildDnd5eDemo, dnd5eDemoJSON, DND5E_ADVENTURE_TITLE, DND5E_DEMO_NAME, DND5E_DEMO_SEED, DND5E_MODULE_ID } from "../src";

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

const byType = (maps: CampaignMaps, type: string): Entity[] => Object.values(maps.entities).filter((e) => e.type === `${DND5E_MODULE_ID}.${type}`);

describe("buildDnd5eDemo", async () => {
  // load the pack once; every build below reuses it
  const game: GameModule = await moduleFromPackSource(dnd5eSrdSource);
  const mod = loadModule(game, { skipProcedureRuns: true });
  const demo = await buildDnd5eDemo({ module: game });
  const { store, maps, docs, ids } = demo;
  const entities = Object.values(maps.entities);

  it("builds deterministically from the seed (modulo ids and timestamps)", async () => {
    const again = await buildDnd5eDemo({ module: game });
    expect(signature(again.maps, again.docs)).toEqual(signature(maps, docs));
    const other = await buildDnd5eDemo({ module: game, seed: "another-seed" });
    expect(signature(other.maps, other.docs).entities).not.toEqual(signature(maps, docs).entities);
  });

  it("loads the pack itself when no module is passed", async () => {
    const own = await buildDnd5eDemo();
    expect(signature(own.maps, own.docs)).toEqual(signature(maps, docs));
  });

  it("is a one-shot campaign with the SRD 5.1 module and its calendar", () => {
    const meta = store.meta();
    expect(meta.name).toBe(DND5E_DEMO_NAME);
    expect(meta.moduleId).toBe("dnd5e-srd");
    expect(meta.moduleVersion).toBe(game.manifest.version);
    expect(meta.mode).toBe("one-shot");
    expect(meta.calendarId).toBe(game.calendar?.id);
    expect(meta.settings["seed"]).toBe(DND5E_DEMO_SEED);
  });

  it("has four level 3 player characters whose sheets derive their numbers", () => {
    const pcs = byType(maps, "character");
    expect(pcs).toHaveLength(4);
    const def = mod.entityType(`${DND5E_MODULE_ID}.character`)!;
    for (const pc of pcs) {
      expect(pc.fields["isPC"]).toBe(true);
      expect(pc.fields["level"]).toBe(3);
      expect(pc.visibility.level).toBe("players");
      for (const key of ["class", "subclass", "race", "background", "alignment"]) expect(pc.fields[key], `${pc.name} ${key}`).toBeTruthy();
      const c = computeFields(def, pc.fields);
      expect(c["proficiencyBonus"]).toBe(2);
      // fixed-value hit points (a hill dwarf adds 1 per level)
      const hp = (pc.fields["hp"] as { max: number }).max;
      expect(hp, pc.name).toBe(Number(c["suggestedHpMax"]) + (pc.fields["subrace"] === "Hill dwarf" ? 3 : 0));
    }
    const brannoc = computeFields(def, pcs.find((p) => p.name === "Brannoc Ashby")!.fields);
    expect([brannoc["strengthMod"], brannoc["athleticsBonus"], brannoc["strengthSave"], brannoc["passivePerception"]]).toEqual([3, 5, 5, 13]);
    // expertise doubles the proficiency bonus
    const wren = computeFields(def, pcs.find((p) => p.name === "Wren Talliver")!.fields);
    expect([wren["dexterityMod"], wren["stealthBonus"], wren["acrobaticsBonus"], wren["initiative"]]).toEqual([3, 7, 5, 3]);
    const isolde = computeFields(def, pcs.find((p) => p.name === "Isolde Fairweather")!.fields);
    expect([isolde["spellSaveDc"], isolde["spellAttack"]]).toEqual([13, "+5"]);
  });

  it("has SRD monsters from the pack's presets, in scenes and encounters", () => {
    const monsters = byType(maps, "monster");
    const presets = new Set(monsters.map((m) => m.provenance?.preset));
    expect([...presets].sort()).toEqual(["dnd5e-srd.preset.bugbear", "dnd5e-srd.preset.goblin", "dnd5e-srd.preset.wolf"]);
    for (const m of monsters) {
      const preset = mod.preset(String(m.provenance?.preset))!;
      expect(m.fields, m.name).toEqual(preset.fields);
      expect(m.visibility.level).toBe("gm");
    }
    const encounters = byType(maps, "encounter");
    expect(encounters).toHaveLength(3);
    for (const e of encounters) {
      const inIt = Object.values(maps.relationships).filter((r) => r.type === "appears_in" && r.to === e.id).map((r) => maps.entities[r.from]!);
      expect(inIt.length).toBeGreaterThan(0);
      expect(e.fields["xpTotal"]).toBe(inIt.reduce((n, m) => n + Number(m.fields["xp"]), 0));
    }
    const first = maps.scenes[ids.firstScene]!;
    expect(first.title).toBe("Ambush at the toll-house");
    expect(first.participants.map((id) => maps.entities[id]!.name)).toEqual(["Goblin 1", "Goblin 2", "Wolf 1"]);
    expect(maps.entities[first.encounter!]?.fields["creatures"]).toBe("2 × Goblin (CR 1/4), 1 × Wolf (CR 1/4)");
    expect(maps.entities[ids.boss]?.provenance?.preset).toBe("dnd5e-srd.preset.bugbear");
  });

  it("has an adventure from the one-shot template, a faction, a quest and NPCs (one generated)", () => {
    const adventures = Object.values(maps.adventures);
    expect(adventures).toHaveLength(1);
    expect(adventures[0]!.title).toBe(DND5E_ADVENTURE_TITLE);
    expect(adventures[0]!.templateId).toBe("dnd5e-srd.template.one-shot");
    expect(Object.values(maps.acts)).toHaveLength(3);
    expect(Object.values(maps.scenes)).toHaveLength(5);
    expect(byType(maps, "faction")).toHaveLength(1);
    expect(byType(maps, "quest").map((q) => q.fields["status"])).toEqual(["active"]);
    expect(byType(maps, "location").map((l) => l.subtype).sort()).toEqual(["building", "building", "dungeon", "settlement", "wilderness"]);
    const npcs = byType(maps, "npc");
    expect(npcs).toHaveLength(4);
    const generated = npcs.filter((n) => n.provenance?.generatorRun);
    expect(generated).toHaveLength(1);
    expect(maps.generatorRuns[generated[0]!.provenance!.generatorRun!]?.procedure).toBe("dnd5e-srd.proc.npc");
  });

  it("has a planned session for table mode, opening on the fight, with part of its checklist done", () => {
    const sessions = Object.values(maps.sessions);
    expect(sessions).toHaveLength(1);
    const s = sessions[0]!;
    expect(s.status).toBe("planned");
    expect(s.nextPlan.length).toBeGreaterThan(0);
    expect((s as { plannedScenes?: string[] }).plannedScenes?.[0]).toBe(ids.firstScene);
    expect(Object.keys(s.checklist ?? {})).toContain("dnd5e-srd.prep.monsters");
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

  it("keeps the D&D trademark and non-SRD names out of its text", () => {
    const text = JSON.stringify({ entities, docs, scenes: maps.scenes, adventures: maps.adventures, sessions: maps.sessions });
    expect(text).not.toMatch(/D&D|Dungeons|Wizards of the Coast|Forgotten Realms|beholder|mind flayer/i);
  });

  it("round-trips through exportBundle/importBundle", async () => {
    const bytes = await exportBundle(store, demo.registry, undefined, { id: game.manifest.id, version: game.manifest.version });
    const imported = await importBundle(bytes);
    expect(imported.store.count("entities")).toBe(store.count("entities"));
    expect(imported.manifest.moduleId).toBe("dnd5e-srd");
    const registry = new RichTextRegistry();
    await applyImportedDocs(registry, imported.docs);
    const scene = maps.scenes[ids.firstScene]!;
    expect(extractRefs(registry.open(scene.bodyDoc))).toEqual(extractRefs(demo.registry.open(scene.bodyDoc)));
  });

  it("dnd5eDemoJSON returns plain JSON for the web app", async () => {
    const json = await dnd5eDemoJSON(DND5E_DEMO_SEED, game);
    expect(JSON.parse(JSON.stringify(json.maps))).toEqual(json.maps);
    expect(signature(json.maps, json.docs)).toEqual(signature(maps, docs));
  });
});
