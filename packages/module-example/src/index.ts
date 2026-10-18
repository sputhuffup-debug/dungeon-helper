/**
 * Example Quest: a tiny fictional fixture module. Core, sdk and ui test
 * against this so nothing game-specific leaks into the core. It exercises
 * every contract feature once and must pass `checkModule` with zero errors.
 */
import type {
  DicePool,
  DiceSystem,
  Effect,
  EntityTypeDef,
  GameModule,
  Procedure,
  ProcedureContext,
  Prompt,
  RolledDie,
  RollResult,
  RollTable,
  Rng,
  RuleCard,
} from "@campaign-forge/module-sdk";

// ---------------------------------------------------------------------------
// Dice: a d6 pool, 5+ is a success, one push re-rolls every non-success.
// ---------------------------------------------------------------------------

const SUCCESS = 5;

function tally(dice: RolledDie[]): { successes: number; symbols: Record<string, number> } {
  const symbols: Record<string, number> = {};
  let successes = 0;
  for (const d of dice) {
    if (d.value >= SUCCESS) successes++;
    const sym = d.value >= SUCCESS ? "success" : d.value === 1 ? "bane" : undefined;
    if (sym) symbols[sym] = (symbols[sym] ?? 0) + 1;
  }
  return { successes, symbols };
}

export const exampleDice: DiceSystem = {
  dice: [{ id: "d6", name: "Six-sider", faces: 6, symbols: { 5: "success", 6: "success", 1: "bane" }, color: "#888" }],
  buildPool(input) {
    const attribute = Number(input.attribute ?? 0);
    const skill = Number(input.skill ?? 0);
    const modifier = Number(input.modifier ?? 0);
    const count = Math.max(1, attribute + skill + modifier);
    return {
      dice: { d6: count },
      breakdown: [
        { label: "Attribute", die: "d6", count: attribute },
        { label: "Skill", die: "d6", count: skill },
        { label: "Modifier", die: "d6", count: modifier },
      ],
    };
  },
  roll(pool: DicePool, rng: Rng): RollResult {
    const dice: RolledDie[] = [];
    for (let i = 0; i < (pool.dice.d6 ?? 0); i++) dice.push({ die: "d6", value: rng.int(1, 6) });
    return { pool, dice, ...tally(dice), pushes: 0, canPush: true };
  },
  push(previous: RollResult, rng: Rng): RollResult {
    if (!previous.canPush) return previous;
    const dice: RolledDie[] = previous.dice.map((d) => (d.value >= SUCCESS ? { ...d, kept: true } : { die: d.die, value: rng.int(1, 6) }));
    return { pool: previous.pool, dice, ...tally(dice), pushes: previous.pushes + 1, canPush: false, notes: ["pushed"] };
  },
  describe(result) {
    return `${result.successes} success${result.successes === 1 ? "" : "es"} on ${result.dice.length}d6${result.pushes ? " (pushed)" : ""}`;
  },
};

// ---------------------------------------------------------------------------
// Entity types
// ---------------------------------------------------------------------------

const heroType: EntityTypeDef = {
  id: "example.hero",
  kind: "character",
  name: "Hero",
  plural: "Heroes",
  icon: "shield",
  schema: {
    type: "object",
    properties: {
      attributes: {
        type: "object",
        properties: {
          might: { type: "integer", minimum: 1, maximum: 5, default: 2 },
          wits: { type: "integer", minimum: 1, maximum: 5, default: 2 },
        },
        required: ["might", "wits"],
        additionalProperties: false,
      },
      skills: {
        type: "object",
        properties: {
          fight: { type: "integer", minimum: 0, maximum: 3, default: 0 },
          lore: { type: "integer", minimum: 0, maximum: 3, default: 0 },
          sneak: { type: "integer", minimum: 0, maximum: 3, default: 0 },
        },
        additionalProperties: false,
      },
      origin: { type: "string", enum: ["hill", "coast", "city"] },
      favoredSkill: { type: "string", enum: ["fight", "lore", "sneak"] },
      wounds: { type: "integer", minimum: 0, default: 0 },
      doom: { type: "integer", minimum: 0, default: 0 },
      gear: {
        type: "array",
        default: [],
        items: {
          type: "object",
          properties: { name: { type: "string" }, weight: { type: "number", default: 1 } },
          required: ["name"],
        },
      },
      notes: { type: "string" },
    },
    required: ["attributes"],
    additionalProperties: false,
  },
  computed: {
    health: { "*": [{ var: "fields.attributes.might" }, 2] },
    healthLeft: { max: [0, { "-": [{ var: "computed.health" }, { var: "fields.wounds" }] }] },
    carry: { sum: [{ map: [{ var: "fields.gear" }, { var: "weight" }] }] },
    burdened: { ">": [{ var: "computed.carry" }, { "*": [{ var: "fields.attributes.might" }, 2] }] },
  },
  sheet: {
    sections: [
      {
        id: "core",
        title: "Core",
        columns: 2,
        fields: [
          { path: "attributes.might", label: "Might", widget: "attribute", rule: "example.rule.push" },
          { path: "attributes.wits", label: "Wits", widget: "attribute" },
          { path: "origin", label: "Origin", widget: "select", options: { ref: "example.origins" } },
          { path: "favoredSkill", label: "Favored skill", widget: "select", options: ["fight", "lore", "sneak"] },
          { path: "skills.*", label: "Skills", widget: "skills", config: { ref: "example.skills" } },
          { path: "health", label: "Health", widget: "computed", readonly: true },
          { path: "wounds", label: "Wounds", widget: "number", rule: "example.rule.wounds" },
        ],
      },
      { id: "gear", title: "Gear", fields: [{ path: "gear[].name", label: "Gear", widget: "gear" }, { path: "carry", label: "Carry", widget: "computed" }] },
      { id: "hardcore", title: "Hardcore", mode: ["hardcore"], fields: [{ path: "doom", label: "Doom", widget: "number", rule: "example.rule.doom" }] },
      { id: "notes", title: "Notes", collapsed: true, fields: [{ path: "notes", widget: "textarea", mode: ["standard", "hardcore"] }] },
    ],
    summary: ["attributes.might", "wounds"],
  },
  defaultVisibility: { notes: "gm", wounds: "players" },
  playerEditable: ["notes", "gear"],
};

const placeType: EntityTypeDef = {
  id: "example.place",
  kind: "location",
  name: "Place",
  plural: "Places",
  icon: "map",
  schema: {
    type: "object",
    properties: {
      terrain: { type: "string", enum: ["forest", "hills", "swamp", "mountain"] },
      danger: { type: "string", enum: ["quiet", "uneasy", "dangerous", "deadly"], default: "quiet" },
      population: { type: "integer", minimum: 0, default: 0 },
      features: { type: "array", items: { type: "string" }, default: [] },
    },
    additionalProperties: false,
  },
  sheet: {
    sections: [
      {
        id: "overview",
        title: "Overview",
        fields: [
          { path: "terrain", widget: "select", options: ["forest", "hills", "swamp", "mountain"] },
          { path: "danger", widget: "select", options: ["quiet", "uneasy", "dangerous", "deadly"] },
          { path: "population", widget: "number" },
          { path: "features", widget: "tags" },
        ],
      },
    ],
    summary: ["terrain", "danger"],
  },
  subtypes: [{ id: "ruin", name: "Ruin" }],
};

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

const terrainTable: RollTable = {
  id: "example.table.terrain",
  name: "Terrain",
  page: 30,
  dice: "d6",
  rows: [
    { range: [1, 2], label: "Forest", result: { terrain: "forest", dangerMod: 0 } },
    { range: [3, 4], label: "Hills", result: { terrain: "hills", dangerMod: 0 } },
    { range: [5, 5], label: "Swamp", result: { terrain: "swamp", dangerMod: 1 } },
    { range: [6, 6], label: "Mountain", result: { terrain: "mountain", dangerMod: 2 } },
  ],
};

const dangerTable: RollTable = {
  id: "example.table.danger",
  name: "Danger",
  page: 31,
  dice: "2d6",
  modifiers: [
    { when: { "==": [{ var: "terrain.terrain" }, "swamp"] }, add: 2, label: "swamp" },
    { when: { "==": [{ var: "terrain.terrain" }, "mountain"] }, add: 1, label: "mountain" },
    { when: { "!!": [{ var: "cursed" }] }, add: { if: [{ var: "cursed" }, 2, 0] }, label: "cursed land" },
  ],
  rows: [
    { range: [-99, 4], label: "Quiet", result: { level: "quiet" } },
    { range: [5, 8], label: "Uneasy", result: { level: "uneasy" } },
    { range: [9, 11], label: "Dangerous", result: { level: "dangerous" } },
    { range: [12, 99], label: "Deadly", result: { level: "deadly" }, gmDecides: true },
  ],
};

const rumorTable: RollTable = {
  id: "example.table.rumor",
  name: "Rumors",
  page: [40, 41],
  dice: "d66",
  rows: [
    { range: [11, 16], label: "Treasure", result: "A hidden hoard" },
    { range: [21, 26], label: "Monster", result: "A beast stalks the road" },
    { range: [31, 36], label: "Omen", result: "Strange lights at night" },
    { range: [41, 46], label: "Stranger", result: "A hooded traveller asks questions" },
    { range: [51, 56], label: "Plague", result: "Sickness in the next village" },
    { range: [61, 66], label: "War", result: "Soldiers gather in the north" },
  ],
};

const encounterTable: RollTable = {
  id: "example.table.encounter",
  name: "Encounter",
  page: 32,
  dice: "d6",
  rows: [
    { range: [1, 3], label: "Nothing", result: { kind: "nothing" } },
    { range: [4, 5], label: "Traveller", result: { kind: "traveller" }, roll: [{ table: "example.table.rumor", as: "rumor" }] },
    { range: [6, 6], label: "Bandits", result: { kind: "bandits" }, roll: [{ table: "example.table.terrain", as: "lairs", times: "d2" }] },
  ],
};

// ---------------------------------------------------------------------------
// Procedure
// ---------------------------------------------------------------------------

interface TerrainResult {
  terrain: string;
  dangerMod: number;
}
interface DangerResult {
  level: string;
}
interface EncounterResult {
  kind: string;
  rumor?: string;
  lairs?: TerrainResult[];
}

const expedition: Procedure = {
  id: "example.proc.expedition",
  name: "Expedition",
  description: "Roll up a place and what the heroes meet there.",
  page: 29,
  inputs: {
    type: "object",
    properties: {
      cursed: { type: "boolean", default: false },
      days: { type: "integer", minimum: 1, maximum: 6, default: 2 },
    },
  },
  steps: [
    { id: "terrain", title: "Terrain", table: "example.table.terrain" },
    {
      id: "danger",
      title: "Danger",
      table: "example.table.danger",
      reads: ["terrain"],
      modifier: (ctx) => ctx.get<TerrainResult>("terrain")?.dangerMod ?? 0,
      after: (_ctx, result) => ({ ...(result as DangerResult), hostile: (result as DangerResult).level !== "quiet" }),
    },
    {
      id: "encounters",
      title: "Encounters",
      table: "example.table.encounter",
      reads: ["danger"],
      skipIf: (ctx) => ctx.get<DangerResult>("danger")?.level === "quiet",
      repeat: (ctx) => Number(ctx.inputs.days ?? 1),
    },
    {
      id: "omen",
      title: "Omen",
      optional: true,
      compute: (ctx, rng) => ({ sign: rng.int(1, 3), terrain: ctx.get<TerrainResult>("terrain")?.terrain ?? "unknown" }),
    },
  ],
  produce: (ctx: ProcedureContext) => {
    const terrain = ctx.get<TerrainResult>("terrain");
    const danger = ctx.get<DangerResult>("danger");
    const encounters = ctx.get<EncounterResult[]>("encounters") ?? [];
    const entities: ReturnType<Procedure["produce"]>["entities"] = [
      {
        tempId: "place",
        type: "example.place",
        name: `The ${terrain?.terrain ?? "unknown"} of seed`,
        fields: { terrain: terrain?.terrain, danger: danger?.level ?? "quiet", population: 0, features: [] },
      },
    ];
    const relationships: ReturnType<Procedure["produce"]>["relationships"] = [];
    encounters.forEach((e, i) => {
      if (e.kind === "nothing") return;
      const tempId = `encounter-${i}`;
      entities.push({
        tempId,
        type: "example.hero",
        name: e.kind === "bandits" ? `Bandit chief ${i + 1}` : `Traveller ${i + 1}`,
        summary: e.rumor,
        fields: { attributes: { might: 2, wits: 2 }, wounds: 0 },
        within: "place",
      });
      relationships.push({ type: "found_at", from: tempId, to: "place" });
      if (e.kind === "bandits") relationships.push({ type: "example.guards", from: tempId, to: "place", note: `${e.lairs?.length ?? 0} lairs` });
    });
    return { entities, relationships };
  },
};

// ---------------------------------------------------------------------------
// Rules, trackers, templates
// ---------------------------------------------------------------------------

const rules: RuleCard[] = [
  {
    id: "example.rule.push",
    title: "Pushing a roll",
    summary: "Re-roll every die that is not a success, once.",
    page: 12,
    tags: ["dice"],
    links: { fields: ["example.hero.attributes.might"], rules: ["example.rule.wounds"] },
  },
  {
    id: "example.rule.wounds",
    title: "Wounds",
    summary: "Each hit adds a wound; at Health wounds the hero is broken.",
    page: 20,
    links: { fields: ["example.hero.wounds"], trackers: ["example.tracker.wounds"], tables: ["example.table.danger"] },
  },
  {
    id: "example.rule.doom",
    title: "Doom",
    summary: "In hardcore play, every pushed roll adds a point of Doom.",
    page: 44,
    mode: ["hardcore"],
    links: { fields: ["example.hero.doom"], rules: ["example.rule.push"] },
  },
];

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export const exampleModule: GameModule = {
  manifest: {
    id: "example",
    version: "0.1.0",
    name: "Example Quest",
    ruleset: "Example Quest",
    edition: "Fixture",
    publisher: "Campaign Forge",
    licenseNotice: "Fictional fixture data. No rights reserved.",
    requiredCore: "0.1.0",
    modes: [
      { id: "standard", name: "Standard", description: "The default way to play." },
      { id: "hardcore", name: "Hardcore", description: "Doom accumulates.", page: 44 },
    ],
    defaultMode: "standard",
    dataStatus: "verified",
    sourceBook: { title: "Example Quest Core Book", year: 2026 },
  },
  dice: exampleDice,
  entityTypes: [heroType, placeType],
  relationshipTypes: [{ id: "example.guards", forward: "guards", reverse: "guarded by", fromKinds: ["character"], toKinds: ["location"] }],
  referenceLists: [
    {
      id: "example.origins",
      name: "Origins",
      page: 15,
      itemSchema: { type: "object", properties: { bonus: { type: "string" } }, required: ["id", "name", "bonus"] },
      items: [
        { id: "hill", name: "Hill folk", bonus: "might" },
        { id: "coast", name: "Coast folk", bonus: "wits" },
        { id: "city", name: "City folk", bonus: "lore" },
      ],
    },
    {
      id: "example.skills",
      name: "Skills",
      page: 16,
      items: [
        { id: "fight", name: "Fight", attribute: "might" },
        { id: "lore", name: "Lore", attribute: "wits" },
        { id: "sneak", name: "Sneak", attribute: "wits" },
        { id: "endure", name: "Endure", attribute: "might", mode: ["hardcore"] },
      ],
    },
  ],
  presets: [
    {
      id: "example.preset.veteran",
      entityType: "example.hero",
      name: "Veteran",
      page: 50,
      tags: ["npc"],
      fields: { attributes: { might: 4, wits: 2 }, skills: { fight: 2 }, origin: "hill", wounds: 0, gear: [{ name: "Sword", weight: 2 }] },
    },
    {
      id: "example.preset.old-tower",
      entityType: "example.place",
      name: "Old tower",
      page: 51,
      fields: { terrain: "hills", danger: "uneasy", population: 3, features: ["crumbling", "watchfire"] },
    },
  ],
  tables: [terrainTable, dangerTable, rumorTable, encounterTable],
  procedures: [expedition],
  templates: [
    {
      id: "example.template.quest",
      kind: "adventure",
      name: "Simple quest",
      page: 60,
      scaffold: {
        title: "A Simple Quest",
        premise: "Someone needs something fetched from somewhere dangerous.",
        acts: [
          { number: 1, goal: "Accept the job and travel", scenes: [{ purpose: "The hook", mandatory: true }] },
          { number: 2, goal: "Face the danger and return", scenes: [{ purpose: "The climax", mandatory: true }, { purpose: "The reward" }] },
        ],
      },
    },
    {
      id: "example.template.doom-session",
      kind: "session",
      name: "Hardcore session",
      mode: ["hardcore"],
      scaffold: { title: "Hardcore session", items: [{ id: "doom", text: "Tally Doom", kind: "number" as const }] },
    },
  ],
  rules,
  trackers: [
    {
      id: "example.tracker.wounds",
      name: "Wounds",
      kind: "counter",
      scope: "character",
      page: 20,
      binds: ["example.hero.wounds"],
      rules: ["example.rule.wounds"],
      config: { max: { computed: "health" } },
    },
  ],
  calendar: {
    id: "example.calendar",
    name: "Seasons",
    defaultYear: 1000,
    months: [
      { name: "Thaw", days: 30 },
      { name: "Bloom", days: 30 },
      { name: "Harvest", days: 30 },
      { name: "Frost", days: 30 },
    ],
    weekdays: ["Sun", "Moon", "Tree", "Stone", "River"],
    format: "{year}-{month:02}-{day:02}",
  },
  styleNotes: ["Short, plain sentences."],
  hooks: {
    onSessionEnd(ctx): Prompt[] {
      const onYes: Effect[] = ctx.characters.map((c) => ({ kind: "incrementField", entity: c.id, path: "wounds", by: -1, min: 0 }));
      return [{ id: "example.prompt.rest", kind: "yesno", text: "Did the heroes rest safely?", page: 21, onYes }];
    },
  },
};

export default exampleModule;
