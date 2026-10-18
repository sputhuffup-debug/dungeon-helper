import { describe, expect, it } from "vitest";
import { validateEntityFields } from "@campaign-forge/module-sdk";
import { applyImportedDocs, exportBundle, extractRefs, importBundle, RichTextRegistry, type CampaignMaps, type Entity } from "@campaign-forge/core";
import { alienModule } from "@campaign-forge/module-alien";
import { buildDemoCampaign, demoCampaignJSON } from "../src";

/** The seed-dependent shape of a build: everything except ids and timestamps. */
function signature(maps: CampaignMaps) {
  const nameOf = (id: string) => maps.entities[id]?.name ?? `?${id}`;
  const entities = Object.values(maps.entities)
    .map((e) => JSON.stringify({ type: e.type, subtype: e.subtype, name: e.name, summary: e.summary, tags: e.tags, visibility: e.visibility.level, fields: e.fields }))
    .sort();
  const relationships = Object.values(maps.relationships)
    .map((r) => `${nameOf(r.from)} -${r.type}-> ${nameOf(r.to)}`)
    .sort();
  const scenes = Object.values(maps.scenes)
    .map((s) => `${s.title} @ ${s.location ? nameOf(s.location) : "-"}`)
    .sort();
  return { entities, relationships, scenes, settingsKeys: Object.keys(maps.meta.settings).sort() };
}

const job = (maps: CampaignMaps): Entity => {
  const jobs = Object.values(maps.entities).filter((e) => e.type === "alien.job");
  expect(jobs).toHaveLength(1);
  return jobs[0]!;
};

describe("buildDemoCampaign", () => {
  const demo = buildDemoCampaign();
  const { store, maps, docs } = demo;
  const entities = Object.values(maps.entities);

  it("builds deterministically from the seed (modulo ids and timestamps)", () => {
    const again = buildDemoCampaign();
    expect(signature(again.maps)).toEqual(signature(maps));
    expect(job(again.maps).fields).toEqual(job(maps).fields);
    expect(job(again.maps).name).toBe(job(maps).name);
    const other = buildDemoCampaign({ seed: "another-seed" });
    expect(signature(other.maps).entities).not.toEqual(signature(maps).entities);
  });

  it("is a campaign-mode Alien campaign with the space-truckers frame", () => {
    const meta = store.meta();
    expect(meta.name).toBe("Skyfire Down");
    expect(meta.moduleId).toBe("alien");
    expect(meta.moduleVersion).toBe(alienModule.manifest.version);
    expect(meta.mode).toBe("campaign");
    expect(meta.calendarId).toBe(alienModule.calendar.id);
    expect(meta.settings["frame"]).toBe("space-truckers");
    expect(maps.entities[String(meta.settings["homeBase"])]?.type).toBe("alien.location");
    expect(alienModule.presets.some((p) => p.id === meta.settings["shipPresetId"] && p.entityType === "alien.spaceship")).toBe(true);
  });

  it("has the expected counts", () => {
    const pcs = entities.filter((e) => e.type === "alien.character" && e.fields["isPC"] === true);
    expect(pcs).toHaveLength(4);
    for (const pc of pcs) {
      expect(pc.visibility.level).toBe("players");
      expect(pc.provenance?.generatorRun).toBeTruthy();
      expect(pc.provenance?.editedFields).toContain("name");
    }
    expect(new Set(pcs.map((p) => p.name)).size).toBe(4);
    expect(entities.filter((e) => e.type === "alien.character" && e.fields["isPC"] !== true).length).toBeGreaterThanOrEqual(6);
    expect(job(maps).fields["status"]).toBe("offered");
    expect(job(maps).fields["frame"]).toBe("space-truckers");
    expect(entities.filter((e) => e.type === "alien.location" && e.subtype === "planet").length).toBeGreaterThanOrEqual(1);
    expect(entities.filter((e) => e.type === "alien.spaceship")).toHaveLength(1);
    expect(entities.filter((e) => e.type === "alien.creature")).toHaveLength(2);
    expect(entities.some((e) => e.provenance?.preset === "alien.faction.weyland-yutani")).toBe(true);
    const adventures = Object.values(maps.adventures);
    expect(adventures).toHaveLength(1);
    expect(adventures[0]!.acts.length).toBeGreaterThanOrEqual(2);
    expect(Object.keys(maps.scenes).length).toBeGreaterThanOrEqual(2);
    expect(Object.values(maps.handouts).filter((h) => h.kind === "agenda" && h.visibility.level === "some_players")).toHaveLength(4);
    expect(Object.keys(maps.timeline)).toHaveLength(2);
    const sessions = Object.values(maps.sessions);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.nextPlan.length).toBeGreaterThan(0);
    expect(Object.values(maps.notes).filter((n) => n.attachedTo?.kind === "campaign" && n.attachedTo.id === maps.meta.id)).toHaveLength(1);
  });

  it("links the crew to the ship and every handout to a PC", () => {
    const ship = entities.find((e) => e.type === "alien.spaceship")!;
    const crew = Object.values(maps.relationships).filter((r) => r.type === "crew_of" && r.to === ship.id);
    expect(crew).toHaveLength(4);
    for (const h of Object.values(maps.handouts)) expect(maps.entities[h.character ?? ""]?.fields["isPC"]).toBe(true);
  });

  it("has no dangling relationship endpoints or record references", () => {
    for (const r of Object.values(maps.relationships)) {
      expect(maps.entities[r.from], `${r.type} from ${r.from}`).toBeDefined();
      expect(maps.entities[r.to], `${r.type} to ${r.to}`).toBeDefined();
    }
    for (const s of Object.values(maps.scenes)) {
      if (s.location) expect(maps.entities[s.location]).toBeDefined();
      for (const p of s.participants) expect(maps.entities[p]).toBeDefined();
    }
    for (const run of Object.values(maps.generatorRuns)) for (const id of run.produced) expect(maps.entities[id]).toBeDefined();
  });

  it("resolves every [[id|name]] reference in scene bodies (and every other doc) to an entity", () => {
    const sceneDocs = Object.values(maps.scenes).map((s) => s.bodyDoc);
    let sceneRefs = 0;
    for (const id of sceneDocs) {
      const md = docs[id];
      expect(md, `scene doc ${id}`).toBeTruthy();
      const refs = [...md!.matchAll(/\[\[([^\]|]+)\|([^\]]*)\]\]/g)];
      sceneRefs += refs.length;
      for (const [, refId, label] of refs) {
        expect(maps.entities[refId!], `ref ${refId} in scene doc`).toBeDefined();
        expect(label).toBe(maps.entities[refId!]!.name);
      }
      for (const refId of extractRefs(demo.registry.open(id))) expect(maps.entities[refId]).toBeDefined();
    }
    expect(sceneRefs).toBeGreaterThan(0);
    for (const md of Object.values(docs)) for (const [, refId] of md.matchAll(/\[\[([^\]|]+)(\|[^\]]*)?\]\]/g)) expect(maps.entities[refId!]).toBeDefined();
  });

  it("produces entities whose fields validate against their module schema", () => {
    const problems: string[] = [];
    for (const e of entities) {
      const def = alienModule.entityTypes.find((t) => t.id === e.type);
      if (!def) {
        problems.push(`${e.name}: unknown type ${e.type}`);
        continue;
      }
      for (const err of validateEntityFields(def, e.fields).errors) problems.push(`${e.type} ${e.name}: ${err.path} ${err.message}`);
    }
    expect(problems).toEqual([]);
  });

  it("round-trips through exportBundle/importBundle", async () => {
    const bytes = await exportBundle(store, demo.registry, undefined, { id: alienModule.manifest.id, version: alienModule.manifest.version });
    expect(bytes.byteLength).toBeGreaterThan(0);
    const imported = await importBundle(bytes);
    expect(imported.store.count("entities")).toBe(store.count("entities"));
    expect(imported.store.count("relationships")).toBe(store.count("relationships"));
    expect(imported.manifest.moduleId).toBe("alien");
    expect(imported.docs.size).toBe(Object.keys(docs).length);
    const registry = new RichTextRegistry();
    await applyImportedDocs(registry, imported.docs);
    const scene = Object.values(maps.scenes)[0]!;
    expect(extractRefs(registry.open(scene.bodyDoc))).toEqual(extractRefs(demo.registry.open(scene.bodyDoc)));
  });
});

describe("demoCampaignJSON", () => {
  it("returns plain JSON maps and Markdown docs for the web app", () => {
    const { maps, docs } = demoCampaignJSON("skyfire-down");
    expect(JSON.parse(JSON.stringify(maps))).toEqual(maps);
    expect(maps.meta.name).toBe("Skyfire Down");
    expect(Object.keys(docs).length).toBeGreaterThan(0);
    expect(signature(maps)).toEqual(signature(buildDemoCampaign({ seed: "skyfire-down" }).maps));
  });
});

describe("other seeds", () => {
  it("builds for a range of seeds with the same structure", () => {
    for (let i = 0; i < 10; i++) {
      const { maps } = buildDemoCampaign({ seed: `seed-${i}` });
      const entities = Object.values(maps.entities);
      expect(entities.filter((e) => e.fields["isPC"] === true)).toHaveLength(4);
      expect(entities.filter((e) => e.type === "alien.job")).toHaveLength(1);
      expect(entities.some((e) => e.subtype === "planet")).toBe(true);
      for (const r of Object.values(maps.relationships)) expect(maps.entities[r.from] && maps.entities[r.to]).toBeTruthy();
    }
  });
});
