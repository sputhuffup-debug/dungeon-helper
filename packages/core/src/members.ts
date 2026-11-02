/**
 * Players of a campaign. v1 has no player accounts: a player member is a name
 * the GM keeps (with an optional contact note) so material can be shared with
 * that player alone (`some_players` visibility, player packets). Which PCs a
 * player plays is kept on the characters (`Entity.ownerMemberId`), the one
 * place every view reads; a member's earlier `characterId` still counts as
 * owning that character when the character names no owner itself.
 *
 * Nothing here names a game.
 */
import { newId } from "./ids";
import type { CampaignStore } from "./store";
import type { CampaignMaps, CampaignMember, CampaignMeta, Entity, Id, Visibility } from "./types";
import type { Viewer } from "./visibility";

/** The campaign's players (members with the player role), in the order the GM added them. */
export function playerMembers(meta: Pick<CampaignMeta, "members">): CampaignMember[] {
  return meta.members.filter((m) => m.role === "player");
}

/** The member who plays this character, if any (the character's own owner first, then a member's earlier `characterId`). */
export function ownerMemberOf(meta: Pick<CampaignMeta, "members">, entity: Pick<Entity, "id" | "ownerMemberId">): CampaignMember | undefined {
  if (entity.ownerMemberId) {
    const owner = meta.members.find((m) => m.id === entity.ownerMemberId && m.role === "player");
    if (owner) return owner;
  }
  return meta.members.find((m) => m.role === "player" && m.characterId === entity.id && !entity.ownerMemberId);
}

/** Ids of the characters a member plays, sorted by name. */
export function charactersOfMember(maps: Pick<CampaignMaps, "meta" | "entities">, memberId: Id): Id[] {
  return Object.values(maps.entities)
    .filter((e) => ownerMemberOf(maps.meta, e)?.id === memberId)
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .map((e) => e.id);
}

/** The viewer a player packet is built for: the player, and the characters they play. */
export function memberViewer(maps: Pick<CampaignMaps, "meta" | "entities">, memberId: Id): Viewer {
  return { role: "player", memberId, characters: charactersOfMember(maps, memberId) };
}

export interface PlayerInput {
  name: string;
  contact?: string | undefined;
  /** Characters this player plays (each loses its earlier player). */
  characters?: Id[] | undefined;
}

/** Add a player member. */
export function addPlayer(store: CampaignStore, input: PlayerInput): CampaignMember {
  const name = input.name.trim();
  if (!name) throw new Error("A player needs a name.");
  const member: CampaignMember = { id: newId(), name, role: "player" };
  const contact = input.contact?.trim();
  if (contact) member.contact = contact;
  store.transact(() => {
    store.updateMeta({ members: [...store.meta().members, member] });
    if (input.characters) setPlayerCharacters(store, member.id, input.characters);
  });
  return member;
}

/** Rename a player or change their contact note (an empty note removes it). */
export function updatePlayer(store: CampaignStore, memberId: Id, patch: { name?: string; contact?: string }): CampaignMember {
  const meta = store.meta();
  const current = meta.members.find((m) => m.id === memberId);
  if (!current) throw new Error(`member ${memberId} not found`);
  const next: CampaignMember = { ...current };
  if (patch.name !== undefined && patch.name.trim()) next.name = patch.name.trim();
  if (patch.contact !== undefined) {
    const c = patch.contact.trim();
    if (c) next.contact = c;
    else delete next.contact;
  }
  store.updateMeta({ members: meta.members.map((m) => (m.id === memberId ? next : m)) });
  return next;
}

/** Who plays a character: a player member id, or undefined for nobody. */
export function setCharacterOwner(store: CampaignStore, characterId: Id, memberId: Id | undefined): void {
  const e = store.get("entities", characterId);
  if (!e) throw new Error(`entities/${characterId} not found`);
  store.transact(() => {
    store.update("entities", characterId, { ownerMemberId: memberId });
    // an earlier member-side link no longer applies once the character names its owner (or nobody)
    const meta = store.meta();
    if (meta.members.some((m) => m.characterId === characterId)) {
      store.updateMeta({ members: meta.members.map((m) => (m.characterId === characterId ? withoutCharacterId(m) : m)) });
    }
  });
}

/** The characters a player plays, exactly: these become theirs, any others they played become nobody's. */
export function setPlayerCharacters(store: CampaignStore, memberId: Id, characterIds: Id[]): void {
  const want = new Set(characterIds);
  store.transact(() => {
    const meta = store.meta();
    for (const e of store.list("entities")) {
      const owner = ownerMemberOf(meta, e)?.id;
      if (want.has(e.id) && owner !== memberId) setCharacterOwner(store, e.id, memberId);
      else if (!want.has(e.id) && owner === memberId) setCharacterOwner(store, e.id, undefined);
    }
  });
}

/**
 * Remove a player: their characters become nobody's, and every
 * `some_players` list drops them (a record shared only with them stays
 * shared with nobody, so it is not suddenly visible to anyone else).
 */
export function removePlayer(store: CampaignStore, memberId: Id): void {
  store.transact(() => {
    setPlayerCharacters(store, memberId, []);
    const drop = (v: Visibility | undefined): Visibility | undefined => (v?.players?.includes(memberId) ? { ...v, players: v.players.filter((p) => p !== memberId) } : undefined);
    for (const map of ["entities", "relationships", "handouts", "timeline", "maps", "assets", "ledger", "travel", "advancement"] as const) {
      for (const r of store.list(map)) {
        const next = drop(r.visibility);
        if (next) store.update(map, r.id, { visibility: next } as never);
      }
    }
    for (const e of store.list("entities")) {
      if (!e.fieldVisibility) continue;
      let changed = false;
      const fv: Record<string, Visibility> = {};
      for (const [path, v] of Object.entries(e.fieldVisibility)) {
        const next = drop(v);
        if (next) changed = true;
        fv[path] = next ?? v;
      }
      if (changed) store.update("entities", e.id, { fieldVisibility: fv });
    }
    store.updateMeta({ members: store.meta().members.filter((m) => m.id !== memberId) });
  });
}

function withoutCharacterId(m: CampaignMember): CampaignMember {
  const out = { ...m };
  delete out.characterId;
  return out;
}

/** "Sam", or "Sam and Priya", or "Sam, Priya and Alex": the players a `some_players` visibility names. */
export function sharedWithLabel(meta: Pick<CampaignMeta, "members">, v: Pick<Visibility, "players"> | undefined): string {
  const names = (v?.players ?? []).map((id) => meta.members.find((m) => m.id === id)?.name).filter((n): n is string => !!n);
  if (names.length === 0) return "nobody yet";
  return names.length === 1 ? names[0]! : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
