/**
 * The campaign primer: a player-facing introduction to the campaign (the
 * pitch, the setting, what everyone knows, places and factions, tone and
 * safety tools, house rules, making characters, where we begin) that the GM
 * prepares for session 0 and shares with the players.
 *
 * It lives in the campaign document: `meta.primer` lists the sections, each
 * section's text is a rich-text body (one doc per section). Prompts and
 * starter text come from the module (`GameModule.primer`) over the standard
 * sections below. "Draft from campaign" (`draftPrimer`) fills sections from
 * the player projection only, so GM-only entities, fields and text never
 * reach it. Nothing here names a game.
 */
import { PRIMER_SECTION_IDS, type GameModule, type PrimerSectionDef } from "@campaign-forge/module-sdk";
import type * as Y from "yjs";
import { newId } from "./ids";
import { fromMarkdown, toMarkdown, type RichTextRegistry } from "./richtext";
import { SHARE_VIEWER, isPlayerCharacter } from "./share";
import type { CampaignStore } from "./store";
import type { CampaignMaps, CampaignPrimer, Id } from "./types";
import { findEntityType, projectCampaignForViewer, type ModuleTypes } from "./visibility";

/** The standard sections with generic prompts; a module's primer refines them by id. */
export const DEFAULT_PRIMER_SECTIONS: PrimerSectionDef[] = [
  { id: "welcome", title: "Welcome", prompt: "The pitch in a few lines: what the campaign is about, what the characters do, why it will be fun.", original: true },
  { id: "setting", title: "The setting", prompt: "Where and when the game takes place, in two or three short paragraphs. What it looks, sounds and feels like.", original: true },
  { id: "lore", title: "What everyone knows", prompt: "Common knowledge: recent events, rumours and history any character would have heard. Nothing the players should discover.", original: true },
  { id: "places", title: "Places and factions you've heard of", prompt: "The places and groups the characters know by name, one line each.", original: true },
  {
    id: "tone",
    title: "Tone and content",
    prompt: "The tone you are aiming for, lines (never in the game) and veils (off screen), and the safety tools you use at the table.",
    starter: "We stop or rewind any scene when someone asks; no reason needed.\n\n- **Lines** (never in the game): \n- **Veils** (happen off screen): \n- **Safety tools**: an X-card on the table and a check-in at the break.",
    original: true,
  },
  { id: "house-rules", title: "House rules", prompt: "Rules you add or change, and table habits (dice, phones, snacks, scheduling).", original: true },
  { id: "characters", title: "Making your character", prompt: "Starting level, allowed options and supplements, how characters know each other, what to bring to session 0.", original: true },
  { id: "opening", title: "Where we begin", prompt: "The opening situation: where the characters are when the first session starts, and what they want.", original: true },
];

/** The primer's sections: the standard ones refined by the module's, then the module's own. */
export function primerSectionDefs(module: Pick<GameModule, "primer"> | undefined): PrimerSectionDef[] {
  const own = new Map((module?.primer?.sections ?? []).map((s) => [s.id, s] as const));
  const standard = new Set<string>(PRIMER_SECTION_IDS);
  const out = DEFAULT_PRIMER_SECTIONS.map((d) => {
    const m = own.get(d.id);
    if (!m) return d;
    // a module section without starter text keeps the default's (e.g. the safety tools list)
    return m.starter === undefined && d.starter !== undefined ? { ...m, starter: d.starter, original: true } : m;
  });
  for (const s of module?.primer?.sections ?? []) if (!standard.has(s.id)) out.push(s);
  return out;
}

/**
 * Make sure the campaign has a primer with a body for every section the
 * module defines. New sections start with their starter text. Returns the
 * primer and the ids of sections it created.
 */
export function ensurePrimer(store: CampaignStore, registry: Pick<RichTextRegistry, "open">, module: Pick<GameModule, "primer"> | undefined): { primer: CampaignPrimer; created: string[] } {
  const defs = primerSectionDefs(module);
  const current = store.meta().primer;
  const sections = [...(current?.sections ?? [])];
  const have = new Set(sections.map((s) => s.id));
  const created: string[] = [];
  for (const d of defs) {
    if (have.has(d.id)) continue;
    const doc = newId();
    sections.push({ id: d.id, title: d.title, doc });
    created.push(d.id);
    if (d.starter?.trim()) fromMarkdown(registry.open(doc), d.starter.trim());
  }
  // keep the module's order for its sections, the GM's own after them
  const order = new Map(defs.map((d, i) => [d.id, i] as const));
  sections.sort((a, b) => (order.get(a.id) ?? 1e6) - (order.get(b.id) ?? 1e6));
  const primer: CampaignPrimer = { ...(current ?? {}), sections };
  if (created.length || !current) store.updateMeta({ primer });
  return { primer, created };
}

/** Section id -> Markdown for the sections a draft writes. */
export type PrimerDraft = Record<string, string>;

export interface PrimerDraftInput {
  maps: CampaignMaps;
  module: (ModuleTypes & Pick<GameModule, "primer" | "manifest">) | undefined;
  /** A loaded rich-text body by doc id (adventure player intros). */
  doc: (id: Id) => Y.Doc | undefined;
  /** Active supplements, by name. */
  supplements?: string[];
}

const kindOf = (module: ModuleTypes | undefined, type: string) => findEntityType(module, type)?.kind;

function plainMarkdown(doc: Y.Doc | undefined, names: Map<Id, string>): string {
  if (!doc) return "";
  return toMarkdown(doc, (id) => names.get(id) ?? "")
    .replace(/\[\[([^|\]]+)\|([^\]]*)\]\]/g, (_m, id: string, name: string) => (name === id ? "" : name))
    .replace(/\[\[([^\]]+)\]\]/g, "")
    .trim();
}

const oneLine = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/**
 * Draft the data-backed sections from the campaign: the pitch and where we
 * begin from the adventures' player intros, common knowledge from the
 * player-visible timeline, places and factions the players know with their
 * summaries, and the game, play mode, starting level and supplements. Each
 * drafted section keeps the module's starter text in front. Everything is read
 * from the player projection (`projectCampaignForViewer`), plus the adventure's
 * player intro, which is written for the players. Pure.
 */
export function draftPrimer(input: PrimerDraftInput): PrimerDraft {
  const { maps, module } = input;
  const projected = projectCampaignForViewer(maps, module, SHARE_VIEWER);
  const names = new Map(Object.values(projected.entities).map((e) => [e.id, e.name] as const));
  const defs = new Map(primerSectionDefs(module).map((d) => [d.id, d] as const));
  const out: PrimerDraft = {};
  const put = (id: string, data: string[]) => {
    const body = data.filter((x) => x.trim()).join("\n\n");
    if (!body) return;
    const starter = defs.get(id)?.starter?.trim();
    out[id] = starter ? `${starter}\n\n${body}` : body;
  };

  // adventures with a player intro: active first, then planned, then the rest, oldest first
  const rank = { active: 0, planned: 1, done: 2 } as const;
  const adventures = Object.values(maps.adventures)
    .map((a) => ({ a, intro: a.playerIntroDoc ? plainMarkdown(input.doc(a.playerIntroDoc), names) : "" }))
    .sort((x, y) => rank[x.a.status] - rank[y.a.status] || x.a.created.localeCompare(y.a.created) || x.a.id.localeCompare(y.a.id));
  // only an adventure written up for the players (it has a player intro) is named
  const first = adventures.find((x) => x.intro);

  const game = module?.manifest.name;
  const mode = module?.manifest.modes.find((m) => m.id === maps.meta.mode)?.name;
  const welcome = [`Welcome to **${maps.meta.name}**${game ? `, our ${game} campaign` : ""}${mode ? ` (${mode.toLowerCase()} play)` : ""}.`];
  if (first) welcome.push(`Our first story: **${first.a.title}**.`);
  put("welcome", welcome);

  // common knowledge: the timeline the players can see, oldest first
  const events = Object.values(projected.timeline).sort((a, b) => a.inWorldDate.localeCompare(b.inWorldDate) || a.id.localeCompare(b.id));
  put("lore", [events.map((e) => `- **${e.inWorldDate}**: ${oneLine(e.text)}`).join("\n")]);

  // places, then factions, by name
  const known = (kind: string) =>
    Object.values(projected.entities)
      .filter((e) => kindOf(module, e.type) === kind)
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
      .map((e) => (oneLine(e.summary) ? `- **${e.name}**: ${oneLine(e.summary)}` : `- **${e.name}**`));
  const places = known("location");
  const factions = known("faction");
  put("places", [places.length ? `### Places\n\n${places.join("\n")}` : "", factions.length ? `### Factions\n\n${factions.join("\n")}` : ""]);

  // the game and characters
  const pcs = Object.values(projected.entities)
    .filter((e) => isPlayerCharacter(e, module))
    .sort((a, b) => a.name.localeCompare(b.name));
  const levels = new Set(pcs.map((p) => p.fields["level"]).filter((l): l is number => typeof l === "number"));
  const facts: string[] = [];
  if (game) facts.push(`- **Game**: ${game}`);
  if (mode) facts.push(`- **Play mode**: ${mode}`);
  if (levels.size === 1) facts.push(`- **Starting level**: ${[...levels][0]}`);
  if (input.supplements?.length) facts.push(`- **Supplements in use**: ${input.supplements.join(", ")}`);
  if (pcs.length) facts.push(`- **Characters so far**: ${pcs.map((p) => p.name).join(", ")}`);
  put("characters", [facts.join("\n")]);

  if (first?.intro) put("opening", [first.intro]);
  return out;
}

/** The text of every section, in order, with the title; empty sections are left out. */
export function primerText(primer: CampaignPrimer | undefined, doc: (id: Id) => Y.Doc | undefined): Array<{ id: string; title: string; markdown: string }> {
  const out: Array<{ id: string; title: string; markdown: string }> = [];
  for (const s of primer?.sections ?? []) {
    const markdown = plainMarkdown(doc(s.doc), new Map());
    if (markdown) out.push({ id: s.id, title: s.title, markdown });
  }
  return out;
}
