/**
 * Spot-check sheet: the "second person spot-checks ten random rows per file"
 * step of the data manifest. Picks N rows per table family, N presets per
 * entity type and N items per reference list, deterministically from a seed,
 * and renders a Markdown checklist to tick off against the book.
 */
import { createRng, type EntityPreset, type GameModule, type PageRef, type ReferenceItem, type RollTable, type TableRow } from "@campaign-forge/module-sdk";
import { tableFamily } from "./lint";

export interface SpotCheckOptions {
  /** Rows per table family, presets per entity type, items per reference list. Default 10. */
  perFile?: number;
  seed: string;
}

export interface SpotCheckRow {
  tableId: string;
  tableName: string;
  page?: PageRef;
  dice: string;
  range: [number, number];
  /** The total to look up: the single value for one-value rows, else the row's lower bound. */
  total: number;
  rowIndex: number;
  label: string;
  /** Short rendering of the structured result (keys other than `label`). */
  result: string;
  unverified: boolean;
}

export interface SpotCheckFamily {
  family: string;
  tables: number;
  rows: number;
  picks: SpotCheckRow[];
}

export interface SpotCheckPreset {
  presetId: string;
  name: string;
  subtype?: string;
  page?: PageRef;
  /** A few scalar fields, rendered "key: value". */
  fields: string;
  unverified: boolean;
}

export interface SpotCheckPresetType {
  entityType: string;
  presets: number;
  picks: SpotCheckPreset[];
}

export interface SpotCheckReferenceItem {
  itemId: string;
  name: string;
  page?: PageRef;
  summary: string;
}

export interface SpotCheckReferenceList {
  listId: string;
  name: string;
  page?: PageRef;
  items: number;
  unverified: boolean;
  picks: SpotCheckReferenceItem[];
}

export interface SpotCheckSheet {
  moduleId: string;
  moduleName: string;
  moduleVersion: string;
  dataStatus: string;
  sourceBook?: string;
  seed: string;
  perFile: number;
  families: SpotCheckFamily[];
  presetTypes: SpotCheckPresetType[];
  referenceLists: SpotCheckReferenceList[];
  /** Total number of checklist items. */
  total: number;
}

/** Deterministic sample of `n` items without replacement, in original order. */
function sample<T>(items: readonly T[], n: number, seed: string): T[] {
  if (items.length <= n) return [...items];
  const rng = createRng(seed);
  const idx = items.map((_, i) => i);
  // Partial Fisher-Yates: the first n positions are the sample.
  for (let i = 0; i < n; i++) {
    const j = rng.int(i, idx.length - 1);
    const tmp = idx[i]!;
    idx[i] = idx[j]!;
    idx[j] = tmp;
  }
  return idx
    .slice(0, n)
    .sort((a, b) => a - b)
    .map((i) => items[i]!);
}

function short(v: unknown, max = 60): string {
  let s: string;
  if (v === null || v === undefined) s = "";
  else if (typeof v === "string") s = v;
  else if (typeof v === "number" || typeof v === "boolean") s = String(v);
  else if (Array.isArray(v)) s = v.length === 0 ? "[]" : `[${v.length} items]`;
  else s = "{…}";
  s = s.replace(/\s+/g, " ");
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function resultSummary(row: TableRow): string {
  if (typeof row.result === "string") return row.result === row.label ? "" : short(row.result);
  const parts: string[] = [];
  for (const [k, v] of Object.entries(row.result)) {
    if (k === "label" && v === row.label) continue;
    if (v === undefined) continue;
    parts.push(`${k}: ${short(v, 40)}`);
    if (parts.length >= 4) break;
  }
  return parts.join(", ");
}

function presetFields(p: EntityPreset): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(p.fields)) {
    if (v === null || v === undefined || v === "" || typeof v === "object") continue;
    parts.push(`${k}: ${short(v, 30)}`);
    if (parts.length >= 5) break;
  }
  return parts.join(", ");
}

/** Pick rows, presets and reference items to verify. Same (module, seed, perFile) => same sheet. */
export function spotCheck(module: GameModule, opts: SpotCheckOptions): SpotCheckSheet {
  const perFile = Math.max(1, Math.floor(opts.perFile ?? 10));
  const seed = opts.seed;

  const byFamily = new Map<string, RollTable[]>();
  for (const t of module.tables) {
    const fam = tableFamily(t);
    byFamily.set(fam, [...(byFamily.get(fam) ?? []), t]);
  }
  const families: SpotCheckFamily[] = [...byFamily.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([family, tables]) => {
      const all: Array<{ table: RollTable; row: TableRow; index: number }> = [];
      for (const table of tables) table.rows.forEach((row, index) => all.push({ table, row, index }));
      const picks = sample(all, perFile, `${seed}/tables/${family}`).map(({ table, row, index }) => {
        const pick: SpotCheckRow = {
          tableId: table.id,
          tableName: table.name,
          dice: table.dice,
          range: [row.range[0], row.range[1]],
          total: row.range[0],
          rowIndex: index,
          label: row.label ?? (typeof row.result === "string" ? row.result : `row ${index}`),
          result: resultSummary(row),
          unverified: Boolean(row.unverified || table.unverified),
        };
        const page = row.page ?? table.page;
        if (page !== undefined) pick.page = page;
        return pick;
      });
      return { family, tables: tables.length, rows: all.length, picks };
    });

  const byType = new Map<string, EntityPreset[]>();
  for (const p of module.presets) byType.set(p.entityType, [...(byType.get(p.entityType) ?? []), p]);
  const presetTypes: SpotCheckPresetType[] = [...byType.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([entityType, presets]) => ({
      entityType,
      presets: presets.length,
      picks: sample(presets, perFile, `${seed}/presets/${entityType}`).map((p) => {
        const pick: SpotCheckPreset = { presetId: p.id, name: p.name, fields: presetFields(p), unverified: Boolean(p.unverified) };
        const subtype = (p as EntityPreset & { subtype?: string }).subtype;
        if (subtype !== undefined) pick.subtype = subtype;
        if (p.page !== undefined) pick.page = p.page;
        return pick;
      }),
    }));

  const referenceLists: SpotCheckReferenceList[] = [...module.referenceLists]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((list) => {
      const out: SpotCheckReferenceList = {
        listId: list.id,
        name: list.name,
        items: list.items.length,
        unverified: Boolean(list.unverified),
        picks: sample(list.items, perFile, `${seed}/reference/${list.id}`).map((item: ReferenceItem) => {
          const pick: SpotCheckReferenceItem = { itemId: item.id, name: item.name, summary: short(item.summary ?? "", 80) };
          if (item.page !== undefined) pick.page = item.page;
          return pick;
        }),
      };
      if (list.page !== undefined) out.page = list.page;
      return out;
    });

  const total =
    families.reduce((n, f) => n + f.picks.length, 0) + presetTypes.reduce((n, t) => n + t.picks.length, 0) + referenceLists.reduce((n, l) => n + l.picks.length, 0);
  const manifest = module.manifest;
  const sheet: SpotCheckSheet = {
    moduleId: manifest.id,
    moduleName: manifest.name,
    moduleVersion: manifest.version,
    dataStatus: manifest.dataStatus,
    seed,
    perFile,
    families,
    presetTypes,
    referenceLists,
    total,
  };
  if (manifest.sourceBook) sheet.sourceBook = `${manifest.sourceBook.title}${manifest.sourceBook.year ? ` (${manifest.sourceBook.year})` : ""}`;
  return sheet;
}

export function formatPage(page: PageRef | undefined): string {
  if (page === undefined) return "p. ?";
  return Array.isArray(page) ? `p. ${page[0]}-${page[1]}` : `p. ${page}`;
}

function formatRange(range: [number, number]): string {
  if (range[0] === range[1]) return String(range[0]);
  const lo = range[0] <= -99 ? "min" : String(range[0]);
  const hi = range[1] >= 99 ? "max" : String(range[1]);
  return `${lo}-${hi}`;
}

function md(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

/** Render the sheet as a Markdown checklist (one `- [ ]` item per pick). */
export function renderSpotCheck(sheet: SpotCheckSheet): string {
  const lines: string[] = [];
  lines.push(`# Spot check: ${sheet.moduleName} ${sheet.moduleVersion}`, "");
  lines.push(`Module \`${sheet.moduleId}\`, data status **${sheet.dataStatus}**.${sheet.sourceBook ? ` Source: ${sheet.sourceBook}.` : ""}`, "");
  lines.push(`Seed \`${sheet.seed}\`, ${sheet.perFile} picks per table family, per preset entity type and per reference list: ${sheet.total} items.`, "");
  lines.push("How to use: open the cited page, find the row (by its roll total or range), compare the label and result with the book, and tick the box. Rows marked `unverified` were entered from general knowledge; a tick means the row matches the book, a note under the item means it does not. When every pick of a family passes, clear `unverified` on that family's tables.", "");
  lines.push(`Regenerate with \`pnpm table-lint --module ${sheet.moduleId} --spotcheck <file> --spotcheck-seed ${sheet.seed} --per-file ${sheet.perFile}\`.`, "");

  lines.push("## Tables", "");
  for (const fam of sheet.families) {
    lines.push(`### Family \`${fam.family}\` (${fam.tables} tables, ${fam.rows} rows)`, "");
    for (const r of fam.picks) {
      const bits = [`\`${r.tableId}\``, formatPage(r.page), `${r.dice} = ${formatRange(r.range)}`, `**${md(r.label)}**`];
      if (r.result) bits.push(md(r.result));
      if (r.unverified) bits.push("`unverified`");
      lines.push(`- [ ] ${bits.join(" · ")}`);
    }
    lines.push("");
  }

  lines.push("## Presets", "");
  for (const t of sheet.presetTypes) {
    lines.push(`### Entity type \`${t.entityType}\` (${t.presets} presets)`, "");
    for (const p of t.picks) {
      const bits = [`\`${p.presetId}\``, formatPage(p.page), `**${md(p.name)}**${p.subtype ? ` (${p.subtype})` : ""}`];
      if (p.fields) bits.push(md(p.fields));
      if (p.unverified) bits.push("`unverified`");
      lines.push(`- [ ] ${bits.join(" · ")}`);
    }
    lines.push("");
  }

  lines.push("## Reference lists", "");
  for (const l of sheet.referenceLists) {
    lines.push(`### \`${l.listId}\` ${l.name} (${l.items} items, ${formatPage(l.page)}${l.unverified ? ", unverified" : ""})`, "");
    for (const i of l.picks) {
      const bits = [`\`${i.itemId}\``, formatPage(i.page ?? l.page), `**${md(i.name)}**`];
      if (i.summary) bits.push(md(i.summary));
      lines.push(`- [ ] ${bits.join(" · ")}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
