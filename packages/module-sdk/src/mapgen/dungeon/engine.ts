/**
 * The dungeon engine: floor plan (one archetype per site type, levels joined
 * by stairs), doors and secrets, room purposes and dressing, then
 * encounters, traps and treasure from the module's own content. Each stage
 * draws from its own seeded stream, so re-running one stage changes it and
 * the stages after it, never the ones before. A floor plan that fails a
 * block check is drawn again with a new sub-seed, up to MAX_ATTEMPTS times.
 *
 * Loaded lazily (see ../index.ts): the module only holds the light parts
 * (brief, legend, passability) until a map is generated.
 */
import type { MapBorderData, MapCheck, MapDeck, MapGeneratorContext, MapGeneratorResult, MapMarker, MapProduced, MapZoneData, ProducedEntity, ProducedRelationship, Rng, SiteLayout } from "../../types";
import { setPath } from "../../logic";
import type { DungeonConfig, DungeonLinkKind, DungeonSiteType, PackMapGenerator } from "../types";
import { area, edgeSegment, outline } from "./grid";
import { baseContext, labelOf, normalizeInputs, type DungeonInputs } from "./inputs";
import { ARCHETYPE_LINKS, GOES_UP, drawLevel, type DraftLink, type LevelDraft } from "./layout";
import { Content, chooseShare, num, pick, rollAmount, rollById, rowText, rule, text, type Ctx, type ModuleContent } from "./stock";

export const MAX_ATTEMPTS = 30;
const LOCKED_ACTS = [1, 2, 3];

/** A zone of the assembled map, with what the stages need to know about it. */
interface Zone {
  data: MapZoneData;
  draft: number;
  level: number;
  kind: "room" | "corridor" | "exterior";
  role?: string | undefined;
  cells: number;
  depth: number;
  lair: boolean;
  entrance: boolean;
  /** Purpose row tags. */
  tags: string[];
  key?: { name: string; description?: string | undefined; readAloud?: string | undefined } | undefined;
}

interface Link {
  draft: DraftLink;
  a: Zone;
  b: Zone;
  segment?: [[number, number], [number, number]] | undefined;
  stairs?: boolean;
}

interface Plan {
  zones: Zone[];
  links: Link[];
  decks: MapDeck[];
  start: Zone;
  levels: LevelDraft[];
}

function stageRng(ctx: MapGeneratorContext, gen: PackMapGenerator, stage: string, attempt = 1): Rng {
  const override = ctx.stageSeeds?.[stage];
  return ctx.rng(`${stage}/${gen.id}${override !== undefined ? `@${override}` : ""}${attempt > 1 ? `#${attempt}` : ""}`);
}

// ---------------------------------------------------------------------------
// stage 1: the floor plan
// ---------------------------------------------------------------------------

function roomsPerLevel(total: number, levels: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < levels; i++) out.push(Math.max(3, Math.round(total / levels)));
  return out;
}

function planLayout(gen: PackMapGenerator, site: DungeonSiteType, inputs: DungeonInputs, rng: Rng): Plan | undefined {
  const config = gen.config;
  const size = config.sizes.find((s) => s.id === inputs.size)!;
  const total = rng.int(size.rooms[0], Math.max(size.rooms[0], size.rooms[1]));
  let next = 0;
  const alloc = () => next++;
  const shape: Record<string, number> = {};
  const levels: LevelDraft[] = [];
  const counts = roomsPerLevel(total, inputs.levels);
  for (let i = 0; i < inputs.levels; i++) {
    const d = drawLevel(site.archetype, rng.fork(`level-${i}`), { rooms: counts[i]!, level: i, shape, alloc });
    if (!d) return undefined;
    levels.push(d);
  }
  return assemble(config, site, inputs, levels);
}

/** Depth of every zone from the level's entrance, over the level's links. */
function depths(d: LevelDraft): Map<number, number> {
  const adj = new Map<number, number[]>();
  for (const l of d.links) {
    adj.set(l.a, [...(adj.get(l.a) ?? []), l.b]);
    adj.set(l.b, [...(adj.get(l.b) ?? []), l.a]);
  }
  const out = new Map<number, number>([[d.entrance, 0]]);
  const queue = [d.entrance];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i]!;
    for (const n of adj.get(cur) ?? []) {
      if (out.has(n)) continue;
      out.set(n, out.get(cur)! + 1);
      queue.push(n);
    }
  }
  return out;
}

function assemble(config: DungeonConfig, site: DungeonSiteType, inputs: DungeonInputs, levels: LevelDraft[]): Plan | undefined {
  const up = GOES_UP.has(site.archetype);
  const levelName = site.levelName ?? labelOf(config, "level");
  const decks: MapDeck[] = [];
  const all: Zone[] = [];
  const byDraft = new Map<number, Zone>();
  const offsets: Array<[number, number]> = [];
  const downRooms: Array<Zone | undefined> = [];
  levels.forEach((d, i) => {
    const g = d.grid;
    const cells = g.cellsByOwner();
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const list of cells.values())
      for (const c of list) {
        const x = c % g.w;
        const y = Math.floor(c / g.w);
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    const dx = 1 - x0;
    const dy = 1 - y0;
    offsets.push([dx, dy]);
    const deck: MapDeck = { id: `L${i + 1}`, name: `${levelName} ${i + 1}`, width: x1 - x0 + 3, height: y1 - y0 + 3, level: up ? i : levels.length - 1 - i };
    decks.push(deck);
    const depth = depths(d);
    for (const [id, z] of d.zones) {
      const own = cells.get(id) ?? [];
      const poly = outline(own, g.w).map(([x, y]) => [x + dx, y + dy] as [number, number]);
      const zone: Zone = {
        data: { id: "", deck: deck.id, kind: z.kind === "corridor" ? "corridor" : z.kind === "exterior" ? "exterior" : "room", poly, cluttered: false },
        draft: id,
        level: i,
        kind: z.kind,
        role: z.role,
        cells: own.length,
        depth: depth.get(id) ?? 99,
        lair: false,
        entrance: i === 0 && id === d.entrance && z.kind === "room",
        tags: [],
      };
      byDraft.set(id, zone);
      all.push(zone);
    }
    // the lair on the deepest level; on the others, the stairs down leave from the archetype's lair room or the deepest room
    const rooms = all.filter((z) => z.level === i && z.kind === "room" && z.draft !== d.entrance);
    const hint = d.lairHint !== undefined ? byDraft.get(d.lairHint) : undefined;
    const deepest = rooms.slice().sort((a, b) => b.depth * 4 + b.cells / 8 - (a.depth * 4 + a.cells / 8) || a.draft - b.draft)[0];
    const heart = hint && hint.draft !== d.entrance ? hint : deepest;
    if (i === levels.length - 1) {
      if (heart) heart.lair = true;
    } else downRooms.push(heart);
  });
  // stairs: from each level's heart room to the next level's entrance
  const links: Link[] = [];
  levels.forEach((d) => {
    for (const l of d.links) {
      const a = byDraft.get(l.a);
      const b = byDraft.get(l.b);
      if (!a || !b) continue;
      const [dx, dy] = offsets[d.level]!;
      const seg = l.edge ? (edgeSegment(l.edge).map(([x, y]) => [x + dx, y + dy]) as [[number, number], [number, number]]) : undefined;
      links.push({ draft: l, a, b, ...(seg ? { segment: seg } : {}) });
    }
  });
  for (let i = 0; i + 1 < levels.length; i++) {
    const from = downRooms[i];
    const to = byDraft.get(levels[i + 1]!.entrance);
    if (!from || !to) return undefined;
    links.push({ draft: { a: from.draft, b: to.draft, tree: true }, a: from, b: to, stairs: true });
  }
  // order: rooms level by level (way in first, then by depth), then passages, then the ground outside
  const rank = (z: Zone) => (z.kind === "room" ? 0 : z.kind === "corridor" ? 1 : 2);
  all.sort((a, b) => rank(a) - rank(b) || a.level - b.level || Number(b.entrance) - Number(a.entrance) || a.depth - b.depth || a.draft - b.draft);
  let r = 0;
  let p = 0;
  let x = 0;
  for (const z of all) {
    z.data.id = z.kind === "room" ? `R${String(++r).padStart(2, "0")}` : z.kind === "corridor" ? `P${String(++p).padStart(2, "0")}` : `X${++x}`;
    if (z.kind === "room") z.data.key = true;
  }
  const outside = levels[0]!.outside !== undefined ? byDraft.get(levels[0]!.outside) : undefined;
  const start = outside ?? byDraft.get(levels[0]!.entrance);
  if (!start) return undefined;
  return { zones: all, links, decks, start, levels };
}

// ---------------------------------------------------------------------------
// stage 2: doors and secrets
// ---------------------------------------------------------------------------

function weightedPick(rng: Rng, weights: Array<[DungeonLinkKind, number]>): DungeonLinkKind {
  const total = weights.reduce((s, [, w]) => s + w, 0);
  let roll = rng.next() * total;
  for (const [k, w] of weights) {
    roll -= w;
    if (roll < 0) return k;
  }
  return weights[weights.length - 1]![0];
}

interface Doors {
  kinds: Map<Link, DungeonLinkKind>;
  hidden: Set<Zone>;
}

function planDoors(config: DungeonConfig, site: DungeonSiteType, plan: Plan, rng: Rng): Doors {
  const weights = site.links ?? ARCHETYPE_LINKS[site.archetype];
  const kinds = new Map<Link, DungeonLinkKind>();
  const hidden = new Set<Zone>();
  const degree = new Map<Zone, number>();
  for (const l of plan.links) {
    degree.set(l.a, (degree.get(l.a) ?? 0) + 1);
    degree.set(l.b, (degree.get(l.b) ?? 0) + 1);
  }
  const rooms = plan.zones.filter((z) => z.kind === "room").length;
  const lockCap = Math.max(1, Math.ceil(rooms / 5));
  let locked = 0;
  const stairRooms = new Set(plan.links.filter((l) => l.stairs).flatMap((l) => [l.a, l.b]));
  const special = (z: Zone) => z.entrance || z.lair || z.kind !== "room" || z.role === "tower" || stairRooms.has(z) || z === plan.start;
  for (const l of plan.links) {
    if (l.stairs) continue;
    const lrng = rng.fork(`${l.a.draft}-${l.b.draft}`);
    let kind: DungeonLinkKind;
    if (l.draft.kind) kind = l.draft.kind;
    else if (l.a.kind === "corridor" && l.b.kind === "corridor") kind = "open";
    else {
      const outside = l.a.kind === "exterior" || l.b.kind === "exterior";
      const leaf = [l.a, l.b].find((z) => z.kind === "room" && degree.get(z) === 1 && !special(z));
      const allowed = (Object.entries(weights) as Array<[DungeonLinkKind, number]>).filter(([k, w]) => {
        if (!(w > 0)) return false;
        if (outside) return k === "open" || k === "door" || k === "bars";
        if (k === "rubble") return !l.draft.tree;
        if (k === "secret") return !l.draft.tree || !!leaf;
        if (k === "locked") return locked < lockCap;
        return true;
      });
      kind = allowed.length ? weightedPick(lrng, allowed) : "open";
      // the lair's way in is often locked
      if ((l.a.lair || l.b.lair) && l.draft.tree && kind !== "secret" && (weights.locked ?? 0) > 0 && locked < lockCap && lrng.next() < 0.35) kind = "locked";
      if (kind === "locked") locked++;
      if (kind === "secret" && l.draft.tree && leaf) hidden.add(leaf);
    }
    kinds.set(l, kind);
  }
  void config;
  return { kinds, hidden };
}

function borderOf(l: Link, kind: DungeonLinkKind | undefined, id: string, note: string | undefined, rng: Rng): MapBorderData {
  const b: MapBorderData = { id, a: l.a.data.id, b: l.b.data.id, kind: "open" };
  if (l.stairs) {
    b.kind = "stairs";
    return b;
  }
  if (l.segment) b.segment = l.segment;
  switch (kind) {
    case "door":
      b.kind = "door";
      break;
    case "locked":
      b.kind = "door";
      b.lock = "mechanical";
      b.lockedInActs = [...LOCKED_ACTS];
      break;
    case "secret":
      b.kind = "door";
      b.hidden = true;
      break;
    case "bars":
      b.kind = "bars";
      // a closed portcullis or a locked grate, half the time
      if (rng.next() < 0.5) {
        b.lock = "mechanical";
        b.lockedInActs = [...LOCKED_ACTS];
      }
      break;
    case "rubble":
      b.kind = "rubble";
      break;
    default:
      b.kind = "open";
  }
  if (note) b.note = note;
  return b;
}

// ---------------------------------------------------------------------------
// checks
// ---------------------------------------------------------------------------

function reach(plan: Plan, kinds: Map<Link, DungeonLinkKind>, from: Zone, through: (k: DungeonLinkKind | undefined, l: Link) => boolean): Set<Zone> {
  const seen = new Set<Zone>([from]);
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i]!;
    for (const l of plan.links) {
      if (l.a !== cur && l.b !== cur) continue;
      if (!through(kinds.get(l), l)) continue;
      const other = l.a === cur ? l.b : l.a;
      if (seen.has(other)) continue;
      seen.add(other);
      queue.push(other);
    }
  }
  return seen;
}

function layoutChecks(plan: Plan, doors: Doors): MapCheck[] {
  const checks: MapCheck[] = [];
  const rooms = plan.zones.filter((z) => z.kind === "room");
  checks.push({ id: "entrance", level: "block", ok: !!plan.start && rooms.some((z) => z.entrance || plan.start.level === 0), message: "The dungeon has a way in on its first level." });
  const all = reach(plan, doors.kinds, plan.start, (k) => k !== "rubble");
  const unreached = plan.zones.filter((z) => !all.has(z));
  checks.push({ id: "connected", level: "block", ok: unreached.length === 0, message: unreached.length === 0 ? "Every room and passage can be reached from the way in (through locked and secret doors)." : `${unreached.length} zone(s) cannot be reached from the way in.` });
  const levels = plan.decks.length;
  const linked = Array.from({ length: Math.max(0, levels - 1) }, (_, i) => plan.links.some((l) => l.stairs && ((l.a.level === i && l.b.level === i + 1) || (l.b.level === i && l.a.level === i + 1))));
  checks.push({ id: "levels-linked", level: "block", ok: linked.every(Boolean), message: levels > 1 ? "Stairs join every level to the next." : "One level: no stairs needed." });
  const overlaps = plan.zones.filter((z) => Math.abs(Math.abs(area(z.data.poly)) - z.cells) > 1e-6);
  checks.push({ id: "no-overlap", level: "block", ok: overlaps.length === 0, message: overlaps.length === 0 ? "No rooms overlap: every outline matches its squares." : `${overlaps.length} outline(s) do not match their squares.` });
  const perLevel = plan.decks.map((_, i) => rooms.filter((z) => z.level === i).length);
  checks.push({ id: "rooms", level: "block", ok: perLevel.every((n) => n >= 3), message: `Rooms per level: ${perLevel.join(", ")} (at least 3 each).` });
  const open = reach(plan, doors.kinds, plan.start, (k) => k !== "rubble" && k !== "secret");
  const shut = rooms.filter((z) => !open.has(z) && !doors.hidden.has(z));
  checks.push({ id: "no-secret-needed", level: "warn", ok: shut.length === 0, message: shut.length === 0 ? "Every room but the secret ones can be reached without finding a secret door." : `${shut.length} room(s) can only be reached through a secret door.` });
  return checks;
}

// ---------------------------------------------------------------------------
// stages 3 and 4: dressing and stocking
// ---------------------------------------------------------------------------

function roomCtx(base: Ctx, z: Zone, extra: Ctx = {}): Ctx {
  return {
    ...base,
    level: z.level + 1,
    room: {
      id: z.data.id,
      name: z.data.name ?? "",
      tags: z.tags,
      area: z.cells,
      depth: z.depth,
      lair: z.lair,
      entrance: z.entrance,
      key: !!z.key,
      passage: z.kind === "corridor",
      tower: z.role === "tower",
      level: z.level + 1,
    },
    ...extra,
  };
}

function dress(gen: PackMapGenerator, site: DungeonSiteType, inputs: DungeonInputs, plan: Plan, ctx: MapGeneratorContext, rng: Rng, base: Ctx, checks: MapCheck[]): void {
  const config = gen.config;
  const tables = ctx.tables;
  const theme = (config.themes ?? []).find((t) => t.id === inputs.theme);
  const rooms = plan.zones.filter((z) => z.kind === "room");
  // key rooms: the lair's first, the rest the deepest rooms
  const keys = inputs.keyRooms.slice();
  const lairKey = keys.findIndex((k) => k.lair);
  const lair = rooms.find((z) => z.lair);
  if (lair && keys.length) lair.key = keys.splice(lairKey >= 0 ? lairKey : keys.length - 1, 1)[0];
  const others = rooms.filter((z) => !z.lair && !z.entrance).sort((a, b) => b.depth - a.depth || b.cells - a.cells || a.draft - b.draft);
  for (const z of others) {
    if (!keys.length) break;
    z.key = keys.shift();
  }
  checks.push({ id: "key-rooms", level: "warn", ok: keys.length === 0, message: keys.length === 0 ? `Key rooms placed (${inputs.keyRooms.length}).` : `${keys.length} key room(s) did not fit: ${keys.map((k) => k.name).join(", ")}.` });

  const used = new Set<string>();
  for (const z of rooms) {
    const zr = rng.fork(`room:${z.data.id}`);
    const table = z.lair ? (site.lair ?? site.rooms) : z.entrance ? (site.entrance ?? site.rooms) : z.role === "nave" ? (site.hall ?? site.rooms) : site.rooms;
    let row: { result: unknown; label: string | undefined } | undefined;
    for (let t = 0; t < 6; t++) {
      row = rollById(tables, table, roomCtx(base, z), zr.fork(`purpose:${t}`));
      const res = (row?.result ?? {}) as Record<string, unknown>;
      const name = text(res.name) || text(row?.label);
      if (!used.has(name) || res.repeat === true) break;
    }
    const res = (row?.result ?? {}) as Record<string, unknown>;
    const purpose = text(res.name) || text(row?.label) || labelOf(config, "room");
    used.add(purpose);
    z.tags = Array.isArray(res.tags) ? res.tags.map(String) : [];
    z.data.name = z.key?.name ?? purpose;
    const details: string[] = [];
    if (z.key) details.push(purpose);
    const readAloud = z.key?.readAloud ?? text(res.readAloud);
    if (readAloud) z.data.playerNote = readAloud;
    const gm = [z.key?.description, text(res.gm)].filter(Boolean).join(" ");
    if (gm) z.data.gmNote = gm;
    const flags: Record<string, unknown> = {};
    for (const [flag, chance] of Object.entries(site.flags ?? {})) if (zr.fork(`flag:${flag}`).next() < chance) flags[flag] = true;
    if (res.flags && typeof res.flags === "object" && !Array.isArray(res.flags)) Object.assign(flags, res.flags);
    for (const [k, v] of Object.entries(flags)) if (v === false || v === null) delete flags[k];
    if (Object.keys(flags).length) z.data.flags = flags;
    const dressing = [...(config.dressing?.rooms ?? []), ...(theme?.dressing ?? []), ...(typeof res.dressing === "string" ? [res.dressing] : [])];
    dressing.forEach((tid, i) => {
      const d = rowText(rollById(tables, tid, roomCtx(base, z), zr.fork(`dressing:${i}`)));
      if (d) details.push(d);
    });
    if (details.length) z.data.details = details;
  }
  const passageName = site.passageName ?? labelOf(config, "passage");
  for (const z of plan.zones) {
    if (z.kind === "exterior") {
      z.data.name = site.outsideName ?? labelOf(config, "outside");
      continue;
    }
    if (z.kind !== "corridor") continue;
    z.data.name = passageName;
    const zr = rng.fork(`passage:${z.data.id}`);
    const flags: Record<string, unknown> = {};
    for (const [flag, chance] of Object.entries(site.passageFlags ?? {})) if (zr.fork(`flag:${flag}`).next() < chance) flags[flag] = true;
    if (Object.keys(flags).length) z.data.flags = flags;
    if (zr.next() < (config.dressing?.passageChance ?? 0.25)) {
      const details = (config.dressing?.passages ?? []).map((tid, i) => rowText(rollById(tables, tid, roomCtx(base, z), zr.fork(`dressing:${i}`)))).filter(Boolean);
      if (details.length) z.data.details = details;
    }
  }
}

interface Stocked {
  markers: MapMarker[];
  xp: number;
}

function stock(gen: PackMapGenerator, inputs: DungeonInputs, plan: Plan, ctx: MapGeneratorContext, rng: Rng, base: Ctx, content: Content, checks: MapCheck[]): Stocked {
  const config = gen.config;
  const tables = ctx.tables;
  const markers: MapMarker[] = [];
  const threat = config.threats.find((t) => t.id === inputs.threat)!;
  const rooms = plan.zones.filter((z) => z.kind === "room");
  let xp = 0;
  let missing = 0;
  const enc = config.encounters;
  if (enc) {
    const candidates = rooms.filter((z) => !z.entrance && !z.lair);
    const occupied = new Set([...rooms.filter((z) => z.lair), ...chooseShare(rng.fork("occupied"), candidates, threat.occupied, 1)]);
    const passages = plan.zones.filter((z) => z.kind === "corridor" && rng.fork(`wander:${z.data.id}`).next() < (enc.passages ?? 0));
    let n = 0;
    for (const z of plan.zones) {
      if (!occupied.has(z) && !passages.includes(z)) continue;
      const er = rng.fork(`encounter:${z.data.id}`);
      const c = roomCtx(base, z);
      // the encounter roll, re-rolled (up to four more times) while it does not suit the theme:
      // the pack's `prefer` on the row, and every group finding a creature that `fits`
      type Built = { row: { result: unknown; label: string | undefined }; groups: Array<{ n: number; preset: string; name: string; xp: number }>; misses: number; unfit: number };
      const build = (t: number): Built | undefined => {
        const row = rollById(tables, enc.table, c, er.fork(`roll:${t}`));
        if (!row) return undefined;
        const data = { ...c, result: row.result, label: row.label };
        const out: Built = { row, groups: [], misses: 0, unfit: 0 };
        enc.groups.forEach((g, gi) => {
          if (g.when !== undefined && !rule(g.when, data)) return;
          const count = Math.max(0, Math.round(num(rule(g.n, data), 1)));
          if (count < 1) return;
          const spec = { ...g, ...(g.id === undefined && g.presets === undefined && g.lists === undefined ? { presets: enc.creatureType } : {}) };
          const got = pick(spec, data, er.fork(`group:${t === 0 ? "" : `${t}:`}${gi}`), tables, content);
          if (!got?.preset) {
            out.misses++;
            return;
          }
          if (got.fitted === false) out.unfit++;
          const each = num(rule(enc.xp, { ...data, group: { n: count }, preset: got.preset }), 0);
          out.groups.push({ n: count, preset: got.preset.id, name: got.preset.name, xp: each });
        });
        if (enc.prefer !== undefined) {
          const res = row.result as Record<string, unknown> | undefined;
          const preset = typeof res?.preset === "string" ? content.preset(res.preset) : undefined;
          if (!rule(enc.prefer, { ...c, result: row.result, label: row.label, preset })) out.unfit++;
        }
        return out;
      };
      let best = build(0);
      for (let t = 1; t < 5 && best && (best.unfit > 0 || best.misses > 0); t++) {
        const next = build(t);
        if (next && (next.misses < best.misses || (next.misses === best.misses && next.unfit < best.unfit))) best = next;
      }
      if (!best) {
        missing++;
        continue;
      }
      missing += best.misses;
      const row = best.row;
      const groups = best.groups;
      const data = { ...c, result: row.result, label: row.label };
      if (groups.length === 0) continue;
      const activity = enc.activity ? rowText(rollById(tables, enc.activity, data, er.fork("activity"))) : "";
      const total = groups.reduce((s, g) => s + g.n * g.xp, 0);
      xp += total;
      const encounter = { groups, xp: total, activity, result: row.result };
      const detail = [activity, text(rule(enc.detail, { ...data, encounter }))].filter(Boolean).join(". ");
      markers.push({
        id: `E${++n}`,
        kind: "spawn",
        zone: z.data.id,
        label: groups.map((g) => `${g.n} × ${g.name}`).join(", "),
        gmOnly: true,
        ...(detail ? { detail } : {}),
        data: { groups, xp: total, ...(activity ? { activity } : {}) },
      });
    }
    checks.push({ id: "encounters", level: "warn", ok: missing === 0 && markers.length > 0, message: missing === 0 ? `${markers.length} encounter(s) from the module's own creatures${xp ? ` (${xp} XP in all)` : ""}.` : `${missing} encounter group(s) found no creature in the module.`, ...(enc.cite ? {} : {}) });
  }

  const traps = config.traps;
  if (traps) {
    let n = 0;
    for (const z of plan.zones) {
      if (z.kind === "exterior") continue;
      const tr = rng.fork(`trap:${z.data.id}`);
      const c = roomCtx(base, z);
      if (tr.next() >= num(rule(traps.chance, c), 0)) continue;
      const got = pick(traps.pick, c, tr.fork("pick"), tables, content);
      if (!got) continue;
      const data = { ...c, result: got.result, label: got.label, preset: got.preset, item: got.item };
      const label = text(rule(traps.label, data)) || got.preset?.name || got.label || labelOf(config, "trap");
      const detail = text(rule(traps.detail, data));
      markers.push({ id: `T${++n}`, kind: "trap", zone: z.data.id, label, gmOnly: true, ...(detail ? { detail } : {}), data: { ...(got.preset ? { preset: got.preset.id } : {}) } });
    }
  }

  const treasure = config.treasure;
  if (treasure) {
    let n = 0;
    for (const z of rooms) {
      const gr = rng.fork(`treasure:${z.data.id}`);
      const c = roomCtx(base, z);
      if (gr.next() >= num(rule(treasure.chance, c), 0)) continue;
      const parts: string[] = [];
      const coins = rollAmount(rule(treasure.coins, c), gr.fork("coins"));
      if (coins > 0) parts.push(text(rule(treasure.coinsLabel, { ...c, coins })) || String(coins));
      const items: Array<{ id?: string; list?: string; name: string }> = [];
      const count = Math.max(0, Math.round(num(rule(treasure.itemCount, c), 0)));
      for (let i = 0; i < count && treasure.items; i++) {
        const got = pick(treasure.items, c, gr.fork(`item:${i}`), tables, content);
        if (!got) continue;
        const it = got.item ?? got.preset;
        const data = { ...c, result: got.result, label: got.label, item: it };
        const label = text(rule(treasure.itemLabel, data)) || it?.name || rowText(got.result !== undefined ? { result: got.result, label: got.label } : undefined);
        if (!label) continue;
        parts.push(label);
        items.push({ ...(it ? { id: it.id, name: it.name } : { name: label }), ...(got.item ? { list: got.item.list } : {}) });
      }
      if (parts.length === 0) continue;
      markers.push({ id: `G${++n}`, kind: "treasure", zone: z.data.id, label: labelOf(config, "treasure"), detail: parts.join("; "), gmOnly: true, data: { coins, items } });
    }
    checks.push({ id: "treasure", level: "warn", ok: n > 0, message: n > 0 ? `${n} room(s) hold treasure.` : "No treasure was placed." });
  }
  return { markers, xp };
}

// ---------------------------------------------------------------------------
// the run
// ---------------------------------------------------------------------------

/** Generate a dungeon. Same generator, module content, inputs, seed and stage seeds => same layout. */
export function generateDungeon(gen: PackMapGenerator, module: ModuleContent, raw: Record<string, unknown>, ctx: MapGeneratorContext, content: Content = new Content(module)): MapGeneratorResult {
  const config = gen.config;
  const inputs = normalizeInputs(config, raw);
  const site = config.siteTypes.find((s) => s.id === inputs.siteType)!;
  const base = baseContext(config, inputs);
  let last: { layout: SiteLayout; failed: string } | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const plan = planLayout(gen, site, inputs, stageRng(ctx, gen, "layout", attempt));
    if (!plan) {
      last ??= { layout: { decks: [], zones: [], borders: [], markers: [], checks: [{ id: "layout", level: "block", ok: false, message: "The floor plan did not fit." }] }, failed: "layout" };
      continue;
    }
    const doors = planDoors(config, site, plan, stageRng(ctx, gen, "doors"));
    const checks = layoutChecks(plan, doors);
    for (const z of doors.hidden) z.data.hidden = true;
    const layout = finish(gen, site, inputs, plan, doors, ctx, base, content, checks);
    const failed = checks.find((c) => c.level === "block" && !c.ok);
    if (!failed) return { layout, attempts: attempt };
    last = { layout, failed: failed.id };
  }
  return { layout: last!.layout, attempts: MAX_ATTEMPTS, failedCheck: last!.failed };
}

function finish(gen: PackMapGenerator, site: DungeonSiteType, inputs: DungeonInputs, plan: Plan, doors: Doors, ctx: MapGeneratorContext, base: Ctx, content: Content, checks: MapCheck[]): SiteLayout {
  const config = gen.config;
  dress(gen, site, inputs, plan, ctx, stageRng(ctx, gen, "dressing"), base, checks);
  // door notes read the room behind the door (after dressing names it)
  const nr = stageRng(ctx, gen, "doors").fork("notes");
  const borders: MapBorderData[] = [];
  plan.links.forEach((l, i) => {
    const kind = doors.kinds.get(l);
    const room = [l.a, l.b].find((z) => z.kind === "room" && !z.entrance) ?? l.b;
    let note: string | undefined;
    const noteRule = kind ? config.doors?.notes?.[kind] : undefined;
    if (noteRule !== undefined) {
      const c = roomCtx(base, room);
      const lock = kind === "locked" && config.doors?.lock ? pick(config.doors.lock, c, nr.fork(`lock:${i}`), ctx.tables, content) : undefined;
      note = text(rule(noteRule, { ...c, lock: lock?.item ?? lock?.preset ?? lock?.result ?? null })) || undefined;
    }
    borders.push(borderOf(l, kind, `B${String(i + 1).padStart(3, "0")}`, note, nr.fork(`bars:${i}`)));
  });
  const stocked = stock(gen, inputs, plan, ctx, stageRng(ctx, gen, "stocking"), base, content, checks);
  const start: MapMarker = { id: "M1", kind: "start", zone: plan.start.data.id, label: labelOf(config, "entrance"), gmOnly: false };
  const layout: SiteLayout = {
    decks: plan.decks,
    zones: plan.zones.map((z) => z.data),
    borders,
    markers: [start, ...stocked.markers],
    start: plan.start.data.id,
    gridM: config.grid.metres,
    gridUnit: { size: config.grid.size, unit: config.grid.unit },
    fog: "hide",
    numbering: "key",
    acts: false,
    cover: false,
    checks,
    meta: {
      engine: "dungeon",
      generator: gen.id,
      siteType: inputs.siteType,
      size: inputs.size,
      levels: inputs.levels,
      partyLevel: inputs.partyLevel,
      partySize: inputs.partySize,
      threat: inputs.threat,
      ...(inputs.theme ? { theme: inputs.theme } : {}),
      ...(inputs.faction ? { faction: inputs.faction } : {}),
      xp: stocked.xp,
    },
  };
  return layout;
}

// ---------------------------------------------------------------------------
// accepting a map into the campaign
// ---------------------------------------------------------------------------

function evalFields(fields: Record<string, unknown> | undefined, data: Ctx): Record<string, unknown> {
  let out: Record<string, unknown> = {};
  for (const [path, r] of Object.entries(fields ?? {})) {
    const v = rule(r as never, data);
    if (v !== undefined && v !== null && v !== "") out = setPath(out, path, v);
  }
  return out;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** The entities a dungeon stands for: the site, its rooms, encounters and their creatures, hazards. */
export function produceDungeon(gen: PackMapGenerator, module: ModuleContent, layout: SiteLayout, raw: Record<string, unknown>, content: Content = new Content(module)): MapProduced {
  const config = gen.config;
  const acc = config.accept;
  const out: MapProduced = { entities: [], relationships: [], zones: {}, markers: {} };
  if (!acc) return out;
  const inputs = normalizeInputs(config, raw);
  const base = baseContext(config, inputs);
  const rooms = layout.zones.filter((z) => z.kind === "room");
  const number = new Map(rooms.map((z, i) => [z.id, i + 1]));
  const deckName = new Map(layout.decks.map((d) => [d.id, d.name]));
  const site = config.siteTypes.find((s) => s.id === inputs.siteType)!;
  if (acc.site) {
    const e: ProducedEntity = { tempId: "site", type: acc.site.type, name: site.label, fields: evalFields(acc.site.fields, { ...base, map: { rooms: rooms.length, levels: layout.decks.length } }) };
    if (acc.site.subtype) e.subtype = acc.site.subtype;
    out.entities.push(e);
    out.site = "site";
  }
  const roomData = (z: MapZoneData) => ({ id: z.id, name: z.name ?? "", readAloud: z.playerNote ?? "", details: z.details ?? [], detailsText: (z.details ?? []).join("; "), gmNote: z.gmNote ?? "", number: number.get(z.id) ?? 0, level: deckName.get(z.deck) ?? "", flags: z.flags ?? {} });
  if (acc.room) {
    for (const z of rooms) {
      const tempId = `room:${z.id}`;
      const e: ProducedEntity = { tempId, type: acc.room.type, name: z.name ?? z.id, summary: `${number.get(z.id)}. ${z.name ?? z.id}, ${deckName.get(z.deck) ?? z.deck}`, fields: evalFields(acc.room.fields, { ...base, room: roomData(z) }) };
      if (acc.room.subtype) e.subtype = acc.room.subtype;
      if (out.site) e.within = out.site;
      out.entities.push(e);
      out.zones[z.id] = tempId;
    }
  }
  const zoneOf = new Map(layout.zones.map((z) => [z.id, z]));
  const placeOf = (zone: string) => out.zones[zone] ?? out.site;
  for (const m of layout.markers) {
    const z = zoneOf.get(m.zone);
    if (m.kind === "spawn") {
      const groups = (Array.isArray(m.data?.groups) ? m.data.groups : []) as Array<{ n: number; preset: string; name: string; xp: number }>;
      let encId: string | undefined;
      if (acc.encounter) {
        encId = `enc:${m.id}`;
        const encounter = { label: m.label, detail: m.detail ?? "", xp: Number(m.data?.xp ?? 0), groups, activity: String(m.data?.activity ?? ""), creatures: m.label };
        out.entities.push({ tempId: encId, type: acc.encounter.type, name: `${m.label}${z?.name ? ` (${z.name})` : ""}`, fields: evalFields(acc.encounter.fields, { ...base, room: z ? roomData(z) : {}, encounter }) });
        const place = placeOf(m.zone);
        if (place) out.relationships.push({ type: "found_at", from: encId, to: place });
        out.markers[m.id] = encId;
      }
      if (acc.creatures !== false) {
        groups.forEach((g, gi) => {
          const preset = content.preset(g.preset);
          if (!preset) return;
          for (let k = 0; k < g.n; k++) {
            const tempId = `cre:${m.id}:${gi}:${k}`;
            const e: ProducedEntity = { tempId, type: preset.entityType, name: g.n > 1 ? `${preset.name} ${k + 1}` : preset.name, fields: clone(preset.fields), preset: preset.id };
            if (preset.subtype) e.subtype = preset.subtype;
            if (preset.summary) e.summary = preset.summary;
            if (preset.tags) e.tags = [...preset.tags];
            out.entities.push(e);
            // with no encounter entity, the mark stands for its first creature
            if (!out.markers[m.id]) out.markers[m.id] = tempId;
            const rel: ProducedRelationship = encId ? { type: "appears_in", from: tempId, to: encId } : { type: "found_at", from: tempId, to: placeOf(m.zone) ?? "" };
            if (rel.to) out.relationships.push(rel);
          }
        });
      }
    } else if (m.kind === "trap" && acc.hazards !== false && typeof m.data?.preset === "string") {
      const preset = content.preset(m.data.preset);
      if (!preset) continue;
      const tempId = `haz:${m.id}`;
      const e: ProducedEntity = { tempId, type: preset.entityType, name: preset.name, fields: clone(preset.fields), preset: preset.id };
      if (preset.summary) e.summary = preset.summary;
      if (preset.tags) e.tags = [...preset.tags];
      out.entities.push(e);
      const place = placeOf(m.zone);
      if (place) out.relationships.push({ type: "found_at", from: tempId, to: place });
      out.markers[m.id] = tempId;
    }
  }
  return out;
}
export { Content } from "./stock";
