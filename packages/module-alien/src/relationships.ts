import type { RelationshipTypeDef } from "@campaign-forge/module-sdk";

/** Typed edges the Alien module adds on top of the core set (docs/alien-field-names.md). */
export const relationshipTypes: RelationshipTypeDef[] = [
  {
    id: "buddy_of",
    forward: "buddy of",
    reverse: "buddy of",
    fromKinds: ["character"],
    toKinds: ["character"],
    symmetric: true,
  },
  {
    id: "rival_of",
    forward: "rival of",
    reverse: "rival of",
    fromKinds: ["character"],
    toKinds: ["character"],
    symmetric: true,
  },
  {
    id: "employer_of",
    forward: "employer of",
    reverse: "employed by",
    fromKinds: ["faction"],
    toKinds: ["job"],
  },
  {
    id: "sponsor_of",
    forward: "sponsor of",
    reverse: "sponsored by",
    fromKinds: ["faction"],
    toKinds: ["job"],
  },
  {
    id: "crew_of",
    forward: "crew of",
    reverse: "crewed by",
    fromKinds: ["character"],
    toKinds: ["vehicle"],
  },
  {
    // A xenomorph to the host it burst from or was ovomorphed out of (life-cycle tracker).
    id: "emerged_from",
    forward: "emerged from",
    reverse: "host of",
    fromKinds: ["creature"],
    toKinds: ["character", "creature"],
  },
  {
    id: "stationed_at",
    forward: "stationed at",
    reverse: "hosts",
    fromKinds: ["faction"],
    toKinds: ["location"],
  },
];
