/**
 * Entity tags come in two kinds: the GM's own words ("job-board", "npc") and
 * machine tags that modules and importers write as `key:value` with no spaces
 * ("within:alien.location.gj2066", "subtype:colony"). Machine tags are data
 * for code; tag filters and tag lists meant for reading leave them out.
 */

/** True for a `key:value` machine tag (a lower-case key, a colon, no spaces). */
export function isMachineTag(tag: string): boolean {
  return /^[a-z][a-z0-9_-]*:\S+$/.test(tag);
}

/** The tags a person reads: machine tags left out. */
export function readableTags(tags: readonly string[]): string[] {
  return tags.filter((t) => !isMachineTag(t));
}
