/**
 * Ids of the character tables the dice operations roll against. The tables
 * themselves are owned by `../tables` (Agent B); this file only pins the ids so
 * both sides agree. Convention: `alien.<family>.<name>` (docs/alien-field-names.md).
 */
export const STRESS_RESPONSE_TABLE = "alien.character.stress-response"; // 8 rows (<=0 .. 7+), p. 44
export const PANIC_TABLE = "alien.character.panic"; // 13 rows (<=0 .. 12+), p. 72-73
export const MENTAL_TRAUMA_TABLE = "alien.character.mental-trauma"; // d66, 18 rows, p. 74
export const CRITICAL_INJURY_TABLE = "alien.character.critical-injury"; // d66, 36 rows, p. 70
export const ANDROID_CRITICAL_DAMAGE_TABLE = "alien.character.android-critical-damage"; // d6, 6 rows, p. 78

export const DICE_TABLE_IDS = [
  STRESS_RESPONSE_TABLE,
  PANIC_TABLE,
  MENTAL_TRAUMA_TABLE,
  CRITICAL_INJURY_TABLE,
  ANDROID_CRITICAL_DAMAGE_TABLE,
] as const;
