/**
 * A guide step's screenshot: the PNG the screenshot script wrote to the
 * repository's docs/screenshots/ (`guide-<module id>-<key>.png`), the same
 * file the generated docs page shows. Vite emits each as a hashed asset and
 * the service worker precaches them (vite.config.ts), so the Guide page has
 * its images offline too. Any module's guide images are found this way;
 * none are named here.
 */
import { guideImageFile } from "@campaign-forge/module-sdk";

const FILES = import.meta.glob("../../../../../docs/screenshots/guide-*.png", { eager: true, query: "?url", import: "default" }) as Record<string, string>;

const BY_NAME = new Map(Object.entries(FILES).map(([path, url]) => [path.slice(path.lastIndexOf("/") + 1), url]));

/** The URL of a guide image, or undefined when its file is not there (yet). */
export function guideImageUrl(moduleId: string, key: string): string | undefined {
  return BY_NAME.get(guideImageFile(moduleId, key));
}
