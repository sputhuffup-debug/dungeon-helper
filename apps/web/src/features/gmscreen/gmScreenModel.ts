/**
 * The GM screen for a campaign: its module's screen resolved for the play
 * mode, the GM's choices (panels, order, sizes, paper, format, fold marks)
 * kept in `meta.settings.gmScreen` so they travel with the campaign, the
 * licence lines that go with it, and the PDF.
 */
import { resolveGmScreen, type GameModule, type GmScreenSize, type ResolvedGmScreen, type ResolvedGmScreenPanel } from "@campaign-forge/module-sdk";
import { svgPagesToPdf } from "@campaign-forge/ui";
import { layoutGmScreen, SCREEN_PAPERS, type ScreenFormat, type ScreenLayout, type ScreenNotices, type ScreenPaper } from "./gmScreenLayout";

/** Where the choices live in `meta.settings`. */
export const GM_SCREEN_SETTING = "gmScreen";

export interface GmScreenChoices {
  paper: ScreenPaper;
  format: ScreenFormat;
  foldMarks: boolean;
  /** Panel ids in the GM's order (panels not listed follow in the module's order). */
  order: string[];
  /** Panel id -> printed or not (absent: the module's default; optional panels are off). */
  include: Record<string, boolean>;
  /** Panel id -> size chosen by the GM. */
  sizes: Record<string, GmScreenSize>;
}

const PAPERS = Object.keys(SCREEN_PAPERS) as ScreenPaper[];
const SIZES: GmScreenSize[] = ["third", "half", "full"];

/** The saved choices, with defaults for anything missing or malformed. */
export function readChoices(settings: Record<string, unknown> | undefined, fallbackPaper: ScreenPaper): GmScreenChoices {
  const raw = (settings?.[GM_SCREEN_SETTING] ?? {}) as Partial<Record<keyof GmScreenChoices, unknown>>;
  const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
  return {
    paper: PAPERS.includes(raw.paper as ScreenPaper) ? (raw.paper as ScreenPaper) : fallbackPaper,
    format: raw.format === "cards" ? "cards" : "trifold",
    foldMarks: raw.foldMarks !== false,
    order: Array.isArray(raw.order) ? raw.order.filter((x): x is string => typeof x === "string") : [],
    include: Object.fromEntries(Object.entries(obj(raw.include)).filter(([, v]) => typeof v === "boolean")) as Record<string, boolean>,
    sizes: Object.fromEntries(Object.entries(obj(raw.sizes)).filter(([, v]) => SIZES.includes(v as GmScreenSize))) as Record<string, GmScreenSize>,
  };
}

/** `meta.settings` with these choices saved. */
export function withChoices(settings: Record<string, unknown> | undefined, choices: GmScreenChoices): Record<string, unknown> {
  return { ...(settings ?? {}), [GM_SCREEN_SETTING]: choices };
}

export interface PanelChoice {
  panel: ResolvedGmScreenPanel;
  included: boolean;
}

/** Every panel in the GM's order, with whether it prints and its size. */
export function panelChoices(screen: ResolvedGmScreen, choices: GmScreenChoices): PanelChoice[] {
  const byId = new Map(screen.panels.map((p) => [p.id, p]));
  const ordered = [...choices.order.filter((id) => byId.has(id)), ...screen.panels.map((p) => p.id).filter((id) => !choices.order.includes(id))];
  return ordered.map((id) => {
    const p = byId.get(id)!;
    const size = choices.sizes[id];
    return { panel: size ? { ...p, size } : p, included: choices.include[id] ?? !p.optional };
  });
}

/** Move a panel up or down within its side; returns the new order. */
export function movePanel(list: PanelChoice[], id: string, by: -1 | 1): string[] {
  const ids = list.map((c) => c.panel.id);
  const i = ids.indexOf(id);
  const side = list[i]?.panel.side;
  let j = i + by;
  // skip panels of the other side: they print on their own side anyway
  while (j >= 0 && j < list.length && list[j]!.panel.side !== side) j += by;
  if (i === -1 || j < 0 || j >= list.length) return ids;
  [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  return ids;
}

/** The licence lines: the module's notice (and where page references point) for every page, the full attribution for the player side. */
export function screenNotices(module: Pick<GameModule, "manifest">, screen: Pick<ResolvedGmScreen, "supplements">): ScreenNotices {
  const m = module.manifest;
  const short = [m.licenseNotice];
  if (m.citationStyle !== "section" && m.sourceBook?.title) short.push(`Page references (p. N) are to ${m.sourceBook.title}.`);
  for (const s of screen.supplements) short.push(`${s.name}: ${s.licenseNotice}`);
  const full: string[] = [];
  const paras = (text: string) => text.split(/\n{2,}/).map((p) => p.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
  if (m.license) full.push(...paras(m.license.attribution));
  for (const s of screen.supplements) if (s.license) full.push(...paras(s.license.attribution));
  return { short: short.filter(Boolean), full };
}

export interface GmScreenBuild {
  screen: ResolvedGmScreen;
  choices: PanelChoice[];
  layout: ScreenLayout;
}

/** Resolve, choose and lay out a module's GM screen. */
export function buildGmScreen(module: GameModule, opts: { mode?: string; campaignName?: string; choices: GmScreenChoices }): GmScreenBuild {
  const screen = resolveGmScreen(module, opts.mode !== undefined ? { mode: opts.mode } : {});
  const choices = panelChoices(screen, opts.choices);
  const layout = layoutGmScreen({
    title: screen.title,
    moduleName: module.manifest.name,
    campaignName: opts.campaignName,
    panels: choices.filter((c) => c.included).map((c) => c.panel),
    notices: screenNotices(module, screen),
    paper: opts.choices.paper,
    format: opts.choices.format,
    foldMarks: opts.choices.foldMarks,
  });
  return { screen, choices, layout };
}

/** The PDF bytes of a laid-out screen. */
export function gmScreenPdf(layout: ScreenLayout, info: { moduleName: string; title: string; campaignName?: string | undefined }): Uint8Array {
  return svgPagesToPdf(layout.pages, { title: [info.campaignName, `${info.moduleName} ${info.title}`].filter(Boolean).join(": "), subject: "GM screen", creator: "Campaign Forge" });
}
