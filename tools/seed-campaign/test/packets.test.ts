/**
 * Player packets on every demo: each player's packet holds their own
 * material and the group's, and a secret scan finds nothing GM-only and
 * nothing another player has alone (texts of hidden fields and records,
 * links to hidden entities, GM-only image ids, GM map notes and fogged zone
 * names, the GM's contact notes).
 */
import { describe, expect, it } from "vitest";
import { loadModule, moduleFromPackSource, type GameModule } from "@campaign-forge/module-sdk";
import {
  CampaignStore,
  LONG_AGENDA_PURPOSE,
  addPlayer,
  longAgendaDefOf,
  memberViewer,
  playerMembers,
  playerPacketSnapshot,
  projectCampaignForViewer,
  shareMapOf,
  stringLeaves,
  type CampaignMaps,
  type Id,
  type PacketModule,
  type PlayerPacket,
  type RichTextRegistry,
  type Viewer,
} from "@campaign-forge/core";
import { alienModule, CAMPAIGN_AGENDA_DEF } from "@campaign-forge/module-alien";
import { pf2eOrcSource } from "@campaign-forge/module-pf2e-orc";
import { buildCinematicDemo, buildDemoCampaign, buildDnd5eDemo, buildPf2eDemo, dnd5eDemoModule, DEMO_PLAYERS, DEMO_PRIVATE_HANDOUT } from "../src";

const AT = "2026-11-07T19:00:00.000Z";

/** Markdown as plain sentences: references by their label, marks dropped. */
function plain(md: string): string[] {
  return md
    .replace(/\[\[[^\]|]+\|([^\]]*)\]\]/g, "$1")
    .replace(/[*_>#`]/g, " ")
    .split(/\n+|(?<=[.!?:])\s+/)
    .map((s) => s.replace(/\s+/g, " ").replace(/^[-\d.)\s]+/, "").trim())
    .filter((s) => s.length >= 20);
}

interface Forbidden {
  strings: string[];
  ids: string[];
}

/**
 * Everything the viewer may not see: the hidden part of every record, as
 * sentences of 20 characters or more that appear nowhere the viewer may look
 * (so a phrase the GM also put in a shared handout does not count), plus the
 * ids of hidden entities, handouts, notes and images.
 */
function forbiddenFor(maps: CampaignMaps, module: PacketModule, viewer: Viewer, docs: Record<Id, string>, sceneId: Id | undefined): Forbidden {
  const proj = projectCampaignForViewer(maps, module, viewer);
  const visibleDocs = Object.values(proj.handouts).flatMap((h) => (h.bodyDoc ? plain(docs[h.bodyDoc] ?? "") : []));
  // the player-facing texts of the GM structures (the scene's read-aloud, the adventure's player intro), the scene's map as fogged for players, and the module's own wording
  const scene = sceneId ? maps.scenes[sceneId] : undefined;
  const adventure = scene?.act ? maps.adventures[maps.acts[scene.act]?.adventure ?? ""] : undefined;
  const sceneMap = scene?.map ? maps.maps[scene.map] : undefined;
  const playerFacing = [
    scene?.title ?? "",
    scene?.readAloudDoc ? docs[scene.readAloudDoc] : "",
    adventure?.playerIntroDoc ? docs[adventure.playerIntroDoc] : "",
    sceneMap ? JSON.stringify(shareMapOf(sceneMap, module)) : "",
    JSON.stringify(longAgendaDefOf(module)?.tension ?? {}),
  ].flatMap((x) => [x, ...plain(x ?? "")]);
  const corpus = [JSON.stringify(proj), ...visibleDocs, ...playerFacing].join("\n").toLowerCase();
  const hidden: string[] = [];
  const add = (...xs: Array<string | undefined>) => {
    for (const x of xs) if (x) hidden.push(...plain(x));
  };
  for (const e of Object.values(maps.entities)) {
    const p = proj.entities[e.id];
    const seen = new Set(stringLeaves(p?.fields ?? {}, 8));
    for (const leaf of stringLeaves(e.fields, 8)) if (!seen.has(leaf)) add(leaf);
    if (!p) add(e.summary);
  }
  for (const h of Object.values(maps.handouts)) if (!proj.handouts[h.id]) add(h.title, h.bodyDoc ? docs[h.bodyDoc] : undefined);
  for (const n of Object.values(maps.notes)) add(n.title, docs[n.bodyDoc]);
  for (const s of Object.values(maps.sessions)) add(docs[s.logDoc], ...(s.nextPlan ?? []));
  for (const s of Object.values(maps.scenes)) add(docs[s.bodyDoc]);
  for (const a of Object.values(maps.adventures)) add(a.gmSituationDoc ? docs[a.gmSituationDoc] : undefined);
  for (const m of maps.meta.members) hidden.push(...(m.contact ? [m.contact] : []));
  for (const m of Object.values(maps.maps)) {
    for (const z of m.layout?.zones ?? []) add(z.gmNote, ...(z.details ?? []));
    for (const mk of m.layout?.markers ?? []) if (mk.gmOnly) add(mk.label);
    for (const t of m.live?.tokens ?? []) if (t.gmOnly) add(t.label);
    const share = shareMapOf(m, module);
    if (share) {
      const visible = new Set(share.visibleZones);
      for (const z of m.layout?.zones ?? []) if (!visible.has(z.id) && z.name && z.name.length >= 12) hidden.push(z.name);
    }
  }
  const strings = [...new Set(hidden)].filter((s) => !corpus.includes(s.toLowerCase()));
  const ids = [
    ...Object.keys(maps.entities).filter((id) => !proj.entities[id]),
    ...Object.keys(maps.handouts).filter((id) => !proj.handouts[id]),
    ...Object.keys(maps.notes),
    ...Object.keys(maps.assets).filter((id) => !proj.assets[id]),
    ...Object.values(maps.adventures).flatMap((a) => [a.gmSituationDoc, a.epilogueDoc].filter((x): x is string => !!x)),
  ];
  return { strings, ids };
}

function expectClean(packet: PlayerPacket, forbidden: Forbidden, who: string): void {
  const json = JSON.stringify(packet);
  const low = json.toLowerCase();
  for (const s of forbidden.strings) expect(low.includes(s.toLowerCase()), `${who}'s packet holds hidden text: ${s}`).toBe(false);
  for (const id of forbidden.ids) expect(json.includes(id), `${who}'s packet holds the hidden id ${id}`).toBe(false);
}

interface Demo {
  name: string;
  store: CampaignStore;
  registry: RichTextRegistry;
  maps: CampaignMaps;
  docs: Record<Id, string>;
  module: GameModule;
}

/** The demo's first session and a scene with a map (for the briefing, the map with fog), when it has one. */
function sessionAndScene(maps: CampaignMaps): { sessionId: Id; sceneId?: Id } {
  const session = Object.values(maps.sessions).sort((a, b) => a.number - b.number)[0]!;
  const scene = Object.values(maps.scenes).find((s) => s.map && maps.maps[s.map]?.layout);
  return scene ? { sessionId: session.id, sceneId: scene.id } : { sessionId: session.id };
}

/** Players for a demo that has none: one per PC. */
function withPlayers(d: Demo): Demo {
  if (playerMembers(d.store.meta()).length === 0) {
    const pcs = Object.values(d.store.toJSON().entities)
      .filter((e) => d.module.entityTypes.find((t) => t.id === e.type)?.kind === "character" && (e.fields["isPC"] === true || !!e.ownerMemberId))
      .sort((a, b) => a.name.localeCompare(b.name));
    pcs.forEach((pc, i) => addPlayer(d.store, { name: `Player ${i + 1}`, contact: `contact-note-${i + 1}@example.invalid`, characters: [pc.id] }));
  }
  return { ...d, maps: d.store.toJSON() };
}

function packetsOf(d: Demo): Array<{ id: Id; name: string; packet: PlayerPacket }> {
  const { sessionId, sceneId } = sessionAndScene(d.maps);
  return playerMembers(d.maps.meta).map((m) => ({
    id: m.id,
    name: m.name,
    packet: playerPacketSnapshot({ maps: d.maps, module: d.module, memberId: m.id, sessionId, sceneId, doc: (id) => d.registry.open(id), at: AT }),
  }));
}

describe("player packets on the demos", async () => {
  const dndGame = await dnd5eDemoModule();
  const pf2eGame = await moduleFromPackSource(pf2eOrcSource);
  loadModule(pf2eGame, { skipProcedureRuns: true });
  const demos: Array<() => Promise<Demo>> = [
    async () => ({ name: "Skyfire Down", module: alienModule, ...buildDemoCampaign() }),
    async () => withPlayers({ name: "Cold Harbor", module: alienModule, ...buildCinematicDemo() }),
    async () => withPlayers({ name: "D&D 5e", module: dndGame, ...(await buildDnd5eDemo({ module: dndGame })) }),
    async () => withPlayers({ name: "Orc", module: pf2eGame, ...(await buildPf2eDemo({ module: pf2eGame })) }),
  ];

  for (const make of demos) {
    it("gives each player their sheet and nothing GM-only or another player's", async () => {
      const d = await make();
      const packets = packetsOf(d);
      expect(packets.length, d.name).toBeGreaterThan(1);
      for (const { id, name, packet } of packets) {
        const viewer = memberViewer(d.maps, id);
        expect(packet.characters.length, `${d.name}: ${name}`).toBeGreaterThan(0);
        expect(packet.characters.map((c) => c.id).sort()).toEqual([...(viewer.characters ?? [])].sort());
        expect(packet.for).toBe(name);
        const forbidden = forbiddenFor(d.maps, d.module, viewer, d.docs, sessionAndScene(d.maps).sceneId);
        // the scan has something to look for: GM texts and the other players' material
        expect(forbidden.strings.length, d.name).toBeGreaterThan(10);
        expect(forbidden.ids.length, d.name).toBeGreaterThan(0);
        expectClean(packet, forbidden, `${d.name}: ${name}`);
        // and it would catch a leak
        expect(() => expectClean({ ...packet, campaign: forbidden.strings[0]! }, forbidden, "leak")).toThrow();
        // every other player's own characters' private agenda stays out
        for (const other of packets.filter((p) => p.id !== id)) {
          for (const c of other.packet.characters) if (c.agenda) expect(JSON.stringify(packet)).not.toContain(c.agenda.markdown);
        }
      }
    });
  }
});

describe("Skyfire Down's players", () => {
  const demo = buildDemoCampaign();
  const { maps, registry } = demo;
  const players = playerMembers(maps.meta);
  const packets = packetsOf({ name: "Skyfire Down", module: alienModule, ...demo });

  it("seats four players, one per PC, with the GM's contact notes", () => {
    expect(players.map((p) => p.name)).toEqual(DEMO_PLAYERS.map((p) => p.name));
    for (const p of players) expect(p.contact).toBeTruthy();
    const pcs = Object.values(maps.entities).filter((e) => e.type === "alien.character" && e.fields["isPC"] === true);
    expect(pcs).toHaveLength(4);
    for (const pc of pcs) expect(players.some((p) => p.id === pc.ownerMemberId), pc.name).toBe(true);
  });

  it("gives each player their own agenda: the goal, this job's beat and the tension, never the secret", () => {
    for (const { name, packet } of packets) {
      const [pc] = packet.characters;
      const raw = maps.entities[pc!.id]!;
      const record = raw.fields["campaignAgenda"] as { goal: { text: string; title: string }; beat: { text: string }; secret: { text: string }; history: Array<{ text: string }> };
      expect(pc!.agenda?.markdown, name).toContain(record.goal.text);
      expect(pc!.agenda?.markdown).toContain(record.beat.text);
      expect(pc!.agenda?.markdown).toMatch(/\*\*Tension:\*\*/);
      expect(pc!.agenda?.markdown).not.toContain(record.secret.text);
      for (const h of record.history) expect(pc!.agenda?.markdown).not.toContain(`- ${h.text}`);
      expect(pc!.agenda?.title).toBe(`${raw.name}: personal agenda`);
      // the job's agenda card, given to its player
      expect(packet.handouts.find((h) => h.title === `Agenda: ${raw.name}`)?.personal, name).toBe(true);
      // the GM's own agenda card stays the GM's
      const gmCard = Object.values(maps.handouts).find((h) => h.character === raw.id && h.purpose === LONG_AGENDA_PURPOSE)!;
      expect(packet.handouts.some((h) => h.id === gmCard.id)).toBe(false);
      // the sheet they play from, without the GM's sections
      const titles = pc!.sections.map((s) => s.title);
      expect(titles).toEqual(expect.arrayContaining(["Identity", "Attributes", "Skills", "Stress & Conditions"]));
      expect(titles).not.toContain("Secret synthetic");
      expect(titles).not.toContain("Life Path provenance");
      expect(titles).not.toContain("NPC dossier");
      expect(pc!.sections.flatMap((s) => s.rows.map((r) => r.label))).toEqual(expect.arrayContaining(["Stress", "Health", "XP"]));
    }
  });

  it("puts the note shared with Priya in her packet only", () => {
    for (const { name, packet } of packets) {
      const has = packet.handouts.some((h) => h.title === DEMO_PRIVATE_HANDOUT);
      expect(has, name).toBe(name === "Priya");
    }
    const priya = packets.find((p) => p.name === "Priya")!.packet;
    expect(priya.handouts.find((h) => h.title === DEMO_PRIVATE_HANDOUT)?.text).toMatch(/Count the cryo pods/);
    // the friction handouts every player sees are in every packet
    for (const { packet } of packets) expect(packet.handouts.filter((h) => /: friction$/.test(h.title))).toHaveLength(4);
  });

  it("matches the campaign agenda definition the module declares", () => {
    expect(CAMPAIGN_AGENDA_DEF.handouts?.agenda).toBe("{name}: personal agenda");
    expect(registry).toBeTruthy();
  });
});
