/**
 * Which window is the player screen. The table's "Player screen" button and
 * the recap's link open it under a browsing-context name of its own; the
 * campaign layout asks `playerWindowSession` and, for a player window,
 * renders the player view alone (`PlayerWindow`) instead of the GM's shell.
 */
import type { Id } from "@campaign-forge/core";

const WINDOW_PREFIX = "cf-players-";

/** The browsing-context name the player screen window is opened with. */
export function playerWindowName(sessionId: Id): string {
  return `${WINDOW_PREFIX}${sessionId}`;
}

/**
 * The session whose player screen this window shows, or undefined for a GM
 * window: the table route with `?view=players`, or any URL in a window
 * opened as the player screen (it stays one, wherever it is sent).
 */
export function playerWindowSession(pathname: string, search: Record<string, unknown>, windowName: string = typeof window === "undefined" ? "" : window.name): Id | undefined {
  if (windowName.startsWith(WINDOW_PREFIX) && windowName.length > WINDOW_PREFIX.length) return windowName.slice(WINDOW_PREFIX.length);
  const m = /\/c\/[^/]+\/table\/([^/?#]+)\/?$/.exec(pathname);
  return m?.[1] && search.view === "players" ? decodeURIComponent(m[1]) : undefined;
}
