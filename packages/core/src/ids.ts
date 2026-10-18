import { monotonicFactory } from "ulid";

const ulid = monotonicFactory();

/** A new ULID: time-sortable, collision-free without coordination. */
export function newId(): string {
  return ulid();
}

/** Current time as an ISO 8601 string. */
export function now(): string {
  return new Date().toISOString();
}

/** True when `value` looks like a ULID (26 Crockford base32 chars). */
export function isUlid(value: string): boolean {
  return /^[0-9A-HJKMNP-TV-Z]{26}$/.test(value);
}
