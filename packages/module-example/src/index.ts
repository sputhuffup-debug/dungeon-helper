/**
 * Example Quest: a tiny fictional fixture module. Core, sdk and ui test
 * against this so nothing game-specific leaks into the core. It exercises
 * every contract feature once and must pass `checkModule` with zero errors.
 */
import type {
  AdventureBuilderDef,
  DicePool,
  DiceSystem,
  Effect,
  EntityTypeDef,
  GameModule,
  NarrativeFieldsDef,
  Procedure,
  ProcedureContext,
  Prompt,
  RolledDie,
  RollResult,
  RollTable,
  Rng,
  RuleCard,
} from "@campaign-forge/module-sdk";
import { examplePlayGuide } from "./guide";
import { exampleSiteGenerator } from "./sitemap";

export { exampleSiteGenerator } from "./sitemap";
export { examplePlayGuide } from "./guide";

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
  operations: {
    // One d6 for the curse life cycle: a bane (1) marks the hero for good.
    omen: {
      id: "omen",
      name: "Omen",
      page: 22,
      input: { type: "object", properties: { entity: { type: "string" } } },
      run(input, rng) {
        const value = rng.int(1, 6);
        const marked = value === 1;
        const effects: Effect[] = [{ kind: "log", text: `Omen: ${value}` }];
        if (marked && typeof input.entity === "string") effects.push({ kind: "addCondition", entity: input.entity, condition: { id: "example.marked", label: "Marked" } });
        return { total: value, rolls: [{ step: "omen", dice: "1d6", raw: [value], modifier: 0, total: value, result: { marked } }], result: { marked }, label: marked ? "Marked" : "Spared", effects };
      },
    },
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
      armor: { type: "integer", minimum: 0, maximum: 3 },
      construct: { type: "boolean" },
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
          { path: "armor", label: "Armor", widget: "number" },
          { path: "construct", label: "Construct", widget: "checkbox" },
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

/** A creature that takes turns at the table: Speed, Health, damage, armor, a venom reaction and a signature attack table. */
const beastType: EntityTypeDef = {
  id: "example.beast",
  kind: "creature",
  name: "Beast",
  plural: "Beasts",
  icon: "bug",
  schema: {
    type: "object",
    properties: {
      speed: { type: "integer", minimum: 1, maximum: 3, default: 1 },
      health: { type: "integer", minimum: 1, default: 4 },
      damage: { type: "integer", minimum: 0, default: 0 },
      armor: { type: "integer", minimum: 0, default: 0 },
      armorVsFire: { type: "integer", minimum: 0 },
      venom: { type: "integer", minimum: 0 },
      attackTable: { type: "string", default: "example.table.beast-attacks" },
    },
    additionalProperties: false,
  },
  sheet: {
    sections: [
      {
        id: "stats",
        title: "Stats",
        columns: 3,
        fields: [
          { path: "speed", label: "Speed", widget: "number" },
          { path: "health", label: "Health", widget: "number" },
          { path: "damage", label: "Damage taken", widget: "number" },
          { path: "armor", label: "Armor", widget: "number" },
          { path: "armorVsFire", label: "Armor vs fire", widget: "number" },
          { path: "venom", label: "Venom", widget: "number" },
          { path: "attackTable", label: "Attack table", widget: "text" },
        ],
      },
    ],
    summary: ["speed", "armor"],
  },
  defaultVisibility: { attackTable: "gm", venom: "gm" },
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

/** Rolled at the table when a token enters a crawlway (the site map generator's zone table). */
const crawlTable: RollTable = {
  id: "example.table.crawl",
  name: "Crawl events",
  page: 72,
  dice: "1d6",
  rows: [
    { range: [1, 2], label: "A dry nook", result: { kind: "comfort", text: "A dry nook to catch your breath." } },
    { range: [3, 4], label: "Rats", result: { kind: "encounter", text: "Rats pour past; someone must keep still." } },
    { range: [5, 5], label: "Loose panel", result: { kind: "danger", text: "A panel gives way under the lead crawler." } },
    { range: [6, 6], label: "Followed", result: { kind: "encounter", text: "Scratching behind you, keeping pace." } },
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

/** The beast's signature attacks: rows follow the attack convention `{ name, dice, damage, armorPiercing?, effect }`. */
const beastAttackTable: RollTable = {
  id: "example.table.beast-attacks",
  name: "Beast attacks",
  page: 33,
  dice: "1d6",
  tags: ["attack"],
  rows: [
    { range: [1, 1], label: "Circle", result: { name: "Circle", dice: 0, damage: 0, effect: "It circles and growls; its next attack gets one extra die." } },
    { range: [2, 3], label: "Claw", result: { name: "Claw", dice: 3, damage: 1, armorPiercing: false, effect: "Raking claws." } },
    { range: [4, 5], label: "Lunge", result: { name: "Lunge", dice: 4, damage: 2, armorPiercing: false, effect: "The target is knocked prone." } },
    { range: [6, 6], label: "Venom bite", result: { name: "Venom bite", dice: 5, damage: 2, armorPiercing: true, effect: "Bites through armor; the target is poisoned." } },
  ],
};

/** Rolled when a hero is broken (Health at zero). */
const graveWoundTable: RollTable = {
  id: "example.table.grave-wound",
  name: "Grave wounds",
  page: 20,
  dice: "1d6",
  rows: [
    { range: [1, 2], label: "Winded", result: { text: "Out of breath; back on your feet next round." } },
    { range: [3, 4], label: "Broken arm", result: { text: "One arm is useless until healed." } },
    { range: [5, 5], label: "Bleeding", result: { text: "Lose one more Health each round until bandaged." } },
    { range: [6, 6], label: "Mortal wound", result: { text: "Dies within the hour without a healer." } },
  ],
};

/** Rolled instead of a grave wound when a construct hero is broken. */
const breakdownTable: RollTable = {
  id: "example.table.breakdown",
  name: "Construct breakdown",
  page: 21,
  dice: "1d6",
  rows: [
    { range: [1, 3], label: "Seized joint", result: { text: "Moves at half pace until oiled." } },
    { range: [4, 5], label: "Cracked core", result: { text: "Every roll loses one die until mended." } },
    { range: [6, 6], label: "Shutdown", result: { text: "Inert until a smith restarts it." } },
  ],
};

/** Rolled when a beast is broken. */
const beastBrokenTable: RollTable = {
  id: "example.table.beast-broken",
  name: "Broken beast",
  page: 34,
  dice: "1d6",
  rows: [
    { range: [1, 3], label: "Flees", result: { text: "It bolts for its lair." } },
    { range: [4, 5], label: "Cornered", result: { text: "It fights on with one last attack." } },
    { range: [6, 6], label: "Dead", result: { text: "It falls and does not rise." } },
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
      reads: ["terrain"],
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
// Narrative fields and the guided quest builder
// ---------------------------------------------------------------------------

const narrativeFields: NarrativeFieldsDef[] = [
  {
    kind: "adventure",
    schema: {
      type: "object",
      properties: {
        hook: { type: "string" },
        theme: { type: "string", enum: ["greed", "honor", "revenge"], default: "greed" },
        hours: { type: "integer", minimum: 1, maximum: 8, default: 3 },
      },
      additionalProperties: false,
    },
    sheet: {
      sections: [
        {
          id: "basics",
          title: "Basics",
          columns: 2,
          fields: [
            { path: "hook", label: "Hook", widget: "textarea", span: 12 },
            { path: "theme", label: "Theme", widget: "select", options: ["greed", "honor", "revenge"] },
            { path: "hours", label: "Target length (hours)", widget: "number" },
            { path: "minutes", label: "Minutes", widget: "computed" },
          ],
        },
      ],
    },
    computed: { minutes: { "*": [{ var: "fields.hours" }, 60] } },
  },
  {
    kind: "act",
    schema: { type: "object", properties: { twist: { type: "string" }, mood: { type: "string", enum: ["calm", "tense", "dire"], default: "calm" } }, additionalProperties: false },
    sheet: { sections: [{ id: "act", title: "Act", fields: [{ path: "twist", label: "Twist", widget: "textarea" }, { path: "mood", label: "Mood", widget: "select" }] }] },
  },
  {
    kind: "scene",
    schema: { type: "object", properties: { trigger: { type: "string" } }, additionalProperties: false },
    sheet: { sections: [{ id: "scene", title: "Scene", fields: [{ path: "trigger", label: "Trigger" }] }] },
  },
];

const questBuilder: AdventureBuilderDef = {
  id: "example.builder.quest",
  name: "Guided quest",
  description: "A short quest built step by step, with a review.",
  page: 60,
  templateId: "example.template.quest",
  cast: [
    { id: "heroes", label: "Heroes", entityType: "example.hero", defaults: { origin: "hill" }, fields: ["attributes.might", "attributes.wits", "origin", "health"], min: 1 },
    { id: "places", label: "Places", entityType: "example.place", fields: ["terrain", "danger"] },
  ],
  steps: [
    {
      id: "basics",
      title: "Basics",
      page: 60,
      guide: ["One hook the heroes cannot ignore.", "Pick a theme and keep every scene on it."],
      panels: [{ kind: "adventure", fields: ["core.title", "core.premise", "hook", "theme", "hours", "minutes", "core.playerIntro"] }],
    },
    {
      id: "cast",
      title: "Cast",
      guide: ["Every hero wants something.", "Places need one danger each."],
      panels: [{ kind: "cast", role: "heroes" }, { kind: "agendas", role: "heroes" }, { kind: "cast", role: "places" }],
    },
    {
      id: "acts",
      title: "Acts",
      guide: ["Act 1 sets the hook, act 2 pays it off.", "Give each act a twist."],
      panels: [
        { kind: "act", act: 1, fields: ["core.title", "core.goal", "twist", "mood"], scenes: true, sceneFields: ["trigger"] },
        { kind: "act", act: 2, fields: ["core.title", "core.goal", "twist", "mood"], scenes: true, sceneFields: ["trigger"] },
      ],
    },
    { id: "review", title: "Review", guide: ["Fix red items first.", "Warnings are advice; nothing is blocked."], panels: [{ kind: "review" }] },
  ],
  review: [
    {
      id: "example.review.hook",
      step: "basics",
      level: "bad",
      when: { "!": { len: { trim: { var: "adventure.fields.hook" } } } },
      message: "Write the hook",
      okMessage: "Hook written",
      page: 60,
    },
    {
      id: "example.review.heroes",
      step: "cast",
      level: "bad",
      when: { "<": [{ len: { var: "heroes" } }, 1] },
      value: { len: { var: "heroes" } },
      message: "Add at least one hero",
      okMessage: "{value} hero(es) in the cast",
    },
    {
      id: "example.review.agenda",
      step: "cast",
      level: "warn",
      each: "heroes",
      when: { "<": [{ words: { var: "item.agendaByAct.1" } }, 3] },
      message: "{name}: give the act 1 agenda a concrete goal",
    },
    {
      id: "example.review.twists",
      step: "acts",
      level: "warn",
      check: (_item, ctx) => {
        const acts = Array.isArray(ctx.acts) ? (ctx.acts as Array<{ number: number; fields: Record<string, unknown> }>) : [];
        return acts.filter((a) => !String(a.fields.twist ?? "").trim()).map((a) => `Act ${a.number}: add a twist`);
      },
      message: "Every act needs a twist",
      okMessage: "Every act has a twist",
    },
  ],
};

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
  entityTypes: [heroType, placeType, beastType],
  relationshipTypes: [
    { id: "example.guards", forward: "guards", reverse: "guarded by", fromKinds: ["character"], toKinds: ["location"] },
    { id: "example.risen_from", forward: "risen from", reverse: "raised", fromKinds: ["character"], toKinds: ["character"] },
  ],
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
  tables: [terrainTable, dangerTable, rumorTable, encounterTable, crawlTable, beastAttackTable, graveWoundTable, breakdownTable, beastBrokenTable],
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
          { number: 2, goal: "Face the danger and return", fields: { mood: "tense" }, scenes: [{ purpose: "The climax", mandatory: true, fields: { trigger: "The heroes reach the lair" } }, { purpose: "The reward" }] },
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
    {
      // Added to the generic session checklist every session.
      id: "example.template.session-checklist",
      kind: "checklist",
      appliesTo: "session",
      name: "Example Quest session checklist",
      page: 21,
      scaffold: {
        title: "Example Quest",
        items: [
          { id: "example.prep.omens", phase: "prep", text: "Pick tonight's omen", guidance: "Choose one sign the heroes might notice." },
          { id: "example.wrap.rest", phase: "wrap", text: "Ask whether the heroes rested", guidance: "Resting heals one wound.", page: 21, autoWhen: "prompts-answered" },
          { id: "example.wrap.doom", phase: "wrap", text: "Tally Doom", mode: ["hardcore"] },
        ],
      },
    },
  ],
  rules,
  trackers: [
    {
      // Cards 1-10 each round; a beast draws one card per point of Speed and keeps the best.
      id: "example.tracker.initiative",
      name: "Initiative",
      kind: "initiative",
      scope: "encounter",
      page: 18,
      config: { cards: 10, drawsField: "speed" },
    },
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
    {
      // A generic life cycle: a curse that runs on in-world time and raises the victim as a veteran revenant.
      id: "example.tracker.curse",
      name: "Curses",
      kind: "lifecycle",
      scope: "campaign",
      page: 22,
      config: {
        units: [
          { id: "hour", name: "Hour", minutes: 60 },
          { id: "day", name: "Day", minutes: 1440 },
        ],
        paces: [
          { id: "slower", label: "Slower", factor: 0.5 },
          { id: "normal", label: "Normal", factor: 1 },
          { id: "faster", label: "Faster", factor: 2 },
        ],
        defaultPace: "normal",
        defaultVariant: "curse",
        spawn: { name: "Revenant of {host}", link: { type: "example.risen_from" } },
        start: { label: "Curse", entityKinds: ["character"] },
        labels: { instance: "Curse", subject: "Victim" },
        variants: [
          {
            id: "curse",
            name: "Grave curse",
            stages: [
              {
                id: "marked",
                name: "Marked",
                label: "Stage 1",
                page: 22,
                duration: { amount: 1, unit: "day" },
                next: [{ to: "fading" }],
                check: { label: "Omen", operation: "omen", every: { amount: 6, unit: "hour" }, stopCondition: "example.marked" },
                removal: { label: "Lift the curse", blockedByCondition: "example.marked", blockedNote: "Too late to lift it.", effects: [{ kind: "log", text: "{host} is free." }] },
              },
              { id: "fading", name: "Fading", label: "Stage 2", duration: { amount: [1, 3], unit: "day" }, next: [{ to: "risen" }] },
              { id: "risen", name: "Risen", label: "Stage 3", creaturePreset: "example.preset.veteran", next: [{ to: "lord", label: "Lord", condition: "When the GM says." }], waitNote: "Waits for a dark moon." },
              { id: "lord", name: "Lord", label: "Stage 4", finalNote: "Nothing comes after." },
            ],
          },
        ],
      },
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
  narrativeFields,
  adventureBuilders: [questBuilder],
  mapGenerators: [exampleSiteGenerator],
  playGuides: [examplePlayGuide],
  combat: {
    health: [
      {
        entityType: "example.hero",
        damagePath: "wounds",
        maxPath: "health",
        armorPath: "armor",
        page: 20,
        broken: [
          { when: { "!!": [{ var: "fields.construct" }] }, table: "example.table.breakdown", label: "Breakdown" },
          { table: "example.table.grave-wound", label: "Grave wound" },
        ],
      },
      { entityType: "example.beast", damagePath: "damage", maxPath: "health", armorPath: "armor", armorBySource: { fire: "armorVsFire" }, page: 34, broken: [{ table: "example.table.beast-broken", label: "Broken" }] },
    ],
    // Armor stops its rating in damage; armor piercing ignores it; each extra success adds one damage (p. 20).
    resolveHit(hit) {
      const armor = hit.armorPiercing ? 0 : hit.armor;
      const extra = Math.max(0, hit.extraSuccesses ?? 0);
      const total = hit.damage + extra;
      const damage = Math.max(0, total - armor);
      const parts = [`${hit.damage} damage`, ...(extra ? [`+${extra} extra`] : []), hit.armorPiercing ? `armor piercing (armor ${hit.armor} ignored)` : `− armor ${armor}`];
      return { damage, explain: `${parts.join(" ")} = ${damage} (p. 20)` };
    },
    creatureTurns: [
      {
        entityType: "example.beast",
        speedPath: "speed",
        attackTablePath: "attackTable",
        page: 33,
        notes: [
          { text: "One attack per point of Speed each round.", page: 33 },
          { text: "Re-roll an attack that cannot reach any target, or pick one if the scene calls for it.", page: 33 },
        ],
        onDamaged: { label: "Venom spray", ratingPath: "venom", addDamageTaken: true, damage: 1, reach: "everything in the same zone", exceptSources: ["fire"], text: "Wounded beasts spray venom.", page: 34 },
      },
    ],
    specialAttacks: [
      { id: "example.special.shove", name: "Shove", roll: "fight", action: "quick", opposed: "attr:might", requires: "Adjacent", effect: "Push the target into the next zone or knock it prone.", page: 19 },
      { id: "example.special.disarm", name: "Disarm", roll: "fight", action: "full", opposed: "fight", requires: "Adjacent; the target holds a weapon", effect: "The target's weapon lands in the zone.", page: 19 },
      { id: "example.special.feint", name: "Feint", roll: "sneak", action: "quick", requires: "Adjacent", effect: "Your next attack this round gets two extra dice.", page: 19 },
    ],
    opposedTies: { winner: "defender", text: "A tie goes to the defender.", page: 19 },
    rules: ["example.rule.wounds", "example.rule.push"],
  },
  hooks: {
    onSessionEnd(ctx): Prompt[] {
      const onYes: Effect[] = ctx.characters.map((c) => ({ kind: "incrementField", entity: c.id, path: "wounds", by: -1, min: 0 }));
      return [{ id: "example.prompt.rest", kind: "yesno", text: "Did the heroes rest safely?", page: 21, onYes }];
    },
  },
};

export default exampleModule;
