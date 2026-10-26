import { describe, expect, it } from "vitest";
import { lifecycleState, validateEntityFields } from "@campaign-forge/module-sdk";
import {
  applyImportedDocs,
  CAMPAIGN_TRACKER_PREFIX,
  checklistProgress,
  checklistTotals,
  exportBundle,
  getCampaignTrackerState,
  importBundle,
  liveOf,
  moduleChecklistItems,
  RichTextRegistry,
  sessionChecklist,
  type CampaignMaps,
} from "@campaign-forge/core";
import { alienModule, cinematicBuilder, GESTATION_TRACKER, MAP_GENERATOR_ID, pcCreationIssues } from "@campaign-forge/module-alien";
import { buildCinematicDemo, cinematicDemoJSON, CINEMATIC_ADVENTURE_TITLE, CINEMATIC_DEMO_NAME, CINEMATIC_DEMO_SEED } from "../src";

/** The seed-dependent shape of a build: everything except ids and timestamps. */
function signature(maps: CampaignMaps, docs: Record<string, string>) {
  const nameOf = (id: string | undefined) => (id ? (maps.entities[id]?.name ?? maps.maps[id]?.name ?? `?${id}`) : "-");
  const unId = (s: string) => s.replace(/\[\[([^\]|]+)\|([^\]]*)\]\]/g, "[[$2]]");
  const entities = Object.values(maps.entities)
    .map((e) => JSON.stringify({ type: e.type, subtype: e.subtype, name: e.name, summary: e.summary, tags: e.tags, visibility: e.visibility.level, fields: e.fields, conditions: (e.conditions ?? []).map((c) => c.id) }))
    .sort();
  const relationships = Object.values(maps.relationships)
    .map((r) => `${nameOf(r.from)} -${r.type}-> ${nameOf(r.to)}`)
    .sort();
  const scenes = Object.values(maps.scenes)
    .map((s) => JSON.stringify({ title: s.title, location: nameOf(s.location), map: nameOf(s.map), participants: s.participants.map(nameOf), tags: s.tags, events: s.events.map((e) => [e.text, e.mandatory]), aimedAt: nameOf(String(s.fields?.["aimedAt"])), trigger: s.fields?.["trigger"] }))
    .sort();
  const adventures = Object.values(maps.adventures).map((a) => {
    const fields = { ...(a.fields ?? {}) };
    fields["signOffs"] = Object.fromEntries(Object.entries((fields["signOffs"] ?? {}) as Record<string, string>).map(([k, v]) => [nameOf(k), v]));
    return JSON.stringify({ title: a.title, premise: a.premise, builderId: a.builderId, templateId: a.templateId, fields, cast: Object.fromEntries(Object.entries(a.cast ?? {}).map(([r, ids]) => [r, ids.map(nameOf)])) });
  });
  const siteMaps = Object.values(maps.maps).map((m) => {
    const live = liveOf(m);
    return JSON.stringify({
      name: m.name,
      location: nameOf(m.location),
      layout: m.layout,
      generator: m.generator,
      live: { act: live.act, revealed: live.revealed, borders: live.borders, tokens: live.tokens.map((t) => [t.label, t.zone, nameOf(t.entity)]), pings: live.pings },
    });
  });
  const sessions = Object.values(maps.sessions)
    .map((s) => JSON.stringify({ number: s.number, title: s.title, status: s.status, summary: s.summary, nextPlan: s.nextPlan, checklist: s.checklist }))
    .sort();
  const lifecycles = lifecycleState(maps.meta.settings[`${CAMPAIGN_TRACKER_PREFIX}${GESTATION_TRACKER}`]).instances.map((i) =>
    JSON.stringify({ variant: i.variant, stage: i.stage, hostName: i.hostName, source: nameOf(i.source), pace: i.pace, duration: i.duration, progress: i.progress, seed: i.seed }),
  );
  const text = Object.values(docs).map(unId).sort();
  return { entities, relationships, scenes, adventures, siteMaps, sessions, lifecycles, text, settingsKeys: Object.keys(maps.meta.settings).sort() };
}

describe("buildCinematicDemo", () => {
  const demo = buildCinematicDemo();
  const { store, maps, docs, ids, review } = demo;
  const entities = Object.values(maps.entities);
  const adventure = maps.adventures[ids.adventure]!;
  const map = maps.maps[ids.map]!;

  it("is a cinematic-mode Alien campaign", () => {
    const meta = store.meta();
    expect(meta.name).toBe(CINEMATIC_DEMO_NAME);
    expect(meta.moduleId).toBe("alien");
    expect(meta.moduleVersion).toBe(alienModule.manifest.version);
    expect(meta.mode).toBe("cinematic");
    expect(meta.settings["seed"]).toBe(CINEMATIC_DEMO_SEED);
  });

  it("builds the adventure with the guided cinematic builder's structure", () => {
    expect(adventure.title).toBe(CINEMATIC_ADVENTURE_TITLE);
    expect(adventure.builderId).toBe(cinematicBuilder.id);
    expect(adventure.templateId).toBe(cinematicBuilder.templateId);
    expect(Object.keys(adventure.cast ?? {}).sort()).toEqual(cinematicBuilder.cast.map((r) => r.id).sort());
    expect(adventure.cast?.["pcs"]).toHaveLength(4);
    expect(adventure.cast?.["npcs"]).toHaveLength(3);
    expect(adventure.cast?.["locations"]).toHaveLength(4);
    const f = adventure.fields ?? {};
    for (const k of ["tagline", "year", "theme", "targetHours", "contentNote", "truthTie", "threats", "zoneOrder", "countdown", "openingNarration"]) expect(f[k], k).toBeTruthy();
    expect(Object.keys(f["signOffs"] as object).sort()).toEqual([...(adventure.cast?.["pcs"] ?? [])].sort());
    expect(adventure.acts).toHaveLength(3);
    for (const actId of adventure.acts) {
      const act = maps.acts[actId]!;
      expect(act.title).toBeTruthy();
      expect(act.goal).toBeTruthy();
      expect(act.scenes.length).toBeGreaterThanOrEqual(3);
      // every PC has an agenda handout for the act, revealed to that player only
      const agendas = Object.values(maps.handouts).filter((h) => h.kind === "agenda" && h.attachedTo?.kind === "act" && h.attachedTo.id === actId);
      expect(agendas.map((h) => h.character).sort()).toEqual([...(adventure.cast?.["pcs"] ?? [])].sort());
      for (const h of agendas) expect(docs[h.bodyDoc!]?.trim()).toBeTruthy();
    }
    for (const id of [adventure.playerIntroDoc, adventure.gmSituationDoc, adventure.epilogueDoc]) expect(docs[id!]?.trim()).toBeTruthy();
  });

  it("passes the builder's review with nothing to fix and no warnings", () => {
    expect(review.summary.bad).toBe(0);
    expect(review.items.filter((i) => i.level !== "ok").map((i) => i.message)).toEqual([]);
    expect(review.summary.ok).toBeGreaterThan(10);
  });

  it("has pregenerated PCs that follow the creation rules, with full sheets", () => {
    const pcs = (adventure.cast?.["pcs"] ?? []).map((id) => maps.entities[id]!);
    for (const pc of pcs) {
      expect(pc.fields["isPC"]).toBe(true);
      expect(pc.visibility.level).toBe("players");
      expect(pcCreationIssues({ name: pc.name, fields: pc.fields })).toEqual([]);
      for (const k of ["career", "signatureItem", "background", "appearance"]) expect(pc.fields[k], `${pc.name} ${k}`).toBeTruthy();
      expect((pc.fields["talents"] as unknown[]).length).toBe(1);
      // two career gear picks; a weapon among them is on the Weapons list, besides the weapons the PC brings
      expect((pc.fields["gear"] as unknown[]).length).toBeLessThanOrEqual(2);
      expect((pc.fields["weapons"] as unknown[]).length).toBeGreaterThanOrEqual(1);
    }
  });

  it("has a secret synthetic among the crew NPCs", () => {
    const npcs = (adventure.cast?.["npcs"] ?? []).map((id) => maps.entities[id]!);
    const synth = npcs.find((n) => n.fields["secretAndroid"] === true);
    expect(synth?.fields["android"]).toBe(true);
    expect((synth?.fields["fairClues"] as string[]).length).toBeGreaterThanOrEqual(2);
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

  it("generates the site map from the adventure, with no failed block checks", () => {
    expect(map.generator?.id).toBe(MAP_GENERATOR_ID);
    expect(map.generator?.seed).toBe(CINEMATIC_DEMO_SEED);
    expect(map.adventure).toBe(adventure.id);
    expect(map.location).toBe(ids.station);
    const layout = map.layout!;
    expect(layout.zones.length).toBeGreaterThan(10);
    expect(layout.checks.filter((c) => c.level === "block" && !c.ok)).toEqual([]);
    // the brief came from the adventure: its locations are the key rooms, its puzzles the puzzles
    const inputs = map.generator!.inputs;
    expect((inputs["key_rooms"] as Array<{ name: string }>).map((k) => k.name)).toEqual((adventure.cast?.["locations"] ?? []).map((id) => maps.entities[id]!.name));
    expect(inputs["puzzles"]).toHaveLength(4);
    expect(inputs["site_type"]).toBe("research_lab");
    const keyNames = layout.zones.filter((z) => z.key).map((z) => z.name);
    for (const id of adventure.cast?.["locations"] ?? []) expect(keyNames).toContain(maps.entities[id]!.name);
  });

  it("links the map to every scene, so table mode shows it", () => {
    const scenes = adventure.acts.flatMap((a) => maps.acts[a]!.scenes.map((s) => maps.scenes[s]!));
    expect(scenes.length).toBeGreaterThanOrEqual(9);
    for (const s of scenes) expect(s.map).toBe(map.id);
  });

  it("sets live state for session 1: act 1, revealed start and corridor, a locked door, PC tokens, a ping", () => {
    const layout = map.layout!;
    const live = liveOf(map);
    expect(live.act).toBe(1);
    expect(live.revealed[0]).toBe(layout.start);
    expect(live.revealed).toHaveLength(2);
    const zone = (id: string) => layout.zones.find((z) => z.id === id)!;
    for (const id of live.revealed) {
      // nothing on a duct sheet is revealed
      const deck = layout.decks.find((d) => d.id === zone(id).deck);
      expect(deck?.layer ?? "floor").toBe("floor");
      expect(zone(id).layer ?? "floor").toBe("floor");
    }
    const locked = Object.entries(live.borders).filter(([, o]) => o.locked);
    expect(locked).toHaveLength(1);
    expect(layout.borders.find((b) => b.id === locked[0]![0])?.kind).toBe("door");
    const pcs = adventure.cast?.["pcs"] ?? [];
    expect(live.tokens.map((t) => t.entity).sort()).toEqual([...pcs].sort());
    for (const t of live.tokens) expect(t.zone).toBe(layout.start);
    expect(live.pings).toHaveLength(1);
  });

  it("has a facehugger attached to an NPC: a running life cycle on the campaign tracker", () => {
    const state = lifecycleState(getCampaignTrackerState(store, GESTATION_TRACKER));
    expect(state.instances).toHaveLength(1);
    const inst = state.instances[0]!;
    expect(inst.host).toBe(ids.host);
    expect(inst.source).toBe(ids.facehugger);
    expect(inst.stage).toBe("facehugged");
    expect(inst.ended).toBeUndefined();
    const host = maps.entities[ids.host]!;
    expect(host.fields["isPC"]).toBe(false);
    expect(host.conditions?.map((c) => c.id)).toContain("xx121:facehugged");
    expect(maps.entities[ids.facehugger]?.provenance?.preset).toBe("alien.creature.xx121-facehugger");
  });

  it("has session 0 done with its checklist ticked and session 1 planned with part of it", () => {
    const items = sessionChecklist(maps.meta, moduleChecklistItems(alienModule.templates, "alien"));
    const zero = maps.sessions[ids.sessionZero]!;
    expect(zero.status).toBe("done");
    expect(zero.number).toBe(0);
    const zeroTotals = checklistTotals(checklistProgress(items, zero));
    expect(zeroTotals.done).toBe(zeroTotals.total);
    const one = maps.sessions[ids.session]!;
    expect(one.status).toBe("planned");
    expect(one.number).toBe(1);
    expect(one.nextPlan.length).toBeGreaterThan(0);
    const prep = checklistProgress(items, one).prep;
    expect(prep.done).toBeGreaterThan(0);
    expect(prep.done).toBeLessThan(prep.total);
    expect(one.checklist?.["prep.scenes"]).toBe(true);
    expect((one as { plannedScenes?: string[] }).plannedScenes?.length).toBe(Object.keys(maps.scenes).length);
  });

  it("has no dangling references", () => {
    for (const r of Object.values(maps.relationships)) {
      expect(maps.entities[r.from], `${r.type} from`).toBeDefined();
      expect(maps.entities[r.to], `${r.type} to`).toBeDefined();
    }
    for (const s of Object.values(maps.scenes)) {
      if (s.location) expect(maps.entities[s.location]).toBeDefined();
      for (const p of s.participants) expect(maps.entities[p]).toBeDefined();
      const aimed = s.fields?.["aimedAt"];
      if (aimed !== "everyone") expect(maps.entities[String(aimed)]).toBeDefined();
    }
    for (const role of Object.values(adventure.cast ?? {})) for (const id of role) expect(maps.entities[id]).toBeDefined();
    for (const md of Object.values(docs)) for (const [, refId] of md.matchAll(/\[\[([^\]|]+)(\|[^\]]*)?\]\]/g)) expect(maps.entities[refId!]).toBeDefined();
  });

  it("builds deterministically from the seed (modulo ids and timestamps)", () => {
    const again = buildCinematicDemo();
    expect(signature(again.maps, again.docs)).toEqual(signature(maps, docs));
    const other = buildCinematicDemo({ seed: "another-harbor" });
    const a = signature(other.maps, other.docs);
    const b = signature(maps, docs);
    expect(a.entities).not.toEqual(b.entities);
    expect(a.siteMaps).not.toEqual(b.siteMaps);
  });

  it("round-trips through exportBundle/importBundle", async () => {
    const bytes = await exportBundle(store, demo.registry, undefined, { id: alienModule.manifest.id, version: alienModule.manifest.version });
    const imported = await importBundle(bytes);
    expect(imported.store.count("entities")).toBe(store.count("entities"));
    expect(imported.store.get("maps", ids.map)?.live?.tokens).toHaveLength(4);
    const registry = new RichTextRegistry();
    await applyImportedDocs(registry, imported.docs);
    expect(imported.docs.size).toBe(Object.keys(docs).length);
  });
});

describe("cinematicDemoJSON", () => {
  it("returns plain JSON maps and Markdown docs for the web app", () => {
    const { maps, docs } = cinematicDemoJSON();
    expect(JSON.parse(JSON.stringify(maps))).toEqual(maps);
    expect(maps.meta.name).toBe(CINEMATIC_DEMO_NAME);
    expect(Object.keys(docs).length).toBeGreaterThan(0);
  });

  it("builds for other seeds with the same structure and passing block checks", () => {
    for (let i = 0; i < 4; i++) {
      const { maps, review } = buildCinematicDemo({ seed: `harbor-${i}` });
      expect(review.summary.bad).toBe(0);
      const map = Object.values(maps.maps)[0]!;
      expect(map.layout?.checks.filter((c) => c.level === "block" && !c.ok)).toEqual([]);
      expect(liveOf(map).tokens).toHaveLength(4);
    }
  });
});
