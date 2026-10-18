/** Small inline-SVG glyphs for entity types (by the type's `icon`, then its kind). */
import type { CoreEntityKind } from "@campaign-forge/module-sdk";

const PATHS: Record<string, string> = {
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9a6 6 0 0 1 12 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14a6 6 0 0 1 3 6",
  map: "M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2Zm6-2v14m6-12v14",
  pin: "M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11Zm0-9a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  shield: "M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6Z",
  flag: "M5 21V4m0 0h11l-2 4 2 4H5",
  box: "M3 7l9-4 9 4-9 4Zm0 0v10l9 4 9-4V7m-9 4v10",
  truck: "M3 6h11v9H3Zm11 3h4l3 3v3h-7M7 18a2 2 0 1 0 0-.1M17 18a2 2 0 1 0 0-.1",
  rocket: "M12 3c4 2 6 6 6 10l-3 3H9l-3-3c0-4 2-8 6-10Zm0 6a1.5 1.5 0 1 0 0 .1M9 16l-2 5m8-5 2 5",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5-2 5 5",
  briefcase: "M3 8h18v12H3Zm6 0V5h6v3M3 13h18",
  bug: "M12 7a4 4 0 0 1 4 4v4a4 4 0 0 1-8 0v-4a4 4 0 0 1 4-4Zm-6 4h2m8 0h2M6 16h2m8 0h2M9 4l1.5 3M15 4l-1.5 3",
  swords: "M4 4l9 9m-2 2-2 2-2-2 2-2M20 4l-9 9m2 2 2 2 2-2-2-2",
  note: "M5 3h10l4 4v14H5Zm10 0v4h4M8 12h8M8 16h6",
  dot: "M12 12m-5 0a5 5 0 1 0 10 0 5 5 0 1 0-10 0",
};

const KIND_ICON: Record<CoreEntityKind, string> = {
  character: "user",
  creature: "bug",
  location: "pin",
  faction: "flag",
  item: "box",
  vehicle: "rocket",
  clue: "search",
  job: "briefcase",
  encounter: "swords",
};

export function iconName(icon: string | undefined, kind?: string): string {
  if (icon && PATHS[icon]) return icon;
  if (kind && kind in KIND_ICON) return KIND_ICON[kind as CoreEntityKind];
  return "dot";
}

/** SVG markup string, for ProseMirror node views that build DOM by hand. */
export function iconSvg(icon: string | undefined, kind?: string, size = 14): string {
  const d = PATHS[iconName(icon, kind)] ?? PATHS.dot;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
}

export function EntityIcon({ icon, kind, size = 16, className }: { icon?: string; kind?: string; size?: number; className?: string }) {
  const d = PATHS[iconName(icon, kind)] ?? PATHS.dot;
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
