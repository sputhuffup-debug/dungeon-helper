/**
 * The module's guide: the generic runtime behind `GameModule.guide`, a
 * step-by-step walkthrough the app shows on its Guide page and the docs
 * generate a page from (one source for both).
 *
 * - `guideSteps` numbers the steps chapter by chapter ("2.3").
 * - `guideText` splits a paragraph into plain text and `*Label*` marks.
 * - `guideImageFile` and `guideDocFile` name the files a guide's images and
 *   its docs page live in.
 * - `guideIssues` is the conformance check.
 *
 * Nothing here names a game.
 */
import { checkSetupLink } from "./setup";
import type { GameModule, GuideChapterDef, GuideDef, GuideStepDef, PlayModeId } from "./types";

export interface GuideIssue {
  severity: "error" | "warning";
  where: string;
  message: string;
}

/** Step, chapter and image ids: lowercase letters, digits and `-`. */
const SLUG = /^[a-z0-9][a-z0-9-]*$/;

/** The file name of a guide image (in the repository's docs/screenshots/). */
export function guideImageFile(moduleId: string, key: string): string {
  return `guide-${moduleId}-${key}.png`;
}

/** The file name of a guide's docs page (in docs/guides/): its id with dots as dashes. */
export function guideDocFile(guide: Pick<GuideDef, "id">): string {
  return `${guide.id.replace(/[^A-Za-z0-9-]+/g, "-")}.md`;
}

/** A step with its place in the guide. */
export interface NumberedGuideStep {
  chapter: GuideChapterDef;
  step: GuideStepDef;
  /** "2.3": chapter 2, step 3. */
  number: string;
  /** The step's anchor on the page: `<chapter id>-<step id>`. */
  anchor: string;
}

/** Every step in order, numbered chapter by chapter. */
export function guideSteps(guide: GuideDef): NumberedGuideStep[] {
  return guide.chapters.flatMap((chapter, c) => chapter.steps.map((step, s) => ({ chapter, step, number: `${c + 1}.${s + 1}`, anchor: `${chapter.id}-${step.id}` })));
}

/** True when the guide is written for this play mode (or for every mode). */
export function guideFitsMode(guide: Pick<GuideDef, "mode">, mode: PlayModeId): boolean {
  return !guide.mode || guide.mode.length === 0 || guide.mode.includes(mode);
}

/** A run of a paragraph: plain text, or a `*Label*` the app shows. */
export interface GuideTextRun {
  text: string;
  /** A button or label as the app shows it. */
  ui?: boolean;
}

/** Split a paragraph into plain text and `*Label*` runs. An unpaired `*` stays plain text. */
export function guideText(paragraph: string): GuideTextRun[] {
  const out: GuideTextRun[] = [];
  let last = 0;
  for (const m of paragraph.matchAll(/\*([^*\n]+)\*/g)) {
    if (m.index > last) out.push({ text: paragraph.slice(last, m.index) });
    out.push({ text: m[1]!, ui: true });
    last = m.index + m[0].length;
  }
  if (last < paragraph.length) out.push({ text: paragraph.slice(last) });
  return out;
}

type CheckedModule = Pick<GameModule, "manifest" | "guide" | "entityTypes" | "procedures" | "presets">;

/**
 * Conformance of `GameModule.guide`: an id namespaced with the module id, a
 * title and summary, declared modes, at least one chapter with steps;
 * chapter, step and image ids that are unique slugs; a body on every step;
 * image alt text; links with exactly one target the module knows; `*`
 * marks in pairs.
 */
export function guideIssues(module: CheckedModule): GuideIssue[] {
  const guide = module.guide;
  if (guide === undefined) return [];
  const out: GuideIssue[] = [];
  const err = (where: string, message: string) => out.push({ severity: "error", where, message });
  const warn = (where: string, message: string) => out.push({ severity: "warning", where, message });
  if (!guide || typeof guide !== "object" || !Array.isArray(guide.chapters)) {
    err("guide", "the guide needs a list of chapters");
    return out;
  }
  const moduleId = module.manifest?.id ?? "";
  if (typeof guide.id !== "string" || !guide.id) err("guide", "the guide needs an id");
  else if (moduleId && !guide.id.startsWith(`${moduleId}.`)) err("guide", `guide id "${guide.id}" must start with the module id ("${moduleId}.")`);
  if (typeof guide.title !== "string" || !guide.title.trim()) err("guide", "the guide needs a title");
  if (typeof guide.summary !== "string" || !guide.summary.trim()) err("guide", "the guide needs a summary");
  const declared = new Set((module.manifest?.modes ?? []).map((m) => m.id));
  for (const m of guide.mode ?? []) if (!declared.has(m)) err("guide", `mode "${m}" is not declared by the module`);
  if (guide.chapters.length === 0) err("guide", "the guide needs at least one chapter");

  const chapters = new Set<string>();
  const steps = new Set<string>();
  const images = new Set<string>();
  const pairs = (where: string, text: string) => {
    if ((text.match(/\*/g) ?? []).length % 2 !== 0) warn(where, `an unpaired "*" in "${text.slice(0, 40)}…" (mark labels as *Label*)`);
  };
  for (const ch of guide.chapters) {
    const cw = `guide:${String(ch?.id)}`;
    if (!ch || typeof ch.id !== "string" || !SLUG.test(ch.id)) {
      err("guide", `chapter id "${String(ch?.id)}" must be lowercase letters, digits and "-"`);
      continue;
    }
    if (chapters.has(ch.id)) err(cw, `duplicate chapter "${ch.id}"`);
    chapters.add(ch.id);
    if (typeof ch.title !== "string" || !ch.title.trim()) err(cw, "chapter needs a title");
    if (ch.intro !== undefined) pairs(cw, ch.intro);
    if (!Array.isArray(ch.steps) || ch.steps.length === 0) {
      err(cw, "chapter needs at least one step");
      continue;
    }
    for (const s of ch.steps) {
      const where = `guide:${ch.id}/${String(s?.id)}`;
      if (!s || typeof s.id !== "string" || !SLUG.test(s.id)) {
        err(cw, `step id "${String(s?.id)}" must be lowercase letters, digits and "-"`);
        continue;
      }
      if (steps.has(s.id)) err(where, `duplicate step "${s.id}"`);
      steps.add(s.id);
      if (typeof s.title !== "string" || !s.title.trim()) err(where, "step needs a title");
      if (!Array.isArray(s.body) || s.body.length === 0 || s.body.some((p) => typeof p !== "string" || !p.trim())) err(where, "step needs a body of non-empty paragraphs");
      else for (const p of s.body) pairs(where, p);
      if (s.image !== undefined) {
        if (!s.image || typeof s.image.key !== "string" || !SLUG.test(s.image.key)) err(where, `image key "${String(s.image?.key)}" must be lowercase letters, digits and "-"`);
        else {
          if (images.has(s.image.key)) err(where, `image "${s.image.key}" is used by another step`);
          images.add(s.image.key);
        }
        if (!s.image || typeof s.image.alt !== "string" || !s.image.alt.trim()) err(where, "image needs alt text");
      }
      for (const l of s.links ?? []) checkSetupLink(l, where, module, err);
    }
  }
  return out;
}
