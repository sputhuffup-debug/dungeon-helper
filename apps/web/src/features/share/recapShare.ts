/** The "Previously on…" read-aloud as a share section (the player-safe recap only, see core's `playerRecap`). */
import { recapMarkdown, type PlayerRecap } from "@campaign-forge/core";
import { markdownBlocks, type ShareSection } from "./shareLayout";

export function recapShareSections(recap: PlayerRecap | undefined): ShareSection[] {
  if (!recap || recap.sections.length === 0) return [];
  return [{ id: "recap", kind: "recap", eyebrow: "Previously on…", title: recap.title, blocks: markdownBlocks(recapMarkdown(recap.sections)), file: "previously-on" }];
}
