/** Crew notes as a share section: what the crew (or one player) knows of the campaign's threads, their contacts, places and factions. */
import { crewNotesMarkdown, type CrewNotes } from "@campaign-forge/core";
import { markdownBlocks, type ShareSection } from "./shareLayout";

export function crewNotesShareSections(notes: CrewNotes | undefined): ShareSection[] {
  if (!notes || notes.empty) return [];
  return [{ id: "crew-notes", kind: "notes", eyebrow: "Crew notes", title: notes.title, blocks: markdownBlocks(crewNotesMarkdown(notes)), file: "crew-notes" }];
}
