/**
 * Entity tags come in two kinds: the GM's own words ("job-board", "npc") and
 * machine tags that modules and importers write as `key:value` with no spaces
 * ("within:alien.location.gj2066", "subtype:colony"). Machine tags are data
 * for code; tag filters and tag lists meant for reading leave them out. A
 * module may name plain tags its generators use the same way.
 */

/**
 * True for a `key:value` machine tag (a lower-case key, a colon, no spaces),
 * or for one of `bookkeeping`: plain tags a module's generators write for
 * themselves (`GameModule.machineTags`, e.g. "job-board").
 */
export function isMachineTag(tag: string, bookkeeping?: readonly string[]): boolean {
  return /^[a-z][a-z0-9_-]*:\S+$/.test(tag) || (bookkeeping?.includes(tag) ?? false);
}

/** The tags a person reads: machine tags (and the module's bookkeeping tags) left out. */
export function readableTags(tags: readonly string[], bookkeeping?: readonly string[]): string[] {
  return tags.filter((t) => !isMachineTag(t, bookkeeping));
}
