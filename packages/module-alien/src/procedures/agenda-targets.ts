/**
 * Targets for the agenda generator, from the campaign: the party (with buddy
 * and rival links), the adventure's NPCs, its locations and site map rooms,
 * key items and clues, creatures and corporations. Where the campaign has
 * none, the module's fallback tables fill in ("the specimen", "the shuttle
 * bay"), preferring rows whose words appear in the adventure's premise or
 * hidden situation. Pools are plain JSON (they are stored with the run) and
 * built without randomness; the deal draws from them.
 */
import type { AdventureSnapshot, CampaignEntitySummary, CampaignSnapshot, Rng } from "@campaign-forge/module-sdk";
import { factionPresets } from "../data/factions";
import { AGENDA_ITEM_TABLE_ID, AGENDA_NPC_TABLE_ID, AGENDA_PLACE_TABLE_ID, AGENDA_THREAT_TABLE_ID, agendaTables } from "../tables/agendas";
import type { TargetKind } from "./agenda-arcs";
import { isObj, str } from "./helpers";

export type BaseKind = "item" | "place" | "npc" | "pc" | "threat" | "faction" | "crew";

export interface Target {
  /** Stable identity for matching across characters: the entity id, or "name:<lowercase name>". */
  key: string;
  name: string;
  kind: BaseKind;
  /** Entity id when the target is a campaign entity. */
  id?: string;
  /** Where it came from: the campaign, the adventure, a site map room, or a fallback table. */
  source: "campaign" | "adventure" | "room" | "fallback" | "party";
}

export interface PartyMember {
  id: string;
  name: string;
  inCampaign: boolean;
  /** Position in the `pcs` input (for arc locks), -1 when the member did not come from it. */
  index: number;
  lockedArc?: string;
  career?: string;
  android?: boolean;
  secretAndroid?: boolean;
  buddies: string[];
  rivals: string[];
}

export interface TargetPools {
  /** Key items and clues, the prize first. */
  items: Target[];
  /** Logs, files and records. */
  records: Target[];
  places: Target[];
  exits: Target[];
  comms: Target[];
  npcs: Target[];
  threats: Target[];
  factions: Target[];
  leader: Target;
  /** What the Company is called here (a corporation the adventure or campaign names, or "the Company"). */
  company: string;
  rivalCorp: string;
  /** Lower-case Act 3 text (title, goal, fields, countdown): Act 3 targets named in it are preferred. */
  climax: string;
  hasCountdown: boolean;
}

export interface Cast {
  party: PartyMember[];
  pools: TargetPools;
  adventure?: { id: string; title: string };
}

const nameKey = (name: string) => `name:${name.trim().toLowerCase()}`;
const target = (name: string, kind: BaseKind, source: Target["source"], id?: string): Target => (id ? { key: id, name, kind, id, source } : { key: nameKey(name), name, kind, source });

/** "Facehugger (Cold Lab specimen)" -> "Facehugger". */
export function shortName(name: string): string {
  return (
    name
      .replace(/\s*\([^)]*\)\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim() || name.trim()
  );
}

/** Whether a name (or one of its significant words) appears in the text. */
export function mentioned(name: string, text: string): boolean {
  const t = text.toLowerCase();
  const n = shortName(name)
    .toLowerCase()
    .replace(/^the\s+/, "");
  if (n && t.includes(n)) return true;
  return n.split(/[^a-z0-9-]+/).some((w) => w.length >= 5 && t.includes(w));
}

const EXIT = /shuttle|bay|dock|hangar|airlock|\block\b|pod|launch|lander|escape/i;
const COMMS = /comm|relay|uplink|control|bridge|radio|antenna|dish|signal/i;
const RECORDS = /log|record|file|data|note|drive|manifest|tape|disk|report/i;
const LEADER = /lead|captain|chief|command|officer|boss|head|director|supervisor/i;
const LEADER_CAREERS = ["officer", "colonial-marshal"];

function tableRows(id: string): Array<{ label: string; result: Record<string, unknown> }> {
  const t = agendaTables.find((x) => x.id === id);
  return (t?.rows ?? []).map((r) => ({ label: r.label ?? "", result: isObj(r.result) ? r.result : {} }));
}

function dedupe(list: Target[]): Target[] {
  const seen = new Set<string>();
  const out: Target[] = [];
  for (const t of list) {
    const k = t.name.trim().toLowerCase();
    if (!k || seen.has(k) || seen.has(t.key)) continue;
    seen.add(k);
    seen.add(t.key);
    out.push(t);
  }
  return out;
}

function asCampaign(v: unknown): CampaignSnapshot {
  if (!isObj(v)) return { entities: [], relationships: [] };
  const entities = (Array.isArray(v.entities) ? v.entities : []).filter((e): e is CampaignEntitySummary => isObj(e) && typeof e.id === "string" && typeof e.name === "string");
  const relationships = (Array.isArray(v.relationships) ? v.relationships : []).filter(
    (r): r is CampaignSnapshot["relationships"][number] => isObj(r) && typeof r.from === "string" && typeof r.to === "string" && typeof r.type === "string",
  );
  return { entities, relationships };
}

function asAdventure(v: unknown): AdventureSnapshot | undefined {
  if (!isObj(v) || typeof v.id !== "string") return undefined;
  const strings = (x: unknown): Record<string, string> => (isObj(x) ? (Object.fromEntries(Object.entries(x).filter(([, s]) => typeof s === "string")) as Record<string, string>) : {});
  return {
    id: v.id,
    title: str(v.title),
    premise: str(v.premise),
    situation: str(v.situation),
    fields: strings(v.fields),
    acts: (Array.isArray(v.acts) ? v.acts : []).filter(isObj).map((a) => ({ number: typeof a.number === "number" ? a.number : 0, title: str(a.title), goal: str(a.goal), fields: strings(a.fields) })),
    cast: isObj(v.cast)
      ? (Object.fromEntries(Object.entries(v.cast).map(([k, ids]) => [k, Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : []])) as Record<string, string[]>)
      : {},
    rooms: (Array.isArray(v.rooms) ? v.rooms : []).filter((x): x is string => typeof x === "string"),
  };
}

const fieldOf = (e: CampaignEntitySummary | undefined, key: string): unknown => e?.fields?.[key];

const CORPORATIONS = factionPresets.filter((p) => p.fields.factionType === "corporation").map((p) => p.name);

/**
 * The party and the target pools for a run: PCs from the `pcs` input (or the
 * adventure's PCs, or the campaign's, or `pcCount` placeholders), targets from
 * the campaign snapshot and the adventure snapshot, fallbacks from the tables.
 */
export function buildCast(inputs: Record<string, unknown>): Cast {
  const campaign = asCampaign(inputs.campaign);
  const adventure = asAdventure(inputs.adventure);
  const byId = new Map(campaign.entities.map((e) => [e.id, e]));

  // -- the party ---------------------------------------------------------------
  const listed = (Array.isArray(inputs.pcs) ? inputs.pcs : []).filter(isObj).filter((p) => typeof p.id === "string" && p.id !== "");
  let party: PartyMember[] = listed.map((p, index) => {
    const e = byId.get(String(p.id));
    const m: PartyMember = { id: String(p.id), name: str(p.name) || e?.name || String(p.id), inCampaign: !!e, index, buddies: [], rivals: [] };
    const arc = str(p.arc);
    if (arc && arc !== "random") m.lockedArc = arc;
    return m;
  });
  if (party.length === 0) {
    const castPcs = (adventure?.cast.pcs ?? []).map((id) => byId.get(id)).filter((e): e is CampaignEntitySummary => !!e);
    const pcs = castPcs.length ? castPcs : campaign.entities.filter((e) => e.pc);
    party = pcs.map((e) => ({ id: e.id, name: e.name, inCampaign: true, index: -1, buddies: [], rivals: [] }));
  }
  if (party.length === 0) {
    const n = Math.max(1, Math.min(8, Math.floor(typeof inputs.pcCount === "number" ? inputs.pcCount : 4)));
    party = Array.from({ length: n }, (_, i) => ({ id: `pc-${i + 1}`, name: `PC ${i + 1}`, inCampaign: false, index: -1, buddies: [], rivals: [] }));
  }
  const partyIds = new Set(party.map((p) => p.id));
  for (const m of party) {
    const e = byId.get(m.id);
    const career = fieldOf(e, "career");
    if (typeof career === "string" && career) m.career = career;
    if (fieldOf(e, "android") === true) m.android = true;
    if (fieldOf(e, "secretAndroid") === true) m.secretAndroid = true;
    for (const r of campaign.relationships) {
      const other = r.from === m.id ? r.to : r.to === m.id ? r.from : undefined;
      if (!other || other === m.id || !partyIds.has(other)) continue;
      if (r.type === "buddy_of" && !m.buddies.includes(other)) m.buddies.push(other);
      if (r.type === "rival_of" && !m.rivals.includes(other)) m.rivals.push(other);
    }
  }

  // -- the story's text ----------------------------------------------------------
  const story = [adventure?.premise, adventure?.situation, ...Object.values(adventure?.fields ?? {}), ...(adventure?.acts ?? []).flatMap((a) => [a.title, a.goal, ...Object.values(a.fields)])]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
  const act3 = adventure?.acts.find((a) => a.number === 3) ?? adventure?.acts[adventure.acts.length - 1];
  const countdown = adventure?.fields.countdown ?? "";
  const climax = [act3?.title, act3?.goal, ...Object.values(act3?.fields ?? {}), countdown].filter(Boolean).join("\n").toLowerCase();

  // -- people -------------------------------------------------------------------
  const castNpcIds = adventure?.cast.npcs;
  const npcEntities = (castNpcIds ? castNpcIds.map((id) => byId.get(id)) : campaign.entities.filter((e) => e.kind === "character" && !e.pc)).filter(
    (e): e is CampaignEntitySummary => !!e && e.kind === "character" && !e.pc && !partyIds.has(e.id),
  );
  let npcs = dedupe(npcEntities.map((e) => target(e.name, "npc", castNpcIds ? "adventure" : "campaign", e.id)));
  // the NPC the story talks about most comes first
  npcs = [...npcs].sort((a, b) => Number(mentioned(b.name, story)) - Number(mentioned(a.name, story)));
  const npcFallbacks = tableRows(AGENDA_NPC_TABLE_ID).map((r) => target(r.label, "npc", "fallback"));
  if (npcs.length === 0) npcs = npcFallbacks;

  // -- places -------------------------------------------------------------------
  const castLocations = (adventure?.cast.locations ?? []).map((id) => byId.get(id)).filter((e): e is CampaignEntitySummary => !!e);
  const placeEntities = adventure ? castLocations : campaign.entities.filter((e) => e.kind === "location" && e.subtype === "site");
  let places = dedupe([...placeEntities.map((e) => target(e.name, "place", adventure ? "adventure" : "campaign", e.id)), ...(adventure?.rooms ?? []).map((r) => target(r, "place", "room"))]);
  const placeFallbacks = tableRows(AGENDA_PLACE_TABLE_ID);
  if (places.length === 0) places = placeFallbacks.map((r) => target(r.label, "place", "fallback"));
  const exits = places.filter((p) => EXIT.test(p.name));
  const comms = places.filter((p) => COMMS.test(p.name));
  const roleFallback = (role: string) => placeFallbacks.filter((r) => r.result.role === role).map((r) => target(r.label, "place", "fallback"));

  // -- things -------------------------------------------------------------------
  const keyItems = campaign.entities.filter((e) => e.kind === "clue" || (e.kind === "item" && (e.subtype === "other" || e.tags.some((t) => /^(key|plot|macguffin|prize)$/i.test(t)))));
  const itemRows = tableRows(AGENDA_ITEM_TABLE_ID);
  const hit = (r: { result: Record<string, unknown> }) => typeof r.result.match === "string" && new RegExp(r.result.match, "i").test(story);
  // fallback rows the story mentions first, then the rest in table order
  const rankedRows = [...itemRows.filter(hit), ...itemRows.filter((r) => !hit(r))];
  const campaignItems = [...keyItems].sort((a, b) => Number(mentioned(b.name, story)) - Number(mentioned(a.name, story))).map((e) => target(e.name, "item", "campaign", e.id));
  const prizeRows = rankedRows.filter((r) => r.result.role === "prize");
  // the campaign's own things when it has them; the fallback tables otherwise
  const ownItems = campaignItems.filter((t) => !RECORDS.test(t.name));
  const ownRecords = campaignItems.filter((t) => RECORDS.test(t.name));
  const items = ownItems.length
    ? ownItems
    : dedupe([...prizeRows.map((r) => target(r.label, "item", "fallback")), ...rankedRows.filter((r) => r.result.role === "key").map((r) => target(r.label, "item", "fallback"))]);
  const records = ownRecords.length ? ownRecords : dedupe(rankedRows.filter((r) => r.result.role === "records").map((r) => target(r.label, "item", "fallback")));

  const creatures = campaign.entities.filter((e) => e.kind === "creature");
  const threatFallbacks = tableRows(AGENDA_THREAT_TABLE_ID).map((r) => target(r.label, "threat", "fallback"));
  // the campaign's creatures (one the climax or the story names first); the fallback table otherwise
  const rankedCreatures = [...creatures].sort(
    (a, b) => Number(mentioned(b.name, climax)) * 2 + Number(mentioned(b.name, story)) - (Number(mentioned(a.name, climax)) * 2 + Number(mentioned(a.name, story))),
  );
  const threats = creatures.length ? dedupe(rankedCreatures.map((e) => target(shortName(e.name), "threat", "campaign", e.id))) : threatFallbacks;

  // -- corporations ---------------------------------------------------------------
  const factions = campaign.entities.filter((e) => e.kind === "faction");
  const corpFactions = factions.filter((f) => fieldOf(f, "factionType") === "corporation");
  const corpNames = [...new Set([...corpFactions.map((f) => f.name), ...CORPORATIONS])];
  // corporations only by their full name (a word like "systems" says nothing)
  const named2 = (n: string) => story.includes(n.toLowerCase());
  const companyName = corpNames.find(named2) ?? corpFactions[0]?.name ?? "the Company";
  const rivalCorp = corpNames.find((n) => n !== companyName && named2(n)) ?? corpFactions.find((f) => f.name !== companyName)?.name ?? "a rival corporation";
  const companyFaction = factions.find((f) => f.name === companyName);
  const factionTargets = dedupe([target(companyName, "faction", companyFaction ? "campaign" : "fallback", companyFaction?.id), ...factions.map((f) => target(f.name, "faction", "campaign", f.id))]);

  // -- who gives the orders --------------------------------------------------------
  const leaderPc = party.find((m) => m.career && LEADER_CAREERS.includes(m.career));
  const leaderNpc = npcEntities.find((e) => LEADER.test(String(fieldOf(e, "role") ?? "")));
  const leader = leaderPc ? target(leaderPc.name, "pc", "party", leaderPc.id) : leaderNpc ? target(leaderNpc.name, "npc", "adventure", leaderNpc.id) : npcFallbacks[0]!;

  const pools: TargetPools = {
    items,
    records,
    places,
    exits: exits.length ? exits : roleFallback("exit"),
    comms: comms.length ? comms : roleFallback("comms"),
    npcs,
    threats,
    factions: factionTargets,
    leader,
    company: companyName,
    rivalCorp,
    climax,
    hasCountdown: countdown.trim() !== "",
  };
  const cast: Cast = { party, pools };
  if (adventure) cast.adventure = { id: adventure.id, title: adventure.title };
  return cast;
}

// ---------------------------------------------------------------------------
// drawing a target
// ---------------------------------------------------------------------------

/** Weighted pick (weights > 0); deterministic for the rng. */
export function weightedPick<T>(rng: Rng, items: Array<{ value: T; weight: number }>): T | undefined {
  const pool = items.filter((i) => i.weight > 0);
  const total = pool.reduce((n, i) => n + i.weight, 0);
  if (pool.length === 0 || total <= 0) return undefined;
  let r = rng.next() * total;
  for (const i of pool) {
    r -= i.weight;
    if (r < 0) return i.value;
  }
  return pool[pool.length - 1]!.value;
}

const partyTarget = (m: PartyMember): Target => target(m.name, "pc", "party", m.id);
const CREW: Target = { key: "crew", name: "the rest of the crew", kind: "crew", source: "fallback" };

/**
 * The candidates for an act's target, with weights: the prize, the story's
 * main NPC and the company weigh most, so characters tend to collide on the
 * same things; in Act 3, places and threats the climax names weigh more.
 */
export function targetCandidates(kind: TargetKind, member: PartyMember, cast: Cast, act: number): Array<{ value: Target; weight: number }> {
  const { pools, party } = cast;
  const others = party.filter((p) => p.id !== member.id);
  const climaxBoost = (t: Target) => (act === 3 && mentioned(t.name, pools.climax) ? 4 : 1);
  const lead = (list: Target[], first: number) => list.map((t, i) => ({ value: t, weight: (i === 0 ? first : t.source === "fallback" ? 0.5 : 1.5) * climaxBoost(t) }));
  switch (kind) {
    case "item":
      return lead(pools.items, 8);
    case "item:records":
      return lead(pools.records, 4);
    case "place":
      // the adventure's own locations before the site map's other rooms
      return pools.places.map((t) => ({ value: t, weight: (t.source === "room" ? 0.5 : 3) * climaxBoost(t) }));
    case "place:exit":
      return lead(pools.exits, 4);
    case "place:comms":
      return lead(pools.comms, 4);
    case "npc":
      return lead(pools.npcs, 3);
    case "threat":
      return lead(pools.threats, 6);
    case "faction":
      return lead(pools.factions, 6);
    case "leader": {
      if (pools.leader.id !== member.id) return [{ value: pools.leader, weight: 1 }];
      const alt = others[0] ? partyTarget(others[0]) : pools.npcs[0]!;
      return [{ value: alt, weight: 1 }];
    }
    case "buddy":
    case "rival":
    case "pc": {
      if (others.length === 0) return pools.npcs.slice(0, 1).map((t) => ({ value: t, weight: 1 }));
      const linked = kind === "buddy" ? member.buddies : kind === "rival" ? member.rivals : [];
      const linkedOthers = others.filter((o) => linked.includes(o.id));
      if (linkedOthers.length) return linkedOthers.map((o) => ({ value: partyTarget(o), weight: 1 }));
      // no buddy: anyone but a rival; no rival: anyone, a crewmate who already has a rival less often
      return others.map((o) => ({ value: partyTarget(o), weight: kind === "buddy" && member.rivals.includes(o.id) ? 0.2 : kind === "pc" && member.rivals.includes(o.id) ? 2 : 1 }));
    }
  }
}

export function drawTarget(rng: Rng, kind: TargetKind, member: PartyMember, cast: Cast, act: number, not?: Target): Target {
  const all = targetCandidates(kind, member, cast, act);
  const options = not && all.length > 1 ? all.filter((c) => c.value.key !== not.key) : all;
  return weightedPick(rng, options) ?? CREW;
}
