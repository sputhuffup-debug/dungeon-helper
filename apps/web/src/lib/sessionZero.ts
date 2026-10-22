import type { Session } from "@campaign-forge/core";

/** Is this a session 0 (numbered 0, or titled "Session 0" / "Session zero")? */
export function isSessionZero(s: Pick<Session, "number" | "title">): boolean {
  return s.number === 0 || /\bsession\s*(0|zero)\b/i.test(s.title ?? "");
}
