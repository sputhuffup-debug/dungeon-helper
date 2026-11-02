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
  handoutStaysWithGm,
  longAgendaDefOf,
  memberViewer,
  playerMembers,
  playerPacketSnapshot,
  revealZones,
  startLive,
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
import { alienModule, CAMPAIGN_AGENDA_CARD_PURPOSE, CAMPAIGN_AGENDA_DEF } from "@campaign-forge/module-alien";
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

  it("keeps the GM's agenda cards with the GM even if one is marked given", () => {
    expect(CAMPAIGN_AGENDA_CARD_PURPOSE).toBe(LONG_AGENDA_PURPOSE);
    const store = CampaignStore.fromJSON(maps);
    const cards = store.list("handouts").filter((h) => h.purpose === LONG_AGENDA_PURPOSE);
    expect(cards).toHaveLength(4);
    for (const c of cards) {
      expect(handoutStaysWithGm(c, alienModule)).toBe("Players get their agenda in their packet; this card stays with you.");
      store.update("handouts", c.id, { toOwner: true });
    }
    const given = store.toJSON();
    const session = Object.values(given.sessions)[0]!;
    for (const m of playerMembers(given.meta)) {
      const p = playerPacketSnapshot({ maps: given, module: alienModule, memberId: m.id, sessionId: session.id, doc: (id) => registry.open(id), at: AT });
      for (const c of cards) expect(p.handouts.some((h) => h.id === c.id), `${m.name}: ${c.title}`).toBe(false);
      for (const e of Object.values(given.entities)) {
        const secret = (e.fields["campaignAgenda"] as { secret?: { text: string } } | undefined)?.secret?.text;
        if (secret) expect(JSON.stringify(p)).not.toContain(secret);
      }
    }
    // the job's agenda cards (no purpose) are still given
    expect(handoutStaysWithGm(Object.values(given.handouts).find((h) => h.title.startsWith("Agenda: "))!, alienModule)).toBeUndefined();
  });
});

describe("Skyfire Down's job board in the packets", () => {
  // the taken job's site map on the first scene, with the zones holding rogue humans revealed: the packets then carry the map with fog
  const demo = buildDemoCampaign();
  const { store, registry } = demo;
  const before = store.toJSON();
  const job = Object.values(before.entities).find((e) => e.type === "alien.job" && e.tags.includes("job-board"))!;
  const rels = Object.values(before.relationships);
  const npcs = rels.filter((r) => r.type === "involved_in" && r.to === job.id).map((r) => ({ note: r.note, e: before.entities[r.from]! }));
  const contact = npcs.find((n) => n.note === "Contact")!.e;
  const site = rels.find((r) => r.type === "site_of" && r.to === job.id)!;
  const siteMap = Object.values(before.maps).find((m) => m.location === site.from)!;
  const hostiles = siteMap.layout!.markers.filter((m) => m.kind === "hostile");
  const scene = Object.values(before.scenes)[0]!;
  store.update("scenes", scene.id, { map: siteMap.id });
  // the betrayer as a secret synthetic, with orders and cover scores the scan can look for
  const betrayer = npcs.find((n) => (job.fields["betrayers"] as string[]).includes(n.e.name))!.e;
  const ORDERS = "Bring the specimen home; the crew is expendable (planted orders).";
  store.update("entities", betrayer.id, { fields: { ...betrayer.fields, secretAndroid: true, secretOrders: ORDERS, coverAttributes: { strength: 3, agility: 3, wits: 4, empathy: 3 } } });
  startLive(store, siteMap.id, 1);
  revealZones(store, siteMap.id, [...new Set([...hostiles.map((m) => m.zone), ...siteMap.layout!.zones.slice(0, 6).map((z) => z.id)])]);
  const maps = store.toJSON();
  const session = Object.values(maps.sessions)[0]!;
  const posting = Object.values(maps.handouts).find((h) => h.purpose === "job-posting")!;
  const packets = playerMembers(maps.meta).map((m) => playerPacketSnapshot({ maps, module: alienModule, memberId: m.id, sessionId: session.id, sceneId: scene.id, doc: (id) => registry.open(id), at: AT }));
  const androids = Object.values(maps.entities).filter((e) => e.type === "alien.character" && (e.fields["android"] === true || e.fields["secretAndroid"] === true) && e.visibility.level === "gm");
  const brief = job.fields["siteBrief"] as { summary: string[]; name?: string };

  it("has what the scan needs: a betrayer, an android NPC, rogue humans on the revealed map", () => {
    expect((job.fields["betrayers"] as string[]).length).toBe(1);
    expect(androids.map((a) => a.id)).toContain(betrayer.id);
    expect(maps.entities[betrayer.id]!.fields["secretOrders"]).toBe(ORDERS);
    expect(hostiles.length).toBeGreaterThan(0);
    for (const p of packets) expect(p.maps.map((m) => m.id)).toEqual([siteMap.id]);
  });

  it("puts the posting and the visible contact in every packet", () => {
    for (const p of packets) {
      expect(p.handouts.find((h) => h.id === posting.id), p.for).toBeDefined();
      expect(p.handouts.find((h) => h.id === posting.id)?.personal).toBeUndefined();
      expect(JSON.stringify(p), p.for).toContain(contact.name);
      expect(projectCampaignForViewer(maps, alienModule, memberViewer(maps, p.member.id)).entities[contact.id]).toBeDefined();
    }
  });

  it("never puts the betrayer, an android's secrets, NPC agendas, the job's GM fields or hostile markers in a packet", () => {
    for (const p of packets) {
      const json = JSON.stringify(p);
      const view = projectCampaignForViewer(maps, alienModule, memberViewer(maps, p.member.id));
      for (const n of npcs) {
        for (const f of ["personalAgenda", "secret", "goal", "secretOrders"]) {
          const v = n.e.fields[f];
          if (typeof v === "string" && v.length > 8) expect(json, `${p.for}: ${n.e.name}.${f}`).not.toContain(v);
        }
        if (n.e.visibility.level === "gm") {
          expect(json, `${p.for}: ${n.e.name}`).not.toContain(n.e.id);
          expect(view.entities[n.e.id]).toBeUndefined();
        }
      }
      expect(json).not.toContain(ORDERS);
      expect(json).not.toContain("secretAndroid");
      expect(json).not.toContain("coverAttributes");
      for (const a of androids) {
        expect(json).not.toContain(a.id);
        expect(view.entities[a.id]).toBeUndefined();
        for (const v of [a.fields["secretOrders"], ...((a.fields["fairClues"] as string[] | undefined) ?? [])]) if (typeof v === "string" && v) expect(json).not.toContain(v);
      }
      for (const name of job.fields["betrayers"] as string[]) expect(json, `${p.for}: betrayer ${name}`).not.toContain(name);
      const pj = view.entities[job.id]!;
      for (const f of ["difficulty", "effectiveDifficulty", "betrayers", "employerIntent", "siteBrief", "complications", "plotTwist"]) expect(pj.fields[f], f).toBeUndefined();
      expect(json).not.toContain(String(job.fields["employerIntent"]));
      for (const line of brief.summary) expect(json, line).not.toContain(line);
      // the map goes out with fog and without its rogue humans
      expect(json).not.toContain('"kind":"hostile"');
      for (const m of hostiles) if (m.label) expect(json, `${p.for}: ${m.label}`).not.toContain(m.label);
      for (const z of siteMap.layout!.zones) if (z.gmNote) expect(json).not.toContain(z.gmNote);
      expect(json).not.toMatch(/betray|Rogue humans|UPP fire team|Mercenary team/i);
    }
  });
});
