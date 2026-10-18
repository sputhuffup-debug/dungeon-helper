/**
 * Export and import: the campaign bundle (zip) per the architecture seed,
 * plain JSON, and Markdown rendering of adventures, scenes, handouts and
 * entity sheets.
 */
import type { EntityTypeDef, GameModule, SheetField, SheetLayout } from "@campaign-forge/module-sdk";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { newId, now } from "./ids";
import { clone, getPath } from "./paths";
import type { AssetStore } from "./persistence";
import { fromMarkdown, toMarkdown, type RichTextRegistry } from "./richtext";
import { CampaignStore, docIdsOf } from "./store";
import type { Act, Adventure, Asset, BundleManifest, CampaignMaps, Entity, Handout, Id, Scene } from "./types";
import { findEntityType, type ModuleTypes } from "./visibility";

export const BUNDLE_FORMAT = "campaign-forge-bundle" as const;
export const BUNDLE_FORMAT_VERSION = 1 as const;

export interface BundleCampaignFile {
  manifest: BundleManifest;
  maps: CampaignMaps;
}

export interface ImportedBundle {
  store: CampaignStore;
  /** doc id -> Markdown body */
  docs: Map<Id, string>;
  assets: Map<Id, { blob: Blob; meta: Asset }>;
  manifest: BundleManifest;
  /** Old id -> new id when `onConflict: "new-id"` was used. */
  idMap: Record<Id, Id>;
}

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "application/json": "json",
};

export function assetExtension(meta: Pick<Asset, "mime" | "name">): string {
  const fromName = /\.([A-Za-z0-9]{1,8})$/.exec(meta.name)?.[1];
  return MIME_EXT[meta.mime] ?? (fromName ? fromName.toLowerCase() : "bin");
}

export function nameResolver(store: CampaignStore): (id: Id) => string {
  return (id) => store.get("entities", id)?.name ?? id;
}

export function exportJSON(store: CampaignStore): string {
  return JSON.stringify(store.toJSON(), null, 2);
}

export function buildManifest(store: CampaignStore, module: { id: string; version: string }): BundleManifest {
  const meta = store.meta();
  return {
    format: BUNDLE_FORMAT,
    formatVersion: BUNDLE_FORMAT_VERSION,
    exportedAt: now(),
    moduleId: module.id,
    moduleVersion: module.version,
    campaignId: meta.id,
    campaignName: meta.name,
  };
}

function readme(manifest: BundleManifest): string {
  return [
    `# ${manifest.campaignName}`,
    "",
    "Campaign Forge bundle.",
    "",
    `- Format: ${manifest.format} v${manifest.formatVersion}`,
    `- Exported: ${manifest.exportedAt}`,
    `- Campaign id: ${manifest.campaignId}`,
    `- Module: ${manifest.moduleId} ${manifest.moduleVersion}`,
    "",
    `Re-importing needs module \`${manifest.moduleId}\` version ${manifest.moduleVersion} or newer (older data runs the module's migrations).`,
    "",
    "Contents: `campaign.json` (every map plus this manifest), `notes/<docId>.md` (rich-text bodies, entity references as `[[id|name]]`), `assets/<id>.<ext>` (binary assets).",
    "",
  ].join("\n");
}

/** Zip the whole campaign: campaign.json, notes/<docId>.md, assets/<id>.<ext>, README.md. */
export async function exportBundle(
  store: CampaignStore,
  registry: RichTextRegistry,
  assets: AssetStore | undefined,
  module: { id: string; version: string },
): Promise<Uint8Array> {
  const maps = store.toJSON();
  const manifest = buildManifest(store, module);
  const files: Record<string, Uint8Array> = {};
  files["campaign.json"] = strToU8(JSON.stringify({ manifest, maps } satisfies BundleCampaignFile, null, 2));
  files["README.md"] = strToU8(readme(manifest));
  const resolve = nameResolver(store);
  for (const docId of docIdsOf(maps)) {
    await registry.whenReady(docId);
    files[`notes/${docId}.md`] = strToU8(toMarkdown(registry.open(docId), resolve));
  }
  if (assets) {
    for (const meta of Object.values(maps.assets)) {
      const blob = await assets.get(meta.id);
      if (!blob) continue;
      files[`assets/${meta.id}.${assetExtension(meta)}`] = new Uint8Array(await blob.arrayBuffer());
    }
  }
  return zipSync(files, { level: 6 });
}

export interface ImportOptions {
  /** `replace` keeps the ids in the bundle (default); `new-id` remaps every id. */
  onConflict?: "replace" | "new-id";
}

/** Replace every string equal to a known id (values and record keys). */
function remapIds(value: unknown, idMap: Record<Id, Id>): unknown {
  if (typeof value === "string") return idMap[value] ?? value;
  if (Array.isArray(value)) return value.map((v) => remapIds(v, idMap));
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[idMap[k] ?? k] = remapIds(v, idMap);
    return out;
  }
  return value;
}

function collectIds(maps: CampaignMaps): Id[] {
  const ids = new Set<Id>([maps.meta.id]);
  for (const m of maps.meta.members) ids.add(m.id);
  for (const [name, records] of Object.entries(maps)) {
    if (name === "meta") continue;
    for (const id of Object.keys(records as Record<string, unknown>)) ids.add(id);
  }
  for (const id of docIdsOf(maps)) ids.add(id);
  for (const s of Object.values(maps.scenes)) for (const e of s.events) ids.add(e.id);
  for (const m of Object.values(maps.maps)) {
    for (const z of m.zones) ids.add(z.id);
    for (const a of m.accessPoints) ids.add(a.id);
  }
  return [...ids];
}

export async function importBundle(bytes: Uint8Array, opts: ImportOptions = {}): Promise<ImportedBundle> {
  const files = unzipSync(bytes);
  const campaignFile = files["campaign.json"];
  if (!campaignFile) throw new Error("not a Campaign Forge bundle: campaign.json missing");
  const parsed = JSON.parse(strFromU8(campaignFile)) as Partial<BundleCampaignFile>;
  if (!parsed.manifest || parsed.manifest.format !== BUNDLE_FORMAT) throw new Error("not a Campaign Forge bundle: bad manifest");
  if (!parsed.maps || !parsed.maps.meta) throw new Error("bundle has no campaign maps");
  if (parsed.manifest.formatVersion > BUNDLE_FORMAT_VERSION) {
    throw new Error(`bundle format v${parsed.manifest.formatVersion} is newer than this app supports (v${BUNDLE_FORMAT_VERSION})`);
  }

  let maps = parsed.maps;
  const idMap: Record<Id, Id> = {};
  if (opts.onConflict === "new-id") {
    for (const id of collectIds(maps)) idMap[id] = newId();
    maps = remapIds(maps, idMap) as CampaignMaps;
  }
  const manifest: BundleManifest = { ...parsed.manifest, campaignId: maps.meta.id };

  const docs = new Map<Id, string>();
  const refRe = /\[\[([^\]|]+)(\|[^\]]*)?\]\]/g;
  for (const [path, data] of Object.entries(files)) {
    const m = /^notes\/(.+)\.md$/.exec(path);
    if (!m) continue;
    const oldId = m[1] as string;
    let markdown = strFromU8(data);
    if (opts.onConflict === "new-id") {
      markdown = markdown.replace(refRe, (whole, id: string, label: string | undefined) => (idMap[id] ? `[[${idMap[id]}${label ?? ""}]]` : whole));
    }
    docs.set(idMap[oldId] ?? oldId, markdown);
  }

  const assets = new Map<Id, { blob: Blob; meta: Asset }>();
  for (const [path, data] of Object.entries(files)) {
    const m = /^assets\/([^/.]+)(?:\.[^/]+)?$/.exec(path);
    if (!m) continue;
    const id = idMap[m[1] as string] ?? (m[1] as string);
    const meta = maps.assets[id];
    if (!meta) continue;
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    assets.set(id, { blob: new Blob([copy], { type: meta.mime }), meta: clone(meta) });
  }

  const store = CampaignStore.fromJSON(maps);
  return { store, docs, assets, manifest, idMap };
}

/** Write imported Markdown bodies into docs opened through the registry. */
export async function applyImportedDocs(registry: RichTextRegistry, docs: Map<Id, string>): Promise<void> {
  for (const [id, markdown] of docs) {
    await registry.whenReady(id);
    fromMarkdown(registry.open(id), markdown);
  }
}

export async function applyImportedAssets(assetStore: AssetStore, assets: ImportedBundle["assets"]): Promise<void> {
  for (const [id, { blob }] of assets) await assetStore.put(id, blob);
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

export interface MarkdownTarget {
  kind: "adventure" | "scene" | "handout" | "entity";
  id: Id;
}

type Ctx = { store: CampaignStore; registry: RichTextRegistry; module: ModuleTypes | undefined; resolve: (id: Id) => string };

function body(ctx: Ctx, docId: Id | undefined): string {
  if (!docId) return "";
  const doc = ctx.registry.peek(docId) ?? ctx.registry.open(docId);
  return toMarkdown(doc, ctx.resolve).trim();
}

function section(title: string, content: string | undefined, level = 2): string[] {
  if (!content || !content.trim()) return [];
  return [`${"#".repeat(level)} ${title}`, "", content.trim(), ""];
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (value.every((v) => typeof v !== "object" || v === null)) return value.map(formatValue).join(", ");
    return value
      .map((v) => {
        if (typeof v === "object" && v !== null) {
          const o = v as Record<string, unknown>;
          const name = o["name"] ?? o["label"] ?? o["id"];
          const rest = Object.entries(o).filter(([k]) => !["name", "label", "id"].includes(k) || name === undefined);
          return `${name !== undefined ? String(name) : ""}${rest.length ? ` (${rest.map(([k, x]) => `${k}: ${formatValue(x)}`).join(", ")})` : ""}`.trim();
        }
        return formatValue(v);
      })
      .join("; ");
  }
  const obj = value as Record<string, unknown>;
  return Object.entries(obj)
    .map(([k, v]) => `${k}: ${formatValue(v)}`)
    .join(", ");
}

function fieldLabel(field: SheetField): string {
  if (field.label) return field.label;
  const last = field.path.split(".").pop() ?? field.path;
  return last.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
}

function sheetFor(def: EntityTypeDef | undefined, entity: Entity): SheetLayout | undefined {
  if (!def) return undefined;
  const sub = entity.subtype ? def.subtypes?.find((s) => s.id === entity.subtype) : undefined;
  return sub?.sheet ?? def.sheet;
}

function entityMarkdown(ctx: Ctx, entity: Entity, level = 1): string[] {
  const def = findEntityType(ctx.module, entity.type);
  const lines: string[] = [`${"#".repeat(level)} ${entity.name}`, ""];
  const typeName = def?.name ?? entity.type;
  const subtype = entity.subtype ? ` (${def?.subtypes?.find((s) => s.id === entity.subtype)?.name ?? entity.subtype})` : "";
  lines.push(`*${typeName}${subtype}*`, "");
  if (entity.summary) lines.push(entity.summary, "");
  if (entity.tags.length) lines.push(`Tags: ${entity.tags.join(", ")}`, "");
  const sheet = sheetFor(def, entity);
  const shown = new Set<string>();
  if (sheet) {
    for (const sec of sheet.sections) {
      const rows: string[] = [];
      for (const field of sec.fields) {
        if (field.widget === "computed") continue;
        const value = getPath(entity.fields, field.path);
        shown.add(field.path);
        if (value === undefined || value === null || value === "") continue;
        if (field.widget === "ref" && typeof value === "string") rows.push(`- **${fieldLabel(field)}:** ${ctx.resolve(value)}`);
        else if (field.widget === "reflist" && Array.isArray(value)) rows.push(`- **${fieldLabel(field)}:** ${value.map((v) => ctx.resolve(String(v))).join(", ")}`);
        else rows.push(`- **${fieldLabel(field)}:** ${formatValue(value)}`);
      }
      if (rows.length) lines.push(`${"#".repeat(level + 1)} ${sec.title}`, "", ...rows, "");
    }
  }
  const rest = Object.entries(entity.fields).filter(([k]) => !shown.has(k) && ![...shown].some((p) => p.startsWith(`${k}.`)));
  if (rest.length) {
    if (sheet) lines.push(`${"#".repeat(level + 1)} Other fields`, "");
    for (const [k, v] of rest) {
      const formatted = formatValue(v);
      if (formatted) lines.push(`- **${k}:** ${formatted}`);
    }
    lines.push("");
  }
  if (entity.conditions?.length) lines.push(`Conditions: ${entity.conditions.map((c) => c.label).join(", ")}`, "");
  return lines;
}

function handoutMarkdown(ctx: Ctx, handout: Handout, level: number): string[] {
  const lines = [`${"#".repeat(level)} ${handout.title}`, ""];
  lines.push(`*Handout (${handout.kind}, ${handout.visibility.level})${handout.character ? ` for ${ctx.resolve(handout.character)}` : ""}*`, "");
  const b = body(ctx, handout.bodyDoc);
  if (b) lines.push(b, "");
  if (handout.asset) lines.push(`Asset: ${handout.asset}`, "");
  return lines;
}

function handoutsAttachedTo(ctx: Ctx, kind: "act" | "scene" | "adventure", id: Id): Handout[] {
  return ctx.store.list("handouts").filter((h) => h.attachedTo?.kind === kind && h.attachedTo.id === id);
}

function sceneMarkdown(ctx: Ctx, scene: Scene, level: number): string[] {
  const lines = [`${"#".repeat(level)} ${scene.title}`, ""];
  const facts: string[] = [];
  if (scene.purpose) facts.push(`**Purpose:** ${scene.purpose}`);
  if (scene.location) facts.push(`**Location:** ${ctx.resolve(scene.location)}`);
  if (scene.participants.length) facts.push(`**Participants:** ${scene.participants.map(ctx.resolve).join(", ")}`);
  if (scene.clues.length) facts.push(`**Clues:** ${scene.clues.map(ctx.resolve).join(", ")}`);
  if (scene.encounter) facts.push(`**Encounter:** ${ctx.resolve(scene.encounter)}`);
  if (scene.status !== "planned") facts.push(`**Status:** ${scene.status}`);
  if (facts.length) lines.push(...facts.map((f) => `- ${f}`), "");
  const readAloud = body(ctx, scene.readAloudDoc);
  if (readAloud) lines.push(...readAloud.split("\n").map((l) => (l ? `> ${l}` : ">")), "");
  const b = body(ctx, scene.bodyDoc);
  if (b) lines.push(b, "");
  if (scene.events.length) {
    lines.push(`${"#".repeat(level + 1)} Events`, "");
    for (const ev of scene.events) lines.push(`- [${ev.done ? "x" : " "}] ${ev.text}${ev.mandatory ? " (mandatory)" : ""}`);
    lines.push("");
  }
  for (const h of handoutsAttachedTo(ctx, "scene", scene.id)) lines.push(...handoutMarkdown(ctx, h, level + 1));
  return lines;
}

function actMarkdown(ctx: Ctx, act: Act, level: number): string[] {
  const lines = [`${"#".repeat(level)} Act ${act.number}${act.title ? `: ${act.title}` : ""}`, ""];
  if (act.goal) lines.push(`**Goal:** ${act.goal}`, "");
  const pacing = body(ctx, act.pacingDoc);
  if (pacing) lines.push(pacing, "");
  const handouts = [...handoutsAttachedTo(ctx, "act", act.id), ...act.handouts.map((id) => ctx.store.get("handouts", id)).filter((h): h is Handout => !!h)];
  const seen = new Set<Id>();
  for (const h of handouts) {
    if (seen.has(h.id)) continue;
    seen.add(h.id);
    lines.push(...handoutMarkdown(ctx, h, level + 1));
  }
  for (const sceneId of act.scenes) {
    const scene = ctx.store.get("scenes", sceneId);
    if (scene) lines.push(...sceneMarkdown(ctx, scene, level + 1));
  }
  return lines;
}

function adventureMarkdown(ctx: Ctx, adventure: Adventure): string[] {
  const lines = [`# ${adventure.title}`, ""];
  if (adventure.premise) lines.push(adventure.premise, "");
  if (adventure.status !== "planned") lines.push(`*Status: ${adventure.status}*`, "");
  if (adventure.hooksIn.length) lines.push("**Hooks in:**", "", ...adventure.hooksIn.map((h) => `- ${h}`), "");
  lines.push(...section("Player introduction", body(ctx, adventure.playerIntroDoc)));
  lines.push(...section("The situation (GM)", body(ctx, adventure.gmSituationDoc)));
  for (const h of handoutsAttachedTo(ctx, "adventure", adventure.id)) lines.push(...handoutMarkdown(ctx, h, 2));
  for (const actId of adventure.acts) {
    const act = ctx.store.get("acts", actId);
    if (act) lines.push(...actMarkdown(ctx, act, 2));
  }
  lines.push(...section("Epilogue", body(ctx, adventure.epilogueDoc)));
  if (adventure.hooksOut.length) lines.push("**Hooks out:**", "", ...adventure.hooksOut.map((h) => `- ${h}`), "");
  return lines;
}

/** Render one record as Markdown: an adventure booklet, a scene, a handout, or an entity sheet. */
export function exportMarkdown(
  store: CampaignStore,
  registry: RichTextRegistry,
  target: MarkdownTarget,
  module?: ModuleTypes | Pick<GameModule, "entityTypes">,
): string {
  const ctx: Ctx = { store, registry, module, resolve: nameResolver(store) };
  let lines: string[];
  switch (target.kind) {
    case "adventure": {
      const a = store.get("adventures", target.id);
      if (!a) throw new Error(`adventures/${target.id} not found`);
      lines = adventureMarkdown(ctx, a);
      break;
    }
    case "scene": {
      const s = store.get("scenes", target.id);
      if (!s) throw new Error(`scenes/${target.id} not found`);
      lines = sceneMarkdown(ctx, s, 1);
      break;
    }
    case "handout": {
      const h = store.get("handouts", target.id);
      if (!h) throw new Error(`handouts/${target.id} not found`);
      lines = handoutMarkdown(ctx, h, 1);
      break;
    }
    case "entity": {
      const e = store.get("entities", target.id);
      if (!e) throw new Error(`entities/${target.id} not found`);
      lines = entityMarkdown(ctx, e, 1);
      break;
    }
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
