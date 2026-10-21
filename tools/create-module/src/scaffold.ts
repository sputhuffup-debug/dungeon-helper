/**
 * Starter modules for `pnpm create-module`: a data pack (JSON) or a
 * TypeScript module package, for one of the built-in dice engines. Both pass
 * `pnpm module-check` as written, so an author starts from green and changes
 * one thing at a time.
 */
import {
  CONTRACT_VERSION,
  PACK_FORMAT,
  PACK_FORMAT_VERSION,
  PACK_ID_PATTERN,
  type CalendarDef,
  type DiceEngineConfig,
  type DiceEngineId,
  type EntityTypeDef,
  type ModulePack,
  type PackManifest,
  type PackProcedure,
  type ReferenceList,
  type RollTable,
  type RuleCard,
  type Template,
} from "@campaign-forge/module-sdk";

export const ENGINES: readonly DiceEngineId[] = ["d20", "pool", "2d6", "d100"];

/** Ids of modules built into the app; a new module may not take one. */
export const RESERVED_IDS = ["alien", "example", "example-pack"];

export interface ScaffoldOptions {
  /** Display name, e.g. "Sky Pirates". */
  name: string;
  engine: DiceEngineId;
  /** Module id (default: the name, slugified). */
  id?: string;
  author?: string;
  /** Year for the licence line (default 2026; pass one for reproducible output). */
  year?: number;
}

/** "Sky Pirates!" -> "sky-pirates". */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^[^a-z]+/, "")
    .slice(0, 48)
    .replace(/-+$/, "");
}

/** "sky-pirates" -> "skyPirates". */
export function camelCase(id: string): string {
  return id.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/** Problems with a module id, or an empty list. */
export function idProblems(id: string): string[] {
  const out: string[] = [];
  if (!new RegExp(PACK_ID_PATTERN).test(id)) out.push(`"${id}" is not a valid module id: lower-case letters, digits and hyphens, starting with a letter, 2-48 characters`);
  if (RESERVED_IDS.includes(id)) out.push(`"${id}" is the id of a module built into the app`);
  return out;
}

// ---------------------------------------------------------------------------
// The character sheet each engine starts with
// ---------------------------------------------------------------------------

interface EngineStarter {
  dice: DiceEngineConfig;
  character: Omit<EntityTypeDef, "id">;
  /** The reference list the skills widget reads (or moves, for 2d6). */
  list: Omit<ReferenceList, "id">;
  rollingRule: string;
}

const int = (minimum: number, maximum: number, def: number) => ({ type: "integer", minimum, maximum, default: def });
const props = (keys: string[], schema: Record<string, unknown>) => Object.fromEntries(keys.map((k) => [k, schema]));
const title = (s: string) => s[0]!.toUpperCase() + s.slice(1);

function skillsList(skills: Array<[string, string]>, summaryOf: (attr: string) => string): Omit<ReferenceList, "id"> {
  return {
    name: "Skills",
    original: true,
    itemSchema: { type: "object", properties: { attribute: { type: "string" } }, required: ["id", "name", "attribute"] },
    items: skills.map(([id, attribute]) => ({ id, name: title(id), attribute, summary: summaryOf(attribute) })),
  };
}

function starter(id: string, engine: DiceEngineId): EngineStarter {
  switch (engine) {
    case "d20": {
      const abilities = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
      const skills: Array<[string, string]> = [["athletics", "strength"], ["stealth", "dexterity"], ["lore", "intelligence"], ["insight", "wisdom"], ["persuasion", "charisma"]];
      return {
        dice: { engine: "d20", proficiency: { var: "computed.proficiencyBonus" } },
        rollingRule: "Roll a d20 and add the ability modifier, plus the proficiency bonus when proficient. Meet or beat the DC to succeed.",
        list: skillsList(skills, (a) => `Rolled with ${title(a)}.`),
        character: {
          kind: "character",
          name: "Character",
          plural: "Characters",
          icon: "shield",
          schema: {
            type: "object",
            properties: {
              level: int(1, 20, 1),
              abilities: { type: "object", properties: props(abilities, int(1, 30, 10)), required: abilities, additionalProperties: false },
              skills: { type: "object", properties: props(skills.map(([s]) => s), int(0, 2, 0)), additionalProperties: false },
              damage: int(0, 999, 0),
              isPC: { type: "boolean", default: false },
              notes: { type: "string" },
            },
            required: ["abilities"],
            additionalProperties: false,
          },
          computed: {
            proficiencyBonus: { "+": [2, { floor: { "/": [{ "-": [{ var: ["fields.level", 1] }, 1] }, 4] } }] },
            maxHp: { "+": [{ "*": [{ var: ["fields.level", 1] }, 6] }, { floor: { "/": [{ "-": [{ var: ["fields.abilities.constitution", 10] }, 10] }, 2] } }] },
          },
          sheet: {
            sections: [
              { id: "abilities", title: "Abilities", columns: 3, fields: abilities.map((a) => ({ path: `abilities.${a}`, label: title(a), widget: "attribute" as const })) },
              {
                id: "skills",
                title: "Skills",
                fields: [
                  { path: "skills.*", label: "Skills (0 none, 1 proficient, 2 expertise)", widget: "skills", config: { ref: `${id}.skills`, attributesPath: "abilities", max: 2 } },
                  { path: "proficiencyBonus", label: "Proficiency bonus", widget: "computed" },
                ],
              },
              { id: "vitals", title: "Vitals", columns: 2, fields: [{ path: "level", widget: "number" }, { path: "damage", label: "Damage taken", widget: "number" }, { path: "maxHp", label: "Max HP", widget: "computed" }, { path: "isPC", label: "Player character", widget: "checkbox" }] },
              { id: "notes", title: "Notes", collapsed: true, fields: [{ path: "notes", widget: "textarea" }] },
            ],
            summary: ["level", "maxHp"],
          },
          defaultVisibility: { notes: "gm" },
        },
      };
    }
    case "pool": {
      const attributes = ["strength", "agility", "wits", "empathy"];
      const skills: Array<[string, string]> = [["force", "strength"], ["move", "agility"], ["observe", "wits"], ["manipulate", "empathy"]];
      return {
        dice: { engine: "pool", dice: [{ id: "base", name: "Base die", success: [6], bane: [1] }], push: { max: 1 } },
        rollingRule: "Roll a d6 for each point of attribute and skill; every 6 is a success. You may push once: re-roll every die that is not a success.",
        list: skillsList(skills, (a) => `Rolled with ${title(a)}.`),
        character: {
          kind: "character",
          name: "Character",
          plural: "Characters",
          icon: "shield",
          schema: {
            type: "object",
            properties: {
              attributes: { type: "object", properties: props(attributes, int(1, 5, 2)), required: attributes, additionalProperties: false },
              skills: { type: "object", properties: props(skills.map(([s]) => s), int(0, 5, 0)), additionalProperties: false },
              damage: int(0, 10, 0),
              isPC: { type: "boolean", default: false },
              notes: { type: "string" },
            },
            required: ["attributes"],
            additionalProperties: false,
          },
          computed: { health: { var: ["fields.attributes.strength", 0] } },
          sheet: {
            sections: [
              { id: "attributes", title: "Attributes", columns: 2, fields: attributes.map((a) => ({ path: `attributes.${a}`, label: title(a), widget: "attribute" as const })) },
              { id: "skills", title: "Skills", fields: [{ path: "skills.*", label: "Skills", widget: "skills", config: { ref: `${id}.skills` } }] },
              { id: "vitals", title: "Vitals", columns: 2, fields: [{ path: "damage", label: "Damage", widget: "number" }, { path: "health", label: "Health", widget: "computed" }, { path: "isPC", label: "Player character", widget: "checkbox" }] },
              { id: "notes", title: "Notes", collapsed: true, fields: [{ path: "notes", widget: "textarea" }] },
            ],
            summary: ["health"],
          },
          defaultVisibility: { notes: "gm" },
        },
      };
    }
    case "2d6": {
      const stats = ["cool", "hard", "hot", "sharp", "weird"];
      return {
        dice: { engine: "2d6" },
        rollingRule: "Roll 2d6 and add the stat. On 10+ you do it; on 7-9 you do it at a cost; on 6- the GM makes a move.",
        list: {
          name: "Moves",
          original: true,
          items: [
            { id: "act-under-pressure", name: "Act under pressure", stat: "cool", summary: "When you keep your head when it counts, roll +cool." },
            { id: "read-a-situation", name: "Read a situation", stat: "sharp", summary: "When you size up what is going on, roll +sharp." },
          ],
        },
        character: {
          kind: "character",
          name: "Character",
          plural: "Characters",
          icon: "shield",
          schema: {
            type: "object",
            properties: {
              attributes: { type: "object", properties: props(stats, int(-2, 3, 0)), required: stats, additionalProperties: false },
              harm: int(0, 6, 0),
              isPC: { type: "boolean", default: false },
              notes: { type: "string" },
            },
            required: ["attributes"],
            additionalProperties: false,
          },
          sheet: {
            sections: [
              { id: "stats", title: "Stats", columns: 3, fields: stats.map((s) => ({ path: `attributes.${s}`, label: title(s), widget: "attribute" as const })) },
              { id: "harm", title: "Harm", columns: 2, fields: [{ path: "harm", label: "Harm", widget: "number" }, { path: "isPC", label: "Player character", widget: "checkbox" }] },
              { id: "notes", title: "Notes", collapsed: true, fields: [{ path: "notes", widget: "textarea" }] },
            ],
            summary: ["harm"],
          },
          defaultVisibility: { notes: "gm" },
        },
      };
    }
    case "d100": {
      const characteristics = ["strength", "constitution", "dexterity", "intelligence", "power"];
      const skills: Array<[string, string]> = [["spot", "intelligence"], ["climb", "strength"], ["dodge", "dexterity"], ["persuade", "power"]];
      return {
        dice: { engine: "d100", fumbleLowTarget: { below: 50, at: 96 }, push: { max: 1 } },
        rollingRule: "Roll d100 at or under the skill. Half the skill or less is a hard success, a fifth or less an extreme one. 01 is a critical, 100 a fumble.",
        list: skillsList(skills, (a) => `Starts at a fifth of ${title(a)}.`),
        character: {
          kind: "character",
          name: "Character",
          plural: "Characters",
          icon: "shield",
          schema: {
            type: "object",
            properties: {
              attributes: { type: "object", properties: props(characteristics, int(1, 100, 50)), required: characteristics, additionalProperties: false },
              skills: { type: "object", properties: props(skills.map(([s]) => s), int(0, 100, 20)), additionalProperties: false },
              damage: int(0, 99, 0),
              isPC: { type: "boolean", default: false },
              notes: { type: "string" },
            },
            required: ["attributes"],
            additionalProperties: false,
          },
          computed: { hitPoints: { floor: { "/": [{ "+": [{ var: ["fields.attributes.constitution", 50] }, { var: ["fields.attributes.strength", 50] }] }, 10] } } },
          sheet: {
            sections: [
              { id: "characteristics", title: "Characteristics", columns: 3, fields: characteristics.map((c) => ({ path: `attributes.${c}`, label: title(c), widget: "attribute" as const })) },
              { id: "skills", title: "Skills (%)", fields: [{ path: "skills.*", label: "Skills", widget: "skills", config: { ref: `${id}.skills`, max: 100 } }] },
              { id: "vitals", title: "Vitals", columns: 2, fields: [{ path: "damage", label: "Damage", widget: "number" }, { path: "hitPoints", label: "Hit points", widget: "computed" }, { path: "isPC", label: "Player character", widget: "checkbox" }] },
              { id: "notes", title: "Notes", collapsed: true, fields: [{ path: "notes", widget: "textarea" }] },
            ],
            summary: ["hitPoints"],
          },
          defaultVisibility: { notes: "gm" },
        },
      };
    }
  }
}

// ---------------------------------------------------------------------------
// The parts every starter shares
// ---------------------------------------------------------------------------

function common(opts: Required<Omit<ScaffoldOptions, "id">> & { id: string }) {
  const { id, name, author, year, engine } = opts;
  const s = starter(id, engine);
  const manifest: PackManifest = {
    id,
    version: "0.1.0",
    name,
    ruleset: name,
    publisher: author,
    licenseNotice: `${name} for Campaign Forge, written by ${author}.`,
    requiredCore: CONTRACT_VERSION,
    modes: [{ id: "standard", name: "Standard", description: "The default way to play." }],
    defaultMode: "standard",
    dataStatus: "unverified",
    license: {
      name: "All rights reserved",
      attribution: `${name} © ${year} ${author}. Replace this with the attribution your source's licence requires (e.g. CC-BY-4.0 credits).`,
    },
    citationStyle: "page",
    sourceBook: { title: `${name} rules`, pageNote: "Replace with the book your page numbers point to." },
    authors: [author],
  };
  const character: EntityTypeDef = { id: `${id}.character`, ...s.character };
  const place: EntityTypeDef = {
    id: `${id}.place`,
    kind: "location",
    name: "Place",
    plural: "Places",
    icon: "map",
    schema: {
      type: "object",
      properties: { danger: { type: "string", enum: ["quiet", "uneasy", "dangerous"], default: "quiet" }, features: { type: "array", items: { type: "string" }, default: [] } },
      additionalProperties: false,
    },
    sheet: { sections: [{ id: "overview", title: "Overview", fields: [{ path: "danger", widget: "select", options: ["quiet", "uneasy", "dangerous"] }, { path: "features", widget: "tags" }] }], summary: ["danger"] },
  };
  const list: ReferenceList = { id: `${id}.${engine === "2d6" ? "moves" : "skills"}`, ...s.list };
  const tables: RollTable[] = [
    {
      id: `${id}.place.danger`,
      name: "Danger",
      family: "place",
      original: true,
      dice: "1d6",
      notes: "Replace with your own table, and cite its page.",
      rows: [
        { range: [1, 3], label: "Quiet", result: { level: "quiet" } },
        { range: [4, 5], label: "Uneasy", result: { level: "uneasy" } },
        { range: [6, 6], label: "Dangerous", result: { level: "dangerous" } },
      ],
    },
    {
      id: `${id}.place.feature`,
      name: "Feature",
      family: "place",
      original: true,
      dice: "1d6",
      rows: [
        { range: [1, 2], label: "Ruined wall", result: { feature: "ruined wall" } },
        { range: [3, 4], label: "Old well", result: { feature: "old well" } },
        { range: [5, 6], label: "Watchtower", result: { feature: "watchtower" } },
      ],
    },
  ];
  const rules: RuleCard[] = [
    { id: `${id}.rule.rolling`, title: "Rolling the dice", summary: s.rollingRule, original: true, tags: ["dice"], links: { fields: [`${id}.character`] } },
  ];
  const templates: Template[] = [
    {
      id: `${id}.template.session`,
      kind: "checklist",
      appliesTo: "session",
      name: `${name} session checklist`,
      original: true,
      scaffold: { title: name, items: [{ id: `${id}.prep.recap`, phase: "prep", text: "Write a two-line recap of last session" }] },
    },
  ];
  const calendar: CalendarDef = { id: `${id}.calendar`, name: "Calendar", defaultYear: 1, months: Array.from({ length: 12 }, (_, i) => ({ name: `Month ${i + 1}`, days: 30 })), format: "{year}-{month:02}-{day:02}" };
  return { manifest, dice: s.dice, character, place, list, tables, rules, templates, calendar };
}

function resolveOptions(opts: ScaffoldOptions) {
  if (!ENGINES.includes(opts.engine)) throw new Error(`unknown engine "${opts.engine}" (${ENGINES.join(", ")})`);
  const id = opts.id ?? slugify(opts.name);
  const problems = idProblems(id);
  if (problems.length > 0) throw new Error(problems.join("; "));
  return { id, name: opts.name.trim() || id, engine: opts.engine, author: opts.author?.trim() || "the author", year: opts.year ?? 2026 };
}

/** The starter data pack (one file). */
export function scaffoldPack(opts: ScaffoldOptions): ModulePack {
  const o = resolveOptions(opts);
  const c = common(o);
  const procedure: PackProcedure = {
    id: `${o.id}.proc.place`,
    name: "Place",
    description: "Roll a place: how dangerous it is and what stands there.",
    original: true,
    steps: [
      { id: "danger", title: "Danger", table: `${o.id}.place.danger` },
      { id: "features", title: "Features", table: `${o.id}.place.feature`, repeat: "1d2" },
    ],
    produce: {
      entities: [
        {
          tempId: "place",
          type: `${o.id}.place`,
          name: { cat: ["A ", { var: "results.danger.level" }, " place"] },
          fields: { danger: { var: "results.danger.level" }, features: { map: [{ var: "results.features" }, { var: "feature" }] } },
        },
      ],
    },
  };
  return {
    $schema: "https://campaign-forge.dev/schema/module-pack.schema.json",
    format: PACK_FORMAT,
    formatVersion: PACK_FORMAT_VERSION,
    manifest: c.manifest,
    dice: c.dice,
    entityTypes: [c.character, c.place],
    referenceLists: [c.list],
    tables: c.tables,
    procedures: [procedure],
    templates: c.templates,
    rules: c.rules,
    calendar: c.calendar,
  };
}

const json = (v: unknown, indent = 0) => JSON.stringify(v, null, 2).replace(/\n/g, `\n${" ".repeat(indent)}`);

/** The starter TypeScript module package: file path (relative to the package folder) -> contents. */
export function scaffoldTsModule(opts: ScaffoldOptions & { tsconfigBase?: string }): Record<string, string> {
  const o = resolveOptions(opts);
  const c = common(o);
  const name = `${camelCase(o.id)}Module`;
  const pkg = {
    name: `@campaign-forge/module-${o.id}`,
    version: "0.1.0",
    private: true,
    type: "module",
    main: "./src/index.ts",
    types: "./src/index.ts",
    exports: { ".": "./src/index.ts" },
    scripts: { typecheck: "tsc --noEmit -p tsconfig.json", test: "vitest run" },
    dependencies: { "@campaign-forge/module-sdk": "workspace:*" },
    devDependencies: { typescript: "^5.9.3", vitest: "^4.0.5" },
  };
  const tsconfig = opts.tsconfigBase
    ? { extends: opts.tsconfigBase, compilerOptions: { noEmit: true, types: ["node"] }, include: ["src", "test"] }
    : { compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", strict: true, noEmit: true, skipLibCheck: true, resolveJsonModule: true, types: ["node"] }, include: ["src", "test"] };
  const index = `/**
 * ${o.name}: a Campaign Forge game module, scaffolded by \`pnpm create-module\`.
 *
 * Data is plain objects typed by the SDK contract; procedures are functions,
 * so they can compute anything, as long as every random number comes from
 * the step's rng (rule 3). Check it with \`pnpm module-check <this folder>\`.
 * See docs/modules/typescript-modules.md.
 */
import {
  createDiceEngine,
  type CalendarDef,
  type EntityTypeDef,
  type GameModule,
  type Procedure,
  type ReferenceList,
  type RollTable,
  type RuleCard,
  type Template,
} from "@campaign-forge/module-sdk";

const manifest: GameModule["manifest"] = ${json(c.manifest)};

const entityTypes: EntityTypeDef[] = ${json([c.character, c.place])};

const referenceLists: ReferenceList[] = ${json([c.list])};

const tables: RollTable[] = ${json(c.tables)};

/** Roll a place: its danger and one or two features. */
const placeProcedure: Procedure = {
  id: "${o.id}.proc.place",
  name: "Place",
  description: "Roll a place: how dangerous it is and what stands there.",
  original: true,
  steps: [
    { id: "danger", title: "Danger", table: "${o.id}.place.danger" },
    { id: "features", title: "Features", table: "${o.id}.place.feature", repeat: (_ctx) => 2 },
  ],
  produce: (ctx) => {
    const danger = ctx.get<{ level: string }>("danger")?.level ?? "quiet";
    const features = (ctx.get<Array<{ feature: string }>>("features") ?? []).map((f) => f.feature);
    return { entities: [{ tempId: "place", type: "${o.id}.place", name: \`A \${danger} place\`, fields: { danger, features } }], relationships: [] };
  },
};

const rules: RuleCard[] = ${json(c.rules)};

const templates: Template[] = ${json(c.templates)};

const calendar: CalendarDef = ${json(c.calendar)};

export const ${name}: GameModule = {
  manifest,
  dice: createDiceEngine(${json(c.dice, 2)}),
  entityTypes,
  relationshipTypes: [],
  referenceLists,
  presets: [],
  tables,
  procedures: [placeProcedure],
  templates,
  rules,
  trackers: [],
  calendar,
};

export default ${name};
`;
  const test = `import { checkDeterminism, checkModule } from "@campaign-forge/module-sdk";
import { describe, expect, it } from "vitest";
import { ${name} } from "../src";

describe("${o.name}", () => {
  it("passes the conformance suite", () => {
    const report = checkModule(${name}, { seeds: 100 });
    expect(report.issues.filter((i) => i.severity === "error")).toEqual([]);
  });

  it("is deterministic: same seed, same output", () => {
    expect(checkDeterminism(${name}, { seeds: 20 })).toEqual([]);
  });
});
`;
  return {
    "package.json": `${JSON.stringify(pkg, null, 2)}\n`,
    "tsconfig.json": `${JSON.stringify(tsconfig, null, 2)}\n`,
    "src/index.ts": index,
    "test/module.test.ts": test,
  };
}
